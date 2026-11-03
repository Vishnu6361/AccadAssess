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
  'ready_for_review',
  'validation_failed',
  'recognition_failed'
]);
export type SubmissionStatus = z.infer<typeof SubmissionStatusSchema>;

export const EvaluationStatusSchema = z.enum([
  'draft',
  'completed',
  'published',
  'revised'
]);
export type EvaluationStatus = z.infer<typeof EvaluationStatusSchema>;

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
  phone: z.string().nullable().optional(),
  employee_id: z.string().nullable().optional(),
  designation: z.string().nullable().optional(),
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

export const ProgrammeSchema = z.object({
  id: z.string().uuid(),
  code: z.string().min(1).max(20),
  name: z.string().min(1).max(255),
  duration_years: z.number().int().min(1).max(6).default(2),
  total_semesters: z.number().int().min(1).max(12).default(4),
  status: z.enum(['active', 'inactive']).default('active'),
  active: z.boolean().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional()
});
export type Programme = z.infer<typeof ProgrammeSchema>;

export const SpecializationSchema = z.object({
  id: z.string().uuid(),
  programme_id: z.string().uuid(),
  code: z.string().min(1).max(20),
  name: z.string().min(1).max(255),
  applicable_semesters: z.array(z.number().int().min(1).max(12)).default([1, 2, 3, 4]),
  semesters: z.array(z.number().int().min(1).max(12)).optional(),
  active: z.boolean().default(true),
  created_at: z.string().optional(),
  updated_at: z.string().optional()
});
export type Specialization = z.infer<typeof SpecializationSchema>;

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
  programme_id: z.string().uuid().nullable().optional(),
  specialization_id: z.string().uuid().nullable().optional(),
  term_id: z.string().uuid().nullable().optional(),
  programme: z.string().min(1),
  semester: z.number().int().min(1).max(12),
  section: z.string().nullable().optional(),
  class_teacher_id: z.string().uuid().nullable().optional(),
  created_at: z.string()
});
export type Class = z.infer<typeof ClassSchema>;

/**
 * Formats an academic class cohort name according to institutional standards.
 * For MCA, standardizes strictly to "MCA Semester {N}" (e.g. "MCA Semester 3") without incorrect sections.
 * For other programmes that genuinely use sections, formats as "{Programme} Sem {N}-{Section}".
 */
export function formatClassName(cls?: {
  programme?: string | null;
  semester?: number | string | null;
  section?: string | null;
} | null): string {
  if (!cls) return 'Class';
  const prog = (cls.programme || '').trim();
  const sem = cls.semester ?? '';
  const sec = (cls.section || '').trim();

  if (prog.toUpperCase() === 'MCA') {
    return sem ? `MCA Semester ${sem}` : 'MCA';
  }

  if (!sec || sec.toUpperCase() === 'NONE' || sec.toUpperCase() === 'GENERAL') {
    return sem ? `${prog} Semester ${sem}` : prog;
  }

  return `${prog} Sem ${sem}-${sec}`;
}

export const SubjectSchema = z.object({
  id: z.string().uuid(),
  programme_id: z.string().uuid().nullable().optional(),
  specialization_id: z.string().uuid().nullable().optional(),
  semester: z.number().int().min(1).max(12).nullable().optional(),
  code: z.string().min(1).max(20),
  name: z.string().min(1).max(255),
  credits: z.number().int().min(0),
  active: z.boolean().default(true),
  created_at: z.string(),
  programme_code: z.string().optional(),
  programme_name: z.string().optional(),
  specialization_code: z.string().optional(),
  specialization_name: z.string().optional()
});
export type Subject = z.infer<typeof SubjectSchema>;

export const SubjectSpecializationSchema = z.object({
  id: z.string().uuid(),
  subject_id: z.string().uuid(),
  specialization_id: z.string().uuid(),
  semester: z.number().int().min(1).max(12).nullable().optional(),
  created_at: z.string().optional()
});
export type SubjectSpecialization = z.infer<typeof SubjectSpecializationSchema>;

