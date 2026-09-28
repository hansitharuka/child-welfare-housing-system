import type messages from "../../../messages/si.json";

export type Area = keyof (typeof messages)["areas"];

/** A menu entry's label key under "nav" in messages/si.json. */
export type NavKey = Exclude<keyof (typeof messages)["nav"], "label">;

export type NavEntry = {
  href: string;
  labelKey: NavKey;
  /** Highlight only on this exact path, not on pages below it. */
  exact?: boolean;
};
