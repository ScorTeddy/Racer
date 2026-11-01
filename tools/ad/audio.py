"""Soundtrack for the Scribble GP ad: music + sound effects + commentator, all timed to ad.js."""
import numpy as np, subprocess, wave, sys, os

SR = 48000
DUR = 47.5
N = int(DUR * SR)
rng = np.random.default_rng(7)
HERE = os.path.dirname(os.path.abspath(__file__))
COMM = os.path.join(HERE, "..", "..", "public", "commentary")

music = np.zeros((2, N)); sfx = np.zeros((2, N)); voice = np.zeros(N)


def tt(d):
    return np.arange(int(d * SR)) / SR


def add(buf, t0, sig, g=1.0, pan=0.0):
    i0 = int(round(t0 * SR))
    if i0 >= N:
        return
    if sig.ndim == 1:
        l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
        sig = np.vstack([sig * l * 1.414, sig * r * 1.414])
    n = min(sig.shape[1], N - i0)
    if i0 < 0:
        sig = sig[:, -i0:]; n = min(sig.shape[1], N); i0 = 0
    buf[:, i0:i0 + n] += sig[:, :n] * g


def filt(sig, lo=0, hi=SR / 2, soft=0.15):
    S = np.fft.rfft(sig); f = np.fft.rfftfreq(len(sig), 1 / SR)
    m = np.ones_like(f)
    if lo > 0:
        m *= 1 / (1 + (lo / np.maximum(f, 1)) ** 4)
    if hi < SR / 2:
        m *= 1 / (1 + (f / hi) ** 4)
    return np.fft.irfft(S * m, len(sig))


def noise(d):
    return rng.standard_normal(int(d * SR))


def fade(sig, a=0.003, r=0.01):
    n = len(sig); e = np.ones(n)
    na, nr = int(a * SR), int(r * SR)
    if na: e[:na] = np.linspace(0, 1, na)
    if nr: e[-nr:] *= np.linspace(1, 0, nr)
    return sig * e


def sweep_phase(f):
    return 2 * np.pi * np.cumsum(f) / SR


# ---------------- instruments ----------------
def kick(d=0.45):
    t = tt(d); f = 48 + 120 * np.exp(-t * 32)
    s = np.sin(sweep_phase(f)) * np.exp(-t * 7.5)
    s += filt(noise(d), 1500, 8000) * np.exp(-t * 300) * 0.25
    return fade(np.tanh(s * 1.6), 0.0005, 0.02)


NOISE_CLAP = filt(noise(0.4), 900, 5000)


def clap():
    t = tt(0.4); e = np.zeros_like(t)
    for k, o in enumerate([0, 0.011, 0.022]):
        e += (t >= o) * np.exp(-(t - o).clip(0) * (180 if k < 2 else 16))
    return fade(NOISE_CLAP * e * 0.55)


NOISE_HAT = filt(noise(0.3), 7000, 16000)


def hat(open_=False):
    t = tt(0.3); return fade(NOISE_HAT * np.exp(-t * (14 if open_ else 70)) * 0.5, 0.0005)


def crash(d=2.4):
    t = tt(d); s = filt(noise(d), 4000, 15000) * np.exp(-t * 1.9)
    for f in [3150, 4210, 5530, 7020]:
        s += 0.04 * np.sin(2 * np.pi * f * t) * np.exp(-t * 3)
    return fade(s * 0.5, 0.001, 0.2)


def snare():
    t = tt(0.25)
    return fade(filt(noise(0.25), 1200, 7000) * np.exp(-t * 22) * 0.5 + np.sin(2 * np.pi * 190 * t) * np.exp(-t * 30) * 0.4)


def shaker():
    t = tt(0.12); e = (1 - np.exp(-t * 200)) * np.exp(-t * 40)
    return filt(noise(0.12), 5000, 12000) * e * 0.35