export const ClassSubjectSchema = z.object({
  id: z.string().uuid(),
  class_id: z.string().uuid(),
  subject_id: z.string().uuid(),
  subject_teacher_id: z.string().uuid(),
  active: z.boolean(),
  created_at: z.string()
});
export type ClassSubject = z.infer<typeof ClassSubjectSchema>;

export const EnrollmentSchema = z.object({
  id: z.string().uuid(),
  class_id: z.string().uuid(),
  student_id: z.string().uuid(),
  specialization_id: z.string().uuid().nullable().optional(),
  roll_number: z.string().nullable().optional(),
  status: AccountStatusSchema.default('active'),
  created_at: z.string()
});
export type Enrollment = z.infer<typeof EnrollmentSchema>;

export const ProctorAssignmentSchema = z.object({
  id: z.string().uuid(),
  class_id: z.string().uuid(),
  student_id: z.string().uuid(),
  proctor_id: z.string().uuid(),
  valid_from: z.string(),
  valid_to: z.string().nullable().optional(),
  assigned_by: z.string().uuid().nullable().optional(),
  created_at: z.string()
});
export type ProctorAssignment = z.infer<typeof ProctorAssignmentSchema>;

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
  programme: z.string().min(1).max(50),
  semester: z.number().int().min(1).max(12),
  section: z.string().min(1).max(10).nullable().optional(),
  class_teacher_id: z.string().uuid().nullable().optional(),
  programme_id: z.string().uuid().nullable().optional(),
  specialization_id: z.string().uuid().nullable().optional(),
  term_id: z.string().uuid().nullable().optional()
});
export type CreateClassRequest = z.infer<typeof CreateClassRequestSchema>;

export const CreateProgrammeRequestSchema = z.object({
  code: z.string().min(2).max(20).toUpperCase(),
  name: z.string().min(2).max(255),
  duration_years: z.number().int().min(1).max(6).default(2),
  total_semesters: z.number().int().min(1).max(12).default(4),
  status: z.enum(['active', 'inactive']).default('active'),
  active: z.boolean().optional()
});
export type CreateProgrammeRequest = z.infer<typeof CreateProgrammeRequestSchema>;

export const UpdateProgrammeRequestSchema = z.object({
  name: z.string().min(2).max(255).optional(),
  duration_years: z.number().int().min(1).max(6).optional(),
  total_semesters: z.number().int().min(1).max(12).optional(),
  status: z.enum(['active', 'inactive']).optional(),
  active: z.boolean().optional()
});
export type UpdateProgrammeRequest = z.infer<typeof UpdateProgrammeRequestSchema>;

export const CreateSpecializationRequestSchema = z.object({
  programme_id: z.string().uuid(),
  code: z.string().min(1).max(20).toUpperCase(),
  name: z.string().min(2).max(255),
  applicable_semesters: z.array(z.number().int().min(1).max(12)).optional(),
  semesters: z.array(z.number().int().min(1).max(12)).optional(),
  active: z.boolean().default(true)
});
export type CreateSpecializationRequest = z.infer<typeof CreateSpecializationRequestSchema>;

export const UpdateSpecializationRequestSchema = z.object({
  name: z.string().min(2).max(255).optional(),
  applicable_semesters: z.array(z.number().int().min(1).max(12)).optional(),
  semesters: z.array(z.number().int().min(1).max(12)).optional(),
  active: z.boolean().optional()
});
export type UpdateSpecializationRequest = z.infer<typeof UpdateSpecializationRequestSchema>;

export const CreateSubjectRequestSchema = z.object({
  programme_id: z.string().uuid().nullable().optional(),
  specialization_id: z.string().uuid().nullable().optional(),
  semester: z.number().int().min(1).max(12).nullable().optional(),
  code: z.string().min(2).max(20).toUpperCase(),
  name: z.string().min(2).max(255),
  credits: z.number().int().min(0).max(30).optional().default(3),
  active: z.boolean().optional().default(true)
});
export type CreateSubjectRequest = z.infer<typeof CreateSubjectRequestSchema>;

