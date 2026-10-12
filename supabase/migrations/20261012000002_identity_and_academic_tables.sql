-- ==============================================================================
-- Migration: 20261012000002_identity_and_academic_tables.sql
-- Description: Identity, RBAC, Academic Structure, and Audit Logging tables.
-- Specification: 05_Backend_Schema_Supabase_Formative_Assessment.pdf (Section 3 & 6)
-- ==============================================================================

-- 1. Departments
create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid null,
  code text not null unique,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. User Profiles (Extends Supabase auth.users)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  institution_id uuid null,
  full_name text not null,
  email text not null unique,
  usn text unique null,
  status account_status not null default 'invited',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_profiles_email on public.profiles(email);
create index if not exists idx_profiles_status on public.profiles(status);

-- 3. Scoped User Roles (Users cannot self-write; strictly assigned by HOD or server)
create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  role app_role not null,
  scope_id uuid null, -- e.g. department_id, class_id, or null for institutional global
  assigned_by uuid null references public.profiles(id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint uq_user_role_scope unique (user_id, role, scope_id)
);

create index if not exists idx_user_roles_lookup on public.user_roles(user_id, active);
create index if not exists idx_user_roles_role on public.user_roles(role, scope_id);

-- 4. Academic Terms
create table if not exists public.academic_terms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  starts_on date not null,
  ends_on date not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint ck_academic_term_dates check (ends_on >= starts_on)
);

create index if not exists idx_academic_terms_active on public.academic_terms(active);

-- 5. Classes
create table if not exists public.classes (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments(id) on delete cascade,
  term_id uuid not null references public.academic_terms(id) on delete cascade,
  programme text not null, -- e.g., 'MCA', 'BCA'
  semester integer not null check (semester > 0 and semester <= 12),
  section text not null,
  class_teacher_id uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint uq_class_batch unique (department_id, term_id, programme, semester, section)
);

create index if not exists idx_classes_department on public.classes(department_id, term_id);

-- 6. Subjects
create table if not exists public.subjects (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments(id) on delete cascade,
  code text not null,
  name text not null,
  credits integer not null default 3 check (credits >= 0),
  created_at timestamptz not null default now(),
  constraint uq_subject_code_dept unique (department_id, code)
);

create index if not exists idx_subjects_dept on public.subjects(department_id);

-- 7. Class Subjects (Mapping Subjects to Classes with Assigned Subject Teachers)
create table if not exists public.class_subjects (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  subject_teacher_id uuid not null references public.profiles(id) on delete restrict,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint uq_class_subject unique (class_id, subject_id)
);

create index if not exists idx_class_subjects_teacher on public.class_subjects(subject_teacher_id, active);
create index if not exists idx_class_subjects_class on public.class_subjects(class_id);

-- 8. Student Enrollments
create table if not exists public.enrollments (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  roll_number text null,
  status account_status not null default 'active',
  created_at timestamptz not null default now(),
  constraint uq_enrollment unique (class_id, student_id)
);

create index if not exists idx_enrollments_student on public.enrollments(student_id, status);
create index if not exists idx_enrollments_class on public.enrollments(class_id);

-- 9. Proctor Assignments
create table if not exists public.proctor_assignments (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  proctor_id uuid not null references public.profiles(id) on delete cascade,
  valid_from date not null default current_date,
  valid_to date null,
  assigned_by uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint uq_proctor_assignment unique (class_id, student_id, proctor_id)
);

create index if not exists idx_proctor_assignments_proctor on public.proctor_assignments(proctor_id);
create index if not exists idx_proctor_assignments_student on public.proctor_assignments(student_id);

-- 10. Append-Only Audit Events
create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid null references public.profiles(id) on delete set null,
  action text not null,
  resource_type text not null,
  resource_id text not null,
  before jsonb null,
  after jsonb null,
  correlation_id uuid not null default gen_random_uuid(),
  ip_hash text null,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_events_resource on public.audit_events(resource_type, resource_id, created_at desc);
create index if not exists idx_audit_events_actor on public.audit_events(actor_id, created_at desc);
