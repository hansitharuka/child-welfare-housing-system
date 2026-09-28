// Runs the production build the way the Docker image will (OPS-2): Next.js standalone server.js,
// with the static files copied next to it as the Next.js docs describe.
import { spawn } from "node:child_process";
import { cpSync, existsSync } from "node:fs";

const out = ".next/standalone";
if (!existsSync(`${out}/server.js`)) {
  console.error("No standalone build found. Run `npm run build` first.");
  process.exit(1);
}
cpSync("public", `${out}/public`, { recursive: true });
cpSync(".next/static", `${out}/.next/static`, { recursive: true });

const server = spawn(process.execPath, [`${out}/server.js`], { stdio: "inherit", env: process.env });
server.on("exit", (code) => process.exit(code ?? 0));
