process.env.SMARTFA_TEST_MODE = 'true';
import jwt from 'jsonwebtoken';
import http from 'http';
import fs from 'fs';
import path from 'path';
import app from '../../apps/api/src/index.js';
import { 
  getUserRepository, 
  setUserRepositoryForTesting, 
  InMemoryUserRepository 
} from '../../apps/api/src/storage/userRepository.js';
import { 
  getAcademicRepository, 
  setAcademicRepositoryForTesting, 
  InMemoryAcademicRepository 
} from '../../apps/api/src/storage/academicRepository.js';
import { db } from '../../apps/api/src/storage/db.js';

console.log('================================================================');
console.log(' ACADASSESS PHASE 4.3: SUPABASE AUTH & SESSION LIFECYCLE SUITE  ');
console.log('================================================================\n');

const DEV_JWT_SECRET = process.env.JWT_DEV_SECRET || 'smartfa-test-hmac-dev-secret-key-32chars';
const PORT = 4006;

let server: http.Server;

function createTestToken(userId: string, email: string = 'user@smartfa.edu', expiresIn: string = '1h'): string {
  return jwt.sign({ sub: userId, email }, DEV_JWT_SECRET, { expiresIn });
}

function createExpiredToken(userId: string, email: string = 'user@smartfa.edu'): string {
  return jwt.sign({ sub: userId, email }, DEV_JWT_SECRET, { expiresIn: '-10s' });
}

function createInvalidSecretToken(userId: string, email: string = 'user@smartfa.edu'): string {
  return jwt.sign({ sub: userId, email }, 'wrong-invalid-secret-key-that-fails-verification');
}

function makeRequest(
  method: string,
  urlPath: string,
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
        path: urlPath,
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
            resolve({ status: res.statusCode || 500, body: { raw: rawData } });
          }
        });
      }
    );

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// Test User Identifiers
const HOD_USER_ID = '00000000-0000-4000-a000-000000000001';
const TEACHER_USER_ID = '00000000-0000-4000-a000-000000000002';
const MULTI_ROLE_USER_ID = '00000000-0000-4000-a000-000000000003';
const INACTIVE_USER_ID = '00000000-0000-4000-a000-000000000004';
const NO_ROLES_USER_ID = '00000000-0000-4000-a000-000000000005';
const UNKNOWN_USER_ID = '00000000-0000-4000-a000-000000000099';

let userRepo: InMemoryUserRepository;
let academicRepo: InMemoryAcademicRepository;

let passedAssertions = 0;
let totalAssertions = 0;

