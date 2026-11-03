export const PERMISSIONS = {
  'dashboard.view': 'View the dashboard',
  'project.view': 'View projects',
  'project.create': 'Create projects / leads',
  'project.update': 'Edit project details',
  'project.manage': 'Hold, resume or cancel projects',
  'stage.act': 'Complete / hand off work at a stage',
  'stage.assign': 'Assign stage work to team members',
  'cad.approve': 'Approve or reject the MEP layout',
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
  'OPERATIONS',
  'ACCOUNTS',
  'PURCHASE',
  'SALES',
  'CAD',
  'PROJECT',
  'SERVICE',
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
  OPERATIONS: {
    name: 'Operations',
    description: 'Operations team: prepares quotations and BOQs, records payments, no user or role management.',
    permissions: {
      'dashboard.view': 'TEAM',
      'project.view': 'TEAM',
      'project.update': 'TEAM',
      'stage.act': 'TEAM',
      'stage.assign': 'TEAM',
      'document.view': 'TEAM',
      'document.upload': 'TEAM',
      'customer.view': 'ALL',
      'customer.manage': 'TEAM',
      'price.view': 'ALL',
      'payment.manage': 'ALL',
      'user.view': 'TEAM',
    },
  },
  ACCOUNTS: {
    name: 'Accounts',
    description: 'Accounts staff: payments, prices and reports on every project; no workflow actions.',
    permissions: all([
      'dashboard.view',
      'project.view',
      'document.view',
      'customer.view',
      'price.view',
      'payment.manage',
      'report.view',
    ]),
  },
  PURCHASE: {
    name: 'Purchase',
    description: 'Purchase staff: read-only access to every project and its BOQ and drawings for buying material.',
    permissions: all(['project.view', 'document.view', 'customer.view', 'price.view']),
  },
  SALES: {
    name: 'Sales',
    description: 'Sales team: leads and requirements, customer approval of layout, quotation and PO.',
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
      'price.view': 'TEAM',
      'user.view': 'TEAM',
    },
  },
  CAD: {
    name: 'CAD',
    description: 'CAD / design engineers: layout drawings, MEP layouts and release to production for the CAD team.',
    permissions: {
      'dashboard.view': 'TEAM',
      'project.view': 'TEAM',
      'stage.act': 'TEAM',
      'document.view': 'TEAM',
      'document.upload': 'TEAM',
      'customer.view': 'ALL',
      'user.view': 'TEAM',
    },
  },
  PROJECT: {
    name: 'Project',
    description: 'Project team: site survey & measurement, installation, snag list and customer handover.',
    permissions: {
      'dashboard.view': 'TEAM',
      'project.view': 'TEAM',
      'stage.act': 'TEAM',
      'document.view': 'TEAM',
      'document.upload': 'TEAM',
      'customer.view': 'ALL',
      'user.view': 'TEAM',
      'installation.manage': 'TEAM',
    },
  },
  SERVICE: {
    name: 'Service',
    description: 'Support & Service team: service tickets and visits after handover, and closing projects.',
    permissions: {
      'dashboard.view': 'TEAM',
      'project.view': 'TEAM',
      'stage.act': 'TEAM',
      'document.view': 'TEAM',
      'document.upload': 'TEAM',
      'customer.view': 'ALL',
      'user.view': 'TEAM',
      'service.view': 'TEAM',
      'service.manage': 'TEAM',
    },
  },
};
