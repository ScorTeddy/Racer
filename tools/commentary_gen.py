# Makes the race commentator clips in public/commentary (run from a folder holding the Kokoro model files:
# kokoro-v1.0.onnx and voices-v1.0.bin from github.com/thewh1teagle/kokoro-onnx releases).
# pip install kokoro-onnx soundfile lameenc, then: python3 commentary_gen.py 0 1
import sys, json, os, re, numpy as np, lameenc
from kokoro_onnx import Kokoro
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "public", "commentary")
k = Kokoro("kokoro-v1.0.onnx", "voices-v1.0.bin")
VOICE = "bm_george"
LINES = {
  "start": ["And it's lights out, and away we go!", "Lights out! And they're racing!", "Here we go! Lights out!"],
  "crash": ["Oh! Contact! That is a big moment!", "Ohh, they've come together!", "Crash! That's going to leave a mark.", "Oh, that's a collision! There's debris everywhere!"],
  "crashBig": ["Oh my word! That is a huge accident!", "Oh no! That is a massive crash!"],
  "crashN": ["is in the wars!", "has hit trouble!", "takes a big hit there!"],
  "win": ["wins the race! What a drive!", "takes the chequered flag! Brilliant!", "wins it! Absolutely superb!"],
  "winYou": ["And you've won it! What a drive! Sensational!", "Victory! You've done it! Champagne time!"],
  "photo": ["It's a photo finish! Too close to call!", "Side by side to the line! Photo finish!"],
  "lastLap": ["Final lap! This is it!", "One lap to go! Everything on the line!", "Here comes the last lap!"],
  "scOut": ["Safety car! The safety car is out!", "And that brings out the safety car!"],
  "scIn": ["The safety car is in, and we are back to green!", "Green flag! Racing resumes!"],
  "rain": ["And here comes the rain! This changes everything!", "Rain is falling! Time to think about wet tyres!"],
  "lead": ["takes the lead!", "is into the lead! What a move!", "moves to the front!"],
  "leadYou": ["You're into the lead! Fantastic driving!", "And you take the lead! Brilliant!"],
  "elim": ["is knocked out!", "is eliminated! Out of the race!", "is out! The knockout claims another!"],
  "elimYou": ["You're out! Unlucky, so close!", "Knocked out! That's the end of your race."],
  "standing": ["is the last car standing!", "survives them all! Last car standing!"],
  "classWin": ["takes the class victory!", "wins the class! Superb!"],
  "puncture": ["has a puncture! Disaster!", "has a flat tyre! Oh no!"],
  "fastest": ["sets the fastest lap!", "goes purple! Fastest lap of the race!"],
  "pitGood": ["What a pit stop! Lightning fast!", "Brilliant stop from the crew!"],
  "pitBad": ["Oh, a slow stop! That's cost some time.", "Trouble in the pits! A slow stop."],
}
NAMES = ["Bolt","Nova","Rusty","Vex","Kira","Moss","Blaze","Juno","Ziggy","Pip","Axel","Luna","Dash","Echo","Finn","Gemma","Hugo","Ivy","Jett","Kai","Lola","Milo","Nash","Orla","Pike","Quinn","Rex","Sage","Taro","Uma","Vince","Wren","Xander","Yuki","Zane","Ace Jr","Bree","Cruz","Dex","Elio","Flint","Gio","Hana","Ines","Jasper","Kenji","Leon","Mara","Nico","Otto","Pia","Rafa","Sol","Tess","Ulla","Vito","Wade","Xia","Yara","Zeke","Aria","Bram","Cleo","Dario","Elsa","Fox","Greta","Hank","Iker","Jules","Knox","Lars","Mika","Noor","Oskar","Petra","Rio","Sven","Tomas","Vera","Willa","Yusuf","Zora","Arlo","Bex","Cato","Dunya","Enzo","Freya","Gus"]
ONES = "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen".split()
TENS = "_ _ twenty thirty forty fifty sixty seventy eighty ninety".split()
def words(n): return ONES[n] if n < 20 else TENS[n // 10] + ("" if n % 10 == 0 else "-" + ONES[n % 10])
def slug(s): return re.sub(r"[^a-z0-9]+", "_", s.lower()).strip("_")
def save(text, file, speed=1.12):
    s, sr = k.create(text, voice=VOICE, speed=speed, lang="en-gb")
    a = np.abs(s); idx = np.where(a > 0.012)[0]
    if len(idx): s = s[max(0, idx[0] - int(0.02 * sr)): min(len(s), idx[-1] + int(0.08 * sr))]
    pcm = (np.clip(s, -1, 1) * 32767).astype(np.int16).tobytes()
    e = lameenc.Encoder(); e.set_bit_rate(48); e.set_in_sample_rate(sr); e.set_channels(1); e.set_quality(2)
    open(os.path.join(OUT, file), "wb").write(e.encode(pcm) + e.flush())
jobs = []
for key, arr in LINES.items():
    for i, t in enumerate(arr): jobs.append((t, f"l_{key}_{i}.mp3", 1.12))
for n in NAMES: jobs.append((n + ",", f"n_{slug(n)}.mp3", 1.0))
for i in range(100): jobs.append((f"Number {words(i)},", f"c_{i}.mp3", 1.05))
part, parts = int(sys.argv[1]), int(sys.argv[2])
for j, (t, f, sp) in enumerate(jobs):
    if j % parts == part: save(t, f, sp)
if part == 0:
    man = {"voice": "Kokoro bm_george", "lines": {k2: len(v) for k2, v in LINES.items()}, "names": {n: slug(n) for n in NAMES}}
    json.dump(man, open(os.path.join(OUT, "manifest.json"), "w"))
print("part", part, "done", sum(1 for j in range(len(jobs)) if j % parts == part))
