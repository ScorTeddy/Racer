// Scribble GP ad — deterministic canvas renderer. renderFrame(t) draws time t (seconds).
const W = 1920, H = 1080;
const cv = document.getElementById("c"), X = cv.getContext("2d");
const INK = "#23262d", PAPER = "#f7f3e6", RED = "#e2463c", YEL = "#f9d846", STICKY = "#fbe68a",
  BLUE = "#2f6fe0", GREEN = "#2f9e57", PURP = "#8b4fe0", ORNG = "#f28a22", TEAL = "#22b0c0",
  ROAD = "#9a9da3", GRASS = "#3f9e5c", TREE = "#bfe3b4";
const EMO = '"Noto Color Emoji"';
const F = (sz, fam = "PH") => (fam === "CV" ? `700 ${sz}px CV, ${EMO}` : `${sz}px ${fam}, ${EMO}`);

// ---------- math ----------
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const prog = (t, a, b) => clamp((t - a) / (b - a));
const eOut = x => 1 - Math.pow(1 - x, 3);
const eIn = x => x * x * x;
const eIO = x => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const eBack = (x, s = 1.9) => (x <= 0 ? 0 : x >= 1 ? 1 : 1 + (s + 1) * Math.pow(x - 1, 3) + s * Math.pow(x - 1, 2));
const smooth = x => x * x * (3 - 2 * x);
function hash(n) { n = Math.sin(n * 127.1 + 311.7) * 43758.5453; return n - Math.floor(n); }
const jit = (seed, amp) => (hash(seed) - 0.5) * 2 * amp;
let T = 0, BF = 0; // current time, boil frame (8 fps hand-drawn jitter)
const pop = (t0, d = 0.38, s = 2.2) => eBack(prog(T, t0, t0 + d), s);

// ---------- textures ----------
function mk(w, h) { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; }
const NOISE = mk(256, 256); {
  const c = NOISE.getContext("2d"); c.fillStyle = ROAD; c.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2600; i++) {
    const g = 110 + Math.floor(hash(i) * 90); c.fillStyle = `rgba(${g},${g},${g + 4},${0.25 + hash(i + 9) * 0.4})`;
    c.fillRect(hash(i + 1) * 256, hash(i + 2) * 256, 1 + hash(i + 3) * 2.2, 1 + hash(i + 4) * 2.2);
  }
}
let ROADPAT = null;
const GRAIN = mk(W, H); {
  const c = GRAIN.getContext("2d");
  for (let i = 0; i < 14000; i++) {
    c.fillStyle = `rgba(120,100,70,${0.03 + hash(i * 3.1) * 0.05})`;
    c.fillRect(hash(i * 1.7) * W, hash(i * 2.3) * H, 1 + hash(i) * 2, 1 + hash(i * 5) * 2);
  }
  const g = c.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, H * 1.05);
  g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(60,45,20,0.16)");
  c.fillStyle = g; c.fillRect(0, 0, W, H);
}

// ---------- drawing helpers ----------
function rr(c, x, y, w, h, r, seed = 0, amp = 0) {
  const j = i => (amp ? jit(seed * 13.7 + i + BF * 0.37, amp) : 0);
  const p = [[x + j(1), y + j(2)], [x + w + j(3), y + j(4)], [x + w + j(5), y + h + j(6)], [x + j(7), y + h + j(8)]];
  c.beginPath(); c.moveTo(p[0][0] + r, p[0][1]);
  c.lineTo(p[1][0] - r, p[1][1]); c.quadraticCurveTo(p[1][0], p[1][1], p[1][0], p[1][1] + r);
  c.lineTo(p[2][0], p[2][1] - r); c.quadraticCurveTo(p[2][0], p[2][1], p[2][0] - r, p[2][1]);
  c.lineTo(p[3][0] + r, p[3][1]); c.quadraticCurveTo(p[3][0], p[3][1], p[3][0], p[3][1] - r);
  c.lineTo(p[0][0], p[0][1] + r); c.quadraticCurveTo(p[0][0], p[0][1], p[0][0] + r, p[0][1]);
  c.closePath();
}
// hand-drawn box with the chunky offset shadow from the UI
function box(c, x, y, w, h, o = {}) {
  const r = o.r ?? 14, sh = o.sh ?? 8, seed = o.seed ?? 1, amp = o.amp ?? 1.6;
  if (sh) { rr(c, x + sh, y + sh, w, h, r, seed, amp); c.fillStyle = o.shc || INK; c.fill(); }
  rr(c, x, y, w, h, r, seed, amp); c.fillStyle = o.fill || "#fff"; c.fill();
  if (o.lw !== 0) { c.lineWidth = o.lw || 4; c.strokeStyle = o.stroke || INK; c.lineJoin = "round"; c.stroke(); }
}
function text(c, s, x, y, o = {}) {
  c.font = o.font || F(40); c.fillStyle = o.color || INK; c.textAlign = o.align || "left"; c.textBaseline = o.base || "alphabetic";
  if (o.stroke) { c.lineWidth = o.stroke; c.strokeStyle = o.sc || INK; c.lineJoin = "round"; c.strokeText(s, x, y); }
  c.fillText(s, x, y);
}
// text revealed left to right like it's being written
function writeText(c, s, x, y, p, o = {}) {
  if (p <= 0) return; c.save(); c.font = o.font || F(40);
  const w = c.measureText(s).width, al = o.align || "left";
  const x0 = al === "center" ? x - w / 2 : al === "right" ? x - w : x;
  c.beginPath(); c.rect(x0 - 20, y - 400, (w + 40) * p, 800); c.clip();
  text(c, s, x, y, o); c.restore(); return w;
}
function withT(c, x, y, rot, s, fn) { c.save(); c.translate(x, y); if (rot) c.rotate(rot); if (s !== 1) c.scale(s, s); fn(); c.restore(); }
function tape(c, x, y, w, rot) {
  withT(c, x, y, rot, 1, () => {
    c.fillStyle = "rgba(236,214,150,0.85)"; c.beginPath();
    c.moveTo(-w / 2, -16); for (let i = 0; i <= 6; i++) c.lineTo(-w / 2 + (w * i) / 6, -16 + (i % 2 ? 3 : 0));
    c.lineTo(w / 2 + 3, 16); for (let i = 6; i >= 0; i--) c.lineTo(-w / 2 + (w * i) / 6, 16 - (i % 2 ? 3 : 0));
    c.closePath(); c.fill();
    c.strokeStyle = "rgba(180,150,80,0.3)"; c.lineWidth = 1; c.stroke();
  });
}
function sticky(c, x, y, w, h, rot, col = STICKY, o = {}) {
  withT(c, x + w / 2, y + h / 2, rot, o.s ?? 1, () => {
    const sd = o.sd ?? 10;
    c.fillStyle = `rgba(40,30,10,${o.sa ?? 0.22})`; c.beginPath();
    c.moveTo(-w / 2 + sd, -h / 2 + sd); c.lineTo(w / 2 + sd, -h / 2 + sd * 1.2); c.lineTo(w / 2 + sd * 0.6, h / 2 + sd * 1.6);
    c.lineTo(-w / 2 + sd * 1.4, h / 2 + sd); c.closePath(); c.fill();
    c.fillStyle = col; c.fillRect(-w / 2, -h / 2, w, h);
    const g = c.createLinearGradient(0, -h / 2, 0, h / 2); g.addColorStop(0, "rgba(255,255,255,0.18)"); g.addColorStop(1, "rgba(150,110,0,0.10)");
    c.fillStyle = g; c.fillRect(-w / 2, -h / 2, w, h);
    if (o.tape !== false) tape(c, 0, -h / 2, Math.min(200, w * 0.35), -0.03);
    if (o.draw) o.draw();
  });
}
function arrowPath(c, pts, p, col = RED, lw = 4) {
  // pts: quadratic bezier [x0,y0,cx,cy,x1,y1], drawn to progress p, with head at the end
  if (p <= 0) return; const [x0, y0, cx, cy, x1, y1] = pts; const n = 30, m = Math.ceil(n * p);
  c.save(); c.strokeStyle = col; c.lineWidth = lw; c.lineCap = "round"; c.lineJoin = "round"; c.beginPath();
  let lx = x0, ly = y0, px = x0, py = y0;
  for (let i = 0; i <= m; i++) {
    const u = Math.min(i / n, p); const a = (1 - u) * (1 - u), b = 2 * (1 - u) * u, d = u * u;
    px = lx; py = ly; lx = a * x0 + b * cx + d * x1; ly = a * y0 + b * cy + d * y1;
    i ? c.lineTo(lx, ly) : c.moveTo(lx, ly);
  }
  c.stroke();
  if (p > 0.85) {
    const ang = Math.atan2(ly - py, lx - px), hs = 16 * clamp((p - 0.85) / 0.15);
    c.beginPath(); c.moveTo(lx - Math.cos(ang - 0.5) * hs, ly - Math.sin(ang - 0.5) * hs); c.lineTo(lx, ly);
    c.lineTo(lx - Math.cos(ang + 0.5) * hs, ly - Math.sin(ang + 0.5) * hs); c.stroke();
  }
  c.restore();
}
function highlighter(c, x, y, w, h, p, col = "rgba(249,216,70,0.75)", skew = -0.03) {
  if (p <= 0) return; c.save(); c.fillStyle = col; c.beginPath();
  const ww = w * eOut(p);
  c.moveTo(x, y + 4); c.lineTo(x + ww, y + ww * skew); c.lineTo(x + ww - 6, y + h + ww * skew); c.lineTo(x + 4, y + h);
  c.closePath(); c.fill(); c.restore();
}
function stampRing(c, x, y, r, col, lw, seed) {
  c.strokeStyle = col; c.lineWidth = lw; c.beginPath();
  for (let i = 0; i <= 44; i++) {
    const a = (i / 40) * Math.PI * 2, rr2 = r + jit(seed + i + BF * 0.1, 2.5);
    i ? c.lineTo(x + Math.cos(a) * rr2, y + Math.sin(a) * rr2) : c.moveTo(x + Math.cos(a) * rr2, y + Math.sin(a) * rr2);
  }
  c.stroke();
}
// stamp-in: big and faint -> slams to size
function stampIn(t0, d = 0.22) { const p = prog(T, t0, t0 + d); return { s: lerp(2.0, 1, eOut(p)) + (p >= 1 ? 0.06 * Math.exp(-(T - t0 - d) * 14) * Math.sin((T - t0 - d) * 40) : 0), a: clamp(p * 3), on: T >= t0 }; }

