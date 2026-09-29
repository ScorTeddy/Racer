// Scribble GP: Team Boss server (made by Emmett)
// Runs every room's race so all players see exactly the same thing. Players are team
// bosses: they pick tires, call pit stops, react to the start lights and fire their boost;
// the server drives.

const fs = require("fs");
const accounts = require("./accounts");   // Google sign-in, stats, achievements, store
const path = require("path");
const http = require("http");
const express = require("express");
const { Server } = require("socket.io");

const PORT = process.env.PORT || 3000;

// ======================= Tuning =======================
const SCALE = 3.0;                 // world pixels per drawing-board unit
const TRACK_W = 130;               // default road width (world px). Tracks can be 84-260 wide, varying along the lap
const MIN_W = 84, MAX_W = 260;
const MARGIN = 420;
const CAR_HL = 23, CAR_HW = 12;        // half length / half width of a car's box hitbox
const CRASH_SPEED = 430;               // closing speed (px/s) that turns contact into a crash
const MAX_SPEED = 860, ACCEL = 560, BRAKE = 1300, REVERSE_MAX = 180;
const STEER_LOCK = 3.6;                // fastest a car can turn at low speed (rad/s)
const GRIP = 14;                       // how quickly sideways sliding dies away
const CORNER_GRIP = 1700;              // how hard drivers PLAN to corner (px/s^2)
const LAT_GRIP = CORNER_GRIP * 1.3;    // how hard the car CAN corner (a safety margin above the plan)
const BRAKE_PLAN = 936;                // how hard drivers plan to brake before a corner (72% of BRAKE)
const SLIP_TIME = 0.5, SLIP_BONUS = 0.30;          // within 0.5s of the car ahead: +30% top speed
// Boost: +12% top speed while held. A full tank lasts 5s of race time; there's no slow refill any
// more: every lap you cross the line you get 50% of the tank back (Nitro Refill: 55/60/65%).
const NITRO_POWER = 0.12, NITRO_DRAIN = 0.2, NITRO_LAP_REFILL = 0.5, OVERTAKE_BOOST = 0.1, NITRO_REGEN = 0.02;   // +2% boost every second when not boosting
// Heavy rain: from 60% wet the wets are the tire to be on. Anything else is a lot slower
// (top speed and grip) and slips out a couple of times a lap, but it can still race.
const SLIP_WET = 0.6;
const XP_RATE_MIN = 10, XP_RATE_MAX = 50, XP_RATE_DEFAULT = 10;   // passive XP per race-second (host setting)
// Tire life depends on race length: a fresh set lasts about 60% of the race
// (at least 1.8 laps, at most 8), so every race needs at least one pit stop.
const tireLifeLaps = (laps) => clamp(laps * 0.6, 1.8, 8);
const PIT_TIME = 2.8;
const MAP_SIZES = { small: [1200, 750], normal: [1600, 1000], large: [2400, 1500], huge: [3200, 2000] };
const WEAR_LEVELS = { low: 0.75, normal: 1, high: 1.35 };
const MAX_PLAYERS = 6;
// 90 made-up drivers, so even a 60-car grid has no "Bolt 2"
const AI_NAMES = ["Bolt", "Nova", "Rusty", "Vex", "Kira", "Moss", "Blaze", "Juno", "Ziggy", "Pip",
  "Axel", "Luna", "Dash", "Echo", "Finn", "Gemma", "Hugo", "Ivy", "Jett", "Kai",
  "Lola", "Milo", "Nash", "Orla", "Pike", "Quinn", "Rex", "Sage", "Taro", "Uma",
  "Vince", "Wren", "Xander", "Yuki", "Zane", "Ace Jr", "Bree", "Cruz", "Dex", "Elio",
  "Flint", "Gio", "Hana", "Ines", "Jasper", "Kenji", "Leon", "Mara", "Nico", "Otto",
  "Pia", "Rafa", "Sol", "Tess", "Ulla", "Vito", "Wade", "Xia", "Yara", "Zeke",
  "Aria", "Bram", "Cleo", "Dario", "Elsa", "Fox", "Greta", "Hank", "Iker", "Jules",
  "Knox", "Lars", "Mika", "Noor", "Oskar", "Petra", "Rio", "Sven", "Tomas", "Vera",
  "Willa", "Yusuf", "Zora", "Arlo", "Bex", "Cato", "Dunya", "Enzo", "Freya", "Gus"];
const AI_COLORS = ["#e53935", "#1e88e5", "#43a047", "#8e24aa", "#fb8c00", "#00acc1", "#ec407a", "#6d4c41", "#546e7a", "#c0ca33"];
const LIVERIES = ["plain", "stripes", "split", "flames", "checker"];
// Tire compounds. Wets are only good when the track is wet.
const COMPOUNDS = {
  durable: { name: "Durable",      short: "D", speed: 0.97,  grip: 0.96, wear: 0.8 },    // lasts longer than inters (~1.25x), a bit slower
  inter:   { name: "Intermediate", short: "I", speed: 1.0,   grip: 1.0,  wear: 1.0 },
  fast:    { name: "Fast",         short: "F", speed: 1.04,  grip: 1.07, wear: 1.75 },
  wet:     { name: "Wets",         short: "W", speed: 0.92,  grip: 0.97, wear: 0.8, dryWear: 2.6 },
};
const COMPOUND_KEYS = Object.keys(COMPOUNDS);
const TIRE_PICK_TIME = 10000;      // ms to choose your starting tires
const PIT_LIMIT = 170;             // pit lane speed limit (world px/s, about 60 km/h)
const PIT_GAP = 62;                // pit lane center sits this far outside the road edge
const DEFAULT_POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
const MAX_AI = 60;
const AI_TEAMS = ["Thunder Racing", "Apex Motors", "Nitro Works", "Comet GP", "Vortex", "Blue Falcon", "Red Arrow", "Iron Wolf", "Solar Speed", "Night Owl",
  "Crimson Tide GP", "Polar Motorsport", "Jade Dragon", "Sandstorm Racing", "Quantum Speed", "Kestrel Works", "Titan Torque", "Silver Fox", "Rocket Cola Racing", "Mango Motors",
  "Aurora Engineering", "Ember Racing", "Glacier GP", "Hornet Team", "Lynx Autosport", "Meteor Racing", "Orbit Motors", "Phantom GP", "Riptide Racing", "Zenith Speed", "Cobalt Crew", "Wildcat Works", "Starling GP"];
const HEX = /^#[0-9a-fA-F]{6}$/;
const pct = (x) => Math.round(x * 100);
const PIT_MISTAKE_CHANCE = 0.05, PIT_MISTAKE_TIME = 1;   // 5%: the crew fumbles and you wait 1 more second
const SEASONS = [0, 3, 5, 8, 10];                        // championship length in races (0 = never ends)
// Real F1 circuits (layouts from github.com/bacinger/f1-circuits, MIT license).
// Each: {id, name, place, km, w, h, pts: [[x, y], ...]} with x/y scaled to 0..1000.
let F1_TRACKS = [];
try { F1_TRACKS = JSON.parse(fs.readFileSync(path.join(__dirname, "f1-tracks.json"), "utf8")); } catch (e) { console.log("f1-tracks.json not found: no F1 tracks"); }
const f1List = () => F1_TRACKS.map((t) => ({ id: t.id, name: t.name, place: t.place, km: t.km, w: t.w, h: t.h, pts: t.pts.filter((_, i) => i % 3 === 0) }));
const DESIGN = /^[0-9a-f.]{288}$/;   // car paint job: 24 x 12 pixels, one palette colour (0-f) or "." (see-through) each

// Upgrades. Every level is a big, feelable jump. `fx(level)` is what the card shows ("Now: ...").
const UPGRADES = {
  corner:  { kind: "Driver", name: "Corner Master",  desc: "+6% corner speed per level",             max: 5, fx: (n) => `+${6 * n}% corner speed` },
  late:    { kind: "Driver", name: "Late Braker",    desc: "Brakes 8% later, +2% corner speed",      max: 4, fx: (n) => `+${8 * n}% later braking` },
  craft:   { kind: "Driver", name: "Racecraft",      desc: "Slipstream from further back, attacks harder", max: 4, fx: (n) => `+${(0.1 * n).toFixed(1)}s slipstream reach` },
  focus:   { kind: "Driver", name: "Focus",          desc: "40% fewer mistakes",                     max: 3, fx: (n) => `${pct(1 - Math.pow(0.6, n))}% fewer mistakes` },
  whisper: { kind: "Driver", name: "Tire Whisperer", desc: "Wears tires 15% slower",                 max: 4, fx: (n) => `${pct(1 - Math.pow(0.85, n))}% less tire wear` },
  engine:  { kind: "Car",    name: "Big Engine",     desc: "+7% top speed per level",                max: 5, fx: (n) => `+${7 * n}% top speed` },
  turbo:   { kind: "Car",    name: "Turbo",          desc: "+25% acceleration per level",            max: 4, fx: (n) => `+${25 * n}% acceleration` },
  grip:    { kind: "Car",    name: "Sticky Setup",   desc: "+15% grip, +2% corner speed",            max: 4, fx: (n) => `+${15 * n}% grip` },
  brakes:  { kind: "Car",    name: "Carbon Brakes",  desc: "+30% braking power",                     max: 3, fx: (n) => `+${30 * n}% braking` },
  pit:     { kind: "Car",    name: "Pro Pit Crew",   desc: "Pit stops 25% faster",                   max: 3, fx: (n) => `${pct(1 - Math.pow(0.75, n))}% faster pit stops` },
  refill:  { kind: "Car",    name: "Nitro Refill",   desc: "+5% boost back every lap",               max: 3, fx: (n) => `${pct(NITRO_LAP_REFILL + 0.05 * n)}% boost back per lap` },
  pitlane: { kind: "Car",    name: "Pit Lane Rocket", desc: "Drives 25% faster down the pit lane",   max: 3, fx: (n) => `+${25 * n}% pit lane speed` },
  saver:   { kind: "Car",    name: "Nitro Saver",    desc: "Boost drains 3% slower per level",       max: 4, fx: (n) => `${3 * n}% slower boost drain` },
  enhance: { kind: "Car",    name: "Enhancer",       desc: "+3% to EVERY stat (the ones you have and any you get later)", max: 4, fx: (n) => `+${3 * n}% to everything` },
};
// AI difficulty (Race tab): how good the AI drivers are, how quickly they upgrade, how often they slip up
const AI_LEVELS = {
  easy:    { skill: [0.8, 0.86], power: 0.96, xp: 0.75, mistakes: 1.8, aggr: 0.8, react: [0.3, 0.6] },
  medium:  { skill: [0.88, 0.95], power: 0.99, xp: 1.5, mistakes: 1, aggr: 1, react: [0.18, 0.48] },
  hard:    { skill: [0.95, 1.0], power: 1.01, xp: 2.1, mistakes: 0.6, aggr: 1.15, react: [0.12, 0.3] },
  extreme: { skill: [1.0, 1.05], power: 1.04, xp: 2.8, mistakes: 0.3, aggr: 1.3, react: [0.08, 0.18] },
};
const upgradeInfo = () => Object.fromEntries(Object.entries(UPGRADES).map(([k, u]) => [k, { kind: u.kind, name: u.name, desc: u.desc, max: u.max, levels: Array.from({ length: u.max + 1 }, (_, n) => u.fx(n)) }]));
const blankUp = () => Object.fromEntries(Object.keys(UPGRADES).map((k) => [k, 0]));
const xpForLevel = (lvl) => 100 + (lvl - 1) * 50;

// ======================= Web server =======================
// ---- security (see SECURITY in the README) ----
const PROD = process.env.NODE_ENV === "production" || !!process.env.RENDER;
const MAX_ROOMS = 300, MAX_SOCKETS_PER_IP = 12;
// secrets never go to the browser and are never printed; just warn if something important is missing
if (PROD) {
  if (!process.env.ACCOUNT_SECRET || process.env.ACCOUNT_SECRET.length < 16) console.warn("SECURITY: set ACCOUNT_SECRET (16+ random characters) on Render, or account backups can be forged.");
  if (process.env.DEV_LOGIN === "1") console.warn("SECURITY: DEV_LOGIN is ignored in production (it would let anyone log in without a password).");
}
const app = express();
app.disable("x-powered-by");                  // don't advertise what the server runs
app.set("trust proxy", 1);                    // Render sits in front of us and tells us the real protocol/IP
app.use((req, res, next) => {
  // HTTPS only: send plain http visitors to https (Render gives every site a certificate)
  if (PROD && req.headers["x-forwarded-proto"] === "http") return res.redirect(301, "https://" + req.headers.host + req.originalUrl);
  // security headers
  if (PROD) res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin-allow-popups");     // (Google sign-in uses a popup)
  res.setHeader("Content-Security-Policy", [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://accounts.google.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob: https://*.googleusercontent.com https://accounts.google.com",
    "media-src 'self' blob: https://archive.org https://*.archive.org",
    "connect-src 'self' ws: wss: https://accounts.google.com",
    "frame-src https://accounts.google.com",
    "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'",
  ].join("; "));
  next();
});
app.use(express.static(path.join(__dirname, "public"), { dotfiles: "deny", index: false }));
app.get("/auth/config", (req, res) => res.json(accounts.config()));
const indexFile = fs.existsSync(path.join(__dirname, "public", "index.html"))
  ? path.join(__dirname, "public", "index.html") : path.join(__dirname, "index.html");
app.get("/", (req, res) => res.sendFile(indexFile));
app.use((req, res) => res.status(404).send("Not found"));
// no stack traces or debug details to visitors, ever
app.use((err, req, res, next) => { console.error("HTTP error:", err.message); res.status(500).send("Something went wrong"); });
const server = http.createServer(app);
const ipOf = (req) => (String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket.remoteAddress || "?");
const socketsPerIp = new Map();
const io = new Server(server, {
  perMessageDeflate: false,
  maxHttpBufferSize: 400e3,                   // biggest real message is a drawn track (~150 KB)
  // CORS: only pages from this same site may connect (or ALLOWED_ORIGINS, comma separated, if you set it)
  allowRequest: (req, cb) => {
    const origin = req.headers.origin;
    if (!origin) return cb(null, true);
    let ok = false;
    try { const o = new URL(origin); ok = o.host === req.headers.host || (process.env.ALLOWED_ORIGINS || "").split(",").map((x) => x.trim()).includes(origin); } catch (e) {}
    if (!ok) return cb("origin not allowed", false);
    if ((socketsPerIp.get(ipOf(req)) || 0) >= MAX_SOCKETS_PER_IP) return cb("too many connections", false);
    cb(null, true);
  },
});
// a bad message from one player must never crash the server for everyone
process.on("uncaughtException", (e) => console.error("Uncaught:", e && e.stack || e));
process.on("unhandledRejection", (e) => console.error("Unhandled promise:", e && e.message || e));

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const lerp = (a, b, t) => a + (b - a) * t;

// ======================= Track building (from the host's drawing) =======================
// Points are {x, y, w}: w is the road width (world px) the host painted with.
function resample(pts, spacing, closed) {
  const src = closed ? [...pts, pts[0]] : pts;
  const out = [{ ...src[0] }];
  let carry = 0;
  for (let i = 1; i < src.length; i++) {
    const a = src[i - 1], b = src[i], seg = dist(a, b);
    if (seg === 0) continue;
    let t = spacing - carry;
    while (t <= seg) { const f = t / seg; out.push({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, w: a.w + (b.w - a.w) * f }); t += spacing; }
    carry = seg - (t - spacing);
  }
  if (closed && out.length > 2 && dist(out[out.length - 1], out[0]) < spacing * 0.5) out.pop();
  return out;
}
function chaikinClosed(pts, rounds) {
  let p = pts;
  for (let r = 0; r < rounds; r++) {
    const q = [];
    for (let i = 0; i < p.length; i++) {
      const a = p[i], b = p[(i + 1) % p.length];
      q.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25, w: a.w * 0.75 + b.w * 0.25 });
      q.push({ x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75, w: a.w * 0.25 + b.w * 0.75 });
    }
    p = q;
  }
  return p;
}
// Trim a little "hook" at the very end (or start) of a drawing: when you lift your finger or
// mouse, the last bit often flicks off in a random direction. Only looks at the last ~8%.
function trimHooks(pts) {
  const dirAt = (i, k) => Math.atan2(pts[i + k].y - pts[i].y, pts[i + k].x - pts[i].x);
  const n = pts.length, zone = Math.max(4, Math.floor(n * 0.08)), k = 4;
  for (let i = n - 1 - k; i > n - zone - k && i > k; i--) {
    const turn = Math.abs(wrapAngle(dirAt(i, k) - dirAt(i - k, k)));
    if (turn > 0.8) { pts = pts.slice(0, i + 1); break; }
  }
  const m = pts.length;
  for (let i = k; i < Math.min(zone, m - 2 * k); i++) {
    const turn = Math.abs(wrapAngle(dirAt(i, k) - dirAt(i - k, k)));
    if (turn > 0.8) { pts = pts.slice(i); break; }
  }
  return pts;
}
// Joining the end of the drawing back to its start: trim overshoot, then a smooth curve.
function closeSmoothly(pts) {
  // already a closed loop (the end came back to the start)? then there's no stray flick to trim
  if (dist(pts[0], pts[pts.length - 1]) < 30) {
    while (pts.length > 3 && dist(pts[0], pts[pts.length - 1]) < 3) pts = pts.slice(0, -1);
    return pts;
  }
  pts = trimHooks(pts);
  const n = pts.length, win = Math.floor(n * 0.3);
  let best = -1, bd = 70;
  for (let j = n - win; j < n - 2; j++) { const d = dist(pts[j], pts[0]); if (d < bd) { bd = d; best = j; } }
  if (best > 0) pts = pts.slice(0, best + 1);
  const end = pts[pts.length - 1];
  best = -1; bd = 70;
  for (let i = 2; i < Math.floor(pts.length * 0.3); i++) { const d = dist(pts[i], end); if (d < bd) { bd = d; best = i; } }
  if (best > 0) pts = pts.slice(best);
  const A = pts[pts.length - 1], B = pts[0], gap = dist(A, B);
  if (gap < 8) return pts;
  const a0 = pts[Math.max(0, pts.length - 6)], b1 = pts[Math.min(pts.length - 1, 5)];
  const ta = { x: A.x - a0.x, y: A.y - a0.y }, tb = { x: b1.x - B.x, y: b1.y - B.y };
  const la = Math.hypot(ta.x, ta.y) || 1, lb = Math.hypot(tb.x, tb.y) || 1, m = gap * 1.1;
  const TA = { x: (ta.x / la) * m, y: (ta.y / la) * m }, TB = { x: (tb.x / lb) * m, y: (tb.y / lb) * m };
  const steps = Math.max(3, Math.ceil(gap / 6)), bridge = [];
  for (let k = 1; k < steps; k++) {                     // Hermite curve from the end back to the start
    const t = k / steps, t2 = t * t, t3 = t2 * t;
    const h1 = 2 * t3 - 3 * t2 + 1, h2 = -2 * t3 + 3 * t2, h3 = t3 - 2 * t2 + t, h4 = t3 - t2;
    bridge.push({ x: h1 * A.x + h2 * B.x + h3 * TA.x + h4 * TB.x, y: h1 * A.y + h2 * B.y + h3 * TA.y + h4 * TB.y, w: lerp(A.w, B.w, t) });
  }
  return [...pts, ...bridge];
}
// extra smoothing right around the start/finish joint (the loop wraps at index 0)
function smoothJoin(pts) {
  const n = pts.length, R = Math.min(18, Math.floor(n / 6));
  for (let it = 0; it < 8; it++) {
    const next = pts.map((p) => ({ ...p }));
    for (let d = -R; d <= R; d++) {
      const i = (d + n) % n, a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n];
      const w = 0.5 * (1 - Math.abs(d) / (R + 1));
      next[i] = { x: pts[i].x + ((a.x + b.x) / 2 - pts[i].x) * w, y: pts[i].y + ((a.y + b.y) / 2 - pts[i].y) * w, w: pts[i].w };
    }
    pts = next;
  }
  return pts;
}
// Width changes blend in gradually (thick to thin over ~450px of road, no sudden steps).
function smoothWidths(pts) {
  const n = pts.length, R = 5;
  for (let pass = 0; pass < 3; pass++) {
    const w = pts.map((p) => p.w), out = new Array(n);
    let sum = 0;
    for (let d = -R; d <= R; d++) sum += w[(d + n) % n];
    for (let i = 0; i < n; i++) { out[i] = sum / (2 * R + 1); sum += w[(i + R + 1) % n] - w[(i - R + n) % n]; }
    pts.forEach((p, i) => (p.w = out[i]));
  }
  return pts;
}
// Wide roads can't go round hairpins tighter than they are wide (the inside edge would fold
// over itself), so the road automatically narrows through very tight turns and widens again
// smoothly afterwards.
function circR(a, b, c) {
  const ab = dist(a, b), bc = dist(b, c), ca = dist(c, a);
  const cross = Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
  return cross < 1e-6 ? Infinity : (ab * bc * ca) / (2 * cross);
}
// Two separate bits of road running side by side (not crossing) must not overlap: narrow
// the road there so there's always a strip of grass between them.
function narrowCloseRoads(pts) {
  const n = pts.length, grid = segGrid(pts, 60), cap = new Array(n).fill(MAX_W);
  let L = 0; for (let i = 0; i < n; i++) L += dist(pts[i], pts[(i + 1) % n]);
  const sp = L / n, cross = [];
  for (let i = 0; i < n; i++) for (const j of grid.near(pts[i].x, pts[i].y, 30)) {
    if (j < i + 8 || (i < 8 && j > n - 8 + i)) continue;
    const h = segHit(pts[i], pts[(i + 1) % n], pts[j], pts[(j + 1) % n]); if (h) cross.push(h);
  }
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    for (const j of grid.near(p.x, p.y, (MAX_W + 40) / SCALE)) {
      let di = Math.abs(i - j); di = Math.min(di, n - di);
      if (di * sp < (MAX_W / SCALE) * 2.5) continue;                        // same bit of road
      const D = dist(p, pts[j]) * SCALE;
      if (D > MAX_W + 40) continue;
      if (cross.some((c) => dist(c, p) * SCALE < D + MAX_W)) continue;       // it's a proper crossing (bridge)
      cap[i] = Math.min(cap[i], Math.max(MIN_W, D - 36));
    }
  }
  pts.forEach((p, i) => (p.w = Math.min(p.w, cap[i])));
  return pts;
}
function narrowTightTurns(pts) {
  const n = pts.length, R = 10;
  const cap = pts.map((p, i) => clamp((circR(pts[(i - 2 + n) % n], p, pts[(i + 2) % n]) - 6) * SCALE * 2, MIN_W, MAX_W));
  // spread each squeeze to its neighbours (min over a window), then soften the edges
  const lo = cap.map((_, i) => { let m = Infinity; for (let d = -R; d <= R; d++) m = Math.min(m, cap[(i + d + n) % n]); return m; });
  const soft = lo.map((_, i) => { let s = 0; for (let d = -R; d <= R; d++) s += lo[(i + d + n) % n]; return s / (2 * R + 1); });
  pts.forEach((p, i) => (p.w = Math.min(p.w, soft[i], cap[i] + 20)));
  return pts;
}

