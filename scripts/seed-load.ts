/**
 * Made-up cases for load tests (PRF-1, PRF-3, PRF-4): 5,000 by default, spread over every active DS
 * office, at every point of a case's life. There are drafts, cases waiting for a check or a release,
 * cases being built with their installments and stages (some with no update for 30 days or more),
 * and completed, rejected and stopped cases.
 *
 *   npm run db:seed-load                   adds 5,000 cases
 *   npm run db:seed-load -- --count 500    adds 500
 *   npm run db:seed-load -- --seed 7       adds a different set; the same seed gives the same cases
 *   npm run db:seed-load -- --remove       removes every load-test case again
 *
 * Every name, NIC and phone number is made up (SEC-11). It runs on development, test and staging
 * databases only, never in production.
 * - The cases' ids start with "load-", which is how --remove finds them. They take their case numbers
 *   from each office's counter, as real submits do; --remove gives back the numbers no other case holds.
 * - They belong to one disabled account without a username, which can't sign in and isn't listed on
 *   the admin's users screen.
 * - No audit records are written, because the audit log can never be cleaned up (HIS-3). So a
 *   load-test case's history is empty. No notifications, files or photos are made either.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import type { Prisma, PrismaClient } from "../src/generated/prisma/client";
import type { CaseStatus, Category, DecisionType, Kind } from "../src/generated/prisma/enums";
import { addDays, colomboDay, colomboStartOf, colomboYear, dayToDate } from "../src/lib/dates";
import { INSTALLMENT_AMOUNT, INSTALLMENT_COUNT, RELEASE_AMOUNT } from "../src/lib/money";
import { nicKey } from "../src/lib/nic";
import { placeholderEmail } from "../src/server/auth/accounts";
import { formatCaseNumber } from "../src/server/cases/numbers";
import { createPrismaClient } from "../src/server/db";
import { deleteStoredFile } from "../src/server/files/storage";

/** Every load-test case's id starts with this. */
export const LOAD_ID_PREFIX = "load-";
/** The disabled account that owns every load-test case and took every step on it. */
export const LOAD_USER_ID = "load-test-account";

const DEFAULT_COUNT = 5_000;
/** The oldest case is made this many days ago. */
const MAX_AGE_DAYS = 720;
/** Share of the cases being built whose last update was 30 or more days ago (DSH-1, HOME-3). */
const STALE_SHARE = 0.25;
const MINUTE = 60_000;
/** Rows per insert, well under PostgreSQL's limit on parameters in one statement. */
const CHUNK = 1_000;

/** Load-test cases are made-up data, so never in production. */
export function loadDataAllowed(appEnv = process.env.APP_ENV ?? "development"): boolean {
  return ["development", "ci", "test", "staging"].includes(appEnv);
}

// --- Made-up people -------------------------------------------------------------------------------

const GIVEN_NAMES = [
  "නිමල්",
  "සුනිල්",
  "කමල්",
  "අජිත්",
  "රුවන්",
  "චමින්ද",
  "ප්‍රසාද්",
  "දිනේෂ්",
  "සමන්",
  "තුෂාර",
  "කසුන්",
  "නුවන්",
  "ලහිරු",
  "ඉසුරු",
  "සචින්",
  "නිලූකා",
  "සඳමාලි",
  "දිල්රුක්ෂි",
  "අනෝජා",
  "චතුරිකා",
  "ඉරේෂා",
  "හංසිකා",
  "සෙව්වන්දි",
  "තරුෂි",
  "මධුෂිකා",
  "කාවින්දි",
  "නෙත්මි",
  "සඳුනි",
  "පියුමි",
  "ශාලිනි",
];
const SURNAMES = [
  "පෙරේරා",
  "සිල්වා",
  "ප්‍රනාන්දු",
  "බණ්ඩාර",
  "ජයසූරිය",
  "ගුණවර්ධන",
  "හේරත්",
  "රත්නායක",
  "කුමාරසිංහ",
  "වීරසේකර",
  "අබේසේකර",
  "කරුණාරත්න",
  "දසනායක",
  "විජේසිංහ",
  "මුණසිංහ",
  "ලියනගේ",
  "සමරසිංහ",
  "සෙල්වරාජා",
  "කන්දසාමි",
  "ශිවලිංගම්",
];
const ROADS = ["ප්‍රධාන පාර", "පන්සල් පාර", "පාසල් මාවත", "දෙවන පටුමග", "ගංගා පාර", "මල් පාර"];
const REMARKS = ["ඉඩම පවුලට අයත්ය.", "පවුලේ සාමාජිකයින් පස් දෙනෙකි.", "ළඟම පාසල කි.මී. දෙකක් දුරින්."];
const SEND_BACK_REASONS = [
  "ලිපිනය සම්පූර්ණ නැත. කරුණාකර නිවැරදි කර නැවත යොමු කරන්න.",
  "ජා.හැ.අංකය පරීක්ෂා කර නැවත යොමු කරන්න.",
  "දුරකථන අංකය වැරදියි.",
];
const REJECT_REASONS = ["මෙම පවුලට දැනටමත් නිවාස ආධාර ලැබී ඇත.", "වැඩසටහනේ සුදුසුකම් සපුරා නැත."];
const STOP_REASONS = ["ප්‍රතිලාභියා වෙනත් ප්‍රදේශයකට පදිංචියට ගොස් ඇත.", "ඉඩමේ අයිතිය පිළිබඳ ගැටලුවක් ඇත."];
const VISIT_NOTES = [
  "වැඩ හොඳින් සිදු වේ.",
  "ද්‍රව්‍ය ලැබීම ප්‍රමාදයි.",
  "අඩවිය පරීක්ෂා කළා.",
  "වැසි නිසා වැඩ නතර වී ඇත.",
];
const PURPOSES = ["ගොඩනැගිලි ද්‍රව්‍ය", "වහලය සඳහා", "කම්කරු ගාස්තු"];

