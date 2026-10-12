import { z } from 'zod';

/**
 * Core Enums from Authoritative Backend Schema (05_Backend_Schema_Supabase_Formative_Assessment.pdf)
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
 * Health Check Contract
 */
export const HealthResponseSchema = z.object({
  status: z.literal('ok'),
  service: z.string(),
  version: z.string(),
  timestamp: z.string()
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;
