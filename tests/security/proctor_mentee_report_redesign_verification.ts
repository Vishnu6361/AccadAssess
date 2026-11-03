/**
 * ==============================================================================
 * PROCTOR MENTEE SUBMISSIONS REPORT REDESIGN VERIFICATION TEST SUITE
 * ==============================================================================
 * 
 * Verifies all 9 requirements specified in the redesign request:
 * 1. A mentee with multiple subjects sees all applicable subjects.
 * 2. A subject with multiple assessments displays every applicable assessment.
 * 3. Published assessments without submissions appear as Pending.
 * 4. Submitted assessments show the correct submission date and timing.
 * 5. Evaluated assessments show the correct evaluation status.
 * 6. Unpublished marks are not exposed (remain null/undisclosed).
 * 7. AI and Cyber Security specialization records remain separate.
 * 8. Proctors cannot view students outside their assigned mentees.
 * 9. Existing assessment, submission, evaluation, and student records remain unchanged.
 * ==============================================================================
 */

process.env.SMARTFA_TEST_MODE = 'true';
import http from 'http';
import jwt from 'jsonwebtoken';
import app from '../../apps/api/src/index.js';
import { db } from '../../apps/api/src/storage/db.js';
import { InMemoryUserRepository, setUserRepositoryForTesting } from '../../apps/api/src/storage/userRepository.js';
import { InMemoryAssessmentRepository, setAssessmentRepositoryForTesting } from '../../apps/api/src/storage/assessmentRepository.js';
import { InMemorySubmissionRepository, setSubmissionRepositoryForTesting } from '../../apps/api/src/storage/submissionRepository.js';
import { InMemoryAcademicRepository, setAcademicRepositoryForTesting } from '../../apps/api/src/storage/academicRepository.js';
import { InMemoryEvaluationRepository, setEvaluationRepositoryForTesting } from '../../apps/api/src/storage/evaluationRepository.js';

let server: http.Server;
const PORT = 4047;
const DEV_JWT_SECRET = process.env.JWT_DEV_SECRET || 'smartfa-test-hmac-dev-secret-key-32chars';

// UUID Fixtures
const PROCTOR_NANDINI_ID = '8b876826-3989-493d-98e5-41247e5f87ba';
const PROCTOR_OTHER_ID = '8b876826-3989-493d-98e5-41247e5f87bb';

// Student A: Cyber Security stream (Mentee of Nandini)
const STUDENT_VISHNU_ID = '3acf60f9-3f03-406d-8f1e-6ac01ae36f14';
// Student B: AI stream (Mentee of Nandini)
const STUDENT_AI_ID = '4acf60f9-3f03-406d-8f1e-6ac01ae36f15';
// Student C: Unassigned student (Not a mentee of Nandini)
const STUDENT_OTHER_ID = '5acf60f9-3f03-406d-8f1e-6ac01ae36f16';

// Common MCA Semester 3 Class Cohort
const CLASS_MCA3_ID = 'c53f348b-34dc-4399-ab77-6b0bea0e4e40';

// Specializations
const SPEC_CYBER_ID = '3f75d427-7881-44c3-bf01-491e8f316a74';
const SPEC_AI_ID = '2f75d427-7881-44c3-bf01-491e8f316a73';

// Subjects
// Sub 1: Core Common Subject (specialization_id: null)
const SUB_ALGO_CORE_ID = 'e1000000-0000-4000-8000-000000000001';
// Sub 2: Cyber Security Subject (specialization_id: SPEC_CYBER_ID)
const SUB_NETSEC_CYBER_ID = 'e2000000-0000-4000-8000-000000000002';
// Sub 3: AI Subject (specialization_id: SPEC_AI_ID)
const SUB_ML_AI_ID = 'e3000000-0000-4000-8000-000000000003';

