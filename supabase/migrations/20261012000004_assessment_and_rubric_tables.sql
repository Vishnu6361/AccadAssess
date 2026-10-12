-- ==============================================================================
-- Migration: 20261012000004_assessment_and_rubric_tables.sql
-- Description: Assessment, Question, Rubric, and Criteria tables with RLS.
-- Specification: 05_Backend_Schema_Supabase_Formative_Assessment.pdf (Section 4 & 8)
-- ==============================================================================

-- 1. Assessments
create table if not exists public.assessments (
  id uuid primary key default gen_random_uuid(),
  class_subject_id uuid not null references public.class_subjects(id) on delete cascade,
  title text not null,
  instructions text not null,
  deadline_at timestamptz not null,
  status assessment_status not null default 'draft',
  created_by uuid not null references public.profiles(id) on delete restrict,
  published_at timestamptz null,
  published_by uuid null references public.profiles(id) on delete set null,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ck_assessment_deadline check (deadline_at > created_at or status = 'draft')
);

create index if not exists idx_assessments_lookup 
  on public.assessments(class_subject_id, status, deadline_at);
create index if not exists idx_assessments_creator 
  on public.assessments(created_by);

-- 2. Questions
create table if not exists public.questions (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  display_order integer not null,
  prompt text not null,
  max_marks numeric(6,2) not null check (max_marks > 0),
  created_at timestamptz not null default now(),
  constraint uq_question_order unique (assessment_id, display_order)
);

create index if not exists idx_questions_assessment 
  on public.questions(assessment_id, display_order);

-- 3. Rubric Templates (Reusable across subjects)
create table if not exists public.rubric_templates (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  subject_id uuid null references public.subjects(id) on delete set null,
  name text not null,
  description text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_rubric_templates_owner 
  on public.rubric_templates(owner_id, subject_id);

-- 4. Rubric Versions (Question-level frozen snapshots upon assessment publication)
create table if not exists public.rubric_versions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid null references public.rubric_templates(id) on delete set null,
  question_id uuid not null references public.questions(id) on delete cascade,
  version integer not null default 1,
  title text not null,
  frozen_at timestamptz null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint uq_question_rubric_version unique (question_id, version)
);

create index if not exists idx_rubric_versions_question 
  on public.rubric_versions(question_id, version);

-- 5. Rubric Criteria
create table if not exists public.rubric_criteria (
  id uuid primary key default gen_random_uuid(),
  rubric_version_id uuid not null references public.rubric_versions(id) on delete cascade,
  display_order integer not null,
  title text not null,
  description text not null,
  max_marks numeric(6,2) not null check (max_marks > 0),
  created_at timestamptz not null default now(),
  constraint uq_rubric_criteria_order unique (rubric_version_id, display_order)
);

create index if not exists idx_rubric_criteria_version 
  on public.rubric_criteria(rubric_version_id, display_order);

-- 6. Rubric Levels (Performance guidance, e.g. Excellent, Good, Developing, Insufficient)
create table if not exists public.rubric_levels (
  id uuid primary key default gen_random_uuid(),
  criterion_id uuid not null references public.rubric_criteria(id) on delete cascade,
  display_order integer not null,
  label text not null,
  description text not null,
  min_guidance numeric(6,2) null check (min_guidance is null or min_guidance >= 0),
  max_guidance numeric(6,2) null check (max_guidance is null or max_guidance >= 0),
  created_at timestamptz not null default now(),
  constraint uq_rubric_level_order unique (criterion_id, display_order)
);

create index if not exists idx_rubric_levels_criterion 
  on public.rubric_levels(criterion_id, display_order);

-- ------------------------------------------------------------------------------
-- Enable Row-Level Security
-- ------------------------------------------------------------------------------
alter table public.assessments enable row level security;
alter table public.questions enable row level security;
alter table public.rubric_templates enable row level security;
alter table public.rubric_versions enable row level security;
alter table public.rubric_criteria enable row level security;
alter table public.rubric_levels enable row level security;

-- ------------------------------------------------------------------------------
-- RLS Policies: assessments
-- ------------------------------------------------------------------------------
-- Student: View published assessments for enrolled classes only
create policy "Students can view assigned published assessments"
  on public.assessments for select
  to authenticated
  using (
    status = 'published'
    and exists (
      select 1 from public.class_subjects cs
      inner join public.enrollments e on e.class_id = cs.class_id
      where cs.id = public.assessments.class_subject_id
        and e.student_id = auth.uid()
        and e.status = 'active'
    )
  );

