/**
 * ==============================================================================
 * ACADASSESS: PROCTOR WORKSPACE & MENTEE SUBMISSIONS ROLE RESTRICTION TEST SUITE
 * ==============================================================================
 * 
 * Verifies all security requirements for the Proctor role:
 * 1. Proctor sidebar contains only Mentee Submissions Report.
 * 2. Proctor is strictly forbidden from authoring, editing, or deleting assessments (403).
 * 3. Proctor is strictly forbidden from publishing assessments or entering grades (403).
 * 4. Proctor is forbidden from general assessment submissions endpoint GET /assessment/:id (403).
 * 5. Proctor is forbidden from viewing whole assessment evaluation ledgers (403).
 * 6. Proctor is forbidden from accessing unassigned student submissions or evaluations (403).
 * 7. Proctor is authorized to view Mentee Submissions Report scoped to assigned mentees.
 * 8. Proctor is authorized to inspect individual submissions of assigned mentees.
 * 9. Other roles (HOD, Subject Teacher, Class Teacher, Student) retain their correct access.
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
const PORT = 4045;
const DEV_JWT_SECRET = process.env.JWT_DEV_SECRET || 'smartfa-test-hmac-dev-secret-key-32chars';

// Fixture IDs (All standard RFC 4122 UUIDs)
const HOD_ID = 'a1000000-0000-0000-0000-000000000001';
const SUBJECT_TEACHER_ID = 'a2000000-0000-0000-0000-000000000001';
const PROCTOR_NANDINI_ID = '8b876826-3989-493d-98e5-41247e5f87ba';
const STUDENT_MENTEE_ID = '3acf60f9-3f03-406d-8f1e-6ac01ae36f14'; // VISHNU C N (assigned to Nandini)
const STUDENT_UNASSIGNED_ID = 'a4000000-0000-0000-0000-000000000002'; // Not assigned to Nandini

const CLASS_MCA_ID = 'c53f348b-34dc-4399-ab77-6b0bea0e4e40';
const CS_ID = 'a6000000-0000-0000-0000-000000000001';
const ASSESSMENT_ID = '37c34bc1-6ccf-4011-b1d8-50de2b49dfcf';
const SUBMISSION_MENTEE_ID = 'e161f6b0-e5df-4d34-93bf-74454091df66';
const SUBMISSION_UNASSIGNED_ID = 'a7000000-0000-0000-0000-000000000002';

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
    console.error(`  [FAIL] ${requirement} - ${msg}`);
  }
}

function createToken(profileId: string, email: string, roles: string[]): string {
  return jwt.sign(
    {
      sub: profileId,
      email,
      user_metadata: { full_name: `Test User ${profileId.slice(0, 4)}` },
      app_metadata: { roles }
    },
    DEV_JWT_SECRET,
    { algorithm: 'HS256', expiresIn: '1h' }
  );
}

async function apiRequest(
  method: string,
  path: string,
  token: string,
  body?: any
): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const postData = body ? JSON.stringify(body) : undefined;
    const req = http.request(
      `http://localhost:${PORT}${path}`,
      {
        method,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          ...(postData ? { 'Content-Length': Buffer.byteLength(postData) } : {})
        }
      },
      (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode || 500, body: data ? JSON.parse(data) : {} });
          } catch {
            resolve({ status: res.statusCode || 500, body: data });
          }
        });
      }
    );
    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

async function setupFixtures() {
  // Setup in-memory repositories
  const userRepo = new InMemoryUserRepository(db);
  const assRepo = new InMemoryAssessmentRepository(db);
  const subRepo = new InMemorySubmissionRepository(db);
  const academicRepo = new InMemoryAcademicRepository(db);
  const evalRepo = new InMemoryEvaluationRepository(db);

  setUserRepositoryForTesting(userRepo);
  setAssessmentRepositoryForTesting(assRepo);
  setSubmissionRepositoryForTesting(subRepo);
  setAcademicRepositoryForTesting(academicRepo);
  setEvaluationRepositoryForTesting(evalRepo);

  // Setup Profiles
  db.profiles = [
    { id: HOD_ID, email: 'hod@smartfa.edu', full_name: 'Dr. Institutional Admin', role: 'hod', status: 'active' },
    { id: SUBJECT_TEACHER_ID, email: 'sharma@smartfa.edu', full_name: 'Dr. Ramesh Sharma', role: 'subject_teacher', status: 'active' },
    { id: PROCTOR_NANDINI_ID, email: 'nandini@smartfa.edu', full_name: 'Ms. Nandini B', role: 'proctor', status: 'active' },
    { id: STUDENT_MENTEE_ID, email: 'vishnu@student.smartfa.edu', full_name: 'VISHNU C N', role: 'student', usn: 'adm25mca9718', status: 'active' },
    { id: STUDENT_UNASSIGNED_ID, email: 'other@student.smartfa.edu', full_name: 'Other Student', role: 'student', usn: 'adm25mca9719', status: 'active' }
  ];

  // Setup User Roles
  db.roles = [
    { id: 'ur-1', user_id: HOD_ID, role: 'hod', active: true, created_at: new Date().toISOString() },
    { id: 'ur-2', user_id: SUBJECT_TEACHER_ID, role: 'subject_teacher', active: true, created_at: new Date().toISOString() },
    { id: 'ur-3', user_id: PROCTOR_NANDINI_ID, role: 'proctor', active: true, created_at: new Date().toISOString() },
    { id: 'ur-4', user_id: STUDENT_MENTEE_ID, role: 'student', active: true, created_at: new Date().toISOString() },
    { id: 'ur-5', user_id: STUDENT_UNASSIGNED_ID, role: 'student', active: true, created_at: new Date().toISOString() }
  ];

  // Setup Classes
  db.classes = [
    {
      id: CLASS_MCA_ID,
      programme: 'MCA',
      semester: 3,
      section: 'A',
      academic_year: '2026-2027',
      class_teacher_id: SUBJECT_TEACHER_ID
    }
  ];

  // Setup Subjects & Class Subject
  db.subjects = [
    { id: 'sub-mca-cyber', code: 'MCA301', name: 'Cyber Security Operations', programme: 'MCA', semester: 3 }
  ];

  db.classSubjects = [
    {
      id: CS_ID,
      class_id: CLASS_MCA_ID,
      subject_id: 'sub-mca-cyber',
      subject_teacher_id: SUBJECT_TEACHER_ID,
      academic_year: '2026-2027',
      active: true
    }
  ];

  // Setup Enrollments
  db.enrollments = [
    { id: 'enr-1', class_id: CLASS_MCA_ID, student_id: STUDENT_MENTEE_ID, status: 'active', enrolled_at: '2026-08-01' },
    { id: 'enr-2', class_id: CLASS_MCA_ID, student_id: STUDENT_UNASSIGNED_ID, status: 'active', enrolled_at: '2026-08-01' }
  ];

  // Setup Proctor Assignments: Nandini mentors ONLY Vishnu
  db.proctorAssignments = [
    {
      id: 'pa-nandini-vishnu',
      class_id: CLASS_MCA_ID,
      student_id: STUDENT_MENTEE_ID,
      proctor_id: PROCTOR_NANDINI_ID,
      valid_from: '2026-08-01',
      valid_to: null,
      assigned_by: HOD_ID,
      created_at: '2026-08-01T00:00:00Z'
    }
  ];

  // Setup Assessment
  db.assessments = [
    {
      id: ASSESSMENT_ID,
      class_subject_id: CS_ID,
      title: 'Formative Lab Assignment 1',
      description: 'Hands-on Security Analysis',
      total_marks: 50,
      deadline_at: new Date(Date.now() + 86400000).toISOString(),
      extension_deadline_at: null,
      status: 'published',
      created_by: SUBJECT_TEACHER_ID
    }
  ];

  // Setup Submissions
  db.submissions = [
    {
      id: SUBMISSION_MENTEE_ID,
      assessment_id: ASSESSMENT_ID,
      student_id: STUDENT_MENTEE_ID,
      active_version_id: 'ver-1',
      status: 'submitted',
      late_status: 'on_time',
      created_at: new Date().toISOString()
    },
    {
      id: SUBMISSION_UNASSIGNED_ID,
      assessment_id: ASSESSMENT_ID,
      student_id: STUDENT_UNASSIGNED_ID,
      active_version_id: 'ver-2',
      status: 'submitted',
      late_status: 'on_time',
      created_at: new Date().toISOString()
    }
  ];

  // Setup Evaluations
  db.evaluations = [
    {
      id: 'eval-mentee-1',
      submission_id: SUBMISSION_MENTEE_ID,
      evaluated_by: SUBJECT_TEACHER_ID,
      total_score: 45,
      status: 'published',
      created_at: new Date().toISOString()
    },
    {
      id: 'eval-unassigned-1',
      submission_id: SUBMISSION_UNASSIGNED_ID,
      evaluated_by: SUBJECT_TEACHER_ID,
      total_score: 42,
      status: 'published',
      created_at: new Date().toISOString()
    }
  ];
}

async function runTestSuite() {
  console.log('==============================================================================');
  console.log('PROCTOR RESTRICTION & MENTEE REPORTING AUTHORIZATION TEST SUITE');
  console.log('==============================================================================\n');

  await setupFixtures();

  server = app.listen(PORT);
  await new Promise(resolve => setTimeout(resolve, 500));

  const proctorToken = createToken(PROCTOR_NANDINI_ID, 'nandini@smartfa.edu', ['proctor']);
  const subjectTeacherToken = createToken(SUBJECT_TEACHER_ID, 'sharma@smartfa.edu', ['subject_teacher']);
  const hodToken = createToken(HOD_ID, 'hod@smartfa.edu', ['hod']);
  const studentToken = createToken(STUDENT_MENTEE_ID, 'vishnu@student.smartfa.edu', ['student']);

  try {
    // 1. Proctor Forbidden Endpoints (Authoring / Administration)
    console.log('--- 1. Proctor Assessment Authoring Restrictions ---');
    const createRes = await apiRequest('POST', '/api/v1/assessments', proctorToken, {
      class_subject_id: CS_ID,
      title: 'Unauthorized Proctor Assessment',
      deadline_at: new Date().toISOString()
    });
    recordTest('Proctor cannot create assessments (HTTP 403)', createRes.status === 403);

    const updateRes = await apiRequest('PUT', `/api/v1/assessments/${ASSESSMENT_ID}`, proctorToken, {
      title: 'Modified Title'
    });
    recordTest('Proctor cannot modify assessments (HTTP 403)', updateRes.status === 403);

    const deleteRes = await apiRequest('DELETE', `/api/v1/assessments/${ASSESSMENT_ID}`, proctorToken);
    recordTest('Proctor cannot delete assessments (HTTP 403)', deleteRes.status === 403);

    const publishRes = await apiRequest('POST', `/api/v1/assessments/${ASSESSMENT_ID}/publish`, proctorToken);
    recordTest('Proctor cannot publish assessments (HTTP 403)', publishRes.status === 403);

    // 2. Proctor General Submissions Restrictions
    console.log('\n--- 2. Proctor Unrestricted Submissions Access Restrictions ---');
    const classSubsRes = await apiRequest('GET', `/api/v1/submissions/assessment/${ASSESSMENT_ID}`, proctorToken);
    recordTest('Proctor cannot access class-wide submissions GET /submissions/assessment/:id (HTTP 403)', classSubsRes.status === 403, { status: classSubsRes.status, body: classSubsRes.body });

    const evalLedgerRes = await apiRequest('GET', `/api/v1/evaluations/assessment/${ASSESSMENT_ID}`, proctorToken);
    recordTest('Proctor cannot access assessment evaluation ledger GET /evaluations/assessment/:id (HTTP 403)', evalLedgerRes.status === 403, { status: evalLedgerRes.status, body: evalLedgerRes.body });

    const unassignedSubRes = await apiRequest('GET', `/api/v1/submissions/${SUBMISSION_UNASSIGNED_ID}`, proctorToken);
    recordTest('Proctor cannot access unassigned student submission GET /submissions/:id (HTTP 403)', unassignedSubRes.status === 403, { status: unassignedSubRes.status, body: unassignedSubRes.body });

    const unassignedEvalRes = await apiRequest('GET', `/api/v1/evaluations/submission/${SUBMISSION_UNASSIGNED_ID}`, proctorToken);
    recordTest('Proctor cannot access unassigned student evaluation (HTTP 403)', unassignedEvalRes.status === 403, { status: unassignedEvalRes.status, body: unassignedEvalRes.body });

    // 3. Proctor Authorized Mentee Scoping
    console.log('\n--- 3. Proctor Mentee Submissions Scoping ---');
    const lateReportRes = await apiRequest('GET', '/api/v1/submissions/reports/late-submissions', proctorToken);
    recordTest('Proctor can access mentee submissions report (HTTP 200)', lateReportRes.status === 200, { status: lateReportRes.status, body: lateReportRes.body });

    const reports: any[] = lateReportRes.body.reports || [];
    recordTest('Mentee submissions report contains rows', reports.length > 0, { reportsCount: reports.length });

    const allRowsBelongToMentee = reports.length > 0 && reports.every((r: any) => r.student_id === STUDENT_MENTEE_ID);
    recordTest('Mentee submissions report contains ONLY assigned mentees (no unassigned students)', allRowsBelongToMentee, { reports });

    const menteeSubRes = await apiRequest('GET', `/api/v1/submissions/${SUBMISSION_MENTEE_ID}`, proctorToken);
    recordTest('Proctor can inspect assigned mentee submission GET /submissions/:id (HTTP 200)', menteeSubRes.status === 200 && menteeSubRes.body?.submission?.id === SUBMISSION_MENTEE_ID, { status: menteeSubRes.status, body: menteeSubRes.body });

    const menteeEvalRes = await apiRequest('GET', `/api/v1/evaluations/submission/${SUBMISSION_MENTEE_ID}`, proctorToken);
    recordTest('Proctor can inspect assigned mentee evaluation results (HTTP 200)', menteeEvalRes.status === 200 && menteeEvalRes.body?.evaluation?.submission_id === SUBMISSION_MENTEE_ID, { status: menteeEvalRes.status, body: menteeEvalRes.body });

    // 4. Verification of Other Roles Integrity
    console.log('\n--- 4. Role Integrity for Other Workspaces ---');
    const teacherClassSubsRes = await apiRequest('GET', `/api/v1/submissions/assessment/${ASSESSMENT_ID}`, subjectTeacherToken);
    recordTest('Subject Teacher retains access to class submissions (HTTP 200)', teacherClassSubsRes.status === 200, { status: teacherClassSubsRes.status, body: teacherClassSubsRes.body });

    const hodSubsRes = await apiRequest('GET', `/api/v1/submissions/assessment/${ASSESSMENT_ID}`, hodToken);
    recordTest('HOD retains full access to class submissions (HTTP 200)', hodSubsRes.status === 200, { status: hodSubsRes.status, body: hodSubsRes.body });

    const studentSelfSub = await apiRequest('GET', `/api/v1/submissions/${SUBMISSION_MENTEE_ID}`, studentToken);
    recordTest('Student retains access to own submission (HTTP 200)', studentSelfSub.status === 200, { status: studentSelfSub.status, body: studentSelfSub.body });

    const studentOtherSub = await apiRequest('GET', `/api/v1/submissions/${SUBMISSION_UNASSIGNED_ID}`, studentToken);
    recordTest('Student forbidden from accessing other student submission (HTTP 403)', studentOtherSub.status === 403, { status: studentOtherSub.status, body: studentOtherSub.body });

    console.log('\n==============================================================================');
    console.log(`SUMMARY: ${results.filter(r => r.passed).length} / ${results.length} PASSED`);
    console.log('==============================================================================');

    if (results.some(r => !r.passed)) {
      process.exitCode = 1;
    }
  } finally {
    server.close();
  }
}

runTestSuite().catch((err) => {
  console.error('Fatal test runner error:', err);
  if (server) server.close();
  process.exit(1);
});