def marimba(f, d=0.5):
    t = tt(d)
    s = np.sin(2 * np.pi * f * t) * np.exp(-t * 7) + 0.35 * np.sin(2 * np.pi * f * 4 * t) * np.exp(-t * 26) + 0.12 * np.sin(2 * np.pi * f * 9.9 * t) * np.exp(-t * 60)
    return fade(s, 0.002, 0.03)


def lead(f, d=0.26):
    t = tt(d + 0.25); vib = 1 + 0.004 * np.sin(2 * np.pi * 5.5 * t) * np.clip(t / 0.15, 0, 1)
    ph = sweep_phase(f * vib)
    s = sum(a * np.sin(k * ph) for k, a in [(1, 1), (2, 0.18), (3, 0.3), (5, 0.12), (7, 0.05)])
    env = np.where(t < d, np.exp(-t * 3.5), np.exp(-d * 3.5) * np.exp(-(t - d) * 30))
    s = s * env + 0.35 * np.sin(2 * ph) * np.exp(-t * 9)
    return fade(s * 0.42, 0.004, 0.02)


def bass(f, d=0.24):
    t = tt(d)
    s = np.sin(2 * np.pi * f * t) + 0.45 * np.sin(4 * np.pi * f * t) + 0.18 * np.sin(6 * np.pi * f * t)
    env = np.exp(-t * 4) * 0.8 + 0.2
    return fade(np.tanh(1.8 * s * env) * 0.5, 0.003, 0.03)


def pad(freqs, d, att=0.4):
    t = tt(d); s = np.zeros_like(t)
    for f in freqs:
        for det in (-0.004, 0, 0.0045):
            for k in range(1, 7):
                s += (0.6 / k) * np.sin(2 * np.pi * f * (1 + det) * k * t + k * det * 400)
    env = np.clip(t / att, 0, 1) * np.clip((d - t) / 0.5, 0, 1)
    return s * env * 0.03


def stab(freqs, d=0.2):
    t = tt(d); s = np.zeros_like(t)
    for f in freqs:
        for k in range(1, 9):
            s += (1 / k) * np.sin(2 * np.pi * f * 2 * k * t) * np.exp(-t * (10 + 3 * k))
    return fade(s * 0.08, 0.002, 0.02)


def bell(f, d=0.8, g=1.0):
    t = tt(d)
    s = np.sin(2 * np.pi * f * t) * np.exp(-t * 5) + 0.4 * np.sin(2 * np.pi * f * 2.76 * t) * np.exp(-t * 11) + 0.2 * np.sin(2 * np.pi * f * 5.4 * t) * np.exp(-t * 20)
    return fade(s * 0.3 * g, 0.001, 0.05)


# ---------------- sound effects ----------------
def pop(f0=520, g=1.0):
    t = tt(0.12); f = f0 * (1 + 0.9 * np.exp(-t * 60))
    return fade(np.sin(sweep_phase(f)) * np.exp(-t * 34) * 0.5 * g, 0.0008)


def tick(f=1900, g=1.0):
    t = tt(0.05); return fade((np.sin(2 * np.pi * f * t) + 0.4 * np.sin(2 * np.pi * f * 1.5 * t)) * np.exp(-t * 90) * 0.3 * g, 0.0005)


def thump(g=1.0, low=1.0):
    t = tt(0.35); f = 55 + 110 * np.exp(-t * 26)
    s = np.sin(sweep_phase(f)) * np.exp(-t * 15) * low
    s += filt(noise(0.35), 150, 1600) * np.exp(-t * 38) * 0.5
    s += filt(noise(0.35), 1800, 7000) * np.exp(-t * 110) * 0.18
    return fade(s * 0.7 * g, 0.0005, 0.03)


def click(g=1.0):
    s = np.zeros(int(0.08 * SR)); t = tt(0.02)
    c = filt(noise(0.02), 2000, 9000) * np.exp(-t * 500)
    s[:len(c)] += c; s[int(0.028 * SR):int(0.028 * SR) + len(c)] += c * 0.6
    return s * 0.5 * g


