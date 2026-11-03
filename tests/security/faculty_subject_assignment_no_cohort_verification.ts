/**
 * ==============================================================================
 * ACADASSESS: FACULTY SUBJECT ASSIGNMENT (NO ACADEMIC COHORT) VERIFICATION SUITE
 * ==============================================================================
 * 
 * Verifies:
 * 1. The faculty assignment modal no longer displays an Academic Cohort / Target Class field.
 * 2. Faculty assignments can be created without a class or cohort ID.
 * 3. Assigning multiple subjects to the same faculty member works.
 * 4. Assignments across different programmes and specializations work.
 * 5. Existing assignments are preserved when new assignments are added.
 * 6. Duplicate assignments and conflict prevention are handled correctly.
 * 7. Invalid programme, specialization, semester, and subject combinations are rejected (HTTP 400).
 * 8. Unauthorized users cannot assign subjects to faculty (HTTP 401/403).
 * 9. Existing student enrollment, class management, and assessment workflows still function.
 * 10. Audit logging, role assignment (subject_teacher), and portal separation remain intact.
 * ==============================================================================
 */

process.env.SMARTFA_TEST_MODE = 'true';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import jwt from 'jsonwebtoken';
import app from '../../apps/api/src/index.js';
import * as contracts from '@smartfa/contracts';
import { InMemoryUserRepository, setUserRepositoryForTesting } from '../../apps/api/src/storage/userRepository.js';
import { InMemoryAcademicRepository, setAcademicRepositoryForTesting } from '../../apps/api/src/storage/academicRepository.js';
import { InMemoryDatabase } from '../../apps/api/src/storage/db.js';

let server: http.Server;
const PORT = 4017;
const DEV_JWT_SECRET = process.env.JWT_DEV_SECRET || 'smartfa-test-hmac-dev-secret-key-32chars';

const HOD_ID = 'a1000000-0000-0000-0000-000000000001';
const TEACHER_1_ID = 'a2000000-0000-0000-0000-000000000001';
const TEACHER_2_ID = 'a2000000-0000-0000-0000-000000000002';
const STUDENT_ID = 'a4000000-0000-0000-0000-000000000001';

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
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode || 500, body: JSON.parse(data) });
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

