import { 
  AppRole, 
  Profile, 
  UserRole, 
  Department, 
  AcademicTerm, 
  Class, 
  Subject, 
  ClassSubject, 
  AuditEvent,
  Assessment,
  Question,
  RubricVersion,
  RubricCriterion,
  RubricLevel,
  Submission,
  SubmissionVersion
} from '@smartfa/contracts';
import { supabaseAdmin } from '../auth/jwt.js';

/**
 * In-memory fallback database pre-seeded with synthetic development fixtures
 * from supabase/seed.sql for offline testing and local verification.
 */
class InMemoryDatabase {
  departments: Department[] = [
    {
      id: 'd1000000-0000-0000-0000-000000000001',
      code: 'MCA',
      name: 'Department of Computer Applications',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }
  ];

  terms: AcademicTerm[] = [
    {
      id: 't1000000-0000-0000-0000-000000000001',
      name: 'Autumn 2026',
      starts_on: '2026-08-01',
      ends_on: '2026-12-31',
      active: true,
      created_at: new Date().toISOString()
    }
  ];

  profiles: Profile[] = [
    {
      id: 'a1000000-0000-0000-0000-000000000001',
      full_name: 'Dr. Rajesh Sharma (HOD)',
      email: 'hod@smartfa.edu',
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: 'a2000000-0000-0000-0000-000000000001',
      full_name: 'Prof. Priya Menon',
      email: 'teacher1@smartfa.edu',
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: 'a2000000-0000-0000-0000-000000000002',
      full_name: 'Prof. Arvind Kumar',
      email: 'teacher2@smartfa.edu',
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: 'a3000000-0000-0000-0000-000000000001',
      full_name: 'Dr. Suma Rao',
      email: 'proctor@smartfa.edu',
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: 'a4000000-0000-0000-0000-000000000001',
      full_name: 'Aarav Patel',
      email: 'student.a@smartfa.edu',
      usn: '1RV24MC001',
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: 'a4000000-0000-0000-0000-000000000002',
      full_name: 'Bhavna Reddy',
      email: 'student.b@smartfa.edu',
      usn: '1RV24MC002',
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: 'a4000000-0000-0000-0000-000000000003',
      full_name: 'Chetan Varma (Unenrolled)',
      email: 'student.c@smartfa.edu',
      usn: '1RV24MC003',
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: 'a9000000-0000-0000-0000-000000000001',
      full_name: 'Inactive Student',
      email: 'inactive@smartfa.edu',
      usn: '1RV24MC099',
      status: 'inactive',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }
  ];

  roles: UserRole[] = [
    {
      id: 'r1000000-0000-0000-0000-000000000001',
      user_id: 'a1000000-0000-0000-0000-000000000001',
      role: 'hod',
      scope_id: 'd1000000-0000-0000-0000-000000000001',
      active: true,
      created_at: new Date().toISOString()
    },
    {
      id: 'r2000000-0000-0000-0000-000000000001',
      user_id: 'a2000000-0000-0000-0000-000000000001',
      role: 'subject_teacher',
      scope_id: 'd1000000-0000-0000-0000-000000000001',
      active: true,
      created_at: new Date().toISOString()
    },
    {
      id: 'r2000000-0000-0000-0000-000000000002',
      user_id: 'a2000000-0000-0000-0000-000000000002',
      role: 'class_teacher',
      scope_id: 'd1000000-0000-0000-0000-000000000001',
      active: true,
      created_at: new Date().toISOString()
    },
    {
      id: 'r2000000-0000-0000-0000-000000000003',
      user_id: 'a2000000-0000-0000-0000-000000000002',
      role: 'subject_teacher',
      scope_id: 'd1000000-0000-0000-0000-000000000001',
      active: true,
      created_at: new Date().toISOString()
    },
    {
      id: 'r3000000-0000-0000-0000-000000000001',
      user_id: 'a3000000-0000-0000-0000-000000000001',
      role: 'proctor',
      scope_id: 'd1000000-0000-0000-0000-000000000001',
      active: true,
      created_at: new Date().toISOString()
    },
    {
      id: 'r4000000-0000-0000-0000-000000000001',
      user_id: 'a4000000-0000-0000-0000-000000000001',
      role: 'student',
      active: true,
      created_at: new Date().toISOString()
    },
    {
      id: 'r4000000-0000-0000-0000-000000000002',
      user_id: 'a4000000-0000-0000-0000-000000000002',
      role: 'student',
      active: true,
      created_at: new Date().toISOString()
    },
    {
      id: 'r4000000-0000-0000-0000-000000000003',
      user_id: 'a4000000-0000-0000-0000-000000000003',
      role: 'student',
      active: true,
      created_at: new Date().toISOString()
    }
  ];