// --- Shares ---------------------------------------------------------------------------------------

type Share<T> = readonly (readonly [T, number])[];

/** How the cases spread over the statuses, roughly as in a programme's second year. */
const STATUS_SHARES: Share<CaseStatus> = [
  ["DRAFT", 3],
  ["SUBMITTED", 8],
  ["RETURNED", 3],
  ["VERIFIED", 6],
  ["IN_PROGRESS", 55],
  ["COMPLETED", 18],
  ["REJECTED", 3],
  ["STOPPED", 4],
];
/** Installments paid on a case still being built. */
const PAID_SHARES: Share<number> = [
  [0, 15],
  [1, 30],
  [2, 25],
  [3, 20],
  [4, 10],
];
/** Visits with only a note on a released case. */
const NOTE_SHARES: Share<number> = [
  [0, 50],
  [1, 35],
  [2, 15],
];

/** A small seeded random number generator (mulberry32), so the same seed gives the same cases. */
function generator(seed: number) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
  const int = (min: number, max: number) => min + Math.floor(next() * (max - min + 1));
  return {
    int,
    chance: (p: number) => next() < p,
    pick: <T>(list: readonly T[]): T => list[int(0, list.length - 1)],
    weighted: <T>(shares: Share<T>): T => {
      let roll = next() * shares.reduce((sum, [, weight]) => sum + weight, 0);
      for (const [value, weight] of shares) if ((roll -= weight) < 0) return value;
      return shares[shares.length - 1][0];
    },
  };
}

type Random = ReturnType<typeof generator>;

/** A made-up NIC: mostly the 12-digit form, sometimes the old 9 digits and V (CASE-2). */
function madeUpNic(r: Random): string {
  const year = r.int(1960, 2006);
  const day = String(r.int(1, 366) + (r.chance(0.5) ? 500 : 0)).padStart(3, "0");
  if (year < 2000 && r.chance(0.3)) return `${String(year).slice(2)}${day}${r.int(1000, 9999)}V`;
  return `${year}${day}${r.int(10000, 99999)}`;
}

function madeUpPhone(r: Random): string {
  return `07${r.pick([0, 1, 2, 4, 5, 6, 7, 8])}${r.int(1_000_000, 9_999_999)}`;
}

// --- Planning the cases -------------------------------------------------------------------------

type Office = { id: number; code: string; nameSi: string };

type Context = {
  r: Random;
  now: Date;
  /** "YYYY-MM-DD" in Colombo */
  today: string;
  /** The active stages of each kind, in order (LST-4). */
  stages: Record<Kind, number[]>;
};

type Planned = {
  case: Prisma.CaseCreateManyInput;
  decisions: Prisma.DecisionCreateManyInput[];
  release: Prisma.ReleaseCreateManyInput | null;
  installments: Prisma.InstallmentCreateManyInput[];
  stageUpdates: Prisma.StageUpdateCreateManyInput[];
};

type Event = "pay" | "start" | "stage" | "note";

