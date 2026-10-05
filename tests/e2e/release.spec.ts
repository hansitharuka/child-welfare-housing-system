import { expect, type Page, test } from "@playwright/test";
import { CONFIRM, fillCase, newSubmittedCase, openAs, randomNic, SEND, submit } from "./case-helpers";
import { signInAs, TEST_CASE_NAME } from "./helpers";

/** Screen text the tests look for (messages/si.json). */
const CHECK_MENU = "පරීක්ෂා කිරීම සහ මුදල් නිදහස් කිරීම";
const VERIFY = "අනුමත කරන්න";
const SEND_BACK = "නිවැරදි කිරීමට ආපසු යවන්න";
const REJECT = "ප්‍රතික්ෂේප කරන්න";
const SEND_BACK_REASON = "ප්‍රා.ලේ. කාර්යාලය නිවැරදි කළ යුත්තේ කුමක්ද? *";
const REJECT_REASON = "ප්‍රතික්ෂේප කිරීමට හේතුව *";
const RELEASE = "රු. 2,000,000 නිදහස් කළ බව සටහන් කරන්න";
const NOT_STARTED = "තවම ආරම්භ කර නැත";

/** Opens a case from one of Head Office's two queues and waits for its details on the right. */
async function openFromQueue(ho: Page, queue: "check" | "release", number: string, name: string) {
  await ho.goto(`/ho/${queue}`);
  const list = ho.getByRole("region", {
    name: queue === "check" ? "පරීක්ෂා කිරීමට ඇති ප්‍රතිලාභීන්" : "මුදල් නිදහස් කිරීමට ඇති ප්‍රතිලාභීන්",
  });
  await list.getByRole("link", { name: new RegExp(number) }).click();
  await expect(ho.getByRole("heading", { level: 2, name })).toBeVisible();
}

test("AC-8, AC-9, AC-10: DS submits, Head Office sends back, DS corrects, Head Office verifies and releases", async ({
  page: ds,
  browser,
}) => {
  test.slow();
  const ho = await openAs(browser, "ho0001");
  const name = `${TEST_CASE_NAME} නිදහස් ${Date.now()}`;
  await signInAs(ds, "ds0101", /\/ds$/);
  const { url, number } = await newSubmittedCase(ds, { name, nic: randomNic() });
  const caseId = url.split("/").at(-1) ?? "";

  // AC-8: the case waits in the check queue, and the menu counts it.
  await ho.goto("/ho/check");
  await expect(
    ho.getByRole("link", { name: new RegExp(`^${CHECK_MENU} \\(බලා සිටින ප්‍රතිලාභීන් \\d+\\)$`) }),
  ).toBeVisible();
  await openFromQueue(ho, "check", number, name);

  // AC-9: sending back needs a reason.
  await ho.getByRole("button", { name: SEND_BACK }).click();
  await ho.getByRole("button", { name: "ආපසු යවන්න", exact: true }).click();
  await expect(ho.locator("#decision-reason-error")).toHaveText("හේතුව ඇතුළත් කරන්න.");
  await ho.getByLabel(SEND_BACK_REASON).fill("ලිපිනයේ ගම සඳහන් කරන්න.");
  await ho.getByRole("button", { name: "ආපසු යවන්න", exact: true }).click();
  await expect(ho).toHaveURL(new RegExp(`/ho/check\\?notice=sentBack&done=${caseId}$`));
  await expect(ho.getByRole("status")).toContainText(`${name} (${number}) නිවැරදි කිරීමට හෝමාගම`);

  // The DS sees the case and the reason in its to-do panel, and corrects it.
  await ds.goto("/ds");
  const todo = ds.getByRole("complementary");
  await expect(todo.getByText(`${name}: ආපසු එවා ඇත`)).toBeVisible();
  await expect(todo).toContainText("ලිපිනයේ ගම සඳහන් කරන්න.");
  await expect(ds.getByRole("link", { name: /^දැනුම්දීම්, නොකියවූ \d+$/ })).toBeVisible();
  await todo.getByText(`${name}: ආපසු එවා ඇත`).click();
  await expect(ds.getByText("ලිපිනයේ ගම සඳහන් කරන්න.")).toBeVisible();
  await ds.getByLabel("ලිපිනය", { exact: true }).fill("නො. 1, පරීක්ෂණ පාර, පරීක්ෂණ ගම");
  await ds.getByRole("button", { name: SEND }).click();
  await ds.getByRole("button", { name: CONFIRM }).click();
  await expect(ds.getByTestId("case-number")).toHaveText(number);

  // Back in the queue; verified after one confirmation.
  await openFromQueue(ho, "check", number, name);
  await ho.getByRole("button", { name: VERIFY, exact: true }).click();
  await ho.getByRole("dialog").getByRole("button", { name: "ඔව්, අනුමත කරන්න" }).click();
  await expect(ho).toHaveURL(new RegExp(`/ho/check\\?notice=verified&done=${caseId}$`));
  await expect(ho.getByRole("status")).toContainText(`${name} (${number}) අනුමත කළා`);

  // AC-10: in the release queue; a release without a reference number is refused.
  await openFromQueue(ho, "release", number, name);
  await expect(ho.getByText("රු. 2,000,000", { exact: true })).toBeVisible();
  await ho.getByRole("button", { name: RELEASE }).click();
  await expect(ho.locator("#record-referenceNumber-error")).toHaveText("යොමු අංකය ඇතුළත් කරන්න.");
  await ho.getByLabel("යොමු අංකය *").fill("HO/2026/E2E");
  await ho.getByRole("button", { name: RELEASE }).click();
  await expect(ho).toHaveURL(new RegExp(`/ho/release\\?notice=released&done=${caseId}$`));

  // Four installments, none started.
  await ho.goto(`/ho/cases/${caseId}`);
  const money = ho.getByRole("region", { name: "මූල්‍ය ප්‍රගතිය" });
  await expect(money).toContainText("HO/2026/E2E");
  await expect(money.getByText(NOT_STARTED, { exact: true })).toHaveCount(4);

  // The DS is notified; opening the notice shows the case and marks it read.
  await ds.goto("/ds/notifications");
  const notice = ds.getByRole("button", { name: new RegExp(`^${name} සඳහා රු\\. 2,000,000 නිදහස් කර ඇත`) });
  await expect(notice).toContainText("අලුත්");
  await notice.click();
  await expect(ds).toHaveURL(new RegExp(`/ds/cases/${caseId}$`));
  await expect(ds.getByRole("region", { name: "මූල්‍ය ප්‍රගතිය" }).getByText(NOT_STARTED, { exact: true })).toHaveCount(
    4,
  );
  await ds.goto("/ds/notifications");
  await expect(ds.getByRole("button", { name: new RegExp(`^${name} සඳහා`) })).not.toContainText("අලුත්");

  await ho.context().close();
});

