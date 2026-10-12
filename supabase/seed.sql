-- ==============================================================================
-- SmartFA Synthetic Development Seed Data
-- ==============================================================================

-- 1. Department
insert into public.departments (id, code, name)
values ('d1000000-0000-0000-0000-000000000001', 'MCA', 'Department of Computer Applications')
on conflict (code) do nothing;

-- 2. Academic Term
insert into public.academic_terms (id, name, starts_on, ends_on, active)
values ('t1000000-0000-0000-0000-000000000001', 'Autumn 2026', '2026-08-01', '2026-12-31', true)
on conflict do nothing;

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

-- 4. User Roles
-- HOD Role
insert into public.user_roles (user_id, role, scope_id, active)
values ('a1000000-0000-0000-0000-000000000001', 'hod', 'd1000000-0000-0000-0000-000000000001', true)
on conflict do nothing;

-- Teacher 1: Subject Teacher
insert into public.user_roles (user_id, role, scope_id, active)
values ('a2000000-0000-0000-0000-000000000001', 'subject_teacher', 'd1000000-0000-0000-0000-000000000001', true)
on conflict do nothing;

-- Teacher 2: Class Teacher & Subject Teacher
insert into public.user_roles (user_id, role, scope_id, active)
values 
  ('a2000000-0000-0000-0000-000000000002', 'class_teacher', 'd1000000-0000-0000-0000-000000000001', true),
  ('a2000000-0000-0000-0000-000000000002', 'subject_teacher', 'd1000000-0000-0000-0000-000000000001', true)
on conflict do nothing;

-- Proctor Role
insert into public.user_roles (user_id, role, scope_id, active)
values ('a3000000-0000-0000-0000-000000000001', 'proctor', 'd1000000-0000-0000-0000-000000000001', true)
on conflict do nothing;

-- Student Roles
insert into public.user_roles (user_id, role, scope_id, active)
values 
  ('a4000000-0000-0000-0000-000000000001', 'student', null, true),
  ('a4000000-0000-0000-0000-000000000002', 'student', null, true)
on conflict do nothing;

-- 5. Class (MCA Semester 3 Section A)
insert into public.classes (id, department_id, term_id, programme, semester, section, class_teacher_id)
values ('c1000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', 't1000000-0000-0000-0000-000000000001', 'MCA', 3, 'A', 'a2000000-0000-0000-0000-000000000002')
on conflict do nothing;

-- 6. Subjects
insert into public.subjects (id, department_id, code, name, credits)
values 
  ('s1000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', 'MCA301', 'Analysis and Design of Algorithms', 4),
  ('s1000000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000001', 'MCA302', 'Cloud Computing & Distributed Systems', 3)
on conflict do nothing;

-- 7. Class Subjects (Assign Subjects to Class and Subject Teacher)
insert into public.class_subjects (id, class_id, subject_id, subject_teacher_id, active)
values 
  ('cs100000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 's1000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000001', true),
  ('cs100000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000001', 's1000000-0000-0000-0000-000000000002', 'a2000000-0000-0000-0000-000000000002', true)
on conflict do nothing;

-- 8. Student Enrollments
insert into public.enrollments (class_id, student_id, roll_number, status)
values 
  ('c1000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001', '01', 'active'),
  ('c1000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000002', '02', 'active')
on conflict do nothing;

-- 9. Proctor Assignments
insert into public.proctor_assignments (class_id, student_id, proctor_id, assigned_by)
values 
  ('c1000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000002'),
  ('c1000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000002', 'a3000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000002')
on conflict do nothing;

-- 10. Initial Audit Event
insert into public.audit_events (actor_id, action, resource_type, resource_id, after)
values (
  'a1000000-0000-0000-0000-000000000001', 
  'SEED_INITIAL_DEPARTMENT', 
  'departments', 
  'd1000000-0000-0000-0000-000000000001', 
  '{"department": "MCA", "note": "Initial synthetic department structure created"}'::jsonb
);
