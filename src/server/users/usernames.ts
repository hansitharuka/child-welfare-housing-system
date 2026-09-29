import type { Role } from "../auth/roles";

/** ADM-2: a username is the role's prefix plus at least 4 digits, such as ds0101. */
export const USERNAME_PREFIX: Record<Role, string> = {
  DS_OFFICER: "ds",
  HO_OFFICER: "ho",
  ADMIN: "ad",
};

/** The next free username for a role, one above the highest number already used with that prefix. */
export function nextUsername(role: Role, existing: readonly string[]): string {
  const prefix = USERNAME_PREFIX[role];
  const pattern = new RegExp(`^${prefix}(\\d{4,})$`);
  let highest = 0;
  for (const username of existing) {
    const match = pattern.exec(username);
    if (match) highest = Math.max(highest, Number(match[1]));
  }
  return `${prefix}${String(highest + 1).padStart(4, "0")}`;
}
