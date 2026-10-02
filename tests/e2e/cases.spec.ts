import { type Browser, expect, type Page, test } from "@playwright/test";
import { signInAs, TEST_CASE_NAME, TEXT } from "./helpers";

/** Screen text the tests look for (messages/si.json). */
const SEND = "ප්‍රධාන කාර්යාලයට යවන්න";
const CONFIRM = "ඔව්, යවන්න";
const SAVE_DRAFT = "පසුව සම්පූර්ණ කිරීමට සුරකින්න";
const SUBMITTED = "පරීක්ෂාවට යවා ඇත";
const YEAR = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Colombo", year: "numeric" }).format(new Date());

/** A made-up 12-digit NIC (SEC-11), different in every test. */
function randomNic(): string {
  return `2${Array.from({ length: 11 }, () => Math.floor(Math.random() * 10)).join("")}`;
}

/** The old 9-digit form of a 12-digit NIC whose eighth digit is 0 (CASE-6): "19" + 5 digits + "0" + 4 digits. */
function oldFormOf(nic: string): string {
  return `${nic.slice(2, 7)}${nic.slice(8, 12)}V`;
}

/** A new NIC that has an old form too: 19YYDDD0SSSS. */
function nicWithOldForm(): string {
  const digits = (n: number) => Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join("");
  return `19${digits(5)}0${digits(4)}`;
}

type CaseInput = { name: string; nic: string; atRisk?: boolean };

async function fillCase(page: Page, input: CaseInput) {
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
async function submit(page: Page, area: "ds" | "ho"): Promise<{ url: string; number: string }> {
  await page.getByRole("button", { name: SEND }).click();
  await expect(page.getByRole("heading", { name: "ප්‍රධාන කාර්යාලයට යවන්නද?" })).toBeVisible();
  await page.getByRole("button", { name: CONFIRM }).click();
  await expect(page).toHaveURL(new RegExp(`/${area}/cases/[0-9a-f-]{36}\\?notice=submitted$`));
  return { url: page.url().split("?")[0] ?? "", number: await page.getByTestId("case-number").innerText() };
}

/** Enters and submits a complete case as the signed-in DS officer. */
async function newSubmittedCase(page: Page, input: CaseInput) {
  await page.goto("/ds/cases/new");
  await fillCase(page, input);
  return submit(page, "ds");
}

/** A second officer's browser window, beside the first. */
async function asOfficer(browser: Browser, username: string, run: (page: Page) => Promise<void>) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "si-LK" });
  try {
    const page = await context.newPage();
    await signInAs(page, username, /\/ds$/);
    await run(page);
  } finally {
    await context.close();
  }
}

const PDF = { name: "ලේඛනය.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n% made up\n") };

test("AC-5: submitting with required fields empty saves nothing and lists every error", async ({ page }) => {
  await signInAs(page, "ds0101", /\/ds$/);
  await page.goto("/ds/cases/new");
  await page.getByRole("button", { name: SEND }).click();

  const summary = page.locator("#case-errors");
  await expect(summary).toContainText("යැවීමට පෙර මේවා නිවැරදි කරන්න:");
  for (const message of [
    "කාණ්ඩය තෝරන්න.",
    "ආධාරයේ වර්ගය තෝරන්න.",
    "නම ඇතුළත් කරන්න.",
    "ජාතික හැඳුනුම්පත් අංකය ඇතුළත් කරන්න.",
    "ලිපිනය ඇතුළත් කරන්න.",
    "දුරකතන අංකය ඇතුළත් කරන්න.",
  ]) {
    await expect(summary.getByText(message)).toBeVisible();
  }
  // Each error also sits next to its field.
  await expect(page.locator("#nic-error")).toHaveText("ජාතික හැඳුනුම්පත් අංකය ඇතුළත් කරන්න.");
  await expect(page.locator("#mobile1-error")).toHaveText("දුරකතන අංකය ඇතුළත් කරන්න.");
  await expect(page.getByLabel("ජාතික හැඳුනුම්පත් අංකය *")).toHaveAttribute("aria-invalid", "true");
  // Nothing was saved: no confirmation, and the page did not move to a saved case.
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page).toHaveURL(/\/ds\/cases\/new$/);
});

