-- ==============================================================================
-- Migration: 20261022000013_submission_versions_allow_office_mimes_and_25mb.sql
-- Description: Updates submission_versions constraints to align with 25MB
--              and allowed office MIME types (PPT, PPTX) introduced in Migration 11.
-- ==============================================================================

alter table if exists public.submission_versions
  drop constraint if exists submission_versions_mime_type_check;

alter table if exists public.submission_versions
  add constraint submission_versions_mime_type_check
  check (mime_type in (
    'application/pdf',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'multipart/mixed',
    'application/octet-stream'
  ));

alter table if exists public.submission_versions
  drop constraint if exists submission_versions_size_bytes_check;

alter table if exists public.submission_versions
  add constraint submission_versions_size_bytes_check
  check (size_bytes > 0 and size_bytes <= 26214400); -- 25 MB max
