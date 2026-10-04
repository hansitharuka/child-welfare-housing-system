/**
 * A made-up sample of the Ministry's progress sheet, "ප්‍රගතිය - දිවියට සවියක්.xlsx", for building and
 * testing the sheet import (Phase 8). It copies the real file's layout and its oddities, but every
 * person in it is made up (SEC-11), so it can go wherever the real sheet must not.
 *
 *   npm run sheet:sample                        writes data/sample-sheet.xlsx, which git ignores
 *   npm run sheet:sample -- --out <file.xlsx>   writes it somewhere else
 *   npm run sheet:sample -- --seed 7            other people; the same seed always gives the same sheet
 *
 * As in the real file:
 * - Two tabs: නිවාසගත (care leavers, 240 rows) and අවදානම් දරුවන් (children at risk, 504 rows).
 * - Two header rows. A grouped column (the four installments, the four building levels) has its group
 *   on row 1 and its own name on row 2. Every other header is merged over both rows, except the care
 *   leavers' district, whose header is on row 2 only.
 * - Sinhala headers with zero-width joiners (ප්‍ර, ල්‍ය, ත්‍ර). Two columns have no header at all: the
 *   care leavers' phone numbers and the children's serial numbers. The DS office's header is
 *   ප්‍රා.ලේ. කොට්ඨාසය on one tab and ප්‍රා.ලේ. කාර්යාලය on the other.
 * - Districts and DS offices as officers wrote them: in Sinhala or English, in other spellings, with
 *   extra spaces or zero-width characters, and a few that match nothing on the list.
 * - NICs and phone numbers mostly missing. Excel holds some as numbers, which drops a phone's first 0.
 * - A serial number used twice, a block of rows with no serial number, and an empty row.
 * - Short notes, not amounts, in the installment and level columns, and some coloured cells.
 *
 * makeSampleSheet() also returns an answer key for the import's tests (AC-19): for each row, the DS
 * office it belongs to, its NIC and phone numbers once tidied, and what is odd about it.
 */
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import ExcelJS from "exceljs";
import places from "../data/places.json";
import type { Category } from "../src/generated/prisma/enums";
import { generator, GIVEN_NAMES, madeUpNic, madeUpPhone, type Random, ROADS, type Share, SURNAMES } from "./made-up";

export const CARE_LEAVER_TAB = "නිවාසගත";
export const CHILD_AT_RISK_TAB = "අවදානම් දරුවන්";
const CARE_LEAVER_ROWS = 240;
const CHILD_AT_RISK_ROWS = 504;
const DEFAULT_OUT = "data/sample-sheet.xlsx";

const ZWJ = "‍";
const ZWNJ = "‌";

/** What can be odd about a row, for the import to handle or to report (IMP-2 to IMP-7). */
export const QUIRKS = {
  emptyRow: "nothing in it at all",
  noSerial: "no serial number",
  repeatedSerial: "the serial number of the row above",
  englishDistrict: "the district in English",
  districtSpelling: "the district spelled unlike the list, for example අනුරාධපුර for අනුරාධපුරය, or Mullative",
  noDistrict: "no district",
  unknownDistrict: "a district that is not on the list",
  englishOffice: "the DS office in English",
  officeSpelling: "the DS office as on the list once spaces, capitals and zero-width characters are ignored",
  noOffice: "no DS office",
  unknownOffice: "no DS office of that name in the district",
  officeInOtherDistrict: "the name of a DS office in another district",
  noName: "no name (the guardian's, on the children's tab)",
  noChildName: "no child's name",
  sameGuardian: "another child of the guardian on the row above",
  nicAsNumber: "a 12-digit NIC that Excel holds as a number",
  nicLowercase: "an old NIC with a small v",
  nicWithSpace: "an old NIC with a space before the v",
  badNic: "a NIC with the wrong number of digits",
  phoneAsNumber: "a phone number that Excel holds as a number, without its first 0",
  twoPhones: "two phone numbers in one cell",
  threePhones: "three phone numbers in one cell",
  badPhone: "a phone number with a digit missing",
  multilineNote: "an installment note on several lines",
  numberRemark: "a remark that is a number",
  coloured: "coloured cells, which the import ignores",
} as const;

export type Quirk = keyof typeof QUIRKS;

/** The answer key for one row of the sample sheet. */
export type SampleRow = {
  category: Category;
  /** The row's number in its tab. People start on row 3. */
  row: number;
  serial: number | null;
  /** The English name (data/places.json) of the district the row means; null when the sheet doesn't say. */
  district: string | null;
  /** The code (data/places.json) of the DS office the row belongs to; null when the sheet doesn't say clearly. */
  officeCode: string | null;
  /** The care leaver's name, or the guardian's on the children's tab. */
  name: string | null;
  childName: string | null;
  /** As stored: capitals, no spaces. Null when missing or not a valid NIC. */
  nic: string | null;
  /** As stored: 10 digits starting with 0. */
  phones: string[];
  quirks: Quirk[];
};

