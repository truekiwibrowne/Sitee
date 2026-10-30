// Lowest to highest. Each role reviews and assigns to the one below it.
export const ROLE_LADDER = ['foreman', 'siteManager', 'projectManager', 'constructionManager'] as const;

export const ROLES = [...ROLE_LADDER, 'admin'] as const;

export type Role = (typeof ROLES)[number];
