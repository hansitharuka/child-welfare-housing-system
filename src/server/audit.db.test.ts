import { afterAll, describe, expect, inject, it } from "vitest";
import { createTestClient } from "../../tests/db/client";
import { writeAudit } from "./audit";

const prisma = createTestClient();

afterAll(() => prisma.$disconnect());

describe("audit log (ARC-4, HIS-1, HIS-3)", () => {
  it("keeps a record written in a transaction that succeeds", async () => {
    await prisma.$transaction(async (tx) => {
      await writeAudit(tx, { actorId: "tester", action: "kept", entityType: "test", entityId: "1", after: { a: 1 } });
    });
    const row = await prisma.auditLog.findFirstOrThrow({ where: { action: "kept" } });
    expect(row.after).toEqual({ a: 1 });
    expect(row.actorId).toBe("tester");
  });

  it("drops the record when the change it describes rolls back", async () => {
    await expect(
      prisma.$transaction(async (tx) => {
        await writeAudit(tx, { actorId: "tester", action: "rolled-back", entityType: "test", entityId: "2" });
        throw new Error("the change failed");
      }),
    ).rejects.toThrow("the change failed");
    expect(await prisma.auditLog.count({ where: { action: "rolled-back" } })).toBe(0);
  });

  it("refuses to change a record", async () => {
    const row = await prisma.auditLog.findFirstOrThrow({ where: { action: "kept" } });
    await expect(prisma.auditLog.update({ where: { id: row.id }, data: { action: "tampered" } })).rejects.toThrow(
      /append-only/,
    );
  });

  it("refuses to delete a record, one or all", async () => {
    const row = await prisma.auditLog.findFirstOrThrow({ where: { action: "kept" } });
    await expect(prisma.auditLog.delete({ where: { id: row.id } })).rejects.toThrow(/append-only/);
    // Raw SQL does not get the test run's schema automatically, so name it.
    await expect(prisma.$executeRawUnsafe(`TRUNCATE "${inject("testSchema")}"."audit_log"`)).rejects.toThrow(
      /append-only/,
    );
    expect(await prisma.auditLog.count({ where: { action: "kept" } })).toBe(1);
  });
});
