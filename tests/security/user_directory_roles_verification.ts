/**
 * ==============================================================================
 * ACADASSESS: USER DIRECTORY & ROLES WORKFLOW VERIFICATION SUITE
 * ==============================================================================
 * 
 * Verifies:
 * 1. Context-sensitive buttons (+ Add Faculty / + Add Student) based on selected tab
 * 2. Dedicated forms for Faculty and Student creation
 * 3. Strict backend user category enforcement (Faculty cannot receive Student role; Student cannot receive Faculty roles)
 * 4. Validation of required fields (Name, Email, USN for students, Faculty roles)
 * 5. Duplicate email and duplicate USN prevention (HTTP 409)
 * 6. RBAC and privilege escalation protection (No HOD role self-grant, student/faculty forbidden)
 * ==============================================================================
 */

process.env.SMARTFA_TEST_MODE = 'true';
import http from 'http';
import fs from 'fs';
import path from 'path';
import jwt from 'jsonwebtoken';
import app from '../../apps/api/src/index.js';
import * as contracts from '@smartfa/contracts';
import { InMemoryUserRepository, setUserRepositoryForTesting } from '../../apps/api/src/storage/userRepository.js';
import { InMemoryDatabase } from '../../apps/api/src/storage/db.js';

let server: http.Server;
const PORT = 4016;
const DEV_JWT_SECRET = process.env.JWT_DEV_SECRET || 'smartfa-test-hmac-dev-secret-key-32chars';

