/**
 * ==============================================================================
 * ACADASSESS: MULTI-ROLE HOD + SUBJECT TEACHER WORKSPACE SWITCHING VERIFICATION
 * ==============================================================================
 * 
 * Verifies all 9 requirements from user specification:
 * 1. HOD-only account sees only HOD Workspace.
 * 2. Subject Teacher-only account sees only Subject Teacher Workspace.
 * 3. HOD + Subject Teacher account can switch between both workspaces.
 * 4. Proctor + Subject Teacher switching continues working.
 * 5. Faculty with multiple roles restores valid workspace selection after refresh.
 * 6. Switching workspaces does not require logout (same session token preserved).
 * 7. HOD permissions remain restricted to authorized HOD accounts (Subject Teacher blocked from HOD endpoints).
 * 8. Subject Teacher access in Subject Teacher workspace is restricted to assigned subjects.
 * 9. User Directory accurately aggregates and displays all actual assigned roles.
 * ==============================================================================
 */

process.env.SMARTFA_TEST_MODE = 'true';
import http from 'http';
import jwt from 'jsonwebtoken';
import app from '../../apps/api/src/index.js';
import { db } from '../../apps/api/src/storage/db.js';
import { InMemoryUserRepository, setUserRepositoryForTesting } from '../../apps/api/src/storage/userRepository.js';
import { InMemoryAssessmentRepository, setAssessmentRepositoryForTesting } from '../../apps/api/src/storage/assessmentRepository.js';
import { InMemorySubmissionRepository, setSubmissionRepositoryForTesting } from '../../apps/api/src/storage/submissionRepository.js';
import { InMemoryAcademicRepository, setAcademicRepositoryForTesting } from '../../apps/api/src/storage/academicRepository.js';
import { InMemoryEvaluationRepository, setEvaluationRepositoryForTesting } from '../../apps/api/src/storage/evaluationRepository.js';
import { invalidateUserContextCache } from '../../apps/api/src/authorization/rbac.js';

let server: http.Server;
const PORT = 4048;
const DEV_JWT_SECRET = process.env.JWT_DEV_SECRET || 'smartfa-test-hmac-dev-secret-key-32chars';

// Fixture User IDs
const HOD_ONLY_ID = 'h1000000-0000-0000-0000-000000000001';
const TEACHER_ONLY_ID = 't1000000-0000-0000-0000-000000000001';
const HOD_TEACHER_ID = 'ht100000-0000-0000-0000-000000000001';
const PROCTOR_TEACHER_ID = 'pt100000-0000-0000-0000-000000000001';

// Classes & Subjects
const CLASS_MCA3_ID = 'c1000000-0000-0000-0000-000000000001';
const SUBJECT_HT_ID = 's1000000-0000-0000-0000-000000000001'; // Assigned to HOD_TEACHER
const SUBJECT_OTHER_ID = 's2000000-0000-0000-0000-000000000002'; // Assigned to another teacher

const CS_HT_ID = 'cs100000-0000-0000-0000-000000000001';
const CS_OTHER_ID = 'cs200000-0000-0000-0000-000000000002';

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

function makeToken(userId: string, email: string): string {
  return jwt.sign(
    { sub: userId, email, aud: 'authenticated', role: 'authenticated' },
    DEV_JWT_SECRET,
    { algorithm: 'HS256', expiresIn: '1h' }
  );
}

async function apiRequest(
  method: string,
  path: string,
  token?: string,
  body?: any,
  activeRole?: string
): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    if (activeRole) {
      headers['x-active-role'] = activeRole;
    }

    const postData = body ? JSON.stringify(body) : undefined;
    if (postData) {
      headers['Content-Length'] = Buffer.byteLength(postData).toString();
    }

    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path,
        method,
        headers
      },
      (res) => {
        let raw = '';
        res.on('data', chunk => raw += chunk);
        res.on('end', () => {
          let parsed: any;
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
    if (postData) req.write(postData);
    req.end();
  });
}

// Client-side default role resolution logic replicating AuthContext.tsx
function determineDefaultRole(roles: string[], savedWorkspace?: string | null): string | null {
  if (!roles || roles.length === 0) return null;
  if (savedWorkspace && roles.includes(savedWorkspace)) {
    return savedWorkspace;
  }
  if (roles.includes('hod')) return 'hod';
  if (roles.includes('subject_teacher')) return 'subject_teacher';
  if (roles.includes('class_teacher')) return 'class_teacher';
  if (roles.includes('proctor')) return 'proctor';
  return roles[0];
}

