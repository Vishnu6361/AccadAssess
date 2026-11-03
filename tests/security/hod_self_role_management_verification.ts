/**
 * ==============================================================================
 * ACADASSESS: HOD SELF-ROLE MANAGEMENT SECURITY VERIFICATION SUITE
 * ==============================================================================
 * 
 * Verifies all security requirements for HOD self-role management:
 * 1. Allow HOD to assign subject_teacher to own account (201 Created).
 * 2. Allow HOD to revoke subject_teacher from own account (200 OK).
 * 3. Allow HOD to assign proctor to own account (201 Created).
 * 4. Allow HOD to revoke proctor from own account (200 OK).
 * 5. Allow HOD to assign class_teacher to own account (201 Created).
 * 6. Allow HOD to revoke class_teacher from own account (200 OK).
 * 7. Block HOD from removing, revoking, or deleting own HOD role (403 FORBIDDEN_SELF_MODIFICATION).
 * 8. Block HOD from self-assigning HOD role (403 FORBIDDEN_SELF_MODIFICATION).
 * 9. Block HOD from assigning HOD role to arbitrary faculty (403 FORBIDDEN_PRIVILEGE_ESCALATION).
 * 10. Block HOD from revoking HOD role from other HOD accounts (403 FORBIDDEN_PRIVILEGE_ESCALATION).
 * 11. Block HOD from self-assigning student role (403 FORBIDDEN_SELF_MODIFICATION).
 * 12. Block HOD from assigning student role to other faculty (403 INVALID_ROLE_FOR_ACCOUNT_TYPE).
 * 13. Prevent duplicate active role assignments on own account (409 DUPLICATE_ROLE_ASSIGNMENT).
 * 14. Preserve invariant: HOD cannot deactivate own account (403 FORBIDDEN_SELF_MODIFICATION).
 * 15. Preserve invariant: HOD cannot delete own account (403 FORBIDDEN_SELF_MODIFICATION).
 * 16. Verify audit logging: logAuditEvent records actor, target user, role, action, and timestamp for self-assignment.
 * 17. Verify audit logging: logAuditEvent records actor, target user, role, action, and timestamp for self-revocation.
 * 18. Unauthorized non-HOD users strictly denied access to HOD role endpoints (403 FORBIDDEN).
 * 19. User context cache properly invalidated upon self-role change, reflecting new roles in auth me endpoint.
 * ==============================================================================
 */

process.env.SMARTFA_TEST_MODE = 'true';
import http from 'http';
import jwt from 'jsonwebtoken';
import app from '../../apps/api/src/index.js';
import { db } from '../../apps/api/src/storage/db.js';
import { InMemoryUserRepository, setUserRepositoryForTesting } from '../../apps/api/src/storage/userRepository.js';
import { invalidateUserContextCache } from '../../apps/api/src/authorization/rbac.js';

let server: http.Server;
const PORT = 4049;
const DEV_JWT_SECRET = process.env.JWT_DEV_SECRET || 'smartfa-test-hmac-dev-secret-key-32chars';

// Fixture IDs
const HOD_USER_ID = 'h0000000-0000-0000-0000-000000000001';
const FACULTY_USER_ID = 'f0000000-0000-0000-0000-000000000001';
const OTHER_HOD_ID = 'h0000000-0000-0000-0000-000000000002';
const STUDENT_USER_ID = 's0000000-0000-0000-0000-000000000001';

