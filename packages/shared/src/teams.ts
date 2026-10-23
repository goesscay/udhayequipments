export const TEAMS = [
  'MANAGEMENT',
  'SALES',
  'PROJECT',
  'OPERATIONS',
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
  OPERATIONS: 'Operations',
  CAD: 'CAD',
  PRODUCTION: 'Production',
  DISPATCH: 'Dispatch',
  SERVICE: 'Support & Service',
};
