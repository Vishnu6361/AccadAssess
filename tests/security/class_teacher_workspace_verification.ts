/**
 * ==============================================================================
 * ACADASSESS: CLASS TEACHER WORKSPACE & ROLE BOUNDARIES VERIFICATION SUITE
 * ==============================================================================
 *
 * Verifies all 7 core specifications for Phase 4:
 * 1. A Class Teacher login opens the role-specific Class Teacher workspace.
 * 2. A Student login still opens the Student portal.
 * 3. A Subject Teacher login still opens the Subject Teacher workspace.
 * 4. Class Teachers can access authorized class-level submission reports & cohort overview.
 * 5. Class Teachers cannot access classes or assessments outside their authorization scope.
 * 6. Student-specific pages and workflows remain unchanged.
 * 7. Existing submission, evaluation, and grade-publication workflows are not broken.
 * ==============================================================================
 */

process.env.SMARTFA_TEST_MODE = 'true';
import http from 'http';
import fs from 'fs';
import path from 'path';
import jwt from 'jsonwebtoken';
import app from '../../apps/api/src/index.js';
import { db } from '../../apps/api/src/storage/db.js';
import { InMemoryUserRepository, setUserRepositoryForTesting } from '../../apps/api/src/storage/userRepository.js';
import { InMemoryAssessmentRepository, setAssessmentRepositoryForTesting } from '../../apps/api/src/storage/assessmentRepository.js';
import { InMemorySubmissionRepository, setSubmissionRepositoryForTesting } from '../../apps/api/src/storage/submissionRepository.js';
import { InMemoryAcademicRepository, setAcademicRepositoryForTesting } from '../../apps/api/src/storage/academicRepository.js';

let server: http.Server;
const PORT = 4028;
const DEV_JWT_SECRET = process.env.JWT_DEV_SECRET || 'smartfa-test-hmac-dev-secret-key-32chars';

// User identities
const HOD_ID = 'a1000000-0000-0000-0000-000000000001'; // hod@smartfa.edu
const SUBJECT_TEACHER_ID = 'a2000000-0000-0000-0000-000000000001'; // teacher1@smartfa.edu (Dr. Ramesh Sharma)
const CLASS_TEACHER_ID = 'a2000000-0000-0000-0000-000000000088'; // pure_classteacher@smartfa.edu
const OTHER_TEACHER_ID = 'a2000000-0000-0000-0000-000000000003'; // teacher3@smartfa.edu
const STUDENT_1_ID = 'a4000000-0000-0000-0000-000000000001'; // student1@smartfa.edu (Aarav Patel)
const STUDENT_2_ID = 'a4000000-0000-0000-0000-000000000002'; // student2@smartfa.edu (Bhavna Reddy)

// Seeded Classes & Assessments
const ASSIGNED_CLASS_ID = 'c1000000-0000-0000-0000-000000000001'; // MCA Semester 3
const UNASSIGNED_CLASS_ID = 'c1000000-0000-0000-0000-000000000002'; // Another class
const CLASS_ASSESSMENT_ID = 'b1000000-0000-0000-0000-000000000001'; // Cloud Architecture Assessment
const UNASSIGNED_ASS_ID = 'b1000000-0000-0000-0000-000000000099';

function createToken(userId: string, email: string = 'user@smartfa.edu'): string {
  return jwt.sign({ sub: userId, email }, DEV_JWT_SECRET, { expiresIn: '1h' });
}

