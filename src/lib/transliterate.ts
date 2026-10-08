import type { Locale } from "@/i18n/locales";

/**
 * UI-9: writes a place or stage name in another language's letters, by sound, so the admin types a name
 * once and every screen can show it in its own script. It is transliteration, not translation:
 * "හෝමාගම" becomes "ஹோமாகம" and "Homagama", but "කොළඹ" becomes "Kolamba", not "Colombo". The admin
 * corrects a written name on the lists screen.
 *
 * Each run of Sinhala, Tamil or English letters is read into sounds and written out again; a run already
 * in the wanted letters, and anything that is not a letter, is kept as it is.
 */
export function transliterate(text: string, to: Locale): string {
  let out = "";
  for (const run of runs(text.normalize("NFC"))) {
    if (run.script === null || run.script === to) {
      out += run.text;
      continue;
    }
    const wordStart = out === "" || !/[\p{L}\p{M}]$/u.test(out);
    const sounds = READ[run.script](run.text);
    const written = WRITE[to](sounds, run.script, wordStart);
    out += to === "en" && wordStart ? written.charAt(0).toUpperCase() + written.slice(1) : written;
  }
  return out;
}

/**
 * A consonant, a vowel, or a nasal that takes the place of the next consonant (Sinhala ං).
 * A consonant followed by a vowel carries it; one followed by anything else has none.
 */
type Sound = { kind: "C" | "V"; id: string } | { kind: "M" };

type Run = { script: Locale | null; text: string };

const JOINERS = new Set([String.fromCharCode(0x200c), String.fromCharCode(0x200d)]);
const ZWJ = String.fromCharCode(0x200d);

function scriptOf(char: string): Locale | null {
  const code = char.codePointAt(0) ?? 0;
  if (code >= 0x0d80 && code <= 0x0dff) return "si";
  if (code >= 0x0b80 && code <= 0x0bff) return "ta";
  if (/[A-Za-z]/.test(char)) return "en";
  return null;
}

/** Splits text into runs of one script's letters; each other character is a run of its own. */
function runs(text: string): Run[] {
  const list: Run[] = [];
  for (const char of text) {
    const last = list.at(-1);
    // A zero-width joiner belongs to the Sinhala or Tamil letters around it (as in ප්‍ර).
    const script = JOINERS.has(char) && last?.script ? last.script : scriptOf(char);
    if (script !== null && last?.script === script) last.text += char;
    else list.push({ script, text: char });
  }
  return list;
}

// ---- Reading ----

// prettier-ignore
const SI_CONSONANTS: Record<string, string> = {
  ක: "k", ඛ: "kh", ග: "g", ඝ: "gh", ඞ: "ng", ඟ: "ngg",
  ච: "c", ඡ: "ch", ජ: "j", ඣ: "jh", ඤ: "ny", ඥ: "gny", ඦ: "nyj",
  ට: "T", ඨ: "Th", ඩ: "D", ඪ: "Dh", ණ: "N", ඬ: "ND",
  ත: "t", ථ: "th", ද: "d", ධ: "dh", න: "n", ඳ: "nd",
  ප: "p", ඵ: "ph", බ: "b", භ: "bh", ම: "m", ඹ: "mb",
  ය: "y", ර: "r", ල: "l", ව: "v", ශ: "sh", ෂ: "Sh", ස: "s", හ: "h", ළ: "L", ෆ: "f",
};

// prettier-ignore
const SI_VOWELS: Record<string, string> = {
  අ: "a", ආ: "aa", ඇ: "ae", ඈ: "aae", ඉ: "i", ඊ: "ii", උ: "u", ඌ: "uu", ඍ: "ri", ඎ: "ri",
  එ: "e", ඒ: "ee", ඓ: "ai", ඔ: "o", ඕ: "oo", ඖ: "au",
};

// prettier-ignore
const SI_SIGNS: Record<string, string> = {
  "ා": "aa", "ැ": "ae", "ෑ": "aae", "ි": "i", "ී": "ii", "ු": "u", "ූ": "uu", "ෘ": "ri", "ෲ": "ri",
  "ෙ": "e", "ේ": "ee", "ෛ": "ai", "ො": "o", "ෝ": "oo", "ෞ": "au",
};

const SI_VIRAMA = "්";
const SI_ANUSVARA = "ං";

// prettier-ignore
const TA_CONSONANTS: Record<string, string> = {
  க: "k", ங: "ng", ச: "c", ஞ: "ny", ட: "T", ண: "N", த: "t", ந: "n", ப: "p", ம: "m",
  ய: "y", ர: "r", ல: "l", வ: "v", ழ: "zh", ள: "L", ற: "R", ன: "nn",
  ஜ: "j", ஷ: "Sh", ஸ: "s", ஹ: "h", ஶ: "sh",
};

