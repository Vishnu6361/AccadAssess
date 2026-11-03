/**
 * ============================================================================
 * ACADASSESS: ACADEMIC STRUCTURE UI & API VERIFICATION
 * ============================================================================
 * 
 * Verifies that the academic structure adheres strictly to:
 *   Programme -> Specialization -> Semester -> Subject
 * 
 * Invariants:
 * 1. Zero occurrences of department or department dropdowns in AcademicStructure.tsx
 * 2. AcademicStructure.tsx has tabs: programmes, classes, subjects, class_subjects
 * 3. Class modal uses term, programme, semester, section without department
 * 4. Subject modal uses code, name, programme, specialization, semester, credits without department
 * 5. GET /api/v1/admin/hod/departments is removed (returns 404)
 * 6. Programme and Class CRUD work cleanly without department_id
 * 7. Class-Subject allocations and RBAC boundaries are strictly enforced
 * ============================================================================
 */

process.env.SMARTFA_TEST_MODE = 'true';
import http from 'http';
import fs from 'fs';
import path from 'path';
import jwt from 'jsonwebtoken';
import app from '../../apps/api/src/index.js';

let server: http.Server;
const PORT = 4007;
const DEV_JWT_SECRET = process.env.JWT_DEV_SECRET || 'smartfa-test-hmac-dev-secret-key-32chars';

const HOD_ID = 'a1000000-0000-0000-0000-000000000001';
const TEACHER_ID = 'a2000000-0000-0000-0000-000000000001';
const STUDENT_ID = 'a4000000-0000-0000-0000-000000000001';

function createTestToken(userId: string, email: string = 'user@smartfa.edu'): string {
  return jwt.sign(
    {
      sub: userId,
      email
    },
    DEV_JWT_SECRET,
    { expiresIn: '1h' }
  );
}

function makeRequest(
  method: string,
  urlPath: string,
  token?: string,
  body?: any,
  headers?: Record<string, string>
): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : undefined;
    const reqHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      ...headers
    };
    if (token) {
      reqHeaders['Authorization'] = `Bearer ${token}`;
    }
    if (payload) {
      reqHeaders['Content-Length'] = Buffer.byteLength(payload).toString();
    }

    const req = http.request(
      `http://localhost:${PORT}${urlPath}`,
      { method, headers: reqHeaders },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          let parsed: any;
          try {
            parsed = JSON.parse(data);
          } catch {
            parsed = data;
          }
          resolve({ status: res.statusCode || 500, body: parsed });
        });
      }
    );

    req.on('error', (err) => reject(err));
    if (payload) req.write(payload);
    req.end();
  });
}

let totalTests = 0;
let passedTests = 0;