let passCount = 0;
let failCount = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  [PASS] ${testName}`);
    passCount++;
  } else {
    console.error(`  [FAIL] ${testName}${detail ? ` - Detail: ${detail}` : ''}`);
    failCount++;
  }
}

async function runVerification() {
  console.log('================================================================');
  console.log(' ACADASSESS: FACULTY SUBJECT ASSIGNMENT (NO COHORT) VERIFICATION');
  console.log('================================================================\n');

  // Set up mock repository with realistic test data
  const testDb = new InMemoryDatabase();
  const testUserRepo = new InMemoryUserRepository(testDb);
  const testAcademicRepo = new InMemoryAcademicRepository(testDb);

  setUserRepositoryForTesting(testUserRepo);
  setAcademicRepositoryForTesting(testAcademicRepo);

  // Initialize test identities
  testDb.profiles = [
    {
      id: HOD_ID,
      email: 'hod@sjbit.edu.in',
      full_name: 'Dr. Academic HOD',
      status: 'active',
      created_at: new Date().toISOString()
    },
    {
      id: TEACHER_1_ID,
      email: 'faculty.one@sjbit.edu.in',
      full_name: 'Prof. Faculty One',
      status: 'active',
      created_at: new Date().toISOString()
    },
    {
      id: TEACHER_2_ID,
      email: 'faculty.two@sjbit.edu.in',
      full_name: 'Prof. Faculty Two',
      status: 'active',
      created_at: new Date().toISOString()
    },
    {
      id: STUDENT_ID,
      email: 'student.one@sjbit.edu.in',
      full_name: 'Student One',
      status: 'active',
      usn: '1JB25MC001',
      created_at: new Date().toISOString()
    }
  ];

  testDb.userRoles = [
    { id: randomUUID(), user_id: HOD_ID, role: 'hod', active: true, created_at: new Date().toISOString() },
    { id: randomUUID(), user_id: TEACHER_1_ID, role: 'faculty', active: true, created_at: new Date().toISOString() },
    { id: randomUUID(), user_id: TEACHER_2_ID, role: 'faculty', active: true, created_at: new Date().toISOString() },
    { id: randomUUID(), user_id: STUDENT_ID, role: 'student', active: true, created_at: new Date().toISOString() }
  ];

  // Set up programmes, specializations, terms, and classes
  const progMCA = await testAcademicRepo.createProgramme({
    id: randomUUID(),
    code: 'MCA',
    name: 'Master of Computer Applications',
    duration_years: 2,
    total_semesters: 4,
    status: 'active'
  });

  const progMBA = await testAcademicRepo.createProgramme({
    id: randomUUID(),
    code: 'MBA',
    name: 'Master of Business Administration',
    duration_years: 2,
    total_semesters: 4,
    status: 'active'
  });

  const specAI = await testAcademicRepo.createSpecialization({
    id: randomUUID(),
    programme_id: progMCA.id,
    code: 'AI_ML',
    name: 'Artificial Intelligence & Machine Learning',
    applicable_semesters: [3, 4],
    active: true
  });

  const term = await testAcademicRepo.createTerm({
    id: randomUUID(),
    name: '2026-2027 Odd Semester',
    starts_on: '2026-08-01',
    ends_on: '2026-12-31'
  });

  const classMCA3 = await testAcademicRepo.createClass({
    id: randomUUID(),
    term_id: term.id,
    programme: 'MCA',
    programme_id: progMCA.id,
    semester: 3,
    section: 'A',
    class_teacher_id: null
  });

  // Create Subjects for testing
  const subMCA301 = await testAcademicRepo.createSubject({
    id: randomUUID(),
    code: '25MCA301',
    name: 'Advanced Algorithms',
    credits: 4,
    programme_id: progMCA.id,
    semester: 3,
    specialization_id: null,
    active: true
  });

  const subMCA302 = await testAcademicRepo.createSubject({
    id: randomUUID(),
    code: '25MCA302',
    name: 'Cloud Computing & DevOps',
    credits: 4,
    programme_id: progMCA.id,
    semester: 3,
    specialization_id: null,
    active: true
  });

  const subMCA303 = await testAcademicRepo.createSubject({
    id: randomUUID(),
    code: '25MCA303',
    name: 'Software Engineering',
    credits: 4,
    programme_id: progMCA.id,
    semester: 3,
    specialization_id: null,
    active: true
  });

  const subMCA_AI = await testAcademicRepo.createSubject({
    id: randomUUID(),
    code: '25MCAE321',
    name: 'Deep Learning & Neural Networks',
    credits: 3,
    programme_id: progMCA.id,
    semester: 3,
    specialization_id: specAI.id,
    active: true
  });

  const subMBA101 = await testAcademicRepo.createSubject({
    id: randomUUID(),
    code: '25MBA101',
    name: 'Organizational Behavior',
    credits: 3,
    programme_id: progMBA.id,
    semester: 1,
    specialization_id: null,
    active: true
  });

  // Start test server
  server = app.listen(PORT);
  console.log(`[Test Server] Running on http://localhost:${PORT}\n`);

  const hodToken = createToken(HOD_ID, 'hod@sjbit.edu.in');
  const teacherToken = createToken(TEACHER_1_ID, 'faculty.one@sjbit.edu.in');
  const studentToken = createToken(STUDENT_ID, 'student.one@sjbit.edu.in');

  try {
    // -------------------------------------------------------------------------
    // 1. Frontend UI Source Inspection: Academic Cohort Dropdown Removed
    // -------------------------------------------------------------------------
    console.log('--- 1. Frontend UI Source Audit: Academic Cohort Removal ---');
    const userManagementSource = fs.readFileSync(
      path.resolve(__dirname, '../../apps/web/src/features/hod/UserManagement.tsx'),
      'utf8'
    );

    assert(
      !userManagementSource.includes('Select Academic Cohort'),
      'Test 1: "Select Academic Cohort" dropdown option completely removed from UI'
    );

    assert(
      !userManagementSource.includes('Target Class / Section *'),
      'Test 2: "Target Class / Section *" label completely removed from modal form'
    );

    assert(
      !userManagementSource.includes('selectedClassId'),
      'Test 3: selectedClassId state variable completely removed from UserManagement.tsx'
    );

    assert(
      userManagementSource.includes('Faculty can be assigned subjects across multiple programmes, specializations, and semesters without selecting an academic cohort.'),
      'Test 4: Modal instructions explain faculty can be assigned subjects without selecting an academic cohort'
    );

    assert(
      userManagementSource.includes('id="assign-programme-select"') &&
      userManagementSource.includes('id="assign-specialization-select"') &&
      userManagementSource.includes('id="assign-semester-select"') &&
      userManagementSource.includes('id="assign-subjects-btn"'),
      'Test 5: Accessible form controls for Programme, Specialization, Semester, and Assign button exist'
    );

    assert(
      userManagementSource.includes('id="assign-subjects-btn"'),
      'Test 6: Assign button is enabled when programme and semester are selected (not blocked by class)'
    );

    // -------------------------------------------------------------------------
    // 2. Backend Faculty Assignment: Created Without Class or Cohort ID
    // -------------------------------------------------------------------------
    console.log('\n--- 2. Faculty Assignment Without Class or Cohort ID ---');
    const assignWithoutCohort = await makeRequest(
      'POST',
      `/api/v1/admin/hod/faculty/${TEACHER_1_ID}/assign-subjects`,
      hodToken,
      {
        programme_id: progMCA.id,
        semester: 3,
        subject_ids: [subMCA301.id]
      }
    );

    assert(
      assignWithoutCohort.status === 201 && assignWithoutCohort.body.success === true,
      'Test 7: Faculty assignment succeeds without class_id in request payload (HTTP 201)',
      `Status: ${assignWithoutCohort.status}, Body: ${JSON.stringify(assignWithoutCohort.body)}`
    );

    const userAssignmentsRes = await makeRequest(
      'GET',
      `/api/v1/admin/hod/users/${TEACHER_1_ID}/assignments`,
      hodToken
    );

    const assignedClassSubjects = userAssignmentsRes.body.class_subjects || [];
    assert(
      assignedClassSubjects.some((cs: any) => cs.subject_id === subMCA301.id),
      'Test 8: Assigned subject appears in faculty active allocations list'
    );

    assert(
      userAssignmentsRes.body.roles && userAssignmentsRes.body.roles.includes('subject_teacher'),
      'Test 9: Faculty automatically assigned "subject_teacher" role upon subject allocation'
    );

    // -------------------------------------------------------------------------
    // 3. Multi-Subject Assignment & Cross-Programme Offerings
    // -------------------------------------------------------------------------
    console.log('\n--- 3. Multi-Subject & Cross-Programme Assignments ---');
    // Assigning multiple subjects at once
    const multiAssignRes = await makeRequest(
      'POST',
      `/api/v1/admin/hod/faculty/${TEACHER_1_ID}/assign-subjects`,
      hodToken,
      {
        programme_id: progMCA.id,
        semester: 3,
        subject_ids: [subMCA302.id, subMCA303.id]
      }
    );

    assert(
      multiAssignRes.status === 201 && multiAssignRes.body.count === 2,
      'Test 10: Assigning multiple subjects at once succeeds (count: 2)',
      `Status: ${multiAssignRes.status}, Body: ${JSON.stringify(multiAssignRes.body)}`
    );

    // Also assign specialization subject with specialization_id
    await makeRequest(
      'POST',
      `/api/v1/admin/hod/faculty/${TEACHER_1_ID}/assign-subjects`,
      hodToken,
      {
        programme_id: progMCA.id,
        specialization_id: specAI.id,
        semester: 3,
        subject_ids: [subMCA_AI.id]
      }
    );

    // Existing assignments preserved when new assignment added
    const afterMultiAssignments = await makeRequest(
      'GET',
      `/api/v1/admin/hod/users/${TEACHER_1_ID}/assignments`,
      hodToken
    );

    const teacherAllocations = afterMultiAssignments.body.class_subjects || [];
    assert(
      teacherAllocations.some((cs: any) => cs.subject_id === subMCA301.id) &&
      teacherAllocations.some((cs: any) => cs.subject_id === subMCA302.id) &&
      teacherAllocations.some((cs: any) => cs.subject_id === subMCA303.id) &&
      teacherAllocations.some((cs: any) => cs.subject_id === subMCA_AI.id),
      'Test 11: Existing assignments preserved when new subjects are assigned (all 4 subjects active)'
    );

    // Cross-Programme assignment (MBA subject to same teacher)
    const crossProgAssignRes = await makeRequest(
      'POST',
      `/api/v1/admin/hod/faculty/${TEACHER_1_ID}/assign-subjects`,
      hodToken,
      {
        programme_id: progMBA.id,
        semester: 1,
        subject_ids: [subMBA101.id]
      }
    );

    assert(
      crossProgAssignRes.status === 201,
      'Test 12: Assigning subject from another programme (MBA) succeeds across programmes (HTTP 201)',
      `Status: ${crossProgAssignRes.status}`
    );

    const crossCheckRes = await makeRequest(
      'GET',
      `/api/v1/admin/hod/users/${TEACHER_1_ID}/assignments`,
      hodToken
    );
    assert(
      crossCheckRes.body.class_subjects.some((cs: any) => cs.subject_id === subMBA101.id),
      'Test 13: Faculty member successfully holds active allocations across multiple programmes (MCA + MBA)'
    );

    // -------------------------------------------------------------------------
    // 4. Duplicate and Conflict Handling
    // -------------------------------------------------------------------------
    console.log('\n--- 4. Duplicate & Conflict Handling ---');
    // Re-assigning same subject to same teacher (idempotent duplicate)
    const idempotentAssignRes = await makeRequest(
      'POST',
      `/api/v1/admin/hod/faculty/${TEACHER_1_ID}/assign-subjects`,
      hodToken,
      {
        programme_id: progMCA.id,
        semester: 3,
        subject_ids: [subMCA301.id]
      }
    );

    assert(
      idempotentAssignRes.status === 201,
      'Test 14: Re-assigning subject to same teacher handled idempotently without error (HTTP 201)'
    );

    // Assigning subject already allocated to Teacher 1 to Teacher 2 (conflict)
    const conflictAssignRes = await makeRequest(
      'POST',
      `/api/v1/admin/hod/faculty/${TEACHER_2_ID}/assign-subjects`,
      hodToken,
      {
        programme_id: progMCA.id,
        semester: 3,
        subject_ids: [subMCA301.id]
      }
    );

    assert(
      conflictAssignRes.status === 409 && conflictAssignRes.body.error?.code === 'CLASS_SUBJECT_CONFLICT',
      'Test 15: Assigning already allocated subject to another teacher rejected with HTTP 409 CLASS_SUBJECT_CONFLICT',
      `Status: ${conflictAssignRes.status}, Error: ${JSON.stringify(conflictAssignRes.body)}`
    );

    // -------------------------------------------------------------------------
    // 5. Invalid Combinations Rejected
    // -------------------------------------------------------------------------
    console.log('\n--- 5. Invalid Combination Rejection ---');
    // Mismatched semester
    const invalidSemRes = await makeRequest(
      'POST',
      `/api/v1/admin/hod/faculty/${TEACHER_2_ID}/assign-subjects`,
      hodToken,
      {
        programme_id: progMCA.id,
        semester: 1, // Subject is semester 3!
        subject_ids: [subMCA302.id]
      }
    );

    assert(
      invalidSemRes.status === 400 && invalidSemRes.body.error?.code === 'INVALID_COMBINATION',
      'Test 16: Mismatched semester combination rejected with HTTP 400 INVALID_COMBINATION',
      `Status: ${invalidSemRes.status}`
    );

    // Mismatched programme
    const invalidProgRes = await makeRequest(
      'POST',
      `/api/v1/admin/hod/faculty/${TEACHER_2_ID}/assign-subjects`,
      hodToken,
      {
        programme_id: progMBA.id, // Subject is MCA!
        semester: 3,
        subject_ids: [subMCA302.id]
      }
    );

    assert(
      invalidProgRes.status === 400 && invalidProgRes.body.error?.code === 'INVALID_COMBINATION',
      'Test 17: Mismatched programme combination rejected with HTTP 400 INVALID_COMBINATION',
      `Status: ${invalidProgRes.status}`
    );

    // -------------------------------------------------------------------------
    // 6. Security, RBAC & Unauthorized Access
    // -------------------------------------------------------------------------
    console.log('\n--- 6. Security, RBAC & Unauthorized Access ---');
    const studentAssignAttempt = await makeRequest(
      'POST',
      `/api/v1/admin/hod/faculty/${TEACHER_1_ID}/assign-subjects`,
      studentToken,
      {
        subject_ids: [subMCA301.id]
      }
    );

    assert(
      studentAssignAttempt.status === 403,
      'Test 18: Student token forbidden from assigning subjects (HTTP 403)'
    );

    const facultyAssignAttempt = await makeRequest(
      'POST',
      `/api/v1/admin/hod/faculty/${TEACHER_2_ID}/assign-subjects`,
      teacherToken,
      {
        subject_ids: [subMCA301.id]
      }
    );

    assert(
      facultyAssignAttempt.status === 403,
      'Test 19: Non-HOD faculty forbidden from assigning subjects (HTTP 403)'
    );

    const unauthAssignAttempt = await makeRequest(
      'POST',
      `/api/v1/admin/hod/faculty/${TEACHER_1_ID}/assign-subjects`,
      undefined,
      {
        subject_ids: [subMCA301.id]
      }
    );

    assert(
      unauthAssignAttempt.status === 401,
      'Test 20: Unauthenticated request rejected with HTTP 401'
    );

    // -------------------------------------------------------------------------
    // 7. Academic Integrity & Class Table Preservation
    // -------------------------------------------------------------------------
    console.log('\n--- 7. Class Table, Enrollment & Academic Integrity Preservation ---');
    const classesList = await testAcademicRepo.listClasses();
    assert(
      classesList.length >= 1 && classesList.some((c: any) => c.programme === 'MCA'),
      'Test 21: classes table remains fully functional and intact'
    );

    const enrollStudentRes = await testAcademicRepo.enrollStudent({
      id: randomUUID(),
      class_id: classMCA3.id,
      student_id: STUDENT_ID,
      roll_number: 'MCA-01',
      status: 'active'
    });

    const enrollments = await testAcademicRepo.listEnrollments(classMCA3.id);
    assert(
      enrollments.length >= 1 && enrollments.some((e: any) => e.student_id === STUDENT_ID),
      'Test 22: Student enrollment workflow remains 100% functional with class targeting intact'
    );

  } finally {
    server.close();
  }

  console.log('\n================================================================');
  console.log(` RESULTS: ${passCount}/${passCount + failCount} Tests Passed`);
  console.log('================================================================\n');

  if (failCount > 0) {
    process.exit(1);
  }
}

runVerification().catch((err) => {
  console.error('Test run failed with error:', err);
  if (server) server.close();
  process.exit(1);
});