test("AC-6: a wrong NIC is refused; both formats are accepted and kept as typed", async ({ page }) => {
  await signInAs(page, "ds0101", /\/ds$/);
  await page.goto("/ds/cases/new");
  await fillCase(page, { name: `${TEST_CASE_NAME} ඒ`, nic: "12345" });
  await page.getByRole("button", { name: SEND }).click();
  await expect(page.locator("#nic-error")).toContainText("හැඳුනුම්පත් අංකය වැරදියි");
  await expect(page.getByLabel("නම *", { exact: true })).toHaveValue(`${TEST_CASE_NAME} ඒ`);

  const nic = nicWithOldForm();
  await page.getByLabel("ජාතික හැඳුනුම්පත් අංකය *").fill(oldFormOf(nic).toLowerCase());
  const { number } = await submit(page, "ds");
  expect(number).toMatch(new RegExp(`^HMG-${YEAR}-\\d{3,}$`));
  await expect(page.getByText(oldFormOf(nic), { exact: true })).toBeVisible();
});

test("AC-8 (first half): a submitted case gets its number and shows as sent on the DS home", async ({ page }) => {
  test.slow();
  await signInAs(page, "ds0101", /\/ds$/);
  await page.goto("/ds/cases/new");
  const nic = randomNic();
  await fillCase(page, { name: `${TEST_CASE_NAME} බී`, nic, atRisk: true });
  await page.getByTestId("document-input").setInputFiles(PDF);
  await expect(page.getByText("උඩුගත කළා. සුරැකූ විට ප්‍රතිලාභියාට එක් වේ.")).toBeVisible();

  const { number } = await submit(page, "ds");
  expect(number).toMatch(new RegExp(`^HMG-${YEAR}-\\d{3,}$`));
  await expect(page.getByRole("heading", { name: "ප්‍රධාන කාර්යාලයට යවන ලදී" })).toBeVisible();
  const documentLink = page.getByRole("link", { name: "ලේඛනය.pdf" });
  const file = await page.request.get((await documentLink.getAttribute("href")) ?? "");
  expect(file.status()).toBe(200);
  expect(file.headers()["content-type"]).toBe("application/pdf");

  await page.goto(`/ds?q=${nic}`);
  const row = page.getByRole("row", { name: new RegExp(number) });
  await expect(row).toContainText(SUBMITTED);
  await expect(row).toContainText("පරීක්ෂණ දරුවා");
});

test("AC-7: a duplicate NIC shows the number and name in the same DS, only the number and DS elsewhere", async ({
  page,
  browser,
}) => {
  test.slow();
  await signInAs(page, "ds0101", /\/ds$/);
  const nic = nicWithOldForm();
  const first = await newSubmittedCase(page, { name: `${TEST_CASE_NAME} සී`, nic });

  // The same office, typing the old form of the same number.
  await page.goto("/ds/cases/new");
  await page.getByLabel("ජාතික හැඳුනුම්පත් අංකය *").fill(oldFormOf(nic));
  await page.getByLabel("ලිපිනය *").focus();
  await expect(page.getByTestId("nic-matches")).toContainText(`${first.number} (${TEST_CASE_NAME} සී)`);

  // Another office: the number and the office, never the name. Submitting still works.
  await asOfficer(browser, "ds0103", async (kaduwela) => {
    await kaduwela.goto("/ds/cases/new");
    await fillCase(kaduwela, { name: `${TEST_CASE_NAME} ඩී`, nic });
    await kaduwela.getByLabel("ලිපිනය *").focus();
    const warning = kaduwela.getByTestId("nic-matches");
    await expect(warning).toContainText(`හෝමාගම ප්‍රා.ලේ. කාර්යාලයේ ${first.number}`);
    await expect(warning).not.toContainText(TEST_CASE_NAME);

    await kaduwela.getByRole("button", { name: SEND }).click();
    await expect(kaduwela.getByRole("dialog").getByTestId("nic-matches")).toBeVisible();
    await kaduwela.getByRole("button", { name: CONFIRM }).click();
    await expect(kaduwela.getByTestId("case-number")).toHaveText(new RegExp(`^KDW-${YEAR}-\\d{3,}$`));
  });
});

test("AC-1: a DS officer sees only their own office's cases, and another office's case is 'not found'", async ({
  page,
  browser,
}) => {
  test.slow();
  await signInAs(page, "ds0103", /\/ds$/);
  await page.goto("/ds/cases/new");
  const nic = randomNic();
  await fillCase(page, { name: `${TEST_CASE_NAME} ඊ`, nic });
  await page.getByTestId("document-input").setInputFiles(PDF);
  await expect(page.getByText("උඩුගත කළා. සුරැකූ විට ප්‍රතිලාභියාට එක් වේ.")).toBeVisible();
  const kaduwelaCase = await submit(page, "ds");
  const fileHref = (await page.getByRole("link", { name: "ලේඛනය.pdf" }).getAttribute("href")) ?? "";

  await asOfficer(browser, "ds0101", async (homagama) => {
    for (const path of [kaduwelaCase.url, `${kaduwelaCase.url}/edit`]) {
      await homagama.goto(path);
      await expect(homagama.getByRole("heading", { level: 1 })).toHaveText(TEXT.notFound);
    }
    expect((await homagama.request.get(fileHref)).status()).toBe(404);

    await homagama.goto(`/ds?q=${nic}`);
    await expect(homagama.getByText("ගැළපෙන ප්‍රතිලාභීන් නැත.")).toBeVisible();
  });
});

