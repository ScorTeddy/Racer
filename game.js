// Scribble GP: Team Boss - the whole game client (menu, room, race view, HUD, settings, profile).
// Loaded by public/index.html. Kept out of the HTML so the page can run with a strict Content Security Policy.
(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const view = $("view"), ctx = view.getContext("2d");
  const mini = $("minimap"), mctx = mini.getContext("2d");
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  const CAR_LEN = 46, CAR_WID = 24;
  const KMH = 0.36;
  const COLORS = ["#ffcc1f", "#e53935", "#fb8c00", "#43a047", "#00acc1", "#1e88e5", "#8e24aa", "#ec407a", "#f5f5f5", "#263238"];
  // how the number on your car is written: [key, name, canvas font]
  const NUM_FONTS = [["race", "Racing", "700 9px 'Chakra Petch', sans-serif"], ["block", "Block", "400 9px 'Russo One', sans-serif"], ["classic", "Classic", "700 9.5px Georgia, 'Times New Roman', serif"], ["digital", "Digital", "700 9px 'Courier New', monospace"], ["script", "Script", "italic 700 10px 'Brush Script MT', 'Segoe Script', cursive"]];
  const LIVERIES = [["plain", "Plain"], ["stripes", "Stripes"], ["split", "Two-tone"], ["flames", "Flames"], ["checker", "Checker"]];
  const MAP_SIZES = { small: [1200, 750], normal: [1600, 1000], large: [2400, 1500], huge: [3200, 2000] };
  const THEMES = {
    // tex = how the ground is painted (see tex()): mowing stripes, dune ripples, snow drifts, paving slabs...
    grass:   { ground: "#4f8a3c", speck: ["rgba(255,255,255,0.05)", "rgba(0,0,0,0.07)"], tex: "stripes", runoff: "#c9b98d", asphalt: "#3d3f45", curbA: "#f4f4f4", curbB: "#d32f2f", line: "rgba(255,255,255,0.45)" },
    desert:  { ground: "#d8b273", speck: ["rgba(255,255,255,0.1)", "rgba(120,70,20,0.12)"], tex: "dunes", runoff: "#e6c894", asphalt: "#4a4540", curbA: "#f4f4f4", curbB: "#ef6c00", line: "rgba(255,255,255,0.4)" },
    snow:    { ground: "#e8eef3", speck: ["rgba(255,255,255,0.7)", "rgba(120,150,180,0.14)"], tex: "drifts", runoff: "#cfd9e1", asphalt: "#4b5159", curbA: "#f4f4f4", curbB: "#1e88e5", line: "rgba(255,255,255,0.5)" },
    night:   { ground: "#17241b", speck: ["rgba(255,255,255,0.03)", "rgba(0,0,0,0.22)"], tex: "stripes", runoff: "#3a3527", asphalt: "#26282e", curbA: "#9aa0a6", curbB: "#b71c1c", line: "rgba(255,255,255,0.3)", night: true },
    autumn:  { ground: "#7c7a36", speck: ["rgba(230,120,30,0.28)", "rgba(190,50,30,0.22)"], tex: "leaves", runoff: "#b99a6b", asphalt: "#3f3b3a", curbA: "#f4f1e8", curbB: "#c2410c", line: "rgba(255,255,255,0.42)" },
    beach:   { ground: "#e9d8a6", speck: ["rgba(255,255,255,0.35)", "rgba(160,120,60,0.12)"], tex: "dunes", runoff: "#f3e6bf", asphalt: "#474a52", curbA: "#ffffff", curbB: "#0ea5b7", line: "rgba(255,255,255,0.5)", water: "#2bb3c9" },
    city:    { ground: "#7b8088", speck: ["rgba(255,255,255,0.05)", "rgba(0,0,0,0.1)"], tex: "slabs", runoff: "#9aa0a8", asphalt: "#2e3036", curbA: "#ffd21f", curbB: "#1c1c1c", line: "rgba(255,255,255,0.5)" },
    volcano: { ground: "#2b2320", speck: ["rgba(255,90,20,0.18)", "rgba(0,0,0,0.3)"], tex: "lava", runoff: "#4a3a33", asphalt: "#1f1c1c", curbA: "#ffb020", curbB: "#b91c1c", line: "rgba(255,190,120,0.45)" },
    neon:    { ground: "#120d24", speck: ["rgba(180,120,255,0.08)", "rgba(0,0,0,0.3)"], tex: "grid", runoff: "#231a40", asphalt: "#18142a", curbA: "#22e6ff", curbB: "#ff2bd6", line: "rgba(120,240,255,0.6)", night: true },
  };
  const TIRES = {
    durable: { name: "Durable", short: "D", color: "#f5f5f5", speed: 0.35, grip: 0.35, life: 0.7, note: "Lasts longer than the others, but it's the slowest." },
    inter:   { name: "Intermediate", short: "I", color: "#ffcc1f", speed: 0.55, grip: 0.6, life: 0.55, note: "Right in the middle. A safe pick." },
    fast:    { name: "Fast", short: "F", color: "#e53935", speed: 1.0, grip: 0.85, life: 0.2, note: "The quickest, but they wear out fast." },
    wet:     { name: "Wets", short: "W", color: "#1e88e5", speed: 0.3, grip: 1.0, life: 0.5, note: "For rain. Slow and wear out fast on a dry track." },
  };
  const SHORT_TO_KEY = { D: "durable", I: "inter", F: "fast", W: "wet" };
  const WIDTHS = [[96, "Thin road"], [130, "Normal road"], [176, "Wide road"], [230, "Huge road"]];
  function badge(key, small) {
    const b = document.createElement("span"); const T = TIRES[key];
    b.className = "badge" + (small ? " sm" : ""); b.dataset.c = key; b.style.borderColor = T.color; b.textContent = T.short; b.title = T.name;
    return b;
  }
  const ORDER_HINT = {
    push: "Risky! A little faster, but tires wear 75% quicker and big mistakes are 3x as likely.",
    normal: "A steady pace. Good default.",
    save: "Slower, but tires last way longer and mistakes are rare.",
  };

  // ======================= Settings (saved on this device) =======================
  const SETTINGS = [
    { key: "cb", label: "Colorblind-friendly tires", hint: "Each tire gets its own ring pattern and bigger letters, and colors that are easier to tell apart", def: "off", opts: [["off", "Off"], ["on", "On"]] },
    { key: "phone", label: "Phone mode", hint: "Scroll the room without drawing by accident. Tap the board to open a full-screen track editor with big tools. Auto: on for phones.", def: "auto", opts: [["auto", "Auto"], ["on", "On"], ["off", "Off"]] },
    { key: "ui", label: "Interface size", hint: "How big buttons and text are (Auto: a bit smaller on phones)", def: "auto", opts: [["auto", "Auto"], ["s", "Small"], ["m", "Normal"], ["l", "Big"], ["xl", "Huge"]] },
    { key: "vMaster", label: "🔊 Master volume", hint: "Everything at once", def: 80, range: true },
    { key: "vMusic", label: "🎵 Music", hint: "", def: 45, range: true },
    { key: "vFx", label: "💥 Sound effects", hint: "Lights, engines, overtakes...", def: 70, range: true },
    { key: "vCrowd", label: "📣 Crowd", hint: "The crowd: a murmur all race, a roar for overtakes, crashes and the finish. 0 = off", def: 60, range: true },
    { key: "vComm", label: "🎙️ Commentator", hint: "The race commentator: starts, crashes, overtakes for the lead, wins. 0 = off", def: 80, range: true },
    { key: "track", label: "Soundtrack", hint: "Auto: calmer songs in the menus, fast ones in the race. Music by Kevin MacLeod (incompetech.com), CC BY 3.0", def: "auto", opts: [["auto", "Auto"], ["shuffle", "Shuffle all"], ["race", "Race songs only"]] },
    { key: "engine", label: "Engine sound", hint: "The sound of your car (only you hear it)", def: "on", opts: [["on", "Classic"], ["v8", "V8 rumble"], ["v12", "V12 scream"], ["electric", "Electric whine"], ["off", "Off"]] },
    { key: "horn", label: "📯 Your horn", hint: "Press H in a race: everyone near your car hears it", def: "classic", opts: [["classic", "Classic beep"], ["truck", "Big truck"], ["clown", "Clown"], ["air", "Air horn"], ["tune", "Party tune"], ["bike", "Bike bell"]] },
    { key: "intro", label: "Pre-race intro", hint: "The track card and the camera walking down the grid before the start", def: "on", opts: [["on", "On"], ["off", "Off"]] },
    { key: "units", label: "Speed units", def: "kmh", opts: [["kmh", "km/h"], ["mph", "mph"]] },
    { key: "zoom", label: "Camera zoom", def: "normal", opts: [["close", "Close"], ["normal", "Normal"], ["far", "Far"]] },
    { key: "cam", label: "Camera follows", hint: "Tab also switches who you're watching", def: "me", opts: [["me", "My car"], ["leader", "Leader"]] },
    { key: "names", label: "Name tags", def: "all", opts: [["all", "All"], ["mine", "Mine"], ["off", "Off"]] },
    { key: "gfx", label: "Graphics", hint: "Auto lowers the race view's sharpness when your device can't keep up, so it stays smooth", def: "auto", opts: [["auto", "Auto (smooth)"], ["high", "Sharp"], ["fast", "Fast (for slow phones)"]] },
    { key: "fx", label: "Smoke and dust", def: "high", opts: [["high", "High"], ["low", "Low"], ["off", "Off"]] },
    { key: "boardScenery", label: "Drawing board look", hint: "How much scenery shows on the board while you draw (the race always gets the full thing)", def: "light", opts: [["off", "Clean"], ["light", "Light"], ["full", "Full"]] },
    { key: "scenery", label: "Scenery", hint: "Buildings, trees and props around the track (turn off on slow devices)", def: "on", opts: [["on", "On"], ["off", "Off"]] },
    { key: "skids", label: "Skid marks", def: "on", opts: [["on", "On"], ["off", "Off"]] },
    { key: "lines", label: "Speed lines", def: "on", opts: [["on", "On"], ["off", "Off"]] },
    { key: "shake", label: "Screen shake", def: "on", opts: [["on", "On"], ["off", "Off"]] },
    { key: "minimap", label: "Minimap", def: "on", opts: [["on", "On"], ["off", "Off"]] },
    { key: "raceline", label: "Show racing line", hint: "The line the drivers try to follow", def: "off", opts: [["on", "On"], ["off", "Off"]] },
    { key: "theme", label: "Menu theme", def: "broadcast", opts: [["broadcast", "Broadcast (new)"], ["dark", "Classic dark"], ["light", "Light"]] },
    { key: "motion", label: "Reduce motion", def: "system", opts: [["system", "Device"], ["on", "On"], ["off", "Off"]] },
    // ---- Assists tab: things done for you in the race ----
    { tab: "assists", key: "asPit", label: "🔧 Pit assist", hint: "Calls your pit stops for you (worn tires, rain, damage) and picks the tires, like the AI strategists do. You can still box yourself.", def: "off", opts: [["on", "On"], ["off", "Off"]] },
    { tab: "assists", key: "asBoost", label: "⚡ Boost assist", hint: "Fires your boost for you on the straights, saving some for fights. Holding the boost key still works too.", def: "off", opts: [["on", "On"], ["off", "Off"]] },
    { tab: "assists", key: "asDefend", label: "🛡️ Defend assist", hint: "Turns on Defend for you in the last 2 laps when someone's right behind (it uses your boost, like pressing it yourself).", def: "off", opts: [["on", "On"], ["off", "Off"]] },
    { tab: "assists", key: "asDrs", label: "🟩 DRS assist", hint: "Opens DRS the moment it's available, so you never miss it.", def: "off", opts: [["on", "On"], ["off", "Off"]] },
  ];
  // ---- keybinds (Settings > Keybinds): every race key can be changed ----
  const KEY_ACTIONS = [
    ["boost", "⚡ Boost (hold) · start reaction", "Space"], ["boost2", "⚡ Boost, second key", "KeyN"], ["drs", "🟩 Open DRS", "KeyD"],
    ["box", "🔧 Box this lap", "KeyB"], ["defend", "🛡️ Defend on/off", "KeyV"], ["cards", "🃏 Upgrade cards", "KeyU"], ["photo", "📷 Photo mode", "KeyK"], ["horn", "📯 Horn", "KeyH"],
    ["pause", "⏸ Pause race (host)", "KeyP"], ["spectate", "👀 Watch the next car", "Tab"], ["settings", "⚙ Settings", "KeyO"],
  ];
  const KEY_DEFAULTS = Object.fromEntries(KEY_ACTIONS.map(([a, , k]) => [a, k]));
  const settings = {};
  for (const x of SETTINGS) settings[x.key] = x.def;
  try { Object.assign(settings, JSON.parse(localStorage.getItem("tb-settings") || "{}")); } catch (e) {}
  // the Broadcast look is the new default menu theme: players on the old dark theme move over once (Settings has Classic)
  if (!settings.themeV) { if (settings.theme === "dark") settings.theme = "broadcast"; settings.themeV = 1; }
  settings.keys = { ...KEY_DEFAULTS, ...(settings.keys && typeof settings.keys === "object" ? settings.keys : {}) };
  const KEY = (a) => settings.keys[a] || KEY_DEFAULTS[a];
  const keyName = (code) => (!code ? "?" : code.startsWith("Key") ? code.slice(3) : code.startsWith("Digit") ? code.slice(5) : code.startsWith("Numpad") ? "Num " + code.slice(6)
    : { Space: "Space", Tab: "Tab", Enter: "Enter", ShiftLeft: "L Shift", ShiftRight: "R Shift", ControlLeft: "L Ctrl", ControlRight: "R Ctrl", AltLeft: "L Alt", AltRight: "R Alt",
      ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→", Backquote: "`", Minus: "-", Equal: "=", BracketLeft: "[", BracketRight: "]", Backslash: "\\", Semicolon: ";", Quote: "'", Comma: ",", Period: ".", Slash: "/" }[code] || code);
  // played here before this page load? (checked before anything gets saved, for the "What's new" popup)
  let PLAYED_BEFORE = false; try { PLAYED_BEFORE = !!(localStorage.getItem("tb-settings") || localStorage.getItem("tb-profile") || localStorage.getItem("tb-news")); } catch (e) {}
  // old Off/Low/Med/High sound settings -> the new sliders
  { const OLD = { off: 0, low: 25, med: 55, high: 100 }; if (typeof settings.sound === "string" && OLD[settings.sound] !== undefined) { settings.vFx = OLD[settings.sound]; delete settings.sound; } if (typeof settings.music === "string") { settings.vMusic = settings.music === "off" ? 0 : OLD[settings.music] ?? 45; delete settings.music; } if (!["auto", "shuffle", "race"].includes(settings.track)) settings.track = "auto"; }
  const fxVol = () => (Number(settings.vMaster) / 100) * (Number(settings.vFx) / 100);
  const musicVol = () => (Number(settings.vMaster) / 100) * (Number(settings.vMusic) / 100);
  let reducedMotion = false;
  const isPhone = () => Math.min(window.innerWidth, window.innerHeight) < 560;
  const isTouch = () => window.matchMedia("(pointer: coarse)").matches;
  function applySettings() {
    document.documentElement.dataset.theme = settings.theme;
    // UI size: everything in the menus and HUD is sized in rem, so this scales it all
    const ui = { s: 82, m: 100, l: 115, xl: 130 }[settings.ui] || (isPhone() ? 88 : 100);
    document.documentElement.style.fontSize = ui + "%";
    document.body.classList.toggle("touch", window.matchMedia("(pointer: coarse)").matches);
    const sys = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    reducedMotion = settings.motion === "on" || (settings.motion === "system" && sys);
    document.body.classList.toggle("rm", reducedMotion);
    mini.classList.toggle("hidden", settings.minimap === "off");
    document.body.classList.toggle("cb", settings.cb === "on");
    if (typeof TIRES !== "undefined") { TIRES.fast.color = settings.cb === "on" ? "#ff7a00" : "#e53935"; TIRES.wet.color = settings.cb === "on" ? "#56b4e9" : "#1e88e5"; }
    if (MUS && MUS.started) { setMusicVolume(); if (MUS.lastTrack !== settings.track || (!MUS.el && !MUS.syn && musicVol() > 0)) { MUS.lastTrack = settings.track; pickMusic(true); } }
    const phone = settings.phone === "on" || (settings.phone !== "off" && isTouch() && Math.min(window.innerWidth, window.innerHeight) < 760);
    if (phone !== document.body.classList.contains("phone")) {
      document.body.classList.toggle("phone", phone);
      if (!phone && typeof setEditing === "function") setEditing(false);
      requestAnimationFrame(() => { try { if (S.screen === "lobby") sizeBoard(); } catch (e) {} });
    }
    try { localStorage.setItem("tb-settings", JSON.stringify(settings)); } catch (e) {}
  }
  let setTab = "general", rebinding = null;
  function renderSettings() {
    const body = $("setBody"); body.textContent = "";
    const tabs = document.createElement("nav"); tabs.className = "hub-tabs set-tabs"; tabs.setAttribute("role", "tablist");
    for (const [k, t] of [["general", "⚙ General"], ["assists", "🤝 Assists"], ["keys", "⌨️ Keybinds"]]) {
      const b = document.createElement("button"); b.type = "button"; b.setAttribute("role", "tab"); b.textContent = t; b.setAttribute("aria-selected", String(setTab === k));
      b.addEventListener("click", () => { setTab = k; rebinding = null; renderSettings(); }); tabs.appendChild(b);
    }
    body.appendChild(tabs);
    if (setTab === "keys") { renderKeybinds(body); return; }
    if (setTab === "assists") { const n = document.createElement("p"); n.className = "preset-note"; n.textContent = "Assists do things for you in the race. They work in every race, ranked too."; body.appendChild(n); }
    for (const x of SETTINGS.filter((y) => (y.tab || "general") === setTab)) {
      const row = document.createElement("div"); row.className = "set-row";
      const l = document.createElement("div"); const b = document.createElement("b"); b.textContent = x.label; l.appendChild(b);
      if (x.hint) { const s = document.createElement("small"); s.textContent = x.hint; l.appendChild(s); }
      if (x.range) {           // volume sliders
        const wrap = document.createElement("div"); wrap.className = "vol";
        const r = document.createElement("input"); r.type = "range"; r.min = "0"; r.max = "100"; r.step = "1"; r.value = String(settings[x.key]); r.setAttribute("aria-label", x.label);
        const out = document.createElement("span"); out.textContent = settings[x.key] + "%";
        r.addEventListener("input", () => { settings[x.key] = Number(r.value); out.textContent = r.value + "%"; applySettings(); });
        r.addEventListener("change", () => sfx("tick"));
        wrap.append(r, out); row.append(l, wrap); body.appendChild(row); continue;
      }
      const seg = document.createElement("div"); seg.className = "seg"; seg.setAttribute("role", "radiogroup"); seg.setAttribute("aria-label", x.label);
      for (const [v, t] of x.opts) {
        const o = document.createElement("button"); o.type = "button"; o.textContent = t; o.setAttribute("role", "radio");
        o.setAttribute("aria-checked", String(settings[x.key] === v));
        o.addEventListener("click", () => { settings[x.key] = v; applySettings(); renderSettings(); sfx("tick"); if (x.tab === "assists") sendAssists(); });
        seg.appendChild(o);
      }
      row.append(l, seg); body.appendChild(row);
      if (x.key === "track") {   // now playing + skip
        const np = document.createElement("div"); np.className = "set-row now-row";
        const t2 = document.createElement("div"); t2.id = "nowPlaying"; t2.textContent = MUS?.now ? `♪ ${MUS.now}` : "♪ Nothing playing yet (click anywhere to start)";
        const sk = document.createElement("button"); sk.type = "button"; sk.className = "btn"; sk.textContent = "⏭ Next song";
        sk.addEventListener("click", nextSong);
        np.append(t2, sk); body.appendChild(np);
      }
    }
  }
  function renderKeybinds(body) {
    const n = document.createElement("p"); n.className = "preset-note";
    n.textContent = rebinding ? "Press the key you want (Esc to cancel). A key that's already used swaps places." : "Click a key to change it. Number keys still pick tires and upgrade cards, and Esc still leaves a race.";
    body.appendChild(n);
    for (const [a, label] of KEY_ACTIONS) {
      const row = document.createElement("div"); row.className = "set-row";
      const l = document.createElement("div"); const b = document.createElement("b"); b.textContent = label; l.appendChild(b);
      const k = document.createElement("button"); k.type = "button"; k.className = "btn key-btn" + (rebinding === a ? " listening" : "");
      k.textContent = rebinding === a ? "Press a key..." : keyName(KEY(a)); k.setAttribute("aria-label", `${label}: ${keyName(KEY(a))}. Click to change`);
      k.addEventListener("click", () => { rebinding = rebinding === a ? null : a; renderSettings(); });
      row.append(l, k); body.appendChild(row);
    }
    const reset = document.createElement("button"); reset.type = "button"; reset.className = "btn ghost"; reset.textContent = "Reset all keys";
    reset.addEventListener("click", () => { settings.keys = { ...KEY_DEFAULTS }; rebinding = null; applySettings(); keyHints(); renderSettings(); });
    body.appendChild(reset);
  }
  // listening for a new key: grab it before anything else sees it
  window.addEventListener("keydown", (e) => {
    if (!rebinding) return;
    e.preventDefault(); e.stopImmediatePropagation();
    if (e.code !== "Escape" && !/^Digit[1-4]$/.test(e.code)) {
      const other = Object.keys(settings.keys).find((a) => a !== rebinding && settings.keys[a] === e.code);
      if (other) settings.keys[other] = KEY(rebinding);                 // swap
      settings.keys[rebinding] = e.code;
      applySettings(); keyHints(); sfx("tick");
    }
    rebinding = null; renderSettings();
  }, true);
  // the little key labels on buttons follow your keybinds
  function keyHints() {
    const set = (sel, a) => document.querySelectorAll(sel).forEach((k) => (k.textContent = keyName(KEY(a))));
    const bk = document.querySelectorAll("#boostBtn small kbd"); if (bk[0]) bk[0].textContent = keyName(KEY("boost")); if (bk[1]) bk[1].textContent = keyName(KEY("boost2"));
    set("#boxBtn kbd, #mustBox kbd", "box"); set("#photoBtn kbd", "photo"); set("#pauseBtn kbd", "pause"); set("#drsGo kbd", "drs"); set("#defendBtn kbd", "defend"); set("#laterBtn kbd", "cards");
    const lp = $("lightsSay"); if (lp && lp.querySelector("kbd")) lp.querySelector("kbd").textContent = keyName(KEY("boost"));
  }
  const setEl = $("settings");
  function openSettings() { renderSettings(); setEl.classList.remove("hidden"); }
  function closeSettings() { setEl.classList.add("hidden"); }
  document.querySelectorAll("[data-settings]").forEach((b) => b.addEventListener("click", openSettings));
  $("setClose").addEventListener("click", closeSettings);
  setEl.addEventListener("click", (e) => { if (e.target === setEl) closeSettings(); });
  applySettings();

  // ======================= Sound (made with code, no files) =======================
  let actx = null, engine = null;
  function audio() {
    if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; } }
    if (actx.state === "suspended") actx.resume();
    return actx;
  }
  // Every race sound (engines, effects, horns, the commentator) goes through this bus. Normally it's just passed
  // through; in a tunnel an echo comes up: a big concrete room (reverb) plus a slap-back off the walls.
  let BUS = null;
  function fxOut(a) {
    if (BUS && BUS.a === a) return BUS.input;
    const input = a.createGain(), conv = a.createConvolver(), wet = a.createGain(), dl = a.createDelay(1), fb = a.createGain(), slap = a.createGain();
    const len = Math.floor(a.sampleRate * 1.8), ir = a.createBuffer(2, len, a.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3); }
    conv.buffer = ir; wet.gain.value = 0; dl.delayTime.value = 0.14; fb.gain.value = 0.38; slap.gain.value = 0;
    input.connect(a.destination); input.connect(conv).connect(wet).connect(a.destination);
    input.connect(dl); dl.connect(fb).connect(dl); dl.connect(slap).connect(a.destination);
    BUS = { a, input, wet, slap, v: 0 };
    return input;
  }
  function setEcho(v) {
    if (!BUS || Math.abs(BUS.v - v) < 0.01) return; BUS.v = v;
    const t = BUS.a.currentTime; BUS.wet.gain.setTargetAtTime(v * 1.1, t, 0.12); BUS.slap.gain.setTargetAtTime(v * 0.4, t, 0.12);
  }

  // ======================= Music =======================
  // Real songs by Kevin MacLeod (incompetech.com), free to use under Creative Commons BY 3.0 as long
  // as he's credited (the game shows the credit when a song starts and in Settings). They stream from
  // the Internet Archive's copy of his library, so there are no files to upload.
  // You can add your own free-to-use songs too: public/music/music.json (see the README).
  const IA = "https://archive.org/download/Incompetech/mp3-royaltyfree/";
  const KM = { artist: "Kevin MacLeod", license: "CC BY 3.0" };
  const BUILTIN = [
    { title: "Aces High", file: "Aces High.mp3", mood: "race" },
    { title: "Basic Implosion", file: "Basic Implosion.mp3", mood: "race" },
    { title: "Bit Shift", file: "Bit Shift.mp3", mood: "race" },
    { title: "Blip Stream", file: "BlipStream.mp3", mood: "race" },
    { title: "Black Vortex", file: "BlackVortex.mp3", mood: "race" },
    { title: "Big Rock", file: "Big Rock.mp3", mood: "race" },
    { title: "Action", file: "Action.mp3", mood: "race" },
    { title: "Back on Track", file: "Back on Track.mp3", mood: "race" },
    { title: "Blown Away", file: "BlownAway.mp3", mood: "race" },
    { title: "Backed Vibes (Clean)", file: "Backed Vibes Clean.mp3", mood: "menu" },
    { title: "Big Mojo", file: "Big Mojo.mp3", mood: "menu" },
    { title: "Bass Walker", file: "Bass Walker.mp3", mood: "menu" },
    { title: "Airport Lounge", file: "Airport Lounge.mp3", mood: "menu" },
    { title: "Beachfront Celebration", file: "Beachfront Celebration.mp3", mood: "results" },
    { title: "At Launch", file: "At Launch.mp3", mood: "results" },
  ].map((x) => ({ ...KM, ...x, url: "music/km/" + encodeURIComponent(x.file), alt: IA + encodeURIComponent(x.file) }));   // through our server first, archive.org directly if that fails
  var MUS = { el: null, list: BUILTIN.slice(), cur: null, started: false, now: "", recent: [] };
  fetch("music/music.json").then((r) => (r.ok ? r.json() : [])).then((list) => {
    if (!Array.isArray(list)) return;
    for (const x of list) if (x && x.file) MUS.list.push({ title: String(x.title || x.file), artist: String(x.artist || ""), license: String(x.license || ""), mood: x.mood || "any", url: "music/" + String(x.file).replace(/^\/+/, "") });
  }).catch(() => {});
  // ---- built-in soundtrack: made live in the browser, so there's music even when the songs can't
  // stream (archive.org down or slow, or a school/work network that blocks it) ----
  const SYN_MOODS = {
    race: { bpm: 148, prog: [[0, 3], [-4, 3], [-7, 3], [-2, 3]], minor: true, drums: "race" },
    menu: { bpm: 96, prog: [[0, 7], [5, 7], [-3, 3], [-5, 7]], minor: false, drums: "chill" },
    results: { bpm: 118, prog: [[0, 4], [5, 4], [7, 4], [5, 4]], minor: false, drums: "party" },
  };
  function synthNoise(a) {
    if (!MUS.noiseBuf) { const n = a.sampleRate * 0.5; MUS.noiseBuf = a.createBuffer(1, n, a.sampleRate); const d = MUS.noiseBuf.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; }
    const s = a.createBufferSource(); s.buffer = MUS.noiseBuf; return s;
  }
  function synthNote(a, out, t, f, dur, type, vol, cut = 0) {
    const o = a.createOscillator(), g = a.createGain(); o.type = type; o.frequency.setValueAtTime(f, t);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    if (cut) { const fl = a.createBiquadFilter(); fl.type = "lowpass"; fl.frequency.value = cut; o.connect(fl); fl.connect(g); } else o.connect(g);
    g.connect(out); o.start(t); o.stop(t + dur + 0.05);
  }
  function synthDrum(a, out, t, kind, vol) {
    if (kind === "kick") { const o = a.createOscillator(), g = a.createGain(); o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3); o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.32); return; }
    const n = synthNoise(a), f = a.createBiquadFilter(), g = a.createGain(), len = kind === "snare" ? 0.16 : 0.04;
    f.type = kind === "snare" ? "bandpass" : "highpass"; f.frequency.value = kind === "snare" ? 1800 : 7000;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    n.connect(f); f.connect(g); g.connect(out); n.start(t, Math.random() * 0.3); n.stop(t + len + 0.02);
  }
  function stopSynth() { if (MUS.syn) { clearInterval(MUS.syn.timer); const g = MUS.syn.out; try { g.gain.setTargetAtTime(0, g.context.currentTime, 0.15); setTimeout(() => g.disconnect(), 800); } catch (e) {} MUS.syn = null; } }
  function playSynth(mood) {
    const a = audio(); if (!a) return;
    if (MUS.syn && MUS.syn.mood === mood) return;
    stopSynth();
    const M = SYN_MOODS[mood] || SYN_MOODS.menu, out = a.createGain(); out.gain.value = Math.min(1, musicVol()) * 0.55; out.connect(a.destination);
    const root = 45 + Math.floor(Math.random() * 7), hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
    const scale = M.minor ? [0, 2, 3, 5, 7, 8, 10] : [0, 2, 4, 5, 7, 9, 11];
    const arp = Array.from({ length: 4 }, () => Array.from({ length: 8 }, () => Math.floor(Math.random() * 5)));   // a few riffs per song
    const syn = { mood, out, step: 0, next: a.currentTime + 0.1, stepLen: 60 / M.bpm / 4 };
    syn.timer = setInterval(() => {
      while (syn.next < a.currentTime + 0.25) {
        const t = syn.next, st = syn.step, bar = Math.floor(st / 16), i = st % 16, [chord, third] = M.prog[bar % M.prog.length];
        const r = root + chord, part = Math.floor(bar / 8) % 4;                 // the song moves through 4 parts
        // drums
        if (M.drums === "race") { if (i % 4 === 0) synthDrum(a, out, t, "kick", 0.9); if (i === 4 || i === 12) synthDrum(a, out, t, "snare", 0.35); if (i % 2 === 0) synthDrum(a, out, t, "hat", 0.12); }
        else if (M.drums === "party") { if (i % 4 === 0) synthDrum(a, out, t, "kick", 0.8); if (i % 4 === 2) synthDrum(a, out, t, "hat", 0.16); if (i === 4 || i === 12) synthDrum(a, out, t, "snare", 0.25); }
        else { if (i === 0 || i === 10) synthDrum(a, out, t, "kick", 0.6); if (i === 8) synthDrum(a, out, t, "snare", 0.18); if (i % 4 === 2) synthDrum(a, out, t, "hat", 0.07); }
        // bass
        if (M.drums === "race" ? i % 2 === 0 : i % 4 === 0 || (M.drums === "party" && i % 4 === 3)) synthNote(a, out, t, hz(r - 12 + (i % 8 === 6 ? 12 : 0)), syn.stepLen * 1.8, "sawtooth", 0.16, 700);
        // pad on each bar
        if (i === 0) for (const k of [0, third, 7]) synthNote(a, out, t, hz(r + 12 + k), syn.stepLen * 15, "triangle", 0.045);
        // lead arpeggio (rests in the first part, so songs build up)
        if (part > 0 && (M.drums === "race" || i % 2 === 0)) {
          const deg = arp[(bar + part) % 4][(i >> (M.drums === "race" ? 0 : 1)) % 8], n = r + 24 + scale[(deg + (third === 3 ? 0 : 2)) % 7];
          synthNote(a, out, t, hz(n), syn.stepLen * 0.9, "square", part === 2 ? 0.045 : 0.03, 2600);
        }
        syn.step++; syn.next += syn.stepLen;
      }
    }, 60);
    MUS.syn = syn;
    MUS.now = `Scribble GP built-in ${mood} beat`;
    const np = document.getElementById("nowPlaying"); if (np) np.textContent = "♪ " + MUS.now + " (the online songs can't load right now)";
  }
  function stopMusic() { stopSong(); stopSynth(); MUS.cur = null; }
  function stopSong() { if (MUS.el) { const e = MUS.el; MUS.el = null; clearTimeout(e._slow); clearTimeout(e._fill); e.pause(); e.removeAttribute("src"); try { e.load(); } catch (x) {} } }
  function setMusicVolume() { if (MUS.el) MUS.el.volume = Math.max(0, Math.min(1, musicVol())); if (MUS.syn) MUS.syn.out.gain.value = Math.min(1, musicVol()) * 0.55; if (musicVol() <= 0) stopMusic(); }
  // A song didn't load (or stalled): try its other address, then another song. Songs that failed are
  // skipped for the rest of the visit. 3 misses in a row = the network can't get songs right now, so the
  // built-in soundtrack plays (and keeps playing until a real song is actually going).
  MUS.dead = new Set(); MUS.miss = 0;
  function songFailed(el2) {
    if (MUS.el !== el2 || el2._failed) return;
    el2._failed = true; clearTimeout(el2._slow);
    const tr = el2._track;
    if (!el2._alt && tr.alt) { playTrack(tr, true); return; }
    MUS.dead.add(tr.url); MUS.miss++;
    stopSong(); MUS.cur = null;
    if (MUS.miss >= 3) { MUS.offline = true; MUS.offAt = Date.now(); }
    pickMusic(true);
  }
  function playTrack(tr, alt = false) {
    if (musicVol() <= 0) { stopMusic(); return; }
    stopSong();
    const el2 = new Audio(); el2._track = tr; el2._alt = alt;
    el2.preload = "auto"; el2.src = alt ? tr.alt : tr.url; el2.volume = Math.min(1, musicVol());
    el2.addEventListener("ended", () => { if (MUS.el === el2) pickMusic(true); });
    el2.addEventListener("error", () => songFailed(el2));
    // still not playing after 15 seconds (or stuck that long mid-song) counts as a miss too
    const arm = () => { clearTimeout(el2._slow); el2._slow = setTimeout(() => { if (MUS.el === el2 && !el2.ended) songFailed(el2); }, 15000); };
    arm();
    // slow to start: fill the gap with the built-in beat (it stops the moment the song starts)
    el2._fill = setTimeout(() => { if (MUS.el === el2 && !el2._playing && musicVol() > 0) playSynth(moodNow()); }, 5000);
    el2.addEventListener("waiting", arm); el2.addEventListener("stalled", arm);
    el2.addEventListener("playing", () => {
      clearTimeout(el2._slow); clearTimeout(el2._fill); el2._playing = true; if (MUS.el !== el2) return;
      MUS.miss = 0; MUS.offline = false; stopSynth();      // a real song is going: the built-in beat can stop now
      MUS.now = `${tr.title} · ${tr.artist}${tr.license ? " (" + tr.license + ")" : ""}`;
      const np = document.getElementById("nowPlaying"); if (np) np.textContent = "♪ " + MUS.now;
      if (S.screen !== "race" && !el2._shown) { el2._shown = true; popup(`♪ ${tr.title} · ${tr.artist}`); }
    });
    el2.play().catch((e) => { if (e && e.name === "NotAllowedError" && MUS.el === el2) { clearTimeout(el2._slow); stopSong(); MUS.cur = null; MUS.started = false; } });
    MUS.el = el2; MUS.cur = tr;
    if (!alt) MUS.recent = [tr.url, ...MUS.recent].slice(0, 5);
    if (!MUS.syn) { const np = document.getElementById("nowPlaying"); if (np) np.textContent = `♪ Loading ${tr.title}...`; }
  }
  const moodNow = () => settings.track === "race" ? "race" : S.screen === "race" ? "race" : S.screen === "results" ? "results" : "menu";
  // which song fits right now (menu / race / results), never the same one twice in a row
  function pickMusic(force) {
    if (!MUS.started) return;
    if (musicVol() <= 0) { stopMusic(); return; }
    const mood = moodNow();
    // songs were down: try them again every 3 minutes (the beat keeps playing until one really starts)
    if (MUS.offline && Date.now() - (MUS.offAt || 0) > 180e3) { MUS.offline = false; MUS.miss = 0; MUS.dead.clear(); force = true; }
    const pool = MUS.list.filter((x) => (settings.track === "shuffle" || x.mood === mood || x.mood === "any") && !MUS.dead.has(x.url));
    // already playing (or still loading) something that fits: leave it alone
    if (!force && MUS.el && MUS.cur && pool.includes(MUS.cur)) return;
    if (!force && !MUS.el && MUS.syn && MUS.syn.mood === mood) return;
    if (MUS.offline || !pool.length) { stopSong(); MUS.cur = null; playSynth(mood); return; }
    const fresh = pool.filter((x) => !MUS.recent.includes(x.url) && x !== MUS.cur);
    const from = fresh.length ? fresh : pool.filter((x) => x !== MUS.cur).length ? pool.filter((x) => x !== MUS.cur) : pool;
    // songs take a moment to load: keep the built-in beat going meanwhile if it's already on
    playTrack(from[Math.floor(Math.random() * from.length)]);
  }
  // ⏭ Next song: a different song right away. If songs can't load right now, try them again anyway (the
  // built-in beat keeps playing until one actually starts, so there's no silence), else a new built-in beat.
  function nextSong() {
    const now = Date.now(); if (now - (MUS.lastSkip || 0) < 500) return; MUS.lastSkip = now;
    MUS.started = true; audio();
    if (MUS.offline) {
      MUS.offline = false; MUS.miss = 0; MUS.dead.clear();
      const mood = MUS.syn?.mood; if (MUS.syn) { stopSynth(); playSynth(mood || "menu"); }
    }
    pickMusic(true);
  }
  setInterval(() => { if (MUS.started && MUS.offline) pickMusic(false); }, 60e3);
  // browsers only allow sound after you click or press something
  const startMusic = () => { if (MUS.started) return; MUS.started = true; audio(); pickMusic(true); };
  window.addEventListener("pointerdown", startMusic, { capture: true });
  window.addEventListener("keydown", startMusic, { capture: true });
  function tone(freq, dur, type = "square", vol = 0.2, slide = 0, delay = 0) {
    const v = fxVol() * vol; if (!v) return;
    const a = audio(); if (!a) return;
    const t0 = a.currentTime + delay;
    const o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t0 + dur);
    g.gain.setValueAtTime(v, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(fxOut(a)); o.start(t0); o.stop(t0 + dur + 0.02);
  }
  function sfx(name) {
    if (name === "light") tone(440, 0.16, "square", 0.18);
    else if (name === "go") tone(880, 0.45, "square", 0.22);
    else if (name === "jump") { tone(140, 0.5, "sawtooth", 0.25, -60); }
    else if (name === "pass") { tone(660, 0.08, "triangle", 0.2); tone(990, 0.1, "triangle", 0.2, 0, 0.07); }
    else if (name === "lost") { tone(520, 0.1, "triangle", 0.18); tone(360, 0.14, "triangle", 0.18, 0, 0.08); }
    else if (name === "level") [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.14, "triangle", 0.2, 0, i * 0.08));
    else if (name === "pit") tone(300, 0.35, "sawtooth", 0.12, 500);
    else if (name === "win") [523, 659, 784, 1046, 784, 1046].forEach((f, i) => tone(f, 0.2, "triangle", 0.22, 0, i * 0.12));
    else if (name === "tick") tone(1200, 0.03, "square", 0.08);
    else if (name === "warn") [880, 660, 880, 660].forEach((f, i) => tone(f, 0.12, "square", 0.16, 0, i * 0.14));
    else if (name === "card") tone(700, 0.12, "triangle", 0.18, 300);
    else if (name === "drs") { tone(400, 0.25, "sawtooth", 0.1, 900); tone(1600, 0.12, "triangle", 0.12, 0, 0.05); }
  }
  // Engine: a growl (two saws an octave apart through a filter that opens with speed) that climbs through
  // "gears", a rushing whoosh while your boost is firing, and a faint hum from the cars around you.
  let noiseBuf = null;
  const noise = (a) => { if (!noiseBuf) { noiseBuf = a.createBuffer(1, a.sampleRate * 2, a.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; } const n = a.createBufferSource(); n.buffer = noiseBuf; n.loop = true; return n; };
  // engine sounds to pick from (Settings): same "gears", a different voice
  const ENGINES = {
    on: { wave: "sawtooth", wave2: "sawtooth", detune: 7, q: 4, pitch: 1, sub: 0.5, bright: 1 },
    v8: { wave: "sawtooth", wave2: "square", detune: 14, q: 6, pitch: 0.62, sub: 0.5, bright: 0.65 },
    v12: { wave: "sawtooth", wave2: "sawtooth", detune: 4, q: 3, pitch: 1.7, sub: 0.5, bright: 1.7 },
    electric: { wave: "sine", wave2: "triangle", detune: 2, q: 9, pitch: 4.2, sub: 1.5, bright: 2.4 },
  };
  // the crowd: filtered noise, a murmur all race that swells for the big moments
  let crowd = null;
  const crowdVol = () => (Number(settings.vMaster) / 100) * (Number(settings.vCrowd ?? 60) / 100);
  function crowdOn(on) {
    const a = on && crowdVol() > 0 ? audio() : actx; if (!a) return;
    if (!crowd && on && crowdVol() > 0) {
      const n = noise(a), f = a.createBiquadFilter(), f2 = a.createBiquadFilter(), g = a.createGain();
      f.type = "bandpass"; f.frequency.value = 1100; f.Q.value = 0.5; f2.type = "lowpass"; f2.frequency.value = 2600; g.gain.value = 0;
      n.connect(f).connect(f2).connect(g).connect(fxOut(a)); n.start(); crowd = { n, g, f };
    }
    if (crowd) crowd.g.gain.setTargetAtTime(on ? 0.018 * crowdVol() : 0, a.currentTime, 0.8);
  }
  function crowdRoar(k = 1) {
    if (!crowd || !actx || crowdVol() <= 0) return;
    const t = actx.currentTime, g = crowd.g.gain, base = 0.018 * crowdVol();
    g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(base + 0.09 * k * crowdVol(), t + 0.35); g.setTargetAtTime(base, t + 0.9, 1.1);
    crowd.f.frequency.cancelScheduledValues(t); crowd.f.frequency.setValueAtTime(1500, t); crowd.f.frequency.setTargetAtTime(1100, t + 0.6, 1);
  }
  // A crowd: hundreds of quiet voices together (a vowel-shaped hum, each part swelling on its own) plus a few you can
  // just pick out going "yeah!". Only now and then: when something happens beside a stand, a win, a photo finish.
  function cheer(k = 1, vol = 1) {
    const a = actx; if (!a || crowdVol() <= 0 || vol <= 0.03) return;
    const t0 = a.currentTime; if (t0 - (cheer.last || 0) < 3) return; cheer.last = t0;
    const out = fxOut(a), V = crowdVol() * Math.min(1, vol) * Math.min(1.3, k), dur = 1.6 + k * 0.9;
    const bed = a.createGain(); bed.gain.setValueAtTime(0, t0); bed.gain.linearRampToValueAtTime(0.045 * V, t0 + 0.45); bed.gain.setTargetAtTime(0, t0 + dur * 0.6, dur * 0.28); bed.connect(out);
    for (const [f, q] of [[480, 3], [760, 4], [1120, 5], [2300, 7]]) {
      const n = noise(a), bp = a.createBiquadFilter(), g = a.createGain(), lfo = a.createOscillator(), lg = a.createGain();
      bp.type = "bandpass"; bp.frequency.value = f * (0.9 + Math.random() * 0.2); bp.Q.value = q; g.gain.value = 0.55;
      lfo.frequency.value = 2.5 + Math.random() * 4; lg.gain.value = 0.3; lfo.connect(lg).connect(g.gain);
      n.connect(bp).connect(g).connect(bed); n.start(t0); n.stop(t0 + dur + 1.5); lfo.start(t0); lfo.stop(t0 + dur + 1.5);
    }
    const vowels = [[700, 1200], [530, 1850], [350, 900]];                     // "ah", "eh", "oo"
    const voices = Math.round(10 + 14 * Math.min(1, k));
    for (let v = 0; v < voices; v++) {
      const st = t0 + 0.1 + Math.random() * 0.9, len = 0.3 + Math.random() * 0.45, f0 = Math.random() < 0.5 ? 120 + Math.random() * 90 : 210 + Math.random() * 140, [F1, F2] = vowels[v % 3];
      const o = a.createOscillator(), f = a.createBiquadFilter(), f2 = a.createBiquadFilter(), g = a.createGain(), m = a.createGain();
      o.type = "sawtooth"; o.frequency.setValueAtTime(f0, st); o.frequency.linearRampToValueAtTime(f0 * (1.2 + Math.random() * 0.25), st + len * 0.4); o.frequency.linearRampToValueAtTime(f0, st + len);
      f.type = "bandpass"; f.frequency.value = F1; f.Q.value = 5; f2.type = "bandpass"; f2.frequency.value = F2; f2.Q.value = 7;
      o.connect(f).connect(m); o.connect(f2).connect(m); m.connect(g).connect(out);
      g.gain.setValueAtTime(0, st); g.gain.linearRampToValueAtTime(0.014 * V, st + 0.06); g.gain.setTargetAtTime(0, st + len * 0.6, len * 0.2);
      o.start(st); o.stop(st + len + 0.5);
    }
  }
  // something happened at (x, y): the stand next to it (if any) jumps up, and you hear them if the camera's close
  function standEvent(x, y, k = 1) {
    if (!S.track || x === undefined) return;
    let best = null, bd = 1e12;
    for (const s2 of autoStands(S.track)) { const d = (s2.x - x) ** 2 + (s2.y - y) ** 2; if (d < bd) { bd = d; best = s2; } }
    if (!best || bd > 650 * 650) return;
    best.hype = performance.now();
    const fc = (S.camTarget && S.cars?.get(S.camTarget)) || S.cars?.get(S.myCar); if (!fc) return;
    const dc = Math.hypot(fc.x - best.x, fc.y - best.y);
    if (dc < 1100) cheer(k, 1 - dc / 1100);
  }
  // your tyres: a squeal when the car's sliding, a brrrrr over the kerbs (faster the faster you go)
  let tyreSnd = null;
  function tyreSound(c, on) {
    const want = on && !!c && fxVol() > 0, a = want ? audio() : actx; if (!a) return;
    if (!tyreSnd && want) {
      const so = a.createOscillator(), wob = a.createOscillator(), wg = a.createGain(), sn = noise(a), sbp = a.createBiquadFilter(), sg = a.createGain();
      so.type = "triangle"; so.frequency.value = 1750; wob.frequency.value = 7; wg.gain.value = 70; wob.connect(wg).connect(so.frequency);
      sbp.type = "bandpass"; sbp.frequency.value = 2400; sbp.Q.value = 9; sg.gain.value = 0;
      const sm = a.createGain(); sm.gain.value = 0.35; so.connect(sm).connect(sg); sn.connect(sbp).connect(sg); sg.connect(fxOut(a));
      const ko = a.createOscillator(), klp = a.createBiquadFilter(), kg = a.createGain();
      ko.type = "square"; ko.frequency.value = 30; klp.type = "lowpass"; klp.frequency.value = 260; kg.gain.value = 0;
      ko.connect(klp).connect(kg).connect(fxOut(a));
      so.start(); wob.start(); sn.start(); ko.start(); tyreSnd = { sg, so, kg, ko };
    }
    if (!tyreSnd) return;
    const t = a.currentTime, sp = want ? Math.abs(c.speed || 0) : 0;
    const slide = want && !c.ghost && (c.slide || (c.crashed && sp > 40)) && sp > 60 && c.surf !== 2 && c.surf !== 3;
    tyreSnd.sg.gain.setTargetAtTime(slide ? 0.05 * fxVol() * Math.min(1, sp / 300) : 0, t, slide ? 0.04 : 0.12);
    tyreSnd.so.frequency.setTargetAtTime(1500 + Math.min(600, sp * 0.8), t, 0.1);
    const kerb = want && c.surf === 1 && sp > 60;
    tyreSnd.kg.gain.setTargetAtTime(kerb ? 0.07 * fxVol() * Math.min(1, sp / 350) : 0, t, 0.03);
    tyreSnd.ko.frequency.setTargetAtTime(18 + sp * 0.07, t, 0.05);
  }
  // a snare drumroll while the start lights come on, building up until they go out
  let roll = null;
  function drumroll(on) {
    const a = on ? audio() : actx; if (!a) return;
    if (on && !roll && fxVol() > 0) {
      const n = noise(a), bp = a.createBiquadFilter(), am = a.createGain(), lfo = a.createOscillator(), lg = a.createGain(), g = a.createGain(), t = a.currentTime;
      bp.type = "bandpass"; bp.frequency.value = 1900; bp.Q.value = 0.9; am.gain.value = 0.5; lfo.type = "square"; lfo.frequency.value = 15; lg.gain.value = 0.5;
      lfo.connect(lg).connect(am.gain); g.gain.setValueAtTime(0.012 * fxVol(), t); g.gain.linearRampToValueAtTime(0.07 * fxVol(), t + 5);
      n.connect(bp).connect(am).connect(g).connect(fxOut(a)); n.start(); lfo.start(); roll = { n, lfo, g };
    } else if (!on && roll) {
      const r = roll, t = a.currentTime; roll = null;
      r.g.gain.cancelScheduledValues(t); r.g.gain.setValueAtTime(r.g.gain.value, t); r.g.gain.linearRampToValueAtTime(0, t + 0.06);
      r.n.stop(t + 0.1); r.lfo.stop(t + 0.1);
    }
  }
  // horns (H): synthesized, quieter the further the car is from your screen
  function hornSound(type, vol = 1) {
    const v = 0.16 * vol; if (v < 0.01) return;
    if (type === "truck") { tone(150, 0.7, "sawtooth", v, 0); tone(190, 0.7, "sawtooth", v * 0.8, 0); }
    else if (type === "clown") { tone(500, 0.18, "square", v, 400); tone(900, 0.22, "square", v, -500, 0.2); }
    else if (type === "air") { tone(440, 0.8, "sawtooth", v, 0); tone(554, 0.8, "sawtooth", v * 0.8, 0); tone(659, 0.8, "sawtooth", v * 0.6, 0); }
    else if (type === "tune") { [392, 392, 392, 523, 659].forEach((f, i) => tone(f, i === 4 ? 0.35 : 0.12, "square", v * 0.8, 0, i * 0.15)); }
    else if (type === "bike") { tone(1800, 0.12, "triangle", v, 0); tone(1800, 0.2, "triangle", v, 0, 0.16); }
    else { tone(410, 0.35, "square", v * 0.8, 0); tone(520, 0.35, "square", v * 0.8, 0); }
  }
  function engineSound(speed, on, boost = false, near = null) {
    const want = on && settings.engine !== "off" && fxVol() > 0;
    const E = ENGINES[settings.engine] || ENGINES.on;
    if (engine && engine.kind !== settings.engine) { try { engine.o1.stop(); engine.o2.stop(); engine.oo.stop(); engine.g.disconnect(); engine.bg.disconnect(); engine.og.disconnect(); } catch (e) {} engine = null; }
    const a = want ? audio() : actx;
    if (!a) return;
    if (!engine && want) {
      const o1 = a.createOscillator(), o2 = a.createOscillator(), f = a.createBiquadFilter(), g = a.createGain();
      o1.type = E.wave; o2.type = E.wave2; o2.detune.value = E.detune; f.type = "lowpass"; f.Q.value = E.q; g.gain.value = 0;
      const g2 = a.createGain(); g2.gain.value = 0.55; o2.connect(g2).connect(f); o1.connect(f); f.connect(g).connect(fxOut(a));
      // boost: filtered noise, swept up while it's on
      const n = noise(a), bf = a.createBiquadFilter(), bg = a.createGain(); bf.type = "bandpass"; bf.Q.value = 1.2; bf.frequency.value = 900; bg.gain.value = 0;
      n.connect(bf).connect(bg).connect(fxOut(a)); n.start();
      // other cars: one soft triangle hum, louder the closer they are
      const oo = a.createOscillator(), of = a.createBiquadFilter(), og = a.createGain(); oo.type = "triangle"; of.type = "lowpass"; of.frequency.value = 700; og.gain.value = 0;
      oo.connect(of).connect(og).connect(fxOut(a));
      o1.start(); o2.start(); oo.start();
      engine = { o1, o2, f, g, bf, bg, oo, og, wasBoost: false, kind: settings.engine };
    }
    if (!engine) return;
    const t = a.currentTime, v = Math.max(0, speed);
    // 5 "gears": the pitch climbs within each one, then drops a little at the shift
    const gear = Math.min(4, Math.floor(v / 190)), inGear = (v - gear * 190) / 190;
    const base = 48 + gear * 14 + inGear * (70 - gear * 6) + (boost ? 12 : 0);
    engine.o1.frequency.setTargetAtTime(base * E.pitch, t, 0.06); engine.o2.frequency.setTargetAtTime(base * E.pitch * E.sub, t, 0.06);
    engine.f.frequency.setTargetAtTime((350 + v * 1.4 + (boost ? 500 : 0)) * E.bright, t, 0.1);
    engine.g.gain.setTargetAtTime(want ? (0.03 + 0.03 * Math.min(1, v / 600)) * fxVol() : 0, t, 0.12);
    engine.bf.frequency.setTargetAtTime(boost ? 1400 + v * 1.6 : 700, t, 0.15);
    engine.bg.gain.setTargetAtTime(want && boost ? 0.075 * fxVol() : 0, t, boost ? 0.05 : 0.25);
    if (want && boost && !engine.wasBoost) { tone(180, 0.35, "sawtooth", 0.12, 520); tone(90, 0.25, "square", 0.1, -40); }   // the kick when it lights
    engine.wasBoost = want && boost;
    const nv = near ? Math.min(1, near.k) : 0;
    engine.oo.frequency.setTargetAtTime(52 + (near ? near.speed : 0) * 0.16, t, 0.12);
    engine.og.gain.setTargetAtTime(want ? 0.03 * nv * fxVol() : 0, t, 0.2);
  }
  window.addEventListener("pointerdown", () => audio(), { once: true });

  // ======================= Car drawing (with liveries) =======================
  function darken(hex, k) {
    const n = parseInt(hex.slice(1), 16);
    return `rgb(${Math.round(((n >> 16) & 255) * k)},${Math.round(((n >> 8) & 255) * k)},${Math.round((n & 255) * k)})`;
  }
  function rrect(c, x, y, w, h, r) {
    c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  }
  // Painted designs: 24 x 12 pixels, each a palette colour (0-f) or "." for see-through.
  const DW = 24, DH = 12;
  const PAINT = ["#ffffff", "#111111", "#e53935", "#fb8c00", "#ffcc1f", "#43a047", "#00acc1", "#1e88e5", "#8e24aa", "#ec407a", "#6d4c41", "#9e9e9e", "#ff7043", "#c0ca33", "#90caf9", "#00e5ff"];
  const designCache = new Map();
  function designCanvas(str) {
    if (!str || str.length !== DW * DH) return null;
    let cv = designCache.get(str); if (cv) return cv;
    cv = document.createElement("canvas"); cv.width = DW; cv.height = DH;
    const c = cv.getContext("2d");
    for (let i = 0; i < str.length; i++) { const v = str[i]; if (v === ".") continue; c.fillStyle = PAINT[parseInt(v, 16)]; c.fillRect(i % DW, Math.floor(i / DW), 1, 1); }
    if (designCache.size > 60) designCache.delete(designCache.keys().next().value);
    designCache.set(str, cv); return cv;
  }
  // ---- animated store looks (underglow, flames, helmets, rims, number plates) ----
  const DISCO = ["#ff2bd6", "#22e6ff", "#ffe066", "#39ff88", "#ff6a1f"];
  function glowLook(g, t, hue) {
    switch (g) {
      case "rainbow": return [`hsl(${hue},100%,60%)`, 0.55];
      case "galaxy": return [`hsl(${250 + 40 * Math.sin(t * 1.5)},95%,62%)`, 0.55];
      case "aurora": return [`hsl(${150 + 60 * Math.sin(t)},95%,58%)`, 0.55];
      case "heartbeat": { const ph = t % 1.1, b = Math.exp(-((ph - 0.1) ** 2) / 0.003) + 0.8 * Math.exp(-((ph - 0.32) ** 2) / 0.003); return ["#ff2050", 0.2 + 0.65 * b]; }
      case "lightning": { const f = Math.sin(t * 37) > 0.93 || Math.sin(t * 23 + 1) > 0.97; return [f ? "#ffffff" : "#4f8cff", f ? 0.95 : 0.4]; }
      case "ocean": return [`hsl(${190 + 22 * Math.sin(t * 2)},90%,${50 + 8 * Math.sin(t * 3.1)}%)`, 0.5 + 0.1 * Math.sin(t * 2)];
      case "disco": return [DISCO[Math.floor(t * 4) % DISCO.length], 0.6];
      case "supernova": return [`hsl(${42 + 12 * Math.sin(t * 7)},100%,${68 + 18 * Math.sin(t * 3.3)}%)`, 0.8];
      case "sunsetG": return [`hsl(${(330 + 60 * (0.5 + 0.5 * Math.sin(t * 1.2))) % 360},100%,58%)`, 0.55];
      case "wildfire": return [`hsl(${12 + 26 * Math.abs(Math.sin(t * 13))},100%,55%)`, 0.5 + 0.2 * Math.abs(Math.sin(t * 17))];
      case "candle": return [`hsl(${32 + 8 * Math.sin(t * 9)},100%,${55 + 6 * Math.sin(t * 23)}%)`, 0.4 + 0.18 * Math.abs(Math.sin(t * 7.3) * Math.sin(t * 11.1))];
      case "witching": { const ph = (Math.sin(t * 1.6) + 1) / 2, flick = Math.sin(t * 31) > 0.9; return [flick ? "#39ff14" : `hsl(${24 + ph * 250},100%,${52 + 8 * ph}%)`, flick ? 0.85 : 0.55 + 0.15 * Math.sin(t * 4)]; }   // MYTHIC (Haunted)
      default: return [g, 0.55];
    }
  }
  function flameLook(f, hue) {
    const t = performance.now() / 1000;
    switch (f) {
      case "rainbow": return `hsl(${hue},100%,58%)`;
      case "plasma": return `hsl(${Math.random() < 0.5 ? 285 : 190},100%,62%)`;
      case "ghost": return `rgba(215,240,255,${0.3 + 0.35 * Math.random()})`;
      case "toxic": return `hsl(${85 + 25 * Math.sin(t * 11)},100%,55%)`;
      case "hellfire": return Math.random() < 0.5 ? "#ff2a00" : "#ffc400";
      case "horizon": return Math.random() < 0.45 ? "#1a0b2e" : `hsl(${270 + 25 * Math.sin(t * 8)},100%,66%)`;
      case "possessed": return Math.random() < 0.5 ? `rgba(120,255,140,${0.45 + 0.4 * Math.random()})` : `hsl(${275 + 20 * Math.sin(t * 9)},100%,${55 + 15 * Math.random()}%)`;   // MYTHIC (Haunted)
      default: return f || "#3aa0ff";
    }
  }
  function rimLook(r, hue) {
    if (r === "rainbow") return `hsl(${(hue * 2) % 360},100%,60%)`;
    if (r === "neonpulse") return `hsl(305,100%,${50 + 22 * Math.sin(performance.now() / 160)}%)`;
    return r;
  }
  function helmetLook(h, hue) {
    const t = performance.now() / 1000;
    if (h === "rainbow") return `hsl(${hue},90%,60%)`;
    if (h === "pulse") return `hsl(190,100%,${45 + 22 * Math.sin(t * 5)}%)`;
    if (h === "galaxyH") return `hsl(${260 + 40 * Math.sin(t * 1.5)},85%,${50 + 10 * Math.sin(t * 3)}%)`;
    return h || "#f5f5f5";
  }
  // Multiclass racing: the two kinds of car (the server has the real numbers, in CAR_CLASSES)
  const CLASSES = {
    hyper: { name: "Hyper", icon: "🔴", col: "#ff2d55", short: "HY", note: "Much faster everywhere: top speed, cornering, braking. Normal tyre wear and pit stops.",
      bars: [["Top speed", 1], ["Cornering", 1], ["Tyre life", 0.55], ["Pit stops", 0.55], ["Toughness", 0.45]] },
    gt: { name: "GT3", icon: "🟢", col: "#22c55e", short: "GT3", note: "A boxy GT3 racer: a lot slower, but tough, its tyres last longer, quicker pit stops, boost refills faster. Watch your mirrors!",
      bars: [["Top speed", 0.6], ["Cornering", 0.65], ["Tyre life", 0.9], ["Pit stops", 0.8], ["Toughness", 0.95]] },
  };
  function drawClassKit(c, car, X, L, Wd, open) {          // class markings, so you can tell them apart at a glance
    if (car.cls === "gt") {
      c.fillStyle = "#22c55e"; c.fillRect(-L * 0.2, -Wd / 2, 10, 2.4); c.fillRect(-L * 0.2, Wd / 2 - 2.4, 10, 2.4);   // green door panels
      if (!open) { c.fillStyle = darken(car.color, 0.5); c.fillRect(3, -Wd / 2 - 3, 3, 2.2); c.fillRect(3, Wd / 2 + 0.8, 3, 2.2); }    // mirrors
    } else if (car.cls === "hyper") {
      c.save(); c.shadowColor = "#ff2d55"; c.shadowBlur = 6; c.fillStyle = "#ff2d55";
      c.fillRect(-L * 0.4, -Wd / 2 + 0.5, L * 0.66, 1.5); c.fillRect(-L * 0.4, Wd / 2 - 2, L * 0.66, 1.5);              // glowing LED strips
      c.beginPath(); c.moveTo(L / 2 + 0.5, -4); c.lineTo(L / 2 + 4, 0); c.lineTo(L / 2 + 0.5, 4); c.fill(); c.restore(); // splitter
      if (!open) { c.strokeStyle = "rgba(10,10,14,0.85)"; c.lineWidth = 1.8; c.beginPath(); c.moveTo(-7, 0); c.lineTo(-L / 2 + 1, 0); c.stroke(); }   // shark fin
    }
  }
  function drawCar(c, car, x, y, heading, scale, opts = {}) {
    const L = CAR_LEN, Wd = CAR_WID, X = car.extras || {};
    const hueNow = (performance.now() / 8) % 360;
    c.save(); c.translate(x, y); c.rotate(heading); c.scale(scale, scale);
    if (opts.aura) {                         // super rare card: a glowing ring with sparks orbiting the car
      const t = performance.now() / 1000, pulse = 0.5 + 0.5 * Math.sin(t * 4), myth = opts.aura === "mythic";
      const col = (k) => myth ? `hsl(${(hueNow * 2 + k * 60) % 360},100%,62%)` : opts.aura === "legendary" ? "#ffc21f" : "#c77dff";
      c.save(); c.globalAlpha = 0.45 + 0.3 * pulse; c.shadowColor = col(0); c.shadowBlur = 16 + 12 * pulse; c.strokeStyle = col(0); c.lineWidth = myth ? 3.5 : 2.5;
      c.beginPath(); c.ellipse(0, 0, L * 0.72 + 3 * pulse, Wd * 0.95 + 3 * pulse, 0, 0, Math.PI * 2); c.stroke();
      const n = myth ? 7 : opts.aura === "legendary" ? 5 : 3;
      c.globalAlpha = 0.95;
      for (let k = 0; k < n; k++) { const a = t * (myth ? 3 : 2) + (k / n) * Math.PI * 2; c.fillStyle = col(k); c.shadowColor = col(k); c.beginPath(); c.arc(Math.cos(a) * (L * 0.72 + 3), Math.sin(a) * (Wd * 0.95 + 3), myth ? 2.6 : 2, 0, Math.PI * 2); c.fill(); }
      c.restore();
    }
    if (X.glow === "void") {                // MYTHIC: a black hole under the car, with light spiralling in
      const t = performance.now() / 1000;
      c.save(); c.globalAlpha = 0.9; c.shadowColor = "#8b5cf6"; c.shadowBlur = 22 + 6 * Math.sin(t * 3); c.fillStyle = "#07030f";
      rrect(c, -L / 2 - 3, -Wd / 2 - 4, L + 6, Wd + 8, 10); c.fill();
      for (let k = 0; k < 8; k++) { const a = -t * 2.4 + k * 0.785, rr = 1 - ((t * 0.6 + k / 8) % 1); c.globalAlpha = 0.9 * rr; c.fillStyle = k % 2 ? "#c4b5fd" : "#7c3aed"; c.beginPath(); c.arc(Math.cos(a) * (L * 0.62) * rr, Math.sin(a) * (Wd * 0.85) * rr, 1.8, 0, Math.PI * 2); c.fill(); }
      c.restore();
    } else if (X.glow) {                     // store: underglow
      const t = performance.now() / 1000;
      const [col, ga] = glowLook(X.glow, t, hueNow);
      c.save(); c.globalAlpha = ga; c.shadowColor = col; c.shadowBlur = 16; c.fillStyle = col;
      rrect(c, -L / 2 - 2, -Wd / 2 - 3, L + 4, Wd + 6, 9); c.fill(); c.restore();
    }
    const B = X.body || (car.cls === "gt" ? "gt3" : null), open = B === "f1" || B === "kart";   // GT3 class cars get the boxy GT3 body
    c.fillStyle = "rgba(0,0,0,0.3)"; c.save(); c.translate(3, 4); bodyPath(c, B, L, Wd); c.fill(); c.restore();
    if (opts.trailPreview && X.trail) { for (let k = 0; k < 4; k++) trailShape(c, X.trail, -L / 2 - 10 - k * 11, (k % 2 ? 4 : -4), 4.5 - k * 0.6, 1 - k * 0.2, k); }
    if (opts.nitro || opts.flamePreview) {   // nitro boost: a long flame (blue, or the store colour)
      const fl = opts.flamePreview ? 30 : 22 + Math.random() * 16;
      c.fillStyle = flameLook(X.flame, hueNow);
      c.beginPath(); c.moveTo(-L / 2, -7); c.lineTo(-L / 2 - fl, 0); c.lineTo(-L / 2, 7); c.fill();
      c.fillStyle = "#d8f3ff"; c.beginPath(); c.moveTo(-L / 2, -3.5); c.lineTo(-L / 2 - fl * 0.55, 0); c.lineTo(-L / 2, 3.5); c.fill();
    }
    if (opts.boost) {
      const fl = 14 + Math.random() * 12;
      c.fillStyle = "#ffb74d"; c.beginPath(); c.moveTo(-L / 2, -6); c.lineTo(-L / 2 - fl, 0); c.lineTo(-L / 2, 6); c.fill();
      c.fillStyle = "#fff"; c.beginPath(); c.moveTo(-L / 2, -3); c.lineTo(-L / 2 - fl * 0.5, 0); c.lineTo(-L / 2, 3); c.fill();
    }
    if (!open) {
      c.fillStyle = "#16171a";
      for (const wx of [-L * 0.3, L * 0.28]) for (const wy of [-1, 1]) c.fillRect(wx - 6, wy * (Wd / 2) - 4, 12, 8);
      if (X.rims) { c.fillStyle = rimLook(X.rims, hueNow); for (const wx of [-L * 0.3, L * 0.28]) for (const wy of [-1, 1]) c.fillRect(wx - 3, wy * (Wd / 2) - 2.2, 6, 4.4); }
    } else {
      // open-wheel cars: big wheels out in the air
      const wl = B === "f1" ? [[L * 0.33, Wd / 2 - 1, 11, 7], [-L * 0.32, Wd / 2 - 1, 12, 8]] : [[L * 0.24, Wd * 0.4, 8, 6], [-L * 0.24, Wd * 0.4, 8, 6]];
      for (const [wx, wy, ww, wh] of wl) for (const sg of [-1, 1]) {
        c.fillStyle = "#141518"; rrect(c, wx - ww / 2, sg * wy - wh / 2, ww, wh, 2); c.fill();
        c.fillStyle = rimLook(X.rims, hueNow) || "#7b818a"; c.fillRect(wx - ww * 0.22, sg * wy - wh * 0.28, ww * 0.44, wh * 0.56);
      }
      if (B === "f1") { c.fillStyle = "#2a2c31"; c.fillRect(L * 0.33 - 1, -Wd / 2 + 4, 2, Wd - 8); c.fillRect(-L * 0.32 - 1, -Wd / 2 + 4, 2, Wd - 8); }   // suspension arms
    }
    // body
    c.save(); bodyPath(c, B, L, Wd); c.clip();
    c.fillStyle = car.color; c.fillRect(-L / 2, -Wd / 2, L, Wd);
    const alt = darken(car.color, 0.55), light = "rgba(255,255,255,0.85)";
    if (car.livery === "stripes") { c.fillStyle = light; c.fillRect(-L / 2, -4, L, 3); c.fillRect(-L / 2, 1, L, 3); }
    else if (car.livery === "split") { c.fillStyle = alt; c.fillRect(-L / 2, 0, L, Wd / 2); }
    else if (car.livery === "flames") {
      c.fillStyle = "#ff7043";
      c.beginPath(); c.moveTo(L / 2, -Wd / 2); for (let k = 0; k <= 5; k++) c.lineTo(L / 2 - 8 - (k % 2 ? 14 : 4), -Wd / 2 + (k / 5) * Wd); c.lineTo(L / 2, Wd / 2); c.closePath(); c.fill();
      c.fillStyle = "#ffd54f";
      c.beginPath(); c.moveTo(L / 2, -Wd / 3); for (let k = 0; k <= 4; k++) c.lineTo(L / 2 - 4 - (k % 2 ? 8 : 2), -Wd / 3 + (k / 4) * (Wd * 2 / 3)); c.lineTo(L / 2, Wd / 3); c.closePath(); c.fill();
    } else if (car.livery === "checker") {
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { c.fillStyle = (i + j) % 2 ? "#111" : "#fff"; c.fillRect(-L / 2 + i * 4, -Wd / 2 + j * 6, 4, 6); }
    }
    if (X.livery && (X.livery !== "gpLegend" || B === "f1")) drawLivery(c, X.livery, car.color, L, Wd, hueNow);
    if (X.decal) drawDecal(c, X.decal, L, Wd, B);
    if (car.design) { const d = designCanvas(car.design); if (d) { const sm = c.imageSmoothingEnabled; c.imageSmoothingEnabled = false; c.drawImage(d, -L / 2, -Wd / 2, L, Wd); c.imageSmoothingEnabled = sm; } }
    c.restore();
    c.lineWidth = 2; c.strokeStyle = "rgba(0,0,0,0.45)"; bodyPath(c, B, L, Wd); c.stroke();
    if (X.livery === "gpLegend" && B === "f1") { c.save(); c.shadowColor = "#ffcf40"; c.shadowBlur = 10 + 4 * Math.sin(performance.now() / 300); c.lineWidth = 1.2; c.strokeStyle = "rgba(255,215,90,0.9)"; bodyPath(c, B, L, Wd); c.stroke(); c.restore(); }
    if (!open) {
      c.fillStyle = "rgba(20,24,32,0.88)"; rrect(c, -6, -Wd / 2 + 4, 16, Wd - 8, 4); c.fill();
      c.fillStyle = "rgba(255,255,255,0.3)"; c.fillRect(6, -Wd / 2 + 5, 3, Wd - 10);
    }
    bodyExtras(c, B, car, X, L, Wd);
    if (car.cls) drawClassKit(c, car, X, L, Wd, open);
    if (X.helmet || open) { const hc = helmetLook(X.helmet, hueNow); c.fillStyle = hc; c.beginPath(); c.arc(open ? -2 : 0, 0, 4.6, 0, Math.PI * 2); c.fill(); c.fillStyle = "rgba(0,0,0,0.55)"; c.fillRect((open ? -2 : 0) + 1.5, -3, 2, 6); }
    if (X.wing && !open) {                    // store: rear wing
      const wc = darken(car.color, 0.45);
      if (X.wing === "card") { c.save(); c.rotate(0.12); c.fillStyle = "#b08850"; c.fillRect(-L / 2 - 5, -Wd / 2 - 1, 6, Wd + 2); c.strokeStyle = "#7c5c32"; c.lineWidth = 0.8; c.strokeRect(-L / 2 - 5, -Wd / 2 - 1, 6, Wd + 2); c.restore(); }
      else if (X.wing === "swan") { c.fillStyle = "#15161a"; c.fillRect(-L / 2 + 1, -5, 2, 2); c.fillRect(-L / 2 + 1, 3, 2, 2); c.fillStyle = wc; c.fillRect(-L / 2 - 6, -Wd / 2 - 3, 4, Wd + 6); c.fillStyle = "rgba(255,255,255,0.35)"; c.fillRect(-L / 2 - 5.5, -Wd / 2 - 2.5, 1, Wd + 5); }
      else if (X.wing === "carbon" || X.wing === "gold") {
        c.fillStyle = "#15161a"; c.fillRect(-L / 2 - 4, -Wd / 2 - 3, 2.5, 5); c.fillRect(-L / 2 - 4, Wd / 2 - 2, 2.5, 5);
        if (X.wing === "gold") { const gg = c.createLinearGradient(0, -Wd / 2 - 3, 0, Wd / 2 + 3); gg.addColorStop(0, "#8a6212"); gg.addColorStop(0.5, "#fff1b8"); gg.addColorStop(1, "#b8860b"); c.fillStyle = gg; c.fillRect(-L / 2 - 3, -Wd / 2 - 3, 4.5, Wd + 6); }
        else { for (let j = 0; j < Wd + 6; j += 1.5) { c.fillStyle = Math.floor(j / 1.5) % 2 ? "#26292e" : "#131417"; c.fillRect(-L / 2 - 3, -Wd / 2 - 3 + j, 4.5, 1.5); } c.fillStyle = "#e11d48"; c.fillRect(-L / 2 - 3, -1, 4.5, 2); }
      }
      else if (X.wing === "led") {             // light-bar wing: a light chases along it
        c.fillStyle = "#15161a"; c.fillRect(-L / 2 - 4, -Wd / 2 - 3, 2.5, 5); c.fillRect(-L / 2 - 4, Wd / 2 - 2, 2.5, 5); c.fillRect(-L / 2 - 3, -Wd / 2 - 3, 4, Wd + 6);
        const n = 8, at = Math.floor(performance.now() / 70) % (n * 2), k0 = at < n ? at : n * 2 - 1 - at;
        for (let k = 0; k < n; k++) { const on = Math.abs(k - k0) <= 1; c.fillStyle = on ? "#ff3355" : "rgba(255,51,85,0.25)"; if (on) { c.shadowColor = "#ff3355"; c.shadowBlur = 6; } c.fillRect(-L / 2 - 2.6, -Wd / 2 - 2.5 + k * ((Wd + 5) / n), 3.2, (Wd + 5) / n - 0.6); c.shadowBlur = 0; }
      }
      else if (X.wing === "duck") { c.fillStyle = wc; rrect(c, -L / 2 - 1, -Wd / 2 + 2, 4, Wd - 4, 2); c.fill(); }
      else {
        const decks = X.wing === "twin" ? [-L / 2 - 3, -L / 2 + 2] : [-L / 2 - 2];
        c.fillStyle = "#15161a"; c.fillRect(-L / 2 - 4, -Wd / 2 - 3, 2.5, 5); c.fillRect(-L / 2 - 4, Wd / 2 - 2, 2.5, 5);
        for (const dx of decks) { c.fillStyle = wc; c.fillRect(dx, -Wd / 2 - 2.5, 3.5, Wd + 5); c.fillStyle = "rgba(255,255,255,0.35)"; c.fillRect(dx + 0.5, -Wd / 2 - 2, 1, Wd + 4); }
      }
    }
    // number
    const NP = { gold: ["#ffcc1f", "#1b1400"], black: ["#111", "#fff"], neon: ["#0b0d18", "#22e6ff"], beige: ["#d8ccb0", "#4a3f2e"], red: ["#e53935", "#fff"], rainbow: [`hsl(${hueNow},90%,60%)`, "#111"], blue: ["#1e63d6", "#fff"], chrome: ["#dfe6ee", "#1b1f26"], holo: [`hsl(${(hueNow * 1.5) % 360},85%,72%)`, "#0b0d18"], disco: [DISCO[Math.floor(performance.now() / 250) % DISCO.length], "#111"], carbon: ["#1f2328", "#e5e7eb"], papaya: ["#ff8000", "#111"], green: ["#0b6e3a", "#fff"], fire: [`hsl(${20 + 22 * Math.sin(performance.now() / 70)},100%,52%)`, "#fff"] }[X.num] || ["#fff", "#111"];
    const nx = B === "f1" ? 11 : B === "kart" ? 9 : -14, nr = open ? 5 : 7;
    c.fillStyle = NP[0]; c.beginPath(); c.arc(nx, 0, nr, 0, Math.PI * 2); c.fill();
    if (car.cls && X.num !== "neon") { c.strokeStyle = CLASSES[car.cls]?.col || "#fff"; c.lineWidth = 1.8; c.stroke(); }
    if (X.num === "neon") { c.strokeStyle = "#22e6ff"; c.lineWidth = 1.5; c.stroke(); }
    c.save(); c.translate(nx, 0); c.rotate(Math.PI / 2); if (open) c.scale(0.75, 0.75);
    c.fillStyle = NP[1]; c.font = (NUM_FONTS.find((f) => f[0] === car.numFont) || NUM_FONTS[0])[2]; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(String(car.number ?? ""), 0, 0.5);
    c.restore();
    if (car.dmg > 0.08) drawDamage(c, car.dmg, car.id || 1, L, Wd, B);
    if (opts.glow) { c.strokeStyle = "rgba(255,204,31,0.9)"; c.lineWidth = 2.5; rrect(c, -L / 2 - 4, -Wd / 2 - 4, L + 8, Wd + 8, 10); c.stroke(); }
    c.restore();
  }

  // account state (filled in once the server says who you are)
  const A = { user: null, cfg: null, catalog: null, tab: "stats", extras: null };
  // damage: cracks and dents that grow with the damage (0..1), the same pattern every frame for each car
  function drawDamage(c, dmg, id, L, Wd, B) {
    const R = seeded(id * 7919);
    c.save(); bodyPath(c, B, L, Wd); c.clip();
    const n = Math.ceil(dmg * 7);
    for (let k = 0; k < n; k++) {
      let x = -L / 2 + R() * L, y = (R() < 0.5 ? -1 : 1) * (Wd / 2 - R() * 5);
      // a dark dent where it got hit, with cracks running out of it
      c.fillStyle = "rgba(0,0,0,0.35)"; c.beginPath(); c.ellipse(x, y, 3 + dmg * 3, 2 + dmg * 2, R() * 3, 0, Math.PI * 2); c.fill();
      c.strokeStyle = "rgba(15,15,18,0.85)"; c.lineWidth = 0.9;
      for (let b = 0; b < 3; b++) {
        let cx = x, cy = y; c.beginPath(); c.moveTo(cx, cy);
        const dir = Math.atan2(-y, R() - 0.5) + (R() - 0.5) * 1.6;
        for (let s2 = 0; s2 < 3; s2++) { cx += Math.cos(dir + (R() - 0.5)) * (3 + dmg * 5); cy += Math.sin(dir + (R() - 0.5)) * (2 + dmg * 3); c.lineTo(cx, cy); }
        c.stroke();
      }
    }
    if (dmg > 0.5) { c.fillStyle = "rgba(20,20,20,0.35)"; c.fillRect(L / 2 - 8, -Wd / 2, 8, Wd); }   // crumpled nose
    c.restore();
  }
  // car body shapes (chest-only, Legendary chest). The path is used to clip the paint and for the outline.
  function bodyPath(c, B, L, Wd) {
    c.beginPath();
    const h = Wd / 2;
    if (B === "f1") {         // open-wheel single-seater: pointy nose, sidepods, narrow tail
      c.moveTo(L / 2 + 5, 0); c.lineTo(L * 0.3, -2.6); c.lineTo(L * 0.08, -3.4); c.lineTo(L * 0.02, -h + 3); c.lineTo(-L * 0.24, -h + 3.5); c.lineTo(-L * 0.36, -4); c.lineTo(-L / 2, -4);
      c.lineTo(-L / 2, 4); c.lineTo(-L * 0.36, 4); c.lineTo(-L * 0.24, h - 3.5); c.lineTo(L * 0.02, h - 3); c.lineTo(L * 0.08, 3.4); c.lineTo(L * 0.3, 2.6); c.closePath();
    } else if (B === "kart") { const x = -L * 0.3, w = L * 0.6, y = -Wd * 0.3, hh = Wd * 0.6, r = 4; c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + hh, r); c.arcTo(x + w, y + hh, x, y + hh, r); c.arcTo(x, y + hh, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
    else if (B === "muscle") { const x = -L / 2 - 2, w = L + 4, r = 3; c.moveTo(x + r, -h); c.arcTo(x + w, -h, x + w, h, r); c.arcTo(x + w, h, x, h, r); c.arcTo(x, h, x, -h, r); c.arcTo(x, -h, x + w, -h, r); c.closePath(); }
    else if (B === "rally") { const x = -L / 2 + 4, w = L - 5, r = 6; c.moveTo(x + r, -h); c.arcTo(x + w, -h, x + w, h, r); c.arcTo(x + w, h, x, h, r); c.arcTo(x, h, x, -h, r); c.arcTo(x, -h, x + w, -h, r); c.closePath(); }
    else if (B === "gt3") {   // GT3 racer: square nose and tail, big flared wheel arches
      const fx = L * 0.28, rx = -L * 0.3, aw = 7.5, fl = 2.6;
      c.moveTo(L / 2 - 2, -h + 0.5); c.lineTo(fx + aw, -h); c.lineTo(fx + aw - 2.5, -h - fl); c.lineTo(fx - aw + 2.5, -h - fl); c.lineTo(fx - aw, -h);
      c.lineTo(rx + aw, -h); c.lineTo(rx + aw - 2.5, -h - fl); c.lineTo(rx - aw + 2.5, -h - fl); c.lineTo(rx - aw, -h); c.lineTo(-L / 2 - 1, -h + 1);
      c.lineTo(-L / 2 - 1, h - 1); c.lineTo(rx - aw, h); c.lineTo(rx - aw + 2.5, h + fl); c.lineTo(rx + aw - 2.5, h + fl); c.lineTo(rx + aw, h);
      c.lineTo(fx - aw, h); c.lineTo(fx - aw + 2.5, h + fl); c.lineTo(fx + aw - 2.5, h + fl); c.lineTo(fx + aw, h); c.lineTo(L / 2 - 2, h - 0.5); c.lineTo(L / 2 + 1, h - 3); c.lineTo(L / 2 + 1, -h + 3); c.closePath();
    } else if (B === "lmp") {   // endurance prototype: long pointed nose, big front fenders, wide tail
      c.moveTo(L / 2 + 4, -3); c.quadraticCurveTo(L * 0.42, -h - 1, L * 0.22, -h); c.lineTo(L * 0.02, -h + 3); c.lineTo(-L * 0.2, -h + 2); c.lineTo(-L / 2, -h);
      c.lineTo(-L / 2, h); c.lineTo(-L * 0.2, h - 2); c.lineTo(L * 0.02, h - 3); c.lineTo(L * 0.22, h); c.quadraticCurveTo(L * 0.42, h + 1, L / 2 + 4, 3); c.closePath();
    } else { const x = -L / 2, r = 7; c.moveTo(x + r, -h); c.arcTo(x + L, -h, x + L, h, r); c.arcTo(x + L, h, x, h, r); c.arcTo(x, h, x, -h, r); c.arcTo(x, -h, x + L, -h, r); c.closePath(); }
  }
  function bodyExtras(c, B, car, X, L, Wd) {
    const dk = darken(car.color, 0.4);
    if (B === "f1") {
      c.fillStyle = "#1c1d21"; c.fillRect(L / 2 - 1, -Wd / 2 - 1, 4, Wd + 2);                       // front wing
      c.fillStyle = car.color; c.fillRect(L / 2 - 1, -Wd / 2 - 1, 4, 2.5); c.fillRect(L / 2 - 1, Wd / 2 - 1.5, 4, 2.5);
      c.fillStyle = "#1c1d21"; c.fillRect(-L / 2 - 4, -Wd / 2 + 1, 5, Wd - 2);                      // rear wing
      c.fillStyle = car.color; c.fillRect(-L / 2 - 4, -Wd / 2 + 1, 5, 2); c.fillRect(-L / 2 - 4, Wd / 2 - 3, 5, 2);
      c.fillStyle = "rgba(15,16,20,0.9)"; c.beginPath(); c.ellipse(-2, 0, 7, 3.8, 0, 0, Math.PI * 2); c.fill();   // cockpit
      c.strokeStyle = "#2a2c31"; c.lineWidth = 1.6; c.beginPath(); c.moveTo(6, 0); c.quadraticCurveTo(2, -4.6, -6, -3.6); c.moveTo(6, 0); c.quadraticCurveTo(2, 4.6, -6, 3.6); c.stroke();   // halo
    } else if (B === "kart") {
      c.fillStyle = "#2a2c31"; c.fillRect(L * 0.3, -Wd * 0.34, 3, Wd * 0.68); c.fillRect(-L * 0.34, -Wd * 0.34, 3, Wd * 0.68);   // bumpers
      c.fillStyle = "rgba(15,16,20,0.85)"; rrect(c, -8, -5, 12, 10, 3); c.fill();                    // seat
    } else if (B === "muscle") {
      c.fillStyle = "rgba(20,24,32,0.9)"; c.fillRect(L * 0.18, -3, 8, 6); c.fillStyle = "rgba(255,255,255,0.18)"; c.fillRect(L * 0.18, -3, 8, 1.2);   // hood scoop
    } else if (B === "rally") {
      c.fillStyle = "#fff6c2"; for (const y of [-7, -2.5, 2.5, 7]) { c.beginPath(); c.arc(L / 2 - 3, y, 1.8, 0, Math.PI * 2); c.fill(); }   // light pod
      c.strokeStyle = "rgba(0,0,0,0.5)"; c.lineWidth = 1; for (const x of [-10, -6, -2]) { c.beginPath(); c.moveTo(x, -7); c.lineTo(x, 7); c.stroke(); }   // roof rack
    } else if (B === "gt3") {
      c.fillStyle = "#ffe14a"; c.fillRect(L / 2 - 3.5, -Wd / 2 + 1.5, 3, 4); c.fillRect(L / 2 - 3.5, Wd / 2 - 5.5, 3, 4);   // yellow endurance headlights
      c.fillStyle = "rgba(10,12,16,0.85)"; for (const y of [-4, 2]) c.fillRect(L * 0.2, y, 6, 2);                           // bonnet vents
      c.fillStyle = "rgba(10,12,16,0.9)"; c.fillRect(-9, -2, 4, 4);                                                           // roof scoop
      c.fillStyle = "#e11d48"; c.fillRect(-L / 2 - 1, -Wd / 2 + 1, 1.6, 3); c.fillRect(-L / 2 - 1, Wd / 2 - 4, 1.6, 3);      // rain light / tail lights
      if (!X.wing) {   // a big swan-neck GT3 wing, wider than the car
        c.fillStyle = "#15161a"; c.fillRect(-L / 2 + 1, -5, 2, 2.5); c.fillRect(-L / 2 + 1, 2.5, 2, 2.5);
        c.fillStyle = "#1b1d22"; c.fillRect(-L / 2 - 5, -Wd / 2 - 4, 4.5, Wd + 8);
        c.fillStyle = "#22c55e"; c.fillRect(-L / 2 - 5.5, -Wd / 2 - 4.5, 5.5, 1.6); c.fillRect(-L / 2 - 5.5, Wd / 2 + 2.9, 5.5, 1.6);   // green endplates
        c.fillStyle = "rgba(255,255,255,0.25)"; c.fillRect(-L / 2 - 4.5, -Wd / 2 - 3.5, 1, Wd + 7);
      }
    } else if (B === "lmp") {
      c.fillStyle = "rgba(20,24,32,0.9)"; c.beginPath(); c.ellipse(4, 0, 8, 5, 0, 0, Math.PI * 2); c.fill();   // bubble canopy
      c.strokeStyle = dk; c.lineWidth = 1.6; c.beginPath(); c.moveTo(-4, 0); c.lineTo(-L / 2, 0); c.stroke();   // shark fin
    }
  }
  function drawDecal(c, kind, L, Wd, B) {
    const x = B === "f1" ? -L * 0.16 : L * 0.28, y = 0;   // on the bonnet (engine cover on the open-wheeler)
    c.save(); c.translate(x, y);
    switch (kind) {
      case "star": c.fillStyle = "#ffe066"; c.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i / 10) * Math.PI * 2, r = i % 2 ? 2.2 : 5; c.lineTo(Math.cos(a) * r, Math.sin(a) * r); } c.closePath(); c.fill(); break;
      case "bolt": c.fillStyle = "#ffd21f"; c.beginPath(); c.moveTo(4, -6); c.lineTo(-1, 0.5); c.lineTo(2, 0.5); c.lineTo(-4, 6); c.lineTo(0, -1); c.lineTo(-2.5, -1); c.closePath(); c.fill(); break;
      case "target": for (const [r, col] of [[5.5, "#fff"], [4, "#e53935"], [2.5, "#fff"], [1.1, "#e53935"]]) { c.fillStyle = col; c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.fill(); } break;
      case "eyes": for (const sy of [-4.5, 4.5]) { c.fillStyle = "#fff"; c.beginPath(); c.arc(4, sy, 3.4, 0, Math.PI * 2); c.fill(); c.fillStyle = "#111"; c.beginPath(); c.arc(5.4, sy, 1.6, 0, Math.PI * 2); c.fill(); } break;
      case "teeth": c.fillStyle = "#fff"; c.strokeStyle = "#8a1c1c"; c.lineWidth = 0.6; c.beginPath(); c.moveTo(8, -Wd / 2 + 2); for (let i = 0; i <= 8; i++) c.lineTo(i % 2 ? 3 : 8, -Wd / 2 + 2 + (i / 8) * (Wd - 4)); c.fill(); c.stroke(); break;
      case "crown": c.fillStyle = "#ffcc1f"; c.beginPath(); c.moveTo(-3, -5); c.lineTo(3, -5); c.lineTo(5, -2.5); c.lineTo(3, -1); c.lineTo(5, 1); c.lineTo(3, 2.5); c.lineTo(5, 5); c.lineTo(-3, 5); c.closePath(); c.fill(); break;
      case "tape": c.fillStyle = "rgba(170,172,176,0.9)"; c.rotate(0.6); c.fillRect(-7, -1.6, 14, 3.2); c.rotate(-1.2); c.fillRect(-7, -1.6, 14, 3.2); break;
      case "heart": c.fillStyle = "#ff3b6b"; c.beginPath(); c.moveTo(-4, 0); c.bezierCurveTo(1, -7, 6, -3, 3, 0); c.bezierCurveTo(6, 3, 1, 7, -4, 0); c.fill(); break;
      case "flag": for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { c.fillStyle = (i + j) % 2 ? "#111" : "#fff"; c.fillRect(-4 + i * 2.2, -4.4 + j * 2.2, 2.2, 2.2); } break;
      case "paw": c.fillStyle = "#2b2118"; c.beginPath(); c.ellipse(-1, 0, 2.6, 3.2, 0, 0, Math.PI * 2); c.fill(); for (const [px, py] of [[2.6, -3.6], [3.6, -1.2], [3.6, 1.2], [2.6, 3.6]]) { c.beginPath(); c.arc(px, py, 1.2, 0, Math.PI * 2); c.fill(); } break;
      case "rocket": c.fillStyle = "#f5f5f5"; c.strokeStyle = "#1b1f26"; c.lineWidth = 0.8; c.beginPath(); c.moveTo(6, 0); c.quadraticCurveTo(2, -3, -4, -2); c.lineTo(-4, 2); c.quadraticCurveTo(2, 3, 6, 0); c.fill(); c.stroke(); c.fillStyle = "#e53935"; c.beginPath(); c.moveTo(-3, -2); c.lineTo(-6, -4); c.lineTo(-5, -1.5); c.fill(); c.beginPath(); c.moveTo(-3, 2); c.lineTo(-6, 4); c.lineTo(-5, 1.5); c.fill(); c.fillStyle = "#38bdf8"; c.beginPath(); c.arc(1.5, 0, 1.2, 0, Math.PI * 2); c.fill(); c.fillStyle = "#ffb020"; c.beginPath(); c.moveTo(-4, -1.2); c.lineTo(-7.5, 0); c.lineTo(-4, 1.2); c.fill(); break;
      case "hoodflame": for (const [col, s2] of [["#ff5722", 1], ["#ffca28", 0.6]]) { c.fillStyle = col; c.beginPath(); c.moveTo(7, -6 * s2); for (let k = 0; k <= 6; k++) c.lineTo(7 - (k % 2 ? 12 : 5) * s2, -6 * s2 + (k / 6) * 12 * s2); c.lineTo(7, 6 * s2); c.closePath(); c.fill(); } break;
      case "web": c.strokeStyle = "rgba(235,235,240,0.9)"; c.lineWidth = 0.5; for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; c.beginPath(); c.moveTo(0, 0); c.lineTo(Math.cos(a) * 6, Math.sin(a) * 6); c.stroke(); }
        for (const r of [2, 3.8, 5.6]) { c.beginPath(); for (let k = 0; k <= 8; k++) { const a = (k / 8) * Math.PI * 2; c.lineTo(Math.cos(a) * r, Math.sin(a) * r); } c.stroke(); } break;
      case "jackol": c.fillStyle = "#ff7a00"; c.beginPath(); c.ellipse(0, 0, 4.6, 5.6, 0, 0, Math.PI * 2); c.fill(); c.fillStyle = "#3f6212"; c.fillRect(-5.8, -0.8, 1.6, 1.6);
        c.fillStyle = `rgba(255,${200 + Math.round(40 * Math.sin(performance.now() / 120))},60,1)`; c.beginPath(); c.moveTo(2.6, -3); c.lineTo(0.6, -1.6); c.lineTo(2.6, -0.6); c.fill(); c.beginPath(); c.moveTo(2.6, 3); c.lineTo(0.6, 1.6); c.lineTo(2.6, 0.6); c.fill();
        c.beginPath(); c.moveTo(-1, -3); c.lineTo(-2.6, -1.5); c.lineTo(-1.6, 0); c.lineTo(-2.6, 1.5); c.lineTo(-1, 3); c.lineTo(-1.9, 0); c.closePath(); c.fill(); break;
      case "skull": c.fillStyle = "#f2f2f2"; c.beginPath(); c.arc(1, 0, 4.4, 0, Math.PI * 2); c.fill(); c.fillRect(-4.6, -2.6, 3, 5.2);
        c.fillStyle = "#111"; c.beginPath(); c.arc(2, -1.7, 1.2, 0, Math.PI * 2); c.arc(2, 1.7, 1.2, 0, Math.PI * 2); c.fill(); c.fillRect(-4, -1.6, 0.8, 0.8); c.fillRect(-4, 0.8, 0.8, 0.8); break;
      case "stripes": c.fillStyle = "rgba(255,255,255,0.92)"; c.fillRect(-L * 0.6, -3.2, L * 0.75, 2); c.fillRect(-L * 0.6, 1.2, L * 0.75, 2); break;
      case "dice": for (const [dx, dy, rot] of [[-2.5, -2.5, 0.3], [2.5, 2.5, -0.4]]) { c.save(); c.translate(dx, dy); c.rotate(rot); c.fillStyle = "#f5f5f5"; c.fillRect(-2.6, -2.6, 5.2, 5.2); c.fillStyle = "#e53935";
          for (const [px, py] of [[-1.3, -1.3], [0, 0], [1.3, 1.3]]) { c.beginPath(); c.arc(px, py, 0.6, 0, Math.PI * 2); c.fill(); } c.restore(); } break;
      case "smiley": c.fillStyle = "#ffd21f"; c.beginPath(); c.arc(0, 0, 4.8, 0, Math.PI * 2); c.fill(); c.fillStyle = "#111"; c.beginPath(); c.arc(1.6, -1.7, 0.8, 0, Math.PI * 2); c.arc(1.6, 1.7, 0.8, 0, Math.PI * 2); c.fill(); c.strokeStyle = "#111"; c.lineWidth = 0.8; c.beginPath(); c.arc(0, 0, 3, -1.1, 1.1); c.stroke(); break;
      case "wings": c.fillStyle = "rgba(255,255,255,0.92)"; for (const sg of [-1, 1]) { c.beginPath(); c.moveTo(0, sg * 1); c.quadraticCurveTo(-7, sg * 9, -12, sg * 10); c.quadraticCurveTo(-7, sg * 5, -4, sg * 1); c.fill(); } break;
      case "barcode": { c.fillStyle = "#f8fafc"; c.fillRect(-4, -5.5, 8, 11); c.fillStyle = "#111"; for (const [y, h] of [[-4.6, 0.6], [-3.6, 1], [-2.2, 0.5], [-1.3, 1.2], [0.3, 0.5], [1.2, 0.9], [2.6, 0.5], [3.5, 1]]) c.fillRect(-3.2, y, 6.4, h); break; }
      case "laurel": c.strokeStyle = "#2f8f46"; c.fillStyle = "#3fb35a"; c.lineWidth = 0.9; for (const sg of [-1, 1]) { c.beginPath(); c.arc(0, 0, 5, sg > 0 ? 0.3 : Math.PI + 0.3, sg > 0 ? Math.PI - 0.3 : 2 * Math.PI - 0.3); c.stroke(); for (let i = 0; i < 4; i++) { const a = (sg > 0 ? 0.55 : Math.PI + 0.55) + i * 0.6; c.beginPath(); c.ellipse(Math.cos(a) * 5, Math.sin(a) * 5, 1.6, 0.8, a + Math.PI / 2, 0, Math.PI * 2); c.fill(); } } c.fillStyle = "#ffd24a"; c.font = "800 5px sans-serif"; c.textAlign = "center"; c.textBaseline = "middle"; c.save(); c.rotate(Math.PI / 2); c.fillText("1", 0, 0.4); c.restore(); break;
      case "comet": { const g = c.createLinearGradient(-9, 0, 3, 0); g.addColorStop(0, "rgba(125,211,252,0)"); g.addColorStop(1, "rgba(186,230,253,0.95)"); c.fillStyle = g; c.beginPath(); c.moveTo(-9, -1); c.lineTo(2, -2.6); c.lineTo(2, 2.6); c.lineTo(-9, 1); c.fill(); c.fillStyle = "#fff"; c.beginPath(); c.arc(2.5, 0, 2.6, 0, Math.PI * 2); c.fill(); break; }
      case "eye": {   // animated: an eye that looks around and blinks
        const t = performance.now() / 1000, blink = (t % 3.2) < 0.14 ? 0.12 : 1;
        c.fillStyle = "#f8fafc"; c.beginPath(); c.ellipse(0, 0, 3.6, 5.6 * blink, 0, 0, Math.PI * 2); c.fill();
        if (blink > 0.5) { c.fillStyle = "#16a34a"; c.beginPath(); c.arc(Math.sin(t * 1.3) * 1.2, Math.sin(t * 0.9) * 2.4, 2.2, 0, Math.PI * 2); c.fill(); c.fillStyle = "#0b0b0b"; c.beginPath(); c.arc(Math.sin(t * 1.3) * 1.2, Math.sin(t * 0.9) * 2.4, 1, 0, Math.PI * 2); c.fill(); }
        c.strokeStyle = "#111"; c.lineWidth = 0.8; c.beginPath(); c.ellipse(0, 0, 3.6, 5.6 * blink, 0, 0, Math.PI * 2); c.stroke(); break;
      }
      case "radar": {   // animated: a sweeping radar screen with blips
        const t = performance.now() / 1000, a = t * 3;
        c.fillStyle = "#04210f"; c.beginPath(); c.arc(0, 0, 5.5, 0, Math.PI * 2); c.fill();
        c.strokeStyle = "rgba(57,255,136,0.45)"; c.lineWidth = 0.5; c.beginPath(); c.arc(0, 0, 3.4, 0, Math.PI * 2); c.moveTo(-5.5, 0); c.lineTo(5.5, 0); c.moveTo(0, -5.5); c.lineTo(0, 5.5); c.stroke();
        c.fillStyle = "rgba(57,255,136,0.35)"; c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, 5.5, a - 0.7, a); c.closePath(); c.fill();
        c.strokeStyle = "#39ff88"; c.lineWidth = 0.9; c.beginPath(); c.moveTo(0, 0); c.lineTo(Math.cos(a) * 5.5, Math.sin(a) * 5.5); c.stroke();
        for (const [bx, by] of [[2.2, -2.5], [-3, 1.4]]) { const d = ((a - Math.atan2(by, bx)) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2); c.fillStyle = `rgba(160,255,190,${Math.max(0, 1 - d / 3)})`; c.fillRect(bx - 0.6, by - 0.6, 1.2, 1.2); }
        break;
      }
      case "eq": {      // animated: equalizer bars bouncing to the beat
        const t = performance.now() / 1000;
        for (let k = 0; k < 5; k++) { const h = 1.5 + 4 * Math.abs(Math.sin(t * (5 + k * 1.7) + k)); c.fillStyle = `hsl(${120 - h * 20},100%,55%)`; c.fillRect(-h / 2 - 0.5, -6 + k * 2.5, h + 1, 1.8); }
        break;
      }
    }
    c.restore();
  }
  // chest liveries (original designs), painted over the whole body
  function drawLivery(c, kind, base, L, Wd, hue) {
    const x0 = -L / 2, y0 = -Wd / 2;
    const lin = (stops, vert) => { const g = vert ? c.createLinearGradient(0, y0, 0, -y0) : c.createLinearGradient(x0, 0, -x0, 0); stops.forEach((col, i) => g.addColorStop(i / (stops.length - 1), col)); return g; };
    const R = seeded(kind.length * 97);
    // a season pass theme's MYTHIC livery: the theme's colours flowing over the car, a shine sweeping across, and its
    // icon riding on the roof (works for any theme, new ones too)
    if (typeof kind === "string" && kind.startsWith("tm_")) {
      const T = (A.catalog?.passThemes || []).find((x) => x.key === kind.slice(3)), col = T?.c || ["#ffd24a", "#ff4fd8"], t = performance.now() / 1000;
      const g = c.createLinearGradient(x0 + Math.sin(t * 0.9) * L * 0.3, y0, -x0 + Math.sin(t * 0.9) * L * 0.3, -y0);
      g.addColorStop(0, col[0]); g.addColorStop(0.5, col[1]); g.addColorStop(1, col[0]); c.fillStyle = g; c.fillRect(x0, y0, L, Wd);
      const sx = x0 + ((t * 0.7) % 1.6) * L - L * 0.3, sh = c.createLinearGradient(sx - 6, 0, sx + 6, 0);
      sh.addColorStop(0, "rgba(255,255,255,0)"); sh.addColorStop(0.5, "rgba(255,255,255,0.75)"); sh.addColorStop(1, "rgba(255,255,255,0)"); c.fillStyle = sh; c.fillRect(x0, y0, L, Wd);
      c.strokeStyle = "rgba(255,226,120,0.95)"; c.lineWidth = 0.9; c.beginPath(); c.moveTo(x0, y0 + 1); c.lineTo(-x0, y0 + 1); c.moveTo(x0, -y0 - 1); c.lineTo(-x0, -y0 - 1); c.stroke();
      if (T?.icon) { c.save(); c.font = `${Math.round(Wd * 0.44)}px sans-serif`; c.textAlign = "center"; c.textBaseline = "middle"; c.globalAlpha = 0.85 + 0.15 * Math.sin(t * 3); c.fillText(T.icon, -x0 - L * 0.13, 0); c.restore(); }
      return;
    }
    switch (kind) {
      case "phantom": {   // MYTHIC (Haunted), animated: ghosts drifting along a dark car, glowing eyes, mist
        const t = performance.now() / 1000;
        c.fillStyle = lin(["#0d0118", "#2a0a45", "#0d0118"], true); c.fillRect(x0, y0, L, Wd);
        for (let k = 0; k < 8; k++) { c.fillStyle = `rgba(160,120,255,${0.08 + 0.06 * Math.sin(t * 2 + k)})`; c.beginPath(); c.ellipse(x0 + ((k * 9 + t * 6) % L), y0 + Wd * (0.2 + 0.6 * ((k * 0.37) % 1)), 6, 2, 0, 0, Math.PI * 2); c.fill(); }
        for (let k = 0; k < 3; k++) {
          const gx = -x0 - ((t * 9 + k * L / 3) % (L + 8)) + 4, gy = Math.sin(t * 2.4 + k * 2) * Wd * 0.22, a = 0.55 + 0.35 * Math.sin(t * 3 + k);
          c.fillStyle = `rgba(235,240,255,${a})`; c.beginPath(); c.arc(gx, gy, 3, Math.PI, 0); c.lineTo(gx + 3, gy + 3.2);
          for (let w = 0; w < 3; w++) c.lineTo(gx + 2 - w * 2, gy + (w % 2 ? 2.2 : 3.4)); c.lineTo(gx - 3, gy + 3.2); c.closePath(); c.fill();
          c.fillStyle = "#39ff14"; c.fillRect(gx - 1.6, gy - 0.6, 0.9, 0.9); c.fillRect(gx + 0.7, gy - 0.6, 0.9, 0.9);
        }
        c.strokeStyle = "rgba(255,122,0,0.85)"; c.lineWidth = 0.8; c.beginPath(); c.moveTo(x0, y0 + 1); c.lineTo(-x0, y0 + 1); c.moveTo(x0, -y0 - 1); c.lineTo(-x0, -y0 - 1); c.stroke();
        break;
      }
      case "pinstripe": c.fillStyle = "#e8c34a"; for (const y of [-6.5, -2.5, 1.5, 5.5]) c.fillRect(x0, y, L, 0.9); break;
      case "chevron": c.fillStyle = "rgba(255,255,255,0.9)"; for (let k = 0; k < 3; k++) { const x = x0 + 10 + k * 9; c.beginPath(); c.moveTo(x, y0); c.lineTo(x + 6, 0); c.lineTo(x, -y0); c.lineTo(x - 3, -y0); c.lineTo(x + 3, 0); c.lineTo(x - 3, y0); c.fill(); } break;
      case "splatter": for (let k = 0; k < 16; k++) { c.fillStyle = ["#ff2bd6", "#22e6ff", "#ffe066"][k % 3]; c.beginPath(); c.arc(x0 + R() * L, y0 + R() * Wd, 1 + R() * 2.6, 0, Math.PI * 2); c.fill(); } break;
      case "aurora": c.fillStyle = lin(["#12d6b0", "#3b82f6", "#a855f7", "#ff4fd8"]); c.fillRect(x0, y0, L, Wd); c.fillStyle = "rgba(255,255,255,0.25)"; c.fillRect(x0, -1, L, 2); break;
      case "carbon": c.fillStyle = "#1a1c20"; c.fillRect(x0, y0, L, Wd); for (let i = 0; i < L; i += 3) for (let j = 0; j < Wd; j += 3) { c.fillStyle = (i + j) % 6 ? "#26292e" : "#131417"; c.fillRect(x0 + i, y0 + j, 3, 3); } c.fillStyle = "#e11d48"; c.fillRect(x0, -1, L, 2); c.fillRect(x0, y0 + 2, L, 1); c.fillRect(x0, -y0 - 3, L, 1); break;
      case "tiger": c.fillStyle = "#f28c1e"; c.fillRect(x0, y0, L, Wd); c.fillStyle = "#151515"; for (let k = 0; k < 7; k++) { const x = x0 + 4 + k * 6.5; c.beginPath(); c.moveTo(x, y0); c.quadraticCurveTo(x + 4, y0 + Wd * 0.3, x + 1, y0 + Wd * 0.45); c.lineTo(x - 1, y0 + Wd * 0.4); c.quadraticCurveTo(x + 1, y0 + Wd * 0.25, x - 2, y0); c.fill(); c.beginPath(); c.moveTo(x + 2, -y0); c.quadraticCurveTo(x + 6, -y0 - Wd * 0.3, x + 3, -y0 - Wd * 0.45); c.lineTo(x + 1, -y0 - Wd * 0.4); c.quadraticCurveTo(x + 3, -y0 - Wd * 0.25, x, -y0); c.fill(); } break;
      case "lightning": c.fillStyle = "#2a2d34"; c.fillRect(x0, y0, L, Wd); c.fillStyle = "#ffd21f"; c.beginPath(); c.moveTo(x0, -2); c.lineTo(x0 + L * 0.35, -4); c.lineTo(x0 + L * 0.3, 1); c.lineTo(x0 + L * 0.7, -1); c.lineTo(x0 + L * 0.62, 4); c.lineTo(-x0, 2); c.lineTo(x0 + L * 0.66, 2.5); c.lineTo(x0 + L * 0.72, -3); c.lineTo(x0 + L * 0.33, -0.5); c.lineTo(x0 + L * 0.4, -6); c.closePath(); c.fill(); break;
      case "circuit": c.fillStyle = "#0f5132"; c.fillRect(x0, y0, L, Wd); c.strokeStyle = "#e8c34a"; c.lineWidth = 0.8; for (let k = 0; k < 7; k++) { let x = x0 + R() * L, y = y0 + 2 + R() * (Wd - 4); c.beginPath(); c.moveTo(x, y); x += 4 + R() * 8; c.lineTo(x, y); y += (R() - 0.5) * 8; c.lineTo(x + 3, y); c.stroke(); c.fillStyle = "#e8c34a"; c.fillRect(x + 2, y - 1, 2, 2); } break;
      case "galaxy": { c.fillStyle = "#0b0f2a"; c.fillRect(x0, y0, L, Wd); const g = c.createRadialGradient(x0 + L * 0.35, 0, 1, x0 + L * 0.35, 0, L * 0.5); g.addColorStop(0, "rgba(168,85,247,0.8)"); g.addColorStop(0.5, "rgba(59,130,246,0.35)"); g.addColorStop(1, "rgba(0,0,0,0)"); c.fillStyle = g; c.fillRect(x0, y0, L, Wd); for (let k = 0; k < 22; k++) { c.fillStyle = k % 5 ? "rgba(255,255,255,0.85)" : "#ffe066"; c.fillRect(x0 + R() * L, y0 + R() * Wd, 0.9, 0.9); } break; }
      case "holo": c.fillStyle = lin([`hsl(${hue},90%,65%)`, `hsl(${(hue + 90) % 360},90%,65%)`, `hsl(${(hue + 180) % 360},90%,65%)`, `hsl(${(hue + 270) % 360},90%,65%)`]); c.fillRect(x0, y0, L, Wd); c.fillStyle = "rgba(255,255,255,0.35)"; c.beginPath(); c.moveTo(x0 + L * 0.2, y0); c.lineTo(x0 + L * 0.35, y0); c.lineTo(x0 + L * 0.25, -y0); c.lineTo(x0 + L * 0.1, -y0); c.fill(); break;
      case "gold": c.fillStyle = lin(["#8a6212", "#f7d774", "#c9981f", "#fff1b8", "#b8860b"]); c.fillRect(x0, y0, L, Wd); c.fillStyle = "rgba(255,255,255,0.45)"; c.beginPath(); c.moveTo(x0 + L * 0.55, y0); c.lineTo(x0 + L * 0.62, y0); c.lineTo(x0 + L * 0.5, -y0); c.lineTo(x0 + L * 0.43, -y0); c.fill(); break;
      case "dragon": c.fillStyle = "#9f1d1d"; c.fillRect(x0, y0, L, Wd); c.strokeStyle = "rgba(20,0,0,0.55)"; c.lineWidth = 0.8; for (let j = 0; j < Wd + 3; j += 3) for (let i = (j / 3) % 2 ? 1.5 : 0; i < L + 3; i += 3) { c.beginPath(); c.arc(x0 + i, y0 + j, 1.6, 0, Math.PI); c.stroke(); } c.fillStyle = "#f5b301"; c.fillRect(x0, -0.8, L, 1.6); break;
      case "camo": c.fillStyle = "#4b5a2f"; c.fillRect(x0, y0, L, Wd); for (let k = 0; k < 14; k++) { c.fillStyle = ["#2f3a1d", "#7b7445", "#1e2413"][k % 3]; c.beginPath(); c.ellipse(x0 + R() * L, y0 + R() * Wd, 3 + R() * 4, 2 + R() * 3, R() * 3, 0, Math.PI * 2); c.fill(); } break;
      case "zebra": c.fillStyle = "#f5f5f5"; c.fillRect(x0, y0, L, Wd); c.fillStyle = "#111"; for (let k = 0; k < 9; k++) { const x = x0 + 2 + k * 5; c.beginPath(); c.moveTo(x, y0); c.quadraticCurveTo(x + 3, 0, x - 1, -y0); c.lineTo(x + 1.5, -y0); c.quadraticCurveTo(x + 5, 0, x + 2, y0); c.fill(); } break;
      case "sunset": c.fillStyle = lin(["#ffb347", "#ff5f6d", "#8e2de2"], true); c.fillRect(x0, y0, L, Wd); c.fillStyle = "rgba(255,240,180,0.6)"; c.beginPath(); c.arc(x0 + L * 0.3, 0, 4, 0, Math.PI * 2); c.fill(); break;
      case "lava": c.fillStyle = "#1d1614"; c.fillRect(x0, y0, L, Wd); c.strokeStyle = "#ff6a1a"; c.lineWidth = 1.1; for (let k = 0; k < 6; k++) { let x = x0 + R() * L, y = y0 + R() * Wd; c.beginPath(); c.moveTo(x, y); for (let q = 0; q < 3; q++) { x += (R() - 0.3) * 9; y += (R() - 0.5) * 8; c.lineTo(x, y); } c.stroke(); } break;
      case "ice": c.fillStyle = lin(["#e0f7ff", "#8fd3fe", "#e0f7ff"], true); c.fillRect(x0, y0, L, Wd); c.strokeStyle = "rgba(255,255,255,0.9)"; c.lineWidth = 0.8; for (let k = 0; k < 5; k++) { const cx = x0 + R() * L, cy = y0 + R() * Wd; for (let a = 0; a < 3; a++) { c.beginPath(); c.moveTo(cx - Math.cos(a) * 3, cy - Math.sin(a) * 3); c.lineTo(cx + Math.cos(a) * 3, cy + Math.sin(a) * 3); c.stroke(); } } break;
      case "pixel": for (let i = 0; i < L; i += 4) for (let j = 0; j < Wd; j += 4) { c.fillStyle = ["#ff2bd6", "#22e6ff", "#ffe066", "#39ff88", "#7c3aed", "#111"][Math.floor(R() * 6)]; c.fillRect(x0 + i, y0 + j, 4, 4); } break;
      case "rainbow": for (let k = 0; k < 7; k++) { c.fillStyle = `hsl(${(k * 51 + hue) % 360},90%,58%)`; c.fillRect(x0, y0 + (k / 7) * Wd, L, Wd / 7 + 0.5); } break;
      // ---- second wave ----
      case "hazard": c.fillStyle = "#ffcc00"; c.fillRect(x0, y0, L, Wd); c.fillStyle = "#151515"; for (let k = -3; k < 10; k++) { const x = x0 + k * 7; c.beginPath(); c.moveTo(x, y0); c.lineTo(x + 3.5, y0); c.lineTo(x + 3.5 + Wd * 0.6, -y0); c.lineTo(x + Wd * 0.6, -y0); c.fill(); } break;
      case "retro": c.fillStyle = "#8fc7e8"; c.fillRect(x0, y0, L, Wd); c.fillStyle = "#ff7a1a"; c.fillRect(x0, -4, L, 8); c.fillStyle = "#8fc7e8"; c.fillRect(x0, -1, L, 2); c.fillStyle = "rgba(255,255,255,0.5)"; c.fillRect(x0, y0 + 2, L, 1); break;
      case "sakura": c.fillStyle = lin(["#ffe4ef", "#ffb6d2"], true); c.fillRect(x0, y0, L, Wd); c.strokeStyle = "#5b3a29"; c.lineWidth = 0.9; c.beginPath(); c.moveTo(x0, 4); c.quadraticCurveTo(x0 + L * 0.3, -2, x0 + L * 0.6, 3); c.quadraticCurveTo(x0 + L * 0.8, 6, -x0, 0); c.stroke(); for (let k = 0; k < 9; k++) { const px = x0 + R() * L, py = y0 + R() * Wd; c.fillStyle = k % 3 ? "#ff7eb6" : "#fff"; for (let p5 = 0; p5 < 5; p5++) { const a = p5 * 1.2566; c.beginPath(); c.arc(px + Math.cos(a) * 1.1, py + Math.sin(a) * 1.1, 0.9, 0, Math.PI * 2); c.fill(); } } break;
      case "synthwave": { c.fillStyle = lin(["#1a0533", "#5b0e7a", "#ff2e97"], true); c.fillRect(x0, y0, L, Wd); c.fillStyle = lin(["#ffe66d", "#ff6b35"], true); c.beginPath(); c.arc(x0 + L * 0.62, 1, 6, Math.PI, 0); c.fill(); c.fillStyle = "#1a0533"; for (let k = 0; k < 3; k++) c.fillRect(x0 + L * 0.62 - 6, -2.5 + k * 1.3, 12, 0.6); c.strokeStyle = "#22e6ff"; c.lineWidth = 0.6; for (let k = 0; k < 4; k++) { c.beginPath(); c.moveTo(x0, 2 + k * 2.6); c.lineTo(-x0, 2 + k * 2.6); c.stroke(); } for (let k = 0; k < 9; k++) { c.beginPath(); c.moveTo(x0 + L * 0.5 + (k - 4) * 1.5, 2); c.lineTo(x0 + L * 0.5 + (k - 4) * 7, -y0); c.stroke(); } break; }
      case "koi": c.fillStyle = "#fbfbf7"; c.fillRect(x0, y0, L, Wd); for (let k = 0; k < 6; k++) { c.fillStyle = k % 3 === 2 ? "#151515" : "#f25c05"; c.beginPath(); c.ellipse(x0 + 4 + R() * (L - 8), y0 + 3 + R() * (Wd - 6), 3 + R() * 4, 2 + R() * 3, R() * 3, 0, Math.PI * 2); c.fill(); } c.strokeStyle = "rgba(0,0,0,0.12)"; c.lineWidth = 0.5; for (let j = 0; j < Wd; j += 3) for (let i = (j / 3) % 2 ? 1.5 : 0; i < L; i += 3) { c.beginPath(); c.arc(x0 + i, y0 + j, 1.5, 0, Math.PI); c.stroke(); } break;
      case "graffiti": c.fillStyle = "#23252b"; c.fillRect(x0, y0, L, Wd); c.lineCap = "round"; for (let k = 0; k < 7; k++) { c.strokeStyle = ["#ff2bd6", "#22e6ff", "#ffe066", "#39ff88", "#ff6b35"][k % 5]; c.lineWidth = 1.2 + R() * 1.6; c.beginPath(); let x = x0 + R() * L, y = y0 + R() * Wd; c.moveTo(x, y); for (let q = 0; q < 3; q++) { const nx = x + (R() - 0.5) * 16, ny = y + (R() - 0.5) * 12; c.quadraticCurveTo(x + (R() - 0.5) * 10, y + (R() - 0.5) * 10, nx, ny); x = nx; y = ny; } c.stroke(); } for (let k = 0; k < 10; k++) { c.fillStyle = "rgba(255,255,255,0.8)"; c.fillRect(x0 + R() * L, y0 + R() * Wd, 0.7, 0.7); } break;
      case "stealth": c.fillStyle = "#16171b"; c.fillRect(x0, y0, L, Wd); c.fillStyle = "#24262c"; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x0 + L * 0.45, 0); c.lineTo(x0, -y0); c.fill(); c.fillStyle = "#1d1f24"; c.beginPath(); c.moveTo(-x0, y0); c.lineTo(x0 + L * 0.55, 0); c.lineTo(-x0, -y0); c.fill(); c.strokeStyle = "#ff1e3c"; c.lineWidth = 0.9; c.beginPath(); c.moveTo(x0, y0 + 3); c.lineTo(x0 + L * 0.4, -1); c.lineTo(-x0, -1); c.stroke(); break;
      case "toxic": { const t = performance.now() / 1000; c.fillStyle = "#101a0c"; c.fillRect(x0, y0, L, Wd); c.fillStyle = `rgba(120,255,60,${0.55 + 0.25 * Math.sin(t * 3)})`; for (let k = 0; k < 8; k++) { const x = x0 + 3 + k * 5.6, len = 4 + ((Math.sin(t * 2 + k * 1.7) + 1) * 0.5) * 8; c.beginPath(); c.moveTo(x - 2, y0); c.lineTo(x + 2, y0); c.lineTo(x + 1, y0 + len); c.arc(x, y0 + len, 1.4, 0, Math.PI); c.lineTo(x - 2, y0); c.fill(); c.beginPath(); c.moveTo(x - 2, -y0); c.lineTo(x + 2, -y0); c.lineTo(x + 1, -y0 - len * 0.7); c.arc(x, -y0 - len * 0.7, 1.4, Math.PI, 0, true); c.fill(); } c.fillStyle = "rgba(180,255,120,0.9)"; c.beginPath(); c.arc(x0 + L * 0.5, 0, 3.2, 0, Math.PI * 2); c.fill(); break; }
      case "nebula": { const t = performance.now() / 1000; c.fillStyle = "#070818"; c.fillRect(x0, y0, L, Wd); for (let k = 0; k < 3; k++) { const cx = x0 + L * (0.25 + 0.25 * k) + Math.sin(t * 0.7 + k * 2) * 5, cy = Math.cos(t * 0.5 + k) * 4, g = c.createRadialGradient(cx, cy, 0, cx, cy, 14); g.addColorStop(0, `hsla(${(hue + k * 110) % 360},95%,65%,0.75)`); g.addColorStop(1, "rgba(0,0,0,0)"); c.fillStyle = g; c.fillRect(x0, y0, L, Wd); } for (let k = 0; k < 20; k++) { const tw = 0.4 + 0.6 * Math.abs(Math.sin(t * 2 + k)); c.fillStyle = `rgba(255,255,255,${tw})`; c.fillRect(x0 + R() * L, y0 + R() * Wd, 0.9, 0.9); } break; }
      case "matrix": { const t = performance.now() / 1000; c.fillStyle = "#020a04"; c.fillRect(x0, y0, L, Wd); c.font = "700 4px monospace"; c.textAlign = "center"; c.textBaseline = "middle"; for (let col = 0; col < 10; col++) { const speed = 6 + ((col * 37) % 7), head = ((t * speed + col * 13) % (Wd + 14)) + y0 - 6; for (let k = 0; k < 6; k++) { const y = head - k * 4; if (y < y0 - 2 || y > -y0 + 2) continue; c.fillStyle = k ? `rgba(40,255,90,${0.8 - k * 0.13})` : "#d8ffe0"; c.fillText(String.fromCharCode(0x30a0 + ((col * 7 + k * 5 + Math.floor(t * 8)) % 90)), x0 + 2.3 + col * 4.6, y); } } break; }
      case "inferno": { const t = performance.now() / 1000; c.fillStyle = lin(["#2a0600", "#140300"]); c.fillRect(x0, y0, L, Wd); for (const [col, sc] of [["#ff3d00", 1], ["#ff9100", 0.72], ["#ffe082", 0.42]]) { c.fillStyle = col; c.beginPath(); c.moveTo(-x0, y0 * sc); for (let k = 0; k <= 12; k++) { const yy = y0 * sc + (k / 12) * (-2 * y0 * sc), flick = Math.sin(t * 9 + k * 1.9) * 3 + Math.sin(t * 5.3 + k) * 2; c.lineTo(-x0 - (L * 0.55 * sc + (k % 2 ? 0 : 6 + flick)), yy); } c.lineTo(-x0, -y0 * sc); c.closePath(); c.fill(); } break; }
      case "prism": { const t = performance.now() / 1000; c.fillStyle = "#e9eef5"; c.fillRect(x0, y0, L, Wd); for (let k = 0; k < 7; k++) { const x = x0 - 10 + ((k * 9 + t * 22) % (L + 20)); c.fillStyle = `hsla(${(k * 51 + hue) % 360},95%,62%,0.8)`; c.beginPath(); c.moveTo(x, y0); c.lineTo(x + 5, y0); c.lineTo(x + 12, -y0); c.lineTo(x + 7, -y0); c.fill(); } c.fillStyle = "rgba(255,255,255,0.55)"; c.beginPath(); c.moveTo(x0, y0); c.lineTo(-x0, 0); c.lineTo(x0, -y0 * 0.2); c.fill(); break; }
      case "gpLegend": {   // MYTHIC, open-wheel racer only: black and gold, a chrome sweep and sparkles
        const t = performance.now() / 1000;
        c.fillStyle = lin(["#050505", "#15120a", "#050505"], true); c.fillRect(x0, y0, L, Wd);
        c.fillStyle = lin(["#7a5a12", "#ffe38a", "#c9971f", "#fff4c7", "#a67c1b"]); c.fillRect(x0, -1.3, L, 2.6);
        c.fillRect(x0, y0 + 3, L, 0.8); c.fillRect(x0, -y0 - 3.8, L, 0.8);
        c.fillStyle = "#ffd76a"; for (const sg of [-1, 1]) { c.beginPath(); c.moveTo(-x0, sg * 2); c.lineTo(-x0 - 12, sg * 7); c.lineTo(-x0 - 14, sg * 5.5); c.lineTo(-x0 - 4, sg * 1.2); c.fill(); }
        const sx = x0 - 12 + ((t * 30) % (L + 24)); const sg2 = c.createLinearGradient(sx - 6, 0, sx + 6, 0); sg2.addColorStop(0, "rgba(255,255,255,0)"); sg2.addColorStop(0.5, "rgba(255,248,220,0.75)"); sg2.addColorStop(1, "rgba(255,255,255,0)"); c.fillStyle = sg2; c.fillRect(x0, y0, L, Wd);
        for (let k = 0; k < 7; k++) { const tw = Math.max(0, Math.sin(t * 3 + k * 2.1)); if (tw < 0.3) continue; const px = x0 + R() * L, py = y0 + R() * Wd, r = 1.6 * tw; c.fillStyle = `rgba(255,236,160,${tw})`; c.beginPath(); c.moveTo(px, py - r); c.lineTo(px + r * 0.3, py); c.lineTo(px, py + r); c.lineTo(px - r * 0.3, py); c.fill(); c.beginPath(); c.moveTo(px - r, py); c.lineTo(px, py + r * 0.3); c.lineTo(px + r, py); c.lineTo(px, py - r * 0.3); c.fill(); }
        break;
      }
      // ---- fourth wave ----
      case "ocean": { const t = performance.now() / 1000; c.fillStyle = lin(["#0369a1", "#0ea5e9"], true); c.fillRect(x0, y0, L, Wd); for (let row = 0; row < 3; row++) { c.strokeStyle = `rgba(255,255,255,${0.75 - row * 0.2})`; c.lineWidth = 1.3; c.beginPath(); for (let i = 0; i <= L; i += 2) { const yy = y0 + 5 + row * 6 + Math.sin(i / 4 + t * 2 + row) * 1.6; i ? c.lineTo(x0 + i, yy) : c.moveTo(x0 + i, yy); } c.stroke(); } break; }
      case "bumblebee": c.fillStyle = "#ffcc00"; c.fillRect(x0, y0, L, Wd); c.fillStyle = "#141414"; for (let k = 0; k < 4; k++) c.fillRect(x0 + 6 + k * 10, y0, 4.5, Wd); c.fillRect(-x0 - 5, y0, 5, Wd); break;
      case "marble": { c.fillStyle = "#f4f1ea"; c.fillRect(x0, y0, L, Wd); c.lineCap = "round"; for (let k = 0; k < 6; k++) { c.strokeStyle = k % 3 ? "rgba(90,90,100,0.45)" : "rgba(196,160,80,0.8)"; c.lineWidth = k % 3 ? 0.7 : 1.1; c.beginPath(); let x = x0 + R() * L, y = y0; c.moveTo(x, y); for (let q = 0; q < 5; q++) { x += (R() - 0.5) * 10; y += Wd / 5; c.lineTo(x, y); } c.stroke(); } break; }
      case "tron": { const t = performance.now() / 1000; c.fillStyle = "#05070d"; c.fillRect(x0, y0, L, Wd); c.strokeStyle = "rgba(34,230,255,0.25)"; c.lineWidth = 0.5; for (let i = 0; i < L; i += 4) { c.beginPath(); c.moveTo(x0 + i, y0); c.lineTo(x0 + i, -y0); c.stroke(); } for (let j = 0; j < Wd; j += 4) { c.beginPath(); c.moveTo(x0, y0 + j); c.lineTo(-x0, y0 + j); c.stroke(); } const px = x0 + ((t * 40) % L); c.strokeStyle = "#22e6ff"; c.shadowColor = "#22e6ff"; c.shadowBlur = 6; c.lineWidth = 1.4; c.beginPath(); c.moveTo(x0, y0 + 3); c.lineTo(-x0, y0 + 3); c.moveTo(x0, -y0 - 3); c.lineTo(-x0, -y0 - 3); c.stroke(); c.fillStyle = "#fff"; c.fillRect(px - 2, y0 + 2.2, 4, 1.6); c.fillRect(-x0 - (px - x0) - 2, -y0 - 3.8, 4, 1.6); c.shadowBlur = 0; break; }
      case "lavalamp": { const t = performance.now() / 1000; c.fillStyle = lin(["#3b0764", "#7e22ce"], true); c.fillRect(x0, y0, L, Wd); c.fillStyle = "#ff8a3d"; for (let k = 0; k < 5; k++) { const cx = x0 + 5 + k * 9 + Math.sin(t * 0.7 + k) * 3, cy = Math.sin(t * (0.6 + k * 0.15) + k * 2) * (Wd * 0.3), r = 2.8 + 1.4 * Math.sin(t + k); c.beginPath(); c.ellipse(cx, cy, r * 1.2, r, 0, 0, Math.PI * 2); c.fill(); } break; }
      case "celestial": {   // MYTHIC: day turns to night across the car, with a sun, a moon and twinkling stars
        const t = performance.now() / 1000, ph = (Math.sin(t * 0.6) + 1) / 2;
        const sky = c.createLinearGradient(x0, 0, -x0, 0); sky.addColorStop(0, `hsl(${30 + ph * 10},90%,${55 - ph * 10}%)`); sky.addColorStop(0.5, "#6d28d9"); sky.addColorStop(1, "#0b1030"); c.fillStyle = sky; c.fillRect(x0, y0, L, Wd);
        const sg = c.createRadialGradient(x0 + 9, 0, 0, x0 + 9, 0, 9); sg.addColorStop(0, "#fff7c2"); sg.addColorStop(0.5, "#ffc93c"); sg.addColorStop(1, "rgba(255,150,40,0)"); c.fillStyle = sg; c.beginPath(); c.arc(x0 + 9, 0, 9, 0, Math.PI * 2); c.fill();
        c.fillStyle = "#f1f5f9"; c.beginPath(); c.arc(-x0 - 8, -2, 4, 0, Math.PI * 2); c.fill(); c.fillStyle = "#0b1030"; c.beginPath(); c.arc(-x0 - 6.4, -3, 3.5, 0, Math.PI * 2); c.fill();
        for (let k = 0; k < 12; k++) { const tw = Math.abs(Math.sin(t * 2.5 + k * 1.7)); c.fillStyle = `rgba(255,255,255,${tw})`; c.fillRect(x0 + L * 0.5 + R() * L * 0.5, y0 + R() * Wd, 1, 1); }
        c.strokeStyle = "rgba(255,236,160,0.9)"; c.lineWidth = 0.8; c.beginPath(); c.moveTo(x0, y0 + 1); c.lineTo(-x0, y0 + 1); c.moveTo(x0, -y0 - 1); c.lineTo(-x0, -y0 - 1); c.stroke();
        break;
      }
      case "eclipse": {   // MYTHIC, animated: a black sun with its golden corona turning, stars around
        const t = performance.now() / 1000, cx = x0 + L * 0.42;
        c.fillStyle = lin(["#020205", "#0d0a1a", "#020205"], true); c.fillRect(x0, y0, L, Wd);
        for (let k = 0; k < 14; k++) { c.fillStyle = `rgba(255,255,255,${0.3 + 0.7 * Math.abs(Math.sin(t * 2 + k))})`; c.fillRect(x0 + R() * L, y0 + R() * Wd, 0.8, 0.8); }
        const g = c.createRadialGradient(cx, 0, 2, cx, 0, 9); g.addColorStop(0, "rgba(255,230,140,0)"); g.addColorStop(0.45, "rgba(255,210,90,0.95)"); g.addColorStop(1, "rgba(255,150,30,0)");
        c.fillStyle = g; c.beginPath(); c.arc(cx, 0, 9, 0, Math.PI * 2); c.fill();
        c.strokeStyle = "rgba(255,220,120,0.8)"; c.lineWidth = 0.7;
        for (let k = 0; k < 10; k++) { const a = t * 0.8 + (k / 10) * Math.PI * 2; c.beginPath(); c.moveTo(cx + Math.cos(a) * 5, Math.sin(a) * 5); c.lineTo(cx + Math.cos(a) * (8 + 2 * Math.sin(t * 4 + k)), Math.sin(a) * (8 + 2 * Math.sin(t * 4 + k))); c.stroke(); }
        c.fillStyle = "#000"; c.beginPath(); c.arc(cx, 0, 4.2, 0, Math.PI * 2); c.fill();
        break;
      }
      case "storm": {   // animated: dark clouds, rain streaks and lightning flashes
        const t = performance.now() / 1000, flash = Math.sin(t * 2.3) > 0.985 || Math.sin(t * 5.1 + 2) > 0.995;
        c.fillStyle = flash ? "#c7d2fe" : lin(["#1e2235", "#363c58", "#1e2235"], true); c.fillRect(x0, y0, L, Wd);
        c.strokeStyle = "rgba(170,190,255,0.5)"; c.lineWidth = 0.6;
        for (let k = 0; k < 14; k++) { const x = x0 + ((k * 7.3 + t * 60) % L), y = y0 + ((k * 5.1) % Wd); c.beginPath(); c.moveTo(x, y); c.lineTo(x - 3, y + 2); c.stroke(); }
        if (flash || (t * 3) % 2 < 0.15) { c.strokeStyle = "#fffbe6"; c.lineWidth = 1.2; c.shadowColor = "#fff"; c.shadowBlur = 8; c.beginPath(); c.moveTo(x0 + L * 0.7, y0); c.lineTo(x0 + L * 0.55, -1); c.lineTo(x0 + L * 0.62, 1); c.lineTo(x0 + L * 0.45, -y0); c.stroke(); c.shadowBlur = 0; }
        break;
      }
      case "oceanL": {  // animated: rolling waves
        const t = performance.now() / 1000;
        c.fillStyle = lin(["#0369a1", "#0ea5e9", "#0369a1"], true); c.fillRect(x0, y0, L, Wd);
        for (let w = 0; w < 3; w++) { c.strokeStyle = w === 1 ? "rgba(255,255,255,0.85)" : "rgba(186,230,253,0.6)"; c.lineWidth = 1; c.beginPath(); for (let x = 0; x <= L; x += 2) { const yy = y0 + 3 + w * (Wd - 6) / 2 + Math.sin(x * 0.35 + t * 3 + w) * 1.5; x ? c.lineTo(x0 + x, yy) : c.moveTo(x0 + x, yy); } c.stroke(); }
        break;
      }
      case "discoL": {  // animated: a dance floor
        const t = performance.now() / 1000, n = Math.floor(t * 3);
        for (let i = 0; i < 6; i++) for (let j = 0; j < 4; j++) { c.fillStyle = DISCO[(i * 3 + j * 2 + n) % DISCO.length]; c.fillRect(x0 + i * (L / 6), y0 + j * (Wd / 4), L / 6 + 0.3, Wd / 4 + 0.3); }
        c.fillStyle = "rgba(255,255,255,0.25)"; c.fillRect(x0, y0, L, Wd / 4);
        break;
      }
      case "ecg": {     // animated: a heart monitor trace running down the car
        const t = performance.now() / 1000;
        c.fillStyle = "#041b12"; c.fillRect(x0, y0, L, Wd);
        c.strokeStyle = "rgba(57,255,136,0.18)"; c.lineWidth = 0.4; for (let x = 0; x < L; x += 4) { c.beginPath(); c.moveTo(x0 + x, y0); c.lineTo(x0 + x, -y0); c.stroke(); }
        c.strokeStyle = "#39ff88"; c.lineWidth = 1.1; c.shadowColor = "#39ff88"; c.shadowBlur = 5; c.beginPath();
        for (let x = 0; x <= L; x += 1) { const ph = ((x / L) * 2 - t * 1.2) % 1, p2 = ph < 0 ? ph + 1 : ph; const yy = p2 > 0.4 && p2 < 0.45 ? -5 : p2 > 0.45 && p2 < 0.5 ? 4 : p2 > 0.5 && p2 < 0.53 ? -2 : 0; x ? c.lineTo(x0 + x, yy) : c.moveTo(x0 + x, yy); }
        c.stroke(); c.shadowBlur = 0;
        break;
      }
      case "hyperdrive": {   // MYTHIC, animated: stars streaking past at warp speed
        const t = performance.now() / 1000;
        c.fillStyle = lin(["#020617", "#1e1b4b", "#020617"], true); c.fillRect(x0, y0, L, Wd);
        for (let k = 0; k < 16; k++) { const sp = 40 + (k % 5) * 25, x = -x0 - ((k * 13.7 + t * sp) % (L + 12)), y = y0 + 1 + ((k * 7.9) % (Wd - 2)), len = 3 + (k % 4) * 2.5; const g = c.createLinearGradient(x, 0, x + len, 0); g.addColorStop(0, "#fff"); g.addColorStop(1, `hsla(${(hue + k * 25) % 360},100%,70%,0)`); c.fillStyle = g; c.fillRect(x, y, len, 0.9); }
        c.fillStyle = `hsla(${hue},100%,70%,0.25)`; c.fillRect(x0, -0.8, L, 1.6);
        break;
      }
      case "midnight": c.fillStyle = lin(["#0b1026", "#1e2a5a", "#0b1026"], true); c.fillRect(x0, y0, L, Wd); c.fillStyle = "#e2e8f0"; c.beginPath(); c.moveTo(-x0, -1.5); c.lineTo(x0 + L * 0.3, -3.5); c.lineTo(x0 + L * 0.3, 3.5); c.lineTo(-x0, 1.5); c.fill(); c.fillStyle = "#38bdf8"; c.fillRect(x0 + L * 0.25, -1, L * 0.5, 2); break;
    }
  }
  // store trails: little sparks / hearts / stars left behind the car
  function trailShape(c, kind, x, y, r, alpha, k) {
    c.save(); c.globalAlpha = Math.max(0, alpha); c.translate(x, y);
    if (kind === "bats") {   // animated: flapping bats
      const f = Math.sin(performance.now() / 70 + k * 1.7); c.fillStyle = "#2e1748"; c.strokeStyle = "rgba(190,140,255,0.95)"; c.lineWidth = 0.9;
      c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(-r * 0.7, -r * (0.2 + 0.7 * f), -r * 1.5, -r * 0.1 * f); c.quadraticCurveTo(-r * 0.8, r * 0.1, 0, r * 0.25);
      c.quadraticCurveTo(r * 0.8, r * 0.1, r * 1.5, -r * 0.1 * f); c.quadraticCurveTo(r * 0.7, -r * (0.2 + 0.7 * f), 0, 0); c.fill(); c.stroke();
      c.beginPath(); c.arc(0, 0, r * 0.28, 0, Math.PI * 2); c.fill();
    } else if (kind === "pumpkins") {
      c.rotate(k * 0.4); c.fillStyle = "#ff7a00"; c.beginPath(); c.ellipse(0, 0, r * 0.75, r * 0.6, 0, 0, Math.PI * 2); c.fill();
      c.strokeStyle = "#c2410c"; c.lineWidth = 0.6; c.beginPath(); c.ellipse(0, 0, r * 0.3, r * 0.6, 0, 0, Math.PI * 2); c.stroke(); c.fillStyle = "#3f6212"; c.fillRect(-r * 0.1, -r * 0.8, r * 0.2, r * 0.3);
    } else if (kind === "ghosts") {   // animated: little ghosts that wobble and fade
      const w = Math.sin(performance.now() / 160 + k); c.translate(w * r * 0.3, 0); c.fillStyle = "rgba(240,244,255,0.9)"; c.shadowColor = "#b48cff"; c.shadowBlur = 6;
      c.beginPath(); c.arc(0, -r * 0.2, r * 0.6, Math.PI, 0); c.lineTo(r * 0.6, r * 0.6); c.lineTo(r * 0.3, r * 0.4); c.lineTo(0, r * 0.6); c.lineTo(-r * 0.3, r * 0.4); c.lineTo(-r * 0.6, r * 0.6); c.closePath(); c.fill();
      c.shadowBlur = 0; c.fillStyle = "#1a1025"; c.fillRect(-r * 0.3, -r * 0.35, r * 0.18, r * 0.25); c.fillRect(r * 0.12, -r * 0.35, r * 0.18, r * 0.25);
    } else if (kind === "souls") {   // MYTHIC, animated: blue-green soul flames rising and twisting
      const t = performance.now() / 1000; c.translate(Math.sin(t * 4 + k) * r * 0.35, -((t * 1.2 + k * 0.3) % 1) * r * 0.8);
      const g = c.createRadialGradient(0, r * 0.2, 0, 0, 0, r * 1.1); g.addColorStop(0, "rgba(220,255,250,0.95)"); g.addColorStop(0.4, "rgba(60,230,200,0.75)"); g.addColorStop(1, "rgba(40,80,255,0)");
      c.fillStyle = g; c.shadowColor = "#3ce6c8"; c.shadowBlur = 10; c.beginPath(); c.moveTo(0, -r * 1.2); c.quadraticCurveTo(r * 0.9, 0, 0, r * 0.7); c.quadraticCurveTo(-r * 0.9, 0, 0, -r * 1.2); c.fill();
    } else if (kind === "hearts") {
      c.fillStyle = "#ff4f7b"; c.beginPath(); c.moveTo(0, r * 0.9);
      c.bezierCurveTo(-r * 1.4, -r * 0.2, -r * 0.6, -r * 1.2, 0, -r * 0.4); c.bezierCurveTo(r * 0.6, -r * 1.2, r * 1.4, -r * 0.2, 0, r * 0.9); c.fill();
    } else if (kind === "stars") {
      c.fillStyle = "#ffe066"; c.rotate(k * 0.7); c.beginPath();
      for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2, rr = i % 2 ? r * 0.45 : r; c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
      c.closePath(); c.fill();
    } else if (kind === "bubbles") { c.strokeStyle = "rgba(170,225,255,0.95)"; c.lineWidth = 1.5; c.beginPath(); c.arc(0, 0, r * 0.7, 0, Math.PI * 2); c.stroke(); c.fillStyle = "rgba(255,255,255,0.8)"; c.fillRect(-r * 0.3, -r * 0.35, 1.5, 1.5); }
    else if (kind === "notes") { c.fillStyle = ["#ff4fd8", "#22e6ff", "#ffe066"][k % 3]; c.font = `700 ${Math.round(r * 2.2)}px sans-serif`; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(k % 2 ? "♪" : "♫", 0, 0); }
    else if (kind === "bolts") { c.fillStyle = "#ffe066"; c.rotate(k); c.beginPath(); c.moveTo(r * 0.5, -r); c.lineTo(-r * 0.2, 0); c.lineTo(r * 0.2, 0); c.lineTo(-r * 0.5, r); c.lineTo(0, -r * 0.1); c.lineTo(-r * 0.3, -r * 0.1); c.closePath(); c.fill(); }
    else if (kind === "fire") { const g = c.createRadialGradient(0, 0, 0, 0, 0, r); g.addColorStop(0, "#fff3a0"); g.addColorStop(0.45, "#ff8a1f"); g.addColorStop(1, "rgba(220,40,10,0)"); c.fillStyle = g; c.beginPath(); c.arc(0, 0, r * 1.2, 0, Math.PI * 2); c.fill(); }
    else if (kind === "snow") { c.strokeStyle = "rgba(235,248,255,0.95)"; c.lineWidth = 1.3; c.rotate(k * 0.5); for (let a = 0; a < 3; a++) { c.beginPath(); c.moveTo(-r * Math.cos(a * 1.047), -r * Math.sin(a * 1.047)); c.lineTo(r * Math.cos(a * 1.047), r * Math.sin(a * 1.047)); c.stroke(); } }
    else if (kind === "coins") { c.fillStyle = "#f5c518"; c.strokeStyle = "#a07800"; c.lineWidth = 1; c.beginPath(); c.ellipse(0, 0, r * 0.7 * Math.abs(Math.cos(k + performance.now() / 150)) + 0.6, r * 0.7, 0, 0, Math.PI * 2); c.fill(); c.stroke(); }
    else if (kind === "petals") { c.fillStyle = ["#ff9ecf", "#ffc3e1", "#ff6fb5"][k % 3]; c.rotate(k * 1.3); c.beginPath(); c.ellipse(0, 0, r * 0.8, r * 0.4, 0, 0, Math.PI * 2); c.fill(); }
    else if (kind === "pixels") { c.fillStyle = ["#ff2bd6", "#22e6ff", "#ffe066", "#39ff88"][k % 4]; c.fillRect(-r * 0.45, -r * 0.45, r * 0.9, r * 0.9); }
    else if (kind === "leaves") { c.fillStyle = ["#e0672a", "#f2a33a", "#b5452a"][k % 3]; c.rotate(k * 1.1); c.beginPath(); c.moveTo(r, 0); c.quadraticCurveTo(0, -r * 0.7, -r, 0); c.quadraticCurveTo(0, r * 0.7, r, 0); c.fill(); }
    else if (kind === "ghost") { c.fillStyle = "rgba(245,245,255,0.9)"; c.beginPath(); c.arc(0, -r * 0.2, r * 0.6, Math.PI, 0); c.lineTo(r * 0.6, r * 0.6); for (let w = 0; w < 3; w++) c.lineTo(r * 0.6 - (w + 0.5) * r * 0.4, r * (w % 2 ? 0.6 : 0.35)); c.lineTo(-r * 0.6, r * 0.6); c.fill(); c.fillStyle = "#222"; c.fillRect(-r * 0.3, -r * 0.35, r * 0.15, r * 0.25); c.fillRect(r * 0.12, -r * 0.35, r * 0.15, r * 0.25); }
    else if (kind === "comet") { const g2 = c.createRadialGradient(0, 0, 0, 0, 0, r * 1.6); g2.addColorStop(0, "#ffffff"); g2.addColorStop(0.3, "#9be7ff"); g2.addColorStop(1, "rgba(60,120,255,0)"); c.fillStyle = g2; c.beginPath(); c.arc(0, 0, r * 1.6, 0, Math.PI * 2); c.fill(); }
    else if (kind === "warp") {   // MYTHIC: rainbow light streaks
      const hue = (performance.now() / 4 + k * 90) % 360; c.strokeStyle = `hsl(${hue},100%,65%)`; c.lineWidth = 2.2; c.shadowColor = c.strokeStyle; c.shadowBlur = 8; c.rotate(k * 0.4);
      c.beginPath(); c.moveTo(-r * 2, 0); c.lineTo(r * 2, 0); c.stroke(); c.fillStyle = "#fff"; c.beginPath(); c.arc(r * 2, 0, 1.4, 0, Math.PI * 2); c.fill();
    }
    else if (kind === "confetti") { c.fillStyle = ["#ff4f7b", "#ffe066", "#22e6ff", "#7dff8a", "#b25cff"][k % 5]; c.rotate(k * 0.9); c.fillRect(-r * 0.55, -r * 0.25, r * 1.1, r * 0.5); }
    else if (kind === "embers") { c.fillStyle = ["#ffb020", "#ff6a1f", "#ffe066"][k % 3]; c.shadowColor = "#ff6a1f"; c.shadowBlur = r; c.beginPath(); c.arc(0, 0, r * 0.38, 0, Math.PI * 2); c.fill(); }
    else if (kind === "checkers") { const q = r * 0.42; for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) { c.fillStyle = (i + j) % 2 ? "#111" : "#fff"; c.fillRect(-q + i * q, -q + j * q, q, q); } }
    else if (kind === "zap") {   // animated: a crackling lightning bolt
      c.strokeStyle = Math.random() < 0.3 ? "#ffffff" : "#7dd3fc"; c.lineWidth = 1.6; c.shadowColor = "#38bdf8"; c.shadowBlur = 8; c.beginPath(); c.moveTo(-r * 1.4, 0);
      for (let s2 = 1; s2 <= 4; s2++) c.lineTo(-r * 1.4 + s2 * r * 0.7, (Math.random() - 0.5) * r * 1.4); c.stroke();
    }
    else if (kind === "beat") {  // animated: hearts that beat
      const sc = 0.75 + 0.35 * Math.max(0, Math.sin(performance.now() / 90 + k)); c.scale(sc, sc);
      c.fillStyle = "#ff2050"; c.beginPath(); c.moveTo(0, r * 0.9); c.bezierCurveTo(-r * 1.4, -r * 0.2, -r * 0.6, -r * 1.2, 0, -r * 0.4); c.bezierCurveTo(r * 0.6, -r * 1.2, r * 1.4, -r * 0.2, 0, r * 0.9); c.fill();
    }
    else if (kind === "galaxyT") {   // animated: twinkling star dust
      const tw = 0.5 + 0.5 * Math.sin(performance.now() / 120 + k * 2.1); c.fillStyle = `hsl(${(250 + k * 40 + performance.now() / 20) % 360},100%,${65 + 20 * tw}%)`; c.shadowColor = c.fillStyle; c.shadowBlur = 6 * tw;
      c.beginPath(); for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2, rr = i % 2 ? r * 0.2 : r * (0.5 + 0.4 * tw); c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } c.closePath(); c.fill();
    }
    else if (kind === "phoenix") {   // MYTHIC, animated: glowing phoenix feathers
      const t = performance.now() / 1000; c.rotate(k * 0.55 + Math.sin(t * 3 + k) * 0.35);
      const g = c.createLinearGradient(-r * 1.6, 0, r * 1.2, 0); g.addColorStop(0, "rgba(255,60,0,0)"); g.addColorStop(0.5, "#ff6a00"); g.addColorStop(1, "#ffe066");
      c.fillStyle = g; c.shadowColor = "#ff8a1f"; c.shadowBlur = 10; c.beginPath(); c.moveTo(r * 1.2, 0); c.quadraticCurveTo(0, -r * 0.9, -r * 1.6, 0); c.quadraticCurveTo(0, r * 0.9, r * 1.2, 0); c.fill();
      c.strokeStyle = "rgba(255,240,180,0.9)"; c.lineWidth = 0.8; c.beginPath(); c.moveTo(r * 1.1, 0); c.lineTo(-r * 1.3, 0); c.stroke();
    }
    else if (kind === "rings") { c.strokeStyle = `rgba(150,220,255,${0.9 - (k % 3) * 0.2})`; c.lineWidth = 1.6; c.beginPath(); c.arc(0, 0, r * (0.45 + 0.3 * (k % 3)), 0, Math.PI * 2); c.stroke(); }
    else if (kind === "cash") { c.rotate(k * 0.6); c.fillStyle = "#1f9d55"; c.fillRect(-r * 0.75, -r * 0.42, r * 1.5, r * 0.84); c.strokeStyle = "#c7f9d4"; c.lineWidth = 0.7; c.strokeRect(-r * 0.6, -r * 0.3, r * 1.2, r * 0.6); c.fillStyle = "#eafff1"; c.font = `800 ${Math.round(r * 0.75)}px sans-serif`; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText("$", 0, 0.5); }
    else if (kind === "hex") { c.fillStyle = k % 2 ? "#f5b800" : "#ffd84d"; c.strokeStyle = "#8a6200"; c.lineWidth = 0.8; c.beginPath(); for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; c.lineTo(Math.cos(a) * r * 0.7, Math.sin(a) * r * 0.7); } c.closePath(); c.fill(); c.stroke(); }
    else if (kind === "dust") { c.fillStyle = "rgba(150,120,80,0.6)"; c.beginPath(); c.arc(0, 0, r * 0.9, 0, Math.PI * 2); c.fill(); }
    else { c.fillStyle = k % 2 ? "#ffd24a" : "#ff8a2a"; c.fillRect(-r * 0.5, -r * 0.5, r, r); }
    c.restore();
  }

  // ======================= Profile / garage =======================
  const prof = { name: "Ace", color: COLORS[0], livery: "stripes", number: 7, team: "" };
  try { Object.assign(prof, JSON.parse(localStorage.getItem("tb-profile") || "{}")); } catch (e) {}
  const nameIn = $("nameIn"), numIn = $("numIn"), codeIn = $("codeIn");
  const teamIn = $("teamIn");
  nameIn.value = prof.name; numIn.value = prof.number; teamIn.value = prof.team || "";
  function saveProfile() {
    prof.name = nameIn.value.trim().slice(0, 12) || "Ace";
    prof.number = clamp(parseInt(numIn.value, 10) || 0, 0, 99);
    prof.team = teamIn.value.trim().slice(0, 20);
    try { localStorage.setItem("tb-profile", JSON.stringify(prof)); } catch (e) {}
    if (S.code) socket.emit("profile", prof);
  }
  const sw = $("swatches");
  for (const c of COLORS) {
    const b = document.createElement("button"); b.type = "button"; b.className = "swatch"; b.style.background = c; b.setAttribute("aria-label", "Color " + c);
    b.addEventListener("click", () => { prof.color = c; refreshGarage(); saveProfile(); sfx("tick"); });
    sw.appendChild(b);
  }
  const lv = $("liveries");
  for (const [k, t] of LIVERIES) {
    const b = document.createElement("button"); b.type = "button"; b.className = "chip"; b.textContent = t; b.dataset.k = k;
    b.addEventListener("click", () => { prof.livery = k; refreshGarage(); saveProfile(); sfx("tick"); });
    lv.appendChild(b);
  }
  const nf = $("numFonts");
  for (const [k, t, f] of NUM_FONTS) {
    const b = document.createElement("button"); b.className = "chip"; b.textContent = "#" + t; b.type = "button"; b.dataset.k = k; b.style.font = f.replace(/[\d.]+px/, "15px");
    b.addEventListener("click", () => { prof.numFont = k; refreshGarage(); saveProfile(); sfx("tick"); });
    nf.appendChild(b);
  }
  function refreshGarage() {
    nf.querySelectorAll(".chip").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.k === (prof.numFont || "race"))));
    sw.querySelectorAll(".swatch").forEach((b) => b.setAttribute("aria-pressed", String(b.style.background && rgbToHex(b.style.background) === prof.color.toLowerCase())));
    lv.querySelectorAll(".chip").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.k === prof.livery)));
  }
  function rgbToHex(rgb) { const m = rgb.match(/\d+/g); return m ? "#" + m.slice(0, 3).map((n) => (+n).toString(16).padStart(2, "0")).join("") : rgb; }
  nameIn.addEventListener("input", saveProfile); numIn.addEventListener("input", saveProfile); teamIn.addEventListener("change", saveProfile);
  refreshGarage();
  // ---- paint editor ----
  const paintCv = $("paintCv"), paintCtx = paintCv.getContext("2d");
  let paintPix = (prof.design && prof.design.length === DW * DH ? prof.design : ".".repeat(DW * DH)).split("");
  let paintColor = "1", paintFillMode = false, paintMirror = true, paintHist = [], painting = false;
  const pal = $("palette");
  [...PAINT.map((col, i) => [i.toString(16), col]), [".", null]].forEach(([v, col]) => {
    const b = document.createElement("button"); b.type = "button"; b.dataset.v = v; b.setAttribute("role", "radio");
    b.setAttribute("aria-label", col ? "Paint " + col : "Eraser"); b.title = col ? col : "Eraser";
    if (col) b.style.background = col; else b.className = "erase";
    b.addEventListener("click", () => { paintColor = v; renderPalette(); });
    pal.appendChild(b);
  });
  function renderPalette() { pal.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === paintColor))); }
  renderPalette();
  function drawPaint() {
    const c = paintCtx, W = paintCv.width, H = paintCv.height, cw = W / DW, ch = H / DH;
    c.clearRect(0, 0, W, H);
    // the car underneath, stretched to fill the canvas
    c.save(); c.translate(W / 2, H / 2); c.scale(W / CAR_LEN, H / CAR_WID); drawCar(c, { color: prof.color, livery: prof.livery, number: numIn.value || prof.number, numFont: prof.numFont }, 0, 0, 0, 1); c.restore();
    for (let i = 0; i < paintPix.length; i++) { const v = paintPix[i]; if (v === ".") continue; c.fillStyle = PAINT[parseInt(v, 16)]; c.fillRect((i % DW) * cw, Math.floor(i / DW) * ch, cw + 0.5, ch + 0.5); }
    c.strokeStyle = "rgba(255,255,255,0.08)"; c.lineWidth = 1; c.beginPath();
    for (let x = 1; x < DW; x++) { c.moveTo(x * cw, 0); c.lineTo(x * cw, H); }
    for (let y = 1; y < DH; y++) { c.moveTo(0, y * ch); c.lineTo(W, y * ch); }
    c.stroke();
  }
  function savePaint() {
    const str = paintPix.join("");
    prof.design = /[0-9a-f]/.test(str) ? str : null;
    saveProfile(); drawPaint();
  }
  // ---- car presets: save your whole look (colour, livery, number, painted design, equipped items) and swap in one tap.
  // Signed in: kept on your account (items included). Guest: kept in this browser (no items).
  const CP = { list: null };
  const cpLocal = () => { try { return JSON.parse(localStorage.getItem("tb-carPresets") || "[]"); } catch (e) { return []; } };
  const cpLocalSave = (l) => { try { localStorage.setItem("tb-carPresets", JSON.stringify(l)); } catch (e) {} };
  function openCarPresets() {
    $("carPresetBox").classList.remove("hidden"); CP.list = A.user ? null : cpLocal();
    if (A.user) socket.emit("carPresets:get");
    $("carPresetNote").textContent = A.user ? "Saves your colour, livery, number, painted design and every item you have on." : "Saves your colour, livery, number and painted design in this browser. Sign in to save your items too.";
    renderCarPresets(); setTimeout(() => $("carPresetName").focus(), 50);
  }
  function lookExtras(eq) {
    const out = {};
    for (const [slot, id] of Object.entries(eq || {})) { const it = A.catalog?.store.find((x) => x.id === id); if (it) out[slot] = it.look; }
    return out;
  }
  function renderCarPresets() {
    const g = $("carPresetGrid"); g.textContent = "";
    if (!CP.list) { g.appendChild(el("p", "preset-note", "Loading...")); return; }
    if (!CP.list.length) { g.appendChild(el("p", "preset-note", "No car presets yet. Set up a look, give it a name and save it.")); return; }
    for (const P of CP.list) {
      const card = el("div", "car-preset"), cv = document.createElement("canvas"); cv.width = 180; cv.height = 96;
      const c2 = cv.getContext("2d"); drawCar(c2, { color: P.color, livery: P.livery, number: P.number, design: P.design, extras: lookExtras(P.equipped) }, 90, 48, 0, 2.1);
      const n = Object.keys(P.equipped || {}).length;
      card.append(cv, el("b", "", P.name), el("small", "", `#${P.number} · ${P.livery}${n ? ` · ${n} item${n === 1 ? "" : "s"}` : ""}`));
      const row = el("div", "sec-row"), use = el("button", "btn go", "Use"), del = el("button", "btn ghost", "🗑"); use.type = del.type = "button"; del.setAttribute("aria-label", `Delete ${P.name}`);
      use.addEventListener("click", () => applyCarPreset(P));
      del.addEventListener("click", () => { if (del.dataset.sure !== "1") { del.dataset.sure = "1"; del.textContent = "Sure?"; return; } if (A.user) socket.emit("carPresets:delete", P.name); else { CP.list = CP.list.filter((x) => x !== P); cpLocalSave(CP.list); renderCarPresets(); } });
      row.append(use, del); card.appendChild(row); g.appendChild(card);
    }
  }
  function applyCarPreset(P) {
    prof.color = P.color; prof.livery = P.livery; numIn.value = P.number;
    paintPix = (P.design && P.design.length === DW * DH ? P.design : ".".repeat(DW * DH)).split("");
    refreshGarage(); savePaint();
    if (A.user && P.equipped) socket.emit("carPresets:apply", P.name);
    popup(`🚗 Now driving: ${P.name}`); sfx("tick");
  }
  setTimeout(() => socket.on("carPresets", (l) => { if (l) { CP.list = l; renderCarPresets(); } }), 0);    // (the socket is made further down)
  $("carPresetBtn").addEventListener("click", openCarPresets);
  $("carPresetClose").addEventListener("click", () => $("carPresetBox").classList.add("hidden"));
  $("carPresetForm").addEventListener("submit", (e) => {
    e.preventDefault(); saveProfile();
    const name = $("carPresetName").value.trim(); if (!name) return popup("Give the preset a name", true);
    const P = { name, color: prof.color, livery: prof.livery, number: prof.number, design: prof.design };
    if (A.user) socket.emit("carPresets:save", P);
    else { CP.list = [...cpLocal().filter((x) => x.name.toLowerCase() !== name.toLowerCase()), P].slice(-20); cpLocalSave(CP.list); renderCarPresets(); }
    $("carPresetName").value = ""; popup(`💾 Saved "${name}"`);
  });
  $("carPresetName").addEventListener("keydown", (e) => e.stopPropagation());
  const cellAt = (e) => { const r = paintCv.getBoundingClientRect(); return [clamp(Math.floor(((e.clientX - r.left) / r.width) * DW), 0, DW - 1), clamp(Math.floor(((e.clientY - r.top) / r.height) * DH), 0, DH - 1)]; };
  function paintCell(x, y) {
    paintPix[y * DW + x] = paintColor;
    if (paintMirror) paintPix[(DH - 1 - y) * DW + x] = paintColor;       // mirror left/right side of the car
  }
  function floodFill(x, y) {
    const from = paintPix[y * DW + x]; if (from === paintColor) return;
    const st = [[x, y]];
    while (st.length) { const [a, b] = st.pop(); if (a < 0 || b < 0 || a >= DW || b >= DH || paintPix[b * DW + a] !== from) continue; paintPix[b * DW + a] = paintColor; st.push([a + 1, b], [a - 1, b], [a, b + 1], [a, b - 1]); }
  }
  paintCv.addEventListener("pointerdown", (e) => {
    paintHist.push(paintPix.join("")); if (paintHist.length > 40) paintHist.shift();
    const [x, y] = cellAt(e);
    if (paintFillMode) { floodFill(x, y); savePaint(); return; }
    painting = true; paintCv.setPointerCapture(e.pointerId); paintCell(x, y); drawPaint();
  });
  paintCv.addEventListener("pointermove", (e) => { if (!painting) return; const [x, y] = cellAt(e); paintCell(x, y); drawPaint(); });
  const endPaint = () => { if (painting) { painting = false; savePaint(); } };
  paintCv.addEventListener("pointerup", endPaint); paintCv.addEventListener("pointercancel", endPaint);
  $("paintFill").addEventListener("click", () => { paintFillMode = !paintFillMode; $("paintFill").setAttribute("aria-pressed", String(paintFillMode)); });
  $("paintMirror").addEventListener("click", () => { paintMirror = !paintMirror; $("paintMirror").setAttribute("aria-pressed", String(paintMirror)); });
  $("paintUndo").addEventListener("click", () => { if (paintHist.length) { paintPix = paintHist.pop().split(""); savePaint(); } });
  $("paintClear").addEventListener("click", () => { paintHist.push(paintPix.join("")); paintPix = ".".repeat(DW * DH).split(""); savePaint(); });
  $("paintBox").addEventListener("toggle", drawPaint);
  sw.addEventListener("click", () => setTimeout(drawPaint)); lv.addEventListener("click", () => setTimeout(drawPaint));
  drawPaint();
  const pv = $("carPreview"), pctx = pv.getContext("2d");
  function drawPreview(now) {
    pctx.setTransform(1, 0, 0, 1, 0, 0); pctx.clearRect(0, 0, pv.width, pv.height);
    const k = pv.width / 300; pctx.setTransform(k, 0, 0, k, 0, 0);          // (the canvas is 2x for a sharp big preview: same car)
    const spin = reducedMotion ? -0.35 : -0.35 + Math.sin(now / 900) * 0.25;
    drawCar(pctx, { color: prof.color, livery: prof.livery, number: numIn.value || prof.number, numFont: prof.numFont, design: prof.design, extras: A.extras }, 150, 92, spin, 3.2, { trailPreview: true });
  }

  // ======================= Networking + state =======================
  const S = {
    screen: "menu", code: null, me: null, host: false, lobby: null, track: null, race: null, cars: new Map(),
    myCar: null, standings: [], order: "normal", box: false, xp: null, offer: null, camTarget: null,
    reacted: false, lightsOutAt: 0, particles: [], skids: [], popups: [], shake: 0, results: null, stroke: null,
  };
  const socket = io();
  const menuErr = $("menuErr");
  const inv = new URLSearchParams(location.search).get("room");
  if (inv) codeIn.value = inv.toUpperCase().slice(0, 4);
  $("soloBtn").addEventListener("click", () => { saveProfile(); S.solo = true; S.tutorial = false; socket.emit("create", prof); });
  $("quickBtn").addEventListener("click", () => { saveProfile(); S.solo = false; S.tutorial = false; socket.emit("quickPlay", prof); });
  $("tutBtn").addEventListener("click", () => startTutorial());
  $("createBtn").addEventListener("click", () => { saveProfile(); S.solo = false; socket.emit("create", prof); });
  $("pubBtn").addEventListener("click", () => { saveProfile(); S.solo = false; socket.emit("create", prof, { public: true }); });
  // players online + the public lobby list (the server sends updates while you're on the menu)
  socket.on("menuInfo", (m) => { S.menu = m; renderMenuInfo(); });
  socket.on("connect", () => {
    socket.emit("menuInfo"); socket.emit("catalog");
    let tok = null; try { tok = localStorage.getItem("tb-token"); } catch (e) {}
    if (tok) socket.emit("auth:resume", { token: tok, backup: backupFor(lastAcct()) });
  });

  // ======================= Accounts: sign in, stats, achievements, store =======================
  // Backups: the server sends a signed copy of your account after every change and we keep it in
  // this browser. If the server forgot everyone (it restarts clean after every update), we hand it back.
  function backups() { try { return JSON.parse(localStorage.getItem("tb-backups") || "{}"); } catch (e) { return {}; } }
  function backupFor(id) { return id ? backups()[id] || null : null; }
  function lastAcct() { try { return localStorage.getItem("tb-last") || null; } catch (e) { return null; } }
  function keepBackup(id, blob) {
    if (!id || !blob) return;
    try { const b = backups(); b[id] = blob; localStorage.setItem("tb-backups", JSON.stringify(b)); localStorage.setItem("tb-last", id); } catch (e) {}
  }
  function extrasFor(u) {
    if (!u || !A.catalog) return null;
    const o = {};
    for (const [slot, id] of Object.entries(u.equipped || {})) { const it = A.catalog.store.find((x) => x.id === id); if (it && u.owned.includes(id)) o[slot] = it.look; }
    return Object.keys(o).length ? o : null;
  }
  // ---- Broadcast menu bits: the big hello, the stats strip, the streak strip and the live ticker ----
  function renderBroadcast() {
    const u = A.user, name = (nameIn.value || prof.name || "Ace").trim() || "Ace";
    $("heroName").textContent = name;
    const P = (u?.carPresets || []).find((x) => x.color === prof.color && x.livery === prof.livery && Number(x.number) === Number(prof.number));
    $("heroSub").textContent = `Your car${P ? ` · ${P.name}` : ""} · #${numIn.value || prof.number}`;
    const st = $("bcStats"); st.classList.toggle("hidden", !u); st.textContent = "";
    if (u) for (const [v, l, c] of [[u.stats.races || 0, "Races"], [u.stats.wins || 0, "Wins"], [u.stats.poles || 0, "Poles"], [`${u.loginStreak?.streak || 0}🔥`, "Day streak", 1]]) {
      const d = el("div", "bc-stat" + (c ? " alt" : "")); d.append(el("b", "", typeof v === "number" ? v.toLocaleString() : v), el("small", "", l)); st.appendChild(d);
    }
    const sk = $("bcStreak"); sk.classList.toggle("hidden", !u?.loginStreak); sk.textContent = "";
    if (u?.loginStreak) sk.appendChild(streakStrip(u.loginStreak.days, u.loginStreak.cycleDay, u.loginStreak.today));
    // ticker: what's going on right now
    const m = S.menu, items = [], E = (x) => String(x ?? "").replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
    if (m) { items.push(`🟢 <b>${E(m.online)}</b> online · <b>${E(m.racing)}</b> racing right now`); if (m.lobbies?.length) items.push(`🏁 <b>${m.lobbies.length}</b> public room${m.lobbies.length === 1 ? "" : "s"} open`); if (m.event) items.push(`${E(m.event.icon || "🎉")} ${m.event.live ? "Weekend event on now" : "Next event"}: <b>${E(m.event.name)}</b>`); }
    if (u?.wheel?.free) items.push("🎡 Your <b>free daily spin</b> is ready (Profile › Casino)");
    if (u?.pass) items.push(`🎟️ Season pass: <b>tier ${u.pass.tier}</b> of ${u.pass.tiers}`);
    if (u?.ranked) { const R = u.ranked; items.push(`🏆 Ranked: <b>${E(R.rank?.label || "Unranked")}</b>${R.sr != null ? ` · ${E(R.sr)} SR` : ""}`); }
    const tw = $("totwName")?.textContent; if (tw && tw !== "Loading...") items.push(`🌟 Track of the week: <b>${E(tw)}</b>`);
    if (!items.length) items.push("🏁 Welcome to Scribble GP");
    const box = $("bcItems"), html = items.map((x) => `<span>${x}</span>`).join("");
    if (box.dataset.h !== html) { box.dataset.h = html; box.innerHTML = html + html; }       // (twice, so it scrolls round seamlessly)
  }
  nameIn.addEventListener("input", () => renderBroadcast()); numIn.addEventListener("input", () => renderBroadcast());
  function renderAcct() {
    const u = A.user;
    setTimeout(renderBroadcast, 0);
    $("acctName").textContent = u ? u.name : "Playing as a guest";
    $("acctSub").textContent = u ? `${u.stats.races} races · ${u.stats.wins} wins · ${Object.keys(u.ach).length}/${A.catalog?.ach.length || "?"} achievements`
      : "Make an account to save your stats, earn coins and unlock car parts.";
    const av = $("acctAv"); av.textContent = "";
    if (u?.picture) { const im = document.createElement("img"); im.src = u.picture; im.alt = `${u.name}'s profile picture`; im.referrerPolicy = "no-referrer"; av.appendChild(im); } else av.textContent = u ? "🏎️" : "👤";
    $("acctCoins").classList.toggle("hidden", !u); countCoins($("acctCoins"), u ? u.coins : 0);
    $("hubCoins").textContent = `🪙 ${u ? u.coins : 0}`; $("hubCoins").classList.toggle("hidden", !u);
    $("signOutBtn").classList.toggle("hidden", !u); $("signOutAllBtn").classList.toggle("hidden", !u);
    $("signUpBtn").classList.toggle("hidden", !!u); $("logInBtn").classList.toggle("hidden", !!u);
    $("gsiBtn").classList.toggle("hidden", !!u);
    $("devLoginBtn").classList.toggle("hidden", !!u || !A.cfg?.dev);
    A.extras = extrasFor(u);
    renderRankedBtn();
    if (u) A.giftUntil = Date.now() + (u.giftCd || 0) * 1000;
    if (!$("friendBox").classList.contains("hidden") && FR.who) renderFriend();
  }
  socket.on("catalog", (c) => { A.catalog = c; renderAcct(); if (!$("hub").classList.contains("hidden")) renderHub(); });
  // The sign-in token goes into an HttpOnly cookie (page scripts, and so any injected script, can't read it).
  // Only if that fails (very old browser) is it kept in localStorage as before.
  function storeToken(token) {
    fetch("/auth/cookie", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", "X-Scribble": "1" }, body: JSON.stringify({ token }) })
      .then((r) => { if (r.ok) { try { localStorage.removeItem("tb-token"); } catch (e) {} } else throw 0; })
      .catch(() => { try { localStorage.setItem("tb-token", token); } catch (e) {} });
  }
  socket.on("needBackup", () => socket.emit("auth:resume", { backup: backupFor(lastAcct()) }));
  socket.on("account", (u) => {
    // one-time note: achievement rewards were rebalanced and half of the extra coins taken back
    if (u?.achAdjust?.back) { const k = "tb-adj-" + u.id + "-" + u.achAdjust.at; try { if (!localStorage.getItem(k)) { localStorage.setItem(k, "1"); setTimeout(() => popup(`⚖️ Achievement rewards were rebalanced (the new ones paid way too much). Half of the ${u.achAdjust.paid.toLocaleString()} coins they gave you was taken back: −${u.achAdjust.back.toLocaleString()} coins.`, true), 1500); } } catch (e) {} }
    if (u.token) { storeToken(u.token); delete u.token; }
    if (u.backup) { keepBackup(u.id, u.backup); delete u.backup; }
    if (!A.user || A.user.id !== u.id) { socket.emit("presets:get"); socket.emit("setPresets:get"); socket.emit("friends:get"); }
    A.user = u; renderAcct();
    if (!$("authBox").classList.contains("hidden")) { closeAuth(); popup(`Signed in as ${u.name}!`); }
    if (!$("hub").classList.contains("hidden")) renderHub();
  });
  socket.on("signedOut", () => { A.user = null; A.friends = null; $("suggestInboxBtn").classList.add("hidden"); try { localStorage.removeItem("tb-token"); } catch (e) {} renderAcct(); renderMenuFriends(); if (!$("hub").classList.contains("hidden")) renderHub(); });
  // ======================= Sign up / log in / 2FA / forgot password =======================
  // modes: signup, login, code (2FA step), reset (forgot password)
  let authMode = "signup", lastAuth = null, ticket2fa = null;
  function authMsg(m, ok) { const e = $("authErr"); e.textContent = m || ""; e.classList.toggle("ok", !!ok); $("authGo").disabled = false; }
  socket.on("authError", (m) => { if (!$("authBox").classList.contains("hidden")) authMsg(m); else popup(m, true); });
  socket.on("need2fa", (d) => { ticket2fa = d.ticket; openAuth("code"); });
  // "CAPTCHA": after a few failed tries the server asks this browser to do a small proof-of-work puzzle
  // (about a second of number crunching: nothing for a person, expensive for a bot doing thousands of tries)
  socket.on("authCaptcha", async (c) => {
    if (!lastAuth) return;
    authMsg("Checking you're not a robot..."); $("authGo").disabled = true;
    const enc = new TextEncoder();
    for (let n = 0; n < 5e6; n++) {
      const h = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(c.salt + ":" + n)));
      let z = 0; for (const b of h) { if (b === 0) { z += 8; continue; } z += Math.clz32(b) - 24; break; }
      if (z >= c.bits) { authMsg("Checked ✓", true); socket.emit(lastAuth.ev, { ...lastAuth.data, pow: { salt: c.salt, nonce: n } }); return; }
    }
  });
  function openAuth(mode) {
    authMode = mode; authMsg("");
    const T = { signup: ["Make an account", "Make my account"], login: ["Log in", "Log in"], code: ["Two-factor code", "Confirm"], reset: ["Forgot password", "Set new password"] }[mode];
    $("authTitle").textContent = T[0]; $("authGo").textContent = T[1];
    document.querySelectorAll("[data-am]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.am === mode)));
    $("authTabs").classList.toggle("hidden", mode === "code");
    $("authUserRow").classList.toggle("hidden", mode === "code");
    $("authPassRow").classList.toggle("hidden", mode === "code");
    $("authPass2Row").classList.toggle("hidden", mode !== "signup" && mode !== "reset");
    $("authCodeRow").classList.toggle("hidden", mode !== "code" && mode !== "reset");
    $("authMeter").classList.toggle("hidden", mode !== "signup" && mode !== "reset");
    $("authForgot").classList.toggle("hidden", mode !== "login");
    $("authPassLabel").firstChild.textContent = mode === "reset" ? "New password " : "Password ";
    $("authCodeLabel").firstChild.textContent = mode === "reset" ? "Authenticator code or a backup code " : "6-digit code from your authenticator app (or a backup code) ";
    $("authPass").autocomplete = mode === "login" ? "current-password" : "new-password";
    $("authPass").placeholder = mode === "login" ? "" : "12+ characters, mix it up";
    $("authNote").textContent = mode === "signup" ? "No email needed. Use a password you don't use anywhere else. After signing up you can turn on two-factor sign-in (Profile > 🔒 Security)."
      : mode === "reset" ? "Only works if you turned on two-factor sign-in. Without it there's no way to prove it's you (there's no email)." : mode === "code" ? "Open your authenticator app and type the code shown for Scribble GP." : "";
    $("authBox").classList.remove("hidden");
    if (mode === "signup" || mode === "reset") loadMeter();
    setTimeout(() => (mode === "code" ? $("authCode") : $("authUser")).focus(), 50);
  }
  function closeAuth() { $("authBox").classList.add("hidden"); $("authPass").value = ""; $("authPass2").value = ""; $("authCode").value = ""; }
  // password strength meter (zxcvbn, the same checker the server uses)
  function loadMeter() {
    if (window.zxcvbn || document.getElementById("zxcvbnJs")) return;
    const sc = document.createElement("script"); sc.id = "zxcvbnJs"; sc.src = "/vendor/zxcvbn.js"; sc.onload = () => meter(); document.head.appendChild(sc);
  }
  function meter() {
    const pw = $("authPass").value, box = $("authMeter"), bar = box.querySelector("i"), txt = box.querySelector("span");
    if (!pw) { bar.style.width = "0"; txt.textContent = "12+ characters, with 3 of: lowercase, UPPERCASE, numbers, symbols"; return; }
    const kinds = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((re) => re.test(pw)).length;
    const z = window.zxcvbn ? window.zxcvbn(pw, [$("authUser").value, "scribble", "racing"]) : { score: Math.min(4, Math.floor(pw.length / 4)), feedback: {} };
    let score = z.score; if (pw.length < 12 || (kinds < 3 && pw.length < 20)) score = Math.min(score, 1);
    const L = [["Very weak", "#ff4b3e"], ["Weak", "#ff8a3d"], ["OK-ish", "#ffcc1f"], ["Strong", "#7bd66b"], ["Very strong", "#3ecf6a"]][score];
    bar.style.width = (score + 1) * 20 + "%"; bar.style.background = L[1];
    txt.textContent = L[0] + (pw.length < 12 ? ` · ${12 - pw.length} more characters` : kinds < 3 && pw.length < 20 ? " · add UPPERCASE, numbers or symbols" : z.feedback?.warning ? " · " + z.feedback.warning : "");
  }
  $("authPass").addEventListener("input", () => { meter(); if (!$("authGo").disabled) $("authErr").textContent = ""; });
  $("signUpBtn").addEventListener("click", () => openAuth("signup"));
  $("logInBtn").addEventListener("click", () => openAuth("login"));
  $("authForgot").addEventListener("click", () => openAuth("reset"));
  document.querySelectorAll("[data-am]").forEach((b) => b.addEventListener("click", () => openAuth(b.dataset.am)));
  $("authClose").addEventListener("click", closeAuth);
  $("authBox").addEventListener("click", (e) => { if (e.target.id === "authBox") closeAuth(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("authBox").classList.contains("hidden")) closeAuth(); });
  $("authForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const username = $("authUser").value.trim(), password = $("authPass").value, code = $("authCode").value.trim();
    const send = (ev, data) => { lastAuth = { ev, data }; authMsg(""); $("authGo").disabled = true; socket.emit(ev, data); };
    if (authMode === "code") { if (!code) return authMsg("Type the code"); return send("auth:2fa", { ticket: ticket2fa, code }); }
    if (!/^[A-Za-z0-9_]{3,16}$/.test(username)) return authMsg("Username: 3-16 letters, numbers or _");
    if (authMode === "signup" || authMode === "reset") {
      if (password.length < 12) return authMsg("Password needs at least 12 characters");
      if (password !== $("authPass2").value) return authMsg("The two passwords don't match");
    } else if (!password) return authMsg("Type your password");
    if (authMode === "reset") { if (!code) return authMsg("Type an authenticator code or a backup code"); return send("auth:reset", { username, code, password }); }
    send(authMode === "signup" ? "auth:signup" : "auth:login", { username, password, backup: backupFor("u_" + username.toLowerCase()) });
  });
  // notifications at the top: gifts, trades, bets, messages, friend requests (and what you missed while offline)
  function notify(n, missed) {
    if (n.key && n.key === "dm_" + FR.who?.id && !$("friendBox").classList.contains("hidden")) return;   // (already chatting with them)
    const d = document.createElement("div"); d.className = "ach-pop note"; d.setAttribute("role", "status");
    const ic = document.createElement("span"); ic.className = "ic"; ic.textContent = n.icon || "🔔";
    const tx = document.createElement("div"); const sm = document.createElement("small"); sm.textContent = missed ? "While you were away" : "Notification";
    const b = document.createElement("b"); b.textContent = n.title || ""; tx.append(sm, b);
    if (n.text) { const t = document.createElement("span"); t.className = "note-tx"; t.textContent = n.text; tx.appendChild(t); }
    d.append(ic, tx); d.title = "Open Friends";
    d.addEventListener("click", () => { d.remove(); if (A.user) openHub(n.tab || "friends"); });
    A.popQ = (A.popQ || Promise.resolve()).then(() => new Promise((res) => { document.body.appendChild(d); sfx("tick"); setTimeout(() => { d.remove(); res(); }, 3600); }));
  }
  socket.on("notify", (n) => notify(n));
  socket.on("notifyMany", (list) => { for (const n of (list || []).slice(-6)) notify(n, true); if ((list || []).length > 6) popup(`🔔 ${list.length - 6} more while you were away (Profile › Friends)`); });
  socket.on("achievement", (a) => {
    const d = document.createElement("div"); d.className = "ach-pop"; d.setAttribute("role", "status");
    const ic = document.createElement("span"); ic.className = "ic"; ic.textContent = a.icon;
    const tx = document.createElement("div"); const sm = document.createElement("small"); sm.textContent = a.secret ? `🤫 SECRET ACHIEVEMENT · +${a.coins.toLocaleString()} coins` : `Achievement unlocked · +${a.coins} coins`;
    const b = document.createElement("b"); b.textContent = a.name; tx.append(sm, b); d.append(ic, tx);
    if (a.secret) { d.classList.add("secret"); setTimeout(() => { banner(`🤫 SECRET: ${a.name}!`, "#ff3b8a"); sfx("win"); }, 200); }
    // queue them so several at once don't pile up
    const q = (A.popQ = (A.popQ || Promise.resolve()).then(() => new Promise((res) => { document.body.appendChild(d); sfx("level"); setTimeout(() => burstFrom(d.querySelector(".ic"), a.secret ? "#ff3b8a" : "#ffcc1f", 12, 60), 380); setTimeout(() => { d.remove(); res(); }, 4300); })));
  });
  fetch("/auth/config").then((r) => r.json()).then((cfg) => {
    A.cfg = cfg; renderAcct();
    if (!cfg.googleClientId) return;
    const sc = document.createElement("script"); sc.src = "https://accounts.google.com/gsi/client"; sc.async = true;
    sc.onload = () => {
      google.accounts.id.initialize({ client_id: cfg.googleClientId, callback: (r) => socket.emit("auth:google", { credential: r.credential, backup: backupFor(lastAcct()) }) });
      google.accounts.id.renderButton($("gsiBtn"), { theme: settings.theme === "light" ? "outline" : "filled_black", size: "large", shape: "pill", text: "signin_with" });
    };
    document.head.appendChild(sc);
  }).catch(() => {});
  $("signOutAllBtn").addEventListener("click", () => {
    const b = $("signOutAllBtn");
    if (b.dataset.sure !== "1") { b.dataset.sure = "1"; b.textContent = "Sure? Click again"; setTimeout(() => { b.dataset.sure = ""; b.textContent = "🔒 Sign out everywhere"; }, 3000); return; }
    socket.emit("auth:signoutAll"); fetch("/auth/logout", { method: "POST", credentials: "same-origin", headers: { "X-Scribble": "1" } }).catch(() => {});
  });
  $("devLoginBtn").addEventListener("click", () => socket.emit("auth:dev", { name: nameIn.value || "Tester" }));
  $("signOutBtn").addEventListener("click", () => {
    let tok = null; try { tok = localStorage.getItem("tb-token"); } catch (e) {}
    socket.emit("auth:signout", { token: tok });
    fetch("/auth/logout", { method: "POST", credentials: "same-origin", headers: { "X-Scribble": "1" } }).catch(() => {});
    try { window.google?.accounts.id.disableAutoSelect(); } catch (e) {}
  });

  // ---- the profile hub ----
  function openHub(tab) { A.tab = tab || A.tab; $("hub").classList.remove("hidden"); if (!A.catalog) socket.emit("catalog"); renderHub(); }
  function closeHub() { $("hub").classList.add("hidden"); }
  document.querySelectorAll("[data-hub]").forEach((b) => b.addEventListener("click", () => openHub(b.dataset.hub)));
  document.querySelectorAll("[data-ht]").forEach((b) => b.addEventListener("click", () => { A.tab = b.dataset.ht; renderHub(); }));
  $("hubClose").addEventListener("click", closeHub);
  $("hub").addEventListener("click", (e) => { if (e.target.id === "hub") closeHub(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("hub").classList.contains("hidden")) closeHub(); });
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
  function renderHub() {
    const u = A.user;
    // wide screens: Achievements live in "Me" (stats), Leaderboards in Ranked
    if (DESK.on && A.tab === "ach") { A.tab = "stats"; A.scrollAch = true; }
    if (DESK.on && A.tab === "lb") A.tab = "ranked";
    // (merged panels sit inside their tab's panel so they scroll as one; put them back before redrawing)
    for (const [inner, outer] of [["hubAch", "hubStats"], ["hubLb", "hubRanked"]]) if ($(inner).parentElement === $(outer)) $(outer).after($(inner));
    document.querySelectorAll("[data-ht]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.ht === A.tab)));
    $("hubSecBtn")?.setAttribute("aria-pressed", String(A.tab === "sec"));
    for (const [t, id] of [["stats", "hubStats"], ["ach", "hubAch"], ["store", "hubStore"], ["sec", "hubSec"], ["friends", "hubFriends"], ["lb", "hubLb"], ["pass", "hubPass"], ["ranked", "hubRanked"], ["plinko", "hubPlinko"], ["custom", "hubCustom"], ["tour", "hubTour"]]) $(id).classList.toggle("hidden", A.tab !== t);
    $("hubGuest").classList.toggle("hidden", !!u);
    $("hubTitle").textContent = u ? u.name : "Guest";
    $("achCount").textContent = A.catalog ? `${u ? A.catalog.ach.filter((a) => u.ach[a.id]).length : 0}/${A.catalog.ach.length}` : "";
    if (A.tab === "stats") renderStats(u); else if (A.tab === "ach") renderAchs(u); else if (A.tab === "sec") renderSec(u);
    else if (A.tab === "pass") renderPass(u); else if (A.tab === "ranked") renderRanked(u); else if (A.tab === "plinko") renderCasino(u); else if (A.tab === "custom") renderCustom(u);
    else if (A.tab === "tour") { renderTour(u); if (!A.tourAsked) { A.tourAsked = true; socket.emit("tour:get"); setTimeout(() => (A.tourAsked = false), 4000); } }
    else if (A.tab === "friends") { renderFriends(u); if (u && !A.friendsAsked) { A.friendsAsked = true; socket.emit("friends:get"); setTimeout(() => (A.friendsAsked = false), 3000); } }
    else if (A.tab === "lb") { renderLb(); if (!A.lbAsked) { A.lbAsked = true; socket.emit("lb:get", { kind: A.lbKind || "wins", track: A.lbTrack || "" }); setTimeout(() => (A.lbAsked = false), 2000); } }
    else renderStore(u);
    if (DESK.on && A.tab === "stats") {
      $("hubAch").classList.remove("hidden"); renderAchs(u); $("hubStats").appendChild($("hubAch"));
      if (A.scrollAch) { A.scrollAch = false; requestAnimationFrame(() => $("hubAch").scrollIntoView({ block: "start" })); }
    }
    if (DESK.on && A.tab === "ranked") {
      $("hubLb").classList.remove("hidden"); renderLb(); $("hubRanked").appendChild($("hubLb"));
      if (!A.lbAsked) { A.lbAsked = true; socket.emit("lb:get", { kind: A.lbKind || "wins", track: A.lbTrack || "" }); setTimeout(() => (A.lbAsked = false), 2000); }
    }
  }
  function renderStats(u) {
    const box = $("hubStats"); box.textContent = "";
    if (u?.loginStreak) { const L = u.loginStreak, sec = el("section", "sec-box"); sec.append(el("h3", "hub-h", L.streak ? `🔥 Login streak: ${L.streak} day${L.streak === 1 ? "" : "s"}` : "🔥 Login streak"), streakStrip(L.days, L.cycleDay, L.today)); box.appendChild(sec); }
    const st = u?.stats || {};
    const n = (v) => (v || 0).toLocaleString();
    const pct = (a, b) => (b ? Math.round((a / b) * 100) + "%" : "-");
    const hours = (sec) => { const m = Math.round((sec || 0) / 60); return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`; };
    const groups = [
      ["Racing", [["Races", n(st.races)], ["Wins", n(st.wins), 1], ["Win rate", pct(st.wins, st.races)], ["Podiums", n(st.podiums)], ["Top 5s", n(st.top5)], ["Best finish", st.bestFinish ? "P" + st.bestFinish : "-"], ["Points scored", n(st.points)], ["Time racing", hours(st.raceSec)]]],
      ["Driving", [["Laps", n(st.laps)], ["Distance", `${(st.km || 0).toFixed(1)} km`], ["Overtakes", n(st.overtakes), 1], ["Most in a race", n(st.mostOvertakes)], ["Best comeback", st.bestComeback > 0 ? `+${st.bestComeback} places` : "-"], ["Fastest laps", n(st.fastestLaps)], ["Best lap ever", st.bestLap ? fmt(st.bestLap) : "-"], ["Clean laps", n(st.cleanLaps)], ["Crashes", n(st.crashes)], ["Slides in the wet", n(st.slips)]]],
      ["Team boss", [["Pit stops", n(st.pitStops)], ["Wet races", n(st.rainRaces)], ["Wet wins", n(st.rainWins)], ["Best team level", n(st.maxLevel)], ["Upgrades picked", n(st.upgrades)], ["Boost used", `${Math.round(st.boostSec || 0)}s`]]],
      ["Starts", [["Best reaction", st.bestReaction ? `${Math.round(st.bestReaction)} ms` : "-"], ["Great starts (<250ms)", n(st.perfectStarts)], ["Jump starts", n(st.jumpStarts)]]],
      ["Championships and more", [["Driver titles", n(st.champDriver), 1], ["Team titles", n(st.champTeam), 1], ["Races with friends", n(st.multiRaces)], ["Friends beaten", n(st.beatPlayers)], ["Random tracks", n(st.randomRaces)], ["Your own tracks", n(st.drawnRaces)], ["Real tracks raced", n(st.realTracks?.length)], ["Track records set", n(Object.keys(st.pbs || {}).length)]]],
    ];
    for (const [title, items] of groups) {
      box.appendChild(el("h3", "hub-h", title));
      const g = el("div", "stat-grid");
      for (const [label, val, hl] of items) { const d = el("div", "hstat" + (hl ? " hl" : "")); d.append(el("b", "", val), el("small", "", label)); g.appendChild(d); }
      box.appendChild(g);
    }
  }
  function renderAchs(u) {
    const box = $("hubAch"); box.textContent = "";
    if (!A.catalog) { box.textContent = "Loading..."; return; }
    const got = u?.ach || {}, list = A.catalog.ach, have = list.filter((a) => got[a.id]).length;
    const earned = list.filter((a) => got[a.id]).reduce((t, a) => t + a.coins, 0);
    box.appendChild(el("p", "hub-h", `${have} of ${list.length} unlocked · ${earned} coins earned from them`));
    const bar = el("div", "ach-bar"); const fill = el("i"); fill.style.width = (have / list.length) * 100 + "%"; bar.appendChild(fill); box.appendChild(bar);
    // filters: closest to unlocking first, so you always see what to go for next
    const prog = u?.achProg || {};
    const pctOf = (a) => (got[a.id] ? 1 : a.goal ? Math.min(1, (prog[a.id] || 0) / a.goal) : 0);
    const f = A.achFilter || "todo";
    // today's and this week's challenges
    if (u?.daily) { const hrs = Math.max(1, Math.ceil((u.daily.ends - Date.now()) / 3600000)); box.appendChild(challengeBlock(`☀️ Today's challenges · new ones in ${hrs} hour${hrs === 1 ? "" : "s"} · +150 pass XP each`, u.daily, "☀️")); }
    if (u?.weekly) { const days = Math.max(0, Math.ceil((u.weekly.ends - Date.now()) / 86400000)); box.appendChild(challengeBlock(`📅 This week's challenges (harder) · new ones in ${days} day${days === 1 ? "" : "s"} · +300 pass XP each`, u.weekly, "📅")); }
    else if (!u) box.appendChild(el("p", "preset-note", "Sign in to get 3 daily challenges every day and 3 weekly ones every Monday (they pay coins and season pass XP)."));
    const fbar = el("div", "ach-filters");
    for (const [k, label] of [["todo", "To do"], ["done", "Unlocked"], ["hard", "🔥 Insane"], ["all", "All"]]) {
      const b = el("button", "chip" + (f === k ? " on" : ""), label); b.type = "button";
      b.addEventListener("click", () => { A.achFilter = k; renderAchs(u); }); fbar.appendChild(b);
    }
    // search (there are well over a thousand) and a page at a time
    const q = el("input", "ach-search"); q.type = "search"; q.placeholder = "🔍 Search achievements (e.g. Monaco, EXTREME, plinko)"; q.value = A.achQuery || ""; q.setAttribute("aria-label", "Search achievements");
    q.addEventListener("input", () => { A.achQuery = q.value; A.achShow = 120; clearTimeout(A.achT); A.achT = setTimeout(() => { renderAchs(u); const n = $("hubAch").querySelector(".ach-search"); if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } }, 220); });
    fbar.appendChild(q);
    box.appendChild(fbar);
    const qq = (A.achQuery || "").trim().toLowerCase();
    let shown = list.filter((a) => (f === "todo" ? !got[a.id] : f === "done" ? got[a.id] : f === "hard" ? a.coins >= 1000 : true) && (!qq || (a.name + " " + a.desc).toLowerCase().includes(qq)));
    shown = shown.sort((x, y) => (f === "done" ? (got[y.id] || 0) - (got[x.id] || 0) : pctOf(y) - pctOf(x) || x.coins - y.coins));
    const g = el("div", "ach-grid"), total = shown.length, page = A.achShow || 120;
    shown = shown.slice(0, page);
    for (const a of shown) {
      const d = el("div", "ach" + (got[a.id] ? " got" : "") + (a.coins >= 1000 ? " insane" : ""));
      const tx = el("div"); tx.append(el("b", "", a.name), el("small", "", a.desc));
      if (a.goal && !got[a.id]) {
        const cur = Math.min(a.goal, prog[a.id] || 0);
        const pb = el("div", "ach-prog"); const fi = el("i"); fi.style.width = (cur / a.goal) * 100 + "%"; pb.appendChild(fi);
        tx.append(pb, el("small", "ach-num", `${Math.floor(cur).toLocaleString()} / ${a.goal.toLocaleString()}`));
      }
      d.append(el("span", "ic", a.icon), tx, el("span", "rw", got[a.id] ? "✓ +" + a.coins : "🪙 " + a.coins.toLocaleString()));
      g.appendChild(d);
    }
    if (!shown.length) g.appendChild(el("p", "preset-note", qq ? "No achievements match that." : f === "done" ? "Nothing unlocked yet. Go race!" : "All done here. Legend."));
    box.appendChild(g);
    if (total > shown.length) { const more = el("button", "btn ach-more", `Show more (${(total - shown.length).toLocaleString()} left)`); more.type = "button"; more.addEventListener("click", () => { A.achShow = page + 200; renderAchs(u); }); box.appendChild(more); }
    // secret achievements: only the ones you've found ever show up (nobody else even knows they exist)
    if (u?.secrets?.length) {
      const sec = el("section", "secret-achs"); sec.appendChild(el("h3", "hub-h", `🤫 Secret achievements you found (${u.secrets.length})`));
      const sg = el("div", "ach-grid");
      for (const a of u.secrets) { const d = el("div", "ach got secret"); const tx = el("div"); tx.append(el("b", "", a.name), el("small", "", a.desc)); d.append(el("span", "ic", a.icon), tx, el("span", "rw", "✓ +" + a.coins.toLocaleString())); sg.appendChild(d); }
      sec.appendChild(sg); box.appendChild(sec);
    }
  }
  const RARE_TIER = { epic: { label: "EPIC", odds: "0.1%", color: "#c77dff", icon: "💎" }, legendary: { label: "LEGENDARY", odds: "0.01%", color: "#ffc21f", icon: "👑" }, mythic: { label: "MYTHIC", odds: "0.001%", color: "#ff3b8a", icon: "🌈" } };
  const RARITY = { common: ["Common", "#9aa3ad"], rare: ["Rare", "#4fa3ff"], epic: ["Epic", "#c77dff"], legendary: ["Legendary", "#ffb020"], mythic: ["Mythic", "#ff3b8a"] };
  const BOX_LOOK = { basic: ["📦", "#6b4a2f", "#9c6b3f"], mid: ["🧰", "#1e4b8f", "#4fa3ff"], legend: ["👑", "#7a4b00", "#ffcc1f"], mythic: ["🔮", "#3b0764", "#e879f9"] };
  // store previews: animated items keep moving in the store (redrawn ~20 times a second while on screen)
  const LIVE = new Set();
  function livePreviews() {
    if (LIVE.running) return; LIVE.running = true; let last = 0;
    const tick = (t) => {
      for (const cv of LIVE) if (!cv.isConnected && t - cv._born > 3000) LIVE.delete(cv);
      if (!LIVE.size) { LIVE.running = false; return; }
      if (t - last > 50 && !document.hidden) { last = t; for (const cv of LIVE) if (cv.isConnected && cv.offsetParent) cv._draw(); }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
  function itemPreview(it, w = 200, h = 110) {
    const cv = document.createElement("canvas"); cv.width = w; cv.height = h; cv.setAttribute("role", "img"); cv.setAttribute("aria-label", `Preview of your car with the ${it.name}`);
    const draw = () => {
      const c2 = cv.getContext("2d"); c2.clearRect(0, 0, w, h);
      drawCar(c2, { color: prof.color, livery: prof.livery, number: prof.number, design: it.slot === "livery" ? null : prof.design, extras: it.onlyBody ? { body: it.onlyBody, [it.slot]: it.look } : { [it.slot]: it.look } }, it.slot === "trail" || it.slot === "flame" ? w * 0.59 : w / 2, h / 2, 0, 2.3 * (w / 200), { trailPreview: it.slot === "trail", flamePreview: it.slot === "flame" });
      if (it.slot === "smoke") { for (let k = 0; k < 5; k++) { c2.globalAlpha = 0.85 - k * 0.12; c2.fillStyle = it.look === "rainbow" ? `hsl(${k * 70 + performance.now() / 6},95%,65%)` : it.look === "stardust" ? ["#ffe278", "#fff", "#be8cff"][k % 3] : it.look.startsWith("#") ? it.look : smokeCol(it.look); c2.beginPath(); c2.arc(w * 0.26 - k * 9, h / 2 + (k % 2 ? 8 : -8), 8 + k * 2, 0, Math.PI * 2); c2.fill(); } c2.globalAlpha = 1; }
      if (it.slot === "badge") { c2.font = `${Math.round(h * 0.3)}px sans-serif`; c2.textAlign = "center"; c2.textBaseline = "middle"; c2.fillText(it.look, w / 2, h * 0.16); }
    };
    draw();
    if (/animated/i.test(it.name) && !reducedMotion) { cv._draw = draw; cv._born = performance.now(); LIVE.add(cv); livePreviews(); }
    return cv;
  }
  function renderBoxes(box, u) {
    const sec = el("section", "store-slot"); sec.appendChild(el("h3", "hub-h", "Chests: random items, better odds in the pricier ones"));
    const g = el("div", "box-grid");
    for (const b of A.catalog.boxes || []) {
      const [ic, c1, c2] = BOX_LOOK[b.id] || ["📦", "#444", "#777"];
      const card = el("div", "chest"); card.style.setProperty("--c1", c1); card.style.setProperty("--c2", c2);
      card.append(el("div", "chest-ic", ic), el("b", "", b.name));
      const odds = el("div", "odds");
      for (const [r, w] of Object.entries(b.odds)) { const o = el("span", "", `${RARITY[r][0]} ${w}%`); o.style.color = RARITY[r][1]; odds.appendChild(o); }
      const btn = el("button", "btn go", `Open · 🪙 ${b.price}`); btn.type = "button";
      btn.disabled = !u || u.coins < b.price; btn.title = !u ? "Sign in first" : u.coins < b.price ? `You need ${b.price - u.coins} more coins` : "";
      btn.addEventListener("click", () => { btn.disabled = true; socket.emit("store:open", b.id); });
      card.append(odds, btn); g.appendChild(card);
    }
    sec.appendChild(g); box.appendChild(sec);
  }
  // opening a chest: a strip of items spins past and stops on what you got
  socket.on("boxResult", (r) => {
    const wrap = el("div", "reel-veil"), panel = el("div", "reel-panel panel"), strip = el("div", "reel-strip"), win = el("div", "reel-win");
    const pool = r.box?.startsWith("crate_") ? A.catalog.store.filter((x) => x.pass === r.box.slice(6)) : A.catalog.store.filter((x) => !x.pass), N = 38, stopAt = 32;
    for (let i = 0; i < N; i++) {
      const it = i === stopAt ? r.item : pool[Math.floor(Math.random() * pool.length)];
      const cell = el("div", "reel-cell"); cell.style.setProperty("--rc", RARITY[it.rarity][1]);
      cell.append(itemPreview(it, 150, 84), el("small", "", it.name)); strip.appendChild(cell);
    }
    win.appendChild(strip); panel.append(el("h3", "", "Opening..."), win);
    const res = el("div", "reel-res hidden"); panel.appendChild(res);
    wrap.appendChild(panel); document.body.appendChild(wrap);
    const cellW = 164, spinT = reducedMotion ? 1.4 : 3.2;
    // Start from 0, make the browser actually lay that out, THEN set where it stops. (Setting both in the
    // same frame meant some browsers skipped straight to the end: no spin. That was your friend's bug.)
    strip.style.transition = "none"; strip.style.transform = "translateX(0px)";
    void strip.getBoundingClientRect();
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const w = win.clientWidth || Math.min(window.innerWidth - 64, 600);
      strip.style.transition = `transform ${spinT}s cubic-bezier(.12,.8,.2,1)`;
      strip.style.transform = `translateX(${-(stopAt * cellW - w / 2 + cellW / 2 - 6 + (Math.random() - 0.5) * 60)}px)`;
    }));
    // tick sounds as items fly past
    if (!reducedMotion) for (let k = 0; k < 22; k++) setTimeout(() => sfx("tick"), 3000 * Math.pow(k / 22, 2.2));
    setTimeout(() => {
      const [rn, rc] = RARITY[r.rarity];
      panel.querySelector("h3").textContent = r.rarity === "mythic" ? "💎 MYTHIC!!! THE RAREST THING IN THE GAME 💎" : r.rarity === "legendary" ? "🌟 LEGENDARY! 🌟" : "You got:";
      res.textContent = "";
      const nm = el("b", "", r.item.name); nm.style.color = rc;
      res.append(el("span", "rtag", rn), nm, el("p", "", r.dup ? `You already had this one, so you get 🪙 ${r.refund} back.` : "It's yours! Equip it in the store."));
      const row = el("div", "reel-row");
      if (!r.dup) { const eq = el("button", "btn go", "Equip it"); eq.type = "button"; eq.addEventListener("click", () => { socket.emit("store:equip", { slot: r.item.slot, id: r.item.id }); wrap.remove(); }); row.appendChild(eq); }
      const ok = el("button", "btn", "Nice"); ok.type = "button"; ok.addEventListener("click", () => wrap.remove()); row.appendChild(ok);
      res.appendChild(row); res.classList.remove("hidden");
      sfx(r.rarity === "legendary" || r.rarity === "epic" ? "win" : "level");
      if (r.rarity === "legendary") banner("LEGENDARY!", "#ffb020");
      if (r.rarity === "mythic") { banner("MYTHIC!", "#ff3b8a"); sfx("win"); }
    }, reducedMotion ? 1600 : 3400);
  });
  // ---- Friends tab ----
  socket.on("friends", (f) => { A.friends = f; if (A.tab === "friends") renderFriends(A.user); renderMenuFriends(); });
  // main menu: which friends are online right now, and a one-click Join if they're in a room
  function renderMenuFriends() {
    const wrap = $("menuFriends"), box = $("friendsList");
    wrap.classList.toggle("hidden", !A.user); if (!A.user) return;
    box.textContent = "";
    const F2 = A.friends; if (!F2) { box.appendChild(el("div", "lob-empty", "Loading friends...")); return; }
    const on = F2.friends.filter((f) => f.online);
    if (!on.length) { box.appendChild(el("div", "lob-empty", F2.friends.length ? `None of your ${F2.friends.length} friend${F2.friends.length === 1 ? " is" : "s are"} online right now.` : "No friends yet. Add some in Profile › Friends.")); return; }
    for (const f of on) {
      const row = el("div", "lob"), who = el("div", "who");
      who.append(el("b", "", `🟢 ${f.name}`), el("small", "", f.where === "racing" ? "🏁 Racing right now" : f.where === "in a room" ? "In a room" : "On the menu"));
      row.appendChild(who);
      if (f.room && f.room !== S.code) {
        const j = el("button", "join-btn", f.where === "racing" ? "Watch & join" : "Join"); j.type = "button";
        j.addEventListener("click", () => { saveProfile(); S.solo = false; socket.emit("join", { code: f.room, profile: prof }); });
        row.appendChild(j);
      }
      box.appendChild(row);
    }
  }
  setInterval(() => { if (A.user && S.screen === "menu" && !document.hidden) socket.emit("friends:get"); }, 10000);
  socket.on("friendMsg", (m) => { const e = document.getElementById("friendMsg"); if (e) { e.textContent = m.error || m.ok; e.className = "sec-msg " + (m.error ? "bad" : "good"); } if (m.ok) socket.emit("friends:get"); });
  function renderFriends(u) {
    const box = $("hubFriends"); box.textContent = "";
    if (!u) { box.appendChild(el("p", "preset-note", "Sign in to add friends, see when they're online and invite them to your room.")); return; }
    const F2 = A.friends;
    const top = el("section", "sec-box");
    top.appendChild(el("h3", "hub-h", "➕ Add a friend"));
    top.appendChild(el("p", "preset-note", `Type their username, or their friend code. Your friend code: ${F2?.code || u.friendCode}`));
    const row = el("div", "sec-row"); const inp = document.createElement("input"); inp.type = "text"; inp.maxLength = 20; inp.placeholder = "Username or friend code"; inp.setAttribute("aria-label", "Friend's username or friend code");
    const go = el("button", "btn go", "Send request"); go.type = "button";
    const send = () => { if (inp.value.trim()) socket.emit("friends:add", inp.value.trim()); };
    go.addEventListener("click", send); inp.addEventListener("keydown", (e) => { if (e.key === "Enter") send(); });
    row.append(inp, go); top.appendChild(row); const fm = el("p", "sec-msg"); fm.id = "friendMsg"; fm.setAttribute("role", "status"); top.appendChild(fm);
    box.appendChild(top);
    const tb = tradesBlock(u); if (tb) box.appendChild(tb);
    const gb = ghostsBlock(u); if (gb) box.appendChild(gb);
    const bb = betsBlock(u); if (bb) box.appendChild(bb);
    if (!F2) { box.appendChild(el("p", "preset-note", "Loading...")); return; }
    const person = (f, buttons) => {
      const d = el("div", "friend");
      const dot = el("span", "fdot" + (f.online ? " on" : "")); dot.title = f.online ? "Online" : "Offline";
      const tx = el("div"); tx.append(el("b", "", f.name), el("small", "", (f.online ? `Online · ${f.where}` : "Offline") + (f.h2h?.n ? ` · Head-to-head ${f.h2h.w}–${f.h2h.n - f.h2h.w}` : "")));
      const bs = el("div", "sec-row"); for (const [label, cls, fn] of buttons) { const b = el("button", "btn " + cls, label); b.type = "button"; b.addEventListener("click", fn); bs.appendChild(b); }
      d.append(dot, tx, bs); return d;
    };
    if (F2.reqIn.length) {
      box.appendChild(el("h3", "hub-h", "📨 Friend requests"));
      for (const f of F2.reqIn) box.appendChild(person(f, [["Accept", "go", () => socket.emit("friends:accept", f.id)], ["Decline", "ghost", () => socket.emit("friends:remove", f.id)]]));
    }
    box.appendChild(el("h3", "hub-h", `👥 Friends (${F2.friends.length})`));
    if (!F2.friends.length) box.appendChild(el("p", "preset-note", "No friends yet. Add someone above, or use ⋯ › Add friend on a player in your room."));
    for (const f of F2.friends) {
      const b = [];
      if (S.code && S.screen === "lobby") b.push(["Invite", "go", () => socket.emit("friends:invite", f.id)]);
      if (f.online && f.room && f.room !== S.code) b.push(["Join them", "", () => { closeHub(); saveProfile(); S.solo = false; socket.emit("join", { code: f.room, profile: prof }); }]);
      b.push(["💬", "", () => openFriend(f, "chat")], ["🎁", "", () => openFriend(f, "gift")], ["🤝", "", () => openFriend(f, "trade")], ["⚔️", "", () => openFriend(f, "bet")], ["👻", "", () => openFriend(f, "ghost")]);
      b.push(["Remove", "ghost", () => socket.emit("friends:remove", f.id)]);
      box.appendChild(person(f, b));
    }
    if (F2.reqOut.length) { box.appendChild(el("h3", "hub-h", "⏳ Waiting for them to accept")); for (const f of F2.reqOut) box.appendChild(person(f, [["Cancel", "ghost", () => socket.emit("friends:remove", f.id)]])); }
  }
  // ---- Leaderboards tab ----
  socket.on("lb", (d) => { A.lb = d; if (d.tracks) A.lbTracks = d.tracks; if (A.tab === "lb" || (DESK.on && A.tab === "ranked")) renderLb(); });
  function renderLb() {
    const box = $("hubLb"); box.textContent = "";
    const kinds = [["wins", "🏆 Most wins"], ["ranked", "⚡ Ranked"], ["rankedTeam", "👥 Team ranked"], ["totw", "🌟 Track of the week"], ["ach", "🏅 Most achievements"], ["km", "🛣️ Most km"], ["laps", "⏱️ Fastest laps"]];
    const bar = el("div", "ach-filters");
    for (const [k, label] of kinds) { const b = el("button", "chip" + ((A.lbKind || "wins") === k ? " on" : ""), label); b.type = "button"; b.addEventListener("click", () => { A.lbKind = k; A.lb = null; socket.emit("lb:get", { kind: k, track: A.lbTrack || "" }); renderLb(); }); bar.appendChild(b); }
    box.appendChild(bar);
    if ((A.lbKind || "wins") === "laps") {
      const sel = document.createElement("select"); sel.setAttribute("aria-label", "Track");
      const known = (S.f1 && S.f1.length ? S.f1 : A.catalog?.tracks || []).map((t) => [t.id, t.name]);
      const o0 = document.createElement("option"); o0.value = ""; o0.textContent = "Pick a real track..."; sel.appendChild(o0);
      for (const [id, name] of known) for (const [suf, tag] of [["", ""], ["_r", " (reversed)"]]) { const o = document.createElement("option"); o.value = id + suf; o.textContent = name + tag + ((A.lbTracks || []).includes(id + suf) ? " ●" : ""); sel.appendChild(o); }
      if (!known.length) { box.appendChild(el("p", "preset-note", "Open a room once to load the track list.")); }
      sel.value = A.lbTrack || ""; sel.addEventListener("change", () => { A.lbTrack = sel.value; socket.emit("lb:get", { kind: "laps", track: sel.value }); });
      box.appendChild(sel); box.appendChild(el("p", "preset-note", "Fastest laps on real tracks by signed-in players (● = has times)."));
    }
    const L = A.lb;
    if ((A.lbKind || "wins") === "totw") {
      const T = L?.info || S.totw;
      box.appendChild(el("p", "preset-note", T ? `🌟 ${T.name}: fastest laps this week (resets every Monday). Race it from the main menu, or 🌟 on the track tools.` : "This week's featured track."));
      const go = el("button", "btn go", "Race it now"); go.type = "button"; go.addEventListener("click", () => { closeHub(); $("totwRace").click(); }); if (!S.code) box.appendChild(go);
    }
    if ((A.lbKind || "wins") === "ranked") box.appendChild(el("p", "preset-note", "The top ranked players by skill rating (SR)."));
    if (!L) { box.appendChild(el("p", "preset-note", "Loading...")); return; }
    if (!L.list.length) { box.appendChild(el("p", "preset-note", "No times yet. Be the first!")); return; }
    const ol = el("ol", "lb-list");
    L.list.forEach((x, i) => {
      const li = el("li", x.id === A.user?.id ? "mine" : "");
      li.append(el("span", "lp", i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : String(i + 1)), el("span", "ln", x.name), el("span", "lv", L.kind === "laps" || L.kind === "totw" ? fmt3(x.v) : L.kind === "ranked" || L.kind === "rankedTeam" ? `${x.rank} · ${x.v} SR` : L.kind === "km" ? `${x.v.toLocaleString()} km` : x.v.toLocaleString()));
      ol.appendChild(li);
    });
    box.appendChild(ol);
  }
  // ---- Security tab: password, two-factor sign-in, backup codes, sign out everywhere ----
  const SEC = { setup: null, codes: null };
  socket.on("accountDeleted", (d) => {
    // forget it in this browser too: its backup, the sign-in cookie and saved tracks copy on the account
    try { const b = backups(); delete b[d.id]; localStorage.setItem("tb-backups", JSON.stringify(b)); if (localStorage.getItem("tb-last") === d.id) localStorage.removeItem("tb-last"); localStorage.removeItem("tb-token"); } catch (e) {}
    fetch("/auth/logout", { method: "POST", credentials: "same-origin", headers: { "X-Scribble": "1" } }).catch(() => {});
    $("hub").classList.add("hidden"); popup("Your account was deleted.", true);
  });
  socket.on("2faSetup", (d) => { SEC.setup = d; SEC.codes = null; if (A.tab === "sec") renderHub(); });
  socket.on("2faCodes", (codes) => { SEC.codes = codes; SEC.setup = null; if (A.tab === "sec") renderHub(); });
  socket.on("secMsg", (m) => { const e = document.getElementById("secMsg"); if (e) { e.textContent = m.error || m.ok || ""; e.className = "sec-msg " + (m.error ? "bad" : "good"); } });
  function renderSec(u) {
    const box = $("hubSec"); box.textContent = "";
    if (!u) { box.appendChild(el("p", "preset-note", "Sign in to change your password or turn on two-factor sign-in.")); return; }
    const msg = el("p", "sec-msg"); msg.id = "secMsg"; msg.setAttribute("role", "status");
    const field = (label, type, ac) => { const l = el("label", "f", label + " "); const i = document.createElement("input"); i.type = type; i.autocomplete = ac; i.maxLength = 128; l.appendChild(i); return [l, i]; };
    // backup codes just made: show them ONCE
    if (SEC.codes) {
      const sec = el("section", "sec-box warn");
      sec.append(el("h3", "hub-h", "🧾 Your backup codes (save these now!)"), el("p", "preset-note", "Each one works once, if you lose your phone or forget your password. Write them down or save them somewhere safe. You won't see them again."));
      const pre = el("pre", "codes", SEC.codes.join("\n")); sec.appendChild(pre);
      const row = el("div", "sec-row");
      const cp = el("button", "btn", "📋 Copy"); cp.type = "button"; cp.addEventListener("click", () => { navigator.clipboard?.writeText(SEC.codes.join("\n")).then(() => { cp.textContent = "Copied ✓"; }); });
      const ok = el("button", "btn go", "I saved them"); ok.type = "button"; ok.addEventListener("click", () => { SEC.codes = null; renderHub(); });
      row.append(cp, ok); sec.appendChild(row); box.appendChild(sec);
      return;
    }
    // two-factor
    const tf = el("section", "sec-box"); tf.appendChild(el("h3", "hub-h", "📱 Two-factor sign-in"));
    if (u.twoFA) {
      tf.appendChild(el("p", "sec-state on", `✅ On. Backup codes left: ${u.backupLeft}`));
      const [lc, ic] = field("Code from your app", "text", "one-time-code");
      const [lp, ip2] = field("Password (to turn it off)", "password", "current-password");
      const row = el("div", "sec-row");
      const nb = el("button", "btn", "New backup codes"); nb.type = "button"; nb.addEventListener("click", () => socket.emit("2fa:newCodes", { code: ic.value }));
      const off = el("button", "btn ghost", "Turn off"); off.type = "button"; off.addEventListener("click", () => socket.emit("2fa:disable", { code: ic.value, password: ip2.value }));
      row.append(nb, off); tf.append(lc, u.hasPassword ? lp : el("span"), row);
    } else if (SEC.setup) {
      tf.appendChild(el("p", "preset-note", "1. Open an authenticator app (Google Authenticator, Microsoft Authenticator, Authy, 1Password...) and scan this code:"));
      const img = document.createElement("img"); img.src = SEC.setup.qr; img.alt = "QR code to add Scribble GP to your authenticator app"; img.className = "qr"; tf.appendChild(img);
      tf.append(el("p", "preset-note", "Can't scan? Type this key into the app instead:"), el("code", "key", SEC.setup.secret));
      tf.appendChild(el("p", "preset-note", "2. Type the 6-digit code the app shows:"));
      const [lc, ic] = field("Code", "text", "one-time-code"); ic.inputMode = "numeric"; ic.maxLength = 6;
      const go = el("button", "btn go", "Turn on"); go.type = "button"; go.addEventListener("click", () => socket.emit("2fa:enable", { code: ic.value }));
      const cancel = el("button", "btn ghost", "Cancel"); cancel.type = "button"; cancel.addEventListener("click", () => { SEC.setup = null; renderHub(); });
      const row = el("div", "sec-row"); row.append(go, cancel); tf.append(lc, row);
    } else {
      tf.appendChild(el("p", "preset-note", "Off. With it on, signing in needs your password AND a code from your phone, so a stolen password isn't enough. It also lets you reset a forgotten password."));
      const on = el("button", "btn go", "Turn on two-factor sign-in"); on.type = "button"; on.addEventListener("click", () => socket.emit("2fa:setup")); tf.appendChild(on);
    }
    box.appendChild(tf);
    // password
    if (u.hasPassword) {
      const pw = el("section", "sec-box"); pw.appendChild(el("h3", "hub-h", "🔑 Change password"));
      const [l1, i1] = field("Current password", "password", "current-password");
      if (u.pwLost) { l1.classList.add("hidden"); pw.appendChild(el("p", "preset-note", "⚠️ An old bug wiped your password, so you can't sign in on other devices. Pick a new one here (no current password needed).")); }
      const [l2, i2] = field("New password (12+ characters)", "password", "new-password");
      const [l3, i3] = field("New password again", "password", "new-password");
      const go = el("button", "btn", "Change password"); go.type = "button";
      go.addEventListener("click", () => { if (i2.value !== i3.value) return socket.listeners("secMsg")[0]({ error: "The new passwords don't match" }); socket.emit("auth:changePassword", { old: i1.value, password: i2.value }); });
      pw.append(l1, l2, l3, go); box.appendChild(pw);
    }
    const del = el("section", "sec-box danger-box"); del.appendChild(el("h3", "hub-h", "🗑️ Delete my account"));
    del.appendChild(el("p", "preset-note", "Deletes your account, stats, coins, items and saved tracks from the server for good. This can't be undone."));
    const [dl1, di1] = field("Password", "password", "current-password");
    const [dl2, di2] = field("Code from your authenticator app", "text", "one-time-code");
    const db = el("button", "btn danger-fill", "Delete my account forever"); db.type = "button";
    db.addEventListener("click", () => {
      if (db.dataset.sure !== "1") { db.dataset.sure = "1"; db.textContent = "Really? Click again to delete"; setTimeout(() => { db.dataset.sure = ""; db.textContent = "Delete my account forever"; }, 4000); return; }
      socket.emit("auth:delete", { password: di1.value, code: di2.value });
    });
    if (u.hasPassword) del.appendChild(dl1); if (u.twoFA) del.appendChild(dl2); del.appendChild(db);
    box.appendChild(del);
    const so = el("section", "sec-box"); so.appendChild(el("h3", "hub-h", "🚪 Sessions"));
    const all = el("button", "btn ghost", "🔒 Sign out on every device"); all.type = "button"; all.addEventListener("click", () => $("signOutAllBtn").click());
    so.append(el("p", "preset-note", "Use this if someone else might know your password."), all); box.appendChild(so);
    box.appendChild(msg);
  }
  // ======================= Customize: just the things you own =======================
  // A big live preview of your car with everything you have on, then every slot with only YOUR items. Tap to put
  // one on (or None to take it off). No hunting through the whole store.
  const CUST_ORDER = ["body", "livery", "decal", "num", "wing", "rims", "glow", "flame", "trail", "smoke", "helmet", "badge"];
  function myExtras(u) { const o = {}; for (const [slot, id] of Object.entries(u?.equipped || {})) { const it = A.catalog?.store.find((x) => x.id === id); if (it && u.owned.includes(id)) o[slot] = it.look; } return o; }
  function renderCustom(u) {
    const box = $("hubCustom"); box.textContent = "";
    if (!A.catalog) { box.textContent = "Loading..."; return; }
    if (!u) { box.appendChild(el("p", "preset-note", "Sign in to customize your car with the things you've bought and won.")); return; }
    { const b = el("button", "btn wide cust-presets", "🚗 Car presets: save this whole look, or swap to another"); b.type = "button"; b.addEventListener("click", openCarPresets); box.appendChild(b); }
    const owned = A.catalog.store.filter((x) => u.owned.includes(x.id));
    box.appendChild(el("p", "hub-h", `Your garage: you own ${owned.length} of ${A.catalog.store.filter((x) => !x.pass || u.owned.includes(x.id)).length} items. Tap one to put it on.`));
    // the big preview (animated items keep moving)
    const pv = document.createElement("canvas"); pv.width = 420; pv.height = 200; pv.className = "cust-preview"; pv.setAttribute("role", "img"); pv.setAttribute("aria-label", "Your car with everything you have on");
    const ex = myExtras(u);
    const drawPv = () => { const c = pv.getContext("2d"); c.clearRect(0, 0, pv.width, pv.height); drawCar(c, { color: prof.color, livery: prof.livery, number: prof.number, design: ex.livery ? null : prof.design, extras: ex }, pv.width * 0.56, pv.height / 2, 0, 4.2, { trailPreview: !!ex.trail, flamePreview: !!ex.flame }); if (ex.badge) { c.font = "34px sans-serif"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(ex.badge, pv.width * 0.56, 22); } };
    drawPv(); if (!reducedMotion) { pv._draw = drawPv; pv._born = performance.now(); LIVE.add(pv); livePreviews(); }
    box.appendChild(pv);
    const empty = CUST_ORDER.filter((slot) => !owned.some((x) => x.slot === slot));
    for (const slot of CUST_ORDER.filter((x) => !empty.includes(x))) {
      const mine = owned.filter((x) => x.slot === slot);
      const sec = el("section", "cust-slot");
      const on = u.equipped?.[slot];
      const h = el("h3", "hub-h", SLOT_NAMES[slot] || slot); h.appendChild(el("small", "store-count", ` ${mine.length} owned`)); sec.appendChild(h);
      const row = el("div", "cust-row");
      if (!mine.length) {
        const go = el("button", "btn ghost cust-empty", "Nothing here yet · 🛒 Shop"); go.type = "button";
        go.addEventListener("click", () => { const t = STORE_TABS.find((x) => x[2]?.includes(slot)); SHOP.tab = t ? t[0] : "chests"; saveShop(); A.tab = "store"; renderHub(); });
        row.appendChild(go);
      } else {
        const none = el("button", "cust-item none" + (!on ? " on" : "")); none.type = "button"; none.append(el("span", "cust-none", "∅"), el("small", "", "None"));
        none.addEventListener("click", () => { if (on) socket.emit("store:equip", { slot, id: null }); });
        row.appendChild(none);
        for (const it of mine.sort((a, b) => RARITY_ORDER.indexOf(b.rarity) - RARITY_ORDER.indexOf(a.rarity) || a.name.localeCompare(b.name))) {
          const b = el("button", "cust-item" + (on === it.id ? " on" : "")); b.type = "button"; b.title = it.name;
          b.style.setProperty("--rc", RARITY[it.rarity]?.[1] || "var(--edge)");
          b.append(itemPreview(it, 132, 72), el("small", "", it.name.replace(" (animated)", " ✨")));
          b.addEventListener("click", () => socket.emit("store:equip", { slot, id: on === it.id ? null : it.id }));
          const cell = el("div", "cust-cell"); cell.append(b, sellBtn(it, "cust-sell")); row.appendChild(cell);
        }
      }
      sec.appendChild(row); box.appendChild(sec);
    }
    if (empty.length) {
      const sec = el("section", "cust-slot cust-none-yet");
      sec.append(el("p", "preset-note", `Nothing yet for: ${empty.map((x) => SLOT_NAMES[x] || x).join(", ")}.`));
      const go = el("button", "btn ghost cust-empty", "🛒 Go to the store"); go.type = "button";
      go.addEventListener("click", () => { A.tab = "store"; renderHub(); });
      sec.appendChild(go); box.appendChild(sec);
    }
  }
  // ======================= Plinko (the gambling room) =======================
  // The server rolls every ball's path; this just animates it and keeps score. Built once and kept, so a
  // coins update (which redraws the hub) never cuts a falling ball short.
  // balance on screen = the server's last number - bets still waiting for an answer - wins still falling
  const PL = { root: null, balls: [], risk: "medium", bet: 50, base: null, pend: new Map(), queue: [], net: 0, hist: [], id: 0, raf: 0 };
  const plShown = () => (PL.base ?? 0) - [...PL.pend.values()].reduce((t, x) => t + x.bet, 0) - PL.balls.reduce((t, b) => t + (b.landed ? 0 : b.win), 0);
  try { const v = JSON.parse(localStorage.getItem("tb-plinko") || "null"); if (v) { PL.risk = v.risk || PL.risk; PL.bet = v.bet || PL.bet; } } catch (e) {}
  const plSave = () => { try { localStorage.setItem("tb-plinko", JSON.stringify({ risk: PL.risk, bet: PL.bet })); } catch (e) {} };
  const plCol = (m) => (m >= 100 ? "#e11d48" : m >= 10 ? "#ef4444" : m >= 3 ? "#f97316" : m >= 1.5 ? "#f59e0b" : m >= 1 ? "#eab308" : "#475569");
  function plGeom(cv) { const W = cv.width, rows = 12, sp = W / (rows + 3), top = 26, rowH = (cv.height - top - 46) / rows; return { W, rows, sp, top, rowH, by: top + rows * rowH + 8 }; }
  function plDraw() {
    const cv = PL.cv; if (!cv || !cv.isConnected) { PL.raf = 0; return; }
    const c = cv.getContext("2d"), G = plGeom(cv), pays = A.catalog?.plinko?.pays?.[PL.risk] || [];
    c.clearRect(0, 0, cv.width, cv.height);
    c.fillStyle = "#cbd5e1";
    for (let r = 0; r < G.rows; r++) for (let j = 0; j < r + 3; j++) { c.beginPath(); c.arc(G.W / 2 + (j - (r + 2) / 2) * G.sp, G.top + r * G.rowH, 3.2, 0, Math.PI * 2); c.fill(); }
    const now = performance.now();
    pays.forEach((m, b) => {
      const x = G.W / 2 + (b - 6) * G.sp, hit = PL.flash?.b === b && now - PL.flash.at < 500;
      c.fillStyle = plCol(m); c.globalAlpha = hit ? 1 : 0.85; rrect(c, x - G.sp / 2 + 2, G.by + (hit ? 4 : 0), G.sp - 4, 26, 5); c.fill(); c.globalAlpha = 1;
      c.fillStyle = "#fff"; c.font = `800 ${G.sp < 34 ? 9 : 11}px 'Chakra Petch', sans-serif`; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(m + "x", x, G.by + 13 + (hit ? 4 : 0));
    });
    // a ball appears the moment you click: it drops in on top of the first peg (and bounces there if the
    // server is slow to answer), then follows the path the server rolled
    const dur = 1350, lead = 220;
    PL.balls = PL.balls.filter((bl) => {
      if (!bl.path || now < bl.at) {
        const k = Math.min(1, (now - bl.made) / lead), y = k < 1 ? -8 + (G.top - 6) * k * k : G.top - 14 - Math.abs(Math.sin((now - bl.made - lead) / 120)) * 6;
        c.fillStyle = "#ffcc1f"; c.shadowColor = "#ffcc1f"; c.shadowBlur = 8; c.beginPath(); c.arc(G.W / 2 + ((bl.lane || 0) - 2) * 4, y, 6, 0, Math.PI * 2); c.fill(); c.shadowBlur = 0;
        return true;
      }
      const k = Math.min(1, (now - bl.at) / dur), tt = k * G.rows, i = Math.min(G.rows - 1, Math.floor(tt)), f = tt - i;
      const xAt = (row) => { let rights = 0; for (let q = 0; q < row; q++) rights += bl.path[q]; return G.W / 2 + (rights - row / 2) * G.sp; };
      const x = xAt(i) + (xAt(i + 1) - xAt(i)) * f, y = G.top - 14 + (i + f) * G.rowH - Math.sin(f * Math.PI) * G.rowH * 0.35;
      if (i !== bl.lastRow) { bl.lastRow = i; if (i > 0) tone(300 + i * 40, 0.03, "triangle", 0.04); }
      c.fillStyle = "#ffcc1f"; c.shadowColor = "#ffcc1f"; c.shadowBlur = 8; c.beginPath(); c.arc(x, y, 6, 0, Math.PI * 2); c.fill(); c.shadowBlur = 0;
      if (k >= 1) { plLand(bl); return false; }
      return true;
    });
    if (PL.balls.length || (PL.flash && now - PL.flash.at < 500)) PL.raf = requestAnimationFrame(plDraw); else PL.raf = 0;
  }
  function plLand(bl) {
    bl.landed = true;
    PL.flash = { b: bl.bucket, at: performance.now() };
    PL.net += bl.win - bl.bet;
    PL.hist.unshift(bl.mult); PL.hist.length = Math.min(PL.hist.length, 14);
    if (bl.mult >= 10) { sfx("win"); banner(`🎰 ${bl.mult}x! +${bl.win.toLocaleString()}`, plCol(bl.mult)); } else if (bl.mult >= 1) sfx("tick"); else tone(160, 0.12, "sawtooth", 0.06);
    plStatus();
  }
  function plStatus() {
    if (!PL.root) return;
    PL.root.querySelector(".pl-bal").textContent = `🪙 ${Math.max(0, Math.round(plShown())).toLocaleString()}`;
    if (A.user && PL.base != null) $("hubCoins").textContent = `🪙 ${Math.max(0, Math.round(plShown()))}`;     // (the coin badge up top agrees with the board)
    const n = PL.root.querySelector(".pl-net"); n.textContent = `This session: ${PL.net >= 0 ? "+" : ""}${PL.net.toLocaleString()}${PL.queue.length ? ` · ${PL.queue.length} more to drop` : ""}`; n.className = "pl-net " + (PL.net > 0 ? "up" : PL.net < 0 ? "down" : "");
    const h = PL.root.querySelector(".pl-hist"); h.textContent = "";
    for (const m of PL.hist) { const sp = el("span", "", m + "x"); sp.style.background = plCol(m); h.appendChild(sp); }
  }
  function plDrop(n = 1) {
    const u = A.user; if (!u) return popup("Sign in to play", true);
    const bet = Math.floor(Number(PL.root.querySelector(".pl-bet").value) || 0), min = A.catalog?.plinko?.min || 10, max = A.catalog?.plinko?.max || 1000;
    if (bet < min || bet > max) return popup(`Bets are ${min} to ${max} coins`, true);
    PL.bet = bet; plSave();
    // one queue for every click: balls go out one at a time at a steady pace (the server allows 8 a second),
    // so spamming Drop 10 never gets balls turned away or stuck waiting on the top peg
    const room = 40 - PL.queue.length - PL.pend.size;
    if (room <= 0) return;
    for (let k = 0; k < Math.min(n, room); k++) PL.queue.push(bet);
    plStatus(); plPump();
  }
  function plPump() {
    if (PL.pumping) return;
    const bet = PL.queue[0]; if (bet === undefined) return;
    if (!A.user || plShown() < bet) {
      PL.queue.length = 0; plStatus();
      if (A.user && !PL.toldPoor) { PL.toldPoor = true; popup("Not enough coins", true); setTimeout(() => (PL.toldPoor = false), 1500); }
      return;
    }
    PL.queue.shift();
    const id = ++PL.id;
    PL.pend.set(id, { bet, at: Date.now() }); socket.emit("plinko:play", { bet, risk: PL.risk, id });
    PL.balls.push({ id, path: null, win: 0, bet, made: performance.now(), lane: id % 5 }); plStatus();
    if (!PL.raf) PL.raf = requestAnimationFrame(plDraw);
    setTimeout(() => { if (PL.pend.delete(id)) { plDropBall(id); plStatus(); } }, 6000);       // (no answer at all: give the bet back on screen)
    PL.pumping = true; setTimeout(() => { PL.pumping = false; plPump(); }, 170);
  }
  const plDropBall = (id) => { PL.balls = PL.balls.filter((b) => b.id !== id || b.path); };
  socket.on("plinkoResult", (r) => {
    PL.pend.delete(r.id);
    if (r.error) { plDropBall(r.id); if (!PL.toldErr) { PL.toldErr = true; popup("🎰 " + r.error, true); setTimeout(() => (PL.toldErr = false), 1500); } plStatus(); return; }
    PL.base = r.coins;                     // the server's balance, win included (it's held back on screen until the ball lands)
    const now = performance.now(), res = { path: r.path, bucket: r.bucket, mult: r.mult, win: r.win, bet: r.bet };
    const bl = PL.balls.find((b) => b.id === r.id && !b.path);
    if (bl) Object.assign(bl, res, { at: Math.max(now, bl.made + 220) }); else PL.balls.push({ ...res, made: now - 220, at: now });
    plStatus();
    if (!PL.raf) PL.raf = requestAnimationFrame(plDraw);
  });
  function renderPlinko(u, box) {
    if (!PL.root) {
      const R = PL.root = el("div", "plinko");
      R.innerHTML = `<p class="hub-h">🎰 Plinko: drop a ball, win up to 170x. <b>Coins only, just for fun.</b> On average every drop pays back about 99%, so the house wins in the end.</p>
        <div class="pl-top"><span class="pl-bal"></span><span class="pl-net"></span></div>
        <div class="pl-main"><canvas class="pl-board" width="520" height="440" role="img" aria-label="Plinko board"></canvas>
        <div class="pl-side"><label class="f">Bet (10-1000) <input class="pl-bet" type="number" min="10" max="1000" step="10" inputmode="numeric"></label>
        <div class="pl-quick"><button type="button" class="btn" data-q="half">½</button><button type="button" class="btn" data-q="double">2x</button><button type="button" class="btn" data-q="max">Max</button></div>
        <div class="chips pl-risk"><button type="button" class="chip" data-r="low">Low risk</button><button type="button" class="chip" data-r="medium">Medium</button><button type="button" class="chip" data-r="high">High risk</button></div>
        <button type="button" class="btn go pl-drop">🎯 Drop</button><button type="button" class="btn pl-drop10">Drop 10</button>
        <div class="pl-hist" aria-label="Last results"></div></div></div>`;
      PL.cv = R.querySelector(".pl-board");
      R.querySelector(".pl-bet").value = PL.bet;
      R.querySelector(".pl-drop").addEventListener("click", () => plDrop(1));
      R.querySelector(".pl-drop10").addEventListener("click", () => plDrop(10));
      R.querySelectorAll(".pl-quick button").forEach((b) => b.addEventListener("click", () => {
        const inp = R.querySelector(".pl-bet"), v = Number(inp.value) || 10, max = Math.min(A.catalog?.plinko?.max || 1000, Math.max(10, Math.floor(plShown())));
        inp.value = Math.max(10, Math.min(max, b.dataset.q === "half" ? Math.floor(v / 2) : b.dataset.q === "double" ? v * 2 : max));
      }));
      R.querySelectorAll(".pl-risk .chip").forEach((b) => b.addEventListener("click", () => { PL.risk = b.dataset.r; plSave(); R.querySelectorAll(".pl-risk .chip").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.r === PL.risk))); if (!PL.raf) plDraw(); }));
    }
    if (PL.root.parentNode !== box) { box.textContent = ""; box.appendChild(PL.root); }
    PL.root.querySelectorAll(".pl-risk .chip").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.r === PL.risk)));
    const guest = !u; PL.root.querySelector(".pl-drop").disabled = guest; PL.root.querySelector(".pl-drop10").disabled = guest;
    if (u && !PL.balls.length && !PL.pend.size) PL.base = u.coins;          // (nothing in the air: the account's number is the truth)
    plStatus(); if (!PL.raf) plDraw();
  }
  // ======================= Casino: daily wheel, Plinko, slots, blackjack =======================
  // Everything is rolled on the server; this only animates it. Each game is built once and kept.
  const CZ = { root: null, game: "wheel", rot: 0, spinning: false, slotBusy: false, bjBusy: false, slotBet: 50, bjBet: 50, panes: {} };
  try { const v = JSON.parse(localStorage.getItem("tb-casino") || "null"); if (v) { CZ.game = v.game || CZ.game; CZ.slotBet = v.slotBet || 50; CZ.bjBet = v.bjBet || 50; } } catch (e) {}
  const czSave = () => { try { localStorage.setItem("tb-casino", JSON.stringify({ game: CZ.game, slotBet: CZ.slotBet, bjBet: CZ.bjBet })); } catch (e) {} };
  const CZ_GAMES = [["wheel", "🎡 Daily wheel"], ["plinko", "🎰 Plinko"], ["slots", "🍒 Slots"], ["bj", "🃏 Blackjack"]];
  function czCoins(n) { if (A.user && typeof n === "number") { A.user.coins = n; $("hubCoins").textContent = `🪙 ${n}`; } if (CZ.root) CZ.root.querySelectorAll(".cz-bal").forEach((b) => (b.textContent = `🪙 ${(A.user?.coins || 0).toLocaleString()}`)); }
  function czBetRow(key, max) {
    const row = el("div", "cz-betrow"), lab = el("label", "f", "Bet "), inp = document.createElement("input");
    inp.type = "number"; inp.min = "10"; inp.max = String(max); inp.step = "10"; inp.inputMode = "numeric"; inp.className = "cz-bet"; inp.value = CZ[key];
    inp.addEventListener("change", () => { CZ[key] = Math.max(10, Math.min(max, Math.floor(Number(inp.value) || 10))); inp.value = CZ[key]; czSave(); });
    lab.appendChild(inp); row.appendChild(lab);
    for (const [q, t] of [["half", "½"], ["double", "2x"], ["max", "Max"]]) {
      const b = el("button", "btn", t); b.type = "button";
      b.addEventListener("click", () => { const v = CZ[key], m = Math.min(max, Math.max(10, A.user?.coins || 10)); CZ[key] = Math.max(10, Math.min(m, q === "half" ? Math.floor(v / 2) : q === "double" ? v * 2 : m)); inp.value = CZ[key]; czSave(); });
      row.appendChild(b);
    }
    return row;
  }
  function renderCasino(u) {
    const box = $("hubPlinko");
    if (!CZ.root) {
      CZ.root = el("div", "casino");
      const nav = el("div", "chips cz-nav");
      for (const [g, t] of CZ_GAMES) { const b = el("button", "chip", t); b.type = "button"; b.dataset.g = g; b.addEventListener("click", () => { CZ.game = g; czSave(); renderCasino(A.user); }); nav.appendChild(b); }
      CZ.root.appendChild(nav);
      for (const [g] of CZ_GAMES) { const pn = el("div", "cz-pane"); pn.dataset.g = g; CZ.panes[g] = pn; CZ.root.appendChild(pn); }
    }
    if (CZ.root.parentNode !== box) { box.textContent = ""; box.appendChild(CZ.root); }
    CZ.root.querySelectorAll(".cz-nav .chip").forEach((b) => { b.setAttribute("aria-pressed", String(b.dataset.g === CZ.game)); if (b.dataset.g === "wheel") b.textContent = "🎡 Daily wheel" + (u?.wheel?.free ? " • free spin!" : u?.wheel?.spins ? ` (${u.wheel.spins})` : ""); });
    for (const [g, pn] of Object.entries(CZ.panes)) pn.classList.toggle("hidden", g !== CZ.game);
    const pn = CZ.panes[CZ.game];
    if (CZ.game === "plinko") renderPlinko(u, pn); else if (CZ.game === "wheel") renderWheel(u, pn); else if (CZ.game === "slots") renderSlots(u, pn); else renderBj(u, pn);
  }
  // ---- daily wheel ----
  function wheelDraw() {
    const cv = CZ.wcv; if (!cv) return;
    const c = cv.getContext("2d"), W = cv.width, R = W / 2 - 8, segs = A.catalog?.wheel || [], n = segs.length || 12, step = (Math.PI * 2) / n;
    const cols = ["#ef4444", "#f59e0b", "#3b82f6", "#22c55e", "#a855f7", "#ec4899"];
    c.clearRect(0, 0, W, W); c.save(); c.translate(W / 2, W / 2);
    for (let i = 0; i < n; i++) {
      const a0 = CZ.rot + i * step - Math.PI / 2, w = segs[i] || {};
      c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, R, a0, a0 + step); c.closePath(); c.fillStyle = w.coins >= 1000 ? "#ffcc1f" : cols[i % cols.length]; c.fill();
      c.strokeStyle = "#0b0e1a"; c.lineWidth = 2; c.stroke();
      c.save(); c.rotate(a0 + step / 2); c.textAlign = "right"; c.textBaseline = "middle"; c.fillStyle = w.coins >= 1000 ? "#1a1300" : "#fff"; c.font = "800 15px 'Chakra Petch', sans-serif";
      c.fillText(w.coins ? `🪙${w.coins}` : w.xp ? `⭐${w.xp}XP` : w.spins ? "🎡 +1" : w.crate ? "🎁 crate" : "", R - 10, 0); c.restore();
    }
    c.beginPath(); c.arc(0, 0, 26, 0, Math.PI * 2); c.fillStyle = "#1a1d25"; c.fill(); c.strokeStyle = "#ffcc1f"; c.lineWidth = 3; c.stroke();
    c.restore();
    c.fillStyle = "#fff"; c.beginPath(); c.moveTo(W / 2 - 14, 2); c.lineTo(W / 2 + 14, 2); c.lineTo(W / 2, 30); c.closePath(); c.fill(); c.strokeStyle = "#0b0e1a"; c.stroke();   // the pointer
  }
  function wheelStatus(u) {
    const P = CZ.panes.wheel, w = u?.wheel, b = P.querySelector(".cz-spin"), st = P.querySelector(".cz-wstat");
    if (!u) { b.disabled = true; b.textContent = "Sign in to spin"; st.textContent = ""; return; }
    b.disabled = CZ.spinning || !(w.free || w.spins > 0);
    b.textContent = CZ.spinning ? "Spinning..." : w.free ? "🎡 Free daily spin!" : w.spins > 0 ? `🎡 Spin (${w.spins} left)` : "No spins left";
    const h = Math.max(0, Math.ceil((w.next - Date.now()) / 3600000));
    st.textContent = w.free ? "Your free spin for today is ready." : `Next free spin in about ${h} hour${h === 1 ? "" : "s"}.${w.spins ? ` You have ${w.spins} extra spin${w.spins === 1 ? "" : "s"} from the season pass.` : " Get extra spins from the season pass."}`;
  }
  function renderWheel(u, pn) {
    if (!pn.firstChild) {
      pn.innerHTML = `<p class="hub-h">🎡 One free spin every day, plus extra spins from the season pass. Every slice is a prize.</p>
        <div class="cz-main"><canvas class="cz-wheel" width="340" height="340" role="img" aria-label="Prize wheel"></canvas>
        <div class="cz-side"><span class="cz-bal"></span><button type="button" class="btn go cz-spin">🎡 Spin</button><p class="cz-wstat preset-note"></p><p class="cz-out" role="status"></p></div></div>`;
      CZ.wcv = pn.querySelector(".cz-wheel");
      pn.querySelector(".cz-spin").addEventListener("click", () => { if (CZ.spinning) return; CZ.spinning = true; pn.querySelector(".cz-out").textContent = ""; wheelStatus(A.user); socket.emit("wheel:spin"); });
    }
    czCoins(); wheelStatus(u); wheelDraw();
  }
  socket.on("wheel:spin:res", (r) => {
    if (r.error) { CZ.spinning = false; popup(r.error, true); if (A.user) wheelStatus(A.user); return; }
    const n = A.catalog?.wheel?.length || 12, step = (Math.PI * 2) / n;
    // land the middle of the winning slice under the pointer, after a few full turns
    const TAU = Math.PI * 2, target = -(r.seg + 0.5) * step, from = CZ.rot, cur = ((from % TAU) + TAU) % TAU;
    const end = from + ((((target - cur) % TAU) + TAU) % TAU) + 5 * TAU + (Math.random() - 0.5) * step * 0.6, t0 = performance.now(), dur = 3600;
    let lastTick = Math.floor(from / step);
    const anim = (now) => {
      const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      CZ.rot = from + (end - from) * e; wheelDraw();
      const tk = Math.floor(CZ.rot / step); if (tk !== lastTick) { lastTick = tk; tone(500 + Math.random() * 80, 0.02, "square", 0.03); }
      if (k < 1) return requestAnimationFrame(anim);
      CZ.spinning = false; czCoins(r.coins);
      if (A.user) { A.user.wheel = r.wheel; wheelStatus(A.user); }
      const out = CZ.panes.wheel.querySelector(".cz-out"); out.textContent = `You won ${r.label}!`;
      sfx("win"); banner(`🎡 ${r.label}!`, "#ffcc1f");
      if (A.tab === "plinko" && !$("hub").classList.contains("hidden")) renderCasino(A.user);
    };
    requestAnimationFrame(anim);
  });
  // ---- slots ----
  function renderSlots(u, pn) {
    if (!pn.firstChild) {
      const C = A.catalog?.slots, pay = C ? Object.entries(C.pay).map(([s2, m]) => `${s2}${s2}${s2} ${m}x`).join(" · ") + ` · any two 🍒 ${C.twoCherry}x` : "";
      pn.innerHTML = `<p class="hub-h">🍒 Slots: line up three of a kind. Pays back about 97% on average.</p>
        <div class="cz-main"><div class="cz-reels" aria-live="polite"><span>🍒</span><span>⭐</span><span>7️⃣</span></div>
        <div class="cz-side"><span class="cz-bal"></span><div class="cz-betslot"></div><button type="button" class="btn go cz-pull">🎰 Spin</button><p class="cz-out" role="status"></p></div></div>
        <p class="preset-note cz-pay">${pay}</p>`;
      pn.querySelector(".cz-betslot").appendChild(czBetRow("slotBet", C?.max || 1000));
      pn.querySelector(".cz-pull").addEventListener("click", () => {
        if (CZ.slotBusy || !A.user) return;
        if (CZ.slotBet > A.user.coins) return popup("Not enough coins", true);
        CZ.slotBusy = true; pn.querySelector(".cz-pull").disabled = true; pn.querySelector(".cz-out").textContent = "";
        czCoins(A.user.coins - CZ.slotBet);
        const syms = A.catalog?.slots?.syms || ["🍒", "🍋", "🔔", "⭐", "🏁", "7️⃣"], reels = [...pn.querySelectorAll(".cz-reels span")];
        CZ.slotRoll = setInterval(() => reels.forEach((r, i) => { if (!r.dataset.stop) r.textContent = syms[Math.floor(Math.random() * syms.length)]; }), 70);
        reels.forEach((r) => { delete r.dataset.stop; r.classList.add("rolling"); });
        CZ.slotAt = performance.now(); socket.emit("slots:play", { bet: CZ.slotBet });
      });
    }
    pn.querySelector(".cz-pull").disabled = !u || CZ.slotBusy;
    czCoins();
  }
  socket.on("slots:play:res", (r) => {
    const pn = CZ.panes.slots, reels = [...pn.querySelectorAll(".cz-reels span")], wait = Math.max(0, 500 - (performance.now() - (CZ.slotAt || 0)));
    const done = () => { clearInterval(CZ.slotRoll); CZ.slotBusy = false; pn.querySelector(".cz-pull").disabled = !A.user; reels.forEach((x) => x.classList.remove("rolling")); };
    if (r.error) { done(); popup(r.error, true); czCoins(r.coins ?? A.user?.coins); return; }
    r.reels.forEach((sym, i) => setTimeout(() => { reels[i].dataset.stop = "1"; reels[i].textContent = sym; reels[i].classList.remove("rolling"); tone(300 + i * 120, 0.05, "triangle", 0.05); }, wait + i * 260));
    setTimeout(() => {
      done(); czCoins(r.coins);
      const out = pn.querySelector(".cz-out");
      if (r.win) { out.textContent = `+${r.win.toLocaleString()} (${r.mult}x)!`; out.className = "cz-out up"; if (r.mult >= 20) { sfx("win"); banner(`🎰 ${r.mult}x! +${r.win.toLocaleString()}`, "#ffcc1f"); } else sfx("tick"); }
      else { out.textContent = "No win"; out.className = "cz-out down"; }
    }, wait + 2 * 260 + 80);
  });
  // ---- blackjack ----
  const SUITS = ["♠", "♥", "♦", "♣"], RANKS = ["", "A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
  function bjCardEl(c) { if (!c) return el("span", "cz-card back", "🂠"); const d = el("span", "cz-card" + (c.s === 1 || c.s === 2 ? " red" : ""), RANKS[c.r] + SUITS[c.s]); return d; }
  function renderBj(u, pn) {
    if (!pn.firstChild) {
      pn.innerHTML = `<p class="hub-h">🃏 Blackjack: get closer to 21 than the dealer without going over. Dealer stands on 17, blackjack pays 3 to 2, double on your first two cards.</p>
        <div class="cz-table"><div class="cz-hand"><small>Dealer <b class="cz-dt"></b></small><div class="cz-cards cz-dealer"></div></div>
        <div class="cz-hand"><small>You <b class="cz-pt"></b></small><div class="cz-cards cz-player"></div></div></div>
        <p class="cz-out" role="status"></p>
        <div class="cz-side cz-bjside"><span class="cz-bal"></span><div class="cz-betslot"></div>
        <div class="cz-acts"><button type="button" class="btn go cz-deal">🃏 Deal</button><button type="button" class="btn cz-hit">Hit</button><button type="button" class="btn cz-stand">Stand</button><button type="button" class="btn cz-double">Double</button></div></div>`;
      pn.querySelector(".cz-betslot").appendChild(czBetRow("bjBet", A.catalog?.bj?.max || 2000));
      const send = (ev, d) => { if (CZ.bjBusy || !A.user) return; CZ.bjBusy = true; socket.emit(ev, d); };
      pn.querySelector(".cz-deal").addEventListener("click", () => { if (CZ.bjBet > (A.user?.coins || 0)) return popup("Not enough coins", true); send("bj:deal", { bet: CZ.bjBet }); });
      pn.querySelector(".cz-hit").addEventListener("click", () => send("bj:act", { act: "hit" }));
      pn.querySelector(".cz-stand").addEventListener("click", () => send("bj:act", { act: "stand" }));
      pn.querySelector(".cz-double").addEventListener("click", () => send("bj:act", { act: "double" }));
    }
    bjShow(u?.bj || null);
    czCoins();
  }
  function bjShow(h) {
    const pn = CZ.panes.bj; if (!pn.firstChild) return;
    const live = !!h && !h.done, dl = pn.querySelector(".cz-dealer"), pl = pn.querySelector(".cz-player");
    dl.textContent = ""; pl.textContent = "";
    if (h) { h.dealer.forEach((c) => dl.appendChild(bjCardEl(c))); h.player.forEach((c) => pl.appendChild(bjCardEl(c))); }
    pn.querySelector(".cz-dt").textContent = h ? (h.done ? h.dealerTotal : `${h.dealerTotal} + ?`) : "";
    pn.querySelector(".cz-pt").textContent = h ? h.total : "";
    const out = pn.querySelector(".cz-out");
    const RES = { blackjack: ["🎉 Blackjack!", "up"], win: ["You win!", "up"], push: ["Push: your bet back", ""], lose: ["Dealer wins", "down"], bust: ["Bust!", "down"] };
    if (h?.done) { const [t, k] = RES[h.result] || ["", ""]; out.textContent = `${t}${h.paid ? ` +${h.paid.toLocaleString()}` : ""}`; out.className = "cz-out " + k; }
    else out.textContent = live ? `Bet: 🪙 ${h.bet.toLocaleString()}` : "";
    const guest = !A.user;
    pn.querySelector(".cz-deal").disabled = guest || live || CZ.bjBusy;
    pn.querySelector(".cz-hit").disabled = !live || CZ.bjBusy; pn.querySelector(".cz-stand").disabled = !live || CZ.bjBusy;
    pn.querySelector(".cz-double").disabled = !live || CZ.bjBusy || !h.canDouble;
    pn.querySelector(".cz-betslot").classList.toggle("dim", live);
  }
  const bjRes = (r) => {
    CZ.bjBusy = false;
    if (r.error) { popup(r.error, true); bjShow(A.user?.bj || null); return; }
    if (A.user) A.user.bj = r.hand;
    czCoins(r.coins); bjShow(r.hand);
    if (r.hand.done) { if (r.hand.result === "blackjack") { sfx("win"); banner("🃏 BLACKJACK!", "#ffcc1f"); } else if (r.hand.paid > r.hand.bet) sfx("tick"); else if (!r.hand.paid) tone(160, 0.12, "sawtooth", 0.06); }
    else tone(420, 0.03, "triangle", 0.04);
  };
  socket.on("bj:deal:res", bjRes); socket.on("bj:act:res", bjRes);
  const SLOT_NAMES = { body: "Car bodies", livery: "Liveries", decal: "Decals", num: "Number plates", wing: "Rear wings", rims: "Rims", glow: "Underglow", flame: "Boost flames", trail: "Trails", smoke: "Tyre smoke", helmet: "Helmets", badge: "Name badges" };
  const SLOT_TIPS = { body: "Legendary chest only", livery: "Chest only", badge: "Shows next to your name in races" };
  // the store's sections: chests first, then items grouped by where they go on the car
  const STORE_TABS = [
    ["chests", "📦 Chests", null],
    ["car", "🚗 Car & paint", ["body", "livery", "decal", "num"]],
    ["parts", "🛞 Wheels & wing", ["rims", "wing"]],
    ["fx", "✨ Effects", ["glow", "flame", "trail", "smoke"]],
    ["driver", "🧑 Driver", ["helmet", "badge"]],
  ];
  const RARITY_ORDER = ["common", "rare", "epic", "legendary", "mythic"];
  const SHOP = { tab: "chests", show: "all", sort: "price" };
  try { const v = JSON.parse(localStorage.getItem("tb-shop") || "null"); if (v) Object.assign(SHOP, v); } catch (e) {}
  if (!STORE_TABS.some((t) => t[0] === SHOP.tab)) SHOP.tab = "chests";
  const saveShop = () => { try { localStorage.setItem("tb-shop", JSON.stringify(SHOP)); } catch (e) {} };
  // sell: tap once to see the price, tap again within 3 s to sell
  function sellBtn(it, cls = "btn ghost sell-btn") {
    const b = el("button", cls, `Sell 🪙${(it.sell || 0).toLocaleString()}`); b.type = "button"; b.title = "Sell it back (half price for shop items, a set value for chest items)";
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      if (b.dataset.sure !== "1") { b.dataset.sure = "1"; b.textContent = `Sure? +${(it.sell || 0).toLocaleString()}`; b.classList.add("sure"); setTimeout(() => { if (b.isConnected) { b.dataset.sure = ""; b.textContent = `Sell 🪙${(it.sell || 0).toLocaleString()}`; b.classList.remove("sure"); } }, 3000); return; }
      socket.emit("store:sell", it.id); sfx("tick");
    });
    return b;
  }
  function storeCard(it, u) {
    const slot = it.slot, owned = u?.owned.includes(it.id), on = u?.equipped?.[slot] === it.id;
    const card = el("div", "item" + (on ? " on" : ""));
    const rt = el("span", "rtag", RARITY[it.rarity]?.[0] || ""); rt.style.color = RARITY[it.rarity]?.[1];
    card.style.setProperty("--rc", RARITY[it.rarity]?.[1] || "var(--edge)");
    card.append(itemPreview(it), rt, el("b", "", it.name));
    const row = el("div", "item-row");
    if (!owned && it.loot) {
      row.appendChild(el("span", "price", "📦 Chest only"));
    } else if (!owned) {
      row.appendChild(el("span", "price", `🪙 ${it.price}`));
      const b = el("button", "btn go", "Buy"); b.type = "button";
      b.disabled = !u || u.coins < it.price; b.title = !u ? "Sign in first" : u.coins < it.price ? `You need ${it.price - u.coins} more coins` : "";
      b.addEventListener("click", () => socket.emit("store:buy", it.id));
      row.appendChild(b);
    } else {
      row.appendChild(el("span", "price", on ? "Equipped" : "Owned"));
      const b = el("button", "btn", on ? "Take off" : "Equip"); b.type = "button";
      b.addEventListener("click", () => socket.emit("store:equip", { slot, id: on ? null : it.id }));
      row.appendChild(b);
    }
    card.appendChild(row);
    if (owned) card.appendChild(sellBtn(it));
    return card;
  }
  function renderStore(u) {
    const box = $("hubStore"); box.textContent = "";
    if (!A.catalog) { box.textContent = "Loading..."; return; }
    box.appendChild(el("p", "hub-h", u ? `You have 🪙 ${u.coins}. Earn more by unlocking achievements. Items show up on your car in every race.` : "Earn coins from achievements and spend them here. Items show up on your car in every race."));
    const items = A.catalog.store.filter((x) => !x.pass || u?.owned.includes(x.id));
    // section tabs, with how many you own in each
    const tabs = el("div", "store-tabs"); tabs.setAttribute("role", "tablist");
    for (const [id, label, slots] of STORE_TABS) {
      const b = el("button", "store-tab", label); b.type = "button"; b.setAttribute("role", "tab"); b.setAttribute("aria-selected", String(SHOP.tab === id));
      if (slots && u) { const all = items.filter((x) => slots.includes(x.slot)); b.appendChild(el("small", "", ` ${all.filter((x) => u.owned.includes(x.id)).length}/${all.length}`)); }
      b.addEventListener("click", () => { SHOP.tab = id; saveShop(); renderStore(u); });
      tabs.appendChild(b);
    }
    box.appendChild(tabs);
    const tab = STORE_TABS.find((t) => t[0] === SHOP.tab);
    if (!tab[2]) { renderBoxes(box, u); return; }
    // filter + sort
    const bar = el("div", "store-bar");
    const chips = (opts, key) => {
      const c = el("div", "chips");
      for (const [v, label] of opts) {
        const b = el("button", "chip", label); b.type = "button"; b.setAttribute("aria-pressed", String(SHOP[key] === v));
        b.addEventListener("click", () => { SHOP[key] = v; saveShop(); renderStore(u); });
        c.appendChild(b);
      }
      return c;
    };
    bar.append(chips([["all", "All"], ["buy", "Can buy"], ["owned", "Owned"]], "show"), chips([["price", "🪙 Cheapest"], ["rarity", "💎 Rarity"], ["name", "🔤 A-Z"]], "sort"));
    box.appendChild(bar);
    const rk = (x) => RARITY_ORDER.indexOf(x.rarity);
    const cmp = SHOP.sort === "rarity" ? (a, b) => rk(a) - rk(b) || a.price - b.price || a.name.localeCompare(b.name)
      : SHOP.sort === "name" ? (a, b) => a.name.localeCompare(b.name)
      : (a, b) => !!a.loot - !!b.loot || a.price - b.price || rk(a) - rk(b) || a.name.localeCompare(b.name);
    const keep = (x) => SHOP.show === "owned" ? u?.owned.includes(x.id) : SHOP.show === "buy" ? !u?.owned.includes(x.id) && !x.loot : true;
    let shown = 0;
    for (const slot of tab[2]) {
      const all = items.filter((x) => x.slot === slot); if (!all.length) continue;
      const list = all.filter(keep).sort(cmp);
      // whatever you have on goes first, so it's easy to find
      const eq = u?.equipped?.[slot]; const at = list.findIndex((x) => x.id === eq); if (at > 0) list.unshift(...list.splice(at, 1));
      if (!list.length) continue;
      shown += list.length;
      const sec = el("section", "store-slot");
      const h = el("h3", "hub-h", SLOT_NAMES[slot] || slot);
      if (u) h.appendChild(el("small", "store-count", ` ${all.filter((x) => u.owned.includes(x.id)).length}/${all.length} owned`));
      if (SLOT_TIPS[slot]) h.appendChild(el("small", "store-tip", ` · ${SLOT_TIPS[slot]}`));
      sec.appendChild(h);
      const g = el("div", "store-grid");
      for (const it of list) g.appendChild(storeCard(it, u));
      sec.appendChild(g); box.appendChild(sec);
    }
    if (!shown) box.appendChild(el("p", "preset-note", SHOP.show === "owned" ? "You don't own anything here yet." : SHOP.show === "buy" ? "Nothing left to buy here. You've got it all! 🎉" : "Nothing here."));
  }
  function renderMenuInfo() {
    const m = S.menu; if (!m) return;
    renderBroadcast();
    renderEvent(m.event);
    const t = $("onlineText"); t.textContent = "";
    const b1 = document.createElement("b"); b1.textContent = m.online;
    const b2 = document.createElement("b"); b2.textContent = m.racing;
    t.append(b1, ` player${m.online === 1 ? "" : "s"} online · `, b2, " racing right now");
    const box = $("lobbyList"); box.textContent = "";
    if (!m.lobbies.length) { const d = document.createElement("div"); d.className = "lob-empty"; d.textContent = "No public lobbies yet. Make one and others can join!"; box.appendChild(d); return; }
    for (const L of m.lobbies) {
      const row = document.createElement("div"); row.className = "lob";
      const who = document.createElement("div"); who.className = "who";
      const b = document.createElement("b"); b.textContent = L.name || `${L.host}'s room`;
      const sm = document.createElement("small"); sm.textContent = `${L.phase === "lobby" ? (L.track ? "Track ready" : "Drawing a track") : "Racing now"} · ${L.laps} laps · ${L.ai} AI`;
      who.append(b, sm);
      const cnt = document.createElement("span"); cnt.className = "cnt"; cnt.textContent = `${L.players}/${L.max}`;
      const j = document.createElement("button"); j.type = "button"; j.className = "join-btn"; j.textContent = L.players >= L.max ? "Full" : "Join"; j.disabled = L.players >= L.max;
      j.addEventListener("click", () => { saveProfile(); S.solo = false; socket.emit("join", { code: L.code, profile: prof }); });
      row.append(who, cnt, j); box.appendChild(row);
    }
  }
  $("joinBtn").addEventListener("click", () => {
    const code = codeIn.value.trim().toUpperCase();
    if (code.length !== 4) { menuErr.textContent = "Room codes are 4 letters"; return; }
    saveProfile(); S.solo = false; socket.emit("join", { code, profile: prof });
  });
  codeIn.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); $("joinBtn").click(); } });
  $("menuForm").addEventListener("submit", (e) => e.preventDefault());

  // a clear tab title for every screen (handy with lots of tabs, and for bookmarks)
  function setTitle() {
    const T = "Scribble GP";
    document.title = S.screen === "menu" ? "Scribble GP: Team Boss · Draw a track, race your friends"
      : S.screen === "lobby" ? `Room ${S.lobby?.code || ""} · ${T}`
      : S.screen === "race" ? (S.titleRace || `Racing · ${T}`)
      : S.screen === "results" ? `Results · ${T}` : T;
  }
  function show(screen) {
    S.screen = screen; setTimeout(setTitle, 0); setTimeout(maybeNews, 600);
    crowdOn(screen === "race" && !S.replaying);
    $("menu").classList.toggle("hidden", screen !== "menu");
    $("lobby").classList.toggle("hidden", screen !== "lobby");
    document.body.classList.toggle("in-lobby", screen === "lobby");
    document.body.classList.toggle("in-race", screen === "race");
    if (typeof renderChat === "function") renderChat();
    $("hud").classList.toggle("hidden", screen !== "race");
    { const on = screen === "menu" ? $("menu") : screen === "lobby" ? $("lobby") : screen === "race" ? $("hud") : null;     // (a little entrance)
      if (on && S.lastShown !== screen) { on.classList.remove("enter"); void on.offsetWidth; on.classList.add("enter"); } S.lastShown = screen; }
    $("results").classList.toggle("hidden", screen !== "results");
    if (screen !== "race") { engineSound(0, false); tyreSound(null, false); drumroll(false); $("weatherPill").classList.add("hidden"); if (S.photoOn) photoMode(false); }
    if (screen === "menu") socket.emit("totw:info");
    if (screen === "lobby") requestAnimationFrame(sizeBoard);
    if (screen === "menu") { socket.emit("menuInfo"); if (A.user) socket.emit("friends:get"); }
    if (screen !== "race") { setNitro(false); if (typeof hideCards === "function") hideCards(); }
    if (screen === "race" || screen === "menu") closeFinale();
    if (MUS && MUS.started) setTimeout(() => pickMusic(false), 50);
    if (screen !== "lobby") setEditing(false);
  }

  socket.on("joinError", (m) => {
    // coming back after an update: the host is rebuilding the room, keep knocking for a bit
    if (S.restore && !S.restore.host && S.restore.tries++ < 12) { setTimeout(() => socket.emit("join", { code: S.restore.code, profile: prof }), 2000); return; }
    if (S.restore) { S.restore = null; $("netVeil").classList.add("hidden"); show("menu"); menuErr.textContent = "The game updated and that room didn't come back. Jump back in:"; return; }
    menuErr.textContent = m;
  });
  const saveRejoin = (extra) => { try { const o = { ...(JSON.parse(sessionStorage.getItem("tb-rejoin") || "{}")), ...extra, at: Date.now() }; sessionStorage.setItem("tb-rejoin", JSON.stringify(o)); } catch (e) {} };
  socket.on("joined", (j) => {
    S.code = j.code; S.me = j.you; S.upInfo = j.upgrades; S.f1 = j.f1 || []; show("lobby");
    saveRejoin({ code: j.code, key: j.rejoinKey });
    $("netVeil").classList.add("hidden");
    if (S.restore) {
      const R = S.restore; S.restore = null; S.restarting = false;
      if (R.host && S.host !== false) {       // we're the host: put the room back how it was
        setTimeout(() => { if (R.settings) socket.emit("settings", R.settings); if (R.stroke) setTimeout(() => socket.emit("track", { stroke: R.stroke, map: R.settings?.map || "normal" }), 300); }, 300);
      }
      popup("Back! The restart ended the race, but your room is back.", false);
    }
  });
  // keep the "come back here" note fresh (and remember the room so the host can rebuild it after an update)
  setInterval(() => { if (S.code) saveRejoin({ code: S.code, host: !!S.host, pub: !!S.lobby?.public, settings: S.lobby?.settings || null, stroke: S.host ? S.lobby?.stroke || null : null }); }, 5000);
  // ---- dropped connection / server restart: reconnect and take your car back ----
  // tip of the day: a new one every day on the menu, and a random one while you wait to reconnect
  const TIPS = [
    () => `Hold ${keyName(KEY("boost"))} for boost, and press it the moment the lights go out for a flying start.`,
    () => `Press ${keyName(KEY("box"))} to box this lap: fresh tyres and the damage fixed.`,
    () => `Press ${keyName(KEY("drs"))} in a DRS zone when you're within 1 second of the car ahead: +7% top speed.`,
    () => `Tuck in behind another car on a straight to get a slipstream, even from a car in another class.`,
    () => `Press ${keyName(KEY("defend"))} to defend: your driver covers the car behind (it uses boost).`,
    () => `Press ${keyName(KEY("horn"))} to honk. Pick your horn in Settings.`,
    () => `Press ${keyName(KEY("photo"))} for photo mode: move the camera anywhere and take a picture.`,
    () => "Gravel and grass slow a car right down. Stay on the road!",
    () => "No overtaking behind the safety car. Everyone bunches up, so it's a fresh start.",
    () => "Click anyone on the leaderboard to watch them: their boost, upgrades and the cards they pick.",
    () => "Tyres wear out. When the warning comes up, it's time to box.",
    () => "Click the room code in the lobby to copy it, then send it to a friend.",
    () => "Building a track? Add grandstands, banners, bridges and tunnels next to the track.",
    () => "Pick an engine sound in Settings: V8 rumble, V12 scream or electric whine.",
  ];
  const tipText = (k) => "💡 " + TIPS[((k % TIPS.length) + TIPS.length) % TIPS.length]();
  try { $("tipDay").textContent = tipText(Math.floor(Date.now() / 864e5)); } catch (e) {}
  socket.on("disconnect", () => { try { $("tipVeil").textContent = tipText(Math.floor(Math.random() * TIPS.length)); } catch (e) {} });
  socket.on("disconnect", () => { if (S.code && !S.idleKicked) { $("netVeil").classList.remove("hidden"); $("netMsg").textContent = S.restarting ? "🔄 The server is restarting. Back in a moment..." : "📡 Connection lost. Reconnecting..."; } });
  // (once we're connected again, that restart is over: a later dropped connection is just a dropped connection)
  socket.on("connect", () => { setTimeout(() => { S.restarting = false; }, 20000); });
  socket.on("serverRestart", () => { S.restarting = true; if (S.code) { $("netVeil").classList.remove("hidden"); $("netMsg").textContent = "🔄 The server is restarting. Back in a moment..."; } else popup("The server is restarting: back in a moment!", true); });
  // Every connection starts with the server's version. Running old code (the game just updated)?
  // Reload to get the new version: you land straight back in your room, and your race.
  const myBuild = (() => { const v = (sel, attr) => { try { return new URL(document.querySelector(sel)?.[attr] || "", location.href).searchParams.get("v"); } catch (e) { return null; } }; const a = v('script[src*="game.js"]', "src"), b = v('link[href*="game.css"]', "href"); return a && b ? `${a}-${b}` : null; })();
  socket.on("build", (v) => {
    if (myBuild && v && v !== myBuild && !S.reloading) {
      let tries = 0; try { tries = Number(sessionStorage.getItem("tb-reloads") || 0); } catch (e) {}
      if (tries < 2) {                                  // (never loop if something's off)
        S.reloading = true;
        try { sessionStorage.setItem("tb-reloads", String(tries + 1)); } catch (e) {}
        if (S.code) saveRejoin({});
        $("netVeil").classList.remove("hidden"); $("netMsg").textContent = "🔧 Loading the new version...";
        location.reload(); return;
      }
    }
    try { sessionStorage.removeItem("tb-reloads"); } catch (e) {}
    let rj = null; try { rj = JSON.parse(sessionStorage.getItem("tb-rejoin") || "null"); } catch (e) {}
    // reconnected, or the page was reloaded less than 2 minutes after being in a room: go back in
    if (rj && rj.code && (S.code ? rj.code === S.code : Date.now() - (rj.at || 0) < 120e3)) { S.rejoinTry = rj; socket.emit("rejoin", rj); }
  });
  socket.on("rejoinFail", (why) => {
    const rj = S.rejoinTry; S.rejoinTry = null;
    const was = S.code; S.code = null; S.track = null;
    try { sessionStorage.removeItem("tb-rejoin"); } catch (e) {}
    if (why === "gone" && rj) {
      // the whole room is gone: the server restarted (an update). The host rebuilds it with the same code,
      // everyone else waits for it and joins again.
      S.restore = { code: rj.code, host: !!rj.host, settings: rj.settings, stroke: rj.stroke, tries: 0 };
      $("netVeil").classList.remove("hidden"); $("netMsg").textContent = "🔧 The game updated. Putting your room back...";
      saveProfile();
      if (rj.host) socket.emit("create", prof, { public: !!rj.pub, code: rj.code });
      else setTimeout(() => socket.emit("join", { code: rj.code, profile: prof }), 1500);
      return;
    }
    // the room is there but our seat isn't (reloaded in a lobby, or the host already rebuilt it after an update): join again
    if (why === "expired" && rj) { saveProfile(); if (was) popup("Back! The restart ended the race, but your room is back.", false); socket.emit("join", { code: rj.code, profile: prof }); return; }
    $("netVeil").classList.add("hidden");
    if (was) { show("menu"); menuErr.textContent = "That room's gone (it ended while you were away)."; }
    S.restarting = false;
  });
  socket.on("lobby", (l) => {
    S.lobby = l; S.host = l.hostId === S.me && !l.ranked;
    if (l.phase === "lobby" && (S.screen === "results" && !S.resultsHold)) show("lobby");
    renderLobby();
  });
  socket.on("track", (t) => {
    S.track = t; S.hostDraft = null; S.preview = null;
    if (S.lobby) updateEditUi();
    renderTrackCard();
    S.geo = t ? buildGeo(t) : null;
    drawBoard();
  });
  socket.on("trackResult", (r) => {
    if (!r.error && P.steps.length) { UNDO.quiet = true; try { P.steps.shift()(); } finally { UNDO.quiet = false; } return; }
    if (!r.error && P.loading) { boardHint(`Loaded "${P.loading}"!`, false); P.loading = null; return; }
    if (r.error) { P.steps = []; P.loading = null; if (S.preview) { S.preview = null; drawBoard(); } }
    if (!r.error && S.keepReverse && r.reversed === undefined && !r.moved) { S.keepReverse = false; socket.emit("reverse"); return; }
    if (r.error) boardHint(r.error, true);
    else if (r.moved) boardHint("Start/finish line moved!", false);
    else if (r.drs) boardHint(r.drs === "cleared" ? "DRS zones removed: no DRS on this track." : r.drs === "real" ? `Real DRS zones back (${r.zones}).` : r.drs === "auto" ? (r.zones ? `DRS put on the longest straights (${r.zones} zone${r.zones === 1 ? "" : "s"}).` : "No straight long enough for automatic DRS. Use 🟩 Add DRS to put a zone anywhere.") : r.drs === "set" ? `DRS zones loaded (${r.zones}).` : `DRS zone added! This track has ${r.zones} now.`, false);
    else if (r.reversed !== undefined) boardHint(r.reversed ? "Track reversed: racing the other way!" : "Back to the original direction.", false);
    else if (r.f1) boardHint(`${r.f1}! Real layout, sized by its real length. Reverse or move the start line if you like.`, false);
    else if (r.random) boardHint(`Random track: ${r.bridges || 0} bridge${r.bridges === 1 ? "" : "s"}${r.maxLevel >= 2 ? ", with a DOUBLE ramp!" : ""} Hit Random again for another.`, false);
    else boardHint("Nice track! Press Start race when everyone's ready.", false);
  });
  socket.on("toast", (t) => popup(t, S.screen === "race" || /can't|cannot|not enough|only|need|too |doesn't|don't|first|full|gone|expired|closed|already|sign in|wait|no /i.test(String(t))));
  // ---- mouse wheel scrolls sideways on rows that only scroll sideways (profile tabs, season pass, track tools...) ----
  document.addEventListener("wheel", (e) => {
    if (e.ctrlKey || e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY) || !e.deltaY) return;
    for (let el = e.target; el && el !== document.body; el = el.parentElement) {
      if (!(el instanceof HTMLElement) || el.scrollWidth <= el.clientWidth + 1) continue;
      const ox = getComputedStyle(el).overflowX; if (ox !== "auto" && ox !== "scroll") continue;
      if (el.scrollHeight > el.clientHeight + 1 && getComputedStyle(el).overflowY !== "hidden" && getComputedStyle(el).overflowY !== "visible") return;   // it scrolls up/down too: leave it alone
      const max = el.scrollWidth - el.clientWidth;
      if ((e.deltaY < 0 && el.scrollLeft <= 0) || (e.deltaY > 0 && el.scrollLeft >= max - 1)) return;   // at the end: let the page scroll
      el.scrollLeft += e.deltaMode === 1 ? e.deltaY * 30 : e.deltaY; e.preventDefault(); return;
    }
  }, { passive: false });
  // ---- idle kick: an hour in a room with nobody touching anything = removed (so a device left on lets go) ----
  let lastAlive = 0;
  const alive = () => { const now = Date.now(); if (S.code && now - lastAlive > 60000) { lastAlive = now; socket.emit("alive"); } };
  for (const ev of ["pointerdown", "keydown", "touchstart", "wheel"]) document.addEventListener(ev, alive, { passive: true, capture: true });
  socket.on("idleWarn", (d) => { lastAlive = 0; popup(`💤 Still there? You'll be removed in ${Math.max(1, Math.round((d?.seconds || 120) / 60))} min for being inactive. Tap or press anything.`, true); sfx("level"); });
  socket.on("idleKicked", (d) => {
    S.idleKicked = true; S.code = null;
    try { sessionStorage.removeItem("tb-rejoin"); } catch (e) {}
    $("netVeil").classList.remove("hidden");
    $("netMsg").textContent = `💤 You were removed after ${d?.minutes || 60} minutes with no activity.`;
    const sm = $("netVeil").querySelector("small"); if (sm) sm.textContent = "Reload the page to play again.";
    $("netVeil").querySelector(".spinner")?.classList.add("hidden");
  });

  socket.on("race", (r) => {
    if (S.replaying) stopReplay();
    if (S.photoOn) photoMode(false);
    RP.buf = []; RP.best = null; RP.bestPend = null; RP.reel = []; clearTimeout(RP.bestT); S.replayRec = null; S.rankedRes = null; S.rankedRaced = !!r.ranked && !r.quali;
    S.race = { laps: r.laps, raceNo: r.raceNo, speed: r.speed || 1, info: new Map(r.cars.map((c) => [c.id, c])), fog: !!r.fog, ranked: !!r.ranked, multi: !!r.multi, elim: r.elim || null, practice: !!r.practice, ko: !!r.ko, dayNight: !!r.dayNight, koth: !!r.koth, enduro: r.enduro || 0, tt: !!r.tt, rolling: !!r.rolling };
    $("endPracticeBtn").classList.toggle("hidden", !(r.practice && S.host));
    S.sec = null;
    if (r.elim && !r.quali) setTimeout(() => popup(`💥 ELIMINATION: the last ${r.elim.per === 1 ? "car is" : r.elim.per + " cars are"} knocked out every lap. Stay out of the bottom!`), 900);
    if (r.multi) { const mc = r.cars.find((c) => c.owner === S.me)?.cls; if (mc) setTimeout(() => popup(`${CLASSES[mc].icon} You're racing in the ${CLASSES[mc].name} class. Win your class!`), 900); }
    S.rareCars = new Map(r.cars.filter((c) => c.rare).map((c) => [c.id, c.rare])); S.myRare = null;
    S.ghost = null; if (r.quali) setTimeout(() => {
      if (S.challenge) { S.ghost = { t: S.challenge.t, path: S.challenge.path, from: S.challenge.from }; popup(`👻 ${S.challenge.from}'s ghost: ${S.challenge.t.toFixed(3)}s. Beat it!`); return; }
      S.ghost = loadGhost(); if (S.ghost) popup(`👻 Your best lap here (${fmt(S.ghost.t)}) is out there as a ghost. Beat it!`); }, 300);
    if (!r.quali) { S.rival = S.pendingRival?.name || null; const rv = S.pendingRival; S.pendingRival = null; if (rv) setTimeout(() => { banner(`🎯 RIVAL: ${rv.name}`, "#ff6b61"); popup(`Your rival: ${rv.name} (${rv.pts} pts, you have ${rv.mine}). Beat them for +100 coins!`); }, 1500); }
    snaps.length = 0; rt = 0; S.geo = S.track ? buildGeo(S.track) : null; resetTiles();
    S.cars = new Map(); S.skids = []; S.particles = []; S.myCar = null; S.reacted = false; S.lightsOutAt = 0;
    S.box = false; S.order = "normal"; S.offer = null; S.camTarget = null; S.lastPos = 99; $("watchChip").classList.add("hidden"); S.tun = 0; setEcho(0);
    for (const c of r.cars) if (c.owner === S.me) S.myCar = c.id;
    setOrder("normal", true); updateBox(); disarmLeave();
    $("feed").textContent = ""; $("popups").textContent = "";
    $("qualiBox").classList.add("hidden"); $("mustPit").classList.add("hidden"); S.mustPit = null; setPausedUi(false);
    S.lapRef = null; $("lapDelta").classList.add("hidden");
    $("pauseBtn").classList.toggle("hidden", !S.host);
    S.race.quali = r.quali || 0;
    document.body.classList.toggle("spectating", !S.myCar);
    if (!S.myCar) { $("specName").textContent = "the leader"; }
    show("race");
    const L = $("lights"); L.classList.add("hidden");
    L.querySelectorAll(".bulb").forEach((b) => b.classList.remove("on"));
    $("lightsSay").innerHTML = S.myCar ? `Press <kbd>${keyName(KEY("boost")).replace(/[<>&]/g, "")}</kbd> the moment the lights go out!` : "Watching this race. You're in the next one!";
    $("goBtn").classList.toggle("hidden", !S.myCar);
    resize();
    setTimeout(() => introCard(r), 400);
  });
  // endurance: you share a car with a teammate and swap at the pit stops
  socket.on("coDriver", (d) => {
    if (!S.race) return;
    S.camTarget = d.car; S.coCar = d.car; document.body.classList.add("spectating"); $("specName").textContent = d.driver;
    popup(`⏳ ${d.driver} is driving your team's car. You take over at their next pit stop!`);
  });
  socket.on("driverSwap", (d) => {
    const info = S.race?.info.get(d.car); if (info) info.owner = d.owner;
    if (d.owner === S.me) { S.myCar = d.car; S.coCar = null; S.camTarget = null; document.body.classList.remove("spectating"); banner("🔁 YOUR STINT!", "#3ecf6a"); popup(`You take over from ${d.from || "your teammate"}. Go!`); sfx("go"); }
    else if (S.myCar === d.car || S.coCar === d.car) { S.myCar = null; S.coCar = d.car; S.camTarget = d.car; document.body.classList.add("spectating"); $("specName").textContent = d.name; popup(`🔁 ${d.name} takes over. You're back in at the next stop.`); }
    else popup(`🔁 Driver change: ${d.name} takes over from ${d.from || "a teammate"}`);
  });
  socket.on("tourLap", (d) => {
    popup(`🏟️ Tournament lap ${d.lap.toFixed(3)}s${d.pb ? " (your best this round!)" : ""}${d.opp ? ` · vs ${d.opp}: ${d.oppBest ? d.oppBest.toFixed(3) + "s" : "no lap yet"}` : ""}`);
  });
  socket.on("ttLap", (d) => {
    if (d.pb) banner(`⏱️ ${fmt(d.lap)} PB!`, "#a855f7");
    popup(`⏱️ ${d.lap.toFixed(3)}s${d.rank ? ` · you're #${d.rank} on this track's time trial board` : ""}`);
  });
  let tpTimer = null;
  socket.on("tirePick", (p) => {
    if (!S.myCar) return;          // spectators don't pick tires
    tut("tires");
    const box = $("tirePick"); box.classList.toggle("hidden", !S.myCar);
    const row = $("tpRow"); row.textContent = "";
    S.startPick = p.raining ? "wet" : "inter";
    for (const [k, T] of Object.entries(TIRES)) {
      const b = document.createElement("button"); b.type = "button"; b.className = "tp"; b.dataset.k = k;
      const nm = document.createElement("div"); nm.className = "nm"; nm.append(badge(k), T.name);
      const stat = (label, v) => { const d = document.createElement("div"); d.className = "stat"; d.append(label); const i = document.createElement("i"); const bb = document.createElement("b"); bb.style.width = v * 100 + "%"; i.appendChild(bb); d.appendChild(i); return d; };
      const note = document.createElement("div"); note.className = "note"; note.textContent = T.note;
      const est = p.perLap && p.perLap[k];
      const wear = document.createElement("div"); wear.className = "wear";
      if (est) { wear.textContent = `~${Math.round(est * 100)}% per lap `; const sm = document.createElement("small"); sm.textContent = `(lasts ~${(1 / est).toFixed(1)} laps)`; wear.appendChild(sm); }
      b.append(nm, stat("Speed", T.speed), stat(k === "wet" ? "Rain grip" : "Grip", T.grip), stat("Lasts", T.life), wear, note);
      b.addEventListener("click", () => { const again = S.startPick === k; S.startPick = k; socket.emit("compound", k); markPick(); sfx("tick"); if (!again) pickPop(row, b, T.color); });
      row.appendChild(b);
    }
    markPick();
    $("tpHint").textContent = p.raining ? "🌧 It's raining! Anything but Wets will slide all over the place." : p.weather === "dynamic" ? "⛅ The weather could change mid-race." : p.weather === "fog" ? "🌫 Thick fog today: dry, but you can't see far ahead." : "☀ Dry track today.";
    const end = performance.now() + p.until;
    clearInterval(tpTimer);
    tpTimer = setInterval(() => {
      const left = Math.max(0, end - performance.now());
      $("tpTime").textContent = Math.ceil(left / 1000) + "s"; $("tpBar").style.width = (left / p.until) * 100 + "%";
      if (left <= 0) clearInterval(tpTimer);
    }, 100);
  });
  function markPick() { document.querySelectorAll(".tp").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.k === S.startPick))); }
  socket.on("lightsBegin", () => { tut("lights"); });
  socket.on("lightsBegin", (d) => {
    clearInterval(tpTimer); $("tirePick").classList.add("hidden");
    if (d?.rolling) { $("goBtn").classList.add("hidden"); banner("🟡 FORMATION LAP", "#ffc53d"); popup("Rolling start: follow the safety car round. Green flag at the line!"); return; }
    const L = $("lights"); L.classList.remove("hidden"); L.querySelectorAll(".bulb").forEach((b) => b.classList.remove("on"));
  });
  socket.on("horn", (d) => {
    const c = S.cars.get(d.car); if (!c || S.screen !== "race") return;
    const dist = d.car === S.myCar ? 0 : Math.hypot((c.x || 0) - cam.x, (c.y || 0) - cam.y);
    hornSound(d.type, Math.max(0, 1 - dist / 900));
  });
  // ---- spectator live stats ----
  S.specStatsOn = !isPhone();
  $("specStatsBtn").addEventListener("click", () => { S.specStatsOn = !S.specStatsOn; $("specStats").classList.toggle("hidden", !S.specStatsOn); });
  function renderSpecStats(st) {
    const box = $("specStats"); box.classList.toggle("hidden", !S.specStatsOn || !!S.myCar); const tb = $("specStatsBody"); tb.textContent = "";
    (st.standings || []).slice(0, 20).forEach((id, i) => {
      const c = S.cars.get(id); if (!c) return; const g = st.gaps?.[i];
      const tr = document.createElement("tr"); if (id === S.camTarget) tr.className = "on";
      const cells = [i + 1, c.name, i === 0 ? "Leader" : g === -1 ? "+1 lap" : g ? `+${g.toFixed(1)}` : "", `${(TIRES[c.comp]?.name || "")[0] || ""} ${Math.round((c.tire || 0) * 100)}%`, `${c.tyreAge || 0}L`, c.pits || 0];
      cells.forEach((v, k) => { const td = document.createElement("td"); td.textContent = v; if (k === 1) { const d = el("span", "dot"); d.style.background = c.color; td.prepend(d); } tr.appendChild(td); });
      tr.addEventListener("click", () => { S.camTarget = id; $("specName").textContent = c.name; });
      tb.appendChild(tr);
    });
  }
  // ---- before the start: the track card, and the camera walking down the grid ----
  function introCard(r) {
    if (settings.intro === "off" || r.quali || S.replaying) return;
    const T = S.track, L = S.lobby?.settings || {}, card = $("introCard"); if (!T) return;
    const W = { sunny: "☀️ Dry", rain: "🌧️ Rain", dynamic: "🌦️ Changing", fog: "🌫️ Fog" }[L.weather] || "☀️ Dry";
    $("icName").textContent = T.name || S.lobby?.trackName || "Today's track";
    $("icSub").textContent = [`${(T.length / 10000).toFixed(2)} km`, `${r.laps} laps`, W, `${r.cars.filter((c) => !c.owner).length} AI · ${L.aiLevel || ""}`, r.dayNight ? "🌇 Day into night" : "", r.rolling ? "🟡 Rolling start" : "", r.koth ? "👑 King of the hill" : r.enduro ? `⏳ ${Math.round(r.enduro / 60)} min endurance` : ""].filter(Boolean).join(" · ");
    card.classList.remove("hidden"); clearTimeout(S.introT); S.introT = setTimeout(() => card.classList.add("hidden"), 6500);
    S.walk = { t0: performance.now(), ids: null };
  }
  // pit wall: orders for your AI teammate (only shown if you have one)
  document.querySelectorAll("[data-order]").forEach((b) => b.addEventListener("click", () => socket.emit("teamOrder", b.dataset.order)));
  socket.on("teamOrderOk", (d) => { popup(`📻 To ${d.names.join(" & ")}: ${d.msg}`); document.querySelectorAll("[data-order]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.order === d.cmd))); });
  function refreshPitWall() {
    const me = S.cars.get(S.myCar), info = S.race?.info, myTeam = me && info?.get(S.myCar)?.team;
    const has = !!myTeam && [...info.values()].some((x) => x.id !== S.myCar && !x.owner && x.team === myTeam);
    $("pitWall").classList.toggle("hidden", !has || S.race?.quali);
  }
  socket.on("crash", (d) => {
    banner("CRASH!", "#ff7043"); sfx("jump"); addShake(18);
    popup(`Hit ${d.with}! Damage ${d.damage}%${d.damage > 40 ? ". Box to fix it!" : ""}`, true);
  });
  socket.on("puncture", () => {
    banner("PUNCTURE!", "#e53935"); sfx("jump"); addShake(12);
    popup("Limping back to the pits...", true);
  });
  socket.on("lights", ({ n }) => {
    const bulbs = $("lights").querySelectorAll(".bulb");
    for (let i = 0; i < bulbs.length; i++) bulbs[i].classList.toggle("on", i < n);
    sfx("light"); if (n > 0) drumroll(true);
  });
  socket.on("lightsOut", () => { setTimeout(() => tut("boost"), 2500); });
  socket.on("lightsOut", (d) => {
    S.lightsOutAt = performance.now(); drumroll(false);
    if (d?.rolling) { sfx("go"); banner("🟢 GREEN FLAG!", "#3ecf6a"); $("goBtn").classList.add("hidden"); return; }
    if (d?.restart) { sfx("go"); banner("GO! RESTART", "#3ecf6a"); return; }
    $("lights").querySelectorAll(".bulb").forEach((b) => b.classList.remove("on"));
    sfx("go");
    banner("GO!", "#3ecf6a");
    // if you never press, the car still launches slowly after 1.2s
    setTimeout(() => $("lights").classList.add("hidden"), 1300);
  });
  socket.on("startResult", (r) => {
    if (r.jump) {
      banner("JUMP START!", "#e53935"); sfx("jump"); addShake(14);
      const f = $("flash"); f.classList.remove("go"); void f.offsetWidth; f.classList.add("go");
      $("lightsSay").textContent = "Jump start! Your driver is held for 3 seconds.";
      popup("Penalty: held on the grid for 3s", true);
    } else {
      const ms = r.ms;
      const rating = ms < 200 ? "Lightning!" : ms < 300 ? "Great start!" : ms < 450 ? "Good start" : "Slow start...";
      popup(`${rating} ${ms}ms`, ms >= 450);
      $("lightsSay").textContent = `Reaction: ${ms}ms. ${rating}`;
    }
  });
  function react() {
    if (S.screen !== "race" || !S.myCar || S.reacted) return;
    S.reacted = true;
    const ms = S.lightsOutAt ? Math.round(performance.now() - S.lightsOutAt) : -1;
    socket.emit("react", ms);
    $("goBtn").classList.add("hidden");
    if (S.lightsOutAt) $("lights").classList.add("hidden");
  }
  $("goBtn").addEventListener("click", react);

  // ---- replay: the last 25 seconds of every race are kept, so you can watch the finish again ----
  const RP = { buf: [], timers: [] };
  socket.on("state", (st) => {
    if (st.phase === "race") { const now = performance.now(); RP.buf.push({ at: now, st }); while (RP.buf.length && now - RP.buf[0].at > 30000) RP.buf.shift(); }
    if (!S.replaying) onState(st);
  });
  // Overtake of the race: the server says when a pass beats the best one so far; keep 4s before it and 2s after
  // Highlight reel: the race's best moments (lead changes, big crashes, the best pass, a photo finish...),
  // each kept as a short clip in race time. Played back to back after the race, and shareable as a replay.
  function markMoment(prio, title, before = 3.5) {
    if (!S.race || S.race.quali || S.replaying || !S.t) return;
    const m = { t: S.t, prio, title, before };
    setTimeout(() => {
      const clip = RP.buf.filter((x) => x.st.t >= m.t - m.before && x.st.t <= m.t + 2);
      if (clip.length < 15) return;
      RP.reel = RP.reel || []; RP.reel.push({ ...m, clip });
      RP.reel.sort((a, b) => b.prio - a.prio || a.t - b.t); RP.reel.length = Math.min(RP.reel.length, 6);
    }, 2300 / (S.race?.speed || 1));
  }
  function reelClip() {
    const R = (RP.reel || []).slice().sort((a, b) => a.t - b.t); if (!R.length) return null;
    // one continuous clip: each moment after the other (race time stitched so it keeps counting up)
    const frames = [], titles = []; let at = 0, lastT = null;
    for (const m of R) {
      const t0 = m.clip[0].st.t, a0 = m.clip[0].at, tShift = lastT === null ? 0 : lastT + 0.6 - t0;
      titles.push({ at, title: m.title });
      for (const x of m.clip) frames.push({ at: at + (x.at - a0), st: { ...x.st, t: x.st.t + tShift } });
      lastT = m.clip[m.clip.length - 1].st.t + tShift; at = frames[frames.length - 1].at + 600;
    }
    return { frames, titles };
  }
  function startReel() {
    const r = reelClip(); if (!r || !S.race) return;
    runClip(r.frames, null, null, `🎞️ ${r.titles[0].title}`);
    for (const x of r.titles.slice(1)) RP.timers.push(setTimeout(() => ($("replayTitle").textContent = `🎞️ ${x.title}`), x.at));
  }
  function shareReel() {
    const r = reelClip(); if (!r) return;
    const keep = RP.buf; RP.buf = r.frames.map((x) => ({ at: x.at, st: x.st }));
    const rec = buildReplay({ title: `🎞️ Highlights · ${S.track?.name || "Scribble track"}` }); RP.buf = keep;
    if (rec) shareReplay(rec);
  }
  // Lap chart: everyone's position at the end of every lap (lap 0 = the grid). Your line is bold and named,
  // the top 3 are named at the end; hover a lap to read the order.
  function drawLapChart(r) {
    const cv = $("lapChart"), box = $("lapChartBox"); if (!r) return;
    const rows = r.rows.filter((x) => x.lp && x.lp.length), laps = Math.max(1, ...rows.map((x) => x.lp.length)), N = r.rows.length;
    const W = Math.max(280, Math.min(760, (box.clientWidth || 700) - 8)), H = Math.max(220, Math.min(420, 22 * N + 60)), dpr = window.devicePixelRatio || 1;
    cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + "px"; cv.style.height = H + "px";
    const c = cv.getContext("2d"); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, W, H);
    const L = 34, R = W < 420 ? 64 : 96, T = 14, B = 26, X = (lap) => L + (lap / laps) * (W - L - R), Y = (pos) => T + ((pos - 1) / Math.max(1, N - 1)) * (H - T - B);
    const ink = getComputedStyle(box).color || "#ccc";
    c.font = "11px system-ui, sans-serif"; c.fillStyle = ink; c.globalAlpha = 0.6; c.textAlign = "right"; c.textBaseline = "middle";
    for (let p = 1; p <= N; p += N > 12 ? 2 : 1) c.fillText("P" + p, L - 6, Y(p));
    c.textAlign = "center"; c.textBaseline = "top"; const step = Math.max(1, Math.ceil(laps / 10));
    for (let l = 0; l <= laps; l += step) c.fillText(l === 0 ? "Grid" : "L" + l, X(l), H - B + 8);
    c.globalAlpha = 0.12; c.strokeStyle = ink; c.lineWidth = 1; for (let l = 0; l <= laps; l += step) { c.beginPath(); c.moveTo(X(l), T); c.lineTo(X(l), H - B); c.stroke(); }
    c.globalAlpha = 1;
    const pts = (x) => [[0, x.grid || N], ...x.lp.map((p, i) => [i + 1, p]).filter((q) => q[1])];
    const mine = (x) => x.owner === S.me;
    for (const pass of [0, 1]) for (const x of rows) {
      if (mine(x) !== !!pass) continue;
      const P = pts(x); c.strokeStyle = x.color; c.lineWidth = mine(x) ? 3.5 : 2; c.globalAlpha = mine(x) ? 1 : 0.55; c.lineJoin = c.lineCap = "round";
      c.beginPath(); P.forEach(([l, p], i) => (i ? c.lineTo(X(l), Y(p)) : c.moveTo(X(l), Y(p)))); c.stroke();
      const [ll, lp] = P[P.length - 1]; c.globalAlpha = 1; c.fillStyle = x.color; c.beginPath(); c.arc(X(ll), Y(lp), mine(x) ? 5 : 4, 0, Math.PI * 2); c.fill();
      if (mine(x) || r.rows.indexOf(x) < 3) { c.fillStyle = ink; c.textAlign = "left"; c.textBaseline = "middle"; c.font = `${mine(x) ? 700 : 500} 12px system-ui, sans-serif`; c.fillText(`${x.name}${mine(x) ? " (you)" : ""}`, X(ll) + 9, Y(lp)); c.font = "11px system-ui, sans-serif"; }
    }
    cv.onpointermove = (e) => {
      const rc = cv.getBoundingClientRect(), lap = Math.round(((e.clientX - rc.left - L) / (W - L - R)) * laps), tip = $("lapChartTip");
      if (lap < 0 || lap > laps) { tip.classList.add("hidden"); return; }
      const order = rows.map((x) => [x, lap === 0 ? x.grid || N : x.lp[lap - 1]]).filter((q) => q[1]).sort((a, b) => a[1] - b[1]).slice(0, 6);
      tip.textContent = `${lap === 0 ? "Grid" : "Lap " + lap}: ` + order.map(([x, p]) => `P${p} ${x.name}`).join(" · ");
      tip.classList.remove("hidden");
    };
    cv.onpointerleave = () => $("lapChartTip").classList.add("hidden");
  }
  function grabBestPass() {
    const P = RP.bestPend; if (!P) return; RP.bestPend = null; clearTimeout(RP.bestT);
    const clip = RP.buf.filter((m) => m.st.t >= P.d.t - 4 && m.st.t <= P.d.t + 2);    // (race time: 4s before the pass, 2s after)
    if (clip.length > 20) {
      RP.best = { clip: clip.map((m) => ({ at: m.at - clip[0].at, st: m.st })), d: P.d };
      RP.reel = (RP.reel || []).filter((x) => !x.pass); RP.reel.push({ t: P.d.t, prio: 3, title: `🏎️ ${P.d.an} passes ${P.d.bn}`, clip, pass: true });
      RP.reel.sort((a, b) => b.prio - a.prio || a.t - b.t); RP.reel.length = Math.min(RP.reel.length, 6);
    }
  }
  socket.on("bestPass", (d) => { clearTimeout(RP.bestT); RP.bestPend = { d }; RP.bestT = setTimeout(grabBestPass, 900 / (S.race?.speed || 1)); });      // (it arrives 1.5s after the pass: 2s after it is soon)
  function startBestPass() {
    if (!RP.best || !S.race) return;
    runClip(RP.best.clip, RP.best.d.an, null, `🏎️ Overtake of the race: ${RP.best.d.an} on ${RP.best.d.bn}`);
  }
  function startReplay() {
    if (RP.buf.length < 30 || !S.race) return;
    const t0 = RP.buf[0].at;
    S.replayRec = null;
    runClip(RP.buf.map((m) => ({ at: m.at - t0, st: m.st })), S.lastResults?.rows?.[0]?.name, null);
  }
  // plays a list of {at: ms from the start, st: state} through the normal race view
  function runClip(clip, winnerName, savedTitle, title) {
    S.replaying = savedTitle ? "saved" : "live"; snaps.length = 0; rt = 0; S.cars = new Map(); S.particles = []; S.lapRef = null;
    document.body.classList.add("replaying", "spectating"); $("specBar").classList.add("hidden");
    show("race"); $("replayBar").classList.remove("hidden");
    $("replayTitle").textContent = title || (savedTitle ? `🎬 ${savedTitle}` : "🎬 Replay: the last 30 seconds");
    $("replaySave").classList.toggle("hidden", !!savedTitle);
    const w = winnerName && [...S.race.info.values()].find((c) => c.name === winnerName);
    S.camTarget = w ? w.id : null; $("replayCam").textContent = `Follow: ${w ? w.name : "leader"}`;
    RP.timers = clip.map((m) => setTimeout(() => onState(m.st), m.at));
    RP.timers.push(setTimeout(stopReplay, clip[clip.length - 1].at + 1500));
  }
  // red flag: the race stops, and everyone watches the pile-up again (the few seconds before it, from the race
  // they just watched), then it's back to the live race, already lined up on the grid
  function rfReplay(f) {
    if (S.replaying || !S.race || !f.at) return;
    const clip = RP.buf.filter((m) => m.st.t >= Math.max((f.t0 ?? f.at) - 2.5, f.at - 7) && m.st.t < f.at - 0.01);
    if (clip.length < 15) return;
    RP.rf = { cam: S.camTarget };
    S.replaying = "rf"; snaps.length = 0; rt = 0; S.cars = new Map(); S.particles = [];
    document.body.classList.add("replaying"); $("replayBar").classList.remove("hidden"); $("replaySave").classList.add("hidden");
    $("replayTitle").textContent = "🟥 RED FLAG · watch the crash again";
    S.camTarget = f.car ?? null;
    const t0 = clip[0].at;
    RP.timers = clip.map((m) => setTimeout(() => onState(m.st), m.at - t0));
    RP.timers.push(setTimeout(endRfReplay, clip[clip.length - 1].at - t0 + 800));
  }
  function endRfReplay() {
    if (S.replaying !== "rf") return;
    RP.timers.forEach(clearTimeout); RP.timers = []; S.replaying = false;
    document.body.classList.remove("replaying"); $("replayBar").classList.add("hidden");
    snaps.length = 0; rt = 0; S.cars = new Map(); S.particles = []; S.camTarget = RP.rf?.cam ?? null; RP.rf = null;
    banner("🟥 BACK TO THE GRID", "#ff2d55");
  }
  function stopReplay() {
    if (!S.replaying) return;
    if (S.replaying === "rf") return endRfReplay();
    const saved = S.replaying === "saved";
    if (S.photoOn) photoMode(false);
    RP.timers.forEach(clearTimeout); RP.timers = []; S.replaying = false; S.camTarget = null;
    document.body.classList.remove("replaying"); $("replayBar").classList.add("hidden");
    if (saved && S.replayPrev) {
      const P = S.replayPrev; S.replayPrev = null;
      S.track = P.track; S.race = P.race; S.geo = P.geo; S.myCar = P.myCar; resetTiles(); S.cars = new Map(); snaps.length = 0;
      document.body.classList.toggle("spectating", !S.myCar);
      show(!S.code ? "menu" : S.lobby?.phase === "lobby" ? "lobby" : P.screen === "results" ? "results" : "lobby");
      if (S.code && S.screen === "lobby") drawBoard();
      return;
    }
    document.body.classList.toggle("spectating", !S.myCar);
    show(S.lobby?.phase === "lobby" ? "lobby" : "results");
  }
  function onState(st) {
    S.t = st.t; S.phase = st.phase; S.fastest = st.fastest; S.sc = st.sc || null; S.standings = st.standings; S.gaps = st.gaps || [];
    S.ql = st.ql ?? -1; S.qs = st.qs || 0; S.qf = !!st.qf; S.fl = !!st.fl;
    commLeader(st);
    if (!!st.paused !== !!S.paused) setPausedUi(!!st.paused, S.pausedBy);
    pushSnap(st);
    for (const a of st.cars) {
      const [id, x, y, h, speed, tire, laps, pits, pit, mistake, fin, slide, onTrack, boost, prog, best, comp, punct, surf, inPit, dmg, crashed, elev, vx, vy, idx, nitroOn, nitro, slip, ghost, drs, def, out] = a;
      let c = S.cars.get(id);
      if (!c) { c = { id, x, y, h, lvl: elev, ...S.race?.info.get(id) }; S.cars.set(id, c); }
      Object.assign(c, { speed, tire, laps, pits, pit, mistake, fin, slide, onTrack, boost, prog, best, comp: SHORT_TO_KEY[comp] || "inter", punct, surf, inPit, dmg, crashed, idx, nitroOn, nitro, slip, ghost, drs: drs === 2, drsAvail: drs === 1, def: def === 1, out: out === 1, temp: a[33] ?? 100, tyreAge: a[34] ?? 0, leadT: a[35] || 0 });
    }
    lapDelta();
    if (!S.pwAt || performance.now() - S.pwAt > 1000) { S.pwAt = performance.now(); refreshPitWall(); }
    if (S.tutorial) {            // tutorial hints that depend on your car
      const c = S.cars.get(S.myCar);
      if (c) { if (c.tire < 0.45 && !S.box) tut("pit"); if (S.tutPits !== undefined && c.pits > S.tutPits) tut("afterPit"); S.tutPits = c.pits; }
    }
    S.weather = st.weather;
    // king of the hill: who's held the lead longest / endurance: time left
    { const mc = $("modeChip"); let txt = "";
      if (S.race?.koth) { const top = [...S.cars.values()].filter((c) => c.leadT > 0).sort((a, b) => b.leadT - a.leadT).slice(0, 3); const me = S.cars.get(S.myCar);
        txt = "👑 " + (top.map((c) => `${c.name.split(" ")[0]} ${c.leadT.toFixed(0)}s`).join(" · ") || "Lead the race to start your clock") + (me && !top.includes(me) ? ` · you ${(me.leadT || 0).toFixed(0)}s` : ""); }
      else if (S.race?.enduro && st.enduro >= 0) { const m = Math.floor(st.enduro / 60), sec = String(st.enduro % 60).padStart(2, "0"); txt = st.enduro > 0 ? `⏳ ${m}:${sec} left` : "⏳ Time's up: last lap!"; }
      // laps to go (for everyone, spectators too): counted from the leader
      if (!S.race?.enduro && !S.race?.practice && !S.race?.tt && !(st.ql >= 0) && S.phase === "race" && S.race?.laps) {
        const lead = S.cars.get(S.standings?.[0]), left = lead ? S.race.laps - Math.max(0, lead.laps || 0) : 0;
        const lt = st.fl ? `🟡 Formation lap · ${S.race.laps} laps` : lead?.fin || left <= 0 ? "🏁 Chequered flag!" : left === 1 ? "🏳️ FINAL LAP" : `🏁 ${left} laps to go`;
        txt = txt ? `${txt} · ${lt}` : lt;
        mc.classList.toggle("final", left === 1 && !lead?.fin);
      } else mc.classList.remove("final");
      mc.classList.toggle("hidden", !txt); mc.textContent = txt; }
    // spectators: live timing (gap, tyres, tyre age, stops)
    if (!S.myCar && S.specStatsOn && (!S.ssAt || performance.now() - S.ssAt > 500)) { S.ssAt = performance.now(); renderSpecStats(st); }
    if (S.myCar) $("specStats").classList.add("hidden");
    // red flag: a countdown in the middle of the screen
    { const rb = $("rfBox"); rb.classList.toggle("hidden", !st.rf); if (st.rf) $("rfSecs").textContent = st.rf; }
    if (S.myCar) {
      const pos = S.standings.indexOf(S.myCar) + 1;
      if (pos && S.lastPos !== 99 && pos !== S.lastPos) { if (pos < S.lastPos) crowdRoar(pos <= 3 ? 1 : 0.6); sfx(pos < S.lastPos ? "pass" : "lost"); const el = $("posText"); el.classList.remove("bump", "flip"); void el.offsetWidth; el.classList.add(pos < S.lastPos ? "flip" : "bump"); if (pos < S.lastPos) burstFrom(el, pos <= 3 ? "#ffcc1f" : "#3ecf6a", 9, 50); }
      S.lastPos = pos;
    }
  }
  // my own team's numbers (XP, upgrades, tires, boost)
  socket.on("me", (m) => {

    S.xp = m; S.box = m.box; S.up = m.up; S.myComp = m.compound; S.sec = m.sec || null;
    if (!!m.defend !== !!S.defendOn && performance.now() - (S.defendAt || 0) > 600) setDefendUi(!!m.defend);
    if ((m.rare || null) !== (S.myRare || null)) { S.myRare = m.rare || null; renderGarage(); }
    renderPitPick(m);
    if (S.nextComp !== m.next) { S.nextComp = m.next; renderNextTires(); }
    updateBox();
  });
  socket.on("feed", (f) => {
    if (f.t === "rain") { banner("🌧 RAIN!", "#9ad0ff"); popup(`It's raining! Dry tyres lose up to 25% top speed in heavy rain (GT3s on Wets will fly past). Box (${keyName(KEY("box"))}) and pick Wets.`, true); }
    if (f.t === "dry") { popup("The rain has stopped. The track will dry out.", false); }
    if (f.t === "lastLap") { if (S.track) tlFor(S.track).lastLap = true; banner("🏳️ FINAL LAP", "#fff"); sfx("level"); }
    if (f.t === "qko") banner(`Q${f.stage}!`, "#ffcc1f");
    if (f.t === "elim" && f.id !== S.myCar) { banner(`💥 ${f.name} OUT!`, "#ff6b61"); sfx("jump"); }
    if (f.t === "classWin" && CLASSES[f.cls]) { setTimeout(() => banner(`🏁 ${f.name} WINS ${CLASSES[f.cls].name.toUpperCase()}!`, CLASSES[f.cls].col), 600); sfx("level"); }
    if (f.t === "scOut") { banner("🚨 SAFETY CAR", "#ffcc1f"); sfx("tick"); }
    if (f.t === "scIn") { banner("🟢 GREEN FLAG!", "#3ecf6a"); sfx("level"); }
    if (f.t === "photo") { setTimeout(() => banner("📸 PHOTO FINISH!", "#9ad0ff"), 2600); photoShot(f); }
    if (f.t === "crash" && S.track) {           // flying debris where it happened (and sparks, and a marshal with a yellow flag)
      marshalAt(f.x, f.y); for (let k = 0; k < (f.big ? 4 : 2); k++) spark(f.x, f.y, Math.random() * 6.3, 6);
      for (let k = 0; k < (f.big ? 40 : 20); k++) S.particles.push({ x: f.x, y: f.y, vx: (Math.random() - 0.5) * 420, vy: (Math.random() - 0.5) * 420, life: 0.6 + Math.random() * 0.4, age: 0, r: 2 + Math.random() * 3, color: ["#222", "#555", "#ffcc1f", "#fff"][k % 4] });
      if (Math.hypot((S.cars.get(S.myCar)?.x || 0) - f.x, (S.cars.get(S.myCar)?.y || 0) - f.y) < 700) addShake(f.big ? 10 : 5);
    }
    const txt = f.t === "crash" ? `💥 ${f.name} and ${f.other} crash${f.big ? " HARD" : ""}!` : f.t === "rain" ? "🌧 Rain is falling!" : f.t === "dry" ? "☀ The rain has stopped" : f.t === "pitSlow" ? `🔧 ${f.name}'s crew fumbles a wheel! +1s` : f.t === "puncture" ? `💥 ${f.name} has a puncture!` : f.t === "pit" ? `${f.name} pits` : f.t === "mistake" ? `${f.name} runs wide!` : f.t === "fastest" ? `Fastest lap: ${f.name} (${fmt(f.time)})` : f.t === "jump" ? `${f.name} jumped the start!` : f.t === "winner" ? `${f.name} takes the checkered flag!${f.cls ? ` (${CLASSES[f.cls].name} class win)` : ""}` : f.t === "qko" ? `🏁 Q${f.stage} is on! Knocked out: ${f.out.join(", ")}` : f.t === "elim" ? `💥 ${f.name} is knocked out! ${f.left} left` : f.t === "classWin" ? `${CLASSES[f.cls]?.icon || ""} ${f.name} wins the ${CLASSES[f.cls]?.name || ""} class!` : f.t === "retire" ? `${f.name} left the race (AI driving)` : f.t === "event" ? String(f.text || "") : f.t === "drs" ? "🟩 DRS enabled: within 1s of the car ahead at a zone = +7% top speed" : f.t === "scOut" ? "🚨 SAFETY CAR! No overtaking, the field bunches up" : f.t === "scIn" ? "🟢 Safety car in: GREEN FLAG, racing again!" : f.t === "unlap" ? "👻 Lapped cars may unlap themselves: they pass through the pack as ghosts" : f.t === "qFlag" ? "🏁 Time's up! Anyone on a lap gets to finish it" : f.t === "abandoned" ? `🟥 RACE ABANDONED: ${f.why === "redFlags" ? "too many red flags" : "too many safety cars"}` : f.t === "lastLap" ? `🏳️ Final lap! ${f.name} leads` : f.t === "photo" ? `📸 Photo finish! ${f.name} beat ${f.other} by ${f.gap.toFixed(3)}s` : "";
    if (!txt) return;
    const d = document.createElement("div"); d.textContent = txt;
    if (S.cars.get(f.id)?.id === S.myCar || f.name === prof.name) d.style.color = "var(--yellow)";
    const feed = $("feed"); feed.prepend(d);
    while (feed.children.length > 6) feed.lastChild.remove();
    setTimeout(() => { d.classList.add("out"); setTimeout(() => d.remove(), 400); }, 5000);
    if (f.t === "pit" && f.id === S.myCar) sfx("pit");
  });
  socket.on("xp", ({ label }) => popup(label));
  socket.on("levelUp", ({ level }) => { popup(`Team level ${level}!`); sfx("level"); });
  socket.on("offer", (o) => { showCards(o); tut("upgrade"); });
  socket.on("offerCleared", () => { S.offer = null; S.cardsLater = false; hideCards(); renderPill(); S.up = null; $("garage").textContent = ""; });
  socket.on("picked", ({ key, up, now, name, rare }) => { S.up = up; S.justPicked = key; if (rare) S.myRare = rare; renderGarage(); popup(`${name || S.upInfo[key]?.name}: ${key.startsWith("__") ? now : "now " + now}!`); });
  // someone got a super rare card: everyone hears about it, and their car glows for the rest of the race
  // your rival for this race (arrives just before the race starts)
  socket.on("rival", (r) => { S.pendingRival = r; });
  socket.on("rivalResult", (r) => {
    setTimeout(() => popup(r.beat ? `🎯 You beat your rival ${r.name}!${r.coins ? ` +${r.coins} coins` : ""}${r.xp ? ` +${r.xp} pass XP` : ""}` : `🎯 ${r.name} beat you this time. Get them next race!`, !r.beat), 1200);
  });
  socket.on("rareCard", (r) => {
    const T = RARE_TIER[r.tier] || RARE_TIER.epic;
    if (r.car !== null && r.car !== undefined) (S.rareCars ||= new Map()).set(r.car, r.aura || r.tier);
    banner(`${r.icon} ${r.name}: ${r.card}!`, T.color); sfx("level");
    const d = document.createElement("div"); d.textContent = `${r.icon} ${r.name} pulled a ${T.label} card: ${r.card}!`; d.style.color = T.color; d.style.fontWeight = "800";
    const feed = $("feed"); feed.prepend(d); while (feed.children.length > 6) feed.lastChild.remove();
    setTimeout(() => { d.classList.add("out"); setTimeout(() => d.remove(), 400); }, 9000);
  });
  // someone in ANOTHER room (or game) pulled a super rare card: everyone on the server hears about it
  socket.on("rareCardGlobal", (r) => {
    const T = RARE_TIER[r.tier] || RARE_TIER.epic;
    const d = document.createElement("div"); d.className = "world-toast"; d.style.setProperty("--wc", T.color); d.setAttribute("role", "status");
    const b = document.createElement("b"); b.textContent = `${r.icon} ${T.label} CARD!`;
    const sm = document.createElement("span"); sm.textContent = `${r.name} just pulled ${r.card} (${T.odds}) in another race`;
    d.append(b, sm); document.body.appendChild(d); sfx("card");
    const all = document.querySelectorAll(".world-toast"); if (all.length > 3) all[0].remove();
    setTimeout(() => { d.classList.add("out"); setTimeout(() => d.remove(), 500); }, 6500);
  });
  socket.on("results", (r) => { showResults(r); if (S.tutorial) setTimeout(() => { TQ.queue = []; if (TQ.cards && TUT_RACE_ORDER.includes(TQ.step)) { TQ.cards = null; $("tutCard").classList.add("hidden"); } tut("results"); }, 1800); });
  // checkered flag: camera cuts to the winner, fireworks, finish tags on everyone who crosses
  let fireworks = [];
  socket.on("feed", (f) => {
    if (f.t !== "winner") return;
    const w = [...S.cars.values()].find((c) => c.name === f.name);
    banner(S.race?.elim ? `🏆 ${f.name}: LAST CAR STANDING!` : f.cls && CLASSES[f.cls] ? `🏁 ${f.name} WINS ${CLASSES[f.cls].name.toUpperCase()}!` : `🏁 ${f.name} WINS!`, "#ffcc1f"); sfx("win");
    if (w) {
      S.camTarget = w.id; S.winnerCamUntil = performance.now() + 4000;
      if (!reducedMotion) for (let k = 0; k < 5; k++) setTimeout(() => fireworks.push({ x: w.x + (Math.random() - 0.5) * 300, y: w.y + (Math.random() - 0.5) * 220, t: performance.now(), hue: Math.floor(Math.random() * 360) }), k * 450);
    }
    // and a proper show over the main grandstand
    const ms = S.track && autoStands(S.track)[0];
    if (ms && !reducedMotion) for (let k = 0; k < 12; k++) setTimeout(() => fireworks.push({ x: ms.x + (Math.random() - 0.5) * 260, y: ms.y + (Math.random() - 0.5) * 160, t: performance.now(), hue: Math.floor(Math.random() * 360) }), 300 + k * 380);
  });

  // ======================= Lobby =======================
  const board = $("board"), bctx = board.getContext("2d");
  const sel = { sLaps: "laps", sQuali: "quali", sAiLevel: "aiLevel", sAi: "ai", sMap: "map", sTheme: "theme", sSpeed: "speed", sWear: "wear", sTeamColors: "teamColors", sWeather: "weather", sTeams: "teams", sSeason: "season", sSafety: "safetyCar", sStart: "start", sDayNight: "dayNight", sDrs: "drs", sRevGrid: "reverseGrid", sMix: "mix", sMultiEndur: "multiEndur", sEnduroShare: "enduroShare" };
  $("smoothBtn").addEventListener("click", () => {
    if (!S.host || !S.lobby) return;
    const on = !S.lobby.settings.smooth;
    socket.emit("settings", { smooth: on });
    boardHint(on ? "Smooth track ON: straights get straighter, curves get smoother." : "Smooth track OFF: the track follows your drawing exactly.", false);
  });
  // real F1 circuits
  function openF1() {
    const g = $("f1Grid");
    if (!g.childElementCount) for (const tr of S.f1 || []) {
      const b = document.createElement("button"); b.type = "button";
      const cv = document.createElement("canvas"); cv.width = 320; cv.height = 176;
      const c = cv.getContext("2d"), s2 = Math.min(300 / tr.w, 160 / tr.h), ox = (320 - tr.w * s2) / 2, oy = (176 - tr.h * s2) / 2;
      c.lineJoin = "round"; c.lineWidth = 7; c.strokeStyle = "#ffcc1f"; c.beginPath();
      tr.pts.forEach(([x, y], i) => (i ? c.lineTo(ox + x * s2, oy + y * s2) : c.moveTo(ox + x * s2, oy + y * s2))); c.closePath(); c.stroke();
      const nm = document.createElement("b"); nm.textContent = tr.name;
      const sm = document.createElement("small"); sm.textContent = `${tr.place} · ${tr.km} km`;
      b.append(cv, nm, sm);
      b.addEventListener("click", () => { S.draft = null; S.lastDraft = null; updateDraftUi(); socket.emit("f1Track", { id: tr.id }); boardHint(`Loading ${tr.name}...`, false); closeF1(); });
      g.appendChild(b);
    }
    $("f1Modal").classList.remove("hidden");
  }
  function closeF1() { $("f1Modal").classList.add("hidden"); }
  $("f1Btn").addEventListener("click", () => { if (S.host) openF1(); });
  $("f1Close").addEventListener("click", closeF1);
  $("f1Modal").addEventListener("click", (e) => { if (e.target === $("f1Modal")) closeF1(); });
  // XP per second (host): 10 to 50
  $("sXp").addEventListener("input", () => { $("sXpOut").textContent = $("sXp").value + " XP/s"; });
  $("sXp").addEventListener("change", () => { if (S.host) socket.emit("settings", { xpRate: Number($("sXp").value) }); });
  $("pubToggle").addEventListener("click", () => { if (S.host && S.lobby) socket.emit("setPublic", !S.lobby.public); });
  for (const [id, key] of Object.entries(sel)) {
    $(id).addEventListener("change", () => {
      if (!S.host) return;
      if (key === "map" && S.track) socket.emit("clearTrack");
      socket.emit("settings", { [key]: $(id).value });
      if (key === "map") setTimeout(drawBoard, 50);
    });
  }
  // game mode (host) and your class (everyone)
  // ---- championship calendar (Mode tab) ----
  function calThumb(pts) {
    const cv = document.createElement("canvas"); cv.width = 72; cv.height = 46; cv.className = "cal-thumb";
    const c = cv.getContext("2d"); if (!pts?.length) return cv;
    const mx = Math.max(...pts.map((q) => q[0])) || 1, my = Math.max(...pts.map((q) => q[1])) || 1, k = Math.min(62 / mx, 38 / my), ox = (72 - mx * k) / 2, oy = (46 - my * k) / 2;
    c.strokeStyle = "#ffcc1f"; c.lineWidth = 3; c.lineJoin = c.lineCap = "round"; c.beginPath();
    pts.forEach(([x, y], i) => (i ? c.lineTo(ox + x * k, oy + y * k) : c.moveTo(ox + x * k, oy + y * k))); c.closePath(); c.stroke();
    return cv;
  }
  function renderCalendar(l, on) {
    $("champOpts").classList.toggle("hidden", !on); if (!on) return;
    const C = l.cal || { n: 4, list: [], round: 0, loaded: -1 }, edit = S.host && l.phase === "lobby", started = C.round > 0;
    $("sChampN").value = String(C.n); $("sChampN").disabled = !edit || started;
    const full = C.list.length >= C.n;
    $("calAddBtn").classList.toggle("hidden", !edit || full || started);
    $("calAddBtn").textContent = `➕ Add this track as round ${C.list.length + 1} of ${C.n}`;
    $("calAddBtn").disabled = !l.trackName && !S.track;
    $("champHint").textContent = started ? `Round ${Math.min(C.round + 1, C.n)} of ${C.n} is next. Reset the championship (Drivers tab) to change the calendar.`
      : full ? "✅ The calendar is full. Press Start to race round 1!" : `Draw a track (or load a random, real or shared one), then add it. ${C.n - C.list.length} more to go.`;
    const ol = $("calList"); ol.textContent = "";
    C.list.forEach((e, i) => {
      const li = el("li", "cal-item" + (i === C.loaded ? " on" : "") + (started && i < C.round ? " done" : "") + (started && i === C.round ? " next" : ""));
      li.append(el("span", "cal-n", String(i + 1)), calThumb(e.thumb));
      const tx = el("div", "cal-tx"); tx.append(el("b", "", e.label), el("small", "", `${e.km} km${started && i < C.round ? " · raced ✓" : started && i === C.round ? " · next up" : ""}`)); li.appendChild(tx);
      if (edit) {
        const bs = el("div", "cal-btns"), mk = (t, title, fn) => { const b = el("button", "btn ghost", t); b.type = "button"; b.title = title; b.setAttribute("aria-label", title); b.addEventListener("click", fn); bs.appendChild(b); };
        mk("👁", "Show this track", () => socket.emit("cal:show", i));
        if (!started) { mk("▲", "Move up", () => socket.emit("cal:move", { i, dir: -1 })); mk("▼", "Move down", () => socket.emit("cal:move", { i, dir: 1 })); mk("✕", "Remove", () => socket.emit("cal:remove", i)); }
        li.appendChild(bs);
      }
      ol.appendChild(li);
    });
    for (let i = C.list.length; i < C.n; i++) { const li = el("li", "cal-item empty"); li.append(el("span", "cal-n", String(i + 1)), el("small", "", "Empty: add a track")); ol.appendChild(li); }
  }
  $("sEnduro").addEventListener("change", () => { if (S.host) socket.emit("settings", { enduroMin: Number($("sEnduro").value) }); });
  socket.on("ttBoard", (b) => {
    const ol = $("ttList"); ol.textContent = "";
    if (!b || !b.list.length) { ol.appendChild(el("li", "preset-note", "No times yet on this track. Set the first one!")); return; }
    b.list.forEach((x, i) => { const li = el("li", "tt-row" + (x.name === A.user?.name ? " me" : "")); li.append(el("span", "", `${i + 1}. ${x.name}`), el("b", "", x.v.toFixed(3) + "s")); ol.appendChild(li); });
  });
  $("calAddBtn").addEventListener("click", () => { if (S.host) socket.emit("cal:add"); });
  $("sChampN").addEventListener("change", () => { if (S.host) socket.emit("settings", { champN: Number($("sChampN").value) }); });
  document.querySelectorAll(".mode-card").forEach((b) => b.addEventListener("click", () => { if (S.host && S.lobby?.phase === "lobby") socket.emit("settings", { mode: b.dataset.mode }); }));
  function renderClassCards(l) {
    const box = $("classCards"), me = l.players.find((p) => p.id === S.me); if (!me) { box.textContent = ""; return; }
    const key = me.cls + JSON.stringify([me.color, me.livery, me.number, me.extras, me.design]);
    if (box.dataset.k === key) return; box.dataset.k = key; box.textContent = "";
    for (const [k, K] of Object.entries(CLASSES)) {
      const b = document.createElement("button"); b.type = "button"; b.className = "class-card"; b.setAttribute("role", "radio"); b.setAttribute("aria-checked", String(me.cls === k));
      b.style.setProperty("--cc", K.col);
      const cv = document.createElement("canvas"); cv.width = 150; cv.height = 70; drawCar(cv.getContext("2d"), { ...me, cls: k }, 75, 35, 0, 1.9);
      const h = document.createElement("b"); h.textContent = `${K.icon} ${K.name}`;
      const bars = document.createElement("div"); bars.className = "cls-bars";
      for (const [lab, v] of K.bars) { const r = document.createElement("div"); r.append(lab); const i = document.createElement("i"); const f = document.createElement("b"); f.style.width = v * 100 + "%"; i.appendChild(f); r.appendChild(i); bars.appendChild(r); }
      const n = document.createElement("small"); n.textContent = K.note;
      b.append(cv, h, bars, n);
      b.addEventListener("click", () => { socket.emit("pickClass", k); sfx("tick"); });
      box.appendChild(b);
    }
  }
  // points system
  const ordinal = (n) => n + (["th", "st", "nd", "rd"][(n % 100 > 10 && n % 100 < 14) ? 0 : n % 10] || "th");
  function sendPoints(text) { if (S.host) socket.emit("settings", { points: text }); }
  $("sPreset").addEventListener("change", () => {
    const v = $("sPreset").value;
    if (v === "custom") { $("sPoints").focus(); return; }
    const total = (S.lobby?.players.length || 1) + (S.lobby?.settings.ai || 0);
    const text = v === "everyone" ? Array.from({ length: total }, (_, i) => total - i).join(",") : v;
    $("sPoints").value = text.split(",").join(", "); sendPoints(text);
  });
  $("sPoints").addEventListener("change", () => { $("sPreset").value = "custom"; sendPoints($("sPoints").value); });
  let champView = "drivers";
  $("champDrivers").addEventListener("click", () => { champView = "drivers"; renderLobby(); });
  $("champTeams").addEventListener("click", () => { champView = "teams"; renderLobby(); });
  // AI roster: host renames AI drivers, numbers and teams
  function renderRoster(l) {
    const box = $("roster"), open = $("aiBox").open;
    $("aiSummary").textContent = `AI DRIVERS (${l.roster.length})${S.host ? ": tap to rename" : ""}`;
    if (!open && box.childElementCount === l.roster.length) return;
    if (box.contains(document.activeElement)) return;          // don't wipe what you're typing
    box.textContent = "";
    l.roster.forEach((r, i) => {
      const row = document.createElement("div"); row.className = "ai-row";
      const sw = document.createElement("span"); sw.className = "sw"; sw.style.background = r.color;
      const mk = (val, type, key, extra) => {
        const inp = document.createElement("input"); inp.type = type; inp.value = val; inp.disabled = !S.host || l.phase !== "lobby";
        inp.setAttribute("aria-label", `AI ${i + 1} ${key}`); Object.assign(inp, extra || {});
        inp.addEventListener("change", () => socket.emit("aiEdit", { i, [key]: inp.value }));
        return inp;
      };
      if (r.cls) { sw.style.boxShadow = `0 0 0 2px ${CLASSES[r.cls].col}`; sw.title = CLASSES[r.cls].name; }
      row.append(sw, mk(r.name, "text", "name", { maxLength: 12 }), mk(r.number, "number", "number", { min: 0, max: 99 }), mk(r.team, "text", "team", { maxLength: 20 }));
      row.lastChild.setAttribute("list", "teamList");
      box.appendChild(row);
    });
  }
  $("aiBox").addEventListener("toggle", () => S.lobby && renderRoster(S.lobby));
  const raceRunning = () => ["tires", "lights", "race"].includes(S.lobby?.phase) && !!S.race;
  $("startBtn").addEventListener("click", () => {
    if (raceRunning()) { document.body.classList.toggle("spectating", !S.myCar); show("race"); return; }    // left the race: go back and watch it
    socket.emit("start");
  });
  // the host pressed start with friends in the room: 3, 2, 1 on everyone's screen
  socket.on("lobbyCount", ({ n }) => {
    let o = document.getElementById("lobbyCount"); if (!o) { o = el("div", "lobby-count"); o.id = "lobbyCount"; document.body.appendChild(o); }
    for (let k = 0; k < n; k++) setTimeout(() => { o.textContent = String(n - k); o.classList.remove("show"); void o.offsetWidth; o.classList.add("show"); sfx("tick"); tone(520 + k * 80, 0.12, "triangle", 0.16); }, k * 1000);
    setTimeout(() => o.classList.remove("show"), n * 1000);
  });
  $("roomNameIn").addEventListener("change", () => { if (S.host) socket.emit("roomName", $("roomNameIn").value); });
  $("roomNameIn").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); setTimeout(() => e.target.blur(), 0); } });
  // click the room code: it's copied, with a little "Copied!" pop
  $("roomCode").addEventListener("click", () => {
    const code = $("roomCode").textContent.trim(); if (!code) return;
    const done = () => { const rc = $("roomCode"), p = el("span", "copied-pop", "Copied!"); rc.parentElement.style.position = "relative"; rc.parentElement.appendChild(p); setTimeout(() => p.remove(), 1200); sfx("tick"); };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(code).then(done, () => popup(`Room code: ${code}`));
    else popup(`Room code: ${code}`);
  });
  $("leaveBtn").addEventListener("click", () => { try { sessionStorage.removeItem("tb-rejoin"); } catch (e) {} socket.emit("leave"); S.code = null; S.track = null; hideCards(); show("menu"); });
  $("garageBtn").addEventListener("click", () => { $("menu").classList.remove("hidden"); $("soloBtn").classList.add("hidden"); $("createBtn").parentElement.classList.add("hidden"); document.querySelector(".sep-or").classList.add("hidden"); addDoneBtn(); });
  function addDoneBtn() {
    if ($("doneBtn")) { $("doneBtn").classList.remove("hidden"); return; }
    const b = document.createElement("button"); b.type = "button"; b.className = "btn go"; b.id = "doneBtn"; b.textContent = "Done";
    b.addEventListener("click", () => { $("menu").classList.add("hidden"); b.classList.add("hidden"); $("soloBtn").classList.remove("hidden"); $("createBtn").parentElement.classList.remove("hidden"); document.querySelector(".sep-or").classList.remove("hidden"); saveProfile(); });
    $("soloBtn").after(b);
  }
  $("copyBtn").addEventListener("click", async () => {
    const url = location.origin + location.pathname + "?room=" + S.code;
    try { await navigator.clipboard.writeText(url); $("copyBtn").textContent = "Copied!"; } catch (e) { $("copyBtn").textContent = S.code; }
    setTimeout(() => ($("copyBtn").textContent = document.body.classList.contains("builder") ? "🔗 Invite" : "🔗 Copy invite link"), 1800);
  });
  // side panel tabs
  document.querySelectorAll(".rc-tabs [data-tab]").forEach((b) => b.addEventListener("click", () => {
    document.querySelectorAll(".rc-tabs [data-tab]").forEach((x) => x.setAttribute("aria-selected", String(x === b)));
    document.querySelectorAll(".rc-pane").forEach((p) => (p.hidden = p.dataset.pane !== b.dataset.tab));
    if (b.dataset.tab === "ai" && S.lobby) renderRoster(S.lobby);
    deskPanes();
    sfx("tick");
  }));
  // track info card: length, corners, bridges, rough lap time
  function renderTrackCard() {
    const card = $("trackCard"), t = S.track;
    card.classList.toggle("hidden", !t);
    if (!t) return;
    let corners = 0, inCorner = false;
    const k = Math.max(3, Math.round(240 / (t.length / t.N)));      // about 480px of track either side
    for (let i = 0; i < t.N; i++) {
      const a = t.tan[(i - k + t.N) % t.N], b = t.tan[(i + k) % t.N];
      const turn = Math.abs(wrapAngle(Math.atan2(b.y, b.x) - Math.atan2(a.y, a.x)));
      if (turn > 0.6 && !inCorner) { corners++; inCorner = true; } else if (turn < 0.3) inCorner = false;
    }
    const km = (t.length / 10 / 1000).toFixed(2), lap = t.length / 640;
    card.textContent = "";
    if (t.name) { const h = document.createElement("div"); h.style.gridColumn = "1 / -1"; const b = document.createElement("b"); b.textContent = t.name; h.appendChild(b); card.appendChild(h); }
    for (const [v, l] of [[`${km} km`, "Lap length"], [corners, "Corners"], [t.bridges || 0, t.bridges === 1 ? "Bridge" : "Bridges"], [`~${Math.round(lap)}s`, "Lap time"], [t.reverse ? "Reversed" : "Normal", "Direction"], [t.pitLane.side > 0 ? "Right" : "Left", "Pit lane side"]]) {
      const d = document.createElement("div"); const b = document.createElement("b"); b.textContent = v; const s2 = document.createElement("span"); s2.textContent = l;
      d.append(b, s2); card.appendChild(d);
    }
  }
  function renderLobby() {
    const l = S.lobby; if (!l) return;
    $("roomCode").textContent = l.code; $("roomCode").title = "Click to copy";
    { const rn = $("roomNameIn"); rn.readOnly = !S.host; rn.placeholder = S.host ? "Name your room" : "No name"; if (document.activeElement !== rn) rn.value = l.name || ""; }
    $("aiCount").textContent = l.settings.ai;
    const av = $("avatars"); av.textContent = "";
    for (const p of l.players) { const cv = document.createElement("canvas"); cv.width = 92; cv.height = 56; cv.title = p.name; drawCar(cv.getContext("2d"), p, 46, 28, 0, 1.55); av.appendChild(cv); }
    renderTrackCard();
    const pl = $("plist"); pl.textContent = "";
    for (const p of l.players) {
      const li = document.createElement("li");
      const cv = document.createElement("canvas"); cv.width = 112; cv.height = 64;
      drawCar(cv.getContext("2d"), p, 56, 32, 0, 1.9);
      if (p.id === S.me) li.classList.add("me");
      const n = document.createElement("span"); n.className = "nm"; n.textContent = `#${p.number} ${p.extras?.prest ? p.extras.prest + " " : ""}${p.extras?.badge ? p.extras.badge + " " : ""}${p.name}`;
      const tm = document.createElement("span"); tm.className = "team"; tm.textContent = p.team || ""; n.appendChild(tm);
      const t = document.createElement("span"); t.className = "tg"; t.innerHTML = "";
      if (p.id === l.hostId) { const cr = document.createElement("span"); cr.className = "crown"; cr.textContent = "👑 host"; t.append(cr, document.createElement("br")); }
      t.append((p.id === S.me ? "you · " : "") + `Lv ${p.level}`);
      if (l.settings.mode === "multi" && !l.ranked) { const K = CLASSES[p.cls] || CLASSES.hyper, ct = document.createElement("span"); ct.className = "cls-tag"; ct.style.background = K.col; ct.textContent = K.name; t.append(" ", ct); }
      const total = l.players.length + (l.settings.ai || 0);
      if (S.host && l.phase === "lobby") {
        const gs = document.createElement("select"); gs.className = "grid-sel"; gs.setAttribute("aria-label", `Starting spot for ${p.name}`); gs.title = "Where they start on the grid";
        const o0 = document.createElement("option"); o0.value = "0"; o0.textContent = "Grid: back"; gs.appendChild(o0);
        const oR = document.createElement("option"); oR.value = "-1"; oR.textContent = "Grid: 🎲 random"; gs.appendChild(oR);
        for (let k = 1; k <= total; k++) { const o = document.createElement("option"); o.value = String(k); o.textContent = k === 1 ? "Grid: pole" : `Grid: P${k}`; gs.appendChild(o); }
        gs.value = String(Math.min(p.gridPos || 0, total));
        gs.addEventListener("change", () => socket.emit("gridPos", { id: p.id, pos: Number(gs.value) }));
        t.append(document.createElement("br"), gs);
      } else if (p.gridPos === -1) { const g = document.createElement("span"); g.className = "grid-tag"; g.textContent = " · random grid spot"; t.append(g); }
      else if (p.gridPos) { const g = document.createElement("span"); g.className = "grid-tag"; g.textContent = ` · starts ${p.gridPos === 1 ? "on pole" : "P" + p.gridPos}`; t.append(g); }
      li.append(cv, n, t);
      if (S.host && p.id !== S.me) {
        const mk = document.createElement("button"); mk.type = "button"; mk.className = "mk"; mk.textContent = "Make host";
        mk.title = "Let them draw the track and start races";
        mk.addEventListener("click", () => socket.emit("setHost", p.id));
        const kk = document.createElement("button"); kk.type = "button"; kk.className = "mk kick"; kk.textContent = "Kick";
        kk.title = "Remove them from the room";
        kk.addEventListener("click", () => {
          if (kk.dataset.armed) { socket.emit("kick", p.id); return; }
          kk.dataset.armed = "1"; kk.textContent = "Sure?"; setTimeout(() => { kk.dataset.armed = ""; kk.textContent = "Kick"; }, 2500);
        });
        const col = document.createElement("div"); col.style.cssText = "display:flex;flex-direction:column;gap:0.2rem";
        col.append(mk, kk); li.appendChild(col);
      }
      if (p.id !== S.me) li.appendChild(playerMenu(p));
      if (isBlockedP(p)) { li.classList.add("blocked"); n.firstChild.textContent = `#${p.number} Blocked driver`; }
      pl.appendChild(li);
    }
    renderTeams(l);
    // warn when the grid gets big
    const total = l.players.length + (l.settings.ai || 0), cw = $("crowdWarn");
    cw.classList.toggle("hidden", total <= 20); cw.classList.toggle("bad", total > 40);
    cw.textContent = total > 40 ? `⚠ ${total} drivers is a LOT. Expect traffic jams, messy starts, and lag on slower phones and laptops.`
      : `⚠ ${total} drivers: races get crowded and starts get messy. Slower phones or laptops might lag.`;
    if (total > 20 && S.host && S.track && l.phase === "lobby") $("hostNote").textContent = `Heads up: ${total} drivers on the grid.`;
    $("resetChampBtn").classList.toggle("hidden", !S.host);
    const s = l.settings;
    for (const [id, key] of Object.entries(sel)) {
      if (document.activeElement === $(id)) continue;
      const sw = ["teamColors", "teams", "safetyCar", "drs", "reverseGrid", "dayNight", "multiEndur", "enduroShare"].includes(key);
      $(id).value = sw ? ((key === "enduroShare" ? s[key] !== false : !!s[key]) ? "on" : "off") : String(s[key] ?? (key === "start" ? "standing" : ""));
      $(id).disabled = !S.host || l.phase !== "lobby";
    }
    $("smoothBtn").setAttribute("aria-pressed", String(!!s.smooth));
    const multi = s.mode === "multi" && !l.ranked, mode = l.ranked ? "normal" : s.mode || "normal";
    document.querySelectorAll(".mode-card").forEach((b) => { b.setAttribute("aria-checked", String(b.dataset.mode === mode)); b.disabled = !S.host || l.phase !== "lobby"; });
    { const n = l.players.filter((p) => !p.spectator).length + (s.ai || 0), per = Math.max(1, Math.ceil((n - 1) / 12)), en = $("elimNote");
      en.classList.toggle("hidden", mode !== "elim" && mode !== "practice" && mode !== "koth");
      if (mode === "koth") en.textContent = "👑 King of the hill: the race runs as normal, but a clock runs for whoever is in the lead. Most time in first place wins (points go by that order too).";
      if (mode === "practice") en.textContent = "🏋️ Practice: no AI (the AI drivers setting is ignored) and no stats or coins. Sector times, your ghost and the pit stop minigame are all on. The host ends it from the race screen.";
      else if (mode === "elim") en.textContent = n < 2 ? "💥 Elimination needs at least 2 cars (add some AI)." : `💥 ${n} cars: ${per === 1 ? "the last car is" : `the last ${per} cars are`} knocked out every lap, so the race is ${Math.ceil((n - 1) / per)} laps (the Laps setting is ignored).`; }
    $("modePick").classList.toggle("hidden", !!l.ranked);
    $("modeTab").classList.toggle("hidden", !!l.ranked);         // (ranked picks everything itself)
    if (l.ranked && $("modeTab").getAttribute("aria-selected") === "true") document.querySelector('.rc-tabs [data-tab="drivers"]').click();
    $("multiOpts").classList.toggle("hidden", !multi);
    if (multi) renderClassCards(l);
    renderCalendar(l, mode === "champ" && !l.ranked);
    $("enduroOpts").classList.toggle("hidden", !(mode === "endur" || (multi && s.multiEndur)) || !!l.ranked);
    if (document.activeElement !== $("sEnduro")) $("sEnduro").value = String(s.enduroMin || 20); $("sEnduro").disabled = !S.host || l.phase !== "lobby";
    $("ttOpts").classList.toggle("hidden", mode !== "tt" || !!l.ranked);
    if (mode === "tt" && !l.ranked && S.ttKey !== (l.trackName || "") + (S.track?.length || 0)) { S.ttKey = (l.trackName || "") + (S.track?.length || 0); socket.emit("tt:board"); }
    { const ss = $("sSeason"); if (mode === "champ" && !l.ranked) { if (![...ss.options].some((o) => o.value === String(s.season))) { const o = document.createElement("option"); o.value = String(s.season); o.textContent = `${s.season} races`; ss.appendChild(o); } ss.value = String(s.season); ss.disabled = true; ss.title = "Set by the championship calendar (Mode tab)"; } else ss.title = ""; }
    // teams on/off, XP rate, public/private
    $("sTeamColors").disabled = !S.host || l.phase !== "lobby" || !s.teams;
    $("teamsSection").classList.toggle("hidden", !s.teams); $("teamsOff").classList.toggle("hidden", !!s.teams);
    $("champTeams").classList.toggle("hidden", !s.teams);
    if (!s.teams && champView === "teams") champView = "drivers";
    if (document.activeElement !== $("sXp")) { $("sXp").value = s.xpRate || 10; $("sXpOut").textContent = (s.xpRate || 10) + " XP/s"; }
    $("sXp").disabled = !S.host || l.phase !== "lobby";
    const pt = $("pubToggle"); pt.textContent = l.public ? "🌍 Public" : "🔒 Private"; pt.classList.toggle("on", !!l.public); pt.disabled = !S.host;
    pt.title = S.host ? (l.public ? "Anyone can find and join this room. Click to make it invite-only." : "Only people with the code can join. Click to list it publicly.") : "Only the host can change this";
    // points
    if (document.activeElement !== $("sPoints")) $("sPoints").value = s.points.join(", ");
    const presetMatch = [...$("sPreset").options].find((o) => o.value === s.points.join(","));
    if (document.activeElement !== $("sPreset")) $("sPreset").value = presetMatch ? presetMatch.value : "custom";
    $("sPoints").disabled = $("sPreset").disabled = !S.host || l.phase !== "lobby";
    $("ptsPreview").textContent = s.points.slice(0, 10).map((p, i) => `${ordinal(i + 1)}: ${p}`).join(", ") + (s.points.length > 10 ? `, ... (${s.points.length} places score)` : "") + ". Everyone else: 0.";
    renderRoster(l);
    // team names you can pick from when typing yours
    const teams = new Set([...l.players.map((p) => p.team), ...l.roster.map((r) => r.team)].filter(Boolean));
    $("teamList").textContent = "";
    for (const t of teams) { const o = document.createElement("option"); o.value = t; $("teamList").appendChild(o); }
    $("sMap").disabled = !S.host || l.phase !== "lobby";
    const running = raceRunning();
    $("startBtn").classList.toggle("hidden", !S.host && !running);
    $("startBtn").disabled = running ? false : !S.track || l.phase !== "lobby";
    $("startBtn").textContent = running ? "👀 Watch the race" : "🏁 Start race";
    if (running) boardHint("A race is running. You'll be on the grid for the next one.", false);
    $("hostNote").textContent = running || l.phase === "race" || l.phase === "lights" ? "A race is running. You'll be on the grid for the next one." :
      S.host ? (S.track ? "" : "Draw a track on the board to start.") : "The host draws the track and starts the race. Customize your car with My car.";
    $("boardTools").classList.toggle("hidden", !S.host);
    $("drawMode").classList.toggle("hidden", !S.host || l.phase !== "lobby");
    document.querySelector(".dock").classList.toggle("hidden", !S.host || l.phase !== "lobby");
    $("gridRandomBtn").classList.toggle("hidden", !S.host || l.phase !== "lobby");
    const meP = l.players.find((x) => x.id === S.me);
    S.spectating = !!meP?.spectator;
    $("spectateBtn").textContent = S.spectating ? "🏎️ Race instead of watching" : "👀 Spectate the next race";
    $("spectateBtn").setAttribute("aria-pressed", String(S.spectating)); $("spectateBtn").classList.toggle("on", S.spectating);
    $("spectateBtn").disabled = l.phase !== "lobby";
    $("lastSeasonBtn").classList.toggle("hidden", !l.hasLastSeason && !S.lastSeason?.history?.length);
    updateEditUi();
    const cb = $("champBody"); cb.textContent = "";
    $("champTitle").textContent = s.season ? `Championship: race ${Math.min(l.raceNo + 1, s.season)} of ${s.season} next` : l.raceNo ? `Championship (after ${l.raceNo} race${l.raceNo > 1 ? "s" : ""})` : "Championship";
    $("champDrivers").setAttribute("aria-pressed", String(champView === "drivers"));
    $("champTeams").setAttribute("aria-pressed", String(champView === "teams"));
    const myTeam = l.players.find((p) => p.id === S.me)?.team;
    const champ = champView === "teams"
      ? (l.teamChamp.length ? l.teamChamp : [...new Set(l.players.map((p) => p.team))].map((t) => ({ n: t, p: 0 })))
      : (l.champ.length ? l.champ : l.players.map((p) => ({ n: p.name, p: 0 })));
    champ.slice(0, 12).forEach((x, i) => {
      const tr = document.createElement("tr"); if (x.n === (champView === "teams" ? myTeam : prof.name)) tr.className = "me";
      const a = document.createElement("td"); a.textContent = i + 1;
      const b = document.createElement("td"); b.textContent = x.n;
      const c = document.createElement("td"); c.className = "n"; c.textContent = x.p + " pts";
      tr.append(a, b, c); cb.appendChild(tr);
    });
    if (!S.track && S.host && !S.draft) boardHint(drawMode === "line" ? (isTouch() ? "Tap to place corners. You can mix in Freehand too." : "Click to place corners. You can mix in Freehand too.") : (isTouch() ? "Draw your track in one loop with your finger. Tap Straight for straight lines." : "Draw your track in one loop. Hold Shift for straight lines."), false);
    if (l.ranked) boardHint(`🏆 Ranked race on ${l.trackName || "a random track"}: starting in a moment...`, false);
    else if (!S.host) boardHint(S.track ? `${l.players.find((p) => p.id === l.hostId)?.name || "Host"} made this track` : "Waiting for the host to draw a track...", false);
    drawBoard();
  }
  // Teams: every team with its drivers (players + AI), and a Join button
  function renderTeams(l) {
    const box = $("teamsList"); if (!box) return;
    const me = l.players.find((p) => p.id === S.me);
    const teams = new Map();
    const add = (team, m) => { if (!team) return; if (!teams.has(team)) teams.set(team, []); teams.get(team).push(m); };
    for (const p of l.players) add(p.team, { name: p.name, color: p.color, ai: false });
    for (const r of l.roster) add(r.team, { name: r.name, color: r.color, ai: true, hired: !!r.origTeam });
    const key = JSON.stringify([...teams]) + me?.team;
    if (box.dataset.key === key) return;
    box.dataset.key = key; box.textContent = "";
    // your team first, then teams with players, then AI teams
    const order = [...teams.entries()].sort((a, b) => (b[0] === me?.team) - (a[0] === me?.team) || b[1].filter((m) => !m.ai).length - a[1].filter((m) => !m.ai).length);
    for (const [team, members] of order) {
      const card = document.createElement("div"); card.className = "team-card" + (team === me?.team ? " mine" : "");
      const th = document.createElement("div"); th.className = "th";
      const b = document.createElement("b"); b.textContent = team; th.appendChild(b);
      if (team === me?.team) {
        const y = document.createElement("span"); y.className = "you"; y.textContent = "YOUR TEAM"; th.appendChild(y);
        if (l.phase === "lobby") {
          const ed = document.createElement("button"); ed.type = "button"; ed.className = "team-edit"; ed.textContent = "✏️"; ed.title = "Rename your team"; ed.setAttribute("aria-label", "Rename your team");
          ed.addEventListener("click", () => {
            const inp = document.createElement("input"); inp.type = "text"; inp.maxLength = 20; inp.value = team; inp.className = "team-name-in"; inp.setAttribute("aria-label", "New team name");
            const ok = document.createElement("button"); ok.type = "button"; ok.className = "join-btn"; ok.textContent = "Save";
            const go = () => { const v = inp.value.trim(); if (v && v !== team) socket.emit("renameTeam", v); box.dataset.key = ""; renderTeams(S.lobby); };
            ok.addEventListener("click", go); inp.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); if (e.key === "Escape") { box.dataset.key = ""; renderTeams(S.lobby); } });
            th.textContent = ""; th.append(inp, ok); inp.focus(); inp.select();
          });
          th.insertBefore(ed, y);
        }
      }
      else {
        const j = document.createElement("button"); j.type = "button"; j.className = "join-btn"; j.textContent = "Join";
        j.addEventListener("click", () => joinTeam(team));
        th.appendChild(j);
      }
      const ms = document.createElement("div"); ms.className = "members";
      for (const m of members) {
        const s2 = document.createElement("span"); s2.className = "m" + (m.ai ? " ai" : "");
        const i2 = document.createElement("i"); i2.style.background = m.color; s2.append(i2, m.name + (m.ai ? " (AI)" : ""));
        if (m.ai && team === me?.team && m.hired && l.phase === "lobby") {
          const x = document.createElement("button"); x.type = "button"; x.className = "m-x"; x.textContent = "✕"; x.title = `Send ${m.name} back to their old team`;
          x.addEventListener("click", () => socket.emit("aiTeammate", { remove: m.name })); s2.appendChild(x);
        }
        ms.appendChild(s2);
      }
      card.append(th, ms);
      if (team === me?.team && l.phase === "lobby" && members.filter((m) => m.ai).length < 3) {
        const add = document.createElement("button"); add.type = "button"; add.className = "btn ai-mate";
        add.textContent = members.length < 2 ? "🤖 Add an AI teammate" : "🤖 Add another AI teammate";
        add.title = "An AI driver races for your team and scores team points (it takes one from the AI teams)";
        add.addEventListener("click", () => { socket.emit("aiTeammate", {}); sfx("tick"); });
        card.appendChild(add);
      }
      box.appendChild(card);
    }
  }
  function joinTeam(team) {
    prof.team = team; teamIn.value = team;
    try { localStorage.setItem("tb-profile", JSON.stringify(prof)); } catch (e) {}
    socket.emit("setTeam", team); sfx("tick"); popup(`Joined ${team}!`);
  }
  $("newTeamBtn").addEventListener("click", () => { const v = $("newTeamIn").value.trim(); if (v) { joinTeam(v); $("newTeamIn").value = ""; } });
  $("newTeamIn").addEventListener("keydown", (e) => { if (e.key === "Enter") $("newTeamBtn").click(); });
  $("resetChampBtn").addEventListener("click", () => {
    const b = $("resetChampBtn");
    if (b.classList.contains("armed")) { socket.emit("resetChamp"); b.classList.remove("armed"); b.textContent = "Reset championship"; return; }
    b.classList.add("armed"); b.textContent = "Click again to wipe all points";
    setTimeout(() => { b.classList.remove("armed"); b.textContent = "Reset championship"; }, 3000);
  });
  socket.on("kicked", (d) => { S.code = null; S.track = null; show("menu"); menuErr.textContent = `You were removed from the room${d?.by ? " by " + d.by : ""}.`; });
  function boardHint(t, bad) { const h = $("boardHint"); h.textContent = t; h.style.color = bad ? "#ff8a80" : ""; }
  // the drawing board shows the whole map; bigger maps = more room to draw
  const B = { w: 0, h: 0, s: 1, ox: 0, oy: 0, bw: 1600, bh: 1000 };
  function sizeBoard() {
    // clientWidth/Height are the board's real layout size. (getBoundingClientRect() also counts
    // CSS transforms: measured while the lobby's slide-in animation was still scaling the board
    // to 96%, the drawing ended up a few % away from the mouse. That was the offset bug.)
    const w = board.clientWidth, h = board.clientHeight, dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (!w || !h) return;
    board.width = Math.round(w * dpr); board.height = Math.round(h * dpr); B.w = w; B.h = h; B.dpr = dpr;
    drawBoard();
  }
  window.addEventListener("resize", () => { if (S.screen === "lobby") sizeBoard(); });
  function boardDims() {
    const m = MAP_SIZES[S.lobby?.settings.map || "normal"]; B.bw = m[0]; B.bh = m[1];
    // phones: the hint and tools sit above/below the board, so the map can use all of it
    const compact = getComputedStyle($("boardHint")).position === "static";
    const top = compact ? 8 : 50, bottom = compact ? 22 : 40;
    // big screens: keep the map clear of the tool dock on the left
    const dock = document.querySelector(".dock"), dr = !compact && dock && !dock.classList.contains("hidden") ? dock.getBoundingClientRect() : null;
    const left = dr && dr.height > dr.width ? dr.right - board.getBoundingClientRect().left + 10 : compact ? 8 : 20, right = compact ? 8 : 20;
    B.s = Math.min((B.w - left - right) / B.bw, (B.h - top - bottom) / B.bh); B.ox = left + (B.w - left - right - B.bw * B.s) / 2; B.oy = top + (B.h - top - bottom - B.bh * B.s) / 2;
  }
  // redraw whenever the board changes size (phones rotating, the lobby laying itself out, etc.)
  if (window.ResizeObserver) new ResizeObserver(() => { if (S.screen === "lobby") sizeBoard(); }).observe(board);
  // ======================= Drawing board =======================
  function paintBoardBg(th, T, G) {
    const cv = document.createElement("canvas"); cv.width = board.width; cv.height = board.height;
    const c = cv.getContext("2d"), dpr = B.dpr || 1;
    c.setTransform(dpr, 0, 0, dpr, 0, 0); c.translate(B.ox, B.oy); c.scale(B.s, B.s);
    // drop shadow under the map
    c.save(); c.shadowColor = "rgba(0,0,0,0.55)"; c.shadowBlur = 24 / B.s; c.shadowOffsetY = 6 / B.s; c.fillStyle = th.ground; c.fillRect(0, 0, B.bw, B.bh); c.restore();
    // the same ground texture as the race (1 board unit = 3 world px)
    const pat = c.createPattern(tex("ground", th), "repeat");
    if (pat.setTransform) pat.setTransform(new DOMMatrix().scale(1 / 3));
    c.fillStyle = pat; c.fillRect(0, 0, B.bw, B.bh);
    c.save(); c.beginPath(); c.rect(0, 0, B.bw, B.bh); c.clip();
    if (T && G) {
      c.save(); c.translate(T.minX, T.minY); c.scale(1 / T.scale, 1 / T.scale); c.translate(-T.pad, -T.pad);
      // the board stays calm: "light" = a few faded props (grandstands, the odd tree), "full" = like the race
      if (settings.scenery !== "off" && settings.boardScenery !== "off") {
        if (settings.boardScenery === "full") drawDecor(c, T, G, th, {});
        else { c.save(); c.globalAlpha = 0.5; drawDecor(c, T, G, th, { lite: true }); c.restore(); }
      }
      drawStatic(c, T, G, th, { board: true, noGround: true });
      c.restore();
    }
    // faint drawing grid + a soft vignette so the middle of the board pops
    c.strokeStyle = th.night ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.09)"; c.lineWidth = 1 / B.s; c.beginPath();
    for (let x = 0; x <= B.bw; x += 100) { c.moveTo(x, 0); c.lineTo(x, B.bh); }
    for (let y = 0; y <= B.bh; y += 100) { c.moveTo(0, y); c.lineTo(B.bw, y); }
    c.stroke();
    const vg = c.createRadialGradient(B.bw / 2, B.bh / 2, Math.min(B.bw, B.bh) * 0.35, B.bw / 2, B.bh / 2, Math.hypot(B.bw, B.bh) * 0.6);
    vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, th.night ? "rgba(0,0,0,0.3)" : "rgba(0,0,0,0.14)");
    c.fillStyle = vg; c.fillRect(0, 0, B.bw, B.bh);
    c.restore();
    c.strokeStyle = "rgba(255,255,255,0.18)"; c.lineWidth = 2 / B.s; c.strokeRect(0, 0, B.bw, B.bh);
    return cv;
  }
  // ---- track objects: grandstands (beside the track), banners (an arch over it), tunnels and bridges (over the
  // cars). "ground" ones are drawn under the cars, the rest on top. In a tunnel your own car shows as an arrow.
  // ---- stadiums: grandstands full of little people, who jump up and cheer when cars go by ----
  const STAND_COLS = ["#ef4444", "#3b82f6", "#facc15", "#22c55e", "#f472b6", "#f8fafc", "#a855f7", "#fb923c"], SKIN = ["#f1c27d", "#e0ac69", "#c68642", "#8d5524", "#ffdbac"];
  function drawStand(c, x, y, rot, seed, ex) {
    const t = performance.now() / 1000;
    c.save(); c.translate(x, y); c.rotate(rot);
    c.fillStyle = "#3b4150"; c.fillRect(-90, -30, 180, 60);
    c.fillStyle = "rgba(255,255,255,0.07)"; for (let r = 0; r < 4; r++) c.fillRect(-90, -24 + r * 11, 180, 1.4);
    c.fillStyle = "#e5e7eb"; c.fillRect(-90, 24, 180, 6);
    for (let r = 0; r < 4; r++) for (let k = 0; k < 15; k++) {
      const ph = seed * 31 + r * 15 + k, col = STAND_COLS[(ph * 7 + r) % STAND_COLS.length];
      const jump = ex * Math.max(0, Math.sin(t * (8 + (ph % 5)) + ph * 1.7)) * 3.2 + Math.sin(t * 1.3 + ph) * 0.45;
      const px = -82 + k * 11.5, py = -19 + r * 11 - jump;
      if (ex > 0.3 && ph % 3) { c.strokeStyle = col; c.lineWidth = 1.5; c.beginPath(); c.moveTo(px - 2.6, py + 2); c.lineTo(px - 4.6, py - 3.5 - jump * 0.4); c.moveTo(px + 2.6, py + 2); c.lineTo(px + 4.6, py - 3.5 - jump * 0.4); c.stroke(); }
      c.fillStyle = col; c.fillRect(px - 3.1, py + 1.2, 6.2, 4.6);
      c.fillStyle = SKIN[ph % SKIN.length]; c.beginPath(); c.arc(px, py - 0.6, 2.5, 0, Math.PI * 2); c.fill();
      if (ph % 13 === 0) { const w = Math.sin(t * 7 + ph) * 2.5; c.strokeStyle = "#ddd"; c.lineWidth = 0.8; c.beginPath(); c.moveTo(px + 3, py + 2); c.lineTo(px + 4, py - 7); c.stroke(); c.fillStyle = STAND_COLS[(ph + 3) % STAND_COLS.length]; c.beginPath(); c.moveTo(px + 4, py - 7); c.lineTo(px + 10, py - 6 + w); c.lineTo(px + 4, py - 3); c.fill(); }
    }
    c.fillStyle = "#ff2d55"; c.fillRect(-90, -36, 180, 6);
    c.restore();
  }
  // how excited a stand is: cars close by = on their feet (eased, so it builds and calms down)
  const STAND_EX = new Map();
  function standEx(x, y) {
    const key = Math.round(x) + "," + Math.round(y); let near = 1e9;
    if (S.cars) for (const c of S.cars.values()) if (c.x !== undefined) near = Math.min(near, (c.x - x) ** 2 + (c.y - y) ** 2);
    const want = near < 340 * 340 ? 1 : 0.12, cur = STAND_EX.get(key) ?? 0.12, v = cur + (want - cur) * (want > cur ? 0.25 : 0.03);
    STAND_EX.set(key, v); if (STAND_EX.size > 400) STAND_EX.clear();
    return v;
  }
  // every track gets its own stadiums: one on the main straight (across from the pits), the rest round the outside of
  // the twistiest corners. Only where there's room: never on the road, the pits, the map edge or your own objects.
  function autoStands(t) {
    if (t._stands) return t._stands;
    const N = t.N, out = [], pl = t.pitLane;
    if (!N || !t.pts || !t.nor || !t.tan || !t.hw) return (t._stands = out);
    const inPit = (i, side) => pl && side === pl.side && ((i - pl.entry + N) % N) <= pl.len + 10;
    const turn = (i) => { const a = t.tan[(i - 5 + N) % N], b = t.tan[(i + 5) % N]; return a.x * b.y - a.y * b.x; };
    const ok = (i, side) => {
      if (inPit(i, side)) return null;
      const p = t.pts[i], n = t.nor[i], off = t.hw[i] + 62, x = p.x + n.x * off * side, y = p.y + n.y * off * side;
      if (x < 130 || y < 130 || x > t.W - 130 || y > t.H - 130) return null;
      for (let j = 0; j < N; j += 2) { let di = Math.abs(j - i); di = Math.min(di, N - di); if (di < 8) continue; if (Math.hypot(t.pts[j].x - x, t.pts[j].y - y) < t.hw[j] + 115) return null; }
      for (const s2 of out) if (Math.hypot(s2.x - x, s2.y - y) < 260) return null;
      for (const d of t.decor || []) { const q = t.pts[d.i]; if (q && Math.hypot(q.x - x, q.y - y) < 260) return null; }
      const a = t.tan[i]; return { i, side, x, y, rot: Math.atan2(a.y, a.x) + (side < 0 ? Math.PI : 0), cheerAt: 0 };
    };
    const startSide = pl ? -pl.side : 1;
    for (const i of [N - 9, N - 20]) { const s2 = ok(((i % N) + N) % N, startSide); if (s2) { out.push(s2); break; } }
    const cand = []; for (let i = 0; i < N; i += Math.max(3, Math.floor(N / 70))) cand.push(i);
    cand.sort((a, b) => Math.abs(turn(b)) - Math.abs(turn(a)));
    for (const i of cand) {
      if (out.length >= 7) break;
      if (out.some((s2) => { let di = Math.abs(s2.i - i); di = Math.min(di, N - di); return di < N / 10; })) continue;
      const side = turn(i) > 0 ? -1 : 1;                     // the outside of the corner
      const s2 = ok(i, side) || ok(i, -side); if (s2) out.push(s2);
    }
    return (t._stands = out);
  }
  function drawAutoStands(c, t) {
    const now = performance.now();
    for (const s2 of autoStands(t)) {
      drawStand(c, s2.x, s2.y, s2.rot, s2.i, now - (s2.hype || -1e9) < 2500 ? 1 : standEx(s2.x, s2.y));
    }
  }
  const TUNNEL_LEN = 16;          // (how many track points a one-click tunnel covers; two clicks: start to end)
  const DECOR_LONG = ["tunnel", "stand"];
  const decorLen = (d) => (d.len > 0 ? d.len : d.k === "tunnel" ? TUNNEL_LEN : 0);
  function drawObjects(c, T, layer, me = null, board = false) {
    const D = T?.decor; if (!D || !D.length) return;
    const N = T.N, P = (i) => T.pts[((i % N) + N) % N], Nn = (i) => T.nor[((i % N) + N) % N], ang = (i) => { const q = T.tan[((i % N) + N) % N]; return Math.atan2(q.y, q.x); };
    for (const d of D) {
      const i = d.i, p = P(i), n = Nn(i), hw = hwAt(T, i), a = ang(i);
      if (d.k === "stand" && layer === "ground") {
        // a grandstand (two clicks: a whole row of them, from where you started to where you ended)
        const L0 = decorLen(d), step = 9, list = L0 > 0 ? Array.from({ length: Math.max(1, Math.floor(L0 / step) + 1) }, (_, q) => i + q * step) : [i];
        for (const si of list) {
          const sp = P(si), sn = Nn(si), sa = ang(si), off = hwAt(T, ((si % N) + N) % N) + 62, x = sp.x + sn.x * off * d.side, y = sp.y + sn.y * off * d.side;
          drawStand(c, x, y, sa + (d.side < 0 ? Math.PI : 0), si, board ? 0.2 : standEx(x, y));
        }
      } else if (d.k === "banner" && layer === "top") {
        c.save(); c.translate(p.x, p.y); c.rotate(a);
        const w = hw + 14; c.fillStyle = "#1f2937"; c.fillRect(-5, -w - 6, 10, 10); c.fillRect(-5, w - 4, 10, 10);
        c.globalAlpha = board ? 1 : 0.92; c.fillStyle = "#ff2d55"; c.fillRect(-11, -w, 22, w * 2);
        c.rotate(Math.PI / 2); c.fillStyle = "#fff"; c.font = "900 15px 'Titillium Web', 'Chakra Petch', sans-serif"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText("SCRIBBLE GP", 0, 1);
        c.restore();
      } else if (d.k === "tunnel" && layer === "top") {
        const len = decorLen(d), L = [], R = [];
        for (let k = 0; k <= len; k++) { const q = P(i + k), m = Nn(i + k), h = hwAt(T, (i + k) % N) + 16; L.push([q.x + m.x * h, q.y + m.y * h]); R.push([q.x - m.x * h, q.y - m.y * h]); }
        const tube = () => { c.beginPath(); L.forEach(([x, y], k) => (k ? c.lineTo(x, y) : c.moveTo(x, y))); for (let k = R.length - 1; k >= 0; k--) c.lineTo(R[k][0], R[k][1]); c.closePath(); };
        const inside = !board && S.tun > 0 && D.indexOf(d) === S.tunK ? S.tun : 0;
        if (inside) {
          // INSIDE: the world outside goes dark, the roof goes see-through, and you see the tunnel itself:
          // concrete walls, orange lamps sliding past, a light strip along the ceiling
          c.save();
          c.fillStyle = `rgba(3,3,9,${0.84 * inside})`; c.beginPath(); c.rect(-1e5, -1e5, 2e5, 2e5);
          L.forEach(([x, y], k) => (k ? c.lineTo(x, y) : c.moveTo(x, y))); for (let k = R.length - 1; k >= 0; k--) c.lineTo(R[k][0], R[k][1]); c.closePath(); c.fill("evenodd");
          tube(); c.fillStyle = `rgba(20,22,30,${0.35 * inside})`; c.fill();
          c.lineJoin = "round"; c.lineCap = "round";
          for (const W of [L, R]) {
            c.globalAlpha = inside; c.strokeStyle = "#262a33"; c.lineWidth = 16; c.beginPath(); W.forEach(([x, y], k) => (k ? c.lineTo(x, y) : c.moveTo(x, y))); c.stroke();
            c.strokeStyle = "#8b93a3"; c.lineWidth = 2.5; c.stroke();
          }
          c.globalCompositeOperation = "lighter";
          for (let k = 1; k < len; k += 2) for (const W of [L, R]) {
            const [x, y] = W[k], g = c.createRadialGradient(x, y, 0, x, y, 46);
            g.addColorStop(0, `rgba(255,190,90,${0.5 * inside})`); g.addColorStop(1, "rgba(255,150,40,0)"); c.fillStyle = g; c.beginPath(); c.arc(x, y, 46, 0, Math.PI * 2); c.fill();
            c.fillStyle = `rgba(255,225,150,${inside})`; c.beginPath(); c.arc(x, y, 3.2, 0, Math.PI * 2); c.fill();
          }
          c.strokeStyle = `rgba(190,220,255,${0.35 * inside})`; c.lineWidth = 3; c.setLineDash([22, 18]); c.lineDashOffset = -performance.now() / 12;
          c.beginPath(); for (let k = 0; k <= len; k++) { const q = P(i + k); k ? c.lineTo(q.x, q.y) : c.moveTo(q.x, q.y); } c.stroke(); c.setLineDash([]);
          c.restore();
        }
        c.save(); c.globalAlpha = (board ? 0.85 : 1) * (1 - 0.92 * inside);
        tube();
        c.fillStyle = "#4b5563"; c.fill(); c.lineWidth = 6; c.strokeStyle = "#1f2937"; c.stroke();
        c.strokeStyle = "rgba(255,255,255,0.12)"; c.lineWidth = 3; for (let k = 2; k < len; k += 3) { c.beginPath(); c.moveTo(L[k][0], L[k][1]); c.lineTo(R[k][0], R[k][1]); c.stroke(); }
        c.restore();
        if (!inside && me && me.x !== undefined && me.idx !== undefined && ((me.idx - i + N) % N) <= len) {            // you're in the tunnel: an arrow where you are
          c.save(); c.translate(me.x, me.y); c.rotate(me.h); c.fillStyle = "#ffcc1f"; c.strokeStyle = "#000"; c.lineWidth = 2;
          c.beginPath(); c.moveTo(22, 0); c.lineTo(-12, -13); c.lineTo(-5, 0); c.lineTo(-12, 13); c.closePath(); c.fill(); c.stroke(); c.restore();
        }
      } else if (d.k === "bridge" && layer === "top") {
        c.save(); c.translate(p.x, p.y); c.rotate(a);
        const w = hw + 70; c.globalAlpha = board ? 0.9 : 1; c.fillStyle = "#9ca3af"; c.fillRect(-22, -w, 44, w * 2);
        c.fillStyle = "#6b7280"; c.fillRect(-22, -w, 5, w * 2); c.fillRect(17, -w, 5, w * 2);
        c.strokeStyle = "rgba(255,255,255,0.35)"; c.setLineDash([10, 10]); c.lineWidth = 2; c.beginPath(); c.moveTo(0, -w); c.lineTo(0, w); c.stroke(); c.setLineDash([]);
        c.restore();
      }
    }
  }
  function drawBoard() {
    if (!B.w) return;
    boardDims();
    const c = bctx, dpr = B.dpr || 1;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.fillStyle = "#1a1d23"; c.fillRect(0, 0, B.w, B.h);
    const themeKey = S.lobby?.settings.theme || "grass", th = THEMES[themeKey]; th.key = themeKey;
    const T = S.track;
    // everyone else watches the host's drawing appear live
    const watching = !S.host && S.hostDraft && S.hostDraft.length > 1;
    const preview = !S.draft && S.preview;
    const showTrack = T && !S.draft && !watching && !preview;
    if (showTrack && !S.geo) S.geo = buildGeo(T);
    // The board background (textured ground, scenery, the finished track) is painted once into a
    // cached picture and just copied every frame, so it can look like the race and still be fast.
    const bgKey = [board.width, board.height, B.ox, B.oy, B.s, themeKey, showTrack ? S.geo.id : "-", settings.scenery, settings.boardScenery, showTrack ? gridCount() : 0, settings.raceline].join("|");
    if (B.bgKey !== bgKey) { B.bgKey = bgKey; B.bg = paintBoardBg(th, showTrack ? T : null, showTrack ? S.geo : null); }
    c.setTransform(1, 0, 0, 1, 0, 0); c.drawImage(B.bg, 0, 0); c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.save(); c.translate(B.ox, B.oy); c.scale(B.s, B.s);
    if (showTrack) {
      const G = S.geo;
      c.save(); c.translate(T.minX, T.minY); c.scale(1 / T.scale, 1 / T.scale); c.translate(-T.pad, -T.pad);
      const arrows = (up) => {
        c.fillStyle = "rgba(255,255,255,0.85)";
        const step = Math.max(8, Math.floor(T.N / 18));
        for (let i = 8; i < T.N; i += step) {
          if ((T.elev[i] > 0.02) !== up) continue;
          const p = T.pts[i]; c.save(); c.translate(p.x, p.y); c.rotate(Math.atan2(T.tan[i].y, T.tan[i].x));
          c.beginPath(); c.moveTo(27, 0); c.lineTo(-18, -21); c.lineTo(-18, 21); c.closePath(); c.fill(); c.restore();
        }
      };
      drawObjects(c, T, "ground");
      arrows(false);
      for (const br of G.bridges) drawBridge(c, T, G, th, br);
      arrows(true);
      drawObjects(c, T, "top", null, true);
      // DRS zones: a green band over the road, and "DRS" where each one starts
      (T.drs || []).forEach((z, zi) => {
        c.beginPath();
        for (let k = 0; k <= z.len; k++) { const p = T.pts[(z.from + k) % T.N]; k ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y); }
        c.lineCap = "butt"; c.lineJoin = "round"; c.lineWidth = hwAt(T, z.from % T.N) * 1.3; c.strokeStyle = "rgba(62,224,106,0.42)"; c.stroke();
        const p = T.pts[z.from % T.N];
        c.fillStyle = "#3ee06a"; c.font = `700 ${(11 / B.s) * T.scale}px 'Chakra Petch', sans-serif`; c.textAlign = "center"; c.textBaseline = "bottom";
        c.lineWidth = 4 * T.scale / B.s / 2; c.strokeStyle = "rgba(0,0,0,0.6)";
        const lab = `DRS ${zi + 1}`, y = p.y + hwAt(T, z.from % T.N) + 30 * T.scale / B.s;
        c.strokeText(lab, p.x, y); c.fillText(lab, p.x, y);
      });
      const p0 = T.pts[0];
      c.fillStyle = "#fff"; c.font = `700 ${(12 / B.s) * T.scale}px 'Chakra Petch', sans-serif`; c.textAlign = "center"; c.textBaseline = "bottom";
      c.lineWidth = 4 * T.scale / B.s / 2; c.strokeStyle = "rgba(0,0,0,0.6)";
      c.strokeText("START", p0.x, p0.y - hwAt(T, 0) - 16); c.fillText("START", p0.x, p0.y - hwAt(T, 0) - 16);
      c.restore();
    }
    drawCutPreview(c);
    if (S.decorStart && S.decorTool) {  // first click of a tunnel / grandstand
      c.fillStyle = S.decorTool === "tunnel" ? "#9ca3af" : "#ff2d55"; c.strokeStyle = "#fff"; c.lineWidth = 2.5 / B.s;
      c.beginPath(); c.arc(S.decorStart[0], S.decorStart[1], 8 / B.s, 0, Math.PI * 2); c.fill(); c.stroke();
    }
    if (drsMode && drsMode.a) {         // first click of a new DRS zone
      c.fillStyle = "#3ee06a"; c.strokeStyle = "#fff"; c.lineWidth = 2.5 / B.s;
      c.beginPath(); c.arc(drsMode.a[0], drsMode.a[1], 8 / B.s, 0, Math.PI * 2); c.fill(); c.stroke();
    }
    // the drawing you're working on (or the host's, live)
    const d = S.draft || (preview ? { pts: S.preview, corners: [], preview: true } : watching ? { pts: S.hostDraft.slice(0, Math.max(2, Math.ceil(S.hostShown || 0))), corners: [] } : null);
    if (d && d.pts.length) {
      const P = d.pts;
      c.lineJoin = "round"; c.lineCap = "round";
      const layer = (extra, color) => {
        c.strokeStyle = color;
        let i0 = 0;
        for (let i = 1; i <= P.length; i++) {
          if (i < P.length && P[i][2] === P[i0][2]) continue;
          c.lineWidth = P[i0][2] / 3 + extra; c.beginPath(); c.moveTo(P[i0][0], P[i0][1]);
          for (let k = i0 + 1; k <= Math.min(i, P.length - 1); k++) c.lineTo(P[k][0], P[k][1]);
          if (i0 === P.length - 1) c.lineTo(P[i0][0] + 0.01, P[i0][1]);
          c.stroke(); i0 = i;
        }
      };
      layer(5, th.curbB); layer(0, th.asphalt);
      if (d.preview) { c.lineWidth = 3 / B.s; c.strokeStyle = "rgba(255,255,255,0.5)"; c.beginPath(); P.forEach((q, i) => (i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1]))); c.closePath(); c.stroke(); }
      else {
      c.lineWidth = 2 / B.s; c.strokeStyle = "rgba(255,204,31,0.8)"; c.setLineDash([8 / B.s, 6 / B.s]);
      c.beginPath(); P.forEach((q, i) => (i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1]))); c.stroke(); c.setLineDash([]);
      for (const i of new Set(d.corners)) { if (!P[i]) continue; c.fillStyle = "#ffcc1f"; c.beginPath(); c.arc(P[i][0], P[i][1], 5 / B.s, 0, Math.PI * 2); c.fill(); }
      c.fillStyle = "#3ecf6a"; c.beginPath(); c.arc(P[0][0], P[0][1], 9 / B.s, 0, Math.PI * 2); c.fill();
      c.strokeStyle = "#fff"; c.lineWidth = 2 / B.s; c.stroke();
      if (d.cut && d.pieces && !d.pieces.length) {         // redraw: start from here
        const L = P[P.length - 1];
        c.fillStyle = "#ffcc1f"; c.beginPath(); c.arc(L[0], L[1], 9 / B.s, 0, Math.PI * 2); c.fill(); c.stroke();
        c.beginPath(); c.arc(L[0], L[1], (14 + 4 * Math.sin(performance.now() / 200)) / B.s, 0, Math.PI * 2); c.strokeStyle = "rgba(255,204,31,0.7)"; c.stroke();
      }
      }
    }
    // mirror mode: the middle line, and a see-through preview of the mirrored half
    if (drawMode === "mirror" && S.host && (S.draft || !S.track)) {
      c.setLineDash([10 / B.s, 10 / B.s]); c.strokeStyle = "rgba(255,255,255,0.45)"; c.lineWidth = 2 / B.s;
      c.beginPath(); c.moveTo(B.bw / 2, 0); c.lineTo(B.bw / 2, B.bh); c.stroke(); c.setLineDash([]);
      if (d && d.mirror && d.pts.length > 1) {
        c.globalAlpha = 0.45; c.lineCap = "round"; c.lineJoin = "round"; c.strokeStyle = th.asphalt; c.lineWidth = d.pts[0][2] / 3;
        c.beginPath(); d.pts.forEach((q, i) => (i ? c.lineTo(B.bw - q[0], q[1]) : c.moveTo(B.bw - q[0], q[1]))); c.stroke(); c.globalAlpha = 1;
      }
    }
    // curve mode: the points you placed
    if (d && d.ctrl) for (const [i, q] of d.ctrl.entries()) { c.fillStyle = i ? "#4fa3ff" : "#3ecf6a"; c.strokeStyle = "#fff"; c.lineWidth = 2 / B.s; c.beginPath(); c.arc(q[0], q[1], 6 / B.s, 0, Math.PI * 2); c.fill(); c.stroke(); }
    if (d && d.ctrl && hover && drawMode === "curve") {   // where the next bit would go
      const prev = spline([...d.ctrl.slice(-3), [hover[0], hover[1], brushW]], false);
      c.setLineDash([8 / B.s, 6 / B.s]); c.strokeStyle = "rgba(79,163,255,0.6)"; c.lineWidth = brushW / 3; c.globalAlpha = 0.5;
      c.beginPath(); prev.forEach((q, i) => (i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1]))); c.stroke(); c.setLineDash([]); c.globalAlpha = 1;
    }
    // shapes: preview inside the box being dragged
    if (drawMode === "stamp" && stampStart && S.stampEnd) {
      c.setLineDash([6 / B.s, 6 / B.s]); c.strokeStyle = "rgba(255,255,255,0.5)"; c.lineWidth = 1.5 / B.s;
      c.strokeRect(Math.min(stampStart[0], S.stampEnd[0]), Math.min(stampStart[1], S.stampEnd[1]), Math.abs(S.stampEnd[0] - stampStart[0]), Math.abs(S.stampEnd[1] - stampStart[1])); c.setLineDash([]);
      const sp = shapePts(stampShape, stampStart, S.stampEnd);
      c.strokeStyle = th.asphalt; c.lineWidth = brushW / 3; c.lineJoin = "round"; c.globalAlpha = 0.75;
      c.beginPath(); sp.forEach((q, i) => (i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1]))); c.closePath(); c.stroke(); c.globalAlpha = 1;
    }
    // rubber band for straight lines (Straight tool, or Shift while drawing)
    const rubber = (a, b) => { c.setLineDash([10 / B.s, 8 / B.s]); c.lineWidth = brushW / 3; c.strokeStyle = "rgba(255,204,31,0.35)"; c.lineCap = "round"; c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke(); c.setLineDash([]); };
    if (d && drawMode === "line" && hover) rubber(d.pts[d.pts.length - 1], snapPt(d.pts[d.pts.length - 1], hover));
    if (d && shiftAnchor && S.shiftEnd) rubber(shiftAnchor, snapPt(shiftAnchor, S.shiftEnd));
    // brush size preview under the pointer
    if (hover && S.host && S.lobby?.phase === "lobby" && !startMode && !cut && !drsMode) {
      c.strokeStyle = "rgba(255,255,255,0.7)"; c.lineWidth = 1.5 / B.s;
      c.beginPath(); c.arc(hover[0], hover[1], brushW / 6, 0, Math.PI * 2); c.stroke();
    }
    c.restore();
    c.strokeStyle = "rgba(255,255,255,0.25)"; c.lineWidth = 2; c.strokeRect(B.ox, B.oy, B.bw * B.s, B.bh * B.s);
    c.fillStyle = "rgba(255,255,255,0.5)"; c.font = "600 12px 'Chakra Petch', sans-serif"; c.textAlign = "right"; c.textBaseline = "alphabetic";
    c.fillText(`Map: ${S.lobby?.settings.map || "normal"}`, B.ox + B.bw * B.s, B.oy + B.bh * B.s + 16);
  }

  // Drawing: Freehand and Straight both add to the SAME drawing, so you can mix them:
  // drag a curvy bit, click a few straight lines, drag some more... then close the loop.
  // The width brush sets how wide the road is for whatever you draw next.
  let drawMode = "free", hover = null, drawing = false, shiftAnchor = null, startMode = false, drsMode = null;
  let stampShape = "oval", stampStart = null, snapOn = false; const redoStack = [];
  let cut = null;          // Redraw part: { a, b, flip } indexes into the track's stroke (board units)
  let brushW = 130;
  try { brushW = WIDTHS.map((x) => x[0]).includes(+localStorage.getItem("tb-brush")) ? +localStorage.getItem("tb-brush") : 130; } catch (e) {}
  S.draft = null;
  function renderBrush() {
    const box = $("brush");
    if (!box.childElementCount) for (const [wv, label] of WIDTHS) {
      const b = document.createElement("button"); b.type = "button"; b.dataset.w = wv; b.title = `${label} ([ and ] keys)`; b.setAttribute("aria-label", label); b.setAttribute("role", "radio");
      const i = document.createElement("i"); i.style.height = Math.round(wv / 26) + "px"; b.appendChild(i);
      b.addEventListener("click", () => setBrush(wv));
      box.appendChild(b);
    }
    box.querySelectorAll("button").forEach((b) => { b.setAttribute("aria-pressed", String(+b.dataset.w === brushW)); b.setAttribute("aria-checked", String(+b.dataset.w === brushW)); });
  }
  function setBrush(wv) {
    brushW = wv; renderBrush(); sfx("tick"); drawBoard();
    try { localStorage.setItem("tb-brush", String(wv)); } catch (e) {}
    boardHint(`${WIDTHS.find((x) => x[0] === wv)[1]}: whatever you draw next is this wide. Thick and thin bits blend smoothly.`, false);
  }
  renderBrush();
  const nearPx = (a, b, px) => Math.hypot(a[0] - b[0], a[1] - b[1]) * B.s < px;
  const lastPt = () => S.draft.pts[S.draft.pts.length - 1];
  // ---- extra drawing tools ----
  // smooth curve through points (Catmull-Rom). closed = loop back to the first point.
  function spline(ctrl, closed) {
    const n = ctrl.length; if (n < 2) return ctrl.map((q) => q.slice());
    const out = [], P = (i) => (closed ? ctrl[(i + n) % n] : ctrl[Math.max(0, Math.min(n - 1, i))]);
    const segs = closed ? n : n - 1;
    for (let i = 0; i < segs; i++) {
      const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
      const L = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]), m = Math.max(4, Math.ceil(L / 5));
      for (let k = 0; k < m; k++) {
        const t = k / m, t2 = t * t, t3 = t2 * t, f = (j) => 0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3);
        out.push([clamp(f(0), 0, B.bw), clamp(f(1), 0, B.bh), Math.round(p1[2] + (p2[2] - p1[2]) * t)]);
      }
    }
    if (!closed) out.push(ctrl[n - 1].slice());
    return out;
  }
  // ready-made shapes, drawn into the box you drag (x, y from -1 to 1)
  const SHAPES = {
    oval: (t) => [Math.cos(t), Math.sin(t)],
    stadium: (t) => { const c = Math.cos(t), s2 = Math.sin(t); return [Math.sign(c) * Math.min(1, Math.abs(c) * 1.6), s2]; },
    eight: (t) => [Math.sin(t), Math.sin(2 * t) * 0.9],
    bean: (t) => { const x = Math.cos(t), y = Math.sin(t); return [x, y * (0.95 - 0.55 * Math.max(0, y) * (1 - x * x))]; },
    tri: (t) => { const r = 0.82 + 0.18 * Math.cos(3 * t); return [r * Math.cos(t - Math.PI / 2), r * Math.sin(t - Math.PI / 2)]; },
    flower: (t) => { const r = 0.78 + 0.22 * Math.cos(5 * t); return [r * Math.cos(t), r * Math.sin(t)]; },
    clover: (t) => { const r = 0.62 + 0.38 * Math.cos(4 * t); return [r * Math.cos(t), r * Math.sin(t)]; },
    zigzag: null,     // made from points below
  };
  function shapePts(kind, a, b) {
    const x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]), y0 = Math.min(a[1], b[1]), y1 = Math.max(a[1], b[1]);
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, hw = (x1 - x0) / 2, hh = (y1 - y0) / 2;
    const map = ([x, y]) => [clamp(cx + x * hw, 0, B.bw), clamp(cy + y * hh, 0, B.bh), brushW];
    if (kind === "zigzag") {   // a long loop with a zigzag top edge
      const c = [[-1, 0.8], [1, 0.8], [1, -0.2], [0.6, -0.9], [0.2, -0.1], [-0.2, -0.9], [-0.6, -0.1], [-1, -0.9]].map(map);
      return spline(c, true);
    }
    const f = SHAPES[kind] || SHAPES.oval, N = 260, out = [];
    for (let i = 0; i < N; i++) out.push(map(f((i / N) * Math.PI * 2)));
    return out;
  }
  // Snap: straight lines go in 15° steps and in 25-unit lengths
  function snapPt(a, p) {
    if (!snapOn || !a) return p;
    const ang = Math.round(Math.atan2(p[1] - a[1], p[0] - a[0]) / (Math.PI / 12)) * (Math.PI / 12);
    const L = Math.max(25, Math.round(Math.hypot(p[0] - a[0], p[1] - a[1]) / 25) * 25);
    return [clamp(a[0] + Math.cos(ang) * L, 0, B.bw), clamp(a[1] + Math.sin(ang) * L, 0, B.bh)];
  }
  // change the whole finished track: rotate, flip, resize, center, road width, wiggle
  function transformTrack(kind) {
    const st = S.lobby?.stroke; if (!S.host || !st || !S.track) { boardHint("Make a track first.", true); return; }
    let pts = st.map((q) => q.slice());
    const box = () => { let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity; for (const q of pts) { a = Math.min(a, q[0]); b = Math.min(b, q[1]); c = Math.max(c, q[0]); d = Math.max(d, q[1]); } return { x0: a, y0: b, x1: c, y1: d, cx: (a + c) / 2, cy: (b + d) / 2 }; };
    let bx = box();
    const scale = (k) => { pts = pts.map((q) => [bx.cx + (q[0] - bx.cx) * k, bx.cy + (q[1] - bx.cy) * k, q[2]]); };
    if (kind === "rot") pts = pts.map((q) => [bx.cx - (q[1] - bx.cy), bx.cy + (q[0] - bx.cx), q[2]]);
    if (kind === "flipx") pts = pts.map((q) => [2 * bx.cx - q[0], q[1], q[2]]);
    if (kind === "flipy") pts = pts.map((q) => [q[0], 2 * bx.cy - q[1], q[2]]);
    if (kind === "big") scale(1.15);
    if (kind === "small") scale(1 / 1.15);
    if (kind === "center") pts = pts.map((q) => [q[0] + B.bw / 2 - bx.cx, q[1] + B.bh / 2 - bx.cy, q[2]]);
    if (kind === "wide" || kind === "narrow") { const k = kind === "wide" ? 1.15 : 1 / 1.15; pts = pts.map((q) => [q[0], q[1], clamp(Math.round(q[2] * k), 84, 260)]); }
    if (kind === "wiggle") {   // gentle S-bends along the whole lap
      const n = pts.length, cum = [0]; for (let i = 1; i < n; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
      const ph = Math.random() * 6.3;
      pts = pts.map((q, i) => { const a = pts[(i - 3 + n) % n], b = pts[(i + 3) % n], tx = b[0] - a[0], ty = b[1] - a[1], L = Math.hypot(tx, ty) || 1, o = Math.sin(cum[i] / 70 + ph) * 12; return [q[0] - (ty / L) * o, q[1] + (tx / L) * o, q[2]]; });
    }
    // keep it on the map: shrink if it got too big, then slide it back inside
    bx = box(); const m = 30, W = B.bw - 2 * m, H = B.bh - 2 * m, k = Math.min(1, W / (bx.x1 - bx.x0 || 1), H / (bx.y1 - bx.y0 || 1));
    if (k < 1) scale(k * 0.98);
    bx = box(); const dx = bx.x0 < m ? m - bx.x0 : bx.x1 > B.bw - m ? B.bw - m - bx.x1 : 0, dy = bx.y0 < m ? m - bx.y0 : bx.y1 > B.bh - m ? B.bh - m - bx.y1 : 0;
    pts = pts.map((q) => [q[0] + dx, q[1] + dy, q[2]]);
    P.steps = [];                             // (the server keeps the direction, start line, DRS zones and objects: keep)
    S.draft = null; S.lastDraft = null; updateDraftUi();
    S.preview = pts; drawBoard();            // show it right away; the server's finished track replaces it in a moment
    socket.emit("track", { stroke: pts, map: S.lobby.settings.map, keep: true });
    boardHint({ rot: "Rotated!", flipx: "Flipped left to right!", flipy: "Flipped upside down!", big: "Bigger!", small: "Smaller!", center: "Centered on the map!", wide: "Wider road!", narrow: "Narrower road!", wiggle: "Added some wiggles! (hit it again for more)" }[kind], false);
  }
  function addStraight(p) {
    const a = lastPt(); p = snapPt(a, p); const L = Math.hypot(p[0] - a[0], p[1] - a[1]), n = Math.max(1, Math.ceil(L / 8));
    for (let k = 1; k <= n; k++) S.draft.pts.push([a[0] + (p[0] - a[0]) * (k / n), a[1] + (p[1] - a[1]) * (k / n), brushW]);
  }
  const markCorner = () => S.draft.corners.push(S.draft.pts.length - 1);
  function draftLen(pts = S.draft.pts) { let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return L; }
  // The host's drawing goes out live, 20 times a second. Usually just the new bit of the line
  // (from: where it carries on); the whole thing again if they undid or changed something.
  let draftSentAt = 0, draftTimer = null, sent = [], sentMsgs = 0;
  function shareDraft() {
    if (!S.host) return;
    const send = () => {
      draftTimer = null; draftSentAt = performance.now();
      const P = S.draft?.pts;
      if (!P) { sent = []; socket.emit("draft", null); return; }
      const pts = P.map((q) => [Math.round(q[0]), Math.round(q[1]), q[2]]), n = sent.length, lastSame = n && pts.length >= n && pts[n - 1][0] === sent[n - 1][0] && pts[n - 1][1] === sent[n - 1][1];
      if (lastSame && pts.length === n) return;
      const full = !lastSame || ++sentMsgs % 40 === 0;       // (a full copy now and then, just in case)
      socket.emit("draft", { from: full ? 0 : n, pts: full ? pts : pts.slice(n) });
      sent = pts;
    };
    if (!S.draft) { clearTimeout(draftTimer); send(); return; }
    if (!draftTimer) draftTimer = setTimeout(send, Math.max(0, 50 - (performance.now() - draftSentAt)));
  }
  socket.on("draft", (d) => {
    if (!d) S.hostDraft = null;
    else if (Array.isArray(d)) S.hostDraft = d;
    else if (d.from === 0) { const was = S.hostDraft; S.hostDraft = d.pts; if (!was || was.length > d.pts.length) S.hostShown = d.pts.length; }
    else if (S.hostDraft && d.from === S.hostDraft.length) S.hostDraft.push(...d.pts);
    else return;                                            // missed a bit: the next full copy fixes it
    if (!S.hostDraft) S.hostShown = 0;
    if (!S.host && S.screen === "lobby") { if (S.hostDraft) boardHint(`${S.lobby?.players.find((p) => p.id === S.lobby.hostId)?.name || "The host"} is drawing the track...`, false); drawBoard(); }
  });
  function updateDraftUi() {
    shareDraft();
    $("undoPt").classList.add("hidden");               // (one Undo button now: #trackUndo, for everything)
    if (typeof refreshUndo === "function") refreshUndo();
    $("closeLoop").classList.toggle("hidden", !S.draft || S.draft.pts.length < 3);
    if (typeof updateRedo === "function" && $("redoPt")) updateRedo();
  }
  function hintDraft() {
    if (drawMode === "curve") return boardHint("Keep clicking to add points. Click the first point (or Finish loop) to close it smoothly.", false);
    boardHint(drawMode === "line" ? (isTouch() ? "Tap to add straight lines. Tap the green dot (or Finish loop) to close it." : "Click to add straight lines. Click the green dot (or Finish loop) to close it.") : "Keep going: drag for curves, or switch to Straight. Come back to the green dot (or Finish loop) to close it.", false);
  }
  // round off the corners where straight lines meet, so cars can actually drive them
  function roundDraftCorners(pts, corners) {
    const n = pts.length, cum = [0];
    for (let i = 1; i < n; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const cs = [...new Set(corners)].filter((i) => i > 0 && i < n - 1).sort((a, b) => a - b);
    const plan = cs.map((v, k) => {
      const prev = k ? cs[k - 1] : 0, next = k < cs.length - 1 ? cs[k + 1] : n - 1;
      const r = Math.min(70, (cum[v] - cum[prev]) * 0.45, (cum[next] - cum[v]) * 0.45);
      let a = v, b = v;
      while (a > 0 && cum[v] - cum[a] < r) a--;
      while (b < n - 1 && cum[b] - cum[v] < r) b++;
      return { v, a, b, r };
    });
    for (const { v, a, b, r } of plan.reverse()) {
      if (r < 3 || b - a < 2) continue;
      const A = pts[a], V = pts[v], Bp = pts[b], m = Math.max(6, Math.ceil((r * 2) / 6)), curve = [];
      for (let k = 0; k <= m; k++) {
        const t = k / m, u = 1 - t;
        curve.push([u * u * A[0] + 2 * u * t * V[0] + t * t * Bp[0], u * u * A[1] + 2 * u * t * V[1] + t * t * Bp[1], Math.round(A[2] + (Bp[2] - A[2]) * t)]);
      }
      pts.splice(a, b - a + 1, ...curve);
    }
    return pts;
  }
  function finishDraft() {
    const d = S.draft;
    if (d && d.ctrl && d.base === 0 && d.ctrl.length >= 3) { d.pts = spline(d.ctrl, true); d.corners = []; }
    if (!d || d.pts.length < 3 || draftLen() < 150) { boardHint("Draw a bit more first!", true); return; }
    let pts = d.pts.map((q) => q.slice());
    if (d.cut && d.keep) {   // after a redraw: put the direction and the start line back where they were
      P.steps = [];
      if (d.keep.reverse) P.steps.push(() => socket.emit("reverse"));
      if (d.keep.start) P.steps.push(() => socket.emit("setStart", { x: d.keep.start[0], y: d.keep.start[1] }));
    }
    // remember the drawing, so Undo after finishing brings it back without the join
    // (the auto-filled bit, or the stroke you closed it with)
    const gapPx = Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) * B.s;
    S.lastDraft = { d: JSON.parse(JSON.stringify(d)), autoFill: gapPx > 30 };
    if (!d.corners.length && gapPx > 30) {
      // freehand: join the gap with a smooth curve here (so it's exactly what Undo takes away)
      const a = pts[pts.length - 1], b = pts[0], a0 = pts[Math.max(0, pts.length - 4)], b1 = pts[Math.min(3, pts.length - 1)];
      const D = Math.hypot(b[0] - a[0], b[1] - a[1]) * 1.1;
      const na = Math.hypot(a[0] - a0[0], a[1] - a0[1]) || 1, nb = Math.hypot(b1[0] - b[0], b1[1] - b[1]) || 1;
      const ta = [((a[0] - a0[0]) / na) * D, ((a[1] - a0[1]) / na) * D], tb = [((b1[0] - b[0]) / nb) * D, ((b1[1] - b[1]) / nb) * D];
      const m = Math.max(4, Math.ceil(D / 4));
      for (let k = 1; k < m; k++) {
        const t = k / m, t2 = t * t, t3 = t2 * t, h1 = 2 * t3 - 3 * t2 + 1, h2 = t3 - 2 * t2 + t, h3 = -2 * t3 + 3 * t2, h4 = t3 - t2;
        pts.push([h1 * a[0] + h2 * ta[0] + h3 * b[0] + h4 * tb[0], h1 * a[1] + h2 * ta[1] + h3 * b[1] + h4 * tb[1], Math.round(a[2] + (b[2] - a[2]) * t)]);
      }
    }
    if (d.corners.length) {
      // close with a straight line back to the start, then round every corner (the joins at the start too)
      let corners = d.corners.slice();
      if (!nearPx(pts[pts.length - 1], pts[0], 6)) {
        corners.push(pts.length - 1);
        const a = pts[pts.length - 1], b = pts[0], L = Math.hypot(b[0] - a[0], b[1] - a[1]), m = Math.max(1, Math.ceil(L / 8));
        for (let k = 1; k < m; k++) pts.push([a[0] + (b[0] - a[0]) * (k / m), a[1] + (b[1] - a[1]) * (k / m), Math.round(a[2] + (b[2] - a[2]) * (k / m))]);
      }
      corners.push(0);
      // start the loop in the middle of the longest stretch between corners, so no corner sits on the join
      const n = pts.length, cs = [...new Set(corners.map((i) => ((i % n) + n) % n))].sort((a, b) => a - b);
      let bestGap = -1, start = 0;
      cs.forEach((ci, k) => { const nx = k < cs.length - 1 ? cs[k + 1] : cs[0] + n, gap = nx - ci; if (gap > bestGap) { bestGap = gap; start = (ci + Math.floor(gap / 2)) % n; } });
      pts = [...pts.slice(start), ...pts.slice(0, start)];
      pts = roundDraftCorners(pts, cs.map((i) => (i - start + n) % n));
    }
    S.draft = null; drawing = false; updateDraftUi();
    socket.emit("track", { stroke: pts.map((q) => [Math.round(q[0] * 10) / 10, Math.round(q[1] * 10) / 10, q[2]]), map: S.lobby.settings.map });
    boardHint("Building track...", false); drawBoard();
  }
  document.querySelectorAll("[data-dm]").forEach((b) => b.addEventListener("click", () => {
    drawMode = b.dataset.dm;
    document.querySelectorAll("[data-dm]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    $("stampPick").classList.toggle("hidden", drawMode !== "stamp"); requestAnimationFrame(sizeBoard);
    const MH = { curve: "Click points and the road curves smoothly through them. Click the first point (or Finish loop) to close it.", mirror: "Draw HALF a track, starting and ending near the dashed middle line. Let go and you get the other half mirrored.", stamp: "Pick a shape, then drag a box on the board to drop it in." };
    if (MH[drawMode] && !(S.draft && drawMode === "curve")) boardHint(MH[drawMode], false);
    else if (S.draft) hintDraft();
    else boardHint(drawMode === "line" ? (isTouch() ? "Tap to place corners. You can switch back to Freehand any time." : "Click to place corners. You can switch back to Freehand any time.") : (isTouch() ? "Draw your track in one loop with your finger. Tap Straight for straight lines." : "Draw your track in one loop. Hold Shift for straight lines."), false);
    drawBoard();
  }));
  function undoDraft() {
    if (!S.draft && S.lastDraft && S.host && S.lobby?.phase === "lobby") {
      // undo after finishing: the drawing comes back, minus the join
      const { d, autoFill } = S.lastDraft; S.lastDraft = null;
      S.draft = d;
      if (!autoFill) { const at = d.pieces.pop(); if (at) { d.pts.length = at; d.corners = d.corners.filter((i) => i < at); } }
      boardHint(autoFill ? "The auto-filled bit is gone. Draw the join yourself (or Finish loop again)." : "Your last stroke is gone. Keep drawing!", false);
      updateDraftUi(); drawBoard(); return;
    }
    const d = S.draft; if (!d) return;
    if (d.ctrl) {                                  // curve: take the last point off
      redoStack.push({ ctrl: d.ctrl.pop() });
      if (d.ctrl.length <= (d.base === 0 ? 0 : 1)) { if (d.base === 0) S.draft = null; else { d.pts.length = d.base + 1; delete d.ctrl; } }
      else d.pts = d.pts.slice(0, d.base).concat(spline(d.ctrl, false));
      updateDraftUi(); updateRedo(); drawBoard(); return;
    }
    const at = d.pieces.pop();
    if (at !== undefined && at > 0) redoStack.push({ at, pts: d.pts.slice(at), corners: d.corners.filter((i) => i >= at) });
    if (at === undefined || (!at && !d.cut)) { S.draft = null; if (d.cut) boardHint("Redraw cancelled: your old track is back.", false); }
    else { d.pts.length = at; d.corners = d.corners.filter((i) => i < at); }
    updateDraftUi(); drawBoard();
  }
  $("undoPt").addEventListener("click", undoDraft);
  // ---- Undo anything in the drawing phase: the track as it was before every change is kept (last 30) ----
  // Every message that changes the track is noticed on its way out; the track before it is saved first.
  const UNDO = { stack: [], redo: [], restoring: false, quiet: false };
  const TRACK_EVENTS = new Set(["track", "randomTrack", "f1Track", "clearTrack", "reverse", "setStart", "totw:load", "track:load", "drs:add", "drs:set", "drs:clear", "drs:auto"]);
  const snapTrack = () => (S.track && S.lobby?.stroke ? currentPreset("your last track") : { empty: true });
  const sameSnap = (a, b) => !!a && !!b && (a.empty ? b.empty : !b.empty && JSON.stringify([a.stroke, a.start, a.reverse, a.drs, a.smooth]) === JSON.stringify([b.stroke, b.start, b.reverse, b.drs, b.smooth]));
  {
    const rawEmit = socket.emit.bind(socket);
    socket.emit = (ev, ...args) => {
      const changes = TRACK_EVENTS.has(ev) || (ev === "settings" && args[0] && typeof args[0] === "object" && ("smooth" in args[0] || "map" in args[0]));
      if (changes && S.host && S.lobby?.phase === "lobby" && !UNDO.restoring && !UNDO.quiet) {
        const snap = snapTrack();
        if (!sameSnap(snap, UNDO.stack[UNDO.stack.length - 1])) { UNDO.stack.push(snap); if (UNDO.stack.length > 30) UNDO.stack.shift(); }
        UNDO.redo = [];                                   // (a new change: what you undid can't come back any more)
        if (ev !== "track") S.lastDraft = null;          // (a finished drawing can only be "un-finished" right after)
        refreshUndo();
      }
      return rawEmit(ev, ...args);
    };
  }
  function refreshUndo() {
    const lobby = S.host && S.lobby?.phase === "lobby", canRedo = lobby && ((!!S.draft && redoStack.length > 0) || (!S.draft && UNDO.redo.length > 0));
    const can = lobby && (!!S.draft || !!S.lastDraft || UNDO.stack.length > 0 || canRedo);
    $("undoTools").classList.toggle("hidden", !can);
    $("trackRedo").classList.toggle("hidden", !canRedo);
  }
  function undoAnything() {
    if (!S.host || S.lobby?.phase !== "lobby") return;
    if (cut) { endCut(); boardHint("", false); return; }
    if (S.draft || S.lastDraft) { undoDraft(); refreshUndo(); return; }
    // the track before the last change (skipping any that look the same as now)
    let snap = UNDO.stack.pop(); const now = snapTrack();
    while (snap && sameSnap(snap, now)) snap = UNDO.stack.pop();
    if (!snap) { boardHint("Nothing to undo.", true); refreshUndo(); return; }
    // (putting it back isn't a new change: quiet until the server has rebuilt it, start line, direction and all)
    UNDO.redo.push(now); if (UNDO.redo.length > 30) UNDO.redo.shift();
    if (snap.empty) { UNDO.quiet = true; socket.emit("clearTrack"); UNDO.quiet = false; boardHint("Undone: the track is cleared again.", false); }
    else { UNDO.restoring = true; clearTimeout(UNDO.safety); UNDO.safety = setTimeout(() => (UNDO.restoring = false), 8000); loadPreset(snap); boardHint("↩️ Undone!", false); }
    sfx("tick"); refreshUndo();
  }
  $("trackUndo").addEventListener("click", undoAnything);
  // Redo: whatever you just undid comes back (a drawing piece while drawing, otherwise the whole track as it was)
  function redoAnything() {
    if (!S.host || S.lobby?.phase !== "lobby") return;
    if (S.draft) { if (redoStack.length) redoDraft(); refreshUndo(); return; }
    const snap = UNDO.redo.pop(); if (!snap) { boardHint("Nothing to redo.", true); refreshUndo(); return; }
    UNDO.stack.push(snapTrack()); if (UNDO.stack.length > 30) UNDO.stack.shift();
    if (snap.empty) { UNDO.quiet = true; socket.emit("clearTrack"); UNDO.quiet = false; }
    else { UNDO.restoring = true; clearTimeout(UNDO.safety); UNDO.safety = setTimeout(() => (UNDO.restoring = false), 8000); loadPreset(snap); }
    boardHint("↪️ Redone!", false); sfx("tick"); refreshUndo();
  }
  $("trackRedo").addEventListener("click", redoAnything);
  socket.on("joined", () => {
    if (S.pendingGhost) { const c = S.pendingGhost; S.pendingGhost = null; setTimeout(() => socket.emit("ghost:load", c), 300); }
    if (S.pendingTour) { S.pendingTour = false; setTimeout(() => socket.emit("tour:load"), 300); }
  });
  $("predictBtn").addEventListener("click", () => socket.emit("predict:list"));
  socket.on("predictList", (d) => {
    const box = $("predictBox"), list = $("predictCars"); list.textContent = "";
    if (!d) return;
    box.classList.remove("hidden");
    $("predictNote").textContent = d.mine ? `You picked ${d.mine.name}: 🪙 ${d.mine.coins} at ${d.mine.odds}x` : d.open ? "Who wins? Pay-outs by grid position: the further back, the more you win." : "Predictions are closed for this race.";
    for (const c of d.cars) {
      const b = el("button", "btn predict-car"); b.type = "button"; b.disabled = !d.open || !!d.mine;
      const dot = el("span", "dot"); dot.style.background = c.color; b.append(dot, el("b", "", `P${c.grid} ${c.name}`), el("small", "", `${c.odds}x`));
      b.addEventListener("click", () => { const coins = Math.floor(Number($("predictCoins").value) || 0); socket.emit("predict", { car: c.id, coins }); });
      list.appendChild(b);
    }
  });
  socket.on("predictOk", (d) => { $("predictBox").classList.add("hidden"); popup(`🎲 ${d.coins} on ${d.name} at ${d.odds}x: win ${d.win.toLocaleString()} if they do it!`); });
  $("predictClose").addEventListener("click", () => $("predictBox").classList.add("hidden"));
  socket.on("ghostChallenge", (g) => { S.challenge = g; boardHint(`👻 ${g.from}'s lap: ${g.t.toFixed(3)}s. Press Start, then beat their ghost!`, false); });
  socket.on("joined", () => { UNDO.stack = []; UNDO.redo = []; UNDO.restoring = false; refreshUndo(); });
  socket.on("trackResult", (r) => { if (UNDO.restoring && (r.error || !P.steps.length)) { UNDO.restoring = false; clearTimeout(UNDO.safety); } });
  socket.on("lobby", () => refreshUndo());
  function updateRedo() { $("redoPt").classList.toggle("hidden", !redoStack.length || !S.draft); if (typeof refreshUndo === "function") refreshUndo(); }
  function redoDraft() {
    const r = redoStack.pop(), d = S.draft; if (!r || !d) return;
    if (r.ctrl && d.ctrl) { d.ctrl.push(r.ctrl); d.pts = d.pts.slice(0, d.base).concat(spline(d.ctrl, false)); }
    else if (r.pts) { d.pieces.push(r.at); d.pts.length = r.at; d.pts.push(...r.pts); d.corners.push(...r.corners); }
    updateDraftUi(); updateRedo(); drawBoard();
  }
  $("redoPt").addEventListener("click", redoDraft);
  // shapes, snap, whole-track edits
  document.querySelectorAll("[data-shape]").forEach((b) => b.addEventListener("click", () => {
    stampShape = b.dataset.shape; document.querySelectorAll("[data-shape]").forEach((x) => x.classList.toggle("on", x === b));
    boardHint(`Drag a box on the board to drop in a ${b.textContent.trim().toLowerCase()}.`, false);
  }));
  $("snapBtn").addEventListener("click", () => { snapOn = !snapOn; $("snapBtn").setAttribute("aria-pressed", String(snapOn)); $("snapBtn").classList.toggle("on", snapOn); boardHint(snapOn ? "Snap on: straight lines go in 15° steps (Straight tool, or Shift while drawing)." : "Snap off.", false); drawBoard(); });
  $("moreBtn").addEventListener("click", () => { const open = $("moreTools").classList.toggle("hidden") === false; $("moreBtn").setAttribute("aria-expanded", String(open)); $("moreBtn").classList.toggle("on", open); requestAnimationFrame(sizeBoard); });
  document.querySelectorAll("[data-tf]").forEach((b) => b.addEventListener("click", () => (b.dataset.tf === "wide" || b.dataset.tf === "narrow" ? startWidthPick(b.dataset.tf) : transformTrack(b.dataset.tf))));
  $("closeLoop").addEventListener("click", finishDraft);
  document.querySelectorAll("[data-decor]").forEach((b) => b.addEventListener("click", () => {
    if (!S.host) return;
    S.decorTool = S.decorTool === b.dataset.decor ? null : b.dataset.decor; S.decorStart = null;
    document.querySelectorAll("[data-decor]").forEach((x) => x.classList.toggle("on", x.dataset.decor === S.decorTool));
    if (S.decorTool) boardHint({ stand: "🏟️ Click beside the track where the grandstand starts (on that side), then where it ends.", banner: "🎌 Click on the track for a banner arch over it.", tunnel: "🚇 Click on the track where the tunnel starts, then where it ends.", bridge: "🌉 Click on the track for a bridge over it." }[S.decorTool], false);
  }));
  $("decorUndo").addEventListener("click", () => S.host && socket.emit("decor:undo"));
  $("decorClear").addEventListener("click", () => S.host && socket.emit("decor:clear"));
  $("startLineBtn").addEventListener("click", () => {
    if (!S.track) { boardHint("Draw a track first.", true); return; }
    endCut(); endDrs(); startMode = !startMode; $("startLineBtn").classList.toggle("on", startMode);
    boardHint(startMode ? "Click anywhere on the track to put the start/finish line there." : "", false);
  });
  $("reverseBtn").addEventListener("click", () => { if (S.track) socket.emit("reverse"); else boardHint("Draw a track first.", true); });
  // DRS zones: click where one starts, then where it ends (in the racing direction)
  function endDrs() { drsMode = null; $("drsBtn")?.classList.remove("on"); }
  $("drsBtn").addEventListener("click", () => {
    if (!S.track) { boardHint("Draw a track first.", true); return; }
    if (drsMode) { endDrs(); boardHint("", false); drawBoard(); return; }
    endCut(); startMode = false; $("startLineBtn").classList.remove("on");
    drsMode = { a: null }; $("drsBtn").classList.add("on");
    boardHint("Click on the track where the DRS zone starts (going the way the arrows point).", false);
  });
  $("drsAutoBtn").addEventListener("click", () => { if (S.track) { endDrs(); socket.emit("drs:auto"); } else boardHint("Draw a track first.", true); });
  $("drsClearBtn").addEventListener("click", () => { if (S.track) { endDrs(); socket.emit("drs:clear"); } else boardHint("Draw a track first.", true); });
  // ---- Phone mode: the board in the room is only a preview (swipe over it to scroll). Tapping it
  // (or "Draw the track") opens a full-screen editor: big board on top, all the tools below, Done.
  var editing = false;       // (var: show() can run before this line on startup)
  function phoneMode() { return document.body.classList.contains("phone"); }
  function setEditing(on) {
    on = !!(on && S.host && S.lobby?.phase === "lobby");
    if (on === !!editing) return;
    editing = on;
    document.body.classList.toggle("editing-track", on);
    if (!on) { if (drawing) { drawing = false; } if (cut) endCut(); }
    else boardHint(S.track ? "Draw a new track, or use the track tools. Tap Done when you're happy." : "Draw your track in one loop with your finger. Tap Done when you're happy.", false);
    requestAnimationFrame(sizeBoard);
  }
  // ---- saved tracks (presets): kept in this browser, and on your account when signed in ----
  const P = { list: [], steps: [] };
  function localPresets() { try { return JSON.parse(localStorage.getItem("tb-presets") || "[]"); } catch (e) { return []; } }
  function storeLocal(list) { try { localStorage.setItem("tb-presets", JSON.stringify(list)); } catch (e) { popup("This browser is out of space for saved tracks", true); } }
  function mergePresets(a, b) { const m = new Map(); for (const x of [...a, ...b]) { const k = x.name.toLowerCase(), o = m.get(k); if (!o || (x.saved || 0) > (o.saved || 0)) m.set(k, x); } return [...m.values()].sort((x, y) => (y.saved || 0) - (x.saved || 0)); }
  P.list = localPresets();
  socket.on("presets", (list) => {
    if (!list) return;
    const merged = mergePresets(P.list, list);
    // anything only this browser had goes up to the account too
    for (const x of merged) if (!list.some((y) => y.name.toLowerCase() === x.name.toLowerCase() && (y.saved || 0) >= (x.saved || 0))) socket.emit("presets:save", x);
    P.list = merged; storeLocal(merged);
    if (!$("presetBox").classList.contains("hidden")) renderPresets();
  });
  // ---- setting presets: every race setting in one go (saved like tracks: this browser + your account) ----
  const SP = { list: (() => { try { return JSON.parse(localStorage.getItem("tb-setpresets") || "[]"); } catch (e) { return []; } })() };
  const storeSP = (list) => { try { localStorage.setItem("tb-setpresets", JSON.stringify(list)); } catch (e) {} };
  const SET_KEYS = ["laps", "ai", "aiLevel", "quali", "points", "teamColors", "teams", "season", "smooth", "xpRate", "weather", "theme", "speed", "wear", "map", "safetyCar", "drs", "reverseGrid"];
  socket.on("setPresets", (list) => {
    if (!list) return;
    const merged = mergePresets(SP.list, list);
    for (const x of merged) if (!list.some((y) => y.name.toLowerCase() === x.name.toLowerCase() && (y.saved || 0) >= (x.saved || 0))) socket.emit("setPresets:save", x);
    SP.list = merged; storeSP(merged);
    if (!$("setPresetBox").classList.contains("hidden")) renderSetPresets();
  });
  const WEATHER_TXT = { sunny: "☀ Sunny", rain: "🌧 Rain", dynamic: "⛅ Dynamic", fog: "🌫 Fog" };
  const spSummary = (s) => [`${s.laps ?? "?"} laps`, `${s.ai ?? 0} AI (${s.aiLevel || "medium"})`, s.quali ? `${s.quali} min quali` : null, WEATHER_TXT[s.weather], s.speed > 1 ? `${s.speed}x speed` : null, s.season ? `${s.season}-race season` : null, s.teams === false ? "no teams" : null, s.theme].filter(Boolean).join(" · ");
  function renderSetPresets() {
    const canEdit = S.host && S.lobby?.phase === "lobby";
    $("setPresetSaveBtn").disabled = !S.lobby; $("setPresetName").disabled = !S.lobby;
    $("setPresetNote").textContent = (!S.host ? "Only the host can load settings, but you can save the ones this room uses. " : "") + (A.user ? "Saved to your account and this browser." : "Saved in this browser. Make an account to have them on other devices too.");
    const g = $("setPresetGrid"); g.textContent = "";
    if (!SP.list.length) { g.appendChild(el("p", "preset-note", "No saved settings yet. Set up the race settings the way you like them, name it and hit Save.")); return; }
    for (const pr of SP.list) {
      const row = el("div", "set-preset"), info = el("div", "info");
      info.append(el("b", "", pr.name), el("small", "", spSummary(pr.settings)));
      const ld = el("button", "btn go", "Load"); ld.type = "button"; ld.disabled = !canEdit;
      ld.addEventListener("click", () => { socket.emit("settings", pr.settings); $("setPresetBox").classList.add("hidden"); popup(`Loaded "${pr.name}"`); sfx("tick"); });
      const del = el("button", "btn ghost", "Delete"); del.type = "button";
      del.addEventListener("click", () => {
        if (del.dataset.sure !== "1") { del.dataset.sure = "1"; del.textContent = "Sure?"; setTimeout(() => { del.dataset.sure = ""; del.textContent = "Delete"; }, 2500); return; }
        SP.list = SP.list.filter((x) => x !== pr); storeSP(SP.list); if (A.user) socket.emit("setPresets:delete", pr.name); renderSetPresets();
      });
      row.append(info, ld, del); g.appendChild(row);
    }
  }
  $("setPresetBtn").addEventListener("click", () => { $("setPresetBox").classList.remove("hidden"); renderSetPresets(); setTimeout(() => $("setPresetName").focus(), 50); });
  $("setPresetClose").addEventListener("click", () => $("setPresetBox").classList.add("hidden"));
  $("setPresetBox").addEventListener("click", (e) => { if (e.target.id === "setPresetBox") $("setPresetBox").classList.add("hidden"); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("setPresetBox").classList.contains("hidden")) $("setPresetBox").classList.add("hidden"); });
  $("setPresetForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const name = $("setPresetName").value.trim().slice(0, 30);
    if (!name) { $("setPresetName").focus(); return; }
    if (!S.lobby) return;
    const st = S.lobby.settings, settings = {};
    for (const k of SET_KEYS) if (st[k] !== undefined) settings[k] = st[k];
    const pr = { name, settings, saved: Date.now() };
    SP.list = mergePresets(SP.list.filter((x) => x.name.toLowerCase() !== name.toLowerCase()), [pr]); storeSP(SP.list);
    if (A.user) socket.emit("setPresets:save", pr);
    $("setPresetName").value = ""; popup(`Saved "${name}"!`); sfx("level"); renderSetPresets();
  });
  function openPresets() {
    $("presetBox").classList.remove("hidden");
    $("presetName").value = S.track?.name || "";
    renderPresets(); setTimeout(() => $("presetName").focus(), 50);
  }
  function renderPresets() {
    const canSave = S.host && S.lobby?.phase === "lobby" && S.track && S.lobby?.stroke;
    $("presetSaveBtn").disabled = !canSave; $("presetName").disabled = !canSave;
    $("presetNote").textContent = !S.host ? "Only the host can load tracks, but you can look." : !S.track ? "Draw a track (or roll a random one) to save it." : A.user ? "Saved to your account and this browser, so updates never delete them." : "Saved in this browser (updates never delete them). Make an account to have them on other devices too.";
    const g = $("presetGrid"); g.textContent = "";
    if (!P.list.length) { g.appendChild(el("p", "preset-note", "No saved tracks yet. Make one you love, give it a name and hit Save.")); return; }
    for (const pr of P.list) {
      const card = el("div", "preset");
      const cv = document.createElement("canvas"); cv.width = 240; cv.height = 140; cv.setAttribute("role", "img"); cv.setAttribute("aria-label", `Outline of the saved track ${pr.name}`);
      const c = cv.getContext("2d"), xs = pr.stroke.map((q) => q[0]), ys = pr.stroke.map((q) => q[1]);
      const mnx = Math.min(...xs), mxx = Math.max(...xs), mny = Math.min(...ys), mxy = Math.max(...ys), sc = Math.min(220 / (mxx - mnx || 1), 120 / (mxy - mny || 1));
      c.lineJoin = c.lineCap = "round"; c.strokeStyle = "#ffcc1f"; c.lineWidth = 5; c.beginPath();
      pr.stroke.forEach((q, i) => { const x = 120 + (q[0] - (mnx + mxx) / 2) * sc, y = 70 + (q[1] - (mny + mxy) / 2) * sc; i ? c.lineTo(x, y) : c.moveTo(x, y); }); c.closePath(); c.stroke();
      if (pr.start) { c.fillStyle = "#fff"; c.beginPath(); c.arc(120 + (pr.start[0] - (mnx + mxx) / 2) * sc, 70 + (pr.start[1] - (mny + mxy) / 2) * sc, 5, 0, Math.PI * 2); c.fill(); }
      card.append(cv, el("b", "", pr.name), el("small", "", `${pr.map} map${pr.reverse ? " · reversed" : ""} · ${new Date(pr.saved).toLocaleDateString()}`));
      const row = el("div", "row");
      const ld = el("button", "btn go", "Load"); ld.type = "button"; ld.disabled = !S.host || S.lobby?.phase !== "lobby";
      ld.addEventListener("click", () => loadPreset(pr));
      const del = el("button", "btn ghost", "Delete"); del.type = "button"; del.style.flex = "0 0 auto";
      del.addEventListener("click", () => {
        if (del.dataset.sure !== "1") { del.dataset.sure = "1"; del.textContent = "Sure?"; setTimeout(() => { del.dataset.sure = ""; del.textContent = "Delete"; }, 2500); return; }
        P.list = P.list.filter((x) => x !== pr); storeLocal(P.list); if (A.user) socket.emit("presets:delete", pr.name); renderPresets();
      });
      row.append(ld, del); card.appendChild(row); g.appendChild(card);
    }
  }
  function currentPreset(name) {
    const T = S.track, p0 = T.pts[0];
    return { name, stroke: S.lobby.stroke, map: S.lobby.settings.map, smooth: !!S.lobby.settings.smooth, theme: S.lobby.settings.theme, reverse: !!T.reverse,
      start: [T.minX + (p0.x - T.pad) / T.scale, T.minY + (p0.y - T.pad) / T.scale], saved: Date.now(),
      drs: (T.drs || []).map((z) => { const b = (i) => { const q = T.pts[i % T.N]; return [T.minX + (q.x - T.pad) / T.scale, T.minY + (q.y - T.pad) / T.scale]; }; return [...b(z.from), ...b(z.from + z.len)]; }) };
  }
  $("presetForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const name = $("presetName").value.trim().slice(0, 30);
    if (!name) { $("presetName").focus(); return; }
    if (!S.track || !S.lobby?.stroke) return;
    const pr = currentPreset(name);
    P.list = mergePresets(P.list.filter((x) => x.name.toLowerCase() !== name.toLowerCase()), [pr]); storeLocal(P.list);
    if (A.user) socket.emit("presets:save", pr);
    popup(`Saved "${name}"!`); sfx("level"); renderPresets();
  });
  function loadPreset(pr) {
    if (!S.host) return;
    const st = S.lobby.settings;
    if (!!st.smooth !== !!pr.smooth || (pr.theme && pr.theme !== st.theme)) socket.emit("settings", { smooth: !!pr.smooth, ...(pr.theme ? { theme: pr.theme } : {}) });
    endCut(); S.draft = null; S.lastDraft = null; updateDraftUi();
    // after it's built: turn it round if it was reversed, then put the start line back
    P.steps = []; if (pr.reverse) P.steps.push(() => socket.emit("reverse")); if (pr.start) P.steps.push(() => socket.emit("setStart", { x: pr.start[0], y: pr.start[1] }));
    if (Array.isArray(pr.drs)) P.steps.push(() => socket.emit("drs:set", pr.drs));
    P.loading = pr.name;
    setTimeout(() => socket.emit("track", { stroke: pr.stroke, map: pr.map }), pr.smooth !== !!st.smooth ? 250 : 0);
    $("presetBox").classList.add("hidden"); boardHint(`Loading "${pr.name}"...`, false);
  }
  $("presetBtn").addEventListener("click", openPresets);
  $("presetClose").addEventListener("click", () => $("presetBox").classList.add("hidden"));
  $("presetBox").addEventListener("click", (e) => { if (e.target.id === "presetBox") $("presetBox").classList.add("hidden"); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("presetBox").classList.contains("hidden")) $("presetBox").classList.add("hidden"); });
  $("lastSeasonBtn").addEventListener("click", () => { if (S.lastSeason) openFinale(S.lastSeason); else socket.emit("lastSeason"); });
  // quick emotes
  S.emotes = new Map();
  document.querySelectorAll("[data-emote]").forEach((b) => b.addEventListener("click", () => {
    socket.emit("emote", b.dataset.emote);
    document.querySelectorAll("[data-emote]").forEach((x) => { x.disabled = true; setTimeout(() => (x.disabled = false), 1500); });
  }));
  // a "GG" bubble that floats up the results screen
  function ggFloat(name) {
    const b = el("div", "gg-float"); b.append(el("b", "", "GG"), el("small", "", String(name).slice(0, 16)));
    b.style.left = 10 + Math.random() * 80 + "%"; document.body.appendChild(b); setTimeout(() => b.remove(), 2600);
  }
  // results: one tap to say GG to everyone in the room
  $("ggBtn").addEventListener("click", () => { socket.emit("emote", "GG"); $("ggBtn").disabled = true; $("ggBtn").textContent = "🤝 GG sent!"; });
  socket.on("results", () => { $("ggBtn").disabled = false; $("ggBtn").textContent = "🤝 GG"; });
  socket.on("emote", (m) => {
    if (localBlocked().includes(String(m.name).toLowerCase())) return;       // blocked: you don't see their emotes
    if (m.car && S.screen === "race") S.emotes.set(m.car, { e: m.e, until: performance.now() + 2600 });
    else if (m.e === "GG" && S.screen === "results") ggFloat(m.pid === S.me ? "You" : m.name);
    else popup(`${m.name}: ${m.e}`);
    if (m.pid !== S.me) sfx("tick");
  });
  // daily login reward
  // login streak: a 7-day strip of daily bonuses (day 7 = coins, a crate and a wheel spin)
  function streakStrip(days, cycleDay, today) {
    const row = el("div", "streak-strip");
    (days || []).forEach((r, i) => {
      const d = i + 1, cls = d < cycleDay || (d === cycleDay && today) ? " got" : d === cycleDay + (today ? 1 : 0) || (!cycleDay && d === 1) ? " next" : "";
      const b = el("div", "streak-day" + cls + (d === 7 ? " big" : ""));
      b.append(el("small", "", `Day ${d}`), el("b", "", d === 7 ? "🎁" : "🪙"), el("span", "", `${r.coins}${r.crate ? " + crate" : ""}${r.spins ? " + 🎡" : ""}`));
      row.appendChild(b);
    });
    return row;
  }
  socket.on("daily", (d) => {
    banner(`DAILY BONUS +${d.coins} 🪙`, "#ffcc1f"); sfx("level");
    const box = el("div", "streak-pop"); box.setAttribute("role", "dialog"); box.setAttribute("aria-label", "Daily bonus");
    box.append(el("b", "streak-h", d.streak > 1 ? `🔥 ${d.streak}-day streak!` : "🔥 Day 1 of your streak"),
      streakStrip(d.days, d.cycleDay, true),
      el("p", "", d.cycleDay === 7 ? `Day 7! +${d.coins} coins${d.crate ? `, a ${d.crate} crate` : ""}${d.spins ? " and a wheel spin" : ""}. The cycle starts again tomorrow.` : `+${d.coins} coins today. Come back tomorrow for day ${d.cycleDay + 1}: miss a day and it starts again.`));
    const ok = el("button", "btn go", "Nice!"); ok.type = "button"; ok.addEventListener("click", () => box.remove()); box.appendChild(ok);
    document.body.appendChild(box); setTimeout(() => box.remove(), 9000);
  });
  socket.on("teamRenamed", (nu) => { prof.team = nu; teamIn.value = nu; try { localStorage.setItem("tb-profile", JSON.stringify(prof)); } catch (e) {} });
  socket.on("lastSeason", (sn) => { S.lastSeason = sn; openFinale(sn); });
  // ---- qualifying ghost: a see-through copy of your best lap on this track (kept in this browser) ----
  const ghostKey = () => { const T = S.track; return T ? `${T.N}_${Math.round(T.length)}_${T.reverse ? 1 : 0}_${Math.round(T.pts[0].x)}_${Math.round(T.pts[0].y)}` : null; };
  function loadGhost() { try { const all = JSON.parse(localStorage.getItem("tb-ghosts") || "{}"); return all[ghostKey()] || null; } catch (e) { return null; } }
  function saveGhost(t, path) {
    if (S.ghost && S.ghost.t <= t) return;
    S.ghost = { t, path };
    try {
      const all = JSON.parse(localStorage.getItem("tb-ghosts") || "{}"); all[ghostKey()] = { t, path, at: Date.now() };
      const keys = Object.keys(all).sort((a, b) => (all[b].at || 0) - (all[a].at || 0)); for (const k of keys.slice(15)) delete all[k];   // keep the 15 newest tracks
      localStorage.setItem("tb-ghosts", JSON.stringify(all));
    } catch (e) {}
    popup(`👻 New best lap: ${fmt(t)}. Your ghost will race it with you.`);
  }
  function drawGhost(ctx) {
    const G = S.ghost, L = S.lapRef, me = S.cars.get(S.myCar);
    if (!S.race?.quali || !G || !L || L.start === null || !me || me.fin) return;
    const tt = S.t - L.start, P = G.path; if (tt > G.t + 1) return;
    let lo = 0, hi = P.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (P[m][0] <= tt) lo = m; else hi = m; }
    const a = P[lo], b = P[hi], f = b[0] > a[0] ? Math.min(1, Math.max(0, (tt - a[0]) / (b[0] - a[0]))) : 0;
    const x = a[1] + (b[1] - a[1]) * f, y = a[2] + (b[2] - a[2]) * f, h = a[3] + wrapAng(b[3] - a[3]) * f;
    ctx.save(); ctx.globalAlpha = 0.38;
    drawCar(ctx, { color: "#9ad0ff", livery: me.livery || "plain", number: me.number, extras: null }, x, y, h, 1, {});
    ctx.globalAlpha = 0.75; ctx.font = "700 12px 'Chakra Petch', sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "bottom"; ctx.fillStyle = "#cfe6ff"; ctx.fillText(G.from ? `👻 ${G.from} ${fmt(G.t)}` : `👻 best ${fmt(G.t)}`, x, y - 22);
    ctx.restore();
  }
  // ---- live delta to your best lap: time at each point of this lap vs. the same point on your best lap ----
  function lapDelta() {
    if (S.replaying) return;
    const me = S.cars.get(S.myCar), T = S.track; if (!me || !T || me.fin) return;
    const B = 240, L = S.lapRef || (S.lapRef = { cur: [], best: null, bestT: 0, start: null, lap: me.laps });
    const bk = Math.floor((me.idx / T.N) * B);
    if (me.laps !== L.lap) {
      if (L.start !== null && me.laps === L.lap + 1) {
        const lapT = S.t - L.start;
        if (!L.best || lapT < L.bestT) { L.best = L.cur; L.bestT = lapT; }
        if (S.challenge && S.race?.quali && lapT < S.challenge.t && !S.challenge.done) { S.challenge.done = true; banner(`👻 YOU BEAT ${S.challenge.from.toUpperCase()}!`, "#a855f7"); socket.emit("ghost:beat", { code: S.challenge.code, t: lapT }); }
        if (S.race?.quali && L.path?.length > 20 && !S.challenge) saveGhost(lapT, L.path);
      }
      L.cur = []; L.path = []; L.start = me.laps >= 0 ? S.t : null; L.lap = me.laps;
    }
    // qualifying: remember the line you drove, for the ghost of your best lap
    if (S.race?.quali && L.start !== null) { const tt = S.t - L.start, pth = L.path || (L.path = []); if (!pth.length || tt - pth[pth.length - 1][0] > 0.04) pth.push([Math.round(tt * 1000) / 1000, Math.round(me.x), Math.round(me.y), Math.round(me.h * 100) / 100]); }
    if (L.start !== null && L.cur[bk] === undefined) L.cur[bk] = S.t - L.start;
    const box = $("lapDelta");
    if (!L.best || L.cur[bk] === undefined || L.best[bk] === undefined) { if (!L.best) box.classList.add("hidden"); return; }
    const d = L.cur[bk] - L.best[bk];
    box.classList.remove("hidden"); box.classList.toggle("up", d < -0.005); box.classList.toggle("down", d > 0.005);
    $("lapDeltaVal").textContent = (d > 0 ? "+" : d < 0 ? "−" : "±") + Math.abs(d).toFixed(2) + "s";
  }
  // ---- spectating: pick who the camera follows ----
  function specMove(d) {
    const ids = S.standings; if (!ids.length) return;
    if (d === 0) S.camTarget = null;
    else { const cur = Math.max(0, ids.indexOf(S.camTarget ?? ids[0])); S.camTarget = ids[(cur + d + ids.length) % ids.length]; }
    const c = S.cars.get(S.camTarget ?? ids[0]);
    $("specName").textContent = S.camTarget ? `P${ids.indexOf(S.camTarget) + 1} ${c?.name || ""}` : "the leader";
  }
  $("specPrev").addEventListener("click", () => specMove(-1));
  $("specNext").addEventListener("click", () => specMove(1));
  $("specLead").addEventListener("click", () => specMove(0));
  // ======================= Tutorial: everything in the game, in about 7 minutes =======================
  // Three parts: a tour of building a track (in your own room), a short guided race, then a tour of the menu
  // (account, car, ranked, rewards, friends, gifts, trades, bets). Each card is [title, text, what to point at].
  // A step can be one card (shown when something happens in the race) or a list (a tour: Next, Next, Next).
  const TK = (a) => `<b>${keyName(KEY(a))}</b>`;
  const TUT = {
    lobby: [
      ["👋 Welcome to Scribble GP!", "You're the <b>team boss</b>: your AI driver steers, you make the calls (tyres, boost, pit stops, upgrades). This tour shows you <b>everything</b>: building a track (2 min), a short race (3 min), then the menu (2 min). Skip any time."],
      ["✏️ Drawing a track", "Drag on the board to draw one loop. The tools: <b>Freehand</b>, <b>Straight</b> (click points), <b>Curve</b>, <b>Mirror</b> (a symmetric track) and <b>Shapes</b>. Road width and Snap float over the board, Undo/Redo (Ctrl+Z / Ctrl+Y) sit at the bottom. We rolled a random track for you already.", "#drawMode"],
      ["🛠️ Changing it", "<b>Edit track</b>: rotate, flip, bigger, smaller, a wider or narrower road, wiggle. <b>Redraw part</b> cuts out a bit to draw again, <b>Smooth</b> tidies it, <b>Start line</b> moves the start (click it, then the track), <b>Reverse</b> flips the direction.", "#moreBtn"],
      ["🟩 DRS zones and objects", "<b>Add DRS</b>: click where a zone starts, then where it ends (<b>Auto DRS</b> picks the straights). <b>Objects</b>: grandstands, banners, bridges and tunnels. Long ones (tunnels, stands) go from your first click to your second. Inside a tunnel everything echoes!", "[data-decor=\"tunnel\"]"],
      ["📚 Other tracks", "<b>Random</b> (pick how wonky), <b>Real tracks</b> (F1 circuits and more), <b>My tracks</b> (save yours), <b>Track of the week</b>, <b>Community</b> tracks, and <b>share codes</b> to swap tracks with friends.", "#randomBtn"],
      ["⚙️ Step 2: Race rules", "Pick a <b>mode</b>: Normal, Multiclass (Hypers vs GT3s), Elimination, Endurance (teammates swap), Championship, Time trial, King of the hill, Practice. Then laps, AI drivers and difficulty, weather, qualifying, safety car, DRS, standing or rolling start, points.", ".rc-step[data-step=\"rules\"], #modeTab"],
      ["👥 Step 3: Grid & teams", "Team up (tap <b>Join</b>) with friends or AI: teammates share a garage and score together. Invite friends with the room code or <b>Invite</b> link, or make the room <b>Public</b>. Chat with <b>Enter</b>. Now press <b>Start race</b>!", "#startBtn"],
    ],
    tires: ["🛞 Pick your starting tyres", "<b>Fast</b> is quickest but wears out fast, <b>Durable</b> lasts longest but is slower, <b>Wets</b> are for rain. <b>Intermediate</b> is a safe first pick. You can change your <b>next</b> set any time in Team radio.", "#tirePick"],
    lights: ["🚦 Rocket start", `Watch the 5 red lights. Press ${TK("boost")} (or tap) the moment they go <b>out</b>. Too early = jump start!`, "#lights"],
    boost: ["⚡ Boost", `Hold ${TK("boost")} on straights for extra speed. It refills every lap, a little every second, and after every overtake. While it's on you earn <b>1.5x XP</b>. Tucked right behind another car you also get a <b>slipstream</b> tow.`, "#boostBtn"],
    upgrade: ["⬆️ Level up!", "Your team earns XP while racing. Pick a card (<b>1 / 2 / 3</b>): <b>Driver</b> cards (corners, braking, overtaking...) or <b>Car</b> cards (engine, turbo, grip...). They stack. Rare 💎👑🌈 cards upgrade everything!", "#cards"],
    defend: ["🛡️ Defend", `Someone right behind you? Press ${TK("defend")}: your driver covers the line so they can't get past. It uses boost, so save it for the end.`, "#defendBtn"],
    slow: ["🐢 Why am I slow?", "The line under your speed tells you what's costing you: worn tyres, dry tyres in the rain, damage, cold tyres. The track map is top right, laps to go at the top, the gaps to the cars around you top left.", "#radio"],
    drs: ["🟩 DRS is on", `In a green DRS zone and within 1 second of the car ahead? Press ${TK("drs")} for +7% top speed.`],
    pit: ["🔧 Tyres wearing out", `When the tyre bar gets low the car slows down and can get a puncture. Press ${TK("box")} to pit this lap, and pick your next set (keys <b>1-4</b>).`, "#boxBtn"],
    pitGame: ["🎮 You're in the pits!", "Hit the arrows in order (arrow keys or WASD) as fast as you can. A quick, clean stop beats the AI crews. Miss one and you lose time!", "#pitGame"],
    afterPit: ["✅ Nice stop!", "Fresh tyres come out cold: a little less grip for a lap. In longer races, when you stop (and for which tyres, rain or shine) is how races are won."],
    watch: ["👀 Watch anyone", `Click a driver on the leaderboard (or ${TK("spectate")}) to follow them: you see their boost, tyres, upgrades and the cards they pick. Watching a friend? Hit <b>Cheer them on</b>. Click yourself to come back.`, "#standings"],
    fun: ["📷 More to try", `${TK("photo")} photo mode, ${TK("horn")} horn, emotes and chat. Rain can come mid-race, a big crash brings out the <b>safety car</b> (no overtaking, lapped cars unlap), a huge pile-up a <b>red flag</b> (back to the grid).`],
    results: [
      ["🏁 Results", "Points for the championship, best laps and pit stops. Rewatch the finish, the <b>overtake of the race</b>, the <b>highlights</b> or the lap chart, save or share a replay, say <b>GG</b>, or hit <b>Rematch</b>.", "#ggBtn"],
      ["🏆 One more part: the menu", "Points carry over race to race in a room (see Standings). Last bit of the tour: the menu, where your account, car, ranked, rewards and friends live.", null, "menu"],
    ],
    menu: [
      ["🏠 The menu", "<b>Quick Play</b> races real people, <b>Race solo</b> is you vs the AI, <b>Make a room</b> for friends, or join one with a code or from the public lobbies.", "#quickBtn"],
      ["👤 Your account", "Make an account (free) to save your stats, earn <b>coins</b>, get achievements and a rank. It works on any device.", "#signUpBtn, #acctBar"],
      ["🎨 Your car", "Name, number (and number style), colour, livery, or <b>paint your own design</b>. Save whole looks as car presets. The <b>Store</b> sells underglow, spoilers, rims, horns, trails and more; equip them in <b>Customize</b>.", ".menu-car, #carPreview"],
      ["🏆 Ranked and events", "<b>Ranked</b>: climb from Iron to Overdrive Elite. <b>Track of the week</b> has its own leaderboard, weekend events double your coins, <b>Tournaments</b> run every weekend, and spectators can <b>predict</b> the winner for coins.", "#rankedBtn"],
      ["🎟️ Rewards", "The <b>Season pass</b> (60 tiers a month), daily login streak, daily challenges, the daily wheel, crates and achievements. The casino (slots, blackjack, plinko) is in your profile.", "[data-hub=\"pass\"]"],
      ["👥 Friends", "Profile › <b>Friends</b>: add people by username or friend code, see who's online, chat, and invite them to your room.", "#acctBar [data-hub=\"stats\"]"],
      ["🤝 Gifts, trades and bets", "On a friend's card: 🎁 <b>gift</b> coins or an item; 🤝 <b>trade</b>: pick as many items (and coins) as you like each side, they accept or decline; ⚔️ <b>bet</b> coins on your next race together; 👻 send them your best lap as a <b>ghost</b> to beat."],
      ["🎓 That's everything!", "⚙️ Settings has the controls, sound, engine and horn, and <b>assists</b> (pit, boost, DRS, defend) if you want help. 📰 What's new shows every update, and 💡 <b>Suggest an idea</b> goes straight to the person who makes the game. Have fun!", "#suggestLink", "done"],
    ],
  };
  const TUT_RACE_ORDER = ["tires", "lights", "boost", "upgrade", "defend", "slow", "drs", "pit", "pitGame", "afterPit", "watch", "fun"];
  const TQ = { cards: null, i: 0, step: null, queue: [], hl: null };
  function tutHighlight(sel) {
    if (TQ.hl) TQ.hl.classList.remove("tut-hl"); TQ.hl = null;
    if (!sel) return;
    const el2 = [...document.querySelectorAll(sel)].find((e) => e.offsetParent !== null || getComputedStyle(e).position === "fixed");
    if (el2) { el2.classList.add("tut-hl"); TQ.hl = el2; el2.scrollIntoView?.({ block: "nearest", behavior: "smooth" }); }
    // never sit on top of the thing we're pointing at: drop to the bottom of the screen if it would
    const card = $("tutCard"); card.classList.remove("low");
    if (el2) requestAnimationFrame(() => { const a = card.getBoundingClientRect(), b2 = el2.getBoundingClientRect(); if (a.left < b2.right && b2.left < a.right && a.top < b2.bottom && b2.top < a.bottom) card.classList.add("low"); });
  }
  function tutShow() {
    const [title, body, sel] = TQ.cards[TQ.i], n = TQ.cards.length;
    $("tutTitle").textContent = title; $("tutBody").innerHTML = body;      // (our own fixed text, never player text)
    $("tutNext").textContent = TQ.i < n - 1 ? `Next (${TQ.i + 1}/${n}) ›` : TQ.cards[TQ.i][3] === "menu" ? "Show me the menu ›" : "Got it";
    const card = $("tutCard"); card.classList.remove("hidden"); card.classList.remove("tut-in"); void card.offsetWidth; card.classList.add("tut-in"); sfx("tick");
    tutHighlight(sel);
    clearTimeout(S.tutT);
    // single race tips tidy themselves away (the race goes on); tours wait for Next
    if (n === 1 && TUT_RACE_ORDER.includes(TQ.step)) S.tutT = setTimeout(tutNext, 16000);
  }
  function tutNext() {
    clearTimeout(S.tutT);
    const card = TQ.cards && TQ.cards[TQ.i], act = card && card[3];
    if (TQ.cards && TQ.i < TQ.cards.length - 1) { TQ.i++; tutShow(); return; }
    $("tutCard").classList.add("hidden"); tutHighlight(null); TQ.cards = null;
    if (act === "menu") { tutMenu(); return; }
    if (act === "done") { tutFinish(); return; }
    if (TQ.queue.length) setTimeout(() => { const nx = TQ.queue.shift(); tutOpen(nx); }, 600);
  }
  function tutOpen(step) {
    const t = TUT[step]; TQ.step = step; TQ.cards = Array.isArray(t[0]) ? t : [t]; TQ.i = 0; tutShow();
  }
  function tut(step) {
    if (!S.tutorial || !TUT[step] || (S.tutSeen || (S.tutSeen = new Set())).has(step)) return;
    if (TUT_RACE_ORDER.includes(step) && (S.screen !== "race" || S.replaying)) return;     // (race tips only during the race)
    S.tutSeen.add(step);
    if (TQ.cards) { TQ.queue.push(step); return; }      // one at a time: the next tip waits its turn
    tutOpen(step);
  }
  // after the race: out of the room and onto the menu for the last part
  function tutMenu() {
    S.tutorial = true;
    try { $("leaveBtn").click(); } catch (e) {}
    setTimeout(() => { if (S.screen !== "menu") show("menu"); window.scrollTo(0, 0); S.tutSeen.delete("menu"); tut("menu"); }, 500);
  }
  function tutFinish() { try { localStorage.setItem("tb-tut-done", "1"); } catch (e) {} S.tutorial = false; TQ.queue = []; $("tutBtn").classList.remove("pulse"); banner("🎓 TUTORIAL DONE!", "#3ecf6a"); sfx("level"); }
  function startTutorial() {
    saveProfile(); S.solo = true; S.tutorial = true; S.tutSeen = new Set(); S.tutPits = undefined; S.tutSetup = true; TQ.queue = []; TQ.cards = null;
    socket.emit("create", prof);
  }
  $("tutNext").addEventListener("click", tutNext);
  $("tutQuit").addEventListener("click", () => { S.tutorial = false; TQ.queue = []; TQ.cards = null; clearTimeout(S.tutT); tutHighlight(null); $("tutCard").classList.add("hidden"); try { localStorage.setItem("tb-tut-done", "1"); } catch (e) {} });
  // the race tips that need a moment, rather than an event
  socket.on("lightsOut", () => { if (!S.tutorial) return; setTimeout(() => tut("defend"), 22000); setTimeout(() => tut("slow"), 34000); setTimeout(() => tut("watch"), 60000); setTimeout(() => tut("fun"), 80000); });
  socket.on("feed", (f) => { if (f.t === "drs") tut("drs"); });
  socket.on("pitGame", () => tut("pitGame"));
  // set up the tutorial room: short, easy, dry, one random track
  socket.on("lobby", (l) => {
    if (!S.tutSetup || l.hostId !== S.me) return;
    S.tutSetup = false;
    socket.emit("settings", { laps: 4, ai: 3, aiLevel: "easy", speed: 1, weather: "sunny", quali: 0, wear: "high", theme: "grass", season: 0, safetyCar: false, mode: "normal" });
    setTimeout(() => socket.emit("randomTrack", { map: "small" }), 200);
    setTimeout(() => tut("lobby"), 900);
  });
  // first visit: point at the tutorial
  try { if (!localStorage.getItem("tb-tut-done")) { $("tutBtn").classList.add("pulse"); $("tutBtn").textContent = "🎓 New? Tutorial"; } } catch (e) {}
  // ---- other players: add friend / block / report ----
  function localBlocked() { try { return JSON.parse(localStorage.getItem("tb-blocked") || "[]"); } catch (e) { return []; } }
  function isBlockedP(p) { return localBlocked().includes(p.name.toLowerCase()); }
  function playerMenu(p) {
    const d = document.createElement("details"); d.className = "pmenu";
    const sm = document.createElement("summary"); sm.textContent = "⋯"; sm.setAttribute("aria-label", `Options for ${p.name}`); d.appendChild(sm);
    const box = document.createElement("div"); box.className = "pmenu-list";
    const item = (label, fn) => { const b = document.createElement("button"); b.type = "button"; b.textContent = label; b.addEventListener("click", () => { d.open = false; fn(); }); box.appendChild(b); };
    if (p.signedIn) item("➕ Add friend", () => socket.emit("friends:addPid", p.id));
    const blocked = isBlockedP(p);
    item(blocked ? "✅ Unblock" : "🚫 Block", () => {
      const L = localBlocked().filter((x) => x !== p.name.toLowerCase()); if (!blocked) L.push(p.name.toLowerCase());
      try { localStorage.setItem("tb-blocked", JSON.stringify(L.slice(-300))); } catch (e) {}
      socket.emit("block", { pid: p.id, on: !blocked });
      popup(blocked ? `${p.name} unblocked` : `${p.name} blocked: you won't see their emotes${S.host ? ", and they're out of your room" : ""}.`); renderLobby();
    });
    for (const [why, label] of [["name", "🚩 Report name"], ["team", "🚩 Report team name"], ["spam", "🚩 Report spam"]]) item(label, () => socket.emit("report", { pid: p.id, why }));
    d.appendChild(box); return d;
  }
  // friend invites
  socket.on("invite", (d) => {
    if (S.screen === "race") return popup(`${d.from} invited you to a room (you'll see it after this race)`);
    $("inviteText").textContent = `👋 ${d.from} invited you to their room`; $("inviteBox").classList.remove("hidden"); S.inviteCode = d.code; sfx("level");
    clearTimeout(S.inviteT); S.inviteT = setTimeout(() => $("inviteBox").classList.add("hidden"), 20000);
  });
  $("inviteJoin").addEventListener("click", () => { $("inviteBox").classList.add("hidden"); saveProfile(); S.solo = false; socket.emit("join", { code: S.inviteCode, profile: prof }); });
  $("inviteNo").addEventListener("click", () => $("inviteBox").classList.add("hidden"));
  socket.on("friendsChanged", (d) => { if (d?.msg) popup("👥 " + d.msg); if (A.tab === "friends" && !$("hub").classList.contains("hidden")) socket.emit("friends:get"); });
  // ---- pause (host) ----
  function setPausedUi(on, by) {
    S.paused = on;
    $("pauseVeil").classList.toggle("hidden", !on);
    $("pauseBy").textContent = on ? `${by || "The host"} paused the race.` : "";
    $("resumeBtn").classList.toggle("hidden", !S.host);
    $("pauseBtn").innerHTML = on ? "<kbd>P</kbd> Resume race" : "<kbd>P</kbd> Pause race";
    if (on) setNitro(false);
  }
  socket.on("paused", (d) => { S.pausedBy = d.by; setPausedUi(d.on, d.by); });
  const togglePause = () => { if (S.host && S.screen === "race") socket.emit("pause"); };
  $("pauseBtn").addEventListener("click", togglePause);
  $("resumeBtn").addEventListener("click", togglePause);
  document.addEventListener("keydown", (e) => { if (e.code === KEY("pause") && !e.repeat && S.screen === "race" && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName || "")) togglePause(); });
  // ---- you NEED to pit ----
  const MUST_WHY = { rain: "It's pouring and you're on dry tires. Wets are much faster now.", tires: "Your tires won't make it to the flag.", damage: "The car is badly damaged." };
  socket.on("mustPit", (d) => {
    S.mustPit = d;
    if (!d) { $("mustPit").classList.add("hidden"); return; }
    $("mustWhy").textContent = MUST_WHY[d.reason] + (d.reason === "tires" ? ` (${d.laps ? `${d.laps} lap${d.laps === 1 ? "" : "s"} left on them, ` : ""}${d.tire}%)` : "");
    $("mustPit").classList.remove("hidden"); sfx("warn");
  });
  $("mustBox").addEventListener("click", () => { if (!S.box) $("boxBtn").click(); $("mustPit").classList.add("hidden"); });
  $("mustHide").addEventListener("click", () => $("mustPit").classList.add("hidden"));
  // ---- qualifying results = the grid ----
  socket.on("qualiResults", (q) => {
    const ol = $("qualiList"); ol.textContent = "";
    q.rows.forEach((r, i) => {
      const li = document.createElement("li"); li.style.animationDelay = Math.min(i, 20) * 0.04 + "s";
      if (r.owner === S.me) li.classList.add("mine");
      const pp = document.createElement("span"); pp.className = "pp"; pp.textContent = i === 0 ? "POLE" : "P" + (i + 1);
      const dot = document.createElement("span"); dot.className = "dot"; dot.style.background = r.color;
      const nm = document.createElement("span"); nm.textContent = r.name + (r.team ? ` · ${r.team}` : "");
      const tm = document.createElement("span"); tm.textContent = r.best === null ? "no lap" : i === 0 || q.practice ? fmt3(r.best) : `+${r.gap.toFixed(3)}`;
      if (r.q) { const qt = document.createElement("small"); qt.className = "q-tag"; qt.textContent = r.q; nm.append(" ", qt); }
      if (q.practice) pp.textContent = "P" + (i + 1);
      li.append(pp, dot, nm, tm); ol.appendChild(li);
    });
    $("qualiTitle").textContent = q.practice ? "🏋️ Practice times" : "🏁 Qualifying results";
    $("qualiSub").textContent = q.practice ? "Best laps from this session. Back to the lobby in a few seconds." : "This is the starting grid. The race starts in a few seconds.";
    if (q.practice) setTimeout(() => { $("qualiBox").classList.add("hidden"); if (S.screen === "race") show("lobby"); }, q.hold || 7000);
    $("qualiBox").classList.remove("hidden"); $("mustPit").classList.add("hidden"); setPausedUi(false);
    const mine = q.rows.findIndex((r) => r.owner === S.me);
    if (mine === 0 && !q.practice) { banner("POLE POSITION!", "#ffcc1f"); sfx("win"); }
    if (!q.practice) say("pole", null, 2);
  });
  const fmt3 = (t) => { const m = Math.floor(t / 60), s2 = t - m * 60; return `${m}:${s2.toFixed(3).padStart(6, "0")}`; };
  $("spectateBtn").addEventListener("click", () => { socket.emit("spectate", !S.spectating); sfx("tick"); });
  $("gridRandomBtn").addEventListener("click", () => { socket.emit("gridRandomAll"); sfx("tick"); });
  $("editTrackBtn").addEventListener("click", () => setEditing(true));
  $("doneEditBtn").addEventListener("click", () => setEditing(false));
  board.addEventListener("click", () => { if (phoneMode() && !editing && S.host && S.lobby?.phase === "lobby") setEditing(true); });
  function updateEditUi() {
    const can = S.host && S.lobby?.phase === "lobby";
    $("editTrackBtn").classList.toggle("hidden", !can);
    $("editTrackBtn").textContent = S.track ? "✏️ Edit the track" : "✏️ Draw the track";
    if (!can) setEditing(false);
    else if (phoneMode() && !editing && !S.track && !S.draft) boardHint("Tap the board (or Draw the track) to open the track editor.", false);
  }
  // ---- Redraw part: click two spots on the track, the part between them is deleted, and the rest
  // of the loop becomes your drawing again. Carry on drawing from the yellow dot and come back to
  // the green one (or hit Finish loop to just join the gap).
  const cutStroke = () => S.lobby?.stroke || null;
  function nearestStroke(p) {
    const st = cutStroke(); if (!st) return null;
    let bi = -1, bd = Infinity;
    for (let i = 0; i < st.length; i++) { const d = (st[i][0] - p[0]) ** 2 + (st[i][1] - p[1]) ** 2; if (d < bd) { bd = d; bi = i; } }
    return Math.sqrt(bd) * B.s < 45 ? bi : null;
  }
  // the part that goes: [from, from+len] going forwards round the loop
  function cutRange(a, b, flip) {
    const n = cutStroke().length, fwd = (b - a + n) % n;
    const shortFwd = fwd <= n - fwd;
    return shortFwd !== !!flip ? { from: a, len: fwd } : { from: b, len: n - fwd };
  }
  function endCut() { cut = null; $("cutBtn").classList.remove("on"); $("cutBar").classList.add("hidden"); drawBoard(); }
  function cutClick(p) {
    const i = nearestStroke(p);
    if (i === null) { boardHint("Click right on the track.", true); return; }
    const widthMode = cut.mode === "wide" || cut.mode === "narrow";
    if (cut.a === null || cut.b !== null) { cut.a = i; cut.b = null; cut.flip = false; if (!widthMode) $("cutBar").classList.add("hidden"); boardHint(widthMode ? "Now click where that part ends." : "Now click where the part you don't like ends.", false); }
    else {
      const n = cutStroke().length, d = Math.min((i - cut.a + n) % n, (cut.a - i + n) % n);
      if (d < 3) { boardHint("Pick a spot a bit further along the track.", true); return; }
      cut.b = i; $("cutBar").classList.remove("hidden");
      boardHint(widthMode ? `The highlighted part gets ${cut.mode === "wide" ? "wider" : "narrower"}. Wrong part? Hit Other side.` : "The red part will be deleted. Wrong part? Hit Other side.", false);
    }
    sfx("tick"); drawBoard();
  }
  function doCut() {
    const st = cutStroke(); if (!cut || cut.b === null || !st) return;
    const n = st.length, { from, len } = cutRange(cut.a, cut.b, cut.flip);
    if (n - len < 4) { boardHint("That's almost the whole track. Use Clear to start over.", true); return; }
    const pts = [];
    for (let k = 0; k <= n - len; k++) { const q = st[(from + len + k) % n]; pts.push([q[0], q[1], q[2]]); }
    // keep the start line where it was (unless it was on the part you deleted) and keep the direction
    const T = S.track, p0 = T.pts[0], sx = T.minX + (p0.x - T.pad) / T.scale, sy = T.minY + (p0.y - T.pad) / T.scale;
    let si = 0, sd = Infinity; st.forEach((q, i) => { const dd = (q[0] - sx) ** 2 + (q[1] - sy) ** 2; if (dd < sd) { sd = dd; si = i; } });
    const inCut = ((si - from + n) % n) <= len;
    S.keepReverse = false;
    S.draft = { pts, corners: [], pieces: [], cut: true, keep: { reverse: !!T.reverse, start: inCut ? null : [sx, sy] } }; S.lastDraft = null;
    endCut(); updateDraftUi();
    boardHint(isTouch() ? "Draw the new part from the yellow dot back to the green dot (or tap Finish loop to just join it)." : "Draw the new part from the yellow dot back to the green dot (or Finish loop to just join it). Undo brings the old part back.", false);
    drawBoard();
  }
  $("cutBtn").addEventListener("click", () => {
    if (cut) { endCut(); boardHint("", false); return; }
    if (!cutStroke() || !S.track) { boardHint("Draw a track first.", true); return; }
    startMode = false; $("startLineBtn").classList.remove("on"); endDrs();
    S.draft = null; drawing = false; updateDraftUi();
    cut = { a: null, b: null, flip: false, mode: "delete" }; $("cutBtn").classList.add("on"); cutBarFor("delete");
    boardHint("Click where the part you don't like starts.", false); drawBoard();
  });
  // Wider / Narrower: pick a part of the track (click where it starts, then where it ends), like Redraw part
  function cutBarFor(mode) {
    $("cutDo").textContent = mode === "wide" ? "🛣️ Make this part wider" : mode === "narrow" ? "🪡 Make this part narrower" : "✂️ Delete this part";
    $("cutDo").className = "btn " + (mode === "delete" ? "danger-fill" : "go");
    $("cutAll").classList.toggle("hidden", mode === "delete");
  }
  function startWidthPick(kind) {
    if (!S.host || !cutStroke() || !S.track) { boardHint("Make a track first.", true); return; }
    if (cut && cut.mode === kind) { endCut(); boardHint("", false); return; }
    startMode = false; $("startLineBtn").classList.remove("on"); endDrs();
    S.draft = null; drawing = false; updateDraftUi();
    cut = { a: null, b: null, flip: false, mode: kind }; $("cutBtn").classList.remove("on"); cutBarFor(kind);
    $("cutBar").classList.remove("hidden");
    boardHint(`Click where the part to make ${kind === "wide" ? "wider" : "narrower"} starts (or press Whole track).`, false); drawBoard();
  }
  // widen / narrow the picked part, fading in and out at the ends, keeping the start line, direction and DRS
  function applyWidth() {
    const st = cutStroke(); if (!cut || cut.b === null || !st) return;
    const n = st.length, { from, len } = cutRange(cut.a, cut.b, cut.flip), k = cut.mode === "wide" ? 1.25 : 1 / 1.25, fade = Math.min(6, Math.floor(len / 3));
    const pts = st.map((q) => q.slice());
    for (let j = 0; j <= len; j++) {
      const w = fade ? Math.min(1, j / fade, (len - j) / fade) : 1, q = pts[(from + j) % n];
      q[2] = clamp(Math.round(q[2] * (1 + (k - 1) * w)), 84, 260);
    }
    const keep = { ...cut };
    loadPreset({ ...currentPreset(cut.mode === "wide" ? "wider part" : "narrower part"), stroke: pts });
    cut = keep; cutBarFor(keep.mode); $("cutBar").classList.remove("hidden"); drawBoard();     // (still picked: press again for more)
    boardHint(cut.mode === "wide" ? "That part is wider! Press it again for even wider." : "That part is narrower! Press it again for even narrower.", false);
  }
  $("cutDo").addEventListener("click", () => (cut && cut.mode !== "delete" ? applyWidth() : doCut()));
  $("cutAll").addEventListener("click", () => { const m = cut?.mode; endCut(); if (m === "wide" || m === "narrow") transformTrack(m); });
  $("cutFlip").addEventListener("click", () => { if (cut) { cut.flip = !cut.flip; drawBoard(); } });
  $("cutCancel").addEventListener("click", () => { endCut(); boardHint("", false); });
  // red highlight of the part that would go
  function drawCutPreview(c) {
    const st = cutStroke(); if (!cut || !st || cut.a === null) return;
    let b = cut.b;
    if (b === null && hover) b = nearestStroke(hover);
    c.lineCap = "round"; c.lineJoin = "round";
    if (b !== null && b !== cut.a) {
      const { from, len } = cutRange(cut.a, b, cut.flip), n = st.length;
      c.beginPath();
      for (let k = 0; k <= len; k++) { const q = st[(from + k) % n]; k ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1]); }
      const col = cut.mode === "wide" ? "62,224,106" : cut.mode === "narrow" ? "80,160,255" : "255,70,60";
      c.strokeStyle = cut.b === null ? `rgba(${col},0.45)` : `rgba(${col},0.75)`;
      c.lineWidth = Math.max(10 / B.s, st[cut.a][2] / 3 + 8); c.stroke();
      c.setLineDash([8 / B.s, 6 / B.s]); c.lineWidth = 2 / B.s; c.strokeStyle = "#fff"; c.stroke(); c.setLineDash([]);
    }
    for (const i of [cut.a, b]) {
      if (i === null || !st[i]) continue;
      c.fillStyle = "#ff5a50"; c.strokeStyle = "#fff"; c.lineWidth = 2.5 / B.s;
      c.beginPath(); c.arc(st[i][0], st[i][1], 8 / B.s, 0, Math.PI * 2); c.fill(); c.stroke();
    }
  }
  // screen -> board units. Scales by the on-screen size vs. the layout size, so the point under the
  // mouse is always exactly where the pen draws (even mid-animation or with any UI size).
  const toBoard = (e) => {
    const r = board.getBoundingClientRect(), kx = r.width ? B.w / r.width : 1, ky = r.height ? B.h / r.height : 1;
    return [clamp(((e.clientX - r.left) * kx - B.ox) / B.s, 0, B.bw), clamp(((e.clientY - r.top) * ky - B.oy) / B.s, 0, B.bh)];
  };
  board.addEventListener("pointerdown", (e) => {
    if (!S.host || S.lobby?.phase !== "lobby") return;
    if (phoneMode() && !editing) return;            // phone mode: touching the board just scrolls (tap opens the editor)
    const p = toBoard(e);
    if (cut) { cutClick(p); return; }
    if (startMode) { socket.emit("setStart", { x: p[0], y: p[1] }); startMode = false; $("startLineBtn").classList.remove("on"); return; }
    if (S.decorTool) {
      // tunnels and grandstands: click where it starts, then where it ends. Banners and bridges: one click.
      if (DECOR_LONG.includes(S.decorTool) && !S.decorStart) { S.decorStart = p; boardHint(S.decorTool === "tunnel" ? "🚇 Now click where the tunnel ends." : "🏟️ Now click where the grandstand ends (it goes on the side you clicked first).", false); drawBoard(); return; }
      socket.emit("decor:add", { k: S.decorTool, x: (S.decorStart || p)[0], y: (S.decorStart || p)[1], end: S.decorStart ? { x: p[0], y: p[1] } : null });
      S.decorStart = null; drawBoard();
      if (DECOR_LONG.includes(S.decorTool)) boardHint(S.decorTool === "tunnel" ? "🚇 Tunnel built! Click for another one's start." : "🏟️ Grandstand built! Click for another one's start.", false);
      return;
    }
    if (drsMode) {
      if (!drsMode.a) { drsMode.a = p; boardHint("Now click where the DRS zone ends (just before the braking point).", false); drawBoard(); }
      else { socket.emit("drs:add", { a: drsMode.a, b: p }); endDrs(); drawBoard(); }
      return;
    }
    redoStack.length = 0; updateRedo();
    if (drawMode === "stamp") { board.setPointerCapture(e.pointerId); drawing = true; stampStart = p; S.stampEnd = p; drawBoard(); return; }
    if (drawMode === "curve") {
      if (!S.draft) { S.draft = { pts: [], corners: [], pieces: [], ctrl: [], base: 0 }; S.lastDraft = null; }
      const d = S.draft;
      if (!d.ctrl) { d.ctrl = [lastPt().slice()]; d.base = d.pts.length - 1; }     // carry on from what's already drawn
      if (d.base === 0 && d.ctrl.length >= 3 && nearPx(p, d.ctrl[0], 18)) { finishDraft(); return; }
      d.ctrl.push([p[0], p[1], brushW]);
      d.pts = d.pts.slice(0, d.base).concat(spline(d.ctrl, false));
      updateDraftUi(); hintDraft(); drawBoard(); shareDraft(); return;
    }
    if (drawMode === "line") {
      if (!S.draft) { S.draft = { pts: [[p[0], p[1], brushW]], corners: [0], pieces: [0] }; S.lastDraft = null; }
      else if (S.draft.pts.length >= 3 && nearPx(p, S.draft.pts[0], 18) && draftLen() > 150) { finishDraft(); return; }
      else { S.draft.pieces.push(S.draft.pts.length); markCorner(); addStraight(p); markCorner(); }
      updateDraftUi(); hintDraft(); drawBoard(); return;
    }
    board.setPointerCapture(e.pointerId);
    drawing = true;
    if (!S.draft) { S.draft = { pts: [[p[0], p[1], brushW]], corners: [], pieces: [0], mirror: drawMode === "mirror" }; S.lastDraft = null; }
    else {
      S.draft.pieces.push(S.draft.pts.length);
      if (!nearPx(p, lastPt(), 14)) { markCorner(); addStraight(p); markCorner(); }    // started somewhere else: join with a straight line
    }
    shiftAnchor = e.shiftKey ? lastPt() : null;
    updateDraftUi(); drawBoard();
  });
  board.addEventListener("pointermove", (e) => {
    const p = toBoard(e); hover = p;
    if (!drawing) { if (S.host && S.lobby?.phase === "lobby") drawBoard(); return; }
    if (drawMode === "stamp") { S.stampEnd = p; drawBoard(); return; }
    if (e.shiftKey) {                  // hold Shift: a straight line from where Shift was pressed
      if (!shiftAnchor) shiftAnchor = lastPt();
      S.shiftEnd = p; drawBoard(); return;
    }
    if (shiftAnchor) commitShift();
    // use every pointer sample the browser collected since the last frame, so fast strokes
    // follow the mouse exactly instead of cutting corners
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
    let added = false;
    for (const ev of evs.length ? evs : [e]) {
      const q = toBoard(ev), l = lastPt();
      if (Math.hypot(q[0] - l[0], q[1] - l[1]) * B.s >= 2) { S.draft.pts.push([q[0], q[1], brushW]); added = true; }
    }
    if (added) { drawBoard(); shareDraft(); }
  });
  board.addEventListener("pointerleave", () => { hover = null; if (!drawing) drawBoard(); });
  function commitShift() {
    if (!shiftAnchor || !S.shiftEnd || !S.draft) { shiftAnchor = null; return; }
    markCorner(); addStraight(S.shiftEnd); markCorner();
    shiftAnchor = null; S.shiftEnd = null;
  }
  window.addEventListener("keyup", (e) => { if (e.key === "Shift" && drawing && shiftAnchor) { commitShift(); drawBoard(); } });
  window.addEventListener("keydown", (e) => {
    if (S.screen !== "lobby" || e.target.tagName === "INPUT" || e.target.tagName === "SELECT") return;
    if (e.key === "Escape" && editing && !cut && !S.draft) { setEditing(false); return; }
    if (e.key === "Escape" && cut) { endCut(); boardHint("", false); return; }
    if (e.key === "Escape" && S.draft) { S.draft = null; drawing = false; updateDraftUi(); drawBoard(); boardHint("Drawing cleared.", false); }
    if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === "y" || (e.shiftKey && e.key.toLowerCase() === "z"))) { e.preventDefault(); redoAnything(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); undoAnything(); }
    if (e.key === "[" || e.key === "]") { const ws = WIDTHS.map((x) => x[0]), i = ws.indexOf(brushW); setBrush(ws[clamp(i + (e.key === "]" ? 1 : -1), 0, ws.length - 1)]); }
  });
  const endDraw = () => {
    if (!drawing) return;
    drawing = false;
    if (drawMode === "stamp") {                 // drop in the shape
      const a = stampStart, b = S.stampEnd; stampStart = null; S.stampEnd = null;
      if (!a || !b || Math.abs(a[0] - b[0]) < 60 || Math.abs(a[1] - b[1]) < 60) { boardHint("Drag a bigger box to drop in the shape.", true); drawBoard(); return; }
      S.draft = { pts: shapePts(stampShape, a, b), corners: [], pieces: [0] }; S.lastDraft = null;
      finishDraft(); return;
    }
    if (shiftAnchor) commitShift();
    const d = S.draft; if (!d) return;
    if (d.mirror && drawMode === "mirror" && !d.cut) {      // one half drawn: add its mirror image and close it
      if (draftLen() < 80) { updateDraftUi(); drawBoard(); return; }
      const half = d.pts.map((q) => q.slice()), M = half.map((q) => [B.bw - q[0], q[1], q[2]]).reverse();
      d.pts = half.concat(M); d.corners = []; finishDraft(); return;
    }
    const P = d.pts, a = P[0], b = P[P.length - 1];
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const q of P) { x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); x1 = Math.max(x1, q[0]); y1 = Math.max(y1, q[1]); }
    const gap = Math.hypot(b[0] - a[0], b[1] - a[1]), diag = Math.hypot(x1 - x0, y1 - y0);
    // back near the start? finish the loop. (One single freehand stroke gets a bit more leeway, like before.)
    const closed = P.length > 12 && draftLen() > 250 && (nearPx(a, b, 26) || (!d.cut && d.pieces.length === 1 && !d.corners.length && gap < diag * 0.22));
    if (closed) finishDraft(); else { updateDraftUi(); hintDraft(); drawBoard(); }
  };
  board.addEventListener("pointerup", endDraw); board.addEventListener("pointercancel", endDraw);
  // random track, as wonky as you picked (remembered on this device)
  const WONK_NAME = { little: "a bit wonky", regular: "wonky", very: "VERY wonky" };
  if (!WONK_NAME[settings.wonk]) settings.wonk = "regular";
  const showWonk = () => document.querySelectorAll("[data-wonk]").forEach((x) => { const on = x.dataset.wonk === settings.wonk; x.classList.toggle("on", on); x.setAttribute("aria-checked", String(on)); });
  function randomTrack() {
    endCut(); S.draft = null; S.lastDraft = null; S.preview = null; updateDraftUi();
    socket.emit("randomTrack", { map: S.lobby.settings.map, wonk: settings.wonk });
    boardHint(`Making a ${WONK_NAME[settings.wonk]} random track...`, false);
  }
  $("randomBtn").addEventListener("click", randomTrack);
  document.querySelectorAll("[data-wonk]").forEach((b) => b.addEventListener("click", () => {
    settings.wonk = b.dataset.wonk; showWonk();
    try { localStorage.setItem("tb-settings", JSON.stringify(settings)); } catch (e) {}
    randomTrack();
  }));
  showWonk();
  $("clearBtn").addEventListener("click", () => { endCut(); S.draft = null; S.lastDraft = null; updateDraftUi(); socket.emit("clearTrack"); });


  // ======================= Chat =======================
  const CHAT = S.chat = { msgs: { global: [], room: [], team: [] }, tab: null, open: false, unread: { global: 0, room: 0, team: 0 } };
  const chatTabs = () => ({ global: true, room: !!S.code, team: !!(S.code && S.lobby?.settings?.teams) });
  function chatTab() { const CHAT = S.chat, ok = chatTabs(); if (!CHAT.tab || !ok[CHAT.tab]) CHAT.tab = ok.room ? "room" : "global"; return CHAT.tab; }
  function chatLine(m) {
    const d = el("div", "m" + (m.pid === socket.id ? " me" : ""));
    const b = el("b", "", m.name + ":"); if (m.color && m.pid !== socket.id) b.style.color = m.color;
    d.append(b, document.createTextNode(m.text));
    if (m.pid !== socket.id && m.id) { const rp = el("button", "rp", "⚑"); rp.type = "button"; rp.title = "Report this message"; rp.setAttribute("aria-label", `Report message from ${m.name}`); rp.addEventListener("click", () => { socket.emit("chat:report", m.id); rp.remove(); }); d.appendChild(rp); }
    return d;
  }
  function renderChat() {
    const CHAT = S.chat; if (!CHAT) return;            // (can be called before the chat is set up)
    const ok = chatTabs(), tab = chatTab();
    document.querySelectorAll("#chatBox [data-ch]").forEach((b) => { b.classList.toggle("hidden", !ok[b.dataset.ch]); b.setAttribute("aria-selected", String(b.dataset.ch === tab)); b.classList.toggle("new", b.dataset.ch !== tab && CHAT.unread[b.dataset.ch] > 0); });
    const total = Object.entries(CHAT.unread).reduce((a, [k, n]) => a + (ok[k] ? n : 0), 0);
    for (const bd of [$("chatBadge"), ...document.querySelectorAll("[data-chat] .chat-badge")]) { bd.textContent = total > 9 ? "9+" : String(total); bd.classList.toggle("hidden", !total || CHAT.open); }
    if (!CHAT.open) return;
    const list = $("chatList"); list.textContent = "";
    const ms = CHAT.msgs[tab];
    if (!ms.length) list.appendChild(el("div", "empty", tab === "global" ? "Chat with everyone playing right now. Be nice!" : tab === "team" ? "Only your team sees this." : "Everyone in this room sees this."));
    for (const m of ms) list.appendChild(m.note ? el("div", "note", m.text) : chatLine(m));
    list.scrollTop = list.scrollHeight;
    $("chatIn").placeholder = tab === "global" && !A.user ? "Sign in to chat with everyone" : tab === "team" ? "Message your team..." : "Say something nice...";
  }
  function openChat(on) {
    CHAT.open = on; $("chatBox").classList.toggle("hidden", !on); $("chatBtn").setAttribute("aria-expanded", String(on));
    if (on) { CHAT.unread[chatTab()] = 0; renderChat(); setTimeout(() => $("chatIn").focus(), 30); } else { $("chatIn").blur(); renderChat(); }
  }
  $("chatBtn").addEventListener("click", () => openChat(!CHAT.open));
  document.querySelectorAll("[data-chat]").forEach((b) => b.addEventListener("click", () => openChat(!CHAT.open)));
  $("chatClose").addEventListener("click", () => openChat(false));
  document.querySelectorAll("#chatBox [data-ch]").forEach((b) => b.addEventListener("click", () => { CHAT.tab = b.dataset.ch; CHAT.unread[CHAT.tab] = 0; renderChat(); $("chatIn").focus(); }));
  $("chatForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const t = $("chatIn").value.trim(); if (!t) return;
    socket.emit("chat", { ch: chatTab(), text: t }); $("chatIn").value = "";
  });
  $("chatIn").addEventListener("keydown", (e) => { if (e.key === "Escape") { e.preventDefault(); openChat(false); } e.stopPropagation(); });
  // Enter opens chat (in a room or a race), unless you're typing somewhere else
  window.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || CHAT.open || /INPUT|SELECT|TEXTAREA|BUTTON/.test(document.activeElement?.tagName || "") || (S.screen !== "race" && S.screen !== "lobby")) return;
    e.preventDefault(); openChat(true);
  });
  const addChat = (ch, m) => { const a = CHAT.msgs[ch]; a.push(m); if (a.length > 80) a.shift(); };
  socket.on("chat", (m) => {
    if (!CHAT.msgs[m.ch]) return;
    addChat(m.ch, m);
    if (!(CHAT.open && chatTab() === m.ch) && m.pid !== socket.id) CHAT.unread[m.ch]++;
    // in a race, room and team messages also pop up in the feed
    if (S.screen === "race" && m.ch !== "global" && !CHAT.open && m.pid !== socket.id) {
      const d = document.createElement("div"); d.textContent = `💬 ${m.ch === "team" ? "[Team] " : ""}${m.name}: ${m.text}`;
      const feed = $("feed"); feed.prepend(d); while (feed.children.length > 6) feed.lastChild.remove();
      setTimeout(() => { d.classList.add("out"); setTimeout(() => d.remove(), 400); }, 6000);
    }
    renderChat();
  });
  socket.on("chatHistory", (list) => { if (Array.isArray(list)) { CHAT.msgs.global = list.slice(-80); renderChat(); } });
  socket.on("chatNote", (t) => { addChat(chatTab(), { note: true, text: t }); if (!CHAT.open) popup(t, true); renderChat(); });
  socket.on("connect", () => socket.emit("chat:history"));
  socket.on("joined", () => { CHAT.msgs.room = []; CHAT.msgs.team = []; CHAT.unread.room = CHAT.unread.team = 0; CHAT.tab = null; renderChat(); });

  // ======================= Race HUD pieces =======================
  function setOrder() {}      // team orders were removed: your tires decide how fast you go
  function renderNextTires() {
    const box = $("nextTires");
    if (box.childElementCount === 1) {
      for (const k of Object.keys(TIRES)) {
        const b = document.createElement("button"); b.type = "button"; b.dataset.k = k; b.appendChild(badge(k)); b.setAttribute("aria-label", "Next tires: " + TIRES[k].name);
        b.addEventListener("click", () => { socket.emit("compound", k); S.nextComp = k; renderNextTires(); sfx("tick"); popup(`Next stop: ${TIRES[k].name} tires`); });
        box.appendChild(b);
      }
    }
    box.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.k === S.nextComp)));
  }
  // In the pit lane: big tire cards. Whatever's picked when the car reaches its box goes on
  // (if you don't pick, the "Next tires" choice from the team radio stays).
  let pitPickShown = false;
  function renderPitPick(m) {
    const me = S.cars.get(S.myCar), show = (m.box || m.heading || m.pitLane) && !m.pitting && !!me && !(me.pit >= 0) && !me.fin;
    const box = $("pitPick");
    if (!show) { if (pitPickShown) { box.classList.add("hidden"); pitPickShown = false; } return; }
    const row = $("ppRow");
    if (!pitPickShown) {
      pitPickShown = true; box.classList.remove("hidden"); row.textContent = ""; sfx("card");
      for (const [k, T] of Object.entries(TIRES)) {
        const b = document.createElement("button"); b.type = "button"; b.className = "pp"; b.dataset.k = k;
        const nm = document.createElement("div"); nm.className = "nm"; nm.append(badge(k), T.name);
        const life = document.createElement("div"); life.className = "life";
        const note = document.createElement("small"); note.textContent = k === "wet" ? "For rain" : k === "fast" ? "Quickest" : k === "durable" ? "Slowest" : "Middle";
        b.append(nm, life, note);
        b.addEventListener("click", () => { const again = S.nextComp === k; socket.emit("compound", k); S.nextComp = k; renderNextTires(); markPitPick(); sfx("tick"); if (!again) pickPop(row, b, T.color); });
        row.appendChild(b);
      }
    }
    $("ppTitle").textContent = m.pitLane ? "🔧 In the pit lane: last chance to pick!" : "🔧 Boxing this lap: pick your tires";
    $("ppSub").textContent = `${m.lapsLeft} lap${m.lapsLeft === 1 ? "" : "s"} left after the stop · keys 1-4`;
    row.querySelectorAll(".pp").forEach((b) => {
      const L = m.life?.[b.dataset.k] || 0, el = b.querySelector(".life");
      el.textContent = L >= m.lapsLeft ? `Lasts ${L.toFixed(1)} laps ✓` : `Lasts ${L.toFixed(1)} laps`;
      el.classList.toggle("short", L < m.lapsLeft);
    });
    markPitPick();
  }
  function markPitPick() { $("ppRow").querySelectorAll(".pp").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.k === S.nextComp))); }
  function updateBox() {
    if (S.boxShown === S.box) return; S.boxShown = S.box;
    const b = $("boxBtn"); b.classList.toggle("on", S.box);
    b.innerHTML = S.box ? "<kbd>B</kbd> Boxing this lap! (cancel)" : "<kbd>B</kbd> Box this lap";
  }
  document.querySelectorAll(".order").forEach((b) => b.addEventListener("click", () => setOrder(b.dataset.o)));
  $("boxBtn").addEventListener("click", () => { socket.emit("box"); sfx("tick"); });
  // Leave race: click twice (so you don't do it by accident)
  let leaveArmed = 0;
  function disarmLeave() { leaveArmed = 0; const b = $("leaveRaceBtn"); b.classList.remove("armed"); b.textContent = "Leave race"; }
  function leaveRace() {
    if (!S.myCar) { show("lobby"); return; }
    if (performance.now() - leaveArmed > 3000) {
      leaveArmed = performance.now(); const b = $("leaveRaceBtn");
      b.classList.add("armed"); b.textContent = "Click again to leave (the AI takes over)";
      setTimeout(() => { if (performance.now() - leaveArmed >= 2900) disarmLeave(); }, 3000);
      return;
    }
    socket.emit("retire"); disarmLeave();
  }
  $("leaveRaceBtn").addEventListener("click", leaveRace);
  socket.on("retired", () => {
    setNitro(false); S.myCar = null; engineSound(0, false);
    S.cardsLater = false; hideCards();
    show("lobby"); renderLobby();
    popup("You left the race. Back in the room.");
  });

  let offerSeq = 0;
  S.cardsLater = false;
  function showCards(o) {
    S.offer = o; offerSeq++;
    if (S.screen !== "race") { S.offer = null; renderPill(); return; }             // upgrades only happen during a race
    if (S.cardsLater) { renderPill(); return; }
    if (!$("lights").classList.contains("hidden")) { setTimeout(() => { if (S.offer === o) showCards(o); }, 800); return; }   // don't cover the GO button
    $("cardsTitle").textContent = o.pending > 1 ? `Level up! Upgrade your team (${o.pending} to pick)` : "Level up! Upgrade your team";
    const row = $("cardRow"); row.textContent = "";
    const rareCard = o.cards.find((c) => c.tier);
    if (rareCard) { $("cardsTitle").textContent = `✨ A SUPER RARE CARD APPEARED! ✨`; banner(`${rareCard.icon} ${RARE_TIER[rareCard.tier].label} CARD!`, RARE_TIER[rareCard.tier].color); sfx("win"); }
    o.cards.forEach((c, i) => {
      const b = document.createElement("button"); b.type = "button"; b.className = "card" + (c.tier ? ` rare tier-${c.tier}` : "");
      const top = document.createElement("div"); top.className = "top";
      const k = document.createElement("kbd"); k.textContent = i + 1;
      const n = document.createElement("span"); n.textContent = c.name;
      const kd = document.createElement("span"); kd.className = "kind " + c.kind.toLowerCase(); kd.textContent = c.tier ? `${RARE_TIER[c.tier].label} · ${RARE_TIER[c.tier].odds}` : c.kind;
      if (c.tier) n.textContent = `${c.icon} ${c.name}`;
      top.append(k, n, kd);
      const d = document.createElement("div"); d.className = "desc"; d.textContent = c.desc;
      const fx = document.createElement("div"); fx.className = "fx";
      if (c.next && c.tier) { const nx = document.createElement("span"); nx.textContent = c.next; fx.appendChild(nx); }
      else if (c.next) { fx.append(c.level ? `Now ${c.now} → ` : "Get "); const nx = document.createElement("span"); nx.textContent = c.next; fx.appendChild(nx); }
      const pips = document.createElement("div"); pips.className = "pips";
      for (let l = 0; l < c.max; l++) { const p = document.createElement("i"); if (l < c.level) p.className = "on"; pips.appendChild(p); }
      b.append(top, d, fx, pips);
      b.addEventListener("click", () => pickCard(i));
      row.appendChild(b);
    });
    $("cards").classList.add("hidden"); void $("cards").offsetWidth; $("cards").classList.remove("hidden");
    $("upPill").classList.add("hidden");
    sfx("card");
  }
  // tuck the cards away into a little "upgrades waiting" pill
  function renderPill() {
    const n = S.offer ? S.offer.pending || 1 : 0;
    const pill = $("upPill");
    pill.textContent = `🎁 ${n} upgrade${n > 1 ? "s" : ""} waiting (U)`;
    pill.classList.toggle("hidden", !n || S.screen === "menu");
    $("cards").classList.add("hidden");
  }
  function laterCards() { if (!S.offer) return; S.cardsLater = true; renderPill(); }
  function openCards() { if (!S.offer) { socket.emit("wantOffer"); return; } S.cardsLater = false; showCards(S.offer); }
  $("laterBtn").addEventListener("click", laterCards);
  $("upPill").addEventListener("click", openCards);
  // the same sparks as picking an upgrade card, for the other good moments (a smaller burst by default)
  function sparkBurst(x, y, col = "#ffcc1f", n = 12, reach = 70) {
    if (reducedMotion) return;
    const burst = document.createElement("div"); burst.className = "card-burst"; burst.style.left = `${Math.round(x)}px`; burst.style.top = `${Math.round(y)}px`;
    for (let k = 0; k < n; k++) {
      const sp = document.createElement("i"), a = (k / n) * Math.PI * 2 + Math.random() * 0.4, d = reach * (0.6 + Math.random() * 0.7);
      sp.style.setProperty("--dx", `${Math.round(Math.cos(a) * d)}px`); sp.style.setProperty("--dy", `${Math.round(Math.sin(a) * d)}px`);
      sp.style.background = k % 3 ? col : "#fff"; sp.style.color = col; sp.style.animationDelay = `${Math.round(Math.random() * 60)}ms`;
      burst.appendChild(sp);
    }
    document.body.appendChild(burst); setTimeout(() => burst.remove(), 1100);
  }
  const burstFrom = (elx, col, n, reach) => { if (!elx) return; const q = elx.getBoundingClientRect(); if (q.width) sparkBurst(q.left + q.width / 2, q.top + q.height / 2, col, n, reach); };
  // picking from a row of choices (tyres): the pick pops, flips and flashes in its colour; the rest dip back
  function pickPop(row, b, col) {
    if (reducedMotion || !b) return;
    row.querySelectorAll(":scope > button").forEach((o) => { o.classList.remove("pick-pop", "pick-dip"); void o.offsetWidth; o.classList.add(o === b ? "pick-pop" : "pick-dip"); });
    b.style.setProperty("--pick", col); burstFrom(b, col, 10, 60);
  }
  function pickCard(i) {
    if (!S.offer || !S.offer.cards[i]) return;
    socket.emit("pick", i);
    const cards = [...$("cardRow").children], el0 = cards[i], card = S.offer.cards[i];
    S.offer = null; const seq = offerSeq;
    if (reducedMotion || !el0) {
      cards.forEach((c, j) => c.classList.add(j === i ? "chosen" : "gone"));
      setTimeout(() => { if (seq === offerSeq) hideCards(); }, 340);
      return;
    }
    // the picked card: flash, pop, half a spin, then it flies off to your upgrades list with a burst of sparks;
    // the others tumble away to the sides
    const r = el0.getBoundingClientRect(), g = $("garage").getBoundingClientRect(), col = card.tier ? RARE_TIER[card.tier]?.color || "#ffcc1f" : card.kind === "Driver" ? "#a78bfa" : "#38bdf8";
    const tx = g.width ? g.left + g.width / 2 : innerWidth - 80, ty = g.height ? g.top + 30 : 120;
    // (animated as copies laid over the page: the real cards can be put away right away, whatever the server says)
    const ghostOf = (c) => { const q = c.getBoundingClientRect(), g2 = c.cloneNode(true); g2.classList.add("card-fly"); Object.assign(g2.style, { left: `${q.left}px`, top: `${q.top}px`, width: `${q.width}px`, height: `${q.height}px` }); document.body.appendChild(g2); setTimeout(() => g2.remove(), 950); return g2; };
    const pickG = ghostOf(el0);
    pickG.style.setProperty("--fly-x", `${Math.round(tx - (r.left + r.width / 2))}px`); pickG.style.setProperty("--fly-y", `${Math.round(ty - (r.top + r.height / 2))}px`); pickG.style.setProperty("--pick", col);
    cards.forEach((c, j) => { if (j !== i) { const g2 = ghostOf(c); g2.style.setProperty("--tumble", j < i ? "-1" : "1"); g2.classList.add("tumble"); } });
    pickG.classList.add("picked");
    $("cardRow").style.visibility = "hidden"; setTimeout(() => { $("cardRow").style.visibility = ""; }, 900);
    const burst = document.createElement("div"); burst.className = "card-burst"; burst.style.left = `${r.left + r.width / 2}px`; burst.style.top = `${r.top + r.height / 2}px`;
    const n = card.tier ? 30 : 18;
    for (let k = 0; k < n; k++) {
      const s = document.createElement("i"), a = (k / n) * Math.PI * 2 + Math.random() * 0.4, d = 70 + Math.random() * (card.tier ? 170 : 110);
      s.style.setProperty("--dx", `${Math.round(Math.cos(a) * d)}px`); s.style.setProperty("--dy", `${Math.round(Math.sin(a) * d)}px`);
      s.style.background = card.tier ? `hsl(${Math.round(Math.random() * 360)},100%,65%)` : k % 3 ? col : "#fff"; s.style.animationDelay = `${Math.round(Math.random() * 80)}ms`;
      burst.appendChild(s);
    }
    document.body.appendChild(burst); setTimeout(() => burst.remove(), 1100);
    sfx("level");
    setTimeout(() => { if (seq === offerSeq) hideCards(); }, 60);
  }
  function hideCards() { S.offer = null; $("cards").classList.add("hidden"); $("upPill").classList.add("hidden"); }
  function renderGarage() {
    const g = $("garage"); g.textContent = "";
    g.classList.remove("aura-epic", "aura-legendary", "aura-mythic");
    if (!S.up || !S.upInfo) return;
    if (S.myRare) { g.classList.add("aura-" + S.myRare); const t = document.createElement("div"); t.className = "g-aura"; t.textContent = `${RARE_TIER[S.myRare].icon} ${RARE_TIER[S.myRare].label} POWER`; g.appendChild(t); }
    for (const kind of ["Driver", "Car"]) {
      const h = document.createElement("h4"); h.textContent = kind === "Driver" ? prof.name.toUpperCase() : "CAR"; g.appendChild(h);
      for (const [k, u] of Object.entries(S.upInfo)) {
        if (u.kind !== kind) continue;
        const row = document.createElement("div"); row.className = "g";
        const n = document.createElement("span"); n.textContent = u.name;
        const pips = document.createElement("span"); pips.className = "pips";
        for (let l = 0; l < u.max; l++) { const p = document.createElement("i"); if (l < S.up[k]) p.className = "on" + (k === S.justPicked && l === S.up[k] - 1 ? " new" : ""); pips.appendChild(p); }
        row.append(n, pips); g.appendChild(row);
        if (S.up[k] > 0 && u.levels) { const f = document.createElement("div"); f.className = "gfx"; f.textContent = u.levels[S.up[k]]; g.appendChild(f); }
      }
    }
    S.justPicked = null;
  }
  // coins: count up (or down) to the new amount, with a little bounce
  function countCoins(elx, to) {
    const from = Number(elx.dataset.v ?? to); elx.dataset.v = to;
    if (from === to || reducedMotion) { elx.textContent = `🪙 ${to.toLocaleString()}`; return; }
    elx.classList.remove("coin-up", "coin-down"); void elx.offsetWidth; elx.classList.add(to > from ? "coin-up" : "coin-down");
    const t0 = performance.now(), dur = Math.min(1200, 300 + Math.abs(to - from) * 2);
    const stepC = (now) => { const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3); elx.textContent = `🪙 ${Math.round(from + (to - from) * e).toLocaleString()}`; if (k < 1 && elx.dataset.v == to) requestAnimationFrame(stepC); };
    requestAnimationFrame(stepC);
  }
  // a burst of confetti from the top of the screen (a podium finish, a win...)
  function confettiBurst(n = 90) {
    if (reducedMotion) return;
    const box = document.createElement("div"); box.className = "confetti-fx";
    const cols = ["#ffcc1f", "#ff2d55", "#22d3ee", "#3ee06a", "#a855f7", "#fff"];
    for (let i = 0; i < n; i++) { const p = document.createElement("i"); p.style.left = Math.random() * 100 + "vw"; p.style.background = cols[i % cols.length]; p.style.setProperty("--dx", (Math.random() - 0.5) * 240 + "px"); p.style.setProperty("--r", Math.random() * 900 - 450 + "deg"); p.style.animationDelay = Math.random() * 600 + "ms"; p.style.animationDuration = 1800 + Math.random() * 1400 + "ms"; box.appendChild(p); }
    document.body.appendChild(box); setTimeout(() => box.remove(), 4200);
  }
  function banner(text, color) { const b = $("banner"); b.textContent = text; b.style.color = color || "#fff"; b.classList.remove("show"); void b.offsetWidth; b.classList.add("show"); }
  function popup(text, warn) {
    // outside a race the HUD (and its floating race messages) is hidden: show a readable card instead
    if (S.screen !== "race" || S.replaying) {
      const box = $("toasts"), d = document.createElement("div"); d.className = "toast-card" + (warn ? " warn" : ""); d.textContent = text; d.setAttribute("role", "status");
      box.appendChild(d); while (box.children.length > 3) box.firstChild.remove();
      setTimeout(() => { d.classList.add("out"); setTimeout(() => d.remove(), 350); }, 3800);
      return;
    }
    const el = document.createElement("div"); el.className = "popup" + (warn ? " warn" : ""); el.textContent = text;
    const box = $("popups"); box.appendChild(el);
    while (box.children.length > 4) box.firstChild.remove();
    setTimeout(() => el.remove(), 1650);
  }
  function addShake(n) { if (settings.shake === "on" && !reducedMotion) S.shake = Math.max(S.shake, n); }
  function fmt(t) { if (!isFinite(t) || t <= 0) return "--"; const m = Math.floor(t / 60), s = t - m * 60; return `${m}:${s.toFixed(1).padStart(4, "0")}`; }

  // ======================= Results + podium =======================
  let confetti = [];
  function renderTeamResults(r) {
    const tb = $("resTeams"); tb.textContent = "";
    const earned = {};
    for (const x of r.rows) if (x.team) earned[x.team] = (earned[x.team] || 0) + x.pts;
    (r.teamChamp || []).slice(0, 8).forEach((t, i) => {
      const tr = document.createElement("tr");
      const mine = r.rows.find((x) => x.owner === S.me)?.team === t.n; if (mine) tr.className = "me";
      for (const [v, cls] of [[i + 1], [t.n], [`+${earned[t.n] || 0}`, "n"], [`${t.p} pts`, "n"]]) { const d = document.createElement("td"); d.textContent = v; if (cls) d.className = cls; tr.appendChild(d); }
      tb.appendChild(tr);
    });
  }
  $("replayBtn").addEventListener("click", startReplay);
  $("bestPassBtn").addEventListener("click", startBestPass);
  $("reelBtn").addEventListener("click", startReel); $("reelShareBtn").addEventListener("click", shareReel);
  $("lapChartBtn").addEventListener("click", () => { const w = $("lapChartBox"); w.classList.toggle("hidden"); if (!w.classList.contains("hidden")) drawLapChart(S.lastResults); });
  $("replayExit").addEventListener("click", stopReplay);
  $("replayCam").addEventListener("click", () => {
    const ids = S.standings; if (!ids.length) return;
    const cur = Math.max(0, ids.indexOf(S.camTarget ?? ids[0])); S.camTarget = ids[(cur + 1) % ids.length];
    const c = S.cars.get(S.camTarget); $("replayCam").textContent = `Follow: ${c?.name || "?"}`;
  });
  // the race was called off (3 red flags / 7 safety cars): a big moment before the results
  function showAbandoned(a) {
    const fx = $("abandonFx");
    $("abWhy").textContent = `${a.why === "redFlags" ? `${a.rf} red flags` : `${a.sc} safety cars`} · stopped on lap ${a.lap} of ${a.of} · results as they stood`;
    $("abWin").textContent = a.winner ? `🏆 Winner: ${a.winner}` : "";
    fx.classList.remove("hidden", "out"); void fx.offsetWidth; fx.classList.add("play");
    sfx("jump"); addShake?.(14); crowdRoar(1.2);
    const done = () => { fx.classList.add("out"); setTimeout(() => fx.classList.add("hidden"), 500); fx.removeEventListener("click", done); };
    fx.addEventListener("click", done); setTimeout(done, 5200);
  }
  // photo finish: a still of the moment, with the gap written on it. Shown with the results and kept (the last 3) on this device
  function photoStill(f) {
    try {
      const W = Math.min(720, view.width), H = Math.round(W * view.height / view.width), cv = document.createElement("canvas"); cv.width = W; cv.height = H;
      const c = cv.getContext("2d"); c.drawImage(view, 0, 0, W, H);
      c.fillStyle = "rgba(0,0,0,0.55)"; c.fillRect(0, H - 44, W, 44);
      c.fillStyle = "#9ad0ff"; c.font = "700 20px 'Russo One', sans-serif"; c.textBaseline = "middle"; c.fillText("📸 PHOTO FINISH", 14, H - 22);
      c.fillStyle = "#fff"; c.font = "700 15px 'Chakra Petch', sans-serif"; c.textAlign = "right"; c.fillText(`${f.name} beat ${f.other} by ${Number(f.gap).toFixed(3)}s`, W - 14, H - 22);
      const url = cv.toDataURL("image/jpeg", 0.8), cap = `${f.name} beat ${f.other} by ${Number(f.gap).toFixed(3)}s`;
      S.photoStill = { url, cap };
      let all = []; try { all = JSON.parse(localStorage.getItem("tb-photos") || "[]"); } catch (e) {}
      all = [{ url, cap, at: Date.now() }, ...all].slice(0, 3);
      try { localStorage.setItem("tb-photos", JSON.stringify(all)); } catch (e) { try { localStorage.setItem("tb-photos", JSON.stringify(all.slice(0, 1))); } catch (e2) {} }
    } catch (e) { S.photoStill = null; }
  }
  socket.on("race", () => { S.photoStill = null; });
  // (the camera jumps to the two cars at the line for one frame, so the picture is of them, then goes back)
  function photoShot(f) {
    const c = [...S.cars.values()].find((o) => o.name === f.other) || [...S.cars.values()].find((o) => o.name === f.name);
    if (!c || c.x === undefined || PH.on) { setTimeout(() => photoStill(f), 120); return; }
    const was = S.camTarget, wx = cam.x, wy = cam.y;
    S.camTarget = c.id; cam.x = c.x; cam.y = c.y;
    requestAnimationFrame(() => requestAnimationFrame(() => { photoStill(f); if (S.camTarget === c.id) { S.camTarget = was; cam.x = wx; cam.y = wy; } }));
  }
  function showPhotoStill() {
    const P = S.photoStill, box = $("photoStill"); box.classList.toggle("hidden", !P); if (!P) return;
    $("photoStillImg").src = P.url; $("photoStillCap").textContent = "📸 " + P.cap; $("photoStillDl").href = P.url;
  }
  function showResults(r) {
    showPhotoStill();
    if (r.abandoned && !S.replaying) showAbandoned(r.abandoned);
    { const me = (r.rows || []).findIndex((x) => x.owner === S.me); if (me >= 0 && me < 3 && !S.replaying) setTimeout(() => confettiBurst(me === 0 ? 140 : 80), r.abandoned ? 5400 : 400);
      // your own row: once it has slid in, it pops and flashes like a picked card (sparks if you're on the podium)
      if (me >= 0 && !S.replaying) setTimeout(() => { const tr = $("resBody").querySelector("tr.me"); if (!tr) return; tr.classList.add("you-pop"); setTimeout(() => tr.classList.remove("you-pop"), 1000); if (me < 3) burstFrom(tr.children[1] || tr, ["#ffd75a", "#dfe6ee", "#e0915a"][me], 14, 90); }, (r.abandoned ? 5000 : 0) + 900 + me * 60); }
    S.lastResults = r; $("replayBtn").classList.toggle("hidden", RP.buf.length < 30);
    { const rb = $("rematchBtn"); rb.classList.toggle("hidden", !!S.race?.ranked); rb.disabled = false; rb.textContent = S.host ? "🔁 Rematch now" : "🔁 Vote for a rematch"; }
    $("replaySaveRes").classList.toggle("hidden", RP.buf.length < 30); $("replayShareRes").classList.toggle("hidden", RP.buf.length < 30 || !A.user);
    renderRankedRes();
    renderTeamResults(r);
    $("resTeamsBox").classList.toggle("hidden", r.teams === false);
    const sb = $("seasonBox"); sb.textContent = ""; S.resultsLen = r.season ? 40 : 12;
    clearTimeout(S.finaleTimer);
    // everyone in the room gets the finale (not just whoever is still on the results screen)
    if (r.season) { S.lastSeason = r.season; S.finaleTimer = setTimeout(() => { if (S.screen !== "menu" && S.screen !== "race") openFinale(r.season); }, 7000); }
    if (r.season) {
      const box = document.createElement("div"); box.className = "season-box";
      const h = document.createElement("h3"); h.textContent = `🏆 Season over! (${r.season.races} races)`;
      const champs = document.createElement("div"); champs.className = "champs";
      const col = (label, list) => {
        const d = document.createElement("div"); d.append(label);
        const b = document.createElement("b"); b.textContent = list[0] ? `${list[0].n} (${list[0].p} pts)` : "-"; d.appendChild(b);
        const ol = document.createElement("ol"); list.slice(1, 4).forEach((x) => { const li = document.createElement("li"); li.value = list.indexOf(x) + 1; li.textContent = `${x.n}: ${x.p}`; ol.appendChild(li); }); d.appendChild(ol);
        return d;
      };
      champs.appendChild(col("Driver champion", r.season.drivers));
      if (r.season.teams.length) champs.appendChild(col("Team champion", r.season.teams));
      const see = document.createElement("button"); see.type = "button"; see.className = "btn go fin-open"; see.textContent = "🏆 See how the season went";
      see.addEventListener("click", () => openFinale(r.season));
      box.append(h, champs, see); sb.appendChild(box);
      const me = r.rows.find((x) => x.owner === S.me);
      if (me && r.season.drivers[0]?.n === me.name) setTimeout(() => banner("CHAMPION!", "#ffcc1f"), 1500);
    }
    S.results = r;
    if (S.offer) renderPill();          // keep waiting upgrades, just tucked away during the podium
    $("resTitle").innerHTML = "";
    const mine = r.rows.findIndex((x) => x.owner === S.me);
    $("resTitle").append(mine >= 0 ? `${r.rows[mine].name} finished ` : `Race ${r.raceNo} results `);
    if (mine >= 0) { const s = document.createElement("span"); s.textContent = "P" + (r.multi && r.rows[mine].cls ? r.rows[mine].cpos : mine + 1); $("resTitle").append(s); if (r.multi && r.rows[mine].cls) $("resTitle").append(` in ${CLASSES[r.rows[mine].cls].name}`); }
    // multiclass: who won each class
    const cw = $("classWinLine"); cw.textContent = ""; cw.classList.toggle("hidden", !r.multi);
    if (r.multi) for (const [k, K] of Object.entries(CLASSES)) { const w = r.rows.find((x) => x.cls === k); if (!w) continue; const sp = document.createElement("span"); sp.style.color = K.col; sp.textContent = `${K.icon} ${K.name} winner: ${w.name}`; cw.appendChild(sp); }
    const body = $("resBody"); body.textContent = "";
    r.rows.forEach((x, i) => {
      const tr = document.createElement("tr"); if (x.owner === S.me) tr.className = "me"; tr.style.animationDelay = (0.4 + i * 0.06) + "s";
      const td = (t, cls) => { const d = document.createElement("td"); d.textContent = t; if (cls) d.className = cls; return d; };
      const nm = td(""); const dot = document.createElement("span"); dot.className = "dot"; dot.style.background = x.color; nm.append(dot, `#${x.number} ${x.name}${r.dotd?.name === x.name ? " 🏆" : ""}${S.rival === x.name ? " 🎯" : ""}${x.lead !== undefined && x.lead !== null ? `  👑 ${x.lead.toFixed(1)}s` : ""}`);
      if (r.multi && x.cls) { const ct = document.createElement("span"); ct.className = "cls-tag sm"; ct.style.background = CLASSES[x.cls].col; ct.textContent = `${CLASSES[x.cls].short} P${x.cpos}`; nm.append(" ", ct); }
      tr.append(td(i + 1), nm, td(x.team || ""), td(x.best ? fmt(x.best) : "--", "n"), td(x.pits, "n"), td("+" + x.pts, "n"));
      body.appendChild(tr);
    });
    // Driver of the Day (most places gained)
    grabBestPass();             // (a pass right before the flag: keep what we have of it)
    setTimeout(() => { const n = (RP.reel || []).length; $("reelBtn").classList.toggle("hidden", n < 2); $("reelBtn").textContent = `🎞️ Highlights (${n})`; $("reelShareBtn").classList.toggle("hidden", n < 2 || !A.user); }, 300);
    $("lapChartBox").classList.add("hidden"); $("lapChartBtn").classList.toggle("hidden", !r.rows.some((x) => x.lp && x.lp.length > 1));
    { const C = S.lobby?.cal, cl = $("champRoundLine"), on = !!(C && C.list.length && r.seasonLen);
      cl.classList.toggle("hidden", !on);
      if (on) cl.textContent = r.raceNo >= r.seasonLen ? `🏆 That was the final round (${r.raceNo} of ${r.seasonLen})!` : `🏆 Round ${r.raceNo} of ${r.seasonLen} done. Next up: ${C.list[r.raceNo]?.label || "the next track"}`; }
    { const bp = $("bestPassLine"), x = r.bestPass;
      bp.textContent = x ? `🏎️ Overtake of the race: ${x.an} on ${x.bn} for P${x.pos} (lap ${x.lap})` : ""; bp.classList.toggle("hidden", !x);
      $("bestPassBtn").classList.toggle("hidden", !(x && RP.best && RP.best.d.an === x.an && RP.best.d.bn === x.bn)); }
    const dd = $("dotdLine");
    if (dd) { dd.textContent = r.dotd ? `🏆 Driver of the Day: ${r.dotd.name}, up ${r.dotd.gained} place${r.dotd.gained === 1 ? "" : "s"} (P${r.dotd.grid} → P${r.dotd.pos})${r.dotd.coins ? ` · +${r.dotd.coins} coins` : ""}` : ""; dd.classList.toggle("hidden", !r.dotd); }
    if (r.dotd && r.rows.find((x) => x.name === r.dotd.name)?.owner === S.me) setTimeout(() => banner("🏆 DRIVER OF THE DAY!", "#ffcc1f"), 2200);
    S.podium = r.rows.slice(0, 3); S.podiumAt = performance.now();
    confetti = [];
    if (!reducedMotion) for (let i = 0; i < 120; i++) confetti.push({ x: Math.random(), y: -Math.random() * 0.6, vx: (Math.random() - 0.5) * 0.15, vy: 0.2 + Math.random() * 0.3, r: Math.random() * 6, c: ["#ffcc1f", "#e53935", "#3b82f6", "#3ecf6a", "#fff"][i % 5], s: 4 + Math.random() * 5 });
    sfx(mine === 0 ? "win" : "level");
    S.resultsAt = performance.now();
    setTimeout(() => { show("results"); if (S.offer) renderPill(); }, 1400);
  }
  // ---- Season finale: who won, and a "bump chart" of how everyone moved up and down ----
  const finLerp = (a, b, t) => a + (b - a) * t;
  const FIN_COLORS = ["#ffcc1f", "#4fa3ff", "#ff5a5f", "#3ecf6a", "#c77dff", "#ff9f1c", "#2ec4b6", "#ff70a6", "#a3e635", "#e2e8f0", "#f97316", "#60a5fa"];
  const F = { season: null, kind: "teams", lines: [], hi: null, t0: 0, raf: 0 };
  function finaleData(season, kind) {
    const H = season.history || [], mine = new Set((kind === "teams" ? season.mine?.teams : season.mine?.drivers) || []);
    const last = H.length ? H[H.length - 1][kind] : [];
    // top 10 at the end, plus your own team/driver if they finished lower
    const pick = last.slice(0, Math.min(20, last.length)).map((x) => x.n);
    for (const x of last) if (mine.has(x.n) && !pick.includes(x.n)) pick.push(x.n);
    return pick.map((n, k) => {
      const pos = H.map((snap) => { const i = snap[kind].findIndex((x) => x.n === n); return i >= 0 ? i + 1 : null; });
      const firstPos = pos.find((v) => v !== null), fin = pos[pos.length - 1];
      return { n, pos, pts: last.find((x) => x.n === n)?.p || 0, final: fin, move: firstPos && fin ? firstPos - fin : 0, color: FIN_COLORS[k % FIN_COLORS.length], mine: mine.has(n) };
    });
  }
  function openFinale(season) {
    if (!season?.history?.length) return;
    F.season = season; F.kind = season.teams?.length ? "teams" : "drivers";
    $("finTeams").classList.toggle("hidden", !season.teams?.length);
    $("finKicker").textContent = `Season over after ${season.races} races`;
    const ch = $("finChamps"); ch.textContent = "";
    const hero = (label, list, colors, big) => {
      if (!list?.[0]) return;
      const d = document.createElement("div"); d.className = "fin-champ" + (big ? " big" : "");
      d.style.setProperty("--c", "#ffcc1f");
      const l = document.createElement("span"); l.className = "lbl"; l.textContent = label;
      const n = document.createElement("strong"); n.textContent = list[0].n;
      const p = document.createElement("span"); p.className = "pts"; p.textContent = `${list[0].p} points`;
      d.append(l, n, p); ch.appendChild(d);
    };
    hero("Team champions", season.teams, season.colors?.teams, true);
    hero("Driver champion", season.drivers, season.colors?.drivers, !season.teams?.length);
    $("finale").classList.remove("hidden");
    setFinKind(F.kind);
    sfx("win");
    const myTeam = season.mine?.teams || [], myDrv = season.mine?.drivers || [];
    if (season.teams?.[0] && myTeam.includes(season.teams[0].n)) setTimeout(() => banner("TEAM CHAMPIONS!", "#ffcc1f"), 900);
    else if (season.drivers?.[0] && myDrv.includes(season.drivers[0].n)) setTimeout(() => banner("CHAMPION!", "#ffcc1f"), 900);
  }
  function closeFinale() { $("finale").classList.add("hidden"); cancelAnimationFrame(F.raf); F.raf = 0; }
  function setFinKind(kind) {
    F.kind = kind; F.lines = finaleData(F.season, kind); F.hi = null; F.t0 = performance.now();
    $("finTeams").setAttribute("aria-selected", String(kind === "teams")); $("finDrivers").setAttribute("aria-selected", String(kind === "drivers"));
    const ol = $("finTable"); ol.textContent = "";
    F.lines.forEach((L, i) => {
      const li = document.createElement("li"); li.style.setProperty("--c", L.color); li.style.animationDelay = (0.25 + i * 0.07) + "s";
      if (L.mine) li.classList.add("mine");
      const pos = document.createElement("span"); pos.className = "fp"; pos.textContent = L.final ?? "-";
      const nm = document.createElement("span"); nm.className = "nm"; nm.textContent = L.n;
      const mv = document.createElement("span"); mv.className = "mv " + (L.move > 0 ? "up" : L.move < 0 ? "down" : "same");
      mv.textContent = L.move > 0 ? `▲ ${L.move}` : L.move < 0 ? `▼ ${-L.move}` : "=";
      mv.title = L.move ? `${Math.abs(L.move)} place${Math.abs(L.move) > 1 ? "s" : ""} ${L.move > 0 ? "up" : "down"} since race 1` : "Same place as after race 1";
      const pt = document.createElement("span"); pt.className = "pt"; pt.textContent = L.pts;
      li.append(pos, nm, mv, pt);
      li.addEventListener("pointerenter", () => { F.hi = L.n; }); li.addEventListener("pointerleave", () => { F.hi = null; });
      li.addEventListener("click", () => { F.hi = F.hi === L.n ? null : L.n; });
      ol.appendChild(li);
    });
    if (!F.raf) F.raf = requestAnimationFrame(finLoop);
  }
  $("finTeams").addEventListener("click", () => setFinKind("teams"));
  $("finDrivers").addEventListener("click", () => setFinKind("drivers"));
  $("finClose").addEventListener("click", closeFinale);
  function finLoop(now) {
    F.raf = 0;
    if ($("finale").classList.contains("hidden")) return;
    drawFinChart(now);
    const left = Math.max(0, (S.resultsLen || 12) - Math.floor((now - S.resultsAt) / 1000));
    $("finBack").textContent = S.screen === "results" ? (left > 0 ? `Back to the garage in ${left}s` : "Back to the garage...") : "";
    F.raf = requestAnimationFrame(finLoop);
  }
  function drawFinChart(now) {
    const cv = $("finChart"), w = cv.clientWidth, h = cv.clientHeight, dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (!w || !h) return;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    const c = cv.getContext("2d"); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, w, h);
    const lines = F.lines, R = F.season.history.length;
    const maxPos = Math.max(2, ...lines.flatMap((L) => L.pos.filter((v) => v !== null)));
    const padL = 34, padR = Math.min(150, w * 0.3), padT = 16, padB = 28;
    const X = (i) => padL + (R <= 1 ? (w - padL - padR) / 2 : (i / (R - 1)) * (w - padL - padR));
    const Y = (p) => padT + ((p - 1) / Math.max(1, maxPos - 1)) * (h - padT - padB);
    const ink = getComputedStyle(document.documentElement).getPropertyValue("--soft").trim() || "#aab0bd";
    // grid: one column per race, one row per place
    c.font = "600 11px 'Chakra Petch', sans-serif"; c.textBaseline = "middle";
    for (let i = 0; i < R; i++) {
      c.strokeStyle = "rgba(128,128,140,0.18)"; c.lineWidth = 1; c.beginPath(); c.moveTo(X(i), padT - 6); c.lineTo(X(i), h - padB + 4); c.stroke();
      c.fillStyle = ink; c.textAlign = "center"; c.fillText(`R${i + 1}`, X(i), h - 10);
    }
    const step = maxPos > 16 ? 5 : maxPos > 10 ? 2 : 1;
    c.textAlign = "right";
    for (let p = 1; p <= maxPos; p++) if (p === 1 || p % step === 0) { c.fillStyle = ink; c.fillText(`P${p}`, padL - 8, Y(p)); }
    // lines grow race by race
    const prog = reducedMotion ? R : Math.min(R - 1, ((now - F.t0) / 2600) * Math.max(1, R - 1));
    const order = lines.slice().sort((a, b) => (a.n === F.hi) - (b.n === F.hi) || a.mine - b.mine);
    for (const L of order) {
      const dim = F.hi && F.hi !== L.n;
      c.globalAlpha = dim ? 0.18 : 1;
      c.strokeStyle = L.color; c.lineWidth = L.n === F.hi ? 5 : L.mine ? 4.5 : 2.6; c.lineJoin = "round"; c.lineCap = "round";
      if (L.mine && !dim) { c.shadowColor = L.color; c.shadowBlur = 10; }
      c.beginPath(); let started = false, lx = 0, ly = 0;
      for (let i = 0; i < R; i++) {
        if (L.pos[i] === null) { started = false; continue; }
        if (i > prog + 1e-6) {
          // partly drawn segment to the next race
          if (started && i - 1 <= prog && L.pos[i - 1] !== null) { const f = prog - (i - 1); const x = finLerp(X(i - 1), X(i), f), y = finLerp(Y(L.pos[i - 1]), Y(L.pos[i]), f); c.lineTo(x, y); lx = x; ly = y; }
          break;
        }
        const x = X(i), y = Y(L.pos[i]);
        started ? c.lineTo(x, y) : c.moveTo(x, y); started = true; lx = x; ly = y;
      }
      c.stroke(); c.shadowBlur = 0;
      c.fillStyle = L.color;
      for (let i = 0; i < R && i <= prog + 1e-6; i++) if (L.pos[i] !== null) { c.beginPath(); c.arc(X(i), Y(L.pos[i]), L.mine || L.n === F.hi ? 4.5 : 3.2, 0, Math.PI * 2); c.fill(); }
      // name label once the line reaches the last race
      if (prog >= R - 1 - 1e-6 && L.final) {
        c.textAlign = "left"; c.font = `${L.mine || L.n === F.hi ? 700 : 600} 12px 'Chakra Petch', sans-serif`;
        const label = L.n.length > 16 ? L.n.slice(0, 15) + "…" : L.n;
        c.fillText(`${L.final}. ${label}`, X(R - 1) + 10, Y(L.final));
      }
      c.globalAlpha = 1;
    }
  }
  function drawPodium(now) {
    const cv = $("podium"), r = cv.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (!r.width) return;
    if (cv.width !== Math.round(r.width * dpr)) { cv.width = r.width * dpr; cv.height = r.height * dpr; }
    const c = cv.getContext("2d"); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, r.width, r.height);
    const w = r.width, h = r.height, k = Math.min(1, (now - S.podiumAt - 1400) / 700);
    const steps = [[1, 0.5, 70], [0, 0.22, 50], [2, 0.78, 35]];
    for (const [i, fx, ph] of steps) {
      const car = S.podium[i]; if (!car) continue;
      const rise = Math.max(0, Math.min(1, k * 1.4 - (i === 0 ? 0.4 : i === 1 ? 0 : 0.2)));
      const x = w * fx, stepH = ph * rise;
      c.fillStyle = ["#ffcc1f", "#cfd8dc", "#d7a26b"][i]; c.fillRect(x - 50, h - stepH, 100, stepH);
      c.fillStyle = "#1b1b1b"; c.font = "400 22px 'Russo One', sans-serif"; c.textAlign = "center"; c.fillText(String(i + 1), x, h - stepH + 26);
      if (rise > 0.1) {
        drawCar(c, car, x, h - stepH - 18 - (reducedMotion ? 0 : Math.abs(Math.sin(now / 300 + i)) * 4), -Math.PI / 2 + 0.0001, 1.2, { glow: car.owner === S.me });
        c.fillStyle = "#fff"; c.font = "700 13px 'Chakra Petch', sans-serif"; c.fillText(car.name, x, h - stepH - 50);
      }
    }
    c.globalAlpha = 1;
    for (const p of confetti) {
      p.x += p.vx * 0.016; p.y += p.vy * 0.016; p.r += 0.1;
      if (p.y > 1.1) { p.y = -0.1; p.x = Math.random(); }
      c.save(); c.translate(p.x * w, p.y * h); c.rotate(p.r); c.fillStyle = p.c; c.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); c.restore();
    }
    const left = Math.max(0, (S.resultsLen || 12) - Math.floor((now - S.resultsAt) / 1000));
    $("backText").textContent = left > 0 ? `Back to the garage in ${left}s` : "Back to the garage...";
    if (left <= 0 && S.lobby?.phase === "lobby") show("lobby");
  }

  // ======================= Race rendering =======================
  const scr = { w: 0, h: 0, dpr: 1 };
  // race view sharpness: the screen's pixel ratio (max 2), times a scale that Auto turns down when frames take too
  // long (and back up when there's room). Fast = 1x pixels and lighter effects.
  const GFX = { scale: 1, slow: 0, fast: 0, at: 0, ema: 16.7 };
  function maxDpr() { const d = Math.min(window.devicePixelRatio || 1, 2); return settings.gfx === "fast" ? Math.min(1, d) : d; }
  function gfxTick(ms, now) {
    if (GFX.mode !== settings.gfx) { GFX.mode = settings.gfx; GFX.scale = 1; GFX.ema = 16.7; resize(); }          // (the setting was changed)
    if (settings.gfx !== "auto" || S.screen !== "race" || document.hidden || ms > 250) return;
    GFX.ema += (ms - GFX.ema) * 0.05;
    if (now - GFX.at < 1500) return; GFX.at = now;
    const d = maxDpr(), min = Math.max(0.6, 0.75 / d);
    if (GFX.ema > 21 && GFX.scale > min) { GFX.scale = Math.max(min, GFX.scale - 0.15); GFX.fast = 0; resize(); }           // under ~48 fps: less sharp
    else if (GFX.ema < 17.8) { if (++GFX.fast >= 4 && GFX.scale < 1) { GFX.fast = 0; GFX.scale = Math.min(1, GFX.scale + 0.1); resize(); } }   // smooth for a while: sharper again
    else GFX.fast = 0;
  }
  function resize() {
    scr.dpr = Math.max(0.5, maxDpr() * (settings.gfx === "auto" ? GFX.scale : 1)); scr.w = window.innerWidth; scr.h = window.innerHeight;
    view.width = scr.w * scr.dpr; view.height = scr.h * scr.dpr;
    const mw = mini.getBoundingClientRect().width || 180, mh = mini.getBoundingClientRect().height || 130;
    mini.width = mw * scr.dpr; mini.height = mh * scr.dpr;
  }
  window.addEventListener("resize", () => { resize(); if (settings.ui === "auto") applySettings(); });
  const cam = { x: 0, y: 0, z: 1 };
  const hwAt = (t, i) => (t.hw ? t.hw[i] : t.trackW / 2);
  // same pit lane math as the server (the lane sits a fixed gap outside the road edge)
  function lanePointW(t, k) {
    const pl = t.pitLane, i = ((pl.entry + Math.floor(k)) % t.N + t.N) % t.N, j = (i + 1) % t.N, f = k - Math.floor(k);
    const ramp = clamp(Math.min(k, pl.len - k) / 5, 0, 1), off = pl.side * (hwAt(t, i) + (pl.gap ?? 62)) * ramp;
    return { x: t.pts[i].x + (t.pts[j].x - t.pts[i].x) * f + t.nor[i].x * off, y: t.pts[i].y + (t.pts[j].y - t.pts[i].y) * f + t.nor[i].y * off, i };
  }
  // indices of each raised (bridge) stretch of the track
  function elevSegments(t) {
    const out = []; if (!t.elev) return out;
    let cur = null;
    for (let i = 0; i < t.N; i++) {
      if (t.elev[i] > 0.02) { if (!cur) cur = []; cur.push(i); }
      else if (cur) { out.push(cur); cur = null; }
    }
    if (cur) { if (out.length && out[0][0] === 0) out[0] = [...cur, ...out[0]]; else out.push(cur); }
    return out;
  }
  const GRAVEL = { grass: "#d9c9a0", desert: "#caa06a", snow: "#cfd8df", night: "#5b5341", autumn: "#c9a877", beach: "#f5ebc8", city: "#a9adb3", volcano: "#5a4038", neon: "#2c2150" };
  // The road is drawn as "runs": stretches where the width is (almost) the same, each stroked
  // with its own line width. Width changes are gradual, so the joins are invisible.
  function widthRuns(t, idxs, cum, closed) {
    const runs = [], qz = (i) => Math.round(hwAt(t, i) / 2) * 2;
    let a = 0;
    for (let k = 1; k <= idxs.length; k++) {
      if (k < idxs.length && qz(idxs[k]) === qz(idxs[a])) continue;
      const p = new Path2D(), end = Math.min(idxs.length - 1, k);
      for (let m = a; m <= end; m++) { const q = t.pts[idxs[m]]; m === a ? p.moveTo(q.x, q.y) : p.lineTo(q.x, q.y); }
      if (closed && a === 0 && k === idxs.length) { p.lineTo(t.pts[idxs[0]].x, t.pts[idxs[0]].y); p.closePath(); }
      runs.push({ p, hw: qz(idxs[a]), dash: cum[idxs[a]] });
      a = k;
    }
    return runs;
  }
  // Build everything about the track that never changes (once per track).
  let geoSeq = 0;
  function buildGeo(t) {
    const N = t.N, g = { id: ++geoSeq, gravel: new Path2D(), lane: new Path2D(), wall: new Path2D(), garages: [] };
    const cum = [0];
    for (let i = 1; i <= N; i++) cum.push(cum[i - 1] + Math.hypot(t.pts[i % N].x - t.pts[i - 1].x, t.pts[i % N].y - t.pts[i - 1].y));
    g.cum = cum;
    // start the runs where the width changes (so the loop's end joins the start cleanly)
    let s0 = 0; const qz = (i) => Math.round(hwAt(t, i) / 2) * 2;
    for (let i = 0; i < N; i++) if (qz(i) !== qz((i - 1 + N) % N)) { s0 = i; break; }
    const all = Array.from({ length: N + 1 }, (_, k) => (s0 + k) % N);
    const uniform = all.every((i) => qz(i) === qz(all[0]));
    g.runs = uniform ? widthRuns(t, all.slice(0, N), cum, true) : widthRuns(t, all, cum, false);
    const segs = [];
    let i = 0;
    while (i < N) {
      if (!t.gravel[i]) { i++; continue; }
      const side = t.gravel[i], from = i;
      while (i < N && t.gravel[i] === side) i++;
      segs.push([from, i - 1, side]);
    }
    for (const [a, b, side] of segs) {
      const inner = [], outer = [];
      for (let k = a; k <= b; k++) {
        const p = t.pts[k], n = t.nor[k], hw = hwAt(t, k);
        inner.push([p.x + n.x * side * (hw + 14), p.y + n.y * side * (hw + 14)]);
        outer.push([p.x + n.x * side * (hw + 140), p.y + n.y * side * (hw + 140)]);
      }
      [...inner, ...outer.reverse()].forEach((q, j) => (j ? g.gravel.lineTo(q[0], q[1]) : g.gravel.moveTo(q[0], q[1])));
      g.gravel.closePath();
    }
    const pl = t.pitLane;
    for (let k = 0; k <= pl.len; k += 0.5) { const q = lanePointW(t, k); k ? g.lane.lineTo(q.x, q.y) : g.lane.moveTo(q.x, q.y); }
    for (let k = 5; k <= pl.len - 5; k += 0.5) {
      const q = lanePointW(t, k), n = t.nor[q.i], hw = hwAt(t, q.i);
      const px = t.pts[q.i].x + n.x * pl.side * (hw + 24), py = t.pts[q.i].y + n.y * pl.side * (hw + 24);
      k > 5 ? g.wall.lineTo(px, py) : g.wall.moveTo(px, py);
    }
    const teamColor = {};
    for (const c of (S.race?.info ? S.race.info.values() : [])) if (!teamColor[c.team]) teamColor[c.team] = c.color;
    for (const [team, k] of Object.entries(pl.boxes || {})) {
      const q = lanePointW(t, k), n = t.nor[q.i], tn = t.tan[q.i];
      g.garages.push({ x: q.x + n.x * pl.side * 52, y: q.y + n.y * pl.side * 52, sx: q.x, sy: q.y, ang: Math.atan2(tn.y, tn.x), team, color: teamColor[team] || "#666" });
    }
    g.entry = lanePointW(t, 2); g.exit = lanePointW(t, pl.len - 2);
    // Bridges: each raised stretch is redrawn on top in the same style (so the ramps blend in),
    // with a shadow that slides out as the road climbs and concrete barriers along the top.
    // They're sorted low to high, so a double ramp is drawn over the bridge it crosses.
    const P = (k, off, e, shift) => ({ x: t.pts[k].x + t.nor[k].x * off + (shift ? 18 * e : 0), y: t.pts[k].y + t.nor[k].y * off + (shift ? 26 * e : 0) });
    const poly = (list) => { const p = new Path2D(); list.forEach((q, k) => (k ? p.lineTo(q.x, q.y) : p.moveTo(q.x, q.y))); p.closePath(); return p; };
    g.segOf = new Int16Array(N).fill(-1);
    g.bridges = elevSegments(t).map((seg) => {
      const first = seg[0], last = seg[seg.length - 1], w = (k) => (k + N) % N;
      const idxs = [w(first - 2), w(first - 1), ...seg, w(last + 1), w(last + 2)];
      const peak = Math.max(...seg.map((k) => t.elev[k]));
      const shadow = poly([...idxs.map((k) => P(k, hwAt(t, k) + 10, Math.min(1.6, t.elev[k]), true)), ...idxs.slice().reverse().map((k) => P(k, -(hwAt(t, k) + 10), Math.min(1.6, t.elev[k]), true))]);
      const high = idxs.filter((k) => t.elev[k] >= 0.5), walls = [];
      if (high.length > 1) for (const side of [-1, 1]) {
        walls.push({
          fill: poly([...high.map((k) => P(k, side * (hwAt(t, k) + 7))), ...high.slice().reverse().map((k) => P(k, side * (hwAt(t, k) + 17)))]),
          top: (() => { const p = new Path2D(); high.forEach((k, m) => { const q = P(k, side * (hwAt(t, k) + 16)); m ? p.lineTo(q.x, q.y) : p.moveTo(q.x, q.y); }); return p; })(),
        });
      }
      // expansion joints across the ramps so you can see the road climbing
      const joints = new Path2D();
      for (let m = 0; m < idxs.length; m += 2) { const k = idxs[m], e = t.elev[k]; if (e < 0.08 || e > peak - 0.05) continue; const a = P(k, hwAt(t, k) - 4), b = P(k, -(hwAt(t, k) - 4)); joints.moveTo(a.x, a.y); joints.lineTo(b.x, b.y); }
      return { idxs, seg, peak, shadow, walls, joints, runs: widthRuns(t, idxs, cum, false), top: widthRuns(t, [w(first - 3), ...idxs, w(last + 3)], cum, false) };
    }).sort((a, b) => a.peak - b.peak);
    // every bit of road a bridge's deck is drawn over (ramps + the few points either side) belongs
    // to that bridge: a car there is drawn right after it, so it never slips under its own ramp
    g.bridges.forEach((br, k) => { const a = br.seg[0], b = br.seg[br.seg.length - 1]; for (let d = -5; d <= b - a + 5 + (b < a ? N : 0); d++) g.segOf[(a + d + N) % N] = k; });
    if (t.line) { g.line = new Path2D(); t.pts.forEach((p, k) => { const x = p.x + t.nor[k].x * t.line[k], y = p.y + t.nor[k].y * t.line[k]; k ? g.line.lineTo(x, y) : g.line.moveTo(x, y); }); g.line.closePath(); }
    g.trackPath = new Path2D(); t.pts.forEach((p, k) => (k ? g.trackPath.lineTo(p.x, p.y) : g.trackPath.moveTo(p.x, p.y))); g.trackPath.closePath();
    return g;
  }
  // textures (made once)
  const texCache = {};
  function tex(kind, th) {
    const key = kind + (th.ground || "");
    if (texCache[key]) return texCache[key];
    const cv = document.createElement("canvas"); cv.width = cv.height = 256;
    const c = cv.getContext("2d");
    let seed = kind === "gravel" ? 7 : 11; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    if (kind === "gravel") { c.fillStyle = GRAVEL[th.key] || GRAVEL.grass; c.fillRect(0, 0, 256, 256); for (let i = 0; i < 900; i++) { c.fillStyle = i % 3 ? "rgba(0,0,0,0.1)" : "rgba(255,255,255,0.12)"; c.fillRect(rnd() * 256, rnd() * 256, 2 + rnd() * 2, 2 + rnd() * 2); } }
    else {
      c.fillStyle = th.ground; c.fillRect(0, 0, 256, 256);
      // every pattern repeats cleanly every 256px, so the tiles join up without seams
      const T = th.tex;
      if (T === "stripes") { c.fillStyle = "rgba(255,255,255,0.045)"; for (let x = 0; x < 256; x += 64) c.fillRect(x, 0, 32, 256); }
      if (T === "dunes") { c.strokeStyle = "rgba(120,80,30,0.13)"; c.lineWidth = 2.5; for (let y = 8; y < 256; y += 21) { c.beginPath(); for (let x = 0; x <= 256; x += 4) c.lineTo(x, y + Math.sin((x / 256) * Math.PI * 4 + y) * 5); c.stroke(); } }
      if (T === "drifts") { for (let i = 0; i < 26; i++) { const x = rnd() * 256, y = rnd() * 256, r = 14 + rnd() * 30; for (const [ox, oy] of [[0, 0], [256, 0], [-256, 0], [0, 256], [0, -256]]) { const g = c.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r); g.addColorStop(0, "rgba(255,255,255,0.55)"); g.addColorStop(1, "rgba(255,255,255,0)"); c.fillStyle = g; c.fillRect(x + ox - r, y + oy - r, r * 2, r * 2); } } }
      if (T === "slabs") { c.strokeStyle = "rgba(0,0,0,0.16)"; c.lineWidth = 2; for (let y = 0; y < 256; y += 32) { c.beginPath(); c.moveTo(0, y); c.lineTo(256, y); c.stroke(); for (let x = (y / 32) % 2 ? 0 : 32; x < 256; x += 64) { c.beginPath(); c.moveTo(x, y); c.lineTo(x, y + 32); c.stroke(); } } }
      if (T === "grid") { c.strokeStyle = "rgba(170,90,255,0.22)"; c.lineWidth = 1.5; for (let v = 0; v < 256; v += 32) { c.beginPath(); c.moveTo(v, 0); c.lineTo(v, 256); c.moveTo(0, v); c.lineTo(256, v); c.stroke(); } }
      if (T === "lava") { c.lineCap = "round"; for (let i = 0; i < 7; i++) { let x = rnd() * 256, y = rnd() * 256; c.beginPath(); c.moveTo(x, y); for (let k = 0; k < 6; k++) { x += (rnd() - 0.5) * 50; y += (rnd() - 0.5) * 50; c.lineTo(x, y); } c.strokeStyle = "rgba(255,80,10,0.18)"; c.lineWidth = 7; c.stroke(); c.strokeStyle = "rgba(255,170,40,0.55)"; c.lineWidth = 1.8; c.stroke(); } }
      if (T === "leaves") { for (let i = 0; i < 160; i++) { c.fillStyle = ["rgba(230,120,30,0.5)", "rgba(200,60,30,0.45)", "rgba(240,190,60,0.45)"][i % 3]; c.save(); c.translate(rnd() * 256, rnd() * 256); c.rotate(rnd() * 6.3); c.beginPath(); c.ellipse(0, 0, 4, 2, 0, 0, Math.PI * 2); c.fill(); c.restore(); } }
      for (let i = 0; i < 420; i++) { c.fillStyle = th.speck[i % 2]; c.fillRect(rnd() * 256, rnd() * 256, 2 + rnd() * 4, 2 + rnd() * 4); }
    }
    return (texCache[key] = cv);
  }
  function strokeRuns(c, runs, extra, color, dash) {
    c.strokeStyle = color;
    for (const r of runs) {
      c.lineWidth = r.hw * 2 + extra;
      if (dash) { c.setLineDash(dash); c.lineDashOffset = r.dash; }
      c.stroke(r.p);
    }
    if (dash) { c.setLineDash([]); c.lineDashOffset = 0; }
  }
  // Everything that never moves: ground, gravel, pit lane, the road, kerbs, garages, start line.
  // ======================= Scenery: buildings, trees and props around the track =======================
  // Made once per track + theme with a seeded random, so it's the same for everyone in the room.
  function seeded(seed) { return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let x = Math.imul(seed ^ (seed >>> 15), 1 | seed); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; }; }
  function buildDecor(t, G, theme) {
    const key = theme; G.decor = G.decor || {};
    if (G.decor[key]) return G.decor[key];
    let seed = 7; for (let i = 0; i < t.N; i += 17) seed = (seed * 31 + Math.round(t.pts[i].x + t.pts[i].y * 3)) | 0;
    const R = seeded(seed ^ theme.length * 999);
    // blocked area: the road + run-off + a gap, the pit lane and garages
    const CELL = 40, cw = Math.ceil(t.W / CELL) + 1, ch = Math.ceil(t.H / CELL) + 1, used = new Uint8Array(cw * ch);
    const block = (x, y, r) => { for (let gy = Math.max(0, Math.floor((y - r) / CELL)); gy <= Math.min(ch - 1, Math.floor((y + r) / CELL)); gy++) for (let gx = Math.max(0, Math.floor((x - r) / CELL)); gx <= Math.min(cw - 1, Math.floor((x + r) / CELL)); gx++) { const dx = gx * CELL + CELL / 2 - x, dy = gy * CELL + CELL / 2 - y; if (dx * dx + dy * dy < (r + CELL * 0.7) ** 2) used[gy * cw + gx] = 1; } };
    const pl = t.pitLane || {};
    for (let i = 0; i < t.N; i += 2) {
      const inPit = pl.len && ((i - pl.entry + t.N) % t.N) < pl.len + 6;
      block(t.pts[i].x, t.pts[i].y, t.hw[i] + (inPit ? 200 : theme === "city" || theme === "neon" ? 55 : 80));
    }
    for (const g of G.garages || []) block(g.x, g.y, 80);
    const free = (x, y, r) => {
      if (x - r < 0 || y - r < 0 || x + r > t.W || y + r > t.H) return false;
      for (let gy = Math.floor((y - r) / CELL); gy <= Math.floor((y + r) / CELL); gy++) for (let gx = Math.floor((x - r) / CELL); gx <= Math.floor((x + r) / CELL); gx++) if (used[gy * cw + gx]) return false;
      return true;
    };
    const items = [];
    const put = (it) => { items.push(it); block(it.x, it.y, it.r); };
    // grandstands along the start straight, both sides if there's room
    const st = 0;
    for (const side of [-1, 1]) for (const k of [-2, 2, 6]) {
      const i = (st + Math.round(k * 120 / (t.length / t.N)) + t.N * 4) % t.N, p = t.pts[i], n = t.nor[i], tn = t.tan[i];
      const off = t.hw[i] + 150, x = p.x + n.x * off * side, y = p.y + n.y * off * side;
      if (free(x, y, 70)) put({ k: "stand", x, y, r: 75, ang: Math.atan2(tn.y, tn.x), side, w: 220, h: 60 });
    }
    // what grows / stands where, per theme
    const P = {
      grass:   { b: 0.18, bk: "farm", t: ["tree", "tree", "tree", "bush", "hay"] },
      night:   { b: 0.2, bk: "farm", t: ["tree", "tree", "lamp", "bush"] },
      desert:  { b: 0.12, bk: "adobe", t: ["cactus", "cactus", "rock", "rock", "tumble"] },
      snow:    { b: 0.14, bk: "cabin", t: ["pine", "pine", "pine", "snowman", "rock"] },
      autumn:  { b: 0.16, bk: "farm", t: ["fall", "fall", "fall", "hay", "pumpkin"] },
      beach:   { b: 0.12, bk: "hut", t: ["palm", "palm", "umbrella", "umbrella", "towel"] },
      city:    { b: 0.75, bk: "office", t: ["tree", "car", "car"] },
      volcano: { b: 0.1, bk: "bunker", t: ["rock", "rock", "lava", "vent", "rock"] },
      neon:    { b: 0.8, bk: "cyber", t: ["holo", "lampNeon", "car"] },
    }[theme] || { b: 0.15, bk: "farm", t: ["tree"] };
    const area = (t.W * t.H) / 1e6, tries = Math.round(area * (theme === "city" || theme === "neon" ? 700 : 300));
    if (theme === "volcano") for (let k = 0; k < 20; k++) { const r = 180 + R() * 120, x = r + R() * (t.W - 2 * r), y = r + R() * (t.H - 2 * r); if (free(x, y, r)) { put({ k: "volcano", x, y, r }); break; } }
    if (theme === "beach") { // a strip of sea along the emptiest edge
      for (const edge of ["top", "bottom", "left", "right"]) {
        const sea = { k: "sea", edge, depth: 170, x: t.W / 2, y: t.H / 2, r: 0 };
        let ok = 0, tot = 0;
        for (let q = 0; q < 1; q += 0.05) { tot++; const x = edge === "left" ? 90 : edge === "right" ? t.W - 90 : q * t.W, y = edge === "top" ? 90 : edge === "bottom" ? t.H - 90 : q * t.H; if (free(x, y, 80)) ok++; }
        if (ok / tot > 0.85) { items.push(sea); break; }
      }
    }
    for (let k = 0; k < tries; k++) {
      const x = R() * t.W, y = R() * t.H;
      if (R() < P.b) {
        const big = P.bk === "office" || P.bk === "cyber";
        const w = big ? 70 + R() * 130 : 60 + R() * 50, h = big ? 70 + R() * 130 : 45 + R() * 35, r = Math.hypot(w, h) / 2;
        if (free(x, y, r)) put({ k: P.bk, x, y, r, w, h, ang: big ? (R() < 0.7 ? 0 : (R() - 0.5) * 0.5) : R() * Math.PI, hgt: big ? 20 + R() * 60 : 10, s: R(), c: Math.floor(R() * 6) });
      } else {
        const kind = P.t[Math.floor(R() * P.t.length)], r = { tree: 20 + R() * 16, fall: 20 + R() * 16, pine: 16 + R() * 12, palm: 22 + R() * 10, bush: 10 + R() * 6, car: 14, holo: 26, lamp: 8, lampNeon: 8 }[kind] || 12 + R() * 8;
        if (free(x, y, r)) put({ k: kind, x, y, r, ang: R() * Math.PI * 2, s: R(), c: Math.floor(R() * 6) });
      }
    }
    // draw order: sea, ground stuff, then taller things on top
    const layer = { sea: 0, volcano: 1, lava: 1, towel: 1, vent: 1, stand: 2 };
    items.sort((a, b) => (layer[a.k] ?? 3) - (layer[b.k] ?? 3) || a.y - b.y);
    return (G.decor[key] = items);
  }
  const shadowCol = "rgba(0,0,0,0.28)";
  function blob(c, x, y, r, col) { c.fillStyle = col; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); }
  function drawDecor(c, t, G, th, opts) {
    const items = buildDecor(t, G, th.key || "grass");
    const x0 = opts.x0 ?? 0, y0 = opts.y0 ?? 0, x1 = x0 + (opts.w ?? t.W), y1 = y0 + (opts.h ?? t.H);
    const glow = th.key === "neon" || th.key === "night";
    let n = 0;
    for (const d of items) {
      if (opts.lite && d.k !== "stand" && d.k !== "sea" && (n++ % 4 !== 0 || d.k === "car" || d.k === "lamp" || d.k === "lampNeon" || d.k === "holo" || d.k === "lava" || d.k === "vent" || d.k === "towel" || d.k === "umbrella")) continue;
      if (d.k !== "sea" && (d.x + d.r + 40 < x0 || d.y + d.r + 40 < y0 || d.x - d.r - 40 > x1 || d.y - d.r - 40 > y1)) continue;
      const { x, y, r } = d;
      switch (d.k) {
        case "sea": {
          const D = d.depth, g = d.edge === "top" ? c.createLinearGradient(0, 0, 0, D) : d.edge === "bottom" ? c.createLinearGradient(0, t.H, 0, t.H - D) : d.edge === "left" ? c.createLinearGradient(0, 0, D, 0) : c.createLinearGradient(t.W, 0, t.W - D, 0);
          g.addColorStop(0, "#1f8fb0"); g.addColorStop(0.75, "#35b8cf"); g.addColorStop(1, "rgba(120,220,230,0.9)");
          c.fillStyle = g;
          if (d.edge === "top") c.fillRect(0, 0, t.W, D); else if (d.edge === "bottom") c.fillRect(0, t.H - D, t.W, D); else if (d.edge === "left") c.fillRect(0, 0, D, t.H); else c.fillRect(t.W - D, 0, D, t.H);
          c.strokeStyle = "rgba(255,255,255,0.35)"; c.lineWidth = 3;
          for (let w = 30; w < D - 20; w += 38) { c.beginPath(); for (let q = 0; q <= 1.001; q += 0.02) { const L = d.edge === "top" || d.edge === "bottom" ? t.W : t.H, a = q * L, b = w + Math.sin(q * 40 + w) * 5; const px = d.edge === "top" || d.edge === "bottom" ? a : d.edge === "left" ? b : t.W - b, py = d.edge === "top" ? b : d.edge === "bottom" ? t.H - b : a; q ? c.lineTo(px, py) : c.moveTo(px, py); } c.stroke(); }
          break;
        }
        case "stand": {
          c.save(); c.translate(x, y); c.rotate(d.ang);
          c.fillStyle = shadowCol; c.fillRect(-d.w / 2 + 8, -d.h / 2 + 10, d.w, d.h);
          c.fillStyle = "#5c6470"; c.fillRect(-d.w / 2, -d.h / 2, d.w, d.h);
          const R2 = seeded(Math.round(x * 7 + y));
          for (let row = 0; row < 5; row++) for (let q = 0; q < 26; q++) { c.fillStyle = ["#e53935", "#ffcc1f", "#1e88e5", "#fff", "#43a047", "#ff7043"][Math.floor(R2() * 6)]; c.fillRect(-d.w / 2 + 6 + q * 8.2, -d.h / 2 + 8 + row * 9, 5, 5); }
          c.fillStyle = "rgba(255,255,255,0.85)"; c.fillRect(-d.w / 2, (d.side > 0 ? -d.h / 2 - 6 : d.h / 2), d.w, 6);
          c.restore(); break;
        }
        case "tree": case "fall": case "bush": {
          const pal = d.k === "fall" ? [["#d9621f", "#f08a3a"], ["#b8321f", "#d9553a"], ["#e0a526", "#f3c44a"]][d.c % 3] : th.key === "night" ? ["#1f3a24", "#2b4d31"] : ["#2f6b2a", "#3f8a36"];
          blob(c, x + r * 0.35, y + r * 0.4, r, shadowCol);
          blob(c, x, y, r, pal[0]); blob(c, x - r * 0.25, y - r * 0.25, r * 0.62, pal[1]);
          blob(c, x - r * 0.4, y - r * 0.4, r * 0.22, "rgba(255,255,255,0.12)"); break;
        }
        case "pine": {
          blob(c, x + r * 0.3, y + r * 0.35, r, shadowCol);
          for (const [k2, col] of [[1, "#1f4d34"], [0.68, "#2a6444"], [0.36, "#3b7d57"]]) { c.fillStyle = col; c.beginPath(); for (let a = 0; a < 16; a++) { const rr = (a % 2 ? 0.62 : 1) * r * k2, an = (a / 16) * Math.PI * 2 + d.ang; c.lineTo(x + Math.cos(an) * rr, y + Math.sin(an) * rr); } c.fill(); }
          if (th.key === "snow") { blob(c, x - r * 0.2, y - r * 0.2, r * 0.45, "rgba(255,255,255,0.8)"); } break;
        }
        case "palm": {
          blob(c, x + 8, y + 10, r * 0.8, shadowCol);
          c.strokeStyle = "#2f8a3a"; c.lineCap = "round";
          for (let a = 0; a < 7; a++) { const an = d.ang + a * 0.9; c.lineWidth = 7; c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + Math.cos(an) * r * 0.6, y + Math.sin(an) * r * 0.6 - 4, x + Math.cos(an) * r, y + Math.sin(an) * r); c.stroke(); }
          blob(c, x, y, 5, "#7a5230"); break;
        }
        case "cactus": {
          blob(c, x + 6, y + 7, r * 0.6, shadowCol); c.fillStyle = "#3f8f4a"; c.strokeStyle = "#2a6a33"; c.lineWidth = 2;
          c.save(); c.translate(x, y); c.rotate(d.ang);
          rrect(c, -5, -r * 0.8, 10, r * 1.6, 5); c.fill(); c.stroke(); rrect(c, -r * 0.6, -4, r * 1.2, 8, 4); c.fill(); c.stroke(); c.restore(); break;
        }
        case "rock": {
          c.fillStyle = shadowCol; c.beginPath(); c.ellipse(x + 5, y + 6, r, r * 0.8, d.ang, 0, Math.PI * 2); c.fill();
          c.fillStyle = th.key === "volcano" ? "#3b3330" : th.key === "snow" ? "#9aa5b1" : "#9c8468";
          c.beginPath(); for (let a = 0; a < 7; a++) { const an = d.ang + (a / 7) * Math.PI * 2, rr = r * (0.75 + ((a * 37 + d.c) % 5) * 0.07); c.lineTo(x + Math.cos(an) * rr, y + Math.sin(an) * rr); } c.fill();
          c.fillStyle = "rgba(255,255,255,0.12)"; c.beginPath(); c.arc(x - r * 0.3, y - r * 0.3, r * 0.35, 0, Math.PI * 2); c.fill(); break;
        }
        case "volcano": {
          for (const [k2, col] of [[1, "#3a2c27"], [0.78, "#4a3830"], [0.52, "#5b463b"], [0.3, "#2a1a14"]]) blob(c, x, y, r * k2, col);
          const g = c.createRadialGradient(x, y, 0, x, y, r * 0.28); g.addColorStop(0, "#ffdf6b"); g.addColorStop(0.5, "#ff6a1a"); g.addColorStop(1, "rgba(255,60,10,0)");
          c.fillStyle = g; c.beginPath(); c.arc(x, y, r * 0.28, 0, Math.PI * 2); c.fill();
          c.strokeStyle = "rgba(255,110,30,0.6)"; c.lineWidth = 4; for (let a = 0; a < 5; a++) { const an = d.s * 6 + a * 1.3; c.beginPath(); c.moveTo(x + Math.cos(an) * r * 0.3, y + Math.sin(an) * r * 0.3); c.lineTo(x + Math.cos(an + 0.2) * r * 0.9, y + Math.sin(an + 0.2) * r * 0.9); c.stroke(); }
          break;
        }
        case "lava": case "vent": {
          const g = c.createRadialGradient(x, y, 0, x, y, r * 1.3); g.addColorStop(0, "#ffd54a"); g.addColorStop(0.45, "#ff6a1a"); g.addColorStop(1, "rgba(120,20,0,0)");
          c.fillStyle = g; c.beginPath(); c.ellipse(x, y, r * 1.3, r, d.ang, 0, Math.PI * 2); c.fill(); break;
        }
        case "hay": { blob(c, x + 4, y + 5, r * 0.8, shadowCol); blob(c, x, y, r * 0.8, "#d8b44a"); c.strokeStyle = "#b8922e"; c.lineWidth = 2; c.beginPath(); c.arc(x, y, r * 0.45, 0, Math.PI * 2); c.stroke(); break; }
        case "pumpkin": { blob(c, x, y, r * 0.6, "#e8791f"); blob(c, x, y - r * 0.5, 2.5, "#3f6b2a"); break; }
        case "snowman": { blob(c, x + 4, y + 4, r * 0.8, shadowCol); blob(c, x, y, r * 0.8, "#fff"); blob(c, x, y, r * 0.45, "#f1f5f9"); blob(c, x + 2, y, 2, "#ff7a1a"); break; }
        case "tumble": { c.strokeStyle = "#a3824f"; c.lineWidth = 1.5; for (let a = 0; a < 6; a++) { c.beginPath(); c.arc(x + a - 3, y, r * 0.7, a, a + 4); c.stroke(); } break; }
        case "umbrella": {
          blob(c, x + 6, y + 7, r, shadowCol);
          const cols = [["#e53935", "#fff"], ["#1e88e5", "#fff"], ["#ffcc1f", "#ff7043"]][d.c % 3];
          for (let a = 0; a < 8; a++) { c.fillStyle = cols[a % 2]; c.beginPath(); c.moveTo(x, y); c.arc(x, y, r, d.ang + (a / 8) * Math.PI * 2, d.ang + ((a + 1) / 8) * Math.PI * 2); c.fill(); }
          break;
        }
        case "towel": { c.save(); c.translate(x, y); c.rotate(d.ang); c.fillStyle = ["#ff70a6", "#2ec4b6", "#ffcc1f"][d.c % 3]; c.fillRect(-r, -r * 0.45, r * 2, r * 0.9); c.fillStyle = "rgba(255,255,255,0.6)"; c.fillRect(-r, -r * 0.1, r * 2, r * 0.2); c.restore(); break; }
        case "car": {
          c.save(); c.translate(x, y); c.rotate(Math.round(d.ang / (Math.PI / 2)) * (Math.PI / 2));
          c.fillStyle = shadowCol; c.fillRect(-10, -5, 24, 13);
          c.fillStyle = ["#e53935", "#1e88e5", "#f5f5f5", "#333", "#ffcc1f", "#43a047"][d.c]; rrect(c, -12, -6, 24, 12, 3); c.fill();
          c.fillStyle = "rgba(20,30,40,0.7)"; c.fillRect(-4, -5, 9, 10); c.restore(); break;
        }
        case "lamp": case "lampNeon": {
          const col = d.k === "lampNeon" ? ["#22e6ff", "#ff2bd6", "#a855f7"][d.c % 3] : "rgba(255,230,160,1)";
          if (glow) { const g = c.createRadialGradient(x, y, 0, x, y, 60); g.addColorStop(0, d.k === "lampNeon" ? col.replace(")", ",0.35)").replace("#", "#") : "rgba(255,230,160,0.35)"); g.addColorStop(1, "rgba(0,0,0,0)"); c.fillStyle = d.k === "lampNeon" ? hexA(col, 0.3) : "rgba(255,230,160,0.3)"; c.beginPath(); c.arc(x, y, 50, 0, Math.PI * 2); c.fill(); }
          blob(c, x, y, 4, col); break;
        }
        case "holo": {
          const col = ["#22e6ff", "#ff2bd6", "#a855f7", "#39ff88"][d.c % 4];
          c.save(); c.translate(x, y); c.rotate(d.ang); c.shadowColor = col; c.shadowBlur = 18; c.strokeStyle = col; c.lineWidth = 3;
          c.strokeRect(-22, -14, 44, 28); c.globalAlpha = 0.35; c.fillStyle = col; c.fillRect(-22, -14, 44, 28); c.globalAlpha = 1;
          c.fillStyle = col; for (let q = 0; q < 3; q++) c.fillRect(-16, -8 + q * 7, 12 + ((d.c + q) % 3) * 8, 3); c.restore(); break;
        }
        default: drawBuilding(c, d, th);
      }
    }
  }
  function hexA(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; }
  function drawBuilding(c, d, th) {
    const { x, y, w, h, ang, hgt } = d, k = d.k;
    c.save(); c.translate(x, y); c.rotate(ang);
    // fake height: a shadow shifted down-right by how tall it is
    const sh = k === "office" || k === "cyber" ? hgt : 12;
    c.fillStyle = k === "cyber" ? "rgba(0,0,0,0.55)" : "rgba(0,0,0,0.3)";
    c.beginPath(); c.moveTo(-w / 2, -h / 2); c.lineTo(w / 2, -h / 2); c.lineTo(w / 2 + sh * 0.6, -h / 2 + sh); c.lineTo(w / 2 + sh * 0.6, h / 2 + sh); c.lineTo(-w / 2 + sh * 0.6, h / 2 + sh); c.lineTo(-w / 2, h / 2); c.closePath(); c.fill();
    if (k === "cyber") {
      const neon = ["#22e6ff", "#ff2bd6", "#a855f7", "#39ff88", "#ffcc1f"][d.c % 5], neon2 = ["#ff2bd6", "#22e6ff", "#39ff88", "#a855f7", "#22e6ff"][d.c % 5];
      c.fillStyle = ["#151027", "#1b1433", "#0f1426", "#1a0f24"][d.c % 4]; c.fillRect(-w / 2, -h / 2, w, h);
      // glowing window grid
      const R2 = seeded(Math.round(x * 13 + y * 7));
      for (let wy = -h / 2 + 8; wy < h / 2 - 8; wy += 10) for (let wx = -w / 2 + 8; wx < w / 2 - 8; wx += 9) if (R2() < 0.45) { c.fillStyle = R2() < 0.8 ? hexA(neon, 0.55) : "rgba(255,255,255,0.7)"; c.fillRect(wx, wy, 5, 4); }
      c.shadowColor = neon; c.shadowBlur = 16; c.strokeStyle = neon; c.lineWidth = 2.5; c.strokeRect(-w / 2 + 1.5, -h / 2 + 1.5, w - 3, h - 3);
      c.shadowColor = neon2; c.strokeStyle = neon2; c.lineWidth = 2; c.beginPath(); c.moveTo(-w / 2 + 6, -h / 2 + 6); c.lineTo(-w / 2 + Math.min(w, h) * 0.45, -h / 2 + 6); c.stroke();
      if (d.s > 0.55) { c.fillStyle = hexA(neon2, 0.8); c.fillRect(-10, -h / 2 + 10, 20, 6); }         // rooftop sign
      if (d.s < 0.25) { c.strokeStyle = "rgba(255,255,255,0.35)"; c.lineWidth = 1; c.beginPath(); c.arc(0, 0, Math.min(w, h) * 0.2, 0, Math.PI * 2); c.stroke(); }   // helipad
      c.shadowBlur = 0;
    } else if (k === "office") {
      const roofs = ["#8a8f98", "#a3a8b0", "#6f757e", "#b6a58f", "#8c7f73", "#7c8a96"];
      c.fillStyle = roofs[d.c]; c.fillRect(-w / 2, -h / 2, w, h);
      c.strokeStyle = "rgba(0,0,0,0.25)"; c.lineWidth = 3; c.strokeRect(-w / 2 + 1.5, -h / 2 + 1.5, w - 3, h - 3);
      const R2 = seeded(Math.round(x * 5 + y * 11));
      for (let q = 0; q < 2 + Math.floor(R2() * 4); q++) { c.fillStyle = "#c9ced4"; c.fillRect(-w / 2 + 8 + R2() * (w - 30), -h / 2 + 8 + R2() * (h - 26), 14, 10); c.fillStyle = "rgba(0,0,0,0.25)"; c.fillRect(-w / 2 + 8 + R2() * (w - 30), -h / 2 + 8 + R2() * (h - 26), 8, 8); }
      if (d.s > 0.7) { c.fillStyle = "rgba(90,160,90,0.8)"; c.fillRect(-w / 4, -h / 4, w / 2, h / 2); }   // roof garden
    } else {
      // small houses: farm / cabin / adobe / hut / bunker
      const roof = { farm: ["#9e3b2c", "#7d2f25"], cabin: ["#f3f6f8", "#d5dde3"], adobe: ["#c98a52", "#b0733f"], hut: ["#d9b36a", "#c29a52"], bunker: ["#4b4f55", "#3a3d42"] }[k] || ["#888", "#777"];
      c.fillStyle = roof[0]; c.fillRect(-w / 2, -h / 2, w, h / 2); c.fillStyle = roof[1]; c.fillRect(-w / 2, 0, w, h / 2);
      c.strokeStyle = "rgba(0,0,0,0.25)"; c.lineWidth = 2; c.strokeRect(-w / 2, -h / 2, w, h);
      if (k === "cabin") { c.fillStyle = "#6b4a2f"; c.fillRect(w / 4, -h / 2 - 4, 8, 8); }
      if (k === "farm" && d.s > 0.5) { c.fillStyle = "#c9c2b0"; blob(c, w / 2 + 16, 0, 12, "#c9c2b0"); }   // silo
    }
    c.restore();
  }
  // grid boxes, same maths as gridSlot() on the server: staggered, pole really in front
  function gridCount() { return S.screen === "race" && S.race?.info ? S.race.info.size : S.lobby ? S.lobby.players.filter((p) => !p.spectator).length + (S.lobby.settings.ai || 0) : 0; }
  function gridSlotC(t, g, total) {
    const spacing = t.length / t.N, gap = clamp((t.length * 0.85 - 70) / Math.max(1, total), 34, 60);
    const idx = (t.N - Math.round((70 + g * gap) / spacing) + t.N * 4) % t.N;
    return { idx, lat: (g % 2 ? 1 : -1) * Math.min(28, t.hw[idx] - 20) };
  }
  function drawGridBoxes(c, t, total) {
    if (!total || !t.length) return;
    c.save(); c.strokeStyle = "rgba(255,255,255,0.8)"; c.fillStyle = "rgba(255,255,255,0.8)"; c.lineWidth = 2.5; c.lineCap = "square";
    c.font = "700 13px 'Chakra Petch', sans-serif"; c.textAlign = "center"; c.textBaseline = "middle";
    for (let g = 0; g < total; g++) {
      const { idx, lat } = gridSlotC(t, g, total), p = t.pts[idx], n = t.nor[idx], tn = t.tan[idx];
      const x = p.x + n.x * lat, y = p.y + n.y * lat, a = Math.atan2(tn.y, tn.x);
      c.save(); c.translate(x, y); c.rotate(a);
      // "[" bracket in front of the car's nose, like painted grid slots
      c.beginPath(); c.moveTo(18, -15); c.lineTo(28, -15); c.lineTo(28, 15); c.lineTo(18, 15); c.stroke();
      c.translate(-34, 0); c.rotate(Math.PI / 2); c.fillText(String(g + 1), 0, 0);
      c.restore();
    }
    c.restore();
  }
  function drawStatic(c, t, G, th, opts = {}) {
    if (!opts.noGround) { c.fillStyle = c.createPattern(tex("ground", th), "repeat"); c.fillRect(opts.x0 ?? 0, opts.y0 ?? 0, opts.w ?? t.W, opts.h ?? t.H); }
    if (!opts.noGround && settings.scenery !== "off") drawDecor(c, t, G, th, opts);
    c.fillStyle = c.createPattern(tex("gravel", th), "repeat"); c.fill(G.gravel);
    c.lineJoin = "round"; c.lineCap = "butt";
    c.lineWidth = 58; c.strokeStyle = "#f4f4f4"; c.stroke(G.lane);
    c.lineWidth = 50; c.strokeStyle = th.asphalt; c.stroke(G.lane);
    c.lineCap = "round";
    strokeRuns(c, G.runs, 24, th.runoff);
    strokeRuns(c, G.runs, 14, th.curbA);
    c.lineCap = "butt"; strokeRuns(c, G.runs, 14, th.curbB, [22, 22]); c.lineCap = "round";
    strokeRuns(c, G.runs, 0, th.asphalt);
    c.lineCap = "butt"; c.lineWidth = 3; c.strokeStyle = th.line; c.setLineDash([26, 30]);
    for (const r of G.runs) { c.lineDashOffset = r.dash; c.stroke(r.p); }
    c.setLineDash([]); c.lineDashOffset = 0; c.lineCap = "round";
    if (settings.raceline === "on" && G.line && !opts.board) { c.setLineDash([14, 12]); c.lineWidth = 4; c.strokeStyle = "rgba(62,207,106,0.55)"; c.stroke(G.line); c.setLineDash([]); }
    c.lineWidth = 12; c.strokeStyle = "#8d949b"; c.stroke(G.wall);
    c.lineWidth = 4; c.setLineDash([16, 16]); c.strokeStyle = "#d32f2f"; c.stroke(G.wall); c.setLineDash([]);
    for (const gr of G.garages) {
      c.save(); c.translate(gr.x, gr.y); c.rotate(gr.ang);
      c.fillStyle = "#2a2d33"; c.fillRect(-40, -22, 80, 44);
      c.fillStyle = gr.color; c.fillRect(-40, -22, 80, 8);
      if (!opts.board) {
        c.fillStyle = "#fff"; c.font = "700 11px 'Chakra Petch', sans-serif"; c.textAlign = "center"; c.textBaseline = "middle";
        c.save(); if (Math.cos(gr.ang) < 0) c.rotate(Math.PI); c.fillText(gr.team.slice(0, 14), 0, 4); c.restore();
      }
      c.restore();
      c.save(); c.translate(gr.sx, gr.sy); c.rotate(gr.ang);
      c.strokeStyle = "#ffcc1f"; c.lineWidth = 3; c.strokeRect(-24, -16, 48, 32);
      c.restore();
    }
    drawGridBoxes(c, t, gridCount());
    if (!opts.board) for (const [pt, label] of [[G.entry, "PIT 60"], [G.exit, "PIT EXIT"]]) {
      const ang = Math.atan2(t.tan[pt.i].y, t.tan[pt.i].x);
      c.save(); c.translate(pt.x, pt.y); c.rotate(ang);
      c.fillStyle = "#fff"; c.fillRect(-3, -26, 6, 52);
      c.fillStyle = "#ffcc1f"; c.font = "16px 'Russo One', sans-serif"; c.textAlign = "center"; c.textBaseline = "middle";
      c.save(); c.translate(-22, 0); c.rotate(Math.cos(ang) < 0 ? Math.PI / 2 : -Math.PI / 2); c.fillText(label, 0, 0); c.restore();
      c.restore();
    }
    if (!opts.board) drawDrsZones(c, t);
    const s0 = t.pts[0], tn = t.tan[0], hw0 = hwAt(t, 0);
    c.save(); c.translate(s0.x, s0.y); c.rotate(Math.atan2(tn.y, tn.x));
    for (let r = 0; r < 2; r++) for (let q = 0; q < Math.ceil(hw0 / 5); q++) { c.fillStyle = (r + q) % 2 ? "#111" : "#fff"; c.fillRect(-10 + r * 10, -hw0 + q * 10, 10, Math.min(10, hw0 * 2 - q * 10)); }
    c.restore();
  }
  // DRS zones on the road: a dashed green line down each edge, and the activation line with "DRS" painted on
  function drawDrsZones(c, t) {
    for (const z of t.drs || []) {
      for (const side of [1, -1]) {
        c.beginPath();
        for (let k = 0; k <= z.len; k++) { const i = (z.from + k) % t.N, p = t.pts[i], n = t.nor[i], o = (hwAt(t, i) - 9) * side; k ? c.lineTo(p.x + n.x * o, p.y + n.y * o) : c.moveTo(p.x + n.x * o, p.y + n.y * o); }
        c.lineWidth = 5; c.strokeStyle = "rgba(62,224,106,0.85)"; c.setLineDash([30, 22]); c.stroke(); c.setLineDash([]);
      }
      const i = z.from % t.N, p = t.pts[i], tn = t.tan[i], hw = hwAt(t, i), ang = Math.atan2(tn.y, tn.x);
      c.save(); c.translate(p.x, p.y); c.rotate(ang);
      c.fillStyle = "rgba(255,255,255,0.9)"; c.fillRect(-3, -hw, 6, hw * 2);
      c.fillStyle = "rgba(62,224,106,0.9)"; c.font = "30px 'Russo One', sans-serif"; c.textAlign = "center"; c.textBaseline = "middle";
      c.translate(34, 0); c.rotate(Math.PI / 2); c.fillText("DRS", 0, 0);
      c.restore();
    }
  }
  // Double ramps (a bridge over a bridge) get their own colours so you can tell the levels apart:
  // level 2 is a blue steel deck with cyan kerbs, level 3 a purple one with pink kerbs.
  const RAMP_STYLE = {
    2: { asphalt: "#2f4f86", runoff: "#1c2f52", curbA: "#5ee0ff", curbB: "#ffffff", line: "#bfe9ff", wall: "#9fd4ff", wallTop: "#3f7fc0" },
    3: { asphalt: "#5b3a86", runoff: "#352252", curbA: "#ff7de0", curbB: "#ffffff", line: "#f3c9ff", wall: "#e2b6ff", wallTop: "#9a5cc8" },
  };
  function drawBridge(c, t, G, th, br) {
    const lv = br.peak >= 2.5 ? 3 : br.peak >= 1.5 ? 2 : 1, rs = RAMP_STYLE[lv] || {};
    c.fillStyle = lv > 1 ? "rgba(0,0,0,0.38)" : "rgba(0,0,0,0.3)"; c.fill(br.shadow);
    c.lineJoin = "round"; c.lineCap = "butt";
    strokeRuns(c, br.runs, 24, rs.runoff || th.runoff);
    strokeRuns(c, br.runs, 14, rs.curbA || th.curbA);
    strokeRuns(c, br.runs, 14, rs.curbB || th.curbB, [22, 22]);
    strokeRuns(c, br.top, 0, rs.asphalt || th.asphalt);
    c.lineWidth = 3; c.strokeStyle = rs.line || th.line; c.setLineDash([26, 30]);
    for (const r of br.top) { c.lineDashOffset = r.dash; c.stroke(r.p); }
    c.setLineDash([]); c.lineDashOffset = 0;
    c.lineWidth = 2; c.strokeStyle = "rgba(0,0,0,0.22)"; c.stroke(br.joints);
    for (const wl of br.walls) { c.fillStyle = rs.wall || "#c7ccd2"; c.fill(wl.fill); c.lineWidth = 3; c.strokeStyle = rs.wallTop || "#7d858d"; c.stroke(wl.top); }
    c.lineCap = "round";
  }

  // ---- Tile cache: the static track is drawn ONCE into small canvases and reused every frame ----
  const TILE = 384, TPAD = 2;
  const tiles = new Map();
  let tileQ = 1, tileSig = "", tileBudget = 0;
  function resetTiles() { tiles.clear(); }
  function pickQ(want) {
    const Q = [0.5, 0.75, 1, 1.5, 2];
    if (want > tileQ * 0.55 && want < tileQ * 1.25) return tileQ;           // hysteresis: don't flip back and forth
    return Q.find((q) => q >= want * 0.92) || 2;
  }
  function getTile(t, G, th, tx, ty, q) {
    const k = tx * 1000 + ty + q * 1e7;
    let tl = tiles.get(k);
    if (tl) { tiles.delete(k); tiles.set(k, tl); return tl; }
    if (tileBudget <= 0) return null;
    tileBudget--;
    const size = Math.ceil((TILE + TPAD * 2) * q);
    const cv = document.createElement("canvas"); cv.width = cv.height = size;
    const c = cv.getContext("2d");
    const x0 = tx * TILE - TPAD, y0 = ty * TILE - TPAD;
    c.setTransform(q, 0, 0, q, -x0 * q, -y0 * q);
    c.beginPath(); c.rect(x0, y0, TILE + TPAD * 2, TILE + TPAD * 2); c.clip();
    drawStatic(c, t, G, th, { x0, y0, w: TILE + TPAD * 2, h: TILE + TPAD * 2 });
    tl = { cv, c, x0, y0, q };
    // skid marks already laid down in this tile
    c.fillStyle = "rgba(15,15,15,0.18)";
    for (let i = 0; i < S.skids.length; i += 2) { const sx = S.skids[i], sy = S.skids[i + 1]; if (sx > x0 - 4 && sy > y0 - 4 && sx < x0 + TILE + 8 && sy < y0 + TILE + 8) c.fillRect(sx - 2.5, sy - 2.5, 5, 5); }
    tiles.set(k, tl);
    while (tiles.size > 72) tiles.delete(tiles.keys().next().value);
    return tl;
  }
  // new skid mark: paint it straight into the cached tiles (then it costs nothing to draw again)
  function addSkid(x, y) {
    S.skids.push(x, y);
    if (S.skids.length > 9000) S.skids.splice(0, S.skids.length - 9000);
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      const tl = tiles.get((tx + dx) * 1000 + ty + dy + tileQ * 1e7);
      if (tl && x > tl.x0 - 4 && y > tl.y0 - 4 && x < tl.x0 + TILE + 2 * TPAD + 4 && y < tl.y0 + TILE + 2 * TPAD + 4) { tl.c.fillStyle = "rgba(15,15,15,0.18)"; tl.c.fillRect(x - 2.5, y - 2.5, 5, 5); }
    }
  }

  // ---- Smooth car motion ----
  // We show the race a moment (~2 server updates) in the past and move each car along a curve
  // that follows its real speed and direction between updates. So at 2x/3x the cars follow the
  // road through corners instead of cutting straight across the grass.
  const snaps = [];
  let rt = 0;
  // How uneven the connection is decides how far behind we show the race: a steady connection
  // gets a short delay (snappy), a jittery one (phones, free servers) a longer one (smooth).
  let lastArrive = 0, jitter = 0.02, netDelay = 0.11, lateBuf = 0;
  function pushSnap(st) {
    const now = performance.now() / 1000, mul = S.race?.speed || 1;
    if (snaps.length && st.t < snaps[snaps.length - 1].t - 0.001) snaps.length = 0;
    if (snaps.length && lastArrive) {
      const gap = now - lastArrive, want = (st.t - snaps[snaps.length - 1].t) / mul;
      jitter += (Math.min(0.4, Math.abs(gap - want)) - jitter) * 0.08;
      // a late update (the server or the connection hiccuped): show the race a bit further behind right
      // away, so the next hiccup is covered by updates we already have instead of guessing
      const late = gap - want;
      if (late > 0.06) lateBuf = Math.min(0.45, Math.max(lateBuf, late * 1.1 + 0.03));
      netDelay = clamp(Math.max(0.07 + jitter * 2.8, lateBuf), 0.08, 0.5);
    }
    lastArrive = now;
    const m = new Map(); for (const a of st.cars) m.set(a[0], a);
    snaps.push({ t: st.t, cars: m });
    if (snaps.length > 16) snaps.shift();
  }
  // Updates late? Guess where a car is by carrying it on along the track (same speed, same distance from
  // the middle) rather than in a straight line: a straight-line guess sends it off the road in a corner
  // and then it snaps back. null = no good guess (going backwards, in the pits...): use the straight line.
  function aheadOnTrack(t, q, e) {
    const i0 = q[25]; if (!t || !t.pts || !t.nor || !t.tan || i0 === undefined || i0 >= t.N || e <= 0) return null;     // (an update from a track that was just swapped out)
    const N = t.N, P = t.pts[i0], n = t.nor[i0], tn = t.tan[i0];
    const sp = Math.hypot(q[23], q[24]); if (sp < 30 || q[23] * tn.x + q[24] * tn.y < sp * 0.7) return null;
    const lat = (q[1] - P.x) * n.x + (q[2] - P.y) * n.y;
    let along = (q[1] - P.x) * tn.x + (q[2] - P.y) * tn.y + sp * e, i = i0;
    for (let k = 0; k < 200; k++) {
      const j = (i + 1) % N, L = Math.hypot(t.pts[j].x - t.pts[i].x, t.pts[j].y - t.pts[i].y) || 1;
      if (along < L) {
        const f = along / L, nx = t.nor[i].x + (t.nor[j].x - t.nor[i].x) * f, ny = t.nor[i].y + (t.nor[j].y - t.nor[i].y) * f;
        const h0 = Math.atan2(t.tan[i].y, t.tan[i].x), h1 = h0 + wrapAngle(Math.atan2(t.tan[j].y, t.tan[j].x) - h0) * f;
        return { x: t.pts[i].x + (t.pts[j].x - t.pts[i].x) * f + nx * lat, y: t.pts[i].y + (t.pts[j].y - t.pts[i].y) * f + ny * lat, h: q[3] + wrapAngle(h1 - Math.atan2(tn.y, tn.x)) };
      }
      along -= L; i = j;
    }
    return null;
  }
  function interpCars(dt) {
    if (!snaps.length) return;
    const mul = S.race?.speed || 1, last = snaps[snaps.length - 1], t = S.track;
    lateBuf = Math.max(0, lateBuf - dt * 0.02);                 // (and creeps back to snappy over ~10s once it's steady)
    const want = last.t - netDelay * mul;
    // the display clock drifts toward where it should be by at most 12% (never a visible lurch)
    if (Math.abs(rt - want) > 0.6 * mul) rt = want;
    else rt += dt * mul * (1 + clamp(((want - rt) / mul) * 3, -0.12, 0.12));
    // out of updates: only guess a moment ahead. When the server stalls the race itself stalls with it, so a
    // long guess just puts cars where they won't be and they have to be pulled back (the "teleport")
    rt = Math.min(rt, last.t + 0.1 * mul);
    let a = snaps[0], b = snaps[0];
    for (let i = snaps.length - 1; i >= 0; i--) if (snaps[i].t <= rt) { a = snaps[i]; b = snaps[Math.min(snaps.length - 1, i + 1)]; break; }
    const D = b.t - a.t;
    for (const c of S.cars.values()) {
      const A = a.cars.get(c.id), Bq = b.cars.get(c.id);
      if (!Bq) continue;
      let x, y, teleport = false;
      if (!A || D < 1e-4) {
        const e = Math.max(0, Math.min(0.1 * mul, rt - b.t)), g = aheadOnTrack(t, Bq, e);
        if (g) { x = g.x; y = g.y; c.h = g.h; } else { x = Bq[1] + Bq[23] * e; y = Bq[2] + Bq[24] * e; c.h = Bq[3]; }
        c.drawIdx = Bq[25];
      } else {
        const u = (rt - a.t) / D;
        c.drawIdx = u < 0.5 ? A[25] : Bq[25];
        teleport = Math.hypot(Bq[1] - A[1], Bq[2] - A[2]) > (Math.hypot(A[23], A[24]) + Math.hypot(Bq[23], Bq[24])) * D * 0.75 + 60;
        if (teleport) { x = Bq[1]; y = Bq[2]; c.h = Bq[3]; }
        else if (u >= 1) { const e = rt - b.t, g = aheadOnTrack(t, Bq, e); if (g) { x = g.x; y = g.y; c.h = g.h; } else { x = Bq[1] + Bq[23] * e; y = Bq[2] + Bq[24] * e; c.h = Bq[3]; } }
        else {
          const u2 = u * u, u3 = u2 * u, h1 = 2 * u3 - 3 * u2 + 1, h2 = -2 * u3 + 3 * u2, h3 = (u3 - 2 * u2 + u) * D, h4 = (u3 - u2) * D;
          x = h1 * A[1] + h2 * Bq[1] + h3 * A[23] + h4 * Bq[23];
          y = h1 * A[2] + h2 * Bq[2] + h3 * A[24] + h4 * Bq[24];
          c.h = A[3] + wrapAngle(Bq[3] - A[3]) * u;
        }
      }
      // If the target position suddenly jumps (a late update corrected it), don't pop: keep the
      // car where it was drawn and blend the correction in over a few frames.
      // (where the car should be now = where it was + its speed x how far the DISPLAY clock moved. Not the frame
      // time: while updates are late the display clock holds still, and using frame time here made a "correction"
      // that kept the car sliding straight on at full speed, off the track on corners, until it snapped back)
      const drt = c.trt === undefined ? 0 : Math.max(0, rt - c.trt);
      if (c.tx0 !== undefined && !teleport) {
        const jx = x - (c.tx0 + Bq[23] * drt), jy = y - (c.ty0 + Bq[24] * drt);
        if (Math.hypot(jx, jy) > 1.5) { c.ex = (c.ex || 0) - jx; c.ey = (c.ey || 0) - jy; }
      }
      c.tx0 = x; c.ty0 = y; c.trt = rt;
      const k = Math.exp(-dt * 9);
      c.ex = (c.ex || 0) * k; c.ey = (c.ey || 0) * k;
      if (teleport || Math.hypot(c.ex, c.ey) > 160) c.ex = c.ey = 0;
      c.x = x + c.ex; c.y = y + c.ey;
      // Safety net: a car the server says is ON the road is never drawn off it (whatever the network or the device
      // is doing). Pulled back to the edge of the road, at the same place along it.
      if (Bq[12] && !Bq[19] && t && t.pts && t.nor && t.hw && Bq[25] < t.N) {
        const N = t.N; let bi = Bq[25], bd = Infinity;
        for (let o = -12; o <= 12; o++) { const i = (Bq[25] + o + N) % N, q = t.pts[i], d = (q.x - c.x) ** 2 + (q.y - c.y) ** 2; if (d < bd) { bd = d; bi = i; } }
        const P = t.pts[bi], n = t.nor[bi], lat = (c.x - P.x) * n.x + (c.y - P.y) * n.y, lim = t.hw[bi] + 18;
        if (Math.abs(lat) > lim) { const fix = lat - Math.sign(lat) * lim; c.x -= n.x * fix; c.y -= n.y * fix; c.ex = (c.ex || 0) - n.x * fix; c.ey = (c.ey || 0) - n.y * fix; }
      }
      // Height comes from where the car is DRAWN on the track (not from the last update), so
      // climbing onto and off a ramp is perfectly smooth. Same for which bridge it's drawn on.
      if (t && t.elev && c.drawIdx !== undefined) {
        const N = t.N; let best = c.drawIdx, bd = Infinity;
        for (let o = -5; o <= 6; o++) { const i = (c.drawIdx + o + N) % N, q = t.pts[i], d = (q.x - c.x) ** 2 + (q.y - c.y) ** 2; if (d < bd) { bd = d; best = i; } }
        const i1 = (best + 1) % N, i0 = (best - 1 + N) % N, p = t.pts[best];
        const sx = t.pts[i1].x - p.x, sy = t.pts[i1].y - p.y, f = ((c.x - p.x) * sx + (c.y - p.y) * sy) / (sx * sx + sy * sy || 1);
        c.lvl = f >= 0 ? t.elev[best] + (t.elev[i1] - t.elev[best]) * Math.min(1, f) : t.elev[best] + (t.elev[i0] - t.elev[best]) * Math.min(1, -f);
        c.trackIdx = best;
      } else c.lvl = Bq[22];
    }
  }

  // headlight glow sprite (made once instead of a new gradient per car per frame)
  let headSprite = null;
  function headlight() {
    if (headSprite) return headSprite;
    const cv = document.createElement("canvas"); cv.width = cv.height = 220;
    const c = cv.getContext("2d"), g = c.createRadialGradient(90, 110, 5, 110, 110, 110);
    g.addColorStop(0, "rgba(255,245,200,0.28)"); g.addColorStop(1, "rgba(255,245,200,0)");
    c.fillStyle = g; c.fillRect(0, 0, 220, 220);
    return (headSprite = cv);
  }

  // ======================= little life round the track =======================
  // puddles when it's wet, marshals waving flags (yellow by a crash, chequered on the last lap), pit crews at work,
  // and birds that sit in the grass and fly off when the cars come by
  const TL = { t: null, puddles: [], birds: [], yellow: [], lastLap: false };
  function tlFor(t) {
    if (TL.t === t) return TL;
    TL.t = t; TL.yellow = []; TL.lastLap = false; TL.puddles = []; TL.birds = [];
    let sd = (t.N * 7919 + Math.round(t.pts[0].x) * 31) % 233280; const rnd = () => (sd = (sd * 9301 + 49297) % 233280) / 233280;
    // puddles: the same spots on the road every time for this track
    for (let k = 0; k < Math.min(28, Math.floor(t.N / 25)); k++) {
      const i = Math.floor(rnd() * t.N); if (t.elev?.[i] > 0) continue;
      const p = t.pts[i], n = t.nor[i], a = t.tan[i], off = (rnd() - 0.5) * t.hw[i] * 1.2;
      TL.puddles.push({ x: p.x + n.x * off, y: p.y + n.y * off, rx: 20 + rnd() * 30, ry: 9 + rnd() * 11, rot: Math.atan2(a.y, a.x) + (rnd() - 0.5) * 0.7 });
    }
    // birds: little flocks on the grass, never on (or right next to) the road
    for (let f = 0, tries = 0; f < 9 && tries < 80; tries++) {
      const i = Math.floor(rnd() * t.N), side = rnd() < 0.5 ? -1 : 1, p = t.pts[i], n = t.nor[i], off = t.hw[i] + 120 + rnd() * 220;
      const x = p.x + n.x * off * side, y = p.y + n.y * off * side;
      if (x < 60 || y < 60 || x > t.W - 60 || y > t.H - 60) continue;
      let clear = true; for (let j = 0; j < t.N && clear; j += 3) if (Math.hypot(t.pts[j].x - x, t.pts[j].y - y) < t.hw[j] + 90) clear = false;
      if (!clear) continue;
      f++; const m = 3 + Math.floor(rnd() * 5);
      for (let b = 0; b < m; b++) { const hx = x + (rnd() - 0.5) * 60, hy = y + (rnd() - 0.5) * 40; TL.birds.push({ hx, hy, x: hx, y: hy, h: rnd() * 6.3, fly: 0, vx: 0, vy: 0, ph: rnd() * 6 }); }
    }
    return TL;
  }
  // a crash: a marshal runs out beside it and waves a yellow flag for a while
  function marshalAt(x, y) {
    const t = S.track; if (!t || !Number.isFinite(x)) return; tlFor(t);
    let bi = 0, bd = Infinity; for (let j = 0; j < t.N; j += 2) { const d = (t.pts[j].x - x) ** 2 + (t.pts[j].y - y) ** 2; if (d < bd) { bd = d; bi = j; } }
    const p = t.pts[bi], n = t.nor[bi], side = (x - p.x) * n.x + (y - p.y) * n.y >= 0 ? -1 : 1, off = t.hw[bi] + 34;
    TL.yellow.push({ x: p.x + n.x * off * side, y: p.y + n.y * off * side, rot: Math.atan2(n.y * side, n.x * side), until: performance.now() + 9000 });
    if (TL.yellow.length > 6) TL.yellow.shift();
  }
  // a marshal from above: head, shoulders, an arm waving the flag
  function drawMarshal(c, x, y, rot, flag, now) {
    const wave = Math.sin(now / 130) * 0.9;
    c.save(); c.translate(x, y); c.rotate(rot);
    c.fillStyle = "rgba(0,0,0,0.25)"; c.beginPath(); c.ellipse(2, 3, 8, 6, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = "#ff7a1a"; c.beginPath(); c.ellipse(0, 0, 5, 8, 0, 0, Math.PI * 2); c.fill();          // orange overalls
    c.fillStyle = "#f1c27d"; c.beginPath(); c.arc(0, 0, 3.6, 0, Math.PI * 2); c.fill();
    c.rotate(wave); c.strokeStyle = "#ff7a1a"; c.lineWidth = 2.4; c.beginPath(); c.moveTo(0, -5); c.lineTo(-2, -14); c.stroke();
    c.strokeStyle = "#ddd"; c.lineWidth = 1.2; c.beginPath(); c.moveTo(-2, -14); c.lineTo(-2, -30); c.stroke();
    const fw = 18, fh = 12, fl = Math.sin(now / 90) * 2;
    if (flag === "cheq") { for (let a = 0; a < 4; a++) for (let b = 0; b < 3; b++) { c.fillStyle = (a + b) % 2 ? "#111" : "#fff"; c.fillRect(-2 - fw + a * fw / 4, -30 + b * fh / 3 + fl * (a / 4), fw / 4 + 0.3, fh / 3 + 0.3); } }
    else { c.fillStyle = "#ffd60a"; c.beginPath(); c.moveTo(-2, -30); c.lineTo(-2 - fw, -30 + fl); c.lineTo(-2 - fw, -18 + fl); c.lineTo(-2, -18); c.fill(); }
    c.restore();
  }
  // pit crew: four on the wheels and one on the front jack, in the team colour, busy while the car's stopped
  function drawPitCrew(c, car, now) {
    const fx = Math.cos(car.h), fy = Math.sin(car.h), busy = Math.sin(now / 70);
    const spots = [[16, 1], [16, -1], [-16, 1], [-16, -1]].map(([a, s]) => [a, s * 24]).concat([[36, 0]]);
    spots.forEach(([a, b], k) => {
      const x = car.x + fx * a - fy * b, y = car.y + fy * a + fx * b, j = k < 4 ? busy * 1.5 * (k % 2 ? 1 : -1) : 0;
      c.fillStyle = "rgba(0,0,0,0.25)"; c.beginPath(); c.arc(x + 2, y + 2, 6, 0, Math.PI * 2); c.fill();
      c.fillStyle = car.color || "#888"; c.beginPath(); c.ellipse(x + fx * j, y + fy * j, 4.6, 6.4, car.h + (k === 4 ? 0 : Math.PI / 2), 0, Math.PI * 2); c.fill();
      c.fillStyle = "#e5e7eb"; c.beginPath(); c.arc(x + fx * j, y + fy * j, 3.2, 0, Math.PI * 2); c.fill();
    });
  }
  function drawPuddles(c, t, wet, visible) {
    const a = clamp((wet - 0.25) * 1.5, 0, 0.75); if (a <= 0) return;
    const now = performance.now();
    for (const p of tlFor(t).puddles) {
      if (!visible(p, 60)) continue;
      c.save(); c.translate(p.x, p.y); c.rotate(p.rot); c.globalAlpha = a;
      c.fillStyle = "rgba(70,95,135,0.75)"; c.beginPath(); c.ellipse(0, 0, p.rx, p.ry, 0, 0, Math.PI * 2); c.fill();
      c.strokeStyle = "rgba(200,220,255,0.35)"; c.lineWidth = 1.2; c.beginPath(); c.ellipse(-p.rx * 0.2, -p.ry * 0.25, p.rx * 0.5, p.ry * 0.35, 0, Math.PI * 1.1, Math.PI * 1.8); c.stroke();
      if (S.weather?.raining && !reducedMotion) { const k = ((now / 900) + p.rx) % 1; c.globalAlpha = a * (1 - k); c.beginPath(); c.ellipse(p.rx * 0.3 * Math.sin(p.rx), 0, 3 + k * 10, 2 + k * 5, 0, 0, Math.PI * 2); c.stroke(); }
      c.restore();
    }
  }
  function drawTrackLife(c, t, dt, now, visible) {
    const L = tlFor(t);
    if (S.phase !== "race") { L.lastLap = false; L.yellow = []; }
    L.yellow = L.yellow.filter((m) => m.until > now);
    for (const m of L.yellow) if (visible(m, 60)) drawMarshal(c, m.x, m.y, m.rot, "yellow", now);
    if (L.lastLap || [...S.cars.values()].some((o) => o.fin)) {
      const pl = t.pitLane, side = pl ? -pl.side : 1, p = t.pts[0], n = t.nor[0], off = t.hw[0] + 30, m = { x: p.x + n.x * off * side, y: p.y + n.y * off * side };
      if (visible(m, 60)) drawMarshal(c, m.x, m.y, Math.atan2(n.y * side, n.x * side), "cheq", now);
    }
    for (const car of S.cars.values()) if (car.pit >= 0 && car.x !== undefined && visible(car)) drawPitCrew(c, car, now);
  }
  // birds: sitting about pecking, then off they go when a car comes close; back a while later
  function drawBirds(c, t, dt, now, visible) {
    const L = tlFor(t); dt = Math.min(dt, 0.1);
    for (const b of L.birds) {
      if (b.fly === 0) {
        if (S.phase === "race") for (const car of S.cars.values()) {
          if (car.x === undefined || Math.abs(car.speed || 0) < 60) continue;
          const dx = b.x - car.x, dy = b.y - car.y, d = Math.hypot(dx, dy);
          if (d < 300) { const sp = 160 + Math.random() * 120, a = Math.atan2(dy, dx) + (Math.random() - 0.5) * 1.2; b.vx = Math.cos(a) * sp; b.vy = Math.sin(a) * sp; b.fly = now; break; }
        }
      } else {
        const age = (now - b.fly) / 1000;
        if (age < 7) { b.x += b.vx * dt; b.y += b.vy * dt; b.vy -= 8 * dt; }
        else if (age > 25) { b.x = b.hx; b.y = b.hy; b.fly = 0; b.back = now; }
      }
      if (!visible(b, 40)) continue;
      const age = b.fly ? (now - b.fly) / 1000 : 0, fade = b.fly ? clamp(1 - (age - 4) / 3, 0, 1) : b.back ? clamp((now - b.back) / 1500, 0, 1) : 1;
      if (fade <= 0) continue;
      c.globalAlpha = fade; c.fillStyle = "#2b2b33"; c.strokeStyle = "#2b2b33";
      if (!b.fly) { const peck = Math.sin(now / 300 + b.ph * 3) > 0.85 ? 1.5 : 0; c.beginPath(); c.ellipse(b.x, b.y, 4, 2.6, b.h, 0, Math.PI * 2); c.fill(); c.beginPath(); c.arc(b.x + Math.cos(b.h) * (4 + peck), b.y + Math.sin(b.h) * (4 + peck), 1.8, 0, Math.PI * 2); c.fill(); }
      else {
        const h = Math.atan2(b.vy, b.vx), flap = Math.sin(now / 60 + b.ph) * 4, s = 1 + Math.min(1, age) * 0.5, fx = Math.cos(h), fy = Math.sin(h);
        c.lineWidth = 1.6; c.beginPath();
        for (const sd of [-1, 1]) { c.moveTo(b.x, b.y); c.quadraticCurveTo(b.x - fy * sd * 5 * s - fx * 3, b.y + fx * sd * 5 * s - fy * 3, b.x - fy * sd * (8 + flap) * s - fx * 5, b.y + fx * sd * (8 + flap) * s - fy * 5); }
        c.stroke();
      }
    }
    c.globalAlpha = 1;
  }
  function spark(x, y, h, n = 3) {
    for (let k = 0; k < n && S.particles.length < 340; k++) { const a = h + Math.PI + (Math.random() - 0.5) * 1.1, v = 180 + Math.random() * 260; S.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.18 + Math.random() * 0.2, age: 0, r: 1.4, spark: 1, color: Math.random() < 0.6 ? "#ffd166" : "#ff8a3d" }); }
  }
  // ---- rain you can't miss: a darker sky, two layers of streaks blowing in the wind, splashes on the ground, drops
  // running down the lens, and in a downpour lightning (and thunder a moment later) ----
  const RAIN = { drops: [], splash: [], lens: [], flash: 0, nextBolt: 0, wind: -0.28 };
  function drawRain(w, h, dt, now) {
    const W = S.weather, wv = W.wet, raining = W.raining && !reducedMotion, lo = settings.fx === "low" || settings.gfx === "fast" ? 0.45 : settings.fx === "off" ? 0.2 : 1;
    dt = Math.min(dt, 0.05);
    // the sky: darker and bluer the wetter it is, darkest round the edges
    ctx.fillStyle = `rgba(22,34,58,${0.3 * wv})`; ctx.fillRect(0, 0, w, h);
    if (!RAIN.vg || RAIN.vg.w !== w || RAIN.vg.h !== h) { const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.hypot(w, h) / 2); g.addColorStop(0, "rgba(10,16,30,0)"); g.addColorStop(1, "rgba(10,16,30,0.6)"); RAIN.vg = { g, w, h }; }
    ctx.globalAlpha = wv; ctx.fillStyle = RAIN.vg.g; ctx.fillRect(0, 0, w, h); ctx.globalAlpha = 1;
    if (!raining) { RAIN.drops.length = 0; return; }
    // streaks: they fall (they don't flicker about), far ones thin and quick to fade, near ones long and bright
    const want = Math.round(420 * wv * lo);
    while (RAIN.drops.length < want) { const near = Math.random() < 0.35; RAIN.drops.push({ x: Math.random() * (w + 200), y: Math.random() * h, near, len: near ? 26 + Math.random() * 18 : 12 + Math.random() * 10, sp: near ? 1500 + Math.random() * 500 : 900 + Math.random() * 300 }); }
    if (RAIN.drops.length > want) RAIN.drops.length = want;
    const wind = RAIN.wind + Math.sin(now / 2300) * 0.08;
    for (const layer of [false, true]) {
      ctx.strokeStyle = layer ? "rgba(215,228,245,0.55)" : "rgba(190,205,230,0.32)"; ctx.lineWidth = layer ? 2 : 1.1; ctx.beginPath();
      for (const d of RAIN.drops) {
        if (d.near !== layer) continue;
        d.y += d.sp * dt; d.x += d.sp * wind * dt;
        if (d.y > h + 40 || d.x < -60) { d.y = -40 - Math.random() * 80; d.x = Math.random() * (w + 200); if (d.near && Math.random() < 0.5) RAIN.splash.push({ x: Math.random() * w, y: Math.random() * h, t: now }); }
        ctx.moveTo(d.x, d.y); ctx.lineTo(d.x - d.len * wind, d.y - d.len);
      }
      ctx.stroke();
    }
    // splashes: little rings on the ground
    for (let k = 0; k < 30 * wv * lo * dt * 10; k++) if (RAIN.splash.length < 90) RAIN.splash.push({ x: Math.random() * w, y: Math.random() * h, t: now });
    ctx.strokeStyle = "rgba(220,232,250,0.5)"; ctx.lineWidth = 1;
    RAIN.splash = RAIN.splash.filter((p) => { const k = (now - p.t) / 350; if (k > 1) return false; ctx.globalAlpha = 0.6 * (1 - k); ctx.beginPath(); ctx.ellipse(p.x, p.y, 2 + 7 * k, 1 + 3 * k, 0, 0, Math.PI * 2); ctx.stroke(); return true; });
    ctx.globalAlpha = 1;
    // drops on the lens in heavy rain: blurry blobs that slide down and run off
    if (wv > 0.45 && lo > 0.4) {
      if (RAIN.lens.length < 14 * wv && Math.random() < dt * 3) RAIN.lens.push({ x: Math.random() * w, y: Math.random() * h * 0.7, r: 6 + Math.random() * 16, v: 0, t: now });
      RAIN.lens = RAIN.lens.filter((d) => {
        d.v += (Math.random() < 0.02 ? 120 : -d.v * 2) * dt; d.y += Math.max(0, d.v) * dt; const age = (now - d.t) / 1000; if (age > 7 || d.y > h + d.r) return false;
        const a = Math.min(1, age * 3) * Math.min(1, (7 - age) / 1.5);
        const g = ctx.createRadialGradient(d.x - d.r * 0.3, d.y - d.r * 0.3, 1, d.x, d.y, d.r);
        g.addColorStop(0, `rgba(255,255,255,${0.32 * a})`); g.addColorStop(0.6, `rgba(190,210,240,${0.12 * a})`); g.addColorStop(1, "rgba(190,210,240,0)");
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2); ctx.fill(); return true;
      });
    } else RAIN.lens.length = 0;
    // lightning in a downpour (every 10-25s), thunder a moment later
    if (wv > 0.6 && S.phase === "race") {
      if (!RAIN.nextBolt) RAIN.nextBolt = now + 6000 + Math.random() * 10000;
      if (now > RAIN.nextBolt) {
        RAIN.nextBolt = now + 7000 + Math.random() * 11000; RAIN.flash = now;
        // a jagged bolt from the top of the screen, forking on the way down
        const bolt = [], x0 = w * (0.15 + Math.random() * 0.7); let x = x0, y = 0; bolt.push([x, y]);
        while (y < h * (0.55 + Math.random() * 0.35)) { y += 18 + Math.random() * 34; x += (Math.random() - 0.5) * 70; bolt.push([x, y]); }
        const fork = bolt.slice(0, 2 + Math.floor(Math.random() * (bolt.length - 2))), last = fork[fork.length - 1]; let fx = last[0], fy = last[1];
        for (let i = 0; i < 4; i++) { fy += 20 + Math.random() * 25; fx += (Math.random() < 0.5 ? -1 : 1) * (15 + Math.random() * 30); fork.push([fx, fy]); }
        RAIN.bolt = { pts: bolt, fork: fork.slice(fork.length - 5) };
        thunder(0.85 + Math.random() * 0.15);
      }
      const k = (now - RAIN.flash) / 450;
      if (k >= 0 && k < 1) {
        const f = (k < 0.15 ? 1 : k < 0.3 ? 0.3 : k < 0.42 ? 0.85 : 1 - k) * 0.5; ctx.fillStyle = `rgba(230,238,255,${Math.max(0, f)})`; ctx.fillRect(0, 0, w, h);
        if (RAIN.bolt && k < 0.6) {
          const draw = (pts, wd) => { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.lineWidth = wd; ctx.stroke(); };
          ctx.save(); ctx.globalAlpha = k < 0.15 ? 1 : k < 0.3 ? 0.4 : 0.9 * (1 - k / 0.6); ctx.lineJoin = "round"; ctx.lineCap = "round";
          ctx.strokeStyle = "rgba(160,190,255,0.5)"; ctx.shadowColor = "#9cc0ff"; ctx.shadowBlur = 30; draw(RAIN.bolt.pts, 9); draw(RAIN.bolt.fork, 5);
          ctx.strokeStyle = "#fff"; ctx.shadowBlur = 12; draw(RAIN.bolt.pts, 2.6); draw(RAIN.bolt.fork, 1.4);
          ctx.restore();
        }
      }
    } else RAIN.nextBolt = 0;
  }
  // the rain itself: a steady hiss (louder the harder it rains), and thunder
  let rainNode = null;
  function rainSound(on, wet) {
    const want = on && fxVol() > 0 && wet > 0.05, a = want ? audio() : actx; if (!a) return;
    if (!rainNode && want) {
      const n = noise(a), hp = a.createBiquadFilter(), lp = a.createBiquadFilter(), g = a.createGain();
      hp.type = "highpass"; hp.frequency.value = 900; lp.type = "lowpass"; lp.frequency.value = 7000; g.gain.value = 0;
      n.connect(hp).connect(lp).connect(g).connect(fxOut(a)); n.start(); rainNode = { g };
    }
    if (rainNode) rainNode.g.gain.setTargetAtTime(want ? (0.012 + 0.05 * wet) * fxVol() : 0, a.currentTime, 0.8);
  }
  // lightning strike: a CRACK right with the flash, then the BOOOOM (a deep hit and a long rolling rumble)
  function thunder(k = 1) {
    const a = actx; if (!a || fxVol() <= 0) return;
    const t0 = a.currentTime, V = fxVol() * k;
    const comp = a.createDynamicsCompressor(); comp.threshold.value = -10; comp.ratio.value = 6; comp.connect(fxOut(a));      // (loud, but no clipping)
    // the crack: sharp bursts of bright noise, like the air tearing
    for (let i = 0; i < 7; i++) {
      const n = noise(a), hp = a.createBiquadFilter(), g = a.createGain(), st = t0 + Math.random() * 0.22, len = 0.02 + Math.random() * 0.06;
      hp.type = "highpass"; hp.frequency.value = 1800 + Math.random() * 2500;
      g.gain.setValueAtTime(0, st); g.gain.linearRampToValueAtTime((0.5 + Math.random() * 0.4) * V, st + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, st + len);
      n.connect(hp).connect(g).connect(comp); n.start(st); n.stop(st + len + 0.05);
    }
    // the BOOM: a sub-bass thump that drops away...
    const b0 = t0 + 0.12, o = a.createOscillator(), og = a.createGain();
    o.type = "sine"; o.frequency.setValueAtTime(78, b0); o.frequency.exponentialRampToValueAtTime(28, b0 + 1.4);
    og.gain.setValueAtTime(0, b0); og.gain.linearRampToValueAtTime(0.95 * V, b0 + 0.03); og.gain.exponentialRampToValueAtTime(0.0001, b0 + 1.8);
    o.connect(og).connect(comp); o.start(b0); o.stop(b0 + 1.9);
    // ...and the rumble rolling away, with a couple of after-rolls
    const n = noise(a), lp = a.createBiquadFilter(), g = a.createGain();
    lp.type = "lowpass"; lp.frequency.setValueAtTime(900, b0); lp.frequency.exponentialRampToValueAtTime(70, b0 + 4);
    g.gain.setValueAtTime(0, b0); g.gain.linearRampToValueAtTime(0.85 * V, b0 + 0.05); g.gain.setTargetAtTime(0.3 * V, b0 + 0.35, 0.25);
    for (const at of [1.1 + Math.random() * 0.5, 2.0 + Math.random() * 0.8]) { g.gain.setTargetAtTime(0.42 * V, b0 + at, 0.08); g.gain.setTargetAtTime(0.12 * V, b0 + at + 0.25, 0.4); }
    g.gain.setTargetAtTime(0, b0 + 3.2, 0.6);
    n.connect(lp).connect(g).connect(comp); n.start(b0); n.stop(b0 + 6);
    if (S.screen === "race") addShake(16 * k);
  }
  function renderRace(dt, now) {
    const { w, h, dpr } = scr, t = S.track;
    if (!t) return;
    const th = THEMES[t.theme] || THEMES.grass; th.key = t.theme;
    if (!PH.on) interpCars(dt);
    if (S.winnerCamUntil && performance.now() > S.winnerCamUntil) { S.winnerCamUntil = 0; S.camTarget = null; $("watchChip").classList.add("hidden"); }
    let target = S.camTarget && S.cars.get(S.camTarget);
    // grid walk: before the lights, the camera drives down the grid from pole, one car at a time
    if (S.walk && (S.phase === "tires" || S.phase === "lights") && !PH.on) {
      if (!S.walk.ids && S.standings?.length) S.walk.ids = S.standings.slice();
      const k = (performance.now() - S.walk.t0) / 1000 - 1.2, ids = S.walk.ids || [], i = Math.floor(k / 0.7);
      if (ids.length && k >= 0 && i < Math.min(ids.length, 12)) {
        target = S.cars.get(ids[i]) || target; const info = S.race?.info.get(ids[i]);
        const gw = $("gridWalk"); gw.classList.remove("hidden"); gw.textContent = `P${i + 1} · ${target?.name || ""}${info?.team ? ` · ${info.team}` : ""}${ids[i] === S.myCar ? " (you)" : ""}`;
      } else if (k > 0 && ids.length) { $("gridWalk").classList.add("hidden"); S.walk = null; }
    } else if (S.walk && S.phase === "race") { S.walk = null; $("gridWalk").classList.add("hidden"); }
    if (!target) target = settings.cam === "leader" || !S.myCar ? S.cars.get(S.standings[0]) : S.cars.get(S.myCar);
    if (!target) target = [...S.cars.values()][0];
    if (!target || target.x === undefined) return;
    const sp = Math.max(0, target.speed || 0);
    const zoomBase = { close: 1.25, normal: 1, far: 0.72 }[settings.zoom] || 1;
    const tz = Math.min(w, h) / 760 * zoomBase * (1.05 - 0.22 * clamp(sp / 860, 0, 1));
    if (PH.on) { cam.x = PH.x; cam.y = PH.y; cam.z = PH.z; S.shake = 0; }         // photo mode: the camera is yours
    else {
      cam.z += (tz - cam.z) * Math.min(1, dt * 3);
      const lx = Math.cos(target.h) * sp * 0.28, ly = Math.sin(target.h) * sp * 0.28;
      if (!cam.x) { cam.x = target.x; cam.y = target.y; }
      cam.x += (target.x + lx - cam.x) * Math.min(1, dt * 5); cam.y += (target.y + ly - cam.y) * Math.min(1, dt * 5);
    }
    S.shake *= Math.exp(-dt * 8);
    const shx = S.shake ? (Math.random() - 0.5) * S.shake : 0, shy = S.shake ? (Math.random() - 0.5) * S.shake : 0;
    const z = cam.z, rot = PH.on ? PH.rot : 0;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = th.ground; ctx.fillRect(0, 0, w, h);
    ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * (w / 2 + shx), dpr * (h / 2 + shy));
    if (rot) ctx.rotate(rot);
    ctx.translate(-cam.x, -cam.y);
    if (!S.geo) S.geo = buildGeo(t);
    const G = S.geo;
    // what part of the world is on screen
    const spanX = rot ? Math.hypot(w, h) / 2 / z : w / 2 / z, spanY = rot ? Math.hypot(w, h) / 2 / z : h / 2 / z;
    const vx0 = cam.x - spanX - 60, vy0 = cam.y - spanY - 60, vx1 = cam.x + spanX + 60, vy1 = cam.y + spanY + 60;
    // static layer from the tile cache
    const sig = `${G.id}|${t.theme}|${settings.raceline}|${settings.scenery}|${gridCount()}`;
    if (sig !== tileSig) { tileSig = sig; resetTiles(); }
    tileQ = pickQ(z * dpr);
    tileBudget = S.phase === "race" ? 3 : 12;
    ctx.imageSmoothingEnabled = true;
    for (let ty = Math.max(0, Math.floor(vy0 / TILE)); ty <= Math.min(Math.floor(t.H / TILE), Math.floor(vy1 / TILE)); ty++) {
      for (let tx = Math.max(0, Math.floor(vx0 / TILE)); tx <= Math.min(Math.floor(t.W / TILE), Math.floor(vx1 / TILE)); tx++) {
        let tl = getTile(t, G, th, tx, ty, tileQ);
        if (!tl) for (const q of [1, 0.75, 1.5, 0.5, 2]) { tl = tiles.get(tx * 1000 + ty + q * 1e7); if (tl) break; }   // any size will do until it's ready
        if (!tl) { tileBudget = 1; tl = getTile(t, G, th, tx, ty, tileQ); }
        if (tl) ctx.drawImage(tl.cv, (TPAD - 0.3) * tl.q, (TPAD - 0.3) * tl.q, (TILE + 0.6) * tl.q, (TILE + 0.6) * tl.q, tx * TILE - 0.3, ty * TILE - 0.3, TILE + 0.6, TILE + 0.6);
      }
    }
    const visible = (c, m = 80) => c.x > vx0 - m && c.x < vx1 + m && c.y > vy0 - m && c.y < vy1 + m;
    if (S.weather) drawPuddles(ctx, t, S.weather.wet || 0, visible);
    // skid marks (painted into the tiles): sliding, spinning, or locking up hard on the brakes
    if (settings.skids === "on" && S.phase === "race" && !PH.on) {
      for (const c of S.cars.values()) {
        const lock = c._psp !== undefined && dt > 0 && (c._psp - c.speed) / dt > 700 && c.speed > 120; c._psp = c.speed;
        if (!((c.slide || (c.crashed && c.speed > 30) || lock) && c.lvl < 0.05 && !c.ghost)) continue;
        const fx = Math.cos(c.h), fy = Math.sin(c.h);
        for (const s of [-1, 1]) addSkid(c.x - fx * 15 - fy * s * 10, c.y - fy * 15 + fx * s * 10);
      }
    }
    // dust + smoke
    const fxLevel = settings.fx === "off" ? 0 : settings.fx === "low" || settings.gfx === "fast" ? 0.35 : 1;
    if (S.phase === "race" && fxLevel && !PH.on) for (const c of S.cars.values()) {
      if (!visible(c, 200)) continue;
      if (c.surf === 3 && Math.abs(c.speed) > 40 && Math.random() < 0.8 * fxLevel) puff(c, "rgba(170,140,90,0.55)");
      else if (c.surf === 2 && Math.abs(c.speed) > 120 && Math.random() < 0.5 * fxLevel) puff(c, th.night ? "rgba(90,80,60,0.5)" : "rgba(110,120,60,0.4)");
      if (S.weather && S.weather.wet > 0.25 && c.speed > 180 && Math.random() < 0.9 * fxLevel * S.weather.wet) { puff(c, "rgba(220,230,240,0.42)"); if (S.weather.wet > 0.6 && Math.random() < 0.5) puff(c, "rgba(210,222,238,0.3)"); }
      if (c.dmg > 0.55 && Math.random() < 0.25 * Math.max(0.4, fxLevel)) puff(c, "rgba(60,60,60,0.45)");
      if (c.extras?.trail && c.speed > 250 && S.particles.length < 300 && Math.random() < 0.35 * Math.max(0.4, fxLevel)) {
        S.particles.push({ x: c.x - Math.cos(c.h) * 22, y: c.y - Math.sin(c.h) * 22, vx: (Math.random() - 0.5) * 50, vy: (Math.random() - 0.5) * 50, life: 0.7, age: 0, r: 7, shape: c.extras.trail, k: Math.floor(Math.random() * 4) });
      }
      if (c.punct && c.speed > 30 && Math.random() < 0.9 * fxLevel) {
        S.particles.push({ x: c.x - Math.cos(c.h) * 18, y: c.y - Math.sin(c.h) * 18, vx: (Math.random() - 0.5) * 160, vy: (Math.random() - 0.5) * 160, life: 0.25, age: 0, r: 2, color: Math.random() < 0.5 ? "#ffcc1f" : "#ff7043" });
      }
      if (c.slide && Math.random() < 0.35 * fxLevel) puff(c, smokeCol(c.extras?.smoke));
      // sparks: bottoming out over the kerbs flat out, or a battered car scraping along
      if ((c.surf === 1 && c.speed > 300 && Math.random() < 0.3 * fxLevel) || (c.dmg > 0.6 && c.speed > 150 && Math.random() < 0.25 * fxLevel)) spark(c.x - Math.cos(c.h) * 18, c.y - Math.sin(c.h) * 18, c.h, 2);
      // dust clouds: a big billow off the gravel and the dry grass
      if ((c.surf === 3 || (c.surf === 2 && !(S.weather?.wet > 0.3))) && c.speed > 150 && S.particles.length < 300 && Math.random() < 0.18 * fxLevel)
        S.particles.push({ x: c.x - Math.cos(c.h) * 26, y: c.y - Math.sin(c.h) * 26, vx: (Math.random() - 0.5) * 40 - Math.cos(c.h) * 30, vy: (Math.random() - 0.5) * 40 - Math.sin(c.h) * 30, life: 1.4, age: 0, r: 14 + Math.random() * 8, color: c.surf === 3 ? "rgba(196,170,120,0.32)" : "rgba(170,160,110,0.22)" });
      // splashing through a puddle
      if (S.weather?.wet > 0.35 && c.speed > 140 && S.particles.length < 300) for (const p of TL.t === t ? TL.puddles : []) if (Math.abs(p.x - c.x) < p.rx && Math.abs(p.y - c.y) < p.rx) {
        for (let k = 0; k < 3; k++) { const a = c.h + Math.PI / 2 * (k % 2 ? 1 : -1) + (Math.random() - 0.5) * 0.8, v = 90 + Math.random() * 120; S.particles.push({ x: c.x, y: c.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.45, age: 0, r: 3, color: "rgba(210,225,245,0.6)" }); }
        break;
      }
      if (c.mistake && Math.random() < 0.6 * fxLevel) puff(c, "rgba(240,240,240,0.6)");
      if (c.dmg > 0.05 && Math.random() < 0.25 * c.dmg) puff(c, "rgba(60,60,60,0.45)");
    }
    if (!PH.on) S.particles = S.particles.filter((q) => { q.age += dt; q.x += q.vx * dt; q.y += q.vy * dt; if (!q.shape && !q.spark) q.r += 20 * dt; return q.age < q.life; });
    for (const q of S.particles) {
      if (q.shape) { trailShape(ctx, q.shape, q.x, q.y, 7 * (1 - 0.4 * q.age / q.life), 1 - q.age / q.life, q.k); continue; }
      ctx.globalAlpha = 1 - q.age / q.life; ctx.fillStyle = q.color; ctx.beginPath(); ctx.arc(q.x, q.y, q.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    // Cars and bridges, bottom to top: cars on the ground, then each bridge (lowest first) with
    // the cars driving on it (ramps included) drawn right after it. The server says which bit of
    // track each car is on, so a car on a ramp is never hidden under its own bridge.
    const layers = G.bridges.map(() => []), ground = [];
    for (const c of S.cars.values()) {
      if (c.x === undefined) continue;
      const ix = c.trackIdx ?? c.drawIdx ?? c.idx, k = ix !== undefined ? G.segOf[ix] : -1;
      (k >= 0 ? layers[k] : ground).push(c);
    }
    // the safety car, gliding along in front of the leader with its lights flashing. It's drawn on the
    // level of track it's on (over a ramp, not under it), bigger up there like the race cars.
    let scK = -2, scD = null;
    if (S.sc) {
      const d = scD = S.scDraw || (S.scDraw = { x: S.sc[0], y: S.sc[1], h: S.sc[2], lvl: S.sc[4] || 0 });
      const k = Math.min(1, dt * 6); d.x += (S.sc[0] - d.x) * k; d.y += (S.sc[1] - d.y) * k; d.h += wrapAng(S.sc[2] - d.h) * k; d.lvl += ((S.sc[4] || 0) - d.lvl) * k;
      scK = S.sc[3] != null && G.segOf[S.sc[3]] !== undefined ? G.segOf[S.sc[3]] : -1;
    } else S.scDraw = null;
    const drawSC = (alpha = 1) => {
      if (!scD) return;
      const d = scD, sc = 1.05 * (1 + 0.14 * Math.min(2, d.lvl));
      ctx.save(); ctx.globalAlpha = alpha;
      if (d.lvl > 0.05 && alpha === 1) { ctx.fillStyle = "rgba(0,0,0,0.3)"; ctx.beginPath(); ctx.ellipse(d.x + 16 * d.lvl, d.y + 22 * d.lvl, 26, 15, d.h, 0, Math.PI * 2); ctx.fill(); }
      drawCar(ctx, { color: "#f2f2f2", livery: "split", number: "SC", extras: null }, d.x, d.y, d.h, sc, {});
      const on = Math.floor(performance.now() / 250) % 2;
      ctx.translate(d.x, d.y); ctx.rotate(d.h); ctx.scale(sc, sc);
      for (const [yy, col] of [[-5, on ? "#ffb020" : "#5a3a00"], [5, on ? "#5a3a00" : "#ffb020"]]) { ctx.fillStyle = col; ctx.shadowColor = "#ffb020"; ctx.shadowBlur = col === "#ffb020" ? 14 : 0; ctx.fillRect(-4, yy - 2.5, 6, 5); }
      ctx.restore();
    };
    if (scK < 0) drawSC();
    drawGhost(ctx);
    const mineLast = (a, b) => (a.id === S.myCar) - (b.id === S.myCar);
    const drawOne = (c) => {
      if (!visible(c)) return;
      if (th.night || (S.race?.dayNight && duskLevel() > 0.35)) { ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.h); ctx.drawImage(headlight(), -30, -110); ctx.restore(); }
      if (c.ghost && !c.fin) ctx.globalAlpha = 0.5;
      if (c.lvl > 0.05) { ctx.fillStyle = "rgba(0,0,0,0.3)"; ctx.beginPath(); ctx.ellipse(c.x + 16 * c.lvl, c.y + 22 * c.lvl, 26, 15, c.h, 0, Math.PI * 2); ctx.fill(); }
      if (c.slip && settings.lines === "on" && !reducedMotion) {          // slipstream: wind streaks off the car
        ctx.strokeStyle = "rgba(200,230,255,0.55)"; ctx.lineWidth = 2;
        const fx = Math.cos(c.h), fy = Math.sin(c.h);
        for (const s of [-1, 1]) { const ox = -fy * s * 14, oy = fx * s * 14, L = 30 + Math.random() * 20; ctx.beginPath(); ctx.moveTo(c.x + ox + fx * 18, c.y + oy + fy * 18); ctx.lineTo(c.x + ox - fx * L, c.y + oy - fy * L); ctx.stroke(); }
      }
      drawCar(ctx, c, c.x, c.y, c.h, 1 + 0.14 * Math.min(2, c.lvl), { boost: c.boost, nitro: c.nitroOn, glow: c.id === S.myCar, aura: S.rareCars?.get(c.id) });
      if (c.def && !c.fin) {                    // defending: a blue shield across the back of the car
        const pu = reducedMotion ? 0.7 : 0.55 + 0.3 * Math.sin(performance.now() / 120), bx = c.x - Math.cos(c.h) * 10, by = c.y - Math.sin(c.h) * 10;
        ctx.save(); ctx.globalAlpha = pu; ctx.strokeStyle = "#5ab0ff"; ctx.shadowColor = "#5ab0ff"; ctx.shadowBlur = 12; ctx.lineWidth = 4; ctx.lineCap = "round";
        ctx.beginPath(); ctx.arc(bx, by, 30, c.h + Math.PI - 1.05, c.h + Math.PI + 1.05); ctx.stroke(); ctx.restore();
      }
      ctx.globalAlpha = 1;
      if (c.out) {                              // elimination: knocked out
        ctx.save(); ctx.font = "15px 'Russo One', sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.lineWidth = 3; ctx.strokeStyle = "rgba(0,0,0,0.6)"; ctx.fillStyle = "#ff6b61";
        ctx.strokeText("💀 OUT", c.x, c.y - 44); ctx.fillText("💀 OUT", c.x, c.y - 44); ctx.restore();
      } else if (c.fin) {
        if (!c.finPos) {
          c.finPos = [...S.cars.values()].filter((o) => o.finPos).length + 1;
          if (c.id === S.myCar) { banner(c.finPos === 1 ? "YOU WIN!" : `P${c.finPos}!`, "#ffcc1f"); addShake(6); }
        }
        ctx.save(); ctx.translate(c.x, c.y - 44);
        for (let r2 = 0; r2 < 2; r2++) for (let q = 0; q < 3; q++) { ctx.fillStyle = (r2 + q) % 2 ? "#111" : "#fff"; ctx.fillRect(-22 + q * 6, -8 + r2 * 6, 6, 6); }
        ctx.fillStyle = c.finPos === 1 ? "#ffcc1f" : "#fff"; ctx.font = "15px 'Russo One', sans-serif"; ctx.textAlign = "left"; ctx.textBaseline = "middle";
        ctx.lineWidth = 3; ctx.strokeStyle = "rgba(0,0,0,0.6)"; ctx.strokeText("P" + c.finPos, 0, -2); ctx.fillText("P" + c.finPos, 0, -2);
        ctx.restore();
      }
      if (c.pit >= 0) {
        ctx.strokeStyle = "rgba(0,0,0,0.4)"; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(c.x, c.y, 34, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = "#ffcc1f"; ctx.beginPath(); ctx.arc(c.x, c.y, 34, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * c.pit); ctx.stroke();
      }
      const showName = (settings.names === "all" || (settings.names === "mine" && c.id === S.myCar)) && (!PH.on || PH.names);
      if (showName) {
        const pos = S.standings ? S.standings.indexOf(c.id) + 1 : 0;
        const label = (pos ? (S.race?.multi && c.cls ? `${CLASSES[c.cls].short} P${classPos(c.id)} ` : `P${pos} `) : "") + (c.extras?.prest ? c.extras.prest + " " : "") + (c.extras?.badge ? c.extras.badge + " " : "") + (c.id === S.myCar ? `${c.name} (you)` : c.name) + (S.rival && c.name === S.rival ? " 🎯" : "");
        ctx.font = "700 13px 'Chakra Petch', sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "bottom";
        ctx.lineWidth = 3; ctx.strokeStyle = "rgba(0,0,0,0.65)"; ctx.strokeText(label, c.x, c.y - 24);
        ctx.fillStyle = c.id === S.myCar ? "#ffcc1f" : c.owner ? "#9ad0ff" : "#fff"; ctx.fillText(label, c.x, c.y - 24);
      }
      const em = S.emotes && S.emotes.get(c.id);
      if (em && em.until > performance.now()) {
        const k = Math.min(1, (em.until - performance.now()) / 400), y = c.y - (showName ? 58 : 42);
        ctx.globalAlpha = k; ctx.fillStyle = "rgba(255,255,255,0.95)"; ctx.beginPath(); ctx.arc(c.x, y, 17, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.moveTo(c.x - 5, y + 14); ctx.lineTo(c.x, y + 22); ctx.lineTo(c.x + 5, y + 14); ctx.fill();
        ctx.font = em.e === "GG" ? "800 14px 'Chakra Petch', sans-serif" : "20px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = "#111"; ctx.fillText(em.e, c.x, y + 1);
        ctx.globalAlpha = 1;
      }
    };
    // in a tunnel? (the car the camera follows) The view and the sound change while you're in there
    { const fc = (S.camTarget && S.cars.get(S.camTarget)) || S.cars.get(S.myCar); let inT = -1;
      if (fc && fc.drawIdx !== undefined && t.decor) t.decor.forEach((d, k) => { if (d.k === "tunnel" && ((fc.drawIdx - d.i + t.N) % t.N) <= decorLen(d)) inT = k; });
      if (inT >= 0) S.tunK = inT;
      S.tun = clamp((S.tun || 0) + (inT >= 0 ? 1 : -1) * Math.min(dt, 0.1) * 3, 0, 1); setEcho(S.replaying ? 0 : S.tun); }
    drawAutoStands(ctx, t);
    drawTrackLife(ctx, t, dt, now, visible);
    drawObjects(ctx, t, "ground");
    ground.sort(mineLast).forEach(drawOne);
    G.bridges.forEach((br, k) => { drawBridge(ctx, t, G, th, br); if (scK === k) drawSC(); layers[k].sort(mineLast).forEach(drawOne); });
    drawObjects(ctx, t, "top", (S.camTarget && S.cars.get(S.camTarget)) || S.cars.get(S.myCar));
    drawBirds(ctx, t, dt, now, visible);
    // fireworks (in the world, around the winner)
    fireworks = fireworks.filter((fw) => {
      const k = (now - fw.t) / 1300; if (k > 1) return false;
      for (let n = 0; n < 24; n++) {
        const a = (n / 24) * Math.PI * 2, r = 20 + k * 150;
        ctx.globalAlpha = 1 - k; ctx.fillStyle = `hsl(${fw.hue + n * 6} 90% 60%)`;
        ctx.beginPath(); ctx.arc(fw.x + Math.cos(a) * r, fw.y + Math.sin(a) * r + k * k * 60, 4 * (1 - k) + 1.5, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1; return true;
    });
    // screen-space effects
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (S.weather && S.weather.wet > 0.02) drawRain(w, h, dt, now);
    rainSound(S.screen === "race" && !S.replaying && !!S.weather?.raining, S.weather?.wet || 0);
    const fogX = PH.on ? w / 2 : w / 2 + (target.x - cam.x) * z, fogY = PH.on ? h / 2 : h / 2 + (target.y - cam.y) * z;
    // day into night: the light fades as the race goes on (from about a third of the way in)
    const dusk = !th.night && S.race?.dayNight ? duskLevel() : 0;
    if (th.night || dusk > 0.02) {
      if (settings.fx === "off") {       // cheap version: just darker round the edges
        if (!S.vignette || S.vignette.w !== w || S.vignette.h !== h) { const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.2, w / 2, h / 2, Math.hypot(w, h) / 2); g.addColorStop(0, "rgba(0,0,20,0)"); g.addColorStop(1, "rgba(0,0,20,0.55)"); S.vignette = { g, w, h }; }
        ctx.fillStyle = S.vignette.g; ctx.fillRect(0, 0, w, h);
      } else drawNight(w, h, dpr, z, shx, shy, th, S.race?.fog ? { now, x: fogX, y: fogY } : null, th.night ? 1 : dusk);
    }
    if (S.race?.fog && !(th.night && settings.fx !== "off")) drawFog(w, h, !!th.night, now, fogX, fogY);
    // DRS open: the screen edges glow green (with a pulse when it opens), and green speed streaks
    if (target.id === S.myCar && target.drs) {
      const pulse = S.drsFlash ? Math.max(0, 1 - (performance.now() - S.drsFlash) / 700) : 0;
      if (!S.drsVig || S.drsVig.w !== w || S.drsVig.h !== h) { const g2 = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.32, w / 2, h / 2, Math.hypot(w, h) / 2); g2.addColorStop(0, "rgba(62,224,106,0)"); g2.addColorStop(1, "rgba(62,224,106,0.42)"); S.drsVig = { g: g2, w, h }; }
      ctx.globalAlpha = 0.75 + 0.25 * Math.sin(now / 120) + pulse; ctx.fillStyle = S.drsVig.g; ctx.fillRect(0, 0, w, h); ctx.globalAlpha = 1;
      if (pulse > 0) { ctx.fillStyle = `rgba(62,224,106,${0.22 * pulse})`; ctx.fillRect(0, 0, w, h); }
      if (!reducedMotion) {
        ctx.strokeStyle = "rgba(120,255,160,0.55)"; ctx.lineWidth = 2.5; ctx.beginPath();
        for (let i = 0; i < 18; i++) { const ang = Math.random() * Math.PI * 2, r1 = Math.min(w, h) * (0.36 + Math.random() * 0.1), r2 = r1 + 60 + Math.random() * 90; ctx.moveTo(w / 2 + Math.cos(ang) * r1, h / 2 + Math.sin(ang) * r1); ctx.lineTo(w / 2 + Math.cos(ang) * r2, h / 2 + Math.sin(ang) * r2); }
        ctx.stroke();
      }
    }
    if (settings.lines === "on" && !reducedMotion && sp > 640) {
      const a = clamp((sp - 640) / 240, 0, 1) * 0.35;
      ctx.strokeStyle = target.nitroOn ? `rgba(120,200,255,${a + 0.15})` : `rgba(255,255,255,${a})`; ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < 14; i++) {
        const ang = Math.random() * Math.PI * 2, r1 = Math.min(w, h) * (0.42 + Math.random() * 0.1), r2 = r1 + 40 + Math.random() * 60;
        ctx.moveTo(w / 2 + Math.cos(ang) * r1, h / 2 + Math.sin(ang) * r1); ctx.lineTo(w / 2 + Math.cos(ang) * r2, h / 2 + Math.sin(ang) * r2);
      }
      ctx.stroke();
    }
    if (settings.minimap === "on" && (!S.miniAt || now - S.miniAt > 50)) { S.miniAt = now; renderMinimap(); }
    if (!S.hudAt || now - S.hudAt > 100) { S.hudAt = now; updateHud(now); }
    updateBoost();
    const mine = S.cars.get(S.myCar);
    // the cars around you hum too (nearest few, louder when close)
    let near = null;
    if (mine) { let k = 0, sp = 0; for (const c of S.cars.values()) { if (c === mine || c.x === undefined) continue; const d = Math.hypot(c.x - mine.x, c.y - mine.y); if (d < 650) { const w = 1 - d / 650; k += w; if (w > 0.3) sp = Math.max(sp, c.speed || 0); } } near = { k, speed: sp }; }
    engineSound(mine ? mine.speed : 0, S.screen === "race" && S.phase === "race" && !!mine && !S.photoOn, !!(mine && mine.nitroOn), near);
    tyreSound(mine, S.screen === "race" && S.phase === "race" && !S.photoOn && !S.replaying);
  }
  // store: tyre smoke colour (rainbow cycles, stardust sparkles gold and white)
  function smokeCol(s) {
    if (!s) return "rgba(230,230,230,0.5)";
    if (s === "rainbow") return `hsla(${(performance.now() / 6) % 360},95%,65%,0.6)`;
    if (s === "liquidgold") return `hsla(${40 + Math.random() * 12},100%,${52 + Math.random() * 22}%,0.85)`;
    if (s === "neon") return Math.floor(performance.now() / 300) % 2 ? "rgba(34,230,255,0.6)" : "rgba(255,43,214,0.6)";
    if (s === "fire") return `hsla(${10 + Math.random() * 35},100%,${50 + Math.random() * 15}%,0.65)`;
    if (s === "spooky") return Math.random() < 0.6 ? "rgba(190,255,215,0.45)" : "rgba(160,110,255,0.45)";
    if (s === "stardust") return Math.random() < 0.5 ? "rgba(255,226,120,0.85)" : Math.random() < 0.5 ? "rgba(255,255,255,0.9)" : "rgba(190,140,255,0.8)";
    return s + "aa";
  }
  const wrapAng = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
  function puff(c, color) {
    if (S.particles.length > 300) return;
    S.particles.push({ x: c.x - Math.cos(c.h) * 20, y: c.y - Math.sin(c.h) * 20, vx: (Math.random() - 0.5) * 60, vy: (Math.random() - 0.5) * 60, life: 0.6, age: 0, r: 6 + Math.random() * 6, color });
  }
  function renderMinimap() {
    const t = S.track, mw = mini.width / scr.dpr, mh = mini.height / scr.dpr, pad = 10;
    mctx.setTransform(scr.dpr, 0, 0, scr.dpr, 0, 0); mctx.clearRect(0, 0, mw, mh);
    const s = Math.min((mw - pad * 2) / t.W, (mh - pad * 2) / t.H), ox = (mw - t.W * s) / 2, oy = (mh - t.H * s) / 2;
    if (!S.geo) return;
    mctx.save(); mctx.translate(ox, oy); mctx.scale(s, s);
    mctx.lineWidth = 5 / s; mctx.strokeStyle = "rgba(255,255,255,0.35)"; mctx.lineJoin = "round"; mctx.stroke(S.geo.trackPath);
    mctx.restore();
    for (const c of S.cars.values()) {
      if (c.x === undefined) continue;
      mctx.beginPath(); mctx.arc(ox + c.x * s, oy + c.y * s, c.id === S.myCar ? 4.5 : 3.2, 0, Math.PI * 2);
      mctx.fillStyle = c.color; mctx.globalAlpha = c.ghost ? 0.45 : 1; mctx.fill(); mctx.globalAlpha = 1;
      if (c.id === S.myCar) { mctx.lineWidth = 1.5; mctx.strokeStyle = "#fff"; mctx.stroke(); }
    }
  }
  // ---- Boost: hold the button (or Space / N). 100% tank, drains while held, refills slowly ----
  let nitroHeld = false;
  function setNitro(on) {
    on = !!on && S.screen === "race" && !!S.myCar;
    if (on === nitroHeld) return;
    nitroHeld = on; socket.emit("nitro", on);
    $("boostBtn").classList.toggle("on", on);
  }
  // ---- assists: tell the server (it does the pit calls / boost / DRS) ----
  function sendAssists() { socket.emit("assists", { pit: settings.asPit === "on", boost: settings.asBoost === "on", drs: settings.asDrs === "on", defend: settings.asDefend === "on" }); }
  socket.on("connect", sendAssists); socket.on("joined", sendAssists); socket.on("race", sendAssists);
  keyHints();
  // ======================= Commentator =======================
  // Real recorded lines (Kokoro's best neural voice, "Heart", made ahead of time: public/commentary). Lines about a
  // driver are whole recorded sentences with the name in them ("Bolt wins the race!"): every built-in AI name,
  // and "Number 0-99" for players and renamed AI. Everything else is a general line.
  const COMM = { man: null, cache: new Map(), queue: [], busy: false, last: {}, leader: null, at: {} };
  fetch("commentary/manifest.json").then((r) => (r.ok ? r.json() : null)).then((m) => { COMM.man = m; }).catch(() => {});
  // the server owner can give the commentator an ElevenLabs voice (COMMENTATOR_VOICE): then lines come from /voice/
  COMM.base = "commentary/";
  fetch("voice/config").then((r) => (r.ok ? r.json() : null)).then((c) => { if (c?.eleven) { COMM.base = "voice/"; COMM.cache.clear(); } }).catch(() => {});
  const commVol = () => (Number(settings.vMaster) / 100) * (Number(settings.vComm ?? 80) / 100);
  function commClip(file) {
    if (!COMM.cache.has(file)) COMM.cache.set(file, fetch(COMM.base + file).then((r) => { const v = r.headers.get("X-Voice"); if (v === "built-in" || v === "pending") setTimeout(() => COMM.cache.delete(file), 0); return r.ok && r.status !== 204 ? r.arrayBuffer() : null; }).then((b) => (b && audio() ? audio().decodeAudioData(b) : null)).catch(() => null));
    return COMM.cache.get(file);
  }
  function commName(name) {
    const base = String(name || "").replace(/ \d+$/, ""), slug = COMM.man?.names?.[base];
    if (slug) return slug;
    const car = [...S.cars.values()].find((c) => c.name === name), n = Number(car?.number);
    return Number.isInteger(n) && n >= 0 && n < 100 ? `n${n}` : null;
  }
  function commLine(key) {
    const n = COMM.man?.lines?.[key]; if (!n) return null;
    let i = Math.floor(Math.random() * n); if (n > 1 && COMM.last[key] === i) i = (i + 1) % n; COMM.last[key] = i;
    return `l_${key}_${i}.mp3`;
  }
  // say: a line (with a name in front, if given). prio: 3 = wins, 2 = big moments, 1 = normal, 0 = filler
  // He doesn't talk all the time: after every line there's a quiet spell (long for small stuff, short for big
  // moments, none for the winner), small stuff isn't queued up behind another line, and filler is only sometimes.
  const COMM_QUIET = [16000, 9000, 3000, 0];
  function say(key, name, prio = 1, gap = 0) {
    if (!COMM.man || commVol() <= 0 || S.replaying || (S.ql >= 0 && key !== "qko" && key !== "pole")) return;
    const now = performance.now();
    if (gap && now - (COMM.at[key] || 0) < gap) return;
    if (now - (COMM.lastEnd || -1e9) < COMM_QUIET[Math.min(3, prio)] || (COMM.busy && prio < 2) || (prio === 0 && Math.random() < 0.5)) return;
    COMM.at[key] = now;
    const who = name && COMM.man.named?.includes(key) ? commName(name) : null;
    const parts = [who ? `s_${key}_${who}.mp3` : commLine(key)].filter(Boolean);
    if (!parts.length) return;
    parts.forEach(commClip);                         // start loading straight away
    COMM.queue.push({ parts, prio, at: now }); COMM.queue.sort((a, b) => b.prio - a.prio);
    if (COMM.queue.length > 2) COMM.queue.length = 2;
    commNext();
  }
  async function commNext() {
    if (COMM.busy) return;
    const it = COMM.queue.shift(); if (!it) return;
    if (performance.now() - it.at > (it.prio >= 3 ? 9000 : 3500)) return commNext();   // old news: skip it
    COMM.busy = true;
    const bufs = (await Promise.all(it.parts.map(commClip))).filter(Boolean), a = audio();
    if (!bufs.length || !a) { COMM.busy = false; return commNext(); }
    const g = a.createGain(); g.gain.value = Math.min(1.4, commVol() * 1.3); g.connect(fxOut(a));
    if (MUS.el) MUS.el.volume = Math.max(0, Math.min(1, musicVol() * 0.35)); if (MUS.syn) MUS.syn.out.gain.value = Math.min(1, musicVol()) * 0.2;   // duck the music
    let t = a.currentTime + 0.05;
    for (const b of bufs) { const src = a.createBufferSource(); src.buffer = b; src.connect(g); src.start(t); t += b.duration + 0.06; }
    setTimeout(() => { COMM.busy = false; COMM.lastEnd = performance.now(); setMusicVolume(); setTimeout(commNext, 200); }, (t - a.currentTime) * 1000 + 50);
  }
  socket.on("lightsOut", () => { COMM.leader = null; if (!S.race?.quali) say("start", null, 2); });
  socket.on("race", () => { COMM.queue.length = 0; COMM.leader = null; COMM.half = false; ["l_start_0.mp3", "l_start_1.mp3", "l_start_2.mp3"].forEach((f) => COMM.man && commClip(f)); });
  socket.on("feed", (f) => {
    const mine = (nm) => S.cars.get(S.myCar)?.name === nm;
    if (f.t === "crash") { crowdRoar(f.big ? 1 : 0.5); standEvent(f.x, f.y, f.big ? 1 : 0.6); markMoment(f.big ? 3 : 1, `💥 ${f.name} and ${f.other} crash`, 2); if (f.big) say("crashBig", null, 2, 8000); else say("crash", null, 1, 15000); }
    else if (f.t === "winner" && (crowdRoar(1.3), cheer(1.2, 0.9), markMoment(2, `🏁 ${f.name} wins`), true)) say(mine(f.name) ? "winYou" : S.race?.elim ? "standing" : "win", mine(f.name) ? null : f.name, 3);
    else if (f.t === "classWin" && !mine(f.name)) say("classWin", f.name, 3);
    else if (f.t === "photo") { crowdRoar(1.3); cheer(1.3, 1); markMoment(4, "📸 Photo finish!"); say("photo", null, 2); }
    else if (f.t === "lastLap") say("lastLap", null, 1);
    else if (f.t === "scOut") say("scOut", null, 2);
    else if (f.t === "scIn") say("scIn", null, 2);
    else if (f.t === "rain") say("rain", null, 1);
    else if (f.t === "puncture") say("puncture", f.name, 1, 8000);
    else if (f.t === "fastest") say("fastest", f.name, 0, 20000);
    else if (f.t === "elim") say(mine(f.name) ? "elimYou" : "elim", mine(f.name) ? null : f.name, 2);
    else if (f.t === "drs") say("drs", null, 0, 60000);
    else if (f.t === "jump") say("jump", null, 1, 8000);
    else if (f.t === "pitSlow") say("pitSlow", null, 0, 15000);
    else if (f.t === "mistake") say("mistake", null, 0, 20000);
    else if (f.t === "qko") say("qko", null, 2);
    else if (f.t === "timeUp") { say("lastLap", null, 2); banner("⏳ TIME'S UP: LAST LAP!", "#ffc53d"); }
    else if (f.t === "redFlag") { say("crashBig", null, 3); banner("🟥 RED FLAG", "#ff2d55"); addShake(10); popup(`Huge pile-up! Race stopped for ${f.secs}s. Here it is again, then everyone goes back to the grid in the order before the crash${S.race?.multi ? " (each class together)" : ""}`, true); setTimeout(() => rfReplay(f), 700); }
    else if (f.t === "rfRestart") popup("Standing restart from the grid!");
  });
  // new leader (from the race state): "Bolt takes the lead!"
  function commLeader(st) {
    if (!S.race || S.race.quali || st.phase !== "race") return;
    const lead = st.standings?.[0], c = S.cars.get(lead);
    if (COMM.leader != null && lead !== COMM.leader && S.t > 8 && c && !c.fin && !c.out) { crowdRoar(0.9); standEvent(c.x, c.y, 0.9); markMoment(3, `🥇 ${c.name} takes the lead`); }
    if (COMM.leader != null && lead !== COMM.leader && S.t > 8 && c && !c.fin && !c.out) say(lead === S.myCar ? "leadYou" : "lead", lead === S.myCar ? null : c.name, lead === S.myCar ? 2 : 1, 15000);
    COMM.leader = lead;
    // halfway, and a close fight for the lead
    const laps = S.race.laps || 0;
    if (c && laps >= 4 && !COMM.half && c.laps >= Math.floor(laps / 2) && !c.fin) { COMM.half = true; say("halfway", null, 0); }
    if (S.t > 15 && st.gaps?.[1] !== undefined && st.gaps[1] >= 0 && st.gaps[1] < 0.35 && !c?.fin) say("battle", null, 0, 45000);
  }

  // ======================= Pit stop minigame =======================
  // Your car stops in the box: hit the 6 arrows in order (arrow keys / WASD / the buttons). The stop takes as long as
  // you do (a bit less), and wrong keys cost time. The server times it.
  const PG = { on: false, seq: [], i: 0, keys: [], t0: 0, misses: 0, timer: 0 };
  const PG_KEYS = { ArrowLeft: 0, ArrowDown: 1, ArrowUp: 2, ArrowRight: 3, KeyA: 0, KeyS: 1, KeyW: 2, KeyD: 3 };
  const pgArrow = (d) => `<svg viewBox="0 0 100 100" aria-hidden="true" style="transform:rotate(${[-90, 180, 0, 90][d]}deg)"><path d="M50 8 L92 52 L66 52 L66 92 L34 92 L34 52 L8 52 Z"/></svg>`;
  document.querySelectorAll("#pgPad button").forEach((b) => { b.innerHTML = pgArrow(Number(b.dataset.d)); b.classList.add("d" + b.dataset.d); b.addEventListener("pointerdown", (e) => { e.preventDefault(); pgPress(Number(b.dataset.d)); }); });
  function pgRender() {
    const row = $("pgRow"); row.textContent = "";
    PG.seq.forEach((d, k) => { const s2 = document.createElement("span"); s2.className = `pg-a d${d}` + (k < PG.i ? " hit" : k === PG.i ? " now" : ""); s2.innerHTML = pgArrow(d); row.appendChild(s2); });
    $("pgMiss").textContent = PG.misses ? `❌ ${PG.misses} wrong (+${(PG.misses * 0.45).toFixed(1)}s)` : "";
  }
  socket.on("pitGame", (d) => {
    Object.assign(PG, { on: true, seq: d.seq, i: 0, keys: [], misses: 0, t0: performance.now(), max: d.max || 8 });
    $("pgRes").classList.add("hidden"); $("pitGame").classList.remove("hidden", "done"); pgRender(); sfx("tick");
    clearInterval(PG.timer); PG.timer = setInterval(() => { if (PG.on) $("pgTime").textContent = ((performance.now() - PG.t0) / 1000).toFixed(2) + "s"; }, 50);
  });
  function pgPress(d) {
    if (!PG.on) return;
    PG.keys.push(d);
    if (d === PG.seq[PG.i]) { PG.i++; tone(440 * Math.pow(1.122, PG.i), 0.07, "square", 0.12); }
    else { PG.misses++; tone(110, 0.15, "sawtooth", 0.15); const row = $("pgRow"); row.classList.remove("shake"); void row.offsetWidth; row.classList.add("shake"); }
    pgRender();
    if (PG.i >= PG.seq.length) { PG.on = false; clearInterval(PG.timer); $("pitGame").classList.add("done"); socket.emit("pitGame", PG.keys); }
  }
  socket.on("pitGameResult", (r) => {
    PG.on = false; clearInterval(PG.timer);
    const good = r.done && r.stop <= r.ai * 0.9, bad = !r.done || r.stop > r.ai * 1.2;
    const res = $("pgRes"); res.classList.remove("hidden"); res.className = "pg-res " + (good ? "good" : bad ? "bad" : "");
    res.textContent = !r.done ? `😬 Too slow! The crew finished without you: ${r.stop.toFixed(2)}s` : `${good ? "⚡ PERFECT STOP" : bad ? "🐢 Slow stop" : "✅ Good stop"}: ${r.stop.toFixed(2)}s (AI crews: ${r.ai.toFixed(1)}s)`;
    if (good) say("pitGood", null, 1); else if (bad) say("pitBad", null, 1);
    sfx(good ? "level" : "tick");
    if (r.done && !bad) { res.classList.add("pick-pop"); res.style.setProperty("--pick", good ? "#3ecf6a" : "#5ab0ff"); if (good) burstFrom(res, "#3ecf6a", 14, 80); }
    setTimeout(() => $("pitGame").classList.add("hidden"), 1800);
  });
  socket.on("race", () => { PG.on = false; clearInterval(PG.timer); $("pitGame").classList.add("hidden"); });
  // arrow keys / WASD go to the pit crew while the minigame is up (and nothing else: D won't open DRS)
  window.addEventListener("keydown", (e) => {
    if (!PG.on || !(e.code in PG_KEYS)) return;
    e.preventDefault(); e.stopImmediatePropagation(); if (!e.repeat) pgPress(PG_KEYS[e.code]);
  }, { capture: true });

  // ---- Defend: costs 10% boost to switch on, then 8% a second. Your driver covers the car behind. ----
  function setDefendUi(on) { S.defendOn = on; const b = $("defendBtn"); b.classList.toggle("on", on); b.setAttribute("aria-pressed", String(on)); }
  function toggleDefend() {
    const me = S.cars.get(S.myCar); if (!me || me.fin || S.ql >= 0) return;
    const on = !S.defendOn;
    if (on && (me.nitro ?? 0) < 10) { popup("🛡️ Defend needs at least 10% boost", true); return; }
    S.defendAt = performance.now(); setDefendUi(on); socket.emit("defend", on); sfx("tick");
    if (on) say("defend", null, 0, 20000);
    if (on && !S.defendTold) { S.defendTold = true; popup("🛡️ Defending! Your driver covers the car behind and they get no slipstream. Costs 10% boost, then 8% a second."); }
  }
  $("defendBtn").addEventListener("pointerdown", (e) => { e.preventDefault(); toggleDefend(); });
  $("endPracticeBtn").addEventListener("click", () => socket.emit("endPractice"));
  socket.on("qualiOut", (d) => { banner(`KNOCKED OUT IN Q${d.stage}`, "#ff6b61"); popup(`Out in Q${d.stage}: you start P${d.pos}. Keep lapping or just watch.`, true); });
  // strategy preview (before the start): the strategist's plan, one tap to use it
  socket.on("strategy", (g) => {
    S.strat = g; const T = (k) => TIRES[k]?.name || k;
    $("tpStratText").textContent = g.rain ? "📋 Strategist: it's wet. Start on Wets and watch for it drying out." : g.stops ? `📋 Strategist: ${g.stops} stop${g.stops > 1 ? "s" : ""} · start on ${T(g.start)} · box at the end of lap ${g.box} · then ${T(g.next)}` : `📋 Strategist: no stops! ${T(g.start)} tyres go all ${g.laps} laps`;
    $("tpStrat").classList.remove("hidden");
  });
  $("tpStratUse").addEventListener("click", () => {
    const g = S.strat; if (!g) return;
    S.startPick = g.start; socket.emit("compound", g.start); markPick();
    if (g.next) { socket.emit("nextCompound", g.next); S.nextComp = g.next; renderNextTires(); }
    if (g.box) S.stratBox = g.box;
    popup(g.next ? `📋 Plan set: ${TIRES[g.start]?.name} now, ${TIRES[g.next]?.name} at the stop. Box at the end of lap ${g.box}!` : `📋 Plan set: ${TIRES[g.start]?.name} tyres`); sfx("tick");
  });
  socket.on("race", () => { $("tpStrat").classList.add("hidden"); S.strat = null; S.stratBox = null; });
  // rematch
  $("rematchBtn").addEventListener("click", () => { socket.emit("rematch"); if (!S.host) { $("rematchBtn").textContent = "🔁 Voted for a rematch"; $("rematchBtn").disabled = true; } });
  socket.on("rematchVotes", (v) => { if (S.host) { $("rematchBtn").textContent = `🔁 Rematch now (${v.n} want it)`; popup(`🔁 ${v.by} wants a rematch!`); } });
  socket.on("eliminated", (d) => {
    banner(`💥 YOU'RE OUT! P${d.pos}`, "#ff6b61"); sfx("jump"); addShake(10);
    popup(`Knocked out in P${d.pos} of ${d.of}. Watch who's the last car standing!`, true);
    setNitro(false); setDefendUi(false); S.camTarget = S.standings.find((i) => !S.cars.get(i)?.out) ?? null;
  });
  socket.on("raceStopped", (d) => { popup("🛑 " + (d?.msg || "The race was stopped."), true); if (S.screen === "race" || S.screen === "results") show("lobby"); });
  socket.on("defendMsg", (m) => { setDefendUi(false); if (m) popup(m, true); });
  socket.on("race", () => setDefendUi(false));
  // ---- DRS: in a zone with DRS available, press D (or the DRS button) to open the flap ----
  function openDrs() { const me = S.cars.get(S.myCar); if (me && me.drsAvail) socket.emit("drs"); }
  $("drsGo").addEventListener("pointerdown", (e) => { e.preventDefault(); openDrs(); });
  socket.on("drsReady", () => { sfx("tick"); if (!S.drsTold) { S.drsTold = true; popup(`🟩 DRS available! Press ${keyName(KEY("drs"))} (or the DRS button) to open it. (Settings > Assists can open it for you.)`); } });
  socket.on("drsOn", () => {
    sfx("drs"); banner("DRS OPEN", "#3ee06a"); S.drsFlash = performance.now();
  });
  const boostBtn = $("boostBtn");
  boostBtn.addEventListener("pointerdown", (e) => { e.preventDefault(); boostBtn.setPointerCapture(e.pointerId); if (!S.reacted && !$("lights").classList.contains("hidden")) react(); else setNitro(true); });
  for (const ev of ["pointerup", "pointercancel", "lostpointercapture"]) boostBtn.addEventListener(ev, () => setNitro(false));
  boostBtn.addEventListener("contextmenu", (e) => e.preventDefault());
  window.addEventListener("blur", () => setNitro(false));
  document.addEventListener("visibilitychange", () => { if (document.hidden) setNitro(false); });
  let boostShown = "";
  function updateBoost() {
    const me = S.cars.get(S.myCar);
    $("boostPanel").classList.toggle("hidden", !me);
    if (!me) return;
    const pct = Math.round(me.nitro ?? 100), lock = (S.xp && S.xp.nitroLock) || 0, key = pct + "|" + lock + "|" + (me.slip ? 1 : 0) + (me.nitroOn ? 1 : 0) + (me.drs ? 1 : 0) + (me.drsAvail ? 1 : 0) + (me.def ? 1 : 0) + (me.fin ? 1 : 0) + (S.ql >= 0 ? 1 : 0);
    if (key === boostShown) return; boostShown = key;
    $("boostPct").textContent = lock > 0 ? `⏳${lock}s` : pct + "%";
    boostBtn.classList.toggle("locked", lock > 0); $("boostFill").style.width = pct + "%"; boostBtn.style.setProperty("--boost", pct + "%");
    boostBtn.classList.toggle("empty", pct < 3);
    const small = window.innerWidth <= 860, tags = [];
    if (me.def) tags.push(small ? "🛡️ DEFENDING" : "🛡️ DEFENDING −8%/s");
    $("defendBtn").classList.toggle("hidden", !!me.fin || S.ql >= 0); $("defendBtn").classList.toggle("active", !!me.def);
    if (me.slip) tags.push(small ? "💨 SLIP +30%" : "💨 SLIPSTREAM +30%");
    if (me.drs) tags.push(small ? "🟩 DRS OPEN" : "🟩 DRS OPEN +12%");
    else if (me.drsAvail) tags.push(small ? `🟩 DRS: press ${keyName(KEY("drs"))}` : `🟩 DRS AVAILABLE: press ${keyName(KEY("drs"))}`);
    const dg = $("drsGo"); dg.classList.toggle("hidden", !(me.drs || me.drsAvail) || !!me.fin);
    dg.classList.toggle("ready", !!me.drsAvail); dg.classList.toggle("open", !!me.drs);
    dg.querySelector(".dg-lab").textContent = me.drs ? "DRS OPEN" : "DRS";
    $("slipTag").classList.toggle("hidden", !tags.length || !!me.fin);
    $("slipTag").classList.toggle("drs", !!(me.drs || me.drsAvail) && !me.slip);
    document.body.classList.toggle("drs-open", !!me.drs && !me.fin);
    $("slipTag").textContent = tags.join(" · ");
  }
  let lastHudStand = "";
  const fmtGap = (g, i) => (i === 0 ? "Leader" : g < 0 ? "+1 lap" : "+" + g.toFixed(1) + "s");
  // Phones: stack the bottom HUD (radio, then tires/XP, then the pit tire picker) by measuring,
  // so nothing hides behind anything at any interface size.
  function layoutHud() {
    // (phones held sideways have their own fixed layout in the CSS: nothing to measure)
    const sideways = window.innerHeight <= 520 && window.innerWidth > window.innerHeight;
    const phone = window.innerWidth <= 860 && !sideways, bottom = $("hudBottom"), radio = $("radio"), pick = $("pitPick");
    if (!phone || radio.classList.contains("hidden")) { bottom.style.bottom = ""; pick.style.bottom = ""; return; }
    const rH = radio.getBoundingClientRect().height, bH = bottom.getBoundingClientRect().height;
    bottom.style.bottom = `calc(${Math.round(rH + 12)}px + env(safe-area-inset-bottom, 0px))`;
    pick.style.bottom = `calc(${Math.round(rH + bH + 18)}px + env(safe-area-inset-bottom, 0px))`;
  }
  window.addEventListener("resize", () => { if (S.screen === "race") layoutHud(); });
  // sector times: purple = fastest of anyone, green = your best, yellow = slower. The sector you're in counts up live.
  function renderSectors(me) {
    const box = $("sectors"), X = S.sec;
    box.classList.toggle("hidden", !X || me.id !== S.myCar || me.fin || me.out);
    if (!X || me.id !== S.myCar) return;
    [...box.children].forEach((el, k) => {
      const live = k === X.now && X.at != null, t = live ? Math.max(0, S.t - X.at) : X.t?.[k];
      el.textContent = t == null ? `S${k + 1} --` : `S${k + 1} ${t.toFixed(live ? 1 : 2)}`;
      el.className = live ? "live" : X.col?.[k] || "";
      el.title = X.best?.[k] ? `Your best S${k + 1}: ${X.best[k].toFixed(3)}s` : "";
    });
  }
  // multiclass: positions inside your own class
  const clsOf = (id) => S.cars.get(id)?.cls || S.race?.info.get(id)?.cls || null;
  function classPos(id) { const k = clsOf(id); let n = 0; for (const i of S.standings) { if (clsOf(i) === k) n++; if (i === id) return n; } return 0; }
  const classCount = (k) => S.standings.filter((i) => clsOf(i) === k).length;
  // blue flag: a faster Hyper right behind a GT (let it by), or GT traffic just ahead of a Hyper
  function classFlag(me) {
    const f = $("classFlag");
    if (!S.race?.multi || !me.cls || me.id !== S.myCar || me.fin || me.pit >= 0 || S.ql >= 0) { f.classList.add("hidden"); return; }
    const ch = Math.cos(me.h), sh = Math.sin(me.h); let msg = "", kind = "";
    for (const o of S.cars.values()) {
      if (o.id === me.id || o.cls === me.cls || o.fin || o.pit >= 0) continue;
      const dx = o.x - me.x, dy = o.y - me.y, d = Math.hypot(dx, dy), along = dx * ch + dy * sh;
      if (me.cls === "gt" && along < -10 && d < 330 && o.speed > me.speed * 1.02) { msg = `🔵 BLUE FLAG: ${o.name} (Hyper) is faster and right behind you. Leave room!`; kind = "blue"; break; }
      if (me.cls === "hyper" && along > 10 && d < 400) { msg = `🟢 GT traffic ahead: ${o.name}. Pick your moment to pass.`; kind = "gt"; }
    }
    f.classList.toggle("hidden", !msg); f.className = "class-flag " + kind + (msg ? "" : " hidden"); if (msg && f.textContent !== msg) f.textContent = msg;
    if (kind === "blue" && !S.blueAt) { S.blueAt = 1; tone(880, 0.08, "square", 0.08); tone(880, 0.08, "square", 0.08, 0, 0.14); }
    if (kind !== "blue") S.blueAt = 0;
  }
  // elimination: warn when you're in the knock-out spots
  function elimFlag(me) {
    if (!S.race?.elim) return;
    const f = $("classFlag");
    if (me.id !== S.myCar || me.out || me.fin || S.ql >= 0) { if (!S.race.multi) f.classList.add("hidden"); return; }
    const live = S.standings.filter((i) => !S.cars.get(i)?.out), at = live.indexOf(me.id), cut = live.length - S.race.elim.per;
    const danger = at >= cut, close = !danger && at >= cut - 1;
    const msg = danger ? "💀 DANGER: you're in the knock-out zone! Pass someone before the leader crosses the line!" : close ? "⚠ One place above the knock-out zone. Don't let them by!" : "";
    f.className = "class-flag " + (danger ? "danger" : close ? "warn" : "") + (msg ? "" : " hidden"); if (msg && f.textContent !== msg) f.textContent = msg;
  }
  function updateHud(now) {
    try { updateWatchPanel(); } catch (e) {}          // (spectators too: before the "no car of your own" stop below)
    layoutHud();
    const me = S.cars.get(S.myCar) || S.cars.get(S.standings[0]);
    if (!me) return;
    const pos = S.standings.indexOf(me.id) + 1, laps = S.race?.laps || 5;
    $("posText").innerHTML = "";
    if (S.race?.multi && me.cls) {
      const K = CLASSES[me.cls]; $("posText").append("P" + classPos(me.id));
      const sm = document.createElement("small"); sm.textContent = `/${classCount(me.cls)} ${K.name} · P${pos} overall`; sm.style.color = K.col; $("posText").append(sm);
    } else if (S.race?.elim) {
      const live = S.standings.filter((i) => !S.cars.get(i)?.out).length;
      $("posText").append(me.out ? "OUT" : "P" + pos); const sm = document.createElement("small"); sm.textContent = me.out ? ` · P${pos}` : `/${live} left`; $("posText").append(sm);
    } else { $("posText").append("P" + pos); const sm = document.createElement("small"); sm.textContent = "/" + S.cars.size; $("posText").append(sm); }
    classFlag(me); elimFlag(me);
    { const T3 = "Scribble GP"; const tr = S.ql >= 0 ? `Qualifying · ${T3}` : me.fin ? `Finished · ${T3}` : `P${S.standings.indexOf(S.myCar) + 1} · Lap ${clamp(me.laps + 1, 1, laps)}/${laps} · ${T3}`; if (tr !== S.titleRace) { S.titleRace = tr; if (S.screen === "race") document.title = tr; } }
    if (me.laps !== S.lapShown) { if (S.lapShown !== undefined && me.laps > S.lapShown) { const lt = $("lapText"); lt.classList.remove("bump"); void lt.offsetWidth; lt.classList.add("bump"); } S.lapShown = me.laps; }
    $("lapText").textContent = S.ql >= 0 ? `${S.race?.practice ? "Practice" : S.qs ? `Q${S.qs}` : "Qualifying"} · ${S.qf ? "🏁 finishing laps" : `${Math.floor(S.ql / 60)}:${String(S.ql % 60).padStart(2, "0")} left`}${me.out ? " (out)" : ""}` : me.out ? "Knocked out" : me.fin ? "Finished!" : S.fl ? "🟡 Formation lap" : `Lap ${clamp(me.laps + 1, 1, laps)}/${laps}`;
    $("timeText").textContent = S.xp ? fmt(Math.max(0, S.t - S.xp.lapStart)) : fmt(S.t);
    $("bestText").textContent = "Best " + fmt(me.best);
    // a new personal best (not your first lap): the best time sparkles
    if (me.best && S.bestShown !== me.best) { if (S.bestShown && me.best < S.bestShown && S.bestFor === me.id) { const bt = $("bestText"); bt.classList.remove("pb"); void bt.offsetWidth; bt.classList.add("pb"); clearTimeout(S.pbT); S.pbT = setTimeout(() => bt.classList.remove("pb"), 2600); sfx("card"); } S.bestShown = me.best; S.bestFor = me.id; }
    renderSectors(me);
    if (S.stratBox && me.id === S.myCar && me.laps + 1 === S.stratBox && !S.box && !me.fin && S.stratTold !== S.stratBox) { S.stratTold = S.stratBox; popup(`📋 The plan says: box this lap! Press ${keyName(KEY("box"))}.`); sfx("tick"); }
    const spd = Math.max(0, me.speed || 0) * KMH * (settings.units === "mph" ? 0.621 : 1);
    $("speedText").textContent = `${Math.round(spd)} ${settings.units === "mph" ? "mph" : "km/h"}`;
    $("tireName").textContent = me.punct ? "PUNCTURE!" : `Tires: ${TIRES[me.comp]?.name || ""}` + (me.temp < 60 ? "  ·  ❄️ COLD" : me.temp < 85 ? "  ·  warming up" : "") + (me.dmg > 0.05 ? `  ·  Damage ${Math.round(me.dmg * 100)}%` : "");
    $("tireName").style.color = me.punct || me.dmg > 0.4 ? "#ff8a80" : "";
    if (me.inPit) $("speedText").textContent = "PIT LIMITER";
    // why am I slow? Everything that's costing you top speed right now (the same sums the server uses)
    { const wet = S.weather?.wet || 0, why = [];
      if (me.punct) why.push("💥 Puncture −67%");
      else {
        if (me.comp !== "wet" && wet > 0.05) { const k = 1 - 0.08 * wet - 0.17 * clamp((wet - 0.5) / 0.4, 0, 1); if (k < 0.97) why.push(`🌧 Dry tyres in the rain −${Math.round((1 - k) * 100)}%: box for Wets (${keyName(KEY("box"))})`); }
        if (me.comp === "wet" && wet < 0.15) why.push("☀ Wets on a dry track −8%");
        const tk = 0.7 + 0.3 * Math.sqrt(Math.min(1, Math.max(0, me.tire) * 3)); if (tk < 0.97) why.push(`🛞 Worn tyres −${Math.round((1 - tk) * 100)}%: box (${keyName(KEY("box"))})`);
        if (me.dmg > 0.1) why.push(`🔧 Damage −${Math.round(me.dmg * 14)}%`);
      }
      if (me.temp < 60 && !me.inPit) why.push("❄️ Cold tyres: less grip in corners");
      const txt = why.join("  ·  "), box = $("slowWhy");
      if (box.textContent !== txt) box.textContent = txt;
      box.classList.toggle("hidden", !why.length || me.fin);
      box.classList.toggle("bad", why.some((w) => /Dry tyres|Puncture|Worn tyres −[2-9]\d/.test(w)));
    }
    const W = S.weather;
    if (W) {
      const pill = $("weatherPill"); pill.classList.remove("hidden"); pill.classList.toggle("rain", W.raining || W.wet > 0.3);
      pill.textContent = W.raining ? `🌧 Raining, track ${Math.round(W.wet * 100)}% wet` : W.wet > 0.05 ? `⛅ Drying, track ${Math.round(W.wet * 100)}% wet` : S.race?.fog ? "🌫 Fog: you can't see far" : "☀ Dry";
      // forecast: a blurry hint of where the weather is heading (never exact, it's a guess)
      const fc = $("forecast"); fc.classList.toggle("hidden", !W.dyn);
      if (W.dyn) $("fcDot").style.left = (50 + clamp(W.trend || 0, -3, 3) * 15) + "%";
      if (W.change >= 0 && W.change <= 20) { const s2 = document.createElement("span"); s2.className = "fc"; s2.textContent = W.raining ? `Clearing in ${W.change}s` : `Rain in ${W.change}s`; pill.appendChild(s2); }
    }
    // predicted wear: measure how fast YOUR tires are dropping over the last part of a lap
    let perLap = S.xp?.perLap?.[me.comp] || 0;
    if (S.track && me.id === S.myCar && !me.fin) {
      const W2 = S.wearWin = S.wearWin || [];
      if (W2.length && me.tire > W2[W2.length - 1].tire + 0.05) W2.length = 0;          // new tires: start over
      if (!W2.length || me.prog - W2[W2.length - 1].prog >= 2) W2.push({ prog: me.prog, tire: me.tire });
      while (W2.length > 2 && me.prog - W2[0].prog > S.track.N * 0.6) W2.shift();
      const a = W2[0], b = W2[W2.length - 1];
      if (b.prog - a.prog > S.track.N * 0.2 && a.tire > b.tire) perLap = (a.tire - b.tire) / ((b.prog - a.prog) / S.track.N);
    }
    if (perLap > 0 && !me.punct) {
      const lapsLeft = me.tire / perLap;
      $("tireName").textContent += `  ·  ~${Math.round(perLap * 100)}%/lap, ${lapsLeft < 10 ? lapsLeft.toFixed(1) : "10+"} laps left`;
    }
    const tp = Math.round((me.tire || 0) * 100), tc = me.tire > 0.6 ? "#3ecf6a" : me.tire > 0.35 ? "#ffcc1f" : "#e53935";
    $("tirePct").textContent = tp + "%" + (me.tire < 0.35 && !S.box && !me.fin ? " (box soon!)" : "");
    $("tireFill").style.width = tp + "%"; $("tireFill").style.background = tc;
    if (S.xp) { $("lvlText").textContent = `Team Lv ${S.xp.level}`; $("xpText").textContent = `${S.xp.xp} / ${S.xp.need}`; $("xpFill").style.width = (S.xp.xp / S.xp.need) * 100 + "%"; }
    $("pitRing").classList.toggle("hidden", !(me.pit >= 0 && me.id === S.myCar));
    if (me.pit >= 0) { $("pitPct").textContent = Math.round(me.pit * 100) + "%"; $("pitFill").style.width = me.pit * 100 + "%"; }
    $("radio").classList.toggle("hidden", !S.myCar);
    // my gap to the car ahead and the car behind
    const gi = S.standings.indexOf(me.id), ga = S.gaps[gi], gb = S.gaps[gi + 1];
    $("gapAhead").textContent = gi > 0 && ga !== undefined ? (ga < 0 ? "Ahead +1 lap" : `Ahead ${ga.toFixed(1)}s`) : gi === 0 ? "Leading!" : "";
    $("gapBehind").textContent = gb !== undefined && gi < S.standings.length - 1 ? (gb < 0 ? "Behind +1 lap" : `Behind ${gb.toFixed(1)}s`) : "";
    // live standings list
    const key = S.standings.join(",") + S.gaps.join(",") + [...S.cars.values()].map((c) => (c.pit >= 0 ? "p" : "") + (c.punct ? "x" : "") + (c.dmg > 0.3 ? "d" : "") + c.comp + Math.round(c.tire * 100)).join("");
    if (key !== lastHudStand) {
      lastHudStand = key;
      const ol = $("standList"); ol.textContent = "";
      // places gained / lost: that row flashes green or red for a moment
      { const now = performance.now(), prev = S.lbNow; S.lbFlash = S.lbFlash || new Map(); S.lbNow = new Map(S.standings.map((id, i) => [id, i]));
        if (prev) for (const [id, i] of S.lbNow) { const was = prev.get(id); if (was !== undefined && was !== i) S.lbFlash.set(id, { cls: was > i ? "gain" : "loss", until: now + 900 }); } }
      // as many rows as fit (more cars = bigger list); hold Ctrl (or tap the list) to see everyone
      const fit = Math.max(8, Math.floor((window.innerHeight * 0.42) / 19));
      const all = S.lbAll || S.standings.length <= fit + 1;
      $("standings").classList.toggle("all", !!S.lbAll);
      const myI = S.standings.indexOf(S.myCar);
      const show = all ? S.standings.map((id, i) => i) : [...Array(Math.min(fit, S.standings.length)).keys()];
      if (!all && myI >= fit) show.push(-1, myI);
      show.forEach((i) => {
        if (i === -1) { const gap = document.createElement("li"); gap.className = "lb-gap"; gap.textContent = `··· ${S.standings.length - show.length + 2} more · hold Ctrl`; ol.appendChild(gap); return; }
        const id = S.standings[i];
        const c = S.cars.get(id); if (!c) return;
        const li = document.createElement("li"); if (id === S.myCar) li.className = "me"; if (c.pit >= 0) li.className += " pit";
        const p = document.createElement("span"); p.className = "p"; p.textContent = S.race?.multi && c.cls ? classPos(id) : i + 1;
        const d = document.createElement("span"); d.className = "d"; d.style.background = c.color;
        const n = document.createElement("span"); n.className = "n"; n.textContent = (S.rival === c.name ? "🎯 " : "") + c.name;
        if (S.race?.multi && c.cls) { d.style.boxShadow = `0 0 0 2px ${CLASSES[c.cls].col}`; d.title = CLASSES[c.cls].name; p.style.color = CLASSES[c.cls].col; }   // (class: a ring + coloured position, so names keep their room)
        const g = document.createElement("span"); const gv = S.gaps[i] ?? 0;
        g.className = "gap" + (i > 0 && gv >= 0 && gv < 1 ? " close" : "");     // within a second = in a fight!
        g.textContent = i === 0 ? "" : gv < 0 ? "+1 lap" : "+" + gv.toFixed(1);
        if (S.race?.elim && c.out) li.className += " out";
        const x = document.createElement("span"); x.className = "tw"; x.textContent = c.out ? "OUT" : c.pit >= 0 ? "PIT" : c.fin ? "done" : c.punct ? "FLAT" : c.dmg > 0.3 ? "DMG" : `${Math.round(c.tire * 100)}%`;
        if (c.punct) x.style.color = "#ff8a80";
        if (id === S.camTarget && id !== S.myCar) li.className += " watch";
        { const f = S.lbFlash?.get(id); if (f && f.until > performance.now()) li.className += " " + f.cls; }
        li.title = id === S.myCar ? "Your car" : `Watch ${c.name}`;
        li.dataset.id = id;      // (clicking a driver: see the pointerdown handler on the list below)
        li.append(p, d, n, g, badge(c.comp || "inter", true), x); ol.appendChild(li);
      });
      if (!all && myI < fit && S.standings.length > fit) { const m = document.createElement("li"); m.className = "lb-gap"; m.textContent = `+${S.standings.length - fit} more · ${isTouch() ? "tap" : "hold Ctrl"}`; ol.appendChild(m); }
    }
    if (!$("garage").childElementCount && S.up) renderGarage();
  }

  // ======================= Input =======================
  window.addEventListener("keydown", (e) => { if (e.key === "Control" && S.screen === "race") S.lbAll = true; });
  window.addEventListener("keyup", (e) => { if (e.key === "Control") S.lbAll = false; });
  window.addEventListener("blur", () => { S.lbAll = false; });
  // click a driver: the camera follows them (click yourself, or the chip, to come back). It's done on the press, not
  // the click: the list is rebuilt many times a second, and a click only counts if the press and the release land
  // on the same row, so clicks kept getting lost (and then toggled the long list instead)
  $("standList").addEventListener("pointerdown", (e) => {
    const li = e.target.closest("li[data-id]"); if (!li) return;
    const id = Number(li.dataset.id); S.lbPress = performance.now();
    watchCar(id === S.myCar ? null : id); sfx("tick");
  });
  $("standings").addEventListener("click", () => { if (performance.now() - (S.lbPress || 0) < 800) return; S.lbAll = !S.lbAll; });
  // spectate anyone from the leaderboard
  function watchCar(id) {
    if (S.myCar === null || S.myCar === undefined) { S.camTarget = id; const c = id && S.cars.get(id); $("specName").textContent = c ? c.name : "the leader"; lastHudStand = ""; return; }
    S.camTarget = id; lastHudStand = "";
    const chip = $("watchChip"), c = id && S.cars.get(id);
    chip.classList.toggle("hidden", !c);
    if (c) chip.textContent = `👁 Watching ${c.name} · back to my car`;
  }
  $("watchChip").addEventListener("click", () => watchCar(null));
  // ---- watching someone: their level, boost, upgrades, and the cards they're offered (and what they pick), AI too ----
  const WP = { id: null, up: null, lvl: 1, last: null };
  function watchedId() {
    if (S.screen !== "race" || S.replaying || !S.cars?.size) return null;
    if (S.myCar !== null && S.myCar !== undefined) return S.camTarget && S.camTarget !== S.myCar ? S.camTarget : null;
    return S.camTarget ?? S.standings?.[0] ?? null;                    // spectating: whoever the camera's on
  }
  function renderWatchCards(fresh) {
    const box = $("wpCards"), L = WP.last; box.textContent = "";
    if (!L) { box.appendChild(el("small", "wp-none", "No cards yet")); return; }
    L.cards.forEach((cd, i) => {
      const d = el("div", "wp-card" + (cd.rare ? " rare" : "") + (L.pick === cd.k ? " picked" : L.pick ? " not" : "") + (fresh ? " deal" : ""));
      d.style.animationDelay = fresh ? `${i * 90}ms` : "";
      d.append(el("b", "", `${cd.icon ? cd.icon + " " : ""}${cd.name}`), el("small", "", L.pick === cd.k ? "✔ picked" : L.pick ? "" : "deciding..."));
      box.appendChild(d);
    });
  }
  function renderWatchUps() {
    const box = $("wpUps"); box.textContent = ""; if (!WP.up || !S.upInfo) return;
    for (const [k, info] of Object.entries(S.upInfo).sort((a, b) => (WP.up[b[0]] || 0) - (WP.up[a[0]] || 0))) {     // (what they have first)
      const lv = WP.up[k] || 0, row = el("div", "wp-up" + (lv ? "" : " zero") + (WP.flash === k ? " flash" : ""));
      const pips = el("span", "wp-pips"); for (let l = 0; l < info.max; l++) pips.appendChild(el("i", l < lv ? "on" : ""));
      row.append(el("span", "", info.name), pips); box.appendChild(row);
    }
    WP.flash = null;
  }
  function updateWatchPanel() {
    const id = watchedId(), panel = $("watchPanel");
    panel.classList.toggle("hidden", id === null);
    $("garage").classList.toggle("dim-under", id !== null && S.myCar !== null && S.myCar !== undefined);
    if (id === null) { WP.id = null; return; }
    const c = S.cars.get(id); if (!c) return;
    if (WP.id !== id) { WP.id = id; WP.up = null; WP.last = null; renderWatchCards(false); renderWatchUps(); socket.emit("watchInfo", id); panel.classList.remove("swap"); void panel.offsetWidth; panel.classList.add("swap"); }
    $("wpDot").style.background = c.color || "#fff"; $("wpName").textContent = c.name || ""; $("wpLvl").textContent = `Team Lv ${WP.lvl}`;
    $("wpCheer").classList.toggle("hidden", !c.owner || c.owner === S.me);
    // their tyres: which set, how much is left, how many laps on them, cold or warm
    { const tw = Math.max(0, Math.round((c.tire ?? 1) * 100)), key = c.comp || "inter";
      if (WP.tyreKey !== key) { WP.tyreKey = key; const b = $("wpTyreBadge"); b.textContent = ""; b.appendChild(badge(key, true)); b.title = TIRES[key]?.name || ""; }
      const bar = $("wpTyre"); bar.style.width = tw + "%"; bar.style.background = tw < 20 ? "#e53935" : tw < 40 ? "#ffb020" : "#3ecf6a";
      $("wpTyreTxt").textContent = tw + "%";
      $("wpTyreNote").textContent = c.punct ? "💥 Puncture!" : `${TIRES[key]?.name || ""} · ${c.tyreAge || 0} lap${c.tyreAge === 1 ? "" : "s"} old${c.temp < 60 ? " · ❄️ cold" : ""}${c.pit >= 0 ? " · 🔧 in the pits" : ""}`; }
    const n = Math.round(c.nitro ?? 0); $("wpBoost").style.width = n + "%"; $("wpBoost").classList.toggle("on", !!c.nitroOn); $("wpBoostTxt").textContent = n + "%";
  }
  $("wpCheer").addEventListener("click", () => {
    if (WP.id === null) return; socket.emit("cheer", WP.id);
    const b = $("wpCheer"); b.disabled = true; setTimeout(() => (b.disabled = false), 5000);
  });
  socket.on("cheered", (d) => {
    if (localBlocked().includes(String(d.from).toLowerCase())) return;
    banner(`📣 ${String(d.from).slice(0, 12).toUpperCase()} IS CHEERING YOU ON!`, "#ff8ad8"); cheer(0.8, 0.8);
  });
  socket.on("watchInfo", (d) => { if (d.car !== WP.id) return; WP.up = d.up; WP.lvl = d.lvl; WP.last = d.last; renderWatchCards(false); renderWatchUps(); });
  socket.on("carCards", (d) => {
    if (d.car !== WP.id) return;
    const fresh = !WP.last || WP.last.at !== d.at || !d.pick;
    WP.last = { cards: d.cards, pick: d.pick, at: d.at }; WP.up = d.up; WP.lvl = d.lvl;
    if (d.pick) WP.flash = d.pick;
    renderWatchCards(fresh && !d.pick); renderWatchUps();
    if (d.pick) { const p = $("wpCards").querySelector(".picked"); if (p) { p.classList.add("pop"); } }
  });
  window.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT") return;
    if (e.code === "Escape" && !setEl.classList.contains("hidden")) { closeSettings(); return; }
    if (e.code === KEY("settings")) { e.preventDefault(); setEl.classList.contains("hidden") ? openSettings() : closeSettings(); return; }
    if (e.code === KEY("cards") && S.screen !== "menu") { $("cards").classList.contains("hidden") ? openCards() : laterCards(); return; }
    // number keys pick tires first while the pit picker is open (the crew is waiting; upgrade cards can be clicked)
    if (pitPickShown && { Digit1: 1, Digit2: 1, Digit3: 1, Digit4: 1 }[e.code]) { const b = $("ppRow").children[Number(e.code.slice(-1)) - 1]; if (b) b.click(); return; }
    const pick = { Digit1: 0, Digit2: 1, Digit3: 2 }[e.code];
    if (pick !== undefined && !e.repeat && !$("cards").classList.contains("hidden")) { pickCard(pick); return; }
    if (S.screen !== "race") return;
    if (e.code === "Escape") { leaveRace(); return; }
    if (e.code === KEY("boost")) { e.preventDefault(); if (e.repeat) return; if (!S.reacted && !$("lights").classList.contains("hidden")) react(); else setNitro(true); }
    if (e.code === KEY("boost2") && !e.repeat) { e.preventDefault(); setNitro(true); }
    if (e.code === KEY("box") && !e.repeat) { e.preventDefault(); socket.emit("box"); sfx("tick"); }
    if (e.code === KEY("drs") && !e.repeat) { e.preventDefault(); openDrs(); }
    if (e.code === KEY("defend") && !e.repeat && S.screen === "race") { e.preventDefault(); toggleDefend(); }
    if (e.code === KEY("horn") && !e.repeat && S.screen === "race" && S.myCar) { e.preventDefault(); socket.emit("horn", settings.horn); }
    if (e.code === KEY("spectate")) {       // spectate: cycle who the camera follows
      e.preventDefault();
      const ids = S.standings; const cur = ids.indexOf(S.camTarget ?? S.myCar);
      S.camTarget = ids[(cur + 1) % ids.length];
      if (S.camTarget === S.myCar) S.camTarget = null;
      popup(`Watching ${S.cars.get(S.camTarget ?? S.myCar)?.name || ""}`);
    }
  });
  window.addEventListener("keyup", (e) => { if (e.code === KEY("boost") || e.code === KEY("boost2")) setNitro(false); });
  // tapping anywhere on the race view also counts as your start reaction (phones)
  view.addEventListener("pointerdown", () => { if (S.screen === "race" && !S.photoOn && !$("lights").classList.contains("hidden")) react(); });

  // ======================= Ranked =======================
  function renderRankedBtn() {
    const R = A.user?.ranked;
    $("rankedSub").textContent = R ? `${R.rank.label} · ${R.sr} SR` : "Sign in to get a rank";
    $("rankedIc").textContent = R ? R.rank.icon : "🏆";
    $("rankedBtn").style.setProperty("--rk", R ? R.rank.color : "#ffcc1f");
  }
  function playRanked() {
    if (!A.user) { closeHub(); show("menu"); menuErr.textContent = "Make an account (or log in) to play ranked: your rank is saved on it."; return; }
    saveProfile(); S.solo = false; S.tutorial = false; S.rankedRes = null; closeHub(); socket.emit("ranked:play", prof);
  }
  $("rankedBtn").addEventListener("click", playRanked);
  const AI_WORD = { rookie: "Rookie", easy: "Easy", medium: "Medium", hard: "Hard", extreme: "EXTREME", overdrive: "⚡ OVERDRIVE", elite: "👑 ELITE" };
  const TIER_LADDER = [["Iron", "⚙️", 0, "3 Rookie AI (the gentlest) · 4 laps · big, gentle tracks"], ["Bronze", "🥉", 300, "4 Easy AI · 6 laps · big tracks"], ["Silver", "🥈", 600, "5 Medium AI · 7 laps · big, wonky"], ["Gold", "🥇", 900, "6 Hard AI · 9 laps · some very wonky tracks"],
    ["Platinum", "💠", 1200, "7 EXTREME AI · 10 laps · big or huge tracks"], ["Diamond", "💎", 1500, "8 OVERDRIVE AI (ranked only) · 12 laps · huge tracks"], ["Master", "🔮", 1800, "10 OVERDRIVE AI · 13 laps · huge, very wonky"], ["Overdrive Elite", "⚡", 2100, "12 👑 ELITE AI (the fastest in the game) · 15 laps · huge, very wonky"]];
  function rankBadge(rank, big) {
    const b = el("div", "rank-badge" + (big ? " big" : "")); b.style.setProperty("--rk", rank.color);
    b.append(el("span", "rb-ic", rank.icon), el("b", "", rank.label));
    return b;
  }
  const TIER_NAME = (rk) => String(rk.label || "").replace(/\s+(I|II|III)$/, "").replace(/\s*\(\d+\)$/, "");
  function renderRanked(u) {
    const box = $("hubRanked"); box.textContent = "";
    if (!u) { box.appendChild(el("p", "preset-note", "Sign in to play ranked. Your skill rating goes up when you finish near the front and down when you don't.")); return; }
    const R = u.ranked;
    const top = el("section", "rank-top"); top.style.setProperty("--rk", R.rank.color);
    top.appendChild(rankBadge(R.rank, true));
    const tx = el("div", "rank-tx");
    tx.append(el("b", "", `${R.sr} SR`), el("small", "", R.rank.i === 7 ? "Overdrive Elite: the very top. Keep climbing the leaderboard!" : `${R.rank.into} / 100 to the next division`));
    if (R.rank.i < 7) { const bar = el("div", "ach-bar"); const f = el("i"); f.style.width = R.rank.into + "%"; bar.appendChild(f); tx.appendChild(bar); }
    tx.appendChild(el("small", "", `Peak ${R.peakRank.label} · ${R.games} ranked races · ${R.wins} wins`));
    if (R.rank.i > 0) tx.appendChild(el("small", "", R.shield ? `🛡️ Rank shield ready: the first time you'd drop out of ${TIER_NAME(R.rank)}, it keeps you in` : "🛡️ Rank shield used: get promoted to earn a new one"));
    tx.appendChild(el("small", "", `Your next race: ${R.field.ai} ${AI_WORD[R.field.aiLevel] || R.field.aiLevel} AI, ${R.field.laps} laps${R.field.real ? ", a random track or a real circuit" : ", a random track"}`));
    const go = el("button", "btn go", "🏁 Play ranked"); go.type = "button"; go.addEventListener("click", playRanked);
    top.append(tx, go); box.appendChild(top);
    if (R.hist?.length) {
      box.appendChild(el("h3", "hub-h", "Last races"));
      const row = el("div", "rank-hist");
      for (const h of R.hist.slice().reverse()) { const d = el("span", "rh " + (h.d >= 0 ? "up" : "down"), `P${h.pos}/${h.of} ${h.d >= 0 ? "+" : ""}${h.d}`); row.appendChild(d); }
      box.appendChild(row);
    }
    box.appendChild(el("h3", "hub-h", "Tiers"));
    const lad = el("ol", "rank-ladder");
    TIER_LADDER.forEach(([name, ic, sr, ai], i) => {
      const li = el("li", R.rank.i === i ? "mine" : R.rank.i > i ? "done" : "");
      li.append(el("span", "", ic), el("b", "", name + (i < 7 ? " III · II · I" : "")), el("small", "", `${sr}+ SR · ${ai}`));
      lad.appendChild(li);
    });
    box.appendChild(lad);
    box.appendChild(el("p", "preset-note", "Win: about +40 SR. Last: about -40 (less in the low tiers, more at the top). Leaving a ranked race counts as a loss. Every tier races on big tracks: Iron is 4 laps against 3 AI on gentle ones, and every tier up adds AI and laps, with huge, wonkier tracks and real circuits."));
    box.appendChild(el("p", "preset-note", "🪙 Ranked races don't pay coins. Ranking up does: 150 coins for each new division, 600 for each new tier and 3,000 for reaching Overdrive Elite. Each one pays once, the first time you get there."));
    // team ranked: its own rating, raced with friends from a room
    const T = u.rankedTeam;
    if (T) {
      const tb = el("section", "rank-top team"); tb.style.setProperty("--rk", T.rank.color);
      tb.appendChild(rankBadge(T.rank, true));
      const tt = el("div", "rank-tx");
      tt.append(el("b", "", `👥 Team ranked · ${T.sr} SR`), el("small", "", `${T.games} team races · ${T.wins} won by your team · peak ${T.peakRank.label}`),
        el("small", "", "Get 2-4 signed-in friends in a room, then the host presses 👥 Team ranked. You race as one team against the AI, at the difficulty of the highest rank on the team (anyone's solo or team rank), and everyone's team rating moves by how the team did on average. Ranking up pays coins here too."));
      tb.appendChild(tt); box.appendChild(tb);
    }
    const lb = el("button", "btn", "🏆 Ranked leaderboard"); lb.type = "button"; lb.addEventListener("click", () => { A.lbKind = "ranked"; A.lb = null; A.tab = "lb"; socket.emit("lb:get", { kind: "ranked" }); renderHub(); });
    box.appendChild(lb);
  }
  socket.on("rankedResult", (r) => {
    S.rankedRes = r; renderRankedRes();
    if (r.up) setTimeout(() => { banner(`RANK UP! ${r.after.icon} ${r.after.label}`, r.after.color); sfx("win"); }, 2400);
    if (r.coins) setTimeout(() => popup(`🪙 +${r.coins} coins: first time reaching ${r.after.label}!`), 3200);
    else if (r.shield) setTimeout(() => popup(`🛡️ Rank shield! It blocked the drop: you're still ${r.after.icon} ${TIER_NAME(r.after)}. (A fresh one comes with your next promotion.)`), 2400);
    else if (r.down) setTimeout(() => popup(`Down to ${r.after.label}. You'll get it back!`, true), 2400);
  });
  function renderRankedRes() {
    const box = $("rankedRes"), r = S.rankedRes;
    box.classList.toggle("hidden", !r); if (!r) return;
    box.textContent = ""; box.style.setProperty("--rk", r.after.color);
    const d = el("div", "rr-main");
    d.append(rankBadge(r.after), el("b", "rr-delta " + (r.delta >= 0 ? "up" : "down"), `${r.delta >= 0 ? "+" : ""}${r.delta} SR${r.mode === "team" ? " (team)" : ""}`),
      el("small", "", r.dnf ? "You left the race: that counts as last." : r.mode === "team" ? `You finished P${r.pos} · your team's average place: ${r.teamPos} of ${r.of} · team rating ${r.sr} SR` : `P${r.pos} of ${r.of} · now ${r.sr} SR`));
    if (r.coins) d.appendChild(el("b", "rr-coins", `🪙 +${r.coins} (new rank reached)`));
    if (r.shield) d.appendChild(el("b", "rr-coins", "🛡️ Rank shield used: no drop this time"));
    const row = el("div", "sec-row");
    if (r.mode === "team") { box.append(d, el("small", "", "You'll be back in your room in a moment: the host can press 👥 Team ranked to go again.")); return; }
    const again = el("button", "btn go", "🏁 Race ranked again"); again.type = "button"; again.addEventListener("click", playRanked);
    const menu = el("button", "btn", "Menu"); menu.type = "button"; menu.addEventListener("click", () => { socket.emit("leave"); S.code = null; S.track = null; S.rankedRaced = false; show("menu"); });
    row.append(again, menu); box.append(d, row);
  }
  // team ranked button (room host, 2-4 signed-in drivers)
  $("teamRankedBtn").addEventListener("click", () => {
    const L = S.lobby; if (!L) return;
    const drivers = L.players.filter((p) => !p.spectator);
    if (drivers.length < 2) return popup("Team ranked needs 2-4 drivers in the room. Invite your friends first!", true);
    if (drivers.length > 4) return popup("Team ranked is for 2-4 drivers (others can spectate).", true);
    if (drivers.some((p) => !p.signedIn)) return popup("Everyone racing needs to be signed in for team ranked.", true);
    socket.emit("teamRanked:start");
  });
  socket.on("lobby", (l) => {
    const show2 = !!S.host && l.phase === "lobby" && !l.ranked;
    $("teamRankedBtn").classList.toggle("hidden", !show2);
    if (show2) { const d = l.players.filter((p) => !p.spectator), ok = d.length >= 2 && d.length <= 4 && d.every((p) => p.signedIn); $("teamRankedBtn").classList.toggle("dim", !ok); $("teamRankedBtn").title = ok ? "Race ranked together as one team against the AI" : "Needs 2-4 drivers in the room, all signed in"; }
  });
  // a ranked room runs itself: back to the menu once the podium is done
  socket.on("lobby", (l) => {
    document.body.classList.toggle("ranked-room", !!l.ranked);
    if (l.ranked) { S.host = false; $("hostNote").textContent = l.ranked.team ? `👥 Team ranked (${l.ranked.tier || ""}): starting by itself in a moment...` : `🏆 Ranked (${l.ranked.tier || ""}): the race starts by itself.`; }
    if (l.ranked && !l.ranked.team && l.phase === "lobby" && S.rankedRaced) { S.rankedRaced = false; socket.emit("leave"); S.code = null; S.track = null; show("menu"); openHub("ranked"); }
  });

  // ======================= Track of the Week =======================
  socket.on("totwInfo", (t) => { S.totw = t; renderTotw(); });
  socket.on("connect", () => socket.emit("totw:info"));
  const THEME_NAME = { grass: "Grass", desert: "Desert", snow: "Snow", night: "Night", autumn: "Autumn", beach: "Beach", city: "City", volcano: "Volcano", neon: "Neon night" };
  function renderTotw() {
    const t = S.totw; if (!t) return;
    const days = Math.max(1, Math.ceil((t.ends - Date.now()) / 86400000));
    $("totwName").textContent = t.name;
    $("totwSub").textContent = `${THEME_NAME[t.theme] || t.theme} · ${WONK_NAME[t.wonk] || ""} · new in ${days}d`;
    const cv = $("totwCv"), c = cv.getContext("2d"), P = t.stroke || [];
    c.clearRect(0, 0, cv.width, cv.height);
    if (P.length < 3) return;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of P) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    const k = Math.min((cv.width - 12) / (x1 - x0 || 1), (cv.height - 12) / (y1 - y0 || 1)), ox = (cv.width - (x1 - x0) * k) / 2, oy = (cv.height - (y1 - y0) * k) / 2;
    c.lineJoin = c.lineCap = "round";
    for (const [lw, col] of [[7, "rgba(0,0,0,0.35)"], [4, "#ffcc1f"]]) {
      c.lineWidth = lw; c.strokeStyle = col; c.beginPath();
      P.forEach(([x, y], i) => { const px = ox + (x - x0) * k, py = oy + (y - y0) * k; i ? c.lineTo(px, py) : c.moveTo(px, py); });
      c.closePath(); c.stroke();
    }
  }
  $("totwRace").addEventListener("click", () => { saveProfile(); S.solo = true; S.tutorial = false; S.wantTotw = true; socket.emit("create", prof); });
  $("totwBoard").addEventListener("click", () => { A.lbKind = "totw"; A.lb = null; socket.emit("lb:get", { kind: "totw" }); openHub("lb"); });
  $("totwBtn").addEventListener("click", () => { if (!S.host) return boardHint("Only the host can change the track.", true); socket.emit("totw:load"); });
  socket.on("lobby", (l) => {
    if (!S.wantTotw || l.hostId !== S.me || l.phase !== "lobby") return;
    S.wantTotw = false;
    socket.emit("settings", { laps: 3, ai: 5, quali: 0, season: 0 });
    setTimeout(() => socket.emit("totw:load"), 250);
  });

  // ======================= Share codes (tracks) =======================
  function openCode(mode, d) {
    const box = $("codeBox"); box.classList.remove("hidden"); box.dataset.mode = mode;
    $("codeMsg").textContent = "";
    const load = mode === "load";
    $("codeTitle").textContent = load ? "📥 Load a shared track" : d.kind === "replay" ? "🔗 Replay code" : "🔗 Track code";
    $("codeLead").textContent = load ? "Type the 6-letter code a friend gave you. The track (and its start line, direction and theme) loads into this room."
      : d.kind === "replay" ? "Anyone can watch this replay for 30 days: main menu › 🎬 Replays, then type this code." : "Anyone can race this track: in a room, press 📥 Load code on the track tools and type this code.";
    $("codeShow").textContent = load ? "" : d.code; $("codeShow").classList.toggle("hidden", load);
    $("codeForm").classList.toggle("hidden", !load); $("codeBtns").classList.toggle("hidden", load);
    if (load) { $("codeInput").value = ""; setTimeout(() => $("codeInput").focus(), 50); }
    const pub = !load && d.kind === "track";
    $("commPub").classList.toggle("hidden", !pub);
    if (pub) $("commPubName").value = d.name || S.track?.name || "";
  }
  $("codeClose").addEventListener("click", () => $("codeBox").classList.add("hidden"));
  $("codeBox").addEventListener("click", (e) => { if (e.target.id === "codeBox") $("codeBox").classList.add("hidden"); });
  $("codeCopy").addEventListener("click", () => { navigator.clipboard?.writeText($("codeShow").textContent).then(() => { $("codeMsg").textContent = "Copied ✓"; }).catch(() => { $("codeMsg").textContent = "Couldn't copy: write it down!"; }); });
  $("codeForm").addEventListener("submit", (e) => { e.preventDefault(); const v = $("codeInput").value.trim().toUpperCase(); if (v.length < 6) { $("codeMsg").textContent = "Codes are 6 letters/numbers"; return; } $("codeMsg").textContent = "Loading..."; socket.emit("track:load", v); });
  $("shareTrackBtn").addEventListener("click", () => { if (!S.track) return boardHint("Draw or load a track first, then share it.", true); socket.emit("track:share"); });
  $("loadCodeBtn").addEventListener("click", () => { if (!S.host) return boardHint("Only the host can change the track.", true); openCode("load"); });
  socket.on("shareCode", (d) => { if (d.error) return popup(d.error, true); openCode("show", d); });
  socket.on("trackResult", (r) => {
    if ($("codeBox").dataset.mode === "load" && !$("codeBox").classList.contains("hidden")) { if (r.error) $("codeMsg").textContent = r.error; else $("codeBox").classList.add("hidden"); }
    if (!r.error && r.shared) boardHint(`Loaded track ${r.shared}${r.sharedName ? ` ("${r.sharedName}")` : ""}!`, false);
    if (!r.error && r.totw) boardHint(`🌟 Track of the week: ${r.totw}! Your best lap here goes on this week's leaderboard.`, false);
  });

  // ======================= Season pass + daily challenges =======================
  function rewardText(rw) {
    if (rw.coins) return `🪙 ${rw.coins}`;
    if (rw.crate) return rw.n > 1 ? `🎁 ${rw.n} themed crates` : "🎁 Themed crate";
    if (rw.spins) return `🎡 ${rw.spins} spin${rw.spins > 1 ? "s" : ""}`;
    if (rw.item) return A.catalog?.store.find((x) => x.id === rw.item)?.name || "Item";
    return "";
  }
  function rewardCell(rw, locked, got) {
    const d = el("div", "pr" + (locked ? " locked" : "") + (got ? " got" : "") + (rw.item ? " item" : rw.crate ? " crate" : ""));
    const it = rw.item && A.catalog?.store.find((x) => x.id === rw.item);
    if (it) { d.appendChild(itemPreview(it, 96, 54)); d.style.setProperty("--rc", RARITY[it.rarity]?.[1]); }
    else d.appendChild(el("span", "pr-ic", rw.crate ? "🎁" : rw.spins ? "🎡" : "🪙"));
    d.appendChild(el("small", "", rewardText(rw)));
    if (locked) d.appendChild(el("span", "pr-lock", "🔒"));
    else if (got) d.appendChild(el("span", "pr-lock", "✓"));
    return d;
  }
  function renderPass(u) {
    const box = $("hubPass"); box.textContent = "";
    if (!A.catalog) { box.textContent = "Loading..."; return; }
    if (!u) { box.appendChild(el("p", "preset-note", "Sign in to get the season pass. There's a new one every month with its own theme, items and crates. Race to go up its tiers.")); return; }
    const P = u.pass, T = P.theme, days = Math.max(1, Math.ceil((P.ends - Date.now()) / 86400000));
    const head = el("section", "pass-head"); head.style.setProperty("--p1", T.c[0]); head.style.setProperty("--p2", T.c[1]);
    const ht = el("div"); ht.append(el("small", "", `Season pass · ${new Date(P.month + "-01T00:00:00Z").toLocaleString(undefined, { month: "long", year: "numeric", timeZone: "UTC" })} · ends in ${days} day${days === 1 ? "" : "s"}`), el("h3", "", `${T.icon} ${T.name}`));
    const tier = el("div", "pass-tier");
    const inTier = P.tier >= P.tiers ? P.perTier : P.xp - P.tier * P.perTier;
    tier.append(el("b", "", `Tier ${P.tier} / ${P.tiers}`));
    const bar = el("div", "ach-bar"); const f = el("i"); f.style.width = (P.tier >= P.tiers ? 100 : (inTier / P.perTier) * 100) + "%"; bar.appendChild(f);
    tier.append(bar, el("small", "", P.tier >= P.tiers ? "Maxed out! 🎉" : `${inTier} / ${P.perTier} XP to tier ${P.tier + 1}`));
    ht.appendChild(tier);
    head.appendChild(ht);
    if (P.prem) head.appendChild(el("span", "pass-prem on", "⭐ PREMIUM"));
    else { const b = el("button", "btn go", `⭐ Unlock premium · 🪙 ${P.price}`); b.type = "button"; b.disabled = u.coins < P.price; b.title = u.coins < P.price ? `You need ${P.price - u.coins} more coins` : ""; b.addEventListener("click", () => { if (b.dataset.sure !== "1") { b.dataset.sure = "1"; b.textContent = `Spend 🪙 ${P.price}? Click again`; setTimeout(() => { b.dataset.sure = ""; b.textContent = `⭐ Unlock premium · 🪙 ${P.price}`; }, 3000); return; } socket.emit("pass:buy"); }); head.appendChild(b); }
    box.appendChild(head);
    if (P.tier >= P.tiers || P.prestigeTotal) {
      const pb = el("section", "prest-box");
      pb.appendChild(el("div", "", P.prestigeTotal ? `🎖️ Prestige ${P.prestigeTotal}${P.prestige ? ` (${P.prestige} this month)` : ""}` : "🎖️ Prestige"));
      if (P.tier >= P.tiers) {
        const b = el("button", "btn go", `Prestige: reset for 🪙 ${P.prestigeCoins} + a badge`); b.type = "button";
        b.addEventListener("click", () => askBox("🎖️ Prestige?", `Your pass goes back to tier 0 (premium stays) and you get ${P.prestigeCoins} coins plus a 🎖️ prestige badge next to your name. The tiers pay out again on the way back up.`, "Prestige!", () => socket.emit("pass:prestige")));
        pb.appendChild(b);
      } else pb.appendChild(el("small", "", "Max the pass again to prestige once more."));
      box.appendChild(pb);
    }
    box.appendChild(el("p", "preset-note", "Pass XP: every race (+60, more for places beaten and wins, +40 in ranked), daily challenges (+150), weekly challenges (+300). 60 tiers. The free track pays coins, a themed item, crates and 🎡 wheel spins. Premium adds this month's items, themed crates you can't get anywhere else, and more wheel spins."));
    // crates you own
    const crates = Object.entries(u.crates || {}).filter(([, n]) => n > 0);
    if (crates.length) {
      const cs = el("section", "store-slot"); cs.appendChild(el("h3", "hub-h", "🎁 Your themed crates"));
      const g = el("div", "box-grid");
      for (const [key, n] of crates) {
        const th = A.catalog.passThemes?.find((x) => x.key === key) || { name: key, icon: "🎁", c: ["#555", "#999"] };
        const card = el("div", "chest"); card.style.setProperty("--c1", th.c[0]); card.style.setProperty("--c2", th.c[1]);
        card.append(el("div", "chest-ic", th.icon), el("b", "", `${th.name} crate ×${n}`), el("small", "", "One of that month's pass items (a duplicate pays 250 coins)"));
        const b = el("button", "btn go", "Open"); b.type = "button"; b.addEventListener("click", () => { b.disabled = true; socket.emit("crate:open", key); });
        card.appendChild(b); g.appendChild(card);
      }
      cs.appendChild(g); box.appendChild(cs);
    }
    // the reward track
    const wrap = el("div", "pass-track"); wrap.setAttribute("role", "list"); wrap.setAttribute("aria-label", "Season pass tiers");
    const labels = el("div", "pass-col labels"); labels.append(el("span", "pt-n", "Tier"), el("span", "pt-lab", "Free"), el("span", "pt-lab prem", "⭐ Premium"));
    wrap.appendChild(labels);
    for (let t = 1; t <= P.tiers; t++) {
      const col = el("div", "pass-col" + (t <= P.tier ? " reached" : "") + (t === P.tier + 1 ? " next" : "")); col.setAttribute("role", "listitem");
      col.append(el("span", "pt-n", String(t)), rewardCell(P.rewards.free[t - 1], false, t <= P.tier), rewardCell(P.rewards.prem[t - 1], !P.prem, P.prem && t <= P.tier));
      wrap.appendChild(col);
    }
    box.appendChild(wrap);
    requestAnimationFrame(() => { const nx = wrap.querySelector(".next") || wrap.querySelector(".reached:last-of-type"); if (nx) wrap.scrollLeft = Math.max(0, nx.offsetLeft - 120); });
  }
  function challengeBlock(title, C, icon) {
    const wk = el("section", "weekly");
    wk.appendChild(el("h3", "hub-h", title));
    const wg = el("div", "ach-grid");
    for (const c of C.list) {
      const d = el("div", "ach" + (c.done ? " got" : ""));
      const tx = el("div"); tx.append(el("b", "", c.name), el("small", "", c.desc));
      if (!c.done) { const pb = el("div", "ach-prog"); const fi = el("i"); fi.style.width = (c.prog / c.goal) * 100 + "%"; pb.appendChild(fi); tx.append(pb, el("small", "ach-num", `${c.prog} / ${c.goal}`)); }
      d.append(el("span", "ic", c.done ? "✅" : icon), tx, el("span", "rw", c.done ? "✓ +" + c.coins : "🪙 " + c.coins));
      wg.appendChild(d);
    }
    wk.appendChild(wg); return wk;
  }

  // ======================= Friends: chat, gifts, trades =======================
  const FR = { who: null, tab: "chat", items: {} };
  A.dms = {};
  function openFriend(f, tab) {
    FR.who = f; FR.tab = tab || "chat";
    $("friendBox").classList.remove("hidden"); $("friendTitle").textContent = f.name;
    socket.emit("dm:get", f.id); socket.emit("friends:items", f.id);
    renderFriend();
  }
  $("friendClose").addEventListener("click", () => { $("friendBox").classList.add("hidden"); FR.who = null; });
  $("friendBox").addEventListener("click", (e) => { if (e.target.id === "friendBox") { $("friendBox").classList.add("hidden"); FR.who = null; } });
  document.querySelectorAll("[data-ft]").forEach((b) => b.addEventListener("click", () => { FR.tab = b.dataset.ft; renderFriend(); }));
  socket.on("dmThread", (d) => { A.dms[d.with] = d.list || []; if (FR.who?.id === d.with && FR.tab === "chat") renderFriend(); });
  socket.on("friendItems", (d) => { FR.items[d.id] = d.owned || []; if (FR.who?.id === d.id && FR.tab === "trade") renderFriend(); });
  socket.on("dm", (d) => {
    if (FR.who?.id === d.from && !$("friendBox").classList.contains("hidden")) return;
    // (the notification at the top comes from the server, so it works for things that happened while you were offline too)
  });
  const itemName = (id) => A.catalog?.store.find((x) => x.id === id)?.name || id;
  function itemSelect(ids, label, none) {
    const sel = document.createElement("select"); sel.setAttribute("aria-label", label);
    const o0 = document.createElement("option"); o0.value = ""; o0.textContent = none; sel.appendChild(o0);
    for (const id of [...ids].sort((a, b) => itemName(a).localeCompare(itemName(b)))) { const o = document.createElement("option"); o.value = id; o.textContent = itemName(id); sel.appendChild(o); }
    return sel;
  }
  // pick any number of items (tap to select): a filterable grid of chips, with the price shown as a rough value
  function itemPicker(ids, label, empty, max = 10) {
    const box = el("div", "ipick"), sel = new Set(), cat = (id) => A.catalog?.store.find((x) => x.id === id);
    const head = el("div", "ipick-head"), count = el("small", "ipick-n", ""), q = document.createElement("input");
    q.type = "search"; q.placeholder = `Search ${label.toLowerCase()}...`; q.setAttribute("aria-label", "Search " + label);
    const grid = el("div", "ipick-grid"); grid.setAttribute("role", "group"); grid.setAttribute("aria-label", label);
    const list = [...ids].sort((a, b) => itemName(a).localeCompare(itemName(b)));
    const upd = () => { const v = [...sel].reduce((t, id) => t + (cat(id)?.price || 0), 0); count.textContent = sel.size ? `${sel.size} picked${v ? ` · worth ~🪙 ${v.toLocaleString()} in the store` : ""}` : ""; };
    const draw = () => {
      grid.textContent = ""; const f = q.value.trim().toLowerCase();
      if (!list.length) { grid.appendChild(el("small", "preset-note", empty)); return; }
      for (const id of list) {
        if (f && !itemName(id).toLowerCase().includes(f) && !sel.has(id)) continue;
        const it = cat(id), b = el("button", "ipick-item" + (sel.has(id) ? " on" : "")); b.type = "button"; b.setAttribute("aria-pressed", String(sel.has(id)));
        if (it?.slot) b.appendChild(el("small", "ipick-slot", it.slot));
        b.appendChild(el("span", "", itemName(id)));
        if (it?.price) b.appendChild(el("small", "ipick-price", `🪙 ${it.price}`));
        b.addEventListener("click", () => {
          if (sel.has(id)) sel.delete(id); else if (sel.size >= max) return popup(`Up to ${max} items each side`, true); else sel.add(id);
          b.classList.toggle("on", sel.has(id)); b.setAttribute("aria-pressed", String(sel.has(id))); upd(); sfx("tick");
        });
        grid.appendChild(b);
      }
    };
    q.addEventListener("input", draw);
    head.append(q, count); box.append(head, grid); draw();
    box.picked = () => [...sel];
    return box;
  }
  function coinInput(label) { const i = document.createElement("input"); i.type = "number"; i.min = "0"; i.step = "10"; i.placeholder = "0"; i.inputMode = "numeric"; i.setAttribute("aria-label", label); return i; }
  function renderFriend() {
    const f = FR.who, u = A.user, box = $("friendBody"); if (!f || !u) return;
    document.querySelectorAll("[data-ft]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.ft === FR.tab)));
    box.textContent = "";
    if (FR.tab === "chat") {
      const list = el("div", "dm-list");
      const th = A.dms[f.id] || [];
      if (!th.length) list.appendChild(el("p", "preset-note", `No messages yet. Say hi to ${f.name}!`));
      for (const m of th) {
        const mine = m.from === u.id, d = el("div", "dm" + (mine ? " mine" : "") + (m.gift || m.trade || m.bet ? " sys" : ""));
        d.textContent = m.bet ? `⚔️ ${mine ? "You" : f.name} ${m.bet}` : m.gift ? `🎁 ${mine ? "You sent" : f.name + " sent you"} ${m.gift}${m.text ? `: "${m.text}"` : ""}` : m.trade ? `🤝 ${mine ? "You" : f.name} ${m.trade}` : m.text;
        list.appendChild(d);
      }
      const form = el("form", "chat-foot"); const inp = document.createElement("input"); inp.type = "text"; inp.maxLength = 140; inp.placeholder = `Message ${f.name}...`; inp.setAttribute("aria-label", "Message");
      const send = el("button", "btn go", "Send"); send.type = "submit";
      form.append(inp, send);
      form.addEventListener("submit", (e) => { e.preventDefault(); const t = inp.value.trim(); if (t) { socket.emit("dm:send", { to: f.id, text: t }); inp.value = ""; } });
      inp.addEventListener("keydown", (e) => e.stopPropagation());
      box.append(list, form);
      requestAnimationFrame(() => { list.scrollTop = list.scrollHeight; inp.focus(); });
      return;
    }
    const cd = Math.max(0, Math.ceil(((A.giftUntil || 0) - Date.now()) / 1000));
    // the send button counts the cooldown down by itself
    const tickCd = (btn, label) => { const left = Math.ceil(((A.giftUntil || 0) - Date.now()) / 1000); if (!btn.isConnected) return; if (left > 0) { btn.textContent = `Cooldown ${left}s`; btn.disabled = true; setTimeout(() => tickCd(btn, label), 1000); } else { btn.textContent = label; btn.disabled = false; } };
    const mine = u.owned.slice();
    if (FR.tab === "gift") {
      box.appendChild(el("p", "preset-note", `Send ${f.name} coins or one of your items. You have 🪙 ${u.coins}. Max 5,000 coins a day, one gift or trade a minute. Items you send leave your garage.`));
      const c = coinInput("Coins to send"), it = itemSelect(mine, "Item to send", "No item"), note = document.createElement("input");
      note.type = "text"; note.maxLength = 80; note.placeholder = "Add a note (optional)"; note.setAttribute("aria-label", "Note");
      const l1 = el("label", "f", "Coins "); l1.appendChild(c); const l2 = el("label", "f", "Item "); l2.appendChild(it); const l3 = el("label", "f", "Note "); l3.appendChild(note);
      const go = el("button", "btn go", cd ? `Cooldown ${cd}s` : "🎁 Send gift"); go.type = "button"; go.disabled = !!cd;
      go.addEventListener("click", () => {
        const coins = Math.max(0, Math.floor(Number(c.value) || 0)); if (!coins && !it.value) return popup("Pick some coins or an item", true);
        if (go.dataset.sure !== "1") { go.dataset.sure = "1"; go.textContent = `Send ${[coins ? "🪙 " + coins : "", it.value ? itemName(it.value) : ""].filter(Boolean).join(" + ")}? Click again`; return; }
        socket.emit("gift:send", { to: f.id, coins, item: it.value || null, note: note.value }); FR.tab = "chat"; renderFriend();
      });
      box.append(l1, l2, l3, go); if (cd) tickCd(go, "🎁 Send gift");
      return;
    }
    if (FR.tab === "ghost") {
      const g = typeof loadGhost === "function" && S.track ? loadGhost() : null;
      box.appendChild(el("p", "preset-note", `Send ${f.name} your best lap on the track you're on: they race against your ghost, and you hear about it when they beat you. (You need to have done a qualifying, practice or time trial lap on this track.)`));
      if (f.h2h?.n) box.appendChild(el("p", "bet-live", `Head-to-head: you ${f.h2h.w} – ${f.h2h.n - f.h2h.w} ${f.name} (${f.h2h.n} race${f.h2h.n === 1 ? "" : "s"} together)`));
      if (!g) { box.appendChild(el("p", "preset-note", S.track ? "No ghost lap on this track yet. Do a lap in practice or time trial first." : "Load (or race) a track first, then set a lap on it.")); return; }
      const go = el("button", "btn go", `👻 Send my ${fmt(g.t)} lap`); go.type = "button";
      go.addEventListener("click", () => { socket.emit("ghost:send", { to: f.id, t: g.t, path: g.path }); go.disabled = true; });
      box.appendChild(go); return;
    }
    if (FR.tab === "bet") {
      const live = (u.bets?.live || []).find((b) => b.vs === f.id);
      box.appendChild(el("p", "preset-note", `Bet ${f.name} coins on a 1v1: you both put in the same amount, and whoever finishes ahead in your next race together takes it all. Leaving that race counts as losing. Not raced each other within 3 days? You both get your coins back.`));
      if (live) { box.appendChild(el("p", "bet-live", `⚔️ Bet running: 🪙 ${live.amount.toLocaleString()} each. Get in a race with ${f.name} and beat them to win 🪙 ${(live.amount * 2).toLocaleString()}!`)); return; }
      const c = coinInput("Coins to bet"); c.min = "10"; c.max = "100000";
      const go = el("button", "btn go", "⚔️ Send bet"); go.type = "button";
      go.addEventListener("click", () => {
        const amount = Math.floor(Number(c.value) || 0); if (amount < 10) return popup("Bets start at 10 coins", true);
        if (amount > u.coins) return popup(`You only have 🪙 ${u.coins.toLocaleString()}`, true);
        if (go.dataset.sure !== "1") { go.dataset.sure = "1"; go.textContent = `Bet 🪙 ${amount.toLocaleString()}? Click again`; return; }
        go.dataset.sure = ""; go.textContent = "⚔️ Send bet";
        socket.emit("bet:offer", { to: f.id, amount });
      });
      const l1 = el("label", "f", `Your stake (you have 🪙 ${u.coins.toLocaleString()}) `); l1.appendChild(c);
      box.append(l1, go);
      return;
    }
    // trade
    const theirs = FR.items[f.id];
    box.appendChild(el("p", "preset-note", `Offer something, ask for something back. ${f.name} gets the offer in their Friends tab and can accept or decline. Everything is checked again when they accept.`));
    const g = el("div", "trade-grid");
    const colA = el("div", "trade-side"), colB = el("div", "trade-side");
    const gc = coinInput("Coins you give"), gi = itemPicker((mine || []).filter((id) => !(theirs || []).includes(id)), "Your items", "You don't have any items they don't already have.");
    const wc = coinInput("Coins you want"), wi = itemPicker((theirs || []).filter((id) => !u.owned.includes(id)), `${f.name}'s items`, theirs ? `${f.name} has nothing you don't already own.` : "Loading their items...");
    const lab = (t, x) => { const l = el("label", "f", t + " "); l.appendChild(x); return l; };
    colA.append(el("b", "", "You give"), lab(`Coins (you have 🪙 ${u.coins.toLocaleString()})`, gc), el("small", "f", "Items (tap to pick, up to 10)"), gi);
    colB.append(el("b", "", `You ask ${f.name} for`), lab("Coins", wc), el("small", "f", "Items (tap to pick, up to 10)"), wi);
    g.append(colA, el("span", "trade-x", "⇄"), colB);
    const go = el("button", "btn go", cd ? `Cooldown ${cd}s` : "🤝 Send offer"); go.type = "button"; go.disabled = !!cd;
    go.addEventListener("click", () => {
      const give = { coins: Math.max(0, Math.floor(Number(gc.value) || 0)), items: gi.picked() }, want = { coins: Math.max(0, Math.floor(Number(wc.value) || 0)), items: wi.picked() };
      if (!give.coins && !give.items.length) return popup("Pick something to give", true);
      if (!want.coins && !want.items.length) return popup("Ask for something back (or send a gift instead)", true);
      const say = (x) => [x.coins ? `🪙 ${x.coins.toLocaleString()}` : "", x.items.length ? `${x.items.length} item${x.items.length === 1 ? "" : "s"}` : ""].filter(Boolean).join(" + ");
      if (go.dataset.sure !== "1") { go.dataset.sure = "1"; go.textContent = `Give ${say(give)} for ${say(want)}? Click again`; return; }
      go.dataset.sure = ""; go.textContent = "🤝 Send offer";
      socket.emit("trade:offer", { to: f.id, give, want });
    });
    box.append(g, go); if (cd) tickCd(go, "🤝 Send offer");
  }
  // ---- weekend tournament (hub tab) ----
  socket.on("tour", (T) => { A.tour = T; if (A.tab === "tour") renderTour(A.user); });
  function renderTour(u) {
    const box = $("hubTour"); box.textContent = ""; const T = A.tour;
    box.appendChild(el("p", "hub-h", "🏟️ Weekend tournament: sign up during the week. On Saturday a knockout bracket is drawn (seeded by ranked SR). Each round, the faster lap on this weekend's tournament track wins your match. No lap? The higher seed goes through."));
    if (!T) { box.appendChild(el("p", "preset-note", "Loading...")); return; }
    const now = Date.now(), dd = (ms) => { const h = Math.max(0, Math.round(ms / 3600000)); return h >= 48 ? `${Math.round(h / 24)} days` : `${h}h`; };
    const live = now >= T.begin, top = el("div", "tour-top");
    top.appendChild(el("b", "", live ? (T.champion ? `🏆 Champion: ${T.champion}` : T.rounds.length && T.rounds[0].length ? `Round ${T.round + 1} of ${T.rounds.length ? Math.log2(T.rounds[0].length * 2) : 0} · ends in ${dd(T.roundEnds - now)}` : "Not enough players this week") : `Sign-ups open · bracket drawn in ${dd(T.begin - now)}`));
    top.appendChild(el("small", "", `${T.count} player${T.count === 1 ? "" : "s"} · prizes 🪙 ${T.prizes[0].toLocaleString()} / ${T.prizes[1].toLocaleString()} / ${T.prizes[2]} (semi-finals)${T.last?.champion ? ` · last week: ${T.last.champion}` : ""}`));
    const row = el("div", "sec-row");
    if (!live) { const j = el("button", "btn go", T.joined ? "✓ You're in" : "Enter the tournament"); j.type = "button"; j.disabled = T.joined || !u; j.addEventListener("click", () => socket.emit("tour:join")); row.appendChild(j); }
    const go = el("button", "btn" + (live ? " go" : ""), live ? "🏁 Race the tournament track" : "Practise the tournament track"); go.type = "button";
    go.addEventListener("click", () => { closeHub(); saveProfile(); S.solo = true; S.tutorial = false; S.pendingTour = true; socket.emit("create", prof); });
    row.appendChild(go); top.appendChild(row); box.appendChild(top);
    if (!u) box.appendChild(el("p", "preset-note", "Sign in to enter."));
    if (!T.rounds.length) { if (T.entrants.length) box.appendChild(el("p", "preset-note", "Entered: " + T.entrants.join(", "))); return; }
    const br = el("div", "bracket");
    const names = ["Final", "Semi-finals", "Quarter-finals", "Round of 16", "Round of 32", "Round of 64"], R = Math.log2(T.rounds[0].length * 2);
    T.rounds.forEach((rd, i) => {
      const col = el("div", "br-col"); col.appendChild(el("small", "br-h", names[R - 1 - i] || `Round ${i + 1}`));
      for (const m of rd) {
        const card = el("div", "br-m" + (m.me ? " me" : ""));
        for (const [n, l] of [[m.a, m.la], [m.b, m.lb]]) { const ln = el("div", "br-p" + (m.w && m.w === n ? " win" : m.w && n ? " out" : "")); ln.append(el("span", "", n || "bye"), el("small", "", l ? l.toFixed(3) : "")); card.appendChild(ln); }
        col.appendChild(card);
      }
      br.appendChild(col);
    });
    box.appendChild(br);
  }
  function ghostsBlock(u) {
    const G = u?.ghosts || []; if (!G.length) return null;
    const sec = el("section", "sec-box"); sec.appendChild(el("h3", "hub-h", "👻 Ghost challenges"));
    for (const g of G) {
      const d = el("div", "friend"), tx = el("div");
      tx.append(el("b", "", `${g.fromName}: ${g.t.toFixed(3)}s`), el("small", "", `${g.trackName || "Their track"}${g.won ? ` · beaten ✓ (${g.beat.toFixed(3)}s)` : g.beat ? ` · your best ${g.beat.toFixed(3)}s` : ""}`));
      const b = el("button", "btn go", g.won ? "Again" : "Race it"); b.type = "button";
      b.addEventListener("click", () => { closeHub(); saveProfile(); S.solo = true; S.tutorial = false; S.pendingGhost = g.code; socket.emit("create", prof); });
      d.append(el("span", "fdot on"), tx, b); sec.appendChild(d);
    }
    return sec;
  }
  function betsBlock(u) {
    const inc = u?.bets?.in || [], live = u?.bets?.live || [];
    if (!inc.length && !live.length) return null;
    const sec = el("section", "sec-box"); sec.appendChild(el("h3", "hub-h", `⚔️ 1v1 bets`));
    for (const b of inc) {
      const d = el("div", "friend");
      const tx = el("div"); tx.append(el("b", "", b.fromName), el("small", "", `bets you 🪙 ${b.amount.toLocaleString()} they finish ahead of you (winner takes 🪙 ${(b.amount * 2).toLocaleString()})`));
      const bs = el("div", "sec-row");
      const yes = el("button", "btn go", "Accept"); yes.type = "button"; yes.addEventListener("click", () => socket.emit("bet:answer", { id: b.id, yes: true }));
      const no = el("button", "btn ghost", "Decline"); no.type = "button"; no.addEventListener("click", () => socket.emit("bet:answer", { id: b.id, yes: false }));
      bs.append(yes, no); d.append(el("span", "fdot on"), tx, bs); sec.appendChild(d);
    }
    for (const b of live) {
      const d = el("div", "friend"), h = Math.max(0, Math.ceil((b.until - Date.now()) / 3600000));
      const tx = el("div"); tx.append(el("b", "", `vs ${b.vsName}`), el("small", "", `🪙 ${b.amount.toLocaleString()} each is riding on your next race together (${h}h left, then it's refunded)`));
      d.append(el("span", "fdot on"), tx); sec.appendChild(d);
    }
    return sec;
  }
  // ======================= Suggestions =======================
  // Anyone can send one. The game owner's account also gets an inbox here (and a notification for each new one).
  const SG = { kind: "idea", tab: "send", list: null };
  function openSuggest(tab = "send") {
    const admin = !!A.user?.suggestAdmin;
    SG.tab = admin ? tab : "send";
    $("suggestBox").classList.remove("hidden");
    $("suggestTabs").classList.toggle("hidden", !admin);
    $("suggestNameRow").classList.toggle("hidden", !!A.user);
    if (!A.user && !$("suggestName").value) $("suggestName").value = (typeof prof !== "undefined" && prof.name) || "";
    renderSuggest();
    if (SG.tab === "inbox") socket.emit("suggest:list"); else setTimeout(() => $("suggestText").focus(), 50);
  }
  function renderSuggest() {
    document.querySelectorAll("#suggestKinds .chip").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.kind === SG.kind)));
    document.querySelectorAll("#suggestKinds .chip").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.kind === SG.kind)));
    document.querySelectorAll("#suggestTabs .chip").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.stab === SG.tab)));
    $("suggestForm").classList.toggle("hidden", SG.tab !== "send"); $("suggestInbox").classList.toggle("hidden", SG.tab !== "inbox");
    const n = A.user?.suggestAdmin?.unread || 0; $("suggestUnread").textContent = n ? String(n) : "";
    if (SG.tab !== "inbox") return;
    const box = $("suggestInbox"); box.textContent = "";
    if (!SG.list) { box.appendChild(el("p", "preset-note", "Loading...")); return; }
    if (!SG.list.length) { box.appendChild(el("p", "preset-note", "No suggestions yet. They'll show up here (and you get a notification for each one).")); return; }
    const row = el("div", "sec-row"), all = el("button", "btn ghost", "✔ Mark all read"); all.type = "button"; all.addEventListener("click", () => socket.emit("suggest:read", "all")); row.appendChild(all); box.appendChild(row);
    for (const sg of SG.list) {
      const d = el("article", "sg-item" + (sg.read ? "" : " new")), h = el("header");
      h.append(el("b", "", `${sg.kind === "bug" ? "🐞" : sg.kind === "other" ? "💬" : "💡"} ${sg.name}`), el("small", "", new Date(sg.at).toLocaleString()));
      if (!sg.read) h.appendChild(el("small", "", "· NEW"));
      const bs = el("div", "sec-row");
      const rd = el("button", "btn ghost", sg.read ? "Mark unread" : "Mark read"); rd.type = "button"; rd.addEventListener("click", () => socket.emit(sg.read ? "suggest:unread" : "suggest:read", sg.id));
      const del = el("button", "btn ghost", "🗑 Delete"); del.type = "button";
      del.addEventListener("click", () => { if (del.dataset.sure !== "1") { del.dataset.sure = "1"; del.textContent = "Delete? Click again"; return; } socket.emit("suggest:delete", sg.id); });
      bs.append(rd, del); d.append(h, el("p", "", sg.text), bs); box.appendChild(d);
    }
  }
  $("suggestLink").addEventListener("click", (e) => { e.preventDefault(); openSuggest("send"); });
  $("suggestInboxBtn").addEventListener("click", () => openSuggest("inbox"));
  $("suggestClose").addEventListener("click", () => $("suggestBox").classList.add("hidden"));
  $("suggestBox").addEventListener("click", (e) => { if (e.target.id === "suggestBox") $("suggestBox").classList.add("hidden"); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("suggestBox").classList.contains("hidden")) $("suggestBox").classList.add("hidden"); });
  document.querySelectorAll("#suggestKinds .chip").forEach((b) => b.addEventListener("click", () => { SG.kind = b.dataset.kind; renderSuggest(); }));
  document.querySelectorAll("#suggestTabs .chip").forEach((b) => b.addEventListener("click", () => { SG.tab = b.dataset.stab; renderSuggest(); if (SG.tab === "inbox") socket.emit("suggest:list"); }));
  $("suggestText").addEventListener("input", () => { $("suggestCount").textContent = `${$("suggestText").value.length} / 1000`; });
  $("suggestForm").addEventListener("submit", (e) => {
    e.preventDefault(); const text = $("suggestText").value.trim();
    if (text.length < 5) return popup("Write a bit more first", true);
    $("suggestSend").disabled = true; socket.emit("suggest", { text, kind: SG.kind, name: $("suggestName").value });
  });
  socket.on("suggestResult", (r) => {
    $("suggestSend").disabled = false;
    if (r.error) return popup(r.error, true);
    $("suggestText").value = ""; $("suggestCount").textContent = "0 / 1000"; $("suggestBox").classList.add("hidden");
    banner("💡 THANKS! SUGGESTION SENT", "#3ecf6a"); sfx("level");
  });
  socket.on("suggestions", (list) => { SG.list = list || []; renderSuggest(); });
  socket.on("account", (u) => { const n = u?.suggestAdmin; const b = $("suggestInboxBtn"); b.classList.toggle("hidden", !n); b.textContent = n?.unread ? `💡 Suggestions (${n.unread})` : "💡 Suggestions"; if (!$("suggestBox").classList.contains("hidden")) renderSuggest(); });
  function tradesBlock(u) {
    if (!u?.trades?.length) return null;
    const sec = el("section", "sec-box"); sec.appendChild(el("h3", "hub-h", `🤝 Trade offers (${u.trades.length})`));
    const nm = (x) => [x.coins ? `🪙 ${x.coins.toLocaleString()}` : "", ...(x.items || (x.item ? [x.item] : [])).map(itemName)].filter(Boolean).join(" + ") || "nothing";
    for (const t of u.trades) {
      const d = el("div", "friend");
      const tx = el("div"); tx.append(el("b", "", t.fromName), el("small", "", `gives you ${nm(t.give)} · wants ${nm(t.want)}`));
      const bs = el("div", "sec-row");
      const yes = el("button", "btn go", "Accept"); yes.type = "button"; yes.addEventListener("click", () => socket.emit("trade:answer", { id: t.id, yes: true }));
      const no = el("button", "btn ghost", "Decline"); no.type = "button"; no.addEventListener("click", () => socket.emit("trade:answer", { id: t.id, yes: false }));
      bs.append(yes, no); d.append(el("span", "fdot on"), tx, bs); sec.appendChild(d);
    }
    return sec;
  }

  // ======================= Desktop layout (wide screens only: phones keep their own layout) =======================
  // Fewer tabs and a sectioned track-tools column. Everything here only applies with body.desk, which is
  // on when the window is wider than 860px and phone mode is off. Nothing in the HTML moves.
  const DESK = { on: false, dsec: "draw" };
  const DOCK_SECS = {
    draw: ["#drawMode", "#stampPick", "#snapBtn", "#widthTools", "#cutBtn", "#smoothBtn", "#clearBtn"],
    tracks: ["#wonkTools", "#randomBtn", "#f1Btn", "#totwBtn", "#commBtn", "#presetBtn", "#loadCodeBtn", "#shareTrackBtn"],
    edit: ["#startLineBtn", "#reverseBtn", "#drsBtn", "#drsAutoBtn", "#drsClearBtn", "[data-decor]", "#decorUndo", "#decorClear", "#moreBtn", "#moreTools"],
  };
  for (const [sec, sels] of Object.entries(DOCK_SECS)) for (const q of sels) document.querySelectorAll(q).forEach((e) => e.setAttribute("data-sec", sec));
  // section switcher at the top of the track tools
  (() => {
    const dock = document.querySelector(".dock"); if (!dock) return;
    const bar = document.createElement("div"); bar.className = "dock-secs"; bar.setAttribute("role", "tablist"); bar.setAttribute("aria-label", "Track tools");
    for (const [k, ic, label] of [["draw", "✏️", "Draw"], ["tracks", "📚", "Tracks"], ["edit", "🔧", "Edit"]]) {
      const b = document.createElement("button"); b.type = "button"; b.setAttribute("role", "tab"); b.dataset.dsec = k;
      b.setAttribute("aria-selected", String(k === DESK.dsec)); b.title = { draw: "Draw a track", tracks: "Random, real, saved and shared tracks", edit: "Start line, direction, DRS zones and reshaping" }[k];
      const i = document.createElement("span"); i.textContent = ic; i.setAttribute("aria-hidden", "true"); b.append(i, label);
      b.addEventListener("click", () => setDockSec(k)); bar.appendChild(b);
    }
    dock.prepend(bar);
  })();
  function setDockSec(k) {
    DESK.dsec = k; document.querySelector(".dock")?.setAttribute("data-dsec", k);
    document.querySelectorAll("[data-dsec]").forEach((b) => b.tagName === "BUTTON" && b.setAttribute("aria-selected", String(b.dataset.dsec === k)));
  }
  setDockSec("draw");
  // 🔒 security button in the profile header (wide screens; Security isn't a tab there)
  (() => {
    const b = document.createElement("button"); b.type = "button"; b.className = "x hub-sec-btn"; b.id = "hubSecBtn"; b.title = "Sign-in and security"; b.setAttribute("aria-label", "Sign-in and security"); b.textContent = "🔒";
    b.addEventListener("click", () => { A.tab = "sec"; renderHub(); });
    $("hubClose").before(b);
  })();
  const relabel = (el, html) => { if (!el) return; if (el.dataset.orig === undefined) el.dataset.orig = el.innerHTML; el.innerHTML = DESK.on ? html : el.dataset.orig; };
  // merged room panes: Drivers shows the AI list too, Settings shows the points system too
  function deskPanes() {
    if (!DESK.on) return;
    const cur = document.querySelector(".rc-tabs [aria-selected=true]")?.dataset.tab;
    if (cur === "ai") return document.querySelector('.rc-tabs [data-tab="drivers"]').click();
    if (cur === "points") return document.querySelector('.rc-tabs [data-tab="race"]').click();
    document.querySelector('.rc-pane[data-pane="ai"]').hidden = cur !== "drivers";
    document.querySelector('.rc-pane[data-pane="points"]').hidden = cur !== "race";
  }
  function applyDesk() {
    const on = window.innerWidth > 860 && !document.body.classList.contains("phone");
    if (on === DESK.on) return;
    DESK.on = on; document.body.classList.toggle("desk", on);
    relabel(document.querySelector('.rc-tabs [data-tab="race"]'), '<span class="ti" aria-hidden="true">⚙️</span>Settings');
    relabel(document.querySelector('[data-ht="stats"]'), "🏅 Me");
    relabel(document.querySelector('.acct-actions [data-hub="stats"]'), "🏅 Profile");
    if (on) { $("aiBox").open = false; $("pointsBox").open = false; deskPanes(); }
    else {   // back to the normal tabs: show just the selected pane
      const cur = document.querySelector(".rc-tabs [aria-selected=true]")?.dataset.tab || "drivers";
      document.querySelectorAll(".rc-pane").forEach((p) => (p.hidden = p.dataset.pane !== cur));
      $("aiBox").open = true; $("pointsBox").open = true;
    }
    if (!$("hub").classList.contains("hidden")) renderHub();
  }
  window.addEventListener("resize", applyDesk);
  new MutationObserver(applyDesk).observe(document.body, { attributes: true, attributeFilter: ["class"] });
  applyDesk();

  // ======================= The track builder (wide screens) =======================
  // Three steps instead of six tabs (1 Track › 2 Race rules › 3 Grid & teams), one tool rail on the left, the
  // drawing tool's options floating over the board, undo/redo and reverse in a pill at the bottom, and a Track
  // panel on the right: where to start from, scenery, objects, and the race at a glance. Phones keep their own
  // layout: everything that moves here is put back exactly where it was when the window gets narrow.
  const BLD = { on: false, step: null, moved: [] };
  const STEPS = [["track", "Track"], ["rules", "Race rules"], ["grid", "Grid & teams"]];
  const STEP_TABS = { rules: ["mode", "race"], grid: ["drivers", "standings"] };
  const bmk = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
  // the new pieces (made once, shown only in this layout)
  const stepsBar = bmk("nav", "rc-steps"); stepsBar.setAttribute("aria-label", "Setting up the race");
  STEPS.forEach(([k, label], i) => {
    if (i) stepsBar.appendChild(bmk("span", "rc-step-arrow", "›"));
    const b = bmk("button", "rc-step"); b.type = "button"; b.dataset.step = k; b.dataset.label = `${i + 1}. ${label}`; b.setAttribute("aria-label", `Step ${i + 1}: ${label}`); b.append(bmk("i", "", String(i + 1)), document.createTextNode(label));
    b.addEventListener("click", () => { setStep(k); sfx("tick"); }); stepsBar.appendChild(b);
  });
  document.querySelector(".rc-name")?.after(stepsBar);
  const ctxBar = bmk("div", "ctx-bar panel"); ctxBar.setAttribute("aria-label", "Drawing options");
  const ctxLabel = bmk("b", "ctx-label", ""); ctxBar.appendChild(ctxLabel);
  const pill = bmk("div", "board-pill"); pill.setAttribute("aria-label", "Undo and direction");
  const wrap = document.querySelector(".board-wrap"); wrap?.append(ctxBar, pill);
  const trackPane = bmk("section", "rc-pane track-pane"); trackPane.dataset.pane = "track"; trackPane.hidden = true;
  const card = (title, extra) => { const c = bmk("div", "tp-card"), h = bmk("h3", "tp-h"); h.append(bmk("span", "", title)); if (extra) h.appendChild(extra); c.appendChild(h); trackPane.appendChild(c); return c; };
  const startCard = card("Start from"), startGrid = bmk("div", "tp-start"); startCard.appendChild(startGrid);
  const sceneCard = card("Scenery"), sceneRow = bmk("div", "tp-swatches"); sceneRow.setAttribute("role", "radiogroup"); sceneRow.setAttribute("aria-label", "Track theme"); sceneCard.appendChild(sceneRow);
  const objCount = bmk("small", "tp-count", ""), objCard = card("Objects", objCount), objGrid = bmk("div", "tp-objs"); objCard.appendChild(objGrid);
  const editRules = bmk("button", "tp-link", "Edit rules ›"); editRules.type = "button"; editRules.addEventListener("click", () => setStep("rules"));
  const glanceCard = card("Race at a glance", editRules), glance = bmk("div", "tp-glance"); glanceCard.appendChild(glance);
  document.querySelector(".rc-body")?.prepend(trackPane);
  const nextBtn = bmk("button", "btn step-next hidden", ""); nextBtn.type = "button";
  nextBtn.addEventListener("click", () => { const i = STEPS.findIndex(([k]) => k === BLD.step); if (i >= 0 && i < STEPS.length - 1) setStep(STEPS[i + 1][0]); });
  $("startBtn").before(nextBtn);
  // scenery swatches: the same choices as the Track theme setting
  for (const o of $("sTheme").options) {
    const b = bmk("button", "tp-sw"); b.type = "button"; b.dataset.theme = o.value; b.title = o.textContent; b.setAttribute("role", "radio"); b.setAttribute("aria-label", o.textContent);
    b.style.background = (THEMES[o.value] || THEMES.grass).ground;
    b.addEventListener("click", () => { if (!S.host || $("sTheme").disabled) return; $("sTheme").value = o.value; $("sTheme").dispatchEvent(new Event("change", { bubbles: true })); renderBuilder(); sfx("tick"); });
    sceneRow.appendChild(b);
  }
  // move a piece into the new layout (and remember exactly where it came from)
  function bMove(node, into) { if (!node || !into) return; const mark = document.createComment("bld"); node.before(mark); BLD.moved.push([node, mark]); into.appendChild(node); }
  function bRestore() { for (const [node, mark] of BLD.moved.reverse()) { mark.before(node); mark.remove(); } BLD.moved = []; }
  function builderLayout(on) {
    if (on === BLD.on) return;
    BLD.on = on; document.body.classList.toggle("builder", on);
    if (on) {
      for (const id of ["randomBtn", "f1Btn", "presetBtn", "totwBtn", "commBtn", "loadCodeBtn", "shareTrackBtn"]) bMove($(id), startGrid);
      bMove($("wonkTools"), startCard);
      for (const b of document.querySelectorAll("[data-decor]")) bMove(b, objGrid);
      bMove($("decorUndo"), objGrid); bMove($("decorClear"), objGrid);
      bMove($("widthTools"), ctxBar); bMove($("snapBtn"), ctxBar);
      bMove($("undoTools"), pill); bMove($("reverseBtn"), pill);
      bMove($("stampPick"), wrap); bMove($("moreTools"), wrap);          // (they open beside the rail)
      document.querySelector(".dock")?.setAttribute("data-dsec", "all");
      for (const [id, t] of [["copyBtn", "🔗 Invite"], ["garageBtn", "🏎️ Car"]]) { const b = $(id); if (b) { b.dataset.bldOrig = b.innerHTML; b.textContent = t; } }
      setStep(BLD.step || (S.host ? "track" : "grid"), true);
    } else {
      bRestore(); setDockSec(DESK.dsec || "draw");
      for (const id of ["copyBtn", "garageBtn"]) { const b = $(id); if (b?.dataset.bldOrig !== undefined) { b.innerHTML = b.dataset.bldOrig; delete b.dataset.bldOrig; } }
      document.querySelector(".rc-tabs").hidden = false; trackPane.hidden = true;
      document.querySelectorAll(".rc-tabs [data-tab]").forEach((b) => (b.hidden = false));
      const cur = document.querySelector(".rc-tabs [aria-selected=true]");
      if (cur) cur.click();
    }
    requestAnimationFrame(() => { if (S.screen === "lobby") sizeBoard(); });
  }
  function setStep(k, quiet) {
    BLD.step = k;
    stepsBar.querySelectorAll(".rc-step").forEach((b) => { b.setAttribute("aria-current", String(b.dataset.step === k)); b.classList.toggle("on", b.dataset.step === k); });
    if (!BLD.on) return;
    const tabs = document.querySelector(".rc-tabs");
    if (k === "track") {
      tabs.hidden = true; document.querySelectorAll(".rc-pane").forEach((p) => (p.hidden = p !== trackPane));
    } else {
      tabs.hidden = false; trackPane.hidden = true;
      const show = STEP_TABS[k];
      tabs.querySelectorAll("[data-tab]").forEach((b) => (b.hidden = !show.includes(b.dataset.tab)));
      const cur = tabs.querySelector("[aria-selected=true]")?.dataset.tab;
      const want = show.includes(cur) ? cur : show[k === "rules" ? 1 : 0];
      tabs.querySelector(`[data-tab="${want}"]`)?.click();
    }
    if (!quiet && !reducedMotion) { const side = document.querySelector(".rc-body"); side.classList.remove("step-in"); void side.offsetWidth; side.classList.add("step-in"); }
    renderBuilder();
  }
  // the bits that change: which tool is on, the theme, the objects count, the race summary, the Next button
  function renderBuilder() {
    if (!BLD.on) return;
    const l = S.lobby, st = l?.settings || {};
    const dm = document.querySelector('#drawMode [aria-pressed="true"]');
    ctxLabel.textContent = dm ? dm.textContent.trim() : "Draw";
    ctxBar.classList.toggle("hidden", !S.host || l?.phase !== "lobby");
    pill.classList.toggle("hidden", !S.host || l?.phase !== "lobby");
    sceneRow.querySelectorAll(".tp-sw").forEach((b) => { const on = b.dataset.theme === (st.theme || $("sTheme").value); b.setAttribute("aria-checked", String(on)); b.classList.toggle("on", on); b.disabled = !S.host; });
    objCount.textContent = `${S.track?.decor?.length || 0} / 30`;
    startCard.classList.toggle("hidden", !S.host); objCard.classList.toggle("hidden", !S.host);
    const lvl = { easy: "Easy", medium: "Medium", hard: "Hard", extreme: "EXTREME" }[st.aiLevel] || st.aiLevel || "";
    const wx = { sunny: "☀ Sunny", rain: "🌧 Rain", dynamic: "⛅ Changeable", fog: "🌫 Fog" }[st.weather] || "";
    glance.textContent = "";
    for (const [k, v] of [["Laps", st.laps ?? "-"], ["AI drivers", `${st.ai ?? 0}${lvl ? " · " + lvl : ""}`], ["Weather", wx || "-"], ["Start", st.start === "rolling" ? "🟡 Rolling" : "🚦 Standing"]]) { const d = bmk("div", "tp-q"); d.append(bmk("small", "", k), bmk("b", "", "")); d.lastChild.textContent = String(v); glance.appendChild(d); }
    const i = STEPS.findIndex(([k]) => k === BLD.step);
    nextBtn.classList.toggle("hidden", !S.host || i >= STEPS.length - 1 || l?.phase !== "lobby");
    if (i < STEPS.length - 1) nextBtn.textContent = `Next: ${STEPS[i + 1][1]} ›`;
  }
  document.querySelectorAll("#drawMode [data-dm]").forEach((b) => b.addEventListener("click", () => setTimeout(renderBuilder, 0)));
  // a new room: the host starts on the Track step, everyone else on Grid & teams
  socket.on("lobby", (l) => setTimeout(() => { if (BLD.room !== l.code) { BLD.room = l.code; BLD.step = S.host && l.phase === "lobby" ? "track" : "grid"; if (BLD.on) setStep(BLD.step, true); } else renderBuilder(); }, 0));
  socket.on("track", () => setTimeout(renderBuilder, 0));
  const bldCheck = () => builderLayout(DESK.on);
  window.addEventListener("resize", bldCheck);
  new MutationObserver(bldCheck).observe(document.body, { attributes: true, attributeFilter: ["class"] });
  bldCheck();

  // ======================= What's new (shown once after each update) =======================
  // Add a new entry at the TOP for every update (change "v" to anything new, like the date).
  // Players who've already played see it once on the menu or in a room; brand-new players don't.
  // Every update gets an entry here, even the tiny ones (v = an id players' browsers remember; date = what's shown)
  const WHATS_NEW = [
    { v: "u-2026-10-06a", date: "6 Oct", title: "No more mystery slowdowns, red flag replays, a full tutorial", items: [
      "🐢 Fixed cars suddenly losing a third of their speed: completely worn tyres used to drop you straight from 86% to 62% speed. Now worn tyres slow you down gradually (70% when they're totally dead).",
      "🏎️ A GT3 in a Hypercar's slipstream can keep up with it now, but can't out-drag it any more (the tow used to take a GT3 past a Hyper's top speed).",
      "🌧️ When it rains and you pit, you get Wets (unless you picked dry tyres in the rain on purpose). Your next tyres used to be stuck on whatever you started on.",
      "🔎 A new line under your speed tells you what's slowing you down: worn tyres, dry tyres in the rain, damage, cold tyres.",
      "🟥 Red flag: everyone watches the crash again, then it's back to the grid.",
      "🌧️ Rain you can't miss: darker skies, streaks blowing in the wind, splashes, drops on the lens, spray off the cars, lightning and thunder in a downpour, and you can hear it.",
      "🏁 \"Laps to go\" at the top of the screen for everyone (spectators too). Final lap flashes.",
      "👀 Watching someone? You see their tyres too: which set, how worn, how many laps old, cold or not.",
      "🖱️ Clicking a driver on the leaderboard to watch them works every time now (clicks used to get lost).",
      "📣 \"Cheer them on\" works now.",
      "🔁 Endurance: when your teammate takes over, the car keeps all its upgrades and team level, and both of your picks go on the car.",
      "🟡 No tyre wear on the formation lap.",
      "🎓 A new tutorial that shows everything in about 7 minutes: building tracks, every race control, then the menu (account, car, ranked, rewards, friends, gifts, trades and bets).",
    ] },
    { v: "u-2026-10-05g", date: "5 Oct", title: "New track builder, bigger trades, suggestions", items: [
      "🛠️ A new track builder on computers: three steps at the top (1 Track › 2 Race rules › 3 Grid & teams), every drawing tool in one rail on the left, the road width and snap floating over the board, undo/redo and reverse at the bottom, and a Track panel with where to start from, scenery, objects and the race at a glance.",
      "🤝 Trades: pick as many items as you like to give AND to ask for (up to 10 each side), plus coins. Search your items, see roughly what they're worth, and check it all before you send.",
      "💡 Suggest an idea: a new link at the bottom of the menu. Ideas, bugs, anything: they go straight to the person who makes the game.",
      "Small stuff: the room tabs no longer get squashed to nothing in narrow windows.",
    ] },
    { v: "u-2026-10-05f", date: "5 Oct", title: "Pit stops are all yours, unlapping fixed", items: [
      "🎮 The pit stop minigame now comes up every time you pit: races, qualifying and ranked (there's no setting to skip it any more).",
      "🔧 Pro Pit Crew is gone (you do your own stops now). Pit Lane Rocket stays, so you still drive faster down the pit lane.",
      "⚔️ Racecraft is now about overtaking: your driver spots gaps sooner, goes 2% faster per level while passing, and gets past defending cars more easily. (It doesn't add slipstream any more.)",
      "👻 Safety car: lapped cars really do drive through the queue now and unlap themselves, then join the back. They used to get stuck behind the cars in front of them.",
      "✨ Picking your tyres, gaining a place, a great pit stop, an achievement and your row on the results get the same pop, flash and sparks as picking an upgrade card.",
      "📸 The photo-finish picture is now taken of the cars at the line (not wherever the camera happened to be).",
    ] },
    { v: "u-2026-10-05e", date: "5 Oct", title: "Marshals, birds, puddles and fireworks", items: [
      "🚩 Marshals: one runs out with a yellow flag next to every crash, and one waves the chequered flag at the line on the last lap.",
      "🔧 Pit crews: five little people in your team colours jump on the car at every stop.",
      "🐦 Birds sit about in the grass and fly off when the cars come by.",
      "🌧️ Puddles on the track when it's wet, and cars splash through them. Sparks off the kerbs and from battered cars, big dust clouds off the gravel, and skid marks when cars lock up or spin too.",
      "🎆 Fireworks over the main grandstand when someone wins.",
      "🔊 Tyres squeal when you slide, the kerbs go brrrr, and there's a drumroll while the start lights come on.",
      "📣 The crowd is quieter now: no more clapping. You only hear them now and then, when something happens next to a stand (lots of quiet voices cheering together).",
      "🚇 Random tracks sometimes come with a tunnel.",
      "🟡 Safety car fix: the whole field doesn't crawl along at walking speed behind a crashed car any more.",
      "✨ A new personal best lap sparkles gold.",
      "⏱️ With friends in the room, the host's start button gives everyone a big 3-2-1 first.",
      "📋 Click the room code to copy it (\"Copied!\"). Hosts can give their room a name, and it shows in the public room list.",
      "💡 A tip of the day on the menu, and one while you're reconnecting.",
      "🔢 Number styles for your car: Racing, Block, Classic, Digital or Script.",
      "🤝 A GG button on the results screen.",
      "📸 A photo finish takes a picture of the moment, shown with the results with a Save button.",
      "📣 Watching a friend race? Hit \"Cheer them on\": they get a shout-out and a 📣 pops up over their car.",
    ] },
    { v: "u-2026-10-05d", date: "5 Oct", title: "Stadiums, spectator info, called-off races", items: [
      "🏟️ Every track now has its own stadiums: grandstands full of little people round the outside of the corners and on the main straight. They jump up and cheer when cars go by.",
      "📣 Crowds cheer now when something big happens near their stand.",
      "👁 Watching someone? You see their team level, their boost, every upgrade they have, and the 3 cards they're offered and which one they pick. AI teams too.",
      "🟥 3 red flags or 7 safety cars in one race and it's called off: a big RACE ABANDONED screen, and everyone's classified as they stood (nobody gets a DNF for it).",
      "🛠️ Wiggle, rotate, flip, resize and road width keep your objects, DRS zones, start line and direction now (they used to wipe them).",
      "🚇 Tunnels and grandstands: click where it starts, then where it ends.",
      "🟡 Formation lap: no XP or upgrade cards, the endurance clock waits for the green flag, and the screen says Formation lap instead of Lap 1.",
      "🚨 Safety car: nobody can overtake while everyone's ghosted as it comes out, and the AI properly slows down to it.",
      "⏳ Endurance tyres last 1.5x longer (it was 2x).",
      "✨ Animations everywhere: screens slide in, buttons squish, windows pop open, results rows slide in with a shining podium, confetti for your podium, coins count up, the leaderboard flashes green/red when places change, the lap counter pops, notifications drop in with a timer bar.",
      "Small stuff: more than one red flag per race now (not straight after a restart) · upgrade lists show what someone has first · \"tap to see the results\" on the abandoned screen.",
    ] },
    { v: "u-2026-10-05c", date: "5 Oct", title: "Red flag restarts, tunnels, spectating, redo", items: [
      "🟥 Red flags only for a BIG pile-up now (6+ cars, hard hits), and everyone goes back to the starting grid in the order they were in just before the crash. Standing restart, no safety car.",
      "🏎️ Multiclass red flags: each class lines up together (all Hypers, then all GT3s), so you restart where you were in YOUR class.",
      "🏁 Qualifying (all kinds, knockout too): when the clock runs out, everyone on a lap gets to finish it. The timer says \"finishing laps\".",
      "👁 Click anyone on the race leaderboard to watch them. Click yourself (or the chip at the top) to go back to your car.",
      "💨 Slipstream works behind any class now: GT3s can tow behind Hypers and the other way round.",
      "⏳ Endurance: pick \"Share one car\" (swap at every stop) or \"Both race\" (a car each) in the Mode tab.",
      "🚇 Tunnels (track objects): drive into one and the world goes dark, the tunnel lights up around you, and every sound echoes, engines and commentator too.",
      "↪️ Redo button next to Undo in the track editor (Ctrl+Y works too): brings back whatever you just undid.",
      "Small stuff: \"GO! RESTART\" banner after a red flag · the red flag message says where you'll restart · new feed line when qualifying's time is up.",
    ] },
    { v: "u-2026-10-05b", date: "5 Oct", title: "Smoother cars, ranked grids, safety car unlaps", items: [
      "🛠️ Cars can't slide off the road on screen any more when the connection hiccups (they used to keep going straight, then snap back).",
      "⚙️ The server does about 20% less work per race (updates 15 times a second for every race), which matters a lot on a small server.",
      "🏆 Ranked: below Platinum you start from a random grid spot; Platinum and up get a 2 minute qualifying.",
      "👻 Safety car: lapped cars ghost through the pack and unlap themselves, and the safety car waits for them.",
      "🛞 Tyre warnings now count laps: one with 2 laps left on your tyres, one with 1 lap left (only if they won't make the flag). The must-pit banner says how many laps are left.",
      "⏳ Endurance: half the tyre wear.",
      "✨ Picking an upgrade card: it flashes, spins and flies to your upgrades with a burst of sparks.",
      "Small stuff: your dashboard numbers (boost, sectors) update a bit less often to save the server work; you won't notice",
    ] },
    { v: "u-2026-10-05a", date: "5 Oct", title: "Halloween shop, mythics, fair ranked restarts", items: [
      "🎃 Halloween shop drop: 26 new items (pumpkin, witch and slime underglows, candlelight glow, bat and pumpkin trails, spider web decal, vampire, witch, zombie and more badges...).",
      "💀 Haunted crates: 4 more items and 3 MYTHICS (Phantom livery, Witching Hour underglow, Possessed boost flame).",
      "🌈 Every season pass theme has its own elusive mythic livery (1.5% per crate). The shop drop's mythic, Lost Souls trail, is in the chests.",
      "🛡️ An update or restart in the middle of a ranked race doesn't cost you SR any more: the race just doesn't count.",
      "Small stuff: \"The game is updating\" no longer shows when it isn't (it says the server is restarting) · the server keeps itself awake while people are playing · a duplicate mythic refunds 1,500 coins.",
    ] },
    { v: "u-2026-10-04", date: "4 Oct", title: "Rain pit stops fixed, rank shield", items: [
      "🌧️ AI cars stopped pitting every lap in the rain: wet races get a proper plan now (about one stop instead of five).",
      "🛡️ Rank shield: the first time you'd drop out of a rank, the shield keeps you in. A fresh one comes with every promotion.",
      "🏆 Ranked gives 50 XP a second (was 15).",
      "🏎️ Multiclass can be an endurance race too (Endurance switch in the Mode tab).",
      "Small stuff: AI pit stops are a tad slower · the ranked panel shows if your shield is ready.",
    ] },
    { v: "u-2026-10-03", date: "3 Oct", title: "No more freezes when someone makes a track", items: [
      "🧊 Making a random track used to freeze every race on the server for a moment. It's made a little at a time now, so races keep running.",
      "📅 Track of the Week and the tournament track are saved once made, so they're the same all week (a restart used to be able to change them).",
      "Small stuff: the Random button says \"Making a ... random track\" while it works · the server logs any freeze so it can be tracked down.",
    ] },
    { v: "2026-10-30", title: "Smoother races, messages you can see", items: [
      "🚀 New Graphics setting (Auto by default): when your device can't keep up, the race view gets a little less sharp so it stays smooth, and sharpens again when it can. Fast mode for slow phones.",
      "💬 Messages on the menu and in the lobby show up now (they were hidden behind the race screen): bet sent, gift sent, and why something didn't work.",
    ] },
    { v: "2026-10-29", title: "The biggest update yet: 22 new things", items: [
      "🟥 Red flag (safety car on): a huge pile-up stops the race, the crews fix the cars, and it restarts in order behind the safety car.",
      "🟡 Rolling starts (Settings › Start): a formation lap behind the safety car, green flag at the line.",
      "❄️ Cold tyres: a bit less grip at the start and out of the pits until they warm up (about a lap).",
      "🌇 Day into night (Settings): the sun goes down as the race goes on, headlights on at dusk.",
      "📻 Pit wall: tell your AI teammate to Push, Hold or Box (team radio panel).",
      "⏱️ Time trial mode with a leaderboard on every track · 👑 King of the hill · ⏳ Endurance (10-30 min, teammates share a car and swap at the stops).",
      "🏟️ Weekend tournaments (Profile › Tournament): sign up in the week, knockout bracket at the weekend, best lap wins each match. No tyre wear on the tournament track, and from next week it's always a VERY wonky one.",
      "🤝 Head-to-head records with friends · 🎲 Predict the winner when you're watching · 👻 Ghost challenges: send a friend your lap to beat.",
      "📈 Lap chart and 🎞️ highlight reel after every race · 📣 Crowd noise · 📊 Live timing for spectators · Grid walk and a track card before the start.",
      "📯 Horns (H) and engine sounds (V8, V12, electric) in Settings.",
      "🏟️ Track objects: grandstands, banners, tunnels and bridges (Edit tools) · 🗳️ Weekly track contest (Community tracks): the winner becomes next week's Track of the Week.",
    ] },
    { v: "2026-10-28", title: "A brand new look", items: [
      "🎨 The Broadcast look: a new main menu with a big hello, your car on a glowing stage, slanted play tiles, your stats and login streak, and a live ticker along the bottom. Profile, lobby, results and pop-ups match it.",
      "🏁 The race itself looks exactly the same, and so do the cars.",
      "⚙ Prefer the old look? Settings › Menu theme › Classic dark.",
    ] },
    { v: "2026-10-27", title: "Car presets, a calmer commentator, real ranked difficulty", items: [
      "🚗 Car presets: save your whole look (colour, livery, number, painted design and every item you have on) under a name and swap between looks in one tap. Under Your car on the menu, and in Customize.",
      "🎙️ The commentator talks a lot less: he leaves gaps between lines and skips small stuff. He also never switches to a different voice mid-race any more.",
      "🏆 Ranked difficulty climbs every tier: a gentle new Rookie AI at Iron, Easy at Bronze, Medium at Silver, Hard at Gold, EXTREME at Platinum, Overdrive at Diamond and Master, and a brand new Elite AI at Overdrive Elite.",
      "🎟️ Season pass rewards get better the higher you go: bigger coin payouts every tier, more wheel spins, and double and triple crates near the top.",
      "🔧 AI pit crews are quicker: shorter stops, faster down the pit lane, fewer fumbles.",
    ] },
    { v: "2026-10-26", title: "Championship mode and a 7-day login streak", items: [
      "🏆 Championship mode (Mode tab): pick 2-10 tracks, draw (or load) each one and add it to the calendar, then race a full season on them in order. The next round's track loads by itself, points carry over, and the last round ends with the season finale.",
      "🔥 Login streak: come back on days in a row for a bigger daily bonus (50 up to 400 coins). Day 7 also gives a themed crate and a wheel spin. Miss a day and it starts again. See it in Profile › Stats.",
    ] },
    { v: "2026-10-25", title: "Casino, daily wheel, 60-tier pass, notifications", items: [
      "🎡 Daily wheel: one free spin every day (Profile › 🎰 Casino). Coins, season pass XP, crates or another spin.",
      "🎟️ The season pass has 60 tiers now (was 30), and both tracks hand out wheel spins.",
      "🍒 Slots and 🃏 Blackjack in the Casino, next to Plinko.",
      "🔔 Notifications at the top when someone gifts you, trades, bets, messages or friends you. Missed them while you were offline? They show when you come back.",
      "🏎️ Overtake of the race: the best pass is named in the results, and you can watch it again.",
    ] },
    { v: "2026-10-24", title: "Smoother races when the server hiccups", items: [
      "🧈 When updates arrive late, cars no longer stop turning, fly off the track and teleport back. The game keeps a slightly bigger cushion of updates after a hiccup and barely guesses ahead, so cars stay on the road.",
      "🌉 Cars under a bridge are hidden by it again (no more see-through ramps).",
    ] },
    { v: "2026-10-23", title: "1v1 bets, and GT3s let the Hypers by", items: [
      "⚔️ Bet a friend: Profile › Friends › ⚔️. You both put in the same coins (you both need to have them), and whoever finishes ahead in your next race together gets both. Leaving the race counts as losing; no race within 3 days and you both get your coins back.",
      "🏁 Multiclass knockout qualifying now knocks out the slowest of each class (Hypers and GT3s separately), not just the slowest overall.",
      "👻 When the safety car comes out, every car is a ghost for 2 seconds so the crash doesn't turn into a pile-up.",
      "🚗 In multiclass races, GT3s move over and lift a little to let the faster Hypers through.",
      "🎰 Plinko feels instant: the ball drops the moment you click, and each drop is quicker.",
      "🎰 Spamming Drop 10 in Plinko works now: balls line up and drop one after another (up to 40 waiting), never get stuck on the top peg, and your coins stay right.",
    ] },
    { v: "2026-10-22", title: "Less lag, Plinko fixed, more commentary", items: [
      "⚡ Less lag: big races (9+ cars) send half as much data, which was choking the server and slow connections.",
      "🛑 If everyone racing leaves the race, it stops and goes back to the lobby instead of running on for nobody.",
      "🎰 Plinko fixed: your balance never goes wrong when you drop lots of balls fast, and no ball gets lost.",
      "🎙️ 45 new commentator lines: DRS, jump starts, slow stops, cars running wide, halfway, battles for the lead, Q1/Q2 knock-outs, pole position, defending, and more ways to call the old ones.",
    ] },
    { v: "2026-10-21", title: "Sell your stuff, and a Mode tab", items: [
      "💰 Sell anything you own (in the Store or Customize): shop items sell for half what they cost, chest and pass items for a set price by rarity (Common 25 up to Mythic 1,500). Tap Sell, then again to confirm.",
      "🎮 The game mode picker (Normal, Multiclass, Elimination, Practice) has its own Mode tab in the room now, so no more scrolling.",
    ] },
    { v: "2026-10-20", title: "Customize your car, and a much better commentator", items: [
      "🎨 New Customize tab (menu, or Profile > Customize): a big live preview of your car and ONLY the things you own, slot by slot. Tap to put something on, ∅ to take it off.",
      "🎙️ New commentator voice: the best voice the AI model has (not the old robot one), and lines about drivers are now whole sentences with the name in them (\"Bolt wins the race! What a drive!\") instead of a name glued onto a line.",
    ] },
    { v: "2026-10-19", title: "Achievement rewards rebalanced", items: [
      "⚖️ The 1,300 new achievements paid far too much (long-time players got 50,000+ coins at once). Their rewards are now about a quarter, the brutal ones about 60%, and every account gave back half of what those achievements paid out (never below 0 coins).",
    ] },
    { v: "2026-10-18", title: "Mythic chest, Plinko, 1,300 new achievements, see-through ramps", items: [
      "🔮 The Mythic chest (5,000 coins): no commons or rares, 55% legendary, 15% mythic, double refunds on duplicates, and 5 mythics you can only get here (Supernova underglow, Phoenix trail, Solar Eclipse livery, Event Horizon flame, Liquid gold smoke).",
      "🎰 The gambling room (Profile > Plinko): bet 10-1000 coins, pick Low / Medium / High risk, drop balls and win up to 170x. Coins only, just for fun. The house wins in the end!",
      "🏵️ 1,300+ new achievements: tiers for everything from races to plinko, every real circuit, every theme and AI level, and some truly brutal ones (worth up to 50,000 coins). Search and filter them in Achievements.",
      "👻 See-through ramps: cars driving under a bridge now show through it as ghosts, so you never lose your car.",
      "🚨 The safety car now drives over ramps (and gets bigger up there like everyone else) instead of under them.",
    ] },
    { v: "2026-10-17", title: "Practice, knockout qualifying, sector times, strategy and rematches", items: [
      "🏋️ Practice mode (Race settings > Game mode): just you on the track, no AI, as long as you like. Learn the track, chase sector times, practise pit stops. The host ends it.",
      "🏁 Knockout qualifying (Qualifying > Knockout): Q1, Q2 and Q3. The slowest are knocked out after Q1 and Q2, and the last few fight for pole in Q3.",
      "⏱️ Sector times under your lap time: purple = fastest of anyone, green = your best, yellow = slower. The sector you're in counts up live.",
      "📋 Before the start, your strategist suggests a plan (stops, tyres, which lap to box). One tap uses it, and you get a reminder on the lap to box.",
      "🔁 Rematch: race again straight from the results, same track and settings. Players who aren't the host can vote for one.",
      "🛍️ The Paddock drop: 31 new shop items: Sunset fade underglow, Cash / Ripple ring / Honeycomb trails, Barcode / Laurel / Comet decals, new plates, rims, helmets, smoke and 10 badges.",
    ] },
    { v: "2026-10-16", title: "Pit stop minigame and a race commentator", items: [
      "🎮 Pit stop minigame: when your car stops in the box, hit the 6 arrows in order (arrow keys, WASD, or tap them on a phone). Fast and clean beats the AI crews; wrong keys cost time. Turn it off in Settings > Assists.",
      "🎙️ A race commentator calls the start, crashes, new leaders, final laps, safety cars, knock-outs, pit stops and the win, in a proper British commentator voice. Volume (or off) in Settings > Sound.",
    ] },
    { v: "2026-10-15", title: "Elimination races, a faster safety car restart, and GT3s", items: [
      "💥 New game mode: Elimination (Race settings, next to Multiclass). Last place is knocked out every lap until one car is left. The HUD warns you when you're in the knock-out zone.",
      "🚨 Safety car: cars stuck at the back now sprint up to the pack at nearly full speed, then slow down and slot in behind it.",
      "🟢 GTs are now GT3s: boxy bodies with flared wheel arches, yellow headlights, bonnet vents and a huge swan-neck wing. They're also slower than before.",
    ] },
    { v: "2026-10-14", title: "Defend mode, and grip and brakes that really work", items: [
      "🛡️ Defend (V, or the DEFEND button): your driver covers the car behind, blocks their moves and kills their slipstream. Costs 10% boost to switch on, then 8% a second. It turns off when the boost runs out.",
      "🤝 New Defend assist in Settings > Assists, and the Hard / EXTREME AI now defend too on the last two laps.",
      "🧲 Sticky Setup is now +30% grip per level (was 15%) and Carbon Brakes +50% (was 30%), and Carbon Brakes now stop with room to spare.",
      "🏁 Drivers now catch slides at the edge of the road, and grippy cars hold the kerb. Cars run off far less, and a car with maxed Grip and Brakes almost never does.",
    ] },
    { v: "2026-10-13", title: "Multiclass racing and the Motion pack", items: [
      "🏎️ New game mode: Multiclass! The host picks it at the top of the Race settings. Fast 🔴 Hypers and slower 🟢 GTs share the track, and each class races for its own win and points.",
      "🚦 Pick your class in the lobby: Hypers are much faster; GTs are tougher, go way longer on a set of tyres, pit quicker and refill boost faster. The host sets how the AI is split.",
      "🔵 Blue flags: in a GT you get a warning when a faster Hyper is right behind you, and Hypers get a heads-up about GT traffic ahead.",
      "📊 Class positions everywhere: your HUD, the standings (HY / GT tags), name tags, class-win banners and class winners on the results.",
      "✨ The Motion pack: 29 new animated items (underglows, boost flames, helmets, rims, number plates, smoke, trails, decals, an LED wing and 5 chest-only liveries). Animated items now move in the store preview too!",
    ] },
    { v: "2026-10-12", title: "Your finish replays, world news, new sounds and a shop drop", items: [
      "👥 Team ranked AI now race in teams the size of yours: two of you means every AI team has 2 cars.",
      "🌍 When anyone anywhere pulls a super rare upgrade card, every player in every race hears about it.",
      "🏁 Watch YOUR finish: after the flag, rewatch your own run to the line. Your last 3 finishes stay in 🎬 Replays.",
      "🛍️ 29 new shop items: glows, flames, rims, helmets, smoke, Confetti/Ember/Checkered trails, Skull/Stripes/Dice decals and 8 new badges.",
      "🎶 Music fixed: songs now load from the game's own server (faster, and they work on networks that block archive.org), a song that won't load is skipped instead of stopping the music, and ⏭ Next song never leaves you in silence.",
      "🎵 No more silent games: if the online songs can't load (some school and work networks block them), a built-in soundtrack made right in your browser plays instead. ⏭ Next song tries the online songs again.",
      "🛒 The store is organized now: tabs for Chests, Car & paint, Wheels & wing, Effects and Driver, plus Can buy / Owned filters and sorting by price, rarity or name.",
      "🔊 New engine sound with gears, a boost kick and whoosh, a DRS whoosh, and you can hear the cars around you.",
    ] },
    { v: "2026-10-11", title: "Team ranked, Undo everything, and part-width roads", items: [
      "👥 Team ranked: get 2-4 signed-in friends in a room and the host presses Team ranked. You race as one team against the AI, with your own team rating.",
      "↩️ Undo now undoes anything you do to the track in the lobby: drawing, deleting, rotating, flipping, resizing, random tracks, clearing, DRS... (Ctrl+Z works too).",
      "🛣️ Wider road / Narrower now work on the part you pick: click where it starts and ends (or press Whole track).",
    ] },
    { v: "2026-10-10", title: "Keybinds and assists", items: [
      "⌨️ Settings > Keybinds: change any race key (boost, DRS, box, photo mode, pause, upgrade cards, watch next car, settings).",
      "🤝 Settings > Assists: Pit assist calls your stops and picks tires, Boost assist fires your boost on the straights, DRS assist opens DRS the moment it's available.",
    ] },
    { v: "2026-10-09", title: "Press for DRS, and sideways phones", items: [
      "🟩 DRS is yours to open now: when it's available in a zone, press D (or tap the green DRS button next to Boost).",
      "💚 With DRS open your screen glows green, and it's much stronger: +12% top speed and better acceleration. Expect lots of overtakes in DRS zones (the AI use it too!).",
      "📱 Holding your phone sideways now shows the whole race HUD: standings, tires, team level, boost and DRS, around the edges so the road stays clear.",
    ] },
    { v: "2026-10-08", title: "Longer ranked races", items: [
      "🏁 Ranked laps go up steadily with your tier: 4 at Iron, then 6, 7, 9, 10, 12, 13 and 15 laps at Overdrive Elite.",
    ] },
    { v: "2026-10-07", title: "Bigger ranked tracks", items: [
      "🏆 Every ranked tier races on big tracks now (no more tiny ones): Iron is 4 laps on the large map, and from Diamond up it's the huge map.",
      "📏 Ranked races are longer at every tier: 4 laps at Iron, up to 7 at Overdrive Elite. Real circuits show up from Iron too.",
    ] },
    { v: "2026-10-06", title: "Better ranked, fairer coins", items: [
      "🏆 Ranked grows with you: Iron is a short race against 3 AI on small, gentle tracks. Every tier up adds AI and laps, with bigger, wonkier tracks and real circuits, up to 12 Overdrive AI over 7 laps at Overdrive Elite.",
      "🟩 Automatic DRS only goes on real straights now (a track that's all corners gets none). Hosts can still put a zone anywhere with Add DRS.",
      "🪙 Ranked doesn't pay race coins any more. Ranking up does: 150 coins for each new division, 600 for each new tier, 3,000 for Overdrive Elite (each one once).",
      "🏁 Race coins (wins, rivals, Driver of the Day) need more than 5 laps, on a track that isn't tiny (0.6 km or more).",
      "🌙 Night and 🌫 fog races run a lot smoother.",
      "🌍 Community tracks: only the player who first shared a track can list it, and plays count once per player per day.",
    ] },
    { v: "2026-10-04", title: "Tidier screens on computers", items: [
      "🧰 Track tools are split into ✏️ Draw, 📚 Tracks and 🔧 Edit, so the column fits on screen.",
      "👥 The room has 3 tabs: Drivers (with the AI list), Settings (with points) and Standings.",
      "🏅 Your profile has 5 tabs: Me (stats and achievements), Store, Season pass, Ranked (with leaderboards) and Friends. Security is the 🔒 button.",
      "📱 Phones look the same as before.",
    ] },
    { v: "2026-10-03", title: "Prestige, community tracks and weekend events", items: [
      "🎖️ Prestige: max the season pass, then reset it for 1,000 coins and a prestige badge next to your name. The tiers pay out again.",
      "🌍 Community tracks: share a track and add it to the community list. Browse the most played, top rated and newest, 👍 or 👎 them, and load them in your room.",
      "🎉 Weekend events: every Saturday and Sunday something special is on (rain weekends, double coins on street circuits, double pass XP and more). See the menu.",
      "🔄 Reverse grid (room setting): from race 2 of a championship, the leaders start at the back.",
      "📱 Account busy on another device? You can sign that device out right from the message.",
    ] },
    { v: "2026-10-02", title: "Fixes", items: [
      "🔑 Password wiped by the old bug? Sign in on a device you played on before and type the new password you want. It becomes your password.",
      "🖱️ Your mouse wheel now scrolls sideways on rows that only go sideways (profile tabs, season pass, track tools).",
    ] },
    { v: "2026-10-01", title: "Win coins", items: [
      "🏆 Win a race and earn coins: 50 on Easy AI, 100 on Normal, 150 on Hard, 500 on Extreme.",
      "🤖 Win coins need at least 7 AI drivers in the race. Races with only real players don't pay win coins.",
      "🔒 One account, one match: your account can't be in two rooms at once (another tab or device has to leave first).",
      "💤 Left a device on? After an hour in a room with no activity you're removed (with a warning 2 minutes before), so your account is free to play somewhere else.",
      "🔑 Fixed: signing in on a second device. A bug could wipe your password. If yours was hit, the game tells you and you can set a new one in Profile > 🔒 Security.",
    ] },
    { v: "2026-09-30", title: "DRS zones", items: [
      "🟩 DRS: cross the start of a DRS zone within 1 second of the car ahead and you get +7% top speed until the zone ends. It opens from lap 2, not in the wet or behind the safety car. In qualifying it's open in every zone.",
      "🏆 Real tracks have their real DRS zones, on the same straights as the real circuits.",
      "🎲 Random, drawn and shared tracks get DRS on their longest straights automatically.",
      "🛠️ Hosts can place their own zones (Add DRS), reset them (Auto DRS) or remove them (No DRS). Zones are kept in share codes and saved tracks. There's a DRS on/off setting too.",
      "⚡ Firing your boost now earns 1.5x upgrade XP while it's on.",
      "🎯 Beating your rival now also gives 100 season pass XP (on top of the 100 coins).",
      "📰 This \"What's new\" window. Open it again any time from the menu.",
    ] },
  ];
  function openNews(onlyNew) {
    let seen = null; try { seen = localStorage.getItem("tb-news"); } catch (e) {}
    const list = $("newsList"); list.textContent = "";
    const cut = WHATS_NEW.findIndex((n) => n.v === seen);
    WHATS_NEW.forEach((n, i) => {
      const fresh = !onlyNew || cut < 0 || i < cut;
      const box = document.createElement("div"); box.className = "news-item" + (fresh ? "" : " old");
      const h = document.createElement("h3"); h.textContent = n.title; if (n.date) { const sm = document.createElement("small"); sm.textContent = n.date; h.appendChild(sm); } box.appendChild(h);
      const ul = document.createElement("ul"); for (const it of n.items) { const li = document.createElement("li"); li.textContent = it; ul.appendChild(li); } box.appendChild(ul);
      list.appendChild(box);
    });
    $("newsBox").classList.remove("hidden"); $("newsOk").focus();
    try { localStorage.setItem("tb-news", WHATS_NEW[0].v); } catch (e) {}
  }
  function closeNews() { $("newsBox").classList.add("hidden"); }
  function maybeNews() {
    if (!WHATS_NEW.length || (S.screen !== "menu" && S.screen !== "lobby") || !$("newsBox").classList.contains("hidden")) return;
    let seen = null, played = false;
    try { seen = localStorage.getItem("tb-news"); played = PLAYED_BEFORE; } catch (e) { return; }
    if (seen === WHATS_NEW[0].v) return;
    if (!seen && !played) { try { localStorage.setItem("tb-news", WHATS_NEW[0].v); } catch (e) {} return; }   // brand new: nothing is "new" to them
    if (S.tutorial) return;
    openNews(true);
  }
  setTimeout(maybeNews, 1200);          // the menu is already up when the page loads
  $("newsLink").addEventListener("click", (e) => { e.preventDefault(); openNews(false); });
  $("newsClose").addEventListener("click", closeNews); $("newsOk").addEventListener("click", closeNews);
  $("newsBox").addEventListener("click", (e) => { if (e.target === $("newsBox")) closeNews(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("newsBox").classList.contains("hidden")) closeNews(); });

  // ======================= Small yes/no dialog =======================
  let askYesFn = null;
  function askBox(title, text, yes, fn) {
    $("askTitle").textContent = title; $("askText").textContent = text; $("askYes").textContent = yes; askYesFn = fn;
    $("askBox").classList.remove("hidden"); $("askYes").focus();
  }
  const askClose = () => { $("askBox").classList.add("hidden"); askYesFn = null; };
  $("askYes").addEventListener("click", () => { const f = askYesFn; askClose(); if (f) f(); });
  $("askNo").addEventListener("click", askClose);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("askBox").classList.contains("hidden")) askClose(); });

  // ======================= Your account is in a match on another device =======================
  socket.on("accountBusy", (d) => askBox("📱 Playing somewhere else?", `Your account is in a match on another device or tab (room ${d?.code || "?"}). Sign that one out so you can play here?`, "Sign out my other device", () => socket.emit("account:kickOther")));
  socket.on("kickedOther", (d) => { menuErr.textContent = ""; popup(d?.n ? "✅ Your other device was signed out. Press play again!" : "Your other device had already left. Press play again!"); });
  socket.on("signedOutElsewhere", () => {
    S.idleKicked = true; S.code = null; A.user = null;
    try { sessionStorage.removeItem("tb-rejoin"); localStorage.removeItem("tb-token"); } catch (e) {}
    $("netVeil").classList.remove("hidden");
    $("netMsg").textContent = "📱 You were signed out here because your account started playing on another device.";
    const sm = $("netVeil").querySelector("small"); if (sm) sm.textContent = "Reload the page to play here again.";
    $("netVeil").querySelector(".spinner")?.classList.add("hidden");
  });

  // ======================= Weekend event (menu card) =======================
  function renderEvent(ev) {
    const card = $("eventCard"); if (!ev) { card.classList.add("hidden"); return; }
    card.classList.remove("hidden"); card.classList.toggle("live", !!ev.live);
    $("eventIc").textContent = ev.icon; $("eventName").textContent = ev.name; $("eventDesc").textContent = ev.desc;
    const hrs = Math.max(1, Math.round(((ev.live ? ev.ends : ev.starts) - Date.now()) / 3600000));
    const left = hrs >= 48 ? `${Math.round(hrs / 24)} days` : `${hrs} hour${hrs === 1 ? "" : "s"}`;
    $("eventWhen").textContent = ev.live ? `🎉 Weekend event · ON NOW · ends in ${left}` : `Next weekend event · starts in ${left}`;
  }

  // ======================= Community tracks =======================
  let commSort = "popular";
  // ---- weekly track contest (a tab in Community tracks) ----
  socket.on("contest", (C) => {
    if (!S.commContest || $("commBox").classList.contains("hidden")) return;
    const g = $("commGrid"); g.textContent = "";
    const days = Math.max(0, Math.ceil((C.ends - Date.now()) / 86400000));
    $("commNote").textContent = `🗳️ This week's theme: "${C.theme}". Enter a track you drew, vote for your favourites (not your own). The most votes when the week ends (${days} day${days === 1 ? "" : "s"} left) becomes NEXT week's Track of the Week, and its maker gets 1,500 coins. Next theme: "${C.nextTheme}".`;
    const top = el("div", "contest-top");
    if (C.thisWeeksWinner) top.appendChild(el("p", "bet-live", `🏆 Last week's winner, now Track of the Week: "${C.thisWeeksWinner.name}" by ${C.thisWeeksWinner.byName} (${C.thisWeeksWinner.votes} votes)`));
    const enter = el("button", "btn go", "🗳️ Enter the track I'm on"); enter.type = "button"; enter.disabled = !A.user || !S.track;
    enter.title = !A.user ? "Sign in first" : !S.track ? "Make a room and draw a track first" : "";
    enter.addEventListener("click", () => socket.emit("contest:enter", { name: S.lobby?.trackName || "" }));
    top.appendChild(enter); g.appendChild(top);
    if (!C.entries.length) g.appendChild(el("p", "preset-note", "No entries yet this week. Be the first!"));
    for (const e of C.entries) {
      const card = el("div", "contest-entry" + (e.mine ? " mine" : ""));
      card.append(el("b", "", e.name), el("small", "", `by ${e.byName}${e.mine ? " (you)" : ""} · ${e.votes} vote${e.votes === 1 ? "" : "s"}`));
      const row = el("div", "sec-row");
      const v = el("button", "btn" + (e.voted ? " go" : ""), e.voted ? "✓ Voted" : "👍 Vote"); v.type = "button"; v.disabled = e.mine || !A.user; v.addEventListener("click", () => socket.emit("contest:vote", e.code));
      const ld = el("button", "btn", "Try it"); ld.type = "button"; ld.disabled = !S.host || S.lobby?.phase !== "lobby"; ld.title = ld.disabled ? "Make a room first (you load it as the host)" : "";
      ld.addEventListener("click", () => { socket.emit("track:load", e.code); $("commBox").classList.add("hidden"); });
      row.append(v, ld); card.appendChild(row); g.appendChild(card);
    }
  });
  function openComm() { S.commContest = false; document.querySelectorAll("[data-cs]").forEach((x) => x.setAttribute("aria-selected", String(x.dataset.cs === commSort))); $("commBox").classList.remove("hidden"); $("commGrid").textContent = ""; $("commGrid").appendChild(el("p", "preset-note", "Loading...")); socket.emit("community:list", { sort: commSort }); }
  function commCard(t) {
    const card = el("div", "preset"); card.dataset.code = t.code;
    const cv = document.createElement("canvas"); cv.width = 200; cv.height = 120;
    const c = cv.getContext("2d"); c.strokeStyle = "#ffcc1f"; c.lineWidth = 3; c.lineJoin = "round"; c.beginPath();
    t.prev.forEach(([x, y], i) => { const X = 50 + x, Y = 10 + y; i ? c.lineTo(X, Y) : c.moveTo(X, Y); }); c.closePath(); c.stroke();
    card.append(cv, el("b", "", t.name), el("small", "", `by ${t.by} · ${t.map} map · code ${t.code}`));
    const st = el("div", "comm-stats"); st.append(el("span", "", `▶ ${t.plays} race${t.plays === 1 ? "" : "s"}`), el("span", "", `👍 ${t.up}`), el("span", "", `👎 ${t.down}`)); card.appendChild(st);
    const row = el("div", "row");
    const load = el("button", "btn go", "Load"); load.type = "button";
    load.disabled = !S.host || S.lobby?.phase !== "lobby"; load.title = load.disabled ? "Only the host can load a track, in the lobby" : "";
    load.addEventListener("click", () => { socket.emit("track:load", t.code); $("commBox").classList.add("hidden"); boardHint(`Loading "${t.name}"...`, false); });
    row.appendChild(load);
    if (t.mine) {
      const rm = el("button", "btn", "Remove"); rm.type = "button";
      rm.addEventListener("click", () => askBox("Remove it?", `Take "${t.name}" out of the community list? (Its share code keeps working.)`, "Remove", () => { socket.emit("community:remove", { code: t.code }); setTimeout(() => socket.emit("community:list", { sort: commSort }), 400); }));
      row.appendChild(rm);
    } else for (const [v, ic] of [[1, "👍"], [-1, "👎"]]) {
      const b = el("button", "btn" + (t.myVote === v ? " on" : ""), ic); b.type = "button"; b.setAttribute("aria-pressed", String(t.myVote === v));
      b.title = A.user ? (v > 0 ? "Good track" : "Not for me") : "Sign in to rate tracks";
      b.addEventListener("click", () => socket.emit("community:vote", { code: t.code, v: t.myVote === v ? 0 : v }));
      row.appendChild(b);
    }
    card.appendChild(row);
    return card;
  }
  socket.on("community", (d) => { if (S.commContest) return;
    const g = $("commGrid"); g.textContent = "";
    if (!d.list.length) g.appendChild(el("p", "preset-note", "No community tracks yet. Share a track (🔗 Share code) and add it!"));
    for (const t of d.list) g.appendChild(commCard(t));
  });
  socket.on("communityVoted", (t) => { const old = $("commGrid").querySelector(`[data-code="${t.code}"]`); if (old) old.replaceWith(commCard(t)); });
  socket.on("communityMsg", (m) => { if (m.error) { if (!$("codeBox").classList.contains("hidden")) $("codeMsg").textContent = m.error; else popup(m.error, true); } else { $("codeMsg").textContent = m.ok; $("commPub").classList.add("hidden"); popup(m.ok); } });
  document.querySelectorAll("[data-cs]").forEach((b) => b.addEventListener("click", () => {
    document.querySelectorAll("[data-cs]").forEach((x) => x.setAttribute("aria-selected", String(x === b)));
    if (b.dataset.cs === "contest") { S.commContest = true; $("commGrid").textContent = ""; $("commGrid").appendChild(el("p", "preset-note", "Loading...")); socket.emit("contest:get"); return; }
    S.commContest = false; commSort = b.dataset.cs;
    socket.emit("community:list", { sort: commSort });
  }));
  $("commBtn").addEventListener("click", openComm);
  $("commClose").addEventListener("click", () => $("commBox").classList.add("hidden"));
  $("commBox").addEventListener("click", (e) => { if (e.target.id === "commBox") $("commBox").classList.add("hidden"); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("commBox").classList.contains("hidden")) $("commBox").classList.add("hidden"); });
  $("commPub").addEventListener("submit", (e) => {
    e.preventDefault();
    if (!A.user) { $("codeMsg").textContent = "Sign in to add tracks to the community list"; return; }
    socket.emit("community:publish", { code: $("codeShow").textContent, name: $("commPubName").value.trim() });
  });

  // ======================= Replays: save, share, load =======================
  const TRACK_KEYS = ["decor", "pts", "tan", "nor", "N", "W", "H", "length", "trackW", "theme", "hw", "line", "gravel", "pitLane", "minX", "minY", "pad", "scale", "reverse", "elev", "bridges", "maxLevel", "vmax", "name", "drs"];
  function buildReplay(opts = {}) {
    const buf = opts.from ? RP.buf.filter((m) => m.at >= opts.from) : RP.buf;
    if (buf.length < 30 || !S.track || !S.race) return null;
    const track = {}; for (const k of TRACK_KEYS) track[k] = S.track[k];
    const winner = opts.focus || S.lastResults?.rows?.[0]?.name || "";
    const cars = [...S.race.info.values()].map((c) => ({ id: c.id, name: c.name, color: c.color, livery: c.livery, number: c.number, design: c.design || null, extras: c.extras || null }));
    return { v: 1, title: opts.title || `${S.track.name || "Scribble track"}${winner ? ` · ${winner} won` : ""}`, speed: S.race.speed || 1, fog: !!S.race.fog, winner, track, cars,
      frames: buf.map((m) => ({ t: m.st.t, s: m.st.standings, c: m.st.cars, w: Math.round((m.st.weather?.wet || 0) * 100) / 100, r: m.st.weather?.raining ? 1 : 0 })) };
  }
  // make it smaller: fewer frames per second, and only the cars at the front (plus yours)
  function slimReplay(rec, step, maxCars) {
    let keep = null;
    if (rec.cars.length > maxCars) {
      const last = rec.frames[rec.frames.length - 1].s || [];
      keep = new Set(last.slice(0, maxCars - 1)); if (S.myCar) keep.add(S.myCar);
      for (const c of rec.cars) if (keep.size < maxCars) keep.add(c.id);
    }
    const frames = rec.frames.filter((_, i) => i % step === 0 || i === rec.frames.length - 1).map((f) => (keep ? { ...f, s: f.s.filter((id) => keep.has(id)), c: f.c.filter((a) => keep.has(a[0])) } : f));
    return { ...rec, cars: keep ? rec.cars.filter((c) => keep.has(c.id)) : rec.cars, frames };
  }
  async function gzip(str) {
    if (!window.CompressionStream) throw new Error("This browser can't pack replays");
    const s = new Blob([str]).stream().pipeThrough(new CompressionStream("gzip"));
    return new Uint8Array(await new Response(s).arrayBuffer());
  }
  async function gunzip(bytes) {
    if (!window.DecompressionStream) throw new Error("This browser can't open replays");
    const s = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
    return new Response(s).text();
  }
  const b64 = (u8) => { let s = ""; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
  const unb64 = (s) => Uint8Array.from(atob(s), (ch) => ch.charCodeAt(0));
  async function packReplay(rec, limit) {
    for (const [step, max] of [[1, 99], [2, 99], [3, 30], [3, 20], [4, 14], [6, 10], [8, 8]]) {
      const bytes = await gzip(JSON.stringify(slimReplay(rec, step, max)));
      if (bytes.length <= limit) return bytes;
    }
    throw new Error("That replay is too big");
  }
  const savedReplays = () => { try { return JSON.parse(localStorage.getItem("tb-replays") || "[]"); } catch (e) { return []; } };
  async function saveReplay(rec) {
    if (!rec) return popup("Nothing to save yet", true);
    try {
      const bytes = await packReplay(rec, 600e3);
      let list = savedReplays();
      list.unshift({ id: Date.now().toString(36), title: rec.title, at: Date.now(), size: bytes.length, cars: rec.cars.length, data: b64(bytes) });
      list = list.slice(0, 8);
      for (;;) {
        try { localStorage.setItem("tb-replays", JSON.stringify(list)); break; }
        catch (e) { if (list.length <= 1) throw new Error("Your browser is out of space for replays"); list.pop(); }
      }
      popup("💾 Replay saved! Find it in 🎬 Replays on the main menu.");
    } catch (e) { popup(e.message || "Couldn't save that replay", true); }
  }
  async function shareReplay(rec) {
    if (!rec) return popup("Nothing to share yet", true);
    if (!A.user) return popup("Sign in to share replays", true);
    try { popup("Packing the replay..."); socket.emit("replay:share", await packReplay(rec, 360e3)); }
    catch (e) { popup(e.message || "Couldn't share that replay", true); }
  }
  async function openSavedBytes(bytes) {
    try { playReplay(JSON.parse(await gunzip(bytes))); } catch (e) { popup("That replay couldn't be opened", true); }
  }
  socket.on("replayData", (d) => {
    if (d.error) { $("replayNote").textContent = d.error; return popup(d.error, true); }
    $("replayBox").classList.add("hidden");
    openSavedBytes(new Uint8Array(d.data));
  });
  function renderReplayList() {
    const box = $("replayList"); box.textContent = "";
    const list = savedReplays();
    if (!list.length) { box.appendChild(el("p", "preset-note", "No saved replays yet.")); return; }
    for (const r of list) {
      const row = el("div", "friend");
      const tx = el("div"); tx.append(el("b", "", r.title || "Replay"), el("small", "", `${new Date(r.at).toLocaleString()} · ${r.cars} cars · ${Math.round(r.size / 1024)} KB`));
      const bs = el("div", "sec-row");
      const w = el("button", "btn go", "Watch"); w.type = "button"; w.addEventListener("click", () => { $("replayBox").classList.add("hidden"); openSavedBytes(unb64(r.data)); });
      const sh = el("button", "btn", "🔗 Share"); sh.type = "button"; sh.addEventListener("click", async () => { try { shareReplay(JSON.parse(await gunzip(unb64(r.data)))); } catch (e) { popup("Couldn't open it", true); } });
      const del = el("button", "btn ghost", "🗑️"); del.type = "button"; del.setAttribute("aria-label", "Delete this replay");
      del.addEventListener("click", () => { try { localStorage.setItem("tb-replays", JSON.stringify(savedReplays().filter((x) => x.id !== r.id))); } catch (e) {} renderReplayList(); });
      bs.append(w, sh, del); row.append(el("span", "fdot on"), tx, bs); box.appendChild(row);
    }
  }
  // ---- YOUR finish, from your last 3 races: kept automatically, camera on you ----
  const myFinishes = () => { try { return JSON.parse(localStorage.getItem("tb-finishes") || "[]"); } catch (e) { return []; } };
  socket.on("race", () => { S.myFinAt = 0; S.myFinDone = false; $("myFinishBtn").classList.add("hidden"); });
  socket.on("state", (st) => {
    if (S.replaying || !S.myCar || S.myFinAt || S.race?.quali) return;
    const a = st.cars.find((x) => x[0] === S.myCar);
    if (a && a[10]) { S.myFinAt = performance.now(); S.myFinPos = st.standings.indexOf(S.myCar) + 1; setTimeout(captureMyFinish, 4000); }
  });
  socket.on("results", (r) => {
    // (finished last? the race ended on the same update: take your finish from the results)
    if (!S.myFinAt && S.myCar && !S.race?.quali && !S.replaying) {
      const i = (r?.rows || []).findIndex((x) => x.owner === S.me);
      if (i >= 0 && r.rows[i].finished) { S.myFinAt = performance.now(); S.myFinPos = i + 1; }
    }
    if (S.myFinAt && !S.myFinDone) captureMyFinish();
  });
  async function captureMyFinish() {
    if (S.myFinDone || !S.myFinAt) return; S.myFinDone = true;
    const me = S.race?.info.get(S.myCar); if (!me) return;
    const pos = S.myFinPos || 0, tn = S.track?.name || "Scribble track";
    const rec = buildReplay({ from: S.myFinAt - 18000, focus: me.name, title: `Your finish · P${pos} · ${tn}` });
    if (!rec) return;
    S.lastMyFinish = rec; $("myFinishBtn").classList.remove("hidden");
    try {
      const bytes = await packReplay(rec, 450e3);
      let list = [{ id: Date.now().toString(36), title: rec.title, at: Date.now(), pos, cars: rec.cars.length, size: bytes.length, data: b64(bytes) }, ...myFinishes()].slice(0, 3);
      for (;;) { try { localStorage.setItem("tb-finishes", JSON.stringify(list)); break; } catch (e) { if (list.length <= 1) break; list = list.slice(0, -1); } }
    } catch (e) {}
  }
  $("myFinishBtn").addEventListener("click", () => { if (S.lastMyFinish) playReplay(S.lastMyFinish); });
  function renderMyFinishes() {
    const box = $("myFinishList"); box.textContent = "";
    const list = myFinishes(); if (!list.length) return;
    box.appendChild(el("h3", "hub-h", "🏁 Your last 3 finishes"));
    for (const r of list) {
      const row = el("div", "friend"), tx = el("div");
      tx.append(el("b", "", r.title || "Your finish"), el("small", "", `${new Date(r.at).toLocaleString()} · ${r.cars} cars`));
      const bs = el("div", "sec-row");
      const w = el("button", "btn go", "Watch"); w.type = "button"; w.addEventListener("click", () => { $("replayBox").classList.add("hidden"); openSavedBytes(unb64(r.data)); });
      const sv = el("button", "btn", "💾 Keep"); sv.type = "button"; sv.title = "Keep it in your saved replays for good";
      sv.addEventListener("click", async () => { try { saveReplay(JSON.parse(await gunzip(unb64(r.data)))); renderReplayList(); } catch (e) { popup("Couldn't open it", true); } });
      bs.append(w, sv); row.append(el("span", "fdot on"), tx, bs); box.appendChild(row);
    }
    box.appendChild(el("h3", "hub-h", "💾 Saved replays"));
  }
  $("replaysBtn").addEventListener("click", () => { renderMyFinishes(); $("replayBox").classList.remove("hidden"); $("replayNote").textContent = "Save the end of a race from the results screen (💾), or watch one a friend shared with you."; renderReplayList(); });
  $("replayBoxClose").addEventListener("click", () => $("replayBox").classList.add("hidden"));
  $("replayBox").addEventListener("click", (e) => { if (e.target.id === "replayBox") $("replayBox").classList.add("hidden"); });
  $("replayCodeForm").addEventListener("submit", (e) => { e.preventDefault(); const v = $("replayCodeIn").value.trim().toUpperCase(); if (v.length < 6) return; $("replayNote").textContent = "Loading..."; socket.emit("replay:get", v); });
  $("replaySave").addEventListener("click", () => saveReplay(S.replayRec || buildReplay()));
  $("replayShare").addEventListener("click", () => shareReplay(S.replayRec || buildReplay()));
  $("replaySaveRes").addEventListener("click", () => saveReplay(buildReplay()));
  $("replayShareRes").addEventListener("click", () => shareReplay(buildReplay()));
  // play a saved/shared replay: swap its track and cars in, put everything back afterwards
  function playReplay(rec) {
    if (!rec || !rec.track || !Array.isArray(rec.frames) || rec.frames.length < 2) return popup("That replay couldn't be opened", true);
    if (S.replaying) stopReplay();
    S.replayPrev = { track: S.track, race: S.race, geo: S.geo, screen: S.screen, myCar: S.myCar };
    S.replayRec = rec;
    S.track = rec.track; S.geo = buildGeo(rec.track); resetTiles();
    S.race = { laps: 0, raceNo: 0, speed: rec.speed || 1, info: new Map(rec.cars.map((c) => [c.id, c])), fog: !!rec.fog, saved: true };
    S.myCar = null;
    const t0 = rec.frames[0].t, sp = rec.speed || 1;
    const clip = rec.frames.map((f) => ({ at: ((f.t - t0) / sp) * 1000, st: { t: f.t, phase: "race", cars: f.c, standings: f.s, gaps: [], fastest: 0, sc: 0, ql: -1, paused: false, weather: { raining: !!f.r, wet: f.w || 0, trend: 0, dyn: false } } }));
    runClip(clip, rec.winner, rec.title || "Replay");
  }

  // ======================= Photo mode =======================
  const PH = { on: false, x: 0, y: 0, z: 1, rot: 0, names: false, ptrs: new Map(), paused: false };
  function photoMode(on) {
    if (!!on === PH.on) return;
    if (on) {
      if (S.screen !== "race") return;
      PH.on = true; S.photoOn = true; PH.x = cam.x; PH.y = cam.y; PH.z = cam.z; PH.rot = 0;
      document.body.classList.add("photo-mode"); $("photoBar").classList.remove("hidden");
      // on your own in a normal room? then the race really pauses while you take pictures
      if (S.host && S.lobby?.players?.length === 1 && !S.replaying && S.phase === "race" && !S.paused) { PH.paused = true; socket.emit("pause", true); }
      else if (!S.replaying) popup("📷 The race keeps going while you take pictures", false);
    } else {
      PH.on = false; S.photoOn = false; PH.ptrs.clear();
      document.body.classList.remove("photo-mode"); $("photoBar").classList.add("hidden");
      if (PH.paused) { PH.paused = false; socket.emit("pause", false); }
    }
  }
  const zoomPhoto = (k) => { PH.z = clamp(PH.z * k, 0.15, 4); };
  $("photoBtn").addEventListener("click", () => photoMode(true));
  $("replayPhoto").addEventListener("click", () => photoMode(true));
  $("photoExit").addEventListener("click", () => photoMode(false));
  $("photoIn").addEventListener("click", () => zoomPhoto(1.25));
  $("photoOut").addEventListener("click", () => zoomPhoto(0.8));
  $("photoRot").addEventListener("click", () => { PH.rot = (PH.rot + Math.PI / 12) % (Math.PI * 2); });
  $("photoHud").addEventListener("click", () => { PH.names = !PH.names; $("photoHud").setAttribute("aria-pressed", String(PH.names)); });
  $("photoSnap").addEventListener("click", () => {
    const out = document.createElement("canvas"); out.width = view.width; out.height = view.height;
    const c = out.getContext("2d"); c.drawImage(view, 0, 0);
    const k = scr.dpr || 1; c.font = `${Math.round(18 * k)}px 'Russo One', sans-serif`; c.textAlign = "right"; c.textBaseline = "bottom";
    c.fillStyle = "rgba(0,0,0,0.45)"; c.fillText("Scribble GP", out.width - 14 * k + 1, out.height - 12 * k + 1); c.fillStyle = "rgba(255,255,255,0.85)"; c.fillText("Scribble GP", out.width - 14 * k, out.height - 12 * k);
    out.toBlob((b) => {
      if (!b) return popup("Couldn't take the picture", true);
      const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = `scribble-gp-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.png`;
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      const fl = $("flash"); fl.classList.remove("snap"); void fl.offsetWidth; fl.classList.add("snap"); sfx("tick");
      popup("📸 Saved to your downloads!");
    }, "image/png");
  });
  view.addEventListener("pointerdown", (e) => { if (!PH.on) return; PH.ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); view.setPointerCapture?.(e.pointerId); });
  view.addEventListener("pointermove", (e) => {
    if (!PH.on || !PH.ptrs.has(e.pointerId)) return;
    const p = PH.ptrs.get(e.pointerId), dx = e.clientX - p.x, dy = e.clientY - p.y;
    if (PH.ptrs.size >= 2) {
      const [a, b] = [...PH.ptrs.values()], d0 = Math.hypot(a.x - b.x, a.y - b.y);
      p.x = e.clientX; p.y = e.clientY;
      const [a2, b2] = [...PH.ptrs.values()], d1 = Math.hypot(a2.x - b2.x, a2.y - b2.y);
      if (d0 > 10) zoomPhoto(d1 / d0);
      return;
    }
    p.x = e.clientX; p.y = e.clientY;
    const cs = Math.cos(-PH.rot), sn = Math.sin(-PH.rot);
    PH.x -= (dx * cs - dy * sn) / PH.z; PH.y -= (dx * sn + dy * cs) / PH.z;
  });
  const dropPtr = (e) => PH.ptrs.delete(e.pointerId);
  view.addEventListener("pointerup", dropPtr); view.addEventListener("pointercancel", dropPtr);
  view.addEventListener("wheel", (e) => { if (!PH.on) return; e.preventDefault(); zoomPhoto(e.deltaY < 0 ? 1.1 : 0.9); }, { passive: false });
  window.addEventListener("keydown", (e) => {
    if (/INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName || "")) return;
    if (e.code === KEY("photo") && !e.repeat && S.screen === "race") { e.preventDefault(); photoMode(!PH.on); }
    else if (e.key === "Escape" && PH.on) photoMode(false);
  });

  // ======================= Night and fog =======================
  // Night: the whole screen goes dark except where headlights (and a little glow round each car) reach.
  // Both are drawn from pictures made once (not new gradients every frame), and the dark layer is half size:
  // it's soft anyway, and that keeps night and fog races as smooth as the others.
  let nightCv = null, coneSp = null, glowSp = null, fogSp = null, fogKey = "", blobSp = null, blobCol = "";
  const sprite = (w, h, paint) => { const cv = document.createElement("canvas"); cv.width = w; cv.height = h; paint(cv.getContext("2d")); return cv; };
  function nightSprites() {
    if (coneSp) return;
    // a headlight beam pointing right from (0, 130): fully clear near the car, fading out by 330px
    coneSp = sprite(380, 260, (c) => {
      const g = c.createRadialGradient(20, 130, 10, 20, 130, 330);
      g.addColorStop(0, "rgba(0,0,0,1)"); g.addColorStop(0.55, "rgba(0,0,0,0.75)"); g.addColorStop(1, "rgba(0,0,0,0)");
      c.fillStyle = g; c.beginPath(); c.moveTo(16, 121); c.lineTo(330, 5); c.quadraticCurveTo(372, 130, 330, 255); c.lineTo(16, 139); c.closePath(); c.fill();
    });
    glowSp = sprite(128, 128, (c) => { const r = c.createRadialGradient(64, 64, 8, 64, 64, 58); r.addColorStop(0, "rgba(0,0,0,0.9)"); r.addColorStop(1, "rgba(0,0,0,0)"); c.fillStyle = r; c.fillRect(0, 0, 128, 128); });
  }
  function duskLevel() {
    const L = S.race?.laps || 1, lead = S.cars.get(S.standings?.[0]), N = S.track?.N || 1;
    if (!lead) return 0;
    const f = (Math.max(0, lead.laps) + (lead.idx || 0) / N) / L;
    const k = Math.min(1, Math.max(0, (f - 0.3) / 0.55)); return k * k * (3 - 2 * k);
  }
  function drawNight(w, h, dpr, z, shx, shy, th, fog, dark = 1) {
    nightSprites();
    const k = dpr * 0.5, W = Math.max(1, Math.round(w * k)), H = Math.max(1, Math.round(h * k));
    if (!nightCv) nightCv = document.createElement("canvas");
    if (nightCv.width !== W || nightCv.height !== H) { nightCv.width = W; nightCv.height = H; }
    const n = nightCv.getContext("2d");
    n.setTransform(1, 0, 0, 1, 0, 0); n.globalCompositeOperation = "copy";
    n.fillStyle = th.key === "neon" ? "rgba(8,4,26,0.5)" : `rgba(${dark < 1 ? "12,8,30" : "3,5,16"},${0.7 * dark})`; n.fillRect(0, 0, W, H);
    n.globalCompositeOperation = "destination-out";
    const rot = PH.on ? PH.rot : 0;
    n.setTransform(k * z, 0, 0, k * z, k * (w / 2 + shx), k * (h / 2 + shy));
    if (rot) n.rotate(rot);
    n.translate(-cam.x, -cam.y);
    const reach = Math.hypot(w, h) / 2 / z + 380;          // headlights reach ~330px: skip cars too far away to show
    for (const c of S.cars.values()) {
      if (c.x === undefined || Math.abs(c.x - cam.x) > reach || Math.abs(c.y - cam.y) > reach) continue;
      n.save(); n.translate(c.x, c.y); n.rotate(c.h);
      n.drawImage(coneSp, 0, -130); n.drawImage(glowSp, -64, -64);
      n.restore();
    }
    // the start/finish straight is floodlit
    const t = S.track;
    if (t?.pts?.length) { const p = t.pts[0]; n.drawImage(glowSp, p.x - 590, p.y - 590, 1180, 1180); }
    // night AND fog: the fog goes on this same half-size layer, so the screen is only covered once
    if (fog) { n.globalCompositeOperation = "source-over"; n.setTransform(k, 0, 0, k, 0, 0); drawFog(w, h, true, fog.now, fog.x, fog.y, n); }
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(nightCv, 0, 0, W, H, 0, 0, Math.round(w * dpr), Math.round(h * dpr)); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  // Fog: you can see the road around your car, then it fades into grey (darker at night). A few banks drift past.
  function drawFog(w, h, night, now, fx, fy, out = ctx) {
    const R = Math.min(w, h), col = night ? "46,50,62" : "196,202,208", key = `${Math.round(w)}x${Math.round(h)}|${col}`;
    if (key !== fogKey) {        // twice the screen size, clear in the middle: slid around to follow the car
      fogKey = key;
      fogSp = sprite(Math.round(w * 2), Math.round(h * 2), (c) => {
        const g = c.createRadialGradient(w, h, R * 0.12, w, h, R * 0.62);
        g.addColorStop(0, `rgba(${col},0)`); g.addColorStop(0.55, `rgba(${col},0.55)`); g.addColorStop(1, `rgba(${col},0.94)`);
        c.fillStyle = g; c.fillRect(0, 0, w * 2, h * 2);
      });
    }
    out.drawImage(fogSp, fx - w, fy - h);
    if (reducedMotion) return;
    if (blobCol !== col) { blobCol = col; blobSp = sprite(128, 128, (c) => { const b = c.createRadialGradient(64, 64, 0, 64, 64, 64); b.addColorStop(0, `rgba(${col},0.22)`); b.addColorStop(1, `rgba(${col},0)`); c.fillStyle = b; c.fillRect(0, 0, 128, 128); }); }
    const t = now / 1000;
    for (let i = 0; i < 6; i++) {
      const x = ((i * 0.37 + t * (0.012 + i * 0.004)) % 1.4 - 0.2) * w, y = (0.15 + ((i * 0.53) % 1) * 0.7) * h + Math.sin(t * 0.3 + i) * 30, r = R * (0.25 + (i % 3) * 0.08);
      out.drawImage(blobSp, x - r, y - r, r * 2, r * 2);
    }
  }

  // ======================= Main loop =======================
  let last = performance.now();
  function frame(now) {
    gfxTick(now - last, now);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (S.screen === "menu" || !$("menu").classList.contains("hidden")) drawPreview(now);
    if (S.screen === "race" || S.screen === "results") renderRace(dt, now);
    if (S.screen === "results") drawPodium(now);
    // watching the host draw: glide the line out smoothly instead of in jumps
    if (S.screen === "lobby" && !S.host && S.hostDraft && (S.hostShown || 0) < S.hostDraft.length) {
      const left = S.hostDraft.length - (S.hostShown || 0);
      S.hostShown = Math.min(S.hostDraft.length, (S.hostShown || 0) + Math.max(1, left * Math.min(1, dt / 0.07)));
      drawBoard();
    }
    requestAnimationFrame(frame);
  }
  resize();
  requestAnimationFrame(frame);
})();
