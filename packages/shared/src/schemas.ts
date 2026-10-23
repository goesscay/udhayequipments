import { z } from 'zod';
import { PRIORITIES } from './stages';

/** Form schemas used by the web app (the API validates the same rules with DTOs). */

export const loginSchema = z.object({
  login: z.string().trim().min(3, 'Enter your employee code, mobile number or email'),
  password: z.string().min(1, 'Password is required'),
});
export type LoginInput = z.infer<typeof loginSchema>;

const phone = z
  .string()
  .trim()
  .regex(/^[0-9+\-\s]{7,20}$/, 'Enter a valid phone number');

export const createProjectSchema = z
  .object({
    title: z.string().trim().min(3, 'Enter a project title').max(160),
    customerId: z.string().optional(),
    customerName: z.string().trim().max(160).optional(),
    contactPerson: z.string().trim().max(120).optional(),
    customerPhone: phone.optional().or(z.literal('')),
    customerEmail: z.email().optional().or(z.literal('')),
    city: z.string().trim().max(80).optional(),
    siteAddress: z.string().trim().max(500).optional(),
    requirement: z.string().trim().max(5000).optional(),
    estimatedValue: z.number().nonnegative().optional(),
    priority: z.enum(PRIORITIES),
  })
  .refine((v) => v.customerId || (v.customerName && v.customerPhone), {
    message: 'Pick a customer or enter the new customer name and phone',
    path: ['customerName'],
  });
export type CreateProjectInput = z.infer<typeof createProjectSchema>;

const password = z
  .string()
  .min(10, 'At least 10 characters')
  .regex(/[A-Za-z]/, 'Include a letter')
  .regex(/[0-9]/, 'Include a number');

const optionalDate = z.union([z.literal(''), z.iso.date('Use a valid date')]).optional();

export const createUserSchema = z
  .object({
    name: z.string().trim().min(2, 'Enter the full name').max(120),
    displayName: z.string().trim().max(80).optional(),
    employeeCode: z.string().trim().max(30).optional(),
    email: z.union([z.literal(''), z.email('Enter a valid email')]).optional(),
    phone: phone.optional().or(z.literal('')),
    gender: z.string().optional(),
    department: z.string().trim().max(80).optional(),
    employmentType: z.string().optional(),
    dateOfJoining: optionalDate,
    dateOfBirth: optionalDate,
    password,
    roleId: z.string().min(1, 'Choose a role'),
    teamId: z.string().optional(),
  })
  .refine((v) => v.email || v.employeeCode || v.phone, {
    message: 'Give an employee code, mobile number or email so they can sign in',
    path: ['employeeCode'],
  });
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password'),
    newPassword: password,
    confirm: z.string(),
  })
  .refine((v) => v.newPassword === v.confirm, { message: 'Passwords do not match', path: ['confirm'] })
  .refine((v) => v.newPassword !== v.currentPassword, { message: 'Choose a different password', path: ['newPassword'] });
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