export type SampleSheet = { workbook: ExcelJS.Workbook; rows: SampleRow[] };

// --- The layout -----------------------------------------------------------------------------------

/** A header cell, or a merged range with its text in the first cell. Null leaves it empty. */
type Header = [range: string, text: string | null];

// The headers' text exactly as in the real sheet, zero-width joiners included.
const DISTRICT = `දිස්ත්${ZWJ}රික්කය`;
const FINANCIAL = `මූල්${ZWJ}ය ප්${ZWJ}රගතිය (රු)`;
const PHYSICAL = `භෞතික ප්${ZWJ}රගතිය`;

const CARE_LEAVER_HEADERS: Header[] = [
  ["A1:A2", "අනු අංකය"],
  ["B1:B2", "නම"],
  ["C1:C2", "ජාතික හැඳුනුම්පත් අංකය"],
  ["D1:D2", "ලිපිනය"],
  ["E1:E2", null], // the phone numbers
  ["F2", DISTRICT], // row 1 above it stays empty
  ["G1:G2", `ප්${ZWJ}රා.ලේ. කොට්ඨාසය`],
  ["H1:K1", FINANCIAL],
  ["H2", "පළමු වාරිකය"],
  ["I2", "දෙවන වාරිකය"],
  ["J2", "තුන්වන වාරිකය"],
  ["K2", "සිව්වන වාරිකය"],
  ["L1:O1", PHYSICAL],
  ["L2", "Foundation Level"],
  ["M2", "Wall Level"],
  ["N2", "Roof Level"],
  ["O2", "Completed"],
  ["P1:P2", "Remark"],
];

const CHILD_AT_RISK_HEADERS: Header[] = [
  ["A1:A2", null], // the serial numbers
  ["B1:B2", "දරුවාගේ නම"],
  ["C1:C2", "භාරකරුගේ නම"],
  ["D1:D2", "භාරකරුගේ ජාතික හැඳුනුම්පත් අංකය"],
  ["E1:E2", "ලිපිනය"],
  ["F1:F2", "දුරකතන අංකය"],
  ["G1:G2", DISTRICT],
  ["H1:H2", `ප්${ZWJ}රා.ලේ. කාර්යාලය`],
  ["I1:L1", FINANCIAL],
  ["I2", "පළමු වාරිකය"],
  ["J2", "දෙවන වාරිකය"],
  ["K2", "තුන්වන වාරිකය"],
  ["L2", "සිව්වන වාරිකය"],
  ["M1:P1", PHYSICAL],
  ["M2", "Foundation Level"],
  ["N2", "Wall Level"],
  ["O2", "Roof Level"],
  ["P2", "Completed"],
  ["Q1:Q2", "Remark"],
];

type Cell = string | number | null;

/** One row as officers typed it. */
type Written = {
  serial: number | null;
  name: Cell;
  childName: Cell;
  nic: Cell;
  address: Cell;
  phone: Cell;
  district: Cell;
  office: Cell;
  installments: Cell[];
  levels: Cell[];
  remark: Cell;
  /** Officers colour a name, or a row's details, to mark it. */
  colour: { argb: string; cells: "name" | "details" } | null;
};

type Tab = {
  name: string;
  category: Category;
  headers: Header[];
  widths: number[];
  /** The row's cells, from column A. */
  cells: (w: Written) => Cell[];
  /** How many columns, from A, hold the person's details. The rest are progress notes and the remark. */
  detailColumns: number;
  /** The details' font size, in Calibri. The progress columns are Arial 10. */
  fontSize: number;
};

const TABS: Record<Category, Tab> = {
  CARE_LEAVER: {
    name: CARE_LEAVER_TAB,
    category: "CARE_LEAVER",
    headers: CARE_LEAVER_HEADERS,
    widths: [6, 19, 21, 31, 13, 13, 21, 14, 14, 13, 13, 13, 13, 13, 13, 32],
    cells: (w) => [
      w.serial,
      w.name,
      w.nic,
      w.address,
      w.phone,
      w.district,
      w.office,
      ...w.installments,
      ...w.levels,
      w.remark,
    ],
    detailColumns: 7,
    fontSize: 12,
  },
  CHILD_AT_RISK: {
    name: CHILD_AT_RISK_TAB,
    category: "CHILD_AT_RISK",
    headers: CHILD_AT_RISK_HEADERS,
    widths: [8, 28, 15, 18, 21, 13, 13, 13, 13, 13, 13, 13, 13, 13, 13, 13, 13],
    cells: (w) => [
      w.serial,
      w.childName,
      w.name,
      w.nic,
      w.address,
      w.phone,
      w.district,
      w.office,
      ...w.installments,
      ...w.levels,
      w.remark,
    ],
    detailColumns: 8,
    fontSize: 11,
  },
};

