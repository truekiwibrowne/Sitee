// Firestore paths, so the web app, functions, seed and rules tests all agree.
// Everything lives under orgs/{orgId}/ so several companies can share one project.

const org = (orgId: string) => `orgs/${orgId}`;

export const paths = {
  org,
  projects: (orgId: string) => `${org(orgId)}/projects`,
  zones: (orgId: string) => `${org(orgId)}/zones`,
  users: (orgId: string) => `${org(orgId)}/users`,
  taskTemplates: (orgId: string) => `${org(orgId)}/taskTemplates`,
  tasks: (orgId: string) => `${org(orgId)}/tasks`,
  submissions: (orgId: string) => `${org(orgId)}/submissions`,
  reviews: (orgId: string) => `${org(orgId)}/reviews`,
  xpEvents: (orgId: string) => `${org(orgId)}/xpEvents`,
  leagueMembers: (orgId: string, weekId: string) => `${org(orgId)}/leagues/${weekId}/members`,
  quests: (orgId: string) => `${org(orgId)}/quests`,
  trainingModules: (orgId: string) => `${org(orgId)}/trainingModules`,
  trainingSessions: (orgId: string) => `${org(orgId)}/trainingSessions`,
  attendance: (orgId: string) => `${org(orgId)}/attendance`,
  competencies: (orgId: string) => `${org(orgId)}/competencies`,
  boqItems: (orgId: string) => `${org(orgId)}/boqItems`,
  progressEntries: (orgId: string) => `${org(orgId)}/progressEntries`,
} as const;

/** Root collection of pending invites, keyed by lower-case email (the invitee doesn't know the org yet). */
export const invitePath = (email: string) => `invites/${email.trim().toLowerCase()}`;

/** Path segment for project-level tasks, which have no zone. Storage rules expect it. */
export const NO_ZONE = 'project';

/** Storage path for a report photo. Photos never go in the repo. */
export const photoPath = (orgId: string, zoneId: string | null, submissionId: string, photoId: string) =>
  `orgs/${orgId}/zones/${zoneId ?? NO_ZONE}/submissions/${submissionId}/${photoId}.jpg`;
