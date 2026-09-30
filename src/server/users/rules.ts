import type { Role } from "../auth/roles";

export type AccountRuleError = "self" | "lastAdmin";

type Target = { id: string; role: string | null; banned: boolean | null };

/** ADM-6: an admin can't disable their own account, and at least one active admin must remain. */
export function checkDisable(actorId: string, target: Target, activeAdmins: number): AccountRuleError | null {
  if (target.id === actorId) return "self";
  if (target.role === "ADMIN" && !target.banned && activeAdmins <= 1) return "lastAdmin";
  return null;
}

/** The same protection when an admin account would stop being an admin. */
export function checkRoleChange(
  actorId: string,
  target: Target,
  newRole: Role,
  activeAdmins: number,
): AccountRuleError | null {
  if (target.role !== "ADMIN" || newRole === "ADMIN") return null;
  if (target.id === actorId) return "self";
  if (!target.banned && activeAdmins <= 1) return "lastAdmin";
  return null;
}
