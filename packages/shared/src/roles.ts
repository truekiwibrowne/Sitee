// Lowest to highest. Each role reviews and assigns to the one below it.
export const ROLE_LADDER = ['foreman', 'siteManager', 'projectManager', 'constructionManager'] as const;

export const ROLES = [...ROLE_LADDER, 'admin'] as const;

export type Role = (typeof ROLES)[number];

export const ROLE_LABEL: Record<Role, string> = {
  foreman: 'Foreman',
  siteManager: 'Site manager',
  projectManager: 'Project manager',
  constructionManager: 'Construction manager',
  admin: 'Admin',
};

/** Custom claims on every signed-in user's ID token. Set only by the Admin SDK. */
export type UserClaims = {
  orgId: string;
  role: Role;
  /** True for "Try the demo" visitors, whose org is a throwaway sandbox. */
  demo?: boolean;
};

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}
