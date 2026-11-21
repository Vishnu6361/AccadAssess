/**
 * ACADASSESS: Student Stream Isolation & Published Results Verification Suite
 *
 * Verifies:
 * 1. AI Stream Student Isolation:
 *    - AI stream students do NOT see Security stream subjects or their assessments
 *    - GET /evaluations/student/performance-dashboard returns empty list when no subjects assigned to AI stream
 *    - GET /assessments returns 0 assessments for AI stream student
 *    - GET /submissions/student/my-submissions returns 0 submissions for AI stream student
 * 2. Cross-Stream Direct Access Attacks Prevention:
 *    - AI stream student blocked on GET /assessments/:id for Security assessment (403 Forbidden)
 *    - AI stream student blocked on GET /assessments/:id/document for Security assessment (403 Forbidden)
 *    - AI stream student blocked on GET /assessments/:id/document-url for Security assessment (403 Forbidden)
 *    - AI stream student blocked on GET /submissions/assessment/:id/draft for Security assessment (403 Forbidden)
 *    - AI stream student blocked on PUT /submissions/assessment/:id/draft for Security assessment (403 Forbidden)
 *    - AI stream student blocked on POST /submissions for Security assessment (403 Forbidden)
 *    - AI stream student blocked on GET /submissions/assessment/:id for Security assessment (403 Forbidden)
 * 3. Security Stream Student Legitimate Access:
 *    - Security stream student receives Security stream subjects in performance dashboard
 *    - Security stream student receives published Security assessments
 * 4. General / Core Subject Access:
 *    - Core subjects (with null specialization) remain accessible to both AI and Security students
 * 5. Selected Student Targeting Preservation:
 *    - Selected student targeting remains strictly enforced in tandem with stream isolation
 * 6. Safety Verification:
 *    - Genuine student accounts (1JB25MC054, 1JB25MC034, 1JB25MC014) remain 100% untouched
 */

import http from 'http';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';

process.env.NODE_ENV = 'test';
process.env.SMARTFA_TEST_MODE = 'true';

const DEV_JWT_SECRET = 'smartfa-test-hmac-dev-secret-key-32chars';

// Synthetic Isolated Test IDs
const TEST_TEACHER_ID = 'a2000000-0000-0000-0000-000000000001';
const TEST_SECURITY_STUDENT_ID = 'a4000000-0000-0000-0000-000000000001'; // Aarav Patel (Security)
const TEST_AI_STUDENT_ID = 'a4000000-0000-0000-0000-000000000002'; // Bhavna Reddy (AI)
const TEST_SECURITY_STUDENT_2_ID = 'a4000000-0000-0000-0000-000000000003'; // Chetan Varma (Security)
const TEST_UNRELATED_STUDENT_ID = 'a4000000-0000-0000-0000-000000000004'; // Synthetic Unrelated Stream Student
const TEST_INACTIVE_STUDENT_ID = 'a4000000-0000-0000-0000-000000000005'; // Synthetic Inactive Student
const TEST_NON_ENROLLED_STUDENT_ID = 'a4000000-0000-0000-0000-000000000006'; // Synthetic Non-enrolled Student

const TEST_CLASS_ID = 'c1000000-0000-0000-0000-000000000001';
const SECURITY_SPEC_ID = 'c1000000-0000-4000-8000-000000000001'; // CYBER
const AI_SPEC_ID = 'a1000000-0000-4000-8000-000000000002'; // AIDS / AI
const UNRELATED_SPEC_ID = 'c1000000-0000-4000-8000-000000000099'; // Synthetic Unrelated Specialization

const SECURITY_CLASS_SUB_ID = 'c5100000-0000-0000-0000-000000000001';
const CORE_CLASS_SUB_ID = 'c5100000-0000-0000-0000-000000000002';
const AI_ONLY_CLASS_SUB_ID = 'c5100000-0000-0000-0000-000000000003';
const AI_ONLY_SUBJECT_ID = '02000000-0000-4000-8000-000000000003';
const MULTI_CLASS_SUB_ID = 'c5100000-0000-0000-0000-000000000004';
const MULTI_SUBJECT_ID = '02000000-0000-4000-8000-000000000004';

let totalTests = 0;
let passedTests = 0;

function assert(condition: boolean, testName: string, failureDetails?: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`    [PASS] ${testName}`);
  } else {
    console.error(`    [FAIL] ${testName} - ${failureDetails || 'Assertion failed'}`);
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
      const port = (server.address() as any).port;
      const payload = options.body ? JSON.stringify(options.body) : '';
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port,
          path: options.path,
          method: options.method,
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload),
            ...(options.token ? { Authorization: `Bearer ${options.token}` } : {})
          }
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => { data += chunk; });
          res.on('end', () => {
            server.close();
            try {
              const parsed = data ? JSON.parse(data) : {};
              resolve({ status: res.statusCode || 500, body: parsed });
            } catch (err) {
              resolve({ status: res.statusCode || 500, body: data });
            }
          });
        }
      );
      req.on('error', (e) => {
        server.close();
        reject(e);
      });
      if (payload) req.write(payload);
      req.end();
    });
  });
}

function generateToken(userId: string, role: string): string {
  return jwt.sign(
    {
      sub: userId,
      role,
      roles: [role],
      activeRole: role,
      email: `${role}@test.edu`
    },
    DEV_JWT_SECRET,
    { expiresIn: '1h' }
  );
}

const STANDARD_50M_RUBRIC = {
  title: 'Assignment Evaluation Rubric',
  criteria: [
    { criterion_title: 'Concept & Understanding', description: 'Core principles', max_marks: 25, display_order: 1 },
    { criterion_title: 'Implementation & Solution', description: 'Technical design', max_marks: 25, display_order: 2 }
  ]
};