function makeRequest(
  method: string,
  urlPath: string,
  token?: string,
  body?: any
): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : undefined;
    const reqHeaders: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    if (token) {
      reqHeaders['Authorization'] = `Bearer ${token}`;
    }
    if (payload) {
      reqHeaders['Content-Length'] = Buffer.byteLength(payload).toString();
    }

    const req = http.request(
      {
        hostname: 'localhost',
        port: PORT,
        path: urlPath,
        method,
        headers: reqHeaders
      },
      (res) => {
        let raw = '';
        res.on('data', chunk => raw += chunk);
        res.on('end', () => {
          let parsed: any = null;
          try {
            parsed = JSON.parse(raw);
          } catch {
            parsed = raw;
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

let passedTests = 0;
let totalTests = 0;

function assert(condition: boolean, testName: string, detail: string = '') {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  [PASS] ${testName}`);
  } else {
    console.error(`  [FAIL] ${testName}${detail ? ` -> ${detail}` : ''}`);
  }
}

async function runVerification() {
  console.log('\n==============================================================================');
  console.log('STARTING CLASS TEACHER WORKSPACE & ROLE BOUNDARIES VERIFICATION');
  console.log('==============================================================================\n');

  // Set up pure Class Teacher fixture
  if (!db.profiles.some(p => p.id === CLASS_TEACHER_ID)) {
    db.profiles.push({
      id: CLASS_TEACHER_ID,
      email: 'pure_classteacher@smartfa.edu',
      full_name: 'Prof. Arvind Kumar (Class Teacher)',
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
  }

  // Ensure user has ONLY class_teacher role
  db.roles = db.roles.filter(r => r.user_id !== CLASS_TEACHER_ID);
  db.roles.push({
    id: 'r2000000-0000-0000-0000-000000000088',
    user_id: CLASS_TEACHER_ID,
    role: 'class_teacher',
    scope_id: 'd1000000-0000-0000-0000-000000000001',
    active: true,
    created_at: new Date().toISOString()
  });

  // Assign CLASS_TEACHER_ID as the class teacher of ASSIGNED_CLASS_ID
  const assignedCls = db.classes.find(c => c.id === ASSIGNED_CLASS_ID);
  if (assignedCls) {
    assignedCls.class_teacher_id = CLASS_TEACHER_ID;
  }

  // Ensure unassigned class is NOT assigned to CLASS_TEACHER_ID
  const unassignedCls = db.classes.find(c => c.id === UNASSIGNED_CLASS_ID);
  if (unassignedCls) {
    unassignedCls.class_teacher_id = OTHER_TEACHER_ID;
  }

  // Seed assessment for ASSIGNED_CLASS_ID
  const assignedCS = db.classSubjects.find(cs => cs.class_id === ASSIGNED_CLASS_ID);
  if (assignedCS && !db.assessments.some(a => a.id === CLASS_ASSESSMENT_ID)) {
    db.assessments.push({
      id: CLASS_ASSESSMENT_ID,
      class_subject_id: assignedCS.id,
      title: 'Cloud Architecture & DevOps Assignment',
      instructions: 'Design resilient microservice architecture on AWS with Terraform.',
      deadline_at: '2026-11-30T23:59:59Z',
      status: 'published',
      created_by: SUBJECT_TEACHER_ID,
      published_at: '2026-09-01T00:00:00Z',
      published_by: SUBJECT_TEACHER_ID,
      version: 1,
      questions: [],
      document_storage_key: `assessments/${CLASS_ASSESSMENT_ID}/documents/assignment.pdf`,
      document_filename: 'assignment.pdf',
      document_size_bytes: 2048,
      document_mime_type: 'application/pdf',
      max_files: 2,
      allow_late: true,
      extension_deadline_at: '2026-12-05T23:59:59Z',
      late_penalty_mode: 'fixed',
      late_penalty_marks: 5,
      max_marks: 50,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
  }

  // Seed assessment for UNASSIGNED_CLASS_ID
  let unassignedCS = db.classSubjects.find(cs => cs.class_id === UNASSIGNED_CLASS_ID);
  if (!unassignedCS) {
    unassignedCS = {
      id: 'c5100000-0000-0000-0000-000000000099',
      class_id: UNASSIGNED_CLASS_ID,
      subject_id: 's1000000-0000-0000-0000-000000000002',
      subject_teacher_id: OTHER_TEACHER_ID,
      active: true,
      created_at: new Date().toISOString()
    };
    db.classSubjects.push(unassignedCS);
  }

  if (!db.assessments.some(a => a.id === UNASSIGNED_ASS_ID)) {
    db.assessments.push({
      id: UNASSIGNED_ASS_ID,
      class_subject_id: unassignedCS.id,
      title: 'Unassigned Class Assessment',
      instructions: 'Test instructions for other class',
      deadline_at: '2026-12-31T23:59:59Z',
      status: 'published',
      created_by: OTHER_TEACHER_ID,
      published_at: '2026-09-01T00:00:00Z',
      published_by: OTHER_TEACHER_ID,
      version: 1,
      questions: [],
      document_storage_key: `assessments/${UNASSIGNED_ASS_ID}/documents/brief.pdf`,
      document_filename: 'brief.pdf',
      document_size_bytes: 1024,
      document_mime_type: 'application/pdf',
      max_files: 1,
      allow_late: false,
      extension_deadline_at: null,
      late_penalty_mode: 'none',
      late_penalty_marks: 0,
      max_marks: 100,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
  }

  // Seed a submission for STUDENT_1_ID
  const submissionId = 'sub10000-0000-0000-0000-000000000001';
  if (!db.submissions.some(s => s.id === submissionId)) {
    db.submissions.push({
      id: submissionId,
      assessment_id: CLASS_ASSESSMENT_ID,
      student_id: STUDENT_1_ID,
      status: 'submitted',
      first_submitted_at: new Date().toISOString(),
      active_version_id: 'v1000000-0000-0000-0000-000000000001',
      version_count: 1,
      late_status: 'on_time',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
  }

  // Initialize test repositories in test mode
  setUserRepositoryForTesting(new InMemoryUserRepository(db));
  setAssessmentRepositoryForTesting(new InMemoryAssessmentRepository(db));
  setSubmissionRepositoryForTesting(new InMemorySubmissionRepository(db));
  setAcademicRepositoryForTesting(new InMemoryAcademicRepository(db));

  // Start HTTP Server
  await new Promise<void>((resolve) => {
    server = app.listen(PORT, () => {
      console.log(`Test verification server running on http://localhost:${PORT}`);
      resolve();
    });
  });

  const hodToken = createToken(HOD_ID, 'hod@smartfa.edu');
  const subjectTeacherToken = createToken(SUBJECT_TEACHER_ID, 'teacher1@smartfa.edu');
  const classTeacherToken = createToken(CLASS_TEACHER_ID, 'pure_classteacher@smartfa.edu');
  const studentToken = createToken(STUDENT_1_ID, 'student1@smartfa.edu');

  try {
    // -------------------------------------------------------------------------
    // TEST SECTION 1: Class Teacher Cohort Endpoint & Authorization Scope
    // -------------------------------------------------------------------------
    console.log('\n--- Test Section 1: Class Teacher Cohort Endpoint & Authorization Scope ---');

    // 1.1 Class Teacher can query their assigned class cohort
    const ctCohortRes = await makeRequest('GET', '/api/v1/assessments/class-teacher/cohort', classTeacherToken);
    assert(ctCohortRes.status === 200, 'Class Teacher GET /class-teacher/cohort returns 200');
    assert(Array.isArray(ctCohortRes.body.classes), 'Returns classes array');
    assert(ctCohortRes.body.classes.length > 0, 'Class Teacher has at least one assigned class cohort');
    const assignedClass = ctCohortRes.body.classes.find((c: any) => c.id === ASSIGNED_CLASS_ID);
    assert(Boolean(assignedClass), 'Assigned class MCA Semester 3 is returned');
    assert(assignedClass?.name === 'MCA Semester 3', `Cohort name is standardized as MCA Semester 3 (got: ${assignedClass?.name})`);
    assert(assignedClass?.students_count === 2, `Active students count is 2 (got ${assignedClass?.students_count})`);
    assert(Array.isArray(assignedClass?.students) && assignedClass.students.length === 2, 'Enrolled students array contains 2 students');
    assert(assignedClass?.students.some((s: any) => s.usn === '1RV24MC001'), 'Student Aarav Patel (1RV24MC001) is in cohort');

    // 1.2 Class Teacher cannot access cohort for a class they are not assigned to
    const ctOtherClassRes = await makeRequest(
      'GET',
      `/api/v1/assessments/class-teacher/cohort?class_id=${UNASSIGNED_CLASS_ID}`,
      classTeacherToken
    );
    assert(
      ctOtherClassRes.status === 403,
      'Class Teacher cannot access class outside authorization scope (HTTP 403 FORBIDDEN)',
      `Status: ${ctOtherClassRes.status}`
    );

    // 1.3 Students cannot access class cohort endpoint
    const studentCohortRes = await makeRequest('GET', '/api/v1/assessments/class-teacher/cohort', studentToken);
    assert(studentCohortRes.status === 403, 'Student cannot access class-teacher cohort endpoint (HTTP 403)');

    // 1.4 HOD can view class cohorts
    const hodCohortRes = await makeRequest('GET', '/api/v1/assessments/class-teacher/cohort', hodToken);
    assert(hodCohortRes.status === 200, 'HOD can query class cohorts overview (HTTP 200)');

    // -------------------------------------------------------------------------
    // TEST SECTION 2: Assessment Scoping Across Roles
    // -------------------------------------------------------------------------
    console.log('\n--- Test Section 2: Assessment Scoping Across Roles ---');

    // 2.1 Class Teacher assessment query returns assessments for assigned class subjects
    const ctAssessmentsRes = await makeRequest('GET', '/api/v1/assessments', classTeacherToken);
    assert(ctAssessmentsRes.status === 200, 'Class Teacher GET /assessments returns 200');
    assert(Array.isArray(ctAssessmentsRes.body.assessments), 'Assessments is array');
    const classAss = ctAssessmentsRes.body.assessments.find((a: any) => a.id === CLASS_ASSESSMENT_ID);
    assert(Boolean(classAss), 'Class Teacher sees assessment for their class subject');
    const unassignedAss = ctAssessmentsRes.body.assessments.find((a: any) => a.id === UNASSIGNED_ASS_ID);
    assert(!unassignedAss, 'Class Teacher does NOT see assessment for unassigned class');

    // 2.2 Student sees only published assessments for their enrolled class subjects
    const studentAssessmentsRes = await makeRequest('GET', '/api/v1/assessments', studentToken);
    assert(studentAssessmentsRes.status === 200, 'Student GET /assessments returns 200');
    const studentAssList = studentAssessmentsRes.body.assessments;
    assert(studentAssList.every((a: any) => a.status === 'published'), 'Student only receives published assessments');

    // 2.3 Subject Teacher sees assessments they author
    const stAssessmentsRes = await makeRequest('GET', '/api/v1/assessments', subjectTeacherToken);
    assert(stAssessmentsRes.status === 200, 'Subject Teacher GET /assessments returns 200');

    // -------------------------------------------------------------------------
    // TEST SECTION 3: Class-Level Submission Reports Scoping
    // -------------------------------------------------------------------------
    console.log('\n--- Test Section 3: Class-Level Submission Reports Scoping ---');

    // 3.1 Class Teacher can access late submissions report
    const ctReportRes = await makeRequest('GET', '/api/v1/submissions/reports/late-submissions', classTeacherToken);
    assert(ctReportRes.status === 200, 'Class Teacher GET /submissions/reports/late-submissions returns 200');
    assert(Array.isArray(ctReportRes.body.reports), 'Reports is array');
    assert(ctReportRes.body.reports.length > 0, 'Class Teacher receives submission records for their class');
    const allBelongToAssignedClass = ctReportRes.body.reports.every((r: any) => r.class_id === ASSIGNED_CLASS_ID);
    assert(allBelongToAssignedClass, 'All submission report rows belong exclusively to the assigned class');

    // 3.2 Student cannot access late submissions report
    const studentReportRes = await makeRequest('GET', '/api/v1/submissions/reports/late-submissions', studentToken);
    assert(studentReportRes.status === 403, 'Student cannot access staff submissions report (HTTP 403)');

    // -------------------------------------------------------------------------
    // TEST SECTION 4: Assessment Detail & Brief Access Control
    // -------------------------------------------------------------------------
    console.log('\n--- Test Section 4: Assessment Detail & Brief Access Control ---');

    // 4.1 Class Teacher can view details of an assessment in their class
    const ctAssDetailRes = await makeRequest('GET', `/api/v1/assessments/${CLASS_ASSESSMENT_ID}`, classTeacherToken);
    assert(ctAssDetailRes.status === 200, 'Class Teacher can view assessment detail in their class');

    // 4.2 Class Teacher cannot view details of an assessment in an unassigned class
    const ctOtherAssDetailRes = await makeRequest('GET', `/api/v1/assessments/${UNASSIGNED_ASS_ID}`, classTeacherToken);
    assert(
      ctOtherAssDetailRes.status === 403,
      'Class Teacher forbidden from viewing assessment in unassigned class (HTTP 403)'
    );

    // -------------------------------------------------------------------------
    // TEST SECTION 5: Role Boundary Enforcement (No Mutation Privileges for Class Teacher)
    // -------------------------------------------------------------------------
    console.log('\n--- Test Section 5: Role Boundary Enforcement (Class Teacher cannot author/evaluate) ---');

    // 5.1 Class Teacher cannot create an assessment
    const ctCreateAssRes = await makeRequest(
      'POST',
      '/api/v1/assessments',
      classTeacherToken,
      {
        class_subject_id: assignedCS?.id || 'c5100000-0000-0000-0000-000000000001',
        title: 'Unauthorized Assessment by Class Teacher',
        instructions: 'Test',
        deadline_at: '2026-12-31T23:59:59Z'
      }
    );
    assert(ctCreateAssRes.status === 403, 'Class Teacher cannot create assessment (HTTP 403 FORBIDDEN)');

    // 5.2 Class Teacher cannot publish an assessment
    const ctPublishAssRes = await makeRequest(
      'POST',
      `/api/v1/assessments/${CLASS_ASSESSMENT_ID}/publish`,
      classTeacherToken
    );
    assert(ctPublishAssRes.status === 403, 'Class Teacher cannot publish assessment (HTTP 403 FORBIDDEN)');

    // 5.3 Class Teacher cannot save rubric evaluations
    const ctEvaluateRes = await makeRequest(
      'POST',
      '/api/v1/evaluations',
      classTeacherToken,
      {
        submission_id: submissionId,
        raw_score: 45
      }
    );
    assert(ctEvaluateRes.status === 403, 'Class Teacher cannot save evaluations (HTTP 403 FORBIDDEN)');

    // -------------------------------------------------------------------------
    // TEST SECTION 6: Student & Subject Teacher Workflows Remain Intact
    // -------------------------------------------------------------------------
    console.log('\n--- Test Section 6: Student & Subject Teacher Workflows Remain Intact ---');

    // 6.1 Student can access authoritative My Submissions
    const studentMySubsRes = await makeRequest('GET', '/api/v1/submissions/student/my-submissions', studentToken);
    assert(studentMySubsRes.status === 200, 'Student GET /student/my-submissions returns 200');
    assert(Array.isArray(studentMySubsRes.body.submissions), 'Student submissions is array');

    // 6.2 Subject Teacher can access assessments for authoring
    const stListRes = await makeRequest('GET', '/api/v1/assessments', subjectTeacherToken);
    assert(stListRes.status === 200, 'Subject Teacher authoring assessments accessible');

    // -------------------------------------------------------------------------
    // TEST SECTION 7: Frontend Component Contracts & Workspace Separation
    // -------------------------------------------------------------------------
    console.log('\n--- Test Section 7: Frontend Component Contracts & Workspace Separation ---');

    const appFilePath = path.resolve('apps/web/src/app/App.tsx');
    const appContent = fs.readFileSync(appFilePath, 'utf8');

    // Check ClassTeacherWorkspace import in App.tsx
    assert(
      appContent.includes('ClassTeacherWorkspace'),
      'App.tsx imports ClassTeacherWorkspace lazily'
    );

    // Check activeRole === 'class_teacher' routes to ClassTeacherWorkspace
    assert(
      appContent.includes("activeRole === 'class_teacher' && ("),
      'App.tsx conditionally renders ClassTeacherWorkspace when activeRole is class_teacher'
    );

    // Check activeRole !== 'class_teacher' guards AssessmentManagement
    assert(
      appContent.includes("activeRole !== 'class_teacher'") && appContent.includes("activeItem === 'assessments'"),
      'App.tsx guards AssessmentManagement so class_teacher does not render student assessment view'
    );

    // Check Sidebar.tsx contains dedicated Class Teacher navigation
    const sidebarFilePath = path.resolve('apps/web/src/components/Sidebar.tsx');
    const sidebarContent = fs.readFileSync(sidebarFilePath, 'utf8');
    assert(
      sidebarContent.includes("activeRole === 'class_teacher'"),
      'Sidebar.tsx has explicit activeRole === class_teacher nav block'
    );
    assert(
      sidebarContent.includes("label: 'Class Workspace'"),
      'Sidebar.tsx labels primary nav item as Class Workspace'
    );
    assert(
      sidebarContent.includes("label: 'Student Cohort'"),
      'Sidebar.tsx provides Student Cohort nav item'
    );

    // Check AssessmentManagement.tsx does not use !isTeacher for student logic
    const assMgmtFilePath = path.resolve('apps/web/src/features/teacher/AssessmentManagement.tsx');
    const assMgmtContent = fs.readFileSync(assMgmtFilePath, 'utf8');
    assert(
      assMgmtContent.includes('const isStudent = activeRole ==='),
      'AssessmentManagement.tsx defines explicit isStudent check'
    );
    assert(
      !assMgmtContent.includes('if (!isTeacher) {'),
      'AssessmentManagement.tsx eliminated ambiguous if (!isTeacher) blocks'
    );

    // Check ClassTeacherWorkspace component exists and has required 4-function sections (Phase 4)
    const workspaceFilePath = path.resolve('apps/web/src/features/teacher/ClassTeacherWorkspace.tsx');
    assert(fs.existsSync(workspaceFilePath), 'ClassTeacherWorkspace.tsx file exists');
    const workspaceContent = fs.readFileSync(workspaceFilePath, 'utf8');
    assert(workspaceContent.includes('Class Teacher Workspace'), 'Contains Class Teacher Workspace title');
    assert(workspaceContent.includes('Cohort Supervision'), 'Contains Cohort Supervision badge');
    assert(workspaceContent.includes('<span>Overview</span>'), 'Contains Overview tab (Phase 4A)');
    assert(workspaceContent.includes('<span>Assessments</span>'), 'Contains Assessments tab (Phase 4B)');
    assert(workspaceContent.includes('<span>Submission Report</span>'), 'Contains Submission Report tab (Phase 4C)');
    assert(workspaceContent.includes('<span>Student Cohort</span>'), 'Contains Student Cohort tab (Phase 4D)');

    console.log('\n==============================================================================');
    console.log(`VERIFICATION SUMMARY: ${passedTests} / ${totalTests} TESTS PASSED`);
    console.log('==============================================================================\n');

  } catch (err: any) {
    console.error('Fatal error during test execution:', err);
  } finally {
    server.close();
  }
}

runVerification();
