# Scribble GP: Team Boss (made by Emmett)

Multiplayer racing team manager. The host draws a track (or rolls a random one), and every
player is the boss of a team whose AI driver races it. Players pick tires, react to the start
lights, call pit stops, fire their boost and choose upgrade cards. Up to 6 players per room
plus up to 60 AI drivers. Rooms can be private (invite code) or public (listed on the menu).

## Files
```
server.js          Node server: rooms, lobbies, track building, the whole race simulation
accounts.js        Google sign-in, saved stats, achievements, coins and the store (keep it next to server.js)
f1-tracks.json     42 real-world layouts under made-up names (e.g. "Old Airfield Circuit", "Eifel Northern Loop"), keep it next to server.js
filter.js          bad-word filter for names, team names and usernames
package.json       dependencies (express, socket.io, zxcvbn, qrcode) + "npm test"
test/smoke.test.js automatic checks: pages, headers, filter, passwords and a whole race vs the AI
public/index.html  the page itself (all the screens' HTML)
public/game.js     the whole game client (menu, room, race view, HUD, settings, profile)
public/game.css    all the styles
public/faq.html, privacy.html, 404.html, site.css   small pages (served at /faq, /privacy and for any unknown URL)
public/og-image.png, favicon.svg                    link-preview picture (1200x630) and tab icon
                                                     (robots.txt and sitemap.xml are made by server.js)
```

## Before every update: run the tests
`npm install` once, then `npm test`. It starts the server, checks the pages and security headers, and plays a
full race against the AI (about 30 seconds). If anything says `not ok`, don't upload yet.

**Then add a "What's new" entry:** at the top of `WHATS_NEW` in game.js, add `{ v: "2026-10-05", title: "...", items: ["...", "..."] }`
(any new `v` works; the date is easiest). Everyone who has played before sees it once, on the menu or in a room, after
the update. Brand-new players don't. 📰 What's new in the menu footer opens it again. It's remembered in `tb-news`.

## New-player and multiplayer features
- **Tutorial** (🎓 on the menu, highlighted on a first visit): a short easy race with coach cards for tires,
  the start, boost, upgrades and pit stops.
- **Quick Play**: joins the busiest public room with space, or makes a new public one.
- **Name filter** (`filter.js`): bad words in driver/team/usernames (also written with 1337 letters) are refused
  or swapped for "Racer123". **⋯ menu** on every player: Add friend, Block (hides their emotes; the host's block
  also removes them), Report (logged as `[report]` in the Render logs).
- **Dropped connection / reload**: your car is kept for 2 minutes and comes back when you reconnect
  (`rejoin` + `gone` seats). **Updates**: everyone sees "The game is updating", then the host's browser rebuilds
  the room with the same code, settings and track, and the others join it again automatically.
- **Friends** (Profile › Friends): add by username or friend code, accept requests, see who's online and where,
  invite them to your room. **Leaderboards** (Profile › Leaderboards): most wins, achievements, km, fastest laps
  per real track, ranked, Track of the week. **Daily and weekly challenges** (Achievements tab), paying coins and pass XP.
- **Replay**: the last 30 seconds of every race can be watched again, saved or shared from the results screen.
- **Colorblind-friendly tires** (Settings): every tire gets its own ring pattern.

- **Desktop layout** (`body.desk`: window wider than 860px and phone mode off; phones never get it, and the
  HTML is the same for both): the track tools get a ✏️ Draw / 📚 Tracks / 🔧 Edit switcher (`DOCK_SECS` in game.js
  says which button is in which section, via `data-sec`); the room has 3 tabs (the AI pane shows under Drivers,
  the points pane under Settings); the profile has 5 tabs (Achievements sit inside "Me", Leaderboards inside
  Ranked, Security behind the 🔒 button); the menu's account bar has one Profile button. All the CSS for it is at
  the end of game.css. New buttons go in `DOCK_SECS` or they show in every section.
- **Prestige** (season pass): at tier 30, "Prestige" resets the pass to tier 0 (premium stays) for `PRESTIGE_COINS`
  (1,000) and a 🎖️N badge (`u.prestige`, lifetime count) shown before your name in rooms and races (`extras.prest`).
  The tiers pay out again on the way back up (items you own turn into coins, as always).
- **Weekend events** (`EVENTS` in server.js): every Saturday + Sunday (UTC) one is on, a different one each week:
  Rain weekend, Street fight (x2 coins on street circuits / City / Neon), Double pass XP, Fog weekend, Double win
  coins, Night fever (x2 coins on Night / Neon / City). Never in ranked. The menu shows the live one or the next one.
  `FORCE_EVENT=<id>` in the Environment turns one on right now for testing (remove it after).
- **Reverse grid** (room setting, off by default): from race 2 of a championship, fewest points at the front and the
  leader at the back. Only with qualifying off. It overrides host grid spots.
- **Community tracks** (🌍 Community in the track tools): after 🔗 Share code, the player who first shared it (`byUid` in the share data) can "Add to community"
  with a name (max `COMM_PER_USER` 15 each, `COMM_MAX` 300 total, the weakest old ones drop off). Sort by most played
  (a signed-in player finishing a 3+ lap race on it, once per player per track per day), top rated (👍 minus 👎, one vote per account, not your own) or
  newest. Owners can remove theirs. Stored as one small document (`tb:comm:tracks` in Upstash, or
  `data/community.json`).