// Remove tiny accidental loops / zig-zags (hand jitter) from an open drawing: if the path
// crosses itself within a few points, cut the little loop out.
function removeTinyLoops(pts, span = 14) {
  for (let i = 0; i < pts.length - 3; i++) {
    for (let j = Math.min(pts.length - 2, i + span); j >= i + 2; j--) {
      if (segHit(pts[i], pts[i + 1], pts[j], pts[j + 1])) { pts.splice(i + 1, j - i); break; }
    }
  }
  return pts;
}
// Last safety pass: no single point may turn sharply (a kink the cars can't follow).
function smoothKinks(pts, maxTurn = 0.3) {
  const n = pts.length;
  for (let it = 0; it < 60; it++) {
    let bad = 0;
    for (let i = 0; i < n; i++) {
      const a = pts[(i - 1 + n) % n], b = pts[i], c = pts[(i + 1) % n];
      const turn = Math.abs(wrapAngle(Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(b.y - a.y, b.x - a.x)));
      const tp = Math.abs(wrapAngle(Math.atan2(b.y - a.y, b.x - a.x) - Math.atan2(a.y - pts[(i - 2 + n) % n].y, a.x - pts[(i - 2 + n) % n].x)));
      const tn = Math.abs(wrapAngle(Math.atan2(pts[(i + 2) % n].y - c.y, pts[(i + 2) % n].x - c.x) - Math.atan2(c.y - b.y, c.x - b.x)));
      if (turn > maxTurn && turn > 1.8 * Math.max(tp, tn)) {          // a spike, not a proper (tight) bend
        bad++;
        for (let d = -2; d <= 2; d++) {                 // relax the neighbourhood, strongest in the middle
          const k = (i + d + n) % n, p = pts[(k - 1 + n) % n], q = pts[(k + 1) % n], f = d === 0 ? 0.5 : Math.abs(d) === 1 ? 0.3 : 0.15;
          pts[k].x += ((p.x + q.x) / 2 - pts[k].x) * f; pts[k].y += ((p.y + q.y) / 2 - pts[k].y) * f;
        }
      }
    }
    if (!bad) break;
  }
  return pts;
}

// "Smooth track": straight-ish bits become dead straight, corners become clean curves.
// Simplify the loop to its key corner points, then round each corner as much as the
// straights either side allow.
function rdp(pts, a, b, eps, keep) {
  let far = -1, fd = eps;
  const A = pts[a], B = pts[b], L = dist(A, B) || 1;
  for (let i = a + 1; i < b; i++) {
    const d = Math.abs((B.x - A.x) * (A.y - pts[i].y) - (A.x - pts[i].x) * (B.y - A.y)) / L;
    if (d > fd) { fd = d; far = i; }
  }
  if (far < 0) return;
  keep[far] = true; rdp(pts, a, far, eps, keep); rdp(pts, far, b, eps, keep);
}
function straighten(pts) {
  const n = pts.length;
  let m = 0, md = 0; for (let i = 0; i < n; i++) { const d = dist(pts[0], pts[i]); if (d > md) { md = d; m = i; } }
  const ring = [...pts, pts[0]], keep = new Array(n + 1).fill(false);
  keep[0] = keep[m] = keep[n] = true;
  rdp(ring, 0, m, 9, keep); rdp(ring, m, n, 9, keep);
  const V = []; for (let i = 0; i < n; i++) if (keep[i]) V.push(pts[i]);
  if (V.length < 3) return pts;
  const k = V.length, out = [];
  for (let i = 0; i < k; i++) {
    const a = V[(i - 1 + k) % k], v = V[i], c = V[(i + 1) % k];
    const la = dist(a, v), lc = dist(v, c), r = Math.min(160, la * 0.48, lc * 0.48);
    const p1 = { x: v.x + (a.x - v.x) * (r / la), y: v.y + (a.y - v.y) * (r / la), w: lerp(v.w, a.w, r / la) };
    const p2 = { x: v.x + (c.x - v.x) * (r / lc), y: v.y + (c.y - v.y) * (r / lc), w: lerp(v.w, c.w, r / lc) };
    const steps = Math.max(4, Math.ceil(r / 5));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps, u = 1 - t;
      out.push({ x: u * u * p1.x + 2 * u * t * v.x + t * t * p2.x, y: u * u * p1.y + 2 * u * t * v.y + t * t * p2.y, w: lerp(p1.w, p2.w, t) });
    }
  }
  return resample(out, 6, true);
}

function buildTrack(stroke, board, smooth) {
  if (!Array.isArray(stroke) || stroke.length < 4) return { error: "Draw a loop to make a track." };
  const [BW, BH] = board;
  const raw = [];
  for (const q of stroke.slice(0, 8000)) {
    const p = { x: clamp(Number(q?.[0]) || 0, 0, BW), y: clamp(Number(q?.[1]) || 0, 0, BH), w: clamp(Number(q?.[2]) || TRACK_W, MIN_W, MAX_W) };
    if (!raw.length || dist(p, raw[raw.length - 1]) >= 2) raw.push(p);          // skip jittery duplicate points
  }
  if (raw.length < 4) return { error: "Draw a loop to make a track." };
  let pts = removeTinyLoops(resample(raw, 6, false));
  let len = 0; for (let i = 1; i < pts.length; i++) len += dist(pts[i - 1], pts[i]);
  if (len < 700) return { error: "Too small! Draw a bigger track." };
  pts = closeSmoothly(pts);
  if (smooth) pts = straighten(pts);
  pts = chaikinClosed(pts, 3);
  pts = resample(pts, 10, true);
  pts = smoothJoin(pts);
  pts = smoothKinks(pts, 0.3);
  pts = resample(pts, 10, true);
  pts = smoothWidths(narrowTightTurns(narrowCloseRoads(pts)));
  pts = narrowCloseRoads(pts);                  // (again after blending, so the squeeze is still respected)
  if (pts.length < 40) return { error: "Too small! Draw a bigger track." };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); }
  const pad = MARGIN + 60 + (MAX_W - TRACK_W) / 2;
  const world = pts.map((p) => ({ x: (p.x - minX) * SCALE + pad, y: (p.y - minY) * SCALE + pad, w: p.w }));
  const W = Math.ceil((maxX - minX) * SCALE + pad * 2), H = Math.ceil((maxY - minY) * SCALE + pad * 2);
  return { base: world, W, H, minX, minY, pad };
}

// A tiny spatial grid of track segments so crossing / near-miss checks stay fast.
function segGrid(world, cell) {
  const g = new Map(), N = world.length;
  for (let i = 0; i < N; i++) {
    const a = world[i], b = world[(i + 1) % N];
    const cx = Math.floor((a.x + b.x) / 2 / cell), cy = Math.floor((a.y + b.y) / 2 / cell), key = cx * 100003 + cy;
    if (!g.has(key)) g.set(key, []);
    g.get(key).push(i);
  }
  return {
    near(x, y, r) {
      const out = [], cr = Math.ceil(r / cell), cx = Math.floor(x / cell), cy = Math.floor(y / cell);
      for (let dx = -cr; dx <= cr; dx++) for (let dy = -cr; dy <= cr; dy++) { const l = g.get((cx + dx) * 100003 + cy + dy); if (l) for (const i of l) out.push(i); }
      return out;
    },
  };
}
function segHit(p1, p2, p3, p4) {
  const d = (p2.x - p1.x) * (p4.y - p3.y) - (p2.y - p1.y) * (p4.x - p3.x);
  if (Math.abs(d) < 1e-9) return null;
  const u = ((p3.x - p1.x) * (p4.y - p3.y) - (p3.y - p1.y) * (p4.x - p3.x)) / d;
  const v = ((p3.x - p1.x) * (p2.y - p1.y) - (p3.y - p1.y) * (p2.x - p1.x)) / d;
  return u >= 0 && u <= 1 && v >= 0 && v <= 1 ? { x: p1.x + (p2.x - p1.x) * u, y: p1.y + (p2.y - p1.y) * u } : null;
}
// Bridges: wherever the track crosses itself, the LATER pass climbs a ramp and goes over.
// If that spot is already up on a bridge, the later pass goes one level higher (double ramp,
// even a triple). elev[i]: 0 = ground, 1 = bridge, 2 = double bridge, in between = ramps.
function computeElev(world, tan, hw, spacing) {
  const N = world.length, grid = segGrid(world, 160), crossings = [];
  for (let i = 0; i < N; i++) {
    const a1 = world[i], a2 = world[(i + 1) % N];
    for (const j of grid.near((a1.x + a2.x) / 2, (a1.y + a2.y) / 2, 60)) {
      if (j < i + 8 || (i < 8 && j > N - 8 + i)) continue;
      const hit = segHit(a1, a2, world[j], world[(j + 1) % N]);
      if (hit) crossings.push({ i, j, x: hit.x, y: hit.y, sin: Math.abs(tan[i].x * tan[j].y - tan[i].y * tan[j].x) });
    }
  }
  const rampPts = 250 / spacing;
  const bumps = crossings.map((c) => ({ ...c, L: 1, span: ((hw[c.i] + 45) / Math.max(0.35, c.sin) + CAR_HL) / spacing }));
  const hAt = (b, k) => {
    let d = Math.abs(k - b.j); d = Math.min(d, N - d);
    return d <= b.span ? b.L : Math.max(0, b.L - (d - b.span) / rampPts);
  };
  for (let it = 0; it < 6; it++) {
    let changed = false;
    for (const b of bumps) {
      let under = 0;
      for (const o of bumps) if (o !== b) under = Math.max(under, hAt(o, b.i));
      const L = Math.min(3, Math.ceil(under - 0.05) + 1);
      if (L !== b.L) { b.L = L; changed = true; }
    }
    if (!changed) break;
  }
  const elev = new Array(N).fill(0);
  for (const b of bumps) {
    const reach = Math.ceil(b.span + rampPts * b.L) + 1;
    for (let d = -reach; d <= reach; d++) { const k = (b.j + d + N) % N; elev[k] = Math.max(elev[k], hAt(b, k)); }
  }
  return { elev, crossings, maxLevel: bumps.reduce((m, b) => Math.max(m, b.L), 0) };
}

// Turn the track shape into a raceable track, starting at base point `start`, optionally reversed.
function finalizeTrack(shape, start = 0, reverse = false, teams = []) {
  const B = shape.base, n0 = B.length;
  const order = [];
  for (let k = 0; k < n0; k++) order.push(reverse ? (start - k + n0 * 2) % n0 : (start + k) % n0);
  const world = order.map((i) => B[i]);
  const N = world.length, tan = [], nor = [], hw = world.map((p) => p.w / 2);
  for (let i = 0; i < N; i++) {
    const a = world[(i - 1 + N) % N], b = world[(i + 1) % N], L = dist(a, b) || 1;
    tan.push({ x: (b.x - a.x) / L, y: (b.y - a.y) / L });
    nor.push({ x: -(b.y - a.y) / L, y: (b.x - a.x) / L });
  }
  let length = 0; for (let i = 0; i < N; i++) length += dist(world[i], world[(i + 1) % N]);
  const spacing = length / N;
  // Racing line: the smoothest (least curvy) path that fits on the road. That's what real
  // drivers do: swing out wide before a corner, clip the inside at the apex, run out wide on
  // the exit. Done coarse-to-fine so long sweeping curves come out right too.
  const line = new Array(N).fill(0), lp = world.map((p) => ({ x: p.x, y: p.y }));
  const lim = hw.map((h) => Math.max(4, h - 18));
  for (const [k, iters] of [[8, 220], [4, 220], [2, 200], [1, 160]]) {
    for (let it = 0; it < iters; it++) {
      for (let i = 0; i < N; i++) {
        const a = lp[(i - k + N) % N], b = lp[(i + k) % N], a2 = lp[(i - 2 * k + 2 * N) % N], b2 = lp[(i + 2 * k) % N];
        // "minimum curvature" target: fits a smooth curve through the neighbours
        const tx = (4 * (a.x + b.x) - (a2.x + b2.x)) / 6, ty = (4 * (a.y + b.y) - (a2.y + b2.y)) / 6;
        const want = (tx - world[i].x) * nor[i].x + (ty - world[i].y) * nor[i].y;
        line[i] = clamp(line[i] + (want - line[i]) * 0.5, -lim[i], lim[i]);
        lp[i].x = world[i].x + nor[i].x * line[i]; lp[i].y = world[i].y + nor[i].y * line[i];
      }
    }
  }
  // corner speed at every point of the racing line (vcorner, no cap: straights are "infinite")
  const k = 3, vcorner = [], turnAt = [];
  for (let i = 0; i < N; i++) {
    const a = lp[(i - k + N) % N], m = lp[i], b = lp[(i + k) % N];
    const turn = Math.abs(wrapAngle(Math.atan2(b.y - m.y, b.x - m.x) - Math.atan2(m.y - a.y, m.x - a.x)));
    vcorner.push(Math.min(4000, Math.sqrt(CORNER_GRIP / (turn / (dist(a, m) + dist(m, b) || 1) + 1e-6))));
    const t1 = tan[(i - k + N) % N], t2 = tan[(i + k) % N];
    turnAt.push(wrapAngle(Math.atan2(t2.y, t2.x) - Math.atan2(t1.y, t1.x)));
  }
  // vmax: a typical car's speed there, braking included (used for first-corner and track info)
  const vmax = vcorner.map((v) => Math.min(MAX_SPEED, v));
  for (let pass = 0; pass < 2; pass++) for (let i = N - 1; i >= 0; i--) {
    const next = vmax[(i + 1) % N]; vmax[i] = Math.min(vmax[i], Math.sqrt(next * next + 2 * BRAKE_PLAN * spacing));
  }
  const { elev, crossings, maxLevel } = computeElev(world, tan, hw, spacing);
  // gravel traps on the outside of corners (like a real F1 circuit), grass elsewhere
  const gravel = new Array(N).fill(0);
  for (let i = 0; i < N; i++) if (Math.abs(turnAt[i]) > 0.3) {
    const side = -Math.sign(turnAt[i]);
    for (let d = -4; d <= 5; d++) gravel[(i + d + N) % N] = side;
  }
  // pit lane: runs beside the main straight, entry before the start line, exit after it
  const entry = (N - Math.max(14, Math.round(700 / spacing))) % N, laneLen = (N - entry) + Math.max(10, Math.round(500 / spacing));
  let side = 1, bestRoom = -1;
  for (const sgn of [1, -1]) {
    let room = Infinity;
    for (let kk = 0; kk <= laneLen; kk += 2) {
      const li = (entry + kk) % N, off = hw[li] + PIT_GAP + 50, c = { x: world[li].x + nor[li].x * sgn * off, y: world[li].y + nor[li].y * sgn * off };
      for (let i = 0; i < N; i += 2) { const di = Math.min(Math.abs(i - li), N - Math.abs(i - li)); if (di < 10) continue; room = Math.min(room, dist(world[i], c) - hw[i]); }
    }
    if (room > bestRoom) { bestRoom = room; side = sgn; }
  }
  for (let i = 0; i < N; i++) if (elev[i] > 0) gravel[i] = 0;
  for (let kk = -2; kk <= laneLen + 2; kk++) { const li = (entry + kk + N) % N; if (gravel[li] === side) gravel[li] = 0; }
  const pitLane = { entry, len: laneLen, side, gap: PIT_GAP, boxes: {} };
  assignBoxes(pitLane, teams);
  return {
    pts: world.map((p) => ({ x: p.x, y: p.y })), tan, nor, hw, N, length, spacing, vmax, vcorner, W: shape.W, H: shape.H, trackW: TRACK_W,
    line, gravel, pitLane, elev, bridges: crossings.length, maxLevel,
    order, start, reverse, minX: shape.minX, minY: shape.minY, pad: shape.pad,
  };
}
// every team gets its own garage box along the pit lane
function assignBoxes(pl, teams) {
  const list = [...new Set(teams)].filter(Boolean);
  pl.boxes = {};
  const from = 7, to = pl.len - 7, span = Math.max(1, to - from);
  list.forEach((t, i) => { pl.boxes[t] = from + Math.round((span * (i + 0.5)) / Math.max(1, list.length)); });
}
function rampLane(pl, k) { return clamp(Math.min(k, pl.len - k) / 5, 0, 1); }
function lanePoint(t, k) {
  const pl = t.pitLane, i = ((pl.entry + Math.floor(k)) % t.N + t.N) % t.N, j = (i + 1) % t.N, f = k - Math.floor(k);
  const off = pl.side * (t.hw[i] + pl.gap) * rampLane(pl, k);
  const x = t.pts[i].x + (t.pts[j].x - t.pts[i].x) * f, y = t.pts[i].y + (t.pts[j].y - t.pts[i].y) * f;
  return { x: x + t.nor[i].x * off, y: y + t.nor[i].y * off };
}
// how far along the pit lane a track index is (or -1 if not in the lane's stretch)
function laneK(t, idx) { const k = (idx - t.pitLane.entry + t.N) % t.N; return k <= t.pitLane.len ? k : -1; }

