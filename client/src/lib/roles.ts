/** Check if a role has staff-level access (teacher, admin, or teaching assistant) */
export function isStaff(role: string | undefined | null): boolean {
  return role === "admin" || role === "teacher" || role === "teaching_assistant";
}

/** Check if a role is a specific set of roles */
export function hasRole(role: string | undefined | null, ...roles: string[]): boolean {
  return !!role && roles.includes(role);
}