// --- Places ---------------------------------------------------------------------------------------

type Office = (typeof places.dsOffices)[number];

const DISTRICTS = new Map(places.districts.map((d) => [d.nameEn, d]));

function listed(district: string, nameEn: string): Office {
  const office = places.dsOffices.find((o) => o.district === district && o.nameEn === nameEn);
  if (!office) throw new Error(`The sample sheet needs the DS office "${nameEn}" (${district}) in data/places.json.`);
  return office;
}

/**
 * How the real sheet writes these districts: in English in the north, and in Sinhala spellings unlike
 * the list's. The others are written as on the list. A spelling listed twice is twice as common.
 */
const DISTRICT_AS_WRITTEN: Record<string, string[]> = {
  Jaffna: ["Jaffna"],
  Kilinochchi: ["Kilinochchi"],
  Mannar: ["Mannar"],
  Vavuniya: ["Vavuniya"],
  Mullaitivu: ["Mullative", "මුලතිව්"],
  Matara: ["මාතර", "මාතර", "මාතර", "Matara"],
  Anuradhapura: ["අනුරාධපුර"],
  Trincomalee: [`ත්${ZWJ}රීකුණාමලය`],
  Ratnapura: ["රත්නපුර"],
  Monaragala: ["මොණරාගල", "මොනරාගල"],
};

/** Districts where the sheet mostly names the DS office in English. */
const ENGLISH_OFFICE_DISTRICTS = new Set([
  "Jaffna",
  "Kilinochchi",
  "Mannar",
  "Vavuniya",
  "Mullaitivu",
  "Batticaloa",
  "Ampara",
  "Trincomalee",
]);

// --- Made-up people -------------------------------------------------------------------------------

/** Tamil names in English letters, as the sheet has them in the north and east. */
const TAMIL_GIVEN_NAMES = [
  "Sivakumar",
  "Tharshini",
  "Kajenthiran",
  "Nirojini",
  "Vithusan",
  "Mathivathani",
  "Kirushanthan",
  "Thusyanthi",
  "Piratheepan",
  "Sujeevan",
  "Kowsalya",
  "Nishanthini",
  "Kumaran",
  "Yalini",
  "Senthuran",
];
const TAMIL_SURNAMES = [
  "Selvarajah",
  "Kandasamy",
  "Sivalingam",
  "Thambirajah",
  "Nadarajah",
  "Ponnuthurai",
  "Rasiah",
  "Arumugam",
  "Murugesu",
  "Kanagaratnam",
];
const INITIALS = ["ඩබ්.", "එම්.", "ආර්.", "කේ.", "ජී.", "එච්.", "පී.", "ඒ.", "එස්.", "ටී.", "ඩී.", "එන්."];
const ENGLISH_INITIALS = ["K.", "S.", "M.", "T.", "R.", "N.", "P.", "V."];
const ENGLISH_ROADS = ["Temple Road", "Kovil Lane", "School Road", "Main Street", "Station Road"];

const NO = ["නැත", "නැත", "No", "නැැත"]; // the last has a doubled vowel sign, a slip seen in the real sheet
const STARTED = ["අත්තිවාරම් දැමීම ආරම්භ කර ඇත.", "අත්තිවාරම දමා ඇත", "අවසන් කර ඇත."];
const EXPECTED = [
  "පළමු වාරිකය ලබා දීමට නියමිතය",
  "පළමු වාරිකය 20 වන දින නිකුත් කිරීමට අපේක්ෂිතය",
  "ලියකියවිලි සකස් කර ගිණුම් අංශයට යොමු කර ඇත",
];
const CHILD_NOTES = [
  "නැත",
  "නැත",
  "නැත",
  "නිදහස් කර ඇත ",
  "නිදහස් කර ඇත",
  "නිදහස් කර නැත ",
  "නිදහස් කර නැත",
  "Oct 5 න් ආරම්භ වන සතියේ පළමු වාරිකය ගෙවීමට අපේක්ෂිතය",
];
const MULTILINE_NOTE = "\n\nනිදහස් කර නැත\n\n\n";
const REMARKS = ["ඉඩම පිළිබඳ ගැටලුවක් ඇත.", "පදිංචිය වෙනස් කර ඇත.", "නැවත පරීක්ෂා කිරීමට නියමිතය."];
const COLOURS: Written["colour"][] = [
  { argb: "FFFFFF00", cells: "name" },
  { argb: "FFD8E4BC", cells: "name" },
  { argb: "FFC5D9F1", cells: "details" },
  { argb: "FFF2DCDB", cells: "details" },
];

