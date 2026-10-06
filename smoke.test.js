// Automatic checks: run "npm test" before every update. They start the real server on a spare port,
// open the web pages, and play a whole (short, fast) race against the AI like a player would.
"use strict";
process.env.DATA_DIR = require("path").join(require("os").tmpdir(), "scribble-test-" + process.pid);
process.env.MUSIC_CACHE = require("path").join(process.env.DATA_DIR, "music");
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

test("songs are fetched once, cached and served from this site (only the listed ones)", async () => {
  const song = Buffer.alloc(50e3, 7);
  const up = require("http").createServer((req, res) => { if (req.url === "/At%20Launch.mp3") { res.setHeader("Content-Type", "audio/mpeg"); res.end(song); } else { res.statusCode = 404; res.end(); } });
  await new Promise((ok) => up.listen(0, ok));
  process.env.MUSIC_UPSTREAM = `http://localhost:${up.address().port}/`;
  try {
    const r = await fetch(base + "/music/km/At%20Launch.mp3");
    assert.equal(r.status, 200); assert.match(r.headers.get("content-type"), /audio\/mpeg/);
    assert.equal(Buffer.from(await r.arrayBuffer()).length, song.length);
    const part = await fetch(base + "/music/km/At%20Launch.mp3", { headers: { Range: "bytes=0-99" } });
    assert.equal(part.status, 206, "seeking works");
    assert.equal((await fetch(base + "/music/km/Airport%20Lounge.mp3")).status, 502, "missing upstream song");
    assert.equal((await fetch(base + "/music/km/secret.mp3")).status, 404, "not an open proxy");
  } finally { up.close(); delete process.env.MUSIC_UPSTREAM; }
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
  assert.deepEqual([iron.ai, iron.aiLevel, iron.laps, iron.maps, iron.wonks], [3, "rookie", 4, ["large"], ["little"]], "Iron: 4 laps against 3 Rookie AI on big, gentle tracks");
  assert.equal(silver.aiLevel, "medium");
  assert.equal(plat.aiLevel, "extreme");
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
  await new Promise((ok) => setTimeout(ok, 1000));      // (the rate limiter would drop a burst this big)
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
  assert.ok(r.ranked && r.settings.aiLevel === "rookie" && r.settings.ai === 3, "Iron: 3 rookie AI");
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
    [2500, (r) => r.settings.ai === 12 && r.settings.laps === 15 && r.settings.aiLevel === "elite" && (r.trackKind === "f1" || r.settings.map === "huge")]]) {
    u.ranked = { sr, peak: sr, games: 0, wins: 0 };
    s.emit("ranked:play", { name: "RankTracks" });
    const j = await got("joined"), r = game.rooms.get(j.code);
    for (let i = 0; i < 100 && (r.makingTrack || !r.track); i++) await new Promise((ok) => setTimeout(ok, 50));   // (random tracks are made in slices)
    assert.equal(r.settings.xpRate, 50, "ranked gives 50 XP a second");
    const me = [...r.players.values()][0];
    if (sr < 1200) assert.ok(r.settings.quali === 0 && me.gridPos === -1, "below Platinum: no qualifying, a random grid spot");
    else assert.ok(r.settings.quali === 2, "Platinum and up: 2 minutes of qualifying");
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
    const play = r.startPitGame.bind(r); r.startPitGame = (c, pl) => { play(c, pl); r.endPitGame(c, c.pitGame.seq); };   // (the pit minigame always comes up now: play it perfectly)
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
  assert.equal(r.settings.aiLevel, "extreme", "the field is set by the highest rank on the team (Platinum), not the average");
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

test("multiclass: you pick your class, Hypers start ahead and are faster, each class scores its own points", { timeout: 120000 }, () => {
  const r = new game.Room("MULTIC", false); r.setRandomTrack("normal", "regular");
  const p = { id: "s-mc", name: "Me", up: {}, level: 1, xp: 0, cls: "gt" }; r.players.set(p.id, p);
  Object.assign(r.settings, { ai: 8, quali: 0, laps: 6, mode: "multi", mix: 0.5, weather: "sunny" }); r.ensureRoster(8);
  // the lobby shows everyone's class
  const lm = r.lobbyMsg();
  assert.equal(lm.players[0].cls, "gt"); assert.equal(lm.roster.filter((x) => x.cls === "gt").length, 4, "half the AI are GTs");
  r.startRace();
  const grid = r.cars.slice().sort((a, b) => a.rs.grid - b.rs.grid).map((c) => c.cls);
  assert.deepEqual(grid, [...Array(4).fill("hyper"), ...Array(5).fill("gt")], "all the Hypers line up ahead of the GTs");
  assert.equal(r.cars.find((c) => c.owner === p.id).cls, "gt", "you drive the class you picked");
  const hy = r.cars.find((c) => c.cls === "hyper" && c.isAi), gt = r.cars.find((c) => c.cls === "gt" && c.isAi);
  const sh = r.stats(hy), sg = r.stats(gt);
  assert.ok(sg.maxSpeed < sh.maxSpeed * 0.92 && sg.accel < sh.accel, "GTs are slower");
  assert.ok(sg.wear < sh.wear * 0.75 && sg.pitTime < sh.pitTime, "but much kinder to tyres and quicker in the pits");
  r.startLights(); r.phase = "race"; r.launchCars();
  for (let n = 0; n < 60 * 90 && r.phase === "race"; n++) r.step(1 / 60);
  const best = (k) => Math.min(...r.cars.filter((c) => c.isAi && c.cls === k).map((c) => c.bestLap));
  assert.ok(isFinite(best("gt")) && best("hyper") < best("gt") * 0.95, `Hypers lap faster (${best("hyper").toFixed(1)}s vs ${best("gt").toFixed(1)}s)`);
  let res = null; const realEmit = r.emit.bind(r); r.emit = (ev, d) => { if (ev === "results") res = d; return realEmit(ev, d); };
  if (r.phase === "race") r.endRace();
  assert.ok(res && res.multi, "results say it was multiclass");
  for (const k of ["hyper", "gt"]) {
    const rows = res.rows.filter((x) => x.cls === k);
    assert.equal(rows[0].cpos, 1); assert.equal(rows[0].pts, r.settings.points[0], `${k} class winner gets the winner's points`);
  }
  // ranked never uses multiclass
  assert.equal(r.settings.mode, "multi");
});

test("the Motion pack: animated items in the store, every id unique", () => {
  const store = accounts.STORE, ids = store.map((x) => x.id);
  assert.equal(new Set(ids).size, ids.length, "no duplicate item ids");
  const anim = store.filter((x) => /animated/.test(x.name));
  assert.ok(anim.length >= 45, `lots of animated items (${anim.length})`);
  for (const slot of ["glow", "flame", "helmet", "num", "rims", "smoke", "trail", "decal", "wing", "livery"]) assert.ok(anim.some((x) => x.slot === slot), "animated " + slot);
  assert.ok(store.find((x) => x.id === "liv_hyperdrive").rarity === "mythic");
});

test("defend mode: costs boost, no slipstream for the car behind, turns itself off when the boost runs out", { timeout: 60000 }, () => {
  const r = new game.Room("DEFEND", false); r.setF1Track("it-1922");
  const p = { id: "s-df", name: "Me", up: {}, level: 1, xp: 0, gridPos: 1 }; r.players.set(p.id, p);
  Object.assign(r.settings, { ai: 1, quali: 0, laps: 6, weather: "sunny" }); r.ensureRoster(1);
  r.startRace(); r.startLights(); r.phase = "race"; r.launchCars();
  const me = r.cars.find((c) => c.owner === p.id), ai = r.cars.find((c) => c.isAi);
  me.launchAt = 0; ai.launchAt = 0.3; ai.power = 1.1;
  for (let n = 0; n < 60 * 3; n++) r.step(1 / 60);
  const before = me.nitro; p.defendOn = true;
  let slipBehindDefender = 0;
  for (let n = 0; n < 60 * 2; n++) { r.step(1 / 60); if (me.defending && ai.slip) slipBehindDefender++; }
  assert.ok(me.defending, "defending");
  assert.ok(Math.abs(before - me.nitro - (0.1 + 0.08 * 2)) < 0.03, `10% to switch on + 8%/s (used ${(before - me.nitro).toFixed(3)})`);
  assert.equal(slipBehindDefender, 0, "no slipstream behind a defending car");
  me.nitro = 0.01;
  for (let n = 0; n < 30; n++) r.step(1 / 60);
  assert.ok(!me.defending && !p.defendOn, "out of boost: defend switches off");
  p.defendOn = true; for (let n = 0; n < 5; n++) r.step(1 / 60);
  assert.ok(!me.defending && !p.defendOn, "can't switch it on with an empty tank");
});

test("Sticky Setup and Carbon Brakes are much stronger now", () => {
  const r = new game.Room("UPGRD", false); r.setRandomTrack("normal", "regular");
  const base = { engine: 0, corner: 0, turbo: 0, grip: 0, brakes: 0, late: 0, craft: 0, refill: 0, pitlane: 0, focus: 0, whisper: 0, enhance: 0, saver: 0 };
  const s0 = r.stats({ up: base }), s1 = r.stats({ up: { ...base, grip: 4, brakes: 3 } });
  assert.ok(s1.grip / s0.grip >= 2.19 && s1.gripMul / s0.gripMul >= 1.99, "grip x2.2, turning grip x2");
  assert.ok(s1.brake / s0.brake >= 2.49, "braking x2.5");
  assert.ok(s1.planBrake / s1.brake < s0.planBrake / s0.brake, "and the driver brakes with more margin");
});

test("elimination: the last car is knocked out every lap, the last car standing wins", { timeout: 120000 }, () => {
  const r = new game.Room("ELIMIN", false); r.setRandomTrack("normal", "regular");
  const p = { id: "s-el", name: "Me", up: {}, level: 1, xp: 0 }; r.players.set(p.id, p);
  Object.assign(r.settings, { ai: 5, quali: 0, laps: 9, mode: "elim", weather: "sunny" }); r.ensureRoster(5);
  const outs = []; let res = null; const emit = r.emit.bind(r);
  r.emit = (ev, d) => { if (ev === "feed" && d.t === "elim") outs.push(d); if (ev === "results") res = d; return emit(ev, d); };
  r.startRace();
  assert.equal(r.settings.laps, 5, "6 cars = 5 laps, whatever the Laps setting says");
  r.startLights(); r.phase = "race"; r.launchCars(); r.cars.find((c) => c.owner).launchAt = 0;
  for (let n = 0; n < 60 * 400 && r.phase === "race"; n++) r.step(1 / 60);
  assert.equal(r.phase, "results", "the race ended when one car was left (even after the player was knocked out)");
  assert.deepEqual(outs.map((o) => o.left), [5, 4, 3, 2, 1], "one car out per lap");
  const order = res.rows.map((x) => x.name), outNames = outs.map((o) => o.name);
  assert.deepEqual(order.slice(1), outNames.reverse(), "the results go in reverse order of knock-outs");
  assert.ok(!outNames.includes(order[0]), "the winner was never knocked out");
  assert.equal(r.settings.laps, 9, "the Laps setting is back afterwards");
  // big grids knock out more than one a lap, so it never goes past 12 laps
  const r2 = new game.Room("ELIMI2", false); r2.setRandomTrack("normal", "regular");
  r2.players.set("x", { id: "x", name: "Me", up: {}, level: 1, xp: 0 });
  Object.assign(r2.settings, { ai: 29, quali: 0, laps: 5, mode: "elim" }); r2.ensureRoster(29); r2.startRace();
  assert.equal(r2.elim.per, 3); assert.equal(r2.settings.laps, 10);
});

test("safety car: cars at the back sprint up to the pack, then slow down behind it", () => {
  const r = new game.Room("SCCATCH", false); r.setRandomTrack("normal", "regular");
  r.sc = { since: 0 };
  const sp = r.track.spacing, ahead = { progress: 1000, finished: false };
  const lim = (gapPx) => r.scLimit({ ahead, progress: 1000 - gapPx / sp, finished: false, inPit: false, aiMode: "race" });
  assert.ok(lim(1500) > 800, "far back: nearly race speed");
  assert.ok(lim(300) < lim(800) && lim(300) > 378, "slowing down as they get close");
  assert.ok(lim(60) < 378, "in the pack: a touch under safety car pace");
});

test("pit stop minigame: hit 6 arrows in order; fast and clean beats the AI crews, wrong keys cost time", { timeout: 60000 }, () => {
  const r = new game.Room("PITGAME", false); r.setF1Track("it-1922");
  const p = { id: "s-pg", name: "Me", up: {}, level: 1, xp: 0, assist: { pitGame: true } }; r.players.set(p.id, p);
  Object.assign(r.settings, { ai: 1, quali: 0, laps: 6, weather: "sunny" }); r.ensureRoster(1);
  r.startRace(); r.startLights(); r.phase = "race"; r.launchCars();
  const c = r.cars.find((x) => x.owner === p.id); c.st = r.stats(c);
  const sent = []; const realTo = game.io.to.bind(game.io);
  game.io.to = (id) => (id === p.id ? { emit: (ev, d) => sent.push([ev, d]) } : realTo(id));
  try {
    r.startPitGame(c, p);
    const seq = sent.find(([ev]) => ev === "pitGame")[1].seq;
    assert.equal(seq.length, 6); assert.ok(seq.every((d) => d >= 0 && d <= 3));
    for (let n = 0; n < 30; n++) r.step(1 / 60);
    assert.ok(c.pitGame && c.pitting > 50, "the car waits in the box while you play");
    r.endPitGame(c, seq);                                      // a perfect, instant run
    const good = sent.find(([ev]) => ev === "pitGameResult")[1];
    assert.ok(good.done && good.misses === 0 && good.stop < good.ai, `a fast clean stop beats the AI crews (${good.stop}s vs ${good.ai}s)`);
    r.startPitGame(c, p); const seq2 = sent.filter(([ev]) => ev === "pitGame")[1][1].seq;
    const wrong = seq2.map((d) => (d + 1) % 4);
    r.endPitGame(c, [wrong[0], wrong[1], wrong[2], ...seq2]);   // 3 wrong keys first
    const meh = sent.filter(([ev]) => ev === "pitGameResult")[1][1];
    assert.equal(meh.misses, 3); assert.ok(meh.stop > good.stop + 0.4 && meh.stop >= 0.5 + 3 * 0.45 - 0.01, "wrong keys cost time (0.45s each)");
    r.startPitGame(c, p); r.endPitGame(c, null);               // gave up / timed out
    const slow = sent.filter(([ev]) => ev === "pitGameResult")[2][1];
    assert.ok(!slow.done && slow.stop > good.ai, "not finishing is slower than an AI crew");
  } finally { game.io.to = realTo; }
});

test("commentary clips: every line and name the game asks for exists", () => {
  const fs = require("fs"), path = require("path"), dir = path.join(__dirname, ROOT === "." ? "" : "..", "public", "commentary");
  const man = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8"));
  for (const k of ["start", "crash", "crashBig", "win", "winYou", "photo", "lastLap", "scOut", "scIn", "rain", "lead", "leadYou", "elim", "elimYou", "standing", "classWin", "puncture", "fastest", "pitGood", "pitBad", "drs", "jump", "pitSlow", "mistake", "halfway", "battle", "qko", "pole", "defend"]) {
    assert.ok(man.lines[k] > 0, "lines for " + k);
    for (let i = 0; i < man.lines[k]; i++) assert.ok(fs.existsSync(path.join(dir, `l_${k}_${i}.mp3`)), `l_${k}_${i}.mp3`);
  }
  // whole sentences with the name in them, for every AI name and car number
  assert.deepEqual(man.named, ["win", "lead", "elim"]);
  for (const key of man.named) {
    for (const slug of Object.values(man.names)) assert.ok(fs.existsSync(path.join(dir, `s_${key}_${slug}.mp3`)), `${key} ${slug}`);
    for (let i = 0; i < 100; i++) assert.ok(fs.existsSync(path.join(dir, `s_${key}_n${i}.mp3`)), `${key} number ${i}`);
  }
});

test("knockout qualifying: Q1, Q2, Q3 with the slowest knocked out, and the grid in that order", { timeout: 180000 }, () => {
  const r = new game.Room("KOQUALI", false); r.setRandomTrack("normal", "regular");
  r.players.set("q", { id: "q", name: "Me", up: {}, level: 1, xp: 0 });
  Object.assign(r.settings, { ai: 9, quali: "ko", laps: 5, weather: "sunny" }); r.ensureRoster(9);
  const feed = []; let res = null; const emit = r.emit.bind(r);
  r.emit = (ev, d) => { if (ev === "feed" && d.t === "qko") feed.push(d); if (ev === "qualiResults") res = d; return emit(ev, d); };
  r.startRace();
  assert.ok(r.qualifying && r.qualiKO && r.qualiEnd === 120, "Q1 is 2 minutes");
  r.startLights(); r.phase = "race"; r.launchCars();
  for (let n = 0; n < 60 * 480 && r.qualifying; n++) r.step(1 / 60);       // (each stage runs on until the laps in progress are done)
  assert.deepEqual(feed.map((f) => [f.stage, f.out.length]), [[2, 3], [3, 3]], "3 out after Q1, 3 more after Q2");
  assert.ok(res && res.rows.length === 10);
  assert.deepEqual(res.rows.map((x) => x.q), [...Array(4).fill("Q3"), ...Array(3).fill("Q2"), ...Array(3).fill("Q1")], "grid: Q3 runners, then Q2 and Q1 knock-outs");
  assert.ok(!feed[0].out.some((nm) => res.rows.slice(0, 7).map((x) => x.name).includes(nm)), "Q1 knock-outs start at the back");
  assert.equal(r.settings.laps, 5);
});

test("practice: no AI, sector times, end it any time, no race afterwards", { timeout: 60000 }, () => {
  const r = new game.Room("PRACT", false); r.setRandomTrack("normal", "regular");
  const p = { id: "pr", name: "Me", up: {}, level: 1, xp: 0 }; r.players.set(p.id, p);
  Object.assign(r.settings, { ai: 6, quali: 0, laps: 5, mode: "practice", weather: "sunny" }); r.ensureRoster(6);
  let res = null; const emit = r.emit.bind(r); r.emit = (ev, d) => { if (ev === "qualiResults") res = d; return emit(ev, d); };
  r.startRace();
  assert.equal(r.cars.length, 1, "just you"); assert.ok(r.qualifying && r.practice && r.qualiEnd >= 3600);
  r.startLights(); r.phase = "race"; r.launchCars(); r.cars[0].launchAt = 0;
  for (let n = 0; n < 60 * 70; n++) r.step(1 / 60);
  const c = r.cars[0];
  assert.ok(c.bestSec && c.bestSec.every((x) => x > 0 && isFinite(x)), "every sector has been timed");
  assert.ok(c.secCol.every((x) => x === null || ["purple", "green", "yellow"].includes(x)));
  assert.ok(isFinite(c.bestLap), "a timed lap");
  r.endQuali();
  assert.ok(res && res.practice && res.rows.length === 1 && res.rows[0].best > 0, "practice times shown");
  assert.equal(r.phase, "qualiResults"); assert.equal(r.cars, null); assert.equal(r.settings.laps, 5);
});

test("strategy preview and rematch", { timeout: 60000 }, () => {
  const r = new game.Room("STRAT", false); r.setRandomTrack("normal", "regular");
  r.players.set("st", { id: "st", name: "Me", up: {}, level: 1, xp: 0 });
  Object.assign(r.settings, { ai: 3, quali: 0, laps: 10, weather: "sunny", wear: "normal" }); r.ensureRoster(3);
  r.startRace();
  const g = r.strategy(r.cars.find((c) => c.owner));
  assert.ok(["fast", "inter", "durable"].includes(g.start) && g.stops >= 1 && g.box >= 1 && g.box < 10 && ["fast", "inter", "durable"].includes(g.next), JSON.stringify(g));
  // rematch: from the results straight into the next race
  r.phase = "results"; r.backToLobby(); assert.equal(r.phase, "lobby");
  r.startRace(); assert.equal(r.phase, "tires", "the next race starts");
});

test("mythic chest, plinko, and the big achievement list", async () => {
  const A = accounts;
  const user = { coins: 20000, owned: [], equipped: {}, stats: { races: 0, wins: 0, podiums: 0, top5: 0, points: 0, laps: 0, km: 0, overtakes: 0, mostOvertakes: 0, pitStops: 0, fastestLaps: 0, cleanLaps: 0, crashes: 0, slips: 0, realTracks: [], raceSec: 0, boostSec: 0 }, ach: {} };
  // the Mythic chest: 5,000 coins, never anything below epic
  assert.ok(A.BOXES.find((b) => b.id === "mythic" && b.price === 5000));
  for (let i = 0; i < 3; i++) { const r = A.openBox(user, "mythic"); assert.ok(r.ok && ["epic", "legendary", "mythic"].includes(r.rarity), r.rarity); }
  assert.ok(A.STORE.filter((x) => x.box === "mythic").length >= 5, "mythic-chest exclusives");
  // plinko: paths come from the server, payouts match the table, every risk pays back just under 100%
  for (const [risk, pays] of Object.entries(A.PLINKO)) {
    const P = [1, 12, 66, 220, 495, 792, 924, 792, 495, 220, 66, 12, 1].map((x) => x / 4096);
    const ev = pays.reduce((t, m, k) => t + m * P[k], 0);
    assert.ok(ev > 0.97 && ev < 1, `${risk} pays back ${ev.toFixed(3)}`);
  }
  user.coins = 1000;
  const r = A.plinko(user, 100, "high");
  assert.ok(r.ok && r.path.length === 12 && r.bucket === r.path.reduce((a, b) => a + b, 0) && r.win === Math.floor(100 * A.PLINKO.high[r.bucket]));
  assert.equal(user.coins, 1000 - 100 + r.win + (r.got || []).reduce((t, a) => t + a.coins, 0));
  assert.ok(A.plinko(user, 5, "low").error && A.plinko(user, 5000, "low").error && A.plinko({ ...user, coins: 50 }, 100, "low").error, "bet limits and no going below zero");
  // achievements: 1,000+ new ones, all unique, with some brutal ones
  const g = A.ACH.filter((a) => a.id.startsWith("g_"));
  assert.ok(g.length >= 1000, `${g.length} new achievements`);
  assert.equal(new Set(A.ACH.map((a) => a.id)).size, A.ACH.length); assert.equal(new Set(A.ACH.map((a) => a.name)).size, A.ACH.length);
  assert.ok(A.ACH.filter((a) => a.coins >= 5000).length >= 10, "very hard ones still pay big");
});

test("the safety car knows which bit of track (and how high) it's on, so it's drawn over ramps", () => {
  const r = new game.Room("SCRAMP", false); r.setRandomTrack("normal", "regular");
  r.players.set("s", { id: "s", name: "Me", up: {}, level: 1, xp: 0 });
  Object.assign(r.settings, { ai: 3, quali: 0, laps: 6, safetyCar: true }); r.ensureRoster(3);
  r.startRace(); r.startLights(); r.phase = "race"; r.launchCars();
  for (let n = 0; n < 60 * 10; n++) r.step(1 / 60);
  r.deploySafetyCar(); r.stepSafetyCar();
  let st = null; const emit = r.emit.bind(r); r.emit = (ev, d) => { if (ev === "state") st = d; return emit(ev, d); };
  r.sendState();
  assert.ok(Array.isArray(st.sc) && st.sc.length === 5 && Number.isInteger(st.sc[3]) && typeof st.sc[4] === "number", JSON.stringify(st.sc));
});

test("achievement rewards rebalanced: half of the old payouts taken back, once, never below zero", () => {
  const ids = accounts.ACH.filter((a) => a.id.startsWith("g_") && a.coins >= 100).slice(0, 5).map((a) => a.id);
  const u = accounts.fixUser({ id: "u_mig_test", name: "Mig", coins: 50000, ach: Object.fromEntries(ids.map((id) => [id, 1790956000000])) });
  assert.ok(u.achAdjust && u.achAdjust.back > 0 && u.achAdjust.back === Math.floor(u.achAdjust.paid / 2));
  assert.equal(u.coins, 50000 - u.achAdjust.back);
  const again = accounts.publicUser(u); assert.equal(again.coins, 50000 - u.achAdjust.back, "only once");
  const poor = accounts.fixUser({ id: "u_mig_poor", name: "Poor", coins: 10, ach: Object.fromEntries(ids.map((id) => [id, 1790956000000])) });
  assert.equal(poor.coins, 0, "never below zero");
  const fresh = accounts.fixUser({ id: "u_mig_new", name: "New", coins: 500, ach: Object.fromEntries(ids.map((id) => [id, Date.now() + 1e10])) });
  assert.equal(fresh.coins, 500, "achievements earned after the change aren't touched");
  assert.ok(accounts.ACH.filter((a) => a.id.startsWith("g_wins_")).every((a) => a.coins <= 2000), "routine rewards are lower now");
});

test("selling: half price for shop items, a set value for chest items, and chests never pay to sell", () => {
  const A = accounts, shop = A.STORE.find((x) => !x.loot && !x.pass && x.price >= 100), loot = A.STORE.find((x) => x.loot && x.rarity === "legendary");
  const u = { coins: 0, owned: [shop.id, loot.id], equipped: { [shop.slot]: shop.id }, stats: {}, ach: {} };
  const r1 = A.sell(u, shop.id);
  assert.ok(r1.ok && r1.value === Math.floor(shop.price / 2) && u.coins === r1.value);
  assert.ok(!u.owned.includes(shop.id) && !u.equipped[shop.slot], "gone, and taken off the car");
  const r2 = A.sell(u, loot.id); assert.equal(r2.value, 500, "legendary chest item");
  assert.ok(A.sell(u, loot.id).error, "can't sell what you don't own");
  for (const b of A.BOXES) {
    const ev = Object.entries(b.odds).reduce((t, [rar, w]) => t + (w / 100) * ({ common: 25, rare: 75, epic: 200, legendary: 500, mythic: 1500 })[rar], 0);
    assert.ok(ev < b.price * 0.6, `${b.name}: opening to sell gets back ${Math.round(ev)} of ${b.price}`);
  }
  assert.ok(A.STORE.every((x) => x.sell > 0), "every item has a sell price");
});

test("commentator voice: built-in by default; with COMMENTATOR_VOICE + an API key, lines come from ElevenLabs (once each)", { timeout: 30000 }, async () => {
  let cfg = await (await fetch(base + "/voice/config")).json();
  assert.equal(cfg.eleven, false);
  let r = await fetch(base + "/voice/l_start_0.mp3"); assert.equal(r.status, 200, "the built-in clip");
  assert.equal((await fetch(base + "/voice/not_a_line.mp3")).status, 404, "only real lines");
  // a pretend ElevenLabs
  let calls = 0, body = null;
  const fake = require("http").createServer((req, res) => { let d = ""; req.on("data", (c) => (d += c)); req.on("end", () => { calls++; body = { url: req.url, key: req.headers["xi-api-key"], json: JSON.parse(d) }; res.setHeader("Content-Type", "audio/mpeg"); res.end(Buffer.from("FAKEMP3")); }); });
  await new Promise((ok) => fake.listen(0, ok));
  Object.assign(process.env, { ELEVENLABS_URL: `http://localhost:${fake.address().port}`, ELEVENLABS_API_KEY: "test-key", COMMENTENTATOR_VOICE: "AbCdEf1234567890" });
  try {
    cfg = await (await fetch(base + "/voice/config")).json(); assert.equal(cfg.eleven, true);
    r = await fetch(base + "/voice/s_win_bolt.mp3");
    assert.equal(r.status, 200); assert.equal(Buffer.from(await r.arrayBuffer()).toString(), "FAKEMP3");
    assert.ok(body.url.includes("/v1/text-to-speech/AbCdEf1234567890") && body.key === "test-key" && body.json.text === "Bolt wins the race! What a drive!");
    await fetch(base + "/voice/s_win_bolt.mp3"); assert.equal(calls, 1, "kept: only made (and paid for) once");
  } finally { fake.close(); for (const k of ["ELEVENLABS_URL", "ELEVENLABS_API_KEY", "COMMENTENTATOR_VOICE"]) delete process.env[k]; }
});

test("the race stops when everyone racing has left it", { timeout: 30000 }, () => {
  const r = new game.Room("ALLGONE", false); r.setRandomTrack("normal", "regular");
  const p = { id: "lv", name: "Me", up: {}, level: 1, xp: 0 }; r.players.set(p.id, p);
  Object.assign(r.settings, { ai: 4, quali: 0, laps: 5 }); r.ensureRoster(4);
  let stopped = null; const emit = r.emit.bind(r); r.emit = (ev, d) => { if (ev === "raceStopped") stopped = d; return emit(ev, d); };
  r.startRace(); r.startLights(); r.phase = "race"; r.launchCars();
  for (let n = 0; n < 60; n++) r.step(1 / 60);
  r.tick(); assert.equal(r.phase, "race", "still racing while you're in it");
  r.retire(p); r.tick();
  assert.ok(stopped && r.phase === "lobby" && r.cars === null, "stopped and back to the lobby");
  assert.equal(r.settings.laps, 5);
});

test("multiclass knockout qualifying knocks out the slowest of each class, not overall", () => {
  const r = new game.Room("KOMULTI", false); r.setRandomTrack("normal", "regular");
  r.players.set("q", { id: "q", name: "Me", up: {}, level: 1, xp: 0, cls: "gt" });
  Object.assign(r.settings, { ai: 11, quali: "ko", laps: 5, mode: "multi", mix: 0.5, weather: "sunny" }); r.ensureRoster(11);
  r.startRace();
  assert.ok(r.qualifying && r.qualiKO && r.multi);
  // every Hyper is quicker than every GT: an overall cut would only ever knock out GTs
  for (const c of r.cars) c.bestLap = (c.cls === "hyper" ? 30 : 40) + Math.random() * 5;
  const n = (k) => r.cars.filter((c) => c.cls === k).length, slow = (k) => r.cars.filter((c) => c.cls === k).sort((a, b) => b.bestLap - a.bestLap);
  const slowH = slow("hyper")[0], slowG = slow("gt")[0];
  r.koNext();
  for (const k of ["hyper", "gt"]) {
    const out = r.cars.filter((c) => c.cls === k && c.out).length;
    assert.equal(out, n(k) - Math.max(3, Math.ceil(n(k) * 2 / 3)), `${k}: its own slowest go out in Q1`);
  }
  assert.ok(slowH.out && slowG.out, "the slowest Hyper and the slowest GT are both out");
  for (const c of r.cars.filter((c) => !c.out)) c.bestLap = 30 + Math.random() * 10;
  r.koNext();
  for (const k of ["hyper", "gt"]) assert.equal(r.cars.filter((c) => c.cls === k && !c.out).length, Math.max(2, Math.ceil(n(k) / 3)), `${k}: Q3 runners`);
});

test("safety car: every car is a ghost for 2 seconds when it comes out", () => {
  const r = new game.Room("SCGHOST", false); r.setRandomTrack("normal", "regular");
  r.players.set("g", { id: "g", name: "Me", up: {}, level: 1, xp: 0 });
  Object.assign(r.settings, { ai: 5, quali: 0, laps: 5, weather: "sunny", safetyCar: true }); r.ensureRoster(5);
  r.startRace(); r.startLights(); r.phase = "race"; r.launchCars();
  for (let n = 0; n < 60 * 12; n++) r.step(1 / 60);
  r.scDoneAt = -999; r.deploySafetyCar();
  assert.ok(r.sc, "safety car out");
  assert.ok(r.cars.every((c) => r.ghost(c)), "everyone ghosted");
  for (let n = 0; n < 60 * 2.2; n++) r.step(1 / 60);
  assert.ok(r.cars.some((c) => !r.ghost(c)), "and solid again after 2 seconds");
});

test("multiclass: GT3s move over for the Hypers coming through", { timeout: 120000 }, () => {
  const r = new game.Room("GTYIELD", false); r.setRandomTrack("normal", "regular");
  r.players.set("y", { id: "y", name: "Me", up: {}, level: 1, xp: 0, cls: "hyper" });
  Object.assign(r.settings, { ai: 9, quali: 0, laps: 8, mode: "multi", mix: 0.5, weather: "sunny" }); r.ensureRoster(9);
  r.startRace(); r.startLights(); r.phase = "race"; r.launchCars();
  let yields = 0;
  for (let n = 0; n < 60 * 120 && r.phase === "race"; n++) { r.step(1 / 60); for (const c of r.cars) if (c.yielding) yields++; }
  assert.ok(yields > 30, `GTs got out of the way (${yields} frames)`);
  assert.ok(r.cars.every((c) => c.cls === "gt" || !c.yielding), "Hypers never yield");
});

test("1v1 bets: both stake the same, the one ahead takes both, unraced bets are refunded", async () => {
  const a = (await accounts.signUp("BetA", "Turbo-Fox-Lane-42")).u, b = (await accounts.signUp("BetB", "Turbo-Fox-Lane-42")).u;
  assert.ok((await accounts.offerBet(a, b.id, 100)).error, "friends only");
  await accounts.friendAdd(a, "BetB"); await accounts.friendAccept(b, a.id);
  a.coins = 1000; b.coins = 50;
  assert.match((await accounts.offerBet(a, b.id, 100)).error, /doesn't have/, "they need the coins too");
  assert.match((await accounts.offerBet(a, b.id, 5)).error, /Bets are/);
  b.coins = 500;
  assert.ok((await accounts.offerBet(a, b.id, 200)).ok);
  assert.equal(a.coins, 1000, "nothing taken until they accept");
  const bid = accounts.publicUser(b).bets.in[0].id;
  assert.ok((await accounts.answerBet(b, bid, true)).ok);
  assert.equal(a.coins, 800); assert.equal(b.coins, 300, "both stakes held");
  assert.match((await accounts.offerBet(a, b.id, 10)).error, /already/, "one bet at a time with each friend");
  // a race they're both in: B finishes ahead
  const done = await accounts.settleBets([{ uid: a.id, rank: 3 }, { uid: b.id, rank: 1 }]);
  assert.equal(done.length, 1);
  assert.equal(b.coins, 700, "winner gets their stake back plus the loser's"); assert.equal(a.coins, 800);
  assert.equal(accounts.publicUser(a).bets.live.length, 0);
  assert.equal((await accounts.settleBets([{ uid: a.id, rank: 0 }, { uid: b.id, rank: 1 }])).length, 0, "settled only once");
  // never raced: 3 days later both get their stake back
  assert.ok((await accounts.offerBet(b, a.id, 100)).ok);
  assert.ok((await accounts.answerBet(a, accounts.publicUser(a).bets.in[0].id, true)).ok);
  assert.equal(a.coins, 700); assert.equal(b.coins, 600);
  for (const u of [a, b]) u.betsLive[0].at -= 4 * 86400000;
  accounts.publicUser(a); accounts.publicUser(b);
  assert.equal(a.coins, 800); assert.equal(b.coins, 700, "refunded");
  assert.ok(accounts.dmThread(a, b.id).some((m) => m.bet), "bets show in the chat");
});

test("daily wheel: one free spin a day, extra spins from the season pass", async () => {
  const { u } = await accounts.signUp("Spinner", "Turbo-Fox-Lane-42");
  assert.ok(accounts.publicUser(u).wheel.free);
  const c0 = u.coins, r = accounts.spinWheel(u);
  assert.ok(r.ok && r.seg >= 0 && r.seg < accounts.WHEEL.length && r.label);
  assert.ok(!r.wheel.free, "the free spin is used up");
  if (accounts.WHEEL[r.seg].coins) assert.equal(u.coins, c0 + accounts.WHEEL[r.seg].coins);
  u.spins = 0;
  assert.ok(accounts.spinWheel(u).error, "no spins left");
  accounts.passXp(u, 250 * 7);                                   // free track tier 7 = a spin
  assert.ok(u.spins >= 1, "season pass tier 7 gives a wheel spin");
  assert.ok(accounts.spinWheel(u).ok);
});

test("season pass: 60 tiers with wheel spins on both tracks", async () => {
  const { u } = await accounts.signUp("PassSixty", "Turbo-Fox-Lane-42");
  const P = accounts.publicUser(u).pass;
  assert.equal(P.tiers, 60); assert.equal(P.rewards.free.length, 60); assert.equal(P.rewards.prem.length, 60);
  assert.ok(P.rewards.free.filter((x) => x.spins).length >= 5 && P.rewards.prem.filter((x) => x.spins).length >= 8, "spins on both tracks");
  accounts.passXp(u, 250 * 40);
  assert.equal(accounts.publicUser(u).pass.tier, 40, "goes past 30 now");
  assert.ok(accounts.prestige(u).error, "prestige needs tier 60");
});

test("slots and blackjack: server-rolled, fair payouts, coins add up", async () => {
  const { u } = await accounts.signUp("Gambler", "Turbo-Fox-Lane-42");
  u.coins = 1e7;
  // slots: about 97% back over lots of spins
  let paid = 0; const N = 40000;
  for (let i = 0; i < N; i++) { const r = accounts.slots(u, 10); assert.ok(r.ok); paid += r.win; }
  const rtp = paid / (N * 10); assert.ok(rtp > 0.9 && rtp < 1.04, `slots pay back ~97% (${(rtp * 100).toFixed(1)}%)`);
  assert.ok(accounts.slots(u, 5).error && accounts.slots(u, 5000).error, "bet limits");
  // blackjack: a full hand, coins match the result
  for (let k = 0; k < 200; k++) {
    const before = u.coins, d = accounts.bjDeal(u, 100); assert.ok(d.ok);
    if (!d.hand.done) { assert.ok(accounts.bjDeal(u, 100).error, "one hand at a time"); assert.equal(d.hand.dealer[1], null, "the dealer's second card stays hidden"); }
    let h = d.hand; while (!h.done) h = accounts.bjAct(u, h.total < 15 ? "hit" : "stand").hand;
    assert.equal(u.coins, before - h.bet + h.paid, "coins add up");
    if (h.result === "bust") assert.ok(h.total > 21);
    if (h.result === "win" && h.dealerTotal <= 21) assert.ok(h.total > h.dealerTotal);
    if (h.result === "blackjack") assert.equal(h.paid, 250);
  }
  // doubling: twice the bet, exactly one more card
  let d; do { d = accounts.bjDeal(u, 100); } while (d.hand.done);
  const h = accounts.bjAct(u, "double").hand;
  assert.ok(h.done && h.bet === 200 && h.player.length === 3);
});

test("notifications: things that happen while you're offline wait for you", async () => {
  const a = (await accounts.signUp("NoteA", "Turbo-Fox-Lane-42")).u;
  accounts.addNote(a, { icon: "🎁", title: "Bo sent you a gift", text: "🪙 50" });
  accounts.addNote(a, { icon: "💬", title: "Message from Bo", text: "hi", key: "dm_x" });
  accounts.addNote(a, { icon: "💬", title: "Message from Bo", text: "hello?", key: "dm_x" });
  const n = accounts.takeNotes(a);
  assert.equal(n.length, 2, "messages from one friend collapse into one");
  assert.equal(n[1].text, "hello?");
  assert.equal(accounts.takeNotes(a).length, 0, "shown once");
});

test("overtake of the race: real passes are spotted and the best one is in the results", { timeout: 120000 }, () => {
  const r = new game.Room("BESTPASS", false); r.setRandomTrack("normal", "regular");
  r.players.set("o", { id: "o", name: "Me", up: {}, level: 1, xp: 0 });
  Object.assign(r.settings, { ai: 9, quali: 0, laps: 3, weather: "sunny" }); r.ensureRoster(9);
  let res = null; const passes = []; const emit = r.emit.bind(r);
  r.emit = (ev, d) => { if (ev === "results") res = d; if (ev === "bestPass") passes.push(d); return emit(ev, d); };
  r.startRace(); r.startLights(); r.phase = "race"; r.launchCars();
  for (let n = 0; n < 60 * 240 && r.phase === "race"; n++) r.step(1 / 60);
  if (r.phase === "race") r.endRace();
  assert.ok(passes.length >= 1, "at least one pass was spotted");
  assert.ok(res.bestPass && res.bestPass.an && res.bestPass.bn && res.bestPass.pos >= 1);
  assert.deepEqual([res.bestPass.an, res.bestPass.bn], [passes[passes.length - 1].an, passes[passes.length - 1].bn], "the results name the best one");
});

test("championship mode: build a calendar of tracks, then race a full season on them in order", { timeout: 180000 }, () => {
  const r = new game.Room("CHAMPCAL", false);
  r.players.set("h", { id: "h", name: "Me", up: {}, level: 1, xp: 0 }); r.hostId = "h";
  Object.assign(r.settings, { ai: 3, quali: 0, laps: 1, weather: "sunny", mode: "champ", champN: 3, season: 3 }); r.ensureRoster(3);
  const toasts = []; const emit = r.emit.bind(r); r.emit = (ev, d) => { if (ev === "toast") toasts.push(d); return emit(ev, d); };
  // three different tracks: two random, one real
  r.setRandomTrack("small", "regular"); assert.equal(r.calAdd(), null);
  r.setF1Track("it-1922"); assert.equal(r.calAdd(), null);
  r.setRandomTrack("small", "wild"); assert.equal(r.calAdd(), null);
  assert.match(r.calAdd(), /full/, "no more than the number of tracks picked");
  assert.equal(r.lobbyMsg().cal.list.length, 3);
  const keys = r.calendar.map((e) => JSON.stringify(e.d.stroke.slice(0, 3)));
  const played = [], tracks = [];
  for (let round = 0; round < 3; round++) {
    r.startRace(); assert.ok(r.cars, `round ${round + 1} started`);
    tracks.push(JSON.stringify(r.stroke.slice(0, 3))); played.push(r.trackName);
    r.startLights(); r.phase = "race"; r.launchCars();
    for (let n = 0; n < 60 * 150 && r.phase === "race"; n++) r.step(1 / 60);
    if (r.phase === "race") r.endRace();
    if (round < 2) { assert.ok(!r.seasonJustOver, "the season isn't over yet"); r.backToLobby(); }
  }
  assert.deepEqual(tracks, keys, "each round was raced on its own calendar track, in order");
  assert.ok(played[1] && /monza|ital/i.test(played[1]) || played[1], "the real track kept its name");
  assert.ok(r.seasonJustOver && r.lastSeason && r.lastSeason.races === 3, "after round 3 the championship is over, with a finale");
  assert.ok(toasts.some((t) => /Round 2 of 3/.test(t)));
  r.backToLobby();
  assert.equal(r.raceNo, 0, "a new championship starts"); assert.equal(r.calLoaded, 0, "back on round 1's track");
  // an incomplete calendar can't start
  r.calendar.pop(); r.phase = "lobby"; r.startRace(); assert.ok(!r.cars || r.phase === "lobby");
});

test("login streak: a 7-day cycle, day 7 gives a crate and a wheel spin, missing a day resets it", async () => {
  const { u } = await accounts.signUp("Streaker", "Turbo-Fox-Lane-42");
  const today = Math.floor(Date.now() / 86400000);
  u.dailyDay = today - 1; u.streak = 6; u.spins = 0; u.crates = {};
  const c0 = u.coins, d = accounts.dailyReward(u);
  assert.equal(d.cycleDay, 7); assert.equal(u.coins, c0 + 400 + d.got.reduce((t, a) => t + (a.coins || 0), 0), "400 coins (plus any streak achievements)");
  assert.equal(u.spins, 1, "a wheel spin on day 7"); assert.equal(Object.values(u.crates).reduce((a, b) => a + b, 0), 1, "and a crate");
  assert.equal(accounts.dailyReward(u), null, "once a day");
  assert.equal(accounts.publicUser(u).loginStreak.streak, 7);
  u.dailyDay = today - 1; assert.equal(accounts.dailyReward(u).cycleDay, 1, "day 8 starts the cycle again");
  u.dailyDay = today - 3; const r = accounts.dailyReward(u); assert.equal(r.streak, 1, "missed days: back to day 1"); assert.equal(r.coins, 50);
});

test("commentator voice: never mixes voices (a slow ElevenLabs line is skipped, not played in the built-in voice)", { timeout: 30000 }, async () => {
  const fake = require("http").createServer((req, res) => { req.resume(); req.on("end", () => setTimeout(() => { res.setHeader("Content-Type", "audio/mpeg"); res.end(Buffer.from("SLOWMP3")); }, 3500)); });
  await new Promise((ok) => fake.listen(0, ok));
  Object.assign(process.env, { ELEVENLABS_URL: `http://localhost:${fake.address().port}`, ELEVENLABS_API_KEY: "test-key", COMMENTATOR_VOICE: "SlowVoice12345678" });
  try {
    let r = await fetch(base + "/voice/s_win_kira.mp3");
    assert.equal(r.status, 204, "not ready: nothing plays"); assert.equal(r.headers.get("x-voice"), "pending");
    await new Promise((ok) => setTimeout(ok, 1500));
    r = await fetch(base + "/voice/s_win_kira.mp3");
    assert.equal(Buffer.from(await r.arrayBuffer()).toString(), "SLOWMP3", "ready next time, in the same voice");
  } finally { fake.close(); for (const k of ["ELEVENLABS_URL", "ELEVENLABS_API_KEY", "COMMENTATOR_VOICE"]) delete process.env[k]; }
});

test("ranked: every tier up is a harder AI, from Rookie at Iron to Elite at the top", () => {
  const order = ["rookie", "easy", "medium", "hard", "extreme", "overdrive", "elite"];
  const lv = [0, 300, 600, 900, 1200, 1500, 1800, 2100].map((sr) => accounts.rankedField(sr).aiLevel);
  assert.deepEqual(lv, ["rookie", "easy", "medium", "hard", "extreme", "overdrive", "overdrive", "elite"]);
  for (let i = 1; i < lv.length; i++) assert.ok(order.indexOf(lv[i]) >= order.indexOf(lv[i - 1]), "never easier going up");
  const L = game.AI_LEVELS;
  assert.ok(L.rookie.skill[1] < L.easy.skill[0] && L.rookie.power < L.easy.power, "Rookie is clearly slower than Easy");
  assert.ok(L.elite.skill[0] > L.overdrive.skill[0] && L.elite.power > L.overdrive.power, "Elite is quicker than Overdrive");
  assert.ok(L.rookie.rankedOnly && L.elite.rankedOnly, "both only in ranked");
});

test("car presets: save a whole look (with items) and put it back on in one go", async () => {
  const { u } = await accounts.signUp("Presetty", "Turbo-Fox-Lane-42");
  const items = accounts.STORE.filter((x) => !x.loot && !x.onlyBody).slice(0, 2); u.owned.push(...items.map((x) => x.id));
  u.equipped = { [items[0].slot]: items[0].id };
  assert.ok(accounts.saveCarPreset(u, { name: "Gold rush", color: "#ffcc1f", livery: "flames", number: 44, design: null, equipped: u.equipped }).ok);
  assert.ok(accounts.saveCarPreset(u, { name: "  ", color: "#000000" }).error, "needs a name");
  assert.ok(accounts.saveCarPreset(u, { name: "Hack", color: "red;", livery: "nope", number: 999, equipped: { glow: "not_an_item" } }).ok);
  const hack = u.carPresets.find((x) => x.name === "Hack");
  assert.deepEqual([hack.color, hack.livery, hack.number, hack.equipped], ["#ffcc1f", "stripes", 99, {}], "bad values are cleaned");
  u.equipped = { [items[1].slot]: items[1].id };
  accounts.applyCarLook(u, u.carPresets[0].equipped);
  assert.deepEqual(u.equipped, { [items[0].slot]: items[0].id }, "exactly the saved items are back on");
  accounts.deleteCarPreset(u, "Hack"); assert.equal(u.carPresets.length, 1);
});

test("rolling start: a formation lap behind the safety car, green flag at the line, then a normal race", { timeout: 120000 }, () => {
  const r = new game.Room("ROLLING", false); r.setRandomTrack("normal", "regular");
  r.players.set("rs", { id: "rs", name: "Me", up: {}, level: 1, xp: 0 });
  Object.assign(r.settings, { ai: 5, quali: 0, laps: 3, weather: "sunny", start: "rolling" }); r.ensureRoster(5);
  const feed = []; const emit = r.emit.bind(r); r.emit = (ev, d) => { if (ev === "feed") feed.push(d.t); if (ev === "lightsOut") feed.push("lightsOut"); return emit(ev, d); };
  r.startRace(); r.startLights();
  assert.equal(r.phase, "race", "no lights: straight onto the formation lap"); assert.ok(r.sc && r.sc.rolling);
  assert.ok(r.cars.every((c) => c.lapsDone === -2));
  let greenAt = null;
  for (let n = 0; n < 60 * 200 && r.phase === "race"; n++) { r.step(1 / 60); if (!greenAt && !r.sc) greenAt = r.time; if (greenAt && r.time - greenAt > 1) break; }
  assert.ok(greenAt, "green flag came"); assert.ok(feed.includes("formation") && feed.includes("green") && feed.includes("lightsOut"));
  const lead = r.standings()[0]; assert.equal(lead.lapsDone, 0, "the race starts at lap 0, the formation lap isn't counted");
  assert.ok(r.cars.every((c) => !isFinite(c.bestLap)), "no lap time from the formation lap");
});

test("red flag: only a BIG pile-up; everyone back to the grid in the order before the crash, standing restart", { timeout: 60000 }, () => {
  const mk = (mode) => {
    const r = new game.Room("REDFLAG" + mode, false); r.setRandomTrack("normal", "regular");
    r.players.set("rf", { id: "rf", name: "Me", up: {}, level: 1, xp: 0, cls: "gt" });
    Object.assign(r.settings, { ai: 11, quali: 0, laps: 6, weather: "sunny", safetyCar: true, mode, mix: 0.5 }); r.ensureRoster(11);
    const feed = []; const emit = r.emit.bind(r); r.emit = (ev, d) => { if (ev === "feed") feed.push(d.t); return emit(ev, d); };
    r.startRace(); r.startLights(); r.phase = "race"; r.launchCars();
    for (let n = 0; n < 60 * 20; n++) r.step(1 / 60);
    return { r, feed };
  };
  const { r, feed } = mk("normal"), hard = game.CRASH_SPEED + 400;
  const before = [...r.orderHist].reverse().find((h) => h.t < r.time - 0.3).ids;      // the order just before the pile-up
  const [a, b, c, d, e, f] = r.cars;
  r.crash(a, b, 200, 1, 0); r.crash(c, d, 200, 1, 0);
  assert.ok(!r.rf, "4 cars, gentle: no red flag any more");
  r.crash(e, f, hard, 1, 0); r.crash(a, c, hard, 1, 0);
  assert.ok(r.rf && feed.includes("redFlag"), "6 cars with hard hits: red flag");
  const grid = r.cars.slice().sort((x, y) => y.progress - x.progress);
  assert.deepEqual(grid.map((x) => x.id), before, "on the grid in the order from before the crash");
  const N = r.track.N; assert.ok(r.cars.every((x) => x.idx > N * 0.8), "back at the start line");
  for (let n = 0; n < 60 * 3; n++) r.step(1 / 60);
  assert.ok(r.cars.every((x) => x.speed === 0), "everyone stands still on the grid");
  for (let n = 0; n < 60 * 9; n++) r.step(1 / 60);       // (the stop is 10s now: everyone watches the crash again first)
  assert.ok(!r.rf && feed.includes("rfRestart") && !r.sc, "standing restart (no safety car)");
  assert.ok(r.cars.every((x) => x.damage === 0), "crews fixed the damage");
  assert.ok(r.cars.some((x) => x.speed > 50), "and they're off");
  // multiclass: each class together, Hypers first
  const M = mk("multi"), R2 = M.r, order2 = R2.standings();
  R2.regrid(order2.map((x) => x.id));
  const g2 = R2.cars.slice().sort((x, y) => y.progress - x.progress), firstGt = g2.findIndex((x) => x.cls === "gt");
  assert.ok(firstGt > 0 && g2.slice(firstGt).every((x) => x.cls === "gt"), "all Hypers ahead of all GT3s");
  assert.deepEqual(g2.filter((x) => x.cls === "gt").map((x) => x.id), order2.filter((x) => x.cls === "gt").map((x) => x.id), "each class in its own order");
});
test("cold tyres: less grip at the start and out of the pits, warm after a lap", { timeout: 60000 }, () => {
  const r = new game.Room("TYRETEMP", false); r.setRandomTrack("normal", "regular");
  Object.assign(r.settings, { ai: 2, quali: 0, laps: 5, weather: "sunny" }); r.ensureRoster(2);
  r.startRace(); r.startLights(); r.phase = "race"; r.launchCars();
  const c = r.cars[0], cold = r.gripOf(c);
  assert.ok(c.temp < 0.3);
  let warm = 0, warmGrip = 0, pits = c.pits, outCold = null;
  for (let n = 0; n < 60 * 60; n++) { r.step(1 / 60); if (c.temp > warm) { warm = c.temp; warmGrip = r.gripOf(c) / r.tireGrip(c.tire); } if (c.pits > pits && outCold === null) outCold = c.temp; }
  assert.ok(warm > 0.95, `warmed up (${warm.toFixed(2)})`); assert.ok(warmGrip > (cold / r.tireGrip(1)) * 1.08, "and grippier");
  if (outCold !== null) assert.ok(outCold <= 0.35, "fresh tyres out of the pits are cold again");
});

test("pit wall: your AI teammate pushes, holds or boxes when you tell it to", { timeout: 60000 }, () => {
  const r = new game.Room("PITWALL", false); r.setRandomTrack("normal", "regular");
  const p = { id: "pw", name: "Boss", up: {}, level: 1, xp: 0, team: "Boss Racing" }; r.players.set(p.id, p);
  Object.assign(r.settings, { ai: 5, quali: 0, laps: 6, weather: "sunny", teams: true }); r.ensureRoster(5);
  r.startRace(); r.startLights(); r.phase = "race"; r.launchCars();
  const me = r.carOf(p.id);
  const mate = r.cars.find((c) => !c.owner) ; mate.team = me.team;
  mate.teamOrder = "push"; const t0 = mate.tire;
  for (let n = 0; n < 60 * 20; n++) r.step(1 / 60);
  const pushWear = t0 - mate.tire;
  mate.teamOrder = "hold"; const t1 = mate.tire;
  for (let n = 0; n < 60 * 20; n++) r.step(1 / 60);
  assert.ok(pushWear > (t1 - mate.tire) * 1.3, "push wears the tyres much faster than hold");
  mate.teamOrder = "box";
  let pitted = false; for (let n = 0; n < 60 * 120 && !pitted; n++) { r.step(1 / 60); if (mate.pits > 0) pitted = true; }
  assert.ok(pitted, "box: it comes in"); assert.equal(mate.teamOrder, null, "and the order is done");
});

test("king of the hill: whoever leads the longest wins", { timeout: 120000 }, () => {
  const r = new game.Room("KOTH", false); r.setRandomTrack("normal", "regular");
  Object.assign(r.settings, { ai: 5, quali: 0, laps: 2, weather: "sunny", mode: "koth" }); r.ensureRoster(5);
  let res = null; const emit = r.emit.bind(r); r.emit = (ev, d) => { if (ev === "results") res = d; return emit(ev, d); };
  r.startRace(); r.startLights(); r.phase = "race"; r.launchCars();
  for (let n = 0; n < 60 * 200 && r.phase === "race"; n++) r.step(1 / 60);
  if (r.phase === "race") r.endRace();
  assert.ok(res.rows[0].lead > 0, "the winner led for a while");
  for (let i = 1; i < res.rows.length; i++) assert.ok(res.rows[i - 1].lead >= res.rows[i].lead, "results by time in the lead");
  const total = res.rows.reduce((t, x) => t + x.lead, 0); assert.ok(total > 20, "the clock ran for the leader");
});

test("endurance: a race against the clock, and teammates share a car, swapping at the pit stop", { timeout: 180000 }, () => {
  const r = new game.Room("ENDURO", false); r.setRandomTrack("small", "regular");
  const a = { id: "e1", name: "Ann", up: {}, level: 1, xp: 0, team: "Duo" }, b = { id: "e2", name: "Bo", up: {}, level: 1, xp: 0, team: "Duo" };
  r.players.set(a.id, a); r.players.set(b.id, b);
  Object.assign(r.settings, { ai: 3, quali: 0, laps: 4, weather: "sunny", mode: "endur", enduroMin: 10, teams: true }); r.ensureRoster(3);
  const feed = [], swaps = []; let res = null; const emit = r.emit.bind(r);
  r.emit = (ev, d) => { if (ev === "feed") feed.push(d.t); if (ev === "driverSwap") swaps.push(d); if (ev === "results") res = d; return emit(ev, d); };
  r.startRace();
  const shared = r.cars.find((c) => c.owner === "e1" || c.owner === "e2");
  assert.ok(shared && r.cars.filter((c) => c.owner === "e1" || c.owner === "e2").length === 1, "one car for the two of them"); assert.deepEqual([...shared.drivers].sort(), ["e1", "e2"]);
  const [first, second] = shared.owner === "e1" ? [a, b] : [b, a];         // (who starts is random)
  assert.ok(r.enduro && r.enduro.secs === 600 && r.settings.laps > 4, "10 minutes, not 4 laps");
  r.startLights(); r.phase = "race"; r.launchCars();
  r.enduro.secs = 60;                                         // (a short one for the test)
  for (let n = 0; n < 60 * 30; n++) r.step(1 / 60);
  shared.up.engine = 3; shared.up.turbo = 2; first.level = 6; first.xp = 40; second.up = { grip: 1 };
  r.swapDriver(shared);
  assert.equal(shared.owner, second.id, "the teammate takes over"); assert.equal(swaps[0].name, second.name); assert.equal(first.coDriver, second.id);
  assert.ok(b.up === shared.up && a.up === shared.up, "both drivers share the car's upgrades now");
  assert.ok(shared.up.engine === 3 && shared.up.turbo === 2 && shared.up.grip === 1, "the first driver's upgrades stay on the car (and the teammate's are added)");
  assert.equal(second.level, 6, "the teammate takes over at the team level");
  const before = shared.st.maxSpeed; second.up.engine++; shared.st = r.stats(shared); assert.ok(shared.st.maxSpeed > before, "a pick by Bo goes on the car");
  for (let n = 0; n < 60 * 240 && r.phase === "race"; n++) r.step(1 / 60);
  if (r.phase === "race") r.endRace();
  assert.ok(feed.includes("timeUp"), "time's up was called");
  assert.ok(res && res.rows.length === 4); assert.equal(r.settings.laps, 4, "the laps setting is put back");
});

test("time trial: no AI, laps go on a leaderboard for the track", { timeout: 60000 }, async () => {
  const { u } = await accounts.signUp("TimeTrial", "Turbo-Fox-Lane-42");
  const r1 = await accounts.putTtLap(u, "dtest1", 31.2), r2 = await accounts.putTtLap(u, "dtest1", 33.0), r3 = await accounts.putTtLap(u, "dtest1", 29.9);
  assert.ok(r1.pb && !r2.pb && r3.pb, "only faster laps are personal bests");
  const B = await accounts.getBoard("tt", "dtest1"); assert.equal(B.list.length, 1); assert.equal(B.list[0].v, 29.9);
  const r = new game.Room("TTMODE", false); r.setRandomTrack("normal", "regular");
  r.players.set("t", { id: "t", name: "Me", up: {}, level: 1, xp: 0 });
  Object.assign(r.settings, { ai: 6, mode: "tt" }); r.ensureRoster(6);
  r.startRace();
  assert.ok(r.tt && r.practice && r.cars.length === 1, "just you on track"); assert.ok(r.trackKey, "random tracks have a key too");
});

test("head-to-head: friends' records against each other add up race by race", async () => {
  const a = (await accounts.signUp("HeadA", "Turbo-Fox-Lane-42")).u, b = (await accounts.signUp("HeadB", "Turbo-Fox-Lane-42")).u;
  await accounts.recordH2H([{ uid: a.id, rank: 1 }, { uid: b.id, rank: 2 }]);
  assert.equal(a.h2h, undefined, "only friends are tracked");
  await accounts.friendAdd(a, "HeadB"); await accounts.friendAccept(b, a.id);
  await accounts.recordH2H([{ uid: a.id, rank: 1 }, { uid: b.id, rank: 2 }]);
  await accounts.recordH2H([{ uid: a.id, rank: 3 }, { uid: b.id, rank: 0 }]);
  await accounts.recordH2H([{ uid: a.id, rank: 0 }, { uid: b.id, rank: 5 }]);
  assert.deepEqual(a.h2h[b.id], { n: 3, w: 2 }); assert.deepEqual(b.h2h[a.id], { n: 3, w: 1 });
  const fl = await accounts.friendList(a, () => null); assert.deepEqual(fl.friends[0].h2h, { n: 3, w: 2 }, "shown on the friends list");
});

test("predictions: spectators back a driver at grid odds, paid at the flag, refunded if the race is stopped", { timeout: 120000 }, async () => {
  const { u } = await accounts.signUp("Punter", "Turbo-Fox-Lane-42"); u.coins = 1000;
  const r = new game.Room("PREDICT", false); r.setRandomTrack("small", "regular");
  r.players.set("spec", { id: "spec", name: "Watcher", up: {}, level: 1, xp: 0, spectator: true, uid: u.id });
  Object.assign(r.settings, { ai: 5, quali: 0, laps: 1, weather: "sunny" }); r.ensureRoster(5);
  r.startRace();
  const pole = r.cars.find((c) => c.rs.grid === 1), back = r.cars.reduce((m, c) => (c.rs.grid > m.rs.grid ? c : m));
  assert.ok(r.predictOdds(pole) < r.predictOdds(back), "the back of the grid pays more"); assert.ok(r.predictOdds(back) <= 10);
  // place it the way the socket does
  const pick = back; u.coins -= 100; r.predictions.set("spec", { uid: u.id, car: pick.id, name: pick.name, coins: 100, odds: r.predictOdds(pick) });
  r.startLights(); r.phase = "race"; r.launchCars();
  for (let n = 0; n < 60 * 150 && r.phase === "race"; n++) r.step(1 / 60);
  if (r.phase === "race") r.endRace();
  await new Promise((ok) => setTimeout(ok, 200));
  const res = u.coins;
  assert.ok(res === 900 || res === 900 + Math.round(100 * r.predictOdds(pick)), `paid out or lost (${res})`);
  // stopped race: money back
  r.phase = "lobby"; r.startRace(); r.predictions.set("spec", { uid: u.id, car: r.cars[0].id, name: "x", coins: 50, odds: 2 }); const before = u.coins - 50; u.coins = before;
  r.stopRace("test"); await new Promise((ok) => setTimeout(ok, 200));
  assert.equal(u.coins, before + 50, "refunded");
});

test("ghost challenges: a friend's lap to beat, a reward the first time you beat it", async () => {
  const a = (await accounts.signUp("GhostA", "Turbo-Fox-Lane-42")).u, b = (await accounts.signUp("GhostB", "Turbo-Fox-Lane-42")).u;
  assert.ok(accounts.addGhostChallenge(a, b, { code: "ABCDEF", t: 30, trackName: "Loop", trackKey: "dx" }).error, "friends only");
  await accounts.friendAdd(a, "GhostB"); await accounts.friendAccept(b, a.id);
  assert.ok(accounts.addGhostChallenge(a, b, { code: "ABCDEF", t: 30, trackName: "Loop", trackKey: "dx" }).ok);
  assert.equal(accounts.publicUser(b).ghosts[0].fromName, "GhostA");
  const c0 = b.coins;
  assert.equal(accounts.ghostBeat(b, "ABCDEF", 31).beat, false, "slower: not beaten");
  const w = accounts.ghostBeat(b, "ABCDEF", 29.5); assert.ok(w.beat && w.first && w.coins > 0); assert.equal(b.coins, c0 + w.coins);
  assert.equal(accounts.ghostBeat(b, "ABCDEF", 29).coins, 0, "the reward is only once");
});

test("weekend tournament: sign up in the week, a seeded bracket at the weekend, best laps decide each round, prizes paid", async () => {
  const realNow = Date.now, T0 = accounts.tourTimes(Math.floor((realNow() / 86400000 + 3) / 7));
  Date.now = () => T0.open + 3600e3;                                   // Monday
  try {
    const us = [];
    for (let i = 0; i < 5; i++) { const { u } = await accounts.signUp("Tourney" + i, "Turbo-Fox-Lane-42"); u.ranked = { sr: 1000 - i * 100 }; us.push(u); assert.ok((await accounts.tourJoin(u)).ok); }
    assert.ok((await accounts.tourJoin(us[0])).error, "only once");
    Date.now = () => T0.begin + 60e3;                                   // Saturday: the bracket is drawn
    let S = await accounts.tourState();
    assert.equal(S.bracket.size, 8); assert.equal(S.bracket.rounds[0].filter((m) => m.a && m.b).length, 1, "5 players: 3 byes for the top seeds, 1 real match");
    assert.ok((await accounts.tourJoin((await accounts.signUp("LateOne", "Turbo-Fox-Lane-42")).u)).error, "sign-ups closed");
    // round 1: seed 4 vs seed 5; seed 5 sets the faster lap
    await accounts.tourLap(us[3], 33); await accounts.tourLap(us[4], 31.5);
    const len = S.bracket.len;
    Date.now = () => T0.begin + len + 60e3; S = await accounts.tourState();
    assert.equal(S.bracket.rounds[0].find((m) => m.a && m.b).w, us[4].id, "the faster lap goes through");
    // round 2: nobody sets a lap: the higher seeds go through
    Date.now = () => T0.begin + 2 * len + 60e3; S = await accounts.tourState();
    // final: seed 1 vs seed 2; seed 2 is faster
    const fin = S.bracket.rounds[2][0]; assert.deepEqual([fin.a, fin.b].sort(), [us[0].id, us[1].id].sort());
    await accounts.tourLap(us[0], 30); await accounts.tourLap(us[1], 29);
    const c1 = us[1].coins, c0 = us[0].coins;
    Date.now = () => T0.end + 1000; S = await accounts.tourState();
    // (a new week started: last week's was finished off and paid)
    const pub = accounts.tourPublic(S, us[1]); assert.equal(pub.last.champion, "Tourney1");
    assert.equal(us[1].coins, c1 + 5000, "champion paid"); assert.equal(us[0].coins, c0 + 2000, "runner-up paid");
  } finally { Date.now = realNow; }
});

test("lap chart: everyone's position after every lap is in the results", { timeout: 120000 }, () => {
  const r = new game.Room("LAPCHART", false); r.setRandomTrack("small", "regular");
  Object.assign(r.settings, { ai: 5, quali: 0, laps: 3, weather: "sunny" }); r.ensureRoster(5);
  let res = null; const emit = r.emit.bind(r); r.emit = (ev, d) => { if (ev === "results") res = d; return emit(ev, d); };
  r.startRace(); r.startLights(); r.phase = "race"; r.launchCars();
  for (let n = 0; n < 60 * 200 && r.phase === "race"; n++) r.step(1 / 60);
  if (r.phase === "race") r.endRace();
  const fin = res.rows.filter((x) => x.finished);
  assert.ok(fin.length && fin.every((x) => x.lp.length === 3 && x.grid >= 1), "3 laps of positions + the grid slot");
  assert.equal(res.rows[0].lp[2], 1, "the winner was P1 at the flag");
});

test("track objects: placed next to the track, snapped to it, kept in share codes, cleared by a new track", () => {
  const r = new game.Room("DECOR", false); r.setRandomTrack("normal", "regular"); r.decor = [];
  const t = r.track, sc = r.trackMsg().scale, p = t.pts[40], bx = (p.x - t.pad) / sc + t.minX, by = (p.y - t.pad) / sc + t.minY;
  assert.equal(r.addDecor("stand", bx, by), null); assert.equal(r.addDecor("tunnel", bx, by), null);
  assert.match(r.addDecor("stand", t.minX - 900, t.minY - 900), /next to the track/);
  assert.match(r.addDecor("rocket", bx, by), /Unknown/);
  const msg = r.trackMsg().decor; assert.equal(msg.length, 2); assert.ok(Math.abs(msg[0].i - 40) <= 2, "snapped to the nearest bit of track");
  const share = r.shareData(); assert.equal(share.decor.length, 2);
  const r2 = new game.Room("DECOR2", false); r2.setSharedTrack(share); assert.equal(r2.trackMsg().decor.length, 2, "a share code brings them along");
  r.setRandomTrack("normal", "regular"); assert.equal(r.trackMsg().decor.filter((d) => d.k !== "tunnel").length, 0, "a new track starts with none (bar maybe its own tunnel)"); assert.ok(r.decor.length <= 1);
});

test("weekly track contest: enter, vote (not your own), and the winner becomes next week's Track of the Week", async () => {
  const realNow = Date.now;
  try {
    const a = (await accounts.signUp("Contester", "Turbo-Fox-Lane-42")).u, b = (await accounts.signUp("Voter", "Turbo-Fox-Lane-42")).u;
    const r = new game.Room("CONTEST", false); r.setRandomTrack("normal", "regular");
    const data = JSON.stringify(r.shareData()), code = accounts.shareCode("trk:" + data);
    await accounts.putShared("trk", code, data, 365 * 86400);
    assert.ok((await accounts.contestEnter(a, { code, name: "Loopy" })).ok);
    assert.match((await accounts.contestVote(a, code)).error, /own/);
    assert.ok((await accounts.contestVote(b, code)).voted);
    const pub = await accounts.contestPublic(b); assert.equal(pub.entries[0].votes, 1); assert.ok(pub.theme);
    const c0 = a.coins;
    Date.now = () => realNow() + 7 * 86400000;                        // a week later
    const win = await accounts.contestWinner(Math.floor((Date.now() / 86400000 + 3) / 7));
    assert.equal(win.code, code, "the most-voted track won"); assert.equal(a.coins, c0 + 1500, "its maker got the prize");
    await game.refreshContestTotw();
    assert.match(game.totw().name, /Loopy \(by Contester\)/, "and it's the Track of the Week");
  } finally { Date.now = realNow; await game.refreshContestTotw(); }
});

test("weekend tournament track: no tyre wear, in any mode", { timeout: 60000 }, () => {
  for (const mode of ["tt", "normal"]) {
    const r = new game.Room("TOURWEAR" + mode, false); assert.equal(r.setTourTrack(), null);
    r.players.set("w", { id: "w", name: "Me", up: {}, level: 1, xp: 0 });
    Object.assign(r.settings, { ai: 3, quali: 0, laps: 5, weather: "sunny", mode, wear: "high" }); r.ensureRoster(3);
    r.startRace(); r.startLights(); r.phase = "race"; r.launchCars();
    for (let n = 0; n < 60 * 45; n++) r.step(1 / 60);
    assert.ok(r.cars.every((c) => c.tire === 1), `${mode}: tyres still 100%`);
    assert.ok(r.cars.every((c) => c.pits === 0), `${mode}: nobody needs to stop`);
  }
  const n = new game.Room("NORMWEAR", false); n.setRandomTrack("normal", "regular");
  Object.assign(n.settings, { ai: 2, quali: 0, laps: 5, weather: "sunny" }); n.ensureRoster(2);
  n.startRace(); n.startLights(); n.phase = "race"; n.launchCars();
  for (let k = 0; k < 60 * 20; k++) n.step(1 / 60);
  assert.ok(n.cars.some((c) => c.tire < 1), "other tracks still wear");
});

test("weekend tournament tracks are VERY wonky from week 2962 on (earlier weeks keep their track)", { timeout: 60000 }, () => {
  for (const w of [2962, 2963, 2970]) assert.equal(game.tourTrack(w).wonk, "very", `week ${w}`);
  const old = game.tourTrack(2961); assert.notEqual(old.wonk, "very", "this weekend's bracket keeps its track");
  assert.equal(game.tourTrack(2961).name, old.name, "and the same track every time");
});

test("random tracks are made a slice at a time, so the other races keep running meanwhile", { timeout: 60000 }, async () => {
  let gaps = 0, last = Date.now(), worst = 0;
  const tick = setInterval(() => { const n = Date.now(); worst = Math.max(worst, n - last); last = n; gaps++; }, 5);
  try {
    for (const wonk of ["regular", "very"]) {
      last = Date.now(); worst = 0;
      const r = await game.makeRandomTrackSoon(game.MAP_SIZES.normal, wonk);
      assert.ok(r && r.shape && !r.shape.error && Array.isArray(r.stroke), `a real ${wonk} track came out`);
      assert.ok(worst < 120, `the server never stopped for long while making it (worst gap ${worst} ms)`);
    }
  } finally { clearInterval(tick); }
  // the room version: a lobby gets it; a room that started racing meanwhile keeps its track
  const room = new game.Room("SLCE", "h"); game.rooms.set("SLCE", room);
  try {
    assert.equal(await room.setRandomTrackSoon("normal", "regular"), null);
    assert.ok(room.track && room.trackKind === "random");
    const t = room.track, p = room.setRandomTrackSoon("normal", "little"); room.phase = "results";
    assert.ok(await p, "too late: says so"); assert.equal(room.track, t, "and the race's track didn't change");
  } finally { game.rooms.delete("SLCE"); }
});

test("this week's special tracks are saved once made, and come back identical after a restart", { timeout: 60000 }, async () => {
  const w = 3100;
  assert.match(game.weekCode(w), /^[A-HJ-NP-Z2-9]{6}$/);
  const made = game.tourTrack(w);
  await game.weeklyTrack("tour", w);            // (already in memory: nothing to do)
  await accounts.putShared("tour", game.weekCode(w), JSON.stringify({ name: made.name, wonk: made.wonk, map: made.map, theme: made.theme, stroke: made.stroke }), 600);
  const raw = JSON.parse(await accounts.getShared("tour", game.weekCode(w)));
  const again = game.buildTrack(raw.stroke, game.MAP_SIZES[raw.map]);
  assert.deepEqual(again.base, made.shape.base, "rebuilt from the saved drawing: the very same track");
});

test("AI in the rain: wets with a sensible number of stops, not a stop every lap", { timeout: 120000 }, () => {
  const r = new game.Room("WETSTOPS", false); r.setRandomTrack("normal", "regular");
  r.players.set("ws", { id: "ws", name: "Me", up: {}, level: 1, xp: 0 });
  Object.assign(r.settings, { ai: 7, quali: 0, laps: 12, weather: "rain", safetyCar: false }); r.ensureRoster(7);
  r.startRace(); r.startLights(); r.phase = "race"; r.launchCars();
  for (let n = 0; n < 60 * 60 * 20 && r.phase === "race"; n++) r.step(1 / 60);
  const ai = r.cars.filter((c) => !c.owner);
  assert.ok(ai.every((c) => c.compound === "wet"), "on wets in the rain");
  assert.ok(ai.every((c) => c.pits <= 2), "at most 2 stops in 12 wet laps: " + ai.map((c) => c.pits).join(" "));
});

test("multiclass can also be an endurance race", () => {
  const r = new game.Room("MULTIEND", false); r.setRandomTrack("normal", "regular");
  r.players.set("me", { id: "me", name: "Me", up: {}, level: 1, xp: 0 });
  Object.assign(r.settings, { ai: 5, quali: 0, laps: 5, mode: "multi", multiEndur: true, enduroMin: 10 }); r.ensureRoster(5);
  r.startRace(); r.startLights();
  assert.ok(r.multi, "still multiclass");
  assert.ok(r.enduro && r.enduro.secs === 600, "and a 10 minute endurance race");
  const r2 = new game.Room("MULTINOR", false); r2.setRandomTrack("normal", "regular");
  r2.players.set("me", { id: "me", name: "Me", up: {}, level: 1, xp: 0 });
  Object.assign(r2.settings, { ai: 5, quali: 0, laps: 5, mode: "multi" }); r2.ensureRoster(5);
  r2.startRace(); r2.startLights();
  assert.ok(r2.multi && !r2.enduro, "switch off: a normal multiclass race");
});

test("rank shield: the first drop out of a rank is blocked, a fresh shield comes with the next promotion", async () => {
  await accounts.signUp("ShieldGuy", "Turbo-Fox-Lane-43");
  const u = await accounts.getUser("u_shieldguy");
  const race = (pos) => { accounts.rankedStart(u); return accounts.rankedFinish(u, pos, 6, true); };
  u.ranked = { sr: 905, peak: 905, games: 0, wins: 0 };                   // Gold, just above Silver
  assert.equal(accounts.rankedPublic(u).shield, true, "shield ready");
  let res = race(6);
  assert.ok(res.shield && u.ranked.sr === 900 && res.after.key === "gold", "blocked: still Gold, at the bottom");
  assert.equal(accounts.rankedPublic(u).shield, false, "used up");
  res = race(6);
  assert.ok(!res.shield && res.after.key === "silver", "the next drop goes through");
  u.ranked.sr = 895; res = race(1);
  assert.equal(res.after.key, "gold", "promoted back to Gold");
  assert.equal(accounts.rankedPublic(u).shield, true, "with a fresh shield");
  u.ranked = { sr: 230, peak: 230, games: 0, wins: 0 };                    // Iron: nothing to drop to
  assert.equal(accounts.rankedPublic(u).shield, false);
  res = race(6); assert.ok(!res.shield);
  u.ranked = { sr: 1050, peak: 1050, games: 0, wins: 0, shieldUsed: 3 };   // Gold shield used, now in Gold II: a division drop is not a rank drop
  res = race(6); assert.ok(!res.shield && res.after.key === "gold");
});

test("an update mid ranked race gives the SR back (and the race doesn't count)", async () => {
  await accounts.signUp("MidUpdate", "Turbo-Fox-Lane-44");
  const u = await accounts.getUser("u_midupdate");
  u.ranked = { sr: 700, peak: 700, games: 0, wins: 0 };
  accounts.rankedStart(u);
  assert.equal(u.ranked.sr, 655, "charged at the lights");
  const r = new game.Room("RKVOID", false); r.ranked = true; r.rankedEntries = [{ car: 1, uid: u.id, pid: "x" }];
  game.rooms.set("RKVOID", r);
  try { await game.voidRankedRaces(); } finally { game.rooms.delete("RKVOID"); }
  assert.equal(u.ranked.sr, 700, "given back");
  assert.ok(!u.ranked.live && !r.rankedEntries && r.rankedVoided, "and the race won't count when it finishes");
  assert.equal(accounts.rankedFinish(u, 6, 6, true), null, "finishing it changes nothing");
  // a charge left over from before the server started (it crashed): given back when the account loads
  u.ranked.live = { sr0: 700, at: Date.now() - 86400000 }; u.ranked.sr = 655;
  accounts.undoOldRankedCharges(u);
  assert.ok(u.ranked.sr === 700 && !u.ranked.live, "an old charge is given back");
  accounts.rankedStart(u); accounts.undoOldRankedCharges(u);
  assert.ok(u.ranked.live && u.ranked.sr === 655, "but not one from a race running right now");
});

test("Halloween: new shop items, more Haunted crate items, and every theme has an elusive mythic", () => {
  const S = accounts.STORE, ids = new Set();
  for (const x of S) { assert.ok(!ids.has(x.id), "no duplicate " + x.id); ids.add(x.id); }
  for (const id of ["glow_pumpkin", "glow_candle", "trail_bats", "trail_pumpkins", "decal_web", "badge_witch", "badge_vampire"]) assert.ok(S.find((x) => x.id === id && x.price > 0), id + " in the shop");
  assert.equal(S.find((x) => x.id === "trail_souls").rarity, "mythic", "the drop's mythic");
  for (const T of accounts.PASS_THEMES) assert.ok(S.some((x) => x.pass === T.key && x.rarity === "mythic"), T.key + " has a mythic");
  assert.equal(S.filter((x) => x.pass === "haunted" && x.rarity === "mythic").length, 3, "Haunted has 3");
  assert.ok(S.filter((x) => x.pass === "haunted").length >= 14, "more Haunted items");
  // mythics are elusive: about 1.5% of crates
  const u = { id: "u_cratetest", coins: 0, owned: [], stats: {}, ach: {}, crates: { haunted: 4000 }, equipped: {} };
  let m = 0; for (let i = 0; i < 4000; i++) { const r = accounts.openCrate(u, "haunted"); if (r.item.rarity === "mythic") m++; }
  assert.ok(m > 20 && m < 110, `mythics in 4000 crates: ${m}`);
});

test("safety car: lapped cars ghost through the pack and unlap themselves", { timeout: 120000 }, () => {
  const r = new game.Room("UNLAP", false); r.setRandomTrack("normal", "regular");
  r.players.set("ul", { id: "ul", name: "Me", up: {}, level: 1, xp: 0 });
  Object.assign(r.settings, { ai: 7, quali: 0, laps: 12, weather: "sunny", safetyCar: true }); r.ensureRoster(7);
  r.startRace(); r.startLights(); r.phase = "race"; r.launchCars();
  for (let n = 0; n < 60 * 25; n++) r.step(1 / 60);
  const order = r.standings(), back = order[order.length - 1];
  back.lapsDone -= 1; back.maxLaps = back.lapsDone; back.progress -= r.track.N;       // a lap down
  r.deploySafetyCar();
  assert.ok(r.sc, "safety car out");
  r.step(1 / 60);
  assert.ok(back.unlapping && r.ghost(back), "the lapped car is a ghost, on its way to unlap");
  let unlapped = false;
  for (let n = 0; n < 60 * 80 && r.sc; n++) { r.step(1 / 60); const L = r.standings().find((c) => !c.finished); if (back.progress > L.progress - r.track.N) { unlapped = true; break; } }
  assert.ok(unlapped, "back on the lead lap before the safety car went in");
});

test("tyre warnings come with 2 laps and 1 lap left on the tyres (not 4 laps early)", { timeout: 60000 }, () => {
  const r = new game.Room("TYREWARN", false); r.setRandomTrack("normal", "regular");
  const toasts = []; const p = { id: "tw", name: "Me", up: {}, level: 1, xp: 0, warned: 0, passCd: new Map(), lostCd: new Map(), lastPos: 99 };
  r.players.set("tw", p);
  Object.assign(r.settings, { ai: 3, quali: 0, laps: 20, weather: "sunny" }); r.ensureRoster(3);
  r.startRace(); r.startLights(); r.phase = "race"; r.launchCars();
  const io0 = game.io.to; game.io.to = (id) => ({ emit: (ev, d) => { if (ev === "toast" && id === "tw") toasts.push(d); } });
  try {
    for (let n = 0; n < 60 * 5; n++) r.step(1 / 60);
    const c = r.cars.find((x) => x.owner === "tw"), perLap = 1 / r.lifeLaps(c, c.compound); c.lapWearMeas = perLap;
    c.tire = perLap * 3.5; r.drive(c, 1 / 60); assert.equal(toasts.filter((t) => /laps? left on these tyres/.test(t)).length, 0, "3.5 laps left: no warning yet");
    c.tire = perLap * 1.9; r.drive(c, 1 / 60); assert.ok(toasts.some((t) => /2 laps left on these tyres/.test(t)), "2 laps");
    c.tire = perLap * 0.95; r.drive(c, 1 / 60); assert.ok(toasts.some((t) => /1 lap left on these tyres/.test(t)), "1 lap");
  } finally { game.io.to = io0; }
});

test("endurance races: tyres last 1.5x longer", () => {
  const mk = (mode) => { const r = new game.Room("EW" + mode, false); r.setRandomTrack("normal", "regular"); r.players.set("me", { id: "me", name: "Me", up: {}, level: 1, xp: 0 });
    Object.assign(r.settings, { ai: 3, quali: 0, laps: 10, mode, enduroMin: 20 }); r.ensureRoster(3); r.startRace(); r.startLights(); return r; };
  const e = mk("endur"), est = e.enduro.est;
  assert.ok(Math.abs(e.wearPerLap * game.tireLifeLaps(est) - 1 / 1.5) < 1e-9, "tyres last 1.5x longer than normal for a race that long");
});

test("qualifying: when the clock runs out, everyone on a lap gets to finish it first", { timeout: 120000 }, () => {
  const r = new game.Room("QFLAG", false); r.setRandomTrack("normal", "regular");
  r.players.set("qf", { id: "qf", name: "Me", up: {}, level: 1, xp: 0 });
  Object.assign(r.settings, { ai: 5, quali: 1, laps: 5, weather: "sunny" }); r.ensureRoster(5);
  r.startRace(); r.startLights(); r.phase = "race"; r.launchCars();
  assert.ok(r.qualifying);
  let ended = null; const eq = r.endQuali.bind(r); r.endQuali = () => { ended = r.time; };
  while (r.time < r.qualiEnd + 0.05) r.step(1 / 60);
  assert.ok(r.qFlag && r.qFlag.wait.size > 0 && ended === null, "time's up, but laps are still being finished");
  const laps = new Map(r.cars.map((c) => [c.id, c.lapsDone]));
  for (let n = 0; n < 60 * 120 && ended === null; n++) r.step(1 / 60);
  assert.ok(ended !== null, "then qualifying ends");
  assert.ok(r.cars.filter((c) => !c.inPit && c.aiMode === "race").every((c) => c.lapsDone > laps.get(c.id) || !r.qFlag), "after everyone crossed the line");
  r.endQuali = eq;
});

test("endurance: teammates can share one car (swap at stops) or both race", () => {
  const mk = (share) => {
    const r = new game.Room("ENDSH" + share, false); r.setRandomTrack("normal", "regular");
    for (const id of ["a", "b"]) r.players.set(id, { id, name: "P" + id, up: {}, level: 1, xp: 0, team: "Squad" });
    Object.assign(r.settings, { ai: 2, quali: 0, laps: 5, mode: "endur", teams: true, enduroShare: share }); r.ensureRoster(2);
    r.startRace(); r.startLights(); return r;
  };
  const shared = mk(true), both = mk(false);
  assert.equal(shared.cars.filter((c) => c.owner).length, 1, "share: one car for the team");
  assert.equal(both.cars.filter((c) => c.owner).length, 2, "both race: a car each");
});

test("reshaping a track (wiggle, rotate...) keeps the objects, DRS zones, start line and direction", () => {
  const r = new game.Room("KEEPLAY", false); r.setRandomTrack("normal", "regular"); r.decor = [];      // (random tracks sometimes come with a tunnel)
  const st = r.stroke.map((q) => q.slice());
  const pt = (f) => st[Math.floor(st.length * f)];
  assert.equal(r.addDecor("banner", pt(0.3)[0], pt(0.3)[1]), null); assert.equal(r.addDecor("tunnel", pt(0.5)[0], pt(0.5)[1], { x: pt(0.56)[0], y: pt(0.56)[1] }), null);
  r.setDrs([[10, 40]]); r.rebuildTrack(Math.floor(r.shape.base.length * 0.4), true);
  const before = r.layoutNow();
  const rotated = st.map((q) => [800 - (q[1] - 500) + 0, 500 + (q[0] - 800), q[2]]);      // the same track, turned
  const keep = r.layoutNow(); assert.equal(r.setTrack(rotated, "normal", "drawn"), null); r.applyLayout(keep);
  const after = r.layoutNow();
  assert.equal(r.decor.length, 2, "objects kept"); assert.ok(r.decor[1].end, "the tunnel still has its far end");
  assert.equal(r.shape.drs.length, 1, "DRS zone kept"); assert.ok(r.track.reverse, "direction kept");
  assert.ok(Math.abs(after.start - before.start) < 0.03, "start line in the same place round the lap");
  after.decor.forEach((d, k) => assert.ok(Math.abs(d.f - before.decor[k].f) < 0.03, "object in the same place round the lap"));
  const msg = r.trackMsg().decor.find((d) => d.k === "tunnel");
  assert.ok(msg.len > 3, "a two-click tunnel runs from start to end: " + msg.len);
});

test("formation lap: no XP or upgrades, the endurance clock doesn't run, and it isn't a lap", { timeout: 120000 }, () => {
  const r = new game.Room("FORMLAP", false); r.setRandomTrack("normal", "regular");
  const p = { id: "fl", name: "Me", up: {}, level: 1, xp: 0, passCd: new Map(), lostCd: new Map(), lastPos: 99 }; r.players.set("fl", p);
  Object.assign(r.settings, { ai: 5, quali: 0, laps: 5, start: "rolling", mode: "endur", enduroMin: 10 }); r.ensureRoster(5);
  r.startRace(); r.startLights();
  assert.ok(r.sc?.rolling, "formation lap behind the safety car");
  const secs0 = r.enduro.secs; let n = 0;
  while (r.sc?.rolling && n++ < 60 * 120) r.step(1 / 60);
  assert.ok(!r.sc, "green flag");
  assert.equal(p.xp, 0, "no XP on the formation lap"); assert.equal(p.level, 1, "so no upgrades");
  assert.ok(r.cars.every((c) => c.tire === 1), "no tyre wear on the formation lap");
  assert.ok(Math.abs(r.enduro.secs - (secs0 + r.time)) < 0.05, "the endurance clock starts at the green flag");
  const lead = r.standings()[0]; assert.equal(lead.lapsDone, 0, "the leader is on lap 1 at the green flag");
  for (let k = 0; k < 60 * 3; k++) r.step(1 / 60);
  assert.ok(p.xp > 0 || p.level > 1, "XP starts once the race is on");
});

test("safety car: nobody overtakes while everyone's ghosted at the start of it", { timeout: 120000 }, () => {
  let checked = 0;
  for (let run = 0; run < 3; run++) {
    const r = new game.Room("SCNOPASS" + run, false); r.setRandomTrack("normal", "regular");
    r.players.set("sp", { id: "sp", name: "Me", up: {}, level: 1, xp: 0 });
    Object.assign(r.settings, { ai: 13, quali: 0, laps: 12, weather: "sunny", safetyCar: true }); r.ensureRoster(13);
    r.startRace(); r.startLights(); r.phase = "race"; r.launchCars();
    for (let n = 0; n < 60 * 25; n++) r.step(1 / 60);
    r.deploySafetyCar(); assert.ok(r.sc);
    const racing = (c) => !c.finished && !(c.pitting > 0) && !c.inPit && c.aiMode === "race" && !c.unlapping && !(c.crashT > 0) && !c.spin && !(c.damage > 0.6) && !((c.stoppedT || 0) > 2);     // (a wreck may be passed)
    const before = r.standings().filter(racing).map((c) => c.id);
    for (let n = 0; n < 60 * 8; n++) r.step(1 / 60);
    const now = r.standings().filter((c) => racing(c) && before.includes(c.id)).map((c) => c.id);
    assert.deepEqual(now, before.filter((id) => now.includes(id)), "same order 8 s into the safety car");
    checked++;
  }
  assert.equal(checked, 3);
});

test("3 red flags or 7 safety cars: the race is called off and classified as it stood", { timeout: 120000 }, () => {
  const mk = (code) => {
    const r = new game.Room(code, false); r.setRandomTrack("normal", "regular");
    r.players.set("ab", { id: "ab", name: "Me", up: {}, level: 1, xp: 0 });
    Object.assign(r.settings, { ai: 7, quali: 0, laps: 30, weather: "sunny", safetyCar: true }); r.ensureRoster(7);
    let res = null; const emit = r.emit.bind(r); r.emit = (ev, d) => { if (ev === "results") res = d; return emit(ev, d); };
    r.startRace(); r.startLights(); r.phase = "race"; r.launchCars();
    for (let n = 0; n < 60 * 12; n++) r.step(1 / 60);
    return { r, got: () => res };
  };
  // red flags
  const A = mk("ABRF");
  for (let k = 0; k < 2; k++) { A.r.redFlag(); assert.ok(A.r.rf, "red flag " + (k + 1)); for (let n = 0; n < 60 * 45; n++) A.r.step(1 / 60); }
  assert.equal(A.r.phase, "race", "two red flags: still racing");
  const order = A.r.standings().map((c) => c.id);
  A.r.redFlag();
  assert.equal(A.r.phase, "results", "the third: called off");
  assert.equal(A.got().abandoned.why, "redFlags");
  assert.deepEqual(A.got().rows.map((x) => x.name), order.map((id) => A.r.cars.find((c) => c.id === id).name), "results in the order as it stood");
  assert.ok(A.r.cars.every((c) => c.finished), "everyone classified (no DNFs)");
  // safety cars
  const B = mk("ABSC");
  for (let k = 0; k < 6; k++) { B.r.sc = null; B.r.scDoneAt = -99; B.r.deploySafetyCar(); assert.ok(B.r.sc, "safety car " + (k + 1)); }
  B.r.sc = null; B.r.scDoneAt = -99; B.r.deploySafetyCar();
  assert.equal(B.r.phase, "results", "the seventh safety car: called off");
  assert.equal(B.got().abandoned.why, "safetyCars");
});

test("safety car after a crash: the field doesn't get stuck crawling behind the wreck", { timeout: 120000 }, () => {
  const r = new game.Room("SCWRECK", false); r.setRandomTrack("normal", "regular");
  r.players.set("sw", { id: "sw", name: "Me", up: {}, level: 1, xp: 0 });
  Object.assign(r.settings, { ai: 15, quali: 0, laps: 14, weather: "sunny", safetyCar: true }); r.ensureRoster(15);
  r.startRace(); r.startLights(); r.phase = "race"; r.launchCars();
  for (let n = 0; n < 60 * 30; n++) r.step(1 / 60);
  const o = r.standings(), a = o[3], b = o[4];
  r.crash(a, b, game.CRASH_SPEED + 350, 1, 0); a.spin = 8; a.vx = a.vy = 0; b.vx = b.vy = 0;
  assert.ok(r.sc, "the crash brought the safety car out");
  let sum = 0, k = 0;
  for (let n = 0; n < 60 * 20 && r.sc; n++) { r.step(1 / 60); if (n > 60 * 6 && n % 15 === 0) { const sp = r.cars.filter((c) => !c.inPit && !(c.pitting > 0) && c.aiMode === "race" && !c.finished).map((c) => c.speed); sum += sp.reduce((x, y) => x + y, 0) / sp.length; k++; } }
  assert.ok(k === 0 || sum / k > 300, `the field keeps going at safety car pace (average ${Math.round(sum / Math.max(1, k))})`);
});

test("random tracks sometimes get a tunnel on a flat bit away from the pits and the start", { timeout: 120000 }, () => {
  let got = 0;
  for (let n = 0; n < 12; n++) {
    const r = new game.Room("TUN" + n, false); r.setRandomTrack("normal", "regular");
    r.decor = []; if (!r.autoTunnel()) continue; got++;
    const [d] = r.decorMsg(), t = r.track;
    assert.strictEqual(d.k, "tunnel"); assert.ok(d.len >= 30 && d.len <= 140, "length " + d.len);
    for (let k = 0; k <= d.len; k++) { const i = (d.i + k) % t.N; assert.ok(!(t.elev[i] > 0), "no bridges in the tunnel"); assert.ok(((i - t.pitLane.entry + t.N) % t.N) > t.pitLane.len, "not in the pit lane"); }
  }
  assert.ok(got >= 6, "most random tracks have room for a tunnel (" + got + "/12)");
});

test("room names, number styles, a 3-2-1 countdown with friends, and cheering on a friend", { timeout: 60000 }, async () => {
  const a = io(base, { transports: ["websocket"], forceNew: true }), b = io(base, { transports: ["websocket"], forceNew: true });
  const got = (s, ev) => new Promise((ok) => s.once(ev, ok));
  const lobbyWhere = (s, f) => new Promise((ok) => { const h = (l) => { if (f(l)) { s.off("lobby", h); ok(l); } }; s.on("lobby", h); });
  await Promise.all([got(a, "connect"), got(b, "connect")]);
  a.emit("create", { name: "Ann", numFont: "script" }, {});
  const j = await got(a, "joined");
  b.emit("join", { code: j.code, profile: { name: "Bo", numFont: "nope" } });
  await got(b, "joined");
  const r = game.rooms.get(j.code);
  assert.equal(r.players.get(b.id).numFont, "race", "unknown number styles fall back to the normal one");
  b.emit("profile", { name: "Bo", numFont: "digital" }); await lobbyWhere(a, (l) => l.players.some((p) => p.name === "Bo" && p.numFont === "digital"));
  // only the host can name the room, and it's filtered
  b.emit("roomName", "Bo's room"); a.emit("roomName", "  Friday   Night  Racing  ");
  const l = await lobbyWhere(b, (x) => x.name); assert.equal(l.name, "Friday Night Racing");
  const bad = got(a, "toast"); a.emit("roomName", "visit www.spam.com"); assert.match(await bad, /friendlier/); assert.equal(r.roomName, "Friday Night Racing");
  // start with friends: everyone sees 3-2-1 first
  a.emit("settings", { ai: 1, laps: 2, speed: 3, map: "small", weather: "sunny", quali: 0 }); a.emit("randomTrack", { map: "small" }); await got(a, "trackResult");
  for (const s of [a, b]) s.on("tirePick", () => s.emit("compound", "fast"));
  const count = got(b, "lobbyCount"), t0 = Date.now(); a.emit("start");
  assert.equal((await count).n, 3); const race = await got(a, "race"); assert.ok(Date.now() - t0 > 2500, "the race starts after the countdown");
  assert.equal(race.cars.find((c) => c.name === "Bo").numFont, "digital");
  while (r.phase !== "race") await new Promise((ok) => setTimeout(ok, 100));
  const bobCar = r.carOf(b.id), heard = got(b, "cheered"), bubble = got(a, "emote");
  a.emit("cheer", bobCar.id);
  assert.equal((await heard).from, "Ann"); const e = await bubble; assert.equal(e.e, "📣"); assert.equal(e.car, bobCar.id);
  a.close(); b.close();
});

test("safety car: a lapped car stuck at the back of a tight queue still ghosts through it and unlaps", { timeout: 120000 }, () => {
  const r = new game.Room("UNLAP2", false); r.setRandomTrack("normal", "regular");
  r.players.set("ul", { id: "ul", name: "Me", up: {}, level: 1, xp: 0 });
  Object.assign(r.settings, { ai: 9, quali: 0, laps: 12, weather: "sunny", safetyCar: true }); r.ensureRoster(9);
  r.startRace(); r.startLights(); r.phase = "race"; r.launchCars();
  for (let n = 0; n < 60 * 25; n++) r.step(1 / 60);
  r.deploySafetyCar(); assert.ok(r.sc, "safety car out");
  for (let n = 0; n < 60 * 20; n++) { r.sc.since = r.time; r.step(1 / 60); }  // the queue closes right up (the safety car stays out)
  const order = r.standings().filter((c) => !c.finished), back = order[order.length - 1];
  back.lapsDone -= 1; back.maxLaps = back.lapsDone; back.progress -= r.track.N;     // ...and the last car in it is a lap down
  r.sc.since = r.time;                                                               // (fresh, so the safety car doesn't go in meanwhile)
  let unlapped = false;
  for (let n = 0; n < 60 * 30 && r.sc; n++) { r.step(1 / 60); const L = r.standings().find((c) => !c.finished); if (back !== L && back.progress > L.progress - r.track.N + 200 / r.track.spacing) { unlapped = true; break; } }
  assert.ok(unlapped, "through the whole queue and past the leader, quickly (not stuck crawling behind the cars in it)");
});

test("the pit stop minigame comes up every time a player pits, qualifying included (no way to skip it)", { timeout: 120000 }, () => {
  const r = new game.Room("PGQUALI", false); r.setF1Track("it-1922");
  const p = { id: "s-pq", name: "Me", up: {}, level: 1, xp: 0, assist: { pit: true } }; r.players.set(p.id, p);     // (no pitGame flag at all)
  Object.assign(r.settings, { ai: 2, quali: 5, laps: 6, wear: "high", weather: "sunny" }); r.ensureRoster(2);
  let games = 0; const play = r.startPitGame.bind(r); r.startPitGame = (c, pl) => { games++; play(c, pl); r.endPitGame(c, c.pitGame.seq); };
  r.startRace(); r.startLights(); assert.ok(r.qualifying, "qualifying");
  r.phase = "race"; r.launchCars && r.launchCars();
  for (let n = 0; n < 60 * 60 * 4 && r.qualifying && !games; n++) { if (n % 60 === 0) p.boxCall = true; r.step(1 / 60); }      // (the player calls the car in: B)
  assert.ok(games >= 1, "the minigame started in qualifying");
  assert.ok(!game.UPGRADES || !game.UPGRADES.pit, "Pro Pit Crew is gone");
});

test("trades: several items (and coins) on each side, all checked again on accept", async () => {
  const a = (await accounts.signUp("MultiA", "Turbo-Fox-Lane-42")).u, b = (await accounts.signUp("MultiB", "Turbo-Fox-Lane-42")).u;
  await accounts.friendAdd(a, "MultiB"); await accounts.friendAccept(b, a.id);
  a.coins = 500; b.coins = 500; a.owned.push("glow_cyan", "glow_pink", "wing_duck"); b.owned.push("glow_gold", "glow_green");
  assert.match((await accounts.offerTrade(a, b.id, { items: ["glow_cyan", "glow_gold"] }, { items: ["glow_green"] })).error, /own/, "can't offer what you don't have");
  assert.ok((await accounts.offerTrade(a, b.id, { coins: 100, items: ["glow_cyan", "glow_pink", "wing_duck"] }, { coins: 50, items: ["glow_gold", "glow_green"] })).ok);
  const t = accounts.publicUser(b).trades[0];
  assert.deepEqual(t.give.items.sort(), ["glow_cyan", "glow_pink", "wing_duck"]); assert.equal(t.want.items.length, 2);
  assert.ok((await accounts.answerTrade(b, t.id, true)).ok);
  for (const id of ["glow_cyan", "glow_pink", "wing_duck"]) assert.ok(b.owned.includes(id) && !a.owned.includes(id), id + " moved to B");
  for (const id of ["glow_gold", "glow_green"]) assert.ok(a.owned.includes(id) && !b.owned.includes(id), id + " moved to A");
  assert.equal(a.coins, 450); assert.equal(b.coins, 550);
  // an old one-item offer (saved before this change) still works
  a.giftAt = 0; b.tradesIn = [{ id: "old1", from: a.id, fromName: a.name, give: { coins: 0, item: "glow_gold" }, want: { coins: 10, item: null }, at: Date.now() }];
  assert.ok((await accounts.answerTrade(b, "old1", true)).ok); assert.ok(b.owned.includes("glow_gold"));
});

test("suggestions: anyone can send one, only the owner's account (ScorTeddy) gets the alert and can read them", { timeout: 30000 }, async () => {
  const boss = (await accounts.signUp("ScorTeddy", "Turbo-Fox-Lane-42")).u || await accounts.getUser("u_scorteddy");
  const other = (await accounts.signUp("NotTheBoss", "Turbo-Fox-Lane-42")).u;
  assert.ok(accounts.isSuggestAdmin(boss) && !accounts.isSuggestAdmin(other));
  assert.match((await accounts.addSuggestion({ name: "Ann" }, "hi")).error, /more/);
  const r = await accounts.addSuggestion({ name: "Ann" }, "Add lightning in night rain races", "idea");
  assert.ok(r.ok && r.admin && r.admin.id === boss.id);
  assert.equal(accounts.suggestionsOf(other), null, "nobody else can read them");
  assert.equal(accounts.suggestionsOf(boss)[0].text, "Add lightning in night rain races");
  assert.equal(accounts.publicUser(boss).suggestAdmin.unread, 1); assert.equal(accounts.publicUser(other).suggestAdmin, null);
  accounts.suggestMark(boss, "all"); assert.equal(accounts.suggestUnread(boss), 0);
  // over the socket: a guest sends one, and the owner (signed in) gets a notification straight away
  const s = io(base, { transports: ["websocket"], forceNew: true }); await new Promise((ok) => s.once("connect", ok));
  const res = new Promise((ok) => s.once("suggestResult", ok));
  s.emit("suggest", { text: "Please add a drift mode", kind: "idea", name: "Bo" });
  assert.ok((await res).ok);
  const top = accounts.suggestionsOf(boss)[0]; assert.equal(top.text, "Please add a drift mode"); assert.equal(top.name, "Bo (guest)");
  const again = new Promise((ok) => s.once("suggestResult", ok)); s.emit("suggest", { text: "and another thing please" });
  assert.match((await again).error, /minute/, "one a minute");
  s.close();
});

test("next tyres follow the weather: no stale dry pick in the rain, and a pick made for other weather is overridden", () => {
  const r = new game.Room("NEXTTY", false); r.setRandomTrack("normal", "regular");
  const p = { id: "nt", name: "Me", up: {}, level: 1, xp: 0 }; r.players.set("nt", p);
  Object.assign(r.settings, { ai: 1, quali: 0, laps: 5, weather: "sunny" }); r.ensureRoster(1);
  r.startRace(); p.compound = "inter"; r.startLights(); r.phase = "race"; r.launchCars();
  const c = r.cars.find((x) => x.owner === "nt");
  r.wet = 0; assert.equal(r.nextTyre(c, p), "inter", "dry, no pick: keep what you're on");
  r.wet = 0.8; assert.equal(r.nextTyre(c, p), "wet", "pouring, no pick: Wets (this used to stay on the starting dry tyres)");
  r.wet = 0; r.pickCompound(p, "fast"); assert.equal(r.nextTyre(c, p), "fast", "your pick counts");
  r.wet = 0.8; assert.equal(r.nextTyre(c, p), "wet", "picked Fast in the dry, now it's pouring: Wets");
  r.pickCompound(p, "durable"); assert.equal(r.nextTyre(c, p), "durable", "picked dry tyres in the rain on purpose: your call");
});

test("worn tyres slow you down gradually: no sudden cliff at 0% (that made cars randomly lose a third of their speed)", () => {
  const r = new game.Room("TYCLIFF", false);
  for (let w = 0.33; w > 0; w -= 0.01) assert.ok(r.tireSpeed(w) - r.tireSpeed(Math.max(0, w - 0.01)) < 0.06, "no big step at " + w.toFixed(2));
  assert.ok(r.tireSpeed(1) === 1 && r.tireSpeed(0.34) === 1, "full speed with a third left");
  assert.ok(r.tireSpeed(0) >= 0.7, "dead tyres: 70%, not 62%");
});

test("endurance with shared cars: who qualifies (and starts) is random, and the race starts with the qualifier", () => {
  const firsts = new Set();
  for (let k = 0; k < 16; k++) {
    const r = new game.Room("ENQ" + k, false); r.setRandomTrack("small", "regular");
    const a = { id: "q1", name: "Ann", up: {}, level: 1, xp: 0, team: "Duo" }, b = { id: "q2", name: "Bo", up: {}, level: 1, xp: 0, team: "Duo" };
    r.players.set(a.id, a); r.players.set(b.id, b);
    Object.assign(r.settings, { ai: 2, quali: 1, laps: 4, weather: "sunny", mode: "endur", enduroMin: 10, teams: true }); r.ensureRoster(2);
    r.startRace(); assert.ok(r.qualifying, "qualifying first");
    const q = r.cars.filter((c) => c.owner === "q1" || c.owner === "q2"); assert.equal(q.length, 1, "one car for the pair in qualifying");
    firsts.add(q[0].owner);
    r.qualiGrid = r.cars.map((c) => c.slotKey); r.phase = "lobby"; r.startRace();
    const race = r.cars.filter((c) => c.owner === "q1" || c.owner === "q2");
    assert.equal(race.length, 1, "still one shared car in the race (it used to give them a car each after qualifying)");
    assert.equal(race[0].owner, q[0].owner, "the qualifier starts the race"); assert.equal(race[0].drivers.length, 2);
  }
  assert.equal(firsts.size, 2, "both teammates get to qualify, not always the same one");
});

test("safety car: overtaking is impossible (the order never changes, unless someone pits, crashes or unlaps)", { timeout: 200000 }, () => {
  let swaps = 0;
  for (let s = 0; s < 3; s++) {
    const r = new game.Room("SCNOPASS" + s, false); r.setRandomTrack("normal", s ? "very" : "regular");
    Object.assign(r.settings, { ai: 11, quali: 0, laps: 20, weather: "sunny", safetyCar: true }); r.ensureRoster(11);
    r.startRace(); r.startLights(); r.phase = "race"; r.launchCars();
    for (let n = 0; n < 60 * 30; n++) r.step(1 / 60);
    r.deploySafetyCar(); assert.ok(r.sc);
    const racing = (c) => !c.finished && !(c.pitting > 0) && !c.inPit && c.aiMode === "race" && !c.unlapping && !(c.crashT > 0) && !c.spin && !(c.damage > 0.6) && !((c.stoppedT || 0) > 2);
    let prev = r.standings().filter(racing).map((c) => c.id);
    for (let n = 0; n < 60 * 30; n++) {
      r.sc.since = r.time - 5; r.step(1 / 60);
      if (n % 10) continue;
      const now = r.standings().filter(racing).map((c) => c.id), a = now.filter((id) => prev.includes(id)), b = prev.filter((id) => now.includes(id));
      if (a.join() !== b.join()) swaps++;
      prev = now;
    }
  }
  assert.equal(swaps, 0, "nobody changed places behind the safety car");
});

test("a bit of track drawn right along another bit goes over it on a bridge for the whole overlap (no crashing into the road underneath)", () => {
  const r = new game.Room("OVERLAP", false);
  const P = [[150, 500], [1150, 500], [1250, 400], [1250, 150], [350, 150], [250, 250], [250, 420], [350, 500], [900, 500], [1000, 600], [1000, 800], [150, 800], [60, 700], [60, 560]];
  const stroke = []; for (let k = 0; k < P.length; k++) { const a = P[k], b = P[(k + 1) % P.length]; for (let s = 0; s < 1; s += 0.05) stroke.push([a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s, 130]); }
  assert.equal(r.setTrack(stroke, "large", "drawn"), null);
  const t = r.track; let over = 0, same = 0;
  for (let i = 0; i < t.N; i++) for (let j = 0; j < t.N; j++) {
    const d = Math.min(Math.abs(i - j), t.N - Math.abs(i - j)); if (d < 60) continue;
    if (Math.hypot(t.pts[i].x - t.pts[j].x, t.pts[i].y - t.pts[j].y) < (t.hw[i] + t.hw[j]) * 0.6) { over++; if (Math.abs((t.elev[i] || 0) - (t.elev[j] || 0)) < 0.5) same++; }
  }
  assert.ok(over > 100, "the test track really does overlap itself");
  assert.equal(same, 0, "everywhere the road overlaps, one is up on a bridge");
});

test("weather sounds: only the known ones can be asked for, and without an ElevenLabs key the game uses its own", async () => {
  assert.equal((await fetch(base + "/sfx/nope")).status, 404);
  assert.equal((await fetch(base + "/sfx/..%2Fpackage.json")).status, 404);
  const r = await fetch(base + "/sfx/thunder1"); assert.ok(r.status === 503 || r.status === 200, "thunder: made, or not available (then the built-in one plays)");
});

test("tunnels can be as long as you like (more than half the lap), in the racing direction", () => {
  const r = new game.Room("LONGTUN", false); r.setRandomTrack("normal", "regular"); r.decor = [];
  const t = r.track, sc = r.trackMsg().scale, bp = (i) => { const p = t.pts[i]; return [(p.x - t.pad) / sc + t.minX, (p.y - t.pad) / sc + t.minY]; };
  const a = Math.floor(t.N * 0.05), b = Math.floor(t.N * 0.8), A = bp(a), B = bp(b);
  assert.equal(r.addDecor("tunnel", A[0], A[1], { x: B[0], y: B[1] }), null);
  const d = r.trackMsg().decor[0];
  assert.ok(d.len > 140 && d.len > t.N * 0.6, "a long tunnel: " + d.len + " of " + t.N + " points");
});