// ---------- track ----------
const CP = [[620, 850], [900, 858], [1180, 850], [1330, 815], [1395, 720], [1340, 590], [1320, 480], [1400, 360], [1450, 250], [1370, 180], [1230, 200], [1080, 250], [880, 250], [720, 300], [640, 400], [660, 500], [560, 580], [440, 650], [400, 760], [470, 840]];
const TR = (() => {
  const dense = [], n = CP.length;
  for (let i = 0; i < n; i++) {
    const p0 = CP[(i - 1 + n) % n], p1 = CP[i], p2 = CP[(i + 1) % n], p3 = CP[(i + 2) % n];
    for (let k = 0; k < 120; k++) {
      const t = k / 120, t2 = t * t, t3 = t2 * t;
      dense.push([0, 1].map(d => 0.5 * (2 * p1[d] + (-p0[d] + p2[d]) * t + (2 * p0[d] - 5 * p1[d] + 4 * p2[d] - p3[d]) * t2 + (-p0[d] + 3 * p1[d] - 3 * p2[d] + p3[d]) * t3)));
    }
  }
  dense.push(dense[0]);
  const cum = [0]; for (let i = 1; i < dense.length; i++) cum.push(cum[i - 1] + Math.hypot(dense[i][0] - dense[i - 1][0], dense[i][1] - dense[i - 1][1]));
  const L = cum[cum.length - 1], N = 3000, pts = []; let j = 0;
  for (let i = 0; i < N; i++) {
    const s = (i / N) * L; while (cum[j + 1] < s) j++;
    const u = (s - cum[j]) / (cum[j + 1] - cum[j]);
    pts.push({ x: lerp(dense[j][0], dense[j + 1][0], u), y: lerp(dense[j][1], dense[j + 1][1], u) });
  }
  for (let i = 0; i < N; i++) { const a = pts[(i - 3 + N) % N], b = pts[(i + 3) % N]; pts[i].a = Math.atan2(b.y - a.y, b.x - a.x); }
  for (let i = 0; i < N; i++) {
    let da = pts[(i + 8) % N].a - pts[(i - 8 + N) % N].a; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
    pts[i].k = da / ((16 / N) * L);
  }
  const path = new Path2D(); pts.forEach((p, i) => (i ? path.lineTo(p.x, p.y) : path.moveTo(p.x, p.y))); path.closePath();
  return { pts, L, N, path };
})();
function tp(s) {
  const L = TR.L, N = TR.N; s = ((s % L) + L) % L; const f = (s / L) * N, i = Math.floor(f) % N, u = f - Math.floor(f), a = TR.pts[i], b = TR.pts[(i + 1) % N];
  let da = b.a - a.a; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
  return { x: lerp(a.x, b.x, u), y: lerp(a.y, b.y, u), a: a.a + da * u };
}
function sNear(x, y) { let best = 0, bd = 1e9; TR.pts.forEach((p, i) => { const d = Math.hypot(p.x - x, p.y - y); if (d < bd) { bd = d; best = i; } }); return (best / TR.N) * TR.L; }
const START = sNear(900, 858);
const RW = 56;
// kerb runs on tight corners (outside edge)
const KERBS = (() => {
  const runs = []; let cur = null;
  TR.pts.forEach((p, i) => {
    if (Math.abs(p.k) > 0.0085) { const side = p.k > 0 ? -1 : 1; if (!cur || cur.side !== side) { cur = { side, idx: [] }; runs.push(cur); } cur.idx.push(i); }
    else cur = null;
  });
  return runs.filter(r => r.idx.length > 25).map(r => {
    const pth = new Path2D(); r.idx.forEach((i, k) => {
      const p = TR.pts[i], nx = -Math.sin(p.a) * r.side, ny = Math.cos(p.a) * r.side, o = RW / 2 + 2;
      k ? pth.lineTo(p.x + nx * o, p.y + ny * o) : pth.moveTo(p.x + nx * o, p.y + ny * o);
    }); return pth;
  });
})();
const DRS_A = sNear(1260, 205), DRS_B = sNear(800, 270);
const TREES = [[805, 525, 26], [850, 552, 18], [1160, 420, 24], [1010, 690, 22], [1043, 708, 14], [1210, 650, 19], [300, 400, 28], [250, 900, 22], [1600, 880, 26], [1645, 905, 16], [520, 980, 20], [1520, 120, 18]];
function partialPath(p) {
  const pth = new Path2D(), n = Math.floor(TR.N * p), i0 = Math.floor((START / TR.L) * TR.N);
  for (let k = 0; k <= n; k++) { const q = TR.pts[(i0 + k) % TR.N]; k ? pth.lineTo(q.x, q.y) : pth.moveTo(q.x, q.y); }
  return pth;
}
function grid(c, x0, y0, x1, y1, gs) {
  c.save(); c.lineWidth = gs > 20 ? 1.1 : 0.55; c.strokeStyle = "rgba(110,140,175,0.22)"; c.beginPath();
  for (let x = Math.floor(x0 / gs) * gs; x <= x1; x += gs) { c.moveTo(x, y0); c.lineTo(x, y1); }
  for (let y = Math.floor(y0 / gs) * gs; y <= y1; y += gs) { c.moveTo(x0, y); c.lineTo(x1, y); }
  c.stroke(); c.restore();
}
function hatchEllipse(c, cx, cy, rx, ry, col, step, p = 1) {
  if (p <= 0) return; c.save(); c.beginPath(); c.ellipse(cx, cy, rx * p, ry * p, -0.1, 0, Math.PI * 2); c.clip();
  c.strokeStyle = col; c.lineWidth = 1.6; c.beginPath();
  for (let k = -rx - ry; k < rx + ry; k += step) { c.moveTo(cx + k - ry, cy + ry); c.lineTo(cx + k + ry, cy - ry); }
  c.stroke(); c.restore();
}
function drawTree(c, x, y, r, s) {
  if (s <= 0) return; c.save(); c.translate(x, y); c.scale(s, s);
  c.fillStyle = "rgba(40,60,30,0.18)"; c.beginPath(); c.arc(4, 5, r, 0, 7); c.fill();
  c.fillStyle = TREE; c.strokeStyle = GRASS; c.lineWidth = 2.6; c.beginPath();
  for (let i = 0; i <= 24; i++) { const a = (i / 24) * 7; const q = r + jit(x + i + BF * 0.2, 1.1); i ? c.lineTo(Math.cos(a) * q, Math.sin(a) * q) : c.moveTo(q, 0); }
  c.fill(); c.stroke(); c.restore();
}
function checker(c, s, rows = 2, cols = 8, sz = RW / 8) {
  const p = tp(s); c.save(); c.translate(p.x, p.y); c.rotate(p.a);
  for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) {
    c.fillStyle = (r + k) % 2 ? INK : "#fff"; c.fillRect(-rows * sz / 2 + r * sz, -RW / 2 + k * sz, sz, sz);
  }
  c.strokeStyle = INK; c.lineWidth = 1.2; c.strokeRect(-rows * sz / 2, -RW / 2, rows * sz, RW); c.restore();
}
function grandstand(c, t, cheer = 0) {
  const x = 790, y = 905, w = 300, h = 58;
  c.save(); c.fillStyle = "rgba(35,38,45,0.85)"; rr(c, x + 5, y + 5, w, h, 6); c.fill();
  c.fillStyle = "#fff"; rr(c, x, y, w, h, 6); c.fill(); c.lineWidth = 3; c.strokeStyle = INK; c.stroke();
  c.beginPath(); c.rect(x, y, w, h); c.clip();
  const cols = [RED, BLUE, YEL, GREEN, PURP, ORNG, TEAL, "#f07aa8"];
  for (let r = 0; r < 3; r++) for (let k = 0; k < 24; k++) {
    const id = r * 31 + k, bob = cheer * Math.max(0, Math.sin(t * 14 + id * 1.7)) * 5;
    c.fillStyle = cols[id % 8]; c.beginPath(); c.arc(x + 9 + k * 12.3 + (r % 2) * 6, y + 13 + r * 17 - bob, 4.6, 0, 7); c.fill();
  }
  c.restore();
}
// full scenery + road. o: {road (0..1 inflate), deco (0..1), drs (0..1), pencil (0..1 draw progress), gs}
function drawWorld(c, o, cam) {
  const gs = o.gs || 24;
  const x0 = cam.x - W / 2 / cam.z - 50, x1 = cam.x + W / 2 / cam.z + 50, y0 = cam.y - H / 2 / cam.z - 50, y1 = cam.y + H / 2 / cam.z + 50;
  c.fillStyle = PAPER; c.fillRect(x0, y0, x1 - x0, y1 - y0);
  grid(c, x0, y0, x1, y1, gs);
  const deco = o.deco ?? 1;
  hatchEllipse(c, 985, 560, 255, 165, "rgba(63,158,92,0.35)", 9, deco);
  if (o.road > 0) {
    const rw = RW * eBack(o.road, 1.4);
    if (!ROADPAT) ROADPAT = c.createPattern(NOISE, "repeat");
    c.lineJoin = "round"; c.lineCap = "round";
    c.strokeStyle = INK; c.lineWidth = rw + 8; c.stroke(TR.path);
    c.strokeStyle = ROADPAT; c.lineWidth = rw; c.stroke(TR.path);
    if (deco > 0) {
      c.save(); c.globalAlpha = deco;
      KERBS.forEach(k => { c.lineCap = "butt"; c.strokeStyle = "#fff"; c.lineWidth = 7; c.stroke(k); c.setLineDash([9, 9]); c.strokeStyle = RED; c.stroke(k); c.setLineDash([]); });
      c.setLineDash([22, 20]); c.strokeStyle = "rgba(255,255,255,0.9)"; c.lineWidth = 3.2; c.stroke(TR.path); c.setLineDash([]);
      c.restore();
    }
    if (o.drs > 0) {
      const pth = new Path2D(), i0 = Math.floor((DRS_A / TR.L) * TR.N), i1 = Math.floor((DRS_B / TR.L) * TR.N), n = Math.floor((i1 - i0) * eOut(o.drs));
      for (let k = 0; k <= n; k++) { const q = TR.pts[i0 + k]; k ? pth.lineTo(q.x, q.y) : pth.moveTo(q.x, q.y); }
      c.save(); c.globalCompositeOperation = "multiply"; c.strokeStyle = "rgba(249,216,70,0.85)"; c.lineWidth = RW + 34; c.lineCap = "round"; c.stroke(pth); c.restore();
    }
    if (deco > 0.3) { c.save(); c.globalAlpha = clamp((deco - 0.3) / 0.3); checker(c, START); c.restore(); }
  }
  if (o.pencil > 0 && o.pencil < 1.01 && (o.road ?? 0) < 0.5) {
    c.save(); c.lineCap = "round"; c.lineJoin = "round"; c.strokeStyle = "#3b3e46"; c.lineWidth = 4; c.stroke(partialPath(o.pencil));
    c.globalAlpha = 0.35; c.lineWidth = 1.5; c.translate(1.5, -1.2); c.stroke(partialPath(o.pencil)); c.restore();
  }
  TREES.forEach((tr, i) => drawTree(c, tr[0], tr[1], tr[2], o.treeS ? o.treeS(i) : deco));
  if (deco > 0) { c.save(); c.globalAlpha = clamp(deco * 2); grandstand(c, T, o.cheer || 0); c.restore(); }
}
function pencilSprite(c, x, y, ang = -0.7, s = 1) {
  withT(c, x, y, ang, s, () => {
    // tip at origin, body extends to +x
    c.fillStyle = "rgba(40,30,10,0.18)"; c.beginPath(); c.moveTo(18, 18); c.lineTo(250, 30); c.lineTo(250, 56); c.lineTo(52, 42); c.fill();
    c.lineWidth = 3.5; c.strokeStyle = INK; c.lineJoin = "round";
    c.fillStyle = "#f2c9a0"; c.beginPath(); c.moveTo(0, 0); c.lineTo(46, -16); c.lineTo(46, 16); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = INK; c.beginPath(); c.moveTo(0, 0); c.lineTo(14, -5); c.lineTo(14, 5); c.closePath(); c.fill();
    c.fillStyle = YEL; c.fillRect(46, -16, 170, 32); c.strokeRect(46, -16, 170, 32);
    c.strokeStyle = "rgba(35,38,45,0.35)"; c.lineWidth = 2; c.beginPath(); c.moveTo(46, -5); c.lineTo(216, -5); c.moveTo(46, 6); c.lineTo(216, 6); c.stroke();
    c.lineWidth = 3.5; c.strokeStyle = INK; c.fillStyle = "#c9cdd3"; c.fillRect(216, -17, 22, 34); c.strokeRect(216, -17, 22, 34);
    c.fillStyle = "#f08aa3"; rr(c, 238, -16, 30, 32, 7); c.fill(); c.stroke();
  });
}

