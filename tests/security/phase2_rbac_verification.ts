import jwt from 'jsonwebtoken';
import app from '../../apps/api/src/index.js';
import http from 'http';

/**
 * Phase 2 Comprehensive Security & RBAC Verification Suite
 * Tests server-side cryptographic token verification, role isolation,
 * privilege escalation prevention, and in-memory mock detection.
 */

// Secret matching apps/api/src/auth/jwt.ts DEV secret
const DEV_JWT_SECRET = 'smartfa-test-hmac-dev-secret-key-32chars';
const FORGED_SECRET = 'completely-wrong-forged-secret-key-12345';

function createToken(userId: string, email: string, secret: string = DEV_JWT_SECRET): string {
  return jwt.sign({ sub: userId, email }, secret, { expiresIn: '1h' });
}

function makeRequest(options: {
  path: string;
  method: string;
  token?: string;
  body?: any;
}): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.listen(0, () => {
      const addr = server.address() as any;
      const port = addr.port;

      const postData = options.body ? JSON.stringify(options.body) : null;
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port,
          path: options.path,
          method: options.method,
          headers: {
            'Content-Type': 'application/json',
            ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
            ...(postData ? { 'Content-Length': Buffer.byteLength(postData) } : {})
          }
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => {
            server.close();
            try {
              const parsed = JSON.parse(data);
              resolve({ status: res.statusCode || 500, body: parsed });
            } catch {
              resolve({ status: res.statusCode || 500, body: data });
            }
          });
        }
      );

      req.on('error', (err) => {
        server.close();
        reject(err);
      });

      if (postData) {
        req.write(postData);
      }
      req.end();
    });
  });
}

