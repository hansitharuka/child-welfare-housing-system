import { expect, test } from "@playwright/test";

const shells = [
  { path: "/ds", heading: "මගේ ප්‍රතිලාභීන්" },
  { path: "/ho", heading: "සාරාංශය" },
  { path: "/admin/users", heading: "පරිශීලකයින්" },
];

for (const shell of shells) {
  test(`${shell.path} shows its Sinhala shell and no English text`, async ({ page }) => {
    await page.goto(shell.path);

    await expect(page.locator("html")).toHaveAttribute("lang", "si");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(shell.heading);
    await expect(page.getByRole("navigation")).toBeVisible();
    await expect(page.getByRole("link", { name: shell.heading })).toHaveAttribute("aria-current", "page");
    expect(await page.locator("body").innerText()).not.toMatch(/[A-Za-z]/);
  });
}

test("/admin opens the users page", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/users$/);
});