// ---------- cars ----------
function car(c, x, y, ang, col, num, o = {}) {
  withT(c, x, y, ang, o.s || 1, () => {
    const sp = o.speed ?? 0;
    if (sp > 0.05) {
      c.strokeStyle = o.boost ? "rgba(242,138,34,0.9)" : "rgba(35,38,45,0.55)"; c.lineCap = "round"; c.lineWidth = o.boost ? 2.4 : 1.6;
      [[-5, 0.9], [0, 1.25], [5, 0.75]].forEach(([yy, l], i) => {
        const L = (16 + 18 * l) * sp, off = ((T * 7 + i * 0.37) % 1) * 4;
        c.beginPath(); c.moveTo(-20 - off, yy); c.lineTo(-20 - off - L, yy); c.stroke();
      });
      if (o.boost) {
        const fl = 9 + Math.sin(T * 60) * 2.5;
        c.fillStyle = YEL; c.beginPath(); c.moveTo(-16, -3.5); c.lineTo(-16 - fl, 0); c.lineTo(-16, 3.5); c.fill();
        c.fillStyle = ORNG; c.beginPath(); c.moveTo(-16, -2); c.lineTo(-16 - fl * 0.55, 0); c.lineTo(-16, 2); c.fill();
      }
    }
    c.fillStyle = "rgba(30,30,40,0.22)"; rr(c, -14, -6, 32, 16, 7); c.fill();
    c.fillStyle = INK;
    [[-10, -8.6], [-10, 8.6], [8, -8.2], [8, 8.2]].forEach(([wx, wy]) => { rr(c, wx - 4.2, wy - 2.8, 8.4, 5.6, 2); c.fill(); });
    rr(c, -17, -8.5, 4.5, 17, 1.5); c.fill();
    rr(c, 13, -8, 3.4, 16, 1.4); c.fill();
    c.beginPath(); c.moveTo(-13.5, -6); c.lineTo(3, -6.6); c.quadraticCurveTo(12, -5.4, 17, -1.6); c.quadraticCurveTo(18.2, 0, 17, 1.6);
    c.quadraticCurveTo(12, 5.4, 3, 6.6); c.lineTo(-13.5, 6); c.quadraticCurveTo(-15.5, 0, -13.5, -6); c.closePath();
    c.fillStyle = col; c.fill(); c.lineWidth = 1.7; c.strokeStyle = INK; c.stroke();
    c.fillStyle = "rgba(255,255,255,0.28)"; c.beginPath(); c.ellipse(5, -2.8, 7, 1.4, 0, 0, 7); c.fill();
    c.beginPath(); c.arc(-3, 0, 4.7, 0, 7); c.fillStyle = "#fff"; c.fill(); c.lineWidth = 1.3; c.stroke();
    c.rotate(Math.PI / 2); c.fillStyle = INK; c.font = `${num.length > 1 ? 5.6 : 7}px PM`; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(num, 0, 3.4);
  });
}
const CARS = {
  nico: { name: "Nico", col: BLUE, num: "1" }, vex: { name: "Vex", col: PURP, num: "44" }, you: { name: "You", col: RED, num: "7" },
  lola: { name: "Lola", col: GREEN, num: "3" }, dex: { name: "Dex", col: ORNG, num: "21" }, yuki: { name: "Yuki", col: TEAL, num: "9" },
};
// keyframes: [time, offset along track relative to the pack, lane]
const KF = {
  nico: [[0, -20, -12], [14, -20, -12], [15.2, -22, 0], [18.4, -24, 0], [19.6, -34, 9], [22, -40, 5], [40, -40, 5]],
  vex: [[0, -55, 12], [14, -55, 12], [15.2, -52, 4], [16.0, -50, -6], [17.0, -78, -2], [19, -70, 4], [22, -66, 7], [40, -66, 7]],
  you: [[0, -90, -12], [14, -90, -12], [15.2, -88, -4], [15.9, -86, 8], [16.8, -58, 10], [17.4, -55, 0], [18.4, -52, -6], [19.0, -38, -12], [19.8, -10, -6], [21, -6, 0], [40, -6, 0]],
  lola: [[0, -125, -12], [14, -125, -12], [16, -118, -6], [18, -100, 6], [22, -110, 0], [40, -110, 0]],
  dex: [[0, -160, 12], [14, -160, 12], [16, -150, 4], [19, -135, -6], [22, -128, 2], [40, -128, 2]],
  yuki: [[0, -195, -12], [14, -195, -12], [17, -175, 0], [22, -160, 6], [40, -160, 6]],
};
function kf(arr, t) {
  if (t <= arr[0][0]) return [arr[0][1], arr[0][2]];
  for (let i = 0; i < arr.length - 1; i++) {
    const a = arr[i], b = arr[i + 1];
    if (t <= b[0]) { const u = smooth((t - a[0]) / (b[0] - a[0])); return [lerp(a[1], b[1], u), lerp(a[2], b[2], u)]; }
  }
  const l = arr[arr.length - 1]; return [l[1], l[2]];
}
function packS(t) {
  if (t < 14) return START;
  const dt = t - 14, a = 420, vm = 320, tv = vm / a;
  return START + (dt < tv ? 0.5 * a * dt * dt : 0.5 * a * tv * tv + vm * (dt - tv));
}
function packV(t) { return t < 14 ? 0 : Math.min(320, (t - 14) * 420); }
function raceState(t) {
  const base = packS(t), v = packV(t);
  return Object.keys(CARS).map(id => {
    const [off, lane0] = kf(KF[id], t), [off2, lane2] = kf(KF[id], t + 0.05);
    const lane = lane0 + (t > 14 ? Math.sin(t * 1.3 + id.length) * 1.2 : 0);
    const s = base + off, p = tp(s), nx = -Math.sin(p.a), ny = Math.cos(p.a);
    const dv = (off2 - off) / 0.05, ds = Math.max(40, v + dv);
    const yaw = Math.atan2((lane2 - lane0) / 0.05, ds);
    return { id, ...CARS[id], off, s, lane, x: p.x + nx * lane, y: p.y + ny * lane, a: p.a + yaw, speed: clamp(v / 320) * (1 + clamp(dv / 120, -0.3, 0.6)), boost: id === "you" && t > 15.9 && t < 17.4 };
  });
}
function order(t) { return raceState(t).sort((a, b) => b.off - a.off).map(c => c.id); }
function drawCars(c, cars, labels = 1) {
  cars.slice().sort((a, b) => a.off - b.off).forEach(k => car(c, k.x, k.y, k.a, k.col, k.num, { speed: k.speed, boost: k.boost }));
  if (labels > 0) cars.forEach(k => {
    c.save(); c.globalAlpha = labels; const lab = k.id === "you" ? "You" : k.name;
    const ly = (k.lane ?? -1) < 0 ? k.y - 20 : k.y + 30;
    text(c, lab, k.x + 4, ly, { font: F(15, "CV"), color: k.col, align: "center", stroke: 4, sc: PAPER });
    c.restore();
  });
}

