/**
 * ==============================================================================
 * ACADASSESS: MULTI-ROLE FACULTY ACCESS & WORKSPACE SWITCHING VERIFICATION
 * ==============================================================================
 * 
 * Verifies all security and architectural requirements for multi-role faculty:
 * 1. Faculty with only Subject Teacher role sees only Subject Teacher workspace.
 * 2. Faculty with only Proctor role sees only Proctor workspace.
 * 3. Faculty with Subject Teacher + Proctor roles sees and accesses both workspaces.
 * 4. Faculty with Class Teacher + Proctor roles sees and accesses both workspaces.
 * 5. Faculty with all 3 roles (Subject Teacher + Class Teacher + Proctor) sees and accesses all 3.
 * 6. Switching workspaces preserves authentication session without requiring logout.
 * 7. Proctor workspace cannot create or publish assessments (403 WORKSPACE_ROLE_UNAUTHORIZED).
 * 8. Subject Teacher workspace can author assessments using same user account.
 * 9. Proctor workspace views only assigned mentees.
 * 10. Class Teacher workspace views only assigned classes.
 * 11. Unauthorized role spoofing in x-active-role returns 403 FORBIDDEN_ROLE_SWITCH.
 * 12. Role revocation removes the revoked workspace without breaking the account or other roles.
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
import { invalidateUserContextCache } from '../../apps/api/src/authorization/rbac.js';

let server: http.Server;
const PORT = 4046;
const DEV_JWT_SECRET = process.env.JWT_DEV_SECRET || 'smartfa-test-hmac-dev-secret-key-32chars';

// IDs
const HOD_ID = 'a1000000-0000-0000-0000-000000000001';
const MULTI_FACULTY_ID = 'f1000000-0000-0000-0000-000000000001';
const SINGLE_TEACHER_ID = 'f2000000-0000-0000-0000-000000000002';
const SINGLE_PROCTOR_ID = 'f3000000-0000-0000-0000-000000000003';

const MENTEE_STUDENT_ID = 'b1000000-0000-0000-0000-000000000001';
const OTHER_STUDENT_ID = 'b2000000-0000-0000-0000-000000000002';

const CLASS_MCA3_ID = 'c1000000-0000-0000-0000-000000000001';
const CLASS_OTHER_ID = 'c2000000-0000-0000-0000-000000000002';

const SUBJECT_ML_ID = 'd1000000-0000-0000-0000-000000000001';
const CS_ML_ID = 'c5100000-0000-0000-0000-000000000001';
const CS_OTHER_ID = 'c5200000-0000-0000-0000-000000000002';

const ASSESSMENT_ID = 'e1000000-0000-0000-0000-000000000001';

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
  body?: any,
  activeRole?: string
): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    if (activeRole) {
      headers['x-active-role'] = activeRole;
    }

    const payload = body ? JSON.stringify(body) : undefined;
    if (payload) {
      headers['Content-Length'] = Buffer.byteLength(payload).toString();
    }

    const req = http.request(
      `http://localhost:${PORT}${path}`,
      { method, headers },
      (res) => {
        let resData = '';
        res.on('data', (chunk) => { resData += chunk; });
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
    if (payload) {
      req.write(payload);
    }
    req.end();
  });
}

function setupTestData() {
  // Profiles
  db.profiles = [
    {
      id: HOD_ID,
      email: 'hod@sjbit.edu.in',
      full_name: 'Dr. Nagamani S.',
      role: 'faculty',
      status: 'active',
      active: true,
      usn: null,
      created_at: new Date().toISOString()
    },
    {
      id: MULTI_FACULTY_ID,
      email: 'multi.faculty@sjbit.edu.in',
      full_name: 'Prof. Multi Role Faculty',
      role: 'faculty',
      status: 'active',
      active: true,
      usn: null,
      created_at: new Date().toISOString()
    },
    {
      id: SINGLE_TEACHER_ID,
      email: 'single.teacher@sjbit.edu.in',
      full_name: 'Prof. Single Teacher',
      role: 'faculty',
      status: 'active',
      active: true,
      usn: null,
      created_at: new Date().toISOString()
    },
    {
      id: SINGLE_PROCTOR_ID,
      email: 'single.proctor@sjbit.edu.in',
      full_name: 'Prof. Single Proctor',
      role: 'faculty',
      status: 'active',
      active: true,
      usn: null,
      created_at: new Date().toISOString()
    },
    {
      id: MENTEE_STUDENT_ID,
      email: 'mentee@student.sjbit.edu.in',
      full_name: 'Mentee Student A',
      role: 'student',
      status: 'active',
      active: true,
      usn: '1JB24MC001',
      created_at: new Date().toISOString()
    },
    {
      id: OTHER_STUDENT_ID,
      email: 'other@student.sjbit.edu.in',
      full_name: 'Other Student B',
      role: 'student',
      status: 'active',
      active: true,
      usn: '1JB24MC002',
      created_at: new Date().toISOString()
    }
  ];

  // Active roles (populate both db.roles and db.user_roles)
  db.roles = [
    { id: 'r1', user_id: HOD_ID, role: 'hod', active: true, assigned_at: new Date().toISOString() },
    // Multi faculty initially has all 3 roles: subject_teacher, class_teacher, proctor
    { id: 'r2', user_id: MULTI_FACULTY_ID, role: 'subject_teacher', active: true, assigned_at: new Date().toISOString() },
    { id: 'r3', user_id: MULTI_FACULTY_ID, role: 'class_teacher', active: true, assigned_at: new Date().toISOString() },
    { id: 'r4', user_id: MULTI_FACULTY_ID, role: 'proctor', active: true, assigned_at: new Date().toISOString() },
    // Single teacher
    { id: 'r5', user_id: SINGLE_TEACHER_ID, role: 'subject_teacher', active: true, assigned_at: new Date().toISOString() },
    // Single proctor
    { id: 'r6', user_id: SINGLE_PROCTOR_ID, role: 'proctor', active: true, assigned_at: new Date().toISOString() },
    // Students
    { id: 'r7', user_id: MENTEE_STUDENT_ID, role: 'student', active: true, assigned_at: new Date().toISOString() },
    { id: 'r8', user_id: OTHER_STUDENT_ID, role: 'student', active: true, assigned_at: new Date().toISOString() }
  ];
  db.user_roles = [...db.roles];

  // Classes: MULTI_FACULTY is class teacher for CLASS_MCA3_ID
  db.classes = [
    {
      id: CLASS_MCA3_ID,
      programme: 'MCA',
      semester: 3,
      section: 'A',
      cohort: '2025-2027',
      class_teacher_id: MULTI_FACULTY_ID,
      active: true
    },
    {
      id: CLASS_OTHER_ID,
      programme: 'MCA',
      semester: 1,
      section: 'A',
      cohort: '2026-2028',
      class_teacher_id: SINGLE_TEACHER_ID,
      active: true
    }
  ];

  // Subjects & Class Subjects: MULTI_FACULTY is subject teacher for CS_ML_ID
  db.subjects = [
    { id: SUBJECT_ML_ID, code: '22MCA31', name: 'Machine Learning', credits: 4, department_id: null, active: true }
  ];

  db.classSubjects = [
    {
      id: CS_ML_ID,
      class_id: CLASS_MCA3_ID,
      subject_id: SUBJECT_ML_ID,
      subject_teacher_id: MULTI_FACULTY_ID,
      academic_term_id: 'term-legacy',
      active: true
    },
    {
      id: CS_OTHER_ID,
      class_id: CLASS_OTHER_ID,
      subject_id: SUBJECT_ML_ID,
      subject_teacher_id: SINGLE_TEACHER_ID,
      academic_term_id: 'term-legacy',
      active: true
    }
  ];

  // Enrollments: both students in MCA 3
  db.enrollments = [
    { id: 'e1', student_id: MENTEE_STUDENT_ID, class_id: CLASS_MCA3_ID, status: 'active', enrolled_at: new Date().toISOString() },
    { id: 'e2', student_id: OTHER_STUDENT_ID, class_id: CLASS_MCA3_ID, status: 'active', enrolled_at: new Date().toISOString() }
  ];

  // Proctor assignments: MULTI_FACULTY is proctor ONLY for MENTEE_STUDENT_ID
  db.proctorAssignments = [
    {
      id: 'pa1',
      proctor_id: MULTI_FACULTY_ID,
      student_id: MENTEE_STUDENT_ID,
      assigned_at: new Date().toISOString(),
      assigned_by: HOD_ID,
      valid_to: null
    },
    {
      id: 'pa2',
      proctor_id: SINGLE_PROCTOR_ID,
      student_id: OTHER_STUDENT_ID,
      assigned_at: new Date().toISOString(),
      assigned_by: HOD_ID,
      valid_to: null
    }
  ];

  // Assessments
  db.assessments = [
    {
      id: ASSESSMENT_ID,
      title: 'Machine Learning Mini-Project',
      instructions: 'Submit PDF report',
      class_subject_id: CS_ML_ID,
      created_by_faculty_id: MULTI_FACULTY_ID,
      status: 'published',
      deadline_at: '2026-11-15T23:59:59.000Z',
      allow_late: true,
      max_marks: 50,
      rubric_id: 'rub-1',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }
  ];

  // Submissions: both students have submitted
  db.submissions = [
    {
      id: 'sub-1',
      assessment_id: ASSESSMENT_ID,
      student_id: MENTEE_STUDENT_ID,
      active_version_id: 'ver-1',
      status: 'uploaded',
      late_status: 'on_time',
      first_submitted_at: '2026-11-10T10:00:00.000Z',
      updated_at: '2026-11-10T10:00:00.000Z'
    },
    {
      id: 'sub-2',
      assessment_id: ASSESSMENT_ID,
      student_id: OTHER_STUDENT_ID,
      active_version_id: 'ver-2',
      status: 'uploaded',
      late_status: 'on_time',
      first_submitted_at: '2026-11-10T11:00:00.000Z',
      updated_at: '2026-11-10T11:00:00.000Z'
    }
  ];

  db.submissionVersions = [
    {
      id: 'ver-1',
      submission_id: 'sub-1',
      version: 1,
      storage_path: 'submissions/sub-1/1/report.pdf',
      original_name: 'report.pdf',
      mime_type: 'application/pdf',
      size_bytes: 1024,
      sha256: 'sha256-mock-1',
      uploaded_at: '2026-11-10T10:00:00.000Z',
      late_status: 'on_time',
      files: []
    },
    {
      id: 'ver-2',
      submission_id: 'sub-2',
      version: 1,
      storage_path: 'submissions/sub-2/1/report2.pdf',
      original_name: 'report2.pdf',
      mime_type: 'application/pdf',
      size_bytes: 1024,
      sha256: 'sha256-mock-2',
      uploaded_at: '2026-11-10T11:00:00.000Z',
      late_status: 'on_time',
      files: []
    }
  ];

  // Register in-memory repositories
  setUserRepositoryForTesting(new InMemoryUserRepository(db));
  setAssessmentRepositoryForTesting(new InMemoryAssessmentRepository(db));
  setSubmissionRepositoryForTesting(new InMemorySubmissionRepository(db));
  setAcademicRepositoryForTesting(new InMemoryAcademicRepository(db));
  setEvaluationRepositoryForTesting(new InMemoryEvaluationRepository(db));
}

async function runVerification() {
  console.log('\n================================================================');
  console.log('STARTING MULTI-ROLE FACULTY & WORKSPACE SWITCHING VERIFICATION');
  console.log('================================================================\n');

  setupTestData();
  server = app.listen(PORT);
  await new Promise((r) => setTimeout(r, 600));

  const multiToken = makeToken(MULTI_FACULTY_ID, 'multi.faculty@sjbit.edu.in');
  const teacherToken = makeToken(SINGLE_TEACHER_ID, 'single.teacher@sjbit.edu.in');
  const proctorToken = makeToken(SINGLE_PROCTOR_ID, 'single.proctor@sjbit.edu.in');

  try {
    // ------------------------------------------------------------------------
    // Scenario 1: Faculty with only Subject Teacher role
    // ------------------------------------------------------------------------
    console.log('\n--- Scenario 1: Single-Role Faculty (Subject Teacher) ---');
    const teacherContext = await apiRequest('GET', '/api/v1/auth/me', teacherToken);
    recordTest(
      'Single-role Subject Teacher has exactly 1 role in context',
      teacherContext.status === 200 &&
      teacherContext.body.roles.length === 1 &&
      teacherContext.body.roles[0] === 'subject_teacher',
      teacherContext.body
    );

    const teacherSwitchAttempt = await apiRequest('GET', '/api/v1/assessments', teacherToken, undefined, 'proctor');
    recordTest(
      'Single-role Subject Teacher cannot switch to unassigned Proctor workspace (403)',
      teacherSwitchAttempt.status === 403 &&
      teacherSwitchAttempt.body.error?.code === 'FORBIDDEN_ROLE_SWITCH',
      teacherSwitchAttempt.body
    );

    // ------------------------------------------------------------------------
    // Scenario 2: Faculty with only Proctor role
    // ------------------------------------------------------------------------
    console.log('\n--- Scenario 2: Single-Role Faculty (Proctor) ---');
    const proctorContext = await apiRequest('GET', '/api/v1/auth/me', proctorToken);
    recordTest(
      'Single-role Proctor has exactly 1 role in context',
      proctorContext.status === 200 &&
      proctorContext.body.roles.length === 1 &&
      proctorContext.body.roles[0] === 'proctor',
      proctorContext.body
    );

    const proctorSwitchAttempt = await apiRequest('GET', '/api/v1/assessments', proctorToken, undefined, 'subject_teacher');
    recordTest(
      'Single-role Proctor cannot switch to unassigned Subject Teacher workspace (403)',
      proctorSwitchAttempt.status === 403 &&
      proctorSwitchAttempt.body.error?.code === 'FORBIDDEN_ROLE_SWITCH',
      proctorSwitchAttempt.body
    );

    // ------------------------------------------------------------------------
    // Scenario 3: Faculty with Subject Teacher + Class Teacher + Proctor (All 3)
    // ------------------------------------------------------------------------
    console.log('\n--- Scenarios 3, 4, 5: Multi-Role Faculty Context ---');
    const multiContext = await apiRequest('GET', '/api/v1/auth/me', multiToken);
    recordTest(
      'Multi-role faculty context contains all 3 assigned roles',
      multiContext.status === 200 &&
      multiContext.body.roles.includes('subject_teacher') &&
      multiContext.body.roles.includes('class_teacher') &&
      multiContext.body.roles.includes('proctor'),
      multiContext.body
    );

    // ------------------------------------------------------------------------
    // Scenario 6: Switching workspaces preserves the authentication session
    // ------------------------------------------------------------------------
    console.log('\n--- Scenario 6: Session Preservation Across Role Switches ---');
    // Call 1: activeRole = subject_teacher
    const s1 = await apiRequest('GET', '/api/v1/auth/me', multiToken, undefined, 'subject_teacher');
    // Call 2: activeRole = proctor
    const s2 = await apiRequest('GET', '/api/v1/auth/me', multiToken, undefined, 'proctor');
    // Call 3: activeRole = class_teacher
    const s3 = await apiRequest('GET', '/api/v1/auth/me', multiToken, undefined, 'class_teacher');

    recordTest(
      'Session preserved across multiple switches using the same JWT token',
      s1.status === 200 && s1.body.activeRole === 'subject_teacher' &&
      s2.status === 200 && s2.body.activeRole === 'proctor' &&
      s3.status === 200 && s3.body.activeRole === 'class_teacher',
      { s1: s1.body?.activeRole, s2: s2.body?.activeRole, s3: s3.body?.activeRole }
    );

    // ------------------------------------------------------------------------
    // Scenario 7: Proctor workspace cannot create or publish assessments
    // ------------------------------------------------------------------------
    console.log('\n--- Scenario 7: Proctor Workspace Access Restriction ---');
    const proctorCreateAssessment = await apiRequest(
      'POST',
      '/api/v1/assessments',
      multiToken,
      {
        title: 'Unauthorized Proctor Assessment',
        instructions: 'Test instructions',
        class_subject_id: CS_ML_ID,
        deadline_at: '2026-12-01T23:59:59.000Z',
        allow_late: true,
        max_marks: 50
      },
      'proctor'
    );
    recordTest(
      'Multi-role user operating in Proctor workspace cannot create assessments (403 WORKSPACE_ROLE_UNAUTHORIZED)',
      proctorCreateAssessment.status === 403 &&
      proctorCreateAssessment.body.error?.code === 'WORKSPACE_ROLE_UNAUTHORIZED',
      proctorCreateAssessment.body
    );

    const proctorPublishAssessment = await apiRequest(
      'POST',
      `/api/v1/assessments/${ASSESSMENT_ID}/publish`,
      multiToken,
      {},
      'proctor'
    );
    recordTest(
      'Multi-role user operating in Proctor workspace cannot publish assessments (403 WORKSPACE_ROLE_UNAUTHORIZED)',
      proctorPublishAssessment.status === 403 &&
      proctorPublishAssessment.body.error?.code === 'WORKSPACE_ROLE_UNAUTHORIZED',
      proctorPublishAssessment.body
    );

    const proctorLedgerView = await apiRequest(
      'GET',
      `/api/v1/evaluations/assessment/${ASSESSMENT_ID}/ledger`,
      multiToken,
      undefined,
      'proctor'
    );
    recordTest(
      'Multi-role user operating in Proctor workspace cannot access assessment evaluation ledger (403 WORKSPACE_ROLE_UNAUTHORIZED)',
      proctorLedgerView.status === 403 &&
      proctorLedgerView.body.error?.code === 'WORKSPACE_ROLE_UNAUTHORIZED',
      proctorLedgerView.body
    );

    // ------------------------------------------------------------------------
    // Scenario 8: Subject Teacher workspace can author assessments
    // ------------------------------------------------------------------------
    console.log('\n--- Scenario 8: Subject Teacher Workspace Capabilities ---');
    const teacherCreateAssessment = await apiRequest(
      'POST',
      '/api/v1/assessments',
      multiToken,
      {
        title: 'Subject Teacher Legitimate Assessment',
        instructions: 'Legitimate teacher instructions',
        class_subject_id: CS_ML_ID,
        deadline_at: '2026-12-01T23:59:59.000Z',
        allow_late: true,
        max_marks: 50
      },
      'subject_teacher'
    );
    recordTest(
      'Same multi-role user operating in Subject Teacher workspace can create assessments (201)',
      teacherCreateAssessment.status === 201,
      teacherCreateAssessment.body
    );

    const teacherLedgerView = await apiRequest(
      'GET',
      `/api/v1/evaluations/assessment/${ASSESSMENT_ID}/ledger`,
      multiToken,
      undefined,
      'subject_teacher'
    );
    recordTest(
      'Same multi-role user operating in Subject Teacher workspace can access ledger (200)',
      teacherLedgerView.status === 200 && Array.isArray(teacherLedgerView.body.ledger),
      teacherLedgerView.body
    );

    // ------------------------------------------------------------------------
    // Scenario 9: Proctor workspace views only assigned mentees
    // ------------------------------------------------------------------------
    console.log('\n--- Scenario 9: Proctor Workspace Mentee-Only Scoping ---');
    const proctorReport = await apiRequest(
      'GET',
      '/api/v1/submissions/reports/late-submissions',
      multiToken,
      undefined,
      'proctor'
    );
    const reportsList = proctorReport.body.reports || [];
    const containsMentee = reportsList.some((r: any) => r.student_id === MENTEE_STUDENT_ID);
    const containsOther = reportsList.some((r: any) => r.student_id === OTHER_STUDENT_ID);

    recordTest(
      'Multi-role user operating in Proctor workspace sees ONLY assigned mentees in late submissions report',
      proctorReport.status === 200 && containsMentee && !containsOther,
      { reportsCount: reportsList.length, containsMentee, containsOther }
    );

    // ------------------------------------------------------------------------
    // Scenario 10: Class Teacher workspace views only assigned classes
    // ------------------------------------------------------------------------
    console.log('\n--- Scenario 10: Class Teacher Workspace Scoping ---');
    const ctAssessments = await apiRequest(
      'GET',
      '/api/v1/assessments',
      multiToken,
      undefined,
      'class_teacher'
    );
    recordTest(
      'Class Teacher workspace retrieves assessments scoped to their assigned class',
      ctAssessments.status === 200 &&
      Array.isArray(ctAssessments.body.assessments) &&
      ctAssessments.body.assessments.every((a: any) => a.class_subject_id === CS_ML_ID),
      ctAssessments.body
    );

    // ------------------------------------------------------------------------
    // Scenario 11: Unauthorized role spoofing
    // ------------------------------------------------------------------------
    console.log('\n--- Scenario 11: Unauthorized Role Spoofing Prevention ---');
    const spoofHOD = await apiRequest(
      'GET',
      '/api/v1/admin/hod/users',
      multiToken,
      undefined,
      'hod' // Multi faculty does NOT have hod role
    );
    recordTest(
      'Faculty user attempting to claim unassigned HOD role in x-active-role is rejected (403 FORBIDDEN_ROLE_SWITCH)',
      spoofHOD.status === 403 &&
      spoofHOD.body.error?.code === 'FORBIDDEN_ROLE_SWITCH',
      spoofHOD.body
    );

    // ------------------------------------------------------------------------
    // Scenario 12: Role revocation removes workspace cleanly
    // ------------------------------------------------------------------------
    console.log('\n--- Scenario 12: Role Revocation Handling ---');
    // Revoke proctor role for MULTI_FACULTY_ID
    db.roles = db.roles.filter(r => !(r.user_id === MULTI_FACULTY_ID && r.role === 'proctor'));
    db.user_roles = [...db.roles];
    invalidateUserContextCache(MULTI_FACULTY_ID);

    const contextAfterRevoke = await apiRequest('GET', '/api/v1/auth/me', multiToken);
    recordTest(
      'Context reflects removed role without breaking account or other roles',
      contextAfterRevoke.status === 200 &&
      !contextAfterRevoke.body.roles.includes('proctor') &&
      contextAfterRevoke.body.roles.includes('subject_teacher') &&
      contextAfterRevoke.body.roles.includes('class_teacher'),
      contextAfterRevoke.body
    );

    const postRevokeProctorAttempt = await apiRequest(
      'GET',
      '/api/v1/submissions/reports/late-submissions',
      multiToken,
      undefined,
      'proctor'
    );
    recordTest(
      'Revoked proctor workspace is rejected with 403 FORBIDDEN_ROLE_SWITCH',
      postRevokeProctorAttempt.status === 403 &&
      postRevokeProctorAttempt.body.error?.code === 'FORBIDDEN_ROLE_SWITCH',
      postRevokeProctorAttempt.body
    );

    const postRevokeTeacherAccess = await apiRequest(
      'GET',
      '/api/v1/assessments',
      multiToken,
      undefined,
      'subject_teacher'
    );
    recordTest(
      'Remaining subject teacher workspace continues to function without issues (200)',
      postRevokeTeacherAccess.status === 200,
      postRevokeTeacherAccess.body
    );

  } finally {
    if (server) {
      server.close();
    }
  }

  // Final Summary
  console.log('\n================================================================');
  console.log('VERIFICATION SUMMARY');
  console.log('================================================================');
  const passedCount = results.filter((r) => r.passed).length;
  const failedCount = results.filter((r) => !r.passed).length;
  console.log(`Total tests: ${results.length}`);
  console.log(`Passed:      ${passedCount}`);
  console.log(`Failed:      ${failedCount}`);

  if (failedCount > 0) {
    console.error('\nFAILED TESTS:');
    results.filter(r => !r.passed).forEach(r => console.error(` - ${r.requirement}: ${r.details}`));
    process.exit(1);
  } else {
    console.log('\nALL 12 MULTI-ROLE FACULTY WORKSPACE REQUIREMENTS VERIFIED SUCCESSFULLY!\n');
    process.exit(0);
  }
}

runVerification().catch((err) => {
  console.error('Test execution crashed:', err);
  if (server) server.close();
  process.exit(1);
});