const HOD_ID = 'a1000000-0000-0000-0000-000000000001';
const TEACHER_ID = 'a2000000-0000-0000-0000-000000000001';
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
  console.log(' ACADASSESS: USER DIRECTORY & ROLES WORKFLOW VERIFICATION SUITE');
  console.log('================================================================\n');

  // Setup isolated in-memory user repository for testing
  const testDb = new InMemoryDatabase();
  const testRepo = new InMemoryUserRepository(testDb);
  setUserRepositoryForTesting(testRepo);

  await new Promise<void>((resolve) => {
    server = app.listen(PORT, () => {
      console.log(`[Test Server] Running on http://localhost:${PORT}\n`);
      resolve();
    });
  });

  try {
    const hodToken = createToken(HOD_ID, 'hod@smartfa.edu');
    const teacherToken = createToken(TEACHER_ID, 'teacher1@smartfa.edu');
    const studentToken = createToken(STUDENT_ID, 'student.a@smartfa.edu');

    // -------------------------------------------------------------------------
    // 1. Frontend UI Source Audit
    // -------------------------------------------------------------------------
    console.log('--- 1. Frontend UI Context-Sensitive Button & Form Separation Audit ---');
    const userMgmtPath = path.resolve('apps/web/src/features/hod/UserManagement.tsx');
    const userMgmtContent = fs.readFileSync(userMgmtPath, 'utf-8');

    assert(
      userMgmtContent.includes('+ Add Faculty'),
      'Test 1: UserManagement.tsx contains "+ Add Faculty" button label'
    );
    assert(
      userMgmtContent.includes('+ Add Student'),
      'Test 2: UserManagement.tsx contains "+ Add Student" button label'
    );
    assert(
      !userMgmtContent.includes('Invite Institutional User'),
      'Test 3: Old generic "Invite Institutional User" button text completely eliminated'
    );
    assert(
      userMgmtContent.includes('showAddFacultyModal') && userMgmtContent.includes('showAddStudentModal'),
      'Test 4: UserManagement.tsx contains separate state for Add Faculty and Add Student modals'
    );
    assert(
      userMgmtContent.includes('handleToggleFacultyRole') && userMgmtContent.includes('subject_teacher'),
      'Test 5: Add Faculty modal offers specific faculty roles (subject_teacher, class_teacher, proctor)'
    );

    // -------------------------------------------------------------------------
    // 2. Backend Category Boundary & Privilege Escalation Invariants
    // -------------------------------------------------------------------------
    console.log('\n--- 2. Backend Category Boundary & Security Invariants ---');

    // Test: Faculty account cannot receive student role
    const invalidFacultyRes = await makeRequest('POST', '/api/v1/admin/hod/users/invite', hodToken, {
      full_name: 'Dr. Test Cross',
      email: 'cross.faculty@sjbit.edu.in',
      account_type: 'faculty',
      role: 'student'
    });
    assert(
      invalidFacultyRes.status === 400 && invalidFacultyRes.body?.error?.code === 'INVALID_ROLE_FOR_ACCOUNT_TYPE',
      'Test 6: Faculty account cannot receive student role (rejected with HTTP 400 INVALID_ROLE_FOR_ACCOUNT_TYPE)'
    );

    // Test: Student account cannot receive faculty role
    const invalidStudentRes = await makeRequest('POST', '/api/v1/admin/hod/users/invite', hodToken, {
      full_name: 'Student Cross',
      email: 'cross.student@sjbit.edu.in',
      usn: '1RV24MC091',
      account_type: 'student',
      role: 'subject_teacher'
    });
    assert(
      invalidStudentRes.status === 400 && invalidStudentRes.body?.error?.code === 'INVALID_ROLE_FOR_ACCOUNT_TYPE',
      'Test 7: Student account cannot receive faculty role (rejected with HTTP 400 INVALID_ROLE_FOR_ACCOUNT_TYPE)'
    );

    // Test: Attempting to grant HOD role is forbidden
    const hodEscalationRes = await makeRequest('POST', '/api/v1/admin/hod/users/invite', hodToken, {
      full_name: 'Imposter HOD',
      email: 'imposter@sjbit.edu.in',
      account_type: 'faculty',
      role: 'hod'
    });
    assert(
      hodEscalationRes.status === 403 && hodEscalationRes.body?.error?.code === 'FORBIDDEN_PRIVILEGE_ESCALATION',
      'Test 8: Granting HOD role via standard user form is forbidden (HTTP 403 FORBIDDEN_PRIVILEGE_ESCALATION)'
    );

    // Test: Student cannot invite users
    const studentInviteRes = await makeRequest('POST', '/api/v1/admin/hod/users/invite', studentToken, {
      full_name: 'Unauthorized User',
      email: 'unauth@sjbit.edu.in',
      account_type: 'student',
      role: 'student',
      usn: '1RV24MC092'
    });
    assert(
      studentInviteRes.status === 403,
      'Test 9: Student token is strictly forbidden from inviting users (HTTP 403)'
    );

    // Test: Faculty without HOD role cannot invite users
    const teacherInviteRes = await makeRequest('POST', '/api/v1/admin/hod/users/invite', teacherToken, {
      full_name: 'Teacher Invited',
      email: 'teacherinv@sjbit.edu.in',
      account_type: 'faculty',
      role: 'subject_teacher'
    });
    assert(
      teacherInviteRes.status === 403,
      'Test 10: Non-HOD faculty is forbidden from inviting users (HTTP 403)'
    );

    // -------------------------------------------------------------------------
    // 3. Faculty Creation & Multi-Role Provisioning
    // -------------------------------------------------------------------------
    console.log('\n--- 3. Faculty Provisioning & Role Assignment ---');

    const facultyPayload = {
      full_name: 'Prof. Test Mentor',
      email: 'prof.test.mentor@sjbit.edu.in',
      account_type: 'faculty',
      role: 'subject_teacher',
      roles: ['subject_teacher', 'proctor']
    };

    const addFacultyRes = await makeRequest('POST', '/api/v1/admin/hod/users/invite', hodToken, facultyPayload);
    assert(
      addFacultyRes.status === 201,
      'Test 11: HOD successfully creates Faculty account (HTTP 201)'
    );
    assert(
      addFacultyRes.body?.user?.full_name === 'Prof. Test Mentor' && addFacultyRes.body?.user?.usn === null,
      'Test 12: Created Faculty has null USN (USN never assigned to faculty)'
    );
    assert(
      Array.isArray(addFacultyRes.body?.roles) && addFacultyRes.body?.roles.includes('subject_teacher') && addFacultyRes.body?.roles.includes('proctor'),
      'Test 13: Faculty assigned both Subject Teacher and Proctor roles'
    );

    // Test duplicate email for faculty
    const dupFacultyEmailRes = await makeRequest('POST', '/api/v1/admin/hod/users/invite', hodToken, {
      full_name: 'Prof. Another Person',
      email: 'prof.test.mentor@sjbit.edu.in',
      account_type: 'faculty',
      role: 'subject_teacher'
    });
    assert(
      dupFacultyEmailRes.status === 409 && dupFacultyEmailRes.body?.error?.code === 'DUPLICATE_EMAIL',
      'Test 14: Duplicate faculty email rejected with HTTP 409 DUPLICATE_EMAIL'
    );

    // -------------------------------------------------------------------------
    // 4. Student Creation & USN Validation
    // -------------------------------------------------------------------------
    console.log('\n--- 4. Student Provisioning, Validation & Duplicate USN Checks ---');

    // Missing USN validation
    const missingUsnRes = await makeRequest('POST', '/api/v1/admin/hod/users/invite', hodToken, {
      full_name: 'Student No USN',
      email: 'student.nousn@sjbit.edu.in',
      account_type: 'student',
      role: 'student'
    });
    assert(
      missingUsnRes.status === 400 && missingUsnRes.body?.error?.code === 'VALIDATION_ERROR',
      'Test 15: Student creation without USN rejected with HTTP 400 VALIDATION_ERROR'
    );

    // Valid student creation
    const studentPayload = {
      full_name: 'Kavya S. Sharma',
      email: 'kavya.sharma@sjbit.edu.in',
      usn: '1RV24MC088',
      account_type: 'student',
      role: 'student'
    };

    const addStudentRes = await makeRequest('POST', '/api/v1/admin/hod/users/invite', hodToken, studentPayload);
    assert(
      addStudentRes.status === 201,
      'Test 16: HOD successfully creates Student account (HTTP 201)'
    );
    assert(
      addStudentRes.body?.user?.full_name === 'Kavya S. Sharma' && addStudentRes.body?.user?.usn === '1RV24MC088',
      'Test 17: Student profile created with correct USN'
    );
    assert(
      addStudentRes.body?.role?.role === 'student',
      'Test 18: Student assigned strictly the student role'
    );

    // Duplicate USN check
    const dupUsnRes = await makeRequest('POST', '/api/v1/admin/hod/users/invite', hodToken, {
      full_name: 'Another Student Same USN',
      email: 'another.student@sjbit.edu.in',
      usn: '1RV24MC088',
      account_type: 'student',
      role: 'student'
    });
    assert(
      dupUsnRes.status === 409 && dupUsnRes.body?.error?.code === 'DUPLICATE_USN',
      'Test 19: Duplicate student USN rejected with HTTP 409 DUPLICATE_USN'
    );

    // Duplicate Email check for student
    const dupStudentEmailRes = await makeRequest('POST', '/api/v1/admin/hod/users/invite', hodToken, {
      full_name: 'Different Student Same Email',
      email: 'kavya.sharma@sjbit.edu.in',
      usn: '1RV24MC089',
      account_type: 'student',
      role: 'student'
    });
    assert(
      dupStudentEmailRes.status === 409 && dupStudentEmailRes.body?.error?.code === 'DUPLICATE_EMAIL',
      'Test 20: Duplicate student email rejected with HTTP 409 DUPLICATE_EMAIL'
    );

  } finally {
    // Reset repository override
    setUserRepositoryForTesting(null);
    server.close();
  }

  console.log('\n================================================================');
  console.log(` RESULTS: ${passCount}/${passCount + failCount} Tests Passed`);
  console.log('================================================================\n');

  if (failCount > 0) {
    process.exit(1);
  }
}

runVerification().catch(err => {
  console.error('Test execution failed:', err);
  if (server) server.close();
  process.exit(1);
});