function assert(condition: boolean, message: string, context?: any) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  [PASS] Test ${totalTests}: ${message}`);
  } else {
    console.error(`  [FAIL] Test ${totalTests}: ${message}`);
    if (context) {
      console.error('         Context:', typeof context === 'string' ? context : JSON.stringify(context));
    }
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runTests() {
  console.log('================================================================');
  console.log(' ACADASSESS: ACADEMIC STRUCTURE REFACTOR VERIFICATION');
  console.log('================================================================\n');

  await new Promise<void>((resolve) => {
    server = app.listen(PORT, () => {
      console.log(`[Test Server] Running on http://localhost:${PORT}`);
      resolve();
    });
  });

  const hodToken = createTestToken(HOD_ID);
  const teacherToken = createTestToken(TEACHER_ID);
  const studentToken = createTestToken(STUDENT_ID);

  try {
    // -------------------------------------------------------------------------
    // SECTION 1: Static Code Invariants & Frontend Contract
    // -------------------------------------------------------------------------
    console.log('\n--- SECTION 1: Static Code Invariants & Frontend Contract ---');

    const componentPath = path.resolve(process.cwd(), 'apps/web/src/features/hod/AcademicStructure.tsx');
    const sourceCode = fs.readFileSync(componentPath, 'utf-8');

    // 1. Invariant: ZERO occurrences of 'department' (case-insensitive) in AcademicStructure.tsx
    const hasDeptAnywhere = /department/i.test(sourceCode);
    assert(!hasDeptAnywhere, 'AcademicStructure.tsx contains ZERO occurrences of "department"');

    // 2. Invariant: Dedicated programmes, classes, subjects, class_subjects tabs exist
    const hasProgrammesTab = sourceCode.includes("'programmes'");
    const hasClassesTab = sourceCode.includes("'classes'");
    const hasSubjectsTab = sourceCode.includes("'subjects'");
    const hasClassSubjectsTab = sourceCode.includes("'class_subjects'");
    assert(
      hasProgrammesTab && hasClassesTab && hasSubjectsTab && hasClassSubjectsTab,
      'AcademicStructure.tsx includes programmes, classes, subjects, and class_subjects tabs'
    );

    // 3. Class modal implements explicit term selector and programme selector
    const hasClassTermSelect = sourceCode.includes('classTermId') && sourceCode.includes('-- Select Academic Term --');
    const hasClassProgSelect = sourceCode.includes('classProg');
    assert(hasClassTermSelect && hasClassProgSelect, 'Class creation modal implements explicit term and programme selection');

    // 4. Subject modal implements Programme -> Specialization -> Semester hierarchy
    const hasSubProgSelect = sourceCode.includes('subProgId');
    const hasSubSpecSelect = sourceCode.includes('subSpecId');
    const hasSubSemSelect = sourceCode.includes('subSemester');
    assert(
      hasSubProgSelect && hasSubSpecSelect && hasSubSemSelect,
      'Subject creation modal implements Programme -> Specialization -> Semester hierarchy'
    );

    // 5. Class-Subject allocation modal and handlers exist
    const hasAllocForm = sourceCode.includes('handleAssignClassSubject') && sourceCode.includes('allocClassId') && sourceCode.includes('allocSubjectId') && sourceCode.includes('allocTeacherId');
    assert(hasAllocForm, 'AcademicStructure.tsx implements class-subject allocation form with explicit selectors');

    // 6. Submit buttons have proper validation
    const hasDisabledClassBtn = sourceCode.includes('disabled={!classTermId || terms.length === 0}');
    const hasDisabledAllocBtn = sourceCode.includes('disabled={!allocClassId || !allocSubjectId || !allocTeacherId');
    assert(
      hasDisabledClassBtn && hasDisabledAllocBtn,
      'Submit buttons are disabled when required selections are missing'
    );

    // -------------------------------------------------------------------------
    // SECTION 2: Academic Hierarchy API Workflows
    // -------------------------------------------------------------------------
    console.log('\n--- SECTION 2: Academic Hierarchy API Workflows ---');

    // 7. GET /departments endpoint is cleanly removed (returns 404)
    const deptEndpointRes = await makeRequest('GET', '/api/v1/admin/hod/departments', hodToken);
    assert(
      deptEndpointRes.status === 404,
      `GET /api/v1/admin/hod/departments returns 404 (got ${deptEndpointRes.status})`
    );

    // 8. POST /departments endpoint is cleanly removed (returns 404)
    const deptPostRes = await makeRequest('POST', '/api/v1/admin/hod/departments', hodToken, {
      code: 'AIML',
      name: 'Department of AI'
    });
    assert(
      deptPostRes.status === 404,
      `POST /api/v1/admin/hod/departments returns 404 (got ${deptPostRes.status})`
    );

    // 9. HOD creates Programme
    const progCode = `TESTPROG_${Date.now().toString().slice(-4)}`;
    const progRes = await makeRequest('POST', '/api/v1/admin/hod/programmes', hodToken, {
      code: progCode,
      name: 'Master of Technology in Artificial Intelligence',
      duration_years: 2,
      total_semesters: 4
    });
    assert(progRes.status === 201, `HOD creates Programme without department (got ${progRes.status})`);
    const progId = progRes.body.programme.id;

    // 10. HOD creates Specialization under Programme
    const specCode = `TESTSPEC_${Date.now().toString().slice(-4)}`;
    const specRes = await makeRequest('POST', '/api/v1/admin/hod/specializations', hodToken, {
      programme_id: progId,
      code: specCode,
      name: 'Intelligent Systems & Robotics',
      applicable_semesters: [1, 2, 3, 4]
    });
    assert(specRes.status === 201, `HOD creates Specialization under Programme (got ${specRes.status})`);
    const specId = specRes.body.specialization.id;

    // 11. HOD creates Academic Term
    const termRes = await makeRequest('POST', '/api/v1/admin/hod/terms', hodToken, {
      name: `Academic Term ${Date.now().toString().slice(-4)}`,
      starts_on: '2026-08-01',
      ends_on: '2026-12-15',
      active: true
    });
    assert(termRes.status === 201, 'HOD creates Academic Term (201 Created)');
    const termId = termRes.body.term.id;

    // 12. HOD creates Class without department_id
    const classRes = await makeRequest('POST', '/api/v1/admin/hod/classes', hodToken, {
      term_id: termId,
      programme: progCode,
      semester: 1,
      section: 'A',
      class_teacher_id: TEACHER_ID
    });
    assert(
      classRes.status === 201 &&
      classRes.body.class.term_id === termId &&
      classRes.body.class.programme === progCode &&
      classRes.body.class.department_id === undefined,
      'Class batch created cleanly without department_id (201 Created)'
    );
    const classId = classRes.body.class.id;

    // 13. HOD creates Subject linked to Programme and Specialization without department_id
    const subCode = `CS${Date.now().toString().slice(-4)}`;
    const subRes = await makeRequest('POST', '/api/v1/admin/hod/subjects', hodToken, {
      code: subCode,
      name: 'Neural Networks & Deep Learning',
      programme_id: progId,
      specialization_id: specId,
      semester: 1,
      credits: 4
    });
    assert(
      subRes.status === 201 &&
      subRes.body.subject.code === subCode &&
      subRes.body.subject.department_id === undefined &&
      subRes.body.subject.programme_id === progId,
      'Subject created cleanly with Programme/Specialization without department_id (201 Created)'
    );
    const subjectId = subRes.body.subject.id;

    // -------------------------------------------------------------------------
    // SECTION 3: Class-Subject Allocation API Integration & Security
    // -------------------------------------------------------------------------
    console.log('\n--- SECTION 3: Class-Subject Allocation API Integration & Security ---');

    // 14. Unauthenticated request to /class-subjects rejected
    const unauthCsRes = await makeRequest('GET', '/api/v1/admin/hod/class-subjects');
    assert(
      unauthCsRes.status === 401 && unauthCsRes.body.error?.code === 'UNAUTHORIZED',
      'Unauthenticated request to GET /class-subjects rejected (401 UNAUTHORIZED)'
    );

    // 15. Student request to /class-subjects rejected
    const studentCsRes = await makeRequest('GET', '/api/v1/admin/hod/class-subjects', studentToken);
    assert(
      studentCsRes.status === 403 && studentCsRes.body.error?.code === 'FORBIDDEN',
      'Student request to GET /class-subjects rejected (403 FORBIDDEN)'
    );

    // 16. Teacher request to POST /class-subjects rejected
    const teacherCsPostRes = await makeRequest('POST', '/api/v1/admin/hod/class-subjects', teacherToken, {
      class_id: classId,
      subject_id: subjectId,
      subject_teacher_id: TEACHER_ID
    });
    assert(
      teacherCsPostRes.status === 403 && teacherCsPostRes.body.error?.code === 'FORBIDDEN',
      'Teacher request to POST /class-subjects rejected (403 FORBIDDEN)'
    );

    // 17. Client identity spoofing headers ignored
    const spoofCsRes = await makeRequest('POST', '/api/v1/admin/hod/class-subjects', studentToken, {
      class_id: classId,
      subject_id: subjectId,
      subject_teacher_id: TEACHER_ID
    }, {
      'x-user-id': HOD_ID,
      'x-role': 'hod'
    });
    assert(
      spoofCsRes.status === 403,
      'Client-supplied identity spoofing headers strictly ignored (403 FORBIDDEN)'
    );

    // 18. HOD retrieves class-subjects list
    const listCsRes = await makeRequest('GET', '/api/v1/admin/hod/class-subjects', hodToken);
    assert(
      listCsRes.status === 200 && Array.isArray(listCsRes.body.class_subjects),
      'HOD retrieves class-subjects catalog list (200 OK)'
    );

    // 19. Allocate subject to class batch
    const allocRes = await makeRequest('POST', '/api/v1/admin/hod/class-subjects', hodToken, {
      class_id: classId,
      subject_id: subjectId,
      subject_teacher_id: TEACHER_ID
    });
    assert(
      allocRes.status === 201 &&
      allocRes.body.class_subject?.class_id === classId &&
      allocRes.body.class_subject?.subject_id === subjectId &&
      allocRes.body.class_subject?.subject_teacher_id === TEACHER_ID,
      'HOD allocates course subject to class batch with assigned subject teacher (201 Created)'
    );

    // 20. Duplicate class-subject allocation returns conflict (409)
    const dupAllocRes = await makeRequest('POST', '/api/v1/admin/hod/class-subjects', hodToken, {
      class_id: classId,
      subject_id: subjectId,
      subject_teacher_id: TEACHER_ID
    });
    assert(
      dupAllocRes.status === 409 && dupAllocRes.body.error?.code === 'CLASS_SUBJECT_CONFLICT',
      'Duplicate class-subject allocation rejected with conflict (409 CLASS_SUBJECT_CONFLICT)'
    );

    // 21. Allocation to non-existent class rejected (404)
    const missingClassAllocRes = await makeRequest('POST', '/api/v1/admin/hod/class-subjects', hodToken, {
      class_id: '00000000-0000-0000-0000-000000000999',
      subject_id: subjectId,
      subject_teacher_id: TEACHER_ID
    });
    assert(
      missingClassAllocRes.status === 404 && missingClassAllocRes.body.error?.code === 'CLASS_NOT_FOUND',
      'Allocation with non-existent class_id returns 404 CLASS_NOT_FOUND'
    );

    // 22. Allocation to non-existent subject rejected (404)
    const missingSubAllocRes = await makeRequest('POST', '/api/v1/admin/hod/class-subjects', hodToken, {
      class_id: classId,
      subject_id: '00000000-0000-0000-0000-000000000999',
      subject_teacher_id: TEACHER_ID
    });
    assert(
      missingSubAllocRes.status === 404 && missingSubAllocRes.body.error?.code === 'SUBJECT_NOT_FOUND',
      'Allocation with non-existent subject_id returns 404 SUBJECT_NOT_FOUND'
    );

    // 23. Allocation with invalid teacher role rejected (400)
    const studentAsTeacherRes = await makeRequest('POST', '/api/v1/admin/hod/class-subjects', hodToken, {
      class_id: classId,
      subject_id: subjectId,
      subject_teacher_id: STUDENT_ID
    });
    assert(
      studentAsTeacherRes.status === 400 && studentAsTeacherRes.body.error?.code === 'INVALID_TEACHER_ROLE',
      'Allocation with non-teacher account returns 400 INVALID_TEACHER_ROLE'
    );

    // 24. Enriched listing includes details for UI rendering without department_name
    const enrichedListRes = await makeRequest('GET', '/api/v1/admin/hod/class-subjects', hodToken);
    const foundAlloc = enrichedListRes.body.class_subjects.find(
      (cs: any) => cs.class_id === classId && cs.subject_id === subjectId
    );
    assert(
      foundAlloc !== undefined &&
      typeof foundAlloc.class_name === 'string' &&
      typeof foundAlloc.subject_name === 'string' &&
      typeof foundAlloc.teacher_name === 'string' &&
      foundAlloc.department_name === undefined,
      'GET /class-subjects returns enriched metadata without department_name'
    );

    // 25. Core academic structure endpoints operate with full regression compatibility
    const progListRes = await makeRequest('GET', '/api/v1/admin/hod/programmes', hodToken);
    const termsListRes = await makeRequest('GET', '/api/v1/admin/hod/terms', hodToken);
    const classesListRes = await makeRequest('GET', '/api/v1/admin/hod/classes', hodToken);
    const subjectsListRes = await makeRequest('GET', '/api/v1/admin/hod/subjects', hodToken);
    assert(
      progListRes.status === 200 &&
      termsListRes.status === 200 &&
      classesListRes.status === 200 &&
      subjectsListRes.status === 200,
      'Programmes, terms, classes, and subjects endpoints operate cleanly (200 OK)'
    );

  } finally {
    server.close();
  }

  console.log('\n================================================================');
  console.log(` RESULTS: ${passedTests}/${totalTests} Tests Passed`);
  console.log('================================================================\n');

  if (passedTests === totalTests) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('[FATAL TEST ERROR]', err);
  process.exit(1);
});
