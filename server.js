// Scribble GP: Team Boss server (made by Emmett)
// Runs every room's race so all players see exactly the same thing. Players are team
// bosses: they send team orders, pit calls and their start reaction; the server drives.

const fs = require("fs");
const path = require("path");
const http = require("http");
const express = require("express");
const { Server } = require("socket.io");

const PORT = process.env.PORT || 3000;

// ======================= Tuning =======================
const SCALE = 3.0;                 // world pixels per drawing-board unit
const TRACK_W = 130;
const MARGIN = 420;
const CAR_R = 17;
const MAX_SPEED = 640, ACCEL = 380, BRAKE = 950, REVERSE_MAX = 160;
const TURN_RATE = 2.7, GRIP = 9;
// Tire life depends on race length: a fresh set lasts about 60% of the race
// (at least 1.8 laps, at most 8), so every race needs at least one pit stop.
// Short races chew through tires fast, long races wear them slower.
const tireLifeLaps = (laps) => clamp(laps * 0.6, 1.8, 8);
const PIT_TIME = 2.8;
const MAP_SIZES = { small: [1200, 750], normal: [1600, 1000], large: [2400, 1500], huge: [3200, 2000] };
const WEAR_LEVELS = { low: 0.75, normal: 1, high: 1.35 };
const MAX_PLAYERS = 6;
const AI_NAMES = ["Bolt", "Nova", "Rusty", "Vex", "Kira", "Moss", "Blaze", "Juno", "Ziggy", "Pip"];
const AI_COLORS = ["#e53935", "#1e88e5", "#43a047", "#8e24aa", "#fb8c00", "#00acc1", "#ec407a", "#6d4c41", "#546e7a", "#c0ca33"];
const LIVERIES = ["plain", "stripes", "split", "flames", "checker"];
// Tire compounds. Wets are only good when the track is wet.
const COMPOUNDS = {
  durable: { name: "Durable",      short: "D", speed: 0.955, grip: 0.94, wear: 0.55 },
  inter:   { name: "Intermediate", short: "I", speed: 1.0,   grip: 1.0,  wear: 1.0 },
  fast:    { name: "Fast",         short: "F", speed: 1.04,  grip: 1.07, wear: 1.75 },
  wet:     { name: "Wets",         short: "W", speed: 0.92,  grip: 0.97, wear: 0.8, dryWear: 2.6 },
};
const COMPOUND_KEYS = Object.keys(COMPOUNDS);
const TIRE_PICK_TIME = 10000;      // ms to choose your starting tires
const PIT_LIMIT = 170;             // pit lane speed limit (world px/s, about 60 km/h)
const PIT_OFF = TRACK_W / 2 + 62;  // how far the pit lane sits from the track center
const PASSIVE_XP_EVERY = 12, PASSIVE_XP = 10;   // a little XP every 12 race-seconds
const DEFAULT_POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
const MAX_AI = 60;                 // "no cap" in practice: 60 AI keeps races smooth
const AI_TEAMS = ["Thunder Racing", "Apex Motors", "Nitro Works", "Comet GP", "Vortex", "Blue Falcon", "Red Arrow", "Iron Wolf", "Solar Speed", "Night Owl"];
const HEX = /^#[0-9a-fA-F]{6}$/;

const UPGRADES = {
  corner:  { kind: "Driver", name: "Corner Master",  desc: "Takes corners 4% faster",           max: 5 },
  late:    { kind: "Driver", name: "Late Braker",    desc: "Brakes later into corners",         max: 4 },
  craft:   { kind: "Driver", name: "Racecraft",      desc: "Better at overtaking and drafting", max: 4 },
  focus:   { kind: "Driver", name: "Focus",          desc: "30% fewer mistakes",                max: 3 },
  whisper: { kind: "Driver", name: "Tire Whisperer", desc: "Wears tires 10% slower",            max: 3 },
  reflex:  { kind: "Driver", name: "Quick Reflexes", desc: "Bigger launch boost off the line",  max: 3 },
  engine:  { kind: "Car",    name: "Big Engine",     desc: "+5% top speed",                     max: 5 },
  turbo:   { kind: "Car",    name: "Turbo",          desc: "+10% acceleration",                 max: 4 },
  grip:    { kind: "Car",    name: "Sticky Setup",   desc: "+7% grip",                          max: 4 },
  tires:   { kind: "Car",    name: "Hard Compound",  desc: "Tires wear 12% slower",             max: 4 },
  brakes:  { kind: "Car",    name: "Carbon Brakes",  desc: "+15% braking power",                max: 3 },
  pit:     { kind: "Car",    name: "Pro Pit Crew",   desc: "Pit stops 20% faster",              max: 3 },
};
const blankUp = () => Object.fromEntries(Object.keys(UPGRADES).map((k) => [k, 0]));
const ORDERS = {
  // Push is risky: a small speed gain, but tires die much faster and mistakes are
  // 3x as likely (and worse), especially once the tires are worn.
  push:   { speed: 1.04, wear: 1.75, mistakes: 3.2 },
  normal: { speed: 1.0,  wear: 1.0,  mistakes: 1.0 },
  save:   { speed: 0.93, wear: 0.65, mistakes: 0.5 },
};
const xpForLevel = (lvl) => 80 + (lvl - 1) * 35;

// ======================= Web server =======================
const app = express();
app.use(express.static(path.join(__dirname, "public")));
const indexFile = fs.existsSync(path.join(__dirname, "public", "index.html"))
  ? path.join(__dirname, "public", "index.html") : path.join(__dirname, "index.html");
app.get("/", (req, res) => res.sendFile(indexFile));
const server = http.createServer(app);
const io = new Server(server);

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// ======================= Track building (from the host's drawing) =======================
function resample(pts, spacing, closed) {
  const src = closed ? [...pts, pts[0]] : pts;
  const out = [{ ...src[0] }];
  let carry = 0;
  for (let i = 1; i < src.length; i++) {
    const a = src[i - 1], b = src[i], seg = dist(a, b);
    if (seg === 0) continue;
    let t = spacing - carry;
    while (t <= seg) { out.push({ x: a.x + (b.x - a.x) * (t / seg), y: a.y + (b.y - a.y) * (t / seg) }); t += spacing; }
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
      q.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 });
      q.push({ x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 });
    }
    p = q;
  }
  return p;
}
function buildTrack(stroke, board) {
  if (!Array.isArray(stroke) || stroke.length < 4) return { error: "Draw a loop to make a track." };
  const [BW, BH] = board;
  const raw = stroke.slice(0, 6000).map((q) => ({ x: clamp(Number(q[0]) || 0, 0, BW), y: clamp(Number(q[1]) || 0, 0, BH) }));
  let pts = resample(raw, 6, false);
  let len = 0; for (let i = 1; i < pts.length; i++) len += dist(pts[i - 1], pts[i]);
  if (len < 700) return { error: "Too small! Draw a bigger track." };
  pts = chaikinClosed(pts, 3);
  pts = resample(pts, 10, true);
  if (pts.length < 40) return { error: "Too small! Draw a bigger track." };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); }
  // extra room around the track for gravel traps and the pit lane
  const pad = MARGIN + 60;
  const world = pts.map((p) => ({ x: (p.x - minX) * SCALE + pad, y: (p.y - minY) * SCALE + pad }));
  const W = Math.ceil((maxX - minX) * SCALE + pad * 2), H = Math.ceil((maxY - minY) * SCALE + pad * 2);
  return { base: world, W, H, minX, minY, pad };
}

