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

test("a super rare card is announced to players in other rooms too", { timeout: 60000 }, async () => {
  const open = async () => { const s = io(base, { transports: ["websocket"], forceNew: true }); await new Promise((ok) => s.once("connect", ok)); return s; };
  const got = (s, ev) => new Promise((ok) => s.once(ev, ok));
  const a = await open(), other = await open();
  a.emit("create", { name: "Lucky2" }, {}); const j = await got(a, "joined");
  a.emit("settings", { ai: 1, laps: 3, speed: 1, map: "small", quali: 0 }); a.emit("randomTrack", { map: "small" }); await got(a, "trackResult");
  a.on("tirePick", () => a.emit("compound", "fast"));
  a.emit("start"); await got(a, "race");
  const r = game.rooms.get(j.code), p = r.players.get(a.id);
  p.offer = ["corner", "__all1", "turbo"]; p.pendingPicks = 1;
  const heard = got(other, "rareCardGlobal");         // "other" is just on the menu, not in that room
  a.emit("pick", 1);
  const g = await heard;
  assert.equal(g.name, "Lucky2"); assert.equal(g.tier, "epic");
  a.close(); other.close();
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

test("secret achievements: never listed, and worth 100,000 coins", async () => {
  assert.ok(!accounts.ACH.some((a) => a.id.startsWith("secret_")), "secrets are not in the public list");
  const u = await accounts.signUp("SecretTester", "Turbo-Fox-Lane-42").catch(() => null) || null;
  assert.ok(u && u.u, "made a test account");
  const user = u.u;
  const before = user.coins;
  const got = accounts.recordRace(user, { pos: 3, of: 6, humans: 1, grid: 3, finished: true, laps: 3, lapsDone: 3, km: 1, overtakes: 0, crashes: 0, cleanLaps: 0, slips: 0, boostSec: 0, pits: 0, best: 20, reaction: 300, level: 5, upgrades: 20, aiLevel: "medium", rare: "mythic", raceSec: 60, margin: 0 });
  const secret = got.find((a) => a.id === "secret_chosen");
  assert.ok(secret && secret.secret, "GOD MODE unlocks The Chosen One");
  assert.ok(user.coins - before >= 100000, "paid 100,000 coins");
  assert.ok(accounts.publicUser(user).secrets.some((a) => a.id === "secret_chosen"), "you can see the ones you found");
});

test("rivals from race 3, and a Driver of the Day in the results", { timeout: 150000 }, async () => {
  const s = io(base, { transports: ["websocket"], forceNew: true });
  const got = (ev) => new Promise((ok) => s.once(ev, ok));
  await got("connect");
  s.emit("create", { name: "Rivalry" }, {});
  const j = await got("joined");
  s.emit("settings", { ai: 3, laps: 1, speed: 3, map: "small", quali: 0, safetyCar: "on" });
  s.emit("randomTrack", { map: "small" });
  await got("trackResult");
  const r = game.rooms.get(j.code);
  assert.equal(r.settings.safetyCar, true, "safety car setting saved");
  // pretend two races are done: Rivalry has 20 pts, the AI have 5 / 18 / 40
  r.history = [{}, {}];
  r.champ = { Rivalry: 20, [r.roster[0].name]: 5, [r.roster[1].name]: 18, [r.roster[2].name]: 40 };
  s.on("tirePick", () => s.emit("compound", "fast"));
  s.on("lightsOut", () => s.emit("react", 250));
  const rival = got("rival");
  s.emit("start");
  const rv = await rival;
  assert.equal(rv.name, r.roster[1].name, "rival = closest in the championship");
  const res = await got("results");
  assert.ok("dotd" in res, "results say who was Driver of the Day");
  s.close();
});

test("ranked tiers, rating maths and who you race", () => {
  assert.equal(accounts.rankOf(0).label, "Iron III");
  assert.equal(accounts.rankOf(299).label, "Iron I");
  assert.equal(accounts.rankOf(750).label, "Silver II");
  assert.equal(accounts.rankOf(2100).key, "oe");
  const iron = accounts.rankedField(100), silver = accounts.rankedField(700), plat = accounts.rankedField(1300), oe = accounts.rankedField(2500);
  assert.deepEqual([iron.ai, iron.aiLevel, iron.laps, iron.maps, iron.wonks], [3, "hard", 4, ["large"], ["little"]], "Iron: 4 laps against 3 Hard AI on big, gentle tracks");
  assert.equal(silver.aiLevel, "extreme");
  assert.equal(plat.aiLevel, "overdrive");
  assert.ok(oe.ai > plat.ai && plat.ai > silver.ai && silver.ai > iron.ai, "more AI every tier");
  const allLaps = [0, 300, 600, 900, 1200, 1500, 1800, 2100].map((sr) => accounts.rankedField(sr).laps);
  assert.ok(allLaps.every((l, i) => !i || l > allLaps[i - 1]), "laps go up every tier: " + allLaps);
  assert.equal(oe.laps, 15, "Overdrive Elite races 15 laps");
  assert.ok(oe.maps.includes("huge") && oe.wonks.includes("very"), "the top is big and wonky");
  assert.ok(game.AI_LEVELS.overdrive.rankedOnly, "Overdrive AI is ranked only");
  const u = { id: "u_x", ranked: { sr: 500, peak: 500, games: 0, wins: 0 }, stats: {}, owned: [], ach: {} };
  accounts.rankedStart(u);
  assert.equal(u.ranked.sr, 455, "leaving counts as a loss until the flag");
  const won = accounts.rankedFinish(u, 1, 4, true);
  assert.ok(won.delta > 30 && u.ranked.sr > 500, "a win goes up");
  accounts.rankedStart(u);
  const lost = accounts.rankedFinish(u, 4, 4, true);
  assert.ok(lost.delta < 0, "last goes down");
});

test("season pass: XP, tiers, premium and themed crates", async () => {
  const res = await accounts.signUp("PassTester", "Turbo-Fox-Lane-42");
  const u = res.u;
  accounts.passXp(u, 260);
  let p = accounts.publicUser(u).pass;
  assert.equal(p.tier, 1);
  u.coins = 100;
  assert.ok(accounts.buyPass(u).error, "can't buy without the coins");
  u.coins = 5000;
  assert.ok(accounts.buyPass(u).ok);
  p = accounts.publicUser(u).pass;
  assert.ok(p.prem);
  assert.ok(u.owned.some((id) => id.startsWith("bp_") && id.endsWith("_helmet")), "premium tier 1 item handed out when bought late");
  accounts.passXp(u, 250 * 3);
  assert.ok((u.crates || {})[p.theme.key] >= 1, "premium tier 3 is a themed crate");
  const o = accounts.openCrate(u, p.theme.key);
  assert.ok(o.ok && o.item.pass === p.theme.key, "the crate gives this month's item");
  assert.ok(!accounts.STORE.filter((x) => x.pass).some((x) => !x.loot), "pass items can't be bought");
});

test("daily challenges, and gifts and trades between friends", async () => {
  const a = (await accounts.signUp("GiftA", "Turbo-Fox-Lane-42")).u, b = (await accounts.signUp("GiftB", "Turbo-Fox-Lane-42")).u;
  assert.equal(accounts.publicUser(a).daily.list.length, 3);
  assert.ok((await accounts.sendGift(a, b.id, { coins: 10 })).error, "strangers can't get gifts");
  await accounts.friendAdd(a, "GiftB"); await accounts.friendAccept(b, a.id);
  a.coins = 1000; b.coins = 0; a.owned.push("glow_cyan"); b.owned.push("rims_gold");
  const g = await accounts.sendGift(a, b.id, { coins: 300 });
  assert.ok(g.ok); assert.equal(b.coins, 300);
  assert.match((await accounts.sendGift(a, b.id, { coins: 5 })).error, /cooldown/i);
  a.giftAt = 0;
  assert.ok((await accounts.offerTrade(a, b.id, { item: "glow_cyan" }, { item: "rims_gold" })).ok);
  const t = b.tradesIn[0];
  assert.ok((await accounts.answerTrade(b, t.id, true)).ok);
  assert.ok(b.owned.includes("glow_cyan") && !b.owned.includes("rims_gold"));
  assert.ok(a.owned.includes("rims_gold") && !a.owned.includes("glow_cyan"));
  assert.ok(accounts.dmThread(a, b.id).length >= 2, "gifts and trades show in the chat");
  assert.ok(accounts.sendDm(a, b, "gg").ok);
});

test("track of the week is the same all week, and share codes load tracks", { timeout: 60000 }, async () => {
  const t1 = game.totw(3000), t2 = game.totw(3000);
  assert.ok(t1 && t1.stroke.length > 10);
  assert.equal(JSON.stringify(t1.stroke), JSON.stringify(t2.stroke));
  const s = io(base, { transports: ["websocket"], forceNew: true });
  const got = (ev) => new Promise((ok) => s.once(ev, ok));
  await got("connect");
  s.emit("create", { name: "Sharer" }, {});
  await got("joined");
  s.emit("totw:load");
  const tr = await got("trackResult");
  assert.ok(!tr.error && tr.totw, "track of the week loaded");
  s.emit("track:share");
  const sc = await got("shareCode");
  assert.match(sc.code, /^[A-HJ-NP-Z2-9]{6}$/);
  s.emit("randomTrack", { map: "small" }); await got("trackResult");
  s.emit("track:load", sc.code);
  const lr = await got("trackResult");
  assert.ok(!lr.error && lr.shared === sc.code, "loaded from the code: " + lr.error);
  await new Promise((ok) => setTimeout(ok, 1500));      // (the rate limiter would drop a burst this big)
  s.emit("track:load", "ZZZZZZ");
  assert.ok((await got("trackResult")).error);
  s.close();
});

test("shared replays are checked and cleaned on the server", () => {
  const N = 20, pts = Array.from({ length: N }, (_, i) => ({ x: i, y: i }));
  const rep = game.cleanReplay({ v: 1, track: { N, pts, tan: pts, nor: pts, theme: "night", hw: [], gravel: [], pitLane: { entry: 1, len: 3, side: 1, boxes: { A: 2 } }, bridges: 0 },
    cars: [{ id: 1, name: "sh1thead", color: "red", number: 7 }, { id: 2, name: "Ace", color: "#ff0000" }],
    frames: Array.from({ length: 12 }, (_, i) => ({ t: i / 30, s: [1, 2], c: [[1, i, i, 0, 100, 1, 0, 0, -1, 0, 0, 0, 1, 0, i, 0, "F"], [2, i, i]] })) });
  assert.ok(rep);
  assert.equal(rep.cars[0].name, "Racer", "rude names are replaced");
  assert.equal(rep.cars[0].color, "#888888");
  assert.equal(rep.frames[0].c[0][16], "F", "tire letters survive");
  assert.equal(game.cleanReplay({ v: 1, track: {}, cars: [], frames: [] }), null);
});

test("a whole ranked race: signed in, locked settings, rating changes at the flag", { timeout: 150000 }, async () => {
  await accounts.signUp("RankRacer", "Turbo-Fox-Lane-42");
  const s = io(base, { transports: ["websocket"], forceNew: true });
  const got = (ev) => new Promise((ok) => s.once(ev, ok));
  await got("connect");
  s.emit("ranked:play", { name: "Guest" });
  assert.match(await got("joinError"), /Sign in/, "guests can't play ranked");
  s.emit("auth:login", { username: "RankRacer", password: "Turbo-Fox-Lane-42" });
  const acct = await got("account");
  assert.equal(acct.ranked.sr, 0);
  s.emit("ranked:play", { name: "RankRacer" });
  const j = await got("joined");
  const r = game.rooms.get(j.code);
  assert.ok(r.ranked && r.settings.aiLevel === "hard" && r.settings.ai === 3, "Iron: 3 hard AI");
  r.settings.laps = 1; r.settings.speed = 3;                // (quick test race)
  s.emit("settings", { ai: 20, aiLevel: "easy" });
  s.on("tirePick", () => s.emit("compound", "fast"));
  s.on("lightsOut", () => s.emit("react", 250));
  const race = await got("race");
  assert.equal(race.cars.length, 4, "the player can't change a ranked room's settings");
  assert.ok(race.ranked);
  const res = await got("rankedResult");
  assert.ok(typeof res.delta === "number" && res.after && res.pos >= 1);
  s.close();
});

test("DRS: real zones on real tracks, auto zones everywhere else, and it opens in a race", { timeout: 120000 }, () => {
  const r = new game.Room("DRSTST", false);
  assert.equal(r.setF1Track("it-1922"), null);
  assert.equal(r.track.drs.length, 2, "the Monza-style layout has its 2 real zones");
  // automatic DRS only ever goes on straights (a really twisty track can have none); big gentle tracks always get some
  let withDrs = 0;
  for (const w of ["little", "regular", "very", "very"]) {
    r.setRandomTrack("large", w); const t0 = r.track;
    if (t0.drs.length) withDrs++;
    const runs = game.straightRuns(t0);
    for (const z of t0.drs) assert.ok(runs.some((ru) => { const k = (z.from - ru.from + t0.N) % t0.N; return k + z.len <= ru.len; }), `a ${w} track's DRS zone sits on a straight`);
  }
  assert.ok(withDrs >= 1, "random tracks with straights get DRS");
  // share codes keep the zones; hand-placed zones follow the racing direction
  r.setF1Track("it-1922");
  const r2 = new game.Room("DRSTS2", false); r2.setSharedTrack(r.shareData());
  assert.deepEqual(r2.track.drs, r.track.drs);
  const t = r2.track, bp = (i) => [t.minX + (t.pts[i].x - t.pad) / 3, t.minY + (t.pts[i].y - t.pad) / 3];
  assert.ok(r2.drsZoneFrom(...bp(10), ...bp(40)).zone, "a zone can be placed by hand");
  assert.ok(r2.drsZoneFrom(...bp(40), ...bp(10)).error, "a backwards zone is refused");
  // a short race: DRS only from lap 2, and somebody gets it
  r.settings.ai = 10; r.settings.laps = 3; r.settings.weather = "sunny"; r.settings.quali = 0; r.ensureRoster(10);
  r.startRace(); r.startLights(); r.phase = "race"; r.launchCars();
  let opened = 0, early = 0;
  for (let n = 0; n < 60 * 60 * 6 && r.phase === "race"; n++) { r.step(1 / 60); for (const c of r.cars) if (c.drsOpen) { opened++; if (c.lapsDone < 2) early++; } }
  assert.ok(opened > 0, "DRS opened for someone");
  assert.equal(early, 0, "never on lap 1");
});

test("DRS: players have to press the button, AI open it themselves", () => {
  const r = new game.Room("DRSBTN", false);
  r.setF1Track("it-1922");
  const p = { id: "s-drs", name: "Me", up: {}, level: 1, xp: 0 }; r.players.set(p.id, p);
  r.settings.ai = 6; r.settings.quali = 1; r.settings.laps = 3; r.ensureRoster(6);
  r.startRace(); r.startLights(); r.phase = "race"; r.launchCars();
  const mine = r.cars.find((c) => c.owner === p.id);
  let avail = 0, openedByItself = 0, aiOpen = 0;
  for (let n = 0; n < 60 * 50 && r.phase === "race"; n++) {
    r.step(1 / 60);
    if (mine.drsAvail) avail++;
    if (mine.drsOpen) openedByItself++;
    for (const c of r.cars) if (!c.owner && c.drsOpen) aiOpen++;
  }
  assert.ok(avail > 0, "DRS became available for the player");
  assert.equal(openedByItself, 0, "but it never opened without the button");
  assert.ok(aiOpen > 0, "AI cars open DRS on their own");
  // in a zone with DRS available: pressing opens it
  for (let n = 0; n < 60 * 50 && !mine.drsAvail; n++) r.step(1 / 60);
  assert.ok(mine.drsAvail);
  assert.ok(r.openDrs(p), "the button works");
  assert.ok(mine.drsOpen && !mine.drsAvail);
  assert.ok(!r.openDrs(p), "pressing again does nothing");
});

test("race win coins: by AI difficulty, only with 7+ AI drivers", async () => {
  const seen = [], real = accounts.recordRace;
  accounts.recordRace = (u, r) => { seen.push(r); return []; };
  const u = await accounts.signUp("WinCoiner", "Turbo-Fox-Lane-42");
  try {
    const run = async (level, ai, humanPos = 1, extraHumans = 0, laps = 6, len = 20000, ranked = false) => {
      const r = new game.Room("WINCO" + seen.length, false); r.settings.aiLevel = level; r.settings.laps = laps; r.track = { length: len, elev: [0] }; r.ranked = ranked;
      const me = { id: "s-me", uid: u.u.id, name: "Me" }; r.players.set(me.id, me);
      const order = [];
      for (let i = 0; i < ai; i++) order.push({ id: i, isAi: true, finished: true, lapsDone: 3, pits: 0, bestLap: 30 });
      for (let i = 0; i < extraHumans; i++) { const o = { id: "s-h" + i, uid: null, name: "Pal" }; r.players.set(o.id, o); order.push({ id: 100 + i, owner: o.id, finished: true, lapsDone: 3, pits: 0, bestLap: 30 }); }
      order.splice(humanPos - 1, 0, { id: 99, owner: me.id, finished: true, lapsDone: 3, pits: 0, bestLap: 30 });
      r.recordStats(order, order.map(() => ({ pts: 0 })), null);
      await new Promise((ok) => setTimeout(ok, 50));
      return seen[seen.length - 1].winCoins;
    };
    assert.equal(await run("easy", 7), 50);
    assert.equal(await run("medium", 9), 100);
    assert.equal(await run("hard", 7), 150);
    assert.equal(await run("extreme", 12), 500);
    assert.equal(await run("extreme", 6), 0, "6 AI is not enough");
    assert.equal(await run("easy", 0, 1, 4), 0, "a race with only real people pays nothing");
    assert.equal(await run("hard", 8, 2), 0, "only the winner gets win coins");
    assert.equal(await run("extreme", 9, 1, 0, 5), 0, "5 laps is too short for coins");
    assert.equal(seen[seen.length - 1].raceCoins, false, "no rival / Driver of the Day coins either");
    assert.equal(await run("extreme", 9, 1, 0, 6), 500, "6 laps is enough");
    assert.equal(await run("extreme", 9, 1, 0, 10, 4000), 0, "a tiny track pays no coins");
    assert.equal(await run("extreme", 9, 1, 0, 10, 20000, true), 0, "ranked pays no race coins");
  } finally { accounts.recordRace = real; }
});

test("one account can't be in two matches at once", { timeout: 30000 }, async () => {
  await accounts.signUp("TwoTabs", "Turbo-Fox-Lane-42");
  const open = async () => { const s = io(base, { transports: ["websocket"], forceNew: true }); await new Promise((ok) => s.once("connect", ok)); return s; };
  const got = (s, ev) => new Promise((ok) => s.once(ev, ok));
  const a = await open(), b = await open();
  for (const s of [a, b]) { s.emit("auth:login", { username: "TwoTabs", password: "Turbo-Fox-Lane-42" }); await got(s, "account"); }
  a.emit("create", { name: "Tab A" }); const j = await got(a, "joined");
  b.emit("create", { name: "Tab B" }); assert.match(await got(b, "joinError"), /already in a match/);
  b.emit("join", { code: j.code, profile: { name: "Tab B" } }); assert.match(await got(b, "joinError"), /already in a match/);
  b.emit("quickPlay", { name: "Tab B" }); assert.match(await got(b, "joinError"), /already in a match/);
  // a guest tab can still join, and signing in there leaves it a guest in that room
  const c = await open(); c.emit("join", { code: j.code, profile: { name: "Guest" } }); await got(c, "joined");
  c.emit("auth:login", { username: "TwoTabs", password: "Turbo-Fox-Lane-42" });
  assert.match(await got(c, "toast"), /guest in this room/);
  assert.equal([...game.rooms.get(j.code).players.values()].filter((p) => p.uid).length, 1, "only one copy of the account in the room");
  // once tab A leaves, tab B can play
  a.disconnect(); await new Promise((ok) => setTimeout(ok, 300));
  b.emit("create", { name: "Tab B" }); assert.ok((await got(b, "joined")).code);
  for (const s of [b, c]) s.disconnect();
});

test("the season pass never touches the password (sign in on a second device works)", async () => {
  const { u } = await accounts.signUp("PassKeeper", "Turbo-Fox-Lane-42");
  accounts.publicUser(u); accounts.passXp(u, 300);              // this used to overwrite the password hash
  assert.ok(u.pass?.salt, "password hash still there");
  assert.ok((await accounts.logIn("PassKeeper", "Turbo-Fox-Lane-42")).token, "second sign-in works");
  // an account the old bug already broke: flagged, and it can set a new password while signed in
  const { u: v } = await accounts.signUp("PassBroken", "Turbo-Fox-Lane-42");
  v.pass = { m: "2026-09", xp: 500, prem: true, tier: 2 }; delete v.bp;
  accounts.fixUser(v);                                          // what loading the account does
  assert.ok(v.pwLost && !v.pass && v.bp?.prem, "flagged, season pass kept in bp");
  await assert.rejects(accounts.logIn("PassBroken", "Turbo-Fox-Lane-42"), /wiped/, "no saved copy: explains the fix");
  // signed out, on the device that played on it (it has the signed copy): the typed password becomes the new one
  const res = await accounts.logIn("PassBroken", "Brand-New-Lane-77", accounts.makeBackup(v));
  assert.ok(res.token && res.pwRepaired && !v.pwLost && v.pass.salt, "fixed by signing in");
  assert.ok((await accounts.logIn("PassBroken", "Brand-New-Lane-77")).token, "and it signs in anywhere now");
  // still signed in somewhere: Profile > Security works without the old password too
  const { u: x } = await accounts.signUp("PassBroke2", "Turbo-Fox-Lane-42");
  x.pass = { m: "2026-09", xp: 1, prem: false, tier: 0 }; accounts.fixUser(x);
  assert.ok((await accounts.changePassword(x, "", "Brand-New-Lane-77")).ok);
});

test("idle for an hour in a room: warned, then removed and disconnected", { timeout: 60000 }, async () => {
  const s = io(base, { transports: ["websocket"], forceNew: true }); await new Promise((ok) => s.once("connect", ok));
  const got = (ev) => new Promise((ok) => s.once(ev, ok));
  s.emit("create", { name: "Sleepy" }); const j = await got("joined");
  const sk = game.io.sockets.sockets.get(j.you);
  sk.data.lastAct = Date.now() - game.IDLE_MS + 60e3;          // 1 minute left
  assert.ok((await got("idleWarn")).seconds <= 120, "warned first");
  sk.data.lastAct = Date.now() - game.IDLE_MS - 1000;          // past the hour
  const gone = got("disconnect");
  await got("idleKicked"); await gone;
  assert.ok(!game.rooms.get(j.code)?.players.has(j.you), "removed from the room");
});

test("weekend events: on Saturdays and Sundays, change the weather and pay double", async () => {
  const sat = Date.UTC(2026, 9, 3, 12), wed = Date.UTC(2026, 9, 7, 12);    // Sat 3 Oct, Wed 7 Oct 2026
  assert.ok(game.eventInfo(sat).live, "on at the weekend");
  assert.ok(!game.eventInfo(wed).live, "off midweek (shows the next one)");
  assert.ok(game.eventInfo(wed).starts > wed);
  const r = new game.Room("EVENTS", false); r.setRandomTrack("normal", "regular"); r.settings.weather = "sunny";
  process.env.FORCE_EVENT = "rain";
  try {
    assert.equal(r.weatherSetting(), "rain", "rain weekend: rain");
    r.ranked = true; assert.equal(r.weatherSetting(), "sunny", "ranked never changes"); r.ranked = false;
    process.env.FORCE_EVENT = "wins";
    const seen = [], real = accounts.recordRace; accounts.recordRace = (u, x) => { seen.push(x); return []; };
    try {
      const { u } = await accounts.signUp("EventWinner", "Turbo-Fox-Lane-42");
      const me = { id: "s-ev", uid: u.id, name: "Me" }; r.players.set(me.id, me); r.settings.aiLevel = "easy"; r.settings.laps = 6;   // (race coins need 6+ laps)
      const order = [{ id: 99, owner: me.id, finished: true, lapsDone: 3, pits: 0, bestLap: 30 }];
      for (let i = 0; i < 7; i++) order.push({ id: i, isAi: true, finished: true, lapsDone: 3, pits: 0, bestLap: 30 });
      r.recordStats(order, order.map(() => ({ pts: 0 })), null); await new Promise((ok) => setTimeout(ok, 50));
      assert.equal(seen[0].winCoins, 100, "double win coins: 50 x 2");
    } finally { accounts.recordRace = real; }
  } finally { delete process.env.FORCE_EVENT; }
});

test("reverse grid: the championship leader starts at the back", { timeout: 60000 }, () => {
  const r = new game.Room("REVGRD", false); r.setRandomTrack("normal", "regular");
  Object.assign(r.settings, { ai: 6, quali: 0, reverseGrid: true }); r.ensureRoster(6);
  r.champ = { [r.roster[0].name]: 50, [r.roster[1].name]: 30, [r.roster[2].name]: 10 }; r.raceNo = 1;
  r.startRace();
  const byGrid = r.cars.slice().sort((a, b) => a.rs.grid - b.rs.grid).map((c) => c.name);
  assert.equal(byGrid[byGrid.length - 1], r.roster[0].name, "leader last");
  assert.equal(byGrid[byGrid.length - 2], r.roster[1].name, "second place second to last");
});

test("prestige: maxed pass resets for coins and a badge", async () => {
  const { u } = await accounts.signUp("Prestiger", "Turbo-Fox-Lane-42");
  assert.ok(accounts.prestige(u).error, "not before the pass is maxed");
  accounts.passXp(u, 999999);
  const coins = u.coins, r = accounts.prestige(u);
  assert.ok(r.ok); assert.equal(u.coins, coins + 1000);
  const P = accounts.publicUser(u).pass; assert.equal(P.tier, 0); assert.equal(P.prestigeTotal, 1);
  assert.equal(accounts.extrasOf(u).prest, "🎖️1");
});

test("community tracks: list a shared track, rate it, and the busy-account sign-out", { timeout: 40000 }, async () => {
  await accounts.signUp("CommMaker", "Turbo-Fox-Lane-42"); await accounts.signUp("CommRater", "Turbo-Fox-Lane-42");
  const open = async (name) => { const s = io(base, { transports: ["websocket"], forceNew: true }); await new Promise((ok) => s.once("connect", ok)); s.emit("auth:login", { username: name, password: "Turbo-Fox-Lane-42" }); await new Promise((ok) => s.once("account", ok)); return s; };
  const got = (s, ev) => new Promise((ok) => s.once(ev, ok));
  const a = await open("CommMaker"), b = await open("CommRater");
  a.emit("create", { name: "Maker" }); const j = await got(a, "joined");
  game.rooms.get(j.code).setRandomTrack("normal", "regular");
  a.emit("track:share"); const sc = await got(a, "shareCode");
  a.emit("community:publish", { code: sc.code, name: "Test Loop" }); assert.ok((await got(a, "communityMsg")).ok);
  a.emit("community:publish", { code: sc.code, name: "Again" }); assert.ok((await got(a, "communityMsg")).error, "no double listing");
  a.emit("community:vote", { code: sc.code, v: 1 }); assert.match((await got(a, "communityMsg")).error, /own track/);
  b.emit("community:vote", { code: sc.code, v: 1 }); assert.equal((await got(b, "communityVoted")).up, 1);
  b.emit("community:list", { sort: "top" }); const L = await got(b, "community");
  const t = L.list.find((x) => x.code === sc.code); assert.ok(t && t.name === "Test Loop" && t.myVote === 1 && t.prev.length > 5);
  // the same account on a second device: blocked, then "sign out my other device"
  const a2 = await open("CommMaker");
  a2.emit("create", { name: "Maker 2" }); await got(a2, "accountBusy");
  const out = got(a, "signedOutElsewhere");
  a2.emit("account:kickOther"); assert.equal((await got(a2, "kickedOther")).n, 1); await out;
  a2.emit("create", { name: "Maker 2" }); assert.ok((await got(a2, "joined")).code, "plays after signing the other one out");
  for (const s of [a2, b]) s.disconnect();
});

test("ranked pays coins only for reaching a new division, once", () => {
  assert.equal(accounts.rankUpCoins(0, 99), 0, "still Iron III");
  assert.equal(accounts.rankUpCoins(0, 100), 150, "Iron II: a new division");
  assert.equal(accounts.rankUpCoins(250, 310), 600, "Bronze III: a new tier");
  assert.equal(accounts.rankUpCoins(2050, 2120), 3000, "Overdrive Elite");
  const u = { id: "u_rk", coins: 0, stats: {}, ranked: { sr: 95, peak: 95, games: 0, wins: 0 } };
  accounts.rankedStart(u);
  const up = accounts.rankedFinish(u, 1, 6, true);
  assert.equal(up.coins, 150); assert.equal(u.coins, 150);
  u.ranked.sr = 60;                                // dropped back down...
  accounts.rankedStart(u);
  const again = accounts.rankedFinish(u, 1, 6, true);
  assert.ok(u.ranked.sr >= 100 && again.coins === 0, "...and climbing back to a division you've had pays nothing");
});

test("ranked races grow with your tier: even Iron gets big tracks, the top is huge", { timeout: 60000 }, async () => {
  await accounts.signUp("RankTracks", "Turbo-Fox-Lane-42");
  const s = io(base, { transports: ["websocket"], forceNew: true });
  const got = (ev) => new Promise((ok) => s.once(ev, ok));
  await got("connect");
  s.emit("auth:login", { username: "RankTracks", password: "Turbo-Fox-Lane-42" }); const acct = await got("account");
  const u = await accounts.getUser(acct.id);
  for (const [sr, check] of [[0, (r) => (r.trackKind === "f1" || (r.settings.map === "large" && r.wonk === "little")) && r.settings.ai === 3 && r.settings.laps === 4 && r.track.length > 9000],
    [2500, (r) => r.settings.ai === 12 && r.settings.laps === 15 && r.settings.aiLevel === "overdrive" && (r.trackKind === "f1" || r.settings.map === "huge")]]) {
    u.ranked = { sr, peak: sr, games: 0, wins: 0 };
    s.emit("ranked:play", { name: "RankTracks" });
    const j = await got("joined"), r = game.rooms.get(j.code);
    assert.ok(check(r), `SR ${sr}: ${r.trackKind} ${r.settings.map} ${r.wonk} ${r.settings.ai} AI ${r.settings.laps} laps`);
    assert.ok(!(r.settings.weather === "fog" && ["night", "neon"].includes(r.settings.theme)), "never night + fog");
    s.emit("leave"); await new Promise((ok) => setTimeout(ok, 1200));
  }
  s.close();
});

test("assists: DRS, boost and pit stops done for the player", { timeout: 120000 }, () => {
  const run = (quali) => {
    const r = new game.Room("ASSIST" + quali, false);
    r.setF1Track("it-1922");
    const p = { id: "s-as", name: "Me", up: {}, level: 1, xp: 0, assist: { drs: true, boost: true, pit: true } }; r.players.set(p.id, p);
    r.settings.ai = 4; r.settings.quali = quali; r.settings.laps = 6; r.settings.wear = "high"; r.settings.weather = "sunny"; r.ensureRoster(4);
    r.startRace(); r.startLights(); r.phase = "race"; r.launchCars();
    const mine = r.cars.find((c) => c.owner === p.id), out = { drsOpen: 0, drsWaiting: 0, boosted: 0, mine };
    for (let n = 0; n < 60 * 60 * (quali ? 1 : 8) && r.phase === "race" && !mine.finished; n++) {
      r.step(1 / 60);
      if (mine.drsOpen) out.drsOpen++; if (mine.drsAvail) out.drsWaiting++; if (mine.nitroOn) out.boosted++;
    }
    return out;
  };
  const q = run(1);                                  // qualifying: DRS in every zone
  assert.ok(q.drsOpen > 0 && q.drsWaiting === 0, "DRS assist opens DRS straight away (never left waiting)");
  const race = run(0);
  assert.ok(race.drsWaiting === 0, "never waiting for a button press in the race either");
  assert.ok(race.boosted > 0, "boost assist fired the boost without the key held");
  assert.ok(race.mine.pits >= 1, "pit assist made a pit stop");
});

test("team ranked: friends race ranked together, then the room is normal again", { timeout: 180000 }, async () => {
  for (const n of ["TeamOne", "TeamTwo"]) await accounts.signUp(n, "Turbo-Fox-Lane-42");
  const open = async () => { const s = io(base, { transports: ["websocket"], forceNew: true }); await new Promise((ok) => s.once("connect", ok)); return s; };
  const got = (s, ev) => new Promise((ok) => s.once(ev, ok));
  const a = await open(), b = await open();
  a.emit("auth:login", { username: "TeamOne", password: "Turbo-Fox-Lane-42" }); await got(a, "account");
  a.emit("create", { name: "TeamOne" }); const j = await got(a, "joined");
  // a guest in the room: not allowed
  b.emit("join", { code: j.code, profile: { name: "Guest" } }); await got(b, "joined");
  a.emit("teamRanked:start"); assert.match(await got(a, "toast"), /signed in/);
  b.emit("auth:login", { username: "TeamTwo", password: "Turbo-Fox-Lane-42" }); await got(b, "account");
  await new Promise((ok) => setTimeout(ok, 600));
  const r = game.rooms.get(j.code);
  r.settings.laps = 3;                                          // (the room's own settings come back afterwards)
  (await accounts.getUser("u_teamtwo")).ranked = { sr: 1300, peak: 1300, games: 0, wins: 0 };   // TeamTwo is Platinum in solo
  a.emit("teamRanked:start");
  await new Promise((ok) => setTimeout(ok, 800));
  assert.ok(r.ranked && r.teamRanked, "the room went ranked");
  assert.equal(r.settings.aiLevel, "overdrive", "the field is set by the highest rank on the team (Platinum), not the average");
  assert.ok(r.settings.teams && [...r.players.values()].every((p) => p.team === [...r.players.values()][0].team), "one team");
  r.settings.laps = 1; r.settings.speed = 3;                    // (quick test race)
  for (const s of [a, b]) { s.on("tirePick", () => s.emit("compound", "fast")); s.on("lightsOut", () => s.emit("react", 250)); }
  const [ra, rb] = await Promise.all([got(a, "rankedResult"), got(b, "rankedResult")]);
  const aiTeams = {}; for (const c of r.cars.filter((c) => c.isAi)) aiTeams[c.team] = (aiTeams[c.team] || 0) + 1;
  assert.ok(Object.values(aiTeams).length > 0 && Object.values(aiTeams).every((n) => n === 2), "2 of us = AI teams of 2: " + JSON.stringify(aiTeams));
  assert.equal(ra.mode, "team"); assert.equal(rb.mode, "team");
  assert.equal(ra.teamPos, rb.teamPos, "both judged on the team's average place");
  const ua = await accounts.getUser("u_teamone");
  assert.equal(ua.rankedTeam.games, 1, "team rating, not solo");
  assert.ok(!ua.ranked || !ua.ranked.games, "solo ranked untouched");
  assert.equal((await accounts.getUser("u_teamtwo")).ranked.sr, 1300, "solo rating untouched");
  await new Promise((ok) => setTimeout(ok, 13000));
  assert.ok(!r.ranked && !r.teamRanked, "a normal room again after the podium");
  assert.equal(r.settings.laps, 3, "with its own settings back");
  a.close(); b.close();
});