// ======================= Random tracks =======================
// A wobbly loop made of a few random waves. Big waves make the loop fold over itself
// (= bridges), lots of small waves make twisty bits. We make a bunch and keep the best one.
function gauss() { return (Math.random() + Math.random() + Math.random() - 1.5) * 1.15; }
// "Propeller": three loops whose roads all meet in the middle, so the third pass has to climb
// OVER the first bridge (a double ramp). Small wobbles make every one different.
function propellerRaw(M) {
  const raw = [], co = [];
  for (let k = 1; k <= 3; k++) co.push({ k: 2 * k, ax: gauss() * 0.07 / k, bx: gauss() * 0.07 / k, ay: gauss() * 0.07 / k, by: gauss() * 0.07 / k });
  const shift = { x: gauss() * 0.05, y: gauss() * 0.05 }, rot = Math.random() * Math.PI * 2, fat = 0.55 + Math.random() * 0.25;
  for (let s = 0; s < M; s++) {
    const th = (s / M) * Math.PI, c3 = Math.cos(3 * th), r = Math.sign(c3) * Math.pow(Math.abs(c3), fat);
    let x = r * Math.cos(th + rot), y = r * Math.sin(th + rot);
    for (const c of co) { const s1 = Math.sin(c.k * th), c1 = Math.cos(c.k * th); x += c.ax * c1 + c.bx * s1; y += c.ay * c1 + c.by * s1; }
    // nudge each pass through the middle sideways a little, so the three roads cross at three spots
    const mid = Math.exp(-(r * r) / 0.02);
    x += shift.x * mid * Math.cos(2 * th); y += shift.y * mid * Math.sin(2 * th) + 0.06 * mid * Math.sin(th * 2 + 1);
    raw.push([x, y]);
  }
  return raw;
}
// ---- extra-random shapes ----
// "Noodle": a turtle that drives straights, sweepers, hairpins, chicanes and even full spirals,
// then steers back home with a smooth curve. Wild shapes; the rating throws out undrivable ones.
function rawNoodle(M) {
  const P = [[0, 0]]; let x = 0, y = 0, h = Math.random() * Math.PI * 2;
  const step = (len, turn) => {          // drive len units while turning 'turn' radians in total
    const n = Math.max(2, Math.round(len / 4));
    for (let i = 0; i < n; i++) { h += turn / n; x += Math.cos(h) * (len / n); y += Math.sin(h) * (len / n); P.push([x, y]); }
  };
  const pieces = 7 + Math.floor(Math.random() * 9);
  for (let k = 0; k < pieces; k++) {
    const r = Math.random(), side = Math.random() < 0.5 ? -1 : 1;
    if (r < 0.2) step(60 + Math.random() * 160, 0);                                            // straight
    else if (r < 0.45) { const a = 0.5 + Math.random() * 1.6; step(a * (40 + Math.random() * 80), side * a); } // sweeper
    else if (r < 0.62) step(Math.PI * (22 + Math.random() * 14), side * Math.PI);               // hairpin
    else if (r < 0.8) { const a = 0.6 + Math.random() * 0.7, l = 25 + Math.random() * 25; step(l, side * a); step(l * 2, -side * a * 2); step(l, side * a); } // chicane
    else if (r < 0.9) { const a = Math.PI * (1.6 + Math.random() * 0.9); step(a * (45 + Math.random() * 30), side * a); } // spiral: loops over itself (bridge)
    else { for (let j = 0; j < 3 + Math.floor(Math.random() * 3); j++) step(30 + Math.random() * 20, (j % 2 ? -1 : 1) * side * (0.9 + Math.random() * 0.6)); } // snake
  }
  // go home: cubic Hermite from here back to the start, leaving/arriving along the road
  const ex = x, ey = y, dx = -ex, dy = -ey, D = Math.hypot(dx, dy) + 80;
  const t0 = [Math.cos(h) * D, Math.sin(h) * D];
  const h0 = Math.atan2(P[1][1] - P[0][1], P[1][0] - P[0][0]), t1 = [Math.cos(h0) * D, Math.sin(h0) * D];
  const n = Math.max(8, Math.round(D / 4));
  for (let i = 1; i < n; i++) {
    const t = i / n, t2 = t * t, t3 = t2 * t;
    const a = 2 * t3 - 3 * t2 + 1, b = t3 - 2 * t2 + t, c = -2 * t3 + 3 * t2, d = t3 - t2;
    P.push([a * ex + b * t0[0] + d * t1[0], a * ey + b * t0[1] + d * t1[1]]);
  }
  return resampleRaw(P, M);
}
// "Scatter": a smooth closed spline through random points around a wobbly ring
function rawScatter(M) {
  const n = 6 + Math.floor(Math.random() * 10), C = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + (Math.random() - 0.5) * (Math.PI * 2 / n) * 0.9;
    const r = 0.35 + Math.random() * 0.75;
    C.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  const P = [];
  for (let i = 0; i < n; i++) {                  // Catmull-Rom through the points
    const p0 = C[(i - 1 + n) % n], p1 = C[i], p2 = C[(i + 1) % n], p3 = C[(i + 2) % n];
    for (let k = 0; k < 24; k++) {
      const t = k / 24, t2 = t * t, t3 = t2 * t;
      P.push([0, 1].map((j) => 0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3)));
    }
  }
  return resampleRaw(P, M);
}
function resampleRaw(P, M) {
  const L = [0]; for (let i = 1; i <= P.length; i++) L.push(L[i - 1] + Math.hypot(P[i % P.length][0] - P[i - 1][0], P[i % P.length][1] - P[i - 1][1]));
  const tot = L[L.length - 1], out = []; let j = 0;
  for (let k = 0; k < M; k++) {
    const t = (tot * k) / M; while (L[j + 1] < t) j++;
    const a = P[j], b = P[(j + 1) % P.length], u = (t - L[j]) / (L[j + 1] - L[j] || 1);
    out.push([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]);
  }
  return out;
}
function randomStroke(board, propeller) {
  const [BW, BH] = board, M = 420;
  const style = Math.random();
  // what kind of random: classic waves (~30%), noodle (~40%), scatter spline (~15%), wild waves (~15%)
  const kind = propeller ? "classic" : style < 0.3 ? "classic" : style < 0.7 ? "noodle" : style < 0.85 ? "scatter" : "wild";
  const co = [];
  // big slow waves fold the loop over itself (bridges); small fast ones add twisty bits.
  // (fast waves are kept gentle: too strong and the curve gets cusps no car could drive)
  const AMP = kind === "wild" ? [0.5, 0.36, 0.22, 0.13, 0.09, 0.05, 0.035, 0.025] : style < 0.15 ? [0.6, 0.32, 0.15, 0.08, 0.045] : [0.42, 0.3, 0.17, 0.1, 0.05];
  for (let k = 2; k < 2 + AMP.length; k++) {
    const a = AMP[k - 2];
    co.push({ k, ax: gauss() * a, bx: gauss() * a, ay: gauss() * a, by: gauss() * a });
  }
  const eight = kind !== "noodle" && kind !== "scatter" && Math.random() < 0.25;   // figure-eight base shape: always at least one bridge
  const raw = propeller ? propellerRaw(M) : kind === "noodle" ? rawNoodle(M) : kind === "scatter" ? rawScatter(M) : [];
  const wave = !raw.length;
  for (let s = 0; s < M && wave; s++) {
    const th = (s / M) * Math.PI * 2;
    let x = eight ? Math.sin(th) : Math.cos(th), y = eight ? Math.sin(2 * th) * 0.7 : Math.sin(th);
    for (const c of co) { const s1 = Math.sin(c.k * th), c1 = Math.cos(c.k * th); x += c.ax * c1 + c.bx * s1; y += c.ay * c1 + c.by * s1; }
    raw.push([x, y]);
  }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of raw) { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
  const mx = BW * 0.09, my = BH * 0.09;
  // road width: usually one width, sometimes wide/narrow sections that blend into each other
  const base = [110, 130, 130, 150, 175][Math.floor(Math.random() * 5)];
  const vary = Math.random() < 0.45, wa = 35 + Math.random() * 55, wk = 1 + Math.floor(Math.random() * 3), wp = Math.random() * 6.28;
  const pts = raw.map(([x, y], s) => ({
    x: mx + ((x - minX) / (maxX - minX || 1)) * (BW - 2 * mx), y: my + ((y - minY) / (maxY - minY || 1)) * (BH - 2 * my),
    w: clamp(Math.round(base + (vary ? wa * Math.sin(wk * (s / M) * Math.PI * 2 + wp) : 0)), MIN_W, MAX_W),
  }));
  return resample(pts, 8, true).map((p) => [Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10, Math.round(p.w)]);
}
// Is this shape a good, fun track? Bridges must cross at a decent angle, nothing may
// run so close to another part of the track that the roads overlap, and it should twist.
function rateTrack(shape) {
  const W = shape.base, N = W.length;
  const tan = [], hw = W.map((p) => p.w / 2);
  for (let i = 0; i < N; i++) { const a = W[(i - 1 + N) % N], b = W[(i + 1) % N], L = dist(a, b) || 1; tan.push({ x: (b.x - a.x) / L, y: (b.y - a.y) / L }); }
  let length = 0; for (let i = 0; i < N; i++) length += dist(W[i], W[(i + 1) % N]);
  const spacing = length / N;
  const { crossings, maxLevel } = computeElev(W, tan, hw, spacing);
  if (crossings.some((c) => c.sin < 0.5)) return null;                            // too shallow a crossing
  for (let i = 0; i < N; i++) if (circR(W[(i - 2 + N) % N], W[i], W[(i + 2) % N]) < Math.max(70, hw[i] * 0.8)) return null;   // hairpin too tight
  for (let a = 0; a < crossings.length; a++) for (let b = a + 1; b < crossings.length; b++) if (dist(crossings[a], crossings[b]) < 110) return null;
  // near misses: separate bits of road that almost touch without properly crossing
  const grid = segGrid(W, 200);
  for (let i = 0; i < N; i += 2) {
    const p = W[i];
    for (const j of grid.near(p.x, p.y, 420)) {
      let di = Math.abs(i - j); di = Math.min(di, N - di);
      const need = hw[i] + hw[j] + 90;
      if (di * spacing < need * 2.2) continue;                                        // same bit of road
      if (dist(p, W[j]) >= need) continue;
      if (crossings.some((c) => dist(c, p) < need + 110)) continue;                   // it's a proper crossing
      return null;
    }
  }
  let corners = 0, inC = false, twist = 0;
  const kk = Math.max(3, Math.round(240 / spacing));
  for (let i = 0; i < N; i++) {
    const a = tan[(i - kk + N) % N], b = tan[(i + kk) % N];
    const turn = Math.abs(wrapAngle(Math.atan2(b.y, b.x) - Math.atan2(a.y, a.x)));
    if (turn > 0.6 && !inC) { corners++; inC = true; } else if (turn < 0.3) inC = false;
    const t0 = tan[i], t1 = tan[(i + 1) % N]; twist += Math.abs(wrapAngle(Math.atan2(t1.y, t1.x) - Math.atan2(t0.y, t0.x)));
  }
  return { crossings: crossings.length, maxLevel, corners, twist, length };
}
// quick check on the raw drawing: no cusps (spots where the curve nearly stops and turns back)
function strokeOk(st) {
  const n = st.length, P = (i) => { const q = st[(i + n) % n]; return { x: q[0], y: q[1] }; };
  for (let i = 0; i < n; i++) if (circR(P(i - 3), P(i), P(i + 3)) < 27) return false;
  return true;
}
function makeRandomTrack(board) {
  const wantDouble = Math.random() < 0.22;
  let best = null, bestScore = -Infinity, fallback = null;
  const t0 = Date.now();
  for (let tries = 0; tries < 400 && Date.now() - t0 < (best ? 1200 : 3000); tries++) {
    const stroke = randomStroke(board, wantDouble && tries % 3 === 0);
    if (!strokeOk(stroke)) continue;
    const shape = buildTrack(stroke, board);
    if (!shape.error && !fallback) fallback = { stroke, shape };
    if (shape.error) continue;
    const r = rateTrack(shape);
    if (!r || r.crossings > 5) continue;
    let score = Math.min(r.corners, 20) + r.twist * 0.9 + Math.min(r.crossings, 3) * 5 + Math.random() * 10;
    if (r.crossings === 0) score -= 12;
    if (r.maxLevel >= 2) score += wantDouble ? 14 : 3;
    if (score > bestScore) { bestScore = score; best = { stroke, shape }; }
    if (best && tries > 25 && bestScore > (wantDouble ? 40 : 30)) break;
  }
  return best || fallback;
}
// For random tracks: put the start line (and the pit lane) on the longest straight, away from bridges.
function bestStart(shape) {
  const t = finalizeTrack(shape, 0, false, []), N = t.N;
  const before = Math.ceil(900 / t.spacing), after = Math.ceil(700 / t.spacing);
  // how much open space each point has (distance to any OTHER part of the track)
  const W = shape.base, grid = segGrid(W, 200), room = new Array(N).fill(Infinity);
  for (let i = 0; i < N; i += 2) {
    for (const j of grid.near(W[i].x, W[i].y, 600)) {
      let di = Math.abs(i - j); di = Math.min(di, N - di);
      if (di * t.spacing < 900) continue;
      room[i] = Math.min(room[i], dist(W[i], W[j]) - t.hw[i] - t.hw[j]);
    }
    room[(i + 1) % N] = room[i];
  }
  for (const needRoom of [160, 60, -Infinity]) {
    let best = -1, bs = -Infinity;
    for (let s = 0; s < N; s += 2) {
      let ok = true, score = 0;
      for (let d = -before; d <= after && ok; d++) {
        const i = (s + d + N) % N;
        if (t.elev[i] > 0 || room[i] < needRoom) ok = false;
        score += t.vmax[i] * (d <= 4 ? 1 : 0.4) + Math.min(room[i], 300) * 0.1;
      }
      if (ok && score > bs) { bs = score; best = s; }
    }
    if (best >= 0) return best;
  }
  return 0;
}

// Staggered grid like real racing: every car is half a row behind the one in front (pole is
// really first), left/right alternating, 60px between slots (less on a short track with a huge grid).
// The client draws the grid boxes with the same maths (gridSlotC in index.html).
function gridSlot(t, g, total) {
  const gap = clamp((t.length * 0.85 - 70) / Math.max(1, total), 34, 60);
  const idx = (t.N - Math.round((70 + g * gap) / t.spacing) + t.N * 4) % t.N;
  return { idx, lat: (g % 2 ? 1 : -1) * Math.min(28, t.hw[idx] - 20) };
}

// ======================= Rooms =======================
const rooms = new Map();
function makeCode() {
  const L = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  let c; do { c = Array.from({ length: 4 }, () => L[Math.floor(Math.random() * L.length)]).join(""); } while (rooms.has(c));
  return c;
}
function cleanProfile(p) {
  const name = typeof p?.name === "string" ? p.name.trim().slice(0, 12) : "";
  return {
    name: name || "Racer",
    color: HEX.test(p?.color) ? p.color : "#ffcc1f",
    livery: LIVERIES.includes(p?.livery) ? p.livery : "stripes",
    number: clamp(Math.round(Number(p?.number) || 7), 0, 99),
    team: cleanTeam(p?.team) || `${name || "Racer"} Racing`,
    design: typeof p?.design === "string" && DESIGN.test(p.design) && /[0-9a-f]/.test(p.design) ? p.design : null,
  };
}
function cleanTeam(t) { return typeof t === "string" ? t.trim().replace(/\s+/g, " ").slice(0, 20) : ""; }
function parsePoints(v) {
  const arr = (Array.isArray(v) ? v : String(v || "").split(/[,\s]+/)).map((x) => Math.round(Number(x))).filter((x) => Number.isFinite(x) && x >= 0);
  return arr.slice(0, 80).map((x) => Math.min(999, x));
}
const NEAR_O = [], NEAR_D = [];
const BK = 8;     // cars are sorted into buckets of 8 track points so drivers only look at nearby cars

class Room {
  constructor(code, isPublic) {
    this.code = code;
    this.public = !!isPublic;
    this.players = new Map();   // socket id -> team boss
    this.hostId = null;
    this.phase = "lobby";       // lobby | tires | lights | race | results
    this.settings = { laps: 5, ai: 5, map: "normal", theme: "grass", speed: 1, wear: "normal", points: DEFAULT_POINTS.slice(), teamColors: false, weather: "sunny", teams: true, xpRate: XP_RATE_DEFAULT, season: 0, smooth: false, quali: 0, aiLevel: "medium" };
    this.trackKind = null; this.trackName = null;
    this.stroke = null; this.track = null;
    this.champ = {};
    this.teamChamp = {};
    this.roster = [];
    this.ensureRoster(this.settings.ai);
    this.raceNo = 0;
    this.history = [];          // championship standings after every race of this season (for the finale)
    this.seasonColors = { drivers: {}, teams: {} };
  }
  resetSeason() { this.champ = {}; this.teamChamp = {}; this.raceNo = 0; this.history = []; this.seasonColors = { drivers: {}, teams: {} }; }
  emit(ev, d) { io.to(this.code).emit(ev, d); }
  hostName() { return this.players.get(this.hostId)?.name || "Someone"; }
  lobbyMsg() {
    return {
      code: this.code, hostId: this.hostId, phase: this.phase, settings: this.qualifying ? { ...this.settings, laps: this.realLaps } : this.settings, raceNo: this.raceNo, public: this.public, hasLastSeason: !!this.lastSeason,
      players: [...this.players.values()].map((p) => ({ id: p.id, name: p.name, color: p.color, livery: p.livery, number: p.number, level: p.level, team: p.team, design: p.design, gridPos: p.gridPos || 0, extras: p.extras || null, signedIn: !!p.uid, spectator: !!p.spectator })),
      trackName: this.trackName,
      stroke: this.stroke, champ: this.champOrder(), teamChamp: this.teamOrder(),
      roster: this.roster.slice(0, this.settings.ai),
    };
  }
  sendLobby() { this.emit("lobby", this.lobbyMsg()); menuDirty = true; }
  ensureRoster(n) {
    while (this.roster.length < n) {
      const i = this.roster.length, round = Math.floor(i / AI_NAMES.length);
      this.roster.push({
        name: AI_NAMES[i % AI_NAMES.length] + (round ? ` ${round + 1}` : ""),
        number: (10 + i * 7) % 90 + 10 > 99 ? i % 99 : (10 + i * 7) % 90 + 10,
        team: AI_TEAMS[Math.floor(i / 2) % AI_TEAMS.length] + (i >= AI_TEAMS.length * 2 ? ` ${Math.floor(i / (AI_TEAMS.length * 2)) + 1}` : ""),
        color: AI_COLORS[i % AI_COLORS.length], livery: LIVERIES[(i * 3 + 1) % LIVERIES.length],
      });
    }
  }
  champOrder() { return Object.entries(this.champ).map(([n, p]) => ({ n, p })).sort((a, b) => b.p - a.p); }
  teamOrder() { return Object.entries(this.teamChamp).map(([n, p]) => ({ n, p })).sort((a, b) => b.p - a.p); }

