-- ==============================================================================
-- Migration: 20261027000014_faculty_academic_allocations.sql
-- Description: Dynamic Faculty Academic Allocations (Programme, Specialization, Semester)
-- Decouples academic allocations from subject teaching assignments and roles.
-- ==============================================================================

create table if not exists public.faculty_allocations (
  id uuid primary key default gen_random_uuid(),
  faculty_id uuid not null references public.profiles(id) on delete cascade,
  programme_id uuid not null references public.programmes(id) on delete cascade,
  specialization_id uuid null references public.specializations(id) on delete cascade,
  semester integer null check (semester is null or (semester > 0 and semester <= 12)),
  assigned_by uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Indexes for performance
create index if not exists idx_faculty_allocations_faculty on public.faculty_allocations(faculty_id);
create index if not exists idx_faculty_allocations_prog_spec on public.faculty_allocations(programme_id, specialization_id, semester);

-- Unique constraint ensuring no duplicate allocations per faculty member
create unique index if not exists uq_faculty_allocation_exact 
  on public.faculty_allocations(
    faculty_id, 
    programme_id, 
    coalesce(specialization_id, '00000000-0000-0000-0000-000000000000'::uuid), 
    coalesce(semester, 0)
  );

-- Row-level security
alter table public.faculty_allocations enable row level security;

create policy "Authenticated users can read faculty allocations"
  on public.faculty_allocations for select to authenticated 
  using (true);

create policy "HOD can manage faculty allocations"
  on public.faculty_allocations for all to authenticated 
  using (public.is_hod(auth.uid()))
  with check (public.is_hod(auth.uid()));

grant select, insert, update, delete on public.faculty_allocations to authenticated;
grant select, insert, update, delete on public.faculty_allocations to service_role;