type NicForm = "plain" | "number" | "lowercase" | "space" | "elevenDigits" | "tenDigitsAndV";
type PhoneForm = "dashed" | "number" | "two" | "three" | "short";

/** How NICs and phone numbers are written on each tab, when there is one. */
const NIC_FORMS: Record<Category, Share<NicForm>> = {
  CARE_LEAVER: [
    ["plain", 1],
    ["lowercase", 1],
    ["number", 1],
  ],
  CHILD_AT_RISK: [
    ["number", 8],
    ["lowercase", 6],
    ["space", 1],
    ["plain", 1],
  ],
};
const PHONE_FORMS: Record<Category, Share<PhoneForm>> = {
  CARE_LEAVER: [
    ["dashed", 88],
    ["two", 10],
    ["number", 2],
  ],
  CHILD_AT_RISK: [
    ["number", 8],
    ["dashed", 2],
  ],
};
/** Share of rows with a NIC, a phone number or an address, as in the real sheet. */
const HAS = {
  CARE_LEAVER: { nic: 0.01, phone: 0.92, address: 0.8 },
  CHILD_AT_RISK: { nic: 0.07, phone: 0.09, address: 0.98 },
} as const;

const NIC_QUIRK: Record<NicForm, Quirk | null> = {
  plain: null,
  number: "nicAsNumber",
  lowercase: "nicLowercase",
  space: "nicWithSpace",
  elevenDigits: "badNic",
  tenDigitsAndV: "badNic",
};
const PHONE_QUIRK: Record<PhoneForm, Quirk | null> = {
  dashed: null,
  number: "phoneAsNumber",
  two: "twoPhones",
  three: "threePhones",
  short: "badPhone",
};

const oldNicDigits = (r: Random) =>
  `${r.int(60, 99)}${String(r.int(1, 366) + (r.chance(0.5) ? 500 : 0)).padStart(3, "0")}${r.int(1000, 9999)}`;
const newNic = (r: Random) => `${r.int(1960, 2006)}${String(r.int(1, 366)).padStart(3, "0")}${r.int(10000, 99999)}`;

/** The cell as written, and the NIC as the import should store it. */
function writeNic(r: Random, form: NicForm): [Cell, string | null] {
  switch (form) {
    case "plain": {
      const nic = madeUpNic(r);
      return [nic, nic];
    }
    case "number": {
      const nic = newNic(r);
      return [Number(nic), nic];
    }
    case "lowercase": {
      const digits = oldNicDigits(r);
      return [`${digits}v`, `${digits}V`];
    }
    case "space": {
      const digits = oldNicDigits(r);
      return [`${digits} v`, `${digits}V`];
    }
    case "elevenDigits":
      return [Number(newNic(r).slice(0, 11)), null];
    case "tenDigitsAndV":
      return [`${oldNicDigits(r)}${r.int(0, 9)}v`, null];
  }
}

const dashed = (phone: string) => `${phone.slice(0, 3)}-${phone.slice(3)}`;

/** The cell as written, and the phone numbers as the import should store them. */
function writePhone(r: Random, form: PhoneForm): [Cell, string[]] {
  const phones = Array.from({ length: form === "two" ? 2 : form === "three" ? 3 : 1 }, () => madeUpPhone(r));
  if (form === "number") return [Number(phones[0]), phones];
  if (form === "short") return [dashed(phones[0].slice(0, 9)), []];
  return [phones.map(dashed).join(" "), phones];
}

// --- Planning the rows ----------------------------------------------------------------------------

/** Everything decided about a row before it is written. */
type Plan = {
  /** The person's DS office. The row belongs to it unless there is a `problem`. */
  office: Office;
  /** The district and DS office as written. */
  district: string | null;
  officeAs: string | null;
  /** Why the import can't tell which DS office the row belongs to. */
  problem: Quirk | null;
  /** Names and addresses in English letters. */
  english: boolean;
  nic: NicForm | null;
  phone: PhoneForm | null;
  serial: "next" | "repeat" | "none";
  noName: boolean;
  noChildName: boolean;
  sameGuardian: boolean;
  multilineNote: boolean;
  numberRemark: boolean;
};