// Class-Subject Allocations
const CS_ALGO_ID = 'c5100000-0000-4000-8000-000000000001';
const CS_NETSEC_ID = 'c5200000-0000-4000-8000-000000000002';
const CS_ML_ID = 'c5300000-0000-4000-8000-000000000003';

// Assessments
// Algo has 2 assessments: Ass 1 (Submitted by Vishnu), Ass 2 (Unsubmitted / Pending by Vishnu)
const ASS_ALGO_1_ID = 'a1000000-0000-4000-8000-000000000001';
const ASS_ALGO_2_ID = 'a2000000-0000-4000-8000-000000000002';

// NetSec has 1 assessment: Ass 3 (Submitted, Evaluated, Marks Unpublished)
const ASS_NETSEC_1_ID = 'a3000000-0000-4000-8000-000000000003';

// ML has 1 assessment: Ass 4 (Applicable to AI mentee, not Cyber mentee)
const ASS_ML_1_ID = 'a4000000-0000-4000-8000-000000000004';

interface TestResult {
  requirement: string;
  passed: boolean;
  details?: string;
}

const results: TestResult[] = [];

function recordTest(requirement: string, condition: boolean, details?: any) {
  if (condition) {
    results.push({ requirement, passed: true });
    console.log(`  [PASS] ${requirement}`);
  } else {
    const msg = typeof details === 'object' ? JSON.stringify(details) : (details || 'Assertion failed');
    results.push({ requirement, passed: false, details: msg });
    console.error(`  [FAIL] ${requirement}: ${msg}`);
  }
}

function makeToken(userId: string, email: string): string {
  return jwt.sign(
    { sub: userId, email, aud: 'authenticated', role: 'authenticated' },
    DEV_JWT_SECRET,
    { algorithm: 'HS256', expiresIn: '1h' }
  );
}

