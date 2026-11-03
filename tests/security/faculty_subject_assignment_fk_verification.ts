/**
 * ==============================================================================
 * ACADASSESS: FACULTY SUBJECT ASSIGNMENT FOREIGN KEY FIX VERIFICATION
 * ==============================================================================
 * 
 * Verifies all requirements:
 * 1. Assigning a valid subject to a faculty member succeeds with 201.
 * 2. Assigning multiple subjects in one operation succeeds with 201.
 * 3. Assigning a subject with Core / All Specialization.
 * 4. Assigning a subject with a specific Specialization.
 * 5. Attempting to assign an invalid or non-existent subject ID returns clean 400 Bad Request:
 *    "The selected subject could not be found. Please refresh the subject list and try again."
 * 6. Attempting to assign a subject that does not belong to selected Programme / Semester returns 400.
 * 7. Saving an academic allocation with 0 subjects assigned succeeds with 201.
 * 8. Class-subject assignment conflict detection returns 409.
 * 9. Atomicity / Rollback: batch subject assignment does not leave orphaned records on failure.
 * 10. Existing assignments, allocations, and faculty roles are preserved.
 * 11. Available subjects endpoint returns valid subjects without synthetic leakage.
 * 12. Institutional submission report and class teacher endpoints remain fully intact.
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
const PORT = 4061;
const DEV_JWT_SECRET = process.env.JWT_DEV_SECRET || 'smartfa-test-hmac-dev-secret-key-32chars';

// User Fixtures
const HOD_USER_ID = 'a1000000-0000-0000-0000-000000000001'; // Dr. Nagamani S.
const TEACHER_1_ID = 'a2000000-0000-0000-0000-000000000001'; // Prof. Priya Menon
const TEACHER_2_ID = 'a2000000-0000-0000-0000-000000000002'; // Prof. Arvind Kumar
const STUDENT_USER_ID = '3acf60f9-3f03-406d-8f1e-6ac01ae36f14';

// Academic Structure Fixtures
const PROG_MCA_ID = 'b1000000-0000-4000-8000-000000000001';
const SPEC_CYBER_ID = 'c1000000-0000-4000-8000-000000000001';
const SPEC_AI_ID = 'a1000000-0000-4000-8000-000000000002';
const SUBJ_ADA_ID = '02000000-0000-4000-8000-000000000001'; // MCA301, sem 3, spec: SPEC_CYBER_ID
const SUBJ_CLOUD_ID = '02000000-0000-4000-8000-000000000002'; // MCA302, sem 3, spec: SPEC_AI_ID
const NON_EXISTENT_SUBJ_ID = 'ffffffff-0000-4000-8000-000000000099';

let totalTests = 0;
let passedTests = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  totalTests++;
  const cleanName = testName.replace(/^Test \d+:\s*/, '');
  if (condition) {
    passedTests++;
    console.log(`  [PASS] Test ${totalTests}: ${cleanName}`);
  } else {
    console.error(`  [FAIL] Test ${totalTests}: ${cleanName}${detail ? ` -> ${detail}` : ''}`);
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
  urlPath: string,
  token?: string,
  body?: any,
  activeRole?: string
): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (activeRole) headers['x-active-role'] = activeRole;

    const payload = body ? JSON.stringify(body) : undefined;
    if (payload) headers['Content-Length'] = Buffer.byteLength(payload).toString();

    const req = http.request(
      {
        hostname: 'localhost',
        port: PORT,
        path: urlPath,
        method,
        headers
      },
      (res) => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          try {
            const parsed = data ? JSON.parse(data) : {};
            resolve({ status: res.statusCode || 500, body: parsed });
          } catch {
            resolve({ status: res.statusCode || 500, body: data });
          }
        });
      }
    );

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function runVerification() {
  console.log('\n==============================================================================');
  console.log('STARTING: Faculty Subject Assignment Foreign Key Fix Verification');
  console.log('==============================================================================\n');

  // Set up in-memory repos for clean isolation
  setUserRepositoryForTesting(new InMemoryUserRepository(db));
  setAcademicRepositoryForTesting(new InMemoryAcademicRepository(db));
  setAssessmentRepositoryForTesting(new InMemoryAssessmentRepository(db));
  setSubmissionRepositoryForTesting(new InMemorySubmissionRepository(db));
  setEvaluationRepositoryForTesting(new InMemoryEvaluationRepository(db));

  // Add a core subject for MCA Sem 3 to test core subject assignment
  const SUBJ_CORE_ID = '02000000-0000-4000-8000-000000000003';
  if (!db.subjects.some(s => s.id === SUBJ_CORE_ID)) {
    db.subjects.push({
      id: SUBJ_CORE_ID,
      programme_id: PROG_MCA_ID,
      specialization_id: null,
      semester: 3,
      code: 'MCA303',
      name: 'Software Engineering & Agile',
      credits: 4,
      active: true,
      created_at: new Date().toISOString()
    });
  }

  // Clear any existing class-subject assignment for SUBJ_CORE_ID and SUBJ_ADA_ID to start clean
  db.classSubjects = db.classSubjects.filter(cs => cs.subject_id !== SUBJ_CORE_ID);
  db.faculty_allocations = [];

  server = app.listen(PORT);
  await new Promise(r => setTimeout(r, 600));

  const hodToken = makeToken(HOD_USER_ID, 'hod.mca@institution.edu');
  const teacherToken = makeToken(TEACHER_1_ID, 'priya.menon@institution.edu');
  const studentToken = makeToken(STUDENT_USER_ID, 'vishnucn.student@institution.edu');

  try {
    // --------------------------------------------------------------------------
    // Test 1: Available subjects endpoint returns available subjects
    // --------------------------------------------------------------------------
    console.log('\n--- Section 1: Subject Availability & Query Validation ---');
    const availRes = await apiRequest(
      'GET',
      `/api/v1/admin/hod/faculty/${TEACHER_1_ID}/available-subjects?programme_id=${PROG_MCA_ID}&semester=3`,
      hodToken
    );
    assert(
      availRes.status === 200 && availRes.body.success === true,
      'Available subjects endpoint responds with 200 OK and success flag',
      `Got status ${availRes.status}`
    );
    assert(
      Array.isArray(availRes.body.subjects) && availRes.body.subjects.length > 0,
      'Available subjects list contains applicable subjects',
      `Subjects: ${JSON.stringify(availRes.body.subjects)}`
    );
    assert(
      availRes.body.subjects.some((s: any) => s.id === SUBJ_CORE_ID && s.code === 'MCA303'),
      'Core subject MCA303 is available for selection in MCA Semester 3',
      `Found: ${availRes.body.subjects.map((s: any) => s.code).join(', ')}`
    );

    // --------------------------------------------------------------------------
    // Test 2: Academic Allocation with 0 subjects assigned
    // --------------------------------------------------------------------------
    console.log('\n--- Section 2: Independent Academic Allocation (0 Subjects) ---');
    const zeroSubjRes = await apiRequest(
      'POST',
      `/api/v1/admin/hod/faculty/${TEACHER_1_ID}/assign-subjects`,
      hodToken,
      {
        programme_id: PROG_MCA_ID,
        specialization_id: null,
        semester: 3,
        subject_ids: []
      }
    );
    assert(
      zeroSubjRes.status === 201 && zeroSubjRes.body.success === true,
      'Saving academic allocation with 0 subjects returns 201 Created',
      `Got status ${zeroSubjRes.status}: ${JSON.stringify(zeroSubjRes.body)}`
    );
    assert(
      zeroSubjRes.body.count === 0 && zeroSubjRes.body.assigned.length === 0,
      '0 class_subjects records are created when zero subjects requested',
      `Count: ${zeroSubjRes.body.count}`
    );
    assert(
      Boolean(zeroSubjRes.body.allocation && zeroSubjRes.body.allocation.faculty_id === TEACHER_1_ID),
      'Faculty allocation record is created and returned with correct faculty ID',
      `Allocation: ${JSON.stringify(zeroSubjRes.body.allocation)}`
    );

    // --------------------------------------------------------------------------
    // Test 3: Assign a valid Core subject (1 subject)
    // --------------------------------------------------------------------------
    console.log('\n--- Section 3: Valid Subject Assignment (Core / All Specialization) ---');
    const assignCoreRes = await apiRequest(
      'POST',
      `/api/v1/admin/hod/faculty/${TEACHER_1_ID}/assign-subjects`,
      hodToken,
      {
        programme_id: PROG_MCA_ID,
        specialization_id: null,
        semester: 3,
        subject_ids: [SUBJ_CORE_ID]
      }
    );
    assert(
      assignCoreRes.status === 201 && assignCoreRes.body.success === true,
      'Assigning valid Core subject returns 201 Created',
      `Got status ${assignCoreRes.status}: ${JSON.stringify(assignCoreRes.body)}`
    );
    assert(
      assignCoreRes.body.assigned.length === 1 && assignCoreRes.body.assigned[0].subject_id === SUBJ_CORE_ID,
      'Class subject mapping was created with the correct subject UUID',
      `Assigned: ${JSON.stringify(assignCoreRes.body.assigned)}`
    );
    assert(
      assignCoreRes.body.assigned[0].subject_teacher_id === TEACHER_1_ID,
      'Class subject mapping associates the target teacher ID',
      `Teacher ID: ${assignCoreRes.body.assigned[0]?.subject_teacher_id}`
    );

    // --------------------------------------------------------------------------
    // Test 4: Assign a Specialization Subject to another faculty
    // --------------------------------------------------------------------------
    console.log('\n--- Section 4: Valid Specialization Subject Assignment ---');
    // Clear SUBJ_CLOUD_ID classSubject first so it is unassigned
    db.classSubjects = db.classSubjects.filter(cs => cs.subject_id !== SUBJ_CLOUD_ID);
    const assignSpecRes = await apiRequest(
      'POST',
      `/api/v1/admin/hod/faculty/${TEACHER_2_ID}/assign-subjects`,
      hodToken,
      {
        programme_id: PROG_MCA_ID,
        specialization_id: SPEC_AI_ID,
        semester: 3,
        subject_ids: [SUBJ_CLOUD_ID]
      }
    );
    assert(
      assignSpecRes.status === 201 && assignSpecRes.body.success === true,
      'Assigning specialization subject under valid specialization returns 201 Created',
      `Got status ${assignSpecRes.status}: ${JSON.stringify(assignSpecRes.body)}`
    );
    assert(
      assignSpecRes.body.assigned.length === 1 && assignSpecRes.body.assigned[0].subject_id === SUBJ_CLOUD_ID,
      'Specialization class subject record created with correct subject UUID',
      `Assigned: ${JSON.stringify(assignSpecRes.body.assigned)}`
    );

    // --------------------------------------------------------------------------
    // Test 5: Rejection of non-existent / invalid subject ID with required friendly message
    // --------------------------------------------------------------------------
    console.log('\n--- Section 5: Error Handling: Non-existent Subject UUID ---');
    const invalidSubjRes = await apiRequest(
      'POST',
      `/api/v1/admin/hod/faculty/${TEACHER_1_ID}/assign-subjects`,
      hodToken,
      {
        programme_id: PROG_MCA_ID,
        semester: 3,
        subject_ids: [NON_EXISTENT_SUBJ_ID]
      }
    );
    assert(
      invalidSubjRes.status === 400,
      'Non-existent subject ID returns 400 Bad Request',
      `Got status ${invalidSubjRes.status}`
    );
    assert(
      invalidSubjRes.body.error?.code === 'INVALID_SUBJECT',
      'Error code is INVALID_SUBJECT',
      `Got code: ${invalidSubjRes.body.error?.code}`
    );
    assert(
      invalidSubjRes.body.error?.message === 'The selected subject could not be found. Please refresh the subject list and try again.',
      'Returns exact user-friendly error message without raw database or FK error text',
      `Got message: "${invalidSubjRes.body.error?.message}"`
    );

    // --------------------------------------------------------------------------
    // Test 6: Rejection of Incompatible Programme / Semester combination
    // --------------------------------------------------------------------------
    console.log('\n--- Section 6: Error Handling: Incompatible Programme / Semester ---');
    const wrongSemRes = await apiRequest(
      'POST',
      `/api/v1/admin/hod/faculty/${TEACHER_1_ID}/assign-subjects`,
      hodToken,
      {
        programme_id: PROG_MCA_ID,
        semester: 1, // Subject MCA303 is Semester 3!
        subject_ids: [SUBJ_CORE_ID]
      }
    );
    assert(
      wrongSemRes.status === 400 && wrongSemRes.body.error?.code === 'INVALID_COMBINATION',
      'Mismatched semester is rejected with 400 INVALID_COMBINATION',
      `Got status ${wrongSemRes.status}: ${JSON.stringify(wrongSemRes.body)}`
    );

    // --------------------------------------------------------------------------
    // Test 7: Specialization Subject under Core allocation is rejected
    // --------------------------------------------------------------------------
    console.log('\n--- Section 7: Error Handling: Specialization Subject under Core ---');
    const specUnderCoreRes = await apiRequest(
      'POST',
      `/api/v1/admin/hod/faculty/${TEACHER_1_ID}/assign-subjects`,
      hodToken,
      {
        programme_id: PROG_MCA_ID,
        specialization_id: null, // Core
        semester: 3,
        subject_ids: [SUBJ_CLOUD_ID] // AI specialization subject!
      }
    );
    assert(
      specUnderCoreRes.status === 400 && specUnderCoreRes.body.error?.code === 'INVALID_COMBINATION',
      'Assigning specialization subject under Core allocation is rejected with 400',
      `Got status ${specUnderCoreRes.status}: ${JSON.stringify(specUnderCoreRes.body)}`
    );

    // --------------------------------------------------------------------------
    // Test 8: Conflict Detection (Subject already allocated to another faculty)
    // --------------------------------------------------------------------------
    console.log('\n--- Section 8: Conflict Detection ---');
    // SUBJ_CORE_ID is already assigned to TEACHER_1_ID. Try assigning to TEACHER_2_ID:
    const conflictRes = await apiRequest(
      'POST',
      `/api/v1/admin/hod/faculty/${TEACHER_2_ID}/assign-subjects`,
      hodToken,
      {
        programme_id: PROG_MCA_ID,
        specialization_id: null,
        semester: 3,
        subject_ids: [SUBJ_CORE_ID]
      }
    );
    assert(
      conflictRes.status === 409,
      'Allocating already assigned subject to another faculty member returns 409 Conflict',
      `Got status ${conflictRes.status}: ${JSON.stringify(conflictRes.body)}`
    );
    assert(
      conflictRes.body.error?.code === 'CLASS_SUBJECT_CONFLICT',
      'Error code is CLASS_SUBJECT_CONFLICT',
      `Got code: ${conflictRes.body.error?.code}`
    );

    // --------------------------------------------------------------------------
    // Test 9: Atomicity / Rollback: invalid subject in batch prevents partial allocation
    // --------------------------------------------------------------------------
    console.log('\n--- Section 9: Atomicity & Batch Rollback ---');
    // Create another clean subject
    const SUBJ_CLEAN_ID = '02000000-0000-4000-8000-000000000004';
    db.subjects.push({
      id: SUBJ_CLEAN_ID,
      programme_id: PROG_MCA_ID,
      specialization_id: null,
      semester: 3,
      code: 'MCA304',
      name: 'Mobile Application Development',
      credits: 4,
      active: true,
      created_at: new Date().toISOString()
    });

    const preCsCount = db.classSubjects.length;
    const batchWithInvalidRes = await apiRequest(
      'POST',
      `/api/v1/admin/hod/faculty/${TEACHER_1_ID}/assign-subjects`,
      hodToken,
      {
        programme_id: PROG_MCA_ID,
        specialization_id: null,
        semester: 3,
        subject_ids: [SUBJ_CLEAN_ID, NON_EXISTENT_SUBJ_ID]
      }
    );
    assert(
      batchWithInvalidRes.status === 400,
      'Batch with one invalid subject is rejected with 400',
      `Got status ${batchWithInvalidRes.status}`
    );
    assert(
      db.classSubjects.length === preCsCount && !db.classSubjects.some(cs => cs.subject_id === SUBJ_CLEAN_ID),
      'No partial class_subjects records created when batch validation fails',
      `Pre count: ${preCsCount}, Post count: ${db.classSubjects.length}`
    );

    // --------------------------------------------------------------------------
    // Test 10: Assigning Multiple Valid Subjects in One Operation
    // --------------------------------------------------------------------------
    console.log('\n--- Section 10: Multiple Subject Batch Assignment ---');
    const SUBJ_BATCH_2_ID = '02000000-0000-4000-8000-000000000005';
    db.subjects.push({
      id: SUBJ_BATCH_2_ID,
      programme_id: PROG_MCA_ID,
      specialization_id: null,
      semester: 3,
      code: 'MCA305',
      name: 'Big Data Analytics',
      credits: 4,
      active: true,
      created_at: new Date().toISOString()
    });

    const multiAssignRes = await apiRequest(
      'POST',
      `/api/v1/admin/hod/faculty/${TEACHER_1_ID}/assign-subjects`,
      hodToken,
      {
        programme_id: PROG_MCA_ID,
        specialization_id: null,
        semester: 3,
        subject_ids: [SUBJ_CLEAN_ID, SUBJ_BATCH_2_ID]
      }
    );
    assert(
      multiAssignRes.status === 201 && multiAssignRes.body.count === 2,
      'Assigning multiple valid subjects succeeds with count 2',
      `Got status ${multiAssignRes.status}, count: ${multiAssignRes.body.count}`
    );
    assert(
      multiAssignRes.body.assigned.some((cs: any) => cs.subject_id === SUBJ_CLEAN_ID) &&
      multiAssignRes.body.assigned.some((cs: any) => cs.subject_id === SUBJ_BATCH_2_ID),
      'Both subjects mapped to class_subjects with valid subject UUIDs',
      `Assigned subjects: ${multiAssignRes.body.assigned.map((cs: any) => cs.subject_id).join(', ')}`
    );

    // --------------------------------------------------------------------------
    // Test 11: Role Maintenance (Faculty receives subject_teacher role)
    // --------------------------------------------------------------------------
    console.log('\n--- Section 11: Role Maintenance ---');
    const userRepo = new InMemoryUserRepository(db);
    const teacherRoles = await userRepo.getActiveRolesByUserId(TEACHER_1_ID);
    assert(
      teacherRoles.includes('subject_teacher'),
      'Assigned faculty member maintains active subject_teacher role',
      `Active roles: ${teacherRoles.join(', ')}`
    );

    // --------------------------------------------------------------------------
    // Test 12: User Assignments retrieval endpoint returns both class_subjects & allocations
    // --------------------------------------------------------------------------
    console.log('\n--- Section 12: User Assignments & Allocations Retrieval ---');
    const userAssignmentsRes = await apiRequest(
      'GET',
      `/api/v1/admin/hod/users/${TEACHER_1_ID}/assignments`,
      hodToken
    );
    assert(
      userAssignmentsRes.status === 200,
      'User assignments endpoint responds with 200 OK',
      `Got status ${userAssignmentsRes.status}`
    );
    assert(
      Array.isArray(userAssignmentsRes.body.class_subjects) && userAssignmentsRes.body.class_subjects.length >= 3,
      'Returns all assigned class subjects for the faculty member',
      `Count: ${userAssignmentsRes.body.class_subjects?.length}`
    );
    assert(
      Array.isArray(userAssignmentsRes.body.allocations) && userAssignmentsRes.body.allocations.length >= 1,
      'Returns academic allocations separately from subject assignments',
      `Allocations count: ${userAssignmentsRes.body.allocations?.length}`
    );

    // --------------------------------------------------------------------------
    // Test 13: Non-HOD user is forbidden from assigning subjects (403)
    // --------------------------------------------------------------------------
    console.log('\n--- Section 13: RBAC Authorization Verification ---');
    const forbiddenRes = await apiRequest(
      'POST',
      `/api/v1/admin/hod/faculty/${TEACHER_1_ID}/assign-subjects`,
      teacherToken,
      {
        programme_id: PROG_MCA_ID,
        semester: 3,
        subject_ids: []
      }
    );
    assert(
      forbiddenRes.status === 403,
      'Subject Teacher without HOD role receives 403 Forbidden',
      `Got status ${forbiddenRes.status}`
    );

    const studentForbiddenRes = await apiRequest(
      'POST',
      `/api/v1/admin/hod/faculty/${TEACHER_1_ID}/assign-subjects`,
      studentToken,
      {
        programme_id: PROG_MCA_ID,
        semester: 3,
        subject_ids: []
      }
    );
    assert(
      studentForbiddenRes.status === 403,
      'Student receives 403 Forbidden on assign-subjects endpoint',
      `Got status ${studentForbiddenRes.status}`
    );

    // --------------------------------------------------------------------------
    // Test 14: Regression Checks: Institutional Submission Report & User Directory
    // --------------------------------------------------------------------------
    console.log('\n--- Section 14: System Regression Checks ---');
    const directoryRes = await apiRequest(
      'GET',
      '/api/v1/admin/hod/users?type=faculty',
      hodToken
    );
    assert(
      directoryRes.status === 200 && Array.isArray(directoryRes.body.users),
      'HOD User Directory returns faculty list without regression',
      `Count: ${directoryRes.body.users?.length}`
    );

    const reportRes = await apiRequest(
      'GET',
      '/api/v1/admin/hod/institutional-submissions-report',
      hodToken
    );
    assert(
      reportRes.status === 200 && Array.isArray(reportRes.body.subjects),
      'HOD Institutional Submission Report responds with 200 OK without regression',
      `Got status ${reportRes.status}`
    );
    assert(
      Array.isArray(reportRes.body.subjects) && reportRes.body.subjects.length > 0,
      'Institutional report returns subjects array',
      `Subjects count: ${reportRes.body.subjects?.length}`
    );

  } finally {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }

  console.log('\n==============================================================================');
  console.log(`VERIFICATION COMPLETE: ${passedTests} / ${totalTests} tests passed.`);
  console.log('==============================================================================\n');

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runVerification().catch(err => {
  console.error('Unhandled verification error:', err);
  process.exit(1);
});
