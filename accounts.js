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
const DEV_LOGIN = process.env.DEV_LOGIN === "1";
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
function makeBackup(u) {
  const { sessions, presets, ...keep } = u;
  const body = b64(JSON.stringify(keep));
  return body + "." + crypto.createHmac("sha256", SECRET).update(body).digest("base64url");
}
function readBackup(blob) {
  if (typeof blob !== "string" || blob.length > 400000) return null;
  const [body, sig] = blob.split(".");
  if (!body || !sig) return null;
  const want = crypto.createHmac("sha256", SECRET).update(body).digest("base64url");
  const a = Buffer.from(sig), b = Buffer.from(want);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try { const u = JSON.parse(Buffer.from(body, "base64url").toString("utf8")); return u && typeof u.id === "string" ? u : null; } catch (e) { return null; }
}
// bring an account back from a backup, but only if the server doesn't have (a newer copy of) it
async function restore(blob, wantId) {
  const b = readBackup(blob); if (!b || (wantId && b.id !== wantId)) return null;
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
  u = await restore(blob);
  if (u) { const h = sha(token); u.sessions = [...(u.sessions || []), h].slice(-8); sessIndex.set(h, u.id); if (UP_URL) redis(["SET", "tb:sess:" + h, u.id, "EX", 60 * 60 * 24 * 180]).catch(() => {}); saveSoon(u); }
  return u;
}

// ======================= storage =======================
const cache = new Map();          // user id -> user object (everyone who signed in since the server started)
const sessIndex = new Map();      // session hash -> user id (file store keeps all of these in memory)
let fileDb = null, fileTimer = null;
const dirty = new Set();          // user ids waiting to be saved (Upstash)
let upTimer = null;

