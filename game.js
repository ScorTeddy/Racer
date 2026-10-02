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
    { key: "track", label: "Soundtrack", hint: "Auto: calmer songs in the menus, fast ones in the race. Music by Kevin MacLeod (incompetech.com), CC BY 3.0", def: "auto", opts: [["auto", "Auto"], ["shuffle", "Shuffle all"], ["race", "Race songs only"]] },
    { key: "engine", label: "Engine sound", hint: "A hum that follows your car's speed", def: "on", opts: [["on", "On"], ["off", "Off"]] },
    { key: "units", label: "Speed units", def: "kmh", opts: [["kmh", "km/h"], ["mph", "mph"]] },
    { key: "zoom", label: "Camera zoom", def: "normal", opts: [["close", "Close"], ["normal", "Normal"], ["far", "Far"]] },
    { key: "cam", label: "Camera follows", hint: "Tab also switches who you're watching", def: "me", opts: [["me", "My car"], ["leader", "Leader"]] },
    { key: "names", label: "Name tags", def: "all", opts: [["all", "All"], ["mine", "Mine"], ["off", "Off"]] },
    { key: "fx", label: "Smoke and dust", def: "high", opts: [["high", "High"], ["low", "Low"], ["off", "Off"]] },
    { key: "boardScenery", label: "Drawing board look", hint: "How much scenery shows on the board while you draw (the race always gets the full thing)", def: "light", opts: [["off", "Clean"], ["light", "Light"], ["full", "Full"]] },
    { key: "scenery", label: "Scenery", hint: "Buildings, trees and props around the track (turn off on slow devices)", def: "on", opts: [["on", "On"], ["off", "Off"]] },
    { key: "skids", label: "Skid marks", def: "on", opts: [["on", "On"], ["off", "Off"]] },
    { key: "lines", label: "Speed lines", def: "on", opts: [["on", "On"], ["off", "Off"]] },
    { key: "shake", label: "Screen shake", def: "on", opts: [["on", "On"], ["off", "Off"]] },
    { key: "minimap", label: "Minimap", def: "on", opts: [["on", "On"], ["off", "Off"]] },
    { key: "raceline", label: "Show racing line", hint: "The line the drivers try to follow", def: "off", opts: [["on", "On"], ["off", "Off"]] },
    { key: "theme", label: "Menu theme", def: "dark", opts: [["dark", "Dark"], ["light", "Light"]] },
    { key: "motion", label: "Reduce motion", def: "system", opts: [["system", "Device"], ["on", "On"], ["off", "Off"]] },
    // ---- Assists tab: things done for you in the race ----
    { tab: "assists", key: "asPit", label: "🔧 Pit assist", hint: "Calls your pit stops for you (worn tires, rain, damage) and picks the tires, like the AI strategists do. You can still box yourself.", def: "off", opts: [["on", "On"], ["off", "Off"]] },
    { tab: "assists", key: "asBoost", label: "⚡ Boost assist", hint: "Fires your boost for you on the straights, saving some for fights. Holding the boost key still works too.", def: "off", opts: [["on", "On"], ["off", "Off"]] },
    { tab: "assists", key: "asDrs", label: "🟩 DRS assist", hint: "Opens DRS the moment it's available, so you never miss it.", def: "off", opts: [["on", "On"], ["off", "Off"]] },
  ];
  // ---- keybinds (Settings > Keybinds): every race key can be changed ----
  const KEY_ACTIONS = [
    ["boost", "⚡ Boost (hold) · start reaction", "Space"], ["boost2", "⚡ Boost, second key", "KeyN"], ["drs", "🟩 Open DRS", "KeyD"],
    ["box", "🔧 Box this lap", "KeyB"], ["cards", "🃏 Upgrade cards", "KeyU"], ["photo", "📷 Photo mode", "KeyK"],
    ["pause", "⏸ Pause race (host)", "KeyP"], ["spectate", "👀 Watch the next car", "Tab"], ["settings", "⚙ Settings", "KeyO"],
  ];
  const KEY_DEFAULTS = Object.fromEntries(KEY_ACTIONS.map(([a, , k]) => [a, k]));
  const settings = {};
  for (const x of SETTINGS) settings[x.key] = x.def;
  try { Object.assign(settings, JSON.parse(localStorage.getItem("tb-settings") || "{}")); } catch (e) {}
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
    if (MUS && MUS.started) { setMusicVolume(); if (MUS.lastTrack !== settings.track || (!MUS.el && musicVol() > 0)) { MUS.lastTrack = settings.track; pickMusic(true); } }
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
        sk.addEventListener("click", () => { MUS.started = true; pickMusic(true); });
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
    set("#boxBtn kbd, #mustBox kbd", "box"); set("#photoBtn kbd", "photo"); set("#pauseBtn kbd", "pause"); set("#drsGo kbd", "drs"); set("#laterBtn kbd", "cards");
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
  ].map((x) => ({ ...KM, ...x, url: IA + encodeURIComponent(x.file) }));
  var MUS = { el: null, list: BUILTIN.slice(), cur: null, started: false, now: "", recent: [] };
  fetch("music/music.json").then((r) => (r.ok ? r.json() : [])).then((list) => {
    if (!Array.isArray(list)) return;
    for (const x of list) if (x && x.file) MUS.list.push({ title: String(x.title || x.file), artist: String(x.artist || ""), license: String(x.license || ""), mood: x.mood || "any", url: "music/" + String(x.file).replace(/^\/+/, "") });
  }).catch(() => {});
  function stopMusic() { if (MUS.el) { MUS.el.pause(); MUS.el = null; } MUS.cur = null; }
  function setMusicVolume() { if (MUS.el) MUS.el.volume = Math.max(0, Math.min(1, musicVol())); if (musicVol() <= 0) stopMusic(); }
  function playTrack(tr) {
    if (musicVol() <= 0) { stopMusic(); return; }
    stopMusic();
    const el2 = new Audio(); el2.preload = "auto"; el2.src = tr.url; el2.volume = Math.min(1, musicVol());
    el2.addEventListener("ended", () => { if (MUS.el === el2) pickMusic(true); });
    el2.addEventListener("error", () => { if (MUS.el === el2) { MUS.bad = (MUS.bad || 0) + 1; if (MUS.bad < 4) setTimeout(() => pickMusic(true), 800); } });
    el2.play().then(() => { MUS.bad = 0; }).catch(() => {});
    MUS.el = el2; MUS.cur = tr; MUS.now = `${tr.title} · ${tr.artist}${tr.license ? " (" + tr.license + ")" : ""}`;
    MUS.recent = [tr.url, ...MUS.recent].slice(0, 5);
    const np = document.getElementById("nowPlaying"); if (np) np.textContent = "♪ " + MUS.now;
    if (S.screen !== "race") popup(`♪ ${tr.title} · ${tr.artist}`);
  }
  // which song fits right now (menu / race / results), never the same one twice in a row
  function pickMusic(force) {
    if (!MUS.started) return;
    if (musicVol() <= 0) { stopMusic(); return; }
    const mood = settings.track === "race" ? "race" : S.screen === "race" ? "race" : S.screen === "results" ? "results" : "menu";
    const pool = MUS.list.filter((x) => settings.track === "shuffle" || x.mood === mood || x.mood === "any");
    if (!force && MUS.cur && pool.includes(MUS.cur) && MUS.el && !MUS.el.paused) return;
    const fresh = pool.filter((x) => !MUS.recent.includes(x.url));
    const from = fresh.length ? fresh : pool;
    if (from.length) playTrack(from[Math.floor(Math.random() * from.length)]);
  }
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
    o.connect(g).connect(a.destination); o.start(t0); o.stop(t0 + dur + 0.02);
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
  function engineSound(speed, on, boost = false, near = null) {
    const want = on && settings.engine === "on" && fxVol() > 0;
    const a = want ? audio() : actx;
    if (!a) return;
    if (!engine && want) {
      const o1 = a.createOscillator(), o2 = a.createOscillator(), f = a.createBiquadFilter(), g = a.createGain();
      o1.type = "sawtooth"; o2.type = "sawtooth"; o2.detune.value = 7; f.type = "lowpass"; f.Q.value = 4; g.gain.value = 0;
      const g2 = a.createGain(); g2.gain.value = 0.55; o2.connect(g2).connect(f); o1.connect(f); f.connect(g).connect(a.destination);
      // boost: filtered noise, swept up while it's on
      const n = noise(a), bf = a.createBiquadFilter(), bg = a.createGain(); bf.type = "bandpass"; bf.Q.value = 1.2; bf.frequency.value = 900; bg.gain.value = 0;
      n.connect(bf).connect(bg).connect(a.destination); n.start();
      // other cars: one soft triangle hum, louder the closer they are
      const oo = a.createOscillator(), of = a.createBiquadFilter(), og = a.createGain(); oo.type = "triangle"; of.type = "lowpass"; of.frequency.value = 700; og.gain.value = 0;
      oo.connect(of).connect(og).connect(a.destination);
      o1.start(); o2.start(); oo.start();
      engine = { o1, o2, f, g, bf, bg, oo, og, wasBoost: false };
    }
    if (!engine) return;
    const t = a.currentTime, v = Math.max(0, speed);
    // 5 "gears": the pitch climbs within each one, then drops a little at the shift
    const gear = Math.min(4, Math.floor(v / 190)), inGear = (v - gear * 190) / 190;
    const base = 48 + gear * 14 + inGear * (70 - gear * 6) + (boost ? 12 : 0);
    engine.o1.frequency.setTargetAtTime(base, t, 0.06); engine.o2.frequency.setTargetAtTime(base / 2, t, 0.06);
    engine.f.frequency.setTargetAtTime(350 + v * 1.4 + (boost ? 500 : 0), t, 0.1);
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
      const col = X.glow === "rainbow" ? `hsl(${hueNow},100%,60%)` : X.glow === "galaxy" ? `hsl(${250 + 40 * Math.sin(t * 1.5)},95%,62%)` : X.glow === "aurora" ? `hsl(${150 + 60 * Math.sin(t)},95%,58%)` : X.glow;
      c.save(); c.globalAlpha = 0.55; c.shadowColor = col; c.shadowBlur = 16; c.fillStyle = col;
      rrect(c, -L / 2 - 2, -Wd / 2 - 3, L + 4, Wd + 6, 9); c.fill(); c.restore();
    }
    c.fillStyle = "rgba(0,0,0,0.3)"; c.save(); c.translate(3, 4); bodyPath(c, X.body, L, Wd); c.fill(); c.restore();
    if (opts.trailPreview && X.trail) { for (let k = 0; k < 4; k++) trailShape(c, X.trail, -L / 2 - 10 - k * 11, (k % 2 ? 4 : -4), 4.5 - k * 0.6, 1 - k * 0.2, k); }
    if (opts.nitro || opts.flamePreview) {   // nitro boost: a long flame (blue, or the store colour)
      const fl = opts.flamePreview ? 30 : 22 + Math.random() * 16;
      c.fillStyle = X.flame === "rainbow" ? `hsl(${hueNow},100%,58%)` : X.flame === "plasma" ? `hsl(${Math.random() < 0.5 ? 285 : 190},100%,62%)` : X.flame || "#3aa0ff";
      c.beginPath(); c.moveTo(-L / 2, -7); c.lineTo(-L / 2 - fl, 0); c.lineTo(-L / 2, 7); c.fill();
      c.fillStyle = "#d8f3ff"; c.beginPath(); c.moveTo(-L / 2, -3.5); c.lineTo(-L / 2 - fl * 0.55, 0); c.lineTo(-L / 2, 3.5); c.fill();
    }
    if (opts.boost) {
      const fl = 14 + Math.random() * 12;
      c.fillStyle = "#ffb74d"; c.beginPath(); c.moveTo(-L / 2, -6); c.lineTo(-L / 2 - fl, 0); c.lineTo(-L / 2, 6); c.fill();
      c.fillStyle = "#fff"; c.beginPath(); c.moveTo(-L / 2, -3); c.lineTo(-L / 2 - fl * 0.5, 0); c.lineTo(-L / 2, 3); c.fill();
    }
    const B = X.body, open = B === "f1" || B === "kart";
    if (!open) {
      c.fillStyle = "#16171a";
      for (const wx of [-L * 0.3, L * 0.28]) for (const wy of [-1, 1]) c.fillRect(wx - 6, wy * (Wd / 2) - 4, 12, 8);
      if (X.rims) { c.fillStyle = X.rims; for (const wx of [-L * 0.3, L * 0.28]) for (const wy of [-1, 1]) c.fillRect(wx - 3, wy * (Wd / 2) - 2.2, 6, 4.4); }
    } else {
      // open-wheel cars: big wheels out in the air
      const wl = B === "f1" ? [[L * 0.33, Wd / 2 - 1, 11, 7], [-L * 0.32, Wd / 2 - 1, 12, 8]] : [[L * 0.24, Wd * 0.4, 8, 6], [-L * 0.24, Wd * 0.4, 8, 6]];
      for (const [wx, wy, ww, wh] of wl) for (const sg of [-1, 1]) {
        c.fillStyle = "#141518"; rrect(c, wx - ww / 2, sg * wy - wh / 2, ww, wh, 2); c.fill();
        c.fillStyle = X.rims || "#7b818a"; c.fillRect(wx - ww * 0.22, sg * wy - wh * 0.28, ww * 0.44, wh * 0.56);
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
    if (X.helmet || open) { const hc = X.helmet === "rainbow" ? `hsl(${hueNow},90%,60%)` : X.helmet || "#f5f5f5"; c.fillStyle = hc; c.beginPath(); c.arc(open ? -2 : 0, 0, 4.6, 0, Math.PI * 2); c.fill(); c.fillStyle = "rgba(0,0,0,0.55)"; c.fillRect((open ? -2 : 0) + 1.5, -3, 2, 6); }
    if (X.wing && !open) {                    // store: rear wing
      const wc = darken(car.color, 0.45);
      if (X.wing === "card") { c.save(); c.rotate(0.12); c.fillStyle = "#b08850"; c.fillRect(-L / 2 - 5, -Wd / 2 - 1, 6, Wd + 2); c.strokeStyle = "#7c5c32"; c.lineWidth = 0.8; c.strokeRect(-L / 2 - 5, -Wd / 2 - 1, 6, Wd + 2); c.restore(); }
      else if (X.wing === "swan") { c.fillStyle = "#15161a"; c.fillRect(-L / 2 + 1, -5, 2, 2); c.fillRect(-L / 2 + 1, 3, 2, 2); c.fillStyle = wc; c.fillRect(-L / 2 - 6, -Wd / 2 - 3, 4, Wd + 6); c.fillStyle = "rgba(255,255,255,0.35)"; c.fillRect(-L / 2 - 5.5, -Wd / 2 - 2.5, 1, Wd + 5); }
      else if (X.wing === "carbon" || X.wing === "gold") {
        c.fillStyle = "#15161a"; c.fillRect(-L / 2 - 4, -Wd / 2 - 3, 2.5, 5); c.fillRect(-L / 2 - 4, Wd / 2 - 2, 2.5, 5);
        if (X.wing === "gold") { const gg = c.createLinearGradient(0, -Wd / 2 - 3, 0, Wd / 2 + 3); gg.addColorStop(0, "#8a6212"); gg.addColorStop(0.5, "#fff1b8"); gg.addColorStop(1, "#b8860b"); c.fillStyle = gg; c.fillRect(-L / 2 - 3, -Wd / 2 - 3, 4.5, Wd + 6); }
        else { for (let j = 0; j < Wd + 6; j += 1.5) { c.fillStyle = Math.floor(j / 1.5) % 2 ? "#26292e" : "#131417"; c.fillRect(-L / 2 - 3, -Wd / 2 - 3 + j, 4.5, 1.5); } c.fillStyle = "#e11d48"; c.fillRect(-L / 2 - 3, -1, 4.5, 2); }
      }
      else if (X.wing === "duck") { c.fillStyle = wc; rrect(c, -L / 2 - 1, -Wd / 2 + 2, 4, Wd - 4, 2); c.fill(); }
      else {
        const decks = X.wing === "twin" ? [-L / 2 - 3, -L / 2 + 2] : [-L / 2 - 2];
        c.fillStyle = "#15161a"; c.fillRect(-L / 2 - 4, -Wd / 2 - 3, 2.5, 5); c.fillRect(-L / 2 - 4, Wd / 2 - 2, 2.5, 5);
        for (const dx of decks) { c.fillStyle = wc; c.fillRect(dx, -Wd / 2 - 2.5, 3.5, Wd + 5); c.fillStyle = "rgba(255,255,255,0.35)"; c.fillRect(dx + 0.5, -Wd / 2 - 2, 1, Wd + 4); }
      }
    }
    // number
    const NP = { gold: ["#ffcc1f", "#1b1400"], black: ["#111", "#fff"], neon: ["#0b0d18", "#22e6ff"], beige: ["#d8ccb0", "#4a3f2e"], red: ["#e53935", "#fff"], rainbow: [`hsl(${hueNow},90%,60%)`, "#111"], blue: ["#1e63d6", "#fff"], chrome: ["#dfe6ee", "#1b1f26"], holo: [`hsl(${(hueNow * 1.5) % 360},85%,72%)`, "#0b0d18"] }[X.num] || ["#fff", "#111"];
    const nx = B === "f1" ? 11 : B === "kart" ? 9 : -14, nr = open ? 5 : 7;
    c.fillStyle = NP[0]; c.beginPath(); c.arc(nx, 0, nr, 0, Math.PI * 2); c.fill();
    if (X.num === "neon") { c.strokeStyle = "#22e6ff"; c.lineWidth = 1.5; c.stroke(); }
    c.save(); c.translate(nx, 0); c.rotate(Math.PI / 2); if (open) c.scale(0.75, 0.75);
    c.fillStyle = NP[1]; c.font = "700 9px 'Chakra Petch', sans-serif"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(String(car.number ?? ""), 0, 0.5);
    c.restore();
    if (car.dmg > 0.08) drawDamage(c, car.dmg, car.id || 1, L, Wd, X.body);
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
    else if (B === "lmp") {   // endurance prototype: long pointed nose, big front fenders, wide tail
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
      case "skull": c.fillStyle = "#f2f2f2"; c.beginPath(); c.arc(1, 0, 4.4, 0, Math.PI * 2); c.fill(); c.fillRect(-4.6, -2.6, 3, 5.2);
        c.fillStyle = "#111"; c.beginPath(); c.arc(2, -1.7, 1.2, 0, Math.PI * 2); c.arc(2, 1.7, 1.2, 0, Math.PI * 2); c.fill(); c.fillRect(-4, -1.6, 0.8, 0.8); c.fillRect(-4, 0.8, 0.8, 0.8); break;
      case "stripes": c.fillStyle = "rgba(255,255,255,0.92)"; c.fillRect(-L * 0.6, -3.2, L * 0.75, 2); c.fillRect(-L * 0.6, 1.2, L * 0.75, 2); break;
      case "dice": for (const [dx, dy, rot] of [[-2.5, -2.5, 0.3], [2.5, 2.5, -0.4]]) { c.save(); c.translate(dx, dy); c.rotate(rot); c.fillStyle = "#f5f5f5"; c.fillRect(-2.6, -2.6, 5.2, 5.2); c.fillStyle = "#e53935";
          for (const [px, py] of [[-1.3, -1.3], [0, 0], [1.3, 1.3]]) { c.beginPath(); c.arc(px, py, 0.6, 0, Math.PI * 2); c.fill(); } c.restore(); } break;
      case "smiley": c.fillStyle = "#ffd21f"; c.beginPath(); c.arc(0, 0, 4.8, 0, Math.PI * 2); c.fill(); c.fillStyle = "#111"; c.beginPath(); c.arc(1.6, -1.7, 0.8, 0, Math.PI * 2); c.arc(1.6, 1.7, 0.8, 0, Math.PI * 2); c.fill(); c.strokeStyle = "#111"; c.lineWidth = 0.8; c.beginPath(); c.arc(0, 0, 3, -1.1, 1.1); c.stroke(); break;
      case "wings": c.fillStyle = "rgba(255,255,255,0.92)"; for (const sg of [-1, 1]) { c.beginPath(); c.moveTo(0, sg * 1); c.quadraticCurveTo(-7, sg * 9, -12, sg * 10); c.quadraticCurveTo(-7, sg * 5, -4, sg * 1); c.fill(); } break;
    }
    c.restore();
  }
  // chest liveries (original designs), painted over the whole body
  function drawLivery(c, kind, base, L, Wd, hue) {
    const x0 = -L / 2, y0 = -Wd / 2;
    const lin = (stops, vert) => { const g = vert ? c.createLinearGradient(0, y0, 0, -y0) : c.createLinearGradient(x0, 0, -x0, 0); stops.forEach((col, i) => g.addColorStop(i / (stops.length - 1), col)); return g; };
    const R = seeded(kind.length * 97);
    switch (kind) {
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
      case "midnight": c.fillStyle = lin(["#0b1026", "#1e2a5a", "#0b1026"], true); c.fillRect(x0, y0, L, Wd); c.fillStyle = "#e2e8f0"; c.beginPath(); c.moveTo(-x0, -1.5); c.lineTo(x0 + L * 0.3, -3.5); c.lineTo(x0 + L * 0.3, 3.5); c.lineTo(-x0, 1.5); c.fill(); c.fillStyle = "#38bdf8"; c.fillRect(x0 + L * 0.25, -1, L * 0.5, 2); break;
    }
  }
  // store trails: little sparks / hearts / stars left behind the car
  function trailShape(c, kind, x, y, r, alpha, k) {
    c.save(); c.globalAlpha = Math.max(0, alpha); c.translate(x, y);
    if (kind === "hearts") {
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
  function refreshGarage() {
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
    c.save(); c.translate(W / 2, H / 2); c.scale(W / CAR_LEN, H / CAR_WID); drawCar(c, { color: prof.color, livery: prof.livery, number: numIn.value || prof.number }, 0, 0, 0, 1); c.restore();
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
    const spin = reducedMotion ? -0.35 : -0.35 + Math.sin(now / 900) * 0.25;
    drawCar(pctx, { color: prof.color, livery: prof.livery, number: numIn.value || prof.number, design: prof.design, extras: A.extras }, 150, 92, spin, 3.2, { trailPreview: true });
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
  function renderAcct() {
    const u = A.user;
    $("acctName").textContent = u ? u.name : "Playing as a guest";
    $("acctSub").textContent = u ? `${u.stats.races} races · ${u.stats.wins} wins · ${Object.keys(u.ach).length}/${A.catalog?.ach.length || "?"} achievements`
      : "Make an account to save your stats, earn coins and unlock car parts.";
    const av = $("acctAv"); av.textContent = "";
    if (u?.picture) { const im = document.createElement("img"); im.src = u.picture; im.alt = `${u.name}'s profile picture`; im.referrerPolicy = "no-referrer"; av.appendChild(im); } else av.textContent = u ? "🏎️" : "👤";
    $("acctCoins").classList.toggle("hidden", !u); $("acctCoins").textContent = `🪙 ${u ? u.coins : 0}`;
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
    if (u.token) { storeToken(u.token); delete u.token; }
    if (u.backup) { keepBackup(u.id, u.backup); delete u.backup; }
    if (!A.user || A.user.id !== u.id) { socket.emit("presets:get"); socket.emit("setPresets:get"); socket.emit("friends:get"); }
    A.user = u; renderAcct();
    if (!$("authBox").classList.contains("hidden")) { closeAuth(); popup(`Signed in as ${u.name}!`); }
    if (!$("hub").classList.contains("hidden")) renderHub();
  });
  socket.on("signedOut", () => { A.user = null; A.friends = null; try { localStorage.removeItem("tb-token"); } catch (e) {} renderAcct(); renderMenuFriends(); if (!$("hub").classList.contains("hidden")) renderHub(); });
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
  socket.on("achievement", (a) => {
    const d = document.createElement("div"); d.className = "ach-pop"; d.setAttribute("role", "status");
    const ic = document.createElement("span"); ic.className = "ic"; ic.textContent = a.icon;
    const tx = document.createElement("div"); const sm = document.createElement("small"); sm.textContent = a.secret ? `🤫 SECRET ACHIEVEMENT · +${a.coins.toLocaleString()} coins` : `Achievement unlocked · +${a.coins} coins`;
    const b = document.createElement("b"); b.textContent = a.name; tx.append(sm, b); d.append(ic, tx);
    if (a.secret) { d.classList.add("secret"); setTimeout(() => { banner(`🤫 SECRET: ${a.name}!`, "#ff3b8a"); sfx("win"); }, 200); }
    // queue them so several at once don't pile up
    const q = (A.popQ = (A.popQ || Promise.resolve()).then(() => new Promise((res) => { document.body.appendChild(d); sfx("level"); setTimeout(() => { d.remove(); res(); }, 4300); })));
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
    for (const [t, id] of [["stats", "hubStats"], ["ach", "hubAch"], ["store", "hubStore"], ["sec", "hubSec"], ["friends", "hubFriends"], ["lb", "hubLb"], ["pass", "hubPass"], ["ranked", "hubRanked"]]) $(id).classList.toggle("hidden", A.tab !== t);
    $("hubGuest").classList.toggle("hidden", !!u);
    $("hubTitle").textContent = u ? u.name : "Guest";
    $("achCount").textContent = A.catalog ? `${u ? A.catalog.ach.filter((a) => u.ach[a.id]).length : 0}/${A.catalog.ach.length}` : "";
    if (A.tab === "stats") renderStats(u); else if (A.tab === "ach") renderAchs(u); else if (A.tab === "sec") renderSec(u);
    else if (A.tab === "pass") renderPass(u); else if (A.tab === "ranked") renderRanked(u);
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
    box.appendChild(fbar);
    let shown = list.filter((a) => (f === "todo" ? !got[a.id] : f === "done" ? got[a.id] : f === "hard" ? a.coins >= 1000 : true));
    shown = shown.sort((x, y) => (f === "done" ? (got[y.id] || 0) - (got[x.id] || 0) : pctOf(y) - pctOf(x) || x.coins - y.coins));
    const g = el("div", "ach-grid");
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
    if (!shown.length) g.appendChild(el("p", "preset-note", f === "done" ? "Nothing unlocked yet. Go race!" : "All done here. Legend."));
    box.appendChild(g);
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
  const BOX_LOOK = { basic: ["📦", "#6b4a2f", "#9c6b3f"], mid: ["🧰", "#1e4b8f", "#4fa3ff"], legend: ["👑", "#7a4b00", "#ffcc1f"] };
  function itemPreview(it, w = 200, h = 110) {
    const cv = document.createElement("canvas"); cv.width = w; cv.height = h; cv.setAttribute("role", "img"); cv.setAttribute("aria-label", `Preview of your car with the ${it.name}`);
    drawCar(cv.getContext("2d"), { color: prof.color, livery: prof.livery, number: prof.number, design: it.slot === "livery" ? null : prof.design, extras: it.onlyBody ? { body: it.onlyBody, [it.slot]: it.look } : { [it.slot]: it.look } }, it.slot === "trail" || it.slot === "flame" ? w * 0.59 : w / 2, h / 2, 0, 2.3 * (w / 200), { trailPreview: it.slot === "trail", flamePreview: it.slot === "flame" });
    const c2 = cv.getContext("2d");
    if (it.slot === "smoke") { for (let k = 0; k < 5; k++) { c2.globalAlpha = 0.85 - k * 0.12; c2.fillStyle = it.look === "rainbow" ? `hsl(${k * 70},95%,65%)` : it.look === "stardust" ? ["#ffe278", "#fff", "#be8cff"][k % 3] : it.look; c2.beginPath(); c2.arc(w * 0.26 - k * 9, h / 2 + (k % 2 ? 8 : -8), 8 + k * 2, 0, Math.PI * 2); c2.fill(); } c2.globalAlpha = 1; }
    if (it.slot === "badge") { c2.font = `${Math.round(h * 0.3)}px sans-serif`; c2.textAlign = "center"; c2.textBaseline = "middle"; c2.fillText(it.look, w / 2, h * 0.16); }
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
    if (!F2) { box.appendChild(el("p", "preset-note", "Loading...")); return; }
    const person = (f, buttons) => {
      const d = el("div", "friend");
      const dot = el("span", "fdot" + (f.online ? " on" : "")); dot.title = f.online ? "Online" : "Offline";
      const tx = el("div"); tx.append(el("b", "", f.name), el("small", "", f.online ? `Online · ${f.where}` : "Offline"));
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
      b.push(["💬", "", () => openFriend(f, "chat")], ["🎁", "", () => openFriend(f, "gift")], ["🤝", "", () => openFriend(f, "trade")]);
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
      const b = document.createElement("b"); b.textContent = `${L.host}'s room`;
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
    $("menu").classList.toggle("hidden", screen !== "menu");
    $("lobby").classList.toggle("hidden", screen !== "lobby");
    document.body.classList.toggle("in-lobby", screen === "lobby");
    document.body.classList.toggle("in-race", screen === "race");
    if (typeof renderChat === "function") renderChat();
    $("hud").classList.toggle("hidden", screen !== "race");
    $("results").classList.toggle("hidden", screen !== "results");
    if (screen !== "race") { engineSound(0, false); $("weatherPill").classList.add("hidden"); if (S.photoOn) photoMode(false); }
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
      popup("Back! The update ended the race, but your room is back.", false);
    }
  });
  // keep the "come back here" note fresh (and remember the room so the host can rebuild it after an update)
  setInterval(() => { if (S.code) saveRejoin({ code: S.code, host: !!S.host, pub: !!S.lobby?.public, settings: S.lobby?.settings || null, stroke: S.host ? S.lobby?.stroke || null : null }); }, 5000);
  // ---- dropped connection / server restart: reconnect and take your car back ----
  socket.on("disconnect", () => { if (S.code && !S.idleKicked) { $("netVeil").classList.remove("hidden"); $("netMsg").textContent = S.restarting ? "🔧 The game is updating. Back in a minute..." : "📡 Connection lost. Reconnecting..."; } });
  socket.on("serverRestart", () => { S.restarting = true; if (S.code) { $("netVeil").classList.remove("hidden"); $("netMsg").textContent = "🔧 The game is updating. Back in a minute..."; } else popup("The game is updating: back in a minute!", true); });
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
    if (why === "expired" && rj) { saveProfile(); if (was) popup("Back! The update ended the race, but your room is back.", false); socket.emit("join", { code: rj.code, profile: prof }); return; }
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
  socket.on("toast", (t) => popup(t, true));
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
    RP.buf = []; S.replayRec = null; S.rankedRes = null; S.rankedRaced = !!r.ranked && !r.quali;
    S.race = { laps: r.laps, raceNo: r.raceNo, speed: r.speed || 1, info: new Map(r.cars.map((c) => [c.id, c])), fog: !!r.fog, ranked: !!r.ranked };
    S.rareCars = new Map(r.cars.filter((c) => c.rare).map((c) => [c.id, c.rare])); S.myRare = null;
    S.ghost = null; if (r.quali) setTimeout(() => { S.ghost = loadGhost(); if (S.ghost) popup(`👻 Your best lap here (${fmt(S.ghost.t)}) is out there as a ghost. Beat it!`); }, 300);
    if (!r.quali) { S.rival = S.pendingRival?.name || null; const rv = S.pendingRival; S.pendingRival = null; if (rv) setTimeout(() => { banner(`🎯 RIVAL: ${rv.name}`, "#ff6b61"); popup(`Your rival: ${rv.name} (${rv.pts} pts, you have ${rv.mine}). Beat them for +100 coins!`); }, 1500); }
    snaps.length = 0; rt = 0; S.geo = S.track ? buildGeo(S.track) : null; resetTiles();
    S.cars = new Map(); S.skids = []; S.particles = []; S.myCar = null; S.reacted = false; S.lightsOutAt = 0;
    S.box = false; S.order = "normal"; S.offer = null; S.camTarget = null; S.lastPos = 99;
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
      b.addEventListener("click", () => { S.startPick = k; socket.emit("compound", k); markPick(); sfx("tick"); });
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
  socket.on("lightsBegin", () => {
    clearInterval(tpTimer); $("tirePick").classList.add("hidden");
    const L = $("lights"); L.classList.remove("hidden"); L.querySelectorAll(".bulb").forEach((b) => b.classList.remove("on"));
  });
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
    sfx("light");
  });
  socket.on("lightsOut", () => { setTimeout(() => tut("boost"), 2500); });
  socket.on("lightsOut", () => {
    S.lightsOutAt = performance.now();
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
  function startReplay() {
    if (RP.buf.length < 30 || !S.race) return;
    const t0 = RP.buf[0].at;
    S.replayRec = null;
    runClip(RP.buf.map((m) => ({ at: m.at - t0, st: m.st })), S.lastResults?.rows?.[0]?.name, null);
  }
  // plays a list of {at: ms from the start, st: state} through the normal race view
  function runClip(clip, winnerName, savedTitle) {
    S.replaying = savedTitle ? "saved" : "live"; snaps.length = 0; rt = 0; S.cars = new Map(); S.particles = []; S.lapRef = null;
    document.body.classList.add("replaying", "spectating"); $("specBar").classList.add("hidden");
    show("race"); $("replayBar").classList.remove("hidden");
    $("replayTitle").textContent = savedTitle ? `🎬 ${savedTitle}` : "🎬 Replay: the last 30 seconds";
    $("replaySave").classList.toggle("hidden", !!savedTitle);
    const w = winnerName && [...S.race.info.values()].find((c) => c.name === winnerName);
    S.camTarget = w ? w.id : null; $("replayCam").textContent = `Follow: ${w ? w.name : "leader"}`;
    RP.timers = clip.map((m) => setTimeout(() => onState(m.st), m.at));
    RP.timers.push(setTimeout(stopReplay, clip[clip.length - 1].at + 1500));
  }
  function stopReplay() {
    if (!S.replaying) return;
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
    S.ql = st.ql ?? -1;
    if (!!st.paused !== !!S.paused) setPausedUi(!!st.paused, S.pausedBy);
    pushSnap(st);
    for (const a of st.cars) {
      const [id, x, y, h, speed, tire, laps, pits, pit, mistake, fin, slide, onTrack, boost, prog, best, comp, punct, surf, inPit, dmg, crashed, elev, vx, vy, idx, nitroOn, nitro, slip, ghost, drs] = a;
      let c = S.cars.get(id);
      if (!c) { c = { id, x, y, h, lvl: elev, ...S.race?.info.get(id) }; S.cars.set(id, c); }
      Object.assign(c, { speed, tire, laps, pits, pit, mistake, fin, slide, onTrack, boost, prog, best, comp: SHORT_TO_KEY[comp] || "inter", punct, surf, inPit, dmg, crashed, idx, nitroOn, nitro, slip, ghost, drs: drs === 2, drsAvail: drs === 1 });
    }
    lapDelta();
    if (S.tutorial) {            // tutorial hints that depend on your car
      const c = S.cars.get(S.myCar);
      if (c) { if (c.tire < 0.45 && !S.box) tut("pit"); if (S.tutPits !== undefined && c.pits > S.tutPits) tut("afterPit"); S.tutPits = c.pits; }
    }
    S.weather = st.weather;
    if (S.myCar) {
      const pos = S.standings.indexOf(S.myCar) + 1;
      if (pos && S.lastPos !== 99 && pos !== S.lastPos) { sfx(pos < S.lastPos ? "pass" : "lost"); const el = $("posText"); el.classList.remove("bump"); void el.offsetWidth; el.classList.add("bump"); }
      S.lastPos = pos;
    }
  }
  // my own team's numbers (XP, upgrades, tires, boost)
  socket.on("me", (m) => {

    S.xp = m; S.box = m.box; S.up = m.up; S.myComp = m.compound;
    if ((m.rare || null) !== (S.myRare || null)) { S.myRare = m.rare || null; renderGarage(); }
    renderPitPick(m);
    if (S.nextComp !== m.next) { S.nextComp = m.next; renderNextTires(); }
    updateBox();
  });
  socket.on("feed", (f) => {
    if (f.t === "rain") { banner("RAIN!", "#9ad0ff"); popup("It's raining! Slicks will slide. Think about Wets.", true); }
    if (f.t === "dry") { popup("The rain has stopped. The track will dry out.", false); }
    if (f.t === "lastLap") { banner("🏳️ FINAL LAP", "#fff"); sfx("level"); }
    if (f.t === "scOut") { banner("🚨 SAFETY CAR", "#ffcc1f"); sfx("tick"); }
    if (f.t === "scIn") { banner("🟢 GREEN FLAG!", "#3ecf6a"); sfx("level"); }
    if (f.t === "photo") setTimeout(() => banner("📸 PHOTO FINISH!", "#9ad0ff"), 2600);
    if (f.t === "crash" && S.track) {           // flying debris where it happened
      for (let k = 0; k < (f.big ? 40 : 20); k++) S.particles.push({ x: f.x, y: f.y, vx: (Math.random() - 0.5) * 420, vy: (Math.random() - 0.5) * 420, life: 0.6 + Math.random() * 0.4, age: 0, r: 2 + Math.random() * 3, color: ["#222", "#555", "#ffcc1f", "#fff"][k % 4] });
      if (Math.hypot((S.cars.get(S.myCar)?.x || 0) - f.x, (S.cars.get(S.myCar)?.y || 0) - f.y) < 700) addShake(f.big ? 10 : 5);
    }
    const txt = f.t === "crash" ? `💥 ${f.name} and ${f.other} crash${f.big ? " HARD" : ""}!` : f.t === "rain" ? "🌧 Rain is falling!" : f.t === "dry" ? "☀ The rain has stopped" : f.t === "pitSlow" ? `🔧 ${f.name}'s crew fumbles a wheel! +1s` : f.t === "puncture" ? `💥 ${f.name} has a puncture!` : f.t === "pit" ? `${f.name} pits` : f.t === "mistake" ? `${f.name} runs wide!` : f.t === "fastest" ? `Fastest lap: ${f.name} (${fmt(f.time)})` : f.t === "jump" ? `${f.name} jumped the start!` : f.t === "winner" ? `${f.name} takes the checkered flag!` : f.t === "retire" ? `${f.name} left the race (AI driving)` : f.t === "event" ? String(f.text || "") : f.t === "drs" ? "🟩 DRS enabled: within 1s of the car ahead at a zone = +7% top speed" : f.t === "scOut" ? "🚨 SAFETY CAR! No overtaking, the field bunches up" : f.t === "scIn" ? "🟢 Safety car in: GREEN FLAG, racing again!" : f.t === "lastLap" ? `🏳️ Final lap! ${f.name} leads` : f.t === "photo" ? `📸 Photo finish! ${f.name} beat ${f.other} by ${f.gap.toFixed(3)}s` : "";
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
  socket.on("results", (r) => { showResults(r); if (S.tutorial) setTimeout(() => tut("done"), 1600); });
  // checkered flag: camera cuts to the winner, fireworks, finish tags on everyone who crosses
  let fireworks = [];
  socket.on("feed", (f) => {
    if (f.t !== "winner") return;
    const w = [...S.cars.values()].find((c) => c.name === f.name);
    banner(`🏁 ${f.name} WINS!`, "#ffcc1f"); sfx("win");
    if (w) {
      S.camTarget = w.id; S.winnerCamUntil = performance.now() + 4000;
      if (!reducedMotion) for (let k = 0; k < 5; k++) setTimeout(() => fireworks.push({ x: w.x + (Math.random() - 0.5) * 300, y: w.y + (Math.random() - 0.5) * 220, t: performance.now(), hue: Math.floor(Math.random() * 360) }), k * 450);
    }
  });

  // ======================= Lobby =======================
  const board = $("board"), bctx = board.getContext("2d");
  const sel = { sLaps: "laps", sQuali: "quali", sAiLevel: "aiLevel", sAi: "ai", sMap: "map", sTheme: "theme", sSpeed: "speed", sWear: "wear", sTeamColors: "teamColors", sWeather: "weather", sTeams: "teams", sSeason: "season", sSafety: "safetyCar", sDrs: "drs", sRevGrid: "reverseGrid" };
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
    setTimeout(() => ($("copyBtn").textContent = "Copy invite link"), 1800);
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
    $("roomCode").textContent = l.code;
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
      $(id).value = key === "teamColors" || key === "teams" || key === "safetyCar" || key === "drs" || key === "reverseGrid" ? (s[key] ? "on" : "off") : String(s[key]);
      $(id).disabled = !S.host || l.phase !== "lobby";
    }
    $("smoothBtn").setAttribute("aria-pressed", String(!!s.smooth));
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
      arrows(false);
      for (const br of G.bridges) drawBridge(c, T, G, th, br);
      arrows(true);
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
    P.steps = []; if (S.track.reverse) P.steps.push(() => socket.emit("reverse"));
    S.draft = null; S.lastDraft = null; updateDraftUi();
    S.preview = pts; drawBoard();            // show it right away; the server's finished track replaces it in a moment
    socket.emit("track", { stroke: pts, map: S.lobby.settings.map });
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
  const UNDO = { stack: [], restoring: false, quiet: false };
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
        if (ev !== "track") S.lastDraft = null;          // (a finished drawing can only be "un-finished" right after)
        refreshUndo();
      }
      return rawEmit(ev, ...args);
    };
  }
  function refreshUndo() {
    const can = S.host && S.lobby?.phase === "lobby" && (!!S.draft || !!S.lastDraft || UNDO.stack.length > 0);
    $("undoTools").classList.toggle("hidden", !can);
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
    if (snap.empty) { UNDO.quiet = true; socket.emit("clearTrack"); UNDO.quiet = false; boardHint("Undone: the track is cleared again.", false); }
    else { UNDO.restoring = true; clearTimeout(UNDO.safety); UNDO.safety = setTimeout(() => (UNDO.restoring = false), 8000); loadPreset(snap); boardHint("↩️ Undone!", false); }
    sfx("tick"); refreshUndo();
  }
  $("trackUndo").addEventListener("click", undoAnything);
  socket.on("joined", () => { UNDO.stack = []; UNDO.restoring = false; refreshUndo(); });
  socket.on("trackResult", (r) => { if (UNDO.restoring && (r.error || !P.steps.length)) { UNDO.restoring = false; clearTimeout(UNDO.safety); } });
  socket.on("lobby", () => refreshUndo());
  function updateRedo() { $("redoPt").classList.toggle("hidden", !redoStack.length || !S.draft); }
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
  socket.on("emote", (m) => {
    if (localBlocked().includes(String(m.name).toLowerCase())) return;       // blocked: you don't see their emotes
    if (m.car && S.screen === "race") S.emotes.set(m.car, { e: m.e, until: performance.now() + 2600 });
    else popup(`${m.name}: ${m.e}`);
    if (m.pid !== S.me) sfx("tick");
  });
  // daily login reward
  socket.on("daily", (d) => { banner(`DAILY BONUS +${d.coins} 🪙`, "#ffcc1f"); popup(d.streak > 1 ? `🔥 ${d.streak}-day streak! Come back tomorrow for more.` : "Come back tomorrow for a bigger bonus!"); sfx("level"); });
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
    ctx.globalAlpha = 0.75; ctx.font = "700 12px 'Chakra Petch', sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "bottom"; ctx.fillStyle = "#cfe6ff"; ctx.fillText(`👻 best ${fmt(G.t)}`, x, y - 22);
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
        if (S.race?.quali && L.path?.length > 20) saveGhost(lapT, L.path);
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
  // ======================= Tutorial: a guided first race =======================
  const TUT = {
    lobby: ["👋 Welcome to Scribble GP!", "This is your room. Normally you draw a track here (or roll a random one) - we made one for you. You're the <b>team boss</b>: your AI driver steers, you make the calls. Press <b>Start race</b>!"],
    tires: ["🛞 Pick your starting tires", "<b>Fast</b> is quickest but wears out fast. <b>Durable</b> lasts longest but is slow. <b>Wets</b> are for rain. For your first race, <b>Intermediate</b> is a safe pick."],
    lights: ["🚦 Get a rocket start", "Watch the 5 red lights. Press <b>Space</b> (or tap the screen) the moment they go <b>out</b>. Too early = jump start!"],
    boost: ["⚡ Boost", "Hold <b>Space</b> (or the round Boost button on phones) on straights for extra speed. It refills every lap, a little every second, and +10% for every overtake. Run it dry and it's locked for 5 seconds, unless you overtake or cross the line. While it's on, you earn <b>1.5x upgrade XP</b>."],
    upgrade: ["⬆️ Level up!", "Your team earns XP while racing. Pick one of the cards (keys <b>1 / 2 / 3</b>) to upgrade your car or driver. They stack up during the race."],
    pit: ["🔧 Tires wearing out", "See the tire bar at the bottom? When it gets low the car slows down and can get a puncture. Press <b>B</b> (Box this lap) to pit for fresh tires - you choose which set on the way in."],
    afterPit: ["✅ Nice stop!", "Fresh tires! In longer races, timing your stops (and the weather) is how races are won. <b>Tab</b> watches other cars, <b>O</b> opens settings."],
    done: ["🏁 You're ready!", "That's everything you need. Try <b>⚡ Quick Play</b> to race real people, or <b>Make a room</b> and send the invite link to friends. Make an account to save your stats and earn coins!"],
  };
  function tut(step) {
    if (!S.tutorial || !TUT[step] || (S.tutSeen || (S.tutSeen = new Set())).has(step)) return;
    S.tutSeen.add(step);
    const [title, body] = TUT[step];
    $("tutTitle").textContent = title; $("tutBody").innerHTML = body;      // (our own fixed text, never player text)
    $("tutCard").classList.remove("hidden"); sfx("tick");
    clearTimeout(S.tutT); if (step !== "done" && step !== "lobby") S.tutT = setTimeout(() => $("tutCard").classList.add("hidden"), 14000);
    if (step === "done") { try { localStorage.setItem("tb-tut-done", "1"); } catch (e) {} S.tutorial = false; }
  }
  function startTutorial() {
    saveProfile(); S.solo = true; S.tutorial = true; S.tutSeen = new Set(); S.tutPits = undefined; S.tutSetup = true;
    socket.emit("create", prof);
  }
  $("tutNext").addEventListener("click", () => $("tutCard").classList.add("hidden"));
  $("tutQuit").addEventListener("click", () => { S.tutorial = false; $("tutCard").classList.add("hidden"); try { localStorage.setItem("tb-tut-done", "1"); } catch (e) {} });
  // set up the tutorial room: short, easy, dry, one random track
  socket.on("lobby", (l) => {
    if (!S.tutSetup || l.hostId !== S.me) return;
    S.tutSetup = false;
    socket.emit("settings", { laps: 3, ai: 3, aiLevel: "easy", speed: 1, weather: "sunny", quali: 0, wear: "high", theme: "grass", season: 0 });
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
    $("mustWhy").textContent = MUST_WHY[d.reason] + (d.reason === "tires" ? ` (${d.tire}% left)` : "");
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
      const tm = document.createElement("span"); tm.textContent = r.best === null ? "no lap" : i === 0 ? fmt3(r.best) : `+${r.gap.toFixed(3)}`;
      li.append(pp, dot, nm, tm); ol.appendChild(li);
    });
    $("qualiBox").classList.remove("hidden"); $("mustPit").classList.add("hidden"); setPausedUi(false);
    const mine = q.rows.findIndex((r) => r.owner === S.me);
    if (mine === 0) { banner("POLE POSITION!", "#ffcc1f"); sfx("win"); }
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
    if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === "y" || (e.shiftKey && e.key.toLowerCase() === "z"))) { e.preventDefault(); redoDraft(); return; }
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
        b.addEventListener("click", () => { socket.emit("compound", k); S.nextComp = k; renderNextTires(); markPitPick(); sfx("tick"); });
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
  function pickCard(i) {
    if (!S.offer || !S.offer.cards[i]) return;
    socket.emit("pick", i);
    [...$("cardRow").children].forEach((c, j) => c.classList.add(j === i ? "chosen" : "gone"));
    S.offer = null; const seq = offerSeq;
    setTimeout(() => { if (seq === offerSeq) hideCards(); }, 340);
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
  function banner(text, color) { const b = $("banner"); b.textContent = text; b.style.color = color || "#fff"; b.classList.remove("show"); void b.offsetWidth; b.classList.add("show"); }
  function popup(text, warn) {
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
  $("replayExit").addEventListener("click", stopReplay);
  $("replayCam").addEventListener("click", () => {
    const ids = S.standings; if (!ids.length) return;
    const cur = Math.max(0, ids.indexOf(S.camTarget ?? ids[0])); S.camTarget = ids[(cur + 1) % ids.length];
    const c = S.cars.get(S.camTarget); $("replayCam").textContent = `Follow: ${c?.name || "?"}`;
  });
  function showResults(r) {
    S.lastResults = r; $("replayBtn").classList.toggle("hidden", RP.buf.length < 30);
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
    if (mine >= 0) { const s = document.createElement("span"); s.textContent = "P" + (mine + 1); $("resTitle").append(s); }
    const body = $("resBody"); body.textContent = "";
    r.rows.forEach((x, i) => {
      const tr = document.createElement("tr"); if (x.owner === S.me) tr.className = "me"; tr.style.animationDelay = (0.4 + i * 0.06) + "s";
      const td = (t, cls) => { const d = document.createElement("td"); d.textContent = t; if (cls) d.className = cls; return d; };
      const nm = td(""); const dot = document.createElement("span"); dot.className = "dot"; dot.style.background = x.color; nm.append(dot, `#${x.number} ${x.name}${r.dotd?.name === x.name ? " 🏆" : ""}${S.rival === x.name ? " 🎯" : ""}`);
      tr.append(td(i + 1), nm, td(x.team || ""), td(x.best ? fmt(x.best) : "--", "n"), td(x.pits, "n"), td("+" + x.pts, "n"));
      body.appendChild(tr);
    });
    // Driver of the Day (most places gained)
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
  function resize() {
    scr.dpr = Math.min(window.devicePixelRatio || 1, 2); scr.w = window.innerWidth; scr.h = window.innerHeight;
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
  let lastArrive = 0, jitter = 0.02, netDelay = 0.11;
  function pushSnap(st) {
    const now = performance.now() / 1000, mul = S.race?.speed || 1;
    if (snaps.length && st.t < snaps[snaps.length - 1].t - 0.001) snaps.length = 0;
    if (snaps.length && lastArrive) {
      const gap = now - lastArrive, want = (st.t - snaps[snaps.length - 1].t) / mul;
      jitter += (Math.min(0.4, Math.abs(gap - want)) - jitter) * 0.08;
      netDelay = clamp(0.07 + jitter * 2.8, 0.08, 0.35);
    }
    lastArrive = now;
    const m = new Map(); for (const a of st.cars) m.set(a[0], a);
    snaps.push({ t: st.t, cars: m });
    if (snaps.length > 16) snaps.shift();
  }
  function interpCars(dt) {
    if (!snaps.length) return;
    const mul = S.race?.speed || 1, last = snaps[snaps.length - 1], t = S.track;
    const want = last.t - netDelay * mul;
    // the display clock drifts toward where it should be by at most 12% (never a visible lurch)
    if (Math.abs(rt - want) > 0.6 * mul) rt = want;
    else rt += dt * mul * (1 + clamp(((want - rt) / mul) * 3, -0.12, 0.12));
    rt = Math.min(rt, last.t + 0.25 * mul);
    let a = snaps[0], b = snaps[0];
    for (let i = snaps.length - 1; i >= 0; i--) if (snaps[i].t <= rt) { a = snaps[i]; b = snaps[Math.min(snaps.length - 1, i + 1)]; break; }
    const D = b.t - a.t;
    for (const c of S.cars.values()) {
      const A = a.cars.get(c.id), Bq = b.cars.get(c.id);
      if (!Bq) continue;
      let x, y, teleport = false;
      if (!A || D < 1e-4) {
        const e = Math.max(0, Math.min(0.25 * mul, rt - b.t));
        x = Bq[1] + Bq[23] * e; y = Bq[2] + Bq[24] * e; c.h = Bq[3]; c.drawIdx = Bq[25];
      } else {
        const u = (rt - a.t) / D;
        c.drawIdx = u < 0.5 ? A[25] : Bq[25];
        teleport = Math.hypot(Bq[1] - A[1], Bq[2] - A[2]) > (Math.hypot(A[23], A[24]) + Math.hypot(Bq[23], Bq[24])) * D * 0.75 + 60;
        if (teleport) { x = Bq[1]; y = Bq[2]; c.h = Bq[3]; }
        else if (u >= 1) { const e = rt - b.t; x = Bq[1] + Bq[23] * e; y = Bq[2] + Bq[24] * e; c.h = Bq[3]; }
        else {
          const u2 = u * u, u3 = u2 * u, h1 = 2 * u3 - 3 * u2 + 1, h2 = -2 * u3 + 3 * u2, h3 = (u3 - 2 * u2 + u) * D, h4 = (u3 - u2) * D;
          x = h1 * A[1] + h2 * Bq[1] + h3 * A[23] + h4 * Bq[23];
          y = h1 * A[2] + h2 * Bq[2] + h3 * A[24] + h4 * Bq[24];
          c.h = A[3] + wrapAngle(Bq[3] - A[3]) * u;
        }
      }
      // If the target position suddenly jumps (a late update corrected it), don't pop: keep the
      // car where it was drawn and blend the correction in over a few frames.
      const vx = Bq[23] * mul, vy = Bq[24] * mul;
      if (c.tx0 !== undefined && !teleport) {
        const jx = x - (c.tx0 + vx * dt), jy = y - (c.ty0 + vy * dt);
        if (Math.hypot(jx, jy) > 1.5) { c.ex = (c.ex || 0) - jx; c.ey = (c.ey || 0) - jy; }
      }
      c.tx0 = x; c.ty0 = y;
      const k = Math.exp(-dt * 9);
      c.ex = (c.ex || 0) * k; c.ey = (c.ey || 0) * k;
      if (teleport || Math.hypot(c.ex, c.ey) > 160) c.ex = c.ey = 0;
      c.x = x + c.ex; c.y = y + c.ey;
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

  function renderRace(dt, now) {
    const { w, h, dpr } = scr, t = S.track;
    if (!t) return;
    const th = THEMES[t.theme] || THEMES.grass; th.key = t.theme;
    if (!PH.on) interpCars(dt);
    if (S.winnerCamUntil && performance.now() > S.winnerCamUntil) { S.winnerCamUntil = 0; S.camTarget = null; }
    let target = S.camTarget && S.cars.get(S.camTarget);
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
    // skid marks (painted into the tiles)
    if (settings.skids === "on" && S.phase === "race" && !PH.on) {
      for (const c of S.cars.values()) if (c.slide && c.lvl < 0.05 && !c.ghost) {
        const fx = Math.cos(c.h), fy = Math.sin(c.h);
        for (const s of [-1, 1]) addSkid(c.x - fx * 15 - fy * s * 10, c.y - fy * 15 + fx * s * 10);
      }
    }
    // dust + smoke
    const fxLevel = settings.fx === "off" ? 0 : settings.fx === "low" ? 0.35 : 1;
    if (S.phase === "race" && fxLevel && !PH.on) for (const c of S.cars.values()) {
      if (!visible(c, 200)) continue;
      if (c.surf === 3 && Math.abs(c.speed) > 40 && Math.random() < 0.8 * fxLevel) puff(c, "rgba(170,140,90,0.55)");
      else if (c.surf === 2 && Math.abs(c.speed) > 120 && Math.random() < 0.5 * fxLevel) puff(c, th.night ? "rgba(90,80,60,0.5)" : "rgba(110,120,60,0.4)");
      if (S.weather && S.weather.wet > 0.3 && c.speed > 220 && Math.random() < 0.45 * fxLevel * S.weather.wet) puff(c, "rgba(220,230,240,0.35)");
      if (c.dmg > 0.55 && Math.random() < 0.25 * Math.max(0.4, fxLevel)) puff(c, "rgba(60,60,60,0.45)");
      if (c.extras?.trail && c.speed > 250 && S.particles.length < 300 && Math.random() < 0.35 * Math.max(0.4, fxLevel)) {
        S.particles.push({ x: c.x - Math.cos(c.h) * 22, y: c.y - Math.sin(c.h) * 22, vx: (Math.random() - 0.5) * 50, vy: (Math.random() - 0.5) * 50, life: 0.7, age: 0, r: 7, shape: c.extras.trail, k: Math.floor(Math.random() * 4) });
      }
      if (c.punct && c.speed > 30 && Math.random() < 0.9 * fxLevel) {
        S.particles.push({ x: c.x - Math.cos(c.h) * 18, y: c.y - Math.sin(c.h) * 18, vx: (Math.random() - 0.5) * 160, vy: (Math.random() - 0.5) * 160, life: 0.25, age: 0, r: 2, color: Math.random() < 0.5 ? "#ffcc1f" : "#ff7043" });
      }
      if (c.slide && Math.random() < 0.35 * fxLevel) puff(c, smokeCol(c.extras?.smoke));
      if (c.mistake && Math.random() < 0.6 * fxLevel) puff(c, "rgba(240,240,240,0.6)");
      if (c.dmg > 0.05 && Math.random() < 0.25 * c.dmg) puff(c, "rgba(60,60,60,0.45)");
    }
    if (!PH.on) S.particles = S.particles.filter((q) => { q.age += dt; q.x += q.vx * dt; q.y += q.vy * dt; if (!q.shape) q.r += 20 * dt; return q.age < q.life; });
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
    // the safety car, gliding along in front of the leader with its lights flashing
    if (S.sc) {
      const d = S.scDraw || (S.scDraw = { x: S.sc[0], y: S.sc[1], h: S.sc[2] });
      const k = Math.min(1, dt * 6); d.x += (S.sc[0] - d.x) * k; d.y += (S.sc[1] - d.y) * k; d.h += wrapAng(S.sc[2] - d.h) * k;
      drawCar(ctx, { color: "#f2f2f2", livery: "split", number: "SC", extras: null }, d.x, d.y, d.h, 1.05, {});
      const on = Math.floor(performance.now() / 250) % 2;
      ctx.save(); ctx.translate(d.x, d.y); ctx.rotate(d.h);
      for (const [yy, col] of [[-5, on ? "#ffb020" : "#5a3a00"], [5, on ? "#5a3a00" : "#ffb020"]]) { ctx.fillStyle = col; ctx.shadowColor = "#ffb020"; ctx.shadowBlur = col === "#ffb020" ? 14 : 0; ctx.fillRect(-4, yy - 2.5, 6, 5); }
      ctx.restore();
    } else S.scDraw = null;
    drawGhost(ctx);
    const mineLast = (a, b) => (a.id === S.myCar) - (b.id === S.myCar);
    const drawOne = (c) => {
      if (!visible(c)) return;
      if (th.night) { ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.h); ctx.drawImage(headlight(), -30, -110); ctx.restore(); }
      if (c.ghost && !c.fin) ctx.globalAlpha = 0.5;
      if (c.lvl > 0.05) { ctx.fillStyle = "rgba(0,0,0,0.3)"; ctx.beginPath(); ctx.ellipse(c.x + 16 * c.lvl, c.y + 22 * c.lvl, 26, 15, c.h, 0, Math.PI * 2); ctx.fill(); }
      if (c.slip && settings.lines === "on" && !reducedMotion) {          // slipstream: wind streaks off the car
        ctx.strokeStyle = "rgba(200,230,255,0.55)"; ctx.lineWidth = 2;
        const fx = Math.cos(c.h), fy = Math.sin(c.h);
        for (const s of [-1, 1]) { const ox = -fy * s * 14, oy = fx * s * 14, L = 30 + Math.random() * 20; ctx.beginPath(); ctx.moveTo(c.x + ox + fx * 18, c.y + oy + fy * 18); ctx.lineTo(c.x + ox - fx * L, c.y + oy - fy * L); ctx.stroke(); }
      }
      drawCar(ctx, c, c.x, c.y, c.h, 1 + 0.14 * Math.min(2, c.lvl), { boost: c.boost, nitro: c.nitroOn, glow: c.id === S.myCar, aura: S.rareCars?.get(c.id) });
      ctx.globalAlpha = 1;
      if (c.fin) {
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
        const label = (pos ? `P${pos} ` : "") + (c.extras?.prest ? c.extras.prest + " " : "") + (c.extras?.badge ? c.extras.badge + " " : "") + (c.id === S.myCar ? `${c.name} (you)` : c.name) + (S.rival && c.name === S.rival ? " 🎯" : "");
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
    ground.sort(mineLast).forEach(drawOne);
    G.bridges.forEach((br, k) => { drawBridge(ctx, t, G, th, br); layers[k].sort(mineLast).forEach(drawOne); });
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
    if (S.weather && S.weather.wet > 0.02) {
      const wv = S.weather.wet;
      ctx.fillStyle = `rgba(30,45,70,${0.22 * wv})`; ctx.fillRect(0, 0, w, h);
      if (S.weather.raining && !reducedMotion) {
        ctx.strokeStyle = "rgba(200,215,235,0.45)"; ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let k = 0; k < 160 * wv; k++) { const rx = Math.random() * w, ry = Math.random() * h; ctx.moveTo(rx, ry); ctx.lineTo(rx - 6, ry + 20); }
        ctx.stroke();
      }
    }
    const fogX = PH.on ? w / 2 : w / 2 + (target.x - cam.x) * z, fogY = PH.on ? h / 2 : h / 2 + (target.y - cam.y) * z;
    if (th.night) {
      if (settings.fx === "off") {       // cheap version: just darker round the edges
        if (!S.vignette || S.vignette.w !== w || S.vignette.h !== h) { const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.2, w / 2, h / 2, Math.hypot(w, h) / 2); g.addColorStop(0, "rgba(0,0,20,0)"); g.addColorStop(1, "rgba(0,0,20,0.55)"); S.vignette = { g, w, h }; }
        ctx.fillStyle = S.vignette.g; ctx.fillRect(0, 0, w, h);
      } else drawNight(w, h, dpr, z, shx, shy, th, S.race?.fog ? { now, x: fogX, y: fogY } : null);
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
  }
  // store: tyre smoke colour (rainbow cycles, stardust sparkles gold and white)
  function smokeCol(s) {
    if (!s) return "rgba(230,230,230,0.5)";
    if (s === "rainbow") return `hsla(${(performance.now() / 6) % 360},95%,65%,0.6)`;
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
  function sendAssists() { socket.emit("assists", { pit: settings.asPit === "on", boost: settings.asBoost === "on", drs: settings.asDrs === "on" }); }
  socket.on("connect", sendAssists); socket.on("joined", sendAssists); socket.on("race", sendAssists);
  keyHints();
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
    const pct = Math.round(me.nitro ?? 100), lock = (S.xp && S.xp.nitroLock) || 0, key = pct + "|" + lock + "|" + (me.slip ? 1 : 0) + (me.nitroOn ? 1 : 0) + (me.drs ? 1 : 0) + (me.drsAvail ? 1 : 0);
    if (key === boostShown) return; boostShown = key;
    $("boostPct").textContent = lock > 0 ? `⏳${lock}s` : pct + "%";
    boostBtn.classList.toggle("locked", lock > 0); $("boostFill").style.width = pct + "%"; boostBtn.style.setProperty("--boost", pct + "%");
    boostBtn.classList.toggle("empty", pct < 3);
    const small = window.innerWidth <= 860, tags = [];
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
  function updateHud(now) {
    layoutHud();
    const me = S.cars.get(S.myCar) || S.cars.get(S.standings[0]);
    if (!me) return;
    const pos = S.standings.indexOf(me.id) + 1, laps = S.race?.laps || 5;
    $("posText").innerHTML = ""; $("posText").append("P" + pos);
    const sm = document.createElement("small"); sm.textContent = "/" + S.cars.size; $("posText").append(sm);
    { const T3 = "Scribble GP"; const tr = S.ql >= 0 ? `Qualifying · ${T3}` : me.fin ? `Finished · ${T3}` : `P${S.standings.indexOf(S.myCar) + 1} · Lap ${clamp(me.laps + 1, 1, laps)}/${laps} · ${T3}`; if (tr !== S.titleRace) { S.titleRace = tr; if (S.screen === "race") document.title = tr; } }
    $("lapText").textContent = S.ql >= 0 ? `Qualifying · ${Math.floor(S.ql / 60)}:${String(S.ql % 60).padStart(2, "0")} left` : me.fin ? "Finished!" : `Lap ${clamp(me.laps + 1, 1, laps)}/${laps}`;
    $("timeText").textContent = S.xp ? fmt(Math.max(0, S.t - S.xp.lapStart)) : fmt(S.t);
    $("bestText").textContent = "Best " + fmt(me.best);
    const spd = Math.max(0, me.speed || 0) * KMH * (settings.units === "mph" ? 0.621 : 1);
    $("speedText").textContent = `${Math.round(spd)} ${settings.units === "mph" ? "mph" : "km/h"}`;
    $("tireName").textContent = me.punct ? "PUNCTURE!" : `Tires: ${TIRES[me.comp]?.name || ""}` + (me.dmg > 0.05 ? `  ·  Damage ${Math.round(me.dmg * 100)}%` : "");
    $("tireName").style.color = me.punct || me.dmg > 0.4 ? "#ff8a80" : "";
    if (me.inPit) $("speedText").textContent = "PIT LIMITER";
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
        const p = document.createElement("span"); p.className = "p"; p.textContent = i + 1;
        const d = document.createElement("span"); d.className = "d"; d.style.background = c.color;
        const n = document.createElement("span"); n.className = "n"; n.textContent = (S.rival === c.name ? "🎯 " : "") + c.name;
        const g = document.createElement("span"); const gv = S.gaps[i] ?? 0;
        g.className = "gap" + (i > 0 && gv >= 0 && gv < 1 ? " close" : "");     // within a second = in a fight!
        g.textContent = i === 0 ? "" : gv < 0 ? "+1 lap" : "+" + gv.toFixed(1);
        const x = document.createElement("span"); x.className = "tw"; x.textContent = c.pit >= 0 ? "PIT" : c.fin ? "done" : c.punct ? "FLAT" : c.dmg > 0.3 ? "DMG" : `${Math.round(c.tire * 100)}%`;
        if (c.punct) x.style.color = "#ff8a80";
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
  $("standings").addEventListener("click", () => { S.lbAll = !S.lbAll; });
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
  const AI_WORD = { hard: "Hard", extreme: "EXTREME", overdrive: "⚡ OVERDRIVE" };
  const TIER_LADDER = [["Iron", "⚙️", 0, "3 Hard AI · 4 laps · big, gentle tracks"], ["Bronze", "🥉", 300, "4 Hard AI · 6 laps · big tracks"], ["Silver", "🥈", 600, "5 EXTREME AI · 7 laps · big, wonky"], ["Gold", "🥇", 900, "6 EXTREME AI · 9 laps · some very wonky tracks"],
    ["Platinum", "💠", 1200, "7 OVERDRIVE AI (ranked only) · 10 laps · big or huge tracks"], ["Diamond", "💎", 1500, "8 OVERDRIVE AI · 12 laps · huge tracks"], ["Master", "🔮", 1800, "10 OVERDRIVE AI · 13 laps · huge, very wonky"], ["Overdrive Elite", "⚡", 2100, "12 OVERDRIVE AI · 15 laps · huge, very wonky"]];
  function rankBadge(rank, big) {
    const b = el("div", "rank-badge" + (big ? " big" : "")); b.style.setProperty("--rk", rank.color);
    b.append(el("span", "rb-ic", rank.icon), el("b", "", rank.label));
    return b;
  }
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
    if (rw.crate) return "🎁 Themed crate";
    if (rw.item) return A.catalog?.store.find((x) => x.id === rw.item)?.name || "Item";
    return "";
  }
  function rewardCell(rw, locked, got) {
    const d = el("div", "pr" + (locked ? " locked" : "") + (got ? " got" : "") + (rw.item ? " item" : rw.crate ? " crate" : ""));
    const it = rw.item && A.catalog?.store.find((x) => x.id === rw.item);
    if (it) { d.appendChild(itemPreview(it, 96, 54)); d.style.setProperty("--rc", RARITY[it.rarity]?.[1]); }
    else d.appendChild(el("span", "pr-ic", rw.crate ? "🎁" : "🪙"));
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
    box.appendChild(el("p", "preset-note", "Pass XP: every race (+60, more for places beaten and wins, +40 in ranked), daily challenges (+150), weekly challenges (+300). The free track pays coins, a themed item and a crate. Premium adds this month's items and themed crates, which you can't get anywhere else."));
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
    popup(d.gift ? `🎁 ${d.name} sent you ${d.gift}!` : d.trade ? `🤝 ${d.name} sent you a trade offer (Profile › Friends)` : d.tradeDone !== undefined ? `🤝 ${d.name} ${d.tradeDone ? "accepted" : "answered"} your trade` : `💬 ${d.name}: ${d.text}`);
    sfx("tick");
  });
  const itemName = (id) => A.catalog?.store.find((x) => x.id === id)?.name || id;
  function itemSelect(ids, label, none) {
    const sel = document.createElement("select"); sel.setAttribute("aria-label", label);
    const o0 = document.createElement("option"); o0.value = ""; o0.textContent = none; sel.appendChild(o0);
    for (const id of [...ids].sort((a, b) => itemName(a).localeCompare(itemName(b)))) { const o = document.createElement("option"); o.value = id; o.textContent = itemName(id); sel.appendChild(o); }
    return sel;
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
        const mine = m.from === u.id, d = el("div", "dm" + (mine ? " mine" : "") + (m.gift || m.trade ? " sys" : ""));
        d.textContent = m.gift ? `🎁 ${mine ? "You sent" : f.name + " sent you"} ${m.gift}${m.text ? `: "${m.text}"` : ""}` : m.trade ? `🤝 ${mine ? "You" : f.name} ${m.trade}` : m.text;
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
    // trade
    const theirs = FR.items[f.id];
    box.appendChild(el("p", "preset-note", `Offer something, ask for something back. ${f.name} gets the offer in their Friends tab and can accept or decline. Everything is checked again when they accept.`));
    const g = el("div", "trade-grid");
    const colA = el("div", "trade-side"), colB = el("div", "trade-side");
    const gc = coinInput("Coins you give"), gi = itemSelect(mine, "Item you give", "No item");
    const wc = coinInput("Coins you want"), wi = itemSelect((theirs || []).filter((id) => !u.owned.includes(id)), "Item you want", theirs ? "No item" : "Loading their items...");
    const lab = (t, x) => { const l = el("label", "f", t + " "); l.appendChild(x); return l; };
    colA.append(el("b", "", "You give"), lab("Coins", gc), lab("Item", gi));
    colB.append(el("b", "", `${f.name} gives`), lab("Coins", wc), lab("Item", wi));
    g.append(colA, el("span", "trade-x", "⇄"), colB);
    const go = el("button", "btn go", cd ? `Cooldown ${cd}s` : "🤝 Send offer"); go.type = "button"; go.disabled = !!cd;
    go.addEventListener("click", () => socket.emit("trade:offer", { to: f.id, give: { coins: gc.value, item: gi.value || null }, want: { coins: wc.value, item: wi.value || null } }));
    box.append(g, go); if (cd) tickCd(go, "🤝 Send offer");
  }
  function tradesBlock(u) {
    if (!u?.trades?.length) return null;
    const sec = el("section", "sec-box"); sec.appendChild(el("h3", "hub-h", `🤝 Trade offers (${u.trades.length})`));
    const nm = (x) => [x.coins ? `🪙 ${x.coins}` : "", x.item ? itemName(x.item) : ""].filter(Boolean).join(" + ") || "nothing";
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
    edit: ["#startLineBtn", "#reverseBtn", "#drsBtn", "#drsAutoBtn", "#drsClearBtn", "#moreBtn", "#moreTools"],
  };
  for (const [sec, sels] of Object.entries(DOCK_SECS)) for (const q of sels) document.querySelector(q)?.setAttribute("data-sec", sec);
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

  // ======================= What's new (shown once after each update) =======================
  // Add a new entry at the TOP for every update (change "v" to anything new, like the date).
  // Players who've already played see it once on the menu or in a room; brand-new players don't.
  const WHATS_NEW = [
    { v: "2026-10-12", title: "Your finish replays, world news, new sounds and a shop drop", items: [
      "👥 Team ranked AI now race in teams the size of yours: two of you means every AI team has 2 cars.",
      "🌍 When anyone anywhere pulls a super rare upgrade card, every player in every race hears about it.",
      "🏁 Watch YOUR finish: after the flag, rewatch your own run to the line. Your last 3 finishes stay in 🎬 Replays.",
      "🛍️ 29 new shop items: glows, flames, rims, helmets, smoke, Confetti/Ember/Checkered trails, Skull/Stripes/Dice decals and 8 new badges.",
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
      const h = document.createElement("h3"); h.textContent = n.title; const sm = document.createElement("small"); sm.textContent = n.v; h.appendChild(sm); box.appendChild(h);
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
  function openComm() { $("commBox").classList.remove("hidden"); $("commGrid").textContent = ""; $("commGrid").appendChild(el("p", "preset-note", "Loading...")); socket.emit("community:list", { sort: commSort }); }
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
  socket.on("community", (d) => {
    const g = $("commGrid"); g.textContent = "";
    if (!d.list.length) g.appendChild(el("p", "preset-note", "No community tracks yet. Share a track (🔗 Share code) and add it!"));
    for (const t of d.list) g.appendChild(commCard(t));
  });
  socket.on("communityVoted", (t) => { const old = $("commGrid").querySelector(`[data-code="${t.code}"]`); if (old) old.replaceWith(commCard(t)); });
  socket.on("communityMsg", (m) => { if (m.error) { if (!$("codeBox").classList.contains("hidden")) $("codeMsg").textContent = m.error; else popup(m.error, true); } else { $("codeMsg").textContent = m.ok; $("commPub").classList.add("hidden"); popup(m.ok); } });
  document.querySelectorAll("[data-cs]").forEach((b) => b.addEventListener("click", () => {
    commSort = b.dataset.cs; document.querySelectorAll("[data-cs]").forEach((x) => x.setAttribute("aria-selected", String(x === b)));
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
  const TRACK_KEYS = ["pts", "tan", "nor", "N", "W", "H", "length", "trackW", "theme", "hw", "line", "gravel", "pitLane", "minX", "minY", "pad", "scale", "reverse", "elev", "bridges", "maxLevel", "vmax", "name", "drs"];
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
  function drawNight(w, h, dpr, z, shx, shy, th, fog) {
    nightSprites();
    const k = dpr * 0.5, W = Math.max(1, Math.round(w * k)), H = Math.max(1, Math.round(h * k));
    if (!nightCv) nightCv = document.createElement("canvas");
    if (nightCv.width !== W || nightCv.height !== H) { nightCv.width = W; nightCv.height = H; }
    const n = nightCv.getContext("2d");
    n.setTransform(1, 0, 0, 1, 0, 0); n.globalCompositeOperation = "copy";
    n.fillStyle = th.key === "neon" ? "rgba(8,4,26,0.5)" : "rgba(3,5,16,0.7)"; n.fillRect(0, 0, W, H);
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