// prettier-ignore
const TA_VOWELS: Record<string, string> = {
  அ: "a", ஆ: "aa", இ: "i", ஈ: "ii", உ: "u", ஊ: "uu", எ: "e", ஏ: "ee", ஐ: "ai", ஒ: "o", ஓ: "oo", ஔ: "au",
};

// prettier-ignore
const TA_SIGNS: Record<string, string> = {
  "ா": "aa", "ி": "i", "ீ": "ii", "ு": "u", "ூ": "uu", "ெ": "e", "ே": "ee", "ை": "ai",
  "ொ": "o", "ோ": "oo", "ௌ": "au",
};

const TA_VIRAMA = "்";
const TA_AYTHAM = "ஃ";

type Letters = {
  consonants: Record<string, string>;
  vowels: Record<string, string>;
  signs: Record<string, string>;
  virama: string;
  /** Sinhala ං. */
  nasal?: string;
  /** Two letters read as one consonant, such as Tamil ஃப. */
  pairs?: Record<string, string>;
};

/** Reads an abugida: each consonant has the vowel of its sign, none before a virama, or else "a". */
function readSyllables(text: string, letters: Letters): Sound[] {
  const chars = [...text];
  const sounds: Sound[] = [];
  for (let i = 0; i < chars.length; i++) {
    const char = chars[i];
    const pair = letters.pairs?.[char + (chars[i + 1] ?? "")];
    if (pair !== undefined) i++;
    const consonant = pair ?? letters.consonants[char];
    if (consonant === undefined) {
      if (letters.vowels[char] !== undefined) sounds.push({ kind: "V", id: letters.vowels[char] });
      else if (char === letters.nasal) sounds.push({ kind: "M" });
      // Joiners, and marks with no letter of their own, are left out.
      continue;
    }
    sounds.push({ kind: "C", id: consonant });
    const next = chars[i + 1];
    if (next === letters.virama) i++;
    else if (next !== undefined && letters.signs[next] !== undefined) {
      sounds.push({ kind: "V", id: letters.signs[next] });
      i++;
    } else sounds.push({ kind: "V", id: "a" });
  }
  return sounds;
}

function readSinhala(text: string): Sound[] {
  return readSyllables(text, {
    consonants: SI_CONSONANTS,
    vowels: SI_VOWELS,
    signs: SI_SIGNS,
    virama: SI_VIRAMA,
    nasal: SI_ANUSVARA,
  });
}

function readTamil(text: string): Sound[] {
  const sounds = readSyllables(text, {
    consonants: TA_CONSONANTS,
    vowels: TA_VOWELS,
    signs: TA_SIGNS,
    virama: TA_VIRAMA,
    pairs: { [TA_AYTHAM + "ப"]: "f" },
  });
  // Between vowels, Tamil ட sounds as "d" (உடுவில், Uduvil) and ச as "s" (பேசாலை, Pesalai).
  return sounds.map((sound, i) => {
    if (sound.kind !== "C" || (sound.id !== "T" && sound.id !== "c")) return sound;
    if (sounds[i - 1]?.kind !== "V" || sounds[i + 1]?.kind !== "V") return sound;
    return { kind: "C", id: sound.id === "T" ? "D" : "s" };
  });
}

// prettier-ignore
const EN_VOWELS: [string, string][] = [
  ["aa", "aa"], ["ae", "ae"], ["ai", "ai"], ["au", "au"], ["ee", "ii"], ["ii", "ii"], ["oo", "uu"], ["uu", "uu"],
  ["a", "a"], ["e", "e"], ["i", "i"], ["o", "o"], ["u", "u"],
];

// prettier-ignore
const EN_CONSONANTS: [string, string[]][] = [
  ["ch", ["c"]], ["sh", ["sh"]], ["zh", ["zh"]], ["th", ["t"]], ["dh", ["d"]],
  ["kh", ["kh"]], ["gh", ["gh"]], ["bh", ["bh"]], ["ph", ["f"]],
  ["b", ["b"]], ["c", ["k"]], ["d", ["d"]], ["f", ["f"]], ["g", ["g"]], ["h", ["h"]], ["j", ["j"]],
  ["k", ["k"]], ["l", ["l"]], ["m", ["m"]], ["n", ["n"]], ["p", ["p"]], ["q", ["k"]], ["r", ["r"]],
  ["s", ["s"]], ["t", ["t"]], ["v", ["v"]], ["w", ["v"]], ["x", ["k", "s"]], ["y", ["y"]], ["z", ["s"]],
];

