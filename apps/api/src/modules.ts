/**
 * SmartFA API Module Index
 * Implements authoritative modules per 02_TRD_Formative_Assessment_Web_System.pdf:
 * - auth: Supabase JWT verification
 * - authorization: Scoped RBAC checks (Student, Subject Teacher, Class Teacher, Proctor, HOD)
 * - assessments: Assessment drafting, validation, and publication
 * - rubrics: Rubric criteria, level guidance, and immutable freezing
 * - submissions: Controlled upload initiation and finalization with deadline enforcement
 * - evaluations: Rubric criterion scoring and server-side grade calculation
 * - publication: Atomic result publication and RLS exposure
 * - audit: Append-only audit logging for privileged actions
 */
export const API_MODULES = [
  'auth',
  'authorization',
  'assessments',
  'rubrics',
  'submissions',
  'evaluations',
  'publication',
  'audit'
] as const;
