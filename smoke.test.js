// Automatic checks: run "npm test" before every update. They start the real server on a spare port,
// open the web pages, and play a whole (short, fast) race against the AI like a player would.
"use strict";
process.env.DATA_DIR = require("path").join(require("os").tmpdir(), "scribble-test-" + process.pid);
const test = require("node:test");
const assert = require("node:assert");
const { io } = require("socket.io-client");
// (works whether this file sits next to server.js or in a test/ folder)
const ROOT = require("fs").existsSync(require("path").join(__dirname, "server.js")) ? "." : "..";
const game = require(ROOT + "/server.js");
const accounts = require(ROOT + "/accounts.js");
const filter = require(ROOT + "/filter.js");

let base;
test.before(async () => { await new Promise((ok) => game.server.listen(0, ok)); base = "http://localhost:" + game.server.address().port; });
test.after(() => { game.server.close(); setTimeout(() => process.exit(0), 200); });

test("pages load, with security headers", async () => {
  const home = await fetch(base + "/");
  assert.equal(home.status, 200);
  const csp = home.headers.get("content-security-policy");
  assert.match(csp, /script-src 'self'/);
  assert.doesNotMatch(csp.split(";").find((x) => x.includes("script-src")), /unsafe-inline/, "no inline scripts allowed");
  assert.equal(home.headers.get("x-powered-by"), null);
  assert.match(await home.text(), /game\.js\?v=/, "game.js is version-stamped");
  for (const p of ["/faq", "/privacy", "/robots.txt", "/sitemap.xml", "/game.js", "/game.css", "/og-image.png"]) assert.equal((await fetch(base + p)).status, 200, p);
  assert.equal((await fetch(base + "/nope-" + Date.now())).status, 404);
  assert.equal((await fetch(base + "/.env")).status, 404);
});

test("bad names are filtered", () => {
  assert.ok(filter.isBad("sh1thead"));
  assert.ok(!filter.isBad("Classic Racing"), "no false alarm on 'class'");
  assert.ok(!filter.isBad("Ace"));
});

test("weak passwords are refused", async () => {
  await assert.rejects(accounts.checkPassword("short", "bob"));
  await assert.rejects(accounts.checkPassword("Password1234", "bob"));
  await accounts.checkPassword("Turbo-Fox-Lane-42", "bob");
});

test("a whole race: room, random track, start, finish, results", { timeout: 150000 }, async () => {
  const s = io(base, { transports: ["websocket"], forceNew: true });
  const got = (ev) => new Promise((ok) => s.once(ev, ok));
  await got("connect");
  s.emit("create", { name: "Tester" }, {});
  await got("joined");
  s.emit("settings", { ai: 3, laps: 1, speed: 3, map: "small", weather: "sunny", quali: 0 });
  s.emit("randomTrack", { map: "small" });
  const t = await got("trackResult");
  assert.ok(!t.error, "random track built: " + t.error);
  s.on("tirePick", () => s.emit("compound", "fast"));
  s.on("lightsOut", () => s.emit("react", 250));
  s.emit("start");
  const race = await got("race");
  assert.equal(race.cars.length, 4, "1 player + 3 AI");
  let states = 0; s.on("state", () => states++);
  const res = await got("results");
  assert.ok(states > 30, "the race was running");
  assert.equal(res.rows.length, 4);
  assert.ok(res.rows.every((r) => typeof r.name === "string"));
  s.close();
});

test("random tracks at every wonkiness", { timeout: 60000 }, () => {
  for (const w of ["little", "regular", "very"]) for (let i = 0; i < 3; i++) {
    const r = game.makeRandomTrack(game.MAP_SIZES.normal, w);
    assert.ok(r && r.shape && !r.shape.error, `${w} random track built`);
  }
});

test("super rare cards upgrade everything and everyone hears about it", { timeout: 60000 }, async () => {
  assert.equal(game.rollRareCard(0.000005).key, "__max");
  assert.equal(game.rollRareCard(0.00005).key, "__all2");
  assert.equal(game.rollRareCard(0.0005).key, "__all1");
  assert.equal(game.rollRareCard(0.5), null);
  const s = io(base, { transports: ["websocket"], forceNew: true });
  const got = (ev) => new Promise((ok) => s.once(ev, ok));
  await got("connect");
  s.emit("create", { name: "Lucky" }, {});
  const j = await got("joined");
  s.emit("settings", { ai: 1, laps: 3, speed: 1, map: "small", quali: 0 });
  s.emit("randomTrack", { map: "small" });
  await got("trackResult");
  s.on("tirePick", () => s.emit("compound", "fast"));
  s.emit("start");
  await got("race");
  const r = game.rooms.get(j.code), p = r.players.get(s.id);
  p.up.engine = 4; p.offer = ["corner", "__all2", "turbo"]; p.pendingPicks = 1;
  const heard = got("rareCard");
  s.emit("pick", 1);
  const picked = await got("picked");
  assert.equal(picked.rare, "legendary");
  assert.equal(p.up.engine, 5, "capped at the max");
  assert.equal(p.up.corner, 2);
  const rc = await heard;
  assert.equal(rc.tier, "legendary");
  assert.equal(r.carOf(s.id).rare, "legendary", "the car gets its aura");
  s.close();
});

test("chat: room and team messages, filtered, global needs sign-in", { timeout: 30000 }, async () => {
  const a = io(base, { transports: ["websocket"], forceNew: true }), b = io(base, { transports: ["websocket"], forceNew: true });
  const got = (s, ev) => new Promise((ok) => s.once(ev, ok));
  await Promise.all([got(a, "connect"), got(b, "connect")]);
  a.emit("create", { name: "Ann" }, {});
  const j = await got(a, "joined");
  b.emit("join", { code: j.code, profile: { name: "Bo" } });
  await got(b, "joined");
  const msg = got(b, "chat");
  a.emit("chat", { ch: "room", text: "  good   luck!  " });
  const m = await msg;
  assert.equal(m.text, "good luck!"); assert.equal(m.name, "Ann"); assert.equal(m.ch, "room");
  await new Promise((ok) => setTimeout(ok, 1000));
  const note = got(a, "chatNote");
  a.emit("chat", { ch: "room", text: "you sh1thead" });
  assert.match(await note, /friendly/);
  await new Promise((ok) => setTimeout(ok, 1000));
  const note2 = got(a, "chatNote");
  a.emit("chat", { ch: "global", text: "hi all" });
  assert.match(await note2, /Sign in/);
  a.close(); b.close();
});
