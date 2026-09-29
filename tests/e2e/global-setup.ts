import { execSync } from "node:child_process";

/** Resets the sample accounts (prisma/seed-users.ts) so every run starts the same way. */
export default function globalSetup(): void {
  execSync("npx tsx prisma/seed-users.ts --reset", { stdio: "inherit" });
}