export const UpdateSubjectRequestSchema = z.object({
  programme_id: z.string().uuid().nullable().optional(),
  specialization_id: z.string().uuid().nullable().optional(),
  semester: z.number().int().min(1).max(12).nullable().optional(),
  code: z.string().min(2).max(20).toUpperCase().optional(),
  name: z.string().min(2).max(255).optional(),
  credits: z.number().int().min(0).max(30).optional(),
  active: z.boolean().optional()
});
export type UpdateSubjectRequest = z.infer<typeof UpdateSubjectRequestSchema>;

export interface SubjectDependencies {
  subject_id: string;
  has_dependencies: boolean;
  class_subjects_count: number;
  assessments_count: number;
  submissions_count: number;
  classes?: Array<{ id: string; programme: string; semester: number; section?: string | null }>;
  allocations?: Array<{ id: string; class_id: string; class_name: string; teacher_name?: string }>;
  details?: string[];
}

export const AssignClassSubjectRequestSchema = z.object({
  class_id: z.string().uuid(),
  subject_id: z.string().uuid(),
  subject_teacher_id: z.string().uuid()
});
export type AssignClassSubjectRequest = z.infer<typeof AssignClassSubjectRequestSchema>;

export interface FacultyAllocation {
  id: string;
  faculty_id: string;
  programme_id: string;
  programme_code?: string;
  programme_name?: string;
  specialization_id?: string | null;
  specialization_code?: string | null;
  specialization_name?: string | null;
  semester?: number | null;
  assigned_by?: string | null;
  created_at: string;
}

export const AssignFacultySubjectsRequestSchema = z.object({
  faculty_id: z.string().uuid().optional().nullable(),
  programme_id: z.string().uuid(),
  specialization_id: z.string().uuid().optional().nullable(),
  semester: z.number().int().min(1).max(12).optional().nullable(),
  subject_ids: z.array(z.string().uuid()).default([]),
  class_id: z.string().uuid().optional().nullable()
});
export type AssignFacultySubjectsRequest = z.infer<typeof AssignFacultySubjectsRequestSchema>;

export const UserTypeSchema = z.enum(['student', 'faculty']);
export type UserType = z.infer<typeof UserTypeSchema>;

export const InviteUserRequestSchema = z.object({
  full_name: z.string().min(2, 'Full name must be at least 2 characters').max(255),
  email: z.string().email('Valid institutional email is required'),
  usn: z.string().min(2).max(50).nullable().optional(),
  role: z.enum(['student', 'faculty', 'subject_teacher', 'class_teacher', 'proctor', 'hod']),
  account_type: z.enum(['student', 'faculty']).optional(),
  roles: z.array(z.enum(['subject_teacher', 'class_teacher', 'proctor'])).optional(),
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

export const UpdateFacultyProfileRequestSchema = z.object({
  full_name: z.string().min(1, 'Faculty full name cannot be empty').max(100),
  email: z.string().email('Please enter a valid email address').max(100),
  phone: z.string().max(25).nullable().optional().or(z.literal('')),
  employee_id: z.string().max(50).nullable().optional().or(z.literal('')),
  designation: z.string().max(100).nullable().optional().or(z.literal(''))
});
export type UpdateFacultyProfileRequest = z.infer<typeof UpdateFacultyProfileRequestSchema>;

export const UpdateFacultyProfileResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  user: ProfileSchema.extend({
    roles: z.array(z.string()).optional()
  })
});
export type UpdateFacultyProfileResponse = z.infer<typeof UpdateFacultyProfileResponseSchema>;