const latestDay = (a: string, b: string) => (a > b ? a : b);

function dayDiff(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / (24 * 60 * MINUTE));
}

/** Interleaves the chains at random, keeping each chain's own order. */
function interleave<T>(r: Random, chains: T[][]): T[] {
  const queues = chains.map((chain) => [...chain]);
  const out: T[] = [];
  for (let left = queues.reduce((sum, q) => sum + q.length, 0); left > 0; left--) {
    let roll = r.int(1, left);
    const queue = queues.find((q) => (roll -= q.length) <= 0);
    out.push(queue!.shift()!);
  }
  return out;
}

/** One case and everything that hangs off it, with a story that follows the rules of SPEC section 6. */
function planCase(ctx: Context, office: Office, status: CaseStatus): Planned {
  const { r, today } = ctx;
  const upToToday = (day: string) => (day > today ? today : day);
  // A moment during office hours on `day`, after `after`, and never after now.
  const moment = (day: string, after: Date | null) => {
    let at = new Date(colomboStartOf(day).getTime() + r.int(510, 990) * MINUTE);
    if (after && at <= after) at = new Date(after.getTime() + r.int(5, 90) * MINUTE);
    return at > ctx.now ? ctx.now : at;
  };

  const id = `${LOAD_ID_PREFIX}${randomUUID()}`;
  const draft = status === "DRAFT";
  // A draft may still have empty fields (CASE-4).
  const maybe = <T>(value: T) => (draft && r.chance(0.2) ? null : value);
  const category = maybe<Category>(r.chance(1 / 3) ? "CARE_LEAVER" : "CHILD_AT_RISK");
  const kind: Kind = r.chance(0.8) ? "NEW_HOUSE" : "RENOVATION";
  const surname = r.pick(SURNAMES);
  const nic = maybe(madeUpNic(r));

  // A stopped case was verified or being built when it stopped (CLS-3).
  const stoppedFrom: CaseStatus | null = status === "STOPPED" ? (r.chance(0.6) ? "IN_PROGRESS" : "VERIFIED") : null;
  const path = stoppedFrom ?? status;
  const released = path === "IN_PROGRESS" || path === "COMPLETED";
  const minAge = path === "COMPLETED" ? 150 : released ? 45 : path === "VERIFIED" ? 10 : 0;

  const createdDay = addDays(today, -r.int(minAge, MAX_AGE_DAYS));
  const createdAt = moment(createdDay, null);
  let last = createdAt;
  const decisions: Prisma.DecisionCreateManyInput[] = [];
  const decide = (type: DecisionType, at: Date, reason: string | null = null) =>
    decisions.push({ id: randomUUID(), caseId: id, type, reason, byId: LOAD_USER_ID, at });

  let submittedAt: Date | null = null;
  let verifiedAt: Date | null = null;
  let completedAt: Date | null = null;
  let release: Prisma.ReleaseCreateManyInput | null = null;
  const installments: Prisma.InstallmentCreateManyInput[] = [];
  const stageUpdates: Prisma.StageUpdateCreateManyInput[] = [];
  let steps = 0;

  if (draft) {
    last = moment(upToToday(addDays(createdDay, r.int(0, 10))), createdAt);
  } else {
    const submittedDay = upToToday(addDays(createdDay, r.int(0, 7)));
    submittedAt = last = moment(submittedDay, last);
    decide("SUBMIT", submittedAt);

    if (path === "RETURNED" || path === "REJECTED") {
      last = moment(upToToday(addDays(submittedDay, r.int(1, 20))), last);
      if (path === "RETURNED") decide("SEND_BACK", last, r.pick(SEND_BACK_REASONS));
      else decide("REJECT", last, r.pick(REJECT_REASONS));
    }

    if (path === "VERIFIED" || released) {
      const verifiedDay = upToToday(addDays(submittedDay, r.int(2, 30)));
      verifiedAt = last = moment(verifiedDay, last);
      decide("VERIFY", verifiedAt);

      if (released) {
        // REL-2: on or after the verification day, never in the future.
        const releasedDay = upToToday(addDays(verifiedDay, r.int(1, 30)));
        const releaseAt = (last = moment(releasedDay, last));
        release = {
          id: randomUUID(),
          caseId: id,
          releasedOn: dayToDate(releasedDay),
          amount: RELEASE_AMOUNT,
          referenceNumber: `LT/${releasedDay.slice(0, 4)}/${r.int(10_000, 99_999)}`,
          byId: LOAD_USER_ID,
          at: releaseAt,
        };

        const stages = ctx.stages[kind];
        let paid: number;
        let reached: number;
        if (path === "COMPLETED") {
          paid = INSTALLMENT_COUNT;
          reached = stages.length;
        } else {
          paid = r.weighted(PAID_SHARES);
          reached = r.int(0, stages.length);
          // Both finished would have completed it (CLS-1).
          if (paid === INSTALLMENT_COUNT && reached === stages.length) {
            if (stages.length > 0) reached -= 1;
            else paid -= 1;
          }
        }
        const processing = path !== "COMPLETED" && paid < INSTALLMENT_COUNT && r.chance(0.5);

        // INS-2: each payment after the one before, and a payment starts only once the one before is paid.
        const events = interleave<Event>(r, [
          [...Array<Event>(paid).fill("pay"), ...(processing ? (["start"] as const) : [])],
          Array<Event>(reached).fill("stage"),
          Array<Event>(r.weighted(NOTE_SHARES)).fill("note"),
        ]);
        if (path === "COMPLETED") {
          // Nothing is recorded after completion (STG-5), so the visits come before the last step.
          const lastStep = events.findLastIndex((e) => e !== "note");
          events.splice(lastStep, 0, ...events.splice(lastStep + 1));
        }

        const lastDay =
          path === "COMPLETED"
            ? upToToday(addDays(releasedDay, r.int(90, 360)))
            : stoppedFrom
              ? upToToday(addDays(releasedDay, r.int(0, 200)))
              : latestDay(releasedDay, addDays(today, -(r.chance(STALE_SHARE) ? r.int(30, 180) : r.int(0, 29))));
        const span = dayDiff(releasedDay, lastDay);
        const days = events.map(() => addDays(releasedDay, r.int(0, span))).sort();
        if (days.length > 0) days[days.length - 1] = lastDay;

        const payments: { day: string; at: Date }[] = [];
        let start: { day: string; at: Date } | null = null;
        let stagesReached = 0;
        for (const [index, event] of events.entries()) {
          const day = days[index];
          last = moment(day, last);
          if (event === "pay") payments.push({ day, at: last });
          else if (event === "start") start = { day, at: last };
          else {
            const stageId = event === "stage" ? stages[stagesReached++] : null;
            const note = event === "note" || r.chance(0.4) ? r.pick(VISIT_NOTES) : null;
            stageUpdates.push({
              id: randomUUID(),
              caseId: id,
              stageId,
              visitedOn: dayToDate(day),
              note,
              byId: LOAD_USER_ID,
              at: last,
            });
          }
        }
        steps = events.length;

        for (let number = 1; number <= INSTALLMENT_COUNT; number++) {
          const payment = payments[number - 1];
          const base = { id: randomUUID(), caseId: id, number, amount: INSTALLMENT_AMOUNT };
          if (payment) {
            installments.push({
              ...base,
              status: "RELEASED",
              // INS-3: expected on or after the release.
              expectedOn: dayToDate(latestDay(releasedDay, addDays(payment.day, -r.int(0, 14)))),
              releasedOn: dayToDate(payment.day),
              purpose: r.chance(0.3) ? r.pick(PURPOSES) : null,
              updatedAt: payment.at,
            });
          } else if (start && number === paid + 1) {
            installments.push({
              ...base,
              status: "PROCESSING",
              // Some have passed already, so the to-do panel has overdue payments (HOME-3).
              expectedOn: dayToDate(addDays(start.day, r.int(3, 45))),
              purpose: r.chance(0.3) ? r.pick(PURPOSES) : null,
              updatedAt: start.at,
            });
          } else {
            installments.push({ ...base, status: "NOT_STARTED", updatedAt: releaseAt });
          }
        }
        if (path === "COMPLETED") completedAt = last;
      }
    }

    if (stoppedFrom) {
      last = moment(upToToday(addDays(colomboDay(last), r.int(1, 60))), last);
      decide("STOP", last, r.pick(STOP_REASONS));
    }
  }

  return {
    case: {
      id,
      dsOfficeId: office.id,
      category,
      kind: maybe(kind),
      status,
      name: `${r.pick(GIVEN_NAMES)} ${surname}`,
      childName: category === "CHILD_AT_RISK" ? `${r.pick(GIVEN_NAMES)} ${surname}` : null,
      nic,
      // The 12-digit form, so old and new numbers match (CASE-6).
      nicKey: nic && nicKey(nic),
      address: maybe(`${r.int(1, 250)}, ${r.pick(ROADS)}, ${office.nameSi}`),
      mobile1: maybe(madeUpPhone(r)),
      mobile2: r.chance(0.3) ? madeUpPhone(r) : null,
      remark: r.chance(0.1) ? r.pick(REMARKS) : null,
      createdById: LOAD_USER_ID,
      createdAt,
      updatedAt: last,
      submittedAt,
      verifiedAt,
      completedAt,
      statusBeforeStop: stoppedFrom,
      version: 1 + decisions.length + steps,
    },
    decisions,
    release,
    installments,
    stageUpdates,
  };
}

