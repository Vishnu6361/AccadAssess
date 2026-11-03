-- ==============================================================================
-- Migration: 20261022000011_pdf_assignments_multifile_late_policy.sql
-- Description: Adds document-based assignment metadata, multi-file submissions,
--              configurable late submission policy, and direct score fields.
-- ==============================================================================

-- 1. Extend Assessments table for document-based workflows and late submission policies
alter table if exists public.assessments 
  add column if not exists document_storage_key text null,
  add column if not exists document_filename text null,
  add column if not exists document_size_bytes bigint null,
  add column if not exists document_mime_type text null,
  add column if not exists max_files integer not null default 1,
  add column if not exists allow_late boolean not null default false,
  add column if not exists extension_deadline_at timestamptz null,
  add column if not exists late_penalty_mode text not null default 'none',
  add column if not exists late_penalty_marks numeric(6,2) not null default 0,
  add column if not exists max_marks numeric(6,2) not null default 100;

-- 2. Extend Submissions table to make question_id nullable for document-level assessments
alter table if exists public.submissions 
  alter column question_id drop not null;

alter table if exists public.submissions
  add column if not exists late_status text not null default 'on_time';

-- 3. Extend Submission Versions for multi-file support and late status tracking
alter table if exists public.submission_versions
  add column if not exists files jsonb null,
  add column if not exists late_status text not null default 'on_time';

-- 4. Extend Evaluations table for raw scores, late penalties, and final scores
create table if not exists public.evaluations (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions(id) on delete cascade,
  submission_version_id uuid not null,
  evaluator_id uuid not null references public.profiles(id) on delete restrict,
  status text not null default 'draft',
  raw_score numeric(6,2) null,
  late_penalty_deducted numeric(6,2) not null default 0,
  total_score numeric(6,2) not null default 0,
  general_feedback text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Ensure columns exist even if evaluations table already existed
alter table if exists public.evaluations
  add column if not exists raw_score numeric(6,2) null,
  add column if not exists late_penalty_deducted numeric(6,2) not null default 0,
  add column if not exists total_score numeric(6,2) not null default 0;

create table if not exists public.evaluation_criterion_scores (
  id uuid primary key default gen_random_uuid(),
  evaluation_id uuid not null references public.evaluations(id) on delete cascade,
  criterion_id uuid not null,
  selected_level_id uuid null,
  score numeric(6,2) not null default 0,
  feedback text null,
  created_at timestamptz not null default now()
);

create table if not exists public.result_publications (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  published_by uuid not null references public.profiles(id) on delete restrict,
  published_at timestamptz not null default now(),
  remarks text null
);

-- 5. Extend Storage Bucket limits and MIME types for PDF assignments and PPT/PPTX answers
update storage.buckets
set 
  file_size_limit = 26214400, -- 25 MB max total
  allowed_mime_types = array[
    'application/pdf',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ]
where id = 'submissions-private';