function randomPlan(r: Random, category: Category, office: Office): Plan {
  const english = ENGLISH_OFFICE_DISTRICTS.has(office.district) && r.chance(0.75);
  const has = HAS[category];
  return {
    office,
    district: r.pick(DISTRICT_AS_WRITTEN[office.district] ?? [DISTRICTS.get(office.district)!.nameSi]),
    officeAs: english ? office.nameEn : office.nameSi,
    problem: null,
    english,
    nic: r.chance(has.nic) ? r.weighted(NIC_FORMS[category]) : null,
    phone: r.chance(has.phone) ? r.weighted(PHONE_FORMS[category]) : null,
    serial: "next",
    noName: false,
    noChildName: false,
    sameGuardian: false,
    multilineNote: false,
    numberRemark: false,
  };
}

/** A row made to show one thing the import must handle. */
type Special = { near?: [district: string, nameEn: string]; apply: (plan: Plan) => void };

/** A row whose district and DS office are written this way. `near` is the office on the list it means. */
const place = (
  district: string | null,
  office: string | null,
  near: [string, string],
  problem: Quirk | null = null,
): Special => ({
  near,
  apply: (plan) => Object.assign(plan, { district, officeAs: office, problem, english: /[A-Za-z]/.test(office ?? "") }),
});

const detail = (change: Partial<Plan>): Special => ({ apply: (plan) => Object.assign(plan, change) });

const CARE_LEAVER_SPECIALS = mix(
  [
    place("Jaffna", "Nallur", ["Jaffna", "Nallur"]),
    place("Kilinochchi", "කරච්චි", ["Kilinochchi", "Karachchi"]),
    place("Mannar", "Mannar", ["Mannar", "Mannar"]),
    place("Matara", "වැලිගම", ["Matara", "Weligama"]),
    place("අනුරාධපුර", "තඹුත්තේගම", ["Anuradhapura", "Thambuttegama"]),
    place(`ත්${ZWJ}රීකුණාමලය`, "මූදූර්", ["Trincomalee", "Muttur"]),
    place("මොනරාගල", "බිබිල", ["Monaragala", "Bibile"]),
    place("රත්නපුර", "බලන්ගොඩ", ["Ratnapura", "Balangoda"]),
    place("Mullative", "Maritimepattu", ["Mullaitivu", "Maritimepattu"]),
    place("හම්බන්තොට", "බෙලි අත්ත", ["Hambantota", "Beliatta"]),
    place("ගාල්ල", `අම්බලන්${ZWNJ}ගොඩ`, ["Galle", "Ambalangoda"]),
    place("අම්පාර", "KALMUNAI", ["Ampara", "Kalmunai"]),
    place(" ගම්පහ ", "මීගමුව ", ["Gampaha", "Negombo"]),
    place("Jaffna", "Chavachchari", ["Jaffna", "Chavakachcheri"], "unknownOffice"),
    place("රත්නපුර", "ඇඹිලිපිටිය", ["Ratnapura", "Embilipitiya"], "unknownOffice"),
    place("Matara", "Matara Four Gravates", ["Matara", "Matara Four Gravets"], "unknownOffice"),
    // The list's නුවරගම් පළාත නැගෙනහිර, with its words in another order.
    place("අනුරාධපුර", "නැගෙනහිර නුවරගම් පළාත", ["Anuradhapura", "Nuwaragam Palatha East"], "unknownOffice"),
    place("මඩකලපුව", "Kantale", ["Batticaloa", "Batticaloa"], "officeInOtherDistrict"),
    place("කොළඹ", null, ["Colombo", "Homagama"], "noOffice"),
    place(null, "හෝමාගම", ["Colombo", "Homagama"], "noDistrict"),
    place("වන්නි", "Vavuniya", ["Vavuniya", "Vavuniya"], "unknownDistrict"),
  ],
  [
    detail({ nic: "lowercase" }),
    detail({ nic: "number" }),
    detail({ phone: "number" }),
    detail({ phone: "two" }),
    detail({ phone: "three" }),
    detail({ phone: "short" }),
    detail({ numberRemark: true }),
  ],
);

