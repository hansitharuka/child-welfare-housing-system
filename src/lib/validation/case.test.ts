import { describe, expect, it } from "vitest";
import { type CaseField, type ImportedField, parseCaseForm, parseImportedForm, parseOfficeId } from "./case";

const COMPLETE: Record<CaseField, string> = {
  category: "CARE_LEAVER",
  kind: "NEW_HOUSE",
  childName: "",
  name: "  ප්‍රතිලාභී නම  ",
  nic: "880001234v",
  address: "නො. 1, පාර, නගරය",
  gnDivision: "  හෝමාගම නැගෙනහිර  ",
  mobile1: "071 234 5678",
  mobile2: "",
  remark: "",
};

const form =
  (values: Partial<Record<CaseField, string>>) =>
  (field: CaseField): string =>
    values[field] ?? "";

describe("submitting a case (CASE-2, CASE-5)", () => {
  it("accepts a complete case and tidies its values", () => {
    const result = parseCaseForm(form(COMPLETE), "submit");
    expect(result).toEqual({
      ok: true,
      value: {
        category: "CARE_LEAVER",
        kind: "NEW_HOUSE",
        childName: null,
        name: "ප්‍රතිලාභී නම",
        nic: "880001234V",
        address: "නො. 1, පාර, නගරය",
        gnDivision: "හෝමාගම නැගෙනහිර",
        mobile1: "0712345678",
        mobile2: null,
        remark: null,
      },
    });
  });

  it("names every empty required field (AC-5)", () => {
    expect(parseCaseForm(form({}), "submit")).toEqual({
      ok: false,
      errors: {
        category: "categoryRequired",
        kind: "kindRequired",
        name: "nameRequired",
      },
    });
  });

  it("lets the NIC, address and phone numbers stay empty, and puts a lone phone number first", () => {
    const result = parseCaseForm(
      form({ ...COMPLETE, nic: "", address: "", mobile1: "", mobile2: "0771234567" }),
      "submit",
    );
    expect(result).toMatchObject({
      ok: true,
      value: { nic: null, address: null, mobile1: "0771234567", mobile2: null },
    });
  });

  it("needs the child's name for a child at risk, and calls the name the guardian's", () => {
    const result = parseCaseForm(form({ ...COMPLETE, category: "CHILD_AT_RISK", name: "" }), "submit");
    expect(result).toEqual({
      ok: false,
      errors: { childName: "childNameRequired", name: "guardianNameRequired" },
    });
  });

  it("drops a child's name typed before the category changed to care leaver", () => {
    const result = parseCaseForm(form({ ...COMPLETE, childName: "x" }), "submit");
    expect(result.ok && result.value.childName).toBe(null);
  });

  it("refuses wrong formats and lengths (AC-6)", () => {
    const result = parseCaseForm(
      form({ ...COMPLETE, nic: "12345", mobile1: "712345678", mobile2: "0712", name: "අ", remark: "x".repeat(1001) }),
      "submit",
    );
    expect(result).toEqual({
      ok: false,
      errors: {
        nic: "nicInvalid",
        mobile1: "mobileInvalid",
        mobile2: "mobileInvalid",
        name: "tooShort",
        remark: "tooLong",
      },
    });
  });

  it("accepts both NIC formats (AC-6)", () => {
    expect(parseCaseForm(form({ ...COMPLETE, nic: "198800012345" }), "submit").ok).toBe(true);
    expect(parseCaseForm(form({ ...COMPLETE, nic: "880001234V" }), "submit").ok).toBe(true);
  });

  it("treats an unknown category or kind as not chosen", () => {
    const result = parseCaseForm(form({ ...COMPLETE, category: "LAND", kind: "x" }), "submit");
    expect(result).toEqual({ ok: false, errors: { category: "categoryRequired", kind: "kindRequired" } });
  });
});

describe("saving a draft (CASE-4)", () => {
  it("skips the required fields", () => {
    expect(parseCaseForm(form({ name: "ඒ. බී." }), "draft")).toMatchObject({
      ok: true,
      value: { name: "ඒ. බී.", nic: null },
    });
  });

  it("still checks the format of what is filled in", () => {
    expect(parseCaseForm(form({ nic: "12345", mobile1: "123" }), "draft")).toEqual({
      ok: false,
      errors: { nic: "nicInvalid", mobile1: "mobileInvalid" },
    });
  });
});

describe("Head Office changing a verified case from the sheet (CASE-9, IMP-4)", () => {
  it("lets the required fields the sheet left empty stay empty, and still checks what is typed", () => {
    const sheet = { ...COMPLETE, category: "CHILD_AT_RISK", childName: "" };
    expect(parseCaseForm(form(sheet), "submit").ok).toBe(false);
    expect(parseCaseForm(form(sheet), "submit", ["childName"])).toMatchObject({
      ok: true,
      value: { childName: null },
    });
    expect(parseCaseForm(form({ ...sheet, nic: "12345" }), "submit", ["childName"])).toEqual({
      ok: false,
      errors: { nic: "nicInvalid" },
    });
    expect(parseCaseForm(form({ ...sheet, name: "" }), "submit", ["childName"])).toEqual({
      ok: false,
      errors: { name: "guardianNameRequired" },
    });
  });
});

describe("parseOfficeId", () => {
  it("reads a positive whole number, and nothing else", () => {
    expect(parseOfficeId("12")).toBe(12);
    for (const raw of ["", "0", "-1", "1.5", "abc"]) expect(parseOfficeId(raw), raw).toBeNull();
  });
});

describe("filling in a case brought in from the sheet (IMP-5)", () => {
  const imported =
    (values: Partial<Record<ImportedField, string>>) =>
    (field: ImportedField): string =>
      values[field] ?? "";

  it("allows every field to stay empty, as the sheet often left them (IMP-4)", () => {
    expect(parseImportedForm(imported({}))).toEqual({
      ok: true,
      value: { kind: null, nic: null, mobile1: null, mobile2: null },
    });
  });

  it("tidies what is filled in, as the case form does", () => {
    const result = parseImportedForm(
      imported({ kind: "RENOVATION", nic: " 880001234v ", mobile1: "071 234 5678", mobile2: "011 234 5678" }),
    );
    expect(result).toEqual({
      ok: true,
      value: { kind: "RENOVATION", nic: "880001234V", mobile1: "0712345678", mobile2: "0112345678" },
    });
  });

  it("checks the format of what is filled in", () => {
    expect(parseImportedForm(imported({ nic: "12345", mobile1: "123", mobile2: "07123" }))).toEqual({
      ok: false,
      errors: { nic: "nicInvalid", mobile1: "mobileInvalid", mobile2: "mobileInvalid" },
    });
  });

  it("puts a lone phone number first, and treats an unknown kind as not chosen", () => {
    expect(parseImportedForm(imported({ kind: "LAND", mobile2: "0712345678" }))).toEqual({
      ok: true,
      value: { kind: null, nic: null, mobile1: "0712345678", mobile2: null },
    });
  });
});
