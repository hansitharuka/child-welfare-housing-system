import { expect, type Page } from "@playwright/test";

/** The sample accounts' passwords, from prisma/seed-users.ts (development and tests only). */
export const PASSWORD = "Sample-Pass-2026";
export const TEMPORARY_PASSWORD = "Temp-Pass-2026";

export const TEXT = {
  username: "පරිශීලක නාමය",
  password: "මුරපදය",
  signInButton: "ඇතුළු වන්න",
  signOutButton: "ඉවත් වන්න",
  notFound: "මෙම පිටුව සොයාගත නොහැක",
  wrongSignIn: /පරිශීලක නාමය හෝ මුරපදය වැරදියි/,
};

/**
 * Gives the page its own client address. In production Nginx passes the real one; here it keeps
 * each test's sign-ins apart, so the 10-per-minute limit (SEC-4) doesn't block a busy test run.
 */
async function giveOwnAddress(page: Page) {
  const part = () => Math.floor(Math.random() * 250) + 1;
  await page.setExtraHTTPHeaders({ "x-forwarded-for": `10.${part()}.${part()}.${part()}` });
}

/** A form's error box. Next.js has its own hidden role="alert" element, so find ours by id. */
export const signInError = (page: Page) => page.locator("#sign-in-error");
export const changePasswordError = (page: Page) => page.locator("#change-password-error");

/** Fills in and sends the sign-in form. */
export async function signIn(page: Page, username: string, password = PASSWORD) {
  await giveOwnAddress(page);
  if (!page.url().includes("/login")) await page.goto("/login");
  // After a refused sign-in React clears the form; wait for that before typing again.
  const passwordField = page.getByLabel(TEXT.password, { exact: true });
  await expect(page.getByRole("button", { name: TEXT.signInButton })).toBeEnabled();
  await expect(passwordField).toHaveValue("");
  await page.getByLabel(TEXT.username).fill(username);
  await passwordField.fill(password);
  await page.getByRole("button", { name: TEXT.signInButton }).click();
}

/** Signs in and waits for the page the account lands on. */
export async function signInAs(page: Page, username: string, landsOn: RegExp) {
  await signIn(page, username);
  await expect(page).toHaveURL(landsOn);
}
