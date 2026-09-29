import { execSync } from "node:child_process";

/**
 * Before every run: removes test entries left by earlier runs, and puts the sample accounts
 * (prisma/seed-users.ts) back to their starting state, so every run starts the same way.
 */
export default function globalSetup(): void {
  execSync("npx tsx tests/e2e/cleanup.ts", { stdio: "inherit" });
  execSync("npx tsx prisma/seed-users.ts --reset", { stdio: "inherit" });
}