def beep(f=587.33, d=0.22):
    t = tt(d); s = sum((1 / k) * np.sin(2 * np.pi * f * k * t) for k in (1, 3, 5, 7))
    return fade(s * 0.22, 0.004, 0.03)


def pencil(d, rate=8.0, g=1.0):
    t = tt(d); n = filt(noise(d), 1800, 7500)
    strokes = 0.55 + 0.45 * np.abs(np.sin(2 * np.pi * rate * t + 1.5 * np.sin(2 * np.pi * 1.3 * t)))
    grit = 1 + 1.6 * (filt(noise(d), 20, 60) > 1.2)
    env = np.clip(t / 0.05, 0, 1) * np.clip((d - t) / 0.08, 0, 1)
    return n * strokes * grit * env * 0.1 * g


def marker(d, rate=14.0, g=1.0):
    t = tt(d); n = filt(noise(d), 500, 3200)
    mod = 0.35 + 0.65 * np.abs(np.sin(2 * np.pi * rate * t))
    sq = np.sin(sweep_phase(1150 + 180 * np.sin(2 * np.pi * rate * t))) * 0.05
    env = np.clip(t / 0.03, 0, 1) * np.clip((d - t) / 0.06, 0, 1)
    return (n * 0.11 + sq) * mod * env * g


def card_snap(g=1.0):
    t = tt(0.06); return fade(filt(noise(0.06), 900, 6500) * np.exp(-t * 110) * 0.55 * g, 0.0005)


def crackle(d=0.35, g=1.0):
    s = np.zeros(int(d * SR)); k = int(d * 260)
    for _ in range(k):
        i = rng.integers(0, len(s) - 200); s[i:i + 60] += rng.standard_normal(60) * np.exp(-np.arange(60) / 12)
    t = tt(d); env = np.sin(np.pi * t / d) ** 0.7
    return filt(s, 1500, 9000) * env * 0.12 * g


def bloop(g=1.0):
    t = tt(0.4); f = 110 + 170 * (t / 0.4) ** 0.6
    return fade((np.sin(sweep_phase(f)) + 0.25 * np.sin(2 * sweep_phase(f))) * np.sin(np.pi * t / 0.4) * 0.45 * g)


def sparkle(start=1567.98, n=8, gap=0.045, g=1.0):
    scale = [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3, 2, 9 / 4, 5 / 2, 3, 10 / 3, 4]
    out = np.zeros(int((n * gap + 0.9) * SR))
    for i in range(n):
        b = bell(start * scale[i % len(scale)], 0.7, 0.55); o = int(i * gap * SR); out[o:o + len(b)] += b
    return out * g


def engine(d, f_fn, a_fn, harm=14, g=1.0, cut=2600):
    t = tt(d); f = f_fn(t); ph = sweep_phase(f)
    s = sum(((1 / k) ** 0.75) * np.sin(k * ph + k * 1.7) for k in range(1, harm + 1))
    s *= 1 + 0.35 * np.sin(ph * 0.5)
    s = filt(np.tanh(s * 1.4), 30, cut)
    return s * a_fn(t) * g


def crowd(d=4.0, g=1.0):
    t = tt(d); s = np.zeros_like(t)
    for lo, hi in [(250, 700), (600, 1400), (1200, 2800)]:
        am = filt(noise(d), 0.5, 7); am = 1 + 0.6 * am / np.abs(am).max()
        s += filt(noise(d), lo, hi) * am
    env = np.clip(t / 0.35, 0, 1) * np.clip((d - t) / 1.6, 0, 1)
    s = s / np.abs(s).max() * env * 0.35
    for k in range(3):  # whistles
        t0 = 0.3 + k * 0.7; dd = 0.6; m = (t >= t0) & (t < t0 + dd); u = (t[m] - t0) / dd
        f = 2100 + 500 * np.sin(np.pi * u) + 40 * np.sin(2 * np.pi * 7 * u * dd)
        s[m] += np.sin(sweep_phase(f)) * np.sin(np.pi * u) * 0.05
    return s * g


