import "vitest";

declare module "vitest" {
  export interface ProvidedContext {
    /** Test database connection string, without a schema. */
    testDatabaseUrl: string;
    /** The schema created for this test run. */
    testSchema: string;
  }
}