-- Subject Teacher: Manage assigned class_subject assessments
create policy "Assigned teachers can manage their assessments"
  on public.assessments for all
  to authenticated
  using (
    exists (
      select 1 from public.class_subjects cs
      where cs.id = public.assessments.class_subject_id
        and cs.subject_teacher_id = auth.uid()
        and cs.active = true
    )
  )
  with check (
    exists (
      select 1 from public.class_subjects cs
      where cs.id = public.assessments.class_subject_id
        and cs.subject_teacher_id = auth.uid()
        and cs.active = true
    )
  );

-- HOD: Department read/audit access
create policy "HOD can view all department assessments"
  on public.assessments for select
  to authenticated
  using (public.is_hod(auth.uid()));

-- ------------------------------------------------------------------------------
-- RLS Policies: questions
-- ------------------------------------------------------------------------------
create policy "Users can view questions of readable assessments"
  on public.questions for select
  to authenticated
  using (
    exists (
      select 1 from public.assessments a
      where a.id = public.questions.assessment_id
        and (
          (a.status = 'published' and exists (
            select 1 from public.class_subjects cs
            inner join public.enrollments e on e.class_id = cs.class_id
            where cs.id = a.class_subject_id and e.student_id = auth.uid()
          ))
          or exists (
            select 1 from public.class_subjects cs
            where cs.id = a.class_subject_id and cs.subject_teacher_id = auth.uid()
          )
          or public.is_hod(auth.uid())
        )
    )
  );

create policy "Assigned teachers can manage questions on draft assessments"
  on public.questions for all
  to authenticated
  using (
    exists (
      select 1 from public.assessments a
      inner join public.class_subjects cs on cs.id = a.class_subject_id
      where a.id = public.questions.assessment_id
        and cs.subject_teacher_id = auth.uid()
        and a.status = 'draft' -- Immutable once published!
    )
  )
  with check (
    exists (
      select 1 from public.assessments a
      inner join public.class_subjects cs on cs.id = a.class_subject_id
      where a.id = public.questions.assessment_id
        and cs.subject_teacher_id = auth.uid()
        and a.status = 'draft'
    )
  );

-- ------------------------------------------------------------------------------
-- RLS Policies: rubric_templates, rubric_versions, rubric_criteria, rubric_levels
-- ------------------------------------------------------------------------------
create policy "Assigned teachers can manage rubric templates"
  on public.rubric_templates for all
  to authenticated
  using (owner_id = auth.uid() or public.is_hod(auth.uid()))
  with check (owner_id = auth.uid());

create policy "Teachers can read rubric versions"
  on public.rubric_versions for select
  to authenticated
  using (
    created_by = auth.uid()
    or public.is_hod(auth.uid())
    or exists (
      select 1 from public.questions q
      inner join public.assessments a on a.id = q.assessment_id
      inner join public.class_subjects cs on cs.id = a.class_subject_id
      inner join public.enrollments e on e.class_id = cs.class_id
      where q.id = public.rubric_versions.question_id
        and a.status = 'published'
        and e.student_id = auth.uid()
    )
  );

create policy "Teachers can modify rubrics on draft questions only"
  on public.rubric_versions for all
  to authenticated
  using (
    created_by = auth.uid()
    and frozen_at is null -- Published/frozen rubrics are immutable!
  )
  with check (
    created_by = auth.uid()
    and frozen_at is null
  );

create policy "Readable rubric criteria"
  on public.rubric_criteria for select
  to authenticated
  using (
    exists (
      select 1 from public.rubric_versions rv
      where rv.id = public.rubric_criteria.rubric_version_id
    )
  );

create policy "Teachers can modify criteria on unfrozen rubrics"
  on public.rubric_criteria for all
  to authenticated
  using (
    exists (
      select 1 from public.rubric_versions rv
      where rv.id = public.rubric_criteria.rubric_version_id
        and rv.created_by = auth.uid()
        and rv.frozen_at is null
    )
  )
  with check (
    exists (
      select 1 from public.rubric_versions rv
      where rv.id = public.rubric_criteria.rubric_version_id
        and rv.created_by = auth.uid()
        and rv.frozen_at is null
    )
  );

create policy "Readable rubric levels"
  on public.rubric_levels for select
  to authenticated
  using (
    exists (
      select 1 from public.rubric_criteria rc
      where rc.id = public.rubric_levels.criterion_id
    )
  );