def shutter():
    s = np.zeros(int(0.2 * SR)); c = click(1.4); s[:len(c)] += c; s[int(0.07 * SR):int(0.07 * SR) + len(c)] += c * 0.8
    return s


def boost_sweep():
    t = tt(0.7); f = 260 + 700 * (t / 0.7) ** 1.4
    s = (np.sin(sweep_phase(f)) + 0.3 * np.sin(2 * sweep_phase(f))) * np.clip(t / 0.05, 0, 1) * np.exp(-np.clip(t - 0.45, 0, None) * 12)
    return s * 0.28


# ---------------- music ----------------
BPM = 120; BEAT = 60 / BPM; BAR = 4 * BEAT
G2, A2, B2, C3, D3, E3, Fs3, G3, A3, B3, C4, D4, E4, Fs4, G4, A4, B4, C5, D5, E5, Fs5, G5, A5, B5, C6, D6, E6, G6 = [
    98.0, 110.0, 123.47, 130.81, 146.83, 164.81, 185.0, 196.0, 220.0, 246.94, 261.63, 293.66, 329.63, 369.99, 392.0, 440.0, 493.88, 523.25, 587.33, 659.25, 739.99, 783.99, 880.0, 987.77, 1046.5, 1174.66, 1318.5, 1567.98]
CH = {"G": ([G3, B3, D4], G2), "D": ([Fs3, A3, D4], D3 / 2 * 2 / 2 * 2 / 2 * 1.0 * 1.0), "Em": ([G3, B3, E4], E3 / 2), "C": ([G3, C4, E4], C3 / 2)}
CH["D"] = ([Fs3, A3, D4], D3 / 2)
PROG = ["G", "D", "Em", "C"]
MEL = {
    "G": [D5, 0, B4, D5, E5, D5, B4, G4],
    "D": [A4, 0, Fs4, A4, D5, 0, A4, 0],
    "Em": [B4, 0, G4, B4, E5, D5, B4, G4],
    "C": [C5, 0, E5, G5, E5, D5, C5, 0],
}


def section(b):
    t = b * BAR
    if t < 6: return "intro"
    if t < 10: return "logo"
    if t < 14: return "tension"
    if t < 22: return "main"
    if t < 26: return "pit"
    if t < 34: return "main"
    if t < 36: return "final"
    if t < 38: return "slow"
    if t < 44: return "main"
    return "end"


def cut_ok(t):  # gaps where the groove stops
    return not (13.5 <= t < 14.0 or 35.8 <= t < 38.0 or t >= 44.0)


for b in range(int(DUR / BAR) + 1):
    tb = b * BAR; sec = section(b); name = PROG[b % 4]
    if tb >= 44: name = "G"
    tones, root = CH[name]
    if sec == "end":
        continue
    # pad
    if sec in ("intro", "tension", "slow", "pit", "main", "final", "logo"):
        g = {"intro": 0.8, "tension": 1.0, "slow": 1.3}.get(sec, 0.45)
        d = BAR + 0.4
        if sec == "tension" and tb + d > 13.75: d = 13.75 - tb
        add(music, tb, pad(tones, d, 0.3), g)
    for e in range(8):  # eighths
        t = tb + e * BEAT / 2
        if not cut_ok(t): continue
        if sec == "intro":
            arp = [tones[0], tones[1], tones[2], tones[0] * 2, tones[2], tones[1], tones[2], tones[0] * 2]
            add(music, t, marimba(arp[e] * 2), 0.32 * min(1, 0.5 + tb / 6), pan=0.25 * np.sin(e))
            if tb >= 2: add(music, t + BEAT / 4, shaker(), 0.5)
        if sec in ("logo", "main", "pit", "final"):
            if e % 2 == 0: add(music, t, kick(), 0.8)
            if e in (2, 6): add(music, t, clap(), 0.55, 0.05)
            add(music, t + (BEAT / 4 if e % 2 == 0 else 0), hat(e % 2 == 1 and e == 7), 0.22 if e % 2 else 0.12, 0.3)
            add(music, t, bass(root * (2 if e % 2 else 1)), 0.45)
            if e in (1, 5): add(music, t, stab(tones), 0.9, -0.2)
            if sec == "logo":
                arp = [tones[0], tones[1], tones[2], tones[0] * 2, tones[2], tones[1], tones[2], tones[0] * 2]
                add(music, t, marimba(arp[e] * 2), 0.22, 0.3)
            if sec in ("main", "final") and tb >= 14 and MEL[name][e]:
                g = 0.5 if 26 <= tb < 30 else 0.62
                add(music, t, lead(MEL[name][e]), g, -0.1)
        if sec == "tension":
            add(music, t, bass(root), 0.42 + 0.1 * (t - 10) / 3.5)
            for s16 in range(2):
                tt16 = t + s16 * BEAT / 4
                if tt16 < 13.5: add(music, tt16, hat(), 0.06 + 0.16 * (tt16 - 10) / 3.5, 0.3)
            if e % 2 == 0 and t >= 12: add(music, t, kick(), 0.35 + 0.25 * (t - 12) / 1.5)

