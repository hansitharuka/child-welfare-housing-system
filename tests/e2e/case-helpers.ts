import { type Browser, expect, type Page } from "@playwright/test";
import { signInAs, TEST_CASE_NAME } from "./helpers";

/** Screen text the case tests look for (messages/si.json). */
export const SEND = "ප්‍රධාන කාර්යාලයට යවන්න";
export const CONFIRM = "ඔව්, යවන්න";
export const SUBMITTED = "පරීක්ෂාවට යවා ඇත";
export const YEAR = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Colombo", year: "numeric" }).format(new Date());
/** Today in Colombo as a date field takes it, "YYYY-MM-DD". */
export const TODAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Colombo" }).format(new Date());

/** A made-up 12-digit NIC (SEC-11), different in every test. */
export function randomNic(): string {
  return `2${Array.from({ length: 11 }, () => Math.floor(Math.random() * 10)).join("")}`;
}

export type CaseInput = { name: string; nic: string; atRisk?: boolean };

export async function fillCase(page: Page, input: CaseInput) {
  await page.getByRole("radio", { name: input.atRisk ? /^අවදානම් දරුවන්/ : /^නිවාසගත/ }).check();
  await page.getByRole("radio", { name: /^නව නිවසක් ඉදිකිරීම/ }).check();
  if (input.atRisk) await page.getByLabel("දරුවාගේ නම *").fill("පරීක්ෂණ දරුවා");
  await page.getByLabel(input.atRisk ? "භාරකරුගේ නම *" : "නම *", { exact: true }).fill(input.name);
  await page
    .getByLabel(input.atRisk ? "භාරකරුගේ ජාතික හැඳුනුම්පත් අංකය *" : "ජාතික හැඳුනුම්පත් අංකය *")
    .fill(input.nic);
  await page.getByLabel("ලිපිනය *").fill("නො. 1, පරීක්ෂණ පාර, නගරය");
  await page.getByLabel("දුරකතන අංකය *", { exact: true }).fill("071 000 0401");
}

/** Sends the filled form to Head Office through the confirmation, and returns the new case's page. */
export async function submit(page: Page, area: "ds" | "ho"): Promise<{ url: string; number: string }> {
  await page.getByRole("button", { name: SEND }).click();
  await expect(page.getByRole("heading", { name: "ප්‍රධාන කාර්යාලයට යවන්නද?" })).toBeVisible();
  await page.getByRole("button", { name: CONFIRM }).click();
  await expect(page).toHaveURL(new RegExp(`/${area}/cases/[0-9a-f-]{36}\\?notice=submitted$`));
  return { url: page.url().split("?")[0] ?? "", number: await page.getByTestId("case-number").innerText() };
}

/** Enters and submits a complete case as the signed-in DS officer. */
export async function newSubmittedCase(page: Page, input: CaseInput) {
  await page.goto("/ds/cases/new");
  await fillCase(page, input);
  return submit(page, "ds");
}

/** A second person's browser window, beside the first, signed in and on their home page. */
export async function asUser(browser: Browser, username: string, run: (page: Page) => Promise<void>) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "si-LK" });
  try {
    const page = await context.newPage();
    await signInAs(page, username, username.startsWith("ho") ? /\/ho$/ : /\/ds$/);
    await run(page);
  } finally {
    await context.close();
  }
}

/** A signed-in window kept open for the whole test, for back-and-forth between two people. */
export async function openAs(browser: Browser, username: string): Promise<Page> {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "si-LK" });
  const page = await context.newPage();
  await signInAs(page, username, username.startsWith("ho") ? /\/ho$/ : /\/ds$/);
  return page;
}

/**
 * A case of the DS officer's office that Head Office has verified and released today, from the case's
 * own page: ready for its installments and building progress (Phase 6).
 */
export async function releasedCase(ds: Page, ho: Page, label: string) {
  const name = `${TEST_CASE_NAME} ${label} ${Date.now()}`;
  const { url, number } = await newSubmittedCase(ds, { name, nic: randomNic() });
  const caseId = url.split("/").at(-1) ?? "";
  await ho.goto(`/ho/cases/${caseId}`);
  await ho.getByRole("button", { name: "අනුමත කරන්න", exact: true }).click();
  await ho.getByRole("dialog").getByRole("button", { name: "ඔව්, අනුමත කරන්න" }).click();
  await expect(ho).toHaveURL(new RegExp(`/ho/cases/${caseId}\\?notice=verified$`));
  await ho.getByLabel("යොමු අංකය *").fill("HO/2026/E2E-P6");
  await ho.getByRole("button", { name: "රු. 2,000,000 නිදහස් කළ බව සටහන් කරන්න" }).click();
  await expect(ho).toHaveURL(new RegExp(`/ho/cases/${caseId}\\?notice=released$`));
  return { caseId, url, name, number };
}
