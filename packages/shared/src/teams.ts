export const TEAMS = [
  'MANAGEMENT',
  'SALES',
  'PROJECT',
  'OPERATIONS',
  'CAD',
  'PRODUCTION',
  'QC',
  'DISPATCH',
  'SERVICE',
  'ACCOUNTS',
  'PURCHASE',
] as const;

export type TeamCode = (typeof TEAMS)[number];

export const TEAM_LABELS: Record<TeamCode, string> = {
  MANAGEMENT: 'Management',
  SALES: 'Sales',
  PROJECT: 'Project',
  OPERATIONS: 'Operations',
  CAD: 'CAD',
  PRODUCTION: 'Production',
  QC: 'Quality Check (QC)',
  DISPATCH: 'Dispatch',
  SERVICE: 'Support & Service',
  ACCOUNTS: 'Accounts',
  PURCHASE: 'Purchase',
};