# crashes / hits
for t0, g in [(6.0, 0.8), (14.0, 1.0), (30.0, 0.6), (34.0, 0.5), (38.0, 1.0), (40.0, 0.6), (44.0, 1.0)]:
    add(music, t0, crash(), g * 0.75, 0.2)
for t0 in (6.0, 14.0, 38.0, 44.0):
    add(music, t0, kick(), 1.1)
    add(music, t0, stab(CH["G" if t0 != 14 else "C"][0], 0.5), 1.8)
# fills (snare) into the drops
for t0, n in [(21.5, 4), (29.5, 4), (33.5, 4), (39.5, 4), (43.5, 4)]:
    for k in range(n): add(music, t0 + k * BEAT / 4 * 2 / 2 * 1.0, snare(), 0.25 + 0.12 * k, -0.1)
# heartbeat in the slow motion
for t0 in (36.1, 36.9, 37.7):
    add(music, t0, kick(), 0.65); add(music, t0 + 0.18, kick(), 0.45)
# final chord ring-out
add(music, 44.0, pad(CH["G"][0] + [G4, D5], 3.4, 0.05), 2.2)
add(music, 44.0, bass(G2, 2.8), 0.7)
for i, f in enumerate([G4, B4, D5, G5]):
    add(music, 44.0 + i * 0.06, marimba(f * 2, 2.5), 0.3)
add(music, 44.0, lead(G5, 1.2), 0.5)