const isEnglishVowel = (char: string | undefined) => char !== undefined && "aeiou".includes(char);

/** Reads English spelling as Sri Lankan place names use it: "th" for ත, "ee" for ඊ, "w" for ව. */
function readEnglish(text: string): Sound[] {
  const word = text.toLowerCase();
  const sounds: Sound[] = [];
  let i = 0;
  while (i < word.length) {
    const vowel = EN_VOWELS.find(([spelling]) => word.startsWith(spelling, i));
    if (vowel) {
      sounds.push({ kind: "V", id: vowel[1] });
      i += vowel[0].length;
      continue;
    }
    const char = word[i];
    // "n" before "g" or "k" is the nasal of ලංකා and ඉංගිරිය.
    if (char === "n" && (word[i + 1] === "g" || word[i + 1] === "k")) {
      sounds.push({ kind: "M" });
      i++;
      continue;
    }
    // "y" after a consonant and before no vowel is a vowel, as in "Kandy".
    if (char === "y" && sounds.at(-1)?.kind === "C" && !isEnglishVowel(word[i + 1])) {
      sounds.push({ kind: "V", id: "i" });
      i++;
      continue;
    }
    const consonant = EN_CONSONANTS.find(([spelling]) => word.startsWith(spelling, i));
    if (!consonant) {
      i++;
      continue;
    }
    for (const id of consonant[1]) sounds.push({ kind: "C", id });
    i += consonant[0].length;
  }
  return sounds;
}

const READ: Record<Locale, (text: string) => Sound[]> = { si: readSinhala, ta: readTamil, en: readEnglish };

// ---- Writing ----

// prettier-ignore
const SI_LETTERS: Record<string, string> = {
  k: "ක", kh: "ඛ", g: "ග", gh: "ඝ", ng: "ඞ", ngg: "ඟ",
  c: "ච", ch: "ඡ", j: "ජ", jh: "ඣ", ny: "ඤ", gny: "ඥ", nyj: "ඦ",
  T: "ට", Th: "ඨ", D: "ඩ", Dh: "ඪ", N: "ණ", ND: "ඬ",
  t: "ත", th: "ථ", d: "ද", dh: "ධ", n: "න", nd: "ඳ",
  p: "ප", ph: "ඵ", b: "බ", bh: "භ", m: "ම", mb: "ඹ",
  y: "ය", r: "ර", l: "ල", v: "ව", sh: "ශ", Sh: "ෂ", s: "ස", h: "හ", L: "ළ", f: "ෆ",
  zh: "ළ", R: "ර", nn: "න",
};

// "ri" is written with the short ඍ and ෘ.
const SI_VOWEL_LETTERS: Record<string, string> = {
  ...Object.fromEntries(Object.entries(SI_VOWELS).map(([letter, id]) => [id, letter])),
  ri: "ඍ",
};
const SI_SIGN_LETTERS: Record<string, string> = {
  ...Object.fromEntries(Object.entries(SI_SIGNS).map(([sign, id]) => [id, sign])),
  a: "",
  ri: "ෘ",
};

function writeSinhala(sounds: Sound[]): string {
  let out = "";
  for (let i = 0; i < sounds.length; i++) {
    const sound = sounds[i];
    const next = sounds[i + 1];
    if (sound.kind === "M") out += SI_ANUSVARA;
    else if (sound.kind === "V") out += SI_VOWEL_LETTERS[sound.id];
    else if (next?.kind === "V") {
      out += SI_LETTERS[sound.id] + SI_SIGN_LETTERS[next.id];
      i++;
    } else if (sound.id === "ng") out += SI_ANUSVARA;
    else {
      out += SI_LETTERS[sound.id] + SI_VIRAMA;
      // ර and ය after a consonant join it (ප්‍ර, ක්‍ය).
      if (next?.kind === "C" && (next.id === "r" || next.id === "y") && sound.id !== "r") out += ZWJ;
    }
  }
  return out;
}

// prettier-ignore
const TA_LETTERS: Record<string, string> = {
  k: "க", kh: "க", g: "க", gh: "க", ng: "ங", ngg: "ங்க",
  c: "ச", ch: "ச", j: "ஜ", jh: "ஜ", ny: "ஞ", gny: "க்ஞ", nyj: "ஞ்ச",
  T: "ட", Th: "ட", D: "ட", Dh: "ட", N: "ண", ND: "ண்ட",
  t: "த", th: "த", d: "த", dh: "த", nd: "ந்த",
  p: "ப", ph: "ப", b: "ப", bh: "ப", m: "ம", mb: "ம்ப",
  y: "ய", r: "ர", l: "ல", v: "வ", sh: "ஷ", Sh: "ஷ", s: "ஸ", h: "ஹ", L: "ள", f: "ஃப",
  zh: "ழ", R: "ற", nn: "ன",
};