const CHILD_AT_RISK_SPECIALS = mix(
  [
    place("Jaffna", "Kopay", ["Jaffna", "Jaffna"], "unknownOffice"),
    place("Mullative", "Puthukudiyiruppu", ["Mullaitivu", "Puthukudiyiruppu"]),
    place("මඩකලපුව", "Eravur Pattu", ["Batticaloa", "Eravur Pattu"]),
    place("මඩකලපුව", "Koralaipattu", ["Batticaloa", "Koralai Pattu"]),
    place("අම්පාර", "Kalmunai", ["Ampara", "Kalmunai"]),
    place("මොනරාගල", "වැල්ලවාය", ["Monaragala", "Wellawaya"]),
    place("කුරුණෑගල", "කුලියාපිටිය බටහිර", ["Kurunegala", "Kuliyapitiya"], "unknownOffice"),
    place("Vavuniya", "Vengalacheddikulam", ["Vavuniya", "Vengalacheddikulam"]),
    place("Vavuniya", "Vengala Chenddikkulam", ["Vavuniya", "Vengalacheddikulam"], "unknownOffice"),
    place("මහනුවර", "මිනිපේ", ["Kandy", "Kundasale"], "unknownOffice"),
    place("Mannar", "Madhu", ["Mannar", "Madhu"]),
    place("කොළඹ", "කඩුවෙල ", ["Colombo", "Kaduwela"]),
    place("කොළඹ", "Maharagama", ["Colombo", "Maharagama"]),
  ],
  [
    detail({ nic: "space" }),
    detail({ nic: "lowercase" }),
    detail({ nic: "number" }),
    detail({ nic: "elevenDigits" }),
    detail({ nic: "tenDigitsAndV" }),
    detail({ phone: "number" }),
    detail({ noChildName: true }),
    detail({ noName: true }),
    detail({ multilineNote: true }),
    detail({ sameGuardian: true }),
  ],
);

/** In the real children's tab, a block of 38 rows from one DS office has no serial numbers. */
const NO_SERIAL_BLOCK = 6;
const NO_SERIAL_PLACE = place("මාතර", "මාතර කඩවත්සතර", ["Matara", "Matara Four Gravets"]);

/** Takes one from each list in turn, so the two kinds of special rows spread evenly. */
function mix<T>(a: T[], b: T[]): T[] {
  return Array.from({ length: Math.max(a.length, b.length) }, (_, i) => [a[i], b[i]]).flatMap((pair) =>
    pair.filter((x) => x !== undefined),
  );
}

/** The plans for a tab's rows: random people, with the special rows spread evenly between them. */
function planTab(r: Random, category: Category): Plan[] {
  const care = category === "CARE_LEAVER";
  const count = care ? CARE_LEAVER_ROWS : CHILD_AT_RISK_ROWS;
  const plans = Array.from({ length: count }, () => randomPlan(r, category, r.pick(places.dsOffices)));

  const reserved = new Set<number>();
  if (care) {
    // The real care leavers' tab repeats one serial number near its end.
    const repeat = count - 4;
    plans[repeat].serial = "repeat";
    reserved.add(repeat);
  } else {
    const start = Math.floor(count * 0.74);
    for (let i = start; i < start + NO_SERIAL_BLOCK; i++) {
      plans[i] = specialPlan(r, category, NO_SERIAL_PLACE, plans[i]);
      plans[i].serial = "none";
      reserved.add(i);
    }
  }

  const specials = care ? CARE_LEAVER_SPECIALS : CHILD_AT_RISK_SPECIALS;
  const free = plans.map((_, i) => i).filter((i) => !reserved.has(i));
  specials.forEach((special, k) => {
    const i = free[Math.floor(((k + 0.5) * free.length) / specials.length)];
    plans[i] = specialPlan(r, category, special, plans[i]);
  });
  return plans;
}

function specialPlan(r: Random, category: Category, special: Special, plan: Plan): Plan {
  const planned = special.near ? randomPlan(r, category, listed(...special.near)) : plan;
  special.apply(planned);
  return planned;
}

// --- Writing the rows -----------------------------------------------------------------------------

type Row = { written: Written; key: SampleRow };

const NONE: Cell[] = [null, null, null, null];

/** Notes in place of amounts, on some rows. The care leavers' tab has them in every progress column. */
function notes(r: Random, category: Category): Pick<Written, "installments" | "levels"> {
  if (category === "CHILD_AT_RISK")
    return { installments: r.chance(0.15) ? [r.pick(CHILD_NOTES), null, null, null] : [...NONE], levels: [...NONE] };
  const roll = r.int(1, 100);
  if (roll <= 84) return { installments: [...NONE], levels: [...NONE] };
  if (roll <= 86) return { installments: ["ඔව්", "නැත", "නැත", "නැත"], levels: [r.pick(STARTED), null, null, null] };
  if (roll <= 90)
    return { installments: [r.pick(NO), null, null, null], levels: [r.pick([...NO, "-"]), null, null, null] };
  if (roll <= 91) {
    const no = r.pick(NO);
    return { installments: [no, no, no, no], levels: [no, r.pick([no, "-"]), r.pick([no, "-"]), null] };
  }
  return { installments: [r.pick(EXPECTED), null, null, null], levels: [...NONE] };
}

/** The quirks of how a row names its district and DS office. */
function placeQuirks({ office, district, officeAs, problem }: Plan): Quirk[] {
  if (problem === "noDistrict" || problem === "unknownDistrict") return [problem];
  const listedDistrict = DISTRICTS.get(office.district)!;
  const quirks: Quirk[] = [];
  if (district === listedDistrict.nameEn) quirks.push("englishDistrict");
  else if (district !== listedDistrict.nameSi) quirks.push("districtSpelling");
  if (problem) return [...quirks, problem];
  if (officeAs === office.nameEn) quirks.push("englishOffice");
  else if (officeAs !== office.nameSi) quirks.push("officeSpelling");
  return quirks;
}