- **Sign out my other device**: when the one-account rule blocks you, a dialog offers to sign the other device out
  (`account:kickOther`: removes it from its room, ends that device's session, and tells it why).
- **Race win coins**: first place pays `WIN_COINS` by AI level (Easy 50, Normal 100, Hard 150, Extreme 500), but only
  with at least `WIN_MIN_AI` (7) real AI drivers in the race (`c.isAi`; players who left don't count). A race with only
  real people pays no win coins, so friends can't farm wins off each other. Winners get a toast either way, saying why.
  **All race coins** (win, rival, Driver of the Day) also need more than 5 laps (`COIN_MIN_LAPS` 6) on a track that isn't
  tiny (`COIN_MIN_LEN` 6000 px = 0.6 km as the lobby shows it), and never come in ranked (`Room.noCoinsWhy()`).
- **Idle kick**: anyone in a room with no activity for `IDLE_MS` (1 hour) gets a warning 2 minutes before, then is
  removed from the room and disconnected ("💤 You were removed..."; reload to play). Activity = any message from
  the player, plus `alive` (the page sends it at most once a minute on a tap/click/key). The page's own background
  requests (`IDLE_PASSIVE`: menu info, friends list...) don't count.
- **One account, one match**: an account can only be in one room at a time. Joining (create, Quick Play, code,
  ranked) from a second tab/device is refused until the first one leaves. Signing in inside a room where that
  account is already playing (or coming back to a room after it moved) leaves you a guest there.
- **DRS** (host setting, on by default): cross the start of a DRS zone within `DRS_GAP` (1s) of whoever crossed it last
  and DRS becomes **available** (`c.drsAvail`). Players have to open it themselves: **D** or the green DRS button
  (`drs` socket event, `Room.openDrs`); AI open it straight away. Open, it gives `DRS_BONUS` (+12%) top speed and
  `DRS_ACCEL` (+15%) acceleration until the zone ends, and drivers with it open go for overtakes from much further back
  (`DRS_REACH`). The screen edges glow green with green speed streaks while yours is open. State field 30 is 0 / 1
  (available) / 2 (open). It's on from lap 2 (`DRS_FROM_LAP`), off at 50%+ wet and
  under the safety car (plus 10s after), and open in every zone in qualifying. The feed says "DRS enabled" once it's live
  and the HUD shows 🟩 DRS OPEN. Zones are stored on the shape as base-index pairs (`shape.drs`), so moving the start line
  or reversing keeps them. `trackMsg().drs` and state field 30 (DRS open) go to the browser.
  **Real tracks:** `F1_DRS` in server.js lists each circuit's real zones as lap fractions from its real start line (the
  first point in f1-tracks.json), from the last seasons that had DRS (F1 dropped it in 2026). Circuits that never had
  DRS (Nordschleife, ovals, Indy, Kyalami...) and the 2026 Madrid track use automatic zones.
  **Automatic zones** (`autoDrs`, drawn/random/shared tracks): the end of the 1-3 longest real straights (`straightRuns`:
  nothing tighter than a `DRS_STRAIGHT_R` 2500 px radius, never on bridges), ending at the braking point, max 850 m and
  18% of a lap each. A really twisty track can get no automatic DRS; hosts can still place zones anywhere by hand.
  **Host tools** (Track tools): 🟩 Add DRS (click where it starts, then where it ends, up to 6 zones), ✨ Auto DRS (real or
  automatic zones again), 🚫 No DRS. Zones are kept in share codes, saved tracks (`drs` as board points) and on Smooth on/off.
  Sockets: `drs:add {a, b}`, `drs:set [[ax, ay, bx, by]...]`, `drs:clear`, `drs:auto`.
- **Team ranked** (👥 Team ranked in the room footer, host only): 2-4 signed-in drivers race ranked together as one team
  (`startTeamRanked` in server.js). The field (AI, laps, track) is the **highest rank on the team**: the top
  of everyone's solo and team ratings (team rating `u.rankedTeam` is separate from solo `u.ranked`), with 2 extra AI per
  extra player. Everyone's team rating moves by the team's average place
  (anyone who leaves counts as last; leaving costs only them). After the podium the room is normal again, settings
  and all (`preRanked`). Team ranked leaderboard (`rankedTeam`).
- **Undo anything** (↩️ Undo in every track-tools section, Ctrl+Z): every message that changes the track
  (`TRACK_EVENTS` in game.js) saves the track as it was first (start line, direction, DRS, smooth; last 30). Undo
  rebuilds it like a saved track. Follow-up steps of one change (reverse / start line / DRS after a load) count as one.
- **Wider road / Narrower** pick a part of the track first (click where it starts and ends, like Redraw part), fading in
  and out at the ends; Whole track does the old thing. Press again for more.
- **Assists** (Settings › Assists, `asPit` / `asBoost` / `asDrs`, sent as the `assists` socket event → `p.assist`):
  pit assist runs the AI pit strategy for your car (calls the box, the strategist picks tires unless you picked
  "Next tires"); boost assist runs the AI boost logic for your car (holding the key still works); DRS assist opens DRS
  the moment it's available. They work everywhere, ranked included.
- **Keybinds** (Settings › Keybinds): every race key can be changed (`KEY_ACTIONS` in game.js, kept in `settings.keys`,
  read with `KEY(action)`). A key that's taken swaps places. Number keys 1-4 (tires / upgrade cards) and Esc stay fixed.
  The little key labels on the buttons follow the binds (`keyHints`).
- **Boost XP**: while your boost is firing, every bit of upgrade XP you earn is worth 1.5x (`BOOST_XP_MULT` in server.js).

## Ranked, season pass, trading, sharing, replays, photo mode
- **Ranked** (🏆 on the menu, Profile › Ranked): `ranked:play` makes a one-player room (`r.ranked`) that nobody can
  join or change (`isHost()` is false in it) and starts itself: a random track, 3 laps, random theme/weather.
  Skill rating (SR) from 0: Iron, Bronze, Silver, Gold, Platinum, Diamond, Master (III/II/I, 100 SR each), then
  Overdrive Elite at 2100+. Iron-Bronze race 3 Hard AI, Silver-Gold 5 EXTREME, Platinum+ 5 **Overdrive** AI
  (`AI_LEVELS.overdrive`, ranked only). The "left the race" loss (-45) is charged at the lights (`rankedStart`)
  and replaced by the real result at the flag (`rankedFinish`), so quitting can't dodge it. Ranked leaderboard.
  **Each tier races something different** (`RANKED_FIELDS` in accounts.js, used by `makeRankedRoom`): Iron is 3 Hard AI,
  4 laps on the large map (gentle tracks, or a real circuit up to 4.5 km); every tier up adds AI and laps with bigger,
  wonkier tracks and more real circuits: the huge map from Diamond, up to Overdrive Elite: 12 Overdrive AI, 7 laps,
  huge VERY wonky tracks or real circuits up to 8 km. Laps climb steadily: 4, 6, 7, 9, 10, 12, 13, 15. Mostly daytime and
  dry (`rankedLook`); night and fog never together.
  **Coins:** ranked races pay no race coins. Reaching a division for the first time does (`rankUpCoins`, compared
  with your peak): 150 per division, 600 per new tier, 3,000 for Overdrive Elite.
- **Daily challenges** (3 a day) next to the weekly ones (which are harder now), in the Achievements tab. Both pay
  coins and season pass XP. "Win on a VERY wonky track" uses the random track's wonkiness (`r.wonk`).
- **Season pass** (`PASS_THEMES` in accounts.js): a new one every month (UTC), 12 themes (Frostbite, Heartbreaker...
  Festive), 30 tiers of 250 XP. Free track: coins, a themed item (tier 15) and a themed crate (tier 30). Premium
  (2,000 coins, pays out tiers already reached): 6 themed items and themed crates. Pass items (`bp_*`, `box: "pass"`)
  and themed crates (`crate:open`) only come from the pass. XP: races, dailies (+150), weeklies (+300).
- **Gifts, trades and chat with friends** (Profile › Friends › 💬 🎁 🤝): friends only, one gift/offer a minute,
  5,000 coins a day max, the receiver can't already own the item, trades are checked again when accepted. Messages
  are filtered like chat and kept on both accounts (last 40 per friend).
- **Track share codes**: 🔗 Share code on the track tools gives a 6-character code (`track:share`); 📥 Load code
  (host) loads it with its start line, direction and theme. Stored for a year (Upstash, or `data/shared/`).
- **Track of the week** (menu card, 🌟 on the track tools): the same random track for everyone all week (built from
  the week number with a seeded `Math.random`, `withSeed`), with its own best-lap leaderboard that resets Mondays.
- **Night and fog**: night themes darken everything except headlights and the floodlit start (Settings › Effects
  off = the old light version). Weather **Fog**: you only see the road near your car. Both are drawn from sprites
  made once (`nightSprites`, `fogSp`), and the night layer is half resolution, so they cost about the same as a normal race.
- **Replays**: the last 30 seconds are kept; 💾 Save (in the browser, up to 8) or 🔗 Share (a code, 30 days; the
  browser gzips it, the server checks and rebuilds it in `cleanReplay`). 🎬 Replays on the menu plays them.
- **Team ranked AI teams** match the party size (`r.aiTeamSize`): 2 friends race AI teams of 2, 3 friends teams of 3.
- **Server-wide rare cards**: a super rare upgrade pick also goes to every other room (`rareCardGlobal`, `.world-toast`).
- **Watch YOUR finish**: the client spots your car's finish, then builds a replay from 18 s before it with the camera
  on you (`captureMyFinish`). The last 3 are kept in localStorage (`tb-finishes`) and listed at the top of 🎬 Replays.
- **The Motion pack** (accounts.js): 29 animated items. Their looks are drawn by `glowLook`, `flameLook`, `rimLook`,
  `helmetLook`, the `num` plate table, `smokeCol`, `trailShape`, `drawDecal` and `drawLivery`. Any item with
  "(animated)" in its name keeps moving in the store preview (`LIVE`, `livePreviews`, ~20 fps, only while shown).
- **Sounds**: `engineSound` has two detuned saws through a filter with gears, a boost kick and noise whoosh, and a
  hum from cars within 650 px; `sfx("drs")` plays when DRS opens.
- **Photo mode** (📷 or **K** in a race or replay): freezes the view, drag/scroll/pinch to move and zoom, tilt,
  names on/off, 📸 saves a PNG. Racing alone as host, the race really pauses while you're in it.

## Defend mode and staying on the road
- **Defend** (`defend` socket, `p.defendOn`, key V / `#defendBtn`): `DEFEND_START` (10%) boost to switch on, then
  `DEFEND_DRAIN` (8%/s), no boost recharge meanwhile. Off when the tank is empty, in the pits, under the safety car or
  in qualifying. While defending (`c.defending`): the driver covers the car behind (`c.covering`: shuts the lane they
  pulled out into, covers the inside before corners), the car behind gets no slipstream, attackers need to be much
  closer / quicker to try a move, and a move blocked before they're alongside makes them wait 0.9 s (`passWait`).
  Hard+ AI (`canDefend`) defend on the last two laps when pressured; players can get the same with Defend assist.
- **Staying on track**: drivers catch slides at the road edge (`saving` in `drive()`), and in `trackPos()` the
  tyres bite at the edge (outward speed damped; much stronger with Sticky Setup and Carbon Brakes). Sticky Setup is
  +30% grip / +25% turning grip per level, Carbon Brakes +50% braking (the driver only plans on +38%: a margin).
  Measured on very wonky and real tracks: off-track time 1.9% to about 0.7% with no upgrades, and about 0.15% while
  racing with Grip and Brakes maxed. Lap times are unchanged.

## Mythic chest, Plinko, the big achievement list, ramps
- **Mythic chest** (`BOXES` in accounts.js): 5,000 coins, odds epic 30 / legendary 55 / mythic 15. It also draws from
  Legendary-chest-only items (bodies) and its own exclusives (`box: "mythic"`). 90% of the time it's something you
  don't own, and duplicates refund double.
- **Plinko** (`plinko()` in accounts.js, `plinko:play` socket, Profile › 🎰 Plinko): 12 rows, 13 buckets, the path is
  rolled on the server with `crypto.randomInt`. Payout tables `PLINKO` (low / medium / high) each return about 99%.
  Bets 10-1000, at most 6 balls a second. The client only animates the path it's sent (`PL`, `plDraw`).
- **Achievements**: "The Grind" block in accounts.js generates 1,300+ from tiered families (`family()`: goals spread
  from easy to near-impossible, coins rising steeply), every real circuit (`trackWins`/`trackPods`), every theme,
  AI level and body, and brutal one-offs. New stats come from `recordRace` (`themeWins`, `aiWins`, `bodyWins`,
  `elimWins`, `classWins`, `defendSec`, `perfectStops`, `extremeStreak`...) and plinko. Anything with the same
  description as an older one is skipped. The Achievements tab has search and shows 120 at a time.
  Rewards were cut after launch (routine ones ×0.25, the brutal ones ×0.6). The old values are kept in `ACH_OLD_COINS`.
  `migrateAch()` (run once per account via `fix`, `getUser` and `publicUser`, flagged by `u.mig.achNerf`) took back
  half of what those achievements had paid out before `ACH_NERF_AT`, never going below 0 coins. The client shows a
  one-time note (`achAdjust`).
- **See-through ramps**: after the bridges are drawn, any car under a higher bridge's deck is drawn again at 55% (a
  ghost). **Safety car on ramps**: the state's `sc` now carries its track point and level, so it's drawn in the
  right layer and scaled like the cars.