  addPlayer(socket, profile) {
    const p = { id: socket.id, ...cleanProfile(profile), up: blankUp(), level: 1, xp: 0, pendingPicks: 0, offer: null, nitroHeld: false, uid: socket.data.uid || null, extras: socket.data.extras || null };
    this.players.set(socket.id, p);
    if (!this.hostId) this.hostId = socket.id;
    socket.leave("menu"); socket.join(this.code); socket.data.room = this.code;
    socket.emit("joined", { code: this.code, you: socket.id, upgrades: upgradeInfo(), f1: f1List() });
    this.sendLobby();
    if (this.track) socket.emit("track", this.trackMsg());
    if (this.draft) socket.emit("draft", this.draft);
    if (this.phase !== "lobby") {
      // a race is on: watch it live, you'll be on the grid for the next one
      if (this.cars && this.lastRaceMsg && ["race", "lights", "tires"].includes(this.phase)) socket.emit("race", this.lastRaceMsg);
      socket.emit("toast", "A race is on! Watching it now, you'll be on the grid for the next one.");
    }
  }
  removePlayer(id) {
    const p = this.players.get(id);
    this.players.delete(id);
    if (this.cars) { const c = this.cars.find((c) => c.owner === id); if (c) { c.owner = null; c.name = c.name + " (AI)"; } }
    if (this.hostId === id) this.hostId = this.players.keys().next().value || null;
    menuDirty = true;
    if (!this.players.size) { rooms.delete(this.code); return; }
    if (p) this.emit("toast", `${p.name} left`);
    this.sendLobby();
  }
  trackMsg() {
    const t = this.track;
    return { pts: t.pts.map((p) => ({ x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 })), tan: t.tan, nor: t.nor, N: t.N, W: t.W, H: t.H, length: t.length, trackW: t.trackW, theme: this.settings.theme,
      hw: t.hw.map((v) => Math.round(v * 10) / 10), line: t.line.map((v) => Math.round(v)), gravel: t.gravel, pitLane: t.pitLane, minX: t.minX, minY: t.minY, pad: t.pad, scale: SCALE, reverse: t.reverse,
      elev: t.elev.map((v) => Math.round(v * 100) / 100), bridges: t.bridges, maxLevel: t.maxLevel, vmax: t.vmax.map((v) => Math.round(v)), name: this.trackName };
  }
  allTeams() { return [...[...this.players.values()].map((p) => p.team), ...this.roster.slice(0, this.settings.ai).map((r) => r.team)]; }
  rebuildTrack(start, reverse) {
    this.track = finalizeTrack(this.shape, start, reverse, this.allTeams());
    this.emit("track", this.trackMsg()); this.sendLobby();
  }
  setStart(bx, by) {
    if (!this.track) return;
    const t = this.track, wx = (bx - t.minX) * SCALE + t.pad, wy = (by - t.minY) * SCALE + t.pad;
    let best = 0, bd = Infinity;
    t.pts.forEach((p, i) => { const d = (p.x - wx) ** 2 + (p.y - wy) ** 2; if (d < bd) { bd = d; best = i; } });
    if (Math.sqrt(bd) > TRACK_W * 3) return "Click on the track to move the start line.";
    this.rebuildTrack(t.order[best], t.reverse);
    return null;
  }
  setTrack(stroke, map, kind = "drawn", name = null) {
    const board = MAP_SIZES[map] || MAP_SIZES.normal;
    const shape = buildTrack(stroke, board, this.settings.smooth);
    if (shape.error) return shape.error;
    this.shape = shape; this.trackKind = kind; this.trackName = name; this.draft = null; this.trackId = null;
    // a short fingerprint of the drawing, so personal bests are kept per track (same track = same key)
    { let h = 2166136261; for (let i = 0; i < Math.min(stroke.length, 8000); i += 3) { h = Math.imul(h ^ Math.round(Number(stroke[i]?.[0]) || 0), 16777619); h = Math.imul(h ^ Math.round(Number(stroke[i]?.[1]) || 0), 16777619); } this.trackKey = "d" + (h >>> 0).toString(36) + "_" + map; }
    this.trackBy = kind === "drawn" ? this.players.get(this.hostId)?.uid || null : null;   // for the "Architect" achievement
    // random and real tracks put the start line on their best straight; drawn ones start where you started drawing
    this.track = finalizeTrack(shape, kind === "drawn" ? 0 : bestStart(shape), false, this.allTeams());
    this.stroke = stroke.slice(0, 8000).map((q) => [Math.round(q[0] * 10) / 10, Math.round(q[1] * 10) / 10, Math.round(clamp(Number(q[2]) || TRACK_W, MIN_W, MAX_W))]);
    this.settings.map = MAP_SIZES[map] ? map : "normal";
    this.emit("track", this.trackMsg());
    this.sendLobby();
    return null;
  }
  setRandomTrack(map) {
    const board = MAP_SIZES[map] || MAP_SIZES.normal;
    const r = makeRandomTrack(board);
    if (!r) return "Couldn't make a random track. Try again!";
    if (!this.settings.smooth) {
      this.shape = r.shape; this.trackKind = "random"; this.trackName = null; this.draft = null;
      this.track = finalizeTrack(r.shape, bestStart(r.shape), false, this.allTeams());
      this.stroke = r.stroke.map((q) => [q[0], q[1], q[2]]);
      this.settings.map = MAP_SIZES[map] ? map : "normal";
      this.emit("track", this.trackMsg()); this.sendLobby();
      return null;
    }
    return this.setTrack(r.stroke, map, "random");
  }
  // A real F1 circuit, sized by its real length (Monaco is short, Spa is long) on the
  // smallest map it fits.
  setF1Track(id) {
    const tr = F1_TRACKS.find((t) => t.id === id);
    if (!tr) return "Unknown track";
    let Ln = 0; for (let i = 0; i < tr.pts.length; i++) { const a = tr.pts[i], b = tr.pts[(i + 1) % tr.pts.length]; Ln += Math.hypot(b[0] - a[0], b[1] - a[1]); }
    let s = (tr.km * 4200 / SCALE) / Ln, map = "huge";
    for (const m of ["normal", "large", "huge"]) { const [BW, BH] = MAP_SIZES[m]; if (tr.w * s <= BW * 0.9 && tr.h * s <= BH * 0.9) { map = m; break; } }
    const [BW, BH] = MAP_SIZES[map];
    s = Math.min(s, BW * 0.9 / tr.w, BH * 0.9 / tr.h);
    const ox = (BW - tr.w * s) / 2, oy = (BH - tr.h * s) / 2;
    const err = this.setTrack(tr.pts.map(([x, y]) => [ox + x * s, oy + y * s, TRACK_W]), map, "f1", tr.name);
    if (!err) { this.trackId = tr.id; this.trackKey = "f1_" + tr.id; }
    return err;
  }
  // "Smooth track" switched on/off: rebuild the current track from the same drawing
  rebuildSmooth() {
    if (!this.stroke || !this.track) return;
    const rev = this.track.reverse;
    this.setTrack(this.stroke, this.settings.map, this.trackKind || "drawn", this.trackName);
    if (rev) this.rebuildTrack(this.track.start, true);
  }

  // ======================= Race =======================
  startRace() {
    if (!this.track || this.phase !== "lobby") return;
    const t = this.track, s = this.settings;
    // qualifying first? (a timed session, fastest lap = pole). The race after it uses that grid.
    const grid = this.qualiGrid; this.qualiGrid = null;
    this.qualifying = s.quali > 0 && !grid;
    this.paused = false;
    const humans = [...this.players.values()].filter((p) => !p.spectator);   // spectators just watch
    for (const h of humans) {
      h.level = 1; h.xp = 0; h.up = blankUp(); h.pendingPicks = 0; h.offer = null; h.nitroHeld = false;
      io.to(h.id).emit("offerCleared");
    }
    const aiCount = clamp(s.ai, 0, MAX_AI);
    this.ensureRoster(aiCount);
    const total = humans.length + aiCount;
    if (!this.qualifying) this.raceNo++;
    this.cars = [];
    // grid: the host can put any player in any grid spot; everyone else fills in
    // (AI at the front, players without a set spot at the back so there's someone to chase)
    const order = new Array(total).fill(null);
    for (const h of humans.filter((h) => h.gridPos > 0).sort((a, b) => a.gridPos - b.gridPos)) {
      let i = clamp(h.gridPos - 1, 0, total - 1); while (order[i]) i = (i + 1) % total; order[i] = { human: h };
    }
    // random spot (-1): any free slot on the whole grid, rolled again every race
    for (const h of humans.filter((h) => h.gridPos === -1).sort(() => Math.random() - 0.5)) {
      const free = order.map((o, i) => (o ? -1 : i)).filter((i) => i >= 0);
      order[free[Math.floor(Math.random() * free.length)]] = { human: h };
    }
    let rest = [...Array.from({ length: aiCount }, (_, a) => ({ ai: a })), ...humans.filter((h) => !(h.gridPos > 0) && h.gridPos !== -1).map((h) => ({ human: h }))];
    if (grid) {
      // grid from qualifying: everyone in their qualifying order, anyone new at the back
      order.fill(null);
      const all = [...Array.from({ length: aiCount }, (_, a) => ({ ai: a })), ...humans.map((h) => ({ human: h }))];
      const key = (sl) => (sl.human ? "h:" + sl.human.id : "a:" + sl.ai);
      const byKey = new Map(all.map((sl) => [key(sl), sl]));
      let i = 0;
      for (const k of grid) { const sl = byKey.get(k); if (sl) { order[i++] = sl; byKey.delete(k); } }
      rest = [...byKey.values()];
    }
    for (let i = 0; i < total; i++) if (!order[i]) order[i] = rest.shift();
    const DL = AI_LEVELS[s.aiLevel] || AI_LEVELS.medium;
    order.forEach((slot, g) => {
      const { idx, lat } = gridSlot(t, g, total);
      const p = t.pts[idx], n = t.nor[idx], tn = t.tan[idx];
      const base = {
        slotKey: slot.human ? "h:" + slot.human.id : "a:" + slot.ai,
        id: g + 1, x: p.x + n.x * lat, y: p.y + n.y * lat, heading: Math.atan2(tn.y, tn.x), vx: 0, vy: 0,
        idx, lat, tOff: 0, lapsDone: -1, progress: 0, finished: false, finishTime: 0, lapStart: 0, bestLap: Infinity, pits: 0,
        tire: 1, onTrack: true, inPit: false, pitting: 0, pitTotal: 0, mistakeT: 0, mistakeDir: 1, spin: 0, crashT: 0, damage: 0,
        passOff: 0, passT: 0, gridLane: lat, lineJit: (Math.random() - 0.5) * 12, pitAt: 0.22 + Math.random() * 0.12, aiMode: "race", stuck: 0, reverseT: 0,
        cleanLap: true, launchAt: 0, boostUntil: 0, slide: 0, speed: 0, surface: 0, punct: false, compound: "inter", laneKey: 0,
        rs: { overtakes: 0, crashes: 0, cleanLaps: 0, slips: 0, boostSec: 0, maxWet: 0, usedWets: false, grid: g + 1 },
        nitro: 1, nitroOn: false, regenT: 0, aiNitro: false, slip: false, yawMax: STEER_LOCK, gripF: 1, chase: false, attack: false,
        aggr: 0.8 + Math.random() * 0.5, nitroMin: 0.25 + Math.random() * 0.25, power: 1,
      };
      if (slot.human) {
        const h = slot.human;
        Object.assign(base, { owner: h.id, name: h.name, color: h.color, livery: h.livery, number: h.number, up: h.up, skill: 0.92, team: h.team, aggr: 1.1 });
        h.boxCall = false; h.reaction = null; h.jump = false; h.lastPos = total; h.passCd = new Map(); h.lostCd = new Map();
        h.compound = null; h.nextCompound = null; h.passiveAt = 1; h.warned = 0;
      } else {
        const a = slot.ai, R = this.roster[a];
        Object.assign(base, {
          owner: null, name: R.name, color: R.color, livery: R.livery, number: R.number, team: R.team, up: blankUp(),
          // rivals get sharper as the season goes on and as the teams level up
          skill: DL.skill[0] + Math.random() * (DL.skill[1] - DL.skill[0]) + Math.min(0.06, (this.raceNo - 1) * 0.006) + this.avgLevel() * 0.004,
          power: DL.power - 0.015 + Math.random() * 0.03 + Math.min(0.05, this.avgLevel() * 0.006),
          aiReaction: DL.react[0] + Math.random() * (DL.react[1] - DL.react[0]),
          aggr: (0.8 + Math.random() * 0.5) * DL.aggr, aiMist: DL.mistakes,
          // AI teams level up during the race too (they don't get lap/pass bonuses, so a bit more per second)
          aiXp: 0, aiLvl: 1, aiXpAt: 1, aiXpMul: DL.xp * (0.87 + Math.random() * 0.26),
        });
      }
      this.cars.push(base);
    });
    // teams switched off: every driver is on their own (own garage, no team points)
    if (!s.teams) for (const c of this.cars) c.team = `${c.name} #${c.number}`;
    if (s.teamColors && s.teams) {
      const paint = {};
      for (const c of [...this.cars].sort((a, b) => (b.owner ? 1 : 0) - (a.owner ? 1 : 0))) {
        if (!paint[c.team]) paint[c.team] = { color: c.color, livery: c.livery };
        else Object.assign(c, paint[c.team]);
      }
    }
    this.time = 0; this.fastest = Infinity; this.finishDeadline = Infinity;
    // "calm zone": everyone stays in line until the field is through the first corner
    let fc = -1;
    for (let i = 0; i < t.N; i++) if (t.vmax[i] < MAX_SPEED * 0.8) { fc = i; break; }
    let fcEnd = fc < 0 ? Math.round(t.N / 5) : fc;
    while (fc >= 0 && fcEnd < t.N - 1 && t.vmax[fcEnd] < MAX_SPEED * 0.9) fcEnd++;
    this.calmEnd = Math.min(t.N * 0.6, fcEnd + 6);
    this.wearPerLap = 1 / tireLifeLaps(s.laps);
    this.bucket = Math.max(1, Math.floor(t.N / 60));
    for (const c of this.cars) { c.cp = new Map(); c.st = this.stats(c); }
    assignBoxes(t.pitLane, this.cars.map((c) => c.team));
    this.emit("track", this.trackMsg());
    this.initWeather();
    if (this.qualifying) {
      this.realLaps = s.laps; s.laps = 999;       // nobody "finishes" a qualifying session
      this.qualiEnd = s.quali * 60;
    }
    this.phase = "tires";
    this.tiresUntil = Date.now() + TIRE_PICK_TIME;
    this.emit("race", this.lastRaceMsg = { cars: this.cars.map((c) => ({ id: c.id, name: c.name, color: c.color, livery: c.livery, number: c.number, owner: c.owner, team: c.team, design: c.owner ? this.players.get(c.owner)?.design || null : null, extras: c.owner ? this.players.get(c.owner)?.extras || null : null })), laps: s.laps, raceNo: this.raceNo, speed: s.speed, quali: this.qualifying ? s.quali * 60 : 0 });
    for (const p of this.players.values()) this.resendOffer(p);
    if (this.qualifying) { this.sendLobby(); this.startLights(); return; }     // no tire pick: everyone goes out on the best tire
    this.emit("tirePick", { until: TIRE_PICK_TIME, raining: this.raining, weather: s.weather, compounds: COMPOUNDS, perLap: this.perLapAll() });
    this.sendLobby();
  }
  avgLevel() { const ps = [...this.players.values()]; return ps.length ? ps.reduce((a, p) => a + p.level - 1, 0) / ps.length : 0; }
  carOf(id) { return this.cars && this.cars.find((c) => c.owner === id); }

  react(p, ms) {
    if (this.phase !== "lights" && this.phase !== "race") return;
    if (p.reaction !== null) return;
    const c = this.carOf(p.id); if (!c) return;
    ms = Number(ms);
    if (!Number.isFinite(ms)) return;
    if (ms < 0) {
      p.reaction = -1; p.jump = true;
      io.to(p.id).emit("startResult", { jump: true });
      this.emit("feed", { t: "jump", name: c.name });
    } else {
      p.reaction = clamp(ms, 80, 2000);
      const good = p.reaction < 300;
      io.to(p.id).emit("startResult", { ms: Math.round(p.reaction), good });
      if (good) this.addXp(p, 50, `Rocket start! ${Math.round(p.reaction)}ms +50 XP`);
      else if (p.reaction < 450) this.addXp(p, 20, `Good start +20 XP`);
    }
    if (this.phase === "race") this.applyLaunch(c, p);
  }
  applyLaunch(c, p) {
    if (p.jump) { c.launchAt = 3.0; c.boostUntil = 0; return; }
    if (p.reaction === null) { c.launchAt = 1.2; return; }
    c.launchAt = Math.max(this.time, p.reaction / 1000);
    c.boostUntil = c.launchAt + clamp(0.9 - p.reaction / 700, 0, 0.8);
  }
  launchCars() {
    for (const c of this.cars) {
      const p = c.owner && this.players.get(c.owner);
      if (p) this.applyLaunch(c, p); else c.launchAt = c.aiReaction;
    }
  }
  // what a car's upgrades add up to
  stats(c) {
    const u = c.up, e = 1 + 0.03 * (u.enhance || 0);        // Enhancer: +3% per level to everything below
    const base = this.baseStats(c, u);
    if (e === 1) return base;
    return { ...base, maxSpeed: base.maxSpeed * e, accel: base.accel * e, grip: base.grip * e, wear: base.wear / e, brake: base.brake * e,
      pitTime: base.pitTime / e, cornerPace: base.cornerPace * e, gripMul: base.gripMul * e, planBrake: base.planBrake * e,
      slipTime: base.slipTime * e, nitroPow: base.nitroPow * e, nitroDrain: base.nitroDrain / e, nitroRefill: base.nitroRefill * e,
      pitLimit: base.pitLimit * e, mistakes: base.mistakes / e };
  }
  baseStats(c, u) {
    return {
      maxSpeed: MAX_SPEED * (1 + 0.07 * u.engine) * (c.power || 1), accel: ACCEL * (1 + 0.25 * u.turbo), grip: GRIP * (1 + 0.15 * u.grip),
      wear: Math.pow(0.85, u.whisper), brake: BRAKE * (1 + 0.3 * u.brakes),
      pitTime: PIT_TIME * Math.pow(0.75, u.pit),
      cornerPace: 1 + 0.06 * u.corner + 0.02 * u.late + 0.02 * u.grip,
      gripMul: 1 + 0.15 * u.grip,
      planBrake: BRAKE * (1 + 0.3 * u.brakes) * (0.72 + 0.055 * u.late),   // drivers plan to use 72% of the brakes (Late Braker: up to 94%)
      slipTime: SLIP_TIME + 0.1 * u.craft,
      nitroPow: NITRO_POWER, nitroDrain: NITRO_DRAIN * (1 - 0.03 * (u.saver || 0)), nitroRefill: NITRO_LAP_REFILL + 0.05 * u.refill,
      pitLimit: PIT_LIMIT * (1 + 0.25 * u.pitlane),
      mistakes: Math.pow(0.6, u.focus),
    };
  }
  perLap(key) {
    const C = COMPOUNDS[key];
    const k = key === "wet" ? C.dryWear + (C.wear - C.dryWear) * clamp(this.wet * 1.6, 0, 1) : C.wear;
    return this.wearPerLap * WEAR_LEVELS[this.settings.wear] * k;
  }
  perLapAll() { return Object.fromEntries(COMPOUND_KEYS.map((k) => [k, Math.round(this.perLap(k) * 1000) / 1000])); }
  // How many laps a tire set lasts for this car (real driving wears a bit extra).
  lifeLaps(c, k) {
    const C = COMPOUNDS[k], wear = k === "wet" && this.wet < 0.3 ? C.dryWear : C.wear;
    return 1 / (this.wearPerLap * WEAR_LEVELS[this.settings.wear] * wear * (c.st ? c.st.wear : 1) * 1.12);
  }
  // laps a set can safely do in a plan (a little margin for traffic and slides)
  safeLaps(c, k) { return this.lifeLaps(c, k) * 0.86 + 0.15; }
  // AI race strategy: for the laps that are left, try 0-3 more stops and pick the plan that
  // loses the least time (pit stop time vs. running slower, longer-lasting tires). Sets the
  // tire for this stint and the lap to pit on (with a little variety between drivers).
  aiPlan(c) {
    // (in the pit lane you haven't crossed the line yet, but that lap is as good as done)
    const beforeLine = c.lapsDone >= 0 && c.idx >= this.track.pitLane.entry;
    const laps = this.settings.laps, done = Math.max(0, c.lapsDone + (beforeLine ? 1 : 0)), R = laps - done;
    if (R <= 0) { c.planComp = c.compound || "inter"; c.stintEnd = laps; return; }
    if (this.wet > 0.45) { c.planComp = "wet"; c.stintEnd = laps; return; }
    const lapT = this.track.length / (MAX_SPEED * 0.62), pitLoss = PIT_TIME * Math.pow(0.75, c.up.pit) + 5;
    let best = null;
    for (let stops = 0; stops <= 3; stops++) {
      const stint = Math.ceil(R / (stops + 1));
      const k = ["fast", "inter", "durable"].find((key) => this.safeLaps(c, key) >= stint);
      if (!k) continue;
      const cost = stops * pitLoss + R * lapT * (1.05 - COMPOUNDS[k].speed) + (Math.random() - 0.5) * lapT * 0.03;
      if (!best || cost < best.cost) best = { stops, k, stint, cost };
    }
    if (!best) { const L = Math.max(1, this.safeLaps(c, "durable")); best = { stops: Math.ceil(R / L) - 1, k: "durable", stint: L }; }
    c.planComp = best.k; c.stopsLeft = best.stops;
    if (best.stops === 0) { c.stintEnd = laps; return; }
    // whole laps: run this set as long as it safely lasts, but leave a remainder the next set(s) can cover
    const fMax = Math.max(1, Math.floor(this.safeLaps(c, best.k)));
    const restMax = Math.max(1, Math.floor(this.safeLaps(c, "durable"))) * best.stops;
    let f = Math.min(fMax, R - 1);
    if (f > 1 && Math.random() < 0.3 && R - (f - 1) <= restMax) f--;          // some drivers stop a lap early
    c.stintEnd = done + clamp(Math.max(f, R - restMax), 1, R - 1);
  }
  startLights() {
    for (const c of this.cars) {
      const p = c.owner && this.players.get(c.owner);
      if (!p) this.aiPlan(c);
      c.compound = p ? (p.compound || (this.wet > 0.45 ? "wet" : "inter")) : c.planComp;
      if (this.qualifying) { c.compound = this.wet > 0.45 ? "wet" : "fast"; c.stintEnd = Infinity; c.stopsLeft = 0; }
      if (p) { p.compound = c.compound; if (!p.nextCompound) p.nextCompound = c.compound; }
    }
    this.phase = "lights";
    const now = Date.now();
    this.lightsStart = now; this.outAt = now + 5000 + 400 + Math.random() * 2000; this.lightsShown = 0;
    this.emit("lightsBegin", { compounds: Object.fromEntries(this.cars.map((c) => [c.id, c.compound])) });
  }
  pickCompound(p, key) {
    if (!COMPOUNDS[key]) return;
    if (this.phase === "tires") {
      p.compound = key;
      const humans = this.cars.filter((c) => c.owner);
      if (humans.every((c) => this.players.get(c.owner)?.compound)) this.tiresUntil = Math.min(this.tiresUntil, Date.now() + 800);
    } else p.nextCompound = key;
  }