export const DeleteStudentResponseSchema = z.object({
  success: z.boolean(),
  deleted_student_id: z.string(),
  message: z.string()
});
export type DeleteStudentResponse = z.infer<typeof DeleteStudentResponseSchema>;

export const EnrollStudentRequestSchema = z.object({
  class_id: z.string().uuid(),
  student_id: z.string().uuid(),
  specialization_id: z.string().uuid().nullable().optional(),
  roll_number: z.string().min(1).max(50).nullable().optional()
});
export type EnrollStudentRequest = z.infer<typeof EnrollStudentRequestSchema>;

export const EnrollSpecializationStudentsRequestSchema = z.object({
  programme_id: z.string().uuid().optional().nullable(),
  specialization_id: z.string().uuid(),
  semester: z.number().int().min(1).max(12).default(3),
  student_ids: z.array(z.string().uuid()).min(1, 'At least one student must be selected'),
  allow_transfer: z.boolean().default(false).optional()
});
export type EnrollSpecializationStudentsRequest = z.infer<typeof EnrollSpecializationStudentsRequestSchema>;

export const TransferEnrollmentRequestSchema = z.object({
  enrollment_id: z.string().uuid().optional().nullable(),
  student_id: z.string().uuid(),
  target_specialization_id: z.string().uuid(),
  semester: z.number().int().min(1).max(12).default(3)
});
export type TransferEnrollmentRequest = z.infer<typeof TransferEnrollmentRequestSchema>;

export interface EnrollmentWithDetails extends Enrollment {
  student_name: string;
  student_email: string;
  student_usn?: string | null;
  class_name: string;
  programme?: string;
  programme_id?: string | null;
  specialization_id?: string | null;
  specialization_code?: string | null;
  specialization_name?: string | null;
  semester?: number | null;
  section?: string | null;
}

export const AssignProctorRequestSchema = z.object({
  class_id: z.string().uuid(),
  student_id: z.string().uuid(),
  proctor_id: z.string().uuid(),
  valid_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  valid_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional()
});
export type AssignProctorRequest = z.infer<typeof AssignProctorRequestSchema>;

export const AssignProctorBulkRequestSchema = z.object({
  proctor_id: z.string().uuid(),
  student_ids: z.array(z.string().uuid()).min(1, 'At least one student must be selected'),
  class_id: z.string().uuid().optional().nullable(),
  valid_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  valid_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  allow_reassignment: z.boolean().default(false).optional()
});
export type AssignProctorBulkRequest = z.infer<typeof AssignProctorBulkRequestSchema>;

export const ReassignProctorRequestSchema = z.object({
  assignment_id: z.string().uuid(),
  target_proctor_id: z.string().uuid()
});
export type ReassignProctorRequest = z.infer<typeof ReassignProctorRequestSchema>;

export interface ProctorAssignmentWithDetails extends ProctorAssignment {
  student_name: string;
  student_email?: string | null;
  student_usn?: string | null;
  proctor_name: string;
  proctor_email?: string | null;
  class_name: string;
  programme?: string | null;
  semester?: number | null;
  specialization_id?: string | null;
  specialization_name?: string | null;
}

/**
 * ==============================================================================
 * Phase 3: Assessment, Question, and Rubric Schemas
 * ==============================================================================
 */

export const RubricLevelSchema = z.object({
  id: z.string().uuid(),
  criterion_id: z.string().uuid(),
  display_order: z.number().int().min(1),
  label: z.string().min(1),
  description: z.string(),
  min_guidance: z.number().nullable().optional(),
  max_guidance: z.number().nullable().optional(),
  created_at: z.string()
});
export type RubricLevel = z.infer<typeof RubricLevelSchema>;

export const RubricCriterionSchema = z.object({
  id: z.string().uuid(),
  rubric_version_id: z.string().uuid(),
  display_order: z.number().int().min(1),
  title: z.string().min(1),
  description: z.string(),
  max_marks: z.number().positive(),
  levels: z.array(RubricLevelSchema).optional().default([]),
  created_at: z.string()
});
export type RubricCriterion = z.infer<typeof RubricCriterionSchema>;

