// Accounts for Scribble GP: Google sign-in, saved stats, achievements, coins and the car-detail store.
//
// Storage: if UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN are set, accounts are kept in an
// Upstash Redis database (free tier, survives restarts and redeploys). Otherwise they go in
// DATA_DIR/accounts.json (default ./data), which is fine locally but is WIPED whenever a free
// Render server restarts or redeploys.
//
// Sign-in: set GOOGLE_CLIENT_ID (from Google Cloud Console > APIs & Services > Credentials >
// OAuth client ID, type "Web application", with your site's address as an authorized JavaScript origin).
// DEV_LOGIN=1 adds a "test login" button (no Google needed) for trying it out locally.
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
// never in production: it lets anyone in without a password
const DEV_LOGIN = process.env.DEV_LOGIN === "1" && process.env.NODE_ENV !== "production" && !process.env.RENDER;
const UP_URL = process.env.UPSTASH_REDIS_REST_URL || "", UP_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || "";
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const FILE = path.join(DATA_DIR, "accounts.json");

const sha = (s) => crypto.createHash("sha256").update(String(s)).digest("hex");

// ======================= Backups that survive updates =======================
// Every time an account changes, the player's browser gets a signed copy of it ("backup").
// If the server lost its accounts (a free Render server wipes its files on every update/restart),
// the browser hands the copy back and the account is restored exactly as it was.
// The signature (HMAC) means nobody can edit their copy to give themselves coins.
// Set ACCOUNT_SECRET on Render to any long random text and never change it (if it's missing, a
// built-in key is used: fine for testing, but anyone who reads your GitHub code could forge copies).
const SECRET = process.env.ACCOUNT_SECRET || "scribble-gp-built-in-key-set-ACCOUNT_SECRET-on-render";
const b64 = (str) => Buffer.from(str, "utf8").toString("base64url");
// Backups are ENCRYPTED (AES-256-GCM) as well as tamper-proof, so the copy in a browser doesn't reveal the
// password hash or the 2FA secret to anything that can read that browser's storage.
const ENC_KEY = crypto.createHash("sha256").update("backup-key:" + SECRET).digest();
const noProto = (k, v) => (k === "__proto__" || k === "constructor" || k === "prototype" ? undefined : v);
function makeBackup(u) {
  const { sessions, sessAt, presets, pending2fa, ...keep } = u;
  const iv = crypto.randomBytes(12), c = crypto.createCipheriv("aes-256-gcm", ENC_KEY, iv);
  const data = Buffer.concat([c.update(JSON.stringify(keep), "utf8"), c.final()]);
  return "v2." + Buffer.concat([iv, c.getAuthTag(), data]).toString("base64url");
}
function readBackup(blob) {
  if (typeof blob !== "string" || blob.length > 400000) return null;
  if (blob.startsWith("v2.")) {
    try {
      const raw = Buffer.from(blob.slice(3), "base64url"), d = crypto.createDecipheriv("aes-256-gcm", ENC_KEY, raw.subarray(0, 12));
      d.setAuthTag(raw.subarray(12, 28));
      const u = JSON.parse(Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString("utf8"), noProto);
      return u && typeof u.id === "string" && ID_RE.test(u.id) ? u : null;
    } catch (e) { return null; }
  }
  const [body, sig] = blob.split(".");
  if (!body || !sig) return null;
  const want = crypto.createHmac("sha256", SECRET).update(body).digest("base64url");
  const a = Buffer.from(sig), b = Buffer.from(want);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const u = JSON.parse(Buffer.from(body, "base64url").toString("utf8"), (k, v) => (k === "__proto__" || k === "constructor" || k === "prototype" ? undefined : v));
    return u && typeof u.id === "string" && ID_RE.test(u.id) ? u : null;
  } catch (e) { return null; }
}
// bring an account back from a backup, but only if the server doesn't have (a newer copy of) it
async function restore(blob, wantId) {
  const b = readBackup(blob); if (!b || (wantId && b.id !== wantId)) return null;
  if (deleted.has(b.id) || (UP_URL && await redis(["GET", "tb:deleted:" + b.id]).catch(() => null))) return null;
  const have = await getUser(b.id);
  if (have) return have;
  const u = fix({ ...b, sessions: [] });
  cache.set(u.id, u); saveSoon(u);
  console.log("Restored account from a player's backup:", u.name);
  return u;
}
async function resumeOrRestore(token, blob) {
  let u = await userBySession(token);
  if (u || !blob) return u;
  // only when the server really lost this account; if it still has it, an old/stolen token + backup
  // must NOT get back in (that would undo "sign out everywhere")
  const b = readBackup(blob); if (!b || await getUser(b.id)) return null;
  u = await restore(blob);
  if (u && typeof token === "string" && /^[0-9a-f]{64}$/.test(token)) { const h = sha(token); u.sessions = [...(u.sessions || []), h].slice(-8); u.sessAt = { ...(u.sessAt || {}), [h]: Date.now() }; sessIndex.set(h, u.id); if (UP_URL) redis(["SET", "tb:sess:" + h, u.id, "EX", 60 * 60 * 24 * SESSION_DAYS]).catch(() => {}); saveSoon(u); }
  return u;
}

// ======================= storage =======================
const cache = new Map();          // user id -> user object (everyone who signed in since the server started)
const sessIndex = new Map();      // session hash -> user id (file store keeps all of these in memory)
let fileDb = null, fileTimer = null;
const dirty = new Set();
const deleted = new Set();        // ids of deleted accounts (so an old backup can't resurrect them)
function saveFileNow() { try { fs.mkdirSync(DATA_DIR, { recursive: true }); const tmp = FILE + ".tmp"; fs.writeFileSync(tmp, JSON.stringify(fileDb), { mode: 0o600 }); fs.renameSync(tmp, FILE); } catch (e) { console.log("Could not save accounts:", e.message); } }          // user ids waiting to be saved (Upstash)
let upTimer = null;