  classes: Class[] = [
    {
      id: 'c1000000-0000-0000-0000-000000000001',
      department_id: 'd1000000-0000-0000-0000-000000000001',
      term_id: 't1000000-0000-0000-0000-000000000001',
      programme: 'MCA',
      semester: 3,
      section: 'A',
      class_teacher_id: 'a2000000-0000-0000-0000-000000000002',
      created_at: new Date().toISOString()
    }
  ];

  subjects: Subject[] = [
    {
      id: 's1000000-0000-0000-0000-000000000001',
      department_id: 'd1000000-0000-0000-0000-000000000001',
      code: 'MCA301',
      name: 'Analysis and Design of Algorithms',
      credits: 4,
      created_at: new Date().toISOString()
    },
    {
      id: 's1000000-0000-0000-0000-000000000002',
      department_id: 'd1000000-0000-0000-0000-000000000001',
      code: 'MCA302',
      name: 'Cloud Computing & Distributed Systems',
      credits: 3,
      created_at: new Date().toISOString()
    }
  ];

  classSubjects: ClassSubject[] = [
    {
      id: 'c5100000-0000-0000-0000-000000000001',
      class_id: 'c1000000-0000-0000-0000-000000000001',
      subject_id: 's1000000-0000-0000-0000-000000000001',
      subject_teacher_id: 'a2000000-0000-0000-0000-000000000001',
      active: true,
      created_at: new Date().toISOString()
    },
    {
      id: 'c5100000-0000-0000-0000-000000000002',
      class_id: 'c1000000-0000-0000-0000-000000000001',
      subject_id: 's1000000-0000-0000-0000-000000000002',
      subject_teacher_id: 'a2000000-0000-0000-0000-000000000002',
      active: true,
      created_at: new Date().toISOString()
    }
  ];

  enrollments = [
    {
      id: 'e1000000-0000-0000-0000-000000000001',
      class_id: 'c1000000-0000-0000-0000-000000000001',
      student_id: 'a4000000-0000-0000-0000-000000000001',
      roll_number: '01',
      status: 'active'
    },
    {
      id: 'e1000000-0000-0000-0000-000000000002',
      class_id: 'c1000000-0000-0000-0000-000000000001',
      student_id: 'a4000000-0000-0000-0000-000000000002',
      roll_number: '02',
      status: 'active'
    }
  ];

  assessments: Assessment[] = [];
  questions: Question[] = [];
  rubricVersions: RubricVersion[] = [];
  rubricCriteria: RubricCriterion[] = [];
  rubricLevels: RubricLevel[] = [];
  submissions: Submission[] = [];
  submissionVersions: SubmissionVersion[] = [];
  storageBlobs: Map<string, Buffer> = new Map();

  auditEvents: AuditEvent[] = [
    {
      id: 'ae100000-0000-0000-0000-000000000001',
      actor_id: 'a1000000-0000-0000-0000-000000000001',
      action: 'SYSTEM_INITIALIZED',
      resource_type: 'system',
      resource_id: 'phase_2_baseline',
      before: null,
      after: { note: 'Initial academic baseline seeded' },
      correlation_id: 'c0000000-0000-0000-0000-000000000001',
      created_at: new Date().toISOString()
    }
  ];
}

export const db = new InMemoryDatabase();
