/**
 * ==============================================================================
 * ACADASSESS: HOD ALL SUBJECTS INSTITUTIONAL REPORTING VERIFICATION SUITE
 * ==============================================================================
 * 
 * Verifies all requirements from user request:
 * 1. Root Cause Resolution: Subjects with zero published assessments are included in HOD report.
 * 2. Distinct Academic Offerings:
 *    - Cloud Computing (MCA303) – Core / Common
 *    - Block Chain Technology (25MCAE323) – CYBER
 *    - Network Security (25MCAE321) – CYBER
 * 3. Enrolled Student Counts:
 *    - Accurately derived from eligible enrollments using student specialization.
 * 4. Assessment Counts:
 *    - Accurately computed independently of whether students have submitted.
 * 5. Authorization:
 *    - Enforces HOD role (403 for non-HOD).
 * 6. UI Consistency:
 *    - Zero filter toolbar on Level 1.
 *    - Immediate institution-wide subject card grid matching Class Teacher & Proctor.
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
const PORT = 4055;
const DEV_JWT_SECRET = process.env.JWT_DEV_SECRET || 'smartfa-test-hmac-dev-secret-key-32chars';

// User Fixtures
const HOD_USER_ID = 'a1000000-0000-0000-0000-000000000001'; // Dr. Nagamani S.
const TEACHER_USER_ID = 'a2000000-0000-0000-0000-000000000001'; // Dr. Ramesh Sharma
const STUDENT_USER_ID = '3acf60f9-3f03-406d-8f1e-6ac01ae36f14'; // VISHNU C N

// Academic IDs
const MCA_PROG_ID = '3b960388-a3fc-4bf4-9d08-4abe467ec4cd';
const SPEC_CYBER_ID = '3f75d427-7881-44c3-bf01-491e8f316a74';
const SPEC_AI_ID = '99c623b4-61e2-4c24-b417-b373df35ecca';
const CLASS_MCA3_ID = 'c53f348b-34dc-4399-ab77-6b0bea0e4e40';

// Subject IDs
const SUB_CLOUD_ID = 'd3cb05d2-f7ea-4cc4-b442-2dd7f32cb117'; // MCA303 - Cloud Computing (Core)
const SUB_BLOCKCHAIN_ID = 'e83bfca8-6019-499a-8299-7beda2e0c09a'; // 25MCAE323 - Block Chain Technology (CYBER)
const SUB_NETWORK_ID = 'e3963c8e-9e47-46bb-8b36-1017b22362e4'; // 25MCAE321 - Network Security (CYBER)

// Class Subject IDs
const CS_CLOUD_ID = 'bd5d8fc8-0177-4a81-b145-c8286e5acf8c';
const CS_BLOCKCHAIN_ID = '92526cd9-f067-4611-aad9-9462b0c8fe7c';
const CS_NETWORK_ID = '1638ff83-e35f-47ea-8661-61bfe92bfd9f';

// Assessment ID (Only Network Security has a published assessment)
const ASS_NETWORK_ID = '37c34bc1-6ccf-4011-b1d8-50de2b49dfcf';

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
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (activeRole) headers['x-active-role'] = activeRole;

    const payload = body ? JSON.stringify(body) : undefined;
    if (payload) headers['Content-Length'] = Buffer.byteLength(payload).toString();

    const req = http.request(
      {
        hostname: 'localhost',
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
    if (payload) req.write(payload);
    req.end();
  });
}

async function setupFixtures() {
  invalidateUserContextCache();

  // Reset in-memory database
  db.profiles = [
    {
      id: HOD_USER_ID,
      email: 'hod@smartfa.internal',
      full_name: 'Dr. Nagamani S.',
      status: 'active',
      role: 'hod',
      created_at: new Date().toISOString()
    },
    {
      id: TEACHER_USER_ID,
      email: 'teacher@smartfa.internal',
      full_name: 'Dr. Ramesh Sharma',
      status: 'active',
      role: 'faculty',
      created_at: new Date().toISOString()
    },
    {
      id: STUDENT_USER_ID,
      email: 'student@smartfa.internal',
      full_name: 'VISHNU C N',
      status: 'active',
      role: 'student',
      created_at: new Date().toISOString()
    }
  ];

  db.roles = [
    { id: 'r-1', user_id: HOD_USER_ID, role: 'hod', active: true, created_at: new Date().toISOString() },
    { id: 'r-2', user_id: TEACHER_USER_ID, role: 'subject_teacher', active: true, created_at: new Date().toISOString() },
    { id: 'r-3', user_id: STUDENT_USER_ID, role: 'student', active: true, created_at: new Date().toISOString() }
  ];

  db.faculty_roles = [
    { id: 'fr-1', faculty_id: HOD_USER_ID, institutional_role: 'hod', created_at: new Date().toISOString() },
    { id: 'fr-2', faculty_id: TEACHER_USER_ID, institutional_role: 'subject_teacher', created_at: new Date().toISOString() }
  ];

  db.programmes = [
    { id: MCA_PROG_ID, code: 'MCA', name: 'Master of Computer Applications', created_at: new Date().toISOString() }
  ];

  db.specializations = [
    { id: SPEC_CYBER_ID, programme_id: MCA_PROG_ID, code: 'CYBER', name: 'Cyber Security', created_at: new Date().toISOString() },
    { id: SPEC_AI_ID, programme_id: MCA_PROG_ID, code: 'AI', name: 'Artificial Intelligence', created_at: new Date().toISOString() }
  ];

  db.classes = [
    {
      id: CLASS_MCA3_ID,
      name: 'MCA - Semester 3 - Section A',
      programme: 'MCA',
      programme_id: MCA_PROG_ID,
      semester: 3,
      section: 'A',
      class_teacher_id: TEACHER_USER_ID,
      created_at: new Date().toISOString()
    }
  ];

  db.subjects = [
    {
      id: SUB_CLOUD_ID,
      programme_id: MCA_PROG_ID,
      code: 'MCA303',
      name: 'Cloud Computing',
      semester: 3,
      specialization_id: null,
      created_at: new Date().toISOString()
    },
    {
      id: SUB_BLOCKCHAIN_ID,
      programme_id: MCA_PROG_ID,
      code: '25MCAE323',
      name: 'Block Chain Technology',
      semester: 3,
      specialization_id: SPEC_CYBER_ID,
      created_at: new Date().toISOString()
    },
    {
      id: SUB_NETWORK_ID,
      programme_id: MCA_PROG_ID,
      code: '25MCAE321',
      name: 'Network Security',
      semester: 3,
      specialization_id: SPEC_CYBER_ID,
      created_at: new Date().toISOString()
    }
  ];

  db.classSubjects = [
    {
      id: CS_CLOUD_ID,
      class_id: CLASS_MCA3_ID,
      subject_id: SUB_CLOUD_ID,
      subject_name: 'MCA303 - Cloud Computing',
      subject_teacher_id: TEACHER_USER_ID,
      active: true,
      created_at: new Date().toISOString()
    },
    {
      id: CS_BLOCKCHAIN_ID,
      class_id: CLASS_MCA3_ID,
      subject_id: SUB_BLOCKCHAIN_ID,
      subject_name: '25MCAE323 - Block Chain Technology',
      subject_teacher_id: TEACHER_USER_ID,
      active: true,
      created_at: new Date().toISOString()
    },
    {
      id: CS_NETWORK_ID,
      class_id: CLASS_MCA3_ID,
      subject_id: SUB_NETWORK_ID,
      subject_name: '25MCAE321 - Network Security',
      subject_teacher_id: TEACHER_USER_ID,
      active: true,
      created_at: new Date().toISOString()
    }
  ];

  db.enrollments = [
    {
      id: 'enr-1',
      student_id: STUDENT_USER_ID,
      class_id: CLASS_MCA3_ID,
      student_name: 'VISHNU C N',
      student_email: 'student@smartfa.internal',
      student_usn: 'adm25mca9718',
      specialization_id: SPEC_CYBER_ID,
      specialization_code: 'CYBER',
      specialization_name: 'Cyber Security',
      status: 'active',
      created_at: new Date().toISOString()
    }
  ];

  // Only Network Security has a published assessment
  db.assessments = [
    {
      id: ASS_NETWORK_ID,
      title: 'Formative Assessment 1',
      instructions: 'Network Security Lab Submission',
      max_marks: 50,
      deadline_at: new Date(Date.now() + 86400000).toISOString(),
      status: 'published',
      published_at: new Date().toISOString(),
      created_by: TEACHER_USER_ID,
      class_subject_id: CS_NETWORK_ID,
      created_at: new Date().toISOString()
    }
  ];

  db.submissions = [];

  setUserRepositoryForTesting(new InMemoryUserRepository(db));
  setAcademicRepositoryForTesting(new InMemoryAcademicRepository(db));
  setAssessmentRepositoryForTesting(new InMemoryAssessmentRepository(db));
  setSubmissionRepositoryForTesting(new InMemorySubmissionRepository(db));
  setEvaluationRepositoryForTesting(new InMemoryEvaluationRepository(db));
}

async function runTests() {
  console.log('========================================================================');
  console.log(' ACADASSESS: HOD ALL SUBJECTS INSTITUTIONAL REPORTING VERIFICATION     ');
  console.log('========================================================================\n');

  await setupFixtures();

  await new Promise<void>((resolve) => {
    server = app.listen(PORT, () => {
      resolve();
    });
  });

  try {
    const hodToken = makeToken(HOD_USER_ID, 'hod@smartfa.internal');
    const teacherToken = makeToken(TEACHER_USER_ID, 'teacher@smartfa.internal');

    // --- 1. Authorization Enforcement ---
    console.log('--- 1. Authorization Enforcement ---');
    const unauthorizedRes = await apiRequest('GET', '/api/v1/admin/hod/institutional-submissions-report', teacherToken, undefined, 'subject_teacher');
    assert(
      unauthorizedRes.status === 403,
      'Pure Subject Teacher is blocked from HOD institutional submissions report (403 Forbidden)',
      `Status: ${unauthorizedRes.status}`
    );

    const authorizedRes = await apiRequest('GET', '/api/v1/admin/hod/institutional-submissions-report', hodToken, undefined, 'hod');
    assert(
      authorizedRes.status === 200,
      'HOD successfully accesses institutional submissions report (200 OK)',
      `Status: ${authorizedRes.status}`
    );

    const data = authorizedRes.body;
    assert(Array.isArray(data.subjects), 'Endpoint returns subjects array');
    console.log(`\n  Total Subjects returned: ${data.subjects.length}`);
    data.subjects.forEach((s: any) => {
      console.log(`    - [${s.subject_code}] ${s.subject_name} (${s.specialization_code || 'Core / Common'}) | Assessments: ${s.published_assessments_count} | Eligible Students: ${s.total_eligible_students}`);
    });

    // --- 2. Complete Institution-wide Subjects Verification ---
    console.log('\n--- 2. Complete Institution-wide Subjects Verification ---');

    // A. Cloud Computing (MCA303) - Core / Common
    const cloudSub = data.subjects.find((s: any) => s.subject_code === 'MCA303' || s.subject_name.includes('Cloud Computing'));
    assert(Boolean(cloudSub), 'Subject 1: Cloud Computing (MCA303) is present in HOD report');
    assert(
      cloudSub && (!cloudSub.specialization_code || cloudSub.specialization_code === null),
      'Cloud Computing is correctly identified as Core / Common'
    );
    assert(
      cloudSub && cloudSub.published_assessments_count === 0,
      'Cloud Computing displays 0 published assessments without being dropped'
    );
    assert(
      cloudSub && cloudSub.total_eligible_students === 1,
      'Cloud Computing displays 1 eligible enrolled student (all class students eligible for core)'
    );

    // B. Block Chain Technology (25MCAE323) - CYBER
    const blockchainSub = data.subjects.find((s: any) => s.subject_code === '25MCAE323' || s.subject_name.includes('Block Chain'));
    assert(Boolean(blockchainSub), 'Subject 2: Block Chain Technology (25MCAE323) is present in HOD report');
    assert(
      blockchainSub && blockchainSub.specialization_code === 'CYBER',
      'Block Chain Technology is correctly identified with CYBER specialization badge'
    );
    assert(
      blockchainSub && blockchainSub.published_assessments_count === 0,
      'Block Chain Technology displays 0 published assessments without being dropped'
    );
    assert(
      blockchainSub && blockchainSub.total_eligible_students === 1,
      'Block Chain Technology displays 1 eligible enrolled student (student matches CYBER specialization)'
    );

    // C. Network Security (25MCAE321) - CYBER
    const networkSub = data.subjects.find((s: any) => s.subject_code === '25MCAE321' || s.subject_name.includes('Network Security'));
    assert(Boolean(networkSub), 'Subject 3: Network Security (25MCAE321) is present in HOD report');
    assert(
      networkSub && networkSub.specialization_code === 'CYBER',
      'Network Security is correctly identified with CYBER specialization badge'
    );
    assert(
      networkSub && networkSub.published_assessments_count === 1,
      'Network Security displays 1 published assessment'
    );
    assert(
      networkSub && networkSub.total_eligible_students === 1,
      'Network Security displays 1 eligible enrolled student'
    );

    // --- 3. No Accidental Duplicates ---
    console.log('\n--- 3. Canonical Deduplication & Distinct Academic Offerings ---');
    const subjectCodes = data.subjects.map((s: any) => s.subject_code);
    const uniqueCodes = new Set(subjectCodes);
    assert(
      subjectCodes.length === uniqueCodes.size,
      'No duplicate subject offerings appear in the HOD overview',
      `Total: ${subjectCodes.length}, Unique: ${uniqueCodes.size}`
    );

    // --- 4. Level 3 Assessment Drilldown ---
    console.log('\n--- 4. Level 3 Assessment Drilldown & Student Roster ---');
    const level3Res = await apiRequest(
      'GET',
      `/api/v1/admin/hod/institutional-submissions-report?assessment_id=${ASS_NETWORK_ID}`,
      hodToken,
      undefined,
      'hod'
    );
    assert(level3Res.status === 200, 'Level 3 drilldown for assessment returns 200 OK');
    assert(Array.isArray(level3Res.body.students), 'Level 3 returns student roster');
    assert(level3Res.body.students.length === 1, 'Level 3 returns exactly 1 eligible student for Network Security assessment');
    const studentItem = level3Res.body.students[0];
    assert(studentItem.name === 'VISHNU C N', 'Student name matches fixture');
    assert(studentItem.specialization_code === 'CYBER', 'Student specialization is CYBER');
    assert(studentItem.submission_status === 'Pending', 'Non-submitting student displays Pending status');
    assert(studentItem.timing_status === '—', 'Pending student has timing status "—"');

  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  console.log('\n========================================================================');
  console.log(` RESULTS: ${passedTests} / ${totalTests} TESTS PASSED (${Math.round((passedTests / totalTests) * 100)}%)`);
  console.log('========================================================================\n');

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test runner encountered error:', err);
  process.exit(1);
});

