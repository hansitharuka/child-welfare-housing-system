import { expect, type Page, test } from "@playwright/test";
import ExcelJS from "exceljs";
import { newSubmittedCase, openAs, randomNic, releasedCase, SUBMITTED } from "./case-helpers";
import { signInAs, TEST_CASE_NAME } from "./helpers";

/** Screen and file text the test looks for (messages/si.json). */
const EXPORT = "එක්සෙල් ගොනුවක් ලෙස බාගන්න";
const FILE_NAME = /^දිවියට සවියක් ලැයිස්තුව \d{4}-\d{2}-\d{2}\.xlsx$/;
const HEADERS = ["ලියාපදිංචි අංකය", "කාණ්ඩය", "ආධාරය", "තත්ත්වය", "නම (අවදානම් දරුවන් සඳහා භාරකරුගේ නම)"];
const SHEET_EXPORT = "පැරණි පත්‍රිකාවේ ආකෘතියෙන් බාගන්න";
const SHEET_FILE_NAME = /^දිවියට සවියක් පැරණි ආකෘතිය \d{4}-\d{2}-\d{2}\.xlsx$/;

/** Clicks the export button and opens the file it downloads. */
async function exportList(page: Page) {
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: EXPORT }).click(),
  ]);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(await download.path());
  const sheet = workbook.worksheets[0];
  const rows = sheet.getSheetValues().slice(2) as unknown[][];
  return { fileName: download.suggestedFilename(), sheet, rows: rows.map((row) => row.slice(1, 6)) };
}

test("the DS officer and Head Office take their lists to Excel, with the screen's search and filters (EXP-1)", async ({
  page,
  browser,
}) => {
  test.slow();
  await signInAs(page, "ds0101", /\/ds$/);
  const name = `${TEST_CASE_NAME} එක්සෙල් ${Date.now()}`;
  const nic = randomNic();
  const { number } = await newSubmittedCase(page, { name, nic });
  const row = [number, "නිවාසගත", "නව නිවසක්", SUBMITTED, name];

  // The DS officer's own list, with the search the screen shows.
  await page.goto("/ds");
  await page.getByRole("searchbox").fill(nic);
  await page.getByRole("button", { name: "සොයන්න" }).click();
  await expect(page).toHaveURL(new RegExp(`/ds\\?q=${nic}$`));
  const own = await exportList(page);
  expect(own.fileName).toMatch(FILE_NAME);
  expect(own.sheet.name).toBe("ප්‍රතිලාභීන්");
  expect((own.sheet.getRow(1).values as unknown[]).slice(1, 6)).toEqual(HEADERS);
  expect(own.rows).toEqual([row]);

  // Head Office's list, with its filters.
  const ho = await openAs(browser, "ho0001");
  await ho.goto(`/ho/cases?q=${nic}&status=SUBMITTED`);
  await expect(ho.getByText("ගැළපෙන ප්‍රතිලාභීන් 1")).toBeVisible();
  const all = await exportList(ho);
  expect(all.fileName).toMatch(FILE_NAME);
  expect(all.rows).toEqual([row]);

  // Each list's file belongs to its own role (PRM-1).
  expect((await page.request.get("/ho/cases/export")).status()).toBe(404);
  expect((await ho.request.get("/ds/export")).status()).toBe(404);
  await ho.context().close();
});

test("Head Office takes its list to Excel in the old sheet's layout, two tabs with its columns (EXP-2, AC-18)", async ({
  page,
  browser,
}) => {
  test.slow();
  await signInAs(page, "ds0101", /\/ds$/);
  const ho = await openAs(browser, "ho0001");
  const { number, name } = await releasedCase(page, ho, "පැරණි ආකෘතිය");

  await ho.goto(`/ho/cases?q=${number}`);
  await expect(ho.getByText("ගැළපෙන ප්‍රතිලාභීන් 1")).toBeVisible();
  const [download] = await Promise.all([
    ho.waitForEvent("download"),
    ho.getByRole("link", { name: SHEET_EXPORT }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(SHEET_FILE_NAME);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(await download.path());
  expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(["නිවාසගත", "අවදානම් දරුවන්"]);

  // The case is on its category's tab, under the old sheet's two header rows; the other tab is empty.
  const [careLeavers, atRisk] = workbook.worksheets;
  expect(careLeavers.getRow(1).getCell(2).value).toBe("නම");
  expect(careLeavers.getRow(1).getCell(8).value).toBe("මූල්‍ය ප්‍රගතිය (රු)");
  expect(careLeavers.getRow(2).getCell(8).value).toBe("පළමු වාරිකය");
  expect(careLeavers.rowCount).toBe(3);
  expect(atRisk.rowCount).toBe(2);
  const row = careLeavers.getRow(3);
  expect([1, 2, 6, 7].map((cell) => row.getCell(cell).value)).toEqual([number, name, "කොළඹ", "හෝමාගම"]);
  expect([8, 9, 10, 11].map((cell) => row.getCell(cell).value)).toEqual(Array(4).fill("තවම ආරම්භ කර නැත"));

  // The file belongs to Head Office (PRM-1).
  expect((await page.request.get("/ho/cases/export/sheet")).status()).toBe(404);
  await ho.context().close();
});

test("an admin can't export any list (PRM-2, AC-2)", async ({ page }) => {
  await signInAs(page, "ad0001", /\/admin\/users$/);
  for (const path of ["/ho/cases/export", "/ho/cases/export/sheet", "/ds/export"])
    expect((await page.request.get(path)).status()).toBe(404);
});