export const RubricVersionSchema = z.object({
  id: z.string().uuid(),
  template_id: z.string().uuid().nullable().optional(),
  question_id: z.string().uuid(),
  version: z.number().int().min(1),
  title: z.string().min(1),
  frozen_at: z.string().nullable().optional(),
  created_by: z.string().uuid(),
  criteria: z.array(RubricCriterionSchema).optional().default([]),
  created_at: z.string()
});
export type RubricVersion = z.infer<typeof RubricVersionSchema>;

export const QuestionSchema = z.object({
  id: z.string().uuid(),
  assessment_id: z.string().uuid(),
  display_order: z.number().int().min(1),
  prompt: z.string().min(1),
  max_marks: z.number().positive(),
  rubric: RubricVersionSchema.nullable().optional(),
  created_at: z.string()
});
export type Question = z.infer<typeof QuestionSchema>;

export const AssessmentSchema = z.object({
  id: z.string().uuid(),
  class_subject_id: z.string().uuid(),
  title: z.string().min(1),
  instructions: z.string(),
  deadline_at: z.string(),
  status: AssessmentStatusSchema,
  created_by: z.string().uuid(),
  published_at: z.string().nullable().optional(),
  published_by: z.string().uuid().nullable().optional(),
  version: z.number().int().min(1),
  questions: z.array(QuestionSchema).optional().default([]),
  // Document-based Assignment fields
  document_storage_key: z.string().nullable().optional(),
  document_filename: z.string().nullable().optional(),
  document_size_bytes: z.number().int().positive().nullable().optional(),
  document_mime_type: z.string().nullable().optional(),
  max_files: z.number().int().min(1).max(10).default(1),
  allow_late: z.boolean().default(false),
  extension_deadline_at: z.string().nullable().optional(),
  late_penalty_mode: z.enum(['none', 'fixed']).default('none'),
  late_penalty_marks: z.number().min(0).default(0),
  max_marks: z.number().positive().default(100),
  created_at: z.string(),
  updated_at: z.string()
});
export type Assessment = z.infer<typeof AssessmentSchema>;

/**
 * Assessment Request DTOs
 */
export const CreateAssessmentRequestSchema = z.object({
  class_subject_id: z.string().uuid(),
  title: z.string().min(3, 'Title must be at least 3 characters').max(200),
  instructions: z.string().min(5, 'Instructions must be at least 5 characters'),
  deadline_at: z.string().refine(val => !isNaN(Date.parse(val)), {
    message: 'Valid ISO timestamp required'
  }),
  // Optional document-based assignment creation fields
  document_storage_key: z.string().nullable().optional(),
  document_filename: z.string().nullable().optional(),
  document_size_bytes: z.number().int().positive().nullable().optional(),
  document_mime_type: z.string().nullable().optional(),
  document_base64: z.string().optional(),
  max_files: z.number().int().min(1).max(10).default(1).optional(),
  allow_late: z.boolean().default(false).optional(),
  extension_deadline_at: z.string().nullable().optional(),
  late_penalty_mode: z.enum(['none', 'fixed']).default('none').optional(),
  late_penalty_marks: z.number().min(0).default(0).optional(),
  max_marks: z.number().positive().default(100).optional()
}).refine(data => {
  if (data.allow_late && data.extension_deadline_at) {
    const ext = new Date(data.extension_deadline_at).getTime();
    const orig = new Date(data.deadline_at).getTime();
    return ext > orig;
  }
  return true;
}, {
  message: 'Extension deadline must be later than the original deadline',
  path: ['extension_deadline_at']
}).refine(data => {
  const max = data.max_marks || 100;
  const penalty = data.late_penalty_marks || 0;
  return penalty <= max;
}, {
  message: 'Late penalty marks cannot exceed maximum assessment marks',
  path: ['late_penalty_marks']
});
export type CreateAssessmentRequest = z.infer<typeof CreateAssessmentRequestSchema>;

