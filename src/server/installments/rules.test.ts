import { describe, expect, it } from "vitest";
import type { InstallmentStatus } from "@/generated/prisma/enums";
import { lastPaid, nextInstallment, previousPaidOn, stepRefusal } from "./rules";

const list = (...statuses: InstallmentStatus[]) =>
  statuses.map((status, index) => ({
    number: index + 1,
    status,
    releasedOn: status === "RELEASED" ? `2026-07-0${index + 1}` : null,
  }));

describe("installment order (INS-2, AC-11)", () => {
  it("lets only the lowest unpaid installment change", () => {
    const four = list("RELEASED", "NOT_STARTED", "NOT_STARTED", "NOT_STARTED");
    expect(nextInstallment(four)?.number).toBe(2);
    expect(stepRefusal(four, 2, "start")).toBeNull();
    expect(stepRefusal(four, 3, "start")).toBe("notNext");
    expect(stepRefusal(four, 4, "pay")).toBe("notNext");
    expect(stepRefusal(four, 1, "pay")).toBe("alreadyPaid");
    expect(stepRefusal(four, 5, "start")).toBe("noSuchInstallment");
  });

  it("starts a payment before it can be marked paid, and only once", () => {
    expect(stepRefusal(list("NOT_STARTED", "NOT_STARTED", "NOT_STARTED", "NOT_STARTED"), 1, "pay")).toBe(
      "notStartedYet",
    );
    const started = list("PROCESSING", "NOT_STARTED", "NOT_STARTED", "NOT_STARTED");
    expect(stepRefusal(started, 1, "start")).toBe("alreadyStarted");
    expect(stepRefusal(started, 1, "pay")).toBeNull();
    // Installment 3 can't change while installment 2 is not released, even when 2 is under way.
    const second = list("RELEASED", "PROCESSING", "NOT_STARTED", "NOT_STARTED");
    expect(stepRefusal(second, 3, "start")).toBe("notNext");
  });

  it("finds nothing next when all four are paid", () => {
    const paid = list("RELEASED", "RELEASED", "RELEASED", "RELEASED");
    expect(nextInstallment(paid)).toBeNull();
    expect(stepRefusal(paid, 4, "pay")).toBe("alreadyPaid");
  });

  it("gives the day the installment before was paid (INS-4)", () => {
    const two = list("RELEASED", "RELEASED", "PROCESSING", "NOT_STARTED");
    expect(previousPaidOn(two, 1)).toBeNull();
    expect(previousPaidOn(two, 3)).toBe("2026-07-02");
  });

  it("moves back only the most recently released installment (INS-6)", () => {
    expect(lastPaid(list("RELEASED", "RELEASED", "PROCESSING", "NOT_STARTED"))?.number).toBe(2);
    expect(lastPaid(list("NOT_STARTED", "NOT_STARTED", "NOT_STARTED", "NOT_STARTED"))).toBeNull();
  });
});
