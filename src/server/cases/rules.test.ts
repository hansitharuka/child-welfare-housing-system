import { describe, expect, it } from "vitest";
import type { CaseStatus } from "@/generated/prisma/enums";
import { formatCaseNumber } from "./numbers";
import {
  canChangeOffice,
  canDeleteDraft,
  canEditDetails,
  canFillImported,
  fillableFields,
  isBeingEntered,
  mayStayEmpty,
  missingImported,
  mustStayComplete,
} from "./rules";
import { type Move, moveRefusal, MOVES, type Mover, movesFrom, reasonNeeded } from "./transitions";

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
  it("lets the office change only drafts and returned cases, and nobody a case being checked (CASE-7, STS-3)", () => {
    for (const status of STATUSES) {
      const entry = status === "DRAFT" || status === "RETURNED";
      expect(canEditDetails("DS_OFFICER", status), status).toBe(entry);
      expect(isBeingEntered(status), status).toBe(entry);
      expect(canEditDetails("ADMIN", status), status).toBe(false);
    }
    expect(canEditDetails("HO_OFFICER", "SUBMITTED")).toBe(false);
  });

  it("lets only Head Office change a verified case while it runs, and keeps it complete (CASE-9)", () => {
    const afterCheck = ["VERIFIED", "IN_PROGRESS"];
    for (const status of STATUSES) {
      const entry = status === "DRAFT" || status === "RETURNED";
      expect(canEditDetails("HO_OFFICER", status), status).toBe(entry || afterCheck.includes(status));
      expect(mustStayComplete(status), status).toBe(afterCheck.includes(status));
    }
  });

  it("lets only the office fill in a case from the sheet, and after the confirmation only what it lacks (IMP-5)", () => {
    const empty = { kind: null, nic: null, mobile1: null, mobile2: null };
    const filled = { kind: "NEW_HOUSE", nic: "880001234V", mobile1: "0712345678", mobile2: null };
    for (const status of STATUSES) {
      const running = status === "VERIFIED" || status === "IN_PROGRESS";
      const fromSheet = { status, fromSheet: true, ...empty };
      expect(fillableFields("DS_OFFICER", fromSheet), status).toEqual(
        status === "IMPORTED" ? ["kind", "nic", "mobile1", "mobile2"] : running ? ["nic", "mobile1", "mobile2"] : [],
      );
      expect(canFillImported("DS_OFFICER", { ...fromSheet, ...filled }), status).toBe(status === "IMPORTED");
      // A case entered in the system follows the case form instead.
      expect(canFillImported("DS_OFFICER", { ...fromSheet, fromSheet: false }), status).toBe(status === "IMPORTED");
      expect(canFillImported("HO_OFFICER", fromSheet), status).toBe(false);
      expect(canFillImported("ADMIN", fromSheet), status).toBe(false);
    }
    const confirmed = { status: "IN_PROGRESS", fromSheet: true, ...filled } as const;
    expect(fillableFields("DS_OFFICER", { ...confirmed, nic: null })).toEqual(["nic"]);
    expect(fillableFields("DS_OFFICER", { ...confirmed, mobile1: null })).toEqual(["mobile1", "mobile2"]);
  });

  it("names what a case from the sheet still lacks: the kind of help, the NIC or a phone number (IMP-4)", () => {
    const empty = { fromSheet: true, kind: null, nic: null, mobile1: null };
    expect(missingImported({ status: "IMPORTED", ...empty })).toEqual(["kind", "nic", "mobile1"]);
    expect(missingImported({ status: "IMPORTED", ...empty, kind: "NEW_HOUSE", mobile1: "0712345678" })).toEqual([
      "nic",
    ]);
    expect(
      missingImported({
        status: "IMPORTED",
        fromSheet: true,
        kind: "RENOVATION",
        nic: "880001234V",
        mobile1: "0712345678",
      }),
    ).toEqual([]);
    // Once Head Office has confirmed it, the kind is set; the NIC and phone can still be missing while it runs.
    expect(missingImported({ status: "VERIFIED", ...empty, kind: "NEW_HOUSE" })).toEqual(["nic", "mobile1"]);
    expect(missingImported({ status: "IN_PROGRESS", ...empty, kind: "NEW_HOUSE", nic: "880001234V" })).toEqual([
      "mobile1",
    ]);
    for (const status of ["REJECTED", "STOPPED", "COMPLETED"] as const) {
      expect(missingImported({ status, ...empty }), status).toEqual([]);
    }
    expect(missingImported({ status: "VERIFIED", ...empty, fromSheet: false })).toEqual([]);
  });

  it("lets Head Office leave empty what the sheet left empty, but not empty what is filled in (CASE-9, IMP-4)", () => {
    const values = {
      category: "CHILD_AT_RISK",
      kind: "NEW_HOUSE",
      childName: null,
      name: "පරීක්ෂණ",
      nic: null,
      address: "නො. 1",
      gnDivision: null,
      mobile1: null,
      mobile2: null,
      remark: null,
    } as const;
    expect(mayStayEmpty({ ...values, fromSheet: true }).sort()).toEqual(["childName"]);
    expect(mayStayEmpty({ ...values, fromSheet: false })).toEqual([]);
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

/** SPEC section 6: [move, from, to, who]. Every other combination must be refused (STS-1). */
const ALLOWED: [Move, CaseStatus, CaseStatus, Mover[]][] = [
  ["submit", "DRAFT", "SUBMITTED", ["DS_OFFICER", "HO_OFFICER"]],
  ["submit", "RETURNED", "SUBMITTED", ["DS_OFFICER", "HO_OFFICER"]],
  ["verify", "SUBMITTED", "VERIFIED", ["HO_OFFICER"]],
  ["sendBack", "SUBMITTED", "RETURNED", ["HO_OFFICER"]],
  ["reject", "SUBMITTED", "REJECTED", ["HO_OFFICER"]],
  ["release", "VERIFIED", "IN_PROGRESS", ["HO_OFFICER"]],
  ["complete", "IN_PROGRESS", "COMPLETED", ["SYSTEM"]],
  ["stop", "VERIFIED", "STOPPED", ["HO_OFFICER"]],
  ["stop", "IN_PROGRESS", "STOPPED", ["HO_OFFICER"]],
  ["reopen", "STOPPED", "VERIFIED", ["HO_OFFICER"]],
  ["reopen", "STOPPED", "IN_PROGRESS", ["HO_OFFICER"]],
  ["confirmImport", "IMPORTED", "VERIFIED", ["HO_OFFICER"]],
  ["confirmImport", "IMPORTED", "IN_PROGRESS", ["HO_OFFICER"]],
  ["confirmImport", "IMPORTED", "REJECTED", ["HO_OFFICER"]],
  ["confirmImport", "IMPORTED", "STOPPED", ["HO_OFFICER"]],
];
const MOVERS: Mover[] = ["DS_OFFICER", "HO_OFFICER", "ADMIN", "SYSTEM"];

describe("status changes (SPEC section 6)", () => {
  it("allows exactly the moves in the table, to the right status and by the right people (STS-1)", () => {
    for (const move of Object.keys(MOVES) as Move[]) {
      for (const from of STATUSES) {
        for (const to of STATUSES) {
          for (const by of MOVERS) {
            const allowed = ALLOWED.some(([m, f, t, who]) => m === move && f === from && t === to && who.includes(by));
            const refusal = moveRefusal(by, move, from, to);
            expect(refusal === null, `${by} ${move} ${from} → ${to}`).toBe(allowed);
          }
        }
      }
    }
  });

  it("says whether the role or the status is the problem", () => {
    expect(moveRefusal("DS_OFFICER", "verify", "SUBMITTED")).toBe("roleNotAllowed");
    expect(moveRefusal("HO_OFFICER", "verify", "VERIFIED")).toBe("notAllowedNow");
    expect(moveRefusal("HO_OFFICER", "complete", "IN_PROGRESS")).toBe("roleNotAllowed");
  });

  it("needs a reason to send back, reject, stop or reopen (CHK-3, CLS-2, CLS-3)", () => {
    const withReason = (Object.keys(MOVES) as Move[]).filter((move) => MOVES[move].needsReason === true);
    expect(withReason.sort()).toEqual(["reject", "reopen", "sendBack", "stop"]);
  });

  it("needs a reason to confirm a case from the sheet as rejected or stopped, but not to approve it (IMP-5)", () => {
    const needing = MOVES.confirmImport.to.filter((to) => reasonNeeded("confirmImport", to));
    expect(needing).toEqual(["REJECTED", "STOPPED"]);
    expect(reasonNeeded("stop", "STOPPED")).toBe(true);
    expect(reasonNeeded("verify", "VERIFIED")).toBe(false);
  });

  it("tells the DS office about every decision but the submit and an import check (NTF-1)", () => {
    const told = (Object.keys(MOVES) as Move[]).filter((move) => MOVES[move].notify !== null);
    expect(told.sort()).toEqual(["complete", "reject", "release", "reopen", "sendBack", "stop", "verify"]);
  });

  it("has no way out of a completed or rejected case (STS-2)", () => {
    expect(movesFrom("COMPLETED")).toEqual([]);
    expect(movesFrom("REJECTED")).toEqual([]);
    expect(movesFrom("SUBMITTED").sort()).toEqual(["reject", "sendBack", "verify"]);
  });
});

describe("case numbers (CASE-5)", () => {
  it("is the office code, the year and at least three digits", () => {
    expect(formatCaseNumber("HMG", 2026, 11)).toBe("HMG-2026-011");
    expect(formatCaseNumber("HMG", 2026, 1)).toBe("HMG-2026-001");
    expect(formatCaseNumber("KDW", 2027, 1234)).toBe("KDW-2027-1234");
  });
});