// Spend cap: count database commands per day. Past UPSTASH_DAILY_CAP (default 12,000, well inside the
// free plan) saves are bunched up much more, so a busy day (or an attacker) can't run up usage.
const DAILY_CAP = Number(process.env.UPSTASH_DAILY_CAP) || 12000;
let cmdDay = 0, cmdCount = 0;
function overCap() { const d = Math.floor(Date.now() / 86400000); if (d !== cmdDay) { cmdDay = d; cmdCount = 0; } return cmdCount >= DAILY_CAP; }
// DB rules: only ids we made ourselves are ever used as database keys (no user text goes in a key)
const ID_RE = /^(u|g|dev)_[A-Za-z0-9_]{1,64}$/;
async function redis(cmd) {
  overCap(); cmdCount++;
  if (cmdCount === DAILY_CAP) console.warn("Upstash daily command cap reached: saving less often until tomorrow");
  const r = await fetch(UP_URL, { method: "POST", headers: { Authorization: `Bearer ${UP_TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify(cmd) });
  if (!r.ok) throw new Error("Upstash " + r.status);
  return (await r.json()).result;
}
function loadFile() {
  if (fileDb) return fileDb;
  try { fileDb = JSON.parse(fs.readFileSync(FILE, "utf8")); } catch (e) { fileDb = { users: {} }; }
  for (const u of Object.values(fileDb.users)) { cache.set(u.id, u); for (const h of u.sessions || []) sessIndex.set(h, u.id); }
  for (const id of fileDb.deleted || []) deleted.add(id);
  return fileDb;
}
function saveSoon(u) {
  u.rev = (u.rev || 0) + 1;
  if (UP_URL) {
    dirty.add(u.id);
    if (!upTimer) upTimer = setTimeout(async () => {
      upTimer = null;
      const ids = [...dirty]; dirty.clear();
      for (const id of ids) { const x = cache.get(id); if (x && ID_RE.test(id)) redis(["SET", "tb:user:" + id, JSON.stringify(x)]).catch((e) => console.log("save failed", e.message)); }
    }, overCap() ? 60000 : 1500);
    return;
  }
  loadFile(); fileDb.users[u.id] = u;
  if (fileTimer) return;
  fileTimer = setTimeout(() => {
    fileTimer = null;
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      const tmp = FILE + ".tmp"; fs.writeFileSync(tmp, JSON.stringify(fileDb), { mode: 0o600 }); fs.renameSync(tmp, FILE);   // only the server can read it
    } catch (e) { console.log("Could not save accounts:", e.message); }
  }, 1500);
}
async function getUser(id) {
  if (typeof id !== "string" || !ID_RE.test(id)) return null;
  if (cache.has(id)) return cache.get(id);
  if (UP_URL) { const v = await redis(["GET", "tb:user:" + id]); if (v) { const u = fix(JSON.parse(v)); cache.set(id, u); return u; } return null; }
  loadFile(); return cache.get(id) || null;
}
const SESSION_DAYS = 90;
async function userBySession(token) {
  if (typeof token !== "string" || !/^[0-9a-f]{64}$/.test(token)) return null;
  const h = sha(token);
  let u = null;
  if (UP_URL) { const id = await redis(["GET", "tb:sess:" + h]); u = id ? await getUser(id) : null; }
  else { loadFile(); const id = sessIndex.get(h); u = id ? await getUser(id) : null; }
  if (!u || !(u.sessions || []).includes(h)) return null;
  // sessions run out after 90 days: then you log in again
  const born = (u.sessAt || {})[h];
  if (born && Date.now() - born > SESSION_DAYS * 86400000) { dropHash(u, h); return null; }
  return u;
}
function dropHash(u, h) {
  u.sessions = (u.sessions || []).filter((x) => x !== h); if (u.sessAt) delete u.sessAt[h]; sessIndex.delete(h);
  if (UP_URL) redis(["DEL", "tb:sess:" + h]).catch(() => {});
  saveSoon(u);
}
// "sign out everywhere": every device has to log in again
function dropAllSessions(u) { for (const h of [...(u.sessions || [])]) dropHash(u, h); u.sessions = []; u.sessAt = {}; saveSoon(u); }
async function addSession(u) {
  const token = crypto.randomBytes(32).toString("hex"), h = sha(token);
  u.sessions = [...(u.sessions || []), h].slice(-8);
  u.sessAt = Object.fromEntries(Object.entries({ ...(u.sessAt || {}), [h]: Date.now() }).filter(([k]) => u.sessions.includes(k)));
  sessIndex.set(h, u.id);
  if (UP_URL) await redis(["SET", "tb:sess:" + h, u.id, "EX", 60 * 60 * 24 * SESSION_DAYS]);
  saveSoon(u);
  return token;
}
async function dropSession(u, token) {
  const h = sha(token);
  u.sessions = (u.sessions || []).filter((x) => x !== h); sessIndex.delete(h);
  if (UP_URL) redis(["DEL", "tb:sess:" + h]).catch(() => {});
  saveSoon(u);
}
function fix(u) {
  u.stats = Object.assign(blankStats(), u.stats || {});
  u.ach = u.ach || {}; u.owned = u.owned || []; u.equipped = u.equipped || {}; u.coins = u.coins || 0;
  u.stats.realTracks = u.stats.realTracks || [];
  return u;
}
function blankStats() {
  return {
    poles: 0, emotes: 0, winsHard: 0, winsExtreme: 0, lastPlaces: 0, coinsEarned: 0, bestStreak: 0, winStreak: 0, bestWinStreak: 0, themes: [], themesWon: [],
    races: 0, wins: 0, podiums: 0, top5: 0, bestFinish: 0, points: 0, laps: 0, km: 0,
    overtakes: 0, mostOvertakes: 0, pitStops: 0, fastestLaps: 0, cleanLaps: 0, crashes: 0, slips: 0,
    bestReaction: 0, perfectStarts: 0, jumpStarts: 0, rainRaces: 0, rainWins: 0, maxLevel: 0, upgrades: 0,
    boostSec: 0, champDriver: 0, champTeam: 0, beatPlayers: 0, multiRaces: 0, randomRaces: 0, drawnRaces: 0,
    bestComeback: 0, bestLap: 0, realTracks: [], raceSec: 0,
  };
}

// ======================= Google sign-in =======================
async function verifyGoogle(credential) {
  if (!GOOGLE_CLIENT_ID) throw new Error("Google sign-in isn't set up on this server");
  const r = await fetch("https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(credential));
  if (!r.ok) throw new Error("Google didn't accept that sign-in");
  const t = await r.json();
  if (t.aud !== GOOGLE_CLIENT_ID) throw new Error("That sign-in was for a different app");
  if (!["accounts.google.com", "https://accounts.google.com"].includes(t.iss)) throw new Error("Bad sign-in");
  if (Number(t.exp) * 1000 < Date.now()) throw new Error("Sign-in expired, try again");
  return { sub: t.sub, name: t.given_name || t.name || "Racer", picture: t.picture || "" };
}
async function signInGoogle(credential, backup) {
  const g = await verifyGoogle(credential);
  if (backup) await restore(backup, "g_" + g.sub);
  return signInWith("g_" + g.sub, g.name, g.picture);
}
async function signInDev(name) {
  if (!DEV_LOGIN) throw new Error("Test login is off");
  const n = String(name || "Tester").trim().slice(0, 16) || "Tester";
  return signInWith("dev_" + sha(n).slice(0, 12), n, "");
}
// ======================= Username + password accounts =======================
// Passwords are never stored: only a salted scrypt hash (Node's built-in crypto, no extra packages).
const USER_RE = /^[A-Za-z0-9_]{3,16}$/;
const COMMON_PW = new Set(["password", "password1", "12345678", "123456789", "1234567890", "qwertyuiop", "qwerty123", "iloveyou", "11111111", "00000000", "abcdefgh", "abc12345", "letmein1", "football", "baseball", "sunshine", "princess", "welcome1", "admin123", "passw0rd", "minecraft", "fortnite", "roblox123", "12341234", "87654321", "asdfghjk", "zxcvbnm1", "racecar1", "scribblegp"]);
function hashPass(pw, salt = crypto.randomBytes(16).toString("hex")) {
  return { salt, hash: crypto.scryptSync(String(pw), salt, 64).toString("hex") };
}
function passOk(u, pw) {
  if (!u?.pass) return false;
  const a = Buffer.from(hashPass(pw, u.pass.salt).hash, "hex"), b = Buffer.from(u.pass.hash, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
// ======================= Password rules =======================
// 12+ characters, at least 3 of: lowercase, UPPERCASE, digits, symbols (or a long 20+ passphrase),
// zxcvbn strength 3+ ("hard to guess"), not your username, and not in a known data breach
// (checked with the Have I Been Pwned range API: only the first 5 characters of the SHA-1 hash leave the server).
const zxcvbn = require("zxcvbn");
async function pwned(password) {
  try {
    const h = crypto.createHash("sha1").update(password).digest("hex").toUpperCase();
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 2500);
    const r = await fetch("https://api.pwnedpasswords.com/range/" + h.slice(0, 5), { signal: ctl.signal, headers: { "Add-Padding": "true" } });
    clearTimeout(t); if (!r.ok) return 0;
    const line = (await r.text()).split("\n").find((l) => l.startsWith(h.slice(5)));
    return line ? Number(line.split(":")[1]) || 0 : 0;
  } catch (e) { return 0; }            // service down: don't block sign-ups, the other rules still apply
}
async function checkPassword(password, username) {
  if (typeof password !== "string" || password.length < 12) throw new Error("Password needs at least 12 characters");
  if (password.length > 128) throw new Error("That password is too long");
  const kinds = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((re) => re.test(password)).length;
  if (kinds < 3 && password.length < 20) throw new Error("Use at least 3 of: lowercase, UPPERCASE, numbers, symbols (or a 20+ character passphrase)");
  if (COMMON_PW.has(password.toLowerCase()) || password.toLowerCase().includes(String(username || "").toLowerCase()) && username) throw new Error("That password is too easy to guess (don't use your username)");
  const z = zxcvbn(password, [username, "scribble", "racing", "team boss"].filter(Boolean));
  if (z.score < 3) throw new Error("That password is too easy to guess" + (z.feedback.warning ? ": " + z.feedback.warning : ", try a longer or more random one"));
  const n = await pwned(password);
  if (n > 0) throw new Error(`That password has shown up in ${n.toLocaleString()} data breaches. Pick a different one.`);
}
async function signUp(username, password, backup) {
  username = String(username || "").trim(); password = String(password || "");
  if (!USER_RE.test(username)) throw new Error("Username: 3-16 letters, numbers or _");
  if (require("./filter").isBad(username)) throw new Error("Please pick a different username");
  const id = "u_" + username.toLowerCase();
  if (!(await getUser(id)) && backup) {
    // this browser has a saved copy of that account: bring it back instead of starting over
    const r = await restore(backup, id);
    if (r && passOk(r, password)) { const token = await addSession(r); return { u: r, token }; }
  }
  if (await getUser(id)) throw new Error("That username is taken, try another one (or Log in if it's yours)");
  await checkPassword(password, username);
  deleted.delete(id); if (UP_URL) redis(["DEL", "tb:deleted:" + id]).catch(() => {}); else if (fileDb?.deleted) fileDb.deleted = fileDb.deleted.filter((x) => x !== id);
  const u = fix({ id, name: username, picture: "", created: Date.now(), pass: hashPass(password) });
  cache.set(id, u); saveSoon(u);
  const token = await addSession(u);
  return { u, token };
}
async function logIn(username, password, backup) {
  username = String(username || "").trim();
  let u = USER_RE.test(username) ? await getUser("u_" + username.toLowerCase()) : null;
  if (!u && backup && USER_RE.test(username)) u = await restore(backup, "u_" + username.toLowerCase());
  if (!u || !passOk(u, password)) throw new Error("Wrong username or password");
  const token = await addSession(u);
  return { u, token };
}

async function signInWith(id, name, picture) {
  let u = await getUser(id);
  if (!u) { u = fix({ id, name, picture, created: Date.now() }); cache.set(id, u); }
  else { u.name = u.name || name; u.picture = picture || u.picture; }
  const token = await addSession(u);
  return { u, token };
}

// ======================= Achievements =======================
// test(s, r): s = the account's totals (already including this race), r = this race's summary
const ACH = [
  { id: "first_race", icon: "🏁", name: "Lights Out", desc: "Finish your first race", coins: 20, test: (s) => s.races >= 1 },
  { id: "races_10", icon: "🔟", name: "Regular", desc: "Race 10 times", coins: 40, test: (s) => s.races >= 10 },
  { id: "races_50", icon: "🗓️", name: "Veteran", desc: "Race 50 times", coins: 120, test: (s) => s.races >= 50 },
  { id: "races_200", icon: "🧓", name: "Lifer", desc: "Race 200 times", coins: 300, test: (s) => s.races >= 200 },
  { id: "first_win", icon: "🏆", name: "Winner!", desc: "Win a race", coins: 50, test: (s) => s.wins >= 1 },
  { id: "wins_5", icon: "🥇", name: "Serial Winner", desc: "Win 5 races", coins: 80, test: (s) => s.wins >= 5 },
  { id: "wins_25", icon: "👑", name: "Legend", desc: "Win 25 races", coins: 250, test: (s) => s.wins >= 25 },
  { id: "podium", icon: "🍾", name: "On the Podium", desc: "Finish in the top 3", coins: 30, test: (s) => s.podiums >= 1 },
  { id: "podiums_20", icon: "🥂", name: "Champagne Shower", desc: "20 podiums", coins: 120, test: (s) => s.podiums >= 20 },
  { id: "pole_win", icon: "🚦", name: "Lights to Flag", desc: "Win from pole position", coins: 40, test: (s, r) => r.pos === 1 && r.grid === 1 },
  { id: "from_back", icon: "🚀", name: "From the Back", desc: "Win from last on a grid of 6+ cars", coins: 150, test: (s, r) => r.pos === 1 && r.grid === r.of && r.of >= 6 },
  { id: "comeback", icon: "📈", name: "Comeback Kid", desc: "Gain 10 places in one race", coins: 100, test: (s, r) => r.grid - r.pos >= 10 },
  { id: "ot_10", icon: "🔪", name: "Carving Through", desc: "10 overtakes in one race", coins: 60, test: (s, r) => r.overtakes >= 10 },
  { id: "ot_100", icon: "⚔️", name: "Overtake Machine", desc: "100 overtakes in total", coins: 100, test: (s) => s.overtakes >= 100 },
  { id: "ot_1000", icon: "🌪️", name: "Unstoppable", desc: "1000 overtakes in total", coins: 300, test: (s) => s.overtakes >= 1000 },
  { id: "rocket", icon: "⚡", name: "Rocket Start", desc: "React to the lights in under 200 ms", coins: 40, test: (s, r) => r.reaction > 0 && r.reaction < 200 },
  { id: "jump", icon: "🙈", name: "Too Eager", desc: "Jump the start", coins: 10, test: (s, r) => r.jump },
  { id: "fastest", icon: "🟣", name: "Purple Sector", desc: "Set the fastest lap of a race", coins: 40, test: (s, r) => r.fastestLap },
  { id: "fastest_10", icon: "⏱️", name: "Time Attack", desc: "10 fastest laps", coins: 120, test: (s) => s.fastestLaps >= 10 },
  { id: "spotless", icon: "✨", name: "Spotless", desc: "Finish a race with every lap clean", coins: 60, test: (s, r) => r.finished && r.cleanLaps >= r.laps && r.crashes === 0 },
  { id: "no_stop", icon: "🛞", name: "No Stop Needed", desc: "Win without a pit stop", coins: 70, test: (s, r) => r.pos === 1 && r.pits === 0 },
  { id: "three_stop", icon: "🔧", name: "Pit Lane Regular", desc: "Stop 3+ times and still finish top 5", coins: 50, test: (s, r) => r.pits >= 3 && r.pos <= 5 },
  { id: "pits_100", icon: "🧰", name: "Crew's Best Friend", desc: "100 pit stops in total", coins: 80, test: (s) => s.pitStops >= 100 },
  { id: "rain", icon: "🌧️", name: "Singing in the Rain", desc: "Finish a race on a track at least 60% wet", coins: 30, test: (s, r) => r.finished && r.maxWet >= 0.6 },
  { id: "rain_win", icon: "☔", name: "Rain Master", desc: "Win a wet race", coins: 100, test: (s, r) => r.pos === 1 && r.maxWet >= 0.6 },
  { id: "brave", icon: "🤪", name: "Brave or Silly", desc: "Top 5 in heavy rain without ever using wets", coins: 80, test: (s, r) => r.pos <= 5 && r.maxWet >= 0.6 && !r.usedWets },
  { id: "slippy", icon: "🧼", name: "Slip 'n' Slide", desc: "Slip 5 times in one race", coins: 20, test: (s, r) => r.slips >= 5 },
  { id: "derby", icon: "💥", name: "Demolition Derby", desc: "5 crashes in one race", coins: 15, test: (s, r) => r.crashes >= 5 },
  { id: "level_10", icon: "🧠", name: "Tech Genius", desc: "Reach team level 10 in a race", coins: 60, test: (s, r) => r.level >= 10 },
  { id: "nitro", icon: "🔥", name: "Nitro Junkie", desc: "Boost for 30 seconds in one race", coins: 30, test: (s, r) => r.boostSec >= 30 },
  { id: "km_100", icon: "🛣️", name: "Road Trip", desc: "Drive 100 km", coins: 60, test: (s) => s.km >= 100 },
  { id: "km_1000", icon: "🌍", name: "Around the World (almost)", desc: "Drive 1000 km", coins: 200, test: (s) => s.km >= 1000 },
  { id: "endurance", icon: "🔋", name: "Endurance", desc: "Finish a 15-lap race", coins: 60, test: (s, r) => r.finished && r.laps >= 15 },
  { id: "green_hell", icon: "🌲", name: "Northern Loop Survivor", desc: "Finish a race on the Eifel Northern Loop", coins: 100, test: (s, r) => r.finished && r.trackId === "de-ns" },
  { id: "oval", icon: "⭕", name: "Turn Left", desc: "Finish a race on an oval", coins: 30, test: (s, r) => r.finished && ["us-dayt", "us-mart", "us-1909"].includes(r.trackId) },
  { id: "world_tour", icon: "✈️", name: "World Tour", desc: "Race on 10 different real tracks", coins: 150, test: (s) => s.realTracks.length >= 10 },
  { id: "dice", icon: "🎲", name: "Dice Roller", desc: "Race 10 random tracks", coins: 50, test: (s) => s.randomRaces >= 10 },
  { id: "architect", icon: "✏️", name: "Architect", desc: "Race on a track you drew yourself", coins: 30, test: (s, r) => r.drewIt },
  { id: "sky_high", icon: "🌉", name: "Sky High", desc: "Race a track with a double ramp", coins: 40, test: (s, r) => r.maxLevel >= 2 },
  { id: "traffic", icon: "🚗", name: "Traffic Jam", desc: "Finish a race with 30+ cars", coins: 40, test: (s, r) => r.finished && r.of >= 30 },
  { id: "crowd_king", icon: "🦁", name: "King of the Crowd", desc: "Win against 20+ other cars", coins: 150, test: (s, r) => r.pos === 1 && r.of >= 21 },
  { id: "friends", icon: "🤝", name: "Friendly Rivals", desc: "Finish a race with another real player", coins: 30, test: (s, r) => r.humans >= 2 },
  { id: "bragging", icon: "😎", name: "Bragging Rights", desc: "Beat other real players 10 times", coins: 100, test: (s) => s.beatPlayers >= 10 },
  { id: "champ", icon: "🏅", name: "World Champion", desc: "Win a drivers' championship", coins: 200, test: (s) => s.champDriver >= 1 },
  { id: "champ_team", icon: "🏢", name: "Constructors' Crown", desc: "Win a teams' championship", coins: 200, test: (s) => s.champTeam >= 1 },
  { id: "rich", icon: "💰", name: "Big Spender", desc: "Buy something in the store", coins: 25, test: (s, r, u) => u.owned.length >= 1 },
  { id: "unboxer", icon: "📦", name: "Unboxer", desc: "Open 10 chests", coins: 60, test: (s) => (s.boxes || 0) >= 10 },
  { id: "legend_item", icon: "🌟", name: "Jackpot", desc: "Own a legendary item", coins: 100, test: (s, r, u) => u.owned.some((id) => STORE_BY_ID.get(id)?.rarity === "legendary") },
];
// ---- ~100 more. cnt() = "reach N of something" (these get a progress bar). The 🔥 ones are brutal but pay a LOT.
let STORE_COUNT = 999;      // set once the store list is built (below)
const len = (v) => (Array.isArray(v) ? v.length : Number(v) || 0);
const cnt = (id, icon, name, desc, coins, key, goal) => ({ id, icon, name, desc, coins, goal, prog: (s, u) => (typeof key === "function" ? key(s, u) : len(s[key])), test: (s, r, u) => (typeof key === "function" ? key(s, u) : len(s[key])) >= goal });
const one = (id, icon, name, desc, coins, test) => ({ id, icon, name, desc, coins, test });
ACH.push(
  // racing volume
  cnt("races_500", "📅", "Half a Thousand", "Race 500 times", 600, "races", 500),
  cnt("races_1000", "🗿", "Part of the Furniture", "Race 1000 times", 1500, "races", 1000),
  cnt("wins_50", "🥇", "Winning Habit", "Win 50 races", 400, "wins", 50),
  cnt("wins_100", "🏆", "Centurion", "Win 100 races", 1000, "wins", 100),
  cnt("wins_250", "🐐", "The GOAT", "Win 250 races", 3000, "wins", 250),
  cnt("podiums_50", "🍾", "Podium Regular", "50 podiums", 250, "podiums", 50),
  cnt("podiums_150", "🎖️", "Podium Machine", "150 podiums", 800, "podiums", 150),
  cnt("top5_100", "5️⃣", "Always There", "100 top-5 finishes", 300, "top5", 100),
  cnt("points_1000", "📊", "Point Collector", "Score 1,000 championship points", 200, "points", 1000),
  cnt("points_10000", "📈", "Points Mountain", "Score 10,000 championship points", 1200, "points", 10000),
  cnt("laps_100", "🔁", "Lapping It Up", "Drive 100 laps", 50, "laps", 100),
  cnt("laps_1000", "♾️", "Lap Legend", "Drive 1,000 laps", 300, "laps", 1000),
  cnt("laps_10000", "🌀", "Dizzy Yet?", "Drive 10,000 laps", 2500, "laps", 10000),
  cnt("km_5000", "🚀", "To the Moon (sort of)", "Drive 5,000 km", 800, "km", 5000),
  cnt("km_20000", "🌌", "Deep Space Driver", "Drive 20,000 km", 3000, "km", 20000),
  cnt("time_10h", "⌛", "Ten Hours Deep", "Race for 10 hours in total", 500, (s) => Math.floor((s.raceSec || 0) / 3600), 10),
  cnt("time_50h", "🕰️", "No Life (Complimentary)", "Race for 50 hours in total", 2500, (s) => Math.floor((s.raceSec || 0) / 3600), 50),
  // overtaking
  cnt("ot_5000", "⚔️", "Traffic Slicer", "5,000 overtakes", 900, "overtakes", 5000),
  cnt("ot_20000", "🦈", "Apex Predator", "20,000 overtakes", 3000, "overtakes", 20000),
  one("ot_20race", "💫", "Through the Field", "20 overtakes in one race", 250, (s, r) => r.overtakes >= 20),
  one("ot_40race", "🌪️", "Human Tornado", "40 overtakes in one race", 1200, (s, r) => r.overtakes >= 40),
  one("comeback_20", "📈", "Great Escape", "Gain 20 places in one race", 400, (s, r) => r.grid - r.pos >= 20),
  one("comeback_40", "🧗", "Everest Climb", "Gain 40 places in one race", 2000, (s, r) => r.grid - r.pos >= 40),
  one("from_p10", "🎯", "Mid-Pack Miracle", "Win from 10th or lower on the grid", 200, (s, r) => r.pos === 1 && r.grid >= 10),
  one("from_p30", "🚀", "Rocket From the Back", "Win from 30th or lower on the grid", 1500, (s, r) => r.pos === 1 && r.grid >= 30),
  // speed & laps
  cnt("fastest_25", "🟣", "Purple Patch", "25 fastest laps", 250, "fastestLaps", 25),
  cnt("fastest_100", "💜", "Always Purple", "100 fastest laps", 1200, "fastestLaps", 100),
  cnt("clean_100", "🧼", "Tidy Driver", "100 clean laps", 150, "cleanLaps", 100),
  cnt("clean_1000", "🫧", "Mr. Clean", "1,000 clean laps", 900, "cleanLaps", 1000),
  cnt("pb_10", "🏅", "Record Breaker", "Set lap records on 10 tracks", 200, (s) => Object.keys(s.pbs || {}).length, 10),
  cnt("pb_50", "📚", "Record Collector", "Set lap records on 50 tracks", 1000, (s) => Object.keys(s.pbs || {}).length, 50),
  one("grand_slam", "💎", "Grand Slam", "Pole, win, fastest lap and every lap clean in one race", 800, (s, r) => r.grid === 1 && r.pos === 1 && r.fastestLap && r.cleanLaps >= r.laps),
  one("margin_30", "🏝️", "See You Later", "Win by 30 seconds or more", 300, (s, r) => r.pos === 1 && r.margin >= 30),
  one("photo", "📸", "Photo Finish", "Win by less than 0.1 seconds", 400, (s, r) => r.pos === 1 && r.margin > 0 && r.margin < 0.1),
  one("streak_3", "🔥", "On Fire", "Win 3 races in a row", 300, (s) => (s.bestWinStreak || 0) >= 3),
  one("streak_10", "☄️", "Untouchable", "Win 10 races in a row", 3000, (s) => (s.bestWinStreak || 0) >= 10),
  one("no_boost_win", "🧘", "Pure Driving", "Win without using any boost", 300, (s, r) => r.pos === 1 && r.boostSec === 0 && r.of >= 4),
  // starts
  cnt("starts_10", "⚡", "Quick Draw", "10 great starts (under 250 ms)", 150, "perfectStarts", 10),
  cnt("starts_100", "🌩️", "Lightning Reflexes", "100 great starts", 900, "perfectStarts", 100),
  one("react_150", "🦾", "Superhuman", "React to the lights in under 150 ms", 600, (s, r) => r.reaction > 0 && r.reaction < 150),
  cnt("jumps_10", "🐸", "Frog Legs", "Jump the start 10 times", 30, "jumpStarts", 10),
  // strategy / team boss
  cnt("pits_500", "🔧", "Pit Crew Hall of Fame", "500 pit stops", 500, "pitStops", 500),
  cnt("upg_100", "🛠️", "Tinkerer", "Pick 100 upgrades", 150, "upgrades", 100),
  cnt("upg_1000", "🏭", "Factory Owner", "Pick 1,000 upgrades", 900, "upgrades", 1000),
  one("level_20", "🧬", "Mad Scientist", "Reach team level 20 in a race", 500, (s, r) => r.level >= 20),
  cnt("boost_10m", "🔥", "Nitro Addict", "Boost for 10 minutes in total", 300, (s) => Math.floor((s.boostSec || 0) / 60), 10),
  cnt("boost_60m", "🧨", "Walking Fire Hazard", "Boost for an hour in total", 1500, (s) => Math.floor((s.boostSec || 0) / 60), 60),
  // weather
  cnt("rain_25", "🌧️", "Rain Dancer", "Finish 25 wet races", 250, "rainRaces", 25),
  cnt("rainwin_10", "⛈️", "Storm Chaser", "Win 10 wet races", 500, "rainWins", 10),
  cnt("rainwin_50", "🌊", "Poseidon", "Win 50 wet races", 2500, "rainWins", 50),
  one("madman", "🤡", "Absolute Madman", "Win in heavy rain without ever using wets", 1000, (s, r) => r.pos === 1 && r.maxWet >= 0.6 && !r.usedWets && r.of >= 6),
  cnt("slips_100", "🍌", "Banana Peel", "Slide 100 times in the wet", 60, "slips", 100),
  // difficulty
  one("win_hard", "😤", "Hardened", "Win a race on Hard AI", 150, (s, r) => r.pos === 1 && (r.aiLevel === "hard" || r.aiLevel === "extreme") && r.of >= 6),
  cnt("win_hard_25", "💪", "Hard Carry", "Win 25 races on Hard or Extreme AI", 700, "winsHard", 25),
  one("win_extreme", "💀", "Extreme Measures", "Win a race on EXTREME AI", 400, (s, r) => r.pos === 1 && r.aiLevel === "extreme" && r.of >= 6),
  cnt("win_extreme_10", "☠️", "Extremely Good", "Win 10 races on EXTREME AI", 1500, "winsExtreme", 10),
  cnt("win_extreme_50", "👹", "Final Boss", "Win 50 races on EXTREME AI", 5000, "winsExtreme", 50),
  one("impossible", "🌋", "The Impossible", "Win on EXTREME against 40+ AI, starting last", 5000, (s, r) => r.pos === 1 && r.aiLevel === "extreme" && r.of >= 41 && r.grid === r.of),
  one("extreme_nord", "🌲", "Northern Loop Master", "Win on the Eifel Northern Loop on EXTREME AI", 2000, (s, r) => r.pos === 1 && r.aiLevel === "extreme" && r.trackId === "de-ns" && r.of >= 6),
  one("marathon", "🏃", "Marathon", "Finish a 50-lap race", 600, (s, r) => r.finished && r.laps >= 50),
  one("ultra", "🦿", "Ultra Marathon", "Finish a 99-lap race", 2500, (s, r) => r.finished && r.laps >= 99),
  one("full_grid", "🚦", "Maximum Chaos", "Finish a race with 60 AI", 300, (s, r) => r.finished && r.of >= 61),
  one("full_grid_win", "👑", "King of Chaos", "Win a race against 60 AI", 2000, (s, r) => r.pos === 1 && r.of >= 61),
  // championships
  cnt("champ_3", "🏅", "Triple Champion", "Win 3 drivers' titles", 800, "champDriver", 3),
  cnt("champ_10", "🌟", "Dynasty", "Win 10 drivers' titles", 3000, "champDriver", 10),
  cnt("champteam_5", "🏢", "Constructor Empire", "Win 5 teams' titles", 1500, "champTeam", 5),
  cnt("poles_1", "🥇", "Pole Sitter", "Take pole position in qualifying", 60, "poles", 1),
  cnt("poles_25", "⏱️", "Saturday Specialist", "25 pole positions", 600, "poles", 25),
  cnt("poles_100", "🧊", "Ice Cold", "100 pole positions", 2500, "poles", 100),
  // places & tracks
  cnt("real_20", "🗺️", "Globetrotter", "Race on 20 different real tracks", 300, "realTracks", 20),
  cnt("real_all", "🌐", "Seen It All", "Race on all 42 real tracks", 2000, "realTracks", 42),
  cnt("themes_all", "🎨", "Tourist", "Race on every track theme", 250, "themes", 9),
  cnt("themes_win", "🖼️", "Master of All Lands", "Win on every track theme", 1500, "themesWon", 9),
  cnt("drawn_25", "✏️", "Track Designer", "Race 25 times on tracks you drew", 300, "drawnRaces", 25),
  cnt("random_100", "🎲", "Gambler", "Race 100 random tracks", 500, "randomRaces", 100),
  // friends
  cnt("multi_25", "🤝", "Social Racer", "25 races with other real players", 200, "multiRaces", 25),
  cnt("multi_200", "🎉", "Party Animal", "200 races with other real players", 1000, "multiRaces", 200),
  cnt("beat_100", "😈", "Friend Crusher", "Beat real players 100 times", 600, "beatPlayers", 100),
  cnt("beat_1000", "🦖", "Friendship Ender", "Beat real players 1,000 times", 3000, "beatPlayers", 1000),
  cnt("emotes_100", "💬", "Chatterbox", "Send 100 emotes", 50, "emotes", 100),
  // chaos
  cnt("crash_100", "🚗", "Bumper Cars", "Crash 100 times", 60, "crashes", 100),
  cnt("crash_1000", "💥", "Insurance Nightmare", "Crash 1,000 times", 400, "crashes", 1000),
  cnt("last_10", "🐢", "Scenic Route", "Finish last 10 times", 40, "lastPlaces", 10),
  // store & chests
  cnt("boxes_50", "📦", "Chest Hoarder", "Open 50 chests", 300, "boxes", 50),
  cnt("boxes_250", "🏦", "Chest Tycoon", "Open 250 chests", 1500, "boxes", 250),
  cnt("items_25", "🧳", "Collector", "Own 25 items", 200, (s, u) => u.owned.length, 25),
  cnt("items_60", "🗄️", "Hoarder", "Own 60 items", 800, (s, u) => u.owned.length, 60),
  cnt("items_all", "🏛️", "Museum Curator", "Own every single item", 5000, (s, u) => u.owned.length, STORE_COUNT),
  one("mythic", "💠", "Holy Grail", "Own the open-wheel racer", 1000, (s, r, u) => u.owned.includes("body_f1")),
  cnt("bodies_all", "🚙", "Car Park", "Own every car body", 1500, (s, u) => u.owned.filter((id) => id.startsWith("body_")).length, 5),
  cnt("liveries_10", "🎨", "Paint Shop", "Own 10 chest liveries", 400, (s, u) => u.owned.filter((id) => id.startsWith("liv_")).length, 10),
  one("f1_win", "🏎️", "Formula Winner", "Win a race in the open-wheel racer", 500, (s, r) => r.pos === 1 && r.body === "f1"),
  one("kart_win", "🛒", "Kart Champion", "Win a race in the go-kart", 300, (s, r) => r.pos === 1 && r.body === "kart"),
  cnt("coins_10000", "💰", "Rich", "Earn 10,000 coins in total", 500, "coinsEarned", 10000),
  cnt("coins_50000", "🤑", "Filthy Rich", "Earn 50,000 coins in total", 2500, "coinsEarned", 50000),
  cnt("daily_7", "📆", "Week Streak", "Log in 7 days in a row", 150, "bestStreak", 7),
  cnt("daily_30", "🗓️", "Month Streak", "Log in 30 days in a row", 1000, "bestStreak", 30),
  cnt("daily_100", "🏆", "100-Day Legend", "Log in 100 days in a row", 5000, "bestStreak", 100),
  cnt("ach_50", "🎯", "Achievement Hunter", "Unlock 50 achievements", 500, (s, u) => Object.keys(u.ach).length, 50),
  cnt("ach_100", "🏵️", "Completionist", "Unlock 100 achievements", 3000, (s, u) => Object.keys(u.ach).length, 100),
);
// progress bars for the older count achievements too
const OLD_PROG = { races_10: ["races", 10], races_50: ["races", 50], races_200: ["races", 200], wins_5: ["wins", 5], wins_25: ["wins", 25], podiums_20: ["podiums", 20], ot_100: ["overtakes", 100], ot_1000: ["overtakes", 1000], fastest_10: ["fastestLaps", 10], pits_100: ["pitStops", 100], km_100: ["km", 100], km_1000: ["km", 1000], world_tour: ["realTracks", 10], dice: ["randomRaces", 10], bragging: ["beatPlayers", 10], unboxer: ["boxes", 10] };
for (const a of ACH) if (OLD_PROG[a.id] && !a.prog) { const [k, g] = OLD_PROG[a.id]; a.goal = g; a.prog = (s) => len(s[k]); }
const ACH_PUBLIC = ACH.map(({ id, icon, name, desc, coins, goal }) => ({ id, icon, name, desc, coins, goal: goal || 0 }));
function achProgress(u) { const o = {}; for (const a of ACH) if (a.prog && !u.ach[a.id]) { try { o[a.id] = Math.floor(a.prog(u.stats, u) * 10) / 10; } catch (e) {} } return o; }

// ======================= Store =======================
// slot -> one equipped item per slot. The client knows how to draw every "look".
const STORE = [
  { id: "glow_cyan", slot: "glow", name: "Cyan underglow", look: "#22e6ff", price: 80 },
  { id: "glow_pink", slot: "glow", name: "Pink underglow", look: "#ff4fd8", price: 80 },
  { id: "glow_green", slot: "glow", name: "Toxic underglow", look: "#6dff5a", price: 80 },
  { id: "glow_gold", slot: "glow", name: "Gold underglow", look: "#ffcc1f", price: 200 },
  { id: "glow_rainbow", slot: "glow", name: "Rainbow underglow", look: "rainbow", price: 350 },
  { id: "wing_duck", slot: "wing", name: "Ducktail spoiler", look: "duck", price: 90 },
  { id: "wing_gt", slot: "wing", name: "GT wing", look: "gt", price: 120 },
  { id: "wing_twin", slot: "wing", name: "Twin-deck wing", look: "twin", price: 180 },
  { id: "flame_purple", slot: "flame", name: "Purple boost flame", look: "#b25cff", price: 60 },
  { id: "flame_green", slot: "flame", name: "Green boost flame", look: "#4dff7a", price: 60 },
  { id: "flame_gold", slot: "flame", name: "Gold boost flame", look: "#ffc21f", price: 120 },
  { id: "flame_rainbow", slot: "flame", name: "Rainbow boost flame", look: "rainbow", price: 250 },
  { id: "rims_chrome", slot: "rims", name: "Chrome rims", look: "#d9dde3", price: 50 },
  { id: "rims_gold", slot: "rims", name: "Gold rims", look: "#f2c230", price: 150 },
  { id: "rims_neon", slot: "rims", name: "Neon rims", look: "#22e6ff", price: 120 },
  { id: "helmet_red", slot: "helmet", name: "Red helmet", look: "#e53935", price: 30 },
  { id: "helmet_blue", slot: "helmet", name: "Blue helmet", look: "#1e88e5", price: 30 },
  { id: "helmet_white", slot: "helmet", name: "White helmet", look: "#f5f5f5", price: 30 },
  { id: "helmet_gold", slot: "helmet", name: "Gold helmet", look: "#ffcc1f", price: 100 },
  { id: "num_gold", slot: "num", name: "Gold number plate", look: "gold", price: 70 },
  { id: "num_black", slot: "num", name: "Black number plate", look: "black", price: 40 },
  { id: "num_neon", slot: "num", name: "Neon number plate", look: "neon", price: 90 },
  { id: "trail_sparks", slot: "trail", name: "Spark trail", look: "sparks", price: 140 },
  { id: "trail_hearts", slot: "trail", name: "Heart trail", look: "hearts", price: 140 },
  { id: "trail_stars", slot: "trail", name: "Star trail", look: "stars", price: 160 },
  // more shop stuff
  { id: "glow_purple", slot: "glow", name: "Purple underglow", look: "#a855f7", price: 80 },
  { id: "glow_white", slot: "glow", name: "Ice-white underglow", look: "#e8f6ff", price: 90 },
  { id: "wing_swan", slot: "wing", name: "Swan-neck wing", look: "swan", price: 150 },
  { id: "flame_ice", slot: "flame", name: "Ice-blue boost flame", look: "#9be7ff", price: 60 },
  { id: "flame_red", slot: "flame", name: "Red boost flame", look: "#ff3b30", price: 60 },
  { id: "rims_black", slot: "rims", name: "Black rims", look: "#2a2c31", price: 40 },
  { id: "rims_bronze", slot: "rims", name: "Bronze rims", look: "#b87333", price: 70 },
  { id: "helmet_purple", slot: "helmet", name: "Purple helmet", look: "#8e44ad", price: 30 },
  { id: "helmet_pink", slot: "helmet", name: "Pink helmet", look: "#ff6fb5", price: 30 },
  { id: "helmet_black", slot: "helmet", name: "Black helmet", look: "#17181c", price: 30 },
  { id: "helmet_orange", slot: "helmet", name: "Orange helmet", look: "#ff8a1f", price: 30 },
  { id: "helmet_chrome", slot: "helmet", name: "Chrome helmet", look: "#dfe6ee", price: 120 },
  { id: "num_red", slot: "num", name: "Red number plate", look: "red", price: 40 },
  { id: "num_rainbow", slot: "num", name: "Rainbow number plate", look: "rainbow", price: 160 },
  { id: "trail_bubbles", slot: "trail", name: "Bubble trail", look: "bubbles", price: 120 },
  { id: "trail_notes", slot: "trail", name: "Music note trail", look: "notes", price: 140 },
  { id: "trail_bolts", slot: "trail", name: "Lightning trail", look: "bolts", price: 160 },
  { id: "decal_star", slot: "decal", name: "Star decal", look: "star", price: 50 },
  { id: "decal_bolt", slot: "decal", name: "Lightning decal", look: "bolt", price: 60 },
  { id: "decal_target", slot: "decal", name: "Target decal", look: "target", price: 60 },
  { id: "decal_eyes", slot: "decal", name: "Cartoon eyes", look: "eyes", price: 70 },
  { id: "decal_teeth", slot: "decal", name: "Shark teeth", look: "teeth", price: 90 },
  { id: "decal_crown", slot: "decal", name: "Crown decal", look: "crown", price: 150 },
];
// loot-box-only items: the "trash" commons, plus special liveries (all original designs)
STORE.push(
  { id: "junk_rims", slot: "rims", name: "Rusty rims", look: "#8a5a3a", loot: true },
  { id: "junk_helmet", slot: "helmet", name: "Plain grey helmet", look: "#7b7f86", loot: true },
  { id: "junk_glow", slot: "glow", name: "Muddy underglow", look: "#6b4a2f", loot: true },
  { id: "junk_flame", slot: "flame", name: "Sooty boost flame", look: "#8d8d8d", loot: true },
  { id: "junk_num", slot: "num", name: "Beige number plate", look: "beige", loot: true },
  { id: "helmet_lime", slot: "helmet", name: "Lime helmet", look: "#a3e635", loot: true },
  { id: "glow_red", slot: "glow", name: "Red underglow", look: "#ff3b30", loot: true },
  { id: "liv_pinstripe", slot: "livery", name: "Gold pinstripe livery", look: "pinstripe", loot: true, rarity: "rare" },
  { id: "liv_chevron", slot: "livery", name: "Chevron livery", look: "chevron", loot: true, rarity: "rare" },
  { id: "liv_splatter", slot: "livery", name: "Paint splatter livery", look: "splatter", loot: true, rarity: "rare" },
  { id: "liv_aurora", slot: "livery", name: "Aurora livery", look: "aurora", loot: true, rarity: "epic" },
  { id: "liv_carbon", slot: "livery", name: "Carbon Viper livery", look: "carbon", loot: true, rarity: "epic" },
  { id: "liv_tiger", slot: "livery", name: "Tiger livery", look: "tiger", loot: true, rarity: "epic" },
  { id: "liv_lightning", slot: "livery", name: "Lightning livery", look: "lightning", loot: true, rarity: "epic" },
  { id: "liv_circuit", slot: "livery", name: "Circuit board livery", look: "circuit", loot: true, rarity: "epic" },
  { id: "liv_galaxy", slot: "livery", name: "Galaxy livery", look: "galaxy", loot: true, rarity: "legendary" },
  { id: "liv_holo", slot: "livery", name: "Hologram livery", look: "holo", loot: true, rarity: "legendary" },
  { id: "liv_gold", slot: "livery", name: "Gold Rush livery", look: "gold", loot: true, rarity: "legendary" },
  { id: "liv_dragon", slot: "livery", name: "Dragon Scale livery", look: "dragon", loot: true, rarity: "legendary" },
  { id: "liv_midnight", slot: "livery", name: "Midnight Comet livery", look: "midnight", loot: true, rarity: "legendary" },
  // more chest stuff
  { id: "wing_card", slot: "wing", name: "Cardboard spoiler", look: "card", loot: true },
  { id: "decal_tape", slot: "decal", name: "Duct tape repair", look: "tape", loot: true },
  { id: "trail_dust", slot: "trail", name: "Dust trail", look: "dust", loot: true },
  { id: "helmet_mud", slot: "helmet", name: "Muddy helmet", look: "#6d5436", loot: true },
  { id: "liv_camo", slot: "livery", name: "Camo livery", look: "camo", loot: true, rarity: "rare" },
  { id: "liv_zebra", slot: "livery", name: "Zebra livery", look: "zebra", loot: true, rarity: "rare" },
  { id: "liv_sunset", slot: "livery", name: "Sunset livery", look: "sunset", loot: true, rarity: "epic" },
  { id: "liv_lava", slot: "livery", name: "Lava livery", look: "lava", loot: true, rarity: "epic" },
  { id: "liv_ice", slot: "livery", name: "Frost livery", look: "ice", loot: true, rarity: "epic" },
  { id: "trail_fire", slot: "trail", name: "Fire trail", look: "fire", loot: true, rarity: "epic" },
  { id: "decal_wings", slot: "decal", name: "Angel wings decal", look: "wings", loot: true, rarity: "epic" },
  { id: "liv_pixel", slot: "livery", name: "Pixel livery", look: "pixel", loot: true, rarity: "legendary" },
  { id: "liv_rainbow", slot: "livery", name: "Rainbow Road livery", look: "rainbow", loot: true, rarity: "legendary" },
  // car bodies: ONLY in the Legendary chest. The open-wheel racer is the rarest thing in the game.
  { id: "body_kart", slot: "body", name: "Go-kart body", look: "kart", loot: true, rarity: "legendary", box: "legend" },
  { id: "body_muscle", slot: "body", name: "Muscle car body", look: "muscle", loot: true, rarity: "legendary", box: "legend" },
  { id: "body_rally", slot: "body", name: "Rally hatch body", look: "rally", loot: true, rarity: "legendary", box: "legend" },
  { id: "body_lmp", slot: "body", name: "Endurance prototype body", look: "lmp", loot: true, rarity: "legendary", box: "legend" },
  { id: "body_f1", slot: "body", name: "Open-wheel racer (F1 style)", look: "f1", loot: true, rarity: "mythic", box: "legend" },
);
// rarity: set on the item, or from its store price
for (const it of STORE) it.rarity = it.rarity || (it.loot ? "common" : it.price <= 60 ? "common" : it.price <= 120 ? "rare" : it.price <= 200 ? "epic" : "legendary");
const STORE_BY_ID = new Map(STORE.map((x) => [x.id, x]));
STORE_COUNT = STORE.length;
for (const a of ACH) if (a.id === "items_all") a.goal = STORE_COUNT;
for (const a of ACH_PUBLIC) if (a.id === "items_all") a.goal = STORE_COUNT;

// ======================= Loot boxes =======================
// Every box can still give junk; the pricier the box, the better the odds.
const BOXES = [
  { id: "basic", name: "Basic chest", price: 100, odds: { common: 72, rare: 22, epic: 5, legendary: 1 } },
  { id: "mid", name: "Intermediate chest", price: 500, odds: { common: 40, rare: 38, epic: 17, legendary: 5 } },
  { id: "legend", name: "Legendary chest", price: 1000, odds: { common: 15, rare: 30, epic: 34, legendary: 20, mythic: 1 } },
];
const DUP_REFUND = { common: 10, rare: 30, epic: 80, legendary: 200, mythic: 600 };
function openBox(u, boxId) {
  const box = BOXES.find((b) => b.id === boxId);
  if (!box) return { error: "Unknown chest" };
  if (u.coins < box.price) return { error: `You need ${box.price - u.coins} more coins` };
  u.coins -= box.price;
  let roll = Math.random() * 100, rarity = "common";
  for (const [r, w] of Object.entries(box.odds)) { if (roll < w) { rarity = r; break; } roll -= w; }
  const pool = STORE.filter((x) => x.rarity === rarity && (!x.box || x.box === box.id));
  // favour things you don't own yet (but duplicates can still happen)
  const fresh = pool.filter((x) => !u.owned.includes(x.id));
  const from = fresh.length && Math.random() < 0.75 ? fresh : pool;
  const item = from[Math.floor(Math.random() * from.length)];
  const dup = u.owned.includes(item.id);
  let refund = 0;
  if (dup) { refund = DUP_REFUND[rarity]; u.coins += refund; u.stats.coinsEarned = (u.stats.coinsEarned || 0) + refund; } else u.owned.push(item.id);
  u.stats.boxes = (u.stats.boxes || 0) + 1;
  const got = checkAch(u, { pos: 99, of: 0, grid: 0 });
  saveSoon(u);
  return { ok: true, box: box.id, item, rarity, dup, refund, got };
}

// what gets sent to other players' screens: { slot: look }
function extrasOf(u) {
  if (!u) return null;
  const out = {};
  for (const [slot, id] of Object.entries(u.equipped || {})) { const it = STORE_BY_ID.get(id); if (it && it.slot === slot && u.owned.includes(id)) out[slot] = it.look; }
  return Object.keys(out).length ? out : null;
}
function buy(u, id) {
  const it = STORE_BY_ID.get(id);
  if (!it) return { error: "Unknown item" };
  if (u.owned.includes(id)) return { error: "You already own that" };
  if (it.loot) return { error: "That one only comes from chests" };
  if (u.coins < it.price) return { error: `You need ${it.price - u.coins} more coins` };
  u.coins -= it.price; u.owned.push(id); u.equipped[it.slot] = id;
  const got = checkAch(u, { pos: 99, of: 0, grid: 0 });
  saveSoon(u);
  return { ok: true, item: it, got };
}
function equip(u, slot, id) {
  if (id === null) { delete u.equipped[slot]; saveSoon(u); return { ok: true }; }
  const it = STORE_BY_ID.get(id);
  if (!it || !u.owned.includes(id)) return { error: "You don't own that" };
  u.equipped[it.slot] = id; saveSoon(u); return { ok: true };
}

function checkAch(u, r) {
  const got = [];
  for (const a of ACH) {
    if (u.ach[a.id]) continue;
    let ok = false; try { ok = !!a.test(u.stats, r, u); } catch (e) {}
    if (ok) { u.ach[a.id] = Date.now(); u.coins += a.coins; u.stats.coinsEarned = (u.stats.coinsEarned || 0) + a.coins; got.push({ id: a.id, icon: a.icon, name: a.name, coins: a.coins }); }
  }
  // unlocking some can unlock "unlock N achievements" ones, so check once more
  if (got.length && !r?.again) got.push(...checkAch(u, { ...(r || {}), again: true }));
  return got;
}

// one race done: r = summary from server.js. Returns the achievements just unlocked.
function recordRace(u, r) {
  const s = u.stats;
  s.races++; s.raceSec += r.raceSec || 0;
  if (r.pos === 1) s.wins++;
  if (r.pos <= 3) s.podiums++;
  if (r.pos <= 5) s.top5++;
  if (!s.bestFinish || r.pos < s.bestFinish) s.bestFinish = r.pos;
  s.points += r.pts || 0; s.laps += r.lapsDone || 0; s.km = Math.round((s.km + (r.km || 0)) * 100) / 100;
  s.overtakes += r.overtakes || 0; s.mostOvertakes = Math.max(s.mostOvertakes, r.overtakes || 0);
  s.pitStops += r.pits || 0; if (r.fastestLap) s.fastestLaps++;
  s.cleanLaps += r.cleanLaps || 0; s.crashes += r.crashes || 0; s.slips += r.slips || 0;
  if (r.reaction > 0 && (!s.bestReaction || r.reaction < s.bestReaction)) s.bestReaction = r.reaction;
  if (r.reaction > 0 && r.reaction < 250) s.perfectStarts++;
  if (r.jump) s.jumpStarts++;
  if (r.maxWet >= 0.6) { s.rainRaces++; if (r.pos === 1) s.rainWins++; }
  s.maxLevel = Math.max(s.maxLevel, r.level || 0); s.upgrades += r.upgrades || 0;
  s.boostSec = Math.round((s.boostSec + (r.boostSec || 0)) * 10) / 10;
  if (r.humans >= 2) s.multiRaces++;
  s.beatPlayers += r.beatPlayers || 0;
  if (r.kind === "random") s.randomRaces++;
  if (r.drewIt) s.drawnRaces++;
  if (r.kind === "f1" && r.trackId && !s.realTracks.includes(r.trackId)) s.realTracks.push(r.trackId);
  s.bestComeback = Math.max(s.bestComeback, (r.grid || 0) - r.pos);
  if (r.best && (!s.bestLap || r.best < s.bestLap)) s.bestLap = Math.round(r.best * 1000) / 1000;
  // personal best per track
  if (r.best && r.trackKey) {
    s.pbs = s.pbs || {};
    const old = s.pbs[r.trackKey]?.t;
    if (!old || r.best < old) { r.newPb = true; r.oldPb = old || 0; s.pbs[r.trackKey] = { t: Math.round(r.best * 1000) / 1000, name: r.trackName || null, at: Date.now() }; }
    const keys = Object.keys(s.pbs); if (keys.length > 200) delete s.pbs[keys.sort((a, b) => s.pbs[a].at - s.pbs[b].at)[0]];
  }
  // new stats for the big achievement list
  s.themes = s.themes || []; s.themesWon = s.themesWon || [];
  if (r.theme && !s.themes.includes(r.theme)) s.themes.push(r.theme);
  if (r.pos === 1 && r.of >= 4 && r.theme && !s.themesWon.includes(r.theme)) s.themesWon.push(r.theme);
  if (r.pos === 1 && r.of >= 6 && (r.aiLevel === "hard" || r.aiLevel === "extreme")) s.winsHard = (s.winsHard || 0) + 1;
  if (r.pos === 1 && r.of >= 6 && r.aiLevel === "extreme") s.winsExtreme = (s.winsExtreme || 0) + 1;
  if (r.pos === 1 && r.of >= 3) { s.winStreak = (s.winStreak || 0) + 1; s.bestWinStreak = Math.max(s.bestWinStreak || 0, s.winStreak); } else s.winStreak = 0;
  if (r.pos === r.of && r.of >= 4) s.lastPlaces = (s.lastPlaces || 0) + 1;
  if (r.champDriver) s.champDriver++;
  if (r.champTeam) s.champTeam++;
  const got = checkAch(u, r);
  got.push(...weeklyRace(u, r));
  updateBoards(u, r);
  saveSoon(u);
  return got;
}

// ======================= Weekly challenges =======================
// 3 new challenges every Monday (the same for everyone), picked from this pool. Progress resets weekly.
const WEEKLY_POOL = [
  { id: "w_wins3", name: "Winning Week", desc: "Win 3 races", goal: 3, coins: 250, add: (r) => (r.pos === 1 && r.of >= 3 ? 1 : 0) },
  { id: "w_podium5", name: "Podium Hunter", desc: "Finish on the podium 5 times", goal: 5, coins: 200, add: (r) => (r.pos <= 3 && r.of >= 4 ? 1 : 0) },
  { id: "w_ot50", name: "Traffic Surgeon", desc: "Make 50 overtakes", goal: 50, coins: 200, add: (r) => r.overtakes || 0 },
  { id: "w_rain", name: "Rain Check", desc: "Finish 2 races on a track at least 60% wet", goal: 2, coins: 200, add: (r) => (r.finished && r.maxWet >= 0.6 ? 1 : 0) },
  { id: "w_rainwin", name: "Stormy Victory", desc: "Win a race in the rain", goal: 1, coins: 300, add: (r) => (r.pos === 1 && r.maxWet >= 0.6 && r.of >= 3 ? 1 : 0) },
  { id: "w_random3", name: "Lucky Dip", desc: "Finish 3 races on random tracks", goal: 3, coins: 150, add: (r) => (r.finished && r.kind === "random" ? 1 : 0) },
  { id: "w_real3", name: "Road Trip", desc: "Finish 3 races on real tracks", goal: 3, coins: 150, add: (r) => (r.finished && r.kind === "f1" ? 1 : 0) },
  { id: "w_drawn2", name: "Home Made", desc: "Finish 2 races on tracks you drew", goal: 2, coins: 150, add: (r) => (r.finished && r.drewIt ? 1 : 0) },
  { id: "w_hard", name: "Tough Crowd", desc: "Win on Hard or EXTREME AI", goal: 1, coins: 350, add: (r) => (r.pos === 1 && (r.aiLevel === "hard" || r.aiLevel === "extreme") && r.of >= 6 ? 1 : 0) },
  { id: "w_laps40", name: "Lap Grinder", desc: "Drive 40 laps", goal: 40, coins: 150, add: (r) => r.lapsDone || 0 },
  { id: "w_pb3", name: "Personal Bests", desc: "Set 3 personal-best laps", goal: 3, coins: 200, add: (r) => (r.newPb ? 1 : 0) },
  { id: "w_clean", name: "Clean Sheet", desc: "Finish a race with every lap clean", goal: 1, coins: 200, add: (r) => (r.finished && r.cleanLaps >= r.laps && r.crashes === 0 ? 1 : 0) },
  { id: "w_friends", name: "Better Together", desc: "Finish 3 races with another real player", goal: 3, coins: 250, add: (r) => (r.humans >= 2 ? 1 : 0) },
  { id: "w_comeback", name: "Charge!", desc: "Gain 8 places in one race", goal: 1, coins: 250, add: (r) => (r.grid - r.pos >= 8 ? 1 : 0) },
  { id: "w_nostop", name: "One Set", desc: "Finish top 3 without a pit stop", goal: 1, coins: 200, add: (r) => (r.pos <= 3 && r.pits === 0 && r.of >= 4 ? 1 : 0) },
];
const weekNo = () => Math.floor((Date.now() / 86400000 + 3) / 7);           // weeks start on Monday (UTC)
const weekEnds = () => (weekNo() + 1) * 7 * 86400000 - 3 * 86400000;
function weeklyPicks(w = weekNo()) {
  let seed = w * 2654435761 >>> 0; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const pool = WEEKLY_POOL.slice(); for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  return pool.slice(0, 3);
}
function weeklyState(u) {
  const w = weekNo();
  if (!u.weekly || u.weekly.week !== w) u.weekly = { week: w, prog: {}, done: [] };
  return u.weekly;
}
function weeklyRace(u, r) {
  const W = weeklyState(u), got = [];
  for (const c of weeklyPicks()) {
    if (W.done.includes(c.id)) continue;
    W.prog[c.id] = Math.min(c.goal, (W.prog[c.id] || 0) + (c.add(r) || 0));
    if (W.prog[c.id] >= c.goal) {
      W.done.push(c.id); u.coins += c.coins; u.stats.coinsEarned = (u.stats.coinsEarned || 0) + c.coins;
      u.stats.weeklyDone = (u.stats.weeklyDone || 0) + 1;
      got.push({ id: c.id, icon: "📅", name: "Weekly: " + c.name, coins: c.coins });
    }
  }
  return got;
}
function weeklyPublic(u) {
  const W = weeklyState(u);
  return { ends: weekEnds(), list: weeklyPicks().map((c) => ({ id: c.id, name: c.name, desc: c.desc, goal: c.goal, coins: c.coins, prog: W.prog[c.id] || 0, done: W.done.includes(c.id) })) };
}

// ======================= Global leaderboards =======================
// Only signed-in players. Kept small: top 20 per board, fastest laps on the real tracks (top 10 each).
let BOARDS = null, boardsTimer = null;
async function boards() {
  if (BOARDS) return BOARDS;
  try {
    if (UP_URL) { const v = await redis(["GET", "tb:boards"]); BOARDS = v ? JSON.parse(v, noProto) : null; }
    else { loadFile(); BOARDS = fileDb.boards || null; }
  } catch (e) { BOARDS = null; }
  BOARDS = BOARDS || { wins: [], ach: [], km: [], laps: {} };
  return BOARDS;
}
function saveBoards() {
  if (boardsTimer) return;
  boardsTimer = setTimeout(() => {
    boardsTimer = null;
    if (UP_URL) redis(["SET", "tb:boards", JSON.stringify(BOARDS)]).catch(() => {});
    else { loadFile(); fileDb.boards = BOARDS; saveFileNow(); }
  }, overCap() ? 120000 : 5000);
}
function putBoard(list, entry, better, max) {
  const i = list.findIndex((x) => x.id === entry.id);
  if (i >= 0) { if (!better(entry, list[i])) return; list.splice(i, 1); }
  list.push(entry); list.sort((a, b) => (better(a, b) ? -1 : better(b, a) ? 1 : 0)); list.length = Math.min(list.length, max);
}
async function updateBoards(u, r) {
  const B = await boards(), name = u.name, id = u.id;
  putBoard(B.wins, { id, name, v: u.stats.wins }, (a, b) => a.v > b.v, 20);
  putBoard(B.ach, { id, name, v: Object.keys(u.ach).length }, (a, b) => a.v > b.v, 20);
  putBoard(B.km, { id, name, v: Math.round(u.stats.km) }, (a, b) => a.v > b.v, 20);
  if (r.best > 0 && r.kind === "f1" && r.trackId) {
    const key = r.trackId + (r.trackKey?.endsWith("_r") ? "_r" : "");
    B.laps[key] = B.laps[key] || [];
    putBoard(B.laps[key], { id, name, v: Math.round(r.best * 1000) / 1000, at: Date.now() }, (a, b) => a.v < b.v, 10);
  }
  saveBoards();
}
async function getBoard(kind, track) {
  const B = await boards();
  if (kind === "laps") return { kind, track, list: B.laps[String(track)] || [], tracks: Object.keys(B.laps) };
  return { kind, list: B[kind] || [] };
}
function dropFromBoards(id) { if (!BOARDS) return; for (const k of ["wins", "ach", "km"]) BOARDS[k] = BOARDS[k].filter((x) => x.id !== id); for (const t in BOARDS.laps) BOARDS.laps[t] = BOARDS.laps[t].filter((x) => x.id !== id); saveBoards(); }

// ======================= Friends =======================
// Add by username or by friend code (for Google accounts). Requests must be accepted.
const friendCode = (id) => sha("fc:" + id).slice(0, 8).toUpperCase();
async function findUser(q) {
  q = String(q || "").trim();
  if (USER_RE.test(q)) { const u = await getUser("u_" + q.toLowerCase()); if (u) return u; }
  const code = q.toUpperCase().replace(/[^0-9A-F]/g, "");
  if (code.length === 8) {
    if (UP_URL) { const id = await redis(["GET", "tb:fc:" + code]).catch(() => null); if (id) return getUser(id); }
    else { loadFile(); for (const u of cache.values()) if (friendCode(u.id) === code) return u; }
  }
  return null;
}
function indexFriendCode(u) { if (UP_URL && !u.fcIndexed) { u.fcIndexed = true; redis(["SET", "tb:fc:" + friendCode(u.id), u.id]).catch(() => {}); saveSoon(u); } }
const F = (u) => { u.friends = u.friends || []; u.reqIn = u.reqIn || []; u.reqOut = u.reqOut || []; return u; };
async function friendAdd(u, q) {
  const o = await findUser(q);
  if (!o) return { error: "No player with that username or friend code" };
  if (o.id === u.id) return { error: "That's you!" };
  F(u); F(o);
  if (u.friends.includes(o.id)) return { error: `${o.name} is already your friend` };
  if ((o.blocked || []).includes(u.id)) return { ok: true, name: o.name };      // quietly do nothing
  if (u.reqIn.includes(o.id)) return friendAccept(u, o.id);                     // they asked you already: that's a yes
  if (u.reqOut.length >= 50) return { error: "Too many friend requests waiting" };
  if (!u.reqOut.includes(o.id)) u.reqOut.push(o.id);
  if (!o.reqIn.includes(u.id)) o.reqIn.push(u.id);
  saveSoon(u); saveSoon(o);
  return { ok: true, name: o.name, other: o.id };
}
async function friendAccept(u, id) {
  const o = await getUser(id); F(u); if (!o || !u.reqIn.includes(id)) return { error: "No request from that player" };
  F(o);
  u.reqIn = u.reqIn.filter((x) => x !== id); o.reqOut = o.reqOut.filter((x) => x !== u.id);
  if (!u.friends.includes(id)) u.friends.push(id); if (!o.friends.includes(u.id)) o.friends.push(u.id);
  u.friends = u.friends.slice(-200); o.friends = o.friends.slice(-200);
  saveSoon(u); saveSoon(o);
  return { ok: true, name: o.name, other: o.id };
}
async function friendRemove(u, id) {
  F(u); const o = await getUser(id);
  u.friends = u.friends.filter((x) => x !== id); u.reqIn = u.reqIn.filter((x) => x !== id); u.reqOut = u.reqOut.filter((x) => x !== id);
  if (o) { F(o); o.friends = o.friends.filter((x) => x !== u.id); o.reqIn = o.reqIn.filter((x) => x !== u.id); o.reqOut = o.reqOut.filter((x) => x !== u.id); saveSoon(o); }
  saveSoon(u); return { ok: true, other: id };
}
async function friendList(u, online) {
  F(u);
  const one = async (id) => { const o = await getUser(id); return o ? { id, name: o.name, ...(online(id) || { online: false }) } : null; };
  return {
    code: friendCode(u.id),
    friends: (await Promise.all(u.friends.map(one))).filter(Boolean).sort((a, b) => b.online - a.online || a.name.localeCompare(b.name)),
    reqIn: (await Promise.all(u.reqIn.map(one))).filter(Boolean),
    reqOut: (await Promise.all(u.reqOut.map(one))).filter(Boolean),
  };
}
// block: they can't join rooms you host, can't friend you, and their emotes are hidden for you
function setBlocked(u, id, on) { u.blocked = u.blocked || []; u.blocked = on ? [...new Set([...u.blocked, id])].slice(-500) : u.blocked.filter((x) => x !== id); if (on) { F(u); u.friends = u.friends.filter((x) => x !== id); } saveSoon(u); return { ok: true }; }

// save everything right now (the server is about to restart)
async function flush() {
  if (UP_URL) { const ids = [...dirty]; dirty.clear(); await Promise.all(ids.map((id) => { const x = cache.get(id); return x ? redis(["SET", "tb:user:" + id, JSON.stringify(x)]).catch(() => {}) : null; })); if (BOARDS) await redis(["SET", "tb:boards", JSON.stringify(BOARDS)]).catch(() => {}); }
  else if (fileDb) { if (BOARDS) fileDb.boards = BOARDS; saveFileNow(); }
}

// ======================= Two-factor authentication (TOTP, RFC 6238) =======================
// Works with Google Authenticator, Microsoft Authenticator, Authy, 1Password... 6 digits, 30-second steps.
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function b32enc(buf) { let bits = 0, val = 0, out = ""; for (const x of buf) { val = (val << 8) | x; bits += 8; while (bits >= 5) { out += B32[(val >>> (bits - 5)) & 31]; bits -= 5; } } if (bits) out += B32[(val << (5 - bits)) & 31]; return out; }
function b32dec(str) { let bits = 0, val = 0; const out = []; for (const ch of String(str).replace(/=+$/, "").toUpperCase()) { const i = B32.indexOf(ch); if (i < 0) continue; val = (val << 5) | i; bits += 5; if (bits >= 8) { out.push((val >>> (bits - 8)) & 255); bits -= 8; } } return Buffer.from(out); }
function totpAt(secret, step) {
  const msg = Buffer.alloc(8); msg.writeUInt32BE(Math.floor(step / 2 ** 32), 0); msg.writeUInt32BE(step >>> 0, 4);
  const h = crypto.createHmac("sha1", b32dec(secret)).update(msg).digest(), o = h[19] & 15;
  return String(((h.readUInt32BE(o) & 0x7fffffff) % 1e6)).padStart(6, "0");
}
// accepts the code for now or one step either side (clock drift), and never the same step twice (replays)
function totpCheck(u, code) {
  code = String(code || "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(code) || !u.totp?.secret) return false;
  const now = Math.floor(Date.now() / 30000);
  for (const st of [now - 1, now, now + 1]) {
    const want = totpAt(u.totp.secret, st);
    if (crypto.timingSafeEqual(Buffer.from(want), Buffer.from(code)) && st > (u.totp.lastStep || 0)) { u.totp.lastStep = st; saveSoon(u); return true; }
  }
  return false;
}
const QR = require("qrcode");
async function setup2fa(u) {
  const secret = b32enc(crypto.randomBytes(20));
  u.pending2fa = { secret, at: Date.now() };
  const uri = `otpauth://totp/${encodeURIComponent("Scribble GP:" + u.name)}?secret=${secret}&issuer=${encodeURIComponent("Scribble GP")}&digits=6&period=30`;
  return { secret: secret.replace(/(.{4})/g, "$1 ").trim(), uri, qr: await QR.toDataURL(uri, { margin: 1, width: 220 }) };
}
// backup codes: 10 one-use codes like "7K2F-9QXM", only their hashes are kept
function newBackupCodes(u) {
  const codes = Array.from({ length: 10 }, () => { const r = b32enc(crypto.randomBytes(5)).slice(0, 8); return r.slice(0, 4) + "-" + r.slice(4); });
  u.totp.backup = codes.map((c) => sha("bc:" + u.id + ":" + c.replace("-", "")));
  return codes;
}
function useBackupCode(u, code) {
  const c = String(code || "").toUpperCase().replace(/[^A-Z2-7]/g, "");
  if (c.length !== 8 || !u.totp?.backup) return false;
  const h = sha("bc:" + u.id + ":" + c), i = u.totp.backup.indexOf(h);
  if (i < 0) return false;
  u.totp.backup.splice(i, 1); saveSoon(u); return true;
}
function enable2fa(u, code) {
  if (!u.pending2fa || Date.now() - u.pending2fa.at > 15 * 60e3) return { error: "Setup timed out, start again" };
  u.totp = { secret: u.pending2fa.secret, on: true, lastStep: 0, since: Date.now() };
  if (!totpCheck(u, code)) { delete u.totp; return { error: "That code didn't match. Check the time on your phone and try again." }; }
  delete u.pending2fa;
  const codes = newBackupCodes(u); saveSoon(u);
  return { ok: true, codes };
}
function disable2fa(u, password, code) {
  if (u.pass && !passOk(u, password)) return { error: "Wrong password" };
  if (!totpCheck(u, code) && !useBackupCode(u, code)) return { error: "Wrong code" };
  delete u.totp; saveSoon(u); return { ok: true };
}
function verify2fa(u, code) { return totpCheck(u, code) || useBackupCode(u, code); }
async function changePassword(u, oldPw, newPw) {
  if (!u.pass || !passOk(u, oldPw)) return { error: "Your current password is wrong" };
  await checkPassword(newPw, u.name);
  u.pass = hashPass(newPw); saveSoon(u);
  return { ok: true };
}
// forgot password: only possible with 2FA (a backup code or an authenticator code) since there's no email
async function resetPassword(username, code, newPw) {
  const u = USER_RE.test(String(username || "")) ? await getUser("u_" + String(username).toLowerCase()) : null;
  if (!u || !u.totp?.on || !verify2fa(u, code)) throw new Error("That username and code don't match");
  await checkPassword(newPw, u.name);
  u.pass = hashPass(newPw);
  dropAllSessions(u);
  return u;
}
async function deleteAccount(u, password, code) {
  if (u.pass && !passOk(u, password)) return { error: "Wrong password" };
  if (u.totp?.on && !verify2fa(u, code)) return { error: "Type a code from your authenticator app (or a backup code)" };
  const id = u.id;
  for (const h of [...(u.sessions || [])]) { sessIndex.delete(h); if (UP_URL) redis(["DEL", "tb:sess:" + h]).catch(() => {}); }
  cache.delete(id); dirty.delete(id); dropFromBoards(id);
  if (UP_URL) await redis(["DEL", "tb:user:" + id]).catch(() => {});
  else { loadFile(); delete fileDb.users[id]; u.rev = 0; saveFileNow(); }
  // a backup of a deleted account must never bring it back
  deleted.add(id); if (UP_URL) redis(["SET", "tb:deleted:" + id, "1", "EX", 60 * 60 * 24 * 365]).catch(() => {});
  else { fileDb.deleted = [...new Set([...(fileDb.deleted || []), id])]; saveFileNow(); }
  console.log("Account deleted:", id.replace(/_(.{2}).*/, "_$1***"));
  return { ok: true, id };
}
function recheck(u) { const got = checkAch(u, { pos: 99, of: 0, grid: 0 }); if (got.length) saveSoon(u); return got; }
function bump(u, key, n = 1) { u.stats[key] = (u.stats[key] || 0) + n; const got = checkAch(u, { pos: 99, of: 0, grid: 0 }); saveSoon(u); return got; }
// daily login reward: 50 coins, +10 for every day in a row (up to 150)
function dailyReward(u) {
  const day = Math.floor(Date.now() / 86400000);
  if (u.dailyDay === day) return null;
  u.streak = u.dailyDay === day - 1 ? (u.streak || 0) + 1 : 1;
  u.dailyDay = day;
  const coins = Math.min(150, 40 + u.streak * 10);
  u.coins += coins; u.stats.coinsEarned = (u.stats.coinsEarned || 0) + coins;
  u.stats.bestStreak = Math.max(u.stats.bestStreak || 0, u.streak);
  const got = checkAch(u, { pos: 99, of: 0, grid: 0 });
  saveSoon(u);
  return { coins, streak: u.streak, got };
}
function publicUser(u) {
  if (!u) return null;
  indexFriendCode(u);
  return { id: u.id, name: u.name, weekly: weeklyPublic(u), friendCode: friendCode(u.id), blocked: u.blocked || [], picture: u.picture, twoFA: !!u.totp?.on, backupLeft: u.totp?.backup?.length || 0, hasPassword: !!u.pass, coins: u.coins, stats: u.stats, ach: u.ach, achProg: achProgress(u), owned: u.owned, equipped: u.equipped, backup: makeBackup(u) };
}
// ======================= Saved tracks (presets) =======================
// Kept on the account (and in the player's browser). Max 30, each a simplified copy of the drawing.
function cleanPreset(p) {
  if (!p || typeof p !== "object" || !Array.isArray(p.stroke)) return null;
  const name = String(p.name || "").trim().slice(0, 30); if (!name) return null;
  let st = p.stroke.filter((q) => Array.isArray(q) && q.length >= 3 && q.every(Number.isFinite)).map((q) => [Math.round(q[0] * 10) / 10, Math.round(q[1] * 10) / 10, Math.round(q[2])]);
  if (st.length < 8) return null;
  if (st.length > 2500) { const k = st.length / 2500; st = Array.from({ length: 2500 }, (_, i) => st[Math.floor(i * k)]); }
  const start = Array.isArray(p.start) && p.start.length === 2 && p.start.every(Number.isFinite) ? p.start.map((v) => Math.round(v * 10) / 10) : null;
  return { name, stroke: st, map: ["small", "normal", "large", "huge"].includes(p.map) ? p.map : "normal", start, reverse: !!p.reverse, smooth: !!p.smooth, theme: typeof p.theme === "string" ? p.theme.slice(0, 12) : null, saved: Number(p.saved) || Date.now() };
}
function savePreset(u, p) {
  const c = cleanPreset(p); if (!c) return { error: "That track couldn't be saved" };
  u.presets = (u.presets || []).filter((x) => x.name.toLowerCase() !== c.name.toLowerCase());
  if (u.presets.length >= 30) return { error: "You have 30 saved tracks already. Delete one first." };
  u.presets.push(c); saveSoon(u); return { ok: true };
}
function deletePreset(u, name) { u.presets = (u.presets || []).filter((x) => x.name !== name); saveSoon(u); return { ok: true }; }

// Small short-lived values (a room saved while the server restarts for an update): in Upstash when
// it's set up (the new server can see it), otherwise in a file (only survives a restart on this machine).
const tmpFile = (key) => path.join(DATA_DIR, "tmp", key.replace(/[^A-Za-z0-9_-]/g, "_") + ".json");
async function stash(key, value, ttlSec) {
  if (UP_URL) return redis(["SET", "tb:tmp:" + key, value, "EX", ttlSec]);
  fs.mkdirSync(path.join(DATA_DIR, "tmp"), { recursive: true });
  fs.writeFileSync(tmpFile(key), JSON.stringify({ until: Date.now() + ttlSec * 1000, value }), { mode: 0o600 });
}
async function unstash(key) {     // read it once (and forget it)
  if (UP_URL) { const v = await redis(["GET", "tb:tmp:" + key]); if (v) redis(["DEL", "tb:tmp:" + key]).catch(() => {}); return v || null; }
  try { const o = JSON.parse(fs.readFileSync(tmpFile(key), "utf8")); fs.unlinkSync(tmpFile(key)); return o.until > Date.now() ? o.value : null; } catch (e) { return null; }
}
module.exports = {
  config: () => ({ googleClientId: GOOGLE_CLIENT_ID || null, dev: DEV_LOGIN, persistent: !!UP_URL }),
  signUp, logIn, signInGoogle, openBox, BOXES, deleteAccount, friendCode, cachedUser: (id) => cache.get(id) || null, getBoard, friendAdd, friendAccept, friendRemove, friendList, setBlocked, flush, weeklyPublic, checkPassword, setup2fa, enable2fa, disable2fa, verify2fa, changePassword, resetPassword, newBackupCodes, addSession, dropSession, dailyReward, bump, recheck, dropAllSessions, userBySessionOnly: userBySession, resumeOrRestore, restore, cleanPreset, savePreset, deletePreset, signInDev, userBySession, dropSession, getUser, recordRace, buy, equip, extrasOf, publicUser,
  ACH: ACH_PUBLIC, STORE, stash, unstash,
};
