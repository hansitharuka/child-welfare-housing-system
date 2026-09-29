import { type Browser, expect, type Page, test } from "@playwright/test";
import { randomLetters, signIn, signInAs, signInError, TEST_MARKER, TEXT } from "./helpers";

const NEW_OFFICER_NAME = "ඊ. පරීක්ෂණ";

/** Creates a DS officer at Homagama through the admin screens and returns the credentials shown once. */
async function createOfficer(page: Page): Promise<{ username: string; password: string }> {
  await page.goto("/admin/users");
  await page.getByRole("link", { name: "නව පරිශීලකයෙකු එක් කරන්න" }).click();
  await page.getByLabel("සම්පූර්ණ නම *").fill(NEW_OFFICER_NAME);
  await page.getByLabel("තනතුර (අවශ්‍ය නම් පමණි)").fill("සංවර්ධන නිලධාරී");
  await page.getByLabel("ජංගම දුරකතන අංකය *").fill("071 000 0301");
  await page.getByRole("radio", { name: /ප්‍රා\.ලේ\. නිලධාරී/ }).check();
  await page.getByLabel("දිස්ත්‍රික්කය *").selectOption({ label: "කොළඹ" });
  await page.getByRole("radio", { name: /^හෝමාගම/ }).check();
  // ADM-3: Homagama already has sample officers.
  await expect(page.getByRole("status")).toContainText("මෙම කාර්යාලයට දැනටමත් සක්‍රිය ගිණුම්");
  await page.getByRole("button", { name: "ගිණුම සාදන්න" }).click();

  await expect(page.getByRole("heading", { name: "ගිණුම සාදන ලදී" })).toBeVisible();
  return {
    username: await page.getByTestId("new-username").innerText(),
    password: await page.getByTestId("new-password").innerText(),
  };
}

/** A second browser window for the new officer, next to the admin's. */
async function asNewOfficer(browser: Browser, run: (page: Page) => Promise<void>) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "si-LK" });
  try {
    await run(await context.newPage());
  } finally {
    await context.close();
  }
}

async function openRow(page: Page, username: string) {
  await page.goto(`/admin/users?q=${username}`);
  await expect(page.getByRole("row")).toHaveCount(2);
}

test("AC-3: the admin creates a DS officer, who signs in and must set a new password", async ({ page, browser }) => {
  // Two browser windows and several page loads; the dev server compiles each page on first use.
  test.slow();
  await signInAs(page, "ad0001", /\/admin\/users$/);
  const { username, password } = await createOfficer(page);
  expect(username).toMatch(/^ds\d{4}$/);
  expect(password).toMatch(/^[A-Za-z0-9]{4}-[A-Za-z0-9]{4}-[A-Za-z0-9]{4}$/);

  await asNewOfficer(browser, async (officer) => {
    await signIn(officer, username, password);
    await expect(officer).toHaveURL(/\/change-password$/);
    await officer.getByLabel("දැනට ඇති මුරපදය").fill(password);
    await officer.getByLabel("නව මුරපදය", { exact: true }).fill("Officer-Own-Pass-1");
    await officer.getByLabel("නව මුරපදය නැවත").fill("Officer-Own-Pass-1");
    await officer.getByRole("button", { name: "සුරකින්න" }).click();
    await expect(officer).toHaveURL(/\/ds$/);
    await expect(officer.getByRole("banner")).toContainText("හෝමාගම ප්‍රාදේශීය ලේකම් කාර්යාලය");
  });
});

test("the form explains what is wrong and keeps what was typed", async ({ page }) => {
  await signInAs(page, "ad0001", /\/admin\/users$/);
  await page.goto("/admin/users/new");
  await page.getByLabel("සම්පූර්ණ නම *").fill(NEW_OFFICER_NAME);
  await page.getByLabel("ජංගම දුරකතන අංකය *").fill("12345");
  await page.getByRole("radio", { name: /ප්‍රා\.ලේ\. නිලධාරී/ }).check();
  await page.getByRole("button", { name: "ගිණුම සාදන්න" }).click();

  await expect(page.getByText("0 න් පටන් ගන්නා ඉලක්කම් 10ක දුරකතන අංකයක් ඇතුළත් කරන්න.")).toBeVisible();
  await expect(page.getByText("ප්‍රාදේශීය ලේකම් කාර්යාලය තෝරන්න.")).toBeVisible();
  await expect(page.getByLabel("සම්පූර්ණ නම *")).toHaveValue(NEW_OFFICER_NAME);
});

test("moving an officer to another office is recorded in the account's history (ADM-4)", async ({ page }) => {
  test.slow();
  await signInAs(page, "ad0001", /\/admin\/users$/);
  const { username } = await createOfficer(page);

  await openRow(page, username);
  await page.getByRole("link", { name: `සංස්කරණය: ${NEW_OFFICER_NAME}` }).click();
  await page.getByRole("radio", { name: /^කඩුවෙල/ }).check();
  await page.getByRole("button", { name: "සුරකින්න" }).click();

  await expect(page).toHaveURL(/notice=transferred/);
  await expect(page.getByRole("status")).toContainText("කාර්යාලය වෙනස් කළා");
  await openRow(page, username);
  await expect(page.getByRole("row").nth(1)).toContainText("කඩුවෙල");
  await page.getByRole("link", { name: `සංස්කරණය: ${NEW_OFFICER_NAME}` }).click();
  await expect(page.getByRole("region", { name: "ගිණුමේ ඉතිහාසය" })).toContainText("කාර්යාලය: හෝමාගම → කඩුවෙල");
});

