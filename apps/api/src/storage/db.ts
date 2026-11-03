import { 
  AppRole, 
  Profile, 
  UserRole, 
  AcademicTerm, 
  Class, 
  Subject, 
  ClassSubject, 
  Programme,
  Specialization,
  SubjectSpecialization,
  AuditEvent,
  Assessment,
  Question,
  RubricVersion,
  RubricCriterion,
  RubricLevel,
  Submission,
  SubmissionVersion,
  Enrollment,
  ProctorAssignment,
  Evaluation,
  EvaluationCriterionScore,
  ResultPublication,
  FacultyAllocation
} from '@smartfa/contracts';
import { supabaseAdmin } from '../auth/jwt.js';

/**
 * In-memory fallback database pre-seeded with synthetic development fixtures
 * from supabase/seed.sql for offline testing and local verification.
 */
export class InMemoryDatabase {
  programmes: Programme[] = [
    {
      id: 'b1000000-0000-4000-8000-000000000001',
      code: 'MCA',
      name: 'Master of Computer Applications',
      duration_years: 2,
      total_semesters: 4,
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }
  ];

  specializations: Specialization[] = [
    {
      id: 'c1000000-0000-4000-8000-000000000001',
      programme_id: 'b1000000-0000-4000-8000-000000000001',
      code: 'CYBER',
      name: 'Cyber Security',
      applicable_semesters: [3, 4],
      active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: 'a1000000-0000-4000-8000-000000000002',
      programme_id: 'b1000000-0000-4000-8000-000000000001',
      code: 'AIDS',
      name: 'Artificial Intelligence & Data Science',
      applicable_semesters: [3, 4],
      active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }
  ];

  subject_specializations: SubjectSpecialization[] = [
    {
      id: 'f1000000-0000-4000-8000-000000000001',
      subject_id: '02000000-0000-4000-8000-000000000001',
      specialization_id: 'c1000000-0000-4000-8000-000000000001',
      semester: 3,
      created_at: new Date().toISOString()
    },
    {
      id: 'f1000000-0000-4000-8000-000000000002',
      subject_id: '02000000-0000-4000-8000-000000000002',
      specialization_id: 'a1000000-0000-4000-8000-000000000002',
      semester: 3,
      created_at: new Date().toISOString()
    }
  ];

  terms: AcademicTerm[] = [
    {
      id: '01000000-0000-4000-8000-000000000001',
      name: 'Academic Term 1',
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
      term_id: '01000000-0000-4000-8000-000000000001',
      programme: 'MCA',
      semester: 3,
      section: null,
      class_teacher_id: 'a2000000-0000-0000-0000-000000000002',
      created_at: new Date().toISOString()
    }
  ];

  subjects: Subject[] = [
    {
      id: '02000000-0000-4000-8000-000000000001',
      programme_id: 'b1000000-0000-4000-8000-000000000001',
      specialization_id: 'c1000000-0000-4000-8000-000000000001',
      semester: 3,
      code: 'MCA301',
      name: 'Analysis and Design of Algorithms',
      credits: 4,
      active: true,
      created_at: new Date().toISOString()
    },
    {
      id: '02000000-0000-4000-8000-000000000002',
      programme_id: 'b1000000-0000-4000-8000-000000000001',
      specialization_id: 'a1000000-0000-4000-8000-000000000002',
      semester: 3,
      code: 'MCA302',
      name: 'Cloud Computing & Distributed Systems',
      credits: 3,
      active: true,
      created_at: new Date().toISOString()
    }
  ];

  classSubjects: ClassSubject[] = [
    {
      id: 'c5100000-0000-0000-0000-000000000001',
      class_id: 'c1000000-0000-0000-0000-000000000001',
      subject_id: '02000000-0000-4000-8000-000000000001',
      subject_teacher_id: 'a2000000-0000-0000-0000-000000000001',
      active: true,
      created_at: new Date().toISOString()
    },
    {
      id: 'c5100000-0000-0000-0000-000000000002',
      class_id: 'c1000000-0000-0000-0000-000000000001',
      subject_id: '02000000-0000-4000-8000-000000000002',
      subject_teacher_id: 'a2000000-0000-0000-0000-000000000002',
      active: true,
      created_at: new Date().toISOString()
    }
  ];

  enrollments: Enrollment[] = [
    {
      id: 'e1000000-0000-0000-0000-000000000001',
      class_id: 'c1000000-0000-0000-0000-000000000001',
      student_id: 'a4000000-0000-0000-0000-000000000001',
      roll_number: '01',
      status: 'active',
      created_at: new Date().toISOString()
    },
    {
      id: 'e1000000-0000-0000-0000-000000000002',
      class_id: 'c1000000-0000-0000-0000-000000000001',
      student_id: 'a4000000-0000-0000-0000-000000000002',
      roll_number: '02',
      status: 'active',
      created_at: new Date().toISOString()
    }
  ];

  proctorAssignments: ProctorAssignment[] = [
    {
      id: 'pa100000-0000-0000-0000-000000000001',
      class_id: 'c1000000-0000-0000-0000-000000000001',
      student_id: 'a4000000-0000-0000-0000-000000000001',
      proctor_id: 'a3000000-0000-0000-0000-000000000001',
      valid_from: '2026-08-01',
      valid_to: null,
      assigned_by: 'a1000000-0000-0000-0000-000000000001',
      created_at: new Date().toISOString()
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
  evaluations: Evaluation[] = [];
  evaluationCriterionScores: EvaluationCriterionScore[] = [];
  resultPublications: ResultPublication[] = [];
  faculty_allocations: FacultyAllocation[] = [];

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