  tick() {
    if (this.phase === "tires") { if (Date.now() >= this.tiresUntil) this.startLights(); return; }
    if (this.phase === "lights") {
      const now = Date.now();
      const n = Math.min(5, Math.floor((now - this.lightsStart) / 1000));
      if (n > this.lightsShown) { this.lightsShown = n; this.emit("lights", { n }); }
      if (now >= this.outAt) { this.phase = "race"; this.emit("lightsOut", {}); this.launchCars(); }
      else return;
    }
    if (this.phase !== "race") return;
    if (this.paused) { if (!this.players.has(this.hostId)) this.setPaused(false); else return; }
    const steps = 2 * this.settings.speed;
    for (let s = 0; s < steps && this.phase === "race"; s++) this.step(1 / 60);
  }

  step(dt) {
    this.time += dt;
    const t = this.track;
    this.stepWeather(dt);
    // passive XP every race-second your driver is out there (host picks 10-50)
    const rate = this.settings.xpRate;
    for (const p of this.players.values()) {
      const c = this.carOf(p.id); if (!c || c.finished) continue;
      if (this.time >= p.passiveAt) { p.passiveAt += 1; this.addXp(p, rate, null); }
    }
    // AI teams level up and pick upgrades too
    for (const c of this.cars) {
      if (c.owner || c.retiredBy || c.finished || c.aiXpAt === undefined || this.time < c.aiXpAt) continue;
      c.aiXpAt += 1; c.aiXp += rate * c.aiXpMul;
      while (c.aiXp >= xpForLevel(c.aiLvl)) { c.aiXp -= xpForLevel(c.aiLvl); c.aiLvl++; this.aiUpgrade(c); }
    }
    this.buildBuckets();
    this.stepNo = (this.stepNo || 0) + 1;
    for (const c of this.cars) {
      if (!c.st || (this.stepNo & 15) === 0) c.st = this.stats(c);
      if (this.time < c.launchAt) { c.vx = c.vy = 0; c.speed = 0; continue; }
      // drivers think 30 times a second (half the cars on each step), the car physics runs every step
      if (!c.input || ((this.stepNo + c.id) & 1) === 0) c.input = this.drive(c, c.input ? dt * 2 : dt);
      this.physics(c, c.input, dt);
      this.trackPos(c);
      if (c.owner && !c.onTrack && !c.inPit) c.cleanLap = false;
    }
    this.collide();
    const order = this.standings();
    for (let i = 0; i < order.length; i++) order[i].ahead = i ? order[i - 1] : null;
    // AI drivers get the overtake boost too
    for (let i = 0; i < order.length; i++) {
      const c = order[i]; if (c.owner || c.finished || this.qualifying) { c.lastPos = i + 1; continue; }
      if (c.lastPos && i + 1 < c.lastPos && !order.slice(i + 1, c.lastPos).some((r) => r.pitting || r.inPit) && this.time > 5) c.nitro = Math.min(1, c.nitro + OVERTAKE_BOOST * (c.lastPos - i - 1));
      c.lastPos = i + 1;
    }
    for (const p of this.players.values()) {
      const c = this.carOf(p.id); if (!c || c.finished || this.qualifying) continue;
      const pos = order.indexOf(c) + 1;
      if (pos < p.lastPos) {
        for (let i = pos; i < p.lastPos; i++) {
          const rival = order[i];
          if (this.time > 4 && this.time - (p.passCd.get(rival.id) || -99) > 8) {       // (not the grid shuffle at the start)
            p.passCd.set(rival.id, this.time);
            c.nitro = Math.min(1, c.nitro + OVERTAKE_BOOST);          // every overtake: +10% boost
            if (c.rs) c.rs.overtakes++;
            this.addXp(p, 55, `${c.name} passed ${rival.name}! +55 XP ⚡+10%`);
          }
        }
      } else if (pos > p.lastPos) {
        const by = order[pos - 2];
        if (by && this.time > 5 && this.time - (p.lostCd.get(by.id) || -99) > 8 && !c.pitting && c.aiMode !== "pitLane" && c.aiMode !== "pitOut") {
          p.lostCd.set(by.id, this.time); io.to(p.id).emit("toast", `${by.name} got past ${c.name}`);
        }
      }
      p.lastPos = pos;
    }
    if (this.qualifying) { if (this.time >= this.qualiEnd) this.endQuali(); return; }
    // (with only spectators in the room, the race runs until the AI have all finished)
    const humansLeft = this.cars.some((c) => c.owner) ? this.cars.some((c) => c.owner && !c.finished) : !this.cars.every((c) => c.finished);
    if (!humansLeft || this.time > this.finishDeadline) this.endRace();
  }
  // ---- weather: a hidden rain strength that drifts around, with the odd shower or cloudburst ----
  initWeather() {
    const w = this.settings.weather;
    this.rain = w === "rain" ? 0.8 : w === "dynamic" && Math.random() < 0.3 ? 0.5 + Math.random() * 0.4 : 0;
    this.rainGoal = this.rain;
    this.raining = this.rain > 0.28;
    this.wet = this.raining ? clamp(0.6 + this.rain * 0.35, 0, 1) : 0;
    this.nextFront = w === "dynamic" ? 12 + Math.random() * 40 : Infinity;
    this.trend = 0; this.trendShown = 0; this.trendAt = 0;
  }
  stepWeather(dt) {
    const w = this.settings.weather;
    if (w === "rain") this.rainGoal = clamp(this.rainGoal + (Math.random() - 0.5) * 0.4 * dt, 0.55, 1);
    if (this.time > this.nextFront) {
      // a new weather front: could be anything, and it doesn't have to be the opposite of now
      const r = Math.random();
      this.rainGoal = r < 0.42 ? Math.random() * 0.15 : r < 0.7 ? 0.25 + Math.random() * 0.3 : r < 0.9 ? 0.55 + Math.random() * 0.3 : 0.85 + Math.random() * 0.15;
      this.nextFront = this.time + 10 + Math.random() * 55;
      if (Math.random() < 0.25) this.nextFront = this.time + 4 + Math.random() * 8;   // a quick shower, or a quick break
    }
    // rain strength eases toward the goal with some wobble; the track follows (soaks fast, dries slowly)
    this.rain = clamp(this.rain + (this.rainGoal - this.rain) * 0.12 * dt + (Math.random() - 0.5) * 0.06 * Math.sqrt(dt), 0, 1);
    const eq = this.rain < 0.12 ? 0 : clamp(0.2 + this.rain * 0.85, 0, 1);
    this.wet = clamp(this.wet + (eq - this.wet) * (eq > this.wet ? 0.07 : 0.028) * dt, 0, 1);
    const was = this.raining;
    this.raining = this.raining ? this.rain > 0.2 : this.rain > 0.3;
    if (was !== this.raining) this.emit("feed", { t: this.raining ? "rain" : "dry" });
    // the forecast bar: where things are heading, blurred on purpose (noisy, lags, only 7 steps)
    this.trend += ((this.rainGoal - this.rain) * 0.6 + (eq - this.wet) * 0.8 - this.trend) * 0.15 * dt;
    if (this.time >= this.trendAt) {
      this.trendAt = this.time + 3 + Math.random() * 4;
      const noisy = this.trend + (Math.random() - 0.5) * 0.3;
      this.trendShown = clamp(Math.round(noisy * 6), -3, 3);
    }
  }
  setPaused(on) {
    if (this.phase !== "race" && on) return;
    this.paused = !!on;
    this.emit("paused", { on: this.paused, by: this.players.get(this.hostId)?.name || "Host" });
  }
  // ---- qualifying over: fastest lap first, the race grid is set ----
  endQuali() {
    const order = this.standings();
    const pole = order[0] && isFinite(order[0].bestLap) ? order[0].bestLap : 0;
    const rows = order.map((c) => ({ name: c.name, team: this.settings.teams ? c.team : "", color: c.color, owner: c.owner || null, best: isFinite(c.bestLap) ? c.bestLap : null, gap: isFinite(c.bestLap) && pole ? c.bestLap - pole : null }));
    this.qualiGrid = order.map((c) => c.slotKey);
    const poleP = order[0]?.owner && this.players.get(order[0].owner);
    if (poleP?.uid && order.length >= 3) accounts.getUser(poleP.uid).then((u) => { if (!u) return; const got = accounts.bump(u, "poles"); io.to(poleP.id).emit("account", accounts.publicUser(u)); for (const a of got) io.to(poleP.id).emit("achievement", a); }).catch(() => {});
    this.settings.laps = this.realLaps ?? this.settings.laps; this.realLaps = null;
    this.qualifying = false; this.paused = false;
    this.phase = "qualiResults"; this.cars = null;
    for (const p of this.players.values()) { p.offer = null; p.pendingPicks = 0; p.must = null; io.to(p.id).emit("offerCleared"); }
    this.emit("qualiResults", { rows, hold: 9000 });
    this.sendLobby();
    setTimeout(() => {
      if (this.phase !== "qualiResults") return;
      this.phase = "lobby";
      if (this.track && this.players.size) this.startRace(); else { this.qualiGrid = null; this.sendLobby(); }
    }, 9000);
  }

  // ----- who's near who (so 60 cars don't all check each other every step) -----
  buildBuckets() {
    const nb = Math.ceil(this.track.N / BK);
    if (!this.buckets || this.buckets.length !== nb) this.buckets = Array.from({ length: nb }, () => []);
    for (const b of this.buckets) b.length = 0;
    for (const c of this.cars) this.buckets[Math.floor(c.idx / BK)].push(c);
  }
  // cars from `back` points behind to `fwd` points ahead, with their distance along the track
  // (fills the shared NEAR_O / NEAR_D lists and returns how many; no garbage per call)
  around(c, fwd, back) {
    const t = this.track, N = t.N, nb = this.buckets.length;
    const b0 = Math.floor((c.idx - back) / BK), b1 = Math.floor((c.idx + fwd) / BK);
    let n = 0;
    for (let b = b0, m = 0; b <= b1 && m < nb; b++, m++) {
      for (const o of this.buckets[((b % nb) + nb) % nb]) {
        if (o === c) continue;
        let d = o.idx - c.idx; if (d > N / 2) d -= N; if (d < -N / 2) d += N;
        if (d < -back || d > fwd) continue;
        NEAR_O[n] = o; NEAR_D[n] = d * t.spacing + o.tOff - c.tOff; n++;
      }
    }
    return n;
  }
  // cars that nobody can hit: limping on a puncture, in the pit lane, on the cool-down lap, reversing out of trouble
  ghost(c) { return this.qualifying || this.time < (c.ghostUntil || 0) || c.punct || c.pitting > 0 || c.inPit || c.aiMode === "pitLane" || c.aiMode === "pitOut" || c.finished || c.reverseT > 0; }
  level(c) { return this.track.elev[c.idx] || 0; }

