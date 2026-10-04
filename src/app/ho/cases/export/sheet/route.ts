import { notFound } from "next/navigation";
import type { NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { requireRole } from "@/server/context";
import { db } from "@/server/db";
import { exportSheetLayout } from "@/server/exports/sheet-layout";
import { xlsxResponse } from "@/server/exports/workbook";
import { readFilters } from "../../filters";

/** EXP-2: Head Office's case list in the old sheet's layout, with the filters the list page shows (FND-1). */
export async function GET(request: NextRequest) {
  const viewer = await requireRole("HO_OFFICER");
  const { filter } = readFilters((key) => request.nextUrl.searchParams.get(key) ?? "");
  const file = await exportSheetLayout(db, viewer, filter, await getTranslations("cases"));
  if (!file) notFound();
  return xlsxResponse(file.bytes, file.fileName, file.asciiName);
}
