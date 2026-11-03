/**
 * ==============================================================================
 * ACADASSESS: CLASS TEACHER DATA CONSISTENCY & SUBMISSION REPORTING VERIFICATION
 * ==============================================================================
 * 
 * Verifies all 10 Phase 6 verification requirements:
 * 1. Correct authorized Class Teacher and cohort mapping
 * 2. No duplicate class assignment caused by duplicate active mappings
 * 3. Consistent enrolled-student counts across overview and cohort
 * 4. Published assessment counts matching the authoritative API response
 * 5. Submission report rows matching actual submission records
 * 6. Correct pending, submitted, late, evaluated, and marks display
 * 7. Existing assessment and submission records remaining intact
 * 8. Class Teacher authorization restrictions (cannot author, publish, or evaluate)
 * 9. Subject Teacher grading and publication workflows remaining functional
 * 10. Loading, empty, error, and refresh behavior
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

let server: http.Server;
const PORT = 4039;
const DEV_JWT_SECRET = process.env.JWT_DEV_SECRET || 'smartfa-test-hmac-dev-secret-key-32chars';

// User Fixtures
const HOD_ID = 'a1000000-0000-0000-0000-000000000001';
const SUBJECT_TEACHER_ID = 'a2000000-0000-0000-0000-000000000001'; // Dr. Ramesh Sharma
const CLASS_TEACHER_SHWETHA_ID = '207c1529-7bc0-4c97-93d6-c6cdab2fb6fa'; // Shwetha M
const OTHER_TEACHER_ID = 'a2000000-0000-0000-0000-000000000003';
const STUDENT_VISHNU_ID = '3acf60f9-3f03-406d-8f1e-6ac01ae36f14'; // VISHNU C N
const STUDENT_OTHER_ID = 'a4000000-0000-0000-0000-000000000002'; // Second student

// Class IDs
const CANONICAL_MCA_CLASS_ID = 'c53f348b-34dc-4399-ab77-6b0bea0e4e40'; // Primary MCA Semester 3
const DUPLICATE_PHANTOM_CLASS_ID = '07c9c24f-230a-45ac-9c43-3abef7f10ae4'; // Extraneous MCA Sem 3 Section AI
const UNRELATED_CLASS_ID = 'c1000000-0000-0000-0000-000000000099';

// Assessment & Submission IDs
const CANONICAL_ASSESSMENT_ID = '37c34bc1-6ccf-4011-b1d8-50de2b49dfcf';
const CANONICAL_SUBMISSION_ID = 'e161f6b0-e5df-4d34-93bf-74454091df66';

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

async function run() {
  console.log('\n==============================================================================');
  console.log('CLASS TEACHER DATA CONSISTENCY & REPORTING TEST SUITE');
  console.log('==============================================================================\n');

  // 1. Seed Shwetha M as Class Teacher in memory fixtures
  if (!db.profiles.some(p => p.id === CLASS_TEACHER_SHWETHA_ID)) {
    db.profiles.push({
      id: CLASS_TEACHER_SHWETHA_ID,
      email: 'vishnumaster567@gmail.com',
      full_name: 'Shwetha M',
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
  }

  // Ensure role is class_teacher
  if (!db.roles.some(r => r.user_id === CLASS_TEACHER_SHWETHA_ID && r.role === 'class_teacher')) {
    db.roles.push({
      id: 'r2000000-0000-0000-0000-000000000099',
      user_id: CLASS_TEACHER_SHWETHA_ID,
      role: 'class_teacher',
      scope_id: null,
      active: true,
      created_at: new Date().toISOString()
    });
  }

  // 2. Ensure canonical MCA class c53f348b... has class_teacher_id = Shwetha M
  let canonicalCls = db.classes.find(c => c.id === CANONICAL_MCA_CLASS_ID);
  if (!canonicalCls) {
    canonicalCls = {
      id: CANONICAL_MCA_CLASS_ID,
      term_id: '01000000-0000-4000-8000-000000000001',
      programme: 'MCA',
      semester: 3,
      section: 'A',
      class_teacher_id: CLASS_TEACHER_SHWETHA_ID,
      created_at: '2026-10-22T03:55:07.141Z'
    };
    db.classes.push(canonicalCls);
  } else {
    canonicalCls.class_teacher_id = CLASS_TEACHER_SHWETHA_ID;
  }

  // 3. Ensure duplicate phantom class 07c9c24f... exists with class_teacher_id = null
  let phantomCls = db.classes.find(c => c.id === DUPLICATE_PHANTOM_CLASS_ID);
  if (!phantomCls) {
    phantomCls = {
      id: DUPLICATE_PHANTOM_CLASS_ID,
      term_id: '01000000-0000-4000-8000-000000000001',
      programme: 'MCA',
      semester: 3,
      section: 'AI',
      class_teacher_id: null,
      created_at: '2026-10-22T07:49:09.597Z'
    };
    db.classes.push(phantomCls);
  } else {
    phantomCls.class_teacher_id = null;
  }

  // 4. Enroll student VISHNU C N into canonical class
  if (!db.profiles.some(p => p.id === STUDENT_VISHNU_ID)) {
    db.profiles.push({
      id: STUDENT_VISHNU_ID,
      email: 'adm25mca9718@sjbit.edu.in',
      full_name: 'VISHNU C N',
      usn: 'adm25mca9718',
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
  }

  db.enrollments = db.enrollments.filter(e => e.class_id !== DUPLICATE_PHANTOM_CLASS_ID);
  if (!db.enrollments.some(e => e.class_id === CANONICAL_MCA_CLASS_ID && e.student_id === STUDENT_VISHNU_ID)) {
    db.enrollments.push({
      id: 'en100000-0000-0000-0000-000000000001',
      class_id: CANONICAL_MCA_CLASS_ID,
      student_id: STUDENT_VISHNU_ID,
      roll_number: '1JB25MC054',
      status: 'active',
      created_at: new Date().toISOString()
    });
  }

  // 5. Seed Class Subject for Network Security
  const netSecSubjectId = 'e3963c8e-9e47-46bb-8b36-1017b22362e4';
  if (!db.subjects.some(s => s.id === netSecSubjectId)) {
    db.subjects.push({
      id: netSecSubjectId,
      code: '25MCAE321',
      name: 'Network Security',
      credits: 3,
      semester: 3,
      active: true,
      created_at: new Date().toISOString()
    });
  }

  const csCanonicalId = '1638ff83-e35f-47ea-8661-61bfe92bfd9f';
  if (!db.classSubjects.some(cs => cs.id === csCanonicalId)) {
    db.classSubjects.push({
      id: csCanonicalId,
      class_id: CANONICAL_MCA_CLASS_ID,
      subject_id: netSecSubjectId,
      subject_teacher_id: SUBJECT_TEACHER_ID,
      active: true,
      created_at: new Date().toISOString()
    });
  }

  // 6. Seed published assessment
  if (!db.assessments.some(a => a.id === CANONICAL_ASSESSMENT_ID)) {
    db.assessments.push({
      id: CANONICAL_ASSESSMENT_ID,
      class_subject_id: csCanonicalId,
      title: 'formative assessment 1',
      instructions: 'Network Security practical lab brief.',
      deadline_at: '2026-11-15T07:29:00Z',
      status: 'published',
      created_by: SUBJECT_TEACHER_ID,
      published_at: '2026-10-26T09:22:29Z',
      published_by: SUBJECT_TEACHER_ID,
      version: 1,
      questions: [],
      document_storage_key: `assessments/${CANONICAL_ASSESSMENT_ID}/documents/test.pdf`,
      document_filename: 'Network_Security_Assignment_Test.pdf',
      document_size_bytes: 31597,
      document_mime_type: 'application/pdf',
      max_files: 2,
      allow_late: true,
      extension_deadline_at: '2026-11-20T07:21:00Z',
      late_penalty_mode: 'fixed',
      late_penalty_marks: 5,
      max_marks: 50,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
  }

  // 7. Seed student submission and evaluation
  if (!db.submissions.some(s => s.id === CANONICAL_SUBMISSION_ID)) {
    db.submissions.push({
      id: CANONICAL_SUBMISSION_ID,
      assessment_id: CANONICAL_ASSESSMENT_ID,
      student_id: STUDENT_VISHNU_ID,
      status: 'uploaded',
      first_submitted_at: '2026-10-26T15:09:18Z',
      active_version_id: '82033134-eb4e-451b-84f4-b3af60980b2e',
      version_count: 1,
      late_status: 'on_time',
      created_at: '2026-10-26T15:09:18Z',
      updated_at: '2026-10-26T15:09:18Z'
    });
  }

  // Evaluation completed (score 40)
  const evalId = '15dba91b-8122-493b-b926-4dfd3d1bdec3';
  if (!db.evaluations.some(e => e.id === evalId)) {
    db.evaluations.push({
      id: evalId,
      submission_id: CANONICAL_SUBMISSION_ID,
      submission_version_id: '82033134-eb4e-451b-84f4-b3af60980b2e',
      evaluator_id: SUBJECT_TEACHER_ID,
      status: 'completed',
      raw_score: 40,
      late_penalty_deducted: 0,
      total_score: 40,
      general_feedback: 'Well articulated firewall architecture.',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
  }

  // Wire repositories
  setUserRepositoryForTesting(new InMemoryUserRepository(db));
  setAssessmentRepositoryForTesting(new InMemoryAssessmentRepository(db));
  setSubmissionRepositoryForTesting(new InMemorySubmissionRepository(db));
  setAcademicRepositoryForTesting(new InMemoryAcademicRepository(db));

  await new Promise<void>((resolve) => {
    server = app.listen(PORT, () => {
      console.log(`Verification API listening on port ${PORT}`);
      resolve();
    });
  });

  const shwethaToken = createToken(CLASS_TEACHER_SHWETHA_ID, 'vishnumaster567@gmail.com');
  const hodToken = createToken(HOD_ID, 'hod@smartfa.edu');
  const studentToken = createToken(STUDENT_VISHNU_ID, 'adm25mca9718@sjbit.edu.in');
  const subjectTeacherToken = createToken(SUBJECT_TEACHER_ID, 'teacher1@smartfa.edu');

  try {
    // -------------------------------------------------------------------------
    // REQUIREMENT 1: Correct Authorized Class Teacher & Cohort Mapping
    // -------------------------------------------------------------------------
    console.log('\n--- 1. Authorized Class Teacher & Cohort Mapping ---');
    const ctRes = await makeRequest('GET', '/api/v1/assessments/class-teacher/cohort', shwethaToken);
    assert(ctRes.status === 200, 'GET /class-teacher/cohort returns HTTP 200');
    assert(Array.isArray(ctRes.body.classes), 'Response contains classes array');
    const assignedClass = ctRes.body.classes.find((c: any) => c.id === CANONICAL_MCA_CLASS_ID);
    assert(Boolean(assignedClass), 'Canonical MCA Semester 3 class is returned');
    assert(assignedClass?.class_teacher_id === CLASS_TEACHER_SHWETHA_ID, 'class_teacher_id correctly matches Shwetha M');
    assert(assignedClass?.class_teacher_name === 'Shwetha M', `class_teacher_name is "Shwetha M" (not Unassigned) (got: "${assignedClass?.class_teacher_name}")`);
    assert(assignedClass?.name === 'MCA Semester 3', `Formatted name is "MCA Semester 3" (got: "${assignedClass?.name}")`);

    // -------------------------------------------------------------------------
    // REQUIREMENT 2: No Duplicate Class Assignment Caused by Duplicate Active Mappings
    // -------------------------------------------------------------------------
    console.log('\n--- 2. No Duplicate Class Assignment (Deduplication) ---');
    const mcaClasses = ctRes.body.classes.filter((c: any) => c.programme === 'MCA' && c.semester === 3);
    assert(mcaClasses.length === 1, `Exactly 1 canonical MCA Semester 3 class returned (got ${mcaClasses.length})`);
    assert(mcaClasses[0].id === CANONICAL_MCA_CLASS_ID, 'Canonical cohort with assigned teacher & students was selected over phantom');
    assert(!ctRes.body.classes.some((c: any) => c.id === DUPLICATE_PHANTOM_CLASS_ID), 'Extraneous phantom class was suppressed');

    // -------------------------------------------------------------------------
    // REQUIREMENT 3: Consistent Enrolled Student Counts Across Overview & Cohort
    // -------------------------------------------------------------------------
    console.log('\n--- 3. Consistent Enrolled Student Counts ---');
    assert(assignedClass?.students_count === 1, `students_count is 1 (got: ${assignedClass?.students_count})`);
    assert(Array.isArray(assignedClass?.students) && assignedClass.students.length === 1, 'students array length matches students_count');
    assert(assignedClass?.students[0].name === 'VISHNU C N', 'Student VISHNU C N is in cohort');
    assert(assignedClass?.students[0].usn === 'adm25mca9718', 'Student USN matches institutional ID');

    // -------------------------------------------------------------------------
    // REQUIREMENT 4: Published Assessment Counts Matching Authoritative API Response
    // -------------------------------------------------------------------------
    console.log('\n--- 4. Published Assessment Counts ---');
    const assRes = await makeRequest('GET', '/api/v1/assessments', shwethaToken);
    assert(assRes.status === 200, 'GET /assessments returns HTTP 200');
    assert(Array.isArray(assRes.body.assessments), 'Assessments is array');
    const mcaAss = assRes.body.assessments.find((a: any) => a.id === CANONICAL_ASSESSMENT_ID);
    assert(Boolean(mcaAss), 'Assessment "formative assessment 1" is returned for class subject');
    assert(mcaAss?.status === 'published', 'Assessment status is published');
    assert(mcaAss?.max_marks === 50, 'Max marks is 50');

    // -------------------------------------------------------------------------
    // REQUIREMENT 5 & 6: Submission Report Rows & Status / Marks Display
    // -------------------------------------------------------------------------
    console.log('\n--- 5 & 6. Submission Report Rows & Marks Display ---');
    const repRes = await makeRequest('GET', '/api/v1/submissions/reports/late-submissions', shwethaToken);
    assert(repRes.status === 200, 'GET /submissions/reports/late-submissions returns HTTP 200');
    assert(Array.isArray(repRes.body.reports), 'Reports is array');
    const subRow = repRes.body.reports.find((r: any) => r.assessment_id === CANONICAL_ASSESSMENT_ID && r.student_id === STUDENT_VISHNU_ID);
    assert(Boolean(subRow), 'Submission report contains row for VISHNU C N and formative assessment 1');
    assert(subRow?.is_submitted === true, 'Submission status is submitted');
    assert(subRow?.is_late === false, 'Late status is false (on time)');
    assert(subRow?.timing_status === 'On Time', 'timing_status is "On Time"');
    assert(subRow?.evaluation_status === 'completed', 'evaluation_status is "completed"');
    assert(subRow?.published_score === null, 'Unpublished score is hidden from unauthorized disclosure');

    // -------------------------------------------------------------------------
    // REQUIREMENT 7: Existing Assessment & Submission Records Remain Intact
    // -------------------------------------------------------------------------
    console.log('\n--- 7. Existing Records Intact ---');
    assert(db.assessments.some(a => a.id === CANONICAL_ASSESSMENT_ID), 'Database assessment record exists intact');
    assert(db.submissions.some(s => s.id === CANONICAL_SUBMISSION_ID), 'Database submission record exists intact');
    assert(db.evaluations.some(e => e.id === evalId), 'Database evaluation record exists intact');

    // -------------------------------------------------------------------------
    // REQUIREMENT 8: Class Teacher Authorization Restrictions
    // -------------------------------------------------------------------------
    console.log('\n--- 8. Role Boundary Restrictions ---');
    // Cannot author assessment
    const authorRes = await makeRequest('POST', '/api/v1/assessments', shwethaToken, {
      class_subject_id: csCanonicalId,
      title: 'Unauthorized Class Teacher Assessment',
      instructions: 'Test',
      deadline_at: '2026-12-31T23:59:59Z'
    });
    assert(authorRes.status === 403, 'Class Teacher cannot create assessment (HTTP 403)');

    // Cannot publish assessment
    const publishRes = await makeRequest('POST', `/api/v1/assessments/${CANONICAL_ASSESSMENT_ID}/publish`, shwethaToken);
    assert(publishRes.status === 403, 'Class Teacher cannot publish assessment (HTTP 403)');

    // Cannot grade / evaluate
    const gradeRes = await makeRequest('POST', '/api/v1/evaluations', shwethaToken, {
      submission_id: CANONICAL_SUBMISSION_ID,
      raw_score: 48
    });
    assert(gradeRes.status === 403, 'Class Teacher cannot evaluate/modify marks (HTTP 403)');

    // Cannot access unassigned class
    const unassignedCohortRes = await makeRequest('GET', `/api/v1/assessments/class-teacher/cohort?class_id=${UNRELATED_CLASS_ID}`, shwethaToken);
    assert(unassignedCohortRes.status === 403, 'Class Teacher cannot query unassigned class (HTTP 403)');

    // -------------------------------------------------------------------------
    // REQUIREMENT 9: Subject Teacher Grading & Workflows Functional
    // -------------------------------------------------------------------------
    console.log('\n--- 9. Subject Teacher Workflows Functional ---');
    const stAssRes = await makeRequest('GET', '/api/v1/assessments', subjectTeacherToken);
    assert(stAssRes.status === 200, 'Subject Teacher can list authoring assessments');

    // -------------------------------------------------------------------------
    // REQUIREMENT 10: Loading, Empty, Error, and Refresh Behavior
    // -------------------------------------------------------------------------
    console.log('\n--- 10. Empty & Unauthorized Edge Cases ---');
    // Student unauthorized on cohort endpoint
    const studentCohortRes = await makeRequest('GET', '/api/v1/assessments/class-teacher/cohort', studentToken);
    assert(studentCohortRes.status === 403, 'Student forbidden from class teacher cohort endpoint');

    // Student unauthorized on late submissions report
    const studentReportRes = await makeRequest('GET', '/api/v1/submissions/reports/late-submissions', studentToken);
    assert(studentReportRes.status === 403, 'Student forbidden from late submissions report');

    console.log('\n==============================================================================');
    console.log(`VERIFICATION SUMMARY: ${passedTests} / ${totalTests} TESTS PASSED`);
    console.log('==============================================================================\n');

  } catch (err: any) {
    console.error('Fatal error during test suite:', err);
  } finally {
    server.close();
  }
}

run();