// ---------- HUD pieces (screen space) ----------
function tyreIcon(c, x, y, r, letter, col = RED) {
  c.beginPath(); c.arc(x, y, r, 0, 7); c.fillStyle = INK; c.fill();
  c.beginPath(); c.arc(x, y, r * 0.72, -2.4, 1.6); c.strokeStyle = col; c.lineWidth = r * 0.16; c.stroke();
  c.beginPath(); c.arc(x, y, r * 0.5, 0, 7); c.fillStyle = "#fff"; c.fill();
  text(c, letter, x, y + r * 0.2, { font: F(r * 0.62, "PM"), align: "center" });
}
function leaderboard(c, t, inP) {
  if (inP <= 0) return;
  const x = lerp(-520, 34, eBack(inP, 1.3)), y = 34, w = 470, h = 392;
  c.save(); c.translate(x, y); c.rotate(-0.012);
  box(c, 0, 0, w, h, { r: 4, sh: 9, seed: 3, amp: 1.2 });
  c.fillStyle = "#e9eef7"; c.fillRect(3, 3, w - 6, 38);
  for (let i = 0; i < 12; i++) { c.beginPath(); c.arc(26 + i * 38, 22, 6, 0, 7); c.fillStyle = "#fff"; c.fill(); c.lineWidth = 2; c.strokeStyle = "#9aa6b8"; c.stroke(); }
  c.strokeStyle = "rgba(90,130,200,0.35)"; c.lineWidth = 1.5;
  for (let i = 0; i < 7; i++) { c.beginPath(); c.moveTo(6, 104 + i * 47); c.lineTo(w - 6, 104 + i * 47); c.stroke(); }
  c.strokeStyle = "rgba(226,70,60,0.45)"; c.beginPath(); c.moveTo(56, 44); c.lineTo(56, h - 4); c.stroke();
  text(c, "LAP 1 · GAP", 66, 80, { font: F(26, "PM"), color: "#55607a" });
  // row positions blended over time for smooth slides
  const ids = Object.keys(CARS), acc = {}; ids.forEach(i => (acc[i] = 0)); const S = 8;
  for (let k = 0; k < S; k++) order(t - 0.3 * (k / (S - 1))).forEach((id, i) => (acc[id] += i / S));
  const st = raceState(t), lead = Math.max(...st.map(s => s.off));
  const ordNow = order(t);
  ids.forEach(id => {
    const ry = 128 + acc[id] * 47, k = st.find(s => s.id === id), pos = ordNow.indexOf(id) + 1;
    if (id === "you") { c.fillStyle = "rgba(249,216,70,0.85)"; c.fillRect(30, ry - 32, w - 44, 42); }
    text(c, String(pos), 46, ry, { font: F(30, "PM"), align: "right" });
    c.beginPath(); c.arc(80, ry - 10, 9, 0, 7); c.fillStyle = k.col; c.fill(); c.lineWidth = 2.4; c.strokeStyle = INK; c.stroke();
    text(c, id === "you" ? "You (Ace)" : k.name, 102, ry, { font: F(30) });
    const gap = (lead - k.off) / 320 * 2.2;
    text(c, pos === 1 ? "—" : "+" + gap.toFixed(1), w - 74, ry, { font: F(26), color: pos === 2 ? RED : "#666", align: "right" });
    c.beginPath(); c.arc(w - 40, ry - 10, 15, 0, 7); c.fillStyle = "#fff"; c.fill(); c.lineWidth = 2.4; c.stroke();
    text(c, id === "yuki" ? "I" : id === "dex" ? "M" : "F", w - 40, ry - 1, { font: F(20, "PM"), align: "center" });
  });
  c.restore();
}
function posStamp(c, t) {
  const ord = order(t), pos = ord.indexOf("you") + 1;
  const changes = [14.65, 16.5, 19.35]; let last = 14.65; changes.forEach(ch => { if (t >= ch) last = ch; });
  const st = stampIn(last, 0.2); if (!st.on) return;
  withT(c, 1240, 108, -0.12, st.s, () => {
    c.globalAlpha = st.a; c.fillStyle = "rgba(255,255,255,0.6)"; c.beginPath(); c.arc(0, 0, 66, 0, 7); c.fill();
    stampRing(c, 0, 0, 66, RED, 7, 7); stampRing(c, 0, 0, 56, RED, 2.5, 19);
    text(c, "P" + pos, 2, 24, { font: F(66, "PM"), color: RED, align: "center" });
  });
  if (pos === 1 && t > 19.35) sparkles(c, 1240, 108, t - 19.35, 12, 120);
}
function sparkles(c, x, y, age, n, rad, cols = [YEL, RED, BLUE, GREEN]) {
  if (age < 0 || age > 1.2) return;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + hash(i) * 0.5, d = rad * eOut(clamp(age / 0.6)) * (0.7 + hash(i + 3) * 0.6), s = (1 - clamp(age / 1.2)) * (7 + hash(i + 7) * 6);
    withT(c, x + Math.cos(a) * d, y + Math.sin(a) * d, a, 1, () => {
      c.fillStyle = cols[i % cols.length]; c.beginPath();
      for (let k = 0; k < 8; k++) { const r = k % 2 ? s * 0.38 : s; c.lineTo(Math.cos(k * Math.PI / 4) * r, Math.sin(k * Math.PI / 4) * r); }
      c.closePath(); c.fill();
    });
  }
}
function lapSticky(c, t, inP, lapTxt = "LAP 1/8", sub = "best — · last —") {
  if (inP <= 0) return;
  const y = lerp(-220, 26, eBack(inP, 1.6));
  sticky(c, 800, y, 320, 128, -0.02, STICKY, { tape: false, draw: () => {
    text(c, lapTxt, 0, 12, { font: F(64, "PM"), align: "center" });
    text(c, sub, 0, 48, { font: F(24), align: "center", color: "#5b5236" });
  } });
}
function feedToast(c, i, t0, label, icon) {
  const p = prog(T, t0, t0 + 0.35); if (p <= 0) return;
  const x = lerp(1960, 1490, eBack(p, 1.4)), y = 330 + i * 64;
  box(c, x, y, 400, 50, { r: 10, sh: 5, seed: 30 + i, lw: 3 });
  text(c, icon + " " + label, x + 16, y + 34, { font: F(25) });
}
function minimap(c, t, inP) {
  if (inP <= 0) return; const s = eBack(inP, 1.6);
  withT(c, 1690, 140, 0.02, s, () => {
    box(c, -205, -115, 410, 230, { r: 14, sh: 8, seed: 41 });
    c.save(); c.translate(-205 + 38, -115 + 8); c.scale(0.25, 0.25); c.translate(-330, -130);
    c.lineWidth = 22; c.strokeStyle = INK; c.lineJoin = "round"; c.stroke(TR.path);
    raceState(t).forEach(k => { c.beginPath(); c.arc(k.x, k.y, 22, 0, 7); c.fillStyle = k.col; c.fill(); c.lineWidth = 6; c.strokeStyle = INK; c.stroke(); });
    c.restore();
  });
}
function tyrePanel(c, t, inP, wear) {
  if (inP <= 0) return; const y = lerp(1180, 820, eBack(inP, 1.3)), x = 34;
  c.save(); c.translate(x, y); c.rotate(-0.01);
  box(c, 0, 0, 430, 228, { r: 18, sh: 9, seed: 51 });
  tyreIcon(c, 74, 78, 46, "F");
  text(c, "FAST TYRES", 140, 62, { font: F(34, "PM") });
  text(c, `${Math.round(wear * 100)}% · ~${Math.max(1, Math.round(wear * 5))} laps left`, 140, 98, { font: F(25) });
  box(c, 140, 112, 260, 26, { r: 13, sh: 0, fill: "#fff", lw: 3, seed: 52 });
  c.save(); rr(c, 143, 115, 254 * wear, 20, 10); c.clip(); c.fillStyle = GREEN; c.fillRect(143, 115, 254, 20);
  c.strokeStyle = "rgba(255,255,255,0.35)"; c.lineWidth = 4; for (let k = 0; k < 20; k++) { c.beginPath(); c.moveTo(143 + k * 16, 140); c.lineTo(160 + k * 16, 110); c.stroke(); } c.restore();
  const boost = t < 15.9 ? 0.8 : t < 17.4 ? lerp(0.8, 0.12, (t - 15.9) / 1.5) : Math.min(0.8, 0.12 + (t - 17.4) * 0.08);
  text(c, "⚡ BOOST", 24, 178, { font: F(30, "PM") });
  text(c, Math.round(boost * 100) + "%", 400, 178, { font: F(25), align: "right" });
  box(c, 24, 188, 376, 24, { r: 12, sh: 0, lw: 3, seed: 53 });
  c.save(); rr(c, 27, 191, 370 * boost, 18, 9); c.clip(); c.fillStyle = YEL; c.fillRect(27, 191, 370, 18);
  c.strokeStyle = "rgba(242,138,34,0.6)"; c.lineWidth = 4; for (let k = 0; k < 30; k++) { c.beginPath(); c.moveTo(27 + k * 14 - ((t * 40) % 14), 212); c.lineTo(41 + k * 14 - ((t * 40) % 14), 188); c.stroke(); } c.restore();
  c.restore();
}
function hudButton(c, x, y, w, h, label, sub, fill, col, pressT, inP, seed) {
  if (inP <= 0) return; const yy = lerp(y + 300, y, eBack(inP, 1.5));
  const pr = pressT != null ? Math.max(0, 1 - Math.abs(T - pressT - 0.08) / 0.12) : 0, d = 6 * clamp(pr * 1.5);
  box(c, x, yy + d, w, h, { r: 16, sh: 8 - d, fill, seed });
  text(c, label, x + w / 2, yy + d + h / 2 + 8, { font: F(40, "PM"), align: "center", color: col });
  text(c, sub, x + w / 2, yy + d + h - 12, { font: F(20), align: "center", color: col === "#fff" ? "rgba(255,255,255,0.85)" : "#555" });
}
function caption(c, s, t0, t1, y = 300, size = 78) {
  if (T < t0 || T > t1 + 0.3) return;
  const pin = prog(T, t0, t0 + 0.4), pout = prog(T, t1, t1 + 0.3);
  c.save(); c.font = F(size, "PM"); const w = c.measureText(s).width;
  c.globalAlpha = 1 - pout; c.translate(W / 2, y - pout * 20);
  c.rotate(-0.02);
  c.fillStyle = "rgba(35,38,45,0.9)"; rr(c, -w / 2 - 34 + 8, -size * 0.82 + 8, (w + 68) * eOut(pin), size * 1.12, 10, 4, 1.5); c.fill();
  c.fillStyle = YEL; rr(c, -w / 2 - 34, -size * 0.82, (w + 68) * eOut(pin), size * 1.12, 10, 4, 1.5); c.fill();
  c.lineWidth = 4; c.strokeStyle = INK; c.stroke();
  writeText(c, s, 0, 0 + size * 0.03, prog(T, t0 + 0.08, t0 + 0.45), { font: F(size, "PM"), align: "center" });
  c.restore();
}

