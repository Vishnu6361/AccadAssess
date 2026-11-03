/**
 * ==============================================================================
 * ACADASSESS: HOD FACULTY ACADEMIC & SUBJECT ALLOCATION LOGIC VERIFICATION SUITE
 * ==============================================================================
 * 
 * Verifies:
 * 1. Dependent Selection Flow: Subjects load only after Programme and Semester are provided.
 * 2. Specialization Filtering:
 *    - Core / All Specialization: returns only Core subjects (null specialization_id). CYBER and AI subjects excluded.
 *    - CYBER Specialization: returns CYBER subjects (and common), AI subjects NEVER present.
 *    - AI Specialization: returns AI subjects (and common), CYBER subjects NEVER present.
 * 3. Exclusion of Subjects Already Assigned to Another Faculty:
 *    - Active allocations (class_subjects.active = true) are excluded from available subjects list.
 * 4. Inactive Allocations do not block availability:
 *    - Inactive / revoked allocations (active = false) do not block subject availability.
 * 5. Different Semester Isolation:
 *    - Allocations in one semester do not block subjects in another semester.
 * 6. Backend Conflict Prevention:
 *    - POST /admin/hod/faculty/:id/assign-subjects returns HTTP 409 CLASS_SUBJECT_CONFLICT when subject is actively assigned.
 * 7. Specialization Mismatch Prevention:
 *    - Backend validates that specialization-specific subjects match the requested specialization.
 * 8. Accurate Count and UI Empty State Messages:
 *    - UI displays exact available count and "No unassigned subjects are available for this academic combination." when empty.
 * ==============================================================================
 */

process.env.SMARTFA_TEST_MODE = 'true';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import jwt from 'jsonwebtoken';
import app from '../../apps/api/src/index.js';
import { InMemoryUserRepository, setUserRepositoryForTesting } from '../../apps/api/src/storage/userRepository.js';
import { InMemoryAcademicRepository, setAcademicRepositoryForTesting } from '../../apps/api/src/storage/academicRepository.js';
import { InMemoryDatabase } from '../../apps/api/src/storage/db.js';

let server: http.Server;
const PORT = 4022;
const DEV_JWT_SECRET = process.env.JWT_DEV_SECRET || 'smartfa-test-hmac-dev-secret-key-32chars';

const HOD_ID = 'a1000000-0000-0000-0000-000000000001';
const TEACHER_1_ID = 'a2000000-0000-0000-0000-000000000001';
const TEACHER_2_ID = 'a2000000-0000-0000-0000-000000000002';

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
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          try {
            const parsed = data ? JSON.parse(data) : {};
            resolve({ status: res.statusCode || 500, body: parsed });
          } catch {
            resolve({ status: res.statusCode || 500, body: data });
          }
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

