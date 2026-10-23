export const PERMISSIONS = {
  'dashboard.view': 'View the dashboard',
  'project.view': 'View projects',
  'project.create': 'Create projects / leads',
  'project.update': 'Edit project details',
  'project.manage': 'Hold, resume or cancel projects',
  'stage.act': 'Complete / hand off work at a stage',
  'stage.assign': 'Assign stage work to team members',
  'cad.approve': 'Approve or reject CAD drawings (Overall Head)',
  'document.view': 'View and download documents',
  'document.upload': 'Upload documents',
  'customer.view': 'View customers',
  'customer.manage': 'Create and edit customers',
  'price.view': 'See quotation values and amounts',
  'user.view': 'View users',
  'user.manage': 'Create and edit users',
  'role.manage': 'Edit roles and permissions',
  'settings.manage': 'Edit system settings (SLAs etc.)',
  'audit.view': 'View the audit log',
  'payment.manage': 'Add payment milestones and record receipts',
  'production.manage': 'Manage production job cards and quality checks',
  'dispatch.manage': 'Plan dispatch trips and record deliveries',
  'installation.manage': 'Manage snag lists and record the handover',
  'service.view': 'View service tickets',
  'service.manage': 'Create, assign and resolve service tickets',
  'report.view': 'View reports and export data',
} as const;

export type PermissionKey = keyof typeof PERMISSIONS;
export const PERMISSION_KEYS = Object.keys(PERMISSIONS) as PermissionKey[];

/** How far a permission reaches: records assigned to me, my team's records, or everything. */
export const SCOPES = ['OWN', 'TEAM', 'ALL'] as const;
export type Scope = (typeof SCOPES)[number];

export const ROLE_CODES = [
  'SUPER_ADMIN',
  'ADMIN',
  'DIRECTOR',
  'TEAM_HEAD',
  'TEAM_MEMBER',
  'VIEWER',
] as const;
export type RoleCode = (typeof ROLE_CODES)[number];

type Grants = Partial<Record<PermissionKey, Scope>>;

const all = (keys: PermissionKey[]): Grants => Object.fromEntries(keys.map((k) => [k, 'ALL']));

export const DEFAULT_ROLES: Record<
  RoleCode,
  { name: string; description: string; permissions: Grants }
> = {
  SUPER_ADMIN: {
    name: 'Super Admin',
    description: 'Owner / MD. Full access to everything, including roles and settings.',
    permissions: all(PERMISSION_KEYS),
  },
  ADMIN: {
    name: 'Admin',
    description: 'Operations admin. Sees every project, prepares quotations & BOQs, manages users.',
    permissions: all(
      PERMISSION_KEYS.filter((k) => !['role.manage', 'settings.manage', 'cad.approve'].includes(k)),
    ),
  },
  DIRECTOR: {
    name: 'Overall Head',
    description: 'Approves CAD drawings and monitors all projects.',
    permissions: {
      ...all([
        'dashboard.view',
        'project.view',
        'cad.approve',
        'document.view',
        'customer.view',
        'price.view',
        'user.view',
        'audit.view',
        'service.view',
        'report.view',
      ]),
    },
  },
  TEAM_HEAD: {
    name: 'Team Head',
    description: "Leads a department: sees and assigns the team's work.",
    permissions: {
      'dashboard.view': 'TEAM',
      'project.view': 'TEAM',
      'project.create': 'TEAM',
      'project.update': 'TEAM',
      'stage.act': 'TEAM',
      'stage.assign': 'TEAM',
      'document.view': 'TEAM',
      'document.upload': 'TEAM',
      'customer.view': 'ALL',
      'customer.manage': 'TEAM',
      'user.view': 'TEAM',
      'production.manage': 'TEAM',
      'dispatch.manage': 'TEAM',
      'installation.manage': 'TEAM',
      'service.view': 'TEAM',
      'service.manage': 'TEAM',
    },
  },
  TEAM_MEMBER: {
    name: 'Team Member',
    description: 'Executive / engineer / technician working on assigned items.',
    permissions: {
      'project.view': 'TEAM',
      'project.create': 'OWN',
      'stage.act': 'OWN',
      'document.view': 'TEAM',
      'document.upload': 'OWN',
      'customer.view': 'ALL',
      'customer.manage': 'OWN',
      'production.manage': 'TEAM',
      'dispatch.manage': 'TEAM',
      'installation.manage': 'TEAM',
      'service.view': 'TEAM',
      'service.manage': 'TEAM',
    },
  },
  VIEWER: {
    name: 'Viewer',
    description: 'Read-only access to all projects.',
    permissions: all(['dashboard.view', 'project.view', 'document.view', 'customer.view', 'service.view']),
  },
};