// ---------- transitions ----------
function scribbleWipe(c, p, col = YEL) {
  if (p <= 0 || p >= 1) return;
  const n = 34, pts = [];
  for (let i = 0; i <= n; i++) pts.push([-260 + i * 72 + jit(i, 10), i % 2 ? H + 160 : -160]);
  const a = p < 0.5 ? 0 : (p - 0.5) / 0.5, b = p < 0.5 ? p / 0.5 : 1;
  const i0 = eIO(a) * n, i1 = eIO(b) * n;
  c.save(); c.strokeStyle = col; c.lineWidth = 190; c.lineCap = "round"; c.lineJoin = "round"; c.beginPath();
  let started = false;
  for (let i = Math.floor(i0); i < Math.ceil(i1); i++) {
    const u0 = Math.max(0, i0 - i), u1 = Math.min(1, i1 - i);
    const A = pts[i], B = pts[i + 1];
    const x0 = lerp(A[0], B[0], u0), y0 = lerp(A[1], B[1], u0), x1 = lerp(A[0], B[0], u1), y1 = lerp(A[1], B[1], u1);
    if (!started) { c.moveTo(x0, y0); started = true; } else c.lineTo(x0, y0);
    c.lineTo(x1, y1);
  }
  c.stroke();
  c.strokeStyle = "rgba(35,38,45,0.12)"; c.lineWidth = 3; c.stroke(); c.restore();
}

// ---------- logo ----------
function logo(c, cx, cy, s, t0, opts = {}) {
  const word = "SCRIBBLE"; c.save(); c.translate(cx, cy); c.scale(s, s);
  c.font = F(200, "PM"); const ws = word.split("").map(ch => c.measureText(ch).width), tot = ws.reduce((a, b) => a + b, 0) - 16 * 7;
  c.font = F(200, "PM"); const gpw = c.measureText("GP").width; const full = tot + 50 + gpw;
  let x = -full / 2 - 60; const st = opts.stagger ?? 0.065;
  word.split("").forEach((ch, i) => {
    const p = eBack(prog(T, t0 + i * st, t0 + i * st + 0.32), 2.6), r = jit(i + 2, 0.08);
    if (p > 0) withT(c, x + ws[i] / 2, 0, r * (2 - p), p, () => text(c, ch, 0, 70, { font: F(200, "PM"), align: "center", color: INK }));
    x += ws[i] - 16;
  });
  x += 50; const tg = t0 + word.length * st + 0.05;
  const gs = stampIn(tg, 0.2);
  if (gs.on) withT(c, x + gpw / 2, 0, -0.05, gs.s, () => { c.globalAlpha = gs.a; text(c, "GP", 0, 70, { font: F(200, "PM"), align: "center", color: RED }); });
  // car parks next to it
  const tc = opts.carT ?? tg + 0.25, pc = prog(T, tc, tc + 0.55), cxr = x + gpw + 170;
  if (pc > 0) {
    const ex = lerp(-1500, cxr, eOut(pc)), bounce = pc >= 1 ? Math.exp(-(T - tc - 0.55) * 8) * Math.sin((T - tc - 0.55) * 30) * 6 : 0;
    car(c, ex + bounce, -22, 0, RED, "7", { s: 4.4, speed: pc < 1 ? 1 : clamp(1 - (T - tc - 0.55) * 3) });
    if (pc >= 1) { c.strokeStyle = INK; c.lineWidth = 7; c.lineCap = "round"; [-26, -2, 22].forEach((yy, i) => { const L = 46 - Math.abs(i - 1) * 12; c.beginPath(); c.moveTo(cxr - 110, yy - 22); c.lineTo(cxr - 110 - L, yy - 22); c.stroke(); }); }
  }
  c.restore();
}

// ---------- scenes ----------
function camWorld(c, cam, fn) { c.save(); c.translate(W / 2, H / 2); c.scale(cam.z, cam.z); c.rotate(cam.r || 0); c.translate(-cam.x, -cam.y); fn(); c.restore(); }

function sceneDraw(c, t) {
  // S1: draw the track
  const z = lerp(1, 1.035, eIO(prog(t, 0, 6))), cam = { x: 935, y: 545, z };
  const penP = eIO(prog(t, 0.35, 3.55)), road = prog(t, 3.6, 4.15);
  const treeT = i => pop(4.25 + (i % 6) * 0.125, 0.35, 2.4) * (i < 12 ? 1 : 0);
  camWorld(c, cam, () => {
    drawWorld(c, { pencil: penP, road, deco: prog(t, 4.0, 4.5), drs: prog(t, 4.5, 4.9), treeS: treeT, gs: 24 }, cam);
    // annotations in world space
    writeText(c, "DRS zone ⚡", 1010, 192, prog(t, 4.6, 5.0), { font: F(40, "CV"), color: "#b08a00" });
    writeText(c, "hairpin!", 1480, 150, prog(t, 5.15, 5.45), { font: F(44, "CV"), color: RED });
    arrowPath(c, [1530, 160, 1560, 210, 1490, 240], prog(t, 5.35, 5.65));
    writeText(c, "tight one!", 150, 640, prog(t, 4.95, 5.25), { font: F(44, "CV"), color: RED, align: "left" });
    arrowPath(c, [250, 655, 300, 720, 368, 745], prog(t, 5.15, 5.45));
    if (penP > 0 && penP < 1 && t < 3.7) {
      const n = Math.floor(TR.N * penP), q = TR.pts[(Math.floor((START / TR.L) * TR.N) + n) % TR.N];
      pencilSprite(c, q.x, q.y, -0.75 + Math.sin(t * 9) * 0.04, 0.85);
    } else if (t < 0.35) {
      const p = eOut(prog(t, 0, 0.35)), q = tp(START); pencilSprite(c, lerp(q.x + 500, q.x, p), lerp(q.y + 300, q.y, p), -0.75, 0.85);
    } else if (t >= 3.55 && t < 4.2) {
      const p = eIn(prog(t, 3.6, 4.1)), q = tp(START); pencilSprite(c, lerp(q.x, q.x + 700, p), lerp(q.y, q.y + 500, p), -0.75, 0.85);
    }
  });
  // caption
  c.save(); c.translate(84, 150); c.rotate(-0.025);
  const w = writeText(c, "Draw any track.", 0, 0, prog(t, 0.7, 1.6), { font: F(96, "PM") }) || 0;
  c.restore();
  c.save(); c.translate(84, 150); c.rotate(-0.025);
  arrowPath(c, [6, 22, 300, 40, 600, 18], 0, RED); // (unused head) keep underline separate
  const up = prog(t, 1.6, 1.95); if (up > 0) { c.strokeStyle = RED; c.lineWidth = 7; c.lineCap = "round"; c.beginPath(); c.moveTo(4, 24); c.quadraticCurveTo(300, 44, 4 + 690 * up, 16 + 6 * up); c.stroke(); }
  writeText(c, "(seriously, any track)", 10, 82, prog(t, 2.0, 2.5), { font: F(44, "CV"), color: "#6b6f78" });
  c.restore();
  // track notes sticky
  const sp = prog(t, 4.95, 5.2);
  if (sp > 0) {
    const s = lerp(1.3, 1, eOut(sp)) + (sp >= 1 ? Math.exp(-(t - 5.2) * 12) * Math.sin((t - 5.2) * 40) * 0.02 : 0);
    sticky(c, 1530, 330, 340, 330, 0.035, STICKY, { s, sd: lerp(30, 10, eOut(sp)), draw: () => {
      text(c, "TRACK NOTES", -150, -105, { font: F(34, "PM") });
      [["Length", "4.2 km"], ["Corners", "11"], ["Lap time", "~0:38"], ["Overtaking", "GOOD"]].forEach(([a, b], i) => {
        text(c, a, -150, -45 + i * 52, { font: F(30) }); text(c, b, 150, -45 + i * 52, { font: F(30, "PM"), align: "right", color: i === 3 ? GREEN : INK });
        c.strokeStyle = "rgba(90,80,40,0.35)"; c.setLineDash([3, 5]); c.lineWidth = 2; c.beginPath(); c.moveTo(-150, -32 + i * 52); c.lineTo(150, -32 + i * 52); c.stroke(); c.setLineDash([]);
      });
    } });
  }
}

function sceneLogo(c, t) {
  // big sticky slapped down at 6.0, peeled away 9.6-10.0
  const inP = prog(t, 5.72, 6.0), outP = eIn(prog(t, 9.62, 10.0));
  const s = lerp(1.35, 1, eIn(inP)) + (t > 6 ? Math.exp(-(t - 6) * 10) * Math.sin((t - 6) * 34) * 0.012 : 0) + lerp(0, 0.025, prog(t, 6, 9.6));
  c.save(); c.globalAlpha = clamp(inP * 2.5);
  c.translate(outP * 1500, -outP * 900); c.rotate(outP * 0.5);
  sticky(c, 150, 105, 1620, 870, -0.012, STICKY, { s, sd: lerp(60, 16, eIn(inP)), sa: 0.28, draw: () => {
    tape(c, -700, -420, 220, -0.6); tape(c, 700, -420, 220, 0.6);
    logo(c, -40, -95, 1.0, 6.05);
    const tb = stampIn(7.7, 0.2);
    if (tb.on) withT(c, -240, 150, -0.03, tb.s, () => {
      c.globalAlpha = tb.a; box(c, -230, -56, 460, 104, { r: 14, sh: 8, fill: INK, stroke: INK, seed: 61 });
      text(c, "TEAM BOSS", 0, 22, { font: F(70, "PM"), align: "center", color: "#fff" });
    });
    writeText(c, "draw it · run it · race it", 70, 175, prog(t, 8.05, 8.8), { font: F(54, "CV"), color: RED });
    writeText(c, "a multiplayer racing team manager", -10, 300, prog(t, 8.7, 9.3), { font: F(40), color: "#5b5236", align: "center" });
  } });
  c.restore();
}