/** Quirks that come with the guardian when a row copies the one above. */
const GUARDIAN_QUIRKS = new Set<Quirk>([
  "englishDistrict",
  "districtSpelling",
  "noDistrict",
  "unknownDistrict",
  "englishOffice",
  "officeSpelling",
  "noOffice",
  "unknownOffice",
  "officeInOtherDistrict",
  "noName",
  "nicAsNumber",
  "nicLowercase",
  "nicWithSpace",
  "badNic",
  "phoneAsNumber",
  "twoPhones",
  "threePhones",
  "badPhone",
]);

function writeRow(r: Random, category: Category, plan: Plan, above: Row | undefined): Row {
  const care = category === "CARE_LEAVER";
  const { office, english } = plan;
  const surname = english ? r.pick(TAMIL_SURNAMES) : r.pick(SURNAMES);
  const given = () => (english ? r.pick(TAMIL_GIVEN_NAMES) : r.pick(GIVEN_NAMES));
  const initials = () =>
    Array.from({ length: r.int(1, 3) }, () => r.pick(english ? ENGLISH_INITIALS : INITIALS)).join("");

  let name: string | null =
    english || r.chance(0.5)
      ? `${given()} ${surname}`
      : care
        ? `${surname} ${given()} ${given()}`
        : `${initials()} ${given()} ${surname}`;
  let childName: string | null = care ? null : r.chance(0.3) ? `${initials()} ${surname}` : `${given()} ${surname}`;
  const address = r.chance(HAS[category].address)
    ? english
      ? `No ${r.int(1, 750)}, ${r.pick(ENGLISH_ROADS)}, ${office.nameEn}.`
      : `නො ${r.int(1, 750)}${r.chance(0.1) ? "/ඒ" : ""}, ${r.pick(ROADS)}, ${office.nameSi}.`
    : null;
  const [nicCell, nic]: [Cell, string | null] = plan.nic ? writeNic(r, plan.nic) : [null, null];
  const [phoneCell, phones]: [Cell, string[]] = plan.phone ? writePhone(r, plan.phone) : [null, []];
  const progress = notes(r, category);
  if (plan.multilineNote) progress.installments[0] = MULTILINE_NOTE;
  const remark = plan.numberRemark ? 2 : care && r.chance(0.02) ? r.pick(REMARKS) : null;
  const colour = r.chance(0.08) ? r.pick(COLOURS) : null;

  if (plan.noName) name = null;
  if (plan.noChildName) childName = null;
  const quirks = [
    ...placeQuirks(plan),
    plan.nic && NIC_QUIRK[plan.nic],
    plan.phone && PHONE_QUIRK[plan.phone],
    plan.noName && "noName",
    plan.noChildName && "noChildName",
    plan.multilineNote && "multilineNote",
    plan.numberRemark && "numberRemark",
    colour && "coloured",
  ].filter((quirk): quirk is Quirk => !!quirk);

  const row: Row = {
    written: {
      serial: null,
      name,
      childName,
      nic: nicCell,
      address,
      phone: phoneCell,
      district: plan.district,
      office: plan.officeAs,
      ...progress,
      remark,
      colour,
    },
    key: {
      category,
      row: 0,
      serial: null,
      district: plan.problem === "noDistrict" || plan.problem === "unknownDistrict" ? null : office.district,
      officeCode: plan.problem ? null : office.code,
      name,
      childName,
      nic,
      phones,
      quirks,
    },
  };

  if (plan.sameGuardian && above) {
    // Another child of the guardian above: the same guardian, NIC, address, phone and place.
    for (const field of ["name", "nic", "address", "phone", "district", "office"] as const)
      row.written[field] = above.written[field];
    const guardian = above.key.name ?? "";
    row.written.childName = `${given()} ${guardian.slice(guardian.lastIndexOf(" ") + 1)}`;
    Object.assign(row.key, {
      district: above.key.district,
      officeCode: above.key.officeCode,
      name: above.key.name,
      childName: row.written.childName,
      nic: above.key.nic,
      phones: above.key.phones,
      quirks: [
        ...above.key.quirks.filter((q) => GUARDIAN_QUIRKS.has(q)),
        ...quirks.filter((q) => !GUARDIAN_QUIRKS.has(q)),
        "sameGuardian",
      ],
    });
  }
  return row;
}

