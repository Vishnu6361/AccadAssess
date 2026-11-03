-- ==============================================================================
-- Migration: 20261016000008_programmes_and_specializations.sql
-- Description: Dynamic Academic Programmes, Specializations, and Subject Offerings.
-- ==============================================================================

-- 1. Academic Programmes
create table if not exists public.programmes (
  id uuid primary key default gen_random_uuid(),
  department_id uuid null references public.departments(id) on delete set null,
  code text not null unique,
  name text not null,
  duration_years integer not null default 2 check (duration_years > 0 and duration_years <= 6),
  total_semesters integer not null default 4 check (total_semesters > 0 and total_semesters <= 12),
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_programmes_dept on public.programmes(department_id);
create index if not exists idx_programmes_code on public.programmes(code);

-- 2. Specializations under Programmes
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

-- 3. Extend Subjects with Programme, Specialization, and Semester metadata
alter table public.subjects 
  add column if not exists programme_id uuid null references public.programmes(id) on delete set null,
  add column if not exists specialization_id uuid null references public.specializations(id) on delete set null,
  add column if not exists semester integer null check (semester is null or (semester > 0 and semester <= 12)),
  add column if not exists active boolean not null default true;

create index if not exists idx_subjects_prog_spec on public.subjects(programme_id, specialization_id, semester);

-- 4. Many-to-Many Subject-to-Specialization Offerings
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

-- 5. Extend Classes with Programme and Specialization Foreign Keys
alter table public.classes 
  add column if not exists programme_id uuid null references public.programmes(id) on delete set null,
  add column if not exists specialization_id uuid null references public.specializations(id) on delete set null;

create index if not exists idx_classes_prog_spec on public.classes(programme_id, specialization_id);

-- 6. Enable Row-Level Security
alter table public.programmes enable row level security;
alter table public.specializations enable row level security;
alter table public.subject_specializations enable row level security;

-- 7. RLS Policies
create policy "Authenticated users can read programmes" 
  on public.programmes for select to authenticated 
  using (true);

create policy "HOD can manage programmes" 
  on public.programmes for all to authenticated 
  using (public.is_hod(auth.uid()))
  with check (public.is_hod(auth.uid()));

create policy "Authenticated users can read specializations" 
  on public.specializations for select to authenticated 
  using (true);

create policy "HOD can manage specializations" 
  on public.specializations for all to authenticated 
  using (public.is_hod(auth.uid()))
  with check (public.is_hod(auth.uid()));

create policy "Authenticated users can read subject_specializations" 
  on public.subject_specializations for select to authenticated 
  using (true);

create policy "HOD can manage subject_specializations" 
  on public.subject_specializations for all to authenticated 
  using (public.is_hod(auth.uid()))
  with check (public.is_hod(auth.uid()));

-- 8. Table Privileges
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
