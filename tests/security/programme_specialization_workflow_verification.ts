/**
 * ==============================================================================
 * ACADASSESS: DYNAMIC PROGRAMMES, SPECIALIZATIONS & FACULTY ASSIGNMENT VERIFICATION
 * ==============================================================================
 */

process.env.SMARTFA_TEST_MODE = 'true';
import jwt from 'jsonwebtoken';
import http from 'http';
import { randomUUID } from 'crypto';
import app from '../../apps/api/src/index.js';
import { getAcademicRepository } from '../../apps/api/src/storage/academicRepository.js';
import { getUserRepository } from '../../apps/api/src/storage/userRepository.js';
import { db } from '../../apps/api/src/storage/db.js';

console.log('================================================================');
console.log(' ACADASSESS: PROGRAMMES, SPECIALIZATIONS & FACULTY ASSIGNMENT ');
console.log('================================================================\n');

const DEV_JWT_SECRET = process.env.JWT_DEV_SECRET || 'smartfa-test-hmac-dev-secret-key-32chars';
const PORT = 4007;

let server: http.Server;
let passedTests = 0;
let totalTests = 0;

function assert(condition: boolean, message: string) {
  totalTests++;
  if (condition) {
    console.log(`  [PASS] Test ${totalTests}: ${message}`);
    passedTests++;
  } else {
    console.error(`  [FAIL] Test ${totalTests}: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
}

function createTestToken(userId: string, email: string = 'test@acadassess.edu', expiresIn: string = '1h'): string {
  return jwt.sign({ sub: userId, email }, DEV_JWT_SECRET, { expiresIn });
}

function makeRequest(
  method: string,
  urlPath: string,
  token?: string,
  body?: any
): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
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
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          let parsed: any;
          try {
            parsed = JSON.parse(data);
          } catch {
            parsed = data;
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

async function runTests() {
  const academicRepo = getAcademicRepository();
  const userRepo = getUserRepository();

  // Setup HOD, Faculty A, Faculty B, Student users
  const hodId = randomUUID();
  const hodEmail = `hod_test_${Date.now()}@acadassess.edu`;
  const facultyAId = randomUUID();
  const facultyAEmail = `faculty_a_${Date.now()}@acadassess.edu`;
  const facultyBId = randomUUID();
  const facultyBEmail = `faculty_b_${Date.now()}@acadassess.edu`;
  const studentId = randomUUID();
  const studentEmail = `student_${Date.now()}@acadassess.edu`;

  // Seed into in-memory mock if active
  db.profiles.push(
    {
      id: hodId,
      email: hodEmail,
      full_name: 'Dr. HOD MCA Verification',
      usn: null,
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: facultyAId,
      email: facultyAEmail,
      full_name: 'Prof. Alice Faculty',
      usn: null,
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: facultyBId,
      email: facultyBEmail,
      full_name: 'Prof. Bob Faculty',
      usn: null,
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: studentId,
      email: studentEmail,
      full_name: 'Charlie Student',
      usn: '1SJ22MC099',
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }
  );

  db.roles.push(
    {
      id: randomUUID(),
      user_id: hodId,
      role: 'hod',
      scope_id: null,
      active: true,
      created_at: new Date().toISOString()
    },
    {
      id: randomUUID(),
      user_id: facultyAId,
      role: 'subject_teacher',
      scope_id: null,
      active: true,
      created_at: new Date().toISOString()
    },
    {
      id: randomUUID(),
      user_id: facultyBId,
      role: 'subject_teacher',
      scope_id: null,
      active: true,
      created_at: new Date().toISOString()
    },
    {
      id: randomUUID(),
      user_id: studentId,
      role: 'student',
      scope_id: null,
      active: true,
      created_at: new Date().toISOString()
    }
  );

  const hodToken = createTestToken(hodId, hodEmail);
  const studentToken = createTestToken(studentId, studentEmail);

  console.log('[Phase 1] Test Programme Management');

  // Test 1: Create a Programme (e.g. MCA-NEW)
  const progCode = `MCA_${Math.floor(Math.random() * 900 + 100)}`;
  const createProgRes = await makeRequest('POST', '/api/v1/admin/hod/programmes', hodToken, {
    code: progCode,
    name: 'Master of Computer Applications Test',
    duration_years: 2,
    total_semesters: 4,
    status: 'active'
  });
  if (createProgRes.status !== 201) {
    console.error('createProgRes failed:', createProgRes.status, createProgRes.body);
  }
  assert(createProgRes.status === 201, 'HOD can create a new programme');
  const programmeId = createProgRes.body.programme.id;
  assert(createProgRes.body.programme.code === progCode, 'Programme code matches');

  // Test 2: Reject duplicate programme code
  const dupProgRes = await makeRequest('POST', '/api/v1/admin/hod/programmes', hodToken, {
    code: progCode,
    name: 'Duplicate MCA',
    duration_years: 2,
    total_semesters: 4
  });
  assert(dupProgRes.status === 409, 'Duplicate programme code is rejected with 409 Conflict');

  console.log('\n[Phase 2] Test Specializations under Programme');

  // Test 3: Add multiple specializations under the programme (e.g., CYBER and AIDS)
  const createSpec1Res = await makeRequest('POST', '/api/v1/admin/hod/specializations', hodToken, {
    programme_id: programmeId,
    code: 'CYBER',
    name: 'Cyber Security & Forensic Computing',
    applicable_semesters: [3, 4],
    active: true
  });
  assert(createSpec1Res.status === 201, 'HOD can add specialization CYBER to programme');
  const specCyberId = createSpec1Res.body.specialization.id;
  assert(createSpec1Res.body.specialization.applicable_semesters.includes(3), 'CYBER includes Sem 3');
  assert(createSpec1Res.body.specialization.applicable_semesters.includes(4), 'CYBER includes Sem 4');

  const createSpec2Res = await makeRequest('POST', '/api/v1/admin/hod/specializations', hodToken, {
    programme_id: programmeId,
    code: 'AIDS',
    name: 'Artificial Intelligence & Data Science',
    applicable_semesters: [3, 4],
    active: true
  });
  assert(createSpec2Res.status === 201, 'HOD can add specialization AIDS to programme');
  const specAidsId = createSpec2Res.body.specialization.id;

  // Test 4: Prevent duplicate specialization code within the same programme
  const dupSpecRes = await makeRequest('POST', '/api/v1/admin/hod/specializations', hodToken, {
    programme_id: programmeId,
    code: 'CYBER',
    name: 'Duplicate Cyber',
    applicable_semesters: [3]
  });
  assert(dupSpecRes.status === 409, 'Duplicate specialization code under same programme is rejected with 409');

  console.log('\n[Phase 3] Test Subjects under Specialization and Semester');

  // Test 5: Add subjects under CYBER Sem 3 and AIDS Sem 3
  const subCode1 = `CS_${Math.floor(Math.random() * 900 + 100)}`;
  const createSub1Res = await makeRequest('POST', `/api/v1/admin/hod/specializations/${specCyberId}/subjects`, hodToken, {
    code: subCode1,
    name: 'Advanced Ethical Hacking',
    semester: 3,
    credits: 4
  });
  assert(createSub1Res.status === 201, 'Added subject to CYBER specialization for Sem 3');
  const subCyberId = createSub1Res.body.subject.id;

  const subCode2 = `AI_${Math.floor(Math.random() * 900 + 100)}`;
  const createSub2Res = await makeRequest('POST', `/api/v1/admin/hod/specializations/${specAidsId}/subjects`, hodToken, {
    code: subCode2,
    name: 'Deep Learning & Neural Networks',
    semester: 3,
    credits: 4
  });
  assert(createSub2Res.status === 201, 'Added subject to AIDS specialization for Sem 3');
  const subAidsId = createSub2Res.body.subject.id;

  // Test 6: Verify subjects can be listed under specialization
  const listSpecSubsRes = await makeRequest('GET', `/api/v1/admin/hod/specializations/${specCyberId}/subjects`, hodToken);
  assert(listSpecSubsRes.status === 200, 'Can query subjects for CYBER specialization');
  assert(listSpecSubsRes.body.subjects.some((s: any) => s.id === subCyberId), 'CYBER subjects contains Advanced Ethical Hacking');

  console.log('\n[Phase 4] Test Faculty Multi-Subject & Multi-Specialization Assignment');

  // Test 7: Assign multiple subjects within one specialization to Faculty A
  const assignFacultyARes1 = await makeRequest('POST', `/api/v1/admin/hod/faculty/${facultyAId}/assign-subjects`, hodToken, {
    programme_id: programmeId,
    specialization_id: specCyberId,
    semester: 3,
    subject_ids: [subCyberId]
  });
  assert(assignFacultyARes1.status === 201 || assignFacultyARes1.status === 200, 'Assigned CYBER Sem 3 subject to Faculty A');

  // Test 8: Assign subject from another specialization (AIDS) to the same Faculty A
  const assignFacultyARes2 = await makeRequest('POST', `/api/v1/admin/hod/faculty/${facultyAId}/assign-subjects`, hodToken, {
    programme_id: programmeId,
    specialization_id: specAidsId,
    semester: 3,
    subject_ids: [subAidsId]
  });
  assert(assignFacultyARes2.status === 201 || assignFacultyARes2.status === 200, 'Assigned AIDS Sem 3 subject to same Faculty A across specializations');

  // Test 9: Verify Faculty A assignments include both CYBER and AIDS
  const getAssignmentsRes = await makeRequest('GET', `/api/v1/admin/hod/users/${facultyAId}/assignments`, hodToken);
  assert(getAssignmentsRes.status === 200, 'Can retrieve faculty assignments');
  const assignedSubs = getAssignmentsRes.body.class_subjects || [];
  assert(assignedSubs.some((a: any) => a.subject_id === subCyberId), 'Faculty A has CYBER subject assigned');
  assert(assignedSubs.some((a: any) => a.subject_id === subAidsId), 'Faculty A has AIDS subject assigned');

  // Test 10: Prevent duplicate assignment
  const dupAssignRes = await makeRequest('POST', `/api/v1/admin/hod/faculty/${facultyAId}/assign-subjects`, hodToken, {
    programme_id: programmeId,
    specialization_id: specCyberId,
    semester: 3,
    subject_ids: [subCyberId]
  });
  assert(
    (dupAssignRes.status === 201 || dupAssignRes.status === 200) && dupAssignRes.body.count === 0,
    'Duplicate assignment handled gracefully without duplicate rows'
  );

  console.log('\n[Phase 5] Test Validation & Authorization Safeguards');

  // Test 11: Reject assignment with invalid faculty ID
  const invalidFacultyRes = await makeRequest('POST', `/api/v1/admin/hod/faculty/${randomUUID()}/assign-subjects`, hodToken, {
    programme_id: programmeId,
    specialization_id: specCyberId,
    semester: 3,
    subject_ids: [subCyberId]
  });
  assert(invalidFacultyRes.status === 400, 'Rejects assignment to non-existent faculty');

  // Test 12: Block unauthorized assignment operations (e.g. Student token)
  const studentBlockedRes = await makeRequest('POST', `/api/v1/admin/hod/faculty/${facultyBId}/assign-subjects`, studentToken, {
    programme_id: programmeId,
    specialization_id: specCyberId,
    semester: 3,
    subject_ids: [subCyberId]
  });
  assert(studentBlockedRes.status === 403, 'Student cannot perform administrative faculty assignments');

  // Test 13: Block unauthenticated requests
  const unauthRes = await makeRequest('POST', `/api/v1/admin/hod/faculty/${facultyBId}/assign-subjects`, undefined, {
    subject_ids: [subCyberId]
  });
  assert(unauthRes.status === 401, 'Unauthenticated assignment request returns 401');

  console.log('\n[Phase 6] Verification of Academic Structure Persistence');

  // Test 14: Query programmes list and ensure metadata is correct
  const allProgsRes = await makeRequest('GET', '/api/v1/admin/hod/programmes', hodToken);
  assert(allProgsRes.status === 200, 'Can list all programmes');
  const fetchedProg = allProgsRes.body.programmes.find((p: any) => p.id === programmeId);
  assert(fetchedProg && fetchedProg.code === progCode, 'Programme persists in database/repository');

  // Test 15: Query specializations list and ensure parent programme relationship
  const allSpecsRes = await makeRequest('GET', `/api/v1/admin/hod/specializations?programme_id=${programmeId}`, hodToken);
  assert(allSpecsRes.status === 200, 'Can list specializations by programme');
  assert(allSpecsRes.body.specializations.length >= 2, 'Programme has both CYBER and AIDS specializations');

  console.log('\n================================================================');
  console.log(` ALL ${totalTests} TESTS PASSED SUCCESSFULLY! (${passedTests}/${totalTests})`);
  console.log('================================================================');
}

server = app.listen(PORT, async () => {
  try {
    await runTests();
    server.close(() => {
      process.exit(0);
    });
  } catch (err) {
    console.error('\nTest execution failed:', err);
    server.close(() => {
      process.exit(1);
    });
  }
});
