import type { PrismaClient } from "@/generated/prisma/client";
import { squash } from "./sheet";

/**
 * Finds the DS office a sheet row belongs to (IMP-3). The district is matched first, in Sinhala or
 * English and in the spellings the sheet uses. The DS office is then matched by its Sinhala or English
 * name within that district. Names compare after squash(): no spaces, capitals or zero-width characters.
 */

export type PlaceList = {
  districts: { id: number; nameEn: string; nameSi: string }[];
  offices: { id: number; code: string; nameEn: string; nameSi: string; districtId: number; active: boolean }[];
};

/** The districts and DS offices, inactive offices included, so the report can say an office is inactive. */
export async function loadPlaces(db: PrismaClient): Promise<PlaceList> {
  const [districts, offices] = await Promise.all([
    db.district.findMany({ select: { id: true, nameEn: true, nameSi: true } }),
    db.dsOffice.findMany({
      select: { id: true, code: true, nameEn: true, nameSi: true, districtId: true, active: true },
    }),
  ]);
  return { districts, offices };
}

/**
 * How the sheet spells some districts, unlike the list, with the list's English name for each. Spellings
 * that differ only in spaces, capitals or zero-width characters match without being listed here.
 */
const DISTRICT_SPELLINGS: Record<string, string> = {
  අනුරාධපුර: "Anuradhapura",
  ත්‍රීකුණාමලය: "Trincomalee",
  රත්නපුර: "Ratnapura",
  මොනරාගල: "Monaragala",
  Mullative: "Mullaitivu",
};

/** Why a row can't be given to a DS office. The row is not imported, and the report says why (IMP-3, IMP-6). */
export type PlaceProblem =
  "noDistrict" | "unknownDistrict" | "noOffice" | "unknownOffice" | "officeInOtherDistrict" | "officeInactive";

export type Placed = { officeId: number; code: string } | { problem: PlaceProblem };

/** Returns a function that places a row by its district and DS office as written. */
export function placer(list: PlaceList): (district: string | null, office: string | null) => Placed {
  const byDistrictName = new Map<string, number>();
  for (const d of list.districts) {
    byDistrictName.set(squash(d.nameSi), d.id);
    byDistrictName.set(squash(d.nameEn), d.id);
  }
  const idByEnglish = new Map(list.districts.map((d) => [d.nameEn, d.id]));
  for (const [spelling, nameEn] of Object.entries(DISTRICT_SPELLINGS)) {
    const id = idByEnglish.get(nameEn);
    if (id !== undefined) byDistrictName.set(squash(spelling), id);
  }
  const named = (name: string) => (o: PlaceList["offices"][number]) =>
    squash(o.nameSi) === name || squash(o.nameEn) === name;

  return (district, office) => {
    if (!district) return { problem: "noDistrict" };
    const districtId = byDistrictName.get(squash(district));
    if (districtId === undefined) return { problem: "unknownDistrict" };
    if (!office) return { problem: "noOffice" };
    const name = squash(office);
    const found = list.offices.find((o) => o.districtId === districtId && named(name)(o));
    if (!found) return { problem: list.offices.some(named(name)) ? "officeInOtherDistrict" : "unknownOffice" };
    if (!found.active) return { problem: "officeInactive" };
    return { officeId: found.id, code: found.code };
  };
}