function assert(condition: boolean, message: string) {
  totalAssertions++;
  if (condition) {
    passedAssertions++;
    console.log(`  [PASS] ${message}`);
  } else {
    console.error(`  [FAIL] ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runSuite() {
  await new Promise<void>((resolve) => {
    server = app.listen(PORT, () => {
      console.log(`[Test Server] Running on http://localhost:${PORT}`);
      resolve();
    });
  });

  try {
    // Initialize mock repositories
    userRepo = new InMemoryUserRepository();
    setUserRepositoryForTesting(userRepo);

    academicRepo = new InMemoryAcademicRepository();
    setAcademicRepositoryForTesting(academicRepo);

    // Seed test profiles and roles in database fixtures
    db.profiles.push(
      {
        id: HOD_USER_ID,
        email: 'hod@smartfa.edu',
        full_name: 'Dr. Head of Department',
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: TEACHER_USER_ID,
        email: 'teacher@smartfa.edu',
        full_name: 'Prof. Faculty Member',
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: MULTI_ROLE_USER_ID,
        email: 'multirole@smartfa.edu',
        full_name: 'Prof. Multi-Role Faculty',
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: INACTIVE_USER_ID,
        email: 'inactive@smartfa.edu',
        full_name: 'Suspended Account User',
        status: 'inactive',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: NO_ROLES_USER_ID,
        email: 'noroles@smartfa.edu',
        full_name: 'Pending Provisioning User',
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    );

    db.roles.push(
      {
        id: 'r-001',
        user_id: HOD_USER_ID,
        role: 'hod',
        scope_id: null,
        assigned_by: HOD_USER_ID,
        assigned_at: new Date().toISOString(),
        active: true
      },
      {
        id: 'r-002',
        user_id: TEACHER_USER_ID,
        role: 'subject_teacher',
        scope_id: null,
        assigned_by: HOD_USER_ID,
        assigned_at: new Date().toISOString(),
        active: true
      },
      {
        id: 'r-003',
        user_id: MULTI_ROLE_USER_ID,
        role: 'class_teacher',
        scope_id: null,
        assigned_by: HOD_USER_ID,
        assigned_at: new Date().toISOString(),
        active: true
      },
      {
        id: 'r-004',
        user_id: MULTI_ROLE_USER_ID,
        role: 'subject_teacher',
        scope_id: null,
        assigned_by: HOD_USER_ID,
        assigned_at: new Date().toISOString(),
        active: true
      },
      {
        id: 'r-005',
        user_id: INACTIVE_USER_ID,
        role: 'student',
        scope_id: null,
        assigned_by: HOD_USER_ID,
        assigned_at: new Date().toISOString(),
        active: true
      }
    );

    console.log('\n--- 1. /api/v1/auth/me Authoritative Role-Context Verification ---');

    // 1.1 Missing Authorization Header
    const res1_1 = await makeRequest('GET', '/api/v1/auth/me');
    assert(res1_1.status === 401, '1.1 Missing Authorization header returns HTTP 401');
    assert(res1_1.body.error?.code === 'UNAUTHORIZED', '1.1 Error code is UNAUTHORIZED');

    // 1.2 Malformed Authorization Header (No Bearer)
    const res1_2 = await makeRequest('GET', '/api/v1/auth/me', undefined, undefined, { 'Authorization': 'Basic abc123xyz' });
    assert(res1_2.status === 401, '1.2 Malformed Authorization header returns HTTP 401');
    assert(res1_2.body.error?.code === 'UNAUTHORIZED', '1.2 Malformed header error code is UNAUTHORIZED');

    // 1.3 Cryptographically Invalid Signature Token
    const invalidToken = createInvalidSecretToken(HOD_USER_ID);
    const res1_3 = await makeRequest('GET', '/api/v1/auth/me', invalidToken);
    assert(res1_3.status === 401, '1.3 Invalid signature token returns HTTP 401');
    assert(res1_3.body.error?.code === 'INVALID_TOKEN', '1.3 Error code is INVALID_TOKEN');

    // 1.4 Expired Token
    const expiredToken = createExpiredToken(HOD_USER_ID);
    const res1_4 = await makeRequest('GET', '/api/v1/auth/me', expiredToken);
    assert(res1_4.status === 401, '1.4 Expired token returns HTTP 401');
    assert(res1_4.body.error?.code === 'INVALID_TOKEN', '1.4 Expired token error code is INVALID_TOKEN');

    // 1.5 Valid Token for Non-Existent Institutional Profile
    const unknownToken = createTestToken(UNKNOWN_USER_ID, 'ghost@smartfa.edu');
    const res1_5 = await makeRequest('GET', '/api/v1/auth/me', unknownToken);
    assert(res1_5.status === 403, '1.5 Non-existent profile returns HTTP 403');
    assert(res1_5.body.error?.code === 'PROFILE_NOT_FOUND', '1.5 Error code is PROFILE_NOT_FOUND');

    // 1.6 Valid Token for Inactive Account Profile
    const inactiveToken = createTestToken(INACTIVE_USER_ID, 'inactive@smartfa.edu');
    const res1_6 = await makeRequest('GET', '/api/v1/auth/me', inactiveToken);
    assert(res1_6.status === 403, '1.6 Inactive account profile returns HTTP 403');
    assert(res1_6.body.error?.code === 'ACCOUNT_INACTIVE', '1.6 Error code is ACCOUNT_INACTIVE');
    assert(res1_6.body.error?.message?.includes('inactive or pending approval'), '1.6 Error message explains inactive status');

    // 1.7 Valid Token for Active HOD User
    const hodToken = createTestToken(HOD_USER_ID, 'hod@smartfa.edu');
    const res1_7 = await makeRequest('GET', '/api/v1/auth/me', hodToken);
    assert(res1_7.status === 200, '1.7 Active HOD user returns HTTP 200');
    assert(res1_7.body.user?.id === HOD_USER_ID, '1.7 Response user.id matches JWT sub');
    assert(res1_7.body.profile?.full_name === 'Dr. Head of Department', '1.7 Response profile matches database record');
    assert(Array.isArray(res1_7.body.roles) && res1_7.body.roles.includes('hod'), '1.7 Verified roles include "hod"');
    assert(res1_7.body.isHOD === true, '1.7 Verified isHOD is true');

    // 1.8 Valid Token for Active Teacher User
    const teacherToken = createTestToken(TEACHER_USER_ID, 'teacher@smartfa.edu');
    const res1_8 = await makeRequest('GET', '/api/v1/auth/me', teacherToken);
    assert(res1_8.status === 200, '1.8 Active teacher returns HTTP 200');
    assert(res1_8.body.roles.includes('subject_teacher'), '1.8 Verified roles include "subject_teacher"');
    assert(res1_8.body.isHOD === false, '1.8 Verified isHOD is false');

    // 1.9 Client-Supplied Role Header Invariant
    const res1_9 = await makeRequest('GET', '/api/v1/auth/me', teacherToken, undefined, { 'X-Role': 'hod' });
    assert(res1_9.body.isHOD === false, '1.9 Client-supplied X-Role header is strictly ignored');
    assert(!res1_9.body.roles.includes('hod'), '1.9 Privileged role is not granted from client header');

    console.log('\n--- 2. Protected API Bearer Token Attachment & Authorization ---');

    // 2.1 Protected HOD route without Bearer token
    const res2_1 = await makeRequest('GET', '/api/v1/admin/hod/programmes');
    assert(res2_1.status === 401, '2.1 Protected HOD route without token returns HTTP 401');

    // 2.2 Protected HOD route with teacher Bearer token (RBAC boundary)
    const res2_2 = await makeRequest('GET', '/api/v1/admin/hod/programmes', teacherToken);
    assert(res2_2.status === 403, '2.2 Faculty token accessing HOD route returns HTTP 403');
    assert(res2_2.body.error?.code === 'FORBIDDEN', '2.2 Error code is FORBIDDEN');

    // 2.3 Protected HOD route with HOD Bearer token
    const res2_3 = await makeRequest('GET', '/api/v1/admin/hod/programmes', hodToken);
    assert(res2_3.status === 200, '2.3 HOD token accessing HOD route returns HTTP 200');
    assert(Array.isArray(res2_3.body.programmes), '2.3 Programmes array returned');

    // 2.4 Protected audit route without token
    const res2_4 = await makeRequest('GET', '/api/v1/admin/hod/audit');
    assert(res2_4.status === 401, '2.4 Audit route without token returns HTTP 401');

    // 2.5 Protected audit route with HOD token
    const res2_5 = await makeRequest('GET', '/api/v1/admin/hod/audit', hodToken);
    assert(res2_5.status === 200, '2.5 Audit route with HOD token returns HTTP 200');
    assert(Array.isArray(res2_5.body.events), '2.5 Audit events array returned');

    // 2.6 Protected assessment route without token
    const res2_6 = await makeRequest('GET', '/api/v1/assessments');
    assert(res2_6.status === 401, '2.6 Assessments route without token returns HTTP 401');

    // 2.7 Protected assessment route with teacher token
    const res2_7 = await makeRequest('GET', '/api/v1/assessments', teacherToken);
    assert(res2_7.status === 200, '2.7 Assessments route with teacher token returns HTTP 200');

    // 2.8 Protected submission route without token
    const res2_8 = await makeRequest('POST', '/api/v1/submissions', undefined, { assessment_id: '111', question_id: '222' });
    assert(res2_8.status === 401, '2.8 Submissions route without token returns HTTP 401');

    console.log('\n--- 3. Web Auth Context & Session Lifecycle Logic ---');

    // 3.1 Verify AuthContext file exists and exports required types and hooks
    const authContextPath = path.resolve(process.cwd(), 'apps/web/src/context/AuthContext.tsx');
    assert(fs.existsSync(authContextPath), '3.1 AuthContext.tsx exists in apps/web/src/context/');
    const authContextSrc = fs.readFileSync(authContextPath, 'utf-8');
    assert(authContextSrc.includes('export const AuthProvider'), '3.1 Exports AuthProvider');
    assert(authContextSrc.includes('export const useAuth'), '3.1 Exports useAuth hook');
    assert(authContextSrc.includes('supabase.auth.onAuthStateChange'), '3.1 Subscribes to onAuthStateChange');
    assert(authContextSrc.includes('subscription?.unsubscribe()'), '3.1 Performs cleanup with unsubscribe() on unmount');
    assert(authContextSrc.includes('supabase.auth.signOut()'), '3.1 Implements real Supabase signOut');
    assert(authContextSrc.includes('supabase.auth.signInWithPassword'), '3.1 Implements real signInWithPassword');
    assert(authContextSrc.includes('supabase.auth.getSession()'), '3.1 Restores existing session via getSession');

    // 3.2 Verify apiClient.ts authApi implementation
    const apiClientPath = path.resolve(process.cwd(), 'apps/web/src/services/apiClient.ts');
    const apiClientSrc = fs.readFileSync(apiClientPath, 'utf-8');
    assert(apiClientSrc.includes('export const authApi = {'), '3.2 authApi is exported from apiClient.ts');
    assert(apiClientSrc.includes('getMe: async'), '3.2 authApi.getMe is implemented');
    assert(apiClientSrc.includes('headers[\'Authorization\'] = `Bearer ${session.access_token}`'), '3.2 getAuthHeaders attaches Supabase Bearer token');
    assert(apiClientSrc.includes('export interface UserAuthContext'), '3.2 UserAuthContext type is exported');

    // 3.3 Verify assessmentApi and submissionApi attach auth headers
    assert(apiClientSrc.includes('const authHeaders = await getAuthHeaders();'), '3.3 Protected APIs dynamically fetch auth headers');

    // 3.4 Verify LoginView.tsx component
    const loginViewPath = path.resolve(process.cwd(), 'apps/web/src/features/auth/LoginView.tsx');
    assert(fs.existsSync(loginViewPath), '3.4 LoginView.tsx exists in apps/web/src/features/auth/');
    const loginViewSrc = fs.readFileSync(loginViewPath, 'utf-8');
    assert(loginViewSrc.includes('Sign In'), '3.4 LoginView renders sign in');
    assert(loginViewSrc.includes('auth-email'), '3.4 LoginView includes email input');
    assert(loginViewSrc.includes('auth-password'), '3.4 LoginView includes password input');
    assert(loginViewSrc.includes('role="alert"'), '3.4 LoginView includes accessible error banner');
    assert(loginViewSrc.includes('institutional credentials') || loginViewSrc.includes('Strictly initialized empty'), '3.4 LoginView informs user of institutional authentication');

    console.log('\n--- 4. Role-Aware UI Security & Role Toggle Removal ---');

    // 4.1 Header.tsx role toggle inspection
    const headerPath = path.resolve(process.cwd(), 'apps/web/src/components/Header.tsx');
    const headerSrc = fs.readFileSync(headerPath, 'utf-8');
    assert(headerSrc.includes('onLogout'), '4.1 Header accepts onLogout callback');
    assert(headerSrc.includes('LogOut'), '4.1 Header imports and renders Logout icon/button');
    assert(headerSrc.includes('availableRoles.length > 1'), '4.1 Role selector only rendered when user possesses multiple verified roles');
    assert(!headerSrc.includes("['student', 'subject_teacher', 'class_teacher', 'proctor', 'hod']"), '4.1 Hardcoded arbitrary client-side role toggle removed from Header');

    // 4.2 App.tsx AuthProvider integration and status gates
    const appPath = path.resolve(process.cwd(), 'apps/web/src/app/App.tsx');
    const appSrc = fs.readFileSync(appPath, 'utf-8');
    assert(appSrc.includes('<AuthProvider>'), '4.2 App wraps layout in AuthProvider');
    assert(appSrc.includes('Restoring Institutional Session...'), '4.2 Loading state blocks privileged render during session probe');
    assert(appSrc.includes('<LoginView'), '4.2 Unauthenticated state displays LoginView');
    assert(appSrc.includes('Institutional Account Inactive'), '4.2 Inactive account state is safely intercepted with message');
    assert(appSrc.includes('No Active Roles Provisioned'), '4.2 Zero-role account state is safely intercepted');
    assert(appSrc.includes('onLogout={logout}'), '4.2 Logout handler wired to Header');

    // 4.3 Proxy App.tsx and middleware/jwt.ts
    const rootAppPath = path.resolve(process.cwd(), 'apps/web/src/App.tsx');
    assert(fs.existsSync(rootAppPath), '4.3 apps/web/src/App.tsx proxy exists for contract compatibility');
    const middlewareJwtPath = path.resolve(process.cwd(), 'apps/api/src/middleware/jwt.ts');
    assert(fs.existsSync(middlewareJwtPath), '4.3 apps/api/src/middleware/jwt.ts proxy exists');

    console.log('\n--- 5. Regression Verification of HOD API, Audit, and Academic Workflows ---');

    // 5.1 Programme creation under authenticated HOD context
    const progPayload = { code: 'BIO', name: 'Department of Biotechnology', duration_years: 4, total_semesters: 8 };
    const res5_1 = await makeRequest('POST', '/api/v1/admin/hod/programmes', hodToken, progPayload);
    assert(res5_1.status === 201, '5.1 Programme creation succeeded with HOD token (HTTP 201)');
    assert(res5_1.body.programme?.code === 'BIO', '5.1 Created programme code is BIO');

    // 5.2 Academic term creation under authenticated HOD context
    const termPayload = {
      name: 'Spring 2027',
      starts_on: '2027-01-15',
      ends_on: '2027-05-30',
      active: true
    };
    const res5_2 = await makeRequest('POST', '/api/v1/admin/hod/terms', hodToken, termPayload);
    assert(res5_2.status === 201, '5.2 Term creation succeeded with HOD token (HTTP 201)');
    assert(res5_2.body.term?.name === 'Spring 2027', '5.2 Created term name is Spring 2027');

    // 5.3 Class batch creation under authenticated HOD context
    const classPayload = {
      term_id: res5_2.body.term.id,
      programme: 'Biotechnology',
      semester: 1,
      section: 'A'
    };
    const res5_3 = await makeRequest('POST', '/api/v1/admin/hod/classes', hodToken, classPayload);
    assert(res5_3.status === 201, '5.3 Class creation succeeded with HOD token (HTTP 201)');

    // 5.4 Subject creation and allocation under authenticated HOD context
    const subjPayload = {
      code: 'BIO101',
      name: 'Cell Biology',
      credits: 4
    };
    const res5_4 = await makeRequest('POST', '/api/v1/admin/hod/subjects', hodToken, subjPayload);
    assert(res5_4.status === 201, '5.4 Subject creation succeeded with HOD token (HTTP 201)');

    const allocPayload = {
      class_id: res5_3.body.class.id,
      subject_id: res5_4.body.subject.id,
      subject_teacher_id: TEACHER_USER_ID
    };
    const res5_5 = await makeRequest('POST', '/api/v1/admin/hod/class-subjects', hodToken, allocPayload);
    assert(res5_5.status === 201, '5.5 Class-Subject allocation succeeded with HOD token (HTTP 201)');

    // 5.6 Audit Event retrieval after academic mutations
    const res5_6 = await makeRequest('GET', '/api/v1/admin/hod/audit', hodToken);
    assert(res5_6.status === 200, '5.6 Audit log retrieval succeeded (HTTP 200)');
    assert(res5_6.body.events.length > 0, '5.6 Audit events are recorded for mutations');
    const latestEvent = res5_6.body.events[0];
    assert(latestEvent.actor_id === HOD_USER_ID, '5.6 Latest audit event attributes actor_id to authenticated HOD');

    console.log(`\n================================================================`);
    console.log(` PHASE 4.3 AUTH LIFECYCLE SUITE COMPLETE: ${passedAssertions}/${totalAssertions} PASSED`);
    console.log(`================================================================\n`);
    process.exit(0);
  } finally {
    if (server) server.close();
  }
}

runSuite().catch(err => {
  console.error('\n[SUITE FATAL ERROR]:', err);
  if (server) server.close();
  process.exit(1);
});
