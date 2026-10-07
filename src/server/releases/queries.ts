import type { PrismaClient } from "@/generated/prisma/client";
import { dateToDay } from "@/lib/dates";
import { officeFilter, type Viewer } from "../permissions";

/** A district with verified cases waiting for an allocation letter (REL-1). */
export type WaitingDistrict = {
  id: number;
  name: string;
  /** Verified cases waiting. */
  count: number;
  /** The DS offices they belong to, by name. */
  offices: string[];
  /** The oldest verification among them. */
  oldest: Date | null;
};

/**
 * REL-1: the districts whose verified cases wait for an allocation letter, the most cases first, as in
 * the prototype; then the longest waiting. Only Head Office records letters; anyone else gets none.
 */
export async function districtsWaiting(db: PrismaClient, viewer: Viewer): Promise<WaitingDistrict[]> {
  const scope = officeFilter(viewer);
  if (viewer.role !== "HO_OFFICER" || !scope) return [];
  const groups = await db.case.groupBy({
    by: ["dsOfficeId"],
    where: { ...scope, status: "VERIFIED" },
    _count: { _all: true },
    _min: { verifiedAt: true },
  });
  if (groups.length === 0) return [];
  const offices = await db.dsOffice.findMany({
    where: { id: { in: groups.map((g) => g.dsOfficeId) } },
    orderBy: { nameSi: "asc" },
    select: { id: true, nameSi: true, district: { select: { id: true, nameSi: true } } },
  });

  const districts = new Map<number, WaitingDistrict>();
  for (const office of offices) {
    const group = groups.find((g) => g.dsOfficeId === office.id);
    if (!group) continue;
    const district = districts.get(office.district.id) ?? {
      id: office.district.id,
      name: office.district.nameSi,
      count: 0,
      offices: [],
      oldest: null,
    };
    district.count += group._count._all;
    district.offices.push(office.nameSi);
    const verified = group._min.verifiedAt;
    if (verified && (!district.oldest || verified < district.oldest)) district.oldest = verified;
    districts.set(district.id, district);
  }
  const time = (date: Date | null) => date?.getTime() ?? 0;
  return [...districts.values()].sort(
    (a, b) => b.count - a.count || time(a.oldest) - time(b.oldest) || a.name.localeCompare(b.name),
  );
}

/** A verified case that can go on a district's letter (REL-2). */
export type LetterCase = {
  id: string;
  version: number;
  caseNumber: string | null;
  name: string | null;
  childName: string | null;
  officeName: string;
  verifiedAt: Date | null;
};

/** REL-2: a district's verified cases for its letter, by DS office, then the longest waiting first. */
export async function casesForLetter(db: PrismaClient, viewer: Viewer, districtId: number): Promise<LetterCase[]> {
  const scope = officeFilter(viewer);
  if (viewer.role !== "HO_OFFICER" || !scope) return [];
  const found = await db.case.findMany({
    where: { AND: [scope, { dsOffice: { districtId } }], status: "VERIFIED" },
    orderBy: [{ dsOffice: { nameSi: "asc" } }, { verifiedAt: { sort: "asc", nulls: "first" } }, { id: "asc" }],
    select: {
      id: true,
      version: true,
      caseNumber: true,
      name: true,
      childName: true,
      verifiedAt: true,
      dsOffice: { select: { nameSi: true } },
    },
  });
  return found.map(({ dsOffice, ...row }) => ({ ...row, officeName: dsOffice.nameSi }));
}

/** An allocation letter as the release screen and its notice show it. */
export type LetterSummary = {
  id: string;
  districtName: string;
  letterNumber: string;
  /** "YYYY-MM-DD" */
  letterDate: string;
  /** "YYYY-MM-DD" */
  validUntil: string;
  /** The cases it released. */
  count: number;
  /** Their DS offices, by name. */
  offices: string[];
};

const LETTER_SELECT = {
  id: true,
  letterNumber: true,
  letterDate: true,
  validUntil: true,
  district: { select: { nameSi: true } },
  releases: { select: { case: { select: { dsOffice: { select: { nameSi: true } } } } } },
} as const;

type FoundLetter = {
  id: string;
  letterNumber: string;
  letterDate: Date;
  validUntil: Date;
  district: { nameSi: string };
  releases: { case: { dsOffice: { nameSi: string } } }[];
};

const summary = (letter: FoundLetter): LetterSummary => ({
  id: letter.id,
  districtName: letter.district.nameSi,
  letterNumber: letter.letterNumber,
  letterDate: dateToDay(letter.letterDate),
  validUntil: dateToDay(letter.validUntil),
  count: letter.releases.length,
  offices: [...new Set(letter.releases.map((r) => r.case.dsOffice.nameSi))].sort(),
});

/** The letters recorded last, newest first, for the release screen's list (REL-2). Head Office only. */
export async function recentLetters(db: PrismaClient, viewer: Viewer, take = 10): Promise<LetterSummary[]> {
  if (viewer.role !== "HO_OFFICER" || !officeFilter(viewer)) return [];
  const found = await db.releaseLetter.findMany({
    orderBy: [{ at: "desc" }, { id: "asc" }],
    take,
    select: LETTER_SELECT,
  });
  return found.map(summary);
}

/** One letter, for the notice after it is recorded. Head Office only; anything else is null. */
export async function getLetter(db: PrismaClient, viewer: Viewer, id: string): Promise<LetterSummary | null> {
  if (viewer.role !== "HO_OFFICER" || !officeFilter(viewer)) return null;
  const found = await db.releaseLetter.findUnique({ where: { id }, select: LETTER_SELECT });
  return found && summary(found);
}