test("rejecting needs a reason the DS office then reads (CHK-3)", async ({ page: ds, browser }) => {
  test.slow();
  await signInAs(ds, "ds0101", /\/ds$/);
  const name = `${TEST_CASE_NAME} ප්‍රතික්ෂේප ${Date.now()}`;
  const { url } = await newSubmittedCase(ds, { name, nic: randomNic() });
  const caseId = url.split("/").at(-1) ?? "";

  // Decided from the case's own page this time.
  const ho = await openAs(browser, "ho0001");
  await ho.goto(`/ho/cases/${caseId}`);
  await ho.getByRole("button", { name: REJECT }).click();
  await ho.getByLabel(REJECT_REASON).fill("නැත");
  await ho.getByRole("button", { name: REJECT }).click();
  await expect(ho.locator("#decision-reason-error")).toHaveText("හේතුව අවම වශයෙන් අක්ෂර 5ක් විය යුතුය.");
  await ho.getByLabel(REJECT_REASON).fill("මෙම පවුලට වෙනත් නිවාස ආධාරයක් ලැබී ඇත.");
  await ho.getByRole("button", { name: REJECT }).click();
  await expect(ho).toHaveURL(new RegExp(`/ho/cases/${caseId}\\?notice=rejected$`));
  await expect(ho.getByRole("status")).toContainText("ප්‍රතික්ෂේප කළා");
  await expect(ho.getByRole("button", { name: VERIFY, exact: true })).toBeHidden();
  await ho.context().close();

  await ds.goto(url);
  // The reason box at the top; the history repeats the reason further down.
  await expect(ds.getByRole("region", { name: "ප්‍රධාන කාර්යාලය මෙය ප්‍රතික්ෂේප කර ඇත" })).toContainText(
    "මෙම පවුලට වෙනත් නිවාස ආධාරයක් ලැබී ඇත.",
  );
});

test("Head Office corrects a verified case and its release, and both are saved (CASE-9, REL-4)", async ({
  page: ho,
}) => {
  test.slow();
  await signInAs(ho, "ho0001", /\/ho$/);
  // Head Office enters the case itself for Homagama, then checks and releases it from its page.
  await ho.goto("/ho/cases/new");
  const name = `${TEST_CASE_NAME} නිවැරදි ${Date.now()}`;
  await fillCase(ho, { name, nic: randomNic() });
  await ho.getByLabel("දිස්ත්‍රික්කය *").selectOption({ label: "කොළඹ" });
  await ho.getByLabel("ප්‍රාදේශීය ලේකම් කොට්ඨාසය *").selectOption({ label: "හෝමාගම" });
  const { url } = await submit(ho, "ho");
  await ho.getByRole("button", { name: VERIFY, exact: true }).click();
  await ho.getByRole("dialog").getByRole("button", { name: "ඔව්, අනුමත කරන්න" }).click();
  await expect(ho).toHaveURL(`${url}?notice=verified`);

  // CASE-9: one save button, and the change is kept.
  await ho.getByRole("link", { name: "විස්තර සංස්කරණය කරන්න" }).click();
  await expect(ho.getByRole("button", { name: SEND })).toBeHidden();
  await ho.getByLabel("දුරකතන අංකය", { exact: true }).fill("077 000 0909");
  await ho.getByRole("button", { name: "වෙනස්කම් සුරකින්න" }).click();
  await expect(ho).toHaveURL(`${url}?notice=changed`);
  await expect(ho.getByText("0770000909", { exact: true })).toBeVisible();

  await ho.getByLabel("යොමු අංකය *").fill("HO/2026/E2E-1");
  await ho.getByRole("button", { name: RELEASE }).click();
  await expect(ho).toHaveURL(`${url}?notice=released`);

  // REL-4: the reference number is corrected in a pop-up.
  await ho.getByRole("button", { name: "නිදහස් කිරීමේ විස්තර නිවැරදි කරන්න" }).click();
  const dialog = ho.getByRole("dialog");
  await dialog.getByLabel("යොමු අංකය *").fill("HO/2026/E2E-2");
  await dialog.getByRole("button", { name: "නිවැරදි කිරීම සුරකින්න" }).click();
  await expect(ho).toHaveURL(`${url}?notice=corrected`);
  await expect(ho.getByRole("region", { name: "මූල්‍ය ප්‍රගතිය" })).toContainText("HO/2026/E2E-2");
});
