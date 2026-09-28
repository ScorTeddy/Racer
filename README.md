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
package.json       dependencies (express, socket.io)
public/index.html  the entire client (menu, room screen, race view, HUD, settings) in one file
```

## Put it online (Render, free)
1. GitHub repo with `server.js`, `f1-tracks.json` and `package.json` in the main folder, `index.html` inside `public/`.
2. render.com > New > Web Service > pick the repo. Language Node.
3. Build command `npm install`, start command `npm start`, instance type Free.

Run locally: `npm install`, then `npm start`, then open http://localhost:3000
(To try accounts locally without Google: `DEV_LOGIN=1 npm start` adds a "Test login" button.)

## Music
Six original songs are built in (made with code by the game's synth, no files): Grid Walk, Full Throttle,
Neon Overdrive, Pit Wall Funk, Victory Lap, Rain Tyres. Settings > Music volume / Soundtrack (Auto picks one
for the menu, race and results; Shuffle plays anything).

**Adding real songs by other artists:** only use music the artist lets you use in a game, and credit them.
Good free sources: Pixabay Music (free for games, no credit needed), incompetech.com by Kevin MacLeod
(CC BY: credit "Kevin MacLeod (incompetech.com)"), FreePD.com (public domain).
1. Download the MP3s and put them in `public/music/`.
2. List them in `public/music/music.json`, for example:
```json
[
  { "file": "my-race-song.mp3", "title": "Song Name", "artist": "Artist Name", "license": "CC BY 4.0", "mood": "race" },
  { "file": "chill.mp3", "title": "Chill Tune", "artist": "Someone", "license": "Pixabay", "mood": "menu" }
]
```
`mood` is `menu`, `race`, `results` or `any`. The title and artist pop up when a song starts.

## Accounts and saved tracks survive updates
- **Accounts:** after every change the server gives each player's browser a signed copy of their account.
  When an update (or a free Render restart) wipes the server, the browser hands the copy back on the next
  visit or login and the account comes back with all its stats, coins and items. The signature stops
  anyone from editing their copy. **Set `ACCOUNT_SECRET` once** (Render > Environment, any long random text,
  e.g. mash the keyboard for 40 characters) and never change it. If you change it, old copies stop working.
  Only the browser that last used an account has its copy, so for playing on several devices use Upstash too.
- **Saved tracks (💾 My tracks):** stored in the browser (updates never touch that) and on the account.

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

**Other features:** weather (sunny / rainy / dynamic), teams on/off (off = everyone for
themselves, no team points), team colors, custom points table, renameable AI, kick, hand over
host, reset championship, move start line, reverse track, public/private rooms.
Client settings saved in `tb-settings`, profile (with `design`) in `tb-profile`, brush size in `tb-brush`.
Upgrade cards only appear during a race (they're cleared at the flag).