async function runTests() {
  console.log('--- STARTING HOD FACULTY ALLOCATION LOGIC VERIFICATION ---');

  // Initialize In-Memory database and repositories
  const testDb = new InMemoryDatabase();
  const userRepo = new InMemoryUserRepository(testDb);
  const academicRepo = new InMemoryAcademicRepository(testDb);

  setUserRepositoryForTesting(userRepo);
  setAcademicRepositoryForTesting(academicRepo);

  // Setup Profiles and Roles
  testDb.profiles = [
    {
      id: HOD_ID,
      email: 'hod@sjbit.edu.in',
      full_name: 'Dr. Academic HOD',
      status: 'active',
      department: 'Computer Applications',
      created_at: new Date().toISOString()
    },
    {
      id: TEACHER_1_ID,
      email: 'faculty.one@sjbit.edu.in',
      full_name: 'Prof. Faculty One',
      status: 'active',
      department: 'Computer Applications',
      created_at: new Date().toISOString()
    },
    {
      id: TEACHER_2_ID,
      email: 'faculty.two@sjbit.edu.in',
      full_name: 'Prof. Faculty Two',
      status: 'active',
      department: 'Computer Applications',
      created_at: new Date().toISOString()
    }
  ];

  testDb.userRoles = [
    { id: randomUUID(), user_id: HOD_ID, role: 'hod', active: true, created_at: new Date().toISOString() },
    { id: randomUUID(), user_id: TEACHER_1_ID, role: 'faculty', active: true, created_at: new Date().toISOString() },
    { id: randomUUID(), user_id: TEACHER_2_ID, role: 'faculty', active: true, created_at: new Date().toISOString() }
  ];

  // Setup Academic Structure: Programme, Specializations, Subjects, Class
  const progMCA = await academicRepo.createProgramme({
    id: randomUUID(),
    code: 'MCA',
    name: 'Master of Computer Applications',
    department: 'Computer Applications',
    duration_years: 2,
    total_semesters: 4,
    active: true
  });
  const progId = progMCA.id;

  const cyberSpec = await academicRepo.createSpecialization({
    id: randomUUID(),
    programme_id: progId,
    code: 'CYBER',
    name: 'Cyber Security',
    active: true
  });
  const cyberSpecId = cyberSpec.id;

  const aiSpec = await academicRepo.createSpecialization({
    id: randomUUID(),
    programme_id: progId,
    code: 'AI',
    name: 'Artificial Intelligence',
    active: true
  });
  const aiSpecId = aiSpec.id;

  // Create Sem 3 Subjects:
  // 1. Core Subject (specialization_id = null)
  const coreSubject = await academicRepo.createSubject({
    id: randomUUID(),
    code: 'MCA301',
    name: 'Cloud Computing & DevOps',
    programme_id: progId,
    specialization_id: null,
    semester: 3,
    credits: 4,
    active: true
  });
  const coreSubjectId = coreSubject.id;

  // 2. Cyber Subject (specialization_id = cyberSpecId)
  const cyberSubject = await academicRepo.createSubject({
    id: randomUUID(),
    code: 'MCA302-CY',
    name: 'Advanced Ethical Hacking',
    programme_id: progId,
    specialization_id: cyberSpecId,
    semester: 3,
    credits: 4,
    active: true
  });
  const cyberSubjectId = cyberSubject.id;

  // 3. AI Subject (specialization_id = aiSpecId)
  const aiSubject = await academicRepo.createSubject({
    id: randomUUID(),
    code: 'MCA303-AI',
    name: 'Deep Learning & Neural Networks',
    programme_id: progId,
    specialization_id: aiSpecId,
    semester: 3,
    credits: 4,
    active: true
  });
  const aiSubjectId = aiSubject.id;

  // 4. Sem 1 Core Subject (semester = 1)
  const sem1Subject = await academicRepo.createSubject({
    id: randomUUID(),
    code: 'MCA101',
    name: 'Computer Networks',
    programme_id: progId,
    specialization_id: null,
    semester: 1,
    credits: 4,
    active: true
  });
  const sem1SubjectId = sem1Subject.id;

  // Create Class for Sem 3
  await academicRepo.createClass({
    id: randomUUID(),
    programme_id: progId,
    specialization_id: null,
    academic_year: '2026-2027',
    semester: 3,
    section: 'A',
    class_teacher_id: null,
    active: true
  });

  // Start HTTP Server
  await new Promise<void>((resolve) => {
    server = app.listen(PORT, () => {
      console.log(`Test API running on port ${PORT}`);
      resolve();
    });
  });

  const hodToken = createToken(HOD_ID, 'hod@sjbit.edu.in');

  try {
    // --------------------------------------------------------------------------
    // Test 1: Dependent Selection Flow - Validation when required params are missing
    // --------------------------------------------------------------------------
    console.log('\n[Test 1] Dependent Selection Flow: Verify missing query params');
    const resMissingParams = await makeRequest(
      'GET',
      `/api/v1/admin/hod/faculty/${TEACHER_1_ID}/available-subjects`,
      hodToken
    );
    if (resMissingParams.status === 400) {
      console.log('✓ PASS: Request rejected with HTTP 400 when programme_id or semester missing');
    } else {
      throw new Error(`Expected 400 when missing params, got ${resMissingParams.status}`);
    }

    // --------------------------------------------------------------------------
    // Test 2: Specialization Filtering - Core / All Specialization
    // --------------------------------------------------------------------------
    console.log('\n[Test 2] Specialization Filtering: Core / All Specialization');
    const resCoreSubjects = await makeRequest(
      'GET',
      `/api/v1/admin/hod/faculty/${TEACHER_1_ID}/available-subjects?programme_id=${progId}&semester=3`,
      hodToken
    );
    if (resCoreSubjects.status !== 200) {
      throw new Error(`Expected 200 for core subjects, got ${resCoreSubjects.status}: ${JSON.stringify(resCoreSubjects.body)}`);
    }
    const coreSubjectsList = resCoreSubjects.body.subjects;
    const hasCore = coreSubjectsList.some((s: any) => s.id === coreSubjectId);
    const hasCyberInCore = coreSubjectsList.some((s: any) => s.id === cyberSubjectId);
    const hasAiInCore = coreSubjectsList.some((s: any) => s.id === aiSubjectId);

    if (hasCore && !hasCyberInCore && !hasAiInCore) {
      console.log(`✓ PASS: Core selection returns only core subject MCA301 (count: ${coreSubjectsList.length}). CYBER and AI subjects excluded.`);
    } else {
      throw new Error(`Specialization leak in Core! hasCore: ${hasCore}, hasCyber: ${hasCyberInCore}, hasAi: ${hasAiInCore}`);
    }

    // --------------------------------------------------------------------------
    // Test 3: Specialization Filtering - CYBER Specialization
    // --------------------------------------------------------------------------
    console.log('\n[Test 3] Specialization Filtering: CYBER Specialization');
    const resCyberSubjects = await makeRequest(
      'GET',
      `/api/v1/admin/hod/faculty/${TEACHER_1_ID}/available-subjects?programme_id=${progId}&specialization_id=${cyberSpecId}&semester=3`,
      hodToken
    );
    if (resCyberSubjects.status !== 200) {
      throw new Error(`Expected 200 for cyber subjects, got ${resCyberSubjects.status}`);
    }
    const cyberSubjectsList = resCyberSubjects.body.subjects;
    const hasCyberInCyber = cyberSubjectsList.some((s: any) => s.id === cyberSubjectId);
    const hasAiInCyber = cyberSubjectsList.some((s: any) => s.id === aiSubjectId);

    if (hasCyberInCyber && !hasAiInCyber) {
      console.log(`✓ PASS: CYBER selection includes CYBER subject MCA302-CY. AI subject MCA303-AI NEVER present.`);
    } else {
      throw new Error(`Specialization filtering failed for CYBER! hasCyber: ${hasCyberInCyber}, hasAi: ${hasAiInCyber}`);
    }

    // --------------------------------------------------------------------------
    // Test 4: Specialization Filtering - AI Specialization
    // --------------------------------------------------------------------------
    console.log('\n[Test 4] Specialization Filtering: AI Specialization');
    const resAiSubjects = await makeRequest(
      'GET',
      `/api/v1/admin/hod/faculty/${TEACHER_1_ID}/available-subjects?programme_id=${progId}&specialization_id=${aiSpecId}&semester=3`,
      hodToken
    );
    if (resAiSubjects.status !== 200) {
      throw new Error(`Expected 200 for AI subjects, got ${resAiSubjects.status}`);
    }
    const aiSubjectsList = resAiSubjects.body.subjects;
    const hasAiInAi = aiSubjectsList.some((s: any) => s.id === aiSubjectId);
    const hasCyberInAi = aiSubjectsList.some((s: any) => s.id === cyberSubjectId);

    if (hasAiInAi && !hasCyberInAi) {
      console.log(`✓ PASS: AI selection includes AI subject MCA303-AI. CYBER subject MCA302-CY NEVER present.`);
    } else {
      throw new Error(`Specialization filtering failed for AI! hasAi: ${hasAiInAi}, hasCyber: ${hasCyberInAi}`);
    }

    // --------------------------------------------------------------------------
    // Test 5: Allocation of Core Subject to Teacher 1 & Exclusion from Teacher 2
    // --------------------------------------------------------------------------
    console.log('\n[Test 5] Exclusion of subjects allocated to another active faculty');
    const assignRes = await makeRequest(
      'POST',
      `/api/v1/admin/hod/faculty/${TEACHER_1_ID}/assign-subjects`,
      hodToken,
      {
        programme_id: progId,
        specialization_id: null,
        semester: 3,
        subject_ids: [coreSubjectId]
      }
    );
    if (assignRes.status !== 200 && assignRes.status !== 201) {
      throw new Error(`Failed to assign subject to Teacher 1: ${JSON.stringify(assignRes.body)}`);
    }
    console.log('✓ Successfully assigned MCA301 to Teacher 1');

    // Now query available subjects for Teacher 2 for Core Sem 3
    const resTeacher2Available = await makeRequest(
      'GET',
      `/api/v1/admin/hod/faculty/${TEACHER_2_ID}/available-subjects?programme_id=${progId}&semester=3`,
      hodToken
    );
    if (resTeacher2Available.status !== 200) {
      throw new Error(`Failed to get available subjects for Teacher 2: ${resTeacher2Available.status}`);
    }
    const teacher2Available = resTeacher2Available.body.subjects;
    const teacher2HasCore = teacher2Available.some((s: any) => s.id === coreSubjectId);

    if (!teacher2HasCore) {
      console.log(`✓ PASS: Core subject MCA301 is excluded from Teacher 2 available subjects (available count: ${teacher2Available.length})`);
    } else {
      throw new Error(`MCA301 is still visible to Teacher 2 despite being actively allocated to Teacher 1!`);
    }

    // --------------------------------------------------------------------------
    // Test 6: Backend Conflict Prevention - Teacher 2 attempts to allocate MCA301
    // --------------------------------------------------------------------------
    console.log('\n[Test 6] Backend Conflict Prevention: Prevent duplicate active allocation (HTTP 409)');
    const conflictRes = await makeRequest(
      'POST',
      `/api/v1/admin/hod/faculty/${TEACHER_2_ID}/assign-subjects`,
      hodToken,
      {
        programme_id: progId,
        specialization_id: null,
        semester: 3,
        subject_ids: [coreSubjectId]
      }
    );
    if (conflictRes.status === 409) {
      console.log(`✓ PASS: Backend returned HTTP 409 CLASS_SUBJECT_CONFLICT: "${conflictRes.body.error?.message || conflictRes.body.error}"`);
    } else {
      throw new Error(`Expected HTTP 409 on duplicate allocation, got ${conflictRes.status}: ${JSON.stringify(conflictRes.body)}`);
    }

    // --------------------------------------------------------------------------
    // Test 7: Specialization Mismatch Validation
    // --------------------------------------------------------------------------
    console.log('\n[Test 7] Backend Validation: Prevent specialization mismatch');
    const mismatchRes = await makeRequest(
      'POST',
      `/api/v1/admin/hod/faculty/${TEACHER_2_ID}/assign-subjects`,
      hodToken,
      {
        programme_id: progId,
        specialization_id: null,
        semester: 3,
        subject_ids: [cyberSubjectId]
      }
    );
    if (mismatchRes.status === 400) {
      console.log(`✓ PASS: Backend rejected specialization mismatch with HTTP 400: "${mismatchRes.body.error?.message || mismatchRes.body.error}"`);
    } else {
      throw new Error(`Expected HTTP 400 on specialization mismatch, got ${mismatchRes.status}`);
    }

    // --------------------------------------------------------------------------
    // Test 8: Different Semester Isolation
    // --------------------------------------------------------------------------
    console.log('\n[Test 8] Different Semester Isolation: Sem 1 subjects remain available');
    const sem1Res = await makeRequest(
      'GET',
      `/api/v1/admin/hod/faculty/${TEACHER_2_ID}/available-subjects?programme_id=${progId}&semester=1`,
      hodToken
    );
    if (sem1Res.status !== 200) {
      throw new Error(`Failed to query Sem 1 subjects: ${sem1Res.status}`);
    }
    const sem1Available = sem1Res.body.subjects;
    const hasSem1 = sem1Available.some((s: any) => s.id === sem1SubjectId);
    if (hasSem1) {
      console.log(`✓ PASS: Sem 1 subject MCA101 remains available regardless of Sem 3 allocations.`);
    } else {
      throw new Error(`Sem 1 subject was unexpectedly missing!`);
    }

    // --------------------------------------------------------------------------
    // Test 9: Inactive Allocations do not block availability
    // --------------------------------------------------------------------------
    console.log('\n[Test 9] Inactive Allocations: Inactive or unassigned allocations restore availability');
    const dbCs = testDb.classSubjects.find((cs) => cs.subject_id === coreSubjectId);
    if (!dbCs) {
      throw new Error('Target assignment not found in testDb.classSubjects');
    }
    
    // Set active = false in DB to test inactive allocation handling
    dbCs.active = false;

    // Now Teacher 2 queries available subjects again
    const resAfterRevoke = await makeRequest(
      'GET',
      `/api/v1/admin/hod/faculty/${TEACHER_2_ID}/available-subjects?programme_id=${progId}&semester=3`,
      hodToken
    );
    const teacher2AvailableAfterRevoke = resAfterRevoke.body.subjects;
    const teacher2HasCoreNow = teacher2AvailableAfterRevoke.some((s: any) => s.id === coreSubjectId);

    if (teacher2HasCoreNow) {
      console.log('✓ PASS: Inactive allocation (active = false) does not block subject availability.');
    } else {
      throw new Error('Revoked/inactive subject failed to reappear in available subjects list!');
    }

    // Also test unassign via DELETE /api/v1/admin/hod/class-subjects/:id
    const deleteRes = await makeRequest(
      'DELETE',
      `/api/v1/admin/hod/class-subjects/${dbCs.id}`,
      hodToken
    );
    if (deleteRes.status === 200) {
      console.log('✓ PASS: DELETE /class-subjects/:id successfully unassigns and removes class-subject allocation.');
    } else {
      throw new Error(`Failed to unassign class-subject via DELETE: ${deleteRes.status}`);
    }

    // --------------------------------------------------------------------------
    // Test 10: Frontend UI Contract Verification
    // --------------------------------------------------------------------------
    console.log('\n[Test 10] Frontend UI Code Verification: UserManagement.tsx');
    const userManagementPath = path.resolve(process.cwd(), 'apps/web/src/features/hod/UserManagement.tsx');
    const uiCode = fs.readFileSync(userManagementPath, 'utf-8');

    // Check dependent selection flow comments / steps
    if (!uiCode.includes('Step 1, Step 2 & Step 3') || !uiCode.includes('Step 4: Available Subjects Selection')) {
      throw new Error('Missing Step 1, Step 2, Step 3, Step 4 structure in UserManagement.tsx');
    }
    console.log('✓ UI contains Step 1 (Programme), Step 2 (Specialization), Step 3 (Semester), Step 4 (Available Subjects) structure');

    // Check empty state / prompt message
    if (!uiCode.includes('Select Programme, Specialization, and Semester above to display available subjects.')) {
      throw new Error('Missing initial prompt in UserManagement.tsx');
    }
    console.log('✓ UI displays initial prompt when selections are incomplete');

    // Check zero available subjects message
    if (!uiCode.includes('No unassigned subjects are available for this academic combination.')) {
      throw new Error('Missing "No unassigned subjects are available" message in UserManagement.tsx');
    }
    console.log('✓ UI displays "No unassigned subjects are available for this academic combination." when count is 0');

    // Check available count display
    if (!uiCode.includes('{availableSubjects.length} available')) {
      throw new Error('Missing available subjects count display in UserManagement.tsx');
    }
    console.log('✓ UI shows exact count of available subjects: ({availableSubjects.length} available)');

    console.log('\n======================================================');
    console.log('ALL HOD FACULTY ALLOCATION LOGIC VERIFICATION CHECKS PASSED');
    console.log('======================================================\n');
  } finally {
    server.close();
  }
}

runTests().catch((err) => {
  console.error('\n❌ VERIFICATION TEST FAILED:', err);
  if (server) {
    server.close();
  }
  process.exit(1);
});