create policy "Teachers can modify levels on unfrozen criteria"
  on public.rubric_levels for all
  to authenticated
  using (
    exists (
      select 1 from public.rubric_criteria rc
      inner join public.rubric_versions rv on rv.id = rc.rubric_version_id
      where rc.id = public.rubric_levels.criterion_id
        and rv.created_by = auth.uid()
        and rv.frozen_at is null
    )
  )
  with check (
    exists (
      select 1 from public.rubric_criteria rc
      inner join public.rubric_versions rv on rv.id = rc.rubric_version_id
      where rc.id = public.rubric_levels.criterion_id
        and rv.created_by = auth.uid()
        and rv.frozen_at is null
    )
  );

-- ------------------------------------------------------------------------------
-- Transactional Publication & Rubric Freezing Function
-- Specification 05, Section 8: Publication Workflow & Immutability
-- ------------------------------------------------------------------------------
create or replace function public.publish_assessment(p_assessment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assessment public.assessments%rowtype;
  v_q record;
  v_rv public.rubric_versions%rowtype;
  v_criteria_sum numeric(6,2);
  v_q_count integer := 0;
  v_now timestamptz := now();
begin
  -- 1. Lock the assessment row to prevent concurrent modifications
  select * into v_assessment
  from public.assessments
  where id = p_assessment_id
  for update;

  if not found then
    raise exception 'Assessment not found';
  end if;

  -- 2. Authorization check: must be assigned subject teacher or HOD
  if not (
    public.is_hod(auth.uid()) or exists (
      select 1 from public.class_subjects cs
      where cs.id = v_assessment.class_subject_id
        and cs.subject_teacher_id = auth.uid()
        and cs.active = true
    )
  ) then
    raise exception 'FORBIDDEN: Caller is not authorized to publish this assessment';
  end if;

  -- 3. Status check: must be draft
  if v_assessment.status <> 'draft' then
    raise exception 'ALREADY_PUBLISHED: Cannot publish assessment with status %', v_assessment.status;
  end if;

  -- 4. Deadline check: must be in the future
  if v_assessment.deadline_at <= v_now then
    raise exception 'INVALID_DEADLINE: Assessment deadline must be in the future';
  end if;

  -- 5. Validate questions and rubric sum invariants
  for v_q in (
    select id, display_order, prompt, max_marks
    from public.questions
    where assessment_id = p_assessment_id
    order by display_order
    for update
  ) loop
    v_q_count := v_q_count + 1;

    -- Fetch rubric version
    select * into v_rv
    from public.rubric_versions
    where question_id = v_q.id
    order by version desc
    limit 1
    for update;

    if not found then
      raise exception 'MISSING_RUBRIC: Question % does not have a rubric defined', v_q.display_order;
    end if;

    -- Calculate criteria sum
    select coalesce(sum(max_marks), 0) into v_criteria_sum
    from public.rubric_criteria
    where rubric_version_id = v_rv.id;

    -- Invariant: criteria sum must equal question max marks
    if v_criteria_sum <> v_q.max_marks then
      raise exception 'RUBRIC_TOTAL_MISMATCH: Question % criteria sum (%) does not equal question max marks (%)',
        v_q.display_order, v_criteria_sum, v_q.max_marks;
    end if;
  end loop;

  if v_q_count = 0 then
    raise exception 'EMPTY_ASSESSMENT: Assessment must contain at least one question before publication';
  end if;

  -- 6. Atomically freeze rubric versions
  update public.rubric_versions
  set frozen_at = v_now
  where question_id in (
    select id from public.questions where assessment_id = p_assessment_id
  );

  -- 7. Transition assessment status to published
  update public.assessments
  set status = 'published',
      published_at = v_now,
      published_by = auth.uid(),
      updated_at = v_now
  where id = p_assessment_id;

  -- 8. Record audit log
  insert into public.audit_events (
    actor_id,
    action,
    resource_type,
    resource_id,
    after
  ) values (
    auth.uid(),
    'PUBLISH_ASSESSMENT',
    'assessments',
    p_assessment_id,
    jsonb_build_object('published_at', v_now, 'questions_count', v_q_count)
  );

  return jsonb_build_object(
    'assessment_id', p_assessment_id,
    'status', 'published',
    'published_at', v_now,
    'questions_count', v_q_count
  );
end;
$$;
