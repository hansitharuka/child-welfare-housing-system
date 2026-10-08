import { describe, expect, it } from "vitest";
import places from "../../data/places.json";
import stages from "../../data/stages.json";
import { LOCALES } from "@/i18n/locales";
import { nameField } from "./names";
import { transliterate } from "./transliterate";
import { officeSchema } from "./validation/lists";

const ZWJ = String.fromCharCode(0x200d);

describe("writing a name in another language's letters (UI-9)", () => {
  it("writes Sinhala place names in Tamil and English letters as the seed list has them", () => {
    for (const [si, ta, en] of [
      ["හෝමාගම", "ஹோமாகம", "Homagama"],
      ["මහරගම", "மஹரகம", "Maharagama"],
      ["කැස්බෑව", "கெஸ்பேவ", "Kesbewa"],
      ["පාදුක්ක", "பாதுக்க", "Padukka"],
      ["තිඹිරිගස්යාය", "திம்பிரிகஸ்யாய", "Thimbirigasyaya"],
    ]) {
      expect(transliterate(si, "ta")).toBe(ta);
      expect(transliterate(si, "en")).toBe(en);
    }
  });

  it("spells English as Sri Lankan place names do, with th, ee and w", () => {
    expect(transliterate("සීතාවක", "en")).toBe("Seethawaka");
    expect(transliterate("කඩුවෙල", "en")).toBe("Kaduwela");
    expect(transliterate("නුවර එළිය", "en")).toBe("Nuwara Eliya");
  });

  it("writes by sound, not by meaning, so a name known by another form comes out differently", () => {
    expect(transliterate("කොළඹ", "en")).toBe("Kolamba");
    expect(transliterate("අත්තිවාරම් මට්ටම", "en")).toBe("Aththiwaram Mattama");
  });

  it("reads Tamil, with ட and ச between vowels sounding as d and s", () => {
    expect(transliterate("உடுவில்", "si")).toBe("උඩුවිල්");
    expect(transliterate("உடுவில்", "en")).toBe("Uduvil");
    expect(transliterate("பேசாலை", "en")).toBe("Pesalai");
    expect(transliterate("கிளிநொச்சி", "en")).toBe("Kilinochchi");
  });

  it("starts no Tamil word with ர", () => {
    expect(transliterate("රත්මලාන", "ta")).toBe("இரத்மலான");
  });

  it("reads English spelling", () => {
    expect(transliterate("Padukka", "si")).toBe("පදුක්ක");
    expect(transliterate("Padukka", "ta")).toBe("பதுக்க");
    expect(transliterate("Ingiriya", "si")).toBe("ඉංගිරිය");
    expect(transliterate("Ingiriya", "ta")).toBe("இங்கிரிய");
    expect(transliterate("Kandy", "si")).toBe("කන්දි");
  });

  it("reads and writes the Sinhala vowel of කෘෂි", () => {
    expect(transliterate("කෘෂි", "en")).toBe("Krushi");
    expect(transliterate("கிருஷி", "si")).toBe("කිරුෂි");
    expect(transliterate("කෘෂි", "ta")).toBe("க்ருஷி");
  });

  it("joins ර to the consonant before it in Sinhala, as in ප්‍ර", () => {
    expect(transliterate("Pradeshiya", "si")).toBe(`ප්${ZWJ}රදෙශිය`);
    expect(transliterate(`ප්${ZWJ}රාදේශීය`, "en")).toBe("Pradesheeya");
  });

  it("keeps what is already in the wanted letters, and anything that is not a letter", () => {
    expect(transliterate(`ප්${ZWJ}රා.ලේ.`, "si")).toBe(`ප්${ZWJ}රා.ලේ.`);
    expect(transliterate("පරීක්ෂණ කාර්යාලය QAB", "en")).toBe("Pareekshana Karyalaya QAB");
    expect(transliterate("Valikamam East / Kopay", "en")).toBe("Valikamam East / Kopay");
  });

  it("writes every seed office's and stage's name in the other languages within the name rules", () => {
    const entries = [...places.dsOffices, ...stages.NEW_HOUSE];
    for (const entry of entries) {
      for (const from of LOCALES) {
        for (const to of LOCALES.filter((other) => other !== from)) {
          const written = transliterate(entry[nameField(from)], to);
          const rule = officeSchema.shape[nameField(to)];
          expect(rule.safeParse(written).success, `${from} → ${to}: ${written}`).toBe(true);
        }
      }
    }
  });
});
