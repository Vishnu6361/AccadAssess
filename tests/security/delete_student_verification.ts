/**
 * ==============================================================================
 * ACADASSESS: DELETE STUDENT VERIFICATION SUITE
 * ==============================================================================
 * 
 * Verifies all specifications for the Delete Student feature:
 * 1. Active student cannot be deleted (HTTP 400 ACCOUNT_NOT_INACTIVE)
 * 2. Deactivated student with no protected records can be deleted (HTTP 200)
 * 3. Deactivated student with submissions or published grades is safely blocked (HTTP 409)
 * 4. Unauthorized users receive HTTP 401/403 (Unauthenticated 401, Student 403, Teacher 403)
 * 5. A teacher or HOD account cannot be deleted through this endpoint (HTTP 403)
 * 6. The list refreshes correctly after success
 * 7. Existing student records and academic history remain intact
 * 8. Frontend UI and Confirmation modal contract verification
 * ==============================================================================
 */

process.env.SMARTFA_TEST_MODE = 'true';
import http from 'http';
import fs from 'fs';
import path from 'path';
import jwt from 'jsonwebtoken';
import app from '../../apps/api/src/index.js';
import { InMemoryUserRepository, setUserRepositoryForTesting } from '../../apps/api/src/storage/userRepository.js';
import { InMemoryDatabase } from '../../apps/api/src/storage/db.js';

let server: http.Server;
const PORT = 4022;
const DEV_JWT_SECRET = process.env.JWT_DEV_SECRET || 'smartfa-test-hmac-dev-secret-key-32chars';