// --- Writing and removing -----------------------------------------------------------------------

function chunks<T>(rows: readonly T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += CHUNK) out.push(rows.slice(i, i + CHUNK));
  return out;
}

export type LoadOptions = {
  /** How many cases to add; 5,000 when left out. */
  count?: number;
  /** The same seed gives the same cases. */
  seed?: number;
  now?: Date;
};

/** Adds made-up cases, spread over every active DS office. Returns how many offices they went to. */
export async function addLoadData(db: PrismaClient, options: LoadOptions = {}): Promise<{ offices: number }> {
  if (!loadDataAllowed()) throw new Error(`Load-test data is not allowed when APP_ENV is "${process.env.APP_ENV}".`);
  const count = options.count ?? DEFAULT_COUNT;
  if (!Number.isSafeInteger(count) || count < 1) throw new Error(`Not a number of cases: ${count}`);
  const now = options.now ?? new Date();
  const r = generator(options.seed ?? 1);

  const offices: Office[] = await db.dsOffice.findMany({
    where: { active: true },
    orderBy: { id: "asc" },
    select: { id: true, code: true, nameSi: true },
  });
  if (offices.length === 0) throw new Error("There are no active DS offices: run the seed first.");
  const stages: Record<Kind, number[]> = { NEW_HOUSE: [], RENOVATION: [] };
  for (const stage of await db.stageDefinition.findMany({
    where: { active: true },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    select: { id: true, kind: true },
  })) {
    stages[stage.kind].push(stage.id);
  }

  const ctx: Context = { r, now, today: colomboDay(now), stages };
  // Every office gets at least one case, then the rest go to offices of different sizes.
  const officeShares: Share<Office> = offices.map((office) => [office, r.int(5, 15)]);
  const planned = Array.from({ length: count }, (_, index) =>
    planCase(ctx, index < offices.length ? offices[index] : r.weighted(officeShares), r.weighted(STATUS_SHARES)),
  );

  // CASE-5: numbers in the order of submitting, within each office and year.
  const groups = new Map<string, { office: Office; year: number; cases: Prisma.CaseCreateManyInput[] }>();
  const officeById = new Map(offices.map((o) => [o.id, o]));
  for (const { case: c } of planned) {
    if (!c.submittedAt) continue;
    const year = colomboYear(new Date(c.submittedAt));
    const key = `${c.dsOfficeId}:${year}`;
    const group = groups.get(key) ?? { office: officeById.get(c.dsOfficeId)!, year, cases: [] };
    group.cases.push(c);
    groups.set(key, group);
  }

  await db.$transaction(
    async (tx) => {
      await tx.user.upsert({
        where: { id: LOAD_USER_ID },
        update: {},
        create: {
          id: LOAD_USER_ID,
          name: "බර පරීක්ෂණ දත්ත",
          email: placeholderEmail(LOAD_USER_ID),
          role: "HO_OFFICER",
          banned: true,
          banReason: "load-test data",
        },
      });
      for (const { office, year, cases } of groups.values()) {
        cases.sort((a, b) => new Date(a.submittedAt!).getTime() - new Date(b.submittedAt!).getTime());
        // Takes a block of numbers in one statement, so a real submit at the same moment can't take one of them.
        const counter = await tx.caseNumberCounter.upsert({
          where: { dsOfficeId_year: { dsOfficeId: office.id, year } },
          create: { dsOfficeId: office.id, year, last: cases.length },
          update: { last: { increment: cases.length } },
          select: { last: true },
        });
        const first = counter.last - cases.length + 1;
        cases.forEach((c, index) => (c.caseNumber = formatCaseNumber(office.code, year, first + index)));
      }
      for (const rows of chunks(planned.map((p) => p.case))) await tx.case.createMany({ data: rows });
      for (const rows of chunks(planned.flatMap((p) => p.decisions))) await tx.decision.createMany({ data: rows });
      for (const rows of chunks(planned.flatMap((p) => (p.release ? [p.release] : []))))
        await tx.release.createMany({ data: rows });
      for (const rows of chunks(planned.flatMap((p) => p.installments)))
        await tx.installment.createMany({ data: rows });
      for (const rows of chunks(planned.flatMap((p) => p.stageUpdates)))
        await tx.stageUpdate.createMany({ data: rows });
    },
    { maxWait: 10_000, timeout: 10 * 60_000 },
  );
  return { offices: new Set(planned.map((p) => p.case.dsOfficeId)).size };
}

