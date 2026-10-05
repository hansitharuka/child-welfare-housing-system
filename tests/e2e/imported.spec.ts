import { execSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { openAs, randomNic, TODAY } from "./case-helpers";
import { signInAs } from "./helpers";

/** Screen text the test looks for (messages/si.json). */
const TAB = /^විස්තර අසම්පූර්ණ \(\d+\)$/;
const FILL = "නැති විස්තර එක් කරන්න";
const MISSING = "තවම නැති විස්තර: ලබා දෙන ආධාරය, ජාතික හැඳුනුම්පත් අංකය, දුරකතන අංකය";

const CONFIRM_MENU = "පැරණි පත්‍රිකාව තහවුරු කිරීම";
const CONFIRM = "තහවුරු කරන්න";
const CONFIRM_YES = "ඔව්, තහවුරු කරන්න";
const SHEET_NOTES = "පැරණි පත්‍රිකාවේ සටහන්";
const HISTORY = "සිදු වූ දේ";
const MONEY = "මූල්‍ය ප්‍රගතිය";
const shown = (day: string) => day.replaceAll("-", ".");

/** A day `count` days before today in Colombo, as a date field takes it. */
function daysAgo(count: number): string {
  const day = new Date(`${TODAY}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() - count);
  return day.toISOString().slice(0, 10);
}

/**
 * A made-up case from the sheet at Homagama, with no kind, NIC or phone number (imported-case.ts), or
 * with its kind of help already filled in by the office.
 */
function importedCase(kind: "NEW_HOUSE" | null = null): { id: string; name: string; sheetPhone: string } {
  const args = kind ? ` --kind ${kind}` : "";
  return JSON.parse(execSync(`npx tsx tests/e2e/imported-case.ts${args}`, { encoding: "utf8" }));
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

test("Head Office confirms a case from the sheet as in progress, and the office carries on from there (IMP-5)", async ({
  page,
  browser,
}) => {
  test.slow();
  const { id, name } = importedCase("NEW_HOUSE");

  // The menu leads to the cases still to confirm, in the sheet's order.
  await signInAs(page, "ho0001", /\/ho$/);
  await page.getByRole("link", { name: CONFIRM_MENU }).click();
  await expect(page).toHaveURL(/\/ho\/imported$/);
  await page.goto(`/ho/imported?case=${id}`);
  const chosen = page.getByRole("region", { name });
  await expect(chosen).toContainText("නිවාසගත පත්‍රිකාව · පේළිය 2");
  await expect(chosen.getByRole("region", { name: SHEET_NOTES })).toContainText("පළමු වාරිකයඔව්");

  // The installments are recorded in order (INS-2).
  await chosen.getByRole("radio", { name: /^වැඩ සිදුවෙමින්/ }).check();
  await chosen.getByLabel("නිදහස් කළ දිනය *").fill(daysAgo(40));
  await chosen.getByLabel("යොමු අංකය *").fill("HO/E2E/1");
  await chosen.getByLabel("දෙවන වාරිකය: තත්ත්වය").selectOption("PROCESSING");
  await chosen.getByRole("button", { name: CONFIRM, exact: true }).click();
  await expect(chosen.getByText("වාරික පිළිවෙළින් සටහන් කරන්න.", { exact: false })).toBeVisible();

  await chosen.getByLabel("පළමු වාරිකය: තත්ත්වය").selectOption("RELEASED");
  await chosen.locator("#confirm-day1").fill(daysAgo(30));
  await chosen.locator("#confirm-day2").fill(TODAY);
  await chosen.getByRole("button", { name: CONFIRM, exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "තහවුරු කරන්නද?" });
  await expect(dialog).toContainText(`${name} “වැඩ සිදුවෙමින්” ලෙස තහවුරු කළ පසු`);
  await dialog.getByRole("button", { name: CONFIRM_YES }).click();

  // Back on the list, which no longer has it.
  await expect(page).toHaveURL(new RegExp(`/ho/imported\\?notice=confirmed&done=${id}$`));
  await expect(page.getByText(`“වැඩ සිදුවෙමින්” ලෙස තහවුරු කළා.`)).toBeVisible();
  await expect(page.getByRole("link", { name: new RegExp(name) })).toHaveCount(0);

  // Its page shows the money recorded, and the confirmation in its history.
  await page.goto(`/ho/cases/${id}`);
  await expect(page.getByText("වැඩ සිදුවෙමින්").first()).toBeVisible();
  const money = page.getByRole("region", { name: MONEY });
  await expect(money).toContainText(`ගෙවූ දිනය: ${shown(daysAgo(30))}`);
  await expect(money).toContainText(`බලාපොරොත්තු දිනය: ${shown(TODAY)}`);
  const history = page.getByRole("region", { name: HISTORY });
  await expect(history).toContainText("පැරණි පත්‍රිකාවේ විස්තර “වැඩ සිදුවෙමින්” ලෙස තහවුරු කළා. ලියාපදිංචි අංකය HMG-");
  await expect(history).toContainText("ගෙවූ වාරික 1 / 4");

  // The office still fills in the NIC the sheet lacked (IMP-4), but not the kind, which is confirmed.
  const ds = await openAs(browser, "ds0101");
  await ds.goto("/ds?tab=detailsMissing");
  const row = ds.getByRole("row").filter({ hasText: name });
  await expect(row).toContainText(FILL);
  await row.getByRole("link").click();
  await expect(ds.getByText("තවම නැති විස්තර: ජාතික හැඳුනුම්පත් අංකය, දුරකතන අංකය")).toBeVisible();
  await expect(ds.getByRole("button", { name: "ගෙවූ බව සටහන් කරන්න" })).toBeVisible();
  await ds.getByRole("link", { name: FILL }).click();
  await expect(ds).toHaveURL(new RegExp(`/ds/cases/${id}/fill$`));
  await expect(ds.getByRole("radio")).toHaveCount(0);
  await ds.getByLabel("ජාතික හැඳුනුම්පත් අංකය").fill(randomNic());
  await ds.getByRole("button", { name: "සුරකින්න" }).click();
  await expect(ds).toHaveURL(new RegExp(`/ds/cases/${id}\\?notice=changed$`));
  await expect(ds.getByText("තවම නැති විස්තර: දුරකතන අංකය")).toBeVisible();
  await ds.context().close();
});

test("a case from the sheet whose kind is missing can only be rejected or stopped, from its page too (IMP-5)", async ({
  page,
}) => {
  test.slow();
  const { id, name } = importedCase();

  await signInAs(page, "ho0001", /\/ho$/);
  await page.goto(`/ho/cases/${id}`);
  await expect(page.getByText("ප්‍රා.ලේ. කාර්යාලය තවම පුරවා නැති විස්තර: ලබා දෙන ආධාරය")).toBeVisible();
  await expect(page.getByRole("region", { name: SHEET_NOTES })).toBeVisible();
  await expect(page.getByRole("radio", { name: /^අනුමතයි/ })).toHaveCount(0);
  await expect(page.getByRole("radio", { name: /^වැඩ සිදුවෙමින්/ })).toHaveCount(0);

  await page.getByRole("radio", { name: /^ප්‍රතික්ෂේප කළා/ }).check();
  await page.getByLabel("ප්‍රතික්ෂේප කිරීමට හේතුව *").fill("වෙනත් වැඩසටහනකින් නිවසක් ලැබී ඇත.");
  await page.getByRole("button", { name: CONFIRM, exact: true }).click();
  await page.getByRole("dialog", { name: "තහවුරු කරන්නද?" }).getByRole("button", { name: CONFIRM_YES }).click();

  await expect(page).toHaveURL(new RegExp(`/ho/cases/${id}\\?notice=confirmed$`));
  await expect(page.getByText(`${name} (HMG-`, { exact: false })).toBeVisible();
  await expect(page.getByRole("region", { name: "ප්‍රධාන කාර්යාලය මෙය ප්‍රතික්ෂේප කර ඇත" })).toContainText(
    "වෙනත් වැඩසටහනකින් නිවසක් ලැබී ඇත.",
  );
  await expect(page.getByRole("radio")).toHaveCount(0);
});