const TA_VOWEL_LETTERS: Record<string, string> = {
  ...Object.fromEntries(Object.entries(TA_VOWELS).map(([letter, id]) => [id, letter])),
  ae: "எ",
  aae: "ஏ",
  ri: "ரு",
};
const TA_SIGN_LETTERS: Record<string, string> = {
  ...Object.fromEntries(Object.entries(TA_SIGNS).map(([sign, id]) => [id, sign])),
  a: "",
  ae: "ெ",
  aae: "ே",
  ri: "்ரு",
};

const DENTALS = new Set(["t", "th", "d", "dh", "nd"]);
/** The nasal Tamil writes for Sinhala ං, by the consonant after it. */
const TA_NASALS: [Set<string>, string][] = [
  [new Set(["k", "kh", "g", "gh", "ng", "ngg"]), "ங"],
  [new Set(["c", "ch", "j", "jh", "ny", "nyj", "gny"]), "ஞ"],
  [new Set(["T", "Th", "D", "Dh", "N", "ND"]), "ண"],
  [DENTALS, "ந"],
  [new Set(["p", "ph", "b", "bh", "m", "mb", "f"]), "ம"],
];

function writeTamil(sounds: Sound[], _from: Locale, wordStart: boolean): string {
  let out = "";
  for (let i = 0; i < sounds.length; i++) {
    const sound = sounds[i];
    const next = sounds[i + 1];
    const first = wordStart && i === 0;
    if (sound.kind === "M") {
      const nasal = next?.kind === "C" ? TA_NASALS.find(([ids]) => ids.has(next.id))?.[1] : undefined;
      out += (nasal ?? (next === undefined ? "ம" : "ங")) + TA_VIRAMA;
    } else if (sound.kind === "V") out += TA_VOWEL_LETTERS[sound.id];
    else {
      // Tamil starts no word with ர (இரத்மலானை), writes ந first and before த, and ன elsewhere.
      if (first && sound.id === "r") out += "இ";
      let letter = TA_LETTERS[sound.id];
      if (sound.id === "n") letter = first || (next?.kind === "C" && DENTALS.has(next.id)) ? "ந" : "ன";
      if (next?.kind === "V") {
        out += letter + TA_SIGN_LETTERS[next.id];
        i++;
      } else out += letter + TA_VIRAMA;
    }
  }
  return out;
}

// prettier-ignore
const EN_LETTERS: Record<string, string> = {
  k: "k", kh: "kh", g: "g", gh: "gh", ng: "ng", ngg: "ng",
  c: "ch", ch: "chh", j: "j", jh: "jh", ny: "ny", gny: "gn", nyj: "nj",
  T: "t", Th: "th", D: "d", Dh: "dh", N: "n", ND: "nd",
  t: "th", th: "th", d: "d", dh: "dh", n: "n", nd: "nd",
  p: "p", ph: "ph", b: "b", bh: "bh", m: "m", mb: "mb",
  y: "y", r: "r", l: "l", v: "v", sh: "sh", Sh: "sh", s: "s", h: "h", L: "l", f: "f",
  zh: "zh", R: "r", nn: "n",
};

// prettier-ignore
const EN_VOWEL_LETTERS: Record<string, string> = {
  a: "a", aa: "a", ae: "e", aae: "e", i: "i", ii: "ee", u: "u", uu: "u", ri: "ru",
  e: "e", ee: "e", ai: "ai", o: "o", oo: "o", au: "au",
};

const LABIALS = new Set(["p", "ph", "b", "bh", "m", "mb"]);

function writeEnglish(sounds: Sound[], from: Locale): string {
  let out = "";
  for (let i = 0; i < sounds.length; i++) {
    const sound = sounds[i];
    const next = sounds[i + 1];
    if (sound.kind === "M") out += next?.kind === "C" && LABIALS.has(next.id) ? "m" : "n";
    else if (sound.kind === "V") out += EN_VOWEL_LETTERS[sound.id];
    // Sinhala ව is "w" (Kaduwela) and Tamil ட is "d" (Vaddukoddai), as the places' English names have them.
    else if (sound.id === "v") out += from === "si" ? "w" : "v";
    else if (sound.id === "T") out += from === "ta" ? "d" : "t";
    else out += EN_LETTERS[sound.id];
  }
  return out;
}

const WRITE: Record<Locale, (sounds: Sound[], from: Locale, wordStart: boolean) => string> = {
  si: writeSinhala,
  ta: writeTamil,
  en: writeEnglish,
};
