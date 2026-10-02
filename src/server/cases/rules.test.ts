import { describe, expect, it } from "vitest";
import type { CaseStatus } from "@/generated/prisma/enums";
import { formatCaseNumber } from "./numbers";
import { canChangeOffice, canDeleteDraft, canEditDetails } from "./rules";

const STATUSES: CaseStatus[] = [
  "DRAFT",
  "SUBMITTED",
  "RETURNED",
  "VERIFIED",
  "IN_PROGRESS",
  "COMPLETED",
  "REJECTED",
  "STOPPED",
  "IMPORTED",
];

describe("case rules (SPEC sections 4 and 6)", () => {
  it("lets the office and Head Office change only drafts and returned cases (CASE-7, STS-3)", () => {
    for (const status of STATUSES) {
      const editable = status === "DRAFT" || status === "RETURNED";
      expect(canEditDetails("DS_OFFICER", status), status).toBe(editable);
      expect(canEditDetails("HO_OFFICER", status), status).toBe(editable);
      expect(canEditDetails("ADMIN", status), status).toBe(false);
    }
  });

  it("deletes drafts only (CASE-8)", () => {
    for (const status of STATUSES) expect(canDeleteDraft("DS_OFFICER", status), status).toBe(status === "DRAFT");
    expect(canDeleteDraft("ADMIN", "DRAFT")).toBe(false);
  });

  it("lets only Head Office choose the office, before the case has a number (CASE-3)", () => {
    expect(canChangeOffice("HO_OFFICER", null)).toBe(true);
    expect(canChangeOffice("HO_OFFICER", "DRAFT")).toBe(true);
    expect(canChangeOffice("HO_OFFICER", "RETURNED")).toBe(false);
    expect(canChangeOffice("DS_OFFICER", null)).toBe(false);
  });
});

describe("case numbers (CASE-5)", () => {
  it("is the office code, the year and at least three digits", () => {
    expect(formatCaseNumber("HMG", 2026, 11)).toBe("HMG-2026-011");
    expect(formatCaseNumber("HMG", 2026, 1)).toBe("HMG-2026-001");
    expect(formatCaseNumber("KDW", 2027, 1234)).toBe("KDW-2027-1234");
  });
});
