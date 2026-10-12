import { z } from 'zod';

/**
 * ==============================================================================
 * Core Enums (05_Backend_Schema_Supabase_Formative_Assessment.pdf)
 * ==============================================================================
 */

export const AppRoleSchema = z.enum([
  'student',
  'subject_teacher',
  'class_teacher',
  'proctor',
  'hod'
]);
export type AppRole = z.infer<typeof AppRoleSchema>;

export const AccountStatusSchema = z.enum([
  'invited',
  'active',
  'inactive'
]);
export type AccountStatus = z.infer<typeof AccountStatusSchema>;

export const AssessmentStatusSchema = z.enum([
  'draft',
  'published',
  'closed',
  'archived'
]);
export type AssessmentStatus = z.infer<typeof AssessmentStatusSchema>;

export const SubmissionStatusSchema = z.enum([
  'uploaded',
  'validated',
  'queued',
  'processing',
  'recognition_completed',
  'similarity_completed',
  'ready_for_review',
  'validation_failed',
  'recognition_failed',
  'similarity_failed'
]);
export type SubmissionStatus = z.infer<typeof SubmissionStatusSchema>;

export const EvaluationStatusSchema = z.enum([
  'draft',
  'completed',
  'published',
  'revised'
]);
export type EvaluationStatus = z.infer<typeof EvaluationStatusSchema>;

export const ReviewStatusSchema = z.enum([
  'pending',
  'reviewed_no_concern',
  'reviewed_follow_up',
  'referred'
]);
export type ReviewStatus = z.infer<typeof ReviewStatusSchema>;

/**
 * ==============================================================================
 * Identity and Profile Schemas
 * ==============================================================================
 */

export const ProfileSchema = z.object({
  id: z.string().uuid(),
  institution_id: z.string().uuid().nullable().optional(),
  full_name: z.string().min(1, 'Full name is required'),
  email: z.string().email('Valid email is required'),
  usn: z.string().nullable().optional(),
  status: AccountStatusSchema,
  created_at: z.string(),
  updated_at: z.string()
});
export type Profile = z.infer<typeof ProfileSchema>;

export const UserRoleSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  role: AppRoleSchema,
  scope_id: z.string().uuid().nullable().optional(),
  assigned_by: z.string().uuid().nullable().optional(),
  active: z.boolean(),
  created_at: z.string()
});
export type UserRole = z.infer<typeof UserRoleSchema>;

/**
 * ==============================================================================
 * Academic Structure Schemas
 * ==============================================================================
 */

export const DepartmentSchema = z.object({
  id: z.string().uuid(),
  institution_id: z.string().uuid().nullable().optional(),
  code: z.string().min(1).max(20),
  name: z.string().min(1).max(255),
  created_at: z.string(),
  updated_at: z.string()
});
export type Department = z.infer<typeof DepartmentSchema>;

export const AcademicTermSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  starts_on: z.string(), // YYYY-MM-DD
  ends_on: z.string(),   // YYYY-MM-DD
  active: z.boolean(),
  created_at: z.string()
});
export type AcademicTerm = z.infer<typeof AcademicTermSchema>;

export const ClassSchema = z.object({
  id: z.string().uuid(),
  department_id: z.string().uuid(),
  term_id: z.string().uuid(),
  programme: z.string().min(1),
  semester: z.number().int().min(1).max(12),
  section: z.string().min(1),
  class_teacher_id: z.string().uuid().nullable().optional(),
  created_at: z.string()
});
export type Class = z.infer<typeof ClassSchema>;

export const SubjectSchema = z.object({
  id: z.string().uuid(),
  department_id: z.string().uuid(),
  code: z.string().min(1).max(20),
  name: z.string().min(1).max(255),
  credits: z.number().int().min(0),
  created_at: z.string()
});
export type Subject = z.infer<typeof SubjectSchema>;

export const ClassSubjectSchema = z.object({
  id: z.string().uuid(),
  class_id: z.string().uuid(),
  subject_id: z.string().uuid(),
  subject_teacher_id: z.string().uuid(),
  active: z.boolean(),
  created_at: z.string()
});
export type ClassSubject = z.infer<typeof ClassSubjectSchema>;

export const AuditEventSchema = z.object({
  id: z.string().uuid(),
  actor_id: z.string().uuid().nullable().optional(),
  action: z.string(),
  resource_type: z.string(),
  resource_id: z.string(),
  before: z.record(z.unknown()).nullable().optional(),
  after: z.record(z.unknown()).nullable().optional(),
  correlation_id: z.string().uuid(),
  ip_hash: z.string().nullable().optional(),
  created_at: z.string()
});
export type AuditEvent = z.infer<typeof AuditEventSchema>;

/**
 * ==============================================================================
 * HOD Management Request DTOs
 * ==============================================================================
 */

export const CreateDepartmentRequestSchema = z.object({
  code: z.string().min(2).max(20).toUpperCase(),
  name: z.string().min(2).max(255)
});
export type CreateDepartmentRequest = z.infer<typeof CreateDepartmentRequestSchema>;

export const CreateTermRequestSchema = z.object({
  name: z.string().min(2).max(100),
  starts_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format must be YYYY-MM-DD'),
  ends_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format must be YYYY-MM-DD'),
  active: z.boolean().default(true)
}).refine(data => data.ends_on >= data.starts_on, {
  message: 'ends_on date must be on or after starts_on date',
  path: ['ends_on']
});
export type CreateTermRequest = z.infer<typeof CreateTermRequestSchema>;

export const CreateClassRequestSchema = z.object({
  department_id: z.string().uuid(),
  term_id: z.string().uuid(),
  programme: z.string().min(1).max(50),
  semester: z.number().int().min(1).max(12),
  section: z.string().min(1).max(10),
  class_teacher_id: z.string().uuid().nullable().optional()
});
export type CreateClassRequest = z.infer<typeof CreateClassRequestSchema>;

export const CreateSubjectRequestSchema = z.object({
  department_id: z.string().uuid(),
  code: z.string().min(2).max(20).toUpperCase(),
  name: z.string().min(2).max(255),
  credits: z.number().int().min(0).max(30).default(3)
});
export type CreateSubjectRequest = z.infer<typeof CreateSubjectRequestSchema>;

export const AssignClassSubjectRequestSchema = z.object({
  class_id: z.string().uuid(),
  subject_id: z.string().uuid(),
  subject_teacher_id: z.string().uuid()
});
export type AssignClassSubjectRequest = z.infer<typeof AssignClassSubjectRequestSchema>;

export const InviteUserRequestSchema = z.object({
  full_name: z.string().min(2).max(255),
  email: z.string().email(),
  usn: z.string().min(2).max(50).nullable().optional(),
  role: AppRoleSchema,
  scope_id: z.string().uuid().nullable().optional()
});
export type InviteUserRequest = z.infer<typeof InviteUserRequestSchema>;

export const AssignRoleRequestSchema = z.object({
  role: AppRoleSchema,
  scope_id: z.string().uuid().nullable().optional(),
  active: z.boolean().default(true)
});
export type AssignRoleRequest = z.infer<typeof AssignRoleRequestSchema>;

export const UpdateUserStatusRequestSchema = z.object({
  status: AccountStatusSchema
});
export type UpdateUserStatusRequest = z.infer<typeof UpdateUserStatusRequestSchema>;

/**
 * ==============================================================================
 * Health Check Contract
 * ==============================================================================
 */
export const HealthResponseSchema = z.object({
  status: z.literal('ok'),
  service: z.string(),
  version: z.string(),
  timestamp: z.string()
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;