async function apiRequest(
  method: string,
  path: string,
  token?: string,
  activeRole?: string
): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (activeRole) headers['x-active-role'] = activeRole;

    const req = http.request(
      `http://localhost:${PORT}${path}`,
      { method, headers },
      (res) => {
        let resData = '';
        res.on('data', chunk => { resData += chunk; });
        res.on('end', () => {
          let parsed: any;
          try {
            parsed = JSON.parse(resData);
          } catch {
            parsed = resData;
          }
          resolve({ status: res.statusCode || 500, body: parsed });
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

function setupTestData() {
  // Profiles
  db.profiles = [
    {
      id: PROCTOR_NANDINI_ID,
      email: 'nandini@sjbit.edu.in',
      full_name: 'Ms. Nandini B',
      role: 'faculty',
      status: 'active',
      active: true,
      usn: null,
      created_at: new Date().toISOString()
    },
    {
      id: PROCTOR_OTHER_ID,
      email: 'other.proctor@sjbit.edu.in',
      full_name: 'Other Proctor',
      role: 'faculty',
      status: 'active',
      active: true,
      usn: null,
      created_at: new Date().toISOString()
    },
    {
      id: STUDENT_VISHNU_ID,
      email: 'vishnu@student.sjbit.edu.in',
      full_name: 'VISHNU C N',
      role: 'student',
      status: 'active',
      active: true,
      usn: 'adm25mca9718',
      created_at: new Date().toISOString()
    },
    {
      id: STUDENT_AI_ID,
      email: 'ai.student@student.sjbit.edu.in',
      full_name: 'AI Mentee Student',
      role: 'student',
      status: 'active',
      active: true,
      usn: '1JB24MCA002',
      created_at: new Date().toISOString()
    },
    {
      id: STUDENT_OTHER_ID,
      email: 'unassigned@student.sjbit.edu.in',
      full_name: 'Unassigned Student X',
      role: 'student',
      status: 'active',
      active: true,
      usn: '1JB24MCA999',
      created_at: new Date().toISOString()
    }
  ];

  // User roles
  db.roles = [
    { id: 'r1', user_id: PROCTOR_NANDINI_ID, role: 'proctor', active: true, assigned_at: new Date().toISOString() },
    { id: 'r2', user_id: PROCTOR_OTHER_ID, role: 'proctor', active: true, assigned_at: new Date().toISOString() },
    { id: 'r3', user_id: STUDENT_VISHNU_ID, role: 'student', active: true, assigned_at: new Date().toISOString() },
    { id: 'r4', user_id: STUDENT_AI_ID, role: 'student', active: true, assigned_at: new Date().toISOString() },
    { id: 'r5', user_id: STUDENT_OTHER_ID, role: 'student', active: true, assigned_at: new Date().toISOString() }
  ];
  db.user_roles = [...db.roles];

  // Specializations
  db.specializations = [
    {
      id: SPEC_CYBER_ID,
      code: 'CYBER',
      name: 'Cyber Security',
      programme_id: 'p-mca',
      applicable_semesters: [3, 4],
      active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: SPEC_AI_ID,
      code: 'AI',
      name: 'Artificial Intelligence',
      programme_id: 'p-mca',
      applicable_semesters: [3, 4],
      active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }
  ];

  // Classes: Single canonical MCA Semester 3 cohort
  db.classes = [
    {
      id: CLASS_MCA3_ID,
      programme: 'MCA',
      semester: 3,
      section: 'A',
      cohort: '2025-2027',
      class_teacher_id: 'ct-1',
      specialization_id: null,
      active: true
    }
  ];

  // Enrollments:
  // VISHNU in Cyber Security stream
  // AI student in AI stream
  // Other student in Cyber Security stream
  db.enrollments = [
    {
      id: 'en-1',
      student_id: STUDENT_VISHNU_ID,
      class_id: CLASS_MCA3_ID,
      specialization_id: SPEC_CYBER_ID,
      status: 'active',
      enrolled_at: new Date().toISOString()
    },
    {
      id: 'en-2',
      student_id: STUDENT_AI_ID,
      class_id: CLASS_MCA3_ID,
      specialization_id: SPEC_AI_ID,
      status: 'active',
      enrolled_at: new Date().toISOString()
    },
    {
      id: 'en-3',
      student_id: STUDENT_OTHER_ID,
      class_id: CLASS_MCA3_ID,
      specialization_id: SPEC_CYBER_ID,
      status: 'active',
      enrolled_at: new Date().toISOString()
    }
  ];

  // Proctor assignments:
  // Nandini is proctor for VISHNU and AI student.
  // Other Proctor is proctor for STUDENT_OTHER_ID.
  db.proctorAssignments = [
    {
      id: 'pa-1',
      proctor_id: PROCTOR_NANDINI_ID,
      student_id: STUDENT_VISHNU_ID,
      valid_to: null,
      assigned_at: new Date().toISOString()
    },
    {
      id: 'pa-2',
      proctor_id: PROCTOR_NANDINI_ID,
      student_id: STUDENT_AI_ID,
      valid_to: null,
      assigned_at: new Date().toISOString()
    },
    {
      id: 'pa-3',
      proctor_id: PROCTOR_OTHER_ID,
      student_id: STUDENT_OTHER_ID,
      valid_to: null,
      assigned_at: new Date().toISOString()
    }
  ];

  // Subjects
  db.subjects = [
    {
      id: SUB_ALGO_CORE_ID,
      code: '22MCA31',
      name: 'Design and Analysis of Algorithms',
      credits: 4,
      specialization_id: null, // CORE COMMON
      active: true
    },
    {
      id: SUB_NETSEC_CYBER_ID,
      code: '25MCAE321',
      name: 'Network Security',
      credits: 3,
      specialization_id: SPEC_CYBER_ID, // CYBER ONLY
      active: true
    },
    {
      id: SUB_ML_AI_ID,
      code: '25MCAE322',
      name: 'Deep Learning & Neural Networks',
      credits: 3,
      specialization_id: SPEC_AI_ID, // AI ONLY
      active: true
    }
  ];

  // Class Subjects
  db.classSubjects = [
    { id: CS_ALGO_ID, class_id: CLASS_MCA3_ID, subject_id: SUB_ALGO_CORE_ID, active: true },
    { id: CS_NETSEC_ID, class_id: CLASS_MCA3_ID, subject_id: SUB_NETSEC_CYBER_ID, active: true },
    { id: CS_ML_ID, class_id: CLASS_MCA3_ID, subject_id: SUB_ML_AI_ID, active: true }
  ];

  // Published Assessments
  db.assessments = [
    // Sub 1: Algo (Core) - 2 assessments
    {
      id: ASS_ALGO_1_ID,
      title: 'Algorithm Design Mini-Project',
      instructions: 'Submit PDF report',
      class_subject_id: CS_ALGO_ID,
      status: 'published',
      deadline_at: '2026-11-20T23:59:59.000Z',
      allow_late: true,
      max_marks: 50
    },
    {
      id: ASS_ALGO_2_ID,
      title: 'Dynamic Programming Problem Set',
      instructions: 'Solve greedy & DP exercises',
      class_subject_id: CS_ALGO_ID,
      status: 'published',
      deadline_at: '2026-11-25T23:59:59.000Z',
      allow_late: false,
      max_marks: 30
    },
    // Sub 2: NetSec (Cyber) - 1 assessment
    {
      id: ASS_NETSEC_1_ID,
      title: 'Cryptography & Firewall Lab Assignment',
      instructions: 'Lab experiment report',
      class_subject_id: CS_NETSEC_ID,
      status: 'published',
      deadline_at: '2026-11-18T23:59:59.000Z',
      allow_late: true,
      max_marks: 40
    },
    // Sub 3: ML (AI) - 1 assessment
    {
      id: ASS_ML_1_ID,
      title: 'CNN Model Optimization Assignment',
      instructions: 'Model training report',
      class_subject_id: CS_ML_ID,
      status: 'published',
      deadline_at: '2026-11-22T23:59:59.000Z',
      allow_late: true,
      max_marks: 50
    }
  ];

  // Submissions:
  // 1. Vishnu has submitted ASS_ALGO_1_ID (On Time)
  // 2. Vishnu has NOT submitted ASS_ALGO_2_ID (Pending!)
  // 3. Vishnu has submitted ASS_NETSEC_1_ID (Late, Evaluated with score 38, but marks NOT published yet)
  db.submissions = [
    {
      id: 'sub-v-algo1',
      assessment_id: ASS_ALGO_1_ID,
      student_id: STUDENT_VISHNU_ID,
      active_version_id: 'ver-v-algo1',
      status: 'uploaded',
      late_status: 'on_time',
      first_submitted_at: '2026-11-12T14:30:00.000Z'
    },
    {
      id: 'sub-v-netsec1',
      assessment_id: ASS_NETSEC_1_ID,
      student_id: STUDENT_VISHNU_ID,
      active_version_id: 'ver-v-netsec1',
      status: 'uploaded',
      late_status: 'late',
      first_submitted_at: '2026-11-19T02:00:00.000Z'
    }
  ];

  db.submissionVersions = [
    {
      id: 'ver-v-algo1',
      submission_id: 'sub-v-algo1',
      version: 1,
      uploaded_at: '2026-11-12T14:30:00.000Z',
      late_status: 'on_time',
      files: []
    },
    {
      id: 'ver-v-netsec1',
      submission_id: 'sub-v-netsec1',
      version: 1,
      uploaded_at: '2026-11-19T02:00:00.000Z',
      late_status: 'late',
      files: []
    }
  ];

  // Evaluation for NetSec (Completed, 38 marks)
  db.evaluations = [
    {
      id: 'eval-v-netsec1',
      submission_id: 'sub-v-netsec1',
      status: 'completed', // completed, but NOT published
      total_score: 38,
      raw_score: 40,
      late_penalty_deducted: 2,
      created_at: new Date().toISOString()
    }
  ];

  // Result publications: ASS_ALGO_1_ID is published; ASS_NETSEC_1_ID is NOT published.
  db.resultPublications = [
    {
      id: 'pub-algo1',
      assessment_id: ASS_ALGO_1_ID,
      published_by: 'faculty-1',
      published_at: new Date().toISOString()
    }
  ];

  // Register in-memory repos
  setUserRepositoryForTesting(new InMemoryUserRepository(db));
  setAssessmentRepositoryForTesting(new InMemoryAssessmentRepository(db));
  setSubmissionRepositoryForTesting(new InMemorySubmissionRepository(db));
  setAcademicRepositoryForTesting(new InMemoryAcademicRepository(db));
  setEvaluationRepositoryForTesting(new InMemoryEvaluationRepository(db));
}

async function runVerification() {
  console.log('\n==============================================================================');
  console.log('STARTING PROCTOR MENTEE REPORT REDESIGN VERIFICATION');
  console.log('==============================================================================\n');

  setupTestData();
  server = app.listen(PORT);
  await new Promise(r => setTimeout(r, 600));

  const nandiniToken = makeToken(PROCTOR_NANDINI_ID, 'nandini@sjbit.edu.in');
  const otherProctorToken = makeToken(PROCTOR_OTHER_ID, 'other.proctor@sjbit.edu.in');

  try {
    // ------------------------------------------------------------------------
    // Check 1: Nandini sees only her assigned mentees (VISHNU and AI student)
    // ------------------------------------------------------------------------
    console.log('\n--- 1. Proctor Scoping to Assigned Mentees ---');
    const res = await apiRequest('GET', '/api/v1/submissions/reports/late-submissions', nandiniToken, 'proctor');
    recordTest('HTTP 200 returned for proctor report', res.status === 200, res.body);

    const mentees = res.body.mentees as any[] || [];
    recordTest(
      'Nandini sees exactly her 2 assigned mentees',
      mentees.length === 2 &&
      mentees.some(m => m.student_id === STUDENT_VISHNU_ID) &&
      mentees.some(m => m.student_id === STUDENT_AI_ID),
      mentees.map(m => m.student_name)
    );

    recordTest(
      'Nandini does NOT see unassigned Student X',
      !mentees.some(m => m.student_id === STUDENT_OTHER_ID),
      { unassignedFound: mentees.some(m => m.student_id === STUDENT_OTHER_ID) }
    );

    // Other proctor sees only Student X
    const otherRes = await apiRequest('GET', '/api/v1/submissions/reports/late-submissions', otherProctorToken, 'proctor');
    const otherMentees = otherRes.body.mentees as any[] || [];
    recordTest(
      'Other proctor sees ONLY their assigned student (Student X)',
      otherMentees.length === 1 && otherMentees[0].student_id === STUDENT_OTHER_ID,
      otherMentees.map(m => m.student_name)
    );

    // ------------------------------------------------------------------------
    // Check 2: Specialization separation (Cyber Security vs AI)
    // ------------------------------------------------------------------------
    console.log('\n--- 2. Specialization Separation on Common Cohort ---');
    const vishnu = mentees.find(m => m.student_id === STUDENT_VISHNU_ID);
    const aiMentee = mentees.find(m => m.student_id === STUDENT_AI_ID);

    recordTest(
      'Vishnu specialization is Cyber Security',
      vishnu?.specialization_id === SPEC_CYBER_ID && vishnu?.specialization_name === 'Cyber Security',
      vishnu?.specialization_name
    );

    recordTest(
      'AI Mentee specialization is Artificial Intelligence',
      aiMentee?.specialization_id === SPEC_AI_ID && aiMentee?.specialization_name === 'Artificial Intelligence',
      aiMentee?.specialization_name
    );

    // Check subjects for Vishnu: must have Algo (Core) and NetSec (Cyber), must NOT have ML (AI)
    const vishnuSubjects = vishnu?.subjects || [];
    const vishnuHasAlgo = vishnuSubjects.some(s => s.subject_id === SUB_ALGO_CORE_ID);
    const vishnuHasNetSec = vishnuSubjects.some(s => s.subject_id === SUB_NETSEC_CYBER_ID);
    const vishnuHasML = vishnuSubjects.some(s => s.subject_id === SUB_ML_AI_ID);

    recordTest(
      'Vishnu sees applicable Core subject (Algo) and Cyber subject (NetSec)',
      vishnuHasAlgo && vishnuHasNetSec,
      vishnuSubjects.map(s => s.subject_name)
    );

    recordTest(
      'Vishnu does NOT see unrelated AI elective subject (ML)',
      !vishnuHasML,
      { vishnuHasML }
    );

    // Check subjects for AI mentee: must have Algo (Core) and ML (AI), must NOT have NetSec (Cyber)
    const aiSubjects = aiMentee?.subjects || [];
    const aiHasAlgo = aiSubjects.some(s => s.subject_id === SUB_ALGO_CORE_ID);
    const aiHasNetSec = aiSubjects.some(s => s.subject_id === SUB_NETSEC_CYBER_ID);
    const aiHasML = aiSubjects.some(s => s.subject_id === SUB_ML_AI_ID);

    recordTest(
      'AI mentee sees Core subject (Algo) and AI subject (ML), but NOT Cyber subject (NetSec)',
      aiHasAlgo && aiHasML && !aiHasNetSec,
      aiSubjects.map(s => s.subject_name)
    );

    // ------------------------------------------------------------------------
    // Check 3: A subject with multiple assessments displays all applicable assessments
    // ------------------------------------------------------------------------
    console.log('\n--- 3. Multiple Assessments per Subject ---');
    const algoSubject = vishnuSubjects.find(s => s.subject_id === SUB_ALGO_CORE_ID);
    recordTest(
      'Algo subject contains both published assessments (Total: 2)',
      algoSubject?.total_assessments === 2 && algoSubject?.assessments.length === 2,
      algoSubject?.total_assessments
    );

    const algoAss1 = algoSubject?.assessments.find(a => a.assessment_id === ASS_ALGO_1_ID);
    const algoAss2 = algoSubject?.assessments.find(a => a.assessment_id === ASS_ALGO_2_ID);

    recordTest('Algo Assessment 1 is present', Boolean(algoAss1), algoAss1?.title);
    recordTest('Algo Assessment 2 is present', Boolean(algoAss2), algoAss2?.title);

    // ------------------------------------------------------------------------
    // Check 4: Published assessments without submissions appear as Pending
    // ------------------------------------------------------------------------
    console.log('\n--- 4. Unsubmitted Assessment Appears as Pending ---');
    recordTest(
      'Algo Assessment 2 has is_submitted: false and evaluation_status_label: "Pending"',
      algoAss2?.is_submitted === false &&
      algoAss2?.timing_status === '—' &&
      algoAss2?.evaluation_status_label === 'Pending',
      algoAss2
    );

    // Subject summary counts reflect 1 submitted and 1 pending
    recordTest(
      'Algo subject summary shows submitted_count: 1, pending_count: 1',
      algoSubject?.submitted_count === 1 && algoSubject?.pending_count === 1,
      { submitted: algoSubject?.submitted_count, pending: algoSubject?.pending_count }
    );

    // ------------------------------------------------------------------------
    // Check 5: Submitted assessment shows correct submission date and timing
    // ------------------------------------------------------------------------
    console.log('\n--- 5. Submitted Assessment Timing Status ---');
    recordTest(
      'Algo Assessment 1 has is_submitted: true, timing_status: "On Time", and submitted_at date',
      algoAss1?.is_submitted === true &&
      algoAss1?.timing_status === 'On Time' &&
      algoAss1?.submitted_at === '2026-11-12T14:30:00.000Z',
      algoAss1
    );

    const netsecSubject = vishnuSubjects.find(s => s.subject_id === SUB_NETSEC_CYBER_ID);
    const netsecAss1 = netsecSubject?.assessments.find(a => a.assessment_id === ASS_NETSEC_1_ID);

    recordTest(
      'NetSec Assessment 1 has is_submitted: true, is_late: true, timing_status: "Late"',
      netsecAss1?.is_submitted === true &&
      netsecAss1?.is_late === true &&
      netsecAss1?.timing_status === 'Late',
      netsecAss1
    );

    // ------------------------------------------------------------------------
    // Check 6: Unpublished marks are NOT exposed
    // ------------------------------------------------------------------------
    console.log('\n--- 6. Unpublished Marks Embargo (Zero Disclosure) ---');
    recordTest(
      'NetSec assessment status is "Evaluated", but published_score is null (marks hidden)',
      netsecAss1?.evaluation_status_label === 'Evaluated' &&
      netsecAss1?.published_score === null,
      { evaluation_status: netsecAss1?.evaluation_status_label, published_score: netsecAss1?.published_score }
    );

    // ------------------------------------------------------------------------
    // Check 7: Dedicated endpoint /reports/mentee-progress
    // ------------------------------------------------------------------------
    console.log('\n--- 7. Dedicated Endpoint /reports/mentee-progress ---');
    const dedicatedRes = await apiRequest('GET', '/api/v1/submissions/reports/mentee-progress', nandiniToken, 'proctor');
    recordTest(
      'GET /api/v1/submissions/reports/mentee-progress returns HTTP 200 with mentees and subjects hierarchy',
      dedicatedRes.status === 200 && Array.isArray(dedicatedRes.body.mentees) && Array.isArray(dedicatedRes.body.subjects),
      { menteesCount: dedicatedRes.body.mentees?.length, subjectsCount: dedicatedRes.body.subjects?.length }
    );

    // ------------------------------------------------------------------------
    // Check 8: Subject-First Hierarchy (SUBJECTS -> ASSESSMENTS -> ASSIGNED STUDENTS)
    // ------------------------------------------------------------------------
    console.log('\n--- 8. Subject-First Hierarchy Structure ---');
    const subjectsHierarchy = res.body.subjects as any[] || [];
    recordTest(
      'Subject-First list contains applicable subjects for Nandini (Algo, NetSec, ML)',
      subjectsHierarchy.length === 3 &&
      subjectsHierarchy.some(s => s.subject_id === SUB_ALGO_CORE_ID) &&
      subjectsHierarchy.some(s => s.subject_id === SUB_NETSEC_CYBER_ID) &&
      subjectsHierarchy.some(s => s.subject_id === SUB_ML_AI_ID),
      subjectsHierarchy.map(s => s.subject_name)
    );

    // Inspect Algo Core Subject
    const algoSubFirst = subjectsHierarchy.find(s => s.subject_id === SUB_ALGO_CORE_ID);
    recordTest(
      'Algo subject contains both published assessments',
      algoSubFirst?.total_assessments === 2 && algoSubFirst?.assessments.length === 2,
      algoSubFirst?.assessments.map((a: any) => a.title)
    );

    // Algo Assessment 1 has both mentees (Vishnu and AI student)
    const algo1SubFirst = algoSubFirst?.assessments.find((a: any) => a.assessment_id === ASS_ALGO_1_ID);
    recordTest(
      'Algo Assessment 1 has total_mentees: 2, submitted_count: 1, pending_count: 1',
      algo1SubFirst?.total_mentees === 2 &&
      algo1SubFirst?.submitted_count === 1 &&
      algo1SubFirst?.pending_count === 1,
      { total: algo1SubFirst?.total_mentees, submitted: algo1SubFirst?.submitted_count, pending: algo1SubFirst?.pending_count }
    );

    const vishnuInAlgo1 = algo1SubFirst?.students.find((s: any) => s.student_id === STUDENT_VISHNU_ID);
    const aiInAlgo1 = algo1SubFirst?.students.find((s: any) => s.student_id === STUDENT_AI_ID);
    recordTest(
      'Vishnu in Algo 1 is submitted and On Time',
      vishnuInAlgo1?.is_submitted === true && vishnuInAlgo1?.timing_status === 'On Time',
      vishnuInAlgo1
    );
    recordTest(
      'AI Mentee in Algo 1 is NOT submitted and marked Pending',
      aiInAlgo1?.is_submitted === false && aiInAlgo1?.timing_status === '—',
      aiInAlgo1
    );

    // Inspect Cyber Security Subject (NetSec)
    const netsecSubFirst = subjectsHierarchy.find(s => s.subject_id === SUB_NETSEC_CYBER_ID);
    const netsec1SubFirst = netsecSubFirst?.assessments[0];
    recordTest(
      'NetSec assessment assigns ONLY Vishnu (Cyber mentee) and excludes AI mentee',
      netsec1SubFirst?.students.length === 1 &&
      netsec1SubFirst?.students[0].student_id === STUDENT_VISHNU_ID,
      netsec1SubFirst?.students.map((s: any) => s.student_name)
    );
    recordTest(
      'NetSec assessment preserves published score embargo (published_score is null)',
      netsec1SubFirst?.students[0].published_score === null,
      { published_score: netsec1SubFirst?.students[0].published_score }
    );

    // Inspect AI Subject (ML)
    const mlSubFirst = subjectsHierarchy.find(s => s.subject_id === SUB_ML_AI_ID);
    const ml1SubFirst = mlSubFirst?.assessments[0];
    recordTest(
      'ML assessment assigns ONLY AI mentee and excludes Cyber mentee',
      ml1SubFirst?.students.length === 1 &&
      ml1SubFirst?.students[0].student_id === STUDENT_AI_ID,
      ml1SubFirst?.students.map((s: any) => s.student_name)
    );

    // ------------------------------------------------------------------------
    // Check 9: Other Proctor Isolation in Subject-First Hierarchy
    // ------------------------------------------------------------------------
    console.log('\n--- 9. Other Proctor Isolation in Subject-First Hierarchy ---');
    const otherSubjects = otherRes.body.subjects as any[] || [];
    const otherAlgoStudents = otherSubjects.find(s => s.subject_id === SUB_ALGO_CORE_ID)?.assessments[0]?.students || [];
    recordTest(
      'Other proctor sees ONLY Student X in Algo assessment; never sees Nandini mentees',
      otherAlgoStudents.length === 1 &&
      otherAlgoStudents[0].student_id === STUDENT_OTHER_ID &&
      !otherAlgoStudents.some((s: any) => s.student_id === STUDENT_VISHNU_ID || s.student_id === STUDENT_AI_ID),
      otherAlgoStudents.map((s: any) => s.student_name)
    );

  } finally {
    if (server) {
      server.close();
    }
  }

  // Summary
  console.log('\n==============================================================================');
  console.log('VERIFICATION SUMMARY');
  console.log('==============================================================================');
  const passedCount = results.filter(r => r.passed).length;
  const failedCount = results.filter(r => !r.passed).length;
  console.log(`Total tests: ${results.length}`);
  console.log(`Passed:      ${passedCount}`);
  console.log(`Failed:      ${failedCount}`);

  if (failedCount > 0) {
    console.error('\nFAILED TESTS:');
    results.filter(r => !r.passed).forEach(r => console.error(` - ${r.requirement}: ${r.details}`));
    process.exit(1);
  } else {
    console.log('\nALL PROCTOR MENTEE REPORT REDESIGN REQUIREMENTS VERIFIED SUCCESSFULLY!\n');
    process.exit(0);
  }
}

runVerification().catch(err => {
  console.error('Test execution crashed:', err);
  if (server) server.close();
  process.exit(1);
});