# ---------------- sound effects timeline ----------------
# 1. drawing
add(sfx, 0.35, pencil(3.2, 7.0), 1.0, 0.1)
add(sfx, 0.7, marker(0.9, 11, 0.55), 1.0, -0.4)  # caption being written
add(sfx, 1.6, marker(0.35, 6, 0.8), 1.0, -0.4)  # red underline
add(sfx, 2.0, pencil(0.5, 12, 0.5), 1.0, -0.4)
add(sfx, 3.6, bloop(), 0.9)
for i in range(6): add(sfx, 4.25 + i * 0.125, pop(480 + i * 70), 0.8, -0.5 + i * 0.2)
add(sfx, 4.5, marker(0.4, 5, 0.8), 1.0, 0.1)  # DRS highlighter
add(sfx, 4.95, pencil(0.3, 14, 0.6), 1.0, -0.6)
add(sfx, 5.15, pencil(0.3, 14, 0.6), 1.0, 0.6)
add(sfx, 5.2, thump(0.45), 1.0, 0.6)  # track notes sticky
# 2. logo
add(sfx, 6.0, thump(1.0, 1.4), 1.0)
for i in range(8): add(sfx, 6.05 + i * 0.065 + 0.12, pop(600 + i * 45, 0.6), 1.0, -0.4 + i * 0.1)
add(sfx, 6.82, thump(0.8), 1.0, 0.2)
add(sfx, 6.87, engine(0.9, lambda t: 70 + 160 * np.clip(t / 0.5, 0, 1) ** 0.7 - 40 * np.clip((t - 0.5) / 0.3, 0, 1), lambda t: np.clip(t / 0.08, 0, 1) * np.clip((0.9 - t) / 0.35, 0, 1), g=0.32), 1.0, 0.3)
add(sfx, 7.9, thump(0.8), 1.0, -0.2)
add(sfx, 8.05, marker(0.75, 12, 0.5), 1.0, 0.2)
add(sfx, 9.62, crackle(0.38, 0.9), 1.0, 0.4)  # sticky peel
# 3. lights
add(sfx, 10.3, thump(0.5, 0.8), 1.0)
add(sfx, 10.4, marker(0.4, 10, 0.45), 1.0)
add(sfx, 11.1, marker(0.3, 8, 0.4), 1.0, -0.2)
for i in range(5): add(sfx, 11.0 + i * 0.5, beep(), 0.9)
# idle engines on the grid, revving
add(sfx, 10.0, engine(4.0, lambda t: 46 + 6 * np.sin(2 * np.pi * 0.7 * t) + 18 * np.clip((t - 2.6) / 1.3, 0, 1), lambda t: np.clip(t / 0.6, 0, 1) * 0.6, g=0.16), 1.0)
# launch
add(sfx, 14.0, engine(2.2, lambda t: 55 + 150 * np.clip(t / 0.55, 0, 1) - 50 * np.clip((t - 0.55) / 0.08, 0, 1) + 60 * np.clip((t - 0.63) / 0.7, 0, 1), lambda t: np.clip((2.2 - t) / 1.2, 0.35, 1), g=0.42), 1.0)
add(sfx, 14.0, engine(2.2, lambda t: 50 + 140 * np.clip(t / 0.6, 0, 1) - 45 * np.clip((t - 0.6) / 0.08, 0, 1) + 55 * np.clip((t - 0.68) / 0.7, 0, 1), lambda t: np.clip((2.2 - t) / 1.2, 0.35, 1), g=0.3), 1.0, 0.5)
add(sfx, 14.02, engine(2.2, lambda t: 58 + 160 * np.clip(t / 0.5, 0, 1) - 55 * np.clip((t - 0.5) / 0.08, 0, 1) + 60 * np.clip((t - 0.58) / 0.7, 0, 1), lambda t: np.clip((2.2 - t) / 1.2, 0.35, 1), g=0.28), 1.0, -0.5)
# race bed
add(sfx, 15.9, engine(6.2, lambda t: 150 + 6 * np.sin(2 * np.pi * 0.4 * t) + 45 * np.exp(-((t - 0.8) / 0.6) ** 2), lambda t: np.clip(t / 0.4, 0, 1) * np.clip((6.2 - t) / 0.6, 0, 1), g=0.13), 1.0)
# HUD arrives
for i, t0 in enumerate([14.55, 14.72, 14.85, 14.95, 15.15, 15.25, 15.35, 15.1]):
    add(sfx, t0, tick(1500 + i * 120, 0.6), 1.0, -0.6 + i * 0.17)