test("a draft keeps what was typed, shows in the to-do panel, and can be deleted (CASE-4, CASE-8)", async ({
  page,
}) => {
  test.slow();
  await signInAs(page, "ds0101", /\/ds$/);
  await page.goto("/ds/cases/new");
  const name = `${TEST_CASE_NAME} එෆ් ${Date.now()}`;
  await page.getByLabel("නම *", { exact: true }).fill(name);
  await page.getByLabel("දුරකතන අංකය *", { exact: true }).fill("123");
  await page.getByRole("button", { name: SAVE_DRAFT }).click();
  // Format rules still apply to a draft.
  await expect(page.locator("#mobile1-error")).toContainText("දුරකතන අංකය වැරදියි");

  await page.getByLabel("දුරකතන අංකය *", { exact: true }).fill("");
  await page.getByRole("button", { name: SAVE_DRAFT }).click();
  await expect(page).toHaveURL(/\/ds\/cases\/[0-9a-f-]{36}\/edit\?notice=saved$/);
  await expect(page.getByLabel("නම *", { exact: true })).toHaveValue(name);

  await page.goto("/ds");
  await expect(page.getByRole("complementary").getByText(`${name}: තවම යවා නැත`)).toBeVisible();
  await page.getByRole("complementary").getByText(`${name}: තවම යවා නැත`).click();
  await page.getByRole("button", { name: "කෙටුම්පත මකන්න" }).click();
  await page.getByRole("button", { name: "ඔව්, මකන්න" }).click();
  await expect(page).toHaveURL(/\/ds\?notice=deleted$/);
  await expect(page.getByText(`${name}: තවම යවා නැත`)).toBeHidden();
});

test("a file that is not a PDF, JPEG or PNG is refused on its own; the others still upload (ERR-5)", async ({
  page,
}) => {
  await signInAs(page, "ds0101", /\/ds$/);
  await page.goto("/ds/cases/new");
  await page
    .getByTestId("document-input")
    .setInputFiles([{ name: "බොරු.pdf", mimeType: "application/pdf", buffer: Buffer.from("<html></html>") }, PDF]);

  await expect(page.getByText("PDF, JPEG හෝ PNG ගොනුවක් පමණක් අමුණන්න.")).toBeVisible();
  await expect(page.getByText("උඩුගත කළා. සුරැකූ විට ප්‍රතිලාභියාට එක් වේ.")).toBeVisible();
});

test("Head Office enters a case for a DS it chooses, and finds it in the case list (CASE-3, FND-1)", async ({
  page,
}) => {
  test.slow();
  await signInAs(page, "ho0001", /\/ho$/);
  await page.getByRole("link", { name: "ප්‍රතිලාභීන්", exact: true }).click();
  await page.getByRole("link", { name: /නව ප්‍රතිලාභියෙකු ඇතුළත් කරන්න/ }).click();
  const nic = randomNic();
  await fillCase(page, { name: `${TEST_CASE_NAME} ජී`, nic });

  // Without an office nothing is sent.
  await page.getByRole("button", { name: SEND }).click();
  await expect(page.locator("#dsOfficeId-error")).toHaveText("ප්‍රාදේශීය ලේකම් කොට්ඨාසය තෝරන්න.");

  await page.getByLabel("දිස්ත්‍රික්කය *").selectOption({ label: "කොළඹ" });
  await page.getByLabel("ප්‍රාදේශීය ලේකම් කොට්ඨාසය *").selectOption({ label: "කඩුවෙල" });
  const { number } = await submit(page, "ho");
  expect(number).toMatch(new RegExp(`^KDW-${YEAR}-\\d{3,}$`));

  await page.goto(`/ho/cases?q=${nic}`);
  const row = page.getByRole("row", { name: new RegExp(number) });
  await expect(row).toContainText("කඩුවෙල");
  await expect(row).toContainText(SUBMITTED);
});