function raceCam(t) {
  const st = raceState(t), you = st.find(k => k.id === "you"), ahead = tp(you.s + 45);
  const z = t < 14 ? lerp(2.3, 2.75, eIO(prog(t, 10, 14))) : lerp(2.75, 2.6, eOut(prog(t, 14, 15))) - lerp(0, 0.06, prog(t, 15.9, 16.4)) + lerp(0, 0.06, prog(t, 17.2, 17.8));
  const look = t < 14 ? 0 : clamp((t - 14) / 1.2);
  let x = lerp(you.x + 40, ahead.x, look), y = lerp(you.y - 30, ahead.y, look);
  const shake = Math.exp(-Math.max(0, t - 14) * 4) * (t > 14 ? 1 : 0) * 3;
  return { x: x + jit(Math.floor(t * 60), shake), y: y + jit(Math.floor(t * 60) + 5, shake), z };
}
function sceneRace(c, t, hud = true) {
  const cam = raceCam(t), st = raceState(t);
  camWorld(c, cam, () => {
    drawWorld(c, { road: 1, deco: 1, drs: 0, gs: 12 }, cam);
    // grid boxes
    [0, 1, 2, 3, 4, 5].forEach(i => {
      const p = tp(START - 20 - i * 35 - 12), lane = i % 2 ? 12 : -12, nx = -Math.sin(p.a), ny = Math.cos(p.a);
      withT(c, p.x + nx * lane, p.y + ny * lane, p.a, 1, () => { c.strokeStyle = "rgba(255,255,255,0.85)"; c.lineWidth = 1.8; c.beginPath(); c.moveTo(22, -9); c.lineTo(28, -9); c.lineTo(28, 9); c.lineTo(22, 9); c.stroke(); });
    });
    drawCars(c, st, 1);
    if (t < 14.6) { // that's you
      const you = st.find(k => k.id === "you"), p = prog(t, 10.9, 11.3), a = 1 - prog(t, 14.1, 14.5);
      c.save(); c.globalAlpha = a;
      const cp = prog(t, 11.0, 11.45); c.strokeStyle = RED; c.lineWidth = 2.6; c.lineCap = "round"; c.beginPath();
      for (let i = 0; i <= 60 * cp; i++) { const u = i / 50 * Math.PI * 2 - 2.2, r = 26 + i * 0.06; const xx = you.x + 1 + Math.cos(u) * r * 1.15, yy = you.y + Math.sin(u) * r * 0.85; i ? c.lineTo(xx, yy) : c.moveTo(xx, yy); }
      c.stroke();
      c.restore();
    }
  });
  if (!hud) return;
  // DRS glow
  const drsG = clamp(prog(t, 18.6, 18.9) - prog(t, 19.9, 20.3));
  if (drsG > 0) { c.save(); const g = c.createRadialGradient(W / 2, H / 2, H * 0.42, W / 2, H / 2, H * 0.95); g.addColorStop(0, "rgba(47,158,87,0)"); g.addColorStop(1, `rgba(47,158,87,${0.35 * drsG})`); c.fillStyle = g; c.fillRect(0, 0, W, H); c.restore(); }
  // lights gantry (S3)
  if (t < 14.6) {
    const gp = eBack(prog(t, 10.0, 10.45), 1.5), ga = 1 - prog(t, 14.2, 14.6);
    c.save(); c.globalAlpha = ga; c.translate(W / 2, lerp(-200, 150, gp) - prog(t, 14.2, 14.6) * 60);
    box(c, -330, -64, 660, 128, { r: 22, sh: 10, fill: INK, seed: 71 });
    for (let i = 0; i < 5; i++) {
      const on = t >= 11 + i * 0.5 && t < 14, ps = on ? lerp(0.7, 1, eBack(prog(t, 11 + i * 0.5, 11 + i * 0.5 + 0.2), 3)) : 1;
      withT(c, -240 + i * 120, 0, 0, ps, () => {
        c.beginPath(); c.arc(0, 0, 40, 0, 7); c.fillStyle = on ? RED : "#3a3e47"; c.fill(); c.lineWidth = 4; c.strokeStyle = "#555b66"; c.stroke();
        if (on) { c.beginPath(); c.arc(-11, -12, 10, 0, 7); c.fillStyle = "rgba(255,255,255,0.45)"; c.fill(); }
      });
    }
    c.restore();
    caption(c, "YOU'RE THE TEAM BOSS", 10.35, 13.6, 340, 84);
    const go = prog(t, 14.0, 14.5);
    if (go > 0 && go < 1) { c.save(); c.globalAlpha = 1 - go; withT(c, W / 2, 520, -0.05, lerp(0.6, 1.25, eOut(go)), () => text(c, "GO!", 0, 60, { font: F(220, "PM"), align: "center", color: GREEN, stroke: 14, sc: "#fff" })); c.restore(); }
  }
  if (t >= 14) {
    leaderboard(c, t, prog(t, 14.3, 14.75));
    lapSticky(c, t, prog(t, 14.45, 14.85), "LAP 1/8", "best — · go go go");
    posStamp(c, t);
    minimap(c, t, prog(t, 14.9, 15.25));
    tyrePanel(c, t, prog(t, 14.7, 15.1), lerp(1, 0.62, prog(t, 15, 21.5)));
    const bi = s => prog(t, s, s + 0.35);
    hudButton(c, 520, 935, 250, 96, "🛡️ DEFEND", "D", "#fff", INK, null, bi(14.85), 81);
    hudButton(c, 795, 925, 300, 110, "⚡ BOOST", "space", YEL, INK, 15.9, bi(14.95), 82);
    hudButton(c, 1120, 935, 290, 96, "🔧 BOX BOX", "B", RED, "#fff", 21.15, bi(15.05), 83);
    feedToast(c, 0, 17.0, "⚡ Fastest lap: Nico 0:37.2", "");
    feedToast(c, 1, 18.15, "🟩 DRS enabled", "");
    feedToast(c, 2, 20.0, "💥 Lola and Dex touch at T4!", "");
    caption(c, "FIRE YOUR BOOST", 15.35, 17.35, 290);
    caption(c, "HUNT THEM DOWN", 17.6, 19.85, 290);
    caption(c, "CALL THE PIT STOP", 20.1, 21.9, 290);
  }
}

// pit stop minigame card
const ARROWS = ["↑", "←", "→", "↓", "→", "↑"], HIT = [22.5, 22.75, 23.0, 23.25, 23.5, 23.75];
function arrowGlyph(c, dir, s, col) {
  const rot = { "↑": -Math.PI / 2, "↓": Math.PI / 2, "←": Math.PI, "→": 0 }[dir];
  withT(c, 0, 0, rot, s, () => {
    c.fillStyle = col; c.strokeStyle = INK; c.lineWidth = 4; c.lineJoin = "round";
    c.beginPath(); c.moveTo(-26, -10); c.lineTo(4, -10); c.lineTo(4, -24); c.lineTo(30, 0); c.lineTo(4, 24); c.lineTo(4, 10); c.lineTo(-26, 10); c.closePath(); c.fill(); c.stroke();
  });
}
function scenePit(c, t) {
  const inP = eBack(prog(t, 21.9, 22.3), 1.3), outP = eIn(prog(t, 25.55, 25.95));
  const y = lerp(1200, 540, inP) + outP * 900;
  withT(c, W / 2, y, -0.015, 1, () => {
    box(c, -470, -290, 940, 560, { r: 22, sh: 12, seed: 91 });
    tape(c, -380, -290, 160, -0.2); tape(c, 380, -290, 160, 0.2);
    text(c, "PIT STOP!", -400, -190, { font: F(86, "PM"), color: RED });
    text(c, "hit the arrows, fast!", -396, -135, { font: F(40, "CV"), color: "#6b6f78" });
    const done = HIT.filter(h => t >= h).length, tm = t < 22.35 ? 0 : t < 23.8 ? (t - 22.35) * 1.45 : 2.1;
    text(c, tm.toFixed(1) + "s", 400, -185, { font: F(80, "PM"), align: "right", color: t >= 23.8 ? GREEN : INK });
    ARROWS.forEach((d, i) => {
      const bx = -375 + i * 150, hitP = t >= HIT[i] ? prog(t, HIT[i], HIT[i] + 0.25) : 0, cur = i === done && t > 22.3;
      const s = t >= HIT[i] ? 1 + 0.22 * Math.sin(hitP * Math.PI) : cur ? 1 + 0.05 * Math.sin(t * 20) : 1;
      withT(c, bx, 10, 0, s, () => {
        box(c, -60, -60, 120, 120, { r: 18, sh: 6, fill: t >= HIT[i] ? GREEN : cur ? "#fff7c9" : "#fff", seed: 100 + i });
        arrowGlyph(c, d, 1.1, t >= HIT[i] ? "#fff" : INK);
      });
      if (t >= HIT[i]) sparkles(c, bx, 10, t - HIT[i], 8, 90, [GREEN, YEL]);
    });
    // crew fact line
    c.strokeStyle = "rgba(35,38,45,0.25)"; c.lineWidth = 2; c.setLineDash([6, 8]); c.beginPath(); c.moveTo(-420, 120); c.lineTo(420, 120); c.stroke(); c.setLineDash([]);
    const tp2 = pop(24.45, 0.35);
    if (tp2 > 0) withT(c, -230, 190, 0, tp2, () => { tyreIcon(c, -130, 0, 40, "F", RED); text(c, "fresh FAST tyres on!", -70, 14, { font: F(40), color: INK }); });
    const st = stampIn(24.0, 0.2);
    if (st.on) withT(c, 260, 175, -0.12, st.s, () => {
      c.globalAlpha = st.a; c.strokeStyle = GREEN; c.lineWidth = 8; rr(c, -175, -62, 350, 124, 16, 5, 2); c.stroke();
      text(c, "PERFECT!", 0, 26, { font: F(76, "PM"), align: "center", color: GREEN });
    });
  });
}