add(sfx, 14.85, thump(0.5), 1.0, 0.3)  # P3 stamp
for t0 in (15.35, 17.6, 20.1): add(sfx, t0 + 0.08, marker(0.38, 12, 0.45), 1.0)  # captions
# boost
add(sfx, 15.98, click(), 1.0); add(sfx, 15.98, boost_sweep(), 1.0)
add(sfx, 16.0, crackle(1.2, 0.5), 1.0, -0.1)
add(sfx, 16.45, engine(0.7, lambda t: 190 - 70 * t, lambda t: np.sin(np.pi * t / 0.7), g=0.22), 1.0, 0.5)  # pass Vex
add(sfx, 16.7, thump(0.6), 1.0, 0.3); add(sfx, 16.72, pop(700, 0.5), 1.0, 0.3)  # P2
add(sfx, 17.0, bell(1318.5, 0.5, 0.6), 1.0, 0.6); add(sfx, 17.08, bell(1760, 0.5, 0.6), 1.0, 0.6)  # toast
add(sfx, 18.15, bell(1318.5, 0.6, 0.8), 1.0, 0.6); add(sfx, 18.25, bell(1975.5, 0.7, 0.8), 1.0, 0.6)  # DRS
add(sfx, 19.3, engine(0.7, lambda t: 200 - 80 * t, lambda t: np.sin(np.pi * t / 0.7), g=0.22), 1.0, -0.4)  # pass Nico
add(sfx, 19.55, thump(0.7), 1.0, 0.3); add(sfx, 19.57, sparkle(1567.98, 7, 0.04, 0.7), 1.0, 0.3)  # P1
add(sfx, 20.0, bell(1046.5, 0.5, 0.5), 1.0, 0.6); add(sfx, 20.08, bell(1318.5, 0.5, 0.5), 1.0, 0.6)
add(sfx, 21.15, click(), 1.0, 0.2); add(sfx, 21.2, beep(880, 0.12), 0.5, 0.2); add(sfx, 21.35, beep(880, 0.12), 0.5, 0.2)
# 4. pit stop
add(sfx, 22.22, thump(0.6), 1.0)
for i, f in enumerate([G5, A5, B5, D6, E6, G6]):
    add(sfx, 22.5 + i * 0.25, click(0.6), 1.0, -0.5 + i * 0.2)
    add(sfx, 22.5 + i * 0.25, bell(f, 0.35, 0.9), 1.0, -0.5 + i * 0.2)
add(sfx, 24.2, thump(0.9), 1.0, 0.3)
for i, f in enumerate([G5, B5, D6, G6]): add(sfx, 24.2 + i * 0.06, bell(f, 0.9, 0.7), 1.0, 0.3)
add(sfx, 24.45, pop(520, 0.7), 1.0, -0.3)
# 5. upgrade cards
add(sfx, 26.05, marker(0.4, 12, 0.45), 1.0)
for i in range(3): add(sfx, 26.25 + i * 0.25 + 0.15, card_snap(), 1.0, -0.4 + i * 0.4)
add(sfx, 27.6, click(), 1.0, 0.1)
add(sfx, 27.62, sparkle(1046.5, 10, 0.04, 0.9), 1.0)
add(sfx, 28.3, thump(0.7), 1.0, 0.3)
add(sfx, 29.65, marker(0.8, 22, 1.0), 1.0)  # scribble wipe
# 6. multiplayer montage
add(sfx, 30.25, marker(0.55, 12, 0.5), 1.0, -0.4)
for i in range(4): add(sfx, 30.5 + i * 0.125 + 0.12, pop(500 + i * 90, 0.8), 1.0, -0.6 + i * 0.3)
add(sfx, 31.3, thump(0.7), 1.0, -0.4)
add(sfx, 31.3, pencil(0.6, 12, 0.45), 1.0, -0.5)
for i in range(8): add(sfx, 31.5 + i * 0.25 + 0.18, thump(0.45), 1.0, 0.5); add(sfx, 31.5 + i * 0.25 + 0.18, tick(1400 + i * 110, 0.5), 1.0, 0.5)
# 7. finish
add(sfx, 34.0, engine(1.85, lambda t: 165 + 8 * np.sin(2 * np.pi * 0.8 * t), lambda t: np.clip(t / 0.2, 0, 1) * np.clip((1.85 - t) / 0.2, 0, 1), g=0.2), 1.0)
add(sfx, 34.3, thump(0.45), 1.0)
add(sfx, 35.8, engine(2.3, lambda t: 70 - 15 * np.clip(t / 0.5, 0, 1), lambda t: np.clip(t / 0.3, 0, 1) * np.clip((2.3 - t) / 0.2, 0, 1), g=0.22, cut=900), 1.0)
add(sfx, 38.0, shutter(), 1.0); add(sfx, 38.0, bell(2637, 0.6, 0.5), 1.0)
add(sfx, 38.05, crowd(4.2), 0.9)
for i, t0 in enumerate([38.27, 38.39, 38.51]): add(sfx, t0, pop(300 + i * 60, 0.7), 1.0, -0.7 + i * 0.7); add(sfx, t0, crackle(0.4, 0.7), 1.0, -0.7 + i * 0.7)
add(sfx, 38.75, thump(1.0), 1.0, 0.4)
add(sfx, 38.7, marker(0.5, 12, 0.45), 1.0, -0.3)
add(sfx, 39.0, marker(0.5, 12, 0.45), 1.0, 0.4)
add(sfx, 39.65, marker(0.8, 22, 1.0), 1.0)  # scribble wipe
# 8. end card
for i in range(8): add(sfx, 40.15 + i * 0.04 + 0.12, pop(600 + i * 45, 0.5), 1.0, -0.4 + i * 0.1)
add(sfx, 40.72, thump(0.8), 1.0, 0.2)
add(sfx, 40.6, engine(0.8, lambda t: 70 + 150 * np.clip(t / 0.45, 0, 1) ** 0.7 - 40 * np.clip((t - 0.45) / 0.3, 0, 1), lambda t: np.clip(t / 0.08, 0, 1) * np.clip((0.8 - t) / 0.3, 0, 1), g=0.28), 1.0, 0.4)
for i, t0 in enumerate([41.03, 41.53, 42.03]): add(sfx, t0, thump(0.75), 1.0, -0.5 + i * 0.5)
add(sfx, 42.45, pop(420, 0.8), 1.0)
add(sfx, 43.25, click(1.2), 1.0, 0.1); add(sfx, 43.27, sparkle(1567.98, 9, 0.04, 0.8), 1.0)
add(sfx, 43.6, marker(0.7, 12, 0.35), 1.0)
add(sfx, 44.3, marker(0.5, 12, 0.4), 1.0, 0.5)

