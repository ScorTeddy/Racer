# Makes the race commentator clips in public/commentary. Run from a folder holding the Kokoro model files
# (kokoro-v1.0.onnx and voices-v1.0.bin, from github.com/thewh1teagle/kokoro-onnx releases):
#   pip install kokoro-onnx soundfile lameenc
#   python3 commentary_gen.py 0 1        (or split the work: "0 3", "1 3", "2 3" in three terminals)
# Voice: af_heart, Kokoro's best-rated voice. Lines with a driver's name are recorded as whole sentences
# (the name inside the sentence) so they sound natural, for every built-in AI name and "Number 0-99".
#   python3 commentary_gen.py text      (just rewrite lines.json: the text of every clip, for ElevenLabs voices)
import sys, json, os, re
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "public", "commentary")
TEXT_ONLY = len(sys.argv) > 1 and sys.argv[1] == "text"
if not TEXT_ONLY:
    import numpy as np, lameenc
    from kokoro_onnx import Kokoro
    k = Kokoro("kokoro-v1.0.onnx", "voices-v1.0.bin")
VOICE, LANG, SPEED = "af_heart", "en-us", 1.04
LINES = {
  "start": ["And it's lights out, and away we go!", "Lights out, and we are racing!", "And they're away! Here we go!"],
  "crash": ["Oh! Contact! That is a big moment!", "Oh, they've come together there!", "Ooh, a crash! That's going to leave a mark.", "Oh no, there's been a collision!"],
  "crashBig": ["Oh my goodness! That is a huge accident!", "Wow! That is a massive crash!"],
  "win": ["And there's the chequered flag! What a race!", "And that's the win! What a drive!"],
  "winYou": ["And you've won it! What a drive! Absolutely sensational!", "Victory! You've done it! What a race!"],
  "photo": ["It's a photo finish! Too close to call!", "Side by side to the line! What a finish!"],
  "lastLap": ["Final lap! This is it!", "One lap to go! Everything is on the line now!", "Here comes the last lap!"],
  "scOut": ["Safety car! The safety car is out!", "And that brings out the safety car."],
  "scIn": ["The safety car is in, and we're back to green!", "Green flag! We are racing again!"],
  "rain": ["And here comes the rain! This changes everything!", "It's starting to rain! Time to think about wet tyres."],
  "lead": ["And we have a new leader!", "There's a change at the front!"],
  "leadYou": ["And you're into the lead! Fantastic driving!", "You take the lead! Brilliant move!"],
  "elim": ["And another car is knocked out!", "Knocked out! And the field gets smaller!"],
  "elimYou": ["Oh, you're out! So unlucky!", "Knocked out! That's the end of your race."],
  "standing": ["And that's the last car standing! What a finish!"],
  "classWin": ["And that's the class win! Superb!"],
  "puncture": ["Oh, a puncture! That's a disaster!", "Oh no, a flat tyre! That's going to hurt."],
  "fastest": ["And that's the fastest lap of the race!"],
  "pitGood": ["What a pit stop! Lightning fast!", "Brilliant stop from the crew!"],
  "pitBad": ["Oh, a slow stop. That's cost some time.", "Trouble in the pits! A slow stop."],
}
# whole sentences with a name in them: {N} = the driver
NAMED = {
  "win": "{N} wins the race! What a drive!",
  "lead": "And {N} takes the lead!",
  "elim": "{N} is knocked out!",
}
NAMES = ["Bolt","Nova","Rusty","Vex","Kira","Moss","Blaze","Juno","Ziggy","Pip","Axel","Luna","Dash","Echo","Finn","Gemma","Hugo","Ivy","Jett","Kai","Lola","Milo","Nash","Orla","Pike","Quinn","Rex","Sage","Taro","Uma","Vince","Wren","Xander","Yuki","Zane","Ace Jr","Bree","Cruz","Dex","Elio","Flint","Gio","Hana","Ines","Jasper","Kenji","Leon","Mara","Nico","Otto","Pia","Rafa","Sol","Tess","Ulla","Vito","Wade","Xia","Yara","Zeke","Aria","Bram","Cleo","Dario","Elsa","Fox","Greta","Hank","Iker","Jules","Knox","Lars","Mika","Noor","Oskar","Petra","Rio","Sven","Tomas","Vera","Willa","Yusuf","Zora","Arlo","Bex","Cato","Dunya","Enzo","Freya","Gus"]
ONES = "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen".split()
TENS = "_ _ twenty thirty forty fifty sixty seventy eighty ninety".split()
def words(n): return ONES[n] if n < 20 else TENS[n // 10] + ("" if n % 10 == 0 else "-" + ONES[n % 10])
def slug(s): return re.sub(r"[^a-z0-9]+", "_", s.lower()).strip("_")
def save(text, file):
    s, sr = k.create(text, voice=VOICE, speed=SPEED, lang=LANG)
    a = np.abs(s); idx = np.where(a > 0.01)[0]
    if len(idx): s = s[max(0, idx[0] - int(0.03 * sr)): min(len(s), idx[-1] + int(0.12 * sr))]
    pcm = (np.clip(s, -1, 1) * 32767).astype(np.int16).tobytes()
    e = lameenc.Encoder(); e.set_bit_rate(48); e.set_in_sample_rate(sr); e.set_channels(1); e.set_quality(2)
    open(os.path.join(OUT, file), "wb").write(e.encode(pcm) + e.flush())
jobs = []
for key, arr in LINES.items():
    for i, t in enumerate(arr): jobs.append((t, f"l_{key}_{i}.mp3"))
subjects = [(slug(n), n) for n in NAMES] + [(f"n{i}", f"Number {words(i)}") for i in range(100)]
for key, tpl in NAMED.items():
    for sl, spoken in subjects: jobs.append((tpl.replace("{N}", spoken), f"s_{key}_{sl}.mp3"))
# every clip's text, so the server can have ElevenLabs say the same lines (COMMENTATOR_VOICE)
json.dump({f: t for t, f in jobs}, open(os.path.join(OUT, "lines.json"), "w"), indent=0)
if TEXT_ONLY: sys.exit(0)
part, parts = int(sys.argv[1]), int(sys.argv[2])
for j, (t, f) in enumerate(jobs):
    if j % parts == part: save(t, f)
if part == 0:
    man = {"voice": f"Kokoro {VOICE}", "v": 2, "lines": {k2: len(v) for k2, v in LINES.items()}, "named": list(NAMED.keys()), "names": {n: slug(n) for n in NAMES}}
    json.dump(man, open(os.path.join(OUT, "manifest.json"), "w"))
print("part", part, "done")
