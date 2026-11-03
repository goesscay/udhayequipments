import type { RoleCode } from './permissions';
import type { TeamCode } from './teams';

/** Staff profile fields and the HR-sheet import mapping. */

export const GENDERS = ['Female', 'Male', 'Other'] as const;
export type Gender = (typeof GENDERS)[number];

export const EMPLOYMENT_TYPES = ['Full Time', 'Part Time', 'Contract', 'Intern'] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

/**
 * How an HR department maps onto the app: the workflow team the person works in (if any)
 * and their starting role. Departments without a workflow stage (Accounts, Purchase) get no team.
 */
export const DEPARTMENT_MAP: Record<string, { team: TeamCode | null; role: RoleCode }> = {
  accounts: { team: null, role: 'ACCOUNTS' },
  purchase: { team: null, role: 'PURCHASE' },
  operations: { team: 'OPERATIONS', role: 'OPERATIONS' },
  'design engineer': { team: 'CAD', role: 'TEAM_MEMBER' },
  cad: { team: 'CAD', role: 'TEAM_MEMBER' },
  'project co-ordinator': { team: 'PROJECT', role: 'TEAM_MEMBER' },
  'project coordinator': { team: 'PROJECT', role: 'TEAM_MEMBER' },
  project: { team: 'PROJECT', role: 'TEAM_MEMBER' },
  'sales co-ordinator': { team: 'SALES', role: 'TEAM_MEMBER' },
  'sales coordinator': { team: 'SALES', role: 'TEAM_MEMBER' },
  sales: { team: 'SALES', role: 'TEAM_MEMBER' },
  service: { team: 'SERVICE', role: 'TEAM_MEMBER' },
  production: { team: 'PRODUCTION', role: 'TEAM_MEMBER' },
  qc: { team: 'QC', role: 'TEAM_MEMBER' },
  'quality check': { team: 'QC', role: 'TEAM_MEMBER' },
  'quality control': { team: 'QC', role: 'TEAM_MEMBER' },
  dispatch: { team: 'DISPATCH', role: 'TEAM_MEMBER' },
  management: { team: 'MANAGEMENT', role: 'DIRECTOR' },
};

export const DEPARTMENTS = [
  'Accounts',
  'Purchase',
  'Operations',
  'Design Engineer',
  'Project Co-ordinator',
  'Sales Co-ordinator',
  'Service',
  'Production',
  'QC',
  'Dispatch',
  'Management',
] as const;

export function mapDepartment(department: string | null | undefined) {
  return DEPARTMENT_MAP[(department ?? '').trim().toLowerCase()] ?? null;
}

/**
 * Indian mobile numbers to "+91XXXXXXXXXX". Accepts 10 digits, "91" + 10 digits, or "+91 …".
 * Other inputs with 7–15 digits are kept as "+<digits>"; anything else returns null.
 */
export function normalizePhone(raw: string | number | null | undefined): string | null {
  const digits = String(raw ?? '').replace(/\D/g, '');
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`;
  if (digits.length === 11 && digits.startsWith('0')) return `+91${digits.slice(1)}`;
  if (digits.length >= 7 && digits.length <= 15) return `+${digits}`;
  return null;
}

/** "G.SASIREKHA " → "G. Sasirekha", "M.SATHYA SEELAN" → "M. Sathya Seelan". */
export function tidyName(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\.(?=\S)/g, '. ')
    .toLowerCase()
    .replace(/(^|[\s.-])([a-z])/g, (_, sep: string, c: string) => sep + c.toUpperCase());
}

/** One row from the HR sheet, as sent to POST /users/import. */
export interface UserImportRow {
  employeeCode: string;
  name: string;
  displayName?: string | null;
  phone?: string | null;
  gender?: string | null;
  department?: string | null;
  status?: string | null;
  employmentType?: string | null;
  /** yyyy-mm-dd */
  dateOfJoining?: string | null;
  dateOfBirth?: string | null;
  email?: string | null;
}

export interface UserImportResult {
  created: { employeeCode: string; name: string; displayName: string | null; login: string; phone: string | null; role: string; team: string | null; temporaryPassword: string }[];
  skipped: { employeeCode: string; name: string; reason: string }[];
}
