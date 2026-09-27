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
const POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
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
  const world = pts.map((p) => ({ x: (p.x - minX) * SCALE + MARGIN, y: (p.y - minY) * SCALE + MARGIN }));
  const W = Math.ceil((maxX - minX) * SCALE + MARGIN * 2), H = Math.ceil((maxY - minY) * SCALE + MARGIN * 2);
  const N = world.length, tan = [], nor = [];
  for (let i = 0; i < N; i++) {
    const a = world[(i - 1 + N) % N], b = world[(i + 1) % N], L = dist(a, b) || 1;
    tan.push({ x: (b.x - a.x) / L, y: (b.y - a.y) / L });
    nor.push({ x: -(b.y - a.y) / L, y: (b.x - a.x) / L });
  }
  let length = 0; for (let i = 0; i < N; i++) length += dist(world[i], world[(i + 1) % N]);
  const spacing = length / N;
  // how fast you can take each part of the track
  const k = 3, vmax = [];
  for (let i = 0; i < N; i++) {
    const t1 = tan[(i - k + N) % N], t2 = tan[(i + k) % N];
    const turn = Math.abs(wrapAngle(Math.atan2(t2.y, t2.x) - Math.atan2(t1.y, t1.x)));
    vmax.push(Math.min(MAX_SPEED, Math.sqrt(1150 / (turn / (2 * k * spacing) + 1e-6))));
  }
  for (let pass = 0; pass < 2; pass++) for (let i = N - 1; i >= 0; i--) {
    const next = vmax[(i + 1) % N];
    vmax[i] = Math.min(vmax[i], Math.sqrt(next * next + 2 * 650 * spacing));
  }
  // pit box next to the start line on the roomier side
  const pitIdx = 4;
  let side = 1, bestRoom = -1;
  for (const sgn of [1, -1]) {
    const c = { x: world[pitIdx].x + nor[pitIdx].x * sgn * (TRACK_W / 2 + 70), y: world[pitIdx].y + nor[pitIdx].y * sgn * (TRACK_W / 2 + 70) };
    let room = Infinity;
    for (let i = 0; i < N; i++) { const di = Math.min(Math.abs(i - pitIdx), N - Math.abs(i - pitIdx)); if (di < 8) continue; room = Math.min(room, dist(world[i], c)); }
    if (room > bestRoom) { bestRoom = room; side = sgn; }
  }
  const pitDepth = 72, pitLen = 130;
  const pit = {
    x: world[pitIdx].x + nor[pitIdx].x * side * (TRACK_W / 2 + pitDepth / 2),
    y: world[pitIdx].y + nor[pitIdx].y * side * (TRACK_W / 2 + pitDepth / 2),
    ang: Math.atan2(tan[pitIdx].y, tan[pitIdx].x), len: pitLen, depth: pitDepth, side,
  };
  return { pts: world, tan, nor, N, length, spacing, vmax, W, H, pit, trackW: TRACK_W };
}
function inPitBox(t, x, y) {
  const p = t.pit, dx = x - p.x, dy = y - p.y, c = Math.cos(-p.ang), s = Math.sin(-p.ang);
  return Math.abs(dx * c - dy * s) < p.len / 2 && Math.abs(dx * s + dy * c) < p.depth / 2;
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
  };
}

class Room {
  constructor(code) {
    this.code = code;
    this.players = new Map();   // socket id -> team boss
    this.hostId = null;
    this.phase = "lobby";       // lobby | lights | race | results
    this.settings = { laps: 5, ai: 5, map: "normal", theme: "grass", speed: 1, wear: "normal" };
    this.stroke = null; this.track = null;
    this.champ = {};            // name -> points this session
    this.raceNo = 0;
  }
  emit(ev, d) { io.to(this.code).emit(ev, d); }
  lobbyMsg() {
    return {
      code: this.code, hostId: this.hostId, phase: this.phase, settings: this.settings, raceNo: this.raceNo,
      players: [...this.players.values()].map((p) => ({ id: p.id, name: p.name, color: p.color, livery: p.livery, number: p.number, level: p.level })),
      stroke: this.stroke, champ: this.champOrder(),
    };
  }
  sendLobby() { this.emit("lobby", this.lobbyMsg()); }
  champOrder() { return Object.entries(this.champ).map(([n, p]) => ({ n, p })).sort((a, b) => b.p - a.p); }

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
  trackMsg() { const t = this.track; return { pts: t.pts, tan: t.tan, nor: t.nor, N: t.N, W: t.W, H: t.H, pit: t.pit, length: t.length, trackW: t.trackW, theme: this.settings.theme }; }