  drive(c, dt) {
    const t = this.track, N = t.N, st = c.st;
    const input = { gas: false, brake: false, steer: 0 };
    const speed = Math.hypot(c.vx, c.vy);
    const p = c.owner ? this.players.get(c.owner) : null;
    const laps = this.settings.laps;
    const pl = t.pitLane, dryTires = c.compound !== "wet";
    if (p) {
      if (c.aiMode === "race" && p.boxCall && !c.finished) c.aiMode = "wantPit";
      if (c.aiMode === "wantPit" && !p.boxCall && !c.punct) c.aiMode = "race";
      if (c.tire < 0.3 && p.warned < 1 && !p.boxCall) { p.warned = 1; io.to(p.id).emit("toast", `${c.name}: "Tires are going off, box soon!"`); }
      if (c.tire < 0.12 && p.warned < 2 && !p.boxCall) { p.warned = 2; io.to(p.id).emit("toast", `${c.name}: "These tires won't last, BOX NOW!"`); }
      if (this.wet > 0.5 && dryTires && !p.boxCall && p.rainWarn !== true) { p.rainWarn = true; io.to(p.id).emit("toast", `${c.name}: "It's soaking out here, I need wets!"`); }
      if (this.wet < 0.5) p.rainWarn = false;
      // the big "you NEED to pit" warning (only when it really matters)
      let must = null;
      const lapsLeft = laps - Math.max(0, c.lapsDone);
      if (!this.qualifying && this.time > 3 && !c.finished && !p.boxCall && !(c.pitting > 0) && c.aiMode === "race" && lapsLeft > 1) {
        const perLap = c.lapWearMeas || 1 / this.lifeLaps(c, c.compound);
        if (this.wet >= SLIP_WET && dryTires) must = "rain";
        else if (c.damage > 0.6) must = "damage";
        else if (c.tire < 0.3 && c.tire < perLap * (lapsLeft - 0.3)) must = "tires";
      }
      if (must !== (p.must || null)) { p.must = must; io.to(p.id).emit("mustPit", must ? { reason: must, tire: Math.round(c.tire * 100) } : null); }
    } else if (c.aiMode === "race" && !c.finished) {
      // AI strategy: decide in the last part of the lap (before the pit entry) whether to stop
      const left = laps - Math.max(0, c.lapsDone), toEntry = (pl.entry - c.idx + N) % N;
      if (left > 1 && toEntry < N * 0.3 && c.lapsDone >= 0 && !this.qualifying) {
        const perLap = c.lapWearMeas || 1 / this.lifeLaps(c, c.compound);
        const noMoreStops = (c.stintEnd ?? laps) >= laps;
        // won't make it: to the next pit window, or (if no more stops were planned) to the flag
        const toGo = left - 1 + toEntry / N;                                  // laps still to drive from here
        const critical = c.tire < perLap * (noMoreStops ? toGo * 1.1 : Math.min(toGo, 1) * 1.1 + 0.1);
        const wrongTires = (this.wet > 0.55 && dryTires) || (this.wet < 0.2 && !dryTires);
        const planned = c.lapsDone + 1 >= (c.stintEnd ?? laps);
        // undercut: the car just ahead is pitting and my stop is due soon anyway? go now too
        const restCap = Math.max(1, Math.floor(this.safeLaps(c, "durable"))) * Math.max(1, c.stopsLeft || 1);
        const ahead = c.ahead, undercut = !!ahead && (ahead.aiMode === "pitLane" || ahead.aiMode === "wantPit") && c.lapsDone + 2 === (c.stintEnd ?? laps) && left - 1 <= restCap && c.tire < 0.6;
        let want = critical || wrongTires || planned || undercut || (c.damage > 0.5 && left > 2);
        // don't queue behind a teammate who's already stopping, unless the tires are really gone
        if (want && !critical && !wrongTires && left > 2 && c.tire > perLap * 2.3 && this.cars.some((o) => o !== c && o.team === c.team && (o.aiMode === "pitLane" || o.pitting > 0))) { want = false; c.stintEnd = (c.stintEnd ?? laps) + 1; }
        if (want) c.aiMode = "wantPit";
      }
    }
    if (c.punct && c.aiMode === "race" && !c.finished) c.aiMode = "wantPit";
    const kNow = laneK(t, c.idx);
    if (c.finished && c.aiMode === "wantPit") c.aiMode = "race";
    if (c.aiMode === "wantPit" && kNow >= 0 && kNow < 4) { c.aiMode = "pitLane"; c.laneKey = pl.boxes[c.team] ?? Math.round(pl.len / 2); }
    c.aiNitro = c.aiNitro && c.aiMode === "race";

    let tx, ty, targetSpeed;
    if (c.aiMode === "pitLane" || c.aiMode === "pitOut") {
      if (kNow < 0) {
        c.aiMode = "race";
        tx = t.pts[(c.idx + 4) % N].x; ty = t.pts[(c.idx + 4) % N].y; targetSpeed = st.pitLimit;
      } else {
        const k = kNow;
        const aim = lanePoint(t, Math.min(pl.len, k + 2.5 * 30 / t.spacing));
        tx = aim.x; ty = aim.y; targetSpeed = st.pitLimit;
        if (c.aiMode === "pitLane") {
          const busy = this.cars.some((o) => o !== c && o.team === c.team && o.pitting > 0);
          const stopAt = c.laneKey - (busy ? 2.2 * 30 / t.spacing : 0);
          const dk = stopAt - k;
          targetSpeed = dk > 0 ? Math.min(st.pitLimit, Math.sqrt(2 * 520 * dk * t.spacing)) : 0;
          if (!busy && dk <= 0.9 && speed < 70) {
            const box = lanePoint(t, c.laneKey), bi = (pl.entry + Math.round(c.laneKey)) % N;
            c.x = box.x; c.y = box.y; c.heading = Math.atan2(t.tan[bi].y, t.tan[bi].x);
            c.pitting = st.pitTime * (c.punct ? 1.4 : 1); c.aiMode = "pitting";
            if (Math.random() < PIT_MISTAKE_CHANCE) {          // the crew fumbles a wheel nut
              c.pitting += PIT_MISTAKE_TIME;
              this.emit("feed", { t: "pitSlow", name: c.name, id: c.id });
              if (p) io.to(p.id).emit("toast", "Pit crew fumbled a wheel! +1 second");
            }
            c.pitTotal = c.pitting; c.vx = c.vy = 0;
            this.emit("feed", { t: "pit", name: c.name, id: c.id });
            if (p && c.tire < 0.35 && !c.punct) this.addXp(p, 30, "Well-timed pit stop +30 XP");
          }
        } else if (k >= pl.len - 1) { c.aiMode = "race"; c.ghostUntil = this.time + 3; }   // 3s pass-through after the pits
      }
    } else {
      const hw = t.hw[c.idx], lim = Math.max(8, hw - 24);
      const look = clamp(Math.round((40 + speed * 0.21) / t.spacing), 2, 14);
      const i = (c.idx + look) % N;
      const lvl = this.level(c);
      const calm = !c.finished && c.lapsDone <= 0 && (c.lapsDone < 0 || c.idx < this.calmEnd) && this.time < 25;
      const cooldown = c.finished;
      const myLat = c.lat;
      // the next corner (its tightest point) and which side is the inside
      let apex = c.idx, av = Infinity;
      const scan = Math.ceil(700 / t.spacing);
      for (let k = 2; k < scan; k++) { const q = (c.idx + k) % N; if (t.vcorner[q] < av) { av = t.vcorner[q]; apex = q; } }
      const inside = t.line[apex] >= 0 ? 1 : -1;
      // where I want to be on the road right now
      const lineOff = clamp(t.line[i] * (calm ? 0.35 : 1) + c.lineJit + (calm ? c.gridLane * 0.6 : 0), -lim, lim);
      if (c.passT > 0) c.passT -= dt;
      const w = clamp(c.passT / 0.6, 0, 1);
      let off = lineOff * (1 - w) + clamp(c.passOff, -lim, lim) * w;
      // everyone near me, measured along the track (works through corners)
      const nn = this.around(c, Math.ceil((speed * 1.3 + 260) / t.spacing), Math.ceil(120 / t.spacing));
      const near = [];
      for (let q = 0; q < nn; q++) { const o = NEAR_O[q]; if (!this.ghost(o) && Math.abs(this.level(o) - lvl) <= 0.45) near.push(o, NEAR_D[q]); }
      let lead = null, leadAlong = Infinity, alongside = null, pressure = null;
      for (let q = 0; q < near.length; q += 2) {
        const o = near[q], along = near[q + 1];
        const dl = Math.abs(o.lat - myLat);
        // a car that's already beside me (not in front) isn't one to follow: racing room keeps us apart
        const besideMe = along < 26 && dl >= 20;
        if (along > 0 && !besideMe && (dl < 28 || (along < 160 && Math.abs(o.lat - off) < 26)) && along < leadAlong) { lead = o; leadAlong = along; }
        if (Math.abs(along) < 48 && dl >= 20 && dl < 64) alongside = o;
        if (along < 0 && along > -speed * 0.5 && dl < 40) pressure = o;
      }
      const gapT = lead ? leadAlong / Math.max(speed, 60) : 99;
      c.chase = gapT < 1.0;
      c.attack = !!alongside && c.passT > 0;
      // Overtaking: close enough (or much faster)? pull out and go for it. Inside of the next
      // corner first, the other side if that's blocked. Only into space that's actually free.
      if (!calm && !cooldown && !c.punct && lead && c.passT <= 0.25) {
        const theirV = lead.speed, closing = speed - theirV;
        const reach = (0.45 + 0.12 * c.up.craft) * c.aggr + (c.slip ? 0.25 : 0);
        if (gapT < reach || (closing > 60 && gapT < 1.1)) {
          const cornerNear = (apex - c.idx + N) % N * t.spacing < 500;
          const first = cornerNear ? inside : (lead.lat > 0 ? -1 : 1);
          for (const sd of [first, -first]) {
            const want = clamp(lead.lat + sd * 34, -lim, lim);
            if (Math.abs(want - lead.lat) < 27) continue;                       // no room on that side
            if (this.laneClear(c, near, want, lead)) { c.passOff = want; c.passT = 1.3 + 0.4 * c.aggr; c.passId = lead.id; break; }
          }
        }
      }
      // keep committing while side by side (don't bail out halfway through a move)
      if (c.passT > 0 && alongside && alongside.id === c.passId) c.passT = Math.max(c.passT, 0.7);
      // racing room: never swing across onto a car that's right beside you (the racing line goes
      // edge to edge now, so without this cars would cut across each other in corners)
      if (!cooldown && !c.punct) for (let q = 0; q < near.length; q += 2) {
        const o = near[q], along = near[q + 1];
        if (Math.abs(along) > 52) continue;
        const side = Math.sign(o.lat - myLat), gap = Math.abs(o.lat - myLat);
        if (gap > 70 || gap < 4) continue;
        if (side > 0 && off > o.lat - 33) off = Math.max(Math.min(myLat, o.lat - 33), -lim);
        if (side < 0 && off < o.lat + 33) off = Math.min(Math.max(myLat, o.lat + 33), lim);
      }
      if (cooldown) off = t.line[i] > 0 ? -Math.min(44, lim) : Math.min(44, lim);
      if (c.punct) off = pl.side * lim;                                            // limp along the edge, out of the way
      off = clamp(off, -lim, lim);
      tx = t.pts[i].x + t.nor[i].x * off; ty = t.pts[i].y + t.nor[i].y * off;
      // Target speed: look ahead and brake just in time for every corner coming up.
      // off the racing line (mid-overtake) the corner is tighter, so take it a little slower
      const offLine = c.passT > 0 ? Math.abs(off - t.line[c.idx]) : 0;
      const cp = st.cornerPace * c.skill * this.compoundSpeed(c) * (c.attack ? 1.03 : 1) * (1 - Math.min(0.12, offLine * 0.0016)) * Math.sqrt(this.tireGrip(c.tire) * this.weatherGrip(c) * (c.damage > 0 ? 1 - 0.1 * c.damage : 1));
      const dec = st.planBrake * (1 - 0.3 * this.wet * (dryTires ? 1 : 0.4)) * (c.attack ? 1.08 : 1);
      const K = Math.min(60, Math.ceil((speed * speed) / (2 * dec) / t.spacing) + 3);
      let v = t.vcorner[c.idx] * cp, straight = t.vcorner[c.idx] * cp;
      const K2 = Math.ceil((speed * 1.1 + 150) / t.spacing), K3 = p ? 0 : Math.min(90, Math.ceil((speed * 2.2 + 300) / t.spacing));
      let brakeIn = Infinity;                                   // (AI) distance until it has to start braking
      for (let k = 1; k <= Math.max(K, K2, K3); k++) {
        const vc = t.vcorner[(c.idx + k) % N] * cp, d = Math.max(0, k * t.spacing - c.tOff);
        if (k <= K) v = Math.min(v, Math.sqrt(vc * vc + 2 * dec * d));
        if (k <= K2) straight = Math.min(straight, vc);
        if (k <= K3 && vc < speed) brakeIn = Math.min(brakeIn, d - (speed * speed - vc * vc) / (2 * dec));
      }
      targetSpeed = v;
      if (calm) targetSpeed = Math.min(targetSpeed, st.maxSpeed * 0.92);
      if (cooldown) targetSpeed = Math.min(targetSpeed, 240);
      // don't drive into the back of someone: follow close, matching their speed
      if (lead) {
        const theirV = lead.speed;
        const gap = (36 + speed * 0.06 + Math.max(0, speed - theirV) * 0.55) * (calm ? 1.7 : 1);
        const pulledOut = c.passT > 0 && Math.abs(c.lat - lead.lat) > 30;      // a full car width across
        if (leadAlong < gap && !pulledOut && theirV < speed) targetSpeed = Math.min(targetSpeed, Math.max(0, theirV * (leadAlong < gap * 0.6 ? 0.94 : 1)));
      }
      if (c.punct) targetSpeed = Math.min(targetSpeed, 190);
      // AI boost, used like a real driver would: fire it when flat out with no braking coming up,
      // hold it until the braking zone (no little taps), spend the tank regularly but keep a small
      // reserve for fights, and dump everything on the last lap.
      if (!p) {
        const flatOut = v > speed * 1.06 + 20 && speed > st.maxSpeed * 0.55 && !calm && !cooldown && !c.punct;
        const inLine = lead && Math.abs(c.lat - lead.lat) < 30;
        const boxedIn = inLine && leadAlong < speed * 1.0 && lead.speed < speed * 1.08;   // someone right ahead in my lane: pull out first, then boost past
        const danger = inLine && leadAlong < speed * 0.3 && lead.speed < speed * 0.97;                     // about to rear-end them
        const lastLap = c.lapsDone >= laps - 1;
        const fight = c.chase || c.passT > 0 || !!pressure;
        const reserve = lastLap ? 0.01 : fight ? 0.03 : 0.15;
        if (c.nitroWait > 0) c.nitroWait -= dt;
        if (c.aiNitro) {
          c.nitroT = (c.nitroT || 0) + dt;
          const braking = v < speed * 1.015;                                      // corner coming: let go now
          if (braking || danger || c.nitro <= reserve || (c.nitroT > 0.8 && !flatOut)) { c.aiNitro = false; c.nitroWait = braking ? 0.3 : 1.5; }
        } else if (flatOut && brakeIn > speed * 0.8 && !boxedIn && !danger && !(c.nitroWait > 0) && c.nitro > 0.12 && (fight || lastLap || c.nitro >= c.nitroMin || c.nitro > 0.9)) { c.aiNitro = true; c.nitroT = 0; }
      }
      // mistakes: rare, mostly in corners, more with worn tires / slicks in the rain / pushing hard
      if (!calm && !cooldown && av < MAX_SPEED * 0.75 && c.mistakeT <= 0) {
        let rate = (p ? 0.03 : 0.015 * (c.aiMist || 1)) * st.mistakes;
        if (dryTires) rate *= 1 + 2 * this.wet;
        if (c.tire < 0.25) rate *= 2;
        if (c.attack) rate *= 1.5;
        if (Math.random() < rate * dt) {
          c.mistakeT = 0.45; c.mistakeDir = Math.random() < 0.5 ? -1 : 1;
          this.emit("feed", { t: "mistake", name: c.name, id: c.id });
        }
      }
    }
    // Steering: "pure pursuit" towards the target point along the direction the car is actually
    // travelling, so it tracks corners cleanly instead of wobbling or running wide.
    const vF = c.vx * Math.cos(c.heading) + c.vy * Math.sin(c.heading);
    const dx = tx - c.x, dy = ty - c.y, Ld = Math.max(24, Math.hypot(dx, dy));
    const course = speed > 90 && vF > 0 ? Math.atan2(c.vy, c.vx) : c.heading;
    const alpha = wrapAngle(Math.atan2(dy, dx) - course);
    if (vF > 40) input.steer = clamp((2 * vF * Math.sin(alpha)) / Ld / (c.yawMax || 2), -1, 1);
    else input.steer = clamp(wrapAngle(Math.atan2(dy, dx) - c.heading) * 2, -1, 1);
    if (c.mistakeT > 0) { c.mistakeT -= dt; input.steer = clamp(input.steer * 0.5 + c.mistakeDir * 0.45, -1, 1); targetSpeed *= 1.04; }
    if (vF < targetSpeed) input.gas = true; else if (vF > targetSpeed + 30) input.brake = true;
    if (Math.abs(alpha) > 1.3 && vF > 150) { input.gas = false; input.brake = true; }
    if (c.aiMode !== "pitting" && c.aiMode !== "pitLane" && speed < 25) c.stuck += dt; else c.stuck = 0;
    if (c.stuck > 1.4) { c.reverseT = 0.9; c.stuck = 0; }
    if (c.reverseT > 0) { c.reverseT -= dt; input.gas = false; input.brake = true; input.steer = -input.steer; }
    return input;
  }
  laneClear(c, near, want, ignore) {
    for (let k = 0; k < near.length; k += 2) {
      const q = near[k], along = near[k + 1];
      if (q === ignore) continue;
      if (along < -55 || along > 190) continue;
      if (Math.abs(q.lat - want) < 30) return false;
      // someone alongside, between me and where I want to go
      if (Math.abs(along) < 55 && (q.lat - c.lat) * (want - c.lat) > 0 && Math.abs(q.lat - c.lat) < Math.abs(want - c.lat) + 10) return false;
    }
    return true;
  }
  tireGrip(w) { return 0.45 + 0.55 * Math.sqrt(Math.max(0, w)); }
  // dry tires in the wet: slower everywhere, and from ~60% wet a LOT slower (about -25% at 100%)
  compoundSpeed(c) { return COMPOUNDS[c.compound].speed * (c.compound === "wet" ? 1 : 1 - 0.08 * this.wet - 0.17 * clamp((this.wet - 0.5) / 0.4, 0, 1)); }
  weatherGrip(c) { return COMPOUNDS[c.compound].grip * (c.compound === "wet" ? 1 : 1 - 0.45 * this.wet); }
  tireSpeed(w) { return w <= 0 ? 0.62 : 0.86 + 0.14 * Math.min(1, w * 3); }

  physics(c, input, dt) {
    const st = c.st, t = this.track;
    if (c.spin) { c.heading += c.spin * dt; c.spin *= Math.exp(-2.6 * dt); if (Math.abs(c.spin) < 0.3) c.spin = 0; }
    if (c.crashT > 0) c.crashT -= dt;
    const fx = Math.cos(c.heading), fy = Math.sin(c.heading);
    let vF = c.vx * fx + c.vy * fy, vS = -c.vx * fy + c.vy * fx;
    if (c.pitting > 0) {
      c.vx = c.vy = 0; c.pitting -= dt; c.nitroOn = false;
      if (c.pitting <= 0) {
        const p = c.owner && this.players.get(c.owner);
        if (!p) this.aiPlan(c);
        c.compound = p ? (p.nextCompound || c.compound) : c.planComp;
        c.lapWearMeas = 0; c.tireAtLap = undefined;
        if (c.damage > 0 && c.owner) io.to(c.owner).emit("toast", "Crew fixed the damage!");
        c.tire = 1; c.pits++; c.aiMode = "pitOut"; c.punct = false; c.damage = 0;
        if (p) { p.boxCall = false; p.warned = 0; p.compound = c.compound; io.to(p.id).emit("toast", `${COMPOUNDS[c.compound].name} tires on! Go go go!`); }
      }
      return;
    }
    let maxSp = st.maxSpeed * this.tireSpeed(c.tire) * this.compoundSpeed(c), accel = st.accel;
    if (c.punct) { maxSp *= 0.33; accel *= 0.4; }
    if (c.damage > 0) { maxSp *= 1 - 0.14 * c.damage; accel *= 1 - 0.2 * c.damage; }
    // Slipstream: tucked in within half a second of the car ahead = +30% top speed
    c.slip = false;
    if (vF > 250 && !c.punct && !c.inPit && c.aiMode === "race") {
      const reach = vF * st.slipTime, lvl = this.level(c);
      const nn = this.around(c, Math.ceil(reach / t.spacing) + 1, 0);
      for (let q = 0; q < nn; q++) {
        const o = NEAR_O[q], along = NEAR_D[q];
        if (along > 28 && along < reach && Math.abs(o.lat - c.lat) < 34 && o.speed > 200 && !this.ghost(o) && Math.abs(this.level(o) - lvl) <= 0.45) { c.slip = true; break; }
      }
    }
    if (c.slip) maxSp *= 1 + SLIP_BONUS;
    c.boosting = this.time < c.boostUntil;           // launch boost off the line
    if (c.boosting) { accel *= 1.8; maxSp *= 1.08; }
    // Nitro boost: +12% while held, drains 20%/s. Refills only at the line (see onLap).
    const p = c.owner && this.players.get(c.owner);
    const wantN = p ? p.nitroHeld : c.aiNitro;
    c.nitroOn = !!wantN && c.nitro > 0 && !c.punct && !c.inPit && (c.aiMode === "race" || c.aiMode === "wantPit") && !c.finished;
    if (c.nitroOn) {
      maxSp *= 1 + st.nitroPow; accel *= 1.15 + st.nitroPow;
      c.nitro = Math.max(0, c.nitro - st.nitroDrain * dt);
    } else if (c.nitro < 1 && this.phase === "race") c.nitro = Math.min(1, c.nitro + NITRO_REGEN * dt);
    // surfaces: 0 track, 1 kerb, 2 grass, 3 gravel, 4 pit lane
    if (c.surface === 1) maxSp *= 0.97;
    else if (c.surface === 2) maxSp *= 0.55;
    else if (c.surface === 3) { maxSp *= 0.3; vF *= Math.exp(-2.4 * dt); vS *= Math.exp(-3 * dt); }
    if (input.gas) { if (vF < maxSp) vF += accel * dt * (vF > maxSp * 0.85 ? 0.7 : 1); }
    else if (input.brake) { if (vF > 20) vF -= st.brake * dt; else if (vF > -REVERSE_MAX) vF -= accel * 0.6 * dt; }
    else vF -= vF * 0.55 * dt;
    if (vF > maxSp) vF -= Math.min(vF - maxSp, (c.surface >= 2 && c.surface < 4 ? 900 : 300) * dt);
    // How hard the car can turn: steering lock at low speed, tire grip at high speed.
    let gripF = st.gripMul * this.tireGrip(c.tire) * this.weatherGrip(c);
    if (c.surface === 2) gripF *= 0.55; else if (c.surface === 3) gripF *= 0.4;
    if (c.punct) gripF *= 0.35;
    const av = Math.abs(vF);
    if (c.rs) {
      if (c.nitroOn) c.rs.boostSec += dt;
      if (this.wet > c.rs.maxWet) c.rs.maxWet = this.wet;
      if (c.compound === "wet" && this.wet >= 0.45) c.rs.usedWets = true;
    }
    c.yawMax = Math.min(STEER_LOCK * clamp(av / 140, 0.2, 1), (LAT_GRIP * st.cornerPace * st.cornerPace * gripF) / Math.max(av, 1));
    const control = c.crashT > 0 ? 0.25 : c.slipT > 0 ? 0.55 : 1;
    c.heading += input.steer * c.yawMax * Math.sign(vF || 1) * dt * control;
    let grip = st.grip * this.tireGrip(c.tire) * this.weatherGrip(c);
    if (c.surface === 2) grip *= 0.55; else if (c.surface === 3) grip *= 0.4;
    if (c.punct) { grip *= 0.35; c.heading += (Math.random() - 0.5) * 0.9 * dt; }
    // Heavy rain on the wrong tires: every so often (about 1-3 times a lap) the rear steps out
    // for most of a second. Scary, costs time, but the driver catches it.
    if (c.compound !== "wet" && this.wet >= SLIP_WET && !c.inPit && av > 200 && !(c.slipT > 0)) {
      const chance = 0.035 + 0.035 * clamp((this.wet - SLIP_WET) / (1 - SLIP_WET), 0, 1);
      if (Math.random() < chance * dt) {
        if (c.rs) c.rs.slips++;
        c.slipT = 0.55 + Math.random() * 0.3; c.slipYaw = (Math.random() < 0.5 ? -1 : 1) * (0.9 + Math.random() * 0.5);
        if (p) io.to(p.id).emit("toast", c.slipWarned ? `${c.name} slides on the wet track!` : `${c.name}: "Whoa, nearly lost it! We need wets!"`);
        c.slipWarned = true;
      }
    }
    if (c.slipT > 0) {
      c.slipT -= dt;
      c.heading += c.slipYaw * dt;
      vS += c.slipYaw * av * 0.5 * dt;
      grip *= 0.35;
    }
    vS *= Math.exp(-grip * dt);
    const nfx = Math.cos(c.heading), nfy = Math.sin(c.heading);
    c.vx = nfx * vF - nfy * vS; c.vy = nfy * vF + nfx * vS;
    c.x = clamp(c.x + c.vx * dt, 20, t.W - 20); c.y = clamp(c.y + c.vy * dt, 20, t.H - 20);
    const moved = Math.hypot(c.vx, c.vy) * dt, slide = Math.abs(vS);
    let wear = (this.wearPerLap / t.length) * moved * (1 + clamp(slide / 110, 0, 3)) * WEAR_LEVELS[this.settings.wear];
    if (input.brake && vF > 250) wear *= 1.4;
    const C = COMPOUNDS[c.compound];
    wear *= c.compound === "wet" ? C.dryWear + (C.wear - C.dryWear) * clamp(this.wet * 1.6, 0, 1) : C.wear;
    if (c.surface === 3) wear *= 2;
    if (this.qualifying) wear = 0;
    const before = c.tire;
    if (!c.finished) c.tire = Math.max(0, c.tire - wear * st.wear);       // no wear on the cool-down lap
    if (c.tire <= 0 && before > 0 && !c.punct) {
      c.punct = true; c.nitroOn = false;
      this.emit("feed", { t: "puncture", name: c.name, id: c.id });
      if (p) io.to(p.id).emit("puncture");
    }
    c.slide = slide; c.speed = vF;
  }

  trackPos(c) {
    const t = this.track, N = t.N;
    let best = c.idx, bestD = Infinity;
    for (let o = -12; o <= 20; o++) {
      const i = (c.idx + o + N) % N, d = (t.pts[i].x - c.x) ** 2 + (t.pts[i].y - c.y) ** 2;
      if (d < bestD) { bestD = d; best = i; }
    }
    bestD = Math.sqrt(bestD);
    if (bestD > t.hw[best] * 2.6) {
      let g = best, gd = Infinity;
      for (let i = 0; i < N; i++) { const d = (t.pts[i].x - c.x) ** 2 + (t.pts[i].y - c.y) ** 2; if (d < gd) { gd = d; g = i; } }
      let delta = g - c.idx; if (delta > N / 2) delta -= N; if (delta < -N / 2) delta += N;
      if (Math.abs(delta) < 40) { best = g; bestD = Math.sqrt(gd); }
    }
    const delta = best - c.idx;
    // a lap only counts the FIRST time a car gets that far
    if (delta < -N / 2) { c.lapsDone++; if (c.lapsDone > (c.maxLaps ?? -1)) { c.maxLaps = c.lapsDone; this.onLap(c); } }
    else if (delta > N / 2) c.lapsDone--;
    c.idx = best;
    const rx = c.x - t.pts[best].x, ry = c.y - t.pts[best].y;
    const lat = rx * t.nor[best].x + ry * t.nor[best].y, al = Math.abs(lat), hw = t.hw[best];
    c.lat = lat; c.tOff = rx * t.tan[best].x + ry * t.tan[best].y;
    const k = laneK(t, best), pl = t.pitLane;
    const inLane = k >= 0 && Math.sign(lat) === pl.side && Math.abs(al - (hw + pl.gap) * rampLane(pl, k)) < 34 && al > hw - 5;
    c.surface = inLane ? 4 : al < hw ? 0 : al < hw + 16 ? 1 : (t.gravel[best] && Math.sign(lat) === t.gravel[best] && al < hw + 140) ? 3 : 2;
    c.inPit = c.surface === 4;
    c.onTrack = c.surface <= 1 || c.surface === 4;
    c.progress = c.lapsDone * N + c.idx;
    if (c.cp) { const b = Math.floor(c.progress / this.bucket); if (!c.cp.has(b)) c.cp.set(b, this.time); }
  }

