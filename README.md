# Scribble GP: Team Boss (made by Emmett)

Multiplayer racing team manager. The host draws a track (or rolls a random one), and every
player is the boss of a team whose AI driver races it. Players pick tires, react to the start
lights, call pit stops, fire their boost and choose upgrade cards. Up to 6 players per room
plus up to 60 AI drivers. Rooms can be private (invite code) or public (listed on the menu).

## Files
```
server.js          Node server: rooms, lobbies, track building, the whole race simulation
package.json       dependencies (express, socket.io)
public/index.html  the entire client (menu, room screen, race view, HUD, settings) in one file
```

## Put it online (Render, free)
1. GitHub repo with `server.js` and `package.json` in the main folder, `index.html` inside `public/`.
2. render.com > New > Web Service > pick the repo. Language Node.
3. Build command `npm install`, start command `npm start`, instance type Free.

Run locally: `npm install`, then `npm start`, then open http://localhost:3000
(Render's free plan has very little CPU: 60 AI at 3x speed can still stutter there.)

## Controls
- **Space**: start reaction at the lights, then **hold to boost** (also **N**, or hold the Boost button)
- **B** box this lap, **1/2/3** pick upgrade, **U** cards later, **Tab** watch another car, **O** settings
- Drawing board: Freehand (drag) and Straight (click) add to the **same** drawing, mix them freely.
  Shift while dragging = straight bit. Width brush (4 sizes, or **[** / **]**) sets how wide the road is
  for what you draw next. **Undo** (Ctrl+Z) removes the last piece, **Finish loop** closes it
  (or come back to the green dot). Esc clears the drawing.

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
`start`, `react(ms)`, `nitro(bool)`, `box`, `compound(key)`, `pick(i)`, `retire`, `setTeam`, `kick`, `setHost`.
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
ahead = +30% top speed), `NITRO_POWER 0.20`, `NITRO_DRAIN 0.12`/s, `NITRO_REGEN 0.03` every 1.5s,
XP per second: host setting 10-50 (default 10), `xpForLevel = 100 + (lvl-1)*50`.
All timings are race-time, so at 3x speed the boost drains 3x faster in real seconds.

**Upgrades (`UPGRADES`, each has `fx(level)` text shown on cards as "Now → Next"):** Corner
Master +6% corner speed, Late Braker (brakes use 72% → up to 94% of the car's braking), Racecraft
(+0.1s slipstream reach, overtakes more), Focus, Tire Whisperer, Quick Reflexes, Big Engine +7%
top speed, Turbo +25% accel, Sticky Setup +15% grip, Hard Compound, Carbon Brakes +30%,
Pro Pit Crew, Nitro Power (+8% boost), Nitro Tank (drains 25% slower, refills 50% faster).
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
AI uses boost on straights when chasing, fighting, defending or on the last lap. Drivers
decide 30x/s (staggered), physics runs 60x/s. Cars near each other are found through
track-index buckets (`around`), collisions through a 64px spatial hash.

**Ghost cars (`ghost`)**: punctured, in the pit lane, finished (cool-down lap) or reversing
out of trouble. They can't be hit and the AI ignores them; they're drawn see-through.

**Client rendering:** the static track is drawn once into cached 384px tiles (skid marks are
painted straight into the tiles). The road is drawn as "width runs". Cars are drawn a moment
in the past and moved along a curve using their velocity (`interpCars`), so they follow
corners at 2x/3x. Bridges are sorted low to high and each car is drawn right after the bridge
it's on (from the server's track index), so cars on ramps are never hidden by their own bridge.

**Other features:** weather (sunny / rainy / dynamic), teams on/off (off = everyone for
themselves, no team points), team colors, custom points table, renameable AI, kick, hand over
host, reset championship, move start line, reverse track, public/private rooms.
Client settings saved in `tb-settings`, profile in `tb-profile`, brush size in `tb-brush`.
