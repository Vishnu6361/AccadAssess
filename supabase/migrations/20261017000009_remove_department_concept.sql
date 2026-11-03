-- ==============================================================================
-- Migration: 20261017000009_remove_department_concept.sql
-- Description: Complete removal of Department concept from AcadAssess schema.
-- Hierarchy: Programme -> Specialization -> Semester -> Subject
-- Safety: Preserves existing records; alters foreign keys, indexes, and constraints.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Ensure Programmes & Specializations Tables Exist
-- ------------------------------------------------------------------------------
create table if not exists public.programmes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  duration_years integer not null default 2 check (duration_years > 0 and duration_years <= 6),
  total_semesters integer not null default 4 check (total_semesters > 0 and total_semesters <= 12),
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_programmes_code on public.programmes(code);

create table if not exists public.specializations (
  id uuid primary key default gen_random_uuid(),
  programme_id uuid not null references public.programmes(id) on delete cascade,
  code text not null,
  name text not null,
  applicable_semesters integer[] not null default '{3,4}',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_specialization_prog_code unique (programme_id, code)
);

create index if not exists idx_specializations_prog on public.specializations(programme_id, active);

-- ------------------------------------------------------------------------------
-- 2. Update Subjects: Remove department_id and enforce Programme-based structure
-- ------------------------------------------------------------------------------
-- Ensure programme, specialization, and semester columns exist on subjects
alter table public.subjects 
  add column if not exists programme_id uuid null references public.programmes(id) on delete set null,
  add column if not exists specialization_id uuid null references public.specializations(id) on delete set null,
  add column if not exists semester integer null check (semester is null or (semester > 0 and semester <= 12)),
  add column if not exists active boolean not null default true;

-- Drop department-dependent unique constraint
alter table public.subjects
  drop constraint if exists uq_subject_code_dept;

-- Drop department index
drop index if exists public.idx_subjects_dept;

-- Create global unique constraint on subject code
do $$
begin
  if not exists (
    select 1 from pg_constraint 
    where conname = 'uq_subject_code' 
      and conrelid = 'public.subjects'::regclass
  ) then
    alter table public.subjects add constraint uq_subject_code unique (code);
  end if;
end $$;

-- Drop foreign key and column department_id from subjects
do $$
begin
  -- Drop foreign key constraint if present
  alter table public.subjects drop constraint if exists subjects_department_id_fkey;
  -- Drop column
  if exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'subjects' and column_name = 'department_id'
  ) then
    alter table public.subjects drop column department_id;
  end if;
end $$;

create index if not exists idx_subjects_prog_spec on public.subjects(programme_id, specialization_id, semester);

-- ------------------------------------------------------------------------------
-- 3. Update Subject-to-Specialization Many-to-Many Offerings
-- ------------------------------------------------------------------------------
create table if not exists public.subject_specializations (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references public.subjects(id) on delete cascade,
  specialization_id uuid not null references public.specializations(id) on delete cascade,
  semester integer null check (semester is null or (semester > 0 and semester <= 12)),
  created_at timestamptz not null default now(),
  constraint uq_subject_specialization unique (subject_id, specialization_id)
);

create index if not exists idx_subj_spec_subject on public.subject_specializations(subject_id);
create index if not exists idx_subj_spec_spec on public.subject_specializations(specialization_id);

-- ------------------------------------------------------------------------------
-- 4. Update Classes: Remove department_id and update Batch Unique Constraint
-- ------------------------------------------------------------------------------
alter table public.classes 
  add column if not exists programme_id uuid null references public.programmes(id) on delete set null,
  add column if not exists specialization_id uuid null references public.specializations(id) on delete set null;

-- Drop old batch unique constraint containing department_id
alter table public.classes 
  drop constraint if exists uq_class_batch;

-- Create updated batch unique constraint without department_id
do $$
begin
  if not exists (
    select 1 from pg_constraint 
    where conname = 'uq_class_batch' 
      and conrelid = 'public.classes'::regclass
  ) then
    alter table public.classes add constraint uq_class_batch unique (term_id, programme, semester, section);
  end if;
end $$;

-- Drop department index on classes
drop index if exists public.idx_classes_department;

-- Drop foreign key and column department_id from classes
do $$
begin
  alter table public.classes drop constraint if exists classes_department_id_fkey;
  if exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'classes' and column_name = 'department_id'
  ) then
    alter table public.classes drop column department_id;
  end if;
end $$;

create index if not exists idx_classes_prog_spec on public.classes(programme_id, specialization_id);

-- ------------------------------------------------------------------------------
-- 5. Update Programmes: Remove department_id if present
-- ------------------------------------------------------------------------------
drop index if exists public.idx_programmes_dept;

do $$
begin
  alter table public.programmes drop constraint if exists programmes_department_id_fkey;
  if exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'programmes' and column_name = 'department_id'
  ) then
    alter table public.programmes drop column department_id;
  end if;
end $$;

-- ------------------------------------------------------------------------------
-- 6. Row-Level Security & Policies
-- ------------------------------------------------------------------------------
alter table public.programmes enable row level security;
alter table public.specializations enable row level security;
alter table public.subject_specializations enable row level security;

-- Drop old department policies
drop policy if exists "Active users can view departments" on public.departments;
drop policy if exists "HOD can manage departments" on public.departments;

-- Programme RLS policies
drop policy if exists "Authenticated users can read programmes" on public.programmes;
create policy "Authenticated users can read programmes" 
  on public.programmes for select to authenticated 
  using (true);

drop policy if exists "HOD can manage programmes" on public.programmes;
create policy "HOD can manage programmes" 
  on public.programmes for all to authenticated 
  using (public.is_hod(auth.uid()))
  with check (public.is_hod(auth.uid()));

-- Specialization RLS policies
drop policy if exists "Authenticated users can read specializations" on public.specializations;
create policy "Authenticated users can read specializations" 
  on public.specializations for select to authenticated 
  using (true);

drop policy if exists "HOD can manage specializations" on public.specializations;
create policy "HOD can manage specializations" 
  on public.specializations for all to authenticated 
  using (public.is_hod(auth.uid()))
  with check (public.is_hod(auth.uid()));

-- Subject Specializations RLS policies
drop policy if exists "Authenticated users can read subject_specializations" on public.subject_specializations;
create policy "Authenticated users can read subject_specializations" 
  on public.subject_specializations for select to authenticated 
  using (true);

drop policy if exists "HOD can manage subject_specializations" on public.subject_specializations;
create policy "HOD can manage subject_specializations" 
  on public.subject_specializations for all to authenticated 
  using (public.is_hod(auth.uid()))
  with check (public.is_hod(auth.uid()));

-- ------------------------------------------------------------------------------
-- 7. Grant Privileges
-- ------------------------------------------------------------------------------
grant select, insert, update, delete 
  on public.programmes,
     public.specializations,
     public.subject_specializations
  to authenticated;

grant all privileges 
  on public.programmes,
     public.specializations,
     public.subject_specializations
  to service_role;

-- ------------------------------------------------------------------------------
-- 8. DESTRUCTIVE PRODUCTION STEP: Drop departments table
-- NOTE: In accordance with safety policies, this step is NOT run automatically.
-- It requires explicit authorization. Once authorized, execute:
--
-- drop table if exists public.departments cascade;
-- ------------------------------------------------------------------------------