  onLap(c) {
    const p = c.owner && this.players.get(c.owner);
    if (c.lapsDone >= 1) {
      const lt = this.time - c.lapStart;
      if (lt < c.bestLap) c.bestLap = lt;
      if (lt < this.fastest) {
        this.fastest = lt;
        if (c.lapsDone > 1) { this.emit("feed", { t: "fastest", name: c.name, time: lt }); if (p) this.addXp(p, 80, "Fastest lap! +80 XP"); }
      }
      if (p) { this.addXp(p, 30, "Lap done +30 XP"); if (c.cleanLap) this.addXp(p, 60, "Clean lap +60 XP"); }
      if (c.cleanLap && c.rs) c.rs.cleanLaps++;
    }
    c.lapStart = this.time; c.cleanLap = true;
    // qualifying: a full tank every lap, so every lap is a fair shot at pole
    if (this.qualifying && c.lapsDone >= 1) { if (p && c.nitro < 0.995) io.to(p.id).emit("xp", { label: "⚡ Boost full!" }); c.nitro = 1; }
    // boost: half a tank back every time you cross the line (more with Nitro Refill)
    else if (c.lapsDone >= 1 && c.lapsDone < this.settings.laps && c.st) {
      const before = c.nitro;
      c.nitro = Math.min(1, c.nitro + c.st.nitroRefill);
      if (p && c.nitro > before + 0.005) io.to(p.id).emit("xp", { label: `⚡ Boost +${Math.round((c.nitro - before) * 100)}%` });
    }
    if (c.tireAtLap !== undefined && c.tire < c.tireAtLap && c.pitting <= 0) { const w = c.tireAtLap - c.tire; c.lapWearMeas = c.lapWearMeas ? c.lapWearMeas * 0.5 + w * 0.5 : w; }
    c.tireAtLap = c.tire;
    if (c.lapsDone >= this.settings.laps && !c.finished) {
      c.finished = true; c.finishTime = this.time; c.nitroOn = c.aiNitro = false;
      if (this.finishDeadline === Infinity) { this.finishDeadline = this.time + 30; this.emit("feed", { t: "winner", name: c.name }); }
    }
  }

  // Cars are boxes. Two boxes overlap if there's no gap along any of their 4 edge directions.
  corners(c) {
    const cx = Math.cos(c.heading), sy = Math.sin(c.heading);
    const ax = { x: cx * CAR_HL, y: sy * CAR_HL }, ay = { x: -sy * CAR_HW, y: cx * CAR_HW };
    return [
      { x: c.x + ax.x + ay.x, y: c.y + ax.y + ay.y }, { x: c.x + ax.x - ay.x, y: c.y + ax.y - ay.y },
      { x: c.x - ax.x - ay.x, y: c.y - ax.y - ay.y }, { x: c.x - ax.x + ay.x, y: c.y - ax.y + ay.y },
    ];
  }
  overlap(a, b) {
    const ca = this.corners(a), cb = this.corners(b);
    let best = Infinity, bn = null;
    for (const h of [a.heading, a.heading + Math.PI / 2, b.heading, b.heading + Math.PI / 2]) {
      const n = { x: Math.cos(h), y: Math.sin(h) };
      let amin = Infinity, amax = -Infinity, bmin = Infinity, bmax = -Infinity;
      for (const p of ca) { const d = p.x * n.x + p.y * n.y; amin = Math.min(amin, d); amax = Math.max(amax, d); }
      for (const p of cb) { const d = p.x * n.x + p.y * n.y; bmin = Math.min(bmin, d); bmax = Math.max(bmax, d); }
      const o = Math.min(amax, bmax) - Math.max(amin, bmin);
      if (o <= 0) return null;
      if (o < best) { best = o; bn = n; }
    }
    if ((b.x - a.x) * bn.x + (b.y - a.y) * bn.y < 0) bn = { x: -bn.x, y: -bn.y };
    return { depth: best, nx: bn.x, ny: bn.y };
  }
  collide() {
    // only cars in the same little patch of world can touch (spatial hash, 64px cells)
    const cell = 64, grid = new Map();
    for (const c of this.cars) {
      if (this.ghost(c)) continue;
      const k = Math.floor(c.x / cell) * 65536 + Math.floor(c.y / cell);
      let l = grid.get(k); if (!l) grid.set(k, (l = [])); l.push(c);
    }
    for (const a of this.cars) {
      if (this.ghost(a)) continue;
      const gx = Math.floor(a.x / cell), gy = Math.floor(a.y / cell);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        const l = grid.get((gx + dx) * 65536 + gy + dy); if (!l) continue;
        for (const b of l) {
          if (b.id <= a.id) continue;
          if (Math.abs(a.x - b.x) > 60 || Math.abs(a.y - b.y) > 60) continue;
          if (Math.abs(this.level(a) - this.level(b)) > 0.45) continue;             // one is on a bridge above the other
          const hit = this.overlap(a, b);
          if (!hit) continue;
          const { nx, ny, depth } = hit;
          const push = Math.min(4, depth / 2);
          a.x -= nx * push; a.y -= ny * push; b.x += nx * push; b.y += ny * push;
          const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
          if (rel >= 0) continue;
          const imp = -rel * 0.5;
          a.vx -= nx * imp; a.vy -= ny * imp; b.vx += nx * imp; b.vy += ny * imp;
          if (-rel > CRASH_SPEED) this.crash(a, b, -rel, nx, ny);
          // a real bump costs a little speed; two cars just rubbing side by side don't slow each other down
          // (this used to take a bit of speed EVERY physics step they touched, so side by side = both stopping)
          else if (-rel > 45) { const loss = 1 - Math.min(0.03, -rel / 6000); a.vx *= loss; a.vy *= loss; b.vx *= loss; b.vy *= loss; }
        }
      }
    }
  }
  crash(a, b, speed, nx, ny) {
    const k = clamp((speed - CRASH_SPEED) / 300, 0, 1);
    for (const [c, sgn] of [[a, 1], [b, -1]]) {
      if (c.crashT > 0.3) continue;
      c.vx *= 0.35 - 0.15 * k; c.vy *= 0.35 - 0.15 * k;
      const side = Math.sign((-Math.sin(c.heading)) * nx * sgn + Math.cos(c.heading) * ny * sgn) || 1;
      c.spin = side * (4 + 6 * k); c.crashT = 0.9 + 0.8 * k; if (c.rs) c.rs.crashes++;
      c.damage = clamp(c.damage + 0.3 + 0.5 * k, 0, 1);
      c.tire = Math.max(0, c.tire - 0.05 - 0.1 * k);
      c.cleanLap = false; c.passT = 0; c.aiNitro = false;
      const p = c.owner && this.players.get(c.owner);
      if (p) io.to(p.id).emit("crash", { with: (c === a ? b : a).name, damage: Math.round(c.damage * 100) });
    }
    this.emit("feed", { t: "crash", name: a.name, other: b.name, x: Math.round((a.x + b.x) / 2), y: Math.round((a.y + b.y) / 2), big: k > 0.5 });
  }

  standings() {
    if (this.qualifying) return [...this.cars].sort((a, b) => (a.bestLap - b.bestLap) || (b.progress - a.progress));
    return [...this.cars].sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished) return -1; if (b.finished) return 1;
      return b.progress - a.progress;
    });
  }

  aiUpgrade(c) {
    const W = { engine: 3, corner: 3, turbo: 2, grip: 2, brakes: 2, late: 2, craft: 1.5, refill: 1, pitlane: 0.8, focus: 1, whisper: 1, pit: 1, enhance: 1.5, saver: 1 };
    const opts = Object.keys(UPGRADES).filter((k) => c.up[k] < UPGRADES[k].max);
    if (!opts.length) return;
    let r = Math.random() * opts.reduce((a, k) => a + (W[k] || 1), 0);
    for (const k of opts) { r -= W[k] || 1; if (r <= 0) { c.up[k]++; break; } }
    c.st = this.stats(c);
  }
  // ----- XP + upgrade cards -----
  addXp(p, amount, label) {
    p.xp += amount;
    if (label) io.to(p.id).emit("xp", { label });
    while (p.xp >= xpForLevel(p.level)) { p.xp -= xpForLevel(p.level); p.level++; p.pendingPicks++; io.to(p.id).emit("levelUp", { level: p.level }); }
    if (p.pendingPicks > 0 && !p.offer && this.cars && this.phase === "race") this.makeOffer(p);
  }
  offerMsg(p) {
    return { pending: p.pendingPicks, cards: p.offer.map((k) => { const u = UPGRADES[k]; return { key: k, kind: u.kind, name: u.name, desc: u.desc, max: u.max, level: p.up[k], now: u.fx(p.up[k]), next: u.fx(p.up[k] + 1) }; }) };
  }
  makeOffer(p) {
    // a shuffled "bag": every upgrade you can still take comes up once before anything repeats
    const ok = (k) => p.up[k] < UPGRADES[k].max;
    const pick = [];
    for (let guard = 0; pick.length < 3 && guard < 3; guard++) {
      p.bag = (p.bag || []).filter((k) => ok(k) && !pick.includes(k));
      if (!p.bag.length) {
        p.bag = Object.keys(UPGRADES).filter((k) => ok(k) && !pick.includes(k));
        for (let i = p.bag.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [p.bag[i], p.bag[j]] = [p.bag[j], p.bag[i]]; }
        if (!p.bag.length) break;
      }
      while (pick.length < 3 && p.bag.length) pick.push(p.bag.shift());
    }
    p.offer = pick;
    if (!p.offer.length) { p.offer = null; p.pendingPicks = 0; return; }
    io.to(p.id).emit("offer", this.offerMsg(p));
  }
  resendOffer(p) {
    if (!this.cars || this.phase === "lobby" || this.phase === "results") return;
    if (p.offer) io.to(p.id).emit("offer", this.offerMsg(p));
    else if (p.pendingPicks > 0) this.makeOffer(p);
  }
  retire(p) {
    const c = this.carOf(p.id);
    if (!c || this.phase === "lobby" || this.phase === "results") return;
    c.owner = null; c.retiredBy = p.id; c.name = c.name + " (AI)";
    c.aiReaction = 0.3; p.nitroHeld = false;
    if (this.phase === "race" && this.time < c.launchAt) c.launchAt = this.time + 0.3;
    p.boxCall = false;
    this.emit("feed", { t: "retire", name: p.name });
    io.to(p.id).emit("retired");
  }
  pick(p, i) {
    if (!p.offer) return;
    const k = p.offer[Number(i)]; if (!k) return;
    p.up[k]++; p.offer = null; p.pendingPicks--;
    const car = this.carOf(p.id); if (car) car.st = this.stats(car);
    io.to(p.id).emit("picked", { key: k, up: p.up, now: UPGRADES[k].fx(p.up[k]) });
    if (p.pendingPicks > 0) this.makeOffer(p);
  }

  endRace() {
    if (this.phase !== "race") return;
    this.phase = "results";
    for (const p of this.players.values()) p.nitroHeld = false;
    const order = this.standings();
    const table = this.settings.points;
    const rows = order.map((c, i) => {
      const pts = table[i] || 0;
      this.champ[c.name] = (this.champ[c.name] || 0) + pts;
      if (c.team && this.settings.teams) this.teamChamp[c.team] = (this.teamChamp[c.team] || 0) + pts;
      return { name: c.name, team: this.settings.teams ? c.team : "", color: c.color, livery: c.livery, number: c.number, owner: c.owner || c.retiredBy || null, best: isFinite(c.bestLap) ? c.bestLap : null, pits: c.pits, pts, finished: c.finished, time: c.finishTime };
    });
    // remember the standings after this race, so the season finale can show who went up and down
    for (const r of rows) { this.seasonColors.drivers[r.name] = r.color; if (r.team && !this.seasonColors.teams[r.team]) this.seasonColors.teams[r.team] = r.color; }
    const players = [...this.players.values()];
    this.history.push({ drivers: this.champOrder(), teams: this.settings.teams ? this.teamOrder() : [] });
    // upgrades only mean something during a race: clear any cards still waiting
    for (const p of this.players.values()) { p.offer = null; p.pendingPicks = 0; io.to(p.id).emit("offerCleared"); }
    const len = this.settings.season, seasonOver = len > 0 && this.raceNo >= len;
    const season = seasonOver ? this.lastSeason = {
      races: this.raceNo, drivers: this.champOrder().slice(0, 5), teams: this.settings.teams ? this.teamOrder().slice(0, 5) : [],
      history: this.history, colors: this.seasonColors,
      mine: { drivers: rows.filter((r) => r.owner).map((r) => r.name), teams: [...new Set(players.map((p) => p.team).filter(Boolean))] },
    } : null;
    this.emit("results", { rows, champ: this.champOrder(), teamChamp: this.teamOrder(), raceNo: this.raceNo, teams: this.settings.teams, seasonLen: len, season });
    this.recordStats(order, rows, season);
    this.sendLobby();
    setTimeout(() => {
      if (this.phase === "results") {
        this.phase = "lobby"; this.cars = null;
        if (seasonOver) { this.resetSeason(); this.emit("toast", "New season! Championship points are reset."); }
        this.sendLobby();
      }
    }, seasonOver ? 40000 : 12000);
  }

  // save everyone's stats to their account (signed-in players only) and hand out achievements
  recordStats(order, rows, season) {
    const humans = order.filter((c) => c.owner && this.players.get(c.owner));
    const fastestCar = order.find((c) => c.bestLap === this.fastest && isFinite(c.bestLap));
    const maxLevel = this.track ? Math.round(Math.max(0, ...this.track.elev)) : 0;
    const kmPerLap = this.track ? this.track.length / 4200 : 0;
    for (const c of humans) {
      const p = this.players.get(c.owner); if (!p?.uid) continue;
      const pos = order.indexOf(c) + 1, rs = c.rs || {};
      const r = {
        pos, of: order.length, grid: rs.grid || order.length, finished: !!c.finished, pts: rows[pos - 1]?.pts || 0,
        laps: this.settings.laps, lapsDone: Math.max(0, c.lapsDone), km: Math.max(0, c.lapsDone) * kmPerLap,
        overtakes: rs.overtakes || 0, crashes: rs.crashes || 0, cleanLaps: rs.cleanLaps || 0, slips: rs.slips || 0,
        boostSec: rs.boostSec || 0, maxWet: rs.maxWet || 0, usedWets: !!rs.usedWets, pits: c.pits,
        best: isFinite(c.bestLap) ? c.bestLap : 0, fastestLap: fastestCar === c,
        reaction: p.reaction > 0 ? p.reaction : 0, jump: !!p.jump, level: p.level,
        upgrades: Object.values(p.up || {}).reduce((a, b) => a + b, 0),
        humans: humans.length, beatPlayers: humans.filter((o) => order.indexOf(o) > pos - 1).length,
        kind: this.trackKind, trackId: this.trackId, trackKey: this.trackKey ? this.trackKey + (this.track?.reverse ? "_r" : "") : null, trackName: this.trackName, drewIt: this.trackKind === "drawn" && this.trackBy === p.uid, maxLevel,
        raceSec: this.time || 0, aiLevel: this.settings.aiLevel || "medium", theme: this.settings.theme, body: p.extras?.body || null,
        margin: pos === 1 && order[1]?.finished && c.finished ? order[1].finishTime - c.finishTime : pos === 1 && order.length > 1 ? 99 : 0,
        champDriver: !!(season && season.drivers[0]?.n === c.name), champTeam: !!(season && season.teams[0]?.n && season.teams[0].n === c.team),
      };
      accounts.getUser(p.uid).then((u) => {
        if (!u) return;
        const got = accounts.recordRace(u, r);
        if (r.newPb) io.to(p.id).emit("toast", r.oldPb ? `🏅 New personal best on this track! ${r.best.toFixed(2)}s (was ${r.oldPb.toFixed(2)}s)` : `🏅 First lap record set on this track: ${r.best.toFixed(2)}s`);
        io.to(p.id).emit("account", accounts.publicUser(u));
        for (const a of got) io.to(p.id).emit("achievement", a);
      }).catch((e) => console.log("stats error", e.message));
    }
  }

  gaps(order) {
    const N = this.track.N;
    if (this.qualifying) { const pole = order[0]?.bestLap; return order.map((c, i) => (i && isFinite(c.bestLap) && isFinite(pole) ? Math.round((c.bestLap - pole) * 1000) / 1000 : 0)); }
    return order.map((b, i) => {
      if (i === 0) return 0;
      const a = order[i - 1];
      if (a.finished && b.finished) return Math.round((b.finishTime - a.finishTime) * 10) / 10;
      if (a.progress - b.progress >= N) return -1;
      const when = a.cp && a.cp.get(Math.floor(b.progress / this.bucket));
      if (when === undefined) return 0;
      return Math.round(Math.max(0, this.time - when) * 10) / 10;
    });
  }

  // One shared snapshot for the whole room (sent once), plus a tiny personal one per player.
  sendState() {
    if (!this.cars || (this.phase !== "race" && this.phase !== "lights" && this.phase !== "tires")) return;
    const r2 = (v) => Math.round(v * 100) / 100;
    const cars = this.cars.map((c) => [
      c.id, Math.round(c.x * 10) / 10, Math.round(c.y * 10) / 10, r2(c.heading), Math.round(c.speed), r2(c.tire), c.lapsDone,
      c.pits, c.pitting > 0 ? r2(1 - c.pitting / (c.pitTotal || 1)) : -1, c.mistakeT > 0 ? 1 : 0, c.finished ? 1 : 0,
      c.slide > 70 && c.onTrack ? 1 : 0, c.onTrack ? 1 : 0, c.boosting ? 1 : 0, Math.round(c.progress), isFinite(c.bestLap) ? r2(c.bestLap) : 0,
      COMPOUNDS[c.compound].short, c.punct ? 1 : 0, c.surface, c.inPit ? 1 : 0, r2(c.damage), c.crashT > 0 ? 1 : 0, r2(this.track.elev[c.idx] || 0),
      Math.round(c.vx), Math.round(c.vy), c.idx, c.nitroOn ? 1 : 0, Math.round(c.nitro * 100), c.slip ? 1 : 0, this.ghost(c) ? 1 : 0,
    ]);
    const order = this.standings();
    const weather = { raining: this.raining, wet: r2(this.wet), change: -1, trend: this.trendShown || 0, dyn: this.settings.weather === "dynamic" };
    this.emit("state", { weather, t: Math.round((this.time || 0) * 1000) / 1000, phase: this.phase, ql: this.qualifying ? Math.max(0, Math.ceil(this.qualiEnd - this.time)) : -1, paused: !!this.paused, fastest: isFinite(this.fastest) ? r2(this.fastest) : 0, cars, standings: order.map((c) => c.id), gaps: this.gaps(order) });
    const perLap = this.perLapAll();
    for (const p of this.players.values()) {
      const c = this.carOf(p.id);
      if (c) io.to(p.id).emit("me", { id: c.id, box: p.boxCall, level: p.level, xp: p.xp, need: xpForLevel(p.level), lapStart: r2(c.lapStart), up: p.up, compound: c.compound, next: p.nextCompound, picked: p.compound, perLap, nitro: Math.round(c.nitro * 100), slip: c.slip, xpRate: this.settings.xpRate,
        pitLane: c.aiMode === "pitLane", pitting: c.pitting > 0, heading: c.aiMode === "wantPit", lapsLeft: Math.max(1, this.settings.laps - Math.max(0, c.lapsDone + 1)), life: Object.fromEntries(COMPOUND_KEYS.map((k) => [k, Math.round(this.lifeLaps(c, k) * 10) / 10])) });
    }
  }
}

// ======================= Menu: players online + public lobbies =======================
let menuDirty = true;
function menuInfo() {
  let racing = 0, inRooms = 0;
  const list = [];
  for (const r of rooms.values()) {
    inRooms += r.players.size;
    if (r.phase !== "lobby") racing += r.players.size;
    if (r.public && r.players.size) list.push({ code: r.code, host: r.hostName(), players: r.players.size, max: MAX_PLAYERS, phase: r.phase, track: !!r.track, laps: r.settings.laps, ai: r.settings.ai });
  }
  list.sort((a, b) => (a.phase === "lobby" ? 0 : 1) - (b.phase === "lobby" ? 0 : 1) || b.players - a.players);
  return { online: io.engine.clientsCount, inRooms, racing, lobbies: list.slice(0, 30) };
}
setInterval(() => { if (menuDirty) { menuDirty = false; io.to("menu").emit("menuInfo", menuInfo()); } }, 1500);