export const UpdateAssessmentRequestSchema = z.object({
  title: z.string().min(3).max(200).optional(),
  instructions: z.string().min(5).optional(),
  deadline_at: z.string().refine(val => !isNaN(Date.parse(val)), {
    message: 'Valid ISO timestamp required'
  }).optional(),
  document_storage_key: z.string().nullable().optional(),
  document_filename: z.string().nullable().optional(),
  document_size_bytes: z.number().int().positive().nullable().optional(),
  document_mime_type: z.string().nullable().optional(),
  document_base64: z.string().optional(),
  max_files: z.number().int().min(1).max(10).optional(),
  allow_late: z.boolean().optional(),
  extension_deadline_at: z.string().nullable().optional(),
  late_penalty_mode: z.enum(['none', 'fixed']).optional(),
  late_penalty_marks: z.number().min(0).optional(),
  max_marks: z.number().positive().optional()
});
export type UpdateAssessmentRequest = z.infer<typeof UpdateAssessmentRequestSchema>;

export const CreateQuestionRequestSchema = z.object({
  display_order: z.number().int().min(1),
  prompt: z.string().min(3, 'Question prompt must be at least 3 characters'),
  max_marks: z.number().positive('Question marks must be positive').max(100)
});
export type CreateQuestionRequest = z.infer<typeof CreateQuestionRequestSchema>;

export const UpdateQuestionRequestSchema = z.object({
  display_order: z.number().int().min(1).optional(),
  prompt: z.string().min(3).optional(),
  max_marks: z.number().positive().max(100).optional()
});
export type UpdateQuestionRequest = z.infer<typeof UpdateQuestionRequestSchema>;

export const SaveRubricLevelDTO = z.object({
  display_order: z.number().int().min(1),
  label: z.string().min(1),
  description: z.string(),
  min_guidance: z.number().nullable().optional(),
  max_guidance: z.number().nullable().optional()
});
export type SaveRubricLevelDTO = z.infer<typeof SaveRubricLevelDTO>;

export const SaveRubricCriterionDTO = z.object({
  display_order: z.number().int().min(1),
  title: z.string().min(2, 'Criterion title must be at least 2 characters'),
  description: z.string(),
  max_marks: z.number().positive('Criterion marks must be positive'),
  levels: z.array(SaveRubricLevelDTO).default([])
});
export type SaveRubricCriterionDTO = z.infer<typeof SaveRubricCriterionDTO>;

export const SaveRubricRequestSchema = z.object({
  title: z.string().min(2, 'Rubric title required'),
  criteria: z.array(SaveRubricCriterionDTO).min(1, 'At least one criterion is required')
});
export type SaveRubricRequest = z.infer<typeof SaveRubricRequestSchema>;

/**
 * ==============================================================================
 * Phase 4: Student Submissions and Private PDF Storage Schemas
 * ==============================================================================
 */

export const SubmissionFileSchema = z.object({
  id: z.string().uuid(),
  storage_key: z.string().min(1),
  original_filename: z.string().min(1),
  file_size_bytes: z.number().int().positive(),
  mime_type: z.string().min(1),
  sha256: z.string().length(64).optional(),
  uploaded_at: z.string()
});
export type SubmissionFile = z.infer<typeof SubmissionFileSchema>;

export const SubmissionVersionSchema = z.object({
  id: z.string().uuid(),
  submission_id: z.string().uuid(),
  version: z.number().int().min(1),
  storage_path: z.string().min(1),
  original_name: z.string().min(1),
  mime_type: z.string().min(1),
  size_bytes: z.number().int().positive(),
  sha256: z.string().length(64, 'SHA-256 must be 64 hexadecimal characters'),
  late_status: z.enum(['on_time', 'late']).default('on_time'),
  files: z.array(SubmissionFileSchema).optional().default([]),
  uploaded_at: z.string(),
  superseded_at: z.string().nullable().optional()
});
export type SubmissionVersion = z.infer<typeof SubmissionVersionSchema>;

