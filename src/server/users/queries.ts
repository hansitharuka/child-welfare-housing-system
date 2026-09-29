import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { isRole, type Role } from "../auth/roles";

export type AccountRow = {
  id: string;
  name: string;
  username: string;
  designation: string | null;
  role: Role;
  officeName: string | null;
  districtName: string | null;
  lastSignInAt: Date | null;
  active: boolean;
};

/** ADM-1: every account, searchable by name, office or username, and filterable by role. */
export async function listAccounts(db: PrismaClient, filter: { q?: string; role?: Role }): Promise<AccountRow[]> {
  const q = filter.q?.trim();
  const where: Prisma.UserWhereInput = {
    ...(filter.role ? { role: filter.role } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { username: { contains: q.toLowerCase() } },
            { dsOffice: { nameSi: { contains: q } } },
            { dsOffice: { nameEn: { contains: q, mode: "insensitive" } } },
            { dsOffice: { district: { nameSi: { contains: q } } } },
          ],
        }
      : {}),
  };
  const users = await db.user.findMany({
    where,
    orderBy: [{ role: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      username: true,
      designation: true,
      role: true,
      banned: true,
      lastSignInAt: true,
      dsOffice: { select: { nameSi: true, district: { select: { nameSi: true } } } },
    },
  });
  return users.flatMap((u) =>
    isRole(u.role) && u.username
      ? [
          {
            id: u.id,
            name: u.name,
            username: u.username,
            designation: u.designation,
            role: u.role,
            officeName: u.dsOffice?.nameSi ?? null,
            districtName: u.dsOffice?.district.nameSi ?? null,
            lastSignInAt: u.lastSignInAt,
            active: !u.banned,
          },
        ]
      : [],
  );
}

export async function accountCounts(db: PrismaClient): Promise<{ total: number; active: number; disabled: number }> {
  const [total, disabled] = await Promise.all([db.user.count(), db.user.count({ where: { banned: true } })]);
  return { total, active: total - disabled, disabled };
}

export async function activeAdminCount(db: PrismaClient | Prisma.TransactionClient): Promise<number> {
  return db.user.count({ where: { role: "ADMIN", banned: { not: true } } });
}

export type AccountDetails = {
  id: string;
  name: string;
  username: string;
  designation: string | null;
  mobile: string | null;
  contactEmail: string | null;
  role: Role;
  dsOfficeId: number | null;
  districtId: number | null;
  active: boolean;
};

export async function getAccount(db: PrismaClient, id: string): Promise<AccountDetails | null> {
  const u = await db.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      username: true,
      designation: true,
      mobile: true,
      contactEmail: true,
      role: true,
      banned: true,
      dsOfficeId: true,
      dsOffice: { select: { districtId: true } },
    },
  });
  if (!u || !isRole(u.role) || !u.username) return null;
  return {
    id: u.id,
    name: u.name,
    username: u.username,
    designation: u.designation,
    mobile: u.mobile,
    contactEmail: u.contactEmail,
    role: u.role,
    dsOfficeId: u.dsOfficeId,
    districtId: u.dsOffice?.districtId ?? null,
    active: !u.banned,
  };
}

export type OfficeChoice = { id: number; name: string; active: boolean; officers: string[] };
export type DistrictChoice = { id: number; name: string; offices: OfficeChoice[] };

/**
 * Districts and their DS offices for the account form, with the active DS officers of each office
 * (ADM-3). Inactive offices are included only if an account already belongs to one.
 */
export async function officeChoices(db: PrismaClient, keepOfficeId: number | null = null): Promise<DistrictChoice[]> {
  const districts = await db.district.findMany({
    orderBy: { id: "asc" },
    select: {
      id: true,
      nameSi: true,
      dsOffices: {
        where: { OR: [{ active: true }, ...(keepOfficeId ? [{ id: keepOfficeId }] : [])] },
        orderBy: { id: "asc" },
        select: {
          id: true,
          nameSi: true,
          active: true,
          users: { where: { role: "DS_OFFICER", banned: { not: true } }, select: { id: true, name: true } },
        },
      },
    },
  });
  return districts.map((d) => ({
    id: d.id,
    name: d.nameSi,
    offices: d.dsOffices.map((o) => ({
      id: o.id,
      name: o.nameSi,
      active: o.active,
      officers: o.users.map((u) => u.name),
    })),
  }));
}

/** Every office's Sinhala name, active or not, for showing an account's past offices. */
export async function officeNames(db: PrismaClient): Promise<Record<number, string>> {
  const offices = await db.dsOffice.findMany({ select: { id: true, nameSi: true } });
  return Object.fromEntries(offices.map((o) => [o.id, o.nameSi]));
}

export type HistoryEntry = {
  at: Date;
  action: string;
  actorName: string | null;
  before: Prisma.JsonValue;
  after: Prisma.JsonValue;
};

/** The account's own history from the audit log, newest first (ADM-4). */
export async function accountHistory(db: PrismaClient, id: string): Promise<HistoryEntry[]> {
  const rows = await db.auditLog.findMany({
    where: { entityType: "user", entityId: id },
    orderBy: { at: "desc" },
    take: 50,
    select: { at: true, action: true, actorId: true, before: true, after: true },
  });
  const actorIds = [...new Set(rows.flatMap((r) => (r.actorId ? [r.actorId] : [])))];
  const actors = new Map(
    (await db.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } })).map((a) => [
      a.id,
      a.name,
    ]),
  );
  return rows.map((r) => ({
    at: r.at,
    action: r.action,
    actorName: r.actorId ? (actors.get(r.actorId) ?? null) : null,
    before: r.before,
    after: r.after,
  }));
}
