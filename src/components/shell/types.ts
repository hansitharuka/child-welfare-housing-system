import type messages from "../../../messages/si.json";

export type Area = keyof (typeof messages)["areas"];

/** A menu entry's label key under "nav" in messages/si.json. */
export type NavKey = Exclude<keyof (typeof messages)["nav"], "label" | "waiting">;

export type NavEntry = {
  href: string;
  labelKey: NavKey;
  /** Highlight only on this exact path, not on pages below it. */
  exact?: boolean;
  /** Other paths that belong to this entry, such as the second tab of one screen. */
  alsoActive?: string[];
  /** How many cases wait there (NTF-1); a badge shows when it is more than 0. */
  count?: number;
};
