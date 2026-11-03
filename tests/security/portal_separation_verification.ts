import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import http from 'http';
import jwt from 'jsonwebtoken';

// Load root .env
const rootEnvPath = path.resolve(process.cwd(), '.env');
dotenv.config({ path: rootEnvPath });

const EXPECTED_PROD_PROJECT_REF = 'rdfloxppwlbocxplbixu';
const STUDENT_EMAIL = 'adm25mca9718@sjbit.edu.in';
const HOD_EMAIL = 'vishnucn944@gmail.com';
const DEV_JWT_SECRET = 'smartfa-test-hmac-dev-secret-key-32chars';

let totalTests = 0;
let passedTests = 0;

function assert(condition: boolean, testName: string, failureDetails?: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  [PASS] Test ${totalTests}: ${testName}`);
  } else {
    console.error(`  [FAIL] Test ${totalTests}: ${testName} - ${failureDetails || 'Assertion failed'}`);
    process.exitCode = 1;
  }
}

async function makeApiRequest(
  app: any,
  options: {
    path: string;
    method: string;
    token?: string;
    body?: any;
  }
): Promise<{ status: number; body: any }> {
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
              const parsed = data ? JSON.parse(data) : {};
              resolve({ status: res.statusCode || 500, body: parsed });
            } catch {
              resolve({ status: res.statusCode || 500, body: { raw: data } });
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

async function run() {
  console.log('================================================================');
  console.log('  ACADASSESS: PORTAL SEPARATION & ROLE ISOLATION VERIFICATION   ');
  console.log('================================================================\n');

  // --- 1. Static UI Source Code Invariant Inspections ---
  console.log('--- 1. Frontend Source Code Invariants & Shortcut Elimination ---');

  const loginViewPath = path.resolve(process.cwd(), 'apps/web/src/features/auth/LoginView.tsx');
  const portalSelectionPath = path.resolve(process.cwd(), 'apps/web/src/features/portal/PortalSelectionView.tsx');
  const appPath = path.resolve(process.cwd(), 'apps/web/src/app/App.tsx');
  const authContextPath = path.resolve(process.cwd(), 'apps/web/src/context/AuthContext.tsx');

  const loginViewSrc = fs.readFileSync(loginViewPath, 'utf-8');
  const portalSelectionSrc = fs.readFileSync(portalSelectionPath, 'utf-8');
  const appSrc = fs.readFileSync(appPath, 'utf-8');
  const authContextSrc = fs.readFileSync(authContextPath, 'utf-8');

  // Test 1: Landing page links to both student and faculty login portals
  assert(
    portalSelectionSrc.includes("onSelectPortal('student')") &&
    portalSelectionSrc.includes("onSelectPortal('faculty')") &&
    portalSelectionSrc.includes("Student Portal Login") &&
    portalSelectionSrc.includes("Faculty Portal Login"),
    'Landing page contains distinct action cards for Student Portal and Faculty Portal'
  );

  // Test 2: Both login forms start with empty email and password state
  assert(
    loginViewSrc.includes("const [email, setEmail] = useState('');") &&
    loginViewSrc.includes("const [password, setPassword] = useState('');"),
    'Login form state initializes with strictly empty email and password fields'
  );

  // Test 3: No quick-login role shortcuts remain in LoginView
  const hasQuickRoleButtons = 
    loginViewSrc.includes('handleSelectStudentRole') || 
    loginViewSrc.includes('handleSelectFacultyRole') ||
    loginViewSrc.includes("setEmail('adm25mca9718@sjbit.edu.in')") ||
    loginViewSrc.includes("setEmail('nagamanis@sjbit.edu.in')");

  assert(
    !hasQuickRoleButtons,
    'All quick-login buttons, role autofills, and hardcoded account triggers eliminated from LoginView'
  );

  // Test 4: Landing page has zero quick-login or demo login buttons
  const landingHasDemo = 
    portalSelectionSrc.includes('demoLogin') ||
    portalSelectionSrc.includes('quickLogin') ||
    portalSelectionSrc.includes('adm25mca9718') ||
    portalSelectionSrc.includes('nagamanis');

  assert(
    !landingHasDemo,
    'Landing page has zero demo credentials or bypass shortcuts'
  );

  // Test 5: App.tsx routes to /student/login, /faculty/login, and /
  assert(
    appSrc.includes("pathname === '/student/login'") &&
    appSrc.includes("pathname === '/faculty/login'") &&
    appSrc.includes("<PortalSelectionView"),
    'App router routes correctly between /student/login, /faculty/login, and /'
  );

  // --- 2. Live Supabase Connection & Accounts Verification ---
  console.log('\n--- 2. Database Identity Context & RBAC Preparation ---');

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  assert(
    Boolean(supabaseUrl && supabaseUrl.includes(EXPECTED_PROD_PROJECT_REF)),
    `Supabase URL matches expected production project reference (${EXPECTED_PROD_PROJECT_REF})`
  );

  assert(
    Boolean(serviceKey && serviceKey.startsWith('sb_secret_')),
    'Supabase service-role key is loaded and validated with expected prefix'
  );

  const privilegedClient = createClient(supabaseUrl!, serviceKey!, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  // Fetch production student account
  const { data: studentProfiles } = await privilegedClient
    .from('profiles')
    .select('*')
    .eq('email', STUDENT_EMAIL);

  assert(
    Boolean(studentProfiles && studentProfiles.length === 1),
    `Student account found in production (${STUDENT_EMAIL})`
  );

  const prodStudentId = studentProfiles![0].id;

  const { data: studentRoles } = await privilegedClient
    .from('user_roles')
    .select('*')
    .eq('user_id', prodStudentId);

  assert(
    Boolean(studentRoles && studentRoles.length === 1 && studentRoles[0].role === 'student' && studentRoles[0].active === true),
    'Student user possesses strictly active role "student" and zero staff roles'
  );

  // Fetch production HOD account
  const { data: hodProfiles } = await privilegedClient
    .from('profiles')
    .select('*')
    .eq('email', HOD_EMAIL);

  assert(
    Boolean(hodProfiles && hodProfiles.length === 1 && hodProfiles[0].status === 'active'),
    `HOD account found in production (${HOD_EMAIL}, status: active)`
  );

  const prodHodId = hodProfiles![0].id;

  const { data: hodRoles } = await privilegedClient
    .from('user_roles')
    .select('*')
    .eq('user_id', prodHodId);

  assert(
    Boolean(hodRoles && hodRoles.some(r => r.role === 'hod' && r.active === true)),
    'HOD user possesses strictly active role "hod"'
  );

  // --- 3. Server-Side Authoritative Portal Access Verification ---
  console.log('\n--- 3. Server-Side Authoritative Portal Access Verification ---');

  const appModule = await import('../../apps/api/src/index.js');
  const app = appModule.default;

  const { setUserRepositoryForTesting, InMemoryUserRepository } = await import('../../apps/api/src/storage/userRepository.js');
  const { db } = await import('../../apps/api/src/storage/db.js');

  // Configure testing repository to exercise the RBAC matrix deterministically
  setUserRepositoryForTesting(new InMemoryUserRepository(db));

  // Active student fixture: student.a@smartfa.edu (id: a4000000-0000-0000-0000-000000000001, active: true, role: student)
  const testStudentId = 'a4000000-0000-0000-0000-000000000001';
  const testStudentToken = jwt.sign(
    { sub: testStudentId, email: 'student.a@smartfa.edu' },
    DEV_JWT_SECRET,
    { expiresIn: '1h' }
  );

  // Active teacher fixture: teacher1@smartfa.edu (id: a2000000-0000-0000-0000-000000000001, active: true, role: subject_teacher)
  const testTeacherId = 'a2000000-0000-0000-0000-000000000001';
  const testTeacherToken = jwt.sign(
    { sub: testTeacherId, email: 'teacher1@smartfa.edu' },
    DEV_JWT_SECRET,
    { expiresIn: '1h' }
  );

  // Active HOD fixture: hod@smartfa.edu (id: a1000000-0000-0000-0000-000000000001, active: true, role: hod)
  const testHodId = 'a1000000-0000-0000-0000-000000000001';
  const testHodToken = jwt.sign(
    { sub: testHodId, email: 'hod@smartfa.edu' },
    DEV_JWT_SECRET,
    { expiresIn: '1h' }
  );

  // Test 12: Valid student account succeeds on Student Portal
  const studentOnStudentRes = await makeApiRequest(app, {
    path: '/api/v1/auth/verify-portal',
    method: 'POST',
    token: testStudentToken,
    body: { portal: 'student' }
  });

  assert(
    studentOnStudentRes.status === 200 && studentOnStudentRes.body?.authorized === true,
    'Valid student account succeeds on Student Portal (HTTP 200, authorized: true)'
  );

  // Test 13: Student account REJECTED from Faculty Portal
  const studentOnFacultyRes = await makeApiRequest(app, {
    path: '/api/v1/auth/verify-portal',
    method: 'POST',
    token: testStudentToken,
    body: { portal: 'faculty' }
  });

  assert(
    studentOnFacultyRes.status === 403 && 
    studentOnFacultyRes.body?.error?.code === 'PORTAL_ACCESS_DENIED' &&
    studentOnFacultyRes.body?.error?.recommendedPortal === 'student',
    'Student-only account is rejected from Faculty Portal with HTTP 403 PORTAL_ACCESS_DENIED'
  );

  // Test 14: Authorized faculty account succeeds on Faculty Portal
  const facultyOnFacultyRes = await makeApiRequest(app, {
    path: '/api/v1/auth/verify-portal',
    method: 'POST',
    token: testTeacherToken,
    body: { portal: 'faculty' }
  });

  assert(
    facultyOnFacultyRes.status === 200 && facultyOnFacultyRes.body?.authorized === true,
    'Authorized faculty account succeeds on Faculty Portal (HTTP 200, authorized: true)'
  );

  // Test 15: Faculty account without student role is REJECTED from Student Portal
  const facultyOnStudentRes = await makeApiRequest(app, {
    path: '/api/v1/auth/verify-portal',
    method: 'POST',
    token: testTeacherToken,
    body: { portal: 'student' }
  });

  assert(
    facultyOnStudentRes.status === 403 && 
    facultyOnStudentRes.body?.error?.code === 'PORTAL_ACCESS_DENIED' &&
    facultyOnStudentRes.body?.error?.recommendedPortal === 'faculty',
    'Faculty account without student role is rejected from Student Portal (HTTP 403 PORTAL_ACCESS_DENIED)'
  );

  // Test 16: Authorized HOD account succeeds on Faculty Portal
  const hodOnFacultyRes = await makeApiRequest(app, {
    path: '/api/v1/auth/verify-portal',
    method: 'POST',
    token: testHodToken,
    body: { portal: 'faculty' }
  });

  assert(
    hodOnFacultyRes.status === 200 && hodOnFacultyRes.body?.authorized === true && hodOnFacultyRes.body?.isHOD === true,
    'Authorized HOD account succeeds on Faculty Portal with isHOD=true (HTTP 200)'
  );

  // --- 4. Cross-Role API Boundary Isolation ---
  console.log('\n--- 4. Cross-Role API Boundary & Privilege Escalation Invariants ---');

  // Test 17: Student token is strictly forbidden from HOD admin endpoints
  const studentHODAttempt = await makeApiRequest(app, {
    path: '/api/v1/admin/hod/programmes',
    method: 'GET',
    token: testStudentToken
  });

  assert(
    studentHODAttempt.status === 403,
    `Student token forbidden from HOD endpoints (HTTP ${studentHODAttempt.status} ${studentHODAttempt.body?.error?.code || 'FORBIDDEN'})`
  );

  // Test 18: Faculty account without HOD role is denied HOD-only endpoints
  const teacherHODAttempt = await makeApiRequest(app, {
    path: '/api/v1/admin/hod/programmes',
    method: 'GET',
    token: testTeacherToken
  });

  assert(
    teacherHODAttempt.status === 403,
    `Faculty without HOD role strictly denied HOD-only endpoints (HTTP ${teacherHODAttempt.status} ${teacherHODAttempt.body?.error?.code || 'FORBIDDEN'})`
  );

  // Test 19: Authorized HOD can access HOD endpoints
  const hodAccessRes = await makeApiRequest(app, {
    path: '/api/v1/admin/hod/programmes',
    method: 'GET',
    token: testHodToken
  });

  assert(
    hodAccessRes.status === 200,
    `Authorized HOD successfully accesses HOD endpoints (HTTP 200, programmes retrieved)`
  );

  // Test 20: Student token cannot create assessments
  const studentCreateAssessment = await makeApiRequest(app, {
    path: '/api/v1/assessments',
    method: 'POST',
    token: testStudentToken,
    body: {
      class_subject_id: 'cs-dummy',
      title: 'Unauthorized Student Assessment',
      instructions: 'test'
    }
  });

  assert(
    studentCreateAssessment.status === 403,
    `Student token forbidden from creating assessments (HTTP ${studentCreateAssessment.status} ${studentCreateAssessment.body?.error?.code || 'FORBIDDEN'})`
  );

  // --- 5. Negative Security & Tampered Token Tests ---
  console.log('\n--- 5. Negative Security & Tampered Token Invariants ---');

  // Test 21: Missing Authorization header rejected
  const noTokenRes = await makeApiRequest(app, {
    path: '/api/v1/auth/me',
    method: 'GET'
  });

  assert(
    noTokenRes.status === 401 && noTokenRes.body?.error?.code === 'UNAUTHORIZED',
    'Missing authentication token rejected with HTTP 401 UNAUTHORIZED'
  );

  // Test 22: Tampered JWT token rejected
  const tamperedTokenRes = await makeApiRequest(app, {
    path: '/api/v1/auth/me',
    method: 'GET',
    token: 'header.payload.signature_tampered_value'
  });

  assert(
    tamperedTokenRes.status === 401,
    'Tampered JWT token rejected with HTTP 401'
  );

  // Test 23: Client-side role spoofing in body is completely ignored by backend
  const spoofAttemptRes = await makeApiRequest(app, {
    path: '/api/v1/auth/verify-portal',
    method: 'POST',
    token: testStudentToken,
    body: {
      portal: 'faculty',
      role: 'hod',              // Client attempt to claim HOD role
      roles: ['hod', 'faculty'] // Client attempt to inject roles
    }
  });

  assert(
    spoofAttemptRes.status === 403 && spoofAttemptRes.body?.error?.code === 'PORTAL_ACCESS_DENIED',
    'Client-supplied roles in request body are strictly ignored; backend queries authoritative DB records'
  );

  // Test 24: Invalid portal parameter returns 400
  const invalidPortalRes = await makeApiRequest(app, {
    path: '/api/v1/auth/verify-portal',
    method: 'POST',
    token: testStudentToken,
    body: { portal: 'admin_super_secret' }
  });

  assert(
    invalidPortalRes.status === 400 && invalidPortalRes.body?.error?.code === 'INVALID_PORTAL',
    'Invalid portal parameter rejected with HTTP 400 INVALID_PORTAL'
  );

  console.log('\n================================================================');
  console.log(` PORTAL SEPARATION VERIFICATION: ${passedTests}/${totalTests} TESTS PASSED`);
  console.log('================================================================\n');

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('\n[FATAL TEST RUN ERROR]:', err);
  process.exit(1);
});
