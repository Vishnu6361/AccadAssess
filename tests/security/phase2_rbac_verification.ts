import jwt from 'jsonwebtoken';
import app from '../../apps/api/src/index.js';
import http from 'http';

/**
 * Phase 2 Security & RBAC Invariant Verification Suite
 * Tests server-side authorization boundaries without trusting client inputs.
 */

const TEST_SECRET = 'super-secret-key-for-test';

// Helper to generate a test JWT for a given user id
function createTestToken(userId: string, email: string): string {
  return jwt.sign({ sub: userId, email }, TEST_SECRET, { expiresIn: '1h' });
}

// Helper to perform HTTP requests to the Express app
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
  console.log('   SMARTFA PHASE 2: SECURITY & RBAC BOUNDARY VERIFICATION TEST   ');
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
    // Test 1: Unauthenticated request to HOD protected route
    const res1 = await makeRequest({
      path: '/api/v1/admin/hod/departments',
      method: 'GET'
    });
    assert(
      res1.status === 401 && res1.body?.error?.code === 'UNAUTHORIZED',
      'Test 1: Unauthenticated request rejected with 401 UNAUTHORIZED',
      `Got status: ${res1.status}`
    );

    // Test 2: Student identity trying to access HOD route
    const studentToken = createTestToken('a4000000-0000-0000-0000-000000000001', 'student.a@smartfa.edu');
    const res2 = await makeRequest({
      path: '/api/v1/admin/hod/departments',
      method: 'GET',
      token: studentToken
    });
    assert(
      res2.status === 403 && res2.body?.error?.code === 'FORBIDDEN',
      'Test 2: Student identity denied access with 403 FORBIDDEN',
      `Got status: ${res2.status}, error: ${JSON.stringify(res2.body)}`
    );

    // Test 3: Client tampering with role parameter (claiming to be HOD in payload)
    const res3 = await makeRequest({
      path: '/api/v1/admin/hod/departments',
      method: 'POST',
      token: studentToken,
      body: { code: 'TAMPER', name: 'Tampered Department', client_role: 'hod' }
    });
    assert(
      res3.status === 403 && res3.body?.error?.code === 'FORBIDDEN',
      'Test 3: Browser-supplied client_role claim ignored; student still rejected',
      `Got status: ${res3.status}`
    );

    // Test 4: Subject teacher identity denied access to HOD route
    const teacherToken = createTestToken('a2000000-0000-0000-0000-000000000001', 'teacher1@smartfa.edu');
    const res4 = await makeRequest({
      path: '/api/v1/admin/hod/departments',
      method: 'GET',
      token: teacherToken
    });
    assert(
      res4.status === 403 && res4.body?.error?.code === 'FORBIDDEN',
      'Test 4: Subject Teacher identity denied access to HOD administration',
      `Got status: ${res4.status}`
    );

    // Test 5: Inactive user account denied access
    const inactiveToken = createTestToken('a9000000-0000-0000-0000-000000000001', 'inactive@smartfa.edu');
    const res5 = await makeRequest({
      path: '/api/v1/admin/hod/departments',
      method: 'GET',
      token: inactiveToken
    });
    assert(
      res5.status === 403 && res5.body?.error?.code === 'ACCOUNT_INACTIVE',
      'Test 5: Inactive user rejected with 403 ACCOUNT_INACTIVE',
      `Got status: ${res5.status}, error: ${JSON.stringify(res5.body)}`
    );

    // Test 6: Authorized HOD identity successfully accesses departments
    const hodToken = createTestToken('a1000000-0000-0000-0000-000000000001', 'hod@smartfa.edu');
    const res6 = await makeRequest({
      path: '/api/v1/admin/hod/departments',
      method: 'GET',
      token: hodToken
    });
    assert(
      res6.status === 200 && Array.isArray(res6.body?.departments),
      'Test 6: Authorized HOD accesses departments with 200 OK',
      `Got status: ${res6.status}`
    );

    // Test 7: HOD creates a new Academic Department with validation & audit
    const newDeptCode = `CS${Math.floor(Math.random() * 900 + 100)}`;
    const res7 = await makeRequest({
      path: '/api/v1/admin/hod/departments',
      method: 'POST',
      token: hodToken,
      body: { code: newDeptCode, name: 'Department of Computer Science' }
    });
    assert(
      res7.status === 201 && res7.body?.department?.code === newDeptCode,
      'Test 7: HOD creates new academic department (201 Created)',
      `Got status: ${res7.status}`
    );

    // Test 8: HOD invites new teacher and assigns role
    const testEmail = `prof.test.${Date.now()}@smartfa.edu`;
    const res8 = await makeRequest({
      path: '/api/v1/admin/hod/users/invite',
      method: 'POST',
      token: hodToken,
      body: {
        full_name: 'Prof. Tester',
        email: testEmail,
        role: 'subject_teacher'
      }
    });
    assert(
      res8.status === 201 && res8.body?.user?.email === testEmail,
      'Test 8: HOD invites user and assigns subject_teacher role',
      `Got status: ${res8.status}`
    );

    // Test 9: Invariant: HOD cannot self-modify roles (prevent privilege escalation)
    const res9 = await makeRequest({
      path: '/api/v1/admin/hod/users/a1000000-0000-0000-0000-000000000001/roles',
      method: 'POST',
      token: hodToken,
      body: { role: 'student', active: true }
    });
    assert(
      res9.status === 403 && res9.body?.error?.code === 'FORBIDDEN_SELF_MODIFICATION',
      'Test 9: Invariant enforced: HOD cannot self-assign or alter own roles',
      `Got status: ${res9.status}`
    );

    // Test 10: Invariant: HOD cannot deactivate own account
    const res10 = await makeRequest({
      path: '/api/v1/admin/hod/users/a1000000-0000-0000-0000-000000000001/status',
      method: 'PATCH',
      token: hodToken,
      body: { status: 'inactive' }
    });
    assert(
      res10.status === 403 && res10.body?.error?.code === 'FORBIDDEN_SELF_MODIFICATION',
      'Test 10: Invariant enforced: HOD cannot deactivate own account',
      `Got status: ${res10.status}`
    );

    // Test 11: Audit log records privileged operations
    const res11 = await makeRequest({
      path: '/api/v1/admin/hod/audit',
      method: 'GET',
      token: hodToken
    });
    assert(
      res11.status === 200 &&
      Array.isArray(res11.body?.events) &&
      res11.body.events.some((e: any) => e.action === 'CREATE_DEPARTMENT'),
      'Test 11: Audit event log records privileged operations with actor & resource',
      `Events count: ${res11.body?.events?.length}`
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
