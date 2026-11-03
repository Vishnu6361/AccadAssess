-- ==============================================================================
-- SmartFA Synthetic Development Seed Data
-- Aligned with Migrations 01 through 19 (Programmes, Specializations, Enrollments)
-- ==============================================================================

-- 1. Academic Programme (Replaces obsolete departments table)
insert into public.programmes (id, code, name, duration_years, total_semesters, status)
values ('b1000000-0000-4000-8000-000000000001', 'MCA', 'Master of Computer Applications', 2, 4, 'active')
on conflict (code) do update set
  name = excluded.name,
  duration_years = excluded.duration_years,
  total_semesters = excluded.total_semesters,
  status = excluded.status;

-- 2. Specializations under Programme
insert into public.specializations (id, programme_id, code, name, applicable_semesters, active)
values 
  ('c1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 'CYBER', 'Cyber Security', '{3,4}', true),
  ('a1000000-0000-4000-8000-000000000002', 'b1000000-0000-4000-8000-000000000001', 'AIDS', 'Artificial Intelligence & Data Science', '{3,4}', true)
on conflict (programme_id, code) do update set
  name = excluded.name,
  applicable_semesters = excluded.applicable_semesters,
  active = excluded.active;

-- 3. Synthetic User Profiles (UUIDs map to test auth users)
-- HOD
insert into public.profiles (id, full_name, email, status)
values ('a1000000-0000-0000-0000-000000000001', 'Dr. Rajesh Sharma (HOD)', 'hod@smartfa.edu', 'active')
on conflict (id) do nothing;

-- Subject Teacher 1
insert into public.profiles (id, full_name, email, status)
values ('a2000000-0000-0000-0000-000000000001', 'Prof. Priya Menon', 'teacher1@smartfa.edu', 'active')
on conflict (id) do nothing;

-- Class Teacher / Subject Teacher 2
insert into public.profiles (id, full_name, email, status)
values ('a2000000-0000-0000-0000-000000000002', 'Prof. Arvind Kumar', 'teacher2@smartfa.edu', 'active')
on conflict (id) do nothing;

-- Proctor
insert into public.profiles (id, full_name, email, status)
values ('a3000000-0000-0000-0000-000000000001', 'Dr. Suma Rao', 'proctor@smartfa.edu', 'active')
on conflict (id) do nothing;

-- Student A
insert into public.profiles (id, full_name, email, usn, status)
values ('a4000000-0000-0000-0000-000000000001', 'Aarav Patel', 'student.a@smartfa.edu', '1RV24MC001', 'active')
on conflict (id) do nothing;

-- Student B
insert into public.profiles (id, full_name, email, usn, status)
values ('a4000000-0000-0000-0000-000000000002', 'Bhavna Reddy', 'student.b@smartfa.edu', '1RV24MC002', 'active')
on conflict (id) do nothing;

-- Inactive User
insert into public.profiles (id, full_name, email, usn, status)
values ('a9000000-0000-0000-0000-000000000001', 'Inactive Account', 'inactive@smartfa.edu', '1RV24MC099', 'inactive')
on conflict (id) do nothing;

-- 4. User Roles (Scoped to Programme or Global)
-- HOD Role
insert into public.user_roles (user_id, role, scope_id, active)
values ('a1000000-0000-0000-0000-000000000001', 'hod', 'b1000000-0000-4000-8000-000000000001', true)
on conflict do nothing;

-- Teacher 1: Subject Teacher
insert into public.user_roles (user_id, role, scope_id, active)
values ('a2000000-0000-0000-0000-000000000001', 'subject_teacher', 'b1000000-0000-4000-8000-000000000001', true)
on conflict do nothing;

-- Teacher 2: Class Teacher & Subject Teacher
insert into public.user_roles (user_id, role, scope_id, active)
values 
  ('a2000000-0000-0000-0000-000000000002', 'class_teacher', 'b1000000-0000-4000-8000-000000000001', true),
  ('a2000000-0000-0000-0000-000000000002', 'subject_teacher', 'b1000000-0000-4000-8000-000000000001', true)
on conflict do nothing;

-- Proctor Role
insert into public.user_roles (user_id, role, scope_id, active)
values ('a3000000-0000-0000-0000-000000000001', 'proctor', 'b1000000-0000-4000-8000-000000000001', true)
on conflict do nothing;

-- Student Roles
insert into public.user_roles (user_id, role, scope_id, active)
values 
  ('a4000000-0000-0000-0000-000000000001', 'student', null, true),
  ('a4000000-0000-0000-0000-000000000002', 'student', null, true)
on conflict do nothing;

-- 5. Class (MCA Semester 3 Section A - Aligned with Migration 16 without term_id constraint)
insert into public.classes (id, programme_id, programme, semester, section, class_teacher_id)
values ('c1000000-0000-0000-0000-000000000001', 'b1000000-0000-4000-8000-000000000001', 'MCA', 3, 'A', 'a2000000-0000-0000-0000-000000000002')
on conflict do nothing;

-- 6. Subjects (Aligned with Migration 8 & 9 with Programme and Specialization IDs)
insert into public.subjects (id, programme_id, specialization_id, semester, code, name, credits, active)
values 
  ('s1000000-0000-0000-0000-000000000001', 'b1000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001', 3, 'MCA301', 'Analysis and Design of Algorithms', 4, true),
  ('s1000000-0000-0000-0000-000000000002', 'b1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000002', 3, 'MCA302', 'Cloud Computing & Distributed Systems', 3, true)
on conflict (code) do update set
  name = excluded.name,
  credits = excluded.credits,
  semester = excluded.semester,
  programme_id = excluded.programme_id,
  specialization_id = excluded.specialization_id;

-- 7. Subject Specializations (Many-to-Many offerings)
insert into public.subject_specializations (id, subject_id, specialization_id, semester)
values
  ('f1000000-0000-4000-8000-000000000001', 's1000000-0000-0000-0000-000000000001', 'c1000000-0000-4000-8000-000000000001', 3),
  ('f1000000-0000-4000-8000-000000000002', 's1000000-0000-0000-0000-000000000002', 'a1000000-0000-4000-8000-000000000002', 3)
on conflict (subject_id, specialization_id) do nothing;

-- 8. Class Subjects (Assign Subjects to Class and Subject Teacher)
insert into public.class_subjects (id, class_id, subject_id, subject_teacher_id, active)
values 
  ('cs100000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 's1000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000001', true),
  ('cs100000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000001', 's1000000-0000-0000-0000-000000000002', 'a2000000-0000-0000-0000-000000000002', true)
on conflict do nothing;

-- 9. Student Enrollments (Aligned with Migration 17 with student specialization)
insert into public.enrollments (class_id, student_id, roll_number, status, specialization_id)
values 
  ('c1000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001', '01', 'active', 'c1000000-0000-4000-8000-000000000001'),
  ('c1000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000002', '02', 'active', 'a1000000-0000-4000-8000-000000000002')
on conflict do nothing;

-- 10. Proctor Assignments
insert into public.proctor_assignments (class_id, student_id, proctor_id, assigned_by)
values 
  ('c1000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000002'),
  ('c1000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000002', 'a3000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000002')
on conflict do nothing;

-- 11. Initial Audit Event
insert into public.audit_events (actor_id, action, resource_type, resource_id, after)
values (
  'a1000000-0000-0000-0000-000000000001', 
  'SEED_INITIAL_PROGRAMME', 
  'programmes', 
  'b1000000-0000-4000-8000-000000000001', 
  '{"programme": "MCA", "note": "Initial synthetic programme and specialization structure seeded"}'::jsonb
);