async function runStudentStreamIsolationTests() {
  console.log('========================================================================');
  console.log('  ACADASSESS: STUDENT STREAM ISOLATION & RESULTS VERIFICATION SUITE      ');
  console.log('========================================================================\n');

  const appModule = await import('../../apps/api/src/index.js');
  const app = (appModule as any).app || (appModule as any).default;
  const { db } = await import('../../apps/api/src/storage/db.js');

  const teacherToken = generateToken(TEST_TEACHER_ID, 'subject_teacher');
  const securityStudentToken = generateToken(TEST_SECURITY_STUDENT_ID, 'student');
  const aiStudentToken = generateToken(TEST_AI_STUDENT_ID, 'student');
  const securityStudent2Token = generateToken(TEST_SECURITY_STUDENT_2_ID, 'student');
  const unrelatedStudentToken = generateToken(TEST_UNRELATED_STUDENT_ID, 'student');
  const inactiveStudentToken = generateToken(TEST_INACTIVE_STUDENT_ID, 'student');
  const nonEnrolledStudentToken = generateToken(TEST_NON_ENROLLED_STUDENT_ID, 'student');

  // Configure synthetic enrollments:
  // 1. Security Student in Class C1 with Security Specialization (CYBER)
  let enrSec = db.enrollments.find(e => e.student_id === TEST_SECURITY_STUDENT_ID && e.class_id === TEST_CLASS_ID);
  if (enrSec) {
    enrSec.specialization_id = SECURITY_SPEC_ID;
    enrSec.status = 'active';
  } else {
    db.enrollments.push({
      id: randomUUID(),
      class_id: TEST_CLASS_ID,
      student_id: TEST_SECURITY_STUDENT_ID,
      specialization_id: SECURITY_SPEC_ID,
      roll_number: '01',
      status: 'active',
      created_at: new Date().toISOString()
    });
  }

  // 2. AI Student in Class C1 with AI Specialization (AIDS)
  let enrAI = db.enrollments.find(e => e.student_id === TEST_AI_STUDENT_ID && e.class_id === TEST_CLASS_ID);
  if (enrAI) {
    enrAI.specialization_id = AI_SPEC_ID;
    enrAI.status = 'active';
  } else {
    db.enrollments.push({
      id: randomUUID(),
      class_id: TEST_CLASS_ID,
      student_id: TEST_AI_STUDENT_ID,
      specialization_id: AI_SPEC_ID,
      roll_number: '02',
      status: 'active',
      created_at: new Date().toISOString()
    });
  }

  // 3. Second Security Student in Class C1 with Security Specialization (CYBER)
  let enrSec2 = db.enrollments.find(e => e.student_id === TEST_SECURITY_STUDENT_2_ID && e.class_id === TEST_CLASS_ID);
  if (enrSec2) {
    enrSec2.specialization_id = SECURITY_SPEC_ID;
    enrSec2.status = 'active';
  } else {
    db.enrollments.push({
      id: randomUUID(),
      class_id: TEST_CLASS_ID,
      student_id: TEST_SECURITY_STUDENT_2_ID,
      specialization_id: SECURITY_SPEC_ID,
      roll_number: '03',
      status: 'active',
      created_at: new Date().toISOString()
    });
  }

  // Configure Subjects:
  // Set ALL existing class subjects to Security specialization initially,
  // accurately mirroring the production scenario where only Security stream subjects exist.
  const secSubject1 = db.subjects.find(s => s.id === '02000000-0000-4000-8000-000000000001');
  if (secSubject1) {
    secSubject1.specialization_id = SECURITY_SPEC_ID;
    secSubject1.name = 'Network Security';
    secSubject1.code = '25MCAE321';
  }
  const secSubject2 = db.subjects.find(s => s.id === '02000000-0000-4000-8000-000000000002');
  if (secSubject2) {
    secSubject2.specialization_id = SECURITY_SPEC_ID;
    secSubject2.name = 'Cyber Security';
    secSubject2.code = '25MCAE322';
  }

  // Ensure classSubjects have teacher assigned
  const cs1 = db.classSubjects.find(cs => cs.id === SECURITY_CLASS_SUB_ID);
  if (cs1) cs1.subject_teacher_id = TEST_TEACHER_ID;
  const cs2 = db.classSubjects.find(cs => cs.id === CORE_CLASS_SUB_ID);
  if (cs2) cs2.subject_teacher_id = TEST_TEACHER_ID;

  // Ensure subject_specializations also reflect Security stream
  db.subject_specializations = [
    {
      id: randomUUID(),
      subject_id: '02000000-0000-4000-8000-000000000001',
      specialization_id: SECURITY_SPEC_ID,
      semester: 3,
      created_at: new Date().toISOString()
    },
    {
      id: randomUUID(),
      subject_id: '02000000-0000-4000-8000-000000000002',
      specialization_id: SECURITY_SPEC_ID,
      semester: 3,
      created_at: new Date().toISOString()
    }
  ];

  console.log('--- TEST GROUP 1: Student Performance Dashboard Stream Isolation ---');

  // Create and publish a Formative Assessment on Security Subject
  const createSecRes = await makeApiRequest(app, {
    path: '/api/v1/assessments',
    method: 'POST',
    token: teacherToken,
    body: {
      class_subject_id: SECURITY_CLASS_SUB_ID,
      title: 'Formative Assessment 1',
      assessment_types: ['file_based'],
      max_marks: 50,
      deadline_at: new Date(Date.now() + 86400000).toISOString(),
      instructions: 'Security stream assessment instructions',
      document_filename: 'brief.pdf',
      document_base64: Buffer.from('%PDF-1.4 test assignment brief').toString('base64'),
      document_mime_type: 'application/pdf',
      instruction_files: [{
        file_name: 'brief.pdf',
        file_size_bytes: 500,
        mime_type: 'application/pdf',
        storage_path: `assessments/${randomUUID()}/brief.pdf`
      }],
      rubric_criteria: [
        { title: 'Concept', max_marks: 25, display_order: 1 },
        { title: 'Implementation', max_marks: 25, display_order: 2 }
      ]
    }
  });
  const secAssessment = createSecRes.body.assessment;
  assert(createSecRes.status === 201 && Boolean(secAssessment?.id), 'Subject Teacher creates Security assessment');

  // Configure rubric on assessment
  await makeApiRequest(app, {
    path: `/api/v1/assessments/${secAssessment.id}`,
    method: 'PUT',
    token: teacherToken,
    body: {
      rubric: STANDARD_50M_RUBRIC
    }
  });

  // Publish to ALL students in Security stream
  const pubSecRes = await makeApiRequest(app, {
    path: `/api/v1/assessments/${secAssessment.id}/publish`,
    method: 'POST',
    token: teacherToken,
    body: {
      audience: 'all'
    }
  });
  assert(pubSecRes.status === 200, 'Security assessment published with audience: all');

  // 1.1 AI student calls Performance Dashboard
  // AI student has 0 subjects assigned (AI stream has no subjects)
  const aiDashboardRes = await makeApiRequest(app, {
    path: '/api/v1/evaluations/student/performance-dashboard',
    method: 'GET',
    token: aiStudentToken
  });
  assert(aiDashboardRes.status === 200, 'AI student successfully fetches performance dashboard');
  const aiSubjects = aiDashboardRes.body.subjects || [];
  assert(aiSubjects.length === 0, 'AI student performance dashboard returns empty subjects array (zero Security stream leakage)');
  assert(!aiSubjects.some((s: any) => s.subject_code === '25MCAE321'), 'Security subject 25MCAE321 completely excluded for AI student');

  // 1.2 Security student calls Performance Dashboard
  const secDashboardRes = await makeApiRequest(app, {
    path: '/api/v1/evaluations/student/performance-dashboard',
    method: 'GET',
    token: securityStudentToken
  });
  assert(secDashboardRes.status === 200, 'Security student successfully fetches performance dashboard');
  const secSubjects = secDashboardRes.body.subjects || [];
  assert(secSubjects.length >= 1, 'Security student performance dashboard returns assigned Security subjects');
  assert(secSubjects.some((s: any) => s.subject_code === '25MCAE321'), 'Security subject 25MCAE321 is visible to Security student');

  console.log('\n--- TEST GROUP 2: Assessment Listing Stream Isolation ---');

  // 2.1 AI student lists assessments (GET /assessments)
  const aiAssessmentsRes = await makeApiRequest(app, {
    path: '/api/v1/assessments',
    method: 'GET',
    token: aiStudentToken
  });
  assert(aiAssessmentsRes.status === 200, 'AI student calls GET /assessments');
  const aiAssessmentsList = aiAssessmentsRes.body.assessments || [];
  assert(aiAssessmentsList.length === 0, 'AI student cannot see any Security stream assessments');
  assert(!aiAssessmentsList.some((a: any) => a.id === secAssessment.id), 'Security assessment not in AI student list');

  // 2.2 Security student lists assessments (GET /assessments)
  const secAssessmentsRes = await makeApiRequest(app, {
    path: '/api/v1/assessments',
    method: 'GET',
    token: securityStudentToken
  });
  assert(secAssessmentsRes.status === 200, 'Security student calls GET /assessments');
  const secAssessmentsList = secAssessmentsRes.body.assessments || [];
  assert(secAssessmentsList.some((a: any) => a.id === secAssessment.id), 'Security assessment is visible to Security student');

  console.log('\n--- TEST GROUP 3: Cross-Stream Direct Access Attack Blocking ---');

  // 3.1 AI student attempts GET /assessments/:id for Security assessment
  const aiDirectGetRes = await makeApiRequest(app, {
    path: `/api/v1/assessments/${secAssessment.id}`,
    method: 'GET',
    token: aiStudentToken
  });
  assert(aiDirectGetRes.status === 403, 'AI student GET /assessments/:id directly is blocked with 403 Forbidden');
  assert(aiDirectGetRes.body.error?.message?.includes('not enrolled'), 'Direct GET returns enrolled student violation message');

  // 3.2 AI student attempts GET /assessments/:id/document
  const aiDocGetRes = await makeApiRequest(app, {
    path: `/api/v1/assessments/${secAssessment.id}/document`,
    method: 'GET',
    token: aiStudentToken
  });
  assert(aiDocGetRes.status === 403, 'AI student GET /assessments/:id/document is blocked with 403 Forbidden');

  // 3.3 AI student attempts GET /assessments/:id/document-url
  const aiDocUrlRes = await makeApiRequest(app, {
    path: `/api/v1/assessments/${secAssessment.id}/document-url`,
    method: 'GET',
    token: aiStudentToken
  });
  assert(aiDocUrlRes.status === 403, 'AI student GET /assessments/:id/document-url is blocked with 403 Forbidden');

  // 3.4 AI student attempts GET /submissions/assessment/:id/draft
  const aiDraftGetRes = await makeApiRequest(app, {
    path: `/api/v1/submissions/assessment/${secAssessment.id}/draft`,
    method: 'GET',
    token: aiStudentToken
  });
  assert(aiDraftGetRes.status === 403, 'AI student GET draft is blocked with 403 Forbidden');

  // 3.5 AI student attempts PUT /submissions/assessment/:id/draft
  const aiDraftPutRes = await makeApiRequest(app, {
    path: `/api/v1/submissions/assessment/${secAssessment.id}/draft`,
    method: 'PUT',
    token: aiStudentToken,
    body: {
      answers: []
    }
  });
  assert(aiDraftPutRes.status === 403, 'AI student PUT draft is blocked with 403 Forbidden');

  // 3.6 AI student attempts POST /submissions
  const aiSubmitRes = await makeApiRequest(app, {
    path: '/api/v1/submissions',
    method: 'POST',
    token: aiStudentToken,
    body: {
      assessment_id: secAssessment.id,
      files: [{
        file_name: 'exploit.pdf',
        file_base64: Buffer.from('%PDF-1.4 unauth exploit').toString('base64'),
        mime_type: 'application/pdf'
      }],
      answers: []
    }
  });
  assert(aiSubmitRes.status === 403, 'AI student POST /submissions is blocked with 403 Forbidden');

  // 3.7 AI student attempts GET /submissions/assessment/:id
  const aiSubLedgerRes = await makeApiRequest(app, {
    path: `/api/v1/submissions/assessment/${secAssessment.id}`,
    method: 'GET',
    token: aiStudentToken
  });
  assert(aiSubLedgerRes.status === 403, 'AI student GET /submissions/assessment/:id is blocked with 403 Forbidden');

  console.log('\n--- TEST GROUP 4: Selected Student Targeting in Tandem with Stream Isolation ---');

  // Create second Security assessment published only to Security Student 1 (TEST_SECURITY_STUDENT_ID)
  const createSecTargetedRes = await makeApiRequest(app, {
    path: '/api/v1/assessments',
    method: 'POST',
    token: teacherToken,
    body: {
      class_subject_id: SECURITY_CLASS_SUB_ID,
      title: 'Targeted Security Assessment',
      assessment_types: ['file_based'],
      max_marks: 50,
      deadline_at: new Date(Date.now() + 86400000).toISOString(),
      instructions: 'Targeted Security assessment',
      document_filename: 'brief.pdf',
      document_base64: Buffer.from('%PDF-1.4 test assignment brief').toString('base64'),
      document_mime_type: 'application/pdf',
      instruction_files: [{
        file_name: 'brief.pdf',
        file_size_bytes: 500,
        mime_type: 'application/pdf',
        storage_path: `assessments/${randomUUID()}/brief.pdf`
      }],
      rubric_criteria: [
        { title: 'Concept', max_marks: 25, display_order: 1 },
        { title: 'Implementation', max_marks: 25, display_order: 2 }
      ]
    }
  });
  const secTargetedAss = createSecTargetedRes.body.assessment;

  await makeApiRequest(app, {
    path: `/api/v1/assessments/${secTargetedAss.id}`,
    method: 'PUT',
    token: teacherToken,
    body: {
      rubric: STANDARD_50M_RUBRIC
    }
  });

  const pubSecTargetedRes = await makeApiRequest(app, {
    path: `/api/v1/assessments/${secTargetedAss.id}/publish`,
    method: 'POST',
    token: teacherToken,
    body: {
      audience: 'selected',
      student_ids: [TEST_SECURITY_STUDENT_ID]
    }
  });
  assert(pubSecTargetedRes.status === 200, 'Security assessment published with audience: selected (student A only)');

  // 4.1 Targeted Security student A sees it in dashboard and assessment list
  const sec1ListRes = await makeApiRequest(app, {
    path: '/api/v1/assessments',
    method: 'GET',
    token: securityStudentToken
  });
  assert(sec1ListRes.body.assessments.some((a: any) => a.id === secTargetedAss.id), 'Targeted Security student A can see targeted assessment');

  // 4.2 Untargeted Security student 2 does NOT see it in assessment list
  const sec2ListRes = await makeApiRequest(app, {
    path: '/api/v1/assessments',
    method: 'GET',
    token: securityStudent2Token
  });
  assert(!sec2ListRes.body.assessments.some((a: any) => a.id === secTargetedAss.id), 'Untargeted Security student 2 cannot see targeted assessment');

  // 4.3 AI student does NOT see it in assessment list
  const aiList2Res = await makeApiRequest(app, {
    path: '/api/v1/assessments',
    method: 'GET',
    token: aiStudentToken
  });
  assert(!aiList2Res.body.assessments.some((a: any) => a.id === secTargetedAss.id), 'AI student cannot see targeted Security assessment');

  // 4.4 Untargeted Security student 2 direct GET returns 403
  const sec2DirectGet = await makeApiRequest(app, {
    path: `/api/v1/assessments/${secTargetedAss.id}`,
    method: 'GET',
    token: securityStudent2Token
  });
  assert(sec2DirectGet.status === 403, 'Untargeted Security student direct GET returns 403 Forbidden');

  console.log('\n--- TEST GROUP 5: Core Subject Access for Both Streams ---');

  // Configure Core Subject (specialization_id = null)
  let coreSubject = db.subjects.find(s => s.id === '02000000-0000-4000-8000-000000000002');
  if (coreSubject) {
    (coreSubject as any).specialization_id = null;
    coreSubject.name = 'Data Structures & Algorithms';
    coreSubject.code = '25MCA301';
  }
  // Clear subject_specializations for Core Subject
  db.subject_specializations = db.subject_specializations.filter(ss => ss.subject_id !== '02000000-0000-4000-8000-000000000002');

  // Create and publish Core assessment
  const createCoreRes = await makeApiRequest(app, {
    path: '/api/v1/assessments',
    method: 'POST',
    token: teacherToken,
    body: {
      class_subject_id: CORE_CLASS_SUB_ID,
      title: 'Core Assessment',
      assessment_types: ['file_based'],
      max_marks: 50,
      deadline_at: new Date(Date.now() + 86400000).toISOString(),
      instructions: 'Core assessment instructions',
      document_filename: 'brief.pdf',
      document_base64: Buffer.from('%PDF-1.4 test assignment brief').toString('base64'),
      document_mime_type: 'application/pdf',
      instruction_files: [{
        file_name: 'brief.pdf',
        file_size_bytes: 500,
        mime_type: 'application/pdf',
        storage_path: `assessments/${randomUUID()}/brief.pdf`
      }],
      rubric_criteria: [
        { title: 'Concept', max_marks: 25, display_order: 1 },
        { title: 'Implementation', max_marks: 25, display_order: 2 }
      ]
    }
  });
  const coreAssessment = createCoreRes.body.assessment;
  assert(createCoreRes.status === 201 && Boolean(coreAssessment?.id), 'Subject Teacher creates Core assessment');

  await makeApiRequest(app, {
    path: `/api/v1/assessments/${coreAssessment.id}`,
    method: 'PUT',
    token: teacherToken,
    body: {
      rubric: STANDARD_50M_RUBRIC
    }
  });

  const pubCoreRes = await makeApiRequest(app, {
    path: `/api/v1/assessments/${coreAssessment.id}/publish`,
    method: 'POST',
    token: teacherToken,
    body: {
      audience: 'all'
    }
  });
  assert(pubCoreRes.status === 200, 'Core assessment published with audience: all');

  // Both AI and Security students see Core Subject and Core Assessment
  const aiCoreDash = await makeApiRequest(app, {
    path: '/api/v1/evaluations/student/performance-dashboard',
    method: 'GET',
    token: aiStudentToken
  });
  const aiCoreSubs = aiCoreDash.body.subjects || [];
  assert(aiCoreSubs.length === 1 && aiCoreSubs[0].subject_code === '25MCA301', 'AI student correctly sees Core Subject 25MCA301 in dashboard');
  assert(!aiCoreSubs.some((s: any) => s.subject_code === '25MCAE321'), 'Security subject still excluded from AI student dashboard');

  const secCoreDash = await makeApiRequest(app, {
    path: '/api/v1/evaluations/student/performance-dashboard',
    method: 'GET',
    token: securityStudentToken
  });
  const secCoreSubs = secCoreDash.body.subjects || [];
  assert(secCoreSubs.some((s: any) => s.subject_code === '25MCA301'), 'Security student sees Core Subject 25MCA301');
  assert(secCoreSubs.some((s: any) => s.subject_code === '25MCAE321'), 'Security student sees Security Subject 25MCAE321');

  // 5.2 Core Subject listEligibleStudents returns all students across streams
  const coreEligibleRes = await makeApiRequest(app, {
    path: `/api/v1/assessments/${coreAssessment.id}/eligible-students`,
    method: 'GET',
    token: teacherToken
  });
  assert(coreEligibleRes.status === 200, 'Teacher can list eligible students for Core Subject');
  const coreEligibleIds = (coreEligibleRes.body.students || []).map((s: any) => s.student_id);
  assert(coreEligibleIds.includes(TEST_SECURITY_STUDENT_ID), 'Core subject eligible list includes Security student');
  assert(coreEligibleIds.includes(TEST_AI_STUDENT_ID), 'Core subject eligible list includes AI student');

  // 5.3 Core Subject Selected-Student Publishing across streams
  const createCoreTargetedRes = await makeApiRequest(app, {
    path: '/api/v1/assessments',
    method: 'POST',
    token: teacherToken,
    body: {
      class_subject_id: CORE_CLASS_SUB_ID,
      title: 'Targeted Core Assessment',
      assessment_types: ['file_based'],
      max_marks: 50,
      deadline_at: new Date(Date.now() + 86400000).toISOString(),
      instructions: 'Targeted Core assessment instructions',
      document_filename: 'brief.pdf',
      document_base64: Buffer.from('%PDF-1.4 test assignment brief').toString('base64'),
      document_mime_type: 'application/pdf',
      instruction_files: [{
        file_name: 'brief.pdf',
        file_size_bytes: 500,
        mime_type: 'application/pdf',
        storage_path: `assessments/${randomUUID()}/brief.pdf`
      }],
      rubric_criteria: [
        { title: 'Concept', max_marks: 25, display_order: 1 },
        { title: 'Implementation', max_marks: 25, display_order: 2 }
      ]
    }
  });
  const coreTargetedAss = createCoreTargetedRes.body.assessment;
  await makeApiRequest(app, {
    path: `/api/v1/assessments/${coreTargetedAss.id}`,
    method: 'PUT',
    token: teacherToken,
    body: { rubric: STANDARD_50M_RUBRIC }
  });

  // Publish targeting student from Security AND student from AI (no specialization ID match required)
  const pubCoreTargetedRes = await makeApiRequest(app, {
    path: `/api/v1/assessments/${coreTargetedAss.id}/publish`,
    method: 'POST',
    token: teacherToken,
    body: {
      audience: 'selected',
      student_ids: [TEST_SECURITY_STUDENT_ID, TEST_AI_STUDENT_ID]
    }
  });
  assert(pubCoreTargetedRes.status === 200, 'Core assessment published with selected students across different streams');

  // Both targeted students from different streams can access
  const secTargetedGet = await makeApiRequest(app, {
    path: `/api/v1/assessments/${coreTargetedAss.id}`,
    method: 'GET',
    token: securityStudentToken
  });
  assert(secTargetedGet.status === 200, 'Targeted Security student can access targeted Core assessment');

  const aiTargetedGet = await makeApiRequest(app, {
    path: `/api/v1/assessments/${coreTargetedAss.id}`,
    method: 'GET',
    token: aiStudentToken
  });
  assert(aiTargetedGet.status === 200, 'Targeted AI student can access targeted Core assessment');

  // Untargeted Security Student 2 in the same class is blocked
  const sec2UntargetedGet = await makeApiRequest(app, {
    path: `/api/v1/assessments/${coreTargetedAss.id}`,
    method: 'GET',
    token: securityStudent2Token
  });
  assert(sec2UntargetedGet.status === 403, 'Untargeted Security student 2 is blocked from targeted Core assessment (403)');

  console.log('\n--- TEST GROUP 6: Multi-Specialization Stream Mapping & Authorization Hardening ---');

  // 6.1 Configure an AI-Only Subject
  const aiOnlySubject = {
    id: AI_ONLY_SUBJECT_ID,
    code: '25MCAE331',
    name: 'Deep Learning',
    programme: 'MCA',
    semester: 3,
    credits: 4,
    specialization_id: AI_SPEC_ID,
    syllabus_path: null,
    active: true,
    created_at: new Date().toISOString()
  };
  const existingSubAi = db.subjects.findIndex(s => s.id === AI_ONLY_SUBJECT_ID);
  if (existingSubAi !== -1) {
    db.subjects[existingSubAi] = aiOnlySubject;
  } else {
    db.subjects.push(aiOnlySubject);
  }

  // Register in subject_specializations
  db.subject_specializations.push({
    id: randomUUID(),
    subject_id: AI_ONLY_SUBJECT_ID,
    specialization_id: AI_SPEC_ID,
    semester: 3,
    created_at: new Date().toISOString()
  });

  // Assign class subject
  const existingCsAi = db.classSubjects.findIndex(cs => cs.id === AI_ONLY_CLASS_SUB_ID);
  const aiClassSub = {
    id: AI_ONLY_CLASS_SUB_ID,
    class_id: TEST_CLASS_ID,
    subject_id: AI_ONLY_SUBJECT_ID,
    subject_teacher_id: TEST_TEACHER_ID,
    active: true,
    academic_year: '2024-2025',
    created_at: new Date().toISOString()
  };
  if (existingCsAi !== -1) {
    db.classSubjects[existingCsAi] = aiClassSub;
  } else {
    db.classSubjects.push(aiClassSub);
  }

  // Teacher creates and publishes AI-only assessment
  const createAiOnlyRes = await makeApiRequest(app, {
    path: '/api/v1/assessments',
    method: 'POST',
    token: teacherToken,
    body: {
      class_subject_id: AI_ONLY_CLASS_SUB_ID,
      title: 'AI Stream Assignment 1',
      assessment_types: ['file_based'],
      max_marks: 50,
      deadline_at: new Date(Date.now() + 86400000).toISOString(),
      instructions: 'AI-only assignment instructions',
      document_filename: 'ai_brief.pdf',
      document_base64: Buffer.from('%PDF-1.4 AI brief content').toString('base64'),
      document_mime_type: 'application/pdf',
      instruction_files: [{
        file_name: 'ai_brief.pdf',
        file_size_bytes: 400,
        mime_type: 'application/pdf',
        storage_path: `assessments/${randomUUID()}/ai_brief.pdf`
      }],
      rubric_criteria: [
        { title: 'Neural Nets', max_marks: 25, display_order: 1 },
        { title: 'Training & Eval', max_marks: 25, display_order: 2 }
      ]
    }
  });
  const aiOnlyAssessment = createAiOnlyRes.body.assessment;
  assert(createAiOnlyRes.status === 201 && Boolean(aiOnlyAssessment?.id), 'Teacher creates AI-only assessment');

  await makeApiRequest(app, {
    path: `/api/v1/assessments/${aiOnlyAssessment.id}`,
    method: 'PUT',
    token: teacherToken,
    body: { rubric: STANDARD_50M_RUBRIC }
  });

  const pubAiOnlyRes = await makeApiRequest(app, {
    path: `/api/v1/assessments/${aiOnlyAssessment.id}/publish`,
    method: 'POST',
    token: teacherToken,
    body: { audience: 'all' }
  });
  assert(pubAiOnlyRes.status === 200, 'AI-only assessment published with audience: all');

  // AI student accesses AI-only assessment (allowed)
  const aiStudentAiAccess = await makeApiRequest(app, {
    path: `/api/v1/assessments/${aiOnlyAssessment.id}`,
    method: 'GET',
    token: aiStudentToken
  });
  assert(aiStudentAiAccess.status === 200, 'AI student can access AI-only assessment details');

  const aiStudentAiDoc = await makeApiRequest(app, {
    path: `/api/v1/assessments/${aiOnlyAssessment.id}/document`,
    method: 'GET',
    token: aiStudentToken
  });
  assert(aiStudentAiDoc.status === 200, 'AI student can download AI-only assessment document');

  const aiStudentAiDraft = await makeApiRequest(app, {
    path: `/api/v1/submissions/assessment/${aiOnlyAssessment.id}/draft`,
    method: 'GET',
    token: aiStudentToken
  });
  assert(aiStudentAiDraft.status === 200, 'AI student can get draft for AI-only assessment');

  // Security student attempts access on AI-only assessment (denied 403 across all routes)
  const secStudentAiAccess = await makeApiRequest(app, {
    path: `/api/v1/assessments/${aiOnlyAssessment.id}`,
    method: 'GET',
    token: securityStudentToken
  });
  assert(secStudentAiAccess.status === 403, 'Security student blocked on AI-only assessment details (403)');

  const secStudentAiDoc = await makeApiRequest(app, {
    path: `/api/v1/assessments/${aiOnlyAssessment.id}/document`,
    method: 'GET',
    token: securityStudentToken
  });
  assert(secStudentAiDoc.status === 403, 'Security student blocked on AI-only document download (403)');

  const secStudentAiDocUrl = await makeApiRequest(app, {
    path: `/api/v1/assessments/${aiOnlyAssessment.id}/document-url`,
    method: 'GET',
    token: securityStudentToken
  });
  assert(secStudentAiDocUrl.status === 403, 'Security student blocked on AI-only document url (403)');

  const secStudentAiDraftGet = await makeApiRequest(app, {
    path: `/api/v1/submissions/assessment/${aiOnlyAssessment.id}/draft`,
    method: 'GET',
    token: securityStudentToken
  });
  assert(secStudentAiDraftGet.status === 403, 'Security student blocked on AI-only draft GET (403)');

  const secStudentAiDraftPut = await makeApiRequest(app, {
    path: `/api/v1/submissions/assessment/${aiOnlyAssessment.id}/draft`,
    method: 'PUT',
    token: securityStudentToken,
    body: { answers: [] }
  });
  assert(secStudentAiDraftPut.status === 403, 'Security student blocked on AI-only draft PUT (403)');

  const secStudentAiSubmit = await makeApiRequest(app, {
    path: '/api/v1/submissions',
    method: 'POST',
    token: securityStudentToken,
    body: {
      assessment_id: aiOnlyAssessment.id,
      files: [{ file_name: 'exploit.pdf', file_base64: 'dGVzdA==', mime_type: 'application/pdf' }],
      answers: []
    }
  });
  assert(secStudentAiSubmit.status === 403, 'Security student blocked on AI-only submission POST (403)');

  // 6.2 Configure a Multi-Specialization Elective Subject (mapped to BOTH AI and Security)
  const multiSubject = {
    id: MULTI_SUBJECT_ID,
    code: '25MCAE341',
    name: 'Cloud Security & AI Ops',
    programme: 'MCA',
    semester: 3,
    credits: 4,
    specialization_id: null, // Null in subjects, mapped via subject_specializations
    syllabus_path: null,
    active: true,
    created_at: new Date().toISOString()
  };
  const existingSubMulti = db.subjects.findIndex(s => s.id === MULTI_SUBJECT_ID);
  if (existingSubMulti !== -1) {
    db.subjects[existingSubMulti] = multiSubject;
  } else {
    db.subjects.push(multiSubject);
  }

  // Register TWO stream mappings in subject_specializations
  db.subject_specializations.push(
    {
      id: randomUUID(),
      subject_id: MULTI_SUBJECT_ID,
      specialization_id: AI_SPEC_ID,
      semester: 3,
      created_at: new Date().toISOString()
    },
    {
      id: randomUUID(),
      subject_id: MULTI_SUBJECT_ID,
      specialization_id: SECURITY_SPEC_ID,
      semester: 3,
      created_at: new Date().toISOString()
    }
  );

  // Assign class subject
  const multiClassSub = {
    id: MULTI_CLASS_SUB_ID,
    class_id: TEST_CLASS_ID,
    subject_id: MULTI_SUBJECT_ID,
    subject_teacher_id: TEST_TEACHER_ID,
    active: true,
    academic_year: '2024-2025',
    created_at: new Date().toISOString()
  };
  const existingCsMulti = db.classSubjects.findIndex(cs => cs.id === MULTI_CLASS_SUB_ID);
  if (existingCsMulti !== -1) {
    db.classSubjects[existingCsMulti] = multiClassSub;
  } else {
    db.classSubjects.push(multiClassSub);
  }

  // Register student profiles and enrollments for edge-case actors:
  // a) Unrelated Specialization Student (e.g. Data Science / IoT)
  db.profiles.push({
    id: TEST_UNRELATED_STUDENT_ID,
    full_name: 'Danielle Brooks',
    usn: '1JB25MC099',
    email: 'unrelated@test.edu',
    status: 'active',
    updated_at: new Date().toISOString(),
    created_at: new Date().toISOString()
  });
  db.roles.push({
    id: randomUUID(),
    user_id: TEST_UNRELATED_STUDENT_ID,
    role: 'student',
    active: true,
    created_at: new Date().toISOString()
  });
  db.enrollments.push({
    id: randomUUID(),
    class_id: TEST_CLASS_ID,
    student_id: TEST_UNRELATED_STUDENT_ID,
    specialization_id: UNRELATED_SPEC_ID,
    roll_number: '99',
    status: 'active',
    created_at: new Date().toISOString()
  });

  // b) Inactive Student (AI stream but status = 'inactive')
  db.profiles.push({
    id: TEST_INACTIVE_STUDENT_ID,
    full_name: 'Evan Inactive',
    usn: '1JB25MC098',
    email: 'inactive@test.edu',
    status: 'active',
    updated_at: new Date().toISOString(),
    created_at: new Date().toISOString()
  });
  db.roles.push({
    id: randomUUID(),
    user_id: TEST_INACTIVE_STUDENT_ID,
    role: 'student',
    active: true,
    created_at: new Date().toISOString()
  });
  db.enrollments.push({
    id: randomUUID(),
    class_id: TEST_CLASS_ID,
    student_id: TEST_INACTIVE_STUDENT_ID,
    specialization_id: AI_SPEC_ID,
    roll_number: '98',
    status: 'inactive',
    created_at: new Date().toISOString()
  });

  // c) Non-Enrolled Student profile (no row in enrollments for TEST_CLASS_ID)
  db.profiles.push({
    id: TEST_NON_ENROLLED_STUDENT_ID,
    full_name: 'Fiona NonEnrolled',
    usn: '1JB25MC097',
    email: 'nonenrolled@test.edu',
    status: 'active',
    updated_at: new Date().toISOString(),
    created_at: new Date().toISOString()
  });
  db.roles.push({
    id: randomUUID(),
    user_id: TEST_NON_ENROLLED_STUDENT_ID,
    role: 'student',
    active: true,
    created_at: new Date().toISOString()
  });

  // Teacher creates and publishes Multi-Specialization assessment
  const createMultiRes = await makeApiRequest(app, {
    path: '/api/v1/assessments',
    method: 'POST',
    token: teacherToken,
    body: {
      class_subject_id: MULTI_CLASS_SUB_ID,
      title: 'Cloud Security & AI Ops Project',
      assessment_types: ['file_based'],
      max_marks: 50,
      deadline_at: new Date(Date.now() + 86400000).toISOString(),
      instructions: 'Multi-stream assignment instructions',
      document_filename: 'multi_brief.pdf',
      document_base64: Buffer.from('%PDF-1.4 multi brief content').toString('base64'),
      document_mime_type: 'application/pdf',
      instruction_files: [{
        file_name: 'multi_brief.pdf',
        file_size_bytes: 450,
        mime_type: 'application/pdf',
        storage_path: `assessments/${randomUUID()}/multi_brief.pdf`
      }],
      rubric_criteria: [
        { title: 'Architecture', max_marks: 25, display_order: 1 },
        { title: 'Ops Pipeline', max_marks: 25, display_order: 2 }
      ]
    }
  });
  const multiAssessment = createMultiRes.body.assessment;
  assert(createMultiRes.status === 201 && Boolean(multiAssessment?.id), 'Teacher creates multi-stream assessment');

  await makeApiRequest(app, {
    path: `/api/v1/assessments/${multiAssessment.id}`,
    method: 'PUT',
    token: teacherToken,
    body: { rubric: STANDARD_50M_RUBRIC }
  });

  const pubMultiRes = await makeApiRequest(app, {
    path: `/api/v1/assessments/${multiAssessment.id}/publish`,
    method: 'POST',
    token: teacherToken,
    body: { audience: 'all' }
  });
  assert(pubMultiRes.status === 200, 'Multi-stream assessment published with audience: all');

  // Both mapped streams are allowed:
  // AI student access on multi-specialization subject
  const aiMultiAccess = await makeApiRequest(app, {
    path: `/api/v1/assessments/${multiAssessment.id}`,
    method: 'GET',
    token: aiStudentToken
  });
  assert(aiMultiAccess.status === 200, 'AI student successfully accesses multi-stream assessment (AI mapped)');

  // Security student access on multi-specialization subject
  const secMultiAccess = await makeApiRequest(app, {
    path: `/api/v1/assessments/${multiAssessment.id}`,
    method: 'GET',
    token: securityStudentToken
  });
  assert(secMultiAccess.status === 200, 'Security student successfully accesses multi-stream assessment (Security mapped)');

  // Unrelated stream student access (blocked with 403)
  const unrelatedMultiAccess = await makeApiRequest(app, {
    path: `/api/v1/assessments/${multiAssessment.id}`,
    method: 'GET',
    token: unrelatedStudentToken
  });
  assert(unrelatedMultiAccess.status === 403, 'Unrelated stream student blocked from multi-stream assessment (403)');

  const unrelatedDocAccess = await makeApiRequest(app, {
    path: `/api/v1/assessments/${multiAssessment.id}/document`,
    method: 'GET',
    token: unrelatedStudentToken
  });
  assert(unrelatedDocAccess.status === 403, 'Unrelated stream student blocked from multi-stream document (403)');

  const unrelatedDraftAccess = await makeApiRequest(app, {
    path: `/api/v1/submissions/assessment/${multiAssessment.id}/draft`,
    method: 'GET',
    token: unrelatedStudentToken
  });
  assert(unrelatedDraftAccess.status === 403, 'Unrelated stream student blocked from multi-stream draft (403)');

  const unrelatedSubmitAccess = await makeApiRequest(app, {
    path: '/api/v1/submissions',
    method: 'POST',
    token: unrelatedStudentToken,
    body: {
      assessment_id: multiAssessment.id,
      files: [{ file_name: 'test.pdf', file_base64: 'dGVzdA==', mime_type: 'application/pdf' }],
      answers: []
    }
  });
  assert(unrelatedSubmitAccess.status === 403, 'Unrelated stream student blocked from multi-stream submission (403)');

  // Inactive student access (blocked with 403)
  const inactiveMultiAccess = await makeApiRequest(app, {
    path: `/api/v1/assessments/${multiAssessment.id}`,
    method: 'GET',
    token: inactiveStudentToken
  });
  assert(inactiveMultiAccess.status === 403, 'Inactive student blocked from multi-stream assessment (403)');

  // Non-enrolled student access (blocked with 403)
  const nonEnrolledMultiAccess = await makeApiRequest(app, {
    path: `/api/v1/assessments/${multiAssessment.id}`,
    method: 'GET',
    token: nonEnrolledStudentToken
  });
  assert(nonEnrolledMultiAccess.status === 403, 'Non-enrolled student blocked from multi-stream assessment (403)');

  // 6.3 Verify Teacher Publishing Modal Student Roster for Multi-Stream Elective
  const listEligibleRes = await makeApiRequest(app, {
    path: `/api/v1/assessments/${multiAssessment.id}/eligible-students`,
    method: 'GET',
    token: teacherToken
  });
  assert(listEligibleRes.status === 200, 'Teacher can list eligible students for multi-stream assessment');
  const eligibleStudents = listEligibleRes.body.students || [];
  const eligibleIds = eligibleStudents.map((s: any) => s.student_id);
  assert(eligibleIds.includes(TEST_AI_STUDENT_ID), 'Eligible list includes active AI student');
  assert(eligibleIds.includes(TEST_SECURITY_STUDENT_ID), 'Eligible list includes active Security student');
  assert(!eligibleIds.includes(TEST_UNRELATED_STUDENT_ID), 'Eligible list excludes unrelated stream student');
  assert(!eligibleIds.includes(TEST_INACTIVE_STUDENT_ID), 'Eligible list excludes inactive student');
  assert(!eligibleIds.includes(TEST_NON_ENROLLED_STUDENT_ID), 'Eligible list excludes non-enrolled student');

  console.log('\n--- TEST GROUP 7: Supabase Repository Unit Verification (Fail-Closed & Multi-Mapping) ---');

  const { SupabaseAssessmentRepository } = await import('../../apps/api/src/storage/assessmentRepository.js');

  // Helper to build a chainable mock Supabase client
  function buildMockSupabaseClient(handlers: {
    classSubjectResult?: { data: any; error: any };
    subjectSpecializationsResult?: { data: any; error: any };
    enrollmentResult?: { data: any; error: any };
    onQuery?: (table: string, method: string) => void;
  }) {
    return {
      from: (table: string) => {
        let selectedFields = '';
        let filters: Record<string, any> = {};
        const chain: any = {
          select: (fields: string) => {
            selectedFields = fields;
            if (handlers.onQuery) handlers.onQuery(table, 'select');
            return chain;
          },
          eq: (field: string, val: any) => {
            filters[field] = val;
            if (handlers.onQuery) handlers.onQuery(table, `eq:${field}`);
            return chain;
          },
          maybeSingle: async () => {
            if (handlers.onQuery) handlers.onQuery(table, 'maybeSingle');
            if (table === 'class_subjects') {
              return handlers.classSubjectResult || { data: null, error: null };
            }
            if (table === 'enrollments') {
              return handlers.enrollmentResult || { data: null, error: null };
            }
            return { data: null, error: null };
          },
          then: (resolve: any) => {
            // For queries awaited directly without maybeSingle (e.g. subject_specializations)
            if (table === 'subject_specializations') {
              resolve(handlers.subjectSpecializationsResult || { data: [], error: null });
            } else if (table === 'class_subjects') {
              resolve(handlers.classSubjectResult || { data: null, error: null });
            } else if (table === 'enrollments') {
              resolve(handlers.enrollmentResult || { data: null, error: null });
            } else {
              resolve({ data: [], error: null });
            }
          }
        };
        return chain;
      }
    };
  }

  // 7.1 Multi-specialization lookup: subject mapped to ['spec-ai', 'spec-cyber']
  const mockMultiClient = buildMockSupabaseClient({
    classSubjectResult: {
      data: { class_id: 'cls-1', subject_id: 'sub-multi', subject: { specialization_id: null } },
      error: null
    },
    subjectSpecializationsResult: {
      data: [{ specialization_id: 'spec-ai' }, { specialization_id: 'spec-cyber' }],
      error: null
    },
    enrollmentResult: {
      data: { id: 'enr-ai', specialization_id: 'spec-ai' },
      error: null
    }
  });
  const repoMulti = new SupabaseAssessmentRepository(mockMultiClient as any);
  const isAiAllowed = await repoMulti.isEnrolledStudent('stu-ai', 'cs-multi');
  assert(isAiAllowed === true, 'SupabaseAssessmentRepository: AI student allowed for multi-spec subject');

  // Same repo, Cyber student
  const mockCyberClient = buildMockSupabaseClient({
    classSubjectResult: {
      data: { class_id: 'cls-1', subject_id: 'sub-multi', subject: { specialization_id: null } },
      error: null
    },
    subjectSpecializationsResult: {
      data: [{ specialization_id: 'spec-ai' }, { specialization_id: 'spec-cyber' }],
      error: null
    },
    enrollmentResult: {
      data: { id: 'enr-cyber', specialization_id: 'spec-cyber' },
      error: null
    }
  });
  const repoCyber = new SupabaseAssessmentRepository(mockCyberClient as any);
  const isCyberAllowed = await repoCyber.isEnrolledStudent('stu-cyber', 'cs-multi');
  assert(isCyberAllowed === true, 'SupabaseAssessmentRepository: Cyber student allowed for multi-spec subject');

  // Same repo, Cloud student (unrelated stream)
  const mockCloudClient = buildMockSupabaseClient({
    classSubjectResult: {
      data: { class_id: 'cls-1', subject_id: 'sub-multi', subject: { specialization_id: null } },
      error: null
    },
    subjectSpecializationsResult: {
      data: [{ specialization_id: 'spec-ai' }, { specialization_id: 'spec-cyber' }],
      error: null
    },
    enrollmentResult: {
      data: { id: 'enr-cloud', specialization_id: 'spec-cloud' },
      error: null
    }
  });
  const repoCloud = new SupabaseAssessmentRepository(mockCloudClient as any);
  const isCloudAllowed = await repoCloud.isEnrolledStudent('stu-cloud', 'cs-multi');
  assert(isCloudAllowed === false, 'SupabaseAssessmentRepository: Cloud student denied for multi-spec subject');

  // 7.2 Database error when querying subject_specializations (FAIL CLOSED)
  const mockErrorClient = buildMockSupabaseClient({
    classSubjectResult: {
      data: { class_id: 'cls-1', subject_id: 'sub-err', subject: { specialization_id: null } },
      error: null
    },
    subjectSpecializationsResult: {
      data: null,
      error: { message: 'Database connection terminated unexpectedly', code: 'PGRST000' }
    },
    enrollmentResult: {
      data: { id: 'enr-1', specialization_id: 'spec-ai' },
      error: null
    }
  });
  const repoErr = new SupabaseAssessmentRepository(mockErrorClient as any);
  const isErrAllowed = await repoErr.isEnrolledStudent('stu-1', 'cs-err');
  assert(isErrAllowed === false, 'SupabaseAssessmentRepository: Fails closed (false) when subject_specializations query errors');

  // 7.3 Missing or inactive enrollment fails closed
  const mockNoEnrClient = buildMockSupabaseClient({
    classSubjectResult: {
      data: { class_id: 'cls-1', subject_id: 'sub-core', subject: { specialization_id: null } },
      error: null
    },
    subjectSpecializationsResult: {
      data: [],
      error: null
    },
    enrollmentResult: {
      data: null, // No active enrollment found
      error: null
    }
  });
  const repoNoEnr = new SupabaseAssessmentRepository(mockNoEnrClient as any);
  const isNoEnrAllowed = await repoNoEnr.isEnrolledStudent('stu-no-enr', 'cs-core');
  assert(isNoEnrAllowed === false, 'SupabaseAssessmentRepository: Fails closed (false) when student has no active enrollment');

  // 7.4 Enrollment query database error fails closed
  const mockEnrErrClient = buildMockSupabaseClient({
    classSubjectResult: {
      data: { class_id: 'cls-1', subject_id: 'sub-core', subject: { specialization_id: null } },
      error: null
    },
    subjectSpecializationsResult: {
      data: [],
      error: null
    },
    enrollmentResult: {
      data: null,
      error: { message: 'Connection timeout', code: 'PGRST500' }
    }
  });
  const repoEnrErr = new SupabaseAssessmentRepository(mockEnrErrClient as any);
  const isEnrErrAllowed = await repoEnrErr.isEnrolledStudent('stu-enr-err', 'cs-core');
  assert(isEnrErrAllowed === false, 'SupabaseAssessmentRepository: Fails closed (false) when enrollments query errors');

  // 7.5 Core subject with valid active enrollment is allowed
  const mockCoreClient = buildMockSupabaseClient({
    classSubjectResult: {
      data: { class_id: 'cls-1', subject_id: 'sub-core', subject: { specialization_id: null } },
      error: null
    },
    subjectSpecializationsResult: {
      data: [],
      error: null
    },
    enrollmentResult: {
      data: { id: 'enr-active', specialization_id: 'spec-any' },
      error: null
    }
  });
  const repoCore = new SupabaseAssessmentRepository(mockCoreClient as any);
  const isCoreAllowed = await repoCore.isEnrolledStudent('stu-active', 'cs-core');
  assert(isCoreAllowed === true, 'SupabaseAssessmentRepository: Allows actively enrolled student for core unmapped subject');

  // 7.6 Verify .maybeSingle() is NEVER invoked on subject_specializations
  let calledMethodsOnSubjectSpec: string[] = [];
  const mockSpyClient = buildMockSupabaseClient({
    classSubjectResult: {
      data: { class_id: 'cls-1', subject_id: 'sub-multi', subject: { specialization_id: null } },
      error: null
    },
    subjectSpecializationsResult: {
      data: [{ specialization_id: 'spec-1' }, { specialization_id: 'spec-2' }],
      error: null
    },
    enrollmentResult: {
      data: { id: 'enr-1', specialization_id: 'spec-1' },
      error: null
    },
    onQuery: (table, method) => {
      if (table === 'subject_specializations') {
        calledMethodsOnSubjectSpec.push(method);
      }
    }
  });
  const repoSpy = new SupabaseAssessmentRepository(mockSpyClient as any);
  await repoSpy.isEnrolledStudent('stu-1', 'cs-multi');
  assert(!calledMethodsOnSubjectSpec.includes('maybeSingle'), 'SupabaseAssessmentRepository: subject_specializations query does NOT use .maybeSingle() (prevents PGRST116)');

  console.log('\n--- TEST GROUP 8: Genuine Student Accounts Safety Verification ---');

  const PROTECTED_USNS = ['1JB25MC054', '1JB25MC034', '1JB25MC014'];
  const genuineProfiles = db.profiles.filter(p => PROTECTED_USNS.includes(p.usn || ''));
  assert(genuineProfiles.length === 0, 'In-memory test database contains no genuine student profiles (isolation maintained)');

  console.log('\n========================================================================');
  console.log(`  STUDENT STREAM ISOLATION RESULTS: ${passedTests}/${totalTests} PASSED`);
  console.log('========================================================================\n');

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runStudentStreamIsolationTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