// Turn the track shape into a raceable track, starting at base point `start`, optionally reversed.
function finalizeTrack(shape, start = 0, reverse = false, teams = []) {
  const B = shape.base, n0 = B.length;
  const order = [];
  for (let k = 0; k < n0; k++) order.push(reverse ? (start - k + n0 * 2) % n0 : (start + k) % n0);
  const world = order.map((i) => B[i]);
  const N = world.length, tan = [], nor = [];
  for (let i = 0; i < N; i++) {
    const a = world[(i - 1 + N) % N], b = world[(i + 1) % N], L = dist(a, b) || 1;
    tan.push({ x: (b.x - a.x) / L, y: (b.y - a.y) / L });
    nor.push({ x: -(b.y - a.y) / L, y: (b.x - a.x) / L });
  }
  let length = 0; for (let i = 0; i < N; i++) length += dist(world[i], world[(i + 1) % N]);
  const spacing = length / N;
  // racing line: "pull the string tight" inside the track (wide, apex, wide)
  const lim = TRACK_W / 2 - 20, line = new Array(N).fill(0), lp = world.map((p) => ({ x: p.x, y: p.y }));
  for (let it = 0; it < 400; it++) {
    for (let i = 0; i < N; i++) {
      const a = lp[(i - 1 + N) % N], b = lp[(i + 1) % N];
      const want = ((a.x + b.x) / 2 - world[i].x) * nor[i].x + ((a.y + b.y) / 2 - world[i].y) * nor[i].y;
      line[i] = clamp(line[i] + (want - line[i]) * 0.6, -lim, lim);
      lp[i].x = world[i].x + nor[i].x * line[i]; lp[i].y = world[i].y + nor[i].y * line[i];
    }
  }
  const k = 3, vmax = [], turnAt = [];
  for (let i = 0; i < N; i++) {
    const a = lp[(i - k + N) % N], m = lp[i], b = lp[(i + k) % N];
    const turn = Math.abs(wrapAngle(Math.atan2(b.y - m.y, b.x - m.x) - Math.atan2(m.y - a.y, m.x - a.x)));
    vmax.push(Math.min(MAX_SPEED, Math.sqrt(1150 / (turn / (dist(a, m) + dist(m, b) || 1) + 1e-6))));
    const t1 = tan[(i - k + N) % N], t2 = tan[(i + k) % N];
    turnAt.push(wrapAngle(Math.atan2(t2.y, t2.x) - Math.atan2(t1.y, t1.x)));
  }
  for (let pass = 0; pass < 2; pass++) for (let i = N - 1; i >= 0; i--) {
    const next = vmax[(i + 1) % N]; vmax[i] = Math.min(vmax[i], Math.sqrt(next * next + 2 * 650 * spacing));
  }
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
      const li = (entry + kk) % N, c = { x: world[li].x + nor[li].x * sgn * (PIT_OFF + 50), y: world[li].y + nor[li].y * sgn * (PIT_OFF + 50) };
      for (let i = 0; i < N; i += 2) { const di = Math.min(Math.abs(i - li), N - Math.abs(i - li)); if (di < 10) continue; room = Math.min(room, dist(world[i], c)); }
    }
    if (room > bestRoom) { bestRoom = room; side = sgn; }
  }
  // no gravel on the pit lane side next to the pit straight
  for (let kk = -2; kk <= laneLen + 2; kk++) { const li = (entry + kk + N) % N; if (gravel[li] === side) gravel[li] = 0; }
  const pitLane = { entry, len: laneLen, side, off: PIT_OFF, boxes: {} };
  assignBoxes(pitLane, teams);
  return {
    pts: world, tan, nor, N, length, spacing, vmax, W: shape.W, H: shape.H, trackW: TRACK_W, line, gravel, pitLane,
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
  const off = pl.side * pl.off * rampLane(pl, k);
  const x = t.pts[i].x + (t.pts[j].x - t.pts[i].x) * f, y = t.pts[i].y + (t.pts[j].y - t.pts[i].y) * f;
  return { x: x + t.nor[i].x * off, y: y + t.nor[i].y * off };
}
// how far along the pit lane a track index is (or -1 if not in the lane's stretch)
function laneK(t, idx) { const k = (idx - t.pitLane.entry + t.N) % t.N; return k <= t.pitLane.len ? k : -1; }

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
  };
}
function cleanTeam(t) { return typeof t === "string" ? t.trim().replace(/\s+/g, " ").slice(0, 20) : ""; }
function parsePoints(v) {
  const arr = (Array.isArray(v) ? v : String(v || "").split(/[,\s]+/)).map((x) => Math.round(Number(x))).filter((x) => Number.isFinite(x) && x >= 0);
  return arr.slice(0, 80).map((x) => Math.min(999, x));
}