const HOD_ID = 'a1000000-0000-0000-0000-000000000001';
const TEACHER_ID = 'a2000000-0000-0000-0000-000000000001';
const ACTIVE_STUDENT_ID = 'a4000000-0000-0000-0000-000000000001';
const INACTIVE_STUDENT_ID = 'a9000000-0000-0000-0000-000000000001';

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
  console.log(' ACADASSESS: DELETE STUDENT VERIFICATION SUITE');
  console.log('================================================================\n');

  // Setup isolated in-memory user repository for testing (NEVER touches production)
  const testDb = new InMemoryDatabase();
  const testRepo = new InMemoryUserRepository(testDb);
  setUserRepositoryForTesting(testRepo);

  await new Promise<void>((resolve) => {
    server = app.listen(PORT, () => {
      console.log(`[Test Server] Running isolated test server on http://localhost:${PORT}\n`);
      resolve();
    });
  });

  try {
    const hodToken = createToken(HOD_ID, 'hod@smartfa.edu');
    const teacherToken = createToken(TEACHER_ID, 'teacher1@smartfa.edu');
    const studentToken = createToken(ACTIVE_STUDENT_ID, 'student.a@smartfa.edu');

    // -------------------------------------------------------------------------
    // 1. Active student cannot be deleted (HTTP 400 ACCOUNT_NOT_INACTIVE)
    // -------------------------------------------------------------------------
    console.log('--- 1. Active Student Deletion Protection ---');
    const activeStudentRes = await makeRequest(
      'DELETE',
      `/api/v1/admin/hod/users/${ACTIVE_STUDENT_ID}`,
      hodToken
    );

    assert(
      activeStudentRes.status === 400,
      'Test 1.1: Active student deletion rejected with HTTP 400 Bad Request',
      `Got status ${activeStudentRes.status}`
    );
    assert(
      activeStudentRes.body?.error?.code === 'ACCOUNT_NOT_INACTIVE',
      'Test 1.2: Error code is ACCOUNT_NOT_INACTIVE',
      `Got code: ${activeStudentRes.body?.error?.code}`
    );
    assert(
      typeof activeStudentRes.body?.error?.message === 'string' && activeStudentRes.body.error.message.includes('Active student accounts cannot be deleted'),
      'Test 1.3: Error explains active accounts must be deactivated first'
    );

    // Verify active student profile still exists in database
    const studentCheckAfter = await testRepo.getProfileById(ACTIVE_STUDENT_ID);
    assert(
      studentCheckAfter !== null && studentCheckAfter.status === 'active',
      'Test 1.4: Active student account remains intact in the database'
    );

    // -------------------------------------------------------------------------
    // 2. Unauthorized users receive HTTP 401 / 403
    // -------------------------------------------------------------------------
    console.log('\n--- 2. Authentication & Authorization Enforcement ---');
    // 2.1 Unauthenticated request
    const unauthRes = await makeRequest(
      'DELETE',
      `/api/v1/admin/hod/users/${INACTIVE_STUDENT_ID}`
    );
    assert(
      unauthRes.status === 401,
      'Test 2.1: Unauthenticated request rejected with HTTP 401 Unauthorized',
      `Got status ${unauthRes.status}`
    );

    // 2.2 Student attempting to delete student
    const studentDeleteRes = await makeRequest(
      'DELETE',
      `/api/v1/admin/hod/users/${INACTIVE_STUDENT_ID}`,
      studentToken
    );
    assert(
      studentDeleteRes.status === 403,
      'Test 2.2: Student attempting deletion rejected with HTTP 403 Forbidden',
      `Got status ${studentDeleteRes.status}`
    );

    // 2.3 Teacher attempting to delete student
    const teacherDeleteRes = await makeRequest(
      'DELETE',
      `/api/v1/admin/hod/users/${INACTIVE_STUDENT_ID}`,
      teacherToken
    );
    assert(
      teacherDeleteRes.status === 403,
      'Test 2.3: Teacher attempting deletion rejected with HTTP 403 Forbidden',
      `Got status ${teacherDeleteRes.status}`
    );

    // -------------------------------------------------------------------------
    // 3. Privileged accounts (Faculty/HOD) cannot be deleted through this endpoint
    // -------------------------------------------------------------------------
    console.log('\n--- 3. Privileged Account Protection (HOD / Faculty) ---');
    // 3.1 Attempt to delete faculty teacher
    const deleteTeacherRes = await makeRequest(
      'DELETE',
      `/api/v1/admin/hod/users/${TEACHER_ID}`,
      hodToken
    );
    assert(
      deleteTeacherRes.status === 403,
      'Test 3.1: Teacher account deletion rejected with HTTP 403 Forbidden',
      `Got status ${deleteTeacherRes.status}`
    );
    assert(
      deleteTeacherRes.body?.error?.code === 'FORBIDDEN_PRIVILEGE_PROTECTION',
      'Test 3.2: Error code is FORBIDDEN_PRIVILEGE_PROTECTION for faculty target',
      `Got code: ${deleteTeacherRes.body?.error?.code}`
    );

    // 3.2 Attempt HOD self-deletion
    const deleteHodSelfRes = await makeRequest(
      'DELETE',
      `/api/v1/admin/hod/users/${HOD_ID}`,
      hodToken
    );
    assert(
      deleteHodSelfRes.status === 403,
      'Test 3.3: HOD self-deletion rejected with HTTP 403 Forbidden',
      `Got status ${deleteHodSelfRes.status}`
    );
    assert(
      deleteHodSelfRes.body?.error?.code === 'FORBIDDEN_SELF_MODIFICATION',
      'Test 3.4: Error code is FORBIDDEN_SELF_MODIFICATION for HOD self-deletion',
      `Got code: ${deleteHodSelfRes.body?.error?.code}`
    );

    // -------------------------------------------------------------------------
    // 4. Deactivated student with submissions/evaluations is safely blocked (HTTP 409)
    // -------------------------------------------------------------------------
    console.log('\n--- 4. Academic Record Protection (Submissions & Evaluations) ---');
    // Create an inactive student with submissions
    const studentWithSubmissionsId = 'a4000000-0000-0000-0000-000000000099';
    testDb.profiles.push({
      id: studentWithSubmissionsId,
      full_name: 'Historical Academic Student',
      email: 'historical@smartfa.edu',
      usn: '1RV24MC098',
      status: 'inactive', // inactive
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
    testDb.roles.push({
      id: 'r9999999-0000-0000-0000-000000000001',
      user_id: studentWithSubmissionsId,
      role: 'student',
      active: true,
      created_at: new Date().toISOString()
    });
    // Add linked submission
    testDb.submissions.push({
      id: 'sub10000-0000-0000-0000-000000000001',
      assessment_id: 'ass10000-0000-0000-0000-000000000001',
      question_id: 'q1000000-0000-0000-0000-000000000001',
      student_id: studentWithSubmissionsId,
      status: 'uploaded',
      first_submitted_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });

    const deleteWithRecordsRes = await makeRequest(
      'DELETE',
      `/api/v1/admin/hod/users/${studentWithSubmissionsId}`,
      hodToken
    );

    assert(
      deleteWithRecordsRes.status === 409,
      'Test 4.1: Inactive student with submissions blocked with HTTP 409 Conflict',
      `Got status ${deleteWithRecordsRes.status}`
    );
    assert(
      deleteWithRecordsRes.body?.error?.code === 'CANNOT_DELETE_STUDENT_WITH_ACADEMIC_RECORDS',
      'Test 4.2: Error code is CANNOT_DELETE_STUDENT_WITH_ACADEMIC_RECORDS',
      `Got code: ${deleteWithRecordsRes.body?.error?.code}`
    );
    assert(
      deleteWithRecordsRes.body?.error?.message.includes('submission'),
      'Test 4.3: Error message specifically states submissions must be retained'
    );

    // Verify submission and profile are NOT deleted (academic history preserved)
    const historicalSub = testDb.submissions.find(s => s.student_id === studentWithSubmissionsId);
    assert(
      historicalSub !== undefined,
      'Test 4.4: Historical submission was NOT cascade-deleted'
    );
    const historicalProf = testDb.profiles.find(p => p.id === studentWithSubmissionsId);
    assert(
      historicalProf !== undefined,
      'Test 4.5: Student profile is preserved in inactive status'
    );

    // -------------------------------------------------------------------------
    // 5. Deactivated student with NO protected records can be deleted (HTTP 200)
    // -------------------------------------------------------------------------
    console.log('\n--- 5. Deactivated Student Deletion (No Protected Records) ---');
    // INACTIVE_STUDENT_ID is inactive and has 0 submissions
    const deleteCleanRes = await makeRequest(
      'DELETE',
      `/api/v1/admin/hod/users/${INACTIVE_STUDENT_ID}`,
      hodToken
    );

    assert(
      deleteCleanRes.status === 200,
      'Test 5.1: Inactive student with no protected records deleted successfully (HTTP 200)',
      `Got status ${deleteCleanRes.status}`
    );
    assert(
      deleteCleanRes.body?.success === true,
      'Test 5.2: Response body contains success: true'
    );
    assert(
      deleteCleanRes.body?.deleted_student_id === INACTIVE_STUDENT_ID,
      'Test 5.3: Response confirms deleted student ID'
    );

    // Verify student is removed from repository
    const deletedCheck = await testRepo.getProfileById(INACTIVE_STUDENT_ID);
    assert(
      deletedCheck === null,
      'Test 5.4: Target student profile is completely removed from database'
    );

    // -------------------------------------------------------------------------
    // 6. Directory List Refresh Verification
    // -------------------------------------------------------------------------
    console.log('\n--- 6. Directory List Refresh Verification ---');
    const listRes = await makeRequest(
      'GET',
      '/api/v1/admin/hod/users',
      hodToken
    );
    assert(
      listRes.status === 200,
      'Test 6.1: GET /users returns HTTP 200'
    );
    const usersInList = listRes.body?.users || [];
    const isDeletedStudentInList = usersInList.some((u: any) => u.id === INACTIVE_STUDENT_ID);
    assert(
      !isDeletedStudentInList,
      'Test 6.2: Deleted student is no longer present in users list'
    );
    const isOtherStudentInList = usersInList.some((u: any) => u.id === ACTIVE_STUDENT_ID);
    assert(
      isOtherStudentInList,
      'Test 6.3: Active student remains present in users list'
    );

    // -------------------------------------------------------------------------
    // 7. Audit Event Logging Verification
    // -------------------------------------------------------------------------
    console.log('\n--- 7. Audit Event Verification ---');
    const auditRes = await makeRequest(
      'GET',
      '/api/v1/admin/hod/audit',
      hodToken
    );
    assert(
      auditRes.status === 200,
      'Test 7.1: GET /audit returns HTTP 200'
    );
    const events = auditRes.body?.events || [];
    const deleteEvent = events.find((e: any) => e.action === 'DELETE_STUDENT' && e.resource_id === INACTIVE_STUDENT_ID);
    assert(
      deleteEvent !== undefined,
      'Test 7.2: Immutable DELETE_STUDENT audit log exists with target resource ID'
    );
    assert(
      deleteEvent?.actor_id === HOD_ID,
      'Test 7.3: Audit event accurately records authenticated HOD actor'
    );

    // -------------------------------------------------------------------------
    // 8. Frontend UI & Confirmation Modal Source Audit
    // -------------------------------------------------------------------------
    console.log('\n--- 8. Frontend Component & Confirmation Dialog Source Audit ---');
    const userMgmtPath = path.resolve('apps/web/src/features/hod/UserManagement.tsx');
    const userMgmtContent = fs.readFileSync(userMgmtPath, 'utf-8');

    // 8.1 Active student only has Deactivate
    assert(
      userMgmtContent.includes("student.status === 'active'") &&
      userMgmtContent.includes("Deactivate"),
      'Test 8.1: Active student row displays Deactivate action'
    );

    // 8.2 Inactive student has Delete Student
    assert(
      userMgmtContent.includes("Delete Student") &&
      userMgmtContent.includes("handleOpenDeleteModal"),
      'Test 8.2: Inactive student row displays Delete Student action'
    );

    // 8.3 Authorization check
    assert(
      userMgmtContent.includes("isAuthorizedHOD"),
      'Test 8.3: Delete Student action is protected by isAuthorizedHOD check'
    );

    // 8.4 Confirmation dialog elements
    assert(
      userMgmtContent.includes("Delete Inactive Student") &&
      userMgmtContent.includes("studentToDelete.full_name") &&
      userMgmtContent.includes("studentToDelete.usn"),
      'Test 8.4: Confirmation dialog presents student name and USN'
    );

    // 8.5 Explicit final confirmation & repeat submission prevention
    assert(
      userMgmtContent.includes("confirmAcknowledgement") &&
      userMgmtContent.includes("isDeletingStudent") &&
      userMgmtContent.includes("disabled={isDeletingStudent || !confirmAcknowledgement}"),
      'Test 8.5: Explicit final confirmation required and repeated submissions prevented'
    );

    // 8.6 apiClient & store methods
    const apiClientPath = path.resolve('apps/web/src/services/apiClient.ts');
    const apiClientContent = fs.readFileSync(apiClientPath, 'utf-8');
    assert(
      apiClientContent.includes("deleteStudent: async (studentId: string)"),
      'Test 8.6: hodApi.deleteStudent is defined in apiClient.ts'
    );

    const storePath = path.resolve('apps/web/src/features/hod/userDirectoryStore.ts');
    const storeContent = fs.readFileSync(storePath, 'utf-8');
    assert(
      storeContent.includes("removeUser(userId: string)"),
      'Test 8.7: userDirectoryStore defines removeUser for instant count & list refresh'
    );

  } finally {
    setUserRepositoryForTesting(null);
    await new Promise<void>((resolve) => {
      server.close(() => {
        console.log('\n[Test Server] Closed isolated test server.');
        resolve();
      });
    });
  }

  console.log('\n================================================================');
  console.log(` VERIFICATION SUMMARY: ${passCount} PASSED, ${failCount} FAILED`);
  console.log('================================================================');

  if (failCount > 0) {
    process.exit(1);
  }
}

runVerification().catch((err) => {
  console.error('Unhandled test failure:', err);
  process.exit(1);
});
