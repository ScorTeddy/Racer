# Scribble GP ad (47 s, 1920x1080, 60 fps)

`scribble-gp-ad.mp4` is the finished ad. Everything in it is made from the files here, so it can be changed and rebuilt.

- `ad.js` + `index.html`: the whole animation, drawn on a canvas. `renderFrame(t)` draws second `t`, so every frame is exact.
  Scenes (times in seconds): draw a track 0-6, logo 6-10, start lights 10-14, race (boost, DRS, overtakes) 14-22,
  pit stop minigame 22-26, upgrade cards 26-30, multiplayer and modes 30-34, photo finish 34-40, end card 40-47.
- `audio.py`: the soundtrack. Music (120 BPM, so the beats land on the cuts), sound effects for every on-screen action,
  and the game's own commentator clips from `public/commentary/`, with the music dipping under the voice.
- `render.js`: plays the animation in headless Chromium and encodes it with ffmpeg, together with the audio.
- `stills.js`: saves single frames to `stills/` for checking, e.g. `node stills.js 16.6 24.6`.
- `fonts/`: Permanent Marker, Patrick Hand and Caveat (Google Fonts, SIL Open Font License).

Rebuild (needs Python 3 with numpy, Node with Playwright, ffmpeg):
```
python3 audio.py
node render.js scribble-gp-ad.mp4
```
A quick preview of one part: `T0=14 T1=22 FPS=30 node render.js preview.mp4`.
This folder isn't in `public/`, so the game server never serves it.