async function redis(cmd) {
  const r = await fetch(UP_URL, { method: "POST", headers: { Authorization: `Bearer ${UP_TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify(cmd) });
  if (!r.ok) throw new Error("Upstash " + r.status);
  return (await r.json()).result;
}
function loadFile() {
  if (fileDb) return fileDb;
  try { fileDb = JSON.parse(fs.readFileSync(FILE, "utf8")); } catch (e) { fileDb = { users: {} }; }
  for (const u of Object.values(fileDb.users)) { cache.set(u.id, u); for (const h of u.sessions || []) sessIndex.set(h, u.id); }
  return fileDb;
}
function saveSoon(u) {
  u.rev = (u.rev || 0) + 1;
  if (UP_URL) {
    dirty.add(u.id);
    if (!upTimer) upTimer = setTimeout(async () => {
      upTimer = null;
      const ids = [...dirty]; dirty.clear();
      for (const id of ids) { const x = cache.get(id); if (x) redis(["SET", "tb:user:" + id, JSON.stringify(x)]).catch((e) => console.log("save failed", e.message)); }
    }, 1500);
    return;
  }
  loadFile(); fileDb.users[u.id] = u;
  if (fileTimer) return;
  fileTimer = setTimeout(() => {
    fileTimer = null;
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      const tmp = FILE + ".tmp"; fs.writeFileSync(tmp, JSON.stringify(fileDb)); fs.renameSync(tmp, FILE);
    } catch (e) { console.log("Could not save accounts:", e.message); }
  }, 1500);
}
async function getUser(id) {
  if (cache.has(id)) return cache.get(id);
  if (UP_URL) { const v = await redis(["GET", "tb:user:" + id]); if (v) { const u = fix(JSON.parse(v)); cache.set(id, u); return u; } return null; }
  loadFile(); return cache.get(id) || null;
}
async function userBySession(token) {
  const h = sha(token);
  if (UP_URL) { const id = await redis(["GET", "tb:sess:" + h]); return id ? getUser(id) : null; }
  loadFile(); const id = sessIndex.get(h); return id ? getUser(id) : null;
}
async function addSession(u) {
  const token = crypto.randomBytes(32).toString("hex"), h = sha(token);
  u.sessions = [...(u.sessions || []), h].slice(-8);
  sessIndex.set(h, u.id);
  if (UP_URL) await redis(["SET", "tb:sess:" + h, u.id, "EX", 60 * 60 * 24 * 180]);
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
function hashPass(pw, salt = crypto.randomBytes(16).toString("hex")) {
  return { salt, hash: crypto.scryptSync(String(pw), salt, 64).toString("hex") };
}
function passOk(u, pw) {
  if (!u?.pass) return false;
  const a = Buffer.from(hashPass(pw, u.pass.salt).hash, "hex"), b = Buffer.from(u.pass.hash, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
async function signUp(username, password, backup) {
  username = String(username || "").trim(); password = String(password || "");
  if (!USER_RE.test(username)) throw new Error("Username: 3-16 letters, numbers or _");
  if (password.length < 6) throw new Error("Password needs at least 6 characters");
  if (password.length > 100) throw new Error("That password is too long");
  const id = "u_" + username.toLowerCase();
  if (!(await getUser(id)) && backup) {
    // this browser has a saved copy of that account: bring it back instead of starting over
    const r = await restore(backup, id);
    if (r && passOk(r, password)) { const token = await addSession(r); return { u: r, token }; }
  }
  if (await getUser(id)) throw new Error("That username is taken, try another one (or Log in if it's yours)");
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
const ACH_PUBLIC = ACH.map(({ id, icon, name, desc, coins }) => ({ id, icon, name, desc, coins }));

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
);
// rarity: set on the item, or from its store price
for (const it of STORE) it.rarity = it.rarity || (it.loot ? "common" : it.price <= 60 ? "common" : it.price <= 120 ? "rare" : it.price <= 200 ? "epic" : "legendary");
const STORE_BY_ID = new Map(STORE.map((x) => [x.id, x]));

// ======================= Loot boxes =======================
// Every box can still give junk; the pricier the box, the better the odds.
const BOXES = [
  { id: "basic", name: "Basic chest", price: 100, odds: { common: 72, rare: 22, epic: 5, legendary: 1 } },
  { id: "mid", name: "Intermediate chest", price: 500, odds: { common: 40, rare: 38, epic: 17, legendary: 5 } },
  { id: "legend", name: "Legendary chest", price: 1000, odds: { common: 15, rare: 30, epic: 35, legendary: 20 } },
];
const DUP_REFUND = { common: 10, rare: 30, epic: 80, legendary: 200 };
function openBox(u, boxId) {
  const box = BOXES.find((b) => b.id === boxId);
  if (!box) return { error: "Unknown chest" };
  if (u.coins < box.price) return { error: `You need ${box.price - u.coins} more coins` };
  u.coins -= box.price;
  let roll = Math.random() * 100, rarity = "common";
  for (const [r, w] of Object.entries(box.odds)) { if (roll < w) { rarity = r; break; } roll -= w; }
  const pool = STORE.filter((x) => x.rarity === rarity);
  // favour things you don't own yet (but duplicates can still happen)
  const fresh = pool.filter((x) => !u.owned.includes(x.id));
  const from = fresh.length && Math.random() < 0.75 ? fresh : pool;
  const item = from[Math.floor(Math.random() * from.length)];
  const dup = u.owned.includes(item.id);
  let refund = 0;
  if (dup) { refund = DUP_REFUND[rarity]; u.coins += refund; } else u.owned.push(item.id);
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
    if (ok) { u.ach[a.id] = Date.now(); u.coins += a.coins; got.push({ id: a.id, icon: a.icon, name: a.name, coins: a.coins }); }
  }
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
  if (r.champDriver) s.champDriver++;
  if (r.champTeam) s.champTeam++;
  const got = checkAch(u, r);
  saveSoon(u);
  return got;
}

function publicUser(u) {
  if (!u) return null;
  return { id: u.id, name: u.name, picture: u.picture, coins: u.coins, stats: u.stats, ach: u.ach, owned: u.owned, equipped: u.equipped, backup: makeBackup(u) };
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

module.exports = {
  config: () => ({ googleClientId: GOOGLE_CLIENT_ID || null, dev: DEV_LOGIN, persistent: !!UP_URL }),
  signUp, logIn, signInGoogle, openBox, BOXES, resumeOrRestore, restore, cleanPreset, savePreset, deletePreset, signInDev, userBySession, dropSession, getUser, recordRace, buy, equip, extrasOf, publicUser,
  ACH: ACH_PUBLIC, STORE,
};
