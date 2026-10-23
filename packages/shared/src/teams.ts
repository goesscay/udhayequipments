export const TEAMS = [
  'MANAGEMENT',
  'SALES',
  'PROJECT',
  'ADMIN',
  'CAD',
  'PRODUCTION',
  'DISPATCH',
  'SERVICE',
] as const;

export type TeamCode = (typeof TEAMS)[number];

export const TEAM_LABELS: Record<TeamCode, string> = {
  MANAGEMENT: 'Management',
  SALES: 'Sales',
  PROJECT: 'Project',
  ADMIN: 'Admin',
  CAD: 'CAD',
  PRODUCTION: 'Production',
  DISPATCH: 'Dispatch',
  SERVICE: 'Support & Service',
};
