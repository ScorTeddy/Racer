// Automatic checks: run "npm test" before every update. They start the real server on a spare port,
// open the web pages, and play a whole (short, fast) race against the AI like a player would.
"use strict";
process.env.DATA_DIR = require("path").join(require("os").tmpdir(), "scribble-test-" + process.pid);
const test = require("node:test");
const assert = require("node:assert");
const { io } = require("socket.io-client");
const game = require("../server.js");
const accounts = require("../accounts.js");
const filter = require("../filter.js");

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