test("a new password replaces the old one, and a disabled account can't sign in (ADM-5, ADM-6)", async ({
  page,
  browser,
}) => {
  test.slow();
  await signInAs(page, "ad0001", /\/admin\/users$/);
  const { username, password: firstPassword } = await createOfficer(page);

  await openRow(page, username);
  await page.getByRole("button", { name: `නව මුරපදය: ${NEW_OFFICER_NAME}` }).click();
  await page.getByRole("dialog").getByRole("button", { name: "නව මුරපදය" }).click();
  await expect(page.getByRole("dialog")).toContainText("නව මුරපදය සාදන ලදී");
  const secondPassword = await page.getByRole("dialog").getByTestId("new-password").innerText();
  await page.getByRole("dialog").getByRole("button", { name: "හරි" }).click();

  await asNewOfficer(browser, async (officer) => {
    await signIn(officer, username, firstPassword);
    await expect(signInError(officer)).toHaveText(TEXT.wrongSignIn);
    await signIn(officer, username, secondPassword);
    await expect(officer).toHaveURL(/\/change-password$/);
  });

  await openRow(page, username);
  await page.getByRole("button", { name: `අක්‍රිය කරන්න: ${NEW_OFFICER_NAME}` }).click();
  await page.getByRole("dialog").getByRole("button", { name: "අක්‍රිය කරන්න" }).click();
  await expect(page.getByRole("row").nth(1)).toContainText("අක්‍රියයි");

  await asNewOfficer(browser, async (officer) => {
    await signIn(officer, username, secondPassword);
    await expect(signInError(officer)).toHaveText(TEXT.wrongSignIn);
  });
});

test("the admin can't disable their own account", async ({ page }) => {
  await signInAs(page, "ad0001", /\/admin\/users$/);
  await openRow(page, "ad0001");
  await expect(page.getByRole("row").nth(1)).toContainText("(ඔබ)");
  await expect(page.getByRole("button", { name: /^අක්‍රිය කරන්න/ })).toHaveCount(0);
});

test("the admin adds a DS office to a district (LST-2)", async ({ page }) => {
  // No seeded office code starts with Q.
  const code = `Q${randomLetters(2)}`;
  const nameSi = `පරීක්ෂණ කාර්යාලය ${code}`;

  await signInAs(page, "ad0001", /\/admin\/users$/);
  await page.goto("/admin/lists");
  await page.getByRole("link", { name: /^කෑගල්ල/ }).click();
  await expect(page.getByRole("heading", { name: "කෑගල්ල දිස්ත්‍රික්කය" })).toBeVisible();

  // A wrong code is explained, and what was typed stays.
  await page.getByLabel("නම (සිංහලෙන්) *").fill(nameSi);
  await page.getByLabel("නම (ඉංග්‍රීසියෙන්) *").fill(`${TEST_MARKER} Office ${code}`);
  await page.getByLabel("කේතය *").fill("Q1");
  await page.getByRole("button", { name: "එක් කරන්න" }).click();
  await expect(page.getByText("ඉංග්‍රීසි කැපිටල් අකුරු 3ක කේතයක් ඇතුළත් කරන්න.")).toBeVisible();
  await expect(page.getByLabel("නම (සිංහලෙන්) *")).toHaveValue(nameSi);

  await page.getByLabel("කේතය *").fill(code.toLowerCase());
  await page.getByRole("button", { name: "එක් කරන්න" }).click();
  await expect(page.getByRole("status")).toHaveText("එක් කළා.");
  const row = page.getByRole("row").filter({ hasText: nameSi });
  await expect(row).toContainText(code);
  await expect(row).toContainText("ගිණුමක් නැත");
});

test("the admin adds and reorders renovation stages (LST-4)", async ({ page }) => {
  const suffix = `${randomLetters(4)} ${TEST_MARKER}`;
  const first = `පළමු මට්ටම ${suffix}`;
  const second = `දෙවන මට්ටම ${suffix}`;
  await signInAs(page, "ad0001", /\/admin\/users$/);
  await page.goto("/admin/lists?tab=stages");

  const renovation = page.getByRole("region", { name: "නිවස අලුත්වැඩියා කිරීම" });
  const stages = renovation.getByRole("listitem");
  for (const name of [first, second]) {
    await renovation.getByLabel("මට්ටමේ නම *").fill(name);
    await renovation.getByRole("button", { name: "එක් කරන්න" }).click();
    await expect(stages.filter({ hasText: name })).toBeVisible();
    await expect(renovation.getByLabel("මට්ටමේ නම *")).toHaveValue("");
  }

  const order = async () => {
    const texts = await stages.allInnerTexts();
    return [first, second].map((name) => texts.findIndex((text) => text.includes(name)));
  };
  const [firstAt, secondAt] = await order();
  expect(secondAt).toBeGreaterThan(firstAt);
  await renovation.getByRole("button", { name: `ඉහළට ගෙන යන්න: ${second}` }).click();
  await expect.poll(order).toEqual([secondAt, firstAt]);

  // The other kind's list is untouched.
  const newHouse = page.getByRole("region", { name: "නව නිවසක් ඉදිකිරීම" });
  await expect(newHouse.getByRole("listitem").first()).toContainText("අත්තිවාරම් මට්ටම");
});

test("Head Office officers get 'not found' on the admin pages (PRM-2)", async ({ page }) => {
  await signInAs(page, "ho0001", /\/ho$/);
  for (const path of ["/admin/users", "/admin/users/new", "/admin/lists"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(TEXT.notFound);
  }
});