const CARDS = [
  { n: "1", icon: "🔩", t: "ENGINE", d: "+3% top speed", bg: "#fff" },
  { n: "2", icon: "🌀", t: "CORNER WIZARD", d: "+6% corner pace", bg: STICKY, rare: true },
  { n: "3", icon: "🛞", t: "TYRE WHISPERER", d: "-15% tyre wear", bg: "#fff" },
];
function sceneCards(c, t) {
  const outP = eIn(prog(t, 29.4, 29.8));
  const tp1 = prog(t, 26.0, 26.4);
  if (tp1 > 0) {
    c.save(); c.globalAlpha = 1 - outP;
    c.translate(W / 2, 200 - outP * 40); c.rotate(-0.02);
    writeText(c, "PICK AN UPGRADE", 0, 0, eOut(tp1), { font: F(100, "PM"), align: "center", stroke: 12, sc: PAPER });
    writeText(c, "new card every lap!", 300, 64, prog(t, 26.45, 26.9), { font: F(46, "CV"), color: RED });
    c.restore();
  }
  const pick = 27.6;
  CARDS.forEach((cd, i) => {
    const t0 = 26.25 + i * 0.25, p = eBack(prog(t, t0, t0 + 0.4), 1.4);
    if (p <= 0) return;
    const chosen = i === 1, cp = prog(t, pick, pick + 0.35);
    let x = W / 2 + (i - 1) * 400, y = lerp(1400, 640, p), rot = (i - 1) * 0.07 * p, s = 1;
    if (chosen) { y -= 60 * eBack(cp, 2) + 8 * Math.sin(t * 3) * cp; s = 1 + 0.14 * eBack(cp, 2); rot *= 1 - cp; }
    else { y += 520 * eIn(prog(t, pick + 0.1, pick + 0.55)); rot += (i - 1) * 0.3 * prog(t, pick + 0.1, pick + 0.55); }
    if (chosen) { y += 900 * outP; }
    withT(c, x, y, rot, s, () => {
      if (chosen && cp > 0) { c.save(); c.globalAlpha = cp * (0.5 + 0.2 * Math.sin(t * 8)); c.fillStyle = YEL; c.beginPath(); for (let k = 0; k < 24; k++) { const a = k * Math.PI / 12 + t * 0.6, r = k % 2 ? 230 : 330; c.lineTo(Math.cos(a) * r, Math.sin(a) * r); } c.fill(); c.restore(); }
      box(c, -160, -225, 320, 450, { r: 18, sh: 10, fill: cd.bg, seed: 120 + i });
      text(c, cd.n, -128, -180, { font: F(36, "PM") });
      text(c, cd.icon, 0, -40, { font: F(110), align: "center" });
      text(c, cd.t.split(" ")[0], 0, 60, { font: F(46, "PM"), align: "center" });
      if (cd.t.includes(" ")) text(c, cd.t.split(" ")[1], 0, 108, { font: F(46, "PM"), align: "center" });
      text(c, cd.d, 0, 170, { font: F(32), align: "center", color: "#555" });
      if (cd.rare) text(c, "★ rare!", 0, 208, { font: F(32, "CV"), align: "center", color: RED });
    });
    if (chosen) sparkles(c, x, y, t - pick, 16, 280);
  });
  // cursor
  const cp = prog(t, 26.95, 27.5);
  if (cp > 0 && t < 28.3) {
    const x = lerp(1500, W / 2 + 40, eIO(cp)), y = lerp(1000, 690, eIO(cp)), pr = t > 27.55 && t < 27.75 ? 0.85 : 1;
    withT(c, x, y, -0.3, pr * 1.1, () => {
      c.fillStyle = "#fff"; c.strokeStyle = INK; c.lineWidth = 4; c.lineJoin = "round";
      c.beginPath(); c.moveTo(0, 0); c.lineTo(0, 58); c.lineTo(14, 44); c.lineTo(26, 68); c.lineTo(36, 63); c.lineTo(24, 40); c.lineTo(44, 40); c.closePath(); c.fill(); c.stroke();
    });
  }
  const eq = stampIn(28.1, 0.2);
  if (eq.on && outP < 1) withT(c, W / 2 + 230, 380 + outP * 900, 0.16, eq.s, () => {
    c.globalAlpha = eq.a; c.strokeStyle = GREEN; c.lineWidth = 7; rr(c, -150, -46, 300, 92, 14, 9, 2); c.stroke();
    text(c, "EQUIPPED", 0, 20, { font: F(56, "PM"), align: "center", color: GREEN });
  });
}

const CHIPS = [["🌧️", "Rain & storms"], ["🌙", "Night races"], ["🏆", "Ranked seasons"], ["🗓️", "Championships"], ["💀", "Elimination"], ["🛢️", "Party mode"], ["👻", "Ghost duels"], ["🌍", "42 real-world layouts"]];
function sceneSocial(c, t, ox = 0) {
  c.save(); c.translate(ox, 0);
  c.fillStyle = PAPER; c.fillRect(-ox, 0, W, H); grid(c, -ox - 30, 0, W - ox + 30, H, 24);
  c.save(); c.translate(110, 190); c.rotate(-0.03);
  writeText(c, "RACE YOUR FRIENDS", 0, 0, prog(t, 30.25, 30.8), { font: F(104, "PM") });
  const up = prog(t, 30.8, 31.1); if (up > 0) { c.strokeStyle = RED; c.lineWidth = 8; c.lineCap = "round"; c.beginPath(); c.moveTo(6, 26); c.quadraticCurveTo(400, 46, 6 + 980 * up, 20); c.stroke(); }
  c.restore();
  // polaroids
  [["😎", "Ace", -0.06], ["🦊", "Lola", 0.05], ["🐸", "Nico", -0.03]].forEach(([e, n, r], i) => {
    const s = pop(30.5 + i * 0.125, 0.35, 2.4); if (s <= 0) return;
    withT(c, 200 + i * 230, 420, r, s, () => {
      c.fillStyle = "rgba(35,38,45,0.85)"; c.fillRect(-95 + 8, -110 + 8, 190, 225);
      c.fillStyle = "#fff"; c.fillRect(-95, -110, 190, 225); c.lineWidth = 3; c.strokeStyle = INK; c.strokeRect(-95, -110, 190, 225);
      c.fillStyle = ["#fde2c8", "#d8e6fb", "#d9f1d8"][i]; c.fillRect(-80, -95, 160, 150);
      text(c, e, 0, 18, { font: F(100), align: "center" });
      text(c, n, 0, 98, { font: F(40, "CV"), align: "center" });
    });
  });
  const ai = pop(30.875, 0.35, 2.4);
  if (ai > 0) withT(c, 880, 420, 0.04, ai, () => { box(c, -110, -50, 220, 100, { r: 50, sh: 7, seed: 140 }); text(c, "+60 AI", 0, 16, { font: F(52, "PM"), align: "center" }); });
  const rc = stampIn(31.1, 0.2);
  if (rc.on) withT(c, 380, 700, -0.025, rc.s, () => {
    c.globalAlpha = rc.a; box(c, -270, -62, 540, 124, { r: 62, sh: 8, seed: 141 });
    text(c, "Room  KX7Q  📋", 0, 20, { font: F(58, "PM"), align: "center" });
  });
  writeText(c, "up to 6 team bosses per room", 120, 860, prog(t, 31.3, 31.9), { font: F(58, "CV"), color: RED });
  writeText(c, "free · in your browser · phones too", 120, 935, prog(t, 31.8, 32.4), { font: F(44), color: "#5b5236" });
  // chips
  CHIPS.forEach(([e, n], i) => {
    const st = stampIn(31.5 + i * 0.25, 0.18); if (!st.on) return;
    const col = i % 2, row = Math.floor(i / 2), x = 1270 + col * 370 + (row % 2) * 20, y = 300 + row * 150;
    const wide = i === 7;
    withT(c, wide ? 1465 : x, y, jit(i + 50, 0.05), st.s, () => {
      c.globalAlpha = st.a; const w = wide ? 640 : 350;
      box(c, -w / 2, -52, w, 104, { r: 18, sh: 7, fill: [STICKY, "#fff", "#dff0ff", "#fff", "#ffe1dc", "#fff", "#eadff9", "#dff3e3"][i], seed: 150 + i });
      text(c, e + " " + n, 0, 13, { font: F(wide ? 40 : 32, "PM"), align: "center" });
    });
  });
  c.restore();
}

