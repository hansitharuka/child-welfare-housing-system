import { execSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { randomNic } from "./case-helpers";
import { signInAs } from "./helpers";

/** Screen text the test looks for (messages/si.json). */
const TAB = /^විස්තර අසම්පූර්ණ \(\d+\)$/;
const FILL = "නැති විස්තර එක් කරන්න";
const MISSING = "තවම නැති විස්තර: ලබා දෙන ආධාරය, ජාතික හැඳුනුම්පත් අංකය, දුරකතන අංකය";

/** A made-up case from the sheet at Homagama, with no kind, NIC or phone number (imported-case.ts). */
function importedCase(): { id: string; name: string; sheetPhone: string } {
  return JSON.parse(execSync("npx tsx tests/e2e/imported-case.ts", { encoding: "utf8" }));
}

test("the DS office finds its cases from the old sheet that lack details, and fills them in (IMP-4, IMP-5)", async ({
  page,
}) => {
  test.slow();
  const { id, name, sheetPhone } = importedCase();
  const nic = randomNic();

  // The home page's own tab lists it.
  await signInAs(page, "ds0101", /\/ds$/);
  await page.getByRole("link", { name: TAB }).click();
  await expect(page).toHaveURL(/\/ds\?tab=detailsMissing$/);
  const row = page.getByRole("row").filter({ hasText: name });
  await expect(row).toContainText(FILL);
  await row.getByRole("link").click();

  // The case page says what is missing, and shows the sheet's notes as written.
  await expect(page).toHaveURL(new RegExp(`/ds/cases/${id}$`));
  await expect(page.getByText(MISSING)).toBeVisible();
  const sheet = page.getByRole("region", { name: "පැරණි පත්‍රිකාවේ සටහන්" });
  await expect(sheet).toContainText("පළමු වාරිකයඔව්");
  await expect(sheet).toContainText("දෙවන වාරිකය2026 දෙසැම්බර් මාසයේ බලාපොරොත්තු වේ");
  await expect(sheet).toContainText(`දුරකතන අංකය${sheetPhone}`);
  await page.getByRole("link", { name: FILL }).click();

  // The form shows the sheet's phone cell to copy from, and checks what is typed.
  await expect(page).toHaveURL(new RegExp(`/ds/cases/${id}/fill$`));
  await expect(page.getByText(`පැරණි පත්‍රිකාවේ ලියා තිබුණේ: ${sheetPhone}`)).toBeVisible();
  await page.getByLabel("ජාතික හැඳුනුම්පත් අංකය").fill("12345");
  await page.getByRole("button", { name: "සුරකින්න" }).click();
  await expect(page.locator("#imported-errors")).toContainText("හැඳුනුම්පත් අංකය වැරදියි");

  await page.getByRole("radio", { name: /^නව නිවසක් ඉදිකිරීම/ }).check();
  await page.getByLabel("ජාතික හැඳුනුම්පත් අංකය").fill(nic);
  await page.getByLabel("දුරකතන අංකය", { exact: true }).fill("077 123 4567");
  await page.getByRole("button", { name: "සුරකින්න" }).click();

  // Back on the case page, with the details saved and the change in its history.
  await expect(page).toHaveURL(new RegExp(`/ds/cases/${id}\\?notice=changed$`));
  await expect(page.getByText("වෙනස්කම් සුරකින ලදී.")).toBeVisible();
  await expect(page.getByText(MISSING)).toHaveCount(0);
  const details = page.getByRole("region", { name: "ප්‍රතිලාභියාගේ විස්තර" });
  await expect(details).toContainText(`ලබා දෙන ආධාරයනව නිවසක් ඉදිකිරීම`);
  await expect(details).toContainText(`ජාතික හැඳුනුම්පත් අංකය${nic}`);
  await expect(details).toContainText("දුරකතන අංකය0771234567");
  await expect(page.getByText("විස්තර වෙනස් කළා")).toBeVisible();

  // It has left the "details missing" tab.
  await page.goto("/ds?tab=detailsMissing");
  await expect(page.getByRole("row").filter({ hasText: name })).toHaveCount(0);
});