# ---------------- commentator ----------------
def load(name):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", f"{COMM}/{name}.mp3", "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"], capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32).astype(np.float64)


LINES = [(14.05, "l_start_0"), (18.25, "l_drs_1"), (24.25, "l_pitGood_0"), (35.75, "l_photo_1"), (38.45, "l_winYou_1")]
for t0, nm in LINES:
    v = load(nm); v = v / (np.abs(v).max() + 1e-9) * 0.9
    i0 = int(t0 * SR); n = min(len(v), N - i0); voice[i0:i0 + n] += v[:n]

# a little "broadcast" colour on the voice: gentle presence, light room
voice = filt(voice, 90, 9000)
room = np.zeros_like(voice)
for d, g in [(0.031, 0.18), (0.047, 0.12), (0.071, 0.08)]:
    k = int(d * SR); room[k:] += voice[:-k] * g
voice = voice + filt(room, 300, 5000)

# ducking: music dips under the commentator
env = np.abs(voice); win = int(0.12 * SR)
env = np.convolve(env, np.ones(win) / win, mode="same")
duck = 1 - 0.5 * np.clip(env / 0.08, 0, 1)
duck = np.convolve(duck, np.ones(int(0.08 * SR)) / int(0.08 * SR), mode="same")

mix = music * 0.55 * duck + sfx * 0.85 + np.vstack([voice, voice]) * 0.62
# fade out tail
t = np.arange(N) / SR
mix *= np.clip((47.2 - t) / 1.4, 0, 1)
mix /= np.abs(mix).max()
mix = np.tanh(mix * 1.5) / np.tanh(1.5)
mix *= 0.89 / np.abs(mix).max()

out = os.path.join(HERE, "ad_audio.wav")
with wave.open(out, "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((mix.T * 32767).astype("<i2").tobytes())
print("wrote", out, mix.shape[1] / SR, "s")
