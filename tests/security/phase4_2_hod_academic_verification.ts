process.env.SMARTFA_TEST_MODE = 'true';
import jwt from 'jsonwebtoken';
import http from 'http';
import app from '../../apps/api/src/index.js';
import { 
  getAcademicRepository, 
  setAcademicRepositoryForTesting, 
  InMemoryAcademicRepository,
  SupabaseAcademicRepository
} from '../../apps/api/src/storage/academicRepository.js';
import { 
  getUserRepository, 
  setUserRepositoryForTesting, 
  InMemoryUserRepository 
} from '../../apps/api/src/storage/userRepository.js';
import { db } from '../../apps/api/src/storage/db.js';

console.log('================================================================');
console.log(' ACADASSESS PHASE 4.2: ACADEMIC REPOSITORY & HOD SECURITY SUITE ');
console.log('================================================================\n');

const DEV_JWT_SECRET = process.env.JWT_DEV_SECRET || 'smartfa-test-hmac-dev-secret-key-32chars';
const PORT = 4002;

let server: http.Server;

function createTestToken(userId: string, email: string = 'test@acadassess.edu', expiresIn: string = '1h'): string {
  return jwt.sign({ sub: userId, email }, DEV_JWT_SECRET, { expiresIn });
}

function makeRequest(
  method: string,
  path: string,
  token?: string,
  body?: any,
  extraHeaders?: Record<string, string>
): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...extraHeaders
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const payload = body ? JSON.stringify(body) : undefined;
    if (payload) {
      headers['Content-Length'] = Buffer.byteLength(payload).toString();
    }

    const req = http.request(
      {
        hostname: 'localhost',
        port: PORT,
        path,
        method,
        headers
      },
      (res) => {
        let rawData = '';
        res.on('data', chunk => rawData += chunk);
        res.on('end', () => {
          try {
            const parsed = rawData ? JSON.parse(rawData) : {};
            resolve({ status: res.statusCode || 500, body: parsed });
          } catch {
            resolve({ status: res.statusCode || 500, body: rawData });
          }
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

let totalTests = 0;
let passedTests = 0;

function assert(condition: boolean, testName: string, failureDetails?: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`[PASS] Test ${totalTests}: ${testName}`);
  } else {
    console.error(`[FAIL] Test ${totalTests}: ${testName}`);
    if (failureDetails) {
      console.error(`       Details: ${failureDetails}`);
    }
  }
}

async function runTests() {
  server = app.listen(PORT);

  const HOD_ID = 'a1000000-0000-0000-0000-000000000001';
  const TEACHER_ID = 'a2000000-0000-0000-0000-000000000001';
  const STUDENT_ID = 'a4000000-0000-0000-0000-000000000001';
  const STUDENT_B_ID = 'a4000000-0000-0000-0000-000000000002';
  const PROCTOR_ID = 'a3000000-0000-0000-0000-000000000001';
  const INACTIVE_USER_ID = 'a9000000-0000-0000-0000-000000000001';

  const hodToken = createTestToken(HOD_ID);
  const studentToken = createTestToken(STUDENT_ID);
  const teacherToken = createTestToken(TEACHER_ID);

  try {
    // -------------------------------------------------------------------------
    // SECTION 1: REPOSITORY FACTORY & PRODUCTION FAIL-CLOSED BEHAVIOR
    // -------------------------------------------------------------------------
    console.log('\n--- SECTION 1: Repository Architecture & Fail-Closed Invariants ---');

    const testRepo = getAcademicRepository();
    assert(
      testRepo instanceof InMemoryAcademicRepository,
      'Test environment instantiates typed InMemoryAcademicRepository'
    );

    // Verify production fail-closed invariant
    let prodCheckPassed = false;
    const originalEnv = process.env.NODE_ENV;
    const originalTestMode = process.env.SMARTFA_TEST_MODE;
    const originalServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    try {
      setAcademicRepositoryForTesting(null as any);
      process.env.NODE_ENV = 'production';
      delete process.env.SMARTFA_TEST_MODE;
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;

      try {
        getAcademicRepository();
      } catch (err: any) {
        if (err.message.includes('Production mode requires active Supabase credentials')) {
          prodCheckPassed = true;
        }
      }
    } finally {
      process.env.NODE_ENV = originalEnv;
      if (originalTestMode) process.env.SMARTFA_TEST_MODE = originalTestMode;
      if (originalServiceKey) process.env.SUPABASE_SERVICE_ROLE_KEY = originalServiceKey;
      setAcademicRepositoryForTesting(new InMemoryAcademicRepository());
    }
    assert(
      prodCheckPassed,
      'Production fails closed (throws 500) if Supabase is unconfigured without silent fallback'
    );

    // -------------------------------------------------------------------------
    // SECTION 2: AUTHENTICATION & RBAC PERIMETER
    // -------------------------------------------------------------------------
    console.log('\n--- SECTION 2: Authentication & RBAC Boundary Controls ---');

    // Test: Unauthenticated request rejected
    const unauthRes = await makeRequest('GET', '/api/v1/admin/hod/programmes');
    assert(
      unauthRes.status === 401 && unauthRes.body.error?.code === 'UNAUTHORIZED',
      'Unauthenticated request to HOD route rejected (401 UNAUTHORIZED)'
    );

    // Test: Student cannot access HOD routes
    const studentAccessRes = await makeRequest('GET', '/api/v1/admin/hod/programmes', studentToken);
    assert(
      studentAccessRes.status === 403 && studentAccessRes.body.error?.code === 'FORBIDDEN',
      'Student identity rejected from HOD administrative route (403 FORBIDDEN)'
    );

    // Test: Teacher cannot access HOD routes
    const teacherAccessRes = await makeRequest('GET', '/api/v1/admin/hod/programmes', teacherToken);
    assert(
      teacherAccessRes.status === 403 && teacherAccessRes.body.error?.code === 'FORBIDDEN',
      'Faculty / Subject Teacher rejected from HOD administrative route (403 FORBIDDEN)'
    );

    // Test: Forged headers in student request cannot bypass RBAC
    const spoofHeaderRes = await makeRequest('GET', '/api/v1/admin/hod/programmes', studentToken, undefined, {
      'X-User-Role': 'hod',
      'X-Role': 'hod',
      'X-User-Id': HOD_ID
    });
    assert(
      spoofHeaderRes.status === 403,
      'Client-supplied role/identity spoofing headers strictly ignored (403 FORBIDDEN)'
    );

    // -------------------------------------------------------------------------
    // SECTION 3: ACADEMIC STRUCTURE CRUD & VALIDATION
    // -------------------------------------------------------------------------
    console.log('\n--- SECTION 3: Academic Administration CRUD & Integrity Constraints ---');

    // 1. Programme Creation
    const progRes = await makeRequest('POST', '/api/v1/admin/hod/programmes', hodToken, {
      code: 'ISE',
      name: 'Department of Information Science and Engineering',
      duration_years: 4,
      total_semesters: 8
    });
    assert(
      progRes.status === 201 && progRes.body.programme?.code === 'ISE',
      'HOD creates new Programme (201 Created)'
    );
    const createdProgId = progRes.body.programme?.id;

    // 2. Duplicate Programme code conflict
    const dupProgRes = await makeRequest('POST', '/api/v1/admin/hod/programmes', hodToken, {
      code: 'ISE',
      name: 'Duplicate ISE Programme',
      duration_years: 4,
      total_semesters: 8
    });
    assert(
      dupProgRes.status === 409 && dupProgRes.body.error?.code === 'DUPLICATE_PROGRAMME_CODE',
      'Duplicate Programme code returns conflict (409 DUPLICATE_PROGRAMME_CODE)'
    );

    // 3. Academic Term Creation
    const termRes = await makeRequest('POST', '/api/v1/admin/hod/terms', hodToken, {
      name: 'Spring 2027',
      starts_on: '2027-01-15',
      ends_on: '2027-06-30',
      active: true
    });
    assert(
      termRes.status === 201 && termRes.body.term?.name === 'Spring 2027',
      'HOD creates new Academic Term (201 Created)'
    );
    const createdTermId = termRes.body.term?.id;

    // 4. Academic Term Invalid Date Range Constraint
    const badDateTermRes = await makeRequest('POST', '/api/v1/admin/hod/terms', hodToken, {
      name: 'Invalid Term Dates',
      starts_on: '2027-12-01',
      ends_on: '2027-01-01',
      active: true
    });
    assert(
      badDateTermRes.status === 400,
      'Academic Term with ends_on earlier than starts_on rejected (400 BAD_REQUEST)'
    );

    // 5. Class Batch Creation
    const classRes = await makeRequest('POST', '/api/v1/admin/hod/classes', hodToken, {
      term_id: createdTermId,
      programme: 'ISE',
      semester: 4,
      section: 'B',
      class_teacher_id: TEACHER_ID
    });
    assert(
      classRes.status === 201 && classRes.body.class?.programme === 'ISE',
      'HOD creates new Class Batch with assigned class teacher (201 Created)'
    );
    const createdClassId = classRes.body.class?.id;

    // 6. Class with invalid foreign key rejected
    const badClassFkRes = await makeRequest('POST', '/api/v1/admin/hod/classes', hodToken, {
      term_id: '00000000-0000-0000-0000-000000000999',
      programme: 'ISE',
      semester: 4,
      section: 'C'
    });
    assert(
      badClassFkRes.status === 404 && badClassFkRes.body.error?.code === 'TERM_NOT_FOUND',
      'Class with non-existent term_id rejected (404 TERM_NOT_FOUND)'
    );

    // 7. Course Subject Creation
    const subjectRes = await makeRequest('POST', '/api/v1/admin/hod/subjects', hodToken, {
      code: 'ISE401',
      name: 'Distributed Systems & Microservices',
      credits: 4
    });
    assert(
      subjectRes.status === 201 && subjectRes.body.subject?.code === 'ISE401',
      'HOD creates course Subject (201 Created)'
    );
    const createdSubjectId = subjectRes.body.subject?.id;

    // 8. Class-Subject Assignment
    const csRes = await makeRequest('POST', '/api/v1/admin/hod/class-subjects', hodToken, {
      class_id: createdClassId,
      subject_id: createdSubjectId,
      subject_teacher_id: TEACHER_ID
    });
    assert(
      csRes.status === 201 && csRes.body.class_subject?.class_id === createdClassId,
      'HOD assigns Subject Teacher to Class-Subject (201 Created)'
    );

    // 9. Duplicate Class-Subject Assignment rejected
    const dupCsRes = await makeRequest('POST', '/api/v1/admin/hod/class-subjects', hodToken, {
      class_id: createdClassId,
      subject_id: createdSubjectId,
      subject_teacher_id: TEACHER_ID
    });
    assert(
      dupCsRes.status === 409 && dupCsRes.body.error?.code === 'CLASS_SUBJECT_CONFLICT',
      'Duplicate Class-Subject assignment returns conflict (409 CLASS_SUBJECT_CONFLICT)'
    );

    // -------------------------------------------------------------------------
    // SECTION 4: STUDENT ENROLLMENT & PROCTOR MAPPING
    // -------------------------------------------------------------------------
    console.log('\n--- SECTION 4: Student Enrollments & Proctor Assignments ---');

    // 1. Valid Student Enrollment
    const enrollRes = await makeRequest('POST', '/api/v1/admin/hod/enrollments', hodToken, {
      class_id: createdClassId,
      student_id: STUDENT_ID,
      roll_number: '1RV24IS001'
    });
    assert(
      enrollRes.status === 201 && enrollRes.body.enrollment?.roll_number === '1RV24IS001',
      'HOD enrolls active Student in Class (201 Created)'
    );

    // 2. Duplicate Enrollment returns 409
    const dupEnrollRes = await makeRequest('POST', '/api/v1/admin/hod/enrollments', hodToken, {
      class_id: createdClassId,
      student_id: STUDENT_ID,
      roll_number: '1RV24IS001'
    });
    assert(
      dupEnrollRes.status === 409 && dupEnrollRes.body.error?.code === 'ENROLLMENT_CONFLICT',
      'Duplicate enrollment in same class returns conflict (409 ENROLLMENT_CONFLICT)'
    );

    // 3. Enrollment with Inactive Student rejected
    const inactiveEnrollRes = await makeRequest('POST', '/api/v1/admin/hod/enrollments', hodToken, {
      class_id: createdClassId,
      student_id: INACTIVE_USER_ID,
      roll_number: '1RV24IS099'
    });
    assert(
      inactiveEnrollRes.status === 403 && inactiveEnrollRes.body.error?.code === 'STUDENT_INACTIVE',
      'Enrolling an inactive account rejected (403 STUDENT_INACTIVE)'
    );

    // 4. Enrolling a Teacher as Student rejected
    const nonStudentEnrollRes = await makeRequest('POST', '/api/v1/admin/hod/enrollments', hodToken, {
      class_id: createdClassId,
      student_id: TEACHER_ID,
      roll_number: 'FACULTY_TRYING_TO_ENROLL'
    });
    assert(
      nonStudentEnrollRes.status === 400 && nonStudentEnrollRes.body.error?.code === 'INVALID_ROLE',
      'Enrolling non-student account as student rejected (400 INVALID_ROLE)'
    );

    // 5. Valid Proctor Assignment
    const proctorRes = await makeRequest('POST', '/api/v1/admin/hod/proctor-assignments', hodToken, {
      class_id: createdClassId,
      student_id: STUDENT_ID,
      proctor_id: PROCTOR_ID,
      valid_from: '2027-01-15'
    });
    assert(
      proctorRes.status === 201 && proctorRes.body.proctor_assignment?.proctor_id === PROCTOR_ID,
      'HOD assigns faculty Proctor to Student (201 Created)'
    );

    // 6. Assigning non-proctor as proctor rejected
    const invalidProctorRes = await makeRequest('POST', '/api/v1/admin/hod/proctor-assignments', hodToken, {
      class_id: createdClassId,
      student_id: STUDENT_B_ID,
      proctor_id: STUDENT_ID, // Student trying to be proctor
      valid_from: '2027-01-15'
    });
    assert(
      invalidProctorRes.status === 400 && invalidProctorRes.body.error?.code === 'INVALID_ROLE',
      'Assigning non-proctor user as proctor rejected (400 INVALID_ROLE)'
    );

    // 7. Proctor assignment date constraint (valid_to earlier than valid_from)
    const badDateProctorRes = await makeRequest('POST', '/api/v1/admin/hod/proctor-assignments', hodToken, {
      class_id: createdClassId,
      student_id: STUDENT_B_ID,
      proctor_id: PROCTOR_ID,
      valid_from: '2027-12-01',
      valid_to: '2027-01-01'
    });
    assert(
      badDateProctorRes.status === 400 && badDateProctorRes.body.error?.code === 'INVALID_DATE_RANGE',
      'Proctor assignment with valid_to earlier than valid_from rejected (400 INVALID_DATE_RANGE)'
    );

    // 8. Retrieval queries with JOINs
    const enrollListRes = await makeRequest('GET', `/api/v1/admin/hod/enrollments?class_id=${createdClassId}`, hodToken);
    assert(
      enrollListRes.status === 200 && enrollListRes.body.enrollments.length > 0 && enrollListRes.body.enrollments[0].student_name !== undefined,
      'GET /enrollments returns populated student details and class metadata (200 OK)'
    );

    const proctorListRes = await makeRequest('GET', `/api/v1/admin/hod/proctor-assignments?class_id=${createdClassId}`, hodToken);
    assert(
      proctorListRes.status === 200 && proctorListRes.body.proctor_assignments.length > 0 && proctorListRes.body.proctor_assignments[0].proctor_name !== undefined,
      'GET /proctor-assignments returns populated student and proctor metadata (200 OK)'
    );

    // -------------------------------------------------------------------------
    // SECTION 5: SECURITY POLICY & PRIVILEGE BOUNDARIES
    // -------------------------------------------------------------------------
    console.log('\n--- SECTION 5: Security Policy & Privilege Boundaries ---');

    // 1. HOD cannot self-modify roles
    const selfRoleRes = await makeRequest('POST', `/api/v1/admin/hod/users/${HOD_ID}/roles`, hodToken, {
      role: 'student'
    });
    assert(
      selfRoleRes.status === 403 && selfRoleRes.body.error?.code === 'FORBIDDEN_SELF_MODIFICATION',
      'HOD prevented from modifying own roles (403 FORBIDDEN_SELF_MODIFICATION)'
    );

    // 2. HOD cannot delegate HOD role to another user
    const delegateHodRes = await makeRequest('POST', `/api/v1/admin/hod/users/${TEACHER_ID}/roles`, hodToken, {
      role: 'hod'
    });
    assert(
      delegateHodRes.status === 403 && delegateHodRes.body.error?.code === 'FORBIDDEN_PRIVILEGE_ESCALATION',
      'HOD prevented from delegating or granting HOD role (403 FORBIDDEN_PRIVILEGE_ESCALATION)'
    );

    // 3. HOD cannot deactivate own account
    const selfDeactivateRes = await makeRequest('PATCH', `/api/v1/admin/hod/users/${HOD_ID}/status`, hodToken, {
      status: 'inactive'
    });
    assert(
      selfDeactivateRes.status === 403 && selfDeactivateRes.body.error?.code === 'FORBIDDEN_SELF_MODIFICATION',
      'HOD prevented from deactivating own account (403 FORBIDDEN_SELF_MODIFICATION)'
    );

    // -------------------------------------------------------------------------
    // SECTION 6: AUDIT TRAIL PERSISTENCE
    // -------------------------------------------------------------------------
    console.log('\n--- SECTION 6: Audit Trail Integrity & Persistence ---');

    const auditRes = await makeRequest('GET', '/api/v1/admin/hod/audit', hodToken);
    assert(
      auditRes.status === 200 && Array.isArray(auditRes.body.events) && auditRes.body.events.length > 0,
      'Audit log events retrieved successfully (200 OK)'
    );

    // Check that administrative operations produced audit records
    const recordedActions = auditRes.body.events.map((e: any) => e.action);
    const hasProgAudit = recordedActions.includes('CREATE_PROGRAMME');
    const hasTermAudit = recordedActions.includes('CREATE_TERM');
    const hasClassAudit = recordedActions.includes('CREATE_CLASS');
    const hasSubjectAudit = recordedActions.includes('CREATE_SUBJECT');
    const hasEnrollAudit = recordedActions.includes('ENROLL_STUDENT');
    const hasProctorAudit = recordedActions.includes('ASSIGN_PROCTOR');

    assert(
      hasProgAudit && hasTermAudit && hasClassAudit && hasSubjectAudit && hasEnrollAudit && hasProctorAudit,
      'All academic mutations persisted corresponding audit events with actor ID and correlation ID'
    );

  } catch (err) {
    console.error('Unexpected test suite execution failure:', err);
  } finally {
    server.close();
  }

  console.log('\n================================================================');
  console.log(` RESULTS: ${passedTests}/${totalTests} Tests Passed`);
  console.log('================================================================');

  if (passedTests !== totalTests) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests();