## Practice, knockout qualifying, sectors, strategy, rematch
- **Practice** (`settings.mode = "practice"`): `startRace` makes no AI and runs a 1-hour session on the qualifying
  machinery (`this.practice` + `this.qualifying`: ghost cars, timed laps), but with tyre wear and the pit stop
  minigame on. The host ends it (`endPractice` socket → `endQuali` → `endPractice()`): lap times, then back to the
  lobby. No race, stats or coins.
- **Knockout qualifying** (`settings.quali = "ko"`, 4+ cars): Q1 120 s, Q2 90 s, Q3 90 s (`KO_LEN`). `koNext()`
  knocks out the slowest (Q1 keeps 2/3 of the field, at least 3; Q2 keeps 1/3, at least 2), saves their time
  (`qBest`), resets the rest. `standings()` in qualifying puts the knocked-out cars behind, by session then time.
  State `qs` = session number. Fewer than 4 cars: one 3-minute session.
- **Sector times**: the lap is split in thirds by track point (`trackPos` → `sectorDone`). A sector only counts
  if the car entered it from the previous one. Colours: purple (best of anyone this race), green (your best),
  yellow. Sent in the `me` message (`sec`).
- **Strategy preview**: `strategy(c)` runs the AI strategist (`aiPlan`) for each player at the tyre pick and sends
  `strategy` {start, stops, box, next}. "Use this plan" sets the start tyre (`compound`) and the next tyre
  (`nextCompound`), and the client reminds you to box on that lap.
- **Rematch**: the results timeout is now `backToLobby()`. The host's `rematch` calls it and starts the race
  straight away. Other players' presses are votes (`rematchVotes`). Not in ranked.

## Pit stop minigame
When a player's car stops in its box (and Settings > Assists > Pit stop minigame is on: `assist.pitGame`), the server
picks 6 arrows (`startPitGame`) and holds the car (`c.pitGame`, `pitting = 99`). The client shows them FNF-style
(`#pitGame`; arrow keys / WASD / buttons on touch) and sends the keys pressed. `endPitGame` replays them against the
sequence and times it on the server: stop = (0.5 + 0.75 × seconds taken + 0.45 per wrong key) × crew (Pro Pit Crew,
punctures), at least 1.3 s. Giving up, or 8 s (`PIT_GAME_MAX`), means a slow stop. AI crews take 2.8 s.

## Race commentator
Recorded clips in `public/commentary/`, made offline with the Kokoro neural TTS model (voice `af_heart`, its
best-rated one) by `tools/commentary_gen.py`:
- `l_<event>_<n>.mp3`: general lines.
- `s_<event>_<who>.mp3`: whole sentences with a name in them ("Bolt wins the race!"), for `win`, `lead` and `elim`.
  `<who>` is every built-in AI name, or `n0`-`n99` ("Number seven…") for players and renamed AI.