// finish line: own timeline with slow motion
const TW = (() => { const dt = 1 / 600, arr = [0]; let acc = 0; for (let t = 34; t < 41; t += dt) { const r = lerp(1, 0.13, smooth(prog(t, 35.8, 36.4))) + lerp(0, 0.87, smooth(prog(t, 38.05, 38.5))); acc += r * dt; arr.push(acc); } return arr; })();
const tau = t => TW[clamp(Math.round((t - 34) * 600), 0, TW.length - 1)];
function finishState(t) {
  const v = 330, base = START - v * tau(38.0) + v * tau(t);
  const defs = [["you", 6, -11], ["nico", 0, 11], ["vex", -70, -6], ["lola", -120, 8], ["dex", -160, -4], ["yuki", -205, 6]];
  return defs.map(([id, off, lane], i) => {
    const s = base + off + (id === "nico" ? Math.sin(tau(t) * 2) * 3 : 0), p = tp(s), nx = -Math.sin(p.a), ny = Math.cos(p.a);
    const ln = lane + Math.sin(tau(t) * 1.7 + i) * 1.4;
    return { id, ...CARS[id], off, s, lane: ln, x: p.x + nx * ln, y: p.y + ny * ln, a: p.a, speed: 1 };
  });
}
function finishCam(t) {
  const st = finishState(t), a = st[0], b = st[1];
  const z = lerp(1.9, 3.1, eIO(prog(t, 35.6, 37.9)));
  return { x: (a.x + b.x) / 2 + lerp(60, 14, prog(t, 35.6, 37.9)), y: (a.y + b.y) / 2 - 10, z };
}
function sceneFinishWorld(c, t) {
  const cam = finishCam(t), st = finishState(t);
  camWorld(c, cam, () => {
    drawWorld(c, { road: 1, deco: 1, gs: 12, cheer: t > 38 ? 1 : 0.25 }, cam);
    // waving flag at the line
    const fp = tp(START), nx = -Math.sin(fp.a), ny = Math.cos(fp.a), fx = fp.x - nx * 34, fy = fp.y - ny * 34;
    c.strokeStyle = INK; c.lineWidth = 3; c.beginPath(); c.moveTo(fx, fy); c.lineTo(fx, fy - 46); c.stroke();
    for (let r = 0; r < 3; r++) for (let k = 0; k < 5; k++) {
      const w1 = Math.sin(t * 9 - k * 0.8) * 3; c.fillStyle = (r + k) % 2 ? INK : "#fff";
      c.fillRect(fx + k * 6, fy - 46 + r * 6 + w1, 6.2, 6.2);
    }
    drawCars(c, st, 1);
  });
}
let PHOTO = null;
function sceneFinish(c, t) {
  if (t < 38.0) {
    sceneFinishWorld(c, t);
    // slow-mo treatment
    const sm = clamp(prog(t, 35.8, 36.3));
    if (sm > 0) {
      c.save(); c.globalAlpha = sm; c.fillStyle = INK; c.fillRect(0, 0, W, 90 * sm); c.fillRect(0, H - 90 * sm, W, 90 * sm); c.restore();
      c.save(); c.globalAlpha = sm * (0.7 + 0.3 * Math.sin(t * 6)); writeText(c, "photo finish..?", W - 120, H - 140, 1, { font: F(64, "CV"), color: RED, align: "right" }); c.restore();
    }
    lapSticky(c, t, prog(t, 34.05, 34.4) * (1 - prog(t, 35.7, 36.0)), "FINAL LAP", "it's all on the line");
    return;
  }
  // photo freeze
  if (!PHOTO) { PHOTO = mk(W, H); const pc = PHOTO.getContext("2d"); const keepT = T; T = 38.0; sceneFinishWorld(pc, 38.0); T = keepT; }
  // background: cheering paper
  c.fillStyle = PAPER; c.fillRect(0, 0, W, H); grid(c, 0, 0, W, H, 24);
  const p = eBack(prog(t, 38.08, 38.6), 1.4), s = lerp(1, 0.62, p), rot = lerp(0, -0.05, p);
  withT(c, lerp(W / 2, W / 2 - 230, p), lerp(H / 2, H / 2 - 10, p), rot, s, () => {
    const fw = W + 80, fh = H + 260;
    c.fillStyle = `rgba(35,38,45,${0.85 * p})`; c.fillRect(-fw / 2 + 16, -fh / 2 + 16, fw, fh);
    c.fillStyle = "#fff"; c.fillRect(-fw / 2, -fh / 2, fw, fh);
    c.drawImage(PHOTO, -W / 2, -fh / 2 + 40, W, H);
    c.lineWidth = 6; c.strokeStyle = INK; c.strokeRect(-fw / 2, -fh / 2, fw, fh);
    writeText(c, "P1 by 0.004s!", 0, fh / 2 - 60, prog(t, 38.7, 39.2), { font: F(120, "CV"), color: INK, align: "center" });
  });
  if (p > 0.2) tape(c, W / 2 - 230 + 20, H / 2 - 10 - 0.62 * (H + 260) / 2, 260, -0.08);
  // win stamp + trophy
  const ws = stampIn(38.55, 0.2);
  if (ws.on) withT(c, 1530, 330, 0.14, ws.s, () => {
    c.globalAlpha = ws.a; stampRing(c, 0, 0, 170, RED, 10, 3); stampRing(c, 0, 0, 148, RED, 3, 9);
    text(c, "🏆", 0, -30, { font: F(110), align: "center" });
    text(c, "WINNER", 0, 82, { font: F(76, "PM"), align: "center", color: RED });
  });
  writeText(c, "you called it, boss.", 1540, 640, prog(t, 39.0, 39.5), { font: F(58, "CV"), color: INK, align: "center" });
  // confetti
  for (let i = 0; i < 90; i++) {
    const t0 = 38.25 + (i % 3) * 0.12, age = t - t0; if (age < 0) continue;
    const side = i % 2 ? 1 : -1, vx = side * (-300 - hash(i) * 700), vy = -900 - hash(i + 1) * 700;
    const x = (side > 0 ? W + 20 : -20) + vx * age, y = H + 20 + vy * age + 900 * age * age;
    withT(c, x, y, age * (5 + hash(i + 2) * 8), 1, () => {
      c.fillStyle = [RED, YEL, BLUE, GREEN, PURP, ORNG, TEAL][i % 7]; c.fillRect(-8, -4 * Math.abs(Math.cos(age * 9 + i)), 16, 8 * Math.abs(Math.cos(age * 9 + i)) + 1);
    });
  }
  // flash
  const fl = 1 - prog(t, 38.0, 38.45); if (fl > 0) { c.fillStyle = `rgba(255,255,255,${fl})`; c.fillRect(0, 0, W, H); }
}

function sceneEnd(c, t) {
  c.fillStyle = PAPER; c.fillRect(0, 0, W, H); grid(c, 0, 0, W, H, 24);
  const drift = Math.sin(t * 0.8) * 4;
  logo(c, W / 2 + 40, 300 + drift, 1.12, 40.15, { stagger: 0.04, carT: 40.6 });
  const lines = [["Draw a track.", 40.85, INK], ["Run the team.", 41.35, INK], ["Race your friends.", 41.85, RED]];
  lines.forEach(([s, t0, col], i) => {
    const st = stampIn(t0, 0.18); if (!st.on) return;
    withT(c, 360 + i * 600, 560, jit(i + 70, 0.04), st.s, () => { c.globalAlpha = st.a; text(c, s, 0, 0, { font: F(i === 2 ? 70 : 64, "PM"), align: "center", color: col }); });
  });
  const bp = pop(42.4, 0.4, 2), press = Math.max(0, 1 - Math.abs(t - 43.25) / 0.12);
  if (bp > 0) withT(c, W / 2, 760, -0.015, bp, () => {
    const d = 7 * clamp(press * 1.5);
    box(c, -330, -78 + d, 660, 156, { r: 22, sh: 11 - d, fill: RED, seed: 171 });
    text(c, "RACE IT!  🏁", 0, 26 + d, { font: F(92, "PM"), align: "center", color: "#fff" });
  });
  const cp = prog(t, 42.75, 43.2);
  if (cp > 0 && t < 44.2) {
    const x = lerp(1450, W / 2 + 150, eIO(cp)), y = lerp(1060, 790, eIO(cp)), pr = t > 43.2 && t < 43.4 ? 0.85 : 1;
    c.save(); c.globalAlpha = 1 - prog(t, 43.8, 44.2);
    withT(c, x, y, -0.3, pr * 1.1, () => {
      c.fillStyle = "#fff"; c.strokeStyle = INK; c.lineWidth = 4; c.lineJoin = "round";
      c.beginPath(); c.moveTo(0, 0); c.lineTo(0, 58); c.lineTo(14, 44); c.lineTo(26, 68); c.lineTo(36, 63); c.lineTo(24, 40); c.lineTo(44, 40); c.closePath(); c.fill(); c.stroke();
    });
    c.restore();
  }
  if (t > 43.25) sparkles(c, W / 2, 760, t - 43.25, 18, 420);
  writeText(c, "Free to play · in your browser · on phones too", W / 2, 945, prog(t, 43.6, 44.3), { font: F(46), align: "center", color: "#5b5236" });
  writeText(c, "made by Emmett", W - 80, 1035, prog(t, 44.3, 44.8), { font: F(40, "CV"), align: "right", color: RED });
  // corner doodles
  const dp = prog(t, 40.3, 40.9);
  if (dp > 0) { tape(c, 120, 90, 200, -0.5); tape(c, W - 120, 90, 200, 0.5); }
}

// ---------- master timeline ----------
const RC = mk(W, H), RX = RC.getContext("2d");
function renderFrame(t) {
  T = t; BF = Math.floor(t * 8);
  const c = X; c.save();
  c.fillStyle = PAPER; c.fillRect(0, 0, W, H);
  if (t < 6.0) sceneDraw(c, t);
  if (t >= 5.72 && t < 10.0) {
    if (t >= 9.6) sceneRace(c, t, true);
    sceneLogo(c, t);
  } else if (t >= 10.0 && t < 21.9) {
    sceneRace(c, t, true);
  } else if (t >= 21.9 && t < 30.0) {
    // race keeps going, softened behind the overlay cards
    RX.save(); RX.clearRect(0, 0, W, H); sceneRace(RX, t, false); RX.restore();
    const dim = clamp(prog(t, 21.9, 22.3)) * (1 - prog(t, 29.8, 30.0) * 0);
    c.save(); c.filter = `blur(${(6 * dim).toFixed(1)}px)`; c.drawImage(RC, 0, 0); c.restore();
    c.fillStyle = `rgba(247,243,230,${0.55 * dim})`; c.fillRect(0, 0, W, H);
    if (t < 26.0) scenePit(c, t);
    else sceneCards(c, t);
  } else if (t >= 30.0 && t < 34.0) {
    sceneSocial(c, t, -eIO(prog(t, 33.6, 34.0)) * W);
  } else if (t >= 34.0 && t < 40.0) {
    sceneFinish(c, t);
  } else if (t >= 40.0) {
    sceneEnd(c, t);
  }
  // scene 7 -> 8 slide: draw finish coming in
  if (t >= 33.6 && t < 34.0) { c.save(); c.translate(W - eIO(prog(t, 33.6, 34.0)) * W, 0); sceneFinish(c, 34.0); c.restore(); }
  // wipes
  if (t >= 29.65 && t < 30.45) scribbleWipe(c, prog(t, 29.65, 30.45), YEL);
  if (t >= 39.65 && t < 40.45) scribbleWipe(c, prog(t, 39.65, 40.45), RED);
  c.drawImage(GRAIN, 0, 0);
  // fade in / out
  const fo = prog(t, 46.3, 47.0) + (1 - prog(t, 0, 0.25)) * 0.0;
  if (fo > 0) { c.fillStyle = `rgba(247,243,230,${fo})`; c.fillRect(0, 0, W, H); }
  c.restore();
}
window.renderFrame = renderFrame;
window.DUR = 47.0;
window.ready = document.fonts.ready.then(() => Promise.all(["PM", "PH", "700 CV"].map(f => document.fonts.load(`40px ${f.replace("700 ", "")}`.replace("40px CV", "700 40px CV"))))).then(() => true);
