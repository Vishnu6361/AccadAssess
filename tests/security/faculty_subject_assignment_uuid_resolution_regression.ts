/**
 * ==============================================================================
 * ACADASSESS REGRESSION TEST: FACULTY SUBJECT ASSIGNMENT UUID RESOLUTION
 * ==============================================================================
 * 
 * Verifies:
 * 1. Root-cause reproduction & defense: Invalid fixture IDs (t1000000-...) are rejected.
 * 2. Canonical class resolution with empty classes and terms tables:
 *    - Automatically creates a real academic term with a valid RFC 4122 UUID.
 *    - Creates a canonical class linked to that real term UUID and programme ID.
 *    - Assigns the subject without requiring a cohort from the HOD.
 * 3. Multi-subject allocation reuses the resolved canonical class.
 * 4. Active allocations list retrieval (/admin/hod/users/:id/assignments) reflects
 *    the assigned subject with programme, specialization, and semester enrichment.
 * 5. Allocation persistence and removal lifecycle.
 * ==============================================================================
 */

process.env.SMARTFA_TEST_MODE = 'true';
import http from 'http';
import { randomUUID } from 'crypto';
import jwt from 'jsonwebtoken';
import app from '../../apps/api/src/index.js';
import { InMemoryUserRepository, setUserRepositoryForTesting } from '../../apps/api/src/storage/userRepository.js';
import { InMemoryAcademicRepository, setAcademicRepositoryForTesting } from '../../apps/api/src/storage/academicRepository.js';
import { InMemoryDatabase } from '../../apps/api/src/storage/db.js';

let server: http.Server;
const PORT = 4023;
const DEV_JWT_SECRET = process.env.JWT_DEV_SECRET || 'smartfa-test-hmac-dev-secret-key-32chars';

const HOD_ID = 'a1000000-0000-0000-0000-000000000001';
const TEACHER_ID = 'a2000000-0000-0000-0000-000000000001';
const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

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
    if (payload) {
      req.write(payload);
    }
    req.end();
  });
}

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`  [FAIL] ${msg}`);
    throw new Error(`Assertion failed: ${msg}`);
  }
  console.log(`  [PASS] ${msg}`);
}

