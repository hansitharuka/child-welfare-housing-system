import "dotenv/config";
import { execSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import pg from "pg";
import type { TestProject } from "vitest/node";

/**
 * Each run of the database tests gets its own new, empty schema in the test database.
 * The migrations are applied to it, the tests run, and only that schema is dropped at the end.
 * Nothing that existed before the run is ever changed or deleted.
 */
export default async function setup(project: TestProject) {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL is not set. Copy .env.example to .env.");

  const database = new URL(url).pathname.replace(/^\//, "");
  if (!database.includes("test") || url === process.env.DATABASE_URL) {
    throw new Error(`Refusing to use "${database}": TEST_DATABASE_URL must point to a separate *test* database.`);
  }

  const schema = `test_${Date.now()}_${randomBytes(3).toString("hex")}`;
  const withSchema = new URL(url);
  withSchema.searchParams.set("schema", schema);

  execSync("npx prisma migrate deploy", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: withSchema.toString() },
  });

  const baseUrl = new URL(url);
  baseUrl.searchParams.delete("schema");
  project.provide("testDatabaseUrl", baseUrl.toString());
  project.provide("testSchema", schema);

  return async () => {
    const client = new pg.Client({ connectionString: baseUrl.toString() });
    await client.connect();
    try {
      await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    } finally {
      await client.end();
    }
  };
}