const EMPTY_ROW: Written = {
  serial: null,
  name: null,
  childName: null,
  nic: null,
  address: null,
  phone: null,
  district: null,
  office: null,
  installments: [...NONE],
  levels: [...NONE],
  remark: null,
  colour: null,
};

/** A tab's rows with their serial numbers, as the real tabs number them. */
function makeTab(r: Random, category: Category): Row[] {
  const rows: Row[] = [];
  let serial = 0;
  for (const plan of planTab(r, category)) {
    const row = writeRow(r, category, plan, rows[rows.length - 1]);
    if (plan.serial === "next") serial++;
    else if (plan.serial === "repeat") row.key.quirks.push("repeatedSerial");
    else row.key.quirks.push("noSerial");
    row.written.serial = row.key.serial = plan.serial === "none" ? null : serial;
    rows.push(row);
  }
  if (category === "CARE_LEAVER") {
    // The real care leavers' tab has one empty row, about three quarters of the way down.
    const at = Math.floor(rows.length * 0.76);
    const empty: SampleRow = {
      category,
      row: 0,
      serial: null,
      district: null,
      officeCode: null,
      name: null,
      childName: null,
      nic: null,
      phones: [],
      quirks: ["emptyRow"],
    };
    rows.splice(at, 0, { written: EMPTY_ROW, key: empty });
  }
  rows.forEach((row, i) => (row.key.row = i + 3));
  return rows;
}

// --- The workbook ---------------------------------------------------------------------------------

const THIN = { style: "thin" } as const;
const BORDER: Partial<ExcelJS.Borders> = { top: THIN, left: THIN, bottom: THIN, right: THIN };

function addTab(workbook: ExcelJS.Workbook, tab: Tab, rows: Row[]) {
  const sheet = workbook.addWorksheet(tab.name, { views: [{ state: "frozen", ySplit: 2, topLeftCell: "A3" }] });
  tab.widths.forEach((width, i) => (sheet.getColumn(i + 1).width = width));
  const columns = tab.widths.length;
  const isDetail = (column: number) => column <= tab.detailColumns;

  for (const rowNumber of [1, 2])
    for (let column = 1; column <= columns; column++) {
      const cell = sheet.getCell(rowNumber, column);
      cell.border = BORDER;
      cell.font = isDetail(column)
        ? { name: "Calibri", size: 12, bold: true }
        : { name: "Arial", size: 10, bold: true };
      cell.alignment = { horizontal: isDetail(column) ? "left" : "center", vertical: "top", wrapText: true };
    }
  for (const [range, text] of tab.headers) {
    sheet.getCell(range.split(":")[0]).value = text;
    if (range.includes(":")) sheet.mergeCells(range);
  }

  for (const { written } of rows) {
    const row = sheet.addRow(tab.cells(written));
    for (let column = 1; column <= columns; column++) {
      const cell = row.getCell(column);
      cell.border = BORDER;
      cell.font = isDetail(column) ? { name: "Calibri", size: tab.fontSize } : { name: "Arial", size: 10 };
      if (isDetail(column)) cell.alignment = { horizontal: column === 1 ? "right" : "left", wrapText: true };
      const coloured = written.colour?.cells === "name" ? column === 2 : column >= 2 && isDetail(column);
      if (written.colour && coloured)
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: written.colour.argb } };
    }
  }
}

/** The sample sheet, and its answer key. The same seed always gives the same sheet. */
export function makeSampleSheet(seed = 1): SampleSheet {
  const r = generator(seed);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "make-sample-sheet";
  const rows: SampleRow[] = [];
  for (const tab of Object.values(TABS)) {
    const tabRows = makeTab(r, tab.category);
    addTab(workbook, tab, tabRows);
    rows.push(...tabRows.map((row) => row.key));
  }
  return { workbook, rows };
}

// Run directly: npx tsx scripts/make-sample-sheet.ts [--out file.xlsx] [--seed N]
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const option = (name: string) => {
    const index = process.argv.indexOf(name);
    return index === -1 ? undefined : process.argv[index + 1];
  };
  const out = resolve(option("--out") ?? DEFAULT_OUT);
  const seed = Number(option("--seed") ?? 1);
  const { workbook, rows } = makeSampleSheet(seed);
  const people = (category: Category) =>
    rows.filter((row) => row.category === category && !row.quirks.includes("emptyRow")).length;
  mkdirSync(dirname(out), { recursive: true });
  workbook.xlsx
    .writeFile(out)
    .then(() =>
      console.log(
        `Wrote ${out}: ${people("CARE_LEAVER")} care leavers and ${people("CHILD_AT_RISK")} children at risk, all made up (seed ${seed}).`,
      ),
    )
    .catch((error: unknown) => {
      console.error(error);
      process.exitCode = 1;
    });
}