`manifest.json` lists them. The client (`COMM`, `say`) plays one clip at a time with priorities, drops old news
and ducks the music. It's triggered by `lightsOut`, `feed` events (crash, winner, classWin, photo, lastLap,
scOut/scIn, rain, puncture, fastest, elim), leader changes and pit stop results.

## Selling
`sell()` in accounts.js (`store:sell` socket): shop items give back half their price. Chest-only and pass items
use `SELL_LOOT` by rarity (25 / 75 / 200 / 500 / 1,500). On average a chest's contents sell for well under what
it cost, so there's nothing to farm. Every item carries its `sell` price in the catalog. Selling takes the item
off your car. Store cards and Customize both have a two-tap Sell button.

### Your own commentator voice (ElevenLabs)
Add two environment variables on Render (your service › **Environment**):
- `ELEVENLABS_API_KEY`: your ElevenLabs API key (elevenlabs.io › profile › API keys). Keep it secret.
- `COMMENTATOR_VOICE` (optional): the voice ID from ElevenLabs (Voices › the voice › copy its ID). Without it,
  the voice ID in `DEFAULT_VOICE` (server.js) is used. `COMMENTENTATOR_VOICE` works too.
- Optional: `COMMENTATOR_MODEL` (default `eleven_multilingual_v2`; `eleven_turbo_v2_5` is cheaper and faster).

How it works: `/voice/config` tells the game a voice is set, and `/voice/<clip>.mp3` makes that line with
ElevenLabs the first time it's needed (the texts are in `public/commentary/lines.json`). Each clip is kept in
memory and in Upstash (or `data/voice/`), so it's only paid for once per voice. All 611 lines together are about
20,000 characters, but only the lines that actually get said are made. If ElevenLabs errors (no credits, a wrong
ID), the built-in clip plays instead, and after 3 failures in a row it pauses for 10 minutes. Change the voice ID
and the new voice takes over (clips are kept per voice).
- If a line isn't ready within 1.5 s, the built-in clip plays (header `X-Voice: built-in`, so the game asks again
  next time) while ElevenLabs finishes it for later.
- **Not working? Open `https://<your site>/voice/status`**. It says whether the key and voice ID were found, how
  many lines have been made, and the last error ElevenLabs gave (the key itself is never shown). Add `?test=1` to
  try making a line right then.

## Customize
Profile › 🎨 Customize (`renderCustom`): a live preview of your car with everything equipped, then each slot
with only the items you own (rarest first) and a "None" option. Tapping sends `store:equip`.

## Elimination races
- `settings.mode = "elim"` (a third Game mode card). `startRace` sets `this.elim = { per, round }`: `per` cars are
  knocked out each lap (`ceil((cars - 1) / 12)`, so 1 a lap up to 13 cars and never more than 12 laps). The race is
  `ceil((cars - 1) / per)` laps. The host's Laps setting is parked in `elimRealLaps` and put back in `endRace`.
- `onLap`: the first car to finish each lap knocks out the last `per` cars still running (on the final lap,
  everyone but the leader). `knockOut` makes the car `out` + `finished` (a ghost that cruises). `standings()`
  puts knocked-out cars behind the runners, the last one out first. The race keeps going after the players are
  out, until one car is left. State index 32 = out; the client shows OUT, a 💀 tag, and a danger-zone warning.

## Safety car catch-up
`scLimit`: a car far behind the car ahead may go up to 97% of top speed, but only as fast as it can still brake
(`SC_CATCH_DEC`) down to just under safety car pace by the time it's 70 px behind. Stragglers sprint up, then
tuck in behind the pack.

## Multiclass racing
- **Game mode** (top of Race settings, host): `settings.mode` is `"normal"` or `"multi"`, plus `settings.mix`
  (share of AI in GTs: 0.33 / 0.5 / 0.67; which AI are GTs: `aiIsGt`). Ranked always runs normal.
- **Classes** (`CAR_CLASSES` in server.js, applied in `stats()` on top of upgrades): Hyper = the normal car.
  GT3 = 82% top speed, 74% acceleration, 87% cornering, 90% grip, 85% brakes, but 70% tyre wear, 85% pit time,
  120% boost refill and 60% crash damage. GT3 cars without a chest body use the boxy `gt3` body (flared arches,
  yellow headlights, swan-neck wing).
- Every player picks their class (`pickClass`, `p.cls`, shown in the lobby). Hypers line up ahead of GTs.
  No slipstream from the other class. Points, class win banners (`classWin` feed), results (`cls`, `cpos`) and
  account stats/coins are per class (`recordStats` scores you in your class if it has 3+ cars).
- Client: `CLASSES` (names, colours, stat bars), `drawClassKit` (GT: green panels, mirrors, big wing; Hyper: red
  LED strips, splitter, fin), `classPos`, `classFlag` (blue flag / GT traffic warning).

## Render's free plan (worth knowing)
It sleeps after 15 minutes with nobody on it (the first visitor then waits ~30 seconds) and has very little CPU
(60 AI at 3x speed can stutter). If the game gets popular, Render's cheapest paid instance ("Starter") fixes both.

## Put it online (Render, free)
1. GitHub repo with `server.js`, `f1-tracks.json` and `package.json` in the main folder, `index.html` inside `public/`.
2. render.com > New > Web Service > pick the repo. Language Node.
3. Build command `npm install`, start command `npm start`, instance type Free.

Run locally: `npm install`, then `npm start`, then open http://localhost:3000
(To try accounts locally without Google: `DEV_LOGIN=1 npm start` adds a "Test login" button.)

