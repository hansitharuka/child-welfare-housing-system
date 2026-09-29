import { expect, test } from "@playwright/test";
import { signInAs } from "./helpers";

const shells = [
  { username: "ds0101", home: /\/ds$/, heading: "මගේ ප්‍රතිලාභීන්", office: "හෝමාගම ප්‍රාදේශීය ලේකම් කාර්යාලය" },
  { username: "ho0001", home: /\/ho$/, heading: "සාරාංශය", office: "ප්‍රධාන කාර්යාලය" },
  { username: "ad0001", home: /\/admin\/users$/, heading: "පරිශීලකයින්", office: "ප්‍රධාන කාර්යාලය · පරිපාලක" },
];

for (const shell of shells) {
  test(`${shell.username} sees their Sinhala shell and no English text`, async ({ page }) => {
    await signInAs(page, shell.username, shell.home);

    await expect(page.locator("html")).toHaveAttribute("lang", "si");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(shell.heading);
    await expect(page.getByRole("banner")).toContainText(shell.office);
    await expect(page.getByRole("link", { name: shell.heading })).toHaveAttribute("aria-current", "page");
    // Usernames such as ds0101 are data, written in Latin letters on purpose (the admin's users list shows them).
    const text = (await page.locator("body").innerText()).replace(/\b(?:ds|ho|ad)\d{4,}\b/g, "");
    expect(text).not.toMatch(/[A-Za-z]/);
  });
}

test("the sign-in page is in Sinhala only", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("පද්ධතියට ඇතුළු වන්න");
  expect(await page.locator("body").innerText()).not.toMatch(/[A-Za-z]/);
});

test("/admin opens the users page", async ({ page }) => {
  await signInAs(page, "ad0001", /\/admin\/users$/);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/users$/);
});
