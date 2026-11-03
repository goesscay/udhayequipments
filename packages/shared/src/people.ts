import type { TeamCode } from './teams';

/** Staff profile fields and the HR-sheet import mapping. */

export const GENDERS = ['Female', 'Male', 'Other'] as const;
export type Gender = (typeof GENDERS)[number];

export const EMPLOYMENT_TYPES = ['Full Time', 'Part Time', 'Contract', 'Intern'] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

/**
 * How an HR department maps onto the app: the team the person works in and their starting role
 * (by role code). Production, QC and Dispatch have no role yet; create one with that code in
 * Settings → Roles and the import picks it up.
 */
export const DEPARTMENT_MAP: Record<string, { team: TeamCode | null; role: string }> = {
  accounts: { team: 'ACCOUNTS', role: 'ACCOUNTS' },
  purchase: { team: 'PURCHASE', role: 'PURCHASE' },
  operations: { team: 'OPERATIONS', role: 'OPERATIONS' },
  'design engineer': { team: 'CAD', role: 'CAD' },
  cad: { team: 'CAD', role: 'CAD' },
  'project co-ordinator': { team: 'PROJECT', role: 'PROJECT' },
  'project coordinator': { team: 'PROJECT', role: 'PROJECT' },
  project: { team: 'PROJECT', role: 'PROJECT' },
  'sales co-ordinator': { team: 'SALES', role: 'SALES' },
  'sales coordinator': { team: 'SALES', role: 'SALES' },
  sales: { team: 'SALES', role: 'SALES' },
  service: { team: 'SERVICE', role: 'SERVICE' },
  'service & support': { team: 'SERVICE', role: 'SERVICE' },
  'support & service': { team: 'SERVICE', role: 'SERVICE' },
  support: { team: 'SERVICE', role: 'SERVICE' },
  production: { team: 'PRODUCTION', role: 'PRODUCTION' },
  qc: { team: 'QC', role: 'QC' },
  'quality check': { team: 'QC', role: 'QC' },
  'quality control': { team: 'QC', role: 'QC' },
  dispatch: { team: 'DISPATCH', role: 'DISPATCH' },
  management: { team: 'MANAGEMENT', role: 'ADMIN' },
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
  // Case and spacing don't matter: "SERVICE &  SUPPORT" matches "service & support".
  return DEPARTMENT_MAP[(department ?? '').trim().toLowerCase().replace(/\s+/g, ' ')] ?? null;
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