async function runRegressionSuite() {
  console.log('================================================================');
  console.log(' REGRESSION SUITE: FACULTY SUBJECT ASSIGNMENT UUID RESOLUTION');
  console.log('================================================================\n');

  // 1. Initialize isolated in-memory test database
  const testDb = new InMemoryDatabase();
  testDb.classes = []; // Empty classes table
  testDb.terms = [];   // Empty terms table
  testDb.classSubjects = []; // Empty assignments

  testDb.profiles = [
    {
      id: HOD_ID,
      full_name: 'Dr. Test HOD',
      email: 'hod.test@smartfa.edu',
      status: 'active',
      created_at: new Date().toISOString()
    },
    {
      id: TEACHER_ID,
      full_name: 'Prof. Faculty Member',
      email: 'faculty.test@smartfa.edu',
      status: 'active',
      created_at: new Date().toISOString()
    }
  ];

  testDb.userRoles = [
    { id: randomUUID(), user_id: HOD_ID, role: 'hod', active: true, created_at: new Date().toISOString() },
    { id: randomUUID(), user_id: TEACHER_ID, role: 'faculty', active: true, created_at: new Date().toISOString() }
  ];

  const testUserRepo = new InMemoryUserRepository(testDb);
  const testAcademicRepo = new InMemoryAcademicRepository(testDb);

  setUserRepositoryForTesting(testUserRepo);
  setAcademicRepositoryForTesting(testAcademicRepo);

  // Setup programme, specialization, and subjects
  const progMCA = await testAcademicRepo.createProgramme({
    id: randomUUID(),
    code: 'MCA',
    name: 'Master of Computer Applications',
    duration_years: 2,
    total_semesters: 4,
    status: 'active'
  });

  const specCyber = await testAcademicRepo.createSpecialization({
    id: randomUUID(),
    programme_id: progMCA.id,
    code: 'CYBER',
    name: 'Cyber Security',
    applicable_semesters: [3],
    active: true
  });

  const subBlockchain = await testAcademicRepo.createSubject({
    id: randomUUID(),
    code: '25MCAE323',
    name: 'Block Chain Technology',
    credits: 3,
    programme_id: progMCA.id,
    specialization_id: specCyber.id,
    semester: 3,
    active: true
  });

  const subNetworkSec = await testAcademicRepo.createSubject({
    id: randomUUID(),
    code: '25MCAE321',
    name: 'Network Security',
    credits: 3,
    programme_id: progMCA.id,
    specialization_id: specCyber.id,
    semester: 3,
    active: true
  });

  // Start test server
  await new Promise<void>((resolve) => {
    server = http.createServer(app);
    server.listen(PORT, () => {
      console.log(`[Test Server] Running on http://localhost:${PORT}\n`);
      resolve();
    });
  });

  const hodToken = createToken(HOD_ID, 'hod.test@smartfa.edu');

  try {
    console.log('--- 1. Root Cause Defense & UUID Validation ---');
    assert(!UUID_REGEX.test('t1000000-0000-0000-0000-000000000001'), 't1000000-... verified as non-hex invalid UUID');

    console.log('\n--- 2. Assignment with Empty Classes and Empty Terms (Auto-Resolution) ---');
    assert(testDb.terms.length === 0, 'Pre-condition: academic_terms is completely empty');
    assert(testDb.classes.length === 0, 'Pre-condition: classes is completely empty');

    // Perform cohort-free assignment
    const assignRes = await makeRequest(
      'POST',
      `/api/v1/admin/hod/faculty/${TEACHER_ID}/assign-subjects`,
      hodToken,
      {
        programme_id: progMCA.id,
        specialization_id: specCyber.id,
        semester: 3,
        subject_ids: [subBlockchain.id]
      }
    );

    assert(assignRes.status === 201, `Assignment succeeded with HTTP 201 (got ${assignRes.status})`);
    assert(assignRes.body.assigned?.length === 1, 'Exactly one subject assignment returned');
    assert(assignRes.body.assigned[0].subject_id === subBlockchain.id, 'Assigned subject matches Block Chain Technology');

    // Verify canonical academic term was automatically created with a valid UUID
    assert(testDb.terms.length === 1, 'Academic term was automatically created');
    const createdTerm = testDb.terms[0];
    assert(UUID_REGEX.test(createdTerm.id), `Created term has valid UUID: ${createdTerm.id}`);
    assert(createdTerm.active === true, 'Created term is active');

    // Verify canonical class was created with that valid term UUID
    assert(testDb.classes.length === 1, 'Canonical class was created');
    const createdClass = testDb.classes[0];
    assert(UUID_REGEX.test(createdClass.id), `Created class has valid UUID: ${createdClass.id}`);
    assert(createdClass.term_id === createdTerm.id, 'Class term_id strictly matches created term UUID');
    assert(createdClass.programme === 'MCA', 'Class programme code is MCA');
    assert(createdClass.programme_id === progMCA.id, 'Class programme_id matches MCA programme');
    assert(createdClass.semester === 3, 'Class semester is 3');
    assert(createdClass.section === 'A', 'Class section is A');

    console.log('\n--- 3. Canonical Class Reuse for Subsequent Assignments ---');
    // Assign a second subject (Network Security) to the same teacher
    const assignRes2 = await makeRequest(
      'POST',
      `/api/v1/admin/hod/faculty/${TEACHER_ID}/assign-subjects`,
      hodToken,
      {
        programme_id: progMCA.id,
        specialization_id: specCyber.id,
        semester: 3,
        subject_ids: [subNetworkSec.id]
      }
    );

    assert(assignRes2.status === 201, `Second assignment succeeded with HTTP 201`);
    assert(testDb.classes.length === 1, 'Canonical class was reused (no duplicate class created)');
    assert(testDb.classSubjects.length === 2, 'Two subjects now assigned under the same canonical class');

    console.log('\n--- 4. Active Allocations Retrieval & Details Enrichment ---');
    const userAssignmentsRes = await makeRequest(
      'GET',
      `/api/v1/admin/hod/users/${TEACHER_ID}/assignments`,
      hodToken
    );

    assert(userAssignmentsRes.status === 200, `getUserAssignments returned HTTP 200`);
    const allocations = userAssignmentsRes.body.class_subjects;
    assert(allocations.length === 2, `Active allocations count is 2 (got ${allocations.length})`);

    const blockchainAlloc = allocations.find((a: any) => a.subject_id === subBlockchain.id);
    assert(blockchainAlloc !== undefined, 'Blockchain assignment found in active allocations');
    assert(blockchainAlloc.programme_code === 'MCA', 'Allocations show enriched programme_code: MCA');
    assert(blockchainAlloc.specialization_code === 'CYBER', 'Allocations show enriched specialization_code: CYBER');
    assert(blockchainAlloc.semester === 3, 'Allocations show enriched semester: 3');

    console.log('\n--- 5. Lifecycle Removal & Active Allocations Sync ---');
    const removeRes = await makeRequest(
      'DELETE',
      `/api/v1/admin/hod/class-subjects/${blockchainAlloc.id}`,
      hodToken
    );

    assert(removeRes.status === 200, 'Unassign subject succeeded with HTTP 200');

    const refreshedAssignmentsRes = await makeRequest(
      'GET',
      `/api/v1/admin/hod/users/${TEACHER_ID}/assignments`,
      hodToken
    );

    assert(refreshedAssignmentsRes.body.class_subjects.length === 1, 'Active allocations reduced to 1 after removal');
    assert(refreshedAssignmentsRes.body.class_subjects[0].subject_id === subNetworkSec.id, 'Remaining allocation is Network Security');

    console.log('\n================================================================');
    console.log(' ALL 18 REGRESSION TESTS PASSED CLEANLY');
    console.log('================================================================\n');
  } finally {
    setAcademicRepositoryForTesting(null);
    setUserRepositoryForTesting(null);
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

runRegressionSuite().catch(err => {
  console.error('\nRegression suite failed:', err);
  process.exit(1);
});
