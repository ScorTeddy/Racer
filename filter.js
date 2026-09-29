// Name filter: driver names, team names, usernames and AI names shown to strangers.
// Catches common swear words and slurs, including l33t-speak (a55, sh1t), s.p.a.c.e.d letters and
// doubled letters. It's a filter, not a perfect wall: the report button covers what slips through.
"use strict";

// stored lightly scrambled (reversed) so the word list doesn't pop up in searches of the code
const WORDS = [
  "kcuf", "tihs", "hctib", "tnuc", "kcid", "elohssa", "dratsab", "tuls", "erohw", "sinep", "anigav", "kcoc", "ggin", "aggin", "reggin", "toggaf", "gaf", "ekik", "cips", "knihc", "drater", "nrop", "yssup", "ssip", "knaw", "rekcuf", "gnikcuf", "tihsllub", "odlid", "zzij", "izan", "reltih", "epar", "tsipar", "tawt", "stit", "boob", "xes", "iatneh", "ynroh", "flim", "muc", "ekyd", "ynnart", "nooc", "tselom", "odep", "tsecni", "lana", "edun", "ftw", "ufts", "syk",
].map((w) => w.split("").reverse().join("").toLowerCase());
// real words/names that contain a bad word inside them and must be allowed
const OK_WORDS = ["class", "classic", "pass", "passion", "assassin", "bass", "grass", "glass", "mass", "brass", "sassy", "cassie",
  "scunthorpe", "cockpit", "peacock", "hancock", "shitake", "dickens", "dickson", "sussex", "essex", "cumbria", "cucumber",
  "document", "circumstance", "therapist", "analysis", "canal", "penistone", "shiitake", "hello", "shell", "sextant",
  "skunk", "spicy", "spice", "kipper", "cookie", "cooking", "cooker", "coco", "cumulus", "accumulate", "cumin", "scum", "document", "sextet", "sexton", "middlesex", "banal", "canal", "analog", "analyse", "analyze", "grape", "drape", "scrape", "trapeze", "rapeseed", "shiitake", "shift", "snigger", "bigger", "kiked", "raccoon", "cocoon", "tycoon", "cocktail", "cockatoo", "arsenal", "wtfc", "nigeria", "niger"];

const LEET = { 0: "o", 1: "i", 3: "e", 4: "a", 5: "s", 7: "t", 8: "b", 9: "g", "@": "a", $: "s", "!": "i", "|": "i", "+": "t", "€": "e" };
function squash(text) {
  let t = String(text || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  t = t.replace(/[013457 89@$!|+€]/g, (c) => LEET[c] ?? c);
  return t;
}
function isBad(text) {
  const base = squash(text);
  // check the words as typed, glued together (catches "f u c k" and "f.u.c.k"), and with doubled letters squashed
  const glued = base.replace(/[^a-z]/g, "");
  const single = glued.replace(/(.)\1+/g, "$1");
  let cleaned = glued, cleanedSingle = single;
  for (const ok of OK_WORDS) { cleaned = cleaned.split(ok).join("_"); cleanedSingle = cleanedSingle.split(ok.replace(/(.)\1+/g, "$1")).join("_"); }
  return WORDS.some((w) => {
    if (cleaned.includes(w)) return true;
    // "fuuuck"-style: compare with doubled letters squashed, but only when that still leaves a long,
    // clearly-bad word (so "coon" doesn't hit "falcon" and "nigg" doesn't hit "night")
    const sq = w.replace(/(.)\1+/g, "$1");
    return sq.length >= 4 && sq !== w ? cleanedSingle.includes(sq) : sq.length >= 4 && cleanedSingle.includes(sq);
  });
}
// what to show instead of a bad name
function clean(text, fallback) { return isBad(text) ? fallback : text; }

module.exports = { isBad, clean };
