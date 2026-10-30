// Firestore paths, so the web app, functions, seed and rules tests all agree.
// Everything lives under orgs/{orgId}/ so several companies can share one project.

const org = (orgId: string) => `orgs/${orgId}`;

export const paths = {
  org,
  projects: (orgId: string) => `${org(orgId)}/projects`,
  sites: (orgId: string) => `${org(orgId)}/sites`,
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

/** Storage path for a site photo. Photos never go in the repo. */
export const photoPath = (orgId: string, siteId: string, submissionId: string, photoId: string) =>
  `orgs/${orgId}/sites/${siteId}/submissions/${submissionId}/${photoId}.jpg`;