  setTrack(stroke, map) {
    const board = MAP_SIZES[map] || MAP_SIZES.normal;
    const t = buildTrack(stroke, board);
    if (t.error) return t.error;
    this.track = t;
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
    const total = Math.min(12, humans.length + clamp(s.ai, 0, 9));
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
        lane: (Math.random() - 0.5) * 40, pitAt: 0.22 + Math.random() * 0.12, aiMode: "race", stuck: 0, reverseT: 0,
        cleanLap: true, launchAt: 0, boostUntil: 0, slide: 0, speed: 0,
      };
      if (slot.human) {
        const h = slot.human;
        Object.assign(base, { owner: h.id, name: h.name, color: h.color, livery: h.livery, number: h.number, up: h.up, skill: 0.9 });
        h.order = "normal"; h.boxCall = false; h.reaction = null; h.jump = false; h.lastPos = total; h.passCd = new Map(); h.lostCd = new Map();
      } else {
        const a = slot.ai;
        Object.assign(base, {
          owner: null, name: AI_NAMES[a % AI_NAMES.length], color: AI_COLORS[a % AI_COLORS.length],
          livery: LIVERIES[(a * 3 + 1) % LIVERIES.length], number: 10 + a * 7 % 90, up: blankUp(),
          // rivals get sharper as the season goes on and as the teams level up
          skill: 0.85 + Math.random() * 0.09 + Math.min(0.07, (this.raceNo - 1) * 0.006) + this.avgLevel() * 0.004,
          aiReaction: 0.18 + Math.random() * 0.3,
        });
      }
      this.cars.push(base);
    });
    this.time = 0; this.fastest = Infinity; this.finishDeadline = Infinity;
    this.wearPerLap = 1 / tireLifeLaps(s.laps);
    this.bucket = Math.max(1, Math.floor(t.N / 60));      // ~60 timing points per lap, used for gaps
    for (const c of this.cars) c.cp = new Map();
    // start lights: 5 lights, one per second, then a random pause before they go out
    this.phase = "lights";
    const now = Date.now();
    this.lightsStart = now;
    this.outAt = now + 5000 + 400 + Math.random() * 2000;
    this.lightsShown = 0;
    this.emit("race", { cars: this.cars.map((c) => ({ id: c.id, name: c.name, color: c.color, livery: c.livery, number: c.number, owner: c.owner })), laps: s.laps, raceNo: this.raceNo });
    for (const p of this.players.values()) this.resendOffer(p);     // unpicked upgrades are still waiting
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

  tick(realDt) {
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
        if (by && this.time > 5 && this.time - (p.lostCd.get(by.id) || -99) > 8 && !c.pitting && c.aiMode !== "pitIn") {
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
    if (p) {
      if (c.aiMode === "race" && p.boxCall) c.aiMode = "wantPit";
      if (c.aiMode === "race" && c.tire < 0.1 && c.lapsDone < laps - 1) {
        c.aiMode = "wantPit"; p.boxCall = true;
        io.to(p.id).emit("toast", `${c.name}: "Tires are gone, I'm coming in!"`);
      }
      if (c.aiMode === "wantPit" && !p.boxCall) c.aiMode = "race";
    } else if (c.aiMode === "race" && c.tire < c.pitAt && c.lapsDone < laps - 1) c.aiMode = "wantPit";
    if (c.aiMode === "wantPit" && (c.idx > N - 22 || c.idx < 3)) c.aiMode = "pitIn";

    let tx, ty, targetSpeed;
    if (c.aiMode === "pitIn") {
      tx = t.pit.x; ty = t.pit.y;
      const dp = Math.hypot(tx - c.x, ty - c.y);
      targetSpeed = dp < 45 ? 0 : clamp(dp * 1.4, 60, 260);
      if (c.inPit && speed < 30) {
        c.pitting = this.stats(c).pitTime; c.pitTotal = c.pitting; c.aiMode = "pitting";
        this.emit("feed", { t: "pit", name: c.name, id: c.id });
        // well-timed stop (tires were actually worn): bonus XP
        if (p && c.tire < 0.35) this.addXp(p, 30, "Well-timed pit stop +30 XP");
      }
    } else if (c.aiMode === "exit") {
      const i = 11 % N;
      tx = t.pts[i].x; ty = t.pts[i].y; targetSpeed = 260;
      if (c.onTrack && !c.inPit && c.idx >= 8 && c.idx < N / 2) c.aiMode = "race";
    } else {
      const look = 3 + Math.floor(Math.max(0, speed) / 95);
      const i = (c.idx + look) % N;
      const spot = 90 + 25 * c.up.craft;
      for (const o of this.cars) {
        if (o === c) continue;
        const ahead = (o.x - c.x) * Math.cos(c.heading) + (o.y - c.y) * Math.sin(c.heading);
        const side = Math.abs(-(o.x - c.x) * Math.sin(c.heading) + (o.y - c.y) * Math.cos(c.heading));
        if (ahead > 0 && ahead < spot && side < 26 && Math.hypot(o.vx, o.vy) < speed) { c.lane = c.lane > 0 ? -32 : 32; break; }
      }
      tx = t.pts[i].x + t.nor[i].x * c.lane; ty = t.pts[i].y + t.nor[i].y * c.lane;
      const lookCorner = 6 - Math.min(3, c.up.late);
      let v = Infinity;
      for (let k = 0; k < lookCorner; k++) v = Math.min(v, t.vmax[(c.idx + k) % N]);
      const pace = c.skill * (1 + 0.04 * c.up.corner) * (p ? ORDERS[p.order].speed : 1);
      targetSpeed = Math.min(v * pace * Math.sqrt(this.tireGrip(c.tire)), MAX_SPEED * Math.min(1.1, pace));
      if (v < MAX_SPEED * 0.75 && c.mistakeT <= 0) {
        let rate = p ? 0.1 * (1 - 0.3 * c.up.focus) * ORDERS[p.order].mistakes : 0.06;
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
    if (c.aiMode !== "pitting" && c.aiMode !== "pitIn" && speed < 25) c.stuck += dt; else c.stuck = 0;
    if (c.stuck > 1.4) { c.reverseT = 0.9; c.stuck = 0; }
    if (c.reverseT > 0) { c.reverseT -= dt; input.gas = false; input.brake = true; input.steer = -input.steer; }
    return input;
  }
  tireGrip(w) { return 0.45 + 0.55 * Math.sqrt(Math.max(0, w)); }
  tireSpeed(w) { return w <= 0 ? 0.62 : 0.86 + 0.14 * Math.min(1, w * 3); }

  physics(c, input, dt) {
    const st = this.stats(c), t = this.track;
    const fx = Math.cos(c.heading), fy = Math.sin(c.heading);
    let vF = c.vx * fx + c.vy * fy, vS = -c.vx * fy + c.vy * fx;
    if (c.pitting > 0) {
      c.vx = c.vy = 0; c.pitting -= dt;
      if (c.pitting <= 0) {
        c.tire = 1; c.pits++; c.aiMode = "exit";
        const p = c.owner && this.players.get(c.owner);
        if (p) { p.boxCall = false; io.to(p.id).emit("toast", "Fresh tires! Go go go!"); }
      }
      return;
    }
    let maxSp = st.maxSpeed * this.tireSpeed(c.tire), accel = st.accel * (c.tire <= 0 ? 0.6 : 1);
    c.drafting = false;
    for (const o of this.cars) {
      if (o === c) continue;
      const dx = o.x - c.x, dy = o.y - c.y, ahead = dx * fx + dy * fy, side = Math.abs(-dx * fy + dy * fx);
      if (ahead > 40 && ahead < 170 && side < 28 && vF > 300) { c.drafting = true; break; }
    }
    if (c.drafting) maxSp *= 1 + st.draft;
    c.boosting = this.time < c.boostUntil;
    if (c.boosting) { accel *= 1.8; maxSp *= 1.08; }
    if (!c.onTrack) maxSp *= 0.5;
    if (input.gas) { if (vF < maxSp) vF += accel * dt; }
    else if (input.brake) { if (vF > 20) vF -= st.brake * dt; else if (vF > -REVERSE_MAX) vF -= accel * 0.6 * dt; }
    else vF -= vF * 0.55 * dt;
    if (vF > maxSp) vF -= Math.min(vF - maxSp, (c.onTrack ? 300 : 900) * dt);
    const speedFrac = clamp(Math.abs(vF) / 180, 0, 1), hi = 1 - 0.28 * clamp(Math.abs(vF) / MAX_SPEED, 0, 1);
    c.heading += input.steer * TURN_RATE * speedFrac * hi * Math.sign(vF || 1) * dt;
    let grip = st.grip * this.tireGrip(c.tire);
    if (!c.onTrack) grip *= 0.55;
    vS *= Math.exp(-grip * dt);
    const nfx = Math.cos(c.heading), nfy = Math.sin(c.heading);
    c.vx = nfx * vF - nfy * vS; c.vy = nfy * vF + nfx * vS;
    c.x = clamp(c.x + c.vx * dt, 20, t.W - 20); c.y = clamp(c.y + c.vy * dt, 20, t.H - 20);
    const moved = Math.hypot(c.vx, c.vy) * dt, slide = Math.abs(vS);
    let wear = (this.wearPerLap / t.length) * moved * (1 + clamp(slide / 110, 0, 3)) * WEAR_LEVELS[this.settings.wear];
    if (input.brake && vF > 250) wear *= 1.4;
    const p = c.owner && this.players.get(c.owner);
    if (p) wear *= ORDERS[p.order].wear;
    c.tire = Math.max(0, c.tire - wear * st.wear);
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
    if (delta < -N / 2) { c.lapsDone++; this.onLap(c); } else if (delta > N / 2) c.lapsDone--;
    c.idx = best; c.inPit = inPitBox(t, c.x, c.y);
    c.onTrack = bestD < TRACK_W / 2 + 4 || c.inPit;
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
        const nx = dx / d, ny = dy / d, push = (min - d) / 2;
        a.x -= nx * push; a.y -= ny * push; b.x += nx * push; b.y += ny * push;
        const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (rel < 0) { const imp = -rel * 0.6; a.vx -= nx * imp; a.vy -= ny * imp; b.vx += nx * imp; b.vy += ny * imp; }
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
    io.to(p.id).emit("xp", { label });
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
    const rows = order.map((c, i) => {
      const pts = POINTS[i] || 0;
      this.champ[c.name] = (this.champ[c.name] || 0) + pts;
      return { name: c.name, color: c.color, livery: c.livery, number: c.number, owner: c.owner || c.retiredBy || null, best: isFinite(c.bestLap) ? c.bestLap : null, pits: c.pits, pts, finished: c.finished, time: c.finishTime };
    });
    this.emit("results", { rows, champ: this.champOrder(), raceNo: this.raceNo });
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
    if (!this.cars || (this.phase !== "race" && this.phase !== "lights")) return;
    const r2 = (v) => Math.round(v * 100) / 100;
    const cars = this.cars.map((c) => [
      c.id, Math.round(c.x), Math.round(c.y), r2(c.heading), Math.round(c.speed), r2(c.tire), c.lapsDone,
      c.pits, c.pitting > 0 ? r2(1 - c.pitting / (c.pitTotal || 1)) : -1, c.mistakeT > 0 ? 1 : 0, c.finished ? 1 : 0,
      c.slide > 70 && c.onTrack ? 1 : 0, c.onTrack ? 1 : 0, c.boosting ? 1 : 0, Math.round(c.progress), isFinite(c.bestLap) ? r2(c.bestLap) : 0,
    ]);
    const order = this.standings();
    const base = { t: r2(this.time), phase: this.phase, fastest: isFinite(this.fastest) ? r2(this.fastest) : 0, cars, standings: order.map((c) => c.id), gaps: this.gaps(order) };
    for (const p of this.players.values()) {
      const c = this.carOf(p.id);
      io.to(p.id).emit("state", { ...base, me: c ? { id: c.id, order: p.order, box: p.boxCall, level: p.level, xp: p.xp, need: xpForLevel(p.level), lapStart: r2(c.lapStart), up: p.up } : null });
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
    if (Number.isInteger(Number(s?.ai))) S.ai = clamp(Number(s.ai), 0, 9);
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
  socket.on("start", () => { const r = room(); if (r && isHost()) r.startRace(); });
  socket.on("react", (ms) => { const r = room(), p = me(); if (r && p) r.react(p, ms); });
  socket.on("order", (o) => { const p = me(); if (p && ORDERS[o]) p.order = o; });
  socket.on("box", () => {
    const r = room(), p = me(); if (!r || !p || r.phase !== "race") return;
    const c = r.carOf(p.id); if (!c || c.finished || c.pitting > 0 || c.aiMode === "pitIn") return;
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
