import { describe, expect, it } from "vitest";
import { readHomeList, TABS, tabFilter } from "./list";

describe("the DS home's tabs and search (HOME-2)", () => {
  it("reads the tab and search from the address", () => {
    expect(readHomeList({ tab: "inProgress", q: "ඒ. බී." })).toEqual({
      tab: "inProgress",
      q: "ඒ. බී.",
      filter: { statuses: ["IN_PROGRESS"], q: "ඒ. බී." },
    });
    expect(readHomeList({ tab: "completed" }).filter).toEqual({ statuses: ["COMPLETED"], q: "" });
  });

  it("lists the cases from the sheet that still lack details under their own tab (IMP-4)", () => {
    expect(readHomeList({ tab: "detailsMissing" }).filter).toEqual({ detailsMissing: true, q: "" });
  });

  it("shows every case for an unknown tab, even one named like an object's own property", () => {
    for (const tab of [undefined, "", "LAND", "toString", "constructor", ["all"]]) {
      expect(readHomeList({ tab }), String(tab)).toEqual({ tab: "all", q: "", filter: { q: "" } });
    }
  });

  it("gives each caller a filter of its own", () => {
    for (const tab of TABS) expect(tabFilter(tab)).not.toBe(tabFilter(tab));
    const first = tabFilter("inProgress");
    first.statuses?.push("COMPLETED");
    expect(tabFilter("inProgress")).toEqual({ statuses: ["IN_PROGRESS"] });
  });
});