async function run() {
  console.log('================================================================');
  console.log(' ACADASSESS: MULTI-ROLE HOD + SUBJECT TEACHER VERIFICATION SUITE');
  console.log('================================================================\n');

  // 1. Seed in-memory test fixtures
  setUserRepositoryForTesting(new InMemoryUserRepository(db));
  setAssessmentRepositoryForTesting(new InMemoryAssessmentRepository(db));
  setSubmissionRepositoryForTesting(new InMemorySubmissionRepository(db));
  setAcademicRepositoryForTesting(new InMemoryAcademicRepository(db));
  setEvaluationRepositoryForTesting(new InMemoryEvaluationRepository(db));

  // Profiles
  const profilesToAdd = [
    { id: HOD_ONLY_ID, email: 'hod.only@smartfa.edu', full_name: 'Prof. HOD Only', status: 'active' as const },
    { id: TEACHER_ONLY_ID, email: 'teacher.only@smartfa.edu', full_name: 'Dr. Teacher Only', status: 'active' as const },
    { id: HOD_TEACHER_ID, email: 'hod.teacher@smartfa.edu', full_name: 'Dr. Dual HOD Teacher', status: 'active' as const },
    { id: PROCTOR_TEACHER_ID, email: 'proctor.teacher@smartfa.edu', full_name: 'Prof. Dual Proctor Teacher', status: 'active' as const }
  ];

  for (const p of profilesToAdd) {
    if (!db.profiles.some(x => x.id === p.id)) {
      db.profiles.push({ ...p, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    }
  }

  // Roles
  db.roles = db.roles.filter(r => ![HOD_ONLY_ID, TEACHER_ONLY_ID, HOD_TEACHER_ID, PROCTOR_TEACHER_ID].includes(r.user_id));
  db.roles.push(
    // 1. HOD Only
    { id: 'r1', user_id: HOD_ONLY_ID, role: 'hod', active: true, created_at: new Date().toISOString() },
    // 2. Teacher Only
    { id: 'r2', user_id: TEACHER_ONLY_ID, role: 'subject_teacher', active: true, created_at: new Date().toISOString() },
    // 3. HOD + Subject Teacher
    { id: 'r3a', user_id: HOD_TEACHER_ID, role: 'hod', active: true, created_at: new Date().toISOString() },
    { id: 'r3b', user_id: HOD_TEACHER_ID, role: 'subject_teacher', active: true, created_at: new Date().toISOString() },
    // 4. Proctor + Subject Teacher
    { id: 'r4a', user_id: PROCTOR_TEACHER_ID, role: 'proctor', active: true, created_at: new Date().toISOString() },
    { id: 'r4b', user_id: PROCTOR_TEACHER_ID, role: 'subject_teacher', active: true, created_at: new Date().toISOString() }
  );

  // Class Subjects
  db.classSubjects = db.classSubjects.filter(cs => ![CS_HT_ID, CS_OTHER_ID].includes(cs.id));
  db.classSubjects.push(
    {
      id: CS_HT_ID,
      class_id: CLASS_MCA3_ID,
      subject_id: SUBJECT_HT_ID,
      subject_teacher_id: HOD_TEACHER_ID,
      active: true,
      created_at: new Date().toISOString()
    },
    {
      id: CS_OTHER_ID,
      class_id: CLASS_MCA3_ID,
      subject_id: SUBJECT_OTHER_ID,
      subject_teacher_id: TEACHER_ONLY_ID,
      active: true,
      created_at: new Date().toISOString()
    }
  );

  // Start HTTP server
  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(PORT, '127.0.0.1', () => resolve()));

  try {
    // -------------------------------------------------------------------------
    // Scenario 1: HOD-only account sees only HOD Workspace
    // -------------------------------------------------------------------------
    console.log('--- 1. HOD-Only Account Workspace Scoping ---');
    const hodOnlyToken = makeToken(HOD_ONLY_ID, 'hod.only@smartfa.edu');
    const meHodRes = await apiRequest('GET', '/api/v1/auth/me', hodOnlyToken);
    assert(
      meHodRes.status === 200 &&
      meHodRes.body.roles.length === 1 &&
      meHodRes.body.roles[0] === 'hod',
      'HOD-only account receives exactly 1 role (hod)',
      JSON.stringify(meHodRes.body.roles)
    );
    const hodDefaultRole = determineDefaultRole(meHodRes.body.roles);
    assert(hodDefaultRole === 'hod', 'HOD-only account defaults to HOD workspace');

    // -------------------------------------------------------------------------
    // Scenario 2: Subject Teacher-only account sees only Subject Teacher Workspace
    // -------------------------------------------------------------------------
    console.log('\n--- 2. Subject Teacher-Only Account Workspace Scoping ---');
    const teacherOnlyToken = makeToken(TEACHER_ONLY_ID, 'teacher.only@smartfa.edu');
    const meTeacherRes = await apiRequest('GET', '/api/v1/auth/me', teacherOnlyToken);
    assert(
      meTeacherRes.status === 200 &&
      meTeacherRes.body.roles.length === 1 &&
      meTeacherRes.body.roles[0] === 'subject_teacher',
      'Subject Teacher-only account receives exactly 1 role (subject_teacher)',
      JSON.stringify(meTeacherRes.body.roles)
    );
    const teacherDefaultRole = determineDefaultRole(meTeacherRes.body.roles);
    assert(teacherDefaultRole === 'subject_teacher', 'Subject Teacher-only account defaults to Subject Teacher workspace');

    // -------------------------------------------------------------------------
    // Scenario 3: HOD + Subject Teacher account can switch between both workspaces
    // -------------------------------------------------------------------------
    console.log('\n--- 3. HOD + Subject Teacher Multi-Role Switching ---');
    const dualToken = makeToken(HOD_TEACHER_ID, 'hod.teacher@smartfa.edu');
    const meDualRes = await apiRequest('GET', '/api/v1/auth/me', dualToken);
    const dualRoles = meDualRes.body.roles || [];
    assert(
      dualRoles.includes('hod') && dualRoles.includes('subject_teacher') && dualRoles.length === 2,
      'HOD + Subject Teacher account possesses both roles in backend context',
      JSON.stringify(dualRoles)
    );

    // Initial default without stored preference
    const initialDefault = determineDefaultRole(dualRoles, null);
    assert(initialDefault === 'hod', 'HOD + Subject Teacher account defaults to HOD workspace on initial login');

    // Stored preference for subject_teacher
    const restoredPreference = determineDefaultRole(dualRoles, 'subject_teacher');
    assert(restoredPreference === 'subject_teacher', 'Stored workspace preference for subject_teacher is respected');

    // -------------------------------------------------------------------------
    // Scenario 4: Proctor + Subject Teacher switching continues working
    // -------------------------------------------------------------------------
    console.log('\n--- 4. Existing Proctor + Subject Teacher Switching Preservation ---');
    const proctorToken = makeToken(PROCTOR_TEACHER_ID, 'proctor.teacher@smartfa.edu');
    const meProcRes = await apiRequest('GET', '/api/v1/auth/me', proctorToken);
    const procRoles = meProcRes.body.roles || [];
    assert(
      procRoles.includes('proctor') && procRoles.includes('subject_teacher'),
      'Proctor + Subject Teacher account possesses both roles',
      JSON.stringify(procRoles)
    );
    const procSwitched = determineDefaultRole(procRoles, 'proctor');
    const teachSwitched = determineDefaultRole(procRoles, 'subject_teacher');
    assert(procSwitched === 'proctor' && teachSwitched === 'subject_teacher', 'Proctor + Subject Teacher workspace switching operates bidirectionally');

    // -------------------------------------------------------------------------
    // Scenario 5: Refresh preserves valid workspace selection
    // -------------------------------------------------------------------------
    console.log('\n--- 5. Session Refresh & Workspace Persistence ---');
    // When active workspace is 'subject_teacher', refresh with sessionStorage restores 'subject_teacher'
    const afterRefresh1 = determineDefaultRole(dualRoles, 'subject_teacher');
    assert(afterRefresh1 === 'subject_teacher', 'Page refresh preserves active subject_teacher workspace');

    // When active workspace is 'hod', refresh with sessionStorage restores 'hod'
    const afterRefresh2 = determineDefaultRole(dualRoles, 'hod');
    assert(afterRefresh2 === 'hod', 'Page refresh preserves active hod workspace');

    // Stored invalid/tampered workspace falls back to HOD
    const afterTamper = determineDefaultRole(dualRoles, 'super_admin');
    assert(afterTamper === 'hod', 'Invalid or revoked stored workspace safely falls back to HOD');

    // -------------------------------------------------------------------------
    // Scenario 6: Switching workspaces does not require logout
    // -------------------------------------------------------------------------
    console.log('\n--- 6. Session Preservation Across Workspace Switching ---');
    invalidateUserContextCache(HOD_TEACHER_ID);

    // Request in HOD workspace using dualToken
    const hodReq = await apiRequest('GET', '/api/v1/admin/hod/programmes', dualToken, undefined, 'hod');
    assert(hodReq.status === 200, 'Dual account in HOD workspace accesses HOD endpoints (200 OK)');

    // Immediate request in Subject Teacher workspace using the SAME token (no logout)
    invalidateUserContextCache(HOD_TEACHER_ID);
    const teacherReq = await apiRequest('GET', '/api/v1/assessments', dualToken, undefined, 'subject_teacher');
    assert(teacherReq.status === 200, 'Dual account in Subject Teacher workspace accesses assessment endpoints using same token without logout (200 OK)');

    // -------------------------------------------------------------------------
    // Scenario 7: HOD permissions remain restricted to authorized HOD accounts
    // -------------------------------------------------------------------------
    console.log('\n--- 7. HOD Endpoint Authorization Enforcement ---');
    // 7A: Pure Subject Teacher blocked from HOD endpoints
    const pureTeacherHodReq = await apiRequest('GET', '/api/v1/admin/hod/programmes', teacherOnlyToken, undefined, 'subject_teacher');
    assert(pureTeacherHodReq.status === 403, 'Pure Subject Teacher blocked from HOD administrative endpoints (403 FORBIDDEN)');

    // 7B: Dual account operating in Subject Teacher workspace blocked from HOD endpoint
    invalidateUserContextCache(HOD_TEACHER_ID);
    const dualInTeacherWorkspaceHodReq = await apiRequest('GET', '/api/v1/admin/hod/programmes', dualToken, undefined, 'subject_teacher');
    assert(
      dualInTeacherWorkspaceHodReq.status === 403 &&
      dualInTeacherWorkspaceHodReq.body.error?.code === 'WORKSPACE_ROLE_UNAUTHORIZED',
      'Dual account operating in Subject Teacher workspace denied HOD endpoints (403 WORKSPACE_ROLE_UNAUTHORIZED)'
    );

    // -------------------------------------------------------------------------
    // Scenario 8: Subject Teacher access in Subject Teacher workspace is restricted to assigned subjects
    // -------------------------------------------------------------------------
    console.log('\n--- 8. Subject Teacher Allocation Scoping ---');
    invalidateUserContextCache(HOD_TEACHER_ID);
    // In Subject Teacher workspace, GET /assessments/teacher/class-subjects returns ONLY HOD_TEACHER's assigned subjects
    const teacherCsRes = await apiRequest('GET', '/api/v1/assessments/teacher/class-subjects', dualToken, undefined, 'subject_teacher');
    assert(
      teacherCsRes.status === 200 &&
      Array.isArray(teacherCsRes.body.class_subjects) &&
      teacherCsRes.body.class_subjects.length === 1 &&
      teacherCsRes.body.class_subjects[0].id === CS_HT_ID,
      'Subject Teacher workspace returns ONLY teacher-assigned class subjects (CS_HT_ID)',
      JSON.stringify(teacherCsRes.body.class_subjects)
    );

    // In HOD workspace, GET /assessments/teacher/class-subjects returns all active class subjects in department
    invalidateUserContextCache(HOD_TEACHER_ID);
    const hodCsRes = await apiRequest('GET', '/api/v1/assessments/teacher/class-subjects', dualToken, undefined, 'hod');
    assert(
      hodCsRes.status === 200 &&
      hodCsRes.body.class_subjects.length >= 2 &&
      hodCsRes.body.class_subjects.some((cs: any) => cs.id === CS_HT_ID) &&
      hodCsRes.body.class_subjects.some((cs: any) => cs.id === CS_OTHER_ID),
      'HOD workspace returns all active departmental class subjects (including other teachers)',
      `Count: ${hodCsRes.body.class_subjects.length}`
    );

    // -------------------------------------------------------------------------
    // Scenario 9: User Directory displays all actual assigned roles
    // -------------------------------------------------------------------------
    console.log('\n--- 9. User Directory Role Aggregation ---');
    const userRepo = new InMemoryUserRepository(db);
    const users = await userRepo.listUsers();

    const dualUser = users.find(u => u.id === HOD_TEACHER_ID);
    assert(
      Boolean(dualUser) &&
      dualUser!.roles.length === 2 &&
      dualUser!.roles.includes('hod') &&
      dualUser!.roles.includes('subject_teacher'),
      'User Directory listUsers aggregates both HOD and Subject Teacher roles for dual user',
      JSON.stringify(dualUser?.roles)
    );

    const procUser = users.find(u => u.id === PROCTOR_TEACHER_ID);
    assert(
      Boolean(procUser) &&
      procUser!.roles.includes('proctor') &&
      procUser!.roles.includes('subject_teacher'),
      'User Directory listUsers aggregates both Proctor and Subject Teacher roles for dual proctor user',
      JSON.stringify(procUser?.roles)
    );

  } finally {
    server.close();
  }

  console.log('\n================================================================');
  console.log(` RESULTS: ${passedTests} / ${totalTests} TESTS PASSED (${Math.round((passedTests / totalTests) * 100)}%)`);
  console.log('================================================================\n');

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
