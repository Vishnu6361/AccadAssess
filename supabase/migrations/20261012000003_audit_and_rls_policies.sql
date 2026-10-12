-- ==============================================================================
-- Migration: 20261012000003_audit_and_rls_policies.sql
-- Description: Helper functions, triggers, and comprehensive RLS policies.
-- Specification: 05_Backend_Schema_Supabase_Formative_Assessment.pdf (Section 8)
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- Helper Security Functions (SECURITY DEFINER to avoid recursive RLS checks)
-- ------------------------------------------------------------------------------

-- 1. Check if user has an active specific role
create or replace function public.has_role(p_user_id uuid, p_role public.app_role)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.user_roles ur
    inner join public.profiles p on p.id = ur.user_id
    where ur.user_id = p_user_id
      and ur.role = p_role
      and ur.active = true
      and p.status = 'active'
  );
$$;

-- 2. Check if user is HOD
create or replace function public.is_hod(p_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.has_role(p_user_id, 'hod'::public.app_role);
$$;

-- 3. Check if user is active
create or replace function public.is_active_user(p_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.profiles
    where id = p_user_id
      and status = 'active'
  );
$$;

-- ------------------------------------------------------------------------------
-- Enable Row-Level Security on all identity and academic tables
-- ------------------------------------------------------------------------------
alter table public.departments enable row level security;
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.academic_terms enable row level security;
alter table public.classes enable row level security;
alter table public.subjects enable row level security;
alter table public.class_subjects enable row level security;
alter table public.enrollments enable row level security;
alter table public.proctor_assignments enable row level security;
alter table public.audit_events enable row level security;

-- ------------------------------------------------------------------------------
-- Policies: departments
-- ------------------------------------------------------------------------------
create policy "Active users can view departments"
  on public.departments for select
  to authenticated
  using (public.is_active_user(auth.uid()));

create policy "HOD can manage departments"
  on public.departments for all
  to authenticated
  using (public.is_hod(auth.uid()))
  with check (public.is_hod(auth.uid()));

-- ------------------------------------------------------------------------------
-- Policies: profiles
-- ------------------------------------------------------------------------------
create policy "Users can view own profile"
  on public.profiles for select
  to authenticated
  using (id = auth.uid());

create policy "HOD can view all department profiles"
  on public.profiles for select
  to authenticated
  using (public.is_hod(auth.uid()));

create policy "Teachers can view assigned students"
  on public.profiles for select
  to authenticated
  using (
    exists (
      select 1 from public.class_subjects cs
      inner join public.enrollments e on e.class_id = cs.class_id
      where cs.subject_teacher_id = auth.uid()
        and e.student_id = public.profiles.id
        and cs.active = true
    )
    or
    exists (
      select 1 from public.classes c
      inner join public.enrollments e on e.class_id = c.id
      where c.class_teacher_id = auth.uid()
        and e.student_id = public.profiles.id
    )
    or
    exists (
      select 1 from public.proctor_assignments pa
      where pa.proctor_id = auth.uid()
        and pa.student_id = public.profiles.id
    )
  );

create policy "Users can update own permitted profile fields"
  on public.profiles for update
  to authenticated
  using (id = auth.uid() and public.is_active_user(auth.uid()))
  with check (
    id = auth.uid()
    and status = (select status from public.profiles where id = auth.uid()) -- Cannot self-change status
    and (usn is not distinct from (select usn from public.profiles where id = auth.uid())) -- Cannot alter USN
  );

create policy "HOD can update user status and profile fields"
  on public.profiles for update
  to authenticated
  using (public.is_hod(auth.uid()))
  with check (public.is_hod(auth.uid()));

-- ------------------------------------------------------------------------------
-- Policies: user_roles (CRITICAL: Users CANNOT self-write or escalate roles)
-- ------------------------------------------------------------------------------
create policy "Users can view own active roles"
  on public.user_roles for select
  to authenticated
  using (user_id = auth.uid());

create policy "HOD can view all roles"
  on public.user_roles for select
  to authenticated
  using (public.is_hod(auth.uid()));

create policy "HOD can assign or revoke roles"
  on public.user_roles for insert
  to authenticated
  with check (
    public.is_hod(auth.uid()) 
    and user_id <> auth.uid() -- HOD cannot self-promote or alter own role permissions
    and role <> 'hod'::public.app_role -- HOD cannot delegate HOD role directly; requires trusted institutional admin
    and (
      scope_id is null 
      or exists (
        select 1 from public.user_roles hod_r
        where hod_r.user_id = auth.uid()
          and hod_r.role = 'hod'
          and hod_r.active = true
          and (hod_r.scope_id is null or hod_r.scope_id = public.user_roles.scope_id)
      )
    )
  );

create policy "HOD can update roles"
  on public.user_roles for update
  to authenticated
  using (
    public.is_hod(auth.uid()) 
    and user_id <> auth.uid()
    and role <> 'hod'::public.app_role
  )
  with check (
    public.is_hod(auth.uid()) 
    and user_id <> auth.uid()
    and role <> 'hod'::public.app_role
  );

create policy "HOD can delete roles"
  on public.user_roles for delete
  to authenticated
  using (
    public.is_hod(auth.uid()) 
    and user_id <> auth.uid()
    and role <> 'hod'::public.app_role
  );

-- ------------------------------------------------------------------------------
-- Policies: academic_terms
-- ------------------------------------------------------------------------------
create policy "Active users can view academic terms"
  on public.academic_terms for select
  to authenticated
  using (public.is_active_user(auth.uid()));

create policy "HOD can manage academic terms"
  on public.academic_terms for all
  to authenticated
  using (public.is_hod(auth.uid()))
  with check (public.is_hod(auth.uid()));

-- ------------------------------------------------------------------------------
-- Policies: classes
-- ------------------------------------------------------------------------------
create policy "Active users can view classes"
  on public.classes for select
  to authenticated
  using (public.is_active_user(auth.uid()));

create policy "HOD can manage classes"
  on public.classes for all
  to authenticated
  using (public.is_hod(auth.uid()))
  with check (public.is_hod(auth.uid()));

-- ------------------------------------------------------------------------------
-- Policies: subjects
-- ------------------------------------------------------------------------------
create policy "Active users can view subjects"
  on public.subjects for select
  to authenticated
  using (public.is_active_user(auth.uid()));

create policy "HOD can manage subjects"
  on public.subjects for all
  to authenticated
  using (public.is_hod(auth.uid()))
  with check (public.is_hod(auth.uid()));

-- ------------------------------------------------------------------------------
-- Policies: class_subjects
-- ------------------------------------------------------------------------------
create policy "Active users can view class subjects"
  on public.class_subjects for select
  to authenticated
  using (public.is_active_user(auth.uid()));

create policy "HOD can manage class subjects"
  on public.class_subjects for all
  to authenticated
  using (public.is_hod(auth.uid()))
  with check (public.is_hod(auth.uid()));

-- ------------------------------------------------------------------------------
-- Policies: enrollments
-- ------------------------------------------------------------------------------
create policy "Students can view own enrollment"
  on public.enrollments for select
  to authenticated
  using (student_id = auth.uid());

create policy "Class teacher and proctor can view enrollments"
  on public.enrollments for select
  to authenticated
  using (
    exists (
      select 1 from public.classes c
      where c.id = public.enrollments.class_id
        and c.class_teacher_id = auth.uid()
    )
    or
    exists (
      select 1 from public.proctor_assignments pa
      where pa.class_id = public.enrollments.class_id
        and pa.student_id = public.enrollments.student_id
        and pa.proctor_id = auth.uid()
    )
  );

create policy "HOD can manage enrollments"
  on public.enrollments for all
  to authenticated
  using (public.is_hod(auth.uid()))
  with check (public.is_hod(auth.uid()));

-- ------------------------------------------------------------------------------
-- Policies: proctor_assignments
-- ------------------------------------------------------------------------------
create policy "Students can view own proctor"
  on public.proctor_assignments for select
  to authenticated
  using (student_id = auth.uid());

create policy "Proctors can view assigned students"
  on public.proctor_assignments for select
  to authenticated
  using (proctor_id = auth.uid());

create policy "Class teacher and HOD can manage proctor assignments"
  on public.proctor_assignments for all
  to authenticated
  using (
    public.is_hod(auth.uid())
    or exists (
      select 1 from public.classes c
      where c.id = public.proctor_assignments.class_id
        and c.class_teacher_id = auth.uid()
    )
  )
  with check (
    public.is_hod(auth.uid())
    or exists (
      select 1 from public.classes c
      where c.id = public.proctor_assignments.class_id
        and c.class_teacher_id = auth.uid()
    )
  );

-- ------------------------------------------------------------------------------
-- Policies: audit_events (APPEND-ONLY. Strictly NO UPDATE OR DELETE)
-- ------------------------------------------------------------------------------
create policy "HOD can view audit events"
  on public.audit_events for select
  to authenticated
  using (public.is_hod(auth.uid()));

create policy "Authorized staff can record audit events"
  on public.audit_events for insert
  to authenticated
  with check (
    actor_id = auth.uid()
    and (
      public.is_hod(auth.uid())
      or public.has_role(auth.uid(), 'subject_teacher'::public.app_role)
      or public.has_role(auth.uid(), 'class_teacher'::public.app_role)
      or public.has_role(auth.uid(), 'proctor'::public.app_role)
    )
  );

-- Prohibit any update or deletion on audit_events
-- (No update/delete policy defined = default deny in PostgreSQL RLS)