// ======================= Connections =======================
// ---- rate limits: tokens refill every second; each event costs tokens (heavy ones cost more) ----
const EVENT_COST = { randomTrack: 30, f1Track: 10, track: 10, create: 15, join: 8, "auth:login": 10, "auth:signup": 15, "auth:google": 10, "auth:resume": 5, "store:open": 4, "store:buy": 3, "presets:save": 5, emote: 2, draft: 0.2, nitro: 0.2 };
const BUCKET_MAX = 60, BUCKET_REFILL = 30;   // up to 60 at once, 30 per second after that
const loginFails = new Map();                 // username -> { n, until }: 10 wrong passwords = locked for 10 minutes
function loginLocked(name) { const f = loginFails.get(String(name || "").toLowerCase()); return f && f.until > Date.now(); }
function loginFailed(name) {
  const k = String(name || "").toLowerCase(), f = loginFails.get(k) || { n: 0, until: 0 };
  f.n++; if (f.n >= 10) { f.until = Date.now() + 10 * 60e3; f.n = 0; }
  loginFails.set(k, f); if (loginFails.size > 5000) loginFails.clear();
}
io.on("connection", (socket) => {
  const ip = ipOf(socket.request);
  socketsPerIp.set(ip, (socketsPerIp.get(ip) || 0) + 1);
  socket.on("disconnect", () => { const n = (socketsPerIp.get(ip) || 1) - 1; if (n <= 0) socketsPerIp.delete(ip); else socketsPerIp.set(ip, n); });
  let tokens = BUCKET_MAX, last = Date.now(), strikes = 0;
  socket.use(([ev], next) => {
    const now = Date.now(); tokens = Math.min(BUCKET_MAX, tokens + ((now - last) / 1000) * BUCKET_REFILL); last = now;
    const cost = EVENT_COST[ev] ?? 1;
    if (tokens < cost) {                      // too fast: drop it, and kick anyone who keeps flooding
      if (++strikes > 200) socket.disconnect(true);
      return;
    }
    tokens -= cost; strikes = Math.max(0, strikes - 1);
    next();
  });
  // every handler below runs inside try/catch: a broken or malicious message can't crash the game
  const rawOn = socket.on.bind(socket);
  socket.on = (ev, fn) => rawOn(ev, (...args) => {
    try { const r = fn(...args); if (r && typeof r.catch === "function") r.catch((e) => console.error(`[${ev}]`, e?.message || e)); }
    catch (e) { console.error(`[${ev}]`, e?.message || e); }
  });
  socket.join("menu"); menuDirty = true;
  socket.emit("menuInfo", menuInfo());
  const room = () => rooms.get(socket.data.room);
  const me = () => { const r = room(); return r ? r.players.get(socket.id) : null; };
  const isHost = () => { const r = room(); return r && r.hostId === socket.id; };
  const leave = () => { const r = room(); if (r) { socket.leave(r.code); r.removePlayer(socket.id); } socket.data.room = null; socket.join("menu"); menuDirty = true; };

  socket.on("create", (profile, opts) => { if (rooms.size >= MAX_ROOMS) return socket.emit("joinError", "The server is full right now, try again in a bit"); leave(); const r = new Room(makeCode(), opts?.public === true); rooms.set(r.code, r); r.addPlayer(socket, profile); });
  socket.on("join", (d) => {
    const r = rooms.get(String(d?.code || "").toUpperCase().trim());
    if (!r) return socket.emit("joinError", "No room with that code");
    if (r.players.size >= MAX_PLAYERS) return socket.emit("joinError", "That room is full (6 players max)");
    leave(); r.addPlayer(socket, d.profile);
  });
  socket.on("menuInfo", () => socket.emit("menuInfo", menuInfo()));
  socket.on("profile", (prof) => { const r = room(), p = me(); if (!p) return; Object.assign(p, cleanProfile(prof)); r.sendLobby(); });
  socket.on("setPublic", (v) => { const r = room(); if (!r || !isHost()) return; r.public = v === true; r.sendLobby(); r.emit("toast", r.public ? "Room is public: anyone can find it in the lobby list" : "Room is private: invite only"); });
  socket.on("settings", (s) => {
    const r = room(); if (!r || !isHost() || r.phase !== "lobby") return;
    const S = r.settings;
    if (s?.laps !== undefined && Number.isFinite(Number(s.laps))) S.laps = clamp(Math.round(Number(s.laps)), 1, 99);   // any number of laps
    if ([0, 1, 2, 3, 5].includes(Number(s?.quali))) S.quali = Number(s.quali);
    if (AI_LEVELS[s?.aiLevel]) S.aiLevel = s.aiLevel;                                       // qualifying minutes (0 = off)
    if (s?.ai !== undefined && Number.isFinite(Number(s.ai))) { S.ai = clamp(Math.round(Number(s.ai)), 0, MAX_AI); r.ensureRoster(S.ai); }
    if (s?.points !== undefined) { const p = parsePoints(s.points); if (p.length) S.points = p; }
    if (s?.teamColors !== undefined) S.teamColors = s.teamColors === true || s.teamColors === "on";
    if (s?.teams !== undefined) S.teams = s.teams === true || s.teams === "on";
    if (s?.season !== undefined && SEASONS.includes(Number(s.season))) S.season = Number(s.season);
    if (s?.smooth !== undefined) { const v = s.smooth === true || s.smooth === "on"; if (v !== S.smooth) { S.smooth = v; r.rebuildSmooth(); } }
    if (s?.xpRate !== undefined && Number.isFinite(Number(s.xpRate))) S.xpRate = clamp(Math.round(Number(s.xpRate)), XP_RATE_MIN, XP_RATE_MAX);
    if (["sunny", "rain", "dynamic"].includes(s?.weather)) S.weather = s.weather;
    if (["grass", "desert", "snow", "night", "autumn", "beach", "city", "volcano", "neon"].includes(s?.theme)) { S.theme = s.theme; if (r.track) r.emit("track", r.trackMsg()); }
    if ([1, 2, 3].includes(Number(s?.speed))) S.speed = Number(s.speed);
    if (WEAR_LEVELS[s?.wear]) S.wear = s.wear;
    if (MAP_SIZES[s?.map] && !r.track) S.map = s.map;
    r.sendLobby();
  });
  socket.on("track", (d) => {
    const r = room(); if (!r || !isHost() || r.phase !== "lobby") return;
    const err = r.setTrack(d?.stroke, d?.map, "drawn");
    socket.emit("trackResult", { error: err });
  });
  // the host's drawing in progress, passed on live so everyone can watch the track being drawn
  socket.on("draft", (d) => {
    const r = room(); if (!r || !isHost() || r.phase !== "lobby") return;
    let pts = null;
    if (Array.isArray(d) && d.length) pts = d.slice(0, 3000).map((q) => [Math.round(Number(q?.[0]) || 0), Math.round(Number(q?.[1]) || 0), clamp(Math.round(Number(q?.[2]) || TRACK_W), MIN_W, MAX_W)]);
    r.draft = pts;
    socket.to(r.code).emit("draft", pts);
  });
  socket.on("f1Track", (d) => {
    const r = room(); if (!r || !isHost() || r.phase !== "lobby") return;
    const err = r.setF1Track(String(d?.id || ""));
    socket.emit("trackResult", { error: err, f1: r.trackName });
  });
  // host puts a player in a grid spot (0 = automatic)
  socket.on("gridPos", (d) => {
    const r = room(); if (!r || !isHost() || r.phase !== "lobby") return;
    const p = r.players.get(d?.id); if (!p) return;
    p.gridPos = clamp(Math.round(Number(d.pos) || 0), -1, MAX_PLAYERS + MAX_AI);   // -1 = random spot every race
    r.sendLobby();
  });
  // ---- accounts ----
  const daily = (u) => {
    // achievements you already qualify for (e.g. new ones added in an update) unlock right away
    const re = accounts.recheck(u); if (re.length) setTimeout(() => { for (const x of re) socket.emit("achievement", x); socket.emit("account", accounts.publicUser(u)); }, 2500);
    const d = accounts.dailyReward(u); if (d) setTimeout(() => { socket.emit("daily", { coins: d.coins, streak: d.streak }); for (const a of d.got || []) socket.emit("achievement", a); socket.emit("account", accounts.publicUser(u)); }, 1200); };
  const signedIn = async (res) => {
    socket.data.uid = res.u.id; socket.data.extras = accounts.extrasOf(res.u); daily(res.u);
    socket.emit("account", { ...accounts.publicUser(res.u), token: res.token });
    const p = me(); if (p) { p.uid = res.u.id; p.extras = socket.data.extras; room().sendLobby(); }
  };
  const authFail = (e) => socket.emit("authError", e.message || "Sign-in failed");
  socket.on("auth:google", (d) => { accounts.signInGoogle(String(d?.credential || ""), d?.backup).then(signedIn, authFail); });
  // username + password: max 8 tries a minute per connection, so nobody can guess passwords fast
  let authTries = [];
  const authLimited = () => { const now = Date.now(); authTries = authTries.filter((t) => now - t < 60000); authTries.push(now); return authTries.length > 8; };
  socket.on("auth:signup", (d) => {
    if (authLimited()) return authFail(new Error("Too many tries. Wait a minute and try again."));
    accounts.signUp(d?.username, d?.password, d?.backup).then(signedIn, authFail);
  });
  socket.on("auth:login", (d) => {
    if (authLimited()) return authFail(new Error("Too many tries. Wait a minute and try again."));
    if (loginLocked(d?.username)) return authFail(new Error("Too many wrong passwords for that account. Try again in 10 minutes."));
    accounts.logIn(d?.username, d?.password, d?.backup).then(signedIn, (e) => { loginFailed(d?.username); authFail(e); });
  });
  socket.on("auth:dev", (d) => { accounts.signInDev(d?.name).then(signedIn, authFail); });
  socket.on("auth:resume", async (d) => {
    try {
      const u = await accounts.resumeOrRestore(String(d?.token || ""), d?.backup);
      if (!u) return socket.emit("signedOut");
      socket.data.uid = u.id; socket.data.extras = accounts.extrasOf(u);
      socket.emit("account", accounts.publicUser(u)); daily(u);
      const p = me(); if (p) { p.uid = u.id; p.extras = socket.data.extras; room().sendLobby(); }
    } catch (e) { authFail(e); }
  });
  socket.on("auth:signout", async (d) => {
    const u = socket.data.uid && await accounts.getUser(socket.data.uid);
    if (u) accounts.dropSession(u, String(d?.token || ""));
    socket.data.uid = null; socket.data.extras = null;
    const p = me(); if (p) { p.uid = null; p.extras = null; room().sendLobby(); }
    socket.emit("signedOut");
  });
  // saved tracks on your account
  socket.on("presets:get", async () => { const u = socket.data.uid && await accounts.getUser(socket.data.uid); socket.emit("presets", u ? u.presets || [] : null); });
  socket.on("presets:save", async (p) => {
    const u = socket.data.uid && await accounts.getUser(socket.data.uid); if (!u) return;
    const r = accounts.savePreset(u, p); if (r.error) return socket.emit("toast", r.error);
    socket.emit("presets", u.presets);
  });
  socket.on("presets:delete", async (name) => { const u = socket.data.uid && await accounts.getUser(socket.data.uid); if (!u) return; accounts.deletePreset(u, String(name)); socket.emit("presets", u.presets); });
  socket.on("catalog", () => socket.emit("catalog", { ach: accounts.ACH, store: accounts.STORE, boxes: accounts.BOXES }));
  const storeAction = async (fn) => {
    const u = socket.data.uid && await accounts.getUser(socket.data.uid);
    if (!u) return socket.emit("toast", "Sign in to use the store");
    const res = fn(u);
    if (res.error) return socket.emit("toast", res.error);
    socket.data.extras = accounts.extrasOf(u);
    socket.emit("account", accounts.publicUser(u));
    for (const a of res.got || []) socket.emit("achievement", a);
    const p = me(); if (p && room().phase === "lobby") { p.extras = socket.data.extras; room().sendLobby(); }
  };
  socket.on("store:buy", (id) => storeAction((u) => accounts.buy(u, String(id))));
  socket.on("store:open", (id) => storeAction((u) => { const r = accounts.openBox(u, String(id)); if (r.ok) socket.emit("boxResult", { item: r.item, rarity: r.rarity, dup: r.dup, refund: r.refund, box: r.box }); return r; }));
  socket.on("store:equip", (d) => storeAction((u) => accounts.equip(u, String(d?.slot || ""), d?.id == null ? null : String(d.id))));
  // quick emotes: shown over your car (race) or next to your name (lobby), max one every 1.5s
  const EMOTES = ["👍", "😂", "😮", "😡", "🔥", "GG", "🏁", "😭"];
  let emoteAt = 0;
  socket.on("emote", (e) => {
    const r = room(), p = me(); if (!r || !p || !EMOTES.includes(e) || Date.now() - emoteAt < 1500) return;
    emoteAt = Date.now();
    const c = r.cars && r.carOf(p.id);
    r.emit("emote", { e, name: p.name, pid: p.id, car: c ? c.id : null });
    if (p.uid) accounts.getUser(p.uid).then((u) => { if (!u) return; const got = accounts.bump(u, "emotes"); for (const a of got) socket.emit("achievement", a); if (got.length) socket.emit("account", accounts.publicUser(u)); }).catch(() => {});
  });
  socket.on("spectate", (on) => { const r = room(), p = me(); if (!r || !p || r.phase !== "lobby") return; p.spectator = !!on; r.sendLobby(); });
  socket.on("pause", (on) => { const r = room(); if (!r || !isHost() || r.phase !== "race") return; r.setPaused(on === undefined ? !r.paused : !!on); });
  socket.on("lastSeason", () => { const r = room(); if (r?.lastSeason) socket.emit("lastSeason", r.lastSeason); });
  socket.on("gridRandomAll", () => {
    const r = room(); if (!r || !isHost() || r.phase !== "lobby") return;
    for (const p of r.players.values()) p.gridPos = -1;
    r.sendLobby(); r.emit("toast", "🎲 Everyone gets a random grid spot each race.");
  });
  socket.on("randomTrack", (d) => {
    const r = room(); if (!r || !isHost() || r.phase !== "lobby") return;
    const err = r.setRandomTrack(d?.map);
    socket.emit("trackResult", { error: err, random: true, bridges: r.track?.bridges, maxLevel: r.track?.maxLevel });
  });
  socket.on("clearTrack", () => { const r = room(); if (!r || !isHost() || r.phase !== "lobby") return; r.track = null; r.stroke = null; r.trackName = null; r.draft = null; r.emit("draft", null); r.emit("track", null); r.sendLobby(); });
  socket.on("aiEdit", (d) => {
    const r = room(); if (!r || !isHost() || r.phase !== "lobby") return;
    const i = Math.round(Number(d?.i)); if (!(i >= 0 && i < r.roster.length)) return;
    const R = r.roster[i];
    if (typeof d.name === "string" && d.name.trim()) R.name = d.name.trim().slice(0, 12);
    if (d.number !== undefined && Number.isFinite(Number(d.number))) R.number = clamp(Math.round(Number(d.number)), 0, 99);
    if (typeof d.team === "string") R.team = cleanTeam(d.team) || R.team;
    if (HEX.test(d.color)) R.color = d.color;
    r.sendLobby();
  });
  socket.on("setStart", (d) => {
    const r = room(); if (!r || !isHost() || r.phase !== "lobby") return;
    const err = r.setStart(Number(d?.x), Number(d?.y));
    socket.emit("trackResult", { error: err, moved: !err });
  });
  socket.on("reverse", () => {
    const r = room(); if (!r || !isHost() || r.phase !== "lobby" || !r.track) return;
    r.rebuildTrack(r.track.start, !r.track.reverse);
    socket.emit("trackResult", { error: null, reversed: r.track.reverse });
  });
  socket.on("compound", (k) => { const r = room(), p = me(); if (r && p && r.cars) r.pickCompound(p, k); });
  socket.on("kick", (id) => {
    const r = room(); if (!r || !isHost() || id === socket.id || !r.players.has(id)) return;
    const name = r.players.get(id).name;
    const target = io.sockets.sockets.get(id);
    if (target) { target.emit("kicked", { by: r.players.get(socket.id)?.name }); target.leave(r.code); target.data.room = null; target.join("menu"); }
    r.removePlayer(id);
    r.emit("toast", `${name} was removed from the room`);
  });
  socket.on("resetChamp", () => {
    const r = room(); if (!r || !isHost() || r.phase !== "lobby") return;
    r.resetSeason(); r.sendLobby();
    r.emit("toast", "Championship reset. Fresh season!");
  });
  socket.on("setTeam", (t) => {
    const r = room(), p = me(); if (!r || !p) return;
    p.team = cleanTeam(t) || `${p.name} Racing`;
    if (r.track && r.phase === "lobby") assignBoxes(r.track.pitLane, r.allTeams());
    r.sendLobby();
  });
  // bring an AI driver into your team (great when you race alone), or send one back
  // rename your team (everyone on it, AI teammates too, and its championship points follow)
  socket.on("renameTeam", (name) => {
    const r = room(), p = me(); if (!r || !p || r.phase !== "lobby") return;
    const old = p.team, nu = cleanTeam(name);
    if (!nu || nu === old) return;
    const taken = [...r.players.values()].some((x) => x.team === nu) || r.roster.some((x) => x.team === nu);
    if (taken) return socket.emit("toast", "Another team already has that name");
    for (const x of r.players.values()) if (x.team === old) { x.team = nu; io.to(x.id).emit("teamRenamed", nu); }
    for (const a of r.roster) if (a.team === old) a.team = nu;
    if (r.teamChamp[old] !== undefined) { r.teamChamp[nu] = (r.teamChamp[nu] || 0) + r.teamChamp[old]; delete r.teamChamp[old]; }
    if (r.track) assignBoxes(r.track.pitLane, r.allTeams());
    r.emit("toast", `${old} is now called ${nu}`);
    r.sendLobby();
  });
  socket.on("aiTeammate", (d) => {
    const r = room(), p = me(); if (!r || !p || r.phase !== "lobby") return;
    const humanTeams = new Set([...r.players.values()].map((x) => x.team));
    if (d?.remove) {
      const a = r.roster.slice(0, r.settings.ai).find((x) => x.name === d.remove && x.team === p.team && x.origTeam);
      if (a) { a.team = a.origTeam; delete a.origTeam; }
    } else {
      if (!r.settings.ai) { r.settings.ai = 1; r.ensureRoster(1); }
      const act = r.roster.slice(0, r.settings.ai);
      // take an AI from a team without humans (the last one first, so the front AI teams stay whole)
      let a = [...act].reverse().find((x) => !humanTeams.has(x.team));
      if (!a) { r.settings.ai = clamp(r.settings.ai + 1, 0, MAX_AI); r.ensureRoster(r.settings.ai); a = r.roster[r.settings.ai - 1]; }
      if (!a || humanTeams.has(a.team) && a.team === p.team) return;
      a.origTeam = a.origTeam || a.team; a.team = p.team;
      socket.emit("toast", `${a.name} (AI) joined ${p.team}!`);
    }
    if (r.track) assignBoxes(r.track.pitLane, r.allTeams());
    r.sendLobby();
  });
  socket.on("start", () => { const r = room(); if (r && isHost()) r.startRace(); });
  socket.on("react", (ms) => { const r = room(), p = me(); if (r && p) r.react(p, ms); });
  socket.on("nitro", (on) => { const p = me(); if (p) p.nitroHeld = on === true; });
  socket.on("box", () => {
    const r = room(), p = me(); if (!r || !p || r.phase !== "race") return;
    const c = r.carOf(p.id); if (!c || c.finished || c.pitting > 0 || c.aiMode === "pitLane" || c.aiMode === "pitOut") return;
    if (!p.boxCall && c.lapsDone >= r.settings.laps - 1) return socket.emit("toast", "Last lap: no time to pit!");
    p.boxCall = !p.boxCall;
  });
  socket.on("pick", (i) => { const r = room(), p = me(); if (r && p) r.pick(p, i); });
  socket.on("wantOffer", () => { const r = room(), p = me(); if (r && p) r.resendOffer(p); });
  socket.on("retire", () => { const r = room(), p = me(); if (r && p) r.retire(p); });
  socket.on("setHost", (id) => {
    const r = room(); if (!r || !isHost() || !r.players.has(id)) return;
    r.hostId = id; r.sendLobby();
    r.emit("toast", `${r.players.get(id).name} is the host now`);
  });
  socket.on("leave", leave);
  socket.on("disconnect", () => { const r = room(); if (r) r.removePlayer(socket.id); menuDirty = true; });
});

// Main loop: 30 ticks a second. Each room is guarded so one broken race can't freeze the others.
setInterval(() => {
  for (const r of rooms.values()) {
    if (!r.track) continue;
    try { r.tick(); r.sendState(); }
    catch (e) { console.error("room", r.code, e); r.phase = "lobby"; r.cars = null; r.sendLobby(); r.emit("toast", "Something went wrong in that race. Back to the lobby."); }
  }
}, 1000 / 30);

if (require.main === module) server.listen(PORT, () => console.log(`Scribble GP: Team Boss running at http://localhost:${PORT}`));
module.exports = { strokeOk, circR, randomStroke, computeElev, Room, rooms, buildTrack, finalizeTrack, makeRandomTrack, bestStart, rateTrack, MAP_SIZES, server };