export const SubmissionSchema = z.object({
  id: z.string().uuid(),
  assessment_id: z.string().uuid(),
  question_id: z.string().uuid().nullable().optional(),
  student_id: z.string().uuid(),
  active_version_id: z.string().uuid().nullable().optional(),
  status: SubmissionStatusSchema,
  late_status: z.enum(['on_time', 'late']).default('on_time').optional(),
  first_submitted_at: z.string(),
  updated_at: z.string(),
  active_version: SubmissionVersionSchema.nullable().optional(),
  versions: z.array(SubmissionVersionSchema).optional()
});
export type Submission = z.infer<typeof SubmissionSchema>;

export const SubmissionReceiptSchema = z.object({
  submission_id: z.string().uuid(),
  version_id: z.string().uuid(),
  version: z.number().int().min(1),
  status: SubmissionStatusSchema,
  late_status: z.enum(['on_time', 'late']).default('on_time').optional(),
  sha256: z.string().length(64),
  size_bytes: z.number().int().positive(),
  file_count: z.number().int().min(1).default(1).optional(),
  files: z.array(SubmissionFileSchema).optional(),
  uploaded_at: z.string(),
  is_resubmission: z.boolean(),
  storage_path: z.string()
});
export type SubmissionReceipt = z.infer<typeof SubmissionReceiptSchema>;

/**
 * ==============================================================================
 * Phase 5: Evaluation, Rubric Scoring, and Result Publication Schemas
 * ==============================================================================
 */

export const EvaluationCriterionScoreSchema = z.object({
  id: z.string().uuid(),
  evaluation_id: z.string().uuid(),
  criterion_id: z.string().uuid(),
  selected_level_id: z.string().uuid().nullable().optional(),
  score: z.number().min(0, 'Score cannot be negative'),
  feedback: z.string().nullable().optional(),
  created_at: z.string()
});
export type EvaluationCriterionScore = z.infer<typeof EvaluationCriterionScoreSchema>;

export const EvaluationSchema = z.object({
  id: z.string().uuid(),
  submission_id: z.string().uuid(),
  submission_version_id: z.string().uuid(),
  evaluator_id: z.string().uuid(),
  status: EvaluationStatusSchema,
  raw_score: z.number().min(0).optional(),
  late_penalty_deducted: z.number().min(0).default(0),
  total_score: z.number().min(0), // final_score
  general_feedback: z.string().nullable().optional(),
  criterion_scores: z.array(EvaluationCriterionScoreSchema).default([]),
  created_at: z.string(),
  updated_at: z.string()
});
export type Evaluation = z.infer<typeof EvaluationSchema>;

export const ResultPublicationSchema = z.object({
  id: z.string().uuid(),
  assessment_id: z.string().uuid(),
  published_by: z.string().uuid(),
  published_at: z.string(),
  remarks: z.string().nullable().optional()
});
export type ResultPublication = z.infer<typeof ResultPublicationSchema>;

export const SaveCriterionScoreDTOSchema = z.object({
  criterion_id: z.string().uuid(),
  selected_level_id: z.string().uuid().nullable().optional(),
  score: z.number().min(0, 'Score cannot be negative'),
  feedback: z.string().nullable().optional()
});
export type SaveCriterionScoreDTO = z.infer<typeof SaveCriterionScoreDTOSchema>;

export const SaveEvaluationRequestSchema = z.object({
  submission_id: z.string().uuid(),
  status: z.enum(['draft', 'completed']),
  raw_score: z.number().min(0).optional(),
  general_feedback: z.string().nullable().optional(),
  criterion_scores: z.array(SaveCriterionScoreDTOSchema).optional().default([])
});
export type SaveEvaluationRequest = z.infer<typeof SaveEvaluationRequestSchema>;

