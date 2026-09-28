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
async function signInGoogle(credential) {
  const g = await verifyGoogle(credential);
  return signInWith("g_" + g.sub, g.name, g.picture);
}
async function signInDev(name) {
  if (!DEV_LOGIN) throw new Error("Test login is off");
  const n = String(name || "Tester").trim().slice(0, 16) || "Tester";
  return signInWith("dev_" + sha(n).slice(0, 12), n, "");
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
  { id: "green_hell", icon: "🌲", name: "The Green Hell", desc: "Finish a race on the Nordschleife", coins: 100, test: (s, r) => r.finished && r.trackId === "de-ns" },
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
const STORE_BY_ID = new Map(STORE.map((x) => [x.id, x]));

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
  return { id: u.id, name: u.name, picture: u.picture, coins: u.coins, stats: u.stats, ach: u.ach, owned: u.owned, equipped: u.equipped };
}

module.exports = {
  config: () => ({ googleClientId: GOOGLE_CLIENT_ID || null, dev: DEV_LOGIN, persistent: !!UP_URL }),
  signInGoogle, signInDev, userBySession, dropSession, getUser, recordRace, buy, equip, extrasOf, publicUser,
  ACH: ACH_PUBLIC, STORE,
};