let totalTests = 0;
let passedTests = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  [PASS] Test ${totalTests}: ${testName}`);
  } else {
    console.error(`  [FAIL] Test ${totalTests}: ${testName}${detail ? ` -> ${detail}` : ''}`);
  }
}

function generateToken(userId: string, email: string): string {
  return jwt.sign(
    {
      sub: userId,
      email,
      role: 'authenticated',
      aud: 'authenticated',
      app_metadata: { provider: 'email' },
      user_metadata: { full_name: 'Test User' }
    },
    DEV_JWT_SECRET,
    { algorithm: 'HS256', expiresIn: '1h' }
  );
}

async function makeRequest(options: {
  path: string;
  method: string;
  token?: string;
  body?: any;
}): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const payload = options.body ? JSON.stringify(options.body) : null;
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path: options.path,
        method: options.method,
        headers: {
          'Content-Type': 'application/json',
          ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
          ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {})
        }
      },
      (res) => {
        let raw = '';
        res.on('data', chunk => { raw += chunk; });
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
    if (payload) req.write(payload);
    req.end();
  });
}

async function runTests() {
  console.log('================================================================');
  console.log(' ACADASSESS: HOD SELF-ROLE MANAGEMENT SECURITY VERIFICATION     ');
  console.log('================================================================\n');

  // Seed fixture database
  db.profiles = [
    {
      id: HOD_USER_ID,
      email: 'hod.nagamani@rvce.edu.in',
      full_name: 'Dr. Nagamani S.',
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: FACULTY_USER_ID,
      email: 'faculty.shankar@rvce.edu.in',
      full_name: 'Prof. Shankar K.',
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: OTHER_HOD_ID,
      email: 'hod.other@rvce.edu.in',
      full_name: 'Dr. Other HOD',
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: STUDENT_USER_ID,
      email: 'student.rahul@rvce.edu.in',
      full_name: 'Rahul Kumar',
      usn: '1RV25MC099',
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }
  ];

  db.roles = [
    {
      id: 'r-hod-1',
      user_id: HOD_USER_ID,
      role: 'hod',
      active: true,
      created_at: new Date().toISOString()
    },
    {
      id: 'r-faculty-1',
      user_id: FACULTY_USER_ID,
      role: 'subject_teacher',
      active: true,
      created_at: new Date().toISOString()
    },
    {
      id: 'r-other-hod-1',
      user_id: OTHER_HOD_ID,
      role: 'hod',
      active: true,
      created_at: new Date().toISOString()
    },
    {
      id: 'r-student-1',
      user_id: STUDENT_USER_ID,
      role: 'student',
      active: true,
      created_at: new Date().toISOString()
    }
  ];

  db.auditEvents = [];

  setUserRepositoryForTesting(new InMemoryUserRepository(db));
  invalidateUserContextCache(HOD_USER_ID);
  invalidateUserContextCache(FACULTY_USER_ID);
  invalidateUserContextCache(OTHER_HOD_ID);
  invalidateUserContextCache(STUDENT_USER_ID);

  const hodToken = generateToken(HOD_USER_ID, 'hod.nagamani@rvce.edu.in');
  const facultyToken = generateToken(FACULTY_USER_ID, 'faculty.shankar@rvce.edu.in');

  console.log('--- 1. HOD Self-Role Assignment (Non-HOD Institutional Roles) ---');

  // Test 1: HOD assigns Subject Teacher to own account
  const res1 = await makeRequest({
    path: `/api/v1/admin/hod/users/${HOD_USER_ID}/roles`,
    method: 'POST',
    token: hodToken,
    body: { role: 'subject_teacher', active: true }
  });
  assert(
    res1.status === 201 && res1.body?.role?.role === 'subject_teacher',
    'HOD can assign subject_teacher to own account (201 Created)',
    `Status: ${res1.status}, body: ${JSON.stringify(res1.body)}`
  );

  // Test 2: Invalidate and check /auth/me reflects both hod and subject_teacher
  const meRes = await makeRequest({
    path: '/api/v1/auth/me',
    method: 'GET',
    token: hodToken
  });
  assert(
    meRes.status === 200 &&
    meRes.body?.roles?.includes('hod') &&
    meRes.body?.roles?.includes('subject_teacher'),
    'Auth me reflects both hod and subject_teacher after self-assignment',
    `Roles: ${JSON.stringify(meRes.body?.roles)}`
  );

  // Test 3: Duplicate assignment rejected
  const res3 = await makeRequest({
    path: `/api/v1/admin/hod/users/${HOD_USER_ID}/roles`,
    method: 'POST',
    token: hodToken,
    body: { role: 'subject_teacher', active: true }
  });
  assert(
    res3.status === 409 && res3.body?.error?.code === 'DUPLICATE_ROLE_ASSIGNMENT',
    'Duplicate self-assignment of subject_teacher rejected (409 DUPLICATE_ROLE_ASSIGNMENT)',
    `Status: ${res3.status}`
  );

  // Test 4: HOD assigns Proctor to own account
  const res4 = await makeRequest({
    path: `/api/v1/admin/hod/users/${HOD_USER_ID}/roles`,
    method: 'POST',
    token: hodToken,
    body: { role: 'proctor', active: true }
  });
  assert(
    res4.status === 201 && res4.body?.role?.role === 'proctor',
    'HOD can assign proctor to own account (201 Created)',
    `Status: ${res4.status}`
  );

  // Test 5: HOD assigns Class Teacher to own account
  const res5 = await makeRequest({
    path: `/api/v1/admin/hod/users/${HOD_USER_ID}/roles`,
    method: 'POST',
    token: hodToken,
    body: { role: 'class_teacher', active: true }
  });
  assert(
    res5.status === 201 && res5.body?.role?.role === 'class_teacher',
    'HOD can assign class_teacher to own account (201 Created)',
    `Status: ${res5.status}`
  );

  console.log('\n--- 2. HOD Administrative Protection & Immutability Invariants ---');

  // Test 6: Block HOD from revoking own HOD role
  const res6 = await makeRequest({
    path: `/api/v1/admin/hod/users/${HOD_USER_ID}/roles/hod`,
    method: 'DELETE',
    token: hodToken
  });
  assert(
    res6.status === 403 && res6.body?.error?.code === 'FORBIDDEN_SELF_MODIFICATION',
    'HOD cannot revoke or remove own HOD role (403 FORBIDDEN_SELF_MODIFICATION)',
    `Status: ${res6.status}, message: ${res6.body?.error?.message}`
  );

  // Test 7: Block HOD from self-assigning HOD role
  const res7 = await makeRequest({
    path: `/api/v1/admin/hod/users/${HOD_USER_ID}/roles`,
    method: 'POST',
    token: hodToken,
    body: { role: 'hod', active: true }
  });
  assert(
    res7.status === 403 && res7.body?.error?.code === 'FORBIDDEN_SELF_MODIFICATION',
    'HOD cannot self-assign or re-grant own HOD role (403 FORBIDDEN_SELF_MODIFICATION)',
    `Status: ${res7.status}, message: ${res7.body?.error?.message}`
  );

  // Test 8: Block HOD from granting HOD role to arbitrary faculty
  const res8 = await makeRequest({
    path: `/api/v1/admin/hod/users/${FACULTY_USER_ID}/roles`,
    method: 'POST',
    token: hodToken,
    body: { role: 'hod', active: true }
  });
  assert(
    res8.status === 403 && res8.body?.error?.code === 'FORBIDDEN_PRIVILEGE_ESCALATION',
    'HOD cannot grant HOD role to other faculty (403 FORBIDDEN_PRIVILEGE_ESCALATION)',
    `Status: ${res8.status}`
  );

  // Test 9: Block HOD from revoking HOD role of other HOD
  const res9 = await makeRequest({
    path: `/api/v1/admin/hod/users/${OTHER_HOD_ID}/roles/hod`,
    method: 'DELETE',
    token: hodToken
  });
  assert(
    res9.status === 403 && res9.body?.error?.code === 'FORBIDDEN_PRIVILEGE_ESCALATION',
    'HOD cannot revoke HOD role of other HOD accounts (403 FORBIDDEN_PRIVILEGE_ESCALATION)',
    `Status: ${res9.status}`
  );

  // Test 10: Block HOD from assigning student role to own account
  const res10 = await makeRequest({
    path: `/api/v1/admin/hod/users/${HOD_USER_ID}/roles`,
    method: 'POST',
    token: hodToken,
    body: { role: 'student', active: true }
  });
  assert(
    res10.status === 403 && res10.body?.error?.code === 'FORBIDDEN_SELF_MODIFICATION',
    'HOD cannot self-assign student role (403 FORBIDDEN_SELF_MODIFICATION)',
    `Status: ${res10.status}`
  );

  // Test 11: Block HOD from assigning student role to faculty
  const res11 = await makeRequest({
    path: `/api/v1/admin/hod/users/${FACULTY_USER_ID}/roles`,
    method: 'POST',
    token: hodToken,
    body: { role: 'student', active: true }
  });
  assert(
    res11.status === 403 && res11.body?.error?.code === 'INVALID_ROLE_FOR_ACCOUNT_TYPE',
    'Faculty accounts cannot be assigned student role (403 INVALID_ROLE_FOR_ACCOUNT_TYPE)',
    `Status: ${res11.status}`
  );

  // Test 12: Invariant: HOD cannot deactivate own account
  const res12 = await makeRequest({
    path: `/api/v1/admin/hod/users/${HOD_USER_ID}/status`,
    method: 'PATCH',
    token: hodToken,
    body: { status: 'inactive' }
  });
  assert(
    res12.status === 403 && res12.body?.error?.code === 'FORBIDDEN_SELF_MODIFICATION',
    'Invariant preserved: HOD cannot deactivate own account (403 FORBIDDEN_SELF_MODIFICATION)',
    `Status: ${res12.status}`
  );

  // Test 13: Invariant: HOD cannot delete own account
  const res13 = await makeRequest({
    path: `/api/v1/admin/hod/students/${HOD_USER_ID}`,
    method: 'DELETE',
    token: hodToken
  });
  assert(
    res13.status === 403 && res13.body?.error?.code === 'FORBIDDEN_SELF_MODIFICATION',
    'Invariant preserved: HOD cannot delete own account (403 FORBIDDEN_SELF_MODIFICATION)',
    `Status: ${res13.status}`
  );

  console.log('\n--- 3. HOD Self-Role Revocation (Non-HOD Roles) ---');

  // Test 14: HOD revokes class_teacher from own account
  const res14 = await makeRequest({
    path: `/api/v1/admin/hod/users/${HOD_USER_ID}/roles/class_teacher`,
    method: 'DELETE',
    token: hodToken
  });
  assert(
    res14.status === 200 && res14.body?.removed_role === 'class_teacher',
    'HOD can revoke class_teacher from own account (200 OK)',
    `Status: ${res14.status}`
  );

  // Test 15: HOD revokes proctor from own account
  const res15 = await makeRequest({
    path: `/api/v1/admin/hod/users/${HOD_USER_ID}/roles/proctor`,
    method: 'DELETE',
    token: hodToken
  });
  assert(
    res15.status === 200 && res15.body?.removed_role === 'proctor',
    'HOD can revoke proctor from own account (200 OK)',
    `Status: ${res15.status}`
  );

  // Test 16: HOD revokes subject_teacher from own account
  const res16 = await makeRequest({
    path: `/api/v1/admin/hod/users/${HOD_USER_ID}/roles/subject_teacher`,
    method: 'DELETE',
    token: hodToken
  });
  assert(
    res16.status === 200 && res16.body?.removed_role === 'subject_teacher',
    'HOD can revoke subject_teacher from own account (200 OK)',
    `Status: ${res16.status}`
  );

  // Test 17: Verify HOD still retains HOD role after revoking non-HOD roles
  const meFinalRes = await makeRequest({
    path: '/api/v1/auth/me',
    method: 'GET',
    token: hodToken
  });
  assert(
    meFinalRes.status === 200 &&
    meFinalRes.body?.roles?.length === 1 &&
    meFinalRes.body?.roles?.includes('hod'),
    'HOD cleanly retains HOD administrative role after revoking other roles',
    `Roles: ${JSON.stringify(meFinalRes.body?.roles)}`
  );

  console.log('\n--- 4. Audit Logging Verification ---');

  // Test 18: Audit log records self-assignment with actor, target user, role, and action
  const assignAudit = db.auditEvents.find(e => 
    e.action === 'ASSIGN_USER_ROLE' && 
    e.actor_id === HOD_USER_ID && 
    (e.after as any)?.target_user_id === HOD_USER_ID
  );
  assert(
    Boolean(assignAudit && assignAudit.created_at && (assignAudit.after as any)?.is_self_assignment === true),
    'Audit log records self-assignment with actor, target user, action, is_self_assignment, and timestamp',
    `Event: ${JSON.stringify(assignAudit)}`
  );

  // Test 19: Audit log records self-revocation with actor, target user, role, and action
  const revokeAudit = db.auditEvents.find(e => 
    e.action === 'REVOKE_USER_ROLE' && 
    e.actor_id === HOD_USER_ID && 
    (e.before as any)?.target_user_id === HOD_USER_ID
  );
  assert(
    Boolean(revokeAudit && revokeAudit.created_at && (revokeAudit.before as any)?.is_self_revocation === true),
    'Audit log records self-revocation with actor, target user, action, is_self_revocation, and timestamp',
    `Event: ${JSON.stringify(revokeAudit)}`
  );

  console.log('\n--- 5. Authorization & Non-HOD Access Restrictions ---');

  // Test 20: Non-HOD faculty denied access to role management endpoint
  const unauthRes = await makeRequest({
    path: `/api/v1/admin/hod/users/${FACULTY_USER_ID}/roles`,
    method: 'POST',
    token: facultyToken,
    body: { role: 'proctor', active: true }
  });
  assert(
    unauthRes.status === 403,
    'Non-HOD faculty strictly denied access to role assignment endpoint (403 FORBIDDEN)',
    `Status: ${unauthRes.status}`
  );

  console.log('\n================================================================');
  console.log(` RESULTS: ${passedTests} / ${totalTests} TESTS PASSED (${Math.round((passedTests/totalTests)*100)}%)`);
  console.log('================================================================\n');

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

// Start local server and run
server = app.listen(PORT, async () => {
  try {
    await runTests();
  } catch (err: any) {
    console.error('Test execution failed:', err);
    process.exit(1);
  } finally {
    server.close();
  }
});

