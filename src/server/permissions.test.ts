import { describe, expect, it } from "vitest";
import { canSeeOffice, caseScope, officeFilter, type Viewer } from "./permissions";

const HOMAGAMA = 1;
const KADUWELA = 2;

const dsHomagama: Viewer = { role: "DS_OFFICER", dsOfficeId: HOMAGAMA };
const headOffice: Viewer = { role: "HO_OFFICER", dsOfficeId: null };
const admin: Viewer = { role: "ADMIN", dsOfficeId: null };

describe("which cases each role may see (PRM-1, PRM-2)", () => {
  it.each([
    ["a DS officer, their own office", dsHomagama, HOMAGAMA, true],
    ["a DS officer, another office", dsHomagama, KADUWELA, false],
    ["Head Office, any office", headOffice, HOMAGAMA, true],
    ["Head Office, another office", headOffice, KADUWELA, true],
    ["an admin, any office", admin, HOMAGAMA, false],
    ["an admin, another office", admin, KADUWELA, false],
  ])("%s", (_label, viewer, office, expected) => {
    expect(canSeeOffice(viewer, office)).toBe(expected);
  });

  it("limits a DS officer's queries to their office", () => {
    expect(caseScope(dsHomagama)).toEqual({ kind: "office", dsOfficeId: HOMAGAMA });
    expect(officeFilter(dsHomagama)).toEqual({ dsOfficeId: HOMAGAMA });
  });

  it("gives Head Office every office", () => {
    expect(caseScope(headOffice)).toEqual({ kind: "all" });
    expect(officeFilter(headOffice)).toEqual({});
  });

  it("gives an admin no cases at all", () => {
    expect(caseScope(admin)).toEqual({ kind: "none" });
    expect(officeFilter(admin)).toBeNull();
  });

  it("shows nothing to a DS officer whose account has no office", () => {
    const broken: Viewer = { role: "DS_OFFICER", dsOfficeId: null };
    expect(officeFilter(broken)).toBeNull();
    expect(canSeeOffice(broken, HOMAGAMA)).toBe(false);
  });
});