class Room {
  constructor(code) {
    this.code = code;
    this.players = new Map();   // socket id -> team boss
    this.hostId = null;
    this.phase = "lobby";       // lobby | lights | race | results
    this.settings = { laps: 5, ai: 5, map: "normal", theme: "grass", speed: 1, wear: "normal", points: DEFAULT_POINTS.slice(), teamColors: false, weather: "sunny" };
    this.stroke = null; this.track = null;
    this.champ = {};            // driver name -> points this session
    this.teamChamp = {};        // team name -> points this session
    this.roster = [];           // AI drivers the host can rename
    this.ensureRoster(this.settings.ai);
    this.raceNo = 0;
  }
  emit(ev, d) { io.to(this.code).emit(ev, d); }
  lobbyMsg() {
    return {
      code: this.code, hostId: this.hostId, phase: this.phase, settings: this.settings, raceNo: this.raceNo,
      players: [...this.players.values()].map((p) => ({ id: p.id, name: p.name, color: p.color, livery: p.livery, number: p.number, level: p.level, team: p.team })),
      stroke: this.stroke, champ: this.champOrder(), teamChamp: this.teamOrder(),
      roster: this.roster.slice(0, this.settings.ai),
    };
  }
  sendLobby() { this.emit("lobby", this.lobbyMsg()); }
  // make sure there's a named AI driver for every slot
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
    const p = { id: socket.id, ...cleanProfile(profile), up: blankUp(), level: 1, xp: 0, pendingPicks: 0, offer: null };
    this.players.set(socket.id, p);
    if (!this.hostId) this.hostId = socket.id;
    socket.join(this.code); socket.data.room = this.code;
    // joining mid-race: you'll be in the next one
    socket.emit("joined", { code: this.code, you: socket.id, upgrades: UPGRADES });
    this.sendLobby();
    if (this.track) socket.emit("track", this.trackMsg());
    if (this.phase !== "lobby") socket.emit("toast", "A race is on! You'll be on the grid for the next one.");
  }
  removePlayer(id) {
    const p = this.players.get(id);
    this.players.delete(id);
    if (this.cars) { const c = this.cars.find((c) => c.owner === id); if (c) { c.owner = null; c.name = c.name + " (AI)"; } }
    if (this.hostId === id) this.hostId = this.players.keys().next().value || null;
    if (!this.players.size) { rooms.delete(this.code); return; }
    if (p) this.emit("toast", `${p.name} left`);
    this.sendLobby();
  }
  trackMsg() {
    const t = this.track;
    return { pts: t.pts, tan: t.tan, nor: t.nor, N: t.N, W: t.W, H: t.H, length: t.length, trackW: t.trackW, theme: this.settings.theme,
      line: t.line.map((v) => Math.round(v)), gravel: t.gravel, pitLane: t.pitLane, minX: t.minX, minY: t.minY, pad: t.pad, scale: SCALE, reverse: t.reverse };
  }
  allTeams() { return [...[...this.players.values()].map((p) => p.team), ...this.roster.slice(0, this.settings.ai).map((r) => r.team)]; }
  rebuildTrack(start, reverse) {
    this.track = finalizeTrack(this.shape, start, reverse, this.allTeams());
    this.emit("track", this.trackMsg()); this.sendLobby();
  }
  // host clicks the board: move the start/finish line to the nearest spot on the track
  setStart(bx, by) {
    if (!this.track) return;
    const t = this.track, wx = (bx - t.minX) * SCALE + t.pad, wy = (by - t.minY) * SCALE + t.pad;
    let best = 0, bd = Infinity;
    t.pts.forEach((p, i) => { const d = (p.x - wx) ** 2 + (p.y - wy) ** 2; if (d < bd) { bd = d; best = i; } });
    if (Math.sqrt(bd) > TRACK_W * 3) return "Click on the track to move the start line.";
    this.rebuildTrack(t.order[best], t.reverse);
    return null;
  }

  setTrack(stroke, map) {
    const board = MAP_SIZES[map] || MAP_SIZES.normal;
    const shape = buildTrack(stroke, board);
    if (shape.error) return shape.error;
    this.shape = shape;
    this.track = finalizeTrack(shape, 0, false, this.allTeams());
    this.stroke = stroke.slice(0, 6000).map((q) => [Math.round(q[0]), Math.round(q[1])]);
    this.settings.map = MAP_SIZES[map] ? map : "normal";
    this.emit("track", this.trackMsg());
    this.sendLobby();
    return null;
  }

  // ======================= Race =======================
  startRace() {
    if (!this.track || this.phase !== "lobby") return;
    const t = this.track, s = this.settings;
    const humans = [...this.players.values()];
    const aiCount = clamp(s.ai, 0, MAX_AI);
    this.ensureRoster(aiCount);
    const total = humans.length + aiCount;
    this.raceNo++;
    this.cars = [];
    // grid: humans start at the back so there's always someone to chase
    const order = [];
    for (let a = 0; a < total - humans.length; a++) order.push({ ai: a });
    for (const h of humans) order.push({ human: h });
    order.forEach((slot, g) => {
      const row = Math.floor(g / 2), col = g % 2;
      const idx = (t.N - Math.round(3 + row * 2.2) + t.N * 4) % t.N;
      const p = t.pts[idx], n = t.nor[idx], tn = t.tan[idx], lat = (col ? 1 : -1) * 28;
      const base = {
        id: g + 1, x: p.x + n.x * lat, y: p.y + n.y * lat, heading: Math.atan2(tn.y, tn.x), vx: 0, vy: 0,
        idx, lapsDone: -1, progress: 0, finished: false, finishTime: 0, lapStart: 0, bestLap: Infinity, pits: 0,
        tire: 1, onTrack: true, inPit: false, pitting: 0, pitTotal: 0, mistakeT: 0, mistakeDir: 1,
        lane: 0, laneT: 0, lineJit: (Math.random() - 0.5) * 12, pitAt: 0.22 + Math.random() * 0.12, aiMode: "race", stuck: 0, reverseT: 0,
        cleanLap: true, launchAt: 0, boostUntil: 0, slide: 0, speed: 0, surface: 0, punct: false, compound: "inter", laneKey: 0,
      };
      if (slot.human) {
        const h = slot.human;
        Object.assign(base, { owner: h.id, name: h.name, color: h.color, livery: h.livery, number: h.number, up: h.up, skill: 0.9, team: h.team });
        h.order = "normal"; h.boxCall = false; h.reaction = null; h.jump = false; h.lastPos = total; h.passCd = new Map(); h.lostCd = new Map();
        h.compound = null; h.nextCompound = null; h.passiveAt = PASSIVE_XP_EVERY; h.warned = 0;
      } else {
        const a = slot.ai, R = this.roster[a];
        Object.assign(base, {
          owner: null, name: R.name, color: R.color, livery: R.livery, number: R.number, team: R.team, up: blankUp(),
          // rivals get sharper as the season goes on and as the teams level up
          skill: 0.85 + Math.random() * 0.09 + Math.min(0.07, (this.raceNo - 1) * 0.006) + this.avgLevel() * 0.004,
          aiReaction: 0.18 + Math.random() * 0.3,
        });
      }
      this.cars.push(base);
    });
    // team colors: everyone on a team uses the paint job of the team's first driver (humans first)
    if (s.teamColors) {
      const paint = {};
      for (const c of [...this.cars].sort((a, b) => (b.owner ? 1 : 0) - (a.owner ? 1 : 0))) {
        if (!paint[c.team]) paint[c.team] = { color: c.color, livery: c.livery };
        else Object.assign(c, paint[c.team]);
      }
    }
    this.time = 0; this.fastest = Infinity; this.finishDeadline = Infinity;
    this.wearPerLap = 1 / tireLifeLaps(s.laps);
    this.bucket = Math.max(1, Math.floor(t.N / 60));      // ~60 timing points per lap, used for gaps
    for (const c of this.cars) c.cp = new Map();
    // every team gets a garage in the pit lane
    assignBoxes(t.pitLane, this.cars.map((c) => c.team));
    this.emit("track", this.trackMsg());
    // weather
    const w = s.weather;
    this.raining = w === "rain" || (w === "dynamic" && Math.random() < 0.3);
    this.wet = this.raining ? 0.9 : 0;
    this.nextWeather = w === "dynamic" ? 25 + Math.random() * 45 : Infinity;   // race-seconds until it changes
    // first: everyone picks their starting tires
    this.phase = "tires";
    this.tiresUntil = Date.now() + TIRE_PICK_TIME;

    this.emit("race", { cars: this.cars.map((c) => ({ id: c.id, name: c.name, color: c.color, livery: c.livery, number: c.number, owner: c.owner, team: c.team })), laps: s.laps, raceNo: this.raceNo });
    for (const p of this.players.values()) this.resendOffer(p);     // unpicked upgrades are still waiting
    this.emit("tirePick", { until: TIRE_PICK_TIME, raining: this.raining, weather: s.weather, compounds: COMPOUNDS });
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
    if (ms < 0) {                      // pressed before the lights went out
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
    // the lights are already out: launch this car now based on the reaction
    if (this.phase === "race") this.applyLaunch(c, p);
  }
  applyLaunch(c, p) {
    if (p.jump) { c.launchAt = 3.0; c.boostUntil = 0; return; }        // jump start: held for 3 seconds
    if (p.reaction === null) { c.launchAt = 1.2; return; }             // no press yet: launches slowly on its own
    c.launchAt = Math.max(this.time, p.reaction / 1000);
    c.boostUntil = c.launchAt + clamp(0.9 - p.reaction / 700, 0, 0.8) * (1 + 0.35 * c.up.reflex);
  }

  launchCars(now) {
    for (const c of this.cars) {
      const p = c.owner && this.players.get(c.owner);
      if (p) this.applyLaunch(c, p); else c.launchAt = c.aiReaction;
    }
  }

  stats(c) {
    const u = c.up;
    return {
      maxSpeed: MAX_SPEED * (1 + 0.05 * u.engine), accel: ACCEL * (1 + 0.1 * u.turbo), grip: GRIP * (1 + 0.07 * u.grip),
      wear: (1 - 0.12 * u.tires) * (1 - 0.1 * u.whisper), brake: BRAKE * (1 + 0.15 * u.brakes),
      pitTime: PIT_TIME * Math.pow(0.8, u.pit), draft: 0.04 * (1 + 0.6 * u.craft),
    };
  }

  // AI tire choices: wets in the rain, otherwise a mix (short races favour fast tires)
  aiCompound(c) {
    if (this.wet > 0.45) return "wet";
    const r = Math.random(), shortRace = this.settings.laps <= 4;
    return r < (shortRace ? 0.45 : 0.25) ? "fast" : r < 0.7 ? "inter" : "durable";
  }
  startLights() {
    for (const c of this.cars) {
      const p = c.owner && this.players.get(c.owner);
      c.compound = p ? (p.compound || (this.wet > 0.45 ? "wet" : "inter")) : this.aiCompound(c);
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
      // everyone picked? start the lights early
      const humans = this.cars.filter((c) => c.owner);
      if (humans.every((c) => this.players.get(c.owner)?.compound)) this.tiresUntil = Math.min(this.tiresUntil, Date.now() + 800);
    } else p.nextCompound = key;          // goes on at your next pit stop
  }

  tick(realDt) {
    if (this.phase === "tires") { if (Date.now() >= this.tiresUntil) this.startLights(); return; }
    if (this.phase === "lights") {
      const now = Date.now();
      const n = Math.min(5, Math.floor((now - this.lightsStart) / 1000));
      if (n > this.lightsShown) { this.lightsShown = n; this.emit("lights", { n }); }
      if (now >= this.outAt) {
        this.phase = "race"; this.emit("lightsOut", {}); this.launchCars(now);
        // players who pressed early already know; auto slow start for anyone who never presses
      } else return;
    }
    if (this.phase !== "race") return;
    const steps = 2 * this.settings.speed;
    for (let s = 0; s < steps; s++) this.step(1 / 60);
  }

  step(dt) {
    this.time += dt;
    const t = this.track;
    // weather: dynamic rain comes and goes, the track slowly gets wet or dries out
    if (this.time > this.nextWeather) {
      this.raining = !this.raining; this.nextWeather = this.time + 30 + Math.random() * 50;
      this.emit("feed", { t: this.raining ? "rain" : "dry" });
    }
    if (this.nextWeather - this.time < 15 && !this.forecastSent) { this.forecastSent = true; this.emit("feed", { t: this.raining ? "forecastDry" : "forecastRain" }); }
    if (this.nextWeather - this.time >= 15) this.forecastSent = false;
    this.wet = clamp(this.wet + (this.raining ? 0.045 : -0.022) * dt, 0, 1);
    // passive XP: a small trickle while your driver is racing
    for (const p of this.players.values()) {
      const c = this.carOf(p.id); if (!c || c.finished) continue;
      if (this.time >= p.passiveAt) { p.passiveAt += PASSIVE_XP_EVERY; this.addXp(p, PASSIVE_XP, null); }
    }
    for (const c of this.cars) {
      if (this.time < c.launchAt) { c.vx = c.vy = 0; c.speed = 0; continue; }
      const input = c.finished ? { gas: false, brake: true, steer: 0 } : this.drive(c, dt);
      this.physics(c, input, dt);
      this.trackPos(c);
      if (c.owner && !c.onTrack && !c.inPit) c.cleanLap = false;
    }
    this.collide();
    // XP for overtakes, grouped per player
    const order = this.standings();
    for (const p of this.players.values()) {
      const c = this.carOf(p.id); if (!c || c.finished) continue;
      const pos = order.indexOf(c) + 1;
      if (pos < p.lastPos) {
        for (let i = pos; i < p.lastPos; i++) {
          const rival = order[i];
          if (this.time - (p.passCd.get(rival.id) || -99) > 8) { p.passCd.set(rival.id, this.time); this.addXp(p, 55, `${c.name} passed ${rival.name}! +55 XP`); }
        }
      } else if (pos > p.lastPos) {
        const by = order[pos - 2];
        if (by && this.time > 5 && this.time - (p.lostCd.get(by.id) || -99) > 8 && !c.pitting && c.aiMode !== "pitLane" && c.aiMode !== "pitOut") {
          p.lostCd.set(by.id, this.time); io.to(p.id).emit("toast", `${by.name} got past ${c.name}`);
        }
      }
      p.lastPos = pos;
    }
    // finish: everyone done, or 30 seconds after the winner
    const humansLeft = this.cars.some((c) => c.owner && !c.finished);
    if (!humansLeft || this.time > this.finishDeadline) this.endRace();
  }

  drive(c, dt) {
    const t = this.track, N = t.N;
    const input = { gas: false, brake: false, steer: 0 };
    const speed = Math.hypot(c.vx, c.vy);
    const p = c.owner ? this.players.get(c.owner) : null;
    const laps = this.settings.laps;
    const pl = t.pitLane, dryTires = c.compound !== "wet";
    if (p) {
      if (c.aiMode === "race" && p.boxCall) c.aiMode = "wantPit";
      if (c.aiMode === "wantPit" && !p.boxCall && !c.punct) c.aiMode = "race";
      // radio warnings (your driver won't pit on their own until the tire actually gives up)
      if (c.tire < 0.3 && p.warned < 1 && !p.boxCall) { p.warned = 1; io.to(p.id).emit("toast", `${c.name}: "Tires are going off, box soon!"`); }
      if (c.tire < 0.12 && p.warned < 2 && !p.boxCall) { p.warned = 2; io.to(p.id).emit("toast", `${c.name}: "These tires won't last, BOX NOW!"`); }
      if (this.wet > 0.5 && dryTires && !p.boxCall && p.rainWarn !== true) { p.rainWarn = true; io.to(p.id).emit("toast", `${c.name}: "It's soaking out here, I need wets!"`); }
      if (this.wet < 0.5) p.rainWarn = false;
    } else if (c.aiMode === "race" && c.lapsDone < laps - 1 && !c.finished) {
      const wrongTires = (this.wet > 0.55 && dryTires) || (this.wet < 0.2 && !dryTires);
      if (c.tire < c.pitAt || wrongTires) c.aiMode = "wantPit";
    }
    if (c.punct && c.aiMode === "race") c.aiMode = "wantPit";      // puncture: limp to the pits
    // turn into the pit lane when you reach its entry
    const kNow = laneK(t, c.idx);
    if (c.aiMode === "wantPit" && kNow >= 0 && kNow < 4) { c.aiMode = "pitLane"; c.laneKey = pl.boxes[c.team] ?? Math.round(pl.len / 2); }

    let tx, ty, targetSpeed;
    if (c.aiMode === "pitLane" || c.aiMode === "pitOut") {
      // drive down the pit lane at the speed limit, stop at your team's garage
      const k = kNow < 0 ? pl.len : kNow;
      const aim = lanePoint(t, Math.min(pl.len, k + 2.5));
      tx = aim.x; ty = aim.y; targetSpeed = PIT_LIMIT;
      if (c.aiMode === "pitLane") {
        const box = lanePoint(t, c.laneKey), db = Math.hypot(box.x - c.x, box.y - c.y);
        // a teammate is still in the box: queue behind them
        const busy = this.cars.some((o) => o !== c && o.team === c.team && o.pitting > 0);
        if (k >= c.laneKey - 3) { tx = box.x; ty = box.y; targetSpeed = busy ? Math.max(0, (db - 55) * 2) : clamp(db * 2.2, 0, PIT_LIMIT); }
        if (!busy && db < 22 && speed < 40) {
          c.pitting = this.stats(c).pitTime * (c.punct ? 1.4 : 1); c.pitTotal = c.pitting; c.aiMode = "pitting";
          c.vx = c.vy = 0;
          this.emit("feed", { t: "pit", name: c.name, id: c.id });
          if (p && c.tire < 0.35 && !c.punct) this.addXp(p, 30, "Well-timed pit stop +30 XP");
        }
      } else if (kNow < 0 || k >= pl.len - 1) c.aiMode = "race";
    } else {
      const look = 3 + Math.floor(Math.max(0, speed) / 95);
      const i = (c.idx + look) % N;
      // pull out of the racing line to pass a slower car, then drift back onto it
      const spot = 90 + 25 * c.up.craft;
      if (c.laneT > 0) c.laneT -= dt;
      else c.lane *= Math.exp(-dt * 1.2);
      for (const o of this.cars) {
        if (o === c) continue;
        const rx = o.x - c.x, ry = o.y - c.y;
        const ahead = rx * Math.cos(c.heading) + ry * Math.sin(c.heading);
        const sideSigned = -rx * Math.sin(c.heading) + ry * Math.cos(c.heading);
        if (ahead > 0 && ahead < spot && Math.abs(sideSigned) < 26 && Math.hypot(o.vx, o.vy) < speed) {
          const nx = t.nor[c.idx].x, ny = t.nor[c.idx].y;
          const theirSide = rx * nx + ry * ny;                       // which side of me they are on
          c.lane = theirSide > 0 ? -34 : 34; c.laneT = 1.1; break;
        }
      }
      const lim = TRACK_W / 2 - 16;
      const off = clamp(t.line[i] + c.lane + c.lineJit, -lim, lim);
      tx = t.pts[i].x + t.nor[i].x * off; ty = t.pts[i].y + t.nor[i].y * off;
      const lookCorner = 6 - Math.min(3, c.up.late);
      let v = Infinity;
      for (let k = 0; k < lookCorner; k++) v = Math.min(v, t.vmax[(c.idx + k) % N]);
      const pace = c.skill * (1 + 0.04 * c.up.corner) * (p ? ORDERS[p.order].speed : 1) * this.compoundSpeed(c);
      targetSpeed = Math.min(v * pace * Math.sqrt(this.tireGrip(c.tire) * this.weatherGrip(c)), MAX_SPEED * Math.min(1.1, pace));
      if (c.punct) targetSpeed = Math.min(targetSpeed, 190);
      if (v < MAX_SPEED * 0.75 && c.mistakeT <= 0) {
        let rate = p ? 0.1 * (1 - 0.3 * c.up.focus) * ORDERS[p.order].mistakes : 0.06;
        if (dryTires) rate *= 1 + 4 * this.wet;          // slicks in the rain = spins
        if (c.tire < 0.25) rate *= 2;
        if (p && p.order === "push" && c.tire < 0.45) rate *= 1.6;   // pushing on worn tires is asking for trouble
        if (Math.random() < rate * dt) {
          const pushing = p && p.order === "push";
          c.mistakeT = pushing ? 0.85 : 0.55;              // pushing mistakes are bigger
          c.mistakeDir = Math.random() < 0.5 ? -1 : 1;
          this.emit("feed", { t: "mistake", name: c.name, id: c.id });
        }
      }
    }
    const diff = wrapAngle(Math.atan2(ty - c.y, tx - c.x) - c.heading);
    input.steer = clamp(diff * 2.4, -1, 1);
    if (c.mistakeT > 0) { c.mistakeT -= dt; input.steer = clamp(input.steer * 0.2 + c.mistakeDir * 0.7, -1, 1); }
    const vF = c.vx * Math.cos(c.heading) + c.vy * Math.sin(c.heading);
    if (vF < targetSpeed) input.gas = true; else if (vF > targetSpeed + 35) input.brake = true;
    if (Math.abs(diff) > 1.3 && vF > 150) { input.gas = false; input.brake = true; }
    if (c.aiMode !== "pitting" && c.aiMode !== "pitLane" && speed < 25) c.stuck += dt; else c.stuck = 0;
    if (c.stuck > 1.4) { c.reverseT = 0.9; c.stuck = 0; }
    if (c.reverseT > 0) { c.reverseT -= dt; input.gas = false; input.brake = true; input.steer = -input.steer; }
    return input;
  }
  tireGrip(w) { return 0.45 + 0.55 * Math.sqrt(Math.max(0, w)); }
  compoundSpeed(c) { return COMPOUNDS[c.compound].speed * (c.compound === "wet" ? 1 : 1 - 0.1 * this.wet); }
  // how much grip the weather leaves you: slicks slide a lot in the wet, wets are fine
  weatherGrip(c) { return COMPOUNDS[c.compound].grip * (c.compound === "wet" ? 1 : 1 - 0.55 * this.wet); }
  tireSpeed(w) { return w <= 0 ? 0.62 : 0.86 + 0.14 * Math.min(1, w * 3); }

  physics(c, input, dt) {
    const st = this.stats(c), t = this.track;
    const fx = Math.cos(c.heading), fy = Math.sin(c.heading);
    let vF = c.vx * fx + c.vy * fy, vS = -c.vx * fy + c.vy * fx;
    if (c.pitting > 0) {
      c.vx = c.vy = 0; c.pitting -= dt;
      if (c.pitting <= 0) {
        const p = c.owner && this.players.get(c.owner);
        c.compound = p ? (p.nextCompound || c.compound) : (this.wet > 0.45 ? "wet" : this.aiCompound(c));
        c.tire = 1; c.pits++; c.aiMode = "pitOut"; c.punct = false;
        if (p) { p.boxCall = false; p.warned = 0; p.compound = c.compound; io.to(p.id).emit("toast", `${COMPOUNDS[c.compound].name} tires on! Go go go!`); }
      }
      return;
    }
    let maxSp = st.maxSpeed * this.tireSpeed(c.tire) * this.compoundSpeed(c), accel = st.accel;
    // puncture: the car crawls and slides everywhere until it gets to the pits
    if (c.punct) { maxSp *= 0.33; accel *= 0.4; }
    c.drafting = false;
    for (const o of this.cars) {
      if (o === c) continue;
      const dx = o.x - c.x, dy = o.y - c.y, ahead = dx * fx + dy * fy, side = Math.abs(-dx * fy + dy * fx);
      if (ahead > 40 && ahead < 170 && side < 28 && vF > 300) { c.drafting = true; break; }
    }
    if (c.drafting) maxSp *= 1 + st.draft;
    c.boosting = this.time < c.boostUntil;
    if (c.boosting) { accel *= 1.8; maxSp *= 1.08; }
    // surfaces: 0 track, 1 kerb, 2 grass, 3 gravel, 4 pit lane
    if (c.surface === 1) maxSp *= 0.97;
    else if (c.surface === 2) maxSp *= 0.55;
    else if (c.surface === 3) { maxSp *= 0.3; vF *= Math.exp(-2.4 * dt); vS *= Math.exp(-3 * dt); }
    if (input.gas) { if (vF < maxSp) vF += accel * dt; }
    else if (input.brake) { if (vF > 20) vF -= st.brake * dt; else if (vF > -REVERSE_MAX) vF -= accel * 0.6 * dt; }
    else vF -= vF * 0.55 * dt;
    if (vF > maxSp) vF -= Math.min(vF - maxSp, (c.surface >= 2 && c.surface < 4 ? 900 : 300) * dt);
    const speedFrac = clamp(Math.abs(vF) / 180, 0, 1), hi = 1 - 0.28 * clamp(Math.abs(vF) / MAX_SPEED, 0, 1);
    c.heading += input.steer * TURN_RATE * speedFrac * hi * Math.sign(vF || 1) * dt;
    let grip = st.grip * this.tireGrip(c.tire) * this.weatherGrip(c);
    if (c.surface === 2) grip *= 0.55; else if (c.surface === 3) grip *= 0.4;
    if (c.punct) { grip *= 0.35; c.heading += (Math.random() - 0.5) * 0.9 * dt; }
    vS *= Math.exp(-grip * dt);
    const nfx = Math.cos(c.heading), nfy = Math.sin(c.heading);
    c.vx = nfx * vF - nfy * vS; c.vy = nfy * vF + nfx * vS;
    c.x = clamp(c.x + c.vx * dt, 20, t.W - 20); c.y = clamp(c.y + c.vy * dt, 20, t.H - 20);
    const moved = Math.hypot(c.vx, c.vy) * dt, slide = Math.abs(vS);
    let wear = (this.wearPerLap / t.length) * moved * (1 + clamp(slide / 110, 0, 3)) * WEAR_LEVELS[this.settings.wear];
    if (input.brake && vF > 250) wear *= 1.4;
    const p = c.owner && this.players.get(c.owner);
    if (p) wear *= ORDERS[p.order].wear;
    const C = COMPOUNDS[c.compound];
    wear *= c.compound === "wet" ? C.dryWear + (C.wear - C.dryWear) * clamp(this.wet * 1.6, 0, 1) : C.wear;   // wets cook on a dry track
    if (c.surface === 3) wear *= 2;
    const before = c.tire;
    c.tire = Math.max(0, c.tire - wear * st.wear);
    if (c.tire <= 0 && before > 0 && !c.punct) {
      c.punct = true;
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
    if (bestD > TRACK_W * 1.3) {
      let g = best, gd = Infinity;
      for (let i = 0; i < N; i++) { const d = (t.pts[i].x - c.x) ** 2 + (t.pts[i].y - c.y) ** 2; if (d < gd) { gd = d; g = i; } }
      let delta = g - c.idx; if (delta > N / 2) delta -= N; if (delta < -N / 2) delta += N;
      if (Math.abs(delta) < 40) { best = g; bestD = Math.sqrt(gd); }
    }
    const delta = best - c.idx;
    // a lap only counts the FIRST time a car gets that far (being shoved back over the line and
    // crossing it again must not count as another lap)
    if (delta < -N / 2) { c.lapsDone++; if (c.lapsDone > (c.maxLaps ?? -1)) { c.maxLaps = c.lapsDone; this.onLap(c); } }
    else if (delta > N / 2) c.lapsDone--;
    c.idx = best;
    const lat = (c.x - t.pts[best].x) * t.nor[best].x + (c.y - t.pts[best].y) * t.nor[best].y, al = Math.abs(lat);
    const k = laneK(t, best), pl = t.pitLane;
    const inLane = k >= 0 && Math.sign(lat) === pl.side && Math.abs(al - pl.off * rampLane(pl, k)) < 34 && al > TRACK_W / 2 - 5;
    c.surface = inLane ? 4 : al < TRACK_W / 2 ? 0 : al < TRACK_W / 2 + 16 ? 1 : (t.gravel[best] && Math.sign(lat) === t.gravel[best] && al < TRACK_W / 2 + 140) ? 3 : 2;
    c.inPit = c.surface === 4;
    c.onTrack = c.surface <= 1 || c.surface === 4;
    c.progress = c.lapsDone * N + c.idx;
    // remember when this car passed each timing point (for gap times)
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
    }
    c.lapStart = this.time; c.cleanLap = true;
    if (c.lapsDone >= this.settings.laps && !c.finished) {
      c.finished = true; c.finishTime = this.time;
      if (this.finishDeadline === Infinity) { this.finishDeadline = this.time + 30; this.emit("feed", { t: "winner", name: c.name }); }
    }
  }

  collide() {
    const cs = this.cars;
    for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) {
      const a = cs[i], b = cs[j];
      if (a.pitting > 0 || b.pitting > 0) continue;
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), min = CAR_R * 2;
      if (d > 0 && d < min) {
        // Contact: cars push against each other instead of bouncing apart.
        // Overlap is corrected gently, and the closing speed is simply shared (no rebound),
        // with a little speed lost to the hit so contact always costs something.
        const nx = dx / d, ny = dy / d, push = Math.min(3, (min - d) / 2);
        a.x -= nx * push; a.y -= ny * push; b.x += nx * push; b.y += ny * push;
        const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (rel < 0) {
          const imp = -rel * 0.5;                                        // inelastic: no bounce
          a.vx -= nx * imp; a.vy -= ny * imp; b.vx += nx * imp; b.vy += ny * imp;
          const loss = 1 - Math.min(0.06, -rel / 2500);                  // harder hits cost more
          a.vx *= loss; a.vy *= loss; b.vx *= loss; b.vy *= loss;
        }
      }
    }
  }

  standings() {
    return [...this.cars].sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished) return -1; if (b.finished) return 1;
      return b.progress - a.progress;
    });
  }

  // ----- XP + upgrade cards -----
  addXp(p, amount, label) {
    p.xp += amount;
    if (label) io.to(p.id).emit("xp", { label });      // passive XP arrives quietly (no pop-up)
    while (p.xp >= xpForLevel(p.level)) { p.xp -= xpForLevel(p.level); p.level++; p.pendingPicks++; io.to(p.id).emit("levelUp", { level: p.level }); }
    if (p.pendingPicks > 0 && !p.offer) this.makeOffer(p);
  }
  makeOffer(p) {
    const opts = Object.keys(UPGRADES).filter((k) => p.up[k] < UPGRADES[k].max);
    for (let i = opts.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [opts[i], opts[j]] = [opts[j], opts[i]]; }
    p.offer = opts.slice(0, 3);
    if (!p.offer.length) { p.offer = null; p.pendingPicks = 0; return; }
    io.to(p.id).emit("offer", { pending: p.pendingPicks, cards: p.offer.map((k) => ({ key: k, ...UPGRADES[k], level: p.up[k] })) });
  }
  // Upgrades you haven't picked never expire: send them again whenever needed.
  resendOffer(p) {
    if (p.offer) io.to(p.id).emit("offer", { pending: p.pendingPicks, cards: p.offer.map((k) => ({ key: k, ...UPGRADES[k], level: p.up[k] })) });
    else if (p.pendingPicks > 0) this.makeOffer(p);
  }
  // Leave the race: the AI takes over your car and you go back to the room.
  retire(p) {
    const c = this.carOf(p.id);
    if (!c || this.phase === "lobby" || this.phase === "results") return;
    c.owner = null; c.retiredBy = p.id; c.name = c.name + " (AI)";
    c.aiReaction = 0.3;                                         // in case they left during the start lights
    if (this.phase === "race" && this.time < c.launchAt) c.launchAt = this.time + 0.3;
    p.boxCall = false;
    this.emit("feed", { t: "retire", name: p.name });
    io.to(p.id).emit("retired");
  }
  pick(p, i) {
    if (!p.offer) return;
    const k = p.offer[Number(i)]; if (!k) return;
    p.up[k]++; p.offer = null; p.pendingPicks--;
    io.to(p.id).emit("picked", { key: k, up: p.up });
    if (p.pendingPicks > 0) this.makeOffer(p);
  }

  endRace() {
    if (this.phase !== "race") return;
    this.phase = "results";
    const order = this.standings();
    const table = this.settings.points;
    const rows = order.map((c, i) => {
      const pts = table[i] || 0;
      this.champ[c.name] = (this.champ[c.name] || 0) + pts;
      if (c.team) this.teamChamp[c.team] = (this.teamChamp[c.team] || 0) + pts;
      return { name: c.name, team: c.team, color: c.color, livery: c.livery, number: c.number, owner: c.owner || c.retiredBy || null, best: isFinite(c.bestLap) ? c.bestLap : null, pits: c.pits, pts, finished: c.finished, time: c.finishTime };
    });
    this.emit("results", { rows, champ: this.champOrder(), teamChamp: this.teamOrder(), raceNo: this.raceNo });
    // back to the lobby after the podium
    setTimeout(() => {
      if (this.phase === "results") {
        this.phase = "lobby"; this.cars = null; this.sendLobby();
        for (const p of this.players.values()) this.resendOffer(p);
      }
    }, 12000);
  }

  // Gap from each car to the car directly ahead, in seconds.
  // -1 means "a lap or more behind".
  gaps(order) {
    const N = this.track.N;
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

  sendState() {
    if (!this.cars || (this.phase !== "race" && this.phase !== "lights" && this.phase !== "tires")) return;
    const r2 = (v) => Math.round(v * 100) / 100;
    const cars = this.cars.map((c) => [
      c.id, Math.round(c.x), Math.round(c.y), r2(c.heading), Math.round(c.speed), r2(c.tire), c.lapsDone,
      c.pits, c.pitting > 0 ? r2(1 - c.pitting / (c.pitTotal || 1)) : -1, c.mistakeT > 0 ? 1 : 0, c.finished ? 1 : 0,
      c.slide > 70 && c.onTrack ? 1 : 0, c.onTrack ? 1 : 0, c.boosting ? 1 : 0, Math.round(c.progress), isFinite(c.bestLap) ? r2(c.bestLap) : 0,
      COMPOUNDS[c.compound].short, c.punct ? 1 : 0, c.surface, c.inPit ? 1 : 0,
    ]);
    const order = this.standings();
    const weather = { raining: this.raining, wet: r2(this.wet), change: isFinite(this.nextWeather) ? Math.max(0, Math.round(this.nextWeather - this.time)) : -1 };
    const base = { weather, t: r2(this.time), phase: this.phase, fastest: isFinite(this.fastest) ? r2(this.fastest) : 0, cars, standings: order.map((c) => c.id), gaps: this.gaps(order) };
    for (const p of this.players.values()) {
      const c = this.carOf(p.id);
      io.to(p.id).emit("state", { ...base, me: c ? { id: c.id, order: p.order, box: p.boxCall, level: p.level, xp: p.xp, need: xpForLevel(p.level), lapStart: r2(c.lapStart), up: p.up, compound: c.compound, next: p.nextCompound, picked: p.compound } : null });
    }
  }
}

