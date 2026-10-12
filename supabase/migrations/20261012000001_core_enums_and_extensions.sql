-- ==============================================================================
-- Migration: 20261012000001_core_enums_and_extensions.sql
-- Description: Core database extensions and authoritative application enums.
-- Specification: 05_Backend_Schema_Supabase_Formative_Assessment.pdf
-- ==============================================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- 1. Application Roles (Five Scoped Roles)
do $$ begin
  create type app_role as enum (
    'student',
    'subject_teacher',
    'class_teacher',
    'proctor',
    'hod'
  );
exception
  when duplicate_object then null;
end $$;

-- 2. Account Status
do $$ begin
  create type account_status as enum (
    'invited',
    'active',
    'inactive'
  );
exception
  when duplicate_object then null;
end $$;

-- 3. Assessment Status
do $$ begin
  create type assessment_status as enum (
    'draft',
    'published',
    'closed',
    'archived'
  );
exception
  when duplicate_object then null;
end $$;

-- 4. Submission Status
do $$ begin
  create type submission_status as enum (
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
  );
exception
  when duplicate_object then null;
end $$;

-- 5. Evaluation Status
do $$ begin
  create type evaluation_status as enum (
    'draft',
    'completed',
    'published',
    'revised'
  );
exception
  when duplicate_object then null;
end $$;

-- 6. Similarity Review Status
do $$ begin
  create type review_status as enum (
    'pending',
    'reviewed_no_concern',
    'reviewed_follow_up',
    'referred'
  );
exception
  when duplicate_object then null;
end $$;
