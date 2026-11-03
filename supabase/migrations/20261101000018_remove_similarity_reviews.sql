-- ==============================================================================
-- Migration: 20261101000018_remove_similarity_reviews.sql
-- Description: Complete removal of similarity reviews database artifacts.
-- ==============================================================================

-- 1. Sanitize any submission rows referencing obsolete similarity statuses
update public.submissions
set status = 'ready_for_review',
    updated_at = now()
where status::text = 'similarity_completed';

update public.submissions
set status = 'validation_failed',
    updated_at = now()
where status::text = 'similarity_failed';

-- 2. Drop the obsolete review_status enum type (unused by any table or column)
drop type if exists public.review_status restrict;

