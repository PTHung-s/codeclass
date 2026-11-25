/**
 * A student's legal/real name is kept in `fullName`, but must not be exposed
 * to other students.  API routes returning a user to a non-staff viewer should
 * pass it through this helper.  Staff retain the real name for classroom work.
 */
const STAFF_ROLES = new Set(["teacher", "admin", "teaching_assistant"]);

type DisplayableUser = {
  fullName: string;
  nickname?: string | null;
  role?: string | null;
};

export function isStaffRole(role: string | null | undefined): boolean {
  return !!role && STAFF_ROLES.has(role);
}

export function presentUserForViewer<T extends DisplayableUser | null | undefined>(user: T, viewerRole: string): T {
  if (!user || isStaffRole(viewerRole) || user.role !== "student") return user;

  return {
    ...user,
    fullName: user.nickname?.trim() || user.fullName,
  } as T;
}

/** A safe payload for fan-out events where recipients' roles are unknown. */
export function presentUserPublicly<T extends DisplayableUser | null | undefined>(user: T): T {
  if (!user || user.role !== "student") return user;
  return { ...user, fullName: user.nickname?.trim() || user.fullName } as T;
}