// ======================= Connections =======================
io.on("connection", (socket) => {
  const room = () => rooms.get(socket.data.room);
  const me = () => { const r = room(); return r ? r.players.get(socket.id) : null; };
  const isHost = () => { const r = room(); return r && r.hostId === socket.id; };
  const leave = () => { const r = room(); if (r) { socket.leave(r.code); r.removePlayer(socket.id); } socket.data.room = null; };

  socket.on("create", (profile) => { leave(); const r = new Room(makeCode()); rooms.set(r.code, r); r.addPlayer(socket, profile); });
  socket.on("join", (d) => {
    const r = rooms.get(String(d?.code || "").toUpperCase().trim());
    if (!r) return socket.emit("joinError", "No room with that code");
    if (r.players.size >= MAX_PLAYERS) return socket.emit("joinError", "That room is full (6 players max)");
    leave(); r.addPlayer(socket, d.profile);
  });
  socket.on("profile", (prof) => { const r = room(), p = me(); if (!p) return; Object.assign(p, cleanProfile(prof)); r.sendLobby(); });
  socket.on("settings", (s) => {
    const r = room(); if (!r || !isHost() || r.phase !== "lobby") return;
    const S = r.settings;
    if ([3, 5, 8, 10, 15].includes(Number(s?.laps))) S.laps = Number(s.laps);
    if (s?.ai !== undefined && Number.isFinite(Number(s.ai))) { S.ai = clamp(Math.round(Number(s.ai)), 0, MAX_AI); r.ensureRoster(S.ai); }
    if (s?.points !== undefined) { const p = parsePoints(s.points); if (p.length) S.points = p; }
    if (s?.teamColors !== undefined) S.teamColors = s.teamColors === true || s.teamColors === "on";
    if (["sunny", "rain", "dynamic"].includes(s?.weather)) S.weather = s.weather;
    if (["grass", "desert", "snow", "night"].includes(s?.theme)) { S.theme = s.theme; if (r.track) r.emit("track", r.trackMsg()); }
    if ([1, 2, 3].includes(Number(s?.speed))) S.speed = Number(s.speed);
    if (WEAR_LEVELS[s?.wear]) S.wear = s.wear;
    if (MAP_SIZES[s?.map] && !r.track) S.map = s.map;
    r.sendLobby();
  });
  socket.on("track", (d) => {
    const r = room(); if (!r || !isHost() || r.phase !== "lobby") return;
    const err = r.setTrack(d?.stroke, d?.map);
    socket.emit("trackResult", { error: err });
  });
  socket.on("clearTrack", () => { const r = room(); if (!r || !isHost() || r.phase !== "lobby") return; r.track = null; r.stroke = null; r.emit("track", null); r.sendLobby(); });
  // host renames an AI driver / changes their number or team
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
  socket.on("start", () => { const r = room(); if (r && isHost()) r.startRace(); });
  socket.on("react", (ms) => { const r = room(), p = me(); if (r && p) r.react(p, ms); });
  socket.on("order", (o) => { const p = me(); if (p && ORDERS[o]) p.order = o; });
  socket.on("box", () => {
    const r = room(), p = me(); if (!r || !p || r.phase !== "race") return;
    const c = r.carOf(p.id); if (!c || c.finished || c.pitting > 0 || c.aiMode === "pitLane" || c.aiMode === "pitOut") return;
    if (!p.boxCall && c.lapsDone >= r.settings.laps - 1) return socket.emit("toast", "Last lap: no time to pit!");
    p.boxCall = !p.boxCall;
  });
  socket.on("pick", (i) => { const r = room(), p = me(); if (r && p) r.pick(p, i); });
  socket.on("wantOffer", () => { const r = room(), p = me(); if (r && p) r.resendOffer(p); });
  socket.on("retire", () => { const r = room(), p = me(); if (r && p) r.retire(p); });
  // the host can hand the host role (drawing the track, settings, starting) to someone else
  socket.on("setHost", (id) => {
    const r = room(); if (!r || !isHost() || !r.players.has(id)) return;
    r.hostId = id; r.sendLobby();
    r.emit("toast", `${r.players.get(id).name} is the host now`);
  });
  socket.on("leave", leave);
  socket.on("disconnect", leave);
});

let last = Date.now();
setInterval(() => {
  const now = Date.now(), dt = (now - last) / 1000; last = now;
  for (const r of rooms.values()) { if (r.track) { r.tick(dt); r.sendState(); } }
}, 1000 / 30);

server.listen(PORT, () => console.log(`Scribble GP: Team Boss running at http://localhost:${PORT}`));