async function runTests() {
  console.log('================================================================');
  console.log('   SMARTFA PHASE 2: SECURITY & RBAC AUDIT VERIFICATION SUITE    ');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail: string = '') {
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName} - ${detail}`);
      failed++;
    }
  }

  try {
    // 1. Unauthenticated request
    const res1 = await makeRequest({
      path: '/api/v1/admin/hod/departments',
      method: 'GET'
    });
    assert(
      res1.status === 401 && res1.body?.error?.code === 'UNAUTHORIZED',
      'Test 1: Unauthenticated request rejected (401 UNAUTHORIZED)',
      `Status: ${res1.status}`
    );

    // 2. Cryptographic signature tampering (Token signed with wrong key)
    const forgedToken = createToken('a1000000-0000-0000-0000-000000000001', 'hod@smartfa.edu', FORGED_SECRET);
    const res2 = await makeRequest({
      path: '/api/v1/admin/hod/departments',
      method: 'GET',
      token: forgedToken
    });
    assert(
      res2.status === 401 && res2.body?.error?.code === 'INVALID_TOKEN',
      'Test 2: Forged JWT with invalid cryptographic signature rejected (401)',
      `Status: ${res2.status}`
    );

    // 3. Student identity denied HOD access
    const studentToken = createToken('a4000000-0000-0000-0000-000000000001', 'student.a@smartfa.edu');
    const res3 = await makeRequest({
      path: '/api/v1/admin/hod/departments',
      method: 'GET',
      token: studentToken
    });
    assert(
      res3.status === 403 && res3.body?.error?.code === 'FORBIDDEN',
      'Test 3: Student identity denied access to administrative endpoints (403 FORBIDDEN)',
      `Status: ${res3.status}`
    );

    // 4. Role tampering in body/header
    const res4 = await makeRequest({
      path: '/api/v1/admin/hod/departments',
      method: 'POST',
      token: studentToken,
      body: { code: 'HACK', name: 'Tampered Dept', role: 'hod' }
    });
    assert(
      res4.status === 403 && res4.body?.error?.code === 'FORBIDDEN',
      'Test 4: Client-supplied role claim in payload ignored; student denied (403)',
      `Status: ${res4.status}`
    );

    // 5. Proctor identity denied HOD access
    const proctorToken = createToken('a3000000-0000-0000-0000-000000000001', 'proctor@smartfa.edu');
    const res5 = await makeRequest({
      path: '/api/v1/admin/hod/departments',
      method: 'GET',
      token: proctorToken
    });
    assert(
      res5.status === 403 && res5.body?.error?.code === 'FORBIDDEN',
      'Test 5: Proctor identity denied access to HOD administration (403)',
      `Status: ${res5.status}`
    );

    // 6. Inactive user denied access
    const inactiveToken = createToken('a9000000-0000-0000-0000-000000000001', 'inactive@smartfa.edu');
    const res6 = await makeRequest({
      path: '/api/v1/admin/hod/departments',
      method: 'GET',
      token: inactiveToken
    });
    assert(
      res6.status === 403 && res6.body?.error?.code === 'ACCOUNT_INACTIVE',
      'Test 6: Inactive user account strictly rejected (403 ACCOUNT_INACTIVE)',
      `Status: ${res6.status}`
    );

    // 7. Authorized HOD allowed
    const hodToken = createToken('a1000000-0000-0000-0000-000000000001', 'hod@smartfa.edu');
    const res7 = await makeRequest({
      path: '/api/v1/admin/hod/departments',
      method: 'GET',
      token: hodToken
    });
    assert(
      res7.status === 200 && Array.isArray(res7.body?.departments),
      'Test 7: Authorized HOD accesses departments (200 OK)',
      `Status: ${res7.status}`
    );

    // 8. HOD self-modification prevention (Cannot alter own roles)
    const res8 = await makeRequest({
      path: '/api/v1/admin/hod/users/a1000000-0000-0000-0000-000000000001/roles',
      method: 'POST',
      token: hodToken,
      body: { role: 'student', active: true }
    });
    assert(
      res8.status === 403 && res8.body?.error?.code === 'FORBIDDEN_SELF_MODIFICATION',
      'Test 8: Invariant enforced: HOD cannot self-modify roles (403)',
      `Status: ${res8.status}`
    );

    // 9. HOD self-deactivation prevention
    const res9 = await makeRequest({
      path: '/api/v1/admin/hod/users/a1000000-0000-0000-0000-000000000001/status',
      method: 'PATCH',
      token: hodToken,
      body: { status: 'inactive' }
    });
    assert(
      res9.status === 403 && res9.body?.error?.code === 'FORBIDDEN_SELF_MODIFICATION',
      'Test 9: Invariant enforced: HOD cannot deactivate own account (403)',
      `Status: ${res9.status}`
    );

    // 10. Privilege escalation prevention: HOD cannot assign HOD role to others
    const res10 = await makeRequest({
      path: '/api/v1/admin/hod/users/a2000000-0000-0000-0000-000000000001/roles',
      method: 'POST',
      token: hodToken,
      body: { role: 'hod', active: true }
    });
    assert(
      res10.status === 403 && res10.body?.error?.code === 'FORBIDDEN_PRIVILEGE_ESCALATION',
      'Test 10: Invariant enforced: HOD cannot delegate HOD role to other users (403)',
      `Status: ${res10.status}`
    );

    // 11. Duplicate role assignment prevention
    const res11 = await makeRequest({
      path: '/api/v1/admin/hod/users/a2000000-0000-0000-0000-000000000001/roles',
      method: 'POST',
      token: hodToken,
      body: { role: 'subject_teacher', scope_id: 'd1000000-0000-0000-0000-000000000001', active: true }
    });
    assert(
      res11.status === 409 && res11.body?.error?.code === 'DUPLICATE_ROLE_ASSIGNMENT',
      'Test 11: Invariant enforced: Duplicate active role assignment rejected (409)',
      `Status: ${res11.status}`
    );

    // 12. Audit event logging on action
    const res12 = await makeRequest({
      path: '/api/v1/admin/hod/audit',
      method: 'GET',
      token: hodToken
    });
    assert(
      res12.status === 200 && Array.isArray(res12.body?.events),
      'Test 12: Audit trail records retrieved by authorized HOD (200 OK)',
      `Status: ${res12.status}`
    );

    // 13. Audit events are append-only; direct mutations (PUT/DELETE/POST) rejected
    const res13 = await makeRequest({
      path: '/api/v1/admin/hod/audit',
      method: 'POST',
      token: hodToken,
      body: { action: 'MUTATE_LOG' }
    });
    assert(
      res13.status === 404,
      'Test 13: Audit log mutation blocked (POST /audit returns 404; append-only invariant)',
      `Status: ${res13.status}`
    );

    // 14. Health telemetry correctly reflects in_memory_mock mode
    const res14 = await makeRequest({
      path: '/health',
      method: 'GET'
    });
    assert(
      res14.status === 200 &&
      res14.body?.database_mode === 'in_memory_mock' &&
      res14.body?.is_persistent === false,
      'Test 14: Telemetry accurately discloses database_mode="in_memory_mock" and is_persistent=false',
      `Body: ${JSON.stringify(res14.body)}`
    );

  } catch (err) {
    console.error('Unexpected error during test execution:', err);
    failed++;
  }

  console.log('\n----------------------------------------------------------------');
  console.log(`TOTAL: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log('----------------------------------------------------------------\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests();
