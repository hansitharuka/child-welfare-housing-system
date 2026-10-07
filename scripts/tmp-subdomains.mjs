import { chromium } from "@playwright/test";

const browser = await chromium.launch();
// One context = one cookie jar, like the tabs of one Chrome window.
const context = await browser.newContext();
const accounts = [
  ["ds", "ds0101"],
  ["ho", "ho0001"],
  ["admin", "ad0001"],
];
const pages = [];
for (const [sub, user] of accounts) {
  const page = await context.newPage();
  await page.goto(`http://${sub}.localhost:3000/login`);
  await page.getByLabel("පරිශීලක නාමය").fill(user);
  await page.getByLabel("මුරපදය", { exact: true }).fill("Sample-Pass-2026");
  await page.getByRole("button", { name: "ඇතුළු වන්න" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60000 }).catch(() => {});
  console.log(`signed in  ${sub}.localhost as ${user} -> ${page.url()}`);
  pages.push(page);
}
for (const page of pages) {
  await page.reload();
  console.log(`after all three, reload -> ${page.url()}`);
}
await browser.close();