/**
 * Removes every load-test case with everything that hangs off it, including anything people added
 * to one while trying the system, and the load-test account. Each case-number counter the cases took
 * numbers from goes back to where it stood before them, unless a later case holds a higher number.
 * Returns how many cases were removed.
 */
export async function removeLoadData(db: PrismaClient): Promise<number> {
  if (!loadDataAllowed()) throw new Error(`Load-test data is not allowed when APP_ENV is "${process.env.APP_ENV}".`);
  const loadCase = { caseId: { startsWith: LOAD_ID_PREFIX } };
  const files = await db.storedFile.findMany({ where: loadCase, select: { storedName: true, thumbName: true } });

  const removed = await db.$transaction(
    async (tx) => {
      // The counters the load-test cases took numbers from, with the lowest number each one gave them.
      const used = new Map<string, { dsOfficeId: number; year: number; prefix: string; lowest: number }>();
      for (const { dsOfficeId, caseNumber } of await tx.case.findMany({
        where: { id: { startsWith: LOAD_ID_PREFIX }, caseNumber: { not: null } },
        select: { dsOfficeId: true, caseNumber: true },
      })) {
        const prefix = caseNumber!.slice(0, caseNumber!.lastIndexOf("-") + 1);
        const year = Number(prefix.slice(-5, -1));
        const sequence = Number(caseNumber!.slice(prefix.length));
        const key = `${dsOfficeId}:${year}`;
        if (sequence < (used.get(key)?.lowest ?? Infinity))
          used.set(key, { dsOfficeId, year, prefix, lowest: sequence });
      }

      await tx.storedFile.deleteMany({ where: loadCase });
      await tx.notification.deleteMany({ where: loadCase });
      await tx.installment.deleteMany({ where: loadCase });
      await tx.release.deleteMany({ where: loadCase });
      await tx.stageUpdate.deleteMany({ where: loadCase });
      await tx.decision.deleteMany({ where: loadCase });
      const cases = await tx.case.deleteMany({ where: { id: { startsWith: LOAD_ID_PREFIX } } });

      for (const { dsOfficeId, year, prefix, lowest } of used.values()) {
        const left = await tx.case.findMany({
          where: { dsOfficeId, caseNumber: { startsWith: prefix } },
          select: { caseNumber: true },
        });
        // Numbers below the load-test cases' were real ones, so they are never given out again (CASE-5).
        const last = Math.max(lowest - 1, ...left.map((c) => Number(c.caseNumber!.slice(prefix.length))));
        const where = { dsOfficeId_year: { dsOfficeId, year } };
        if (last > 0) await tx.caseNumberCounter.update({ where, data: { last } });
        else await tx.caseNumberCounter.delete({ where });
      }
      await tx.user.deleteMany({ where: { id: LOAD_USER_ID } });
      return cases.count;
    },
    { maxWait: 10_000, timeout: 10 * 60_000 },
  );

  for (const name of files.flatMap((f) => [f.storedName, f.thumbName])) if (name) await deleteStoredFile(name);
  return removed;
}

// Run directly: npx tsx scripts/seed-load.ts [--count N] [--seed N] [--remove]
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const option = (name: string) => {
    const index = process.argv.indexOf(name);
    return index === -1 ? undefined : process.argv[index + 1];
  };
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is not set");
  const prisma = createPrismaClient(databaseUrl);
  const run = async () => {
    if (process.argv.includes("--remove")) {
      console.log(`Removed ${await removeLoadData(prisma)} load-test cases.`);
      return;
    }
    const count = Number(option("--count") ?? DEFAULT_COUNT);
    const seed = Number(option("--seed") ?? 1);
    const started = Date.now();
    const { offices } = await addLoadData(prisma, { count, seed });
    console.log(`Added ${count} load-test cases in ${offices} DS offices (${Date.now() - started} ms).`);
  };
  run()
    .catch((error: unknown) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