## Drawing tools
Freehand, Straight, **Curve** (click points, smooth Catmull-Rom road through them, click the first point to close),
**Mirror** (draw half, starting/ending near the dashed middle line: the other half is mirrored), **Shapes** (drag
a box: oval, stadium, figure 8, bean, triangle, flower, zigzag, clover), **Snap** (15° angles, 25-unit lengths for
straights), Undo/**Redo** (Ctrl+Z / Ctrl+Y), and **Edit track** for the whole finished track: rotate, flip ↔/↕,
bigger/smaller, center, wider/narrower road, wiggle (adds S-bends). Settings > Drawing board look: Clean / Light
(default, a few faded props) / Full.

## Launch checklist bits
Custom 404 page, "Race solo" above the fold on phones, footer links (FAQ / Privacy) on the menu and every page,
breadcrumbs on the pages, 5 FAQs (with FAQPage schema), robots.txt + sitemap.xml (use your real address
automatically), a unique title for every page and every game screen (the race tab shows "P2 · Lap 3/5"),
meta descriptions, Open Graph / Twitter share image, VideoGame schema, alt text / labels on every image and
canvas, and a privacy policy with a real "Delete my account" (Profile > Security). Deleted accounts can't be
brought back by an old browser backup.

## Security
What's in place (server.js "security" section, and the top of `io.on("connection")`):
1. **Secrets stay secret:** no keys in the code or git (scanned); `ACCOUNT_SECRET`, `UPSTASH_*`, `GOOGLE_CLIENT_ID`
   live in Render > Environment. The browser only ever gets the public Google client ID.
2. **Env check at startup:** on Render it warns if `ACCOUNT_SECRET` is missing/short. `DEV_LOGIN` is ignored in production.
3. **Host-only actions** (settings, track, start, kick, make host, pause, AI edits...) are checked on the server.
4. **Input checks:** every socket handler runs inside try/catch (a broken or malicious message can't crash the
   server), messages are capped at 400 KB, names/teams/colors/tracks/presets are validated and clamped.
5. **XSS:** anything a player types is shown with `textContent` (never as HTML), plus a strict Content-Security-Policy.
6. **Rate limiting:** a token bucket per connection (heavy things like Random track cost more), flooders get
   disconnected, max 12 connections per IP, max 300 rooms, 8 sign-in tries a minute per connection and 10 wrong
   passwords locks that username for 10 minutes.
7. **CORS:** only pages from this same site can connect to the game server (`ALLOWED_ORIGINS` to add more).
8. **HTTPS:** http is redirected to https, plus HSTS.
9. **Security headers:** CSP, X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy, COOP.
10. **No debug info:** `x-powered-by` off, 404/500 pages without stack traces, dotfiles never served.
11. **Auth:** salted scrypt password hashes; sessions are random 256-bit tokens (only the sha256 is stored),
    expire after 90 days; "Sign out everywhere". **Password rules** (server, `checkPassword`): 12+ characters,
    3 of lower/UPPER/digits/symbols (or a 20+ passphrase), zxcvbn score 3+, not your username, and not in a data
    breach (Have I Been Pwned range API: only 5 characters of the SHA-1 hash are sent). A live strength meter
    (same zxcvbn, served from `/vendor/zxcvbn.js`) shows on sign-up / reset / change password.
    **2FA (TOTP):** Profile > Security: scan a QR code with any authenticator app, confirm a code, get 10
    one-use backup codes (only hashes stored). Sign-in then needs password + code (`need2fa` ticket, 5 minutes,
    5 tries). Codes can't be reused (replay protection), ±30s clock drift allowed. **Forgot password** works with
    an authenticator or backup code (there's no email) and signs out every other device. No email OTP: that
    needs an email service (e.g. Resend/SendGrid) - TOTP + backup codes cover the same need. No "admin" accounts
    exist (a room host is just a player), so there's nothing to force 2FA on.
    **Login protection** (`authGate`): per IP, after 3 failures a proof-of-work check (the browser must do ~1s of
    hashing: free for a person, expensive for a bot) plus exponential backoff (1s, 2s, 4s... max 5 min);
    10 wrong passwords lock the username for 10 minutes; 10 auth tries a minute per connection; 5 new accounts
    per IP per hour; every failure is logged as `[auth] failed ...` (IP masked, never the password).
    **Backups** are AES-256-GCM encrypted now (older signed ones still load).
12. **Secure cookies:** the session lives in an `HttpOnly; Secure; SameSite=Strict` cookie (`tb_session`), so page
    scripts can't read it. localStorage is only a fallback if the cookie can't be set.
13. **CSRF:** the only cookie-using endpoints (`POST /auth/cookie`, `/auth/logout`) need our custom `X-Scribble`
    header AND an Origin/Referer from this site; SameSite=Strict on top. Websockets check Origin (point 7).
14. **"SQL injection" / DB rules:** there's no SQL. The database only ever sees keys the server made itself
    (`ID_RE`: `u_`, `g_`, `dev_` + safe characters), each player can only touch their own account, the Upstash
    token never leaves the server, the local accounts file is owner-only (0600), backups are signed and
    stripped of `__proto__`-style keys, and a backup can only restore an account the server really lost.
15. **Spend cap:** `UPSTASH_DAILY_CAP` (default 12,000 commands a day) - past it saves are bunched every 60s.
    Also set a budget in the Upstash dashboard if you ever leave the free plan.
16. **Uploads:** players can't upload files. The only player-made data (paint jobs, drawn tracks, saved tracks)
    is checked for exact format and size on the server. `public/music/` is yours only.

## Music
The soundtrack is 15 real songs by **Kevin MacLeod (incompetech.com)**, licensed under
**Creative Commons: By Attribution 3.0** (http://creativecommons.org/licenses/by/3.0/). That license lets
anyone use them in a game for free as long as he's credited, which the game does (Settings > Soundtrack,
and the "now playing" pop-up). They stream from the Internet Archive's copy of his library
(archive.org/details/Incompetech), so there's nothing to upload.
- Race: Aces High, Basic Implosion, Bit Shift, Blip Stream, Black Vortex, Big Rock, Action, Back on Track, Blown Away
- Menus: Backed Vibes (Clean), Big Mojo, Bass Walker, Airport Lounge
- Results: Beachfront Celebration, At Launch
Change the list in `BUILTIN` (index.html). Settings: Master / Music / Sound effects sliders, Soundtrack
(Auto, Shuffle all, Race songs only) and a Next song button.

**How songs load:** the browser asks this server (`/music/km/<file>`); the server downloads the song from
archive.org once, keeps it in a cache folder (`MUSIC_CACHE`, default the system temp folder) and serves it from
there (with seeking). Only the 15 songs in `KM_SONGS` (server.js) can be fetched, so it isn't an open proxy.
Keep `KM_SONGS` in step with `BUILTIN` in game.js. If our server can't get a song, the browser tries archive.org
directly, then skips that song for the visit.
**When songs can't load at all:** after 3 misses in a row the game plays a built-in soundtrack synthesized
with Web Audio (`playSynth`: a menu, race and results beat), and retries the real songs every 3 minutes. The
beat also fills in if a song takes over 5 s to start, and keeps playing until a real song is actually going.
⏭ Next song (`nextSong`) ignores double-clicks and never leaves you in silence.

**Your own songs:** put MP3s in `public/music/` and list them in `public/music/music.json`:
```json
[ { "file": "my-song.mp3", "title": "Song Name", "artist": "Artist Name", "license": "CC BY 4.0", "mood": "race" } ]
```
`mood` is `menu`, `race`, `results` or `any`. Only use songs the artist allows in games, and credit them.

## Accounts and saved tracks survive updates
- **Accounts:** after every change the server gives each player's browser a signed copy of their account.
  When an update (or a free Render restart) wipes the server, the browser hands the copy back on the next
  visit or login and the account comes back with all its stats, coins and items. The signature stops
  anyone from editing their copy. **Set `ACCOUNT_SECRET` once** (Render > Environment, any long random text,
  e.g. mash the keyboard for 40 characters) and never change it. If you change it, old copies stop working.
  Only the browser that last used an account has its copy, so for playing on several devices use Upstash too.
- **Saved tracks (💾 My tracks):** stored in the browser (updates never touch that) and on the account.

**Password bug (fixed Oct 2026):** the season pass used to be saved in `u.pass`, the same field as the password
hash, so the first look at the pass wiped the password and the account could only stay signed in on the device it
was on. The pass is in `u.bp` now. `fix()` moves old pass data over and flags broken accounts `pwLost`: they get a
toast, and Profile > Security lets them set a new password without the old one. Signed out? Signing in on a
device that played on the account works too: its signed backup proves it's theirs, so the typed password becomes
the new one (`pwRepaired`). Elsewhere the error explains this.
**Owner fallback:** Render > Environment > `RESET_PASSWORD` = `username:NewPassword123!` sets that password when
the server starts (check the log), for any account. **Delete the variable straight after.**

## Accounts setup
**Make an account** (username + password) works with no setup at all. Passwords are stored only as a
salted scrypt hash, and there are max 8 sign-in tries a minute per connection. There's no "forgot password".
Google sign-in is optional extra (step 1). Step 2 is needed on Render or accounts get wiped on restarts.

**1. Google Client ID (free):**
1. Go to https://console.cloud.google.com, make a project (any name).
2. APIs & Services > OAuth consent screen: choose External, fill in the app name and your email, save.
   Then press "Publish app" so anyone can sign in (not just test users).
3. APIs & Services > Credentials > Create credentials > OAuth client ID > type "Web application".
   Under "Authorized JavaScript origins" add your site, e.g. `https://your-game.onrender.com`
   (and `http://localhost:3000` for testing). No redirect URI needed.
4. Copy the Client ID (ends in `.apps.googleusercontent.com`).
5. Render > your service > Environment > add `GOOGLE_CLIENT_ID` = that ID. Save (it redeploys).

**2. Somewhere permanent to keep accounts (free):** Render's free plan wipes files on every
restart/redeploy (and it restarts after 15 minutes asleep), so accounts would vanish.
1. Make a free database at https://upstash.com (Redis, pick a region near your Render region).
2. On the database page, copy the **REST URL** and **REST token**.
3. Render > Environment > add `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`.
Without Upstash, accounts are saved in `data/accounts.json` (fine on your own computer).
(Render's free plan has very little CPU: 60 AI at 3x speed can still stutter there.)

## Controls
- **Space**: start reaction at the lights, then **hold to boost** (also **N**, or hold the Boost button)
- **B** box this lap: big tire cards pop up (keys **1-4**) showing how many laps each set lasts.
  If you don't pick before your garage, the "Next tires" choice on the team radio goes on.
- **1/2/3** pick upgrade (click the cards while the tire picker is open), **U** cards later, **Tab** watch another car, **O** settings
- Drawing board: Freehand (drag) and Straight (click) add to the **same** drawing, mix them freely.
  **Redraw part** (✂️): click where a bad bit starts and ends (it turns red, **Other side** flips it),
  **Delete this part**, then draw from the yellow dot back to the green one (or Finish loop to just join it).
  Undo brings the old part back.
  Shift while dragging = straight bit. Width brush (4 sizes, or **[** / **]**) sets how wide the road is
  for what you draw next. **Undo** (Ctrl+Z) removes the last piece, **Finish loop** closes it
  (or come back to the green dot). Esc clears the drawing.
  **Smooth** makes straights straighter and curves smoother (rebuilds the current track too).
  **F1 tracks** loads a real circuit.
- Car setup: **Paint your own design** (24 x 12 pixels over your color/livery, mirror, fill, undo).
- **Grid:** each player's grid menu has **🎲 random** (rolled every race); the host also has **Random grid for everyone**.
- **Undo after Finish loop** brings the drawing back without the join (the auto-filled bit or your closing stroke).
- **Profile** (main menu or 🏅 Profile in the room): Stats, Achievements (46, each pays coins) and the Store
  (underglow, rear wings, boost flame colors, rims, helmets, number plates, trails). Items show on your car for everyone.
- Settings: **⚙** on the team radio panel, or **O**, any time (also mid-race). **UI size**
  (Auto/S/M/L/XL) scales all menus and the HUD (Auto = a bit smaller on phones).
- **Phone mode** (Settings, Auto/On/Off; Auto = touch screens under ~760px): in the room the board is just
  a preview, so swiping over it scrolls. Tap the board (or **Draw the track**) to open a full-screen editor:
  board on top (beside the tools when sideways), big Draw/width/track tools, green **Done**. The room tabs
  stick to the top and **Start race** sticks to the bottom while you scroll. (`body.phone`, `body.editing-track`,
  `setEditing`.)
- Phones: compact lobby (hint and tools above/below the board), round Boost button bottom-right,
  small upgrade cards, no keyboard hints on touchscreens.

---

## Handoff notes (for a new chat)

**How it works:** the server is authoritative. It runs every room's race at 30 ticks/s
(2 physics steps of 1/60s per tick, times the race speed setting) and sends one shared `state`
per room plus a small personal `me` message per player. Browsers only send choices (tires, pit
calls, upgrade picks, start reaction, boost held on/off).

**Race flow:** lobby → `tirePick` (10s) → `lights` → `race` → `results` (12s) → lobby.

**Socket events (client → server):** `create(profile, {public})`, `join {code, profile}`,
`menuInfo`, `setPublic(bool)`, `settings {...}`, `track {stroke, map}` (stroke = `[[x, y, width], ...]`
in board units, width in world px 84-260), `randomTrack {map}`, `setStart`, `reverse`, `clearTrack`,
`draft [[x,y,w],...]|null` (host's drawing in progress, relayed live to everyone), `f1Track {id}`, `gridPos {id, pos}` (host; 0 = back of the grid), `start`, `react(ms)`, `nitro(bool)`, `box`, `compound(key)`, `pick(i)`, `retire`, `setTeam`, `kick`, `setHost`.
**Server → client:** `menuInfo {online, racing, lobbies}` (to sockets on the menu, every 1.5s when
changed), `joined`, `lobby`, `track`, `trackResult`, `race`, `tirePick`, `lights*`, `state`, `me`,
`offer`, `picked`, `results`, `feed`, `toast`, ...

**State car array (index: field):** 0 id, 1 x, 2 y, 3 heading, 4 speed, 5 tire, 6 laps, 7 pits,
8 pit progress, 9 mistake, 10 finished, 11 sliding, 12 onTrack, 13 launch boost, 14 progress,
15 best lap, 16 compound, 17 puncture, 18 surface, 19 inPit, 20 damage, 21 crashed,
22 elevation, 23 vx, 24 vy, 25 track index, 26 nitro on, 27 nitro %, 28 slipstream, 29 ghost.

**Key tuning (top of server.js):** `MAX_SPEED 860`, `ACCEL 560`, `BRAKE 1300`, `STEER_LOCK 3.6`,
`GRIP 14`, `CORNER_GRIP 1700` (what drivers plan for), `LAT_GRIP` (what the car can really do,
1.3x), `CRASH_SPEED 430`, `PIT_LIMIT 170`, `TRACK_W 130` (default width), `MIN_W 84`/`MAX_W 260`,
`SCALE 3.0`, `MAX_AI 60`, `SLIP_TIME 0.5` / `SLIP_BONUS 0.30` (slipstream: within 0.5s of the car
ahead = +30% top speed), `NITRO_POWER 0.12` (+12% top speed, accel x(1.15 + power)), `NITRO_DRAIN 0.2`/s
(a full tank = 5s), no slow refill: `NITRO_LAP_REFILL 0.5` back every time you cross the line (Nitro Refill
upgrade: 55/60/65%), `AQUA_WET 0.8` (80%+ wet and not on wets = aquaplaning: random slides, 45% steering),
XP per second: host setting 10-50 (default 10), `xpForLevel = 100 + (lvl-1)*50`.
All timings are race-time, so at 3x speed the boost drains 3x faster in real seconds.

**Settings:** laps, AI count, map, theme, speed, wear, weather (dynamic = no forecast), teams
on/off, team colors, `xpRate` 10-50, `season` (0 = endless, or 3/5/8/10 races: after the last one
`results.season` has the champions plus `history` (standings after every race), `colors` and `mine`,
and the client shows the season finale: champion cards + a bump chart of positions per race + ▲/▼ table.
The results phase lasts 40s then, and the points reset), `smooth`.

**Pit stops:** `PIT_MISTAKE_CHANCE` 5% adds `PIT_MISTAKE_TIME` 1s. Durables wear x0.66 (a set
lasts ~90% of the race). The `me` message has `life` (laps each compound lasts for this car),
`lapsLeft` (after the stop), `heading`/`pitLane`/`pitting` for the pit tire picker.

**AI strategy (`aiPlan`, `lifeLaps`, `safeLaps`):** tries 0-3 more stops for the laps left and
picks the plan that loses least time (pit loss vs. slower tires), in whole-lap stints. In the last
30% of each lap it decides: planned stop, tires won't reach the next window / the flag (uses the
real measured wear per lap, `lapWearMeas`), wrong tires for the weather, damage, or an undercut
when the car ahead pits. Teammates don't stop together unless it's urgent.

**AI upgrades (`aiUpgrade`):** AI teams earn XP each race-second (xpRate x 1.3-1.7) and pick
weighted-random upgrades, so they speed up during the race like you do.

**Racing line:** minimum-curvature (coarse-to-fine smoothing in `finalizeTrack`, up to 18px
from the road edge): wide in, apex, wide out. Drivers leave "racing room" (never swing across
onto a car beside them), only count as "pulled out" to pass once a full car width across, and
don't fire boost into the back of the car ahead.

**Track building extras:** `narrowCloseRoads` narrows the road where two separate parts of the
track run side by side; `straighten` (Smooth track) simplifies the loop to its corners and rounds
each one. F1 tracks (`setF1Track`) are scaled by real length (~4200 px per km) onto the smallest
map that fits, with the start on the best straight (`bestStart`). Layout data: github.com/bacinger/
f1-circuits, MIT License, Copyright (c) 2019-2025 Tomislav Bacinger (unofficial, not endorsed by F1).

**Upgrades (`UPGRADES`, each has `fx(level)` text shown on cards as "Now → Next"):** Corner
Master +6% corner speed, Late Braker (brakes use 72% → up to 94% of the car's braking), Racecraft
(+0.1s slipstream reach, overtakes more), Focus, Tire Whisperer, Quick Reflexes, Big Engine +7%
top speed, Turbo +25% accel, Sticky Setup +15% grip, Hard Compound, Carbon Brakes +30%,
Pro Pit Crew, Nitro Refill (+5% boost back per lap, max 3), Pit Lane Rocket (+25% pit lane speed, max 3).
(Nitro Power and Nitro Tank were removed.)
(Hard Compound was removed: Tire Whisperer is the one tire-wear upgrade, max 4.)
`stats(c)` turns levels into numbers.

**Track building (server):** `buildTrack` removes tiny accidental loops, trims hooks (not on
already-closed drawings), closes the loop smoothly, smooths, fixes single-point kinks
(`smoothKinks`), blends widths (`smoothWidths`), and narrows the road through hairpins that are
too tight for its width (`narrowTightTurns`). `finalizeTrack` builds the racing line, corner
speeds (`vcorner` raw, `vmax` with braking), gravel, pit lane (sits `hw + PIT_GAP` from centre)
and `computeElev`: where the track crosses itself the LATER pass climbs a ramp and goes over;
if that spot is already on a bridge it goes a level higher (double ramp, max 3).

**Random tracks (`makeRandomTrack`):** random wave-shaped loops (plus a "propeller" shape
where three roads meet, which makes a double ramp). Candidates with cusps are thrown away
(`strokeOk`), the rest are scored by `rateTrack` (bridges at a decent angle, no near-misses,
no too-tight hairpins, twistiness). `bestStart` puts the start/pit lane on a clear straight.

**AI driving (`drive`):** "pure pursuit" steering along the direction of travel; look-ahead
braking for every upcoming corner using its own brakes; overtaking in track coordinates
(`c.lat`, `c.tOff`): when close (or much faster) it picks a side (inside of the next corner
first), checks it's clear (`laneClear`), commits while side by side, then rejoins the line.
AI boost: fires when flat out with at least ~0.8s before the next braking point, holds it until
the braking zone (min 0.8s), never boosts into the car right ahead (pulls out first), backs off
if it's about to rear-end someone (then waits 1.5s), keeps a 15% reserve for fights, and empties
the tank on the last lap. Drivers
decide 30x/s (staggered), physics runs 60x/s. Cars near each other are found through
track-index buckets (`around`), collisions through a 64px spatial hash.

**Ghost cars (`ghost`)**: punctured, in the pit lane, finished (cool-down lap) or reversing
out of trouble. They can't be hit and the AI ignores them; they're drawn see-through.

**Client rendering:** the static track is drawn once into cached 384px tiles (skid marks are
painted straight into the tiles). The road is drawn as "width runs". Cars are drawn a moment
in the past and moved along a curve using their velocity (`interpCars`), so they follow
corners at 2x/3x. Bridges are sorted low to high and each car is drawn right after the bridge
it's on (from the server's track index), so cars on ramps are never hidden by their own bridge.
The delay adapts to how uneven the connection is (`netDelay`, 80-350ms), the display clock never
speeds up/slows down by more than 12%, late corrections are blended in over a few frames instead of
popping, and a car's height (and which bridge it's drawn on) comes from where it's drawn on the
track, so climbing onto and off ramps is smooth even on a bad connection.

**Phones:** portrait and landscape layouts (landscape lobby: board on the left sized to the screen,
drawing tools beside it, room panel on the right). Settings > Interface size (Auto/Small/Normal/Big/
Huge) scales all menus and HUD (they're in rem). The bottom HUD stacks itself by measuring
(`layoutHud`). Guests see the host's drawing live while it's being drawn (`draft` event). `segOf` covers the whole drawn deck
(ramps + 5 points either side) and the layer uses the track index of the snapshot the car is
drawn from (`drawIdx`), so there's no flicker getting on or off a ramp.

**Double ramps** are drawn in their own colours (`RAMP_STYLE`: level 2 blue deck/cyan kerbs, level 3 purple/pink).
**Drawing board sizing:** `sizeBoard` uses `clientWidth/Height` (not the bounding box, which includes the
lobby's slide-in scale animation and caused the pen to land away from the mouse); `toBoard` scales by
on-screen vs layout size and freehand uses coalesced pointer events.

**Accounts (`accounts.js`):** sockets `auth:signup`/`auth:login {username, password}` (ids `u_<lowercase name>`), `auth:google {credential}` (verified with Google's tokeninfo,
`aud` must match `GOOGLE_CLIENT_ID`), `auth:resume {token}`, `auth:signout`, `auth:dev` (DEV_LOGIN only),
`catalog`, `store:buy id`, `store:equip {slot,id|null}`; server sends `account`, `achievement`, `signedOut`.
Sessions are random tokens (only their sha256 is stored), kept in `tb-token`. `Room.recordStats` builds a
summary per signed-in player at the flag (`c.rs` counts overtakes/crashes/clean laps/slips/boost/wet),
`recordRace` adds it to the totals and checks `ACH`. Equipped items go out as `extras` {slot: look} on
lobby players and race cars; `drawCar` draws them (`trailShape` for trails).

**Rain:** from `SLIP_WET` 60% wets are best. Dry tires: -8% top speed per 100% wet, plus up to -17% more
from 50% to 90% wet, grip x(1 - 0.45 wet), and a slip (0.55-0.85s, rear steps out) about 1-3 times a lap.
**Overtakes:** +10% boost each (`OVERTAKE_BOOST`, AI too). **Durables:** speed 0.97, wear 0.66 (~90% of a race).
**Random tracks:** `randomStroke` kinds: classic waves, `rawNoodle` (straights/hairpins/chicanes/spirals/snakes,
steered home), `rawScatter` (spline through random points), wild waves (8 harmonics).
**Themes:** grass, desert, snow, night, autumn, beach, city, volcano, neon (`THEMES` + `tex()` ground patterns).
**Season finale:** shown to everyone; `hasLastSeason` in the lobby + `lastSeason` event reopen it later.
Nordschleife layout: simplified from github.com/maciejb2k/nurburgring-nordschleife-geojson (Touristenfahrten loop).
It's squeezed onto the biggest map (~2.3 km in game instead of 20.7). Daytona/Martinsville are geometric approximations.

**Qualifying** (`settings.quali` minutes, 0 = off): `startRace` runs a timed session first (`this.qualifying`,
laps set to 999, no tire wear, no AI pit stops, everyone is a ghost, standings/gaps by best lap). `endQuali` saves
`qualiGrid` (car `slotKey`s: `h:<playerId>` / `a:<aiIndex>`), shows `qualiResults` for 9s, then starts the race on that grid.
**Pause:** host button / P key, `pause` socket, `setPaused`; `state.paused`. Auto-unpauses if the host leaves.
**Must pit:** `mustPit {reason: rain|tires|damage}` popup when it really matters. **Pit exit:** 3s ghost (`c.ghostUntil`).
**Laps:** any number 1-99. **Weather:** hidden `rain` strength drifting toward random `rainGoal` fronts (showers,
cloudbursts, breaks); track `wet` soaks fast / dries slowly. The forecast bar (`weather.trend`, -3..3) is noisy,
lags and only updates every 3-7s, so it's a hint, not a promise. Dynamic weather only.
**Scenery** (`buildDecor`/`drawDecor`, Settings > Scenery): seeded per track+theme: grandstands by the start,
trees/farms (grass), lamps (night), cacti/adobe (desert), pines/cabins/snowmen (snow), fall trees/pumpkins
(autumn), sea/palms/umbrellas (beach), offices/cars (city), a volcano/lava/bunkers (volcano), neon cyber-towers/
holo signs (neon). Drawn into the cached tiles, so it costs nothing per frame.
**Chests** (`BOXES` in accounts.js): Basic 100 (72/22/5/1 % common/rare/epic/legendary), Intermediate 500
(40/38/17/5), Legendary 1000 (15/30/35/20). Duplicates refund 10/30/80/200 coins. Chest-only items: junk commons
and 13 original liveries (`drawLivery`). All odds are shown in the store.

**Grid:** staggered (`gridSlot` on the server, `gridSlotC` + `drawGridBoxes` on the client): each car is one slot
behind the one in front, left/right alternating, 60px apart (squeezed on short tracks with huge grids); numbered boxes painted on the road.
**AI teammate:** `aiTeammate {}` moves an AI from a team without humans into yours (adds one if there are no AI),
`aiTeammate {remove: name}` sends it back (`origTeam`). **Leaderboard:** shows as many rows as fit plus your own
row; hold **Ctrl** (or tap it) for everyone. **Lap delta** (top right): this lap vs your best lap at the same point.
**Damage:** cracks/dents on the car grow with damage, smoke above 55%. **Side by side:** rubbing no longer costs
speed every physics step, and a car beside you isn't treated as one to follow. **Durables:** wear 0.8 (~1.25x inters).

**Backups:** `makeBackup`/`readBackup`/`restore` in accounts.js (HMAC-SHA256 with `ACCOUNT_SECRET`); `account`
messages carry `backup`; the client keeps `tb-backups` {id: blob} + `tb-last` and sends it with `auth:resume`,
`auth:login`, `auth:signup` and `auth:google`. A server copy always wins over a backup.
**Presets:** `presets:get|save|delete` (max 30, stroke simplified to 2500 points; map, smooth, theme, reverse,
start point). Client keeps `tb-presets` and merges both lists by name (newest wins).
**Teams:** `renameTeam name` renames your team for everyone on it (AI too) and moves its championship points.
**AI:** 90 made-up names (`AI_NAMES`) and 33 team names, so big grids don't get "Bolt 2".

**Upgrades:** Quick Reflexes removed. **Enhancer** (max 4): +3% to every stat, applied on top of all the others
(`stats()` = `baseStats()` x enhancer). Offers come from a shuffled bag per player (`p.bag`), so every upgrade
shows up once before any repeats. **Qualifying:** a full boost tank every lap.
**AI difficulty** (`settings.aiLevel`, `AI_LEVELS`): easy / medium / hard / extreme change skill, engine power,
reactions, aggression, mistakes and how fast AI teams upgrade.
**Store:** 86 items. New slots `decal` and `body`. Bodies (kart, muscle, rally, endurance prototype = legendary,
open-wheel F1-style racer = **mythic, 1% from the Legendary chest only**) have `box: "legend"`; `bodyPath`/
`bodyExtras` draw them. Mythic duplicates refund 600 coins.
**Extras:** quick emotes (`emote`, bubbles over cars / lobby pop-ups), daily login bonus (`dailyReward`: 50 coins
+10 per day in a row, max 150), personal best lap per track (`stats.pbs`, keyed by `trackKey` = real track id
or a fingerprint of the drawing, + `_r` when reversed).

**Achievements (148):** `cnt()` ones have a `goal` + `prog()` (progress bars, sent as `achProg`), `one()` ones
are single-race feats. 38 "insane" ones pay 1,000-5,000 coins. `recheck` runs on sign-in so anything you
already qualify for unlocks right away. New stats: poles, emotes, winsHard/winsExtreme, win streaks, last places,
coinsEarned, bestStreak, themes/themesWon. **Chest spin:** starts from a laid-out 0 before animating, and isn't
switched off by Reduce motion (it's just shorter).

**Spectators:** `spectate true|false` in the lobby (👀 button in the Drivers tab): no car, a camera bar to
follow any car. Someone joining mid-race now watches it live. A race with only spectators runs until the AI finish.
**Boost:** +2% every second when you're not boosting (`NITRO_REGEN`). **Nitro Saver** upgrade: drains 3/6/9/12% slower.
**Redraw part:** the start line and direction stay where they were (unless the start was on the bit you deleted).
**Drawing board:** painted once into a cached picture (`paintBoardBg`) with the race's ground texture, the
theme's scenery and a vignette, then copied every frame.

**Other features:** weather (sunny / rainy / dynamic), teams on/off (off = everyone for
themselves, no team points), team colors, custom points table, renameable AI, kick, hand over
host, reset championship, move start line, reverse track, public/private rooms.
Client settings saved in `tb-settings`, profile (with `design`) in `tb-profile`, brush size in `tb-brush`.
Upgrade cards only appear during a race (they're cleared at the flag).