export const PublishAssessmentResultsRequestSchema = z.object({
  remarks: z.string().max(500).nullable().optional()
});
export type PublishAssessmentResultsRequest = z.infer<typeof PublishAssessmentResultsRequestSchema>;

/**
 * ==============================================================================
 * Health Check Contract
 * ==============================================================================
 */
export const HealthResponseSchema = z.object({
  status: z.literal('ok'),
  service: z.string(),
  version: z.string(),
  timestamp: z.string(),
  database_mode: z.enum(['supabase_postgresql', 'in_memory_mock']).optional(),
  is_persistent: z.boolean().optional()
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;

/**
 * ==============================================================================
 * Proctor Mentee Subject-Wise Assessment Monitoring Hierarchy
 * ==============================================================================
 */

export interface MenteeAssessmentItem {
  assessment_id: string;
  title: string;
  instructions?: string;
  deadline_at: string;
  extension_deadline_at?: string | null;
  allow_late: boolean;
  max_marks: number;
  is_submitted: boolean;
  submission_id?: string | null;
  submitted_at?: string | null;
  is_late: boolean;
  timing_status: 'On Time' | 'Late' | '—';
  late_status: string;
  evaluation_status: 'not_submitted' | 'pending' | 'under_evaluation' | 'completed' | 'published';
  evaluation_status_label: 'Pending' | 'Pending Evaluation' | 'Evaluated' | 'Published';
  published_score: number | null;
  files_count?: number;
}

export interface MenteeSubjectItem {
  subject_id: string;
  subject_code: string;
  subject_name: string;
  class_subject_id: string;
  credits?: number;
  specialization_id?: string | null;
  specialization_name?: string | null;
  total_assessments: number;
  submitted_count: number;
  pending_count: number;
  late_count: number;
  evaluated_count: number;
  assessments: MenteeAssessmentItem[];
}

export interface MenteeHierarchyItem {
  student_id: string;
  student_name: string;
  student_email: string;
  student_usn: string;
  programme: string;
  semester: number;
  section: string;
  class_id: string;
  class_name: string;
  specialization_id?: string | null;
  specialization_code?: string | null;
  specialization_name: string;
  subjects_count: number;
  total_assessments: number;
  submitted_count: number;
  pending_count: number;
  late_count: number;
  evaluated_count: number;
  subjects: MenteeSubjectItem[];
}

/**
 * ==============================================================================
 * Proctor Subject-First Assessment Monitoring Hierarchy
 * SUBJECT → ASSESSMENT → ASSIGNED STUDENTS
 * ==============================================================================
 */

export interface ProctorAssessmentStudentItem {
  student_id: string;
  student_name: string;
  student_email: string;
  student_usn: string;
  programme: string;
  semester: number;
  section: string;
  specialization_name: string;
  is_submitted: boolean;
  submission_id?: string | null;
  submitted_at?: string | null;
  is_late: boolean;
  timing_status: 'On Time' | 'Late' | '—';
  late_status: string;
  evaluation_status: 'not_submitted' | 'pending' | 'under_evaluation' | 'completed' | 'published';
  evaluation_status_label: 'Pending' | 'Pending Evaluation' | 'Evaluated' | 'Published';
  published_score: number | null;
  files_count?: number;
}

export interface ProctorSubjectAssessmentItem {
  assessment_id: string;
  title: string;
  instructions?: string;
  deadline_at: string;
  extension_deadline_at?: string | null;
  allow_late: boolean;
  max_marks: number;
  total_mentees: number;
  submitted_count: number;
  pending_count: number;
  students: ProctorAssessmentStudentItem[];
}

export interface ProctorSubjectHierarchyItem {
  subject_id: string;
  subject_code: string;
  subject_name: string;
  class_subject_id: string;
  credits?: number;
  total_assessments: number;
  assessments: ProctorSubjectAssessmentItem[];
}



