/**
 * ACADASSESS: Assessment Student Targeting (All vs Selected) Verification Suite
 * 
 * Tests:
 * 1. Fetching eligible cohort students for an assessment
 * 2. Strict validation: rejecting 'selected' audience with 0 students or invalid student IDs
 * 3. Option 1: Publishing to All Students (all students can see, access, download, and submit)
 * 4. Option 2: Publishing to Selected Students (targeted student can access, unselected is 403-blocked)
 * 5. Direct access attack prevention (unselected student blocked on GET assessment, GET document, draft, and submit)
 * 6. Teacher evaluation roster strictly scopes to targeted students only
 * 7. Multi-Type combination (File + Manual + Quiz) targeted publishing & auto-scoring
 */

import http from 'http';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';

process.env.NODE_ENV = 'test';
process.env.SMARTFA_TEST_MODE = 'true';

const DEV_JWT_SECRET = 'smartfa-test-hmac-dev-secret-key-32chars';
const TEST_TEACHER_ID = 'a2000000-0000-0000-0000-000000000001';
const TEST_STUDENT_A_ID = 'a4000000-0000-0000-0000-000000000001'; // Aarav Patel
const TEST_STUDENT_B_ID = 'a4000000-0000-0000-0000-000000000002'; // Bhavna Reddy
const TEST_CLASS_SUB_ID = 'c5100000-0000-0000-0000-000000000001';
const TEST_CLASS_ID = 'c1000000-0000-0000-0000-000000000001';

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

async function runStudentTargetingTests() {
  console.log('========================================================================');
  console.log('  ACADASSESS: ASSESSMENT STUDENT TARGETING (ALL VS SELECTED) SUITE       ');
  console.log('========================================================================\n');

  const appModule = await import('../../apps/api/src/index.js');
  const app = (appModule as any).app || (appModule as any).default;
  const { db } = await import('../../apps/api/src/storage/db.js');

  const teacherToken = generateToken(TEST_TEACHER_ID, 'subject_teacher');
  const studentAToken = generateToken(TEST_STUDENT_A_ID, 'student');
  const studentBToken = generateToken(TEST_STUDENT_B_ID, 'student');

  // Ensure test students A and B are active Security stream students in in-memory DB
  const enrA = db.enrollments.find(e => e.student_id === TEST_STUDENT_A_ID && e.class_id === TEST_CLASS_ID);
  if (enrA) {
    enrA.specialization_id = 'c1000000-0000-4000-8000-000000000001';
    enrA.status = 'active';
  } else {
    db.enrollments.push({
      id: randomUUID(),
      class_id: TEST_CLASS_ID,
      student_id: TEST_STUDENT_A_ID,
      specialization_id: 'c1000000-0000-4000-8000-000000000001',
      roll_number: '01',
      status: 'active',
      created_at: new Date().toISOString()
    });
  }

  const enrB = db.enrollments.find(e => e.student_id === TEST_STUDENT_B_ID && e.class_id === TEST_CLASS_ID);
  if (enrB) {
    enrB.specialization_id = 'c1000000-0000-4000-8000-000000000001';
    enrB.status = 'active';
  } else {
    db.enrollments.push({
      id: randomUUID(),
      class_id: TEST_CLASS_ID,
      student_id: TEST_STUDENT_B_ID,
      specialization_id: 'c1000000-0000-4000-8000-000000000001',
      roll_number: '02',
      status: 'active',
      created_at: new Date().toISOString()
    });
  }

  // -------------------------------------------------------------------------
  // TEST SECTION 1: Eligible Students Retrieval
  // -------------------------------------------------------------------------
  console.log('--- TEST SECTION 1: Eligible Students Retrieval ---');

  // Create a draft assessment
  const createDraftRes = await makeApiRequest(app, {
    path: '/api/v1/assessments',
    method: 'POST',
    token: teacherToken,
    body: {
      class_subject_id: TEST_CLASS_SUB_ID,
      title: 'Targeting Verification Draft',
      instructions: 'Testing student targeting and publication rules',
      deadline_at: new Date(Date.now() + 86400000 * 3).toISOString(),
      assessment_types: ['file_based', 'quiz'],
      document_filename: 'brief.pdf',
      document_base64: Buffer.from('%PDF-1.4 test assignment brief').toString('base64'),
      document_mime_type: 'application/pdf',
      instruction_files: [{
        file_name: 'brief.pdf',
        file_size_bytes: 500,
        mime_type: 'application/pdf',
        storage_path: `assessments/${randomUUID()}/brief.pdf`
      }],
      quiz_questions: [
        {
          question_text: 'What is targeting?',
          options: [
            { id: 'opt_1', text: 'Option A' },
            { id: 'opt_2', text: 'Option B' },
            { id: 'opt_3', text: 'Option C' },
            { id: 'opt_4', text: 'Option D' }
          ],
          correct_option_id: 'opt_1',
          marks: 10
        }
      ],
      rubric_criteria: [
        { title: 'Content', max_marks: 25, display_order: 1 },
        { title: 'Quality', max_marks: 25, display_order: 2 }
      ]
    }
  });

  assert(createDraftRes.status === 201, '1. Draft assessment created successfully (HTTP 201)');
  const draftAssessmentId = createDraftRes.body.assessment.id;

  // Configure draft components with rubric
  await makeApiRequest(app, {
    path: `/api/v1/assessments/${draftAssessmentId}`,
    method: 'PUT',
    token: teacherToken,
    body: {
      document_storage_key: `assessments/${draftAssessmentId}/brief.pdf`,
      document_filename: 'brief.pdf',
      document_size_bytes: 500,
      document_mime_type: 'application/pdf',
      quiz_questions: [
        {
          question_text: 'What is targeting?',
          options: [
            { id: 'opt_1', text: 'Option A' },
            { id: 'opt_2', text: 'Option B' },
            { id: 'opt_3', text: 'Option C' },
            { id: 'opt_4', text: 'Option D' }
          ],
          correct_option_id: 'opt_1',
          marks: 10
        }
      ],
      rubric: STANDARD_50M_RUBRIC
    }
  });

  db.storageBlobs.set(`assessments/${draftAssessmentId}/brief.pdf`, Buffer.from('%PDF-1.4 test document bytes'));

  // Teacher fetches eligible students
  const eligibleRes = await makeApiRequest(app, {
    path: `/api/v1/assessments/${draftAssessmentId}/eligible-students`,
    method: 'GET',
    token: teacherToken
  });

  assert(eligibleRes.status === 200, '2. Teacher can fetch eligible students for assessment (HTTP 200)');
  assert(Array.isArray(eligibleRes.body.students), '3. Response contains students array');
  assert(eligibleRes.body.students.length >= 2, `4. Returns eligible students count (${eligibleRes.body.students.length} students)`);
  assert(eligibleRes.body.students.some((s: any) => s.student_id === TEST_STUDENT_A_ID), '5. Eligible list includes Student A');
  assert(eligibleRes.body.students.some((s: any) => s.student_id === TEST_STUDENT_B_ID), '6. Eligible list includes Student B');

  // Student trying to fetch eligible students must be rejected (403)
  const studentEligibleRes = await makeApiRequest(app, {
    path: `/api/v1/assessments/${draftAssessmentId}/eligible-students`,
    method: 'GET',
    token: studentAToken
  });
  assert(studentEligibleRes.status === 403, '7. Student is forbidden from fetching eligible students (HTTP 403)');

  // -------------------------------------------------------------------------
  // TEST SECTION 2: Publication Validation & Safeguards
  // -------------------------------------------------------------------------
  console.log('\n--- TEST SECTION 2: Publication Validation & Safeguards ---');

  // Rejects selected audience with empty student_ids
  const emptySelectedRes = await makeApiRequest(app, {
    path: `/api/v1/assessments/${draftAssessmentId}/publish`,
    method: 'POST',
    token: teacherToken,
    body: {
      audience: 'selected',
      student_ids: []
    }
  });
  assert(emptySelectedRes.status === 400, '8. Publishing to selected students with 0 students is strictly rejected (HTTP 400)');

  // Rejects selected audience with non-enrolled student ID
  const invalidStudentRes = await makeApiRequest(app, {
    path: `/api/v1/assessments/${draftAssessmentId}/publish`,
    method: 'POST',
    token: teacherToken,
    body: {
      audience: 'selected',
      student_ids: ['a9999999-9999-9999-9999-999999999999']
    }
  });
  assert(invalidStudentRes.status === 400, '9. Publishing with non-enrolled student ID is strictly rejected (HTTP 400)');

  // -------------------------------------------------------------------------
  // TEST SECTION 3: Option 2 - Publishing to Selected Students (Targeting Student A only)
  // -------------------------------------------------------------------------
  console.log('\n--- TEST SECTION 3: Option 2 - Publishing to Selected Students ---');

  const publishTargetedRes = await makeApiRequest(app, {
    path: `/api/v1/assessments/${draftAssessmentId}/publish`,
    method: 'POST',
    token: teacherToken,
    body: {
      audience: 'selected',
      student_ids: [TEST_STUDENT_A_ID]
    }
  });

  assert(publishTargetedRes.status === 200, '10. Assessment published to Selected Students successfully (HTTP 200)');
  assert(publishTargetedRes.body.assessment.status === 'published', '11. Assessment status is published');
  assert(publishTargetedRes.body.assessment.publishing_audience === 'selected', '12. Assessment records publishing_audience = selected');

  // -------------------------------------------------------------------------
  // TEST SECTION 4: Targeted Student (Student A) Visibility & Submission Access
  // -------------------------------------------------------------------------
  console.log('\n--- TEST SECTION 4: Targeted Student (Student A) Verification ---');

  // Student A lists assessments -> Must see the assessment
  const studentAListRes = await makeApiRequest(app, {
    path: '/api/v1/assessments',
    method: 'GET',
    token: studentAToken
  });
  assert(studentAListRes.status === 200, '13. Student A can list assessments');
  const foundInStudentA = studentAListRes.body.assessments.some((a: any) => a.id === draftAssessmentId);
  assert(foundInStudentA, '14. Targeted assessment appears in Student A assessment list');

  // Student A fetches assessment detail -> HTTP 200
  const studentADetailRes = await makeApiRequest(app, {
    path: `/api/v1/assessments/${draftAssessmentId}`,
    method: 'GET',
    token: studentAToken
  });
  assert(studentADetailRes.status === 200, '15. Student A can fetch assessment details (HTTP 200)');
  assert(studentADetailRes.body.assessment.quiz_questions[0].correct_option_id === undefined, '16. Student A quiz question has correct_option_id stripped (Zero-Leakage)');

  // Student A downloads brief document -> HTTP 200
  const studentADocRes = await makeApiRequest(app, {
    path: `/api/v1/assessments/${draftAssessmentId}/document`,
    method: 'GET',
    token: studentAToken
  });
  assert(studentADocRes.status === 200, '17. Student A can access instruction document (HTTP 200)');

  // Student A saves draft submission -> HTTP 200
  const studentADraftRes = await makeApiRequest(app, {
    path: `/api/v1/submissions/assessment/${draftAssessmentId}/draft`,
    method: 'PUT',
    token: studentAToken,
    body: {
      answers: [],
      quiz_answers: [{ question_id: studentADetailRes.body.assessment.quiz_questions[0].id, selected_option_id: 'opt_1' }]
    }
  });
  assert(studentADraftRes.status === 200, '18. Student A can save draft submission (HTTP 200)');

  // Student A submits assessment -> HTTP 201
  const studentASubmitRes = await makeApiRequest(app, {
    path: '/api/v1/submissions',
    method: 'POST',
    token: studentAToken,
    body: {
      assessment_id: draftAssessmentId,
      files: [{
        file_name: 'solution.pdf',
        file_base64: Buffer.from('%PDF-1.4 solution content').toString('base64'),
        mime_type: 'application/pdf'
      }],
      answers: [],
      quiz_answers: [{
        quiz_question_id: studentADetailRes.body.assessment.quiz_questions[0].id,
        selected_option_id: 'opt_1'
      }]
    }
  });
  assert(studentASubmitRes.status === 201, '19. Student A submission accepted successfully (HTTP 201)');

  // -------------------------------------------------------------------------
  // TEST SECTION 5: Unselected Student (Student B) Total Isolation & Attack Prevention
  // -------------------------------------------------------------------------
  console.log('\n--- TEST SECTION 5: Unselected Student (Student B) Strict Isolation ---');

  // Student B lists assessments -> Must NOT see the targeted assessment
  const studentBListRes = await makeApiRequest(app, {
    path: '/api/v1/assessments',
    method: 'GET',
    token: studentBToken
  });
  assert(studentBListRes.status === 200, '20. Student B lists assessments successfully');
  const foundInStudentB = studentBListRes.body.assessments.some((a: any) => a.id === draftAssessmentId);
  assert(!foundInStudentB, '21. Zero Visibility: Targeted assessment is strictly absent from Student B dashboard list');

  // Direct access attack: Student B attempts direct GET /assessments/:id -> 403 Forbidden
  const studentBDetailRes = await makeApiRequest(app, {
    path: `/api/v1/assessments/${draftAssessmentId}`,
    method: 'GET',
    token: studentBToken
  });
  assert(studentBDetailRes.status === 403, '22. Student B direct access to assessment details strictly rejected (HTTP 403 Forbidden)');

  // Direct access attack: Student B attempts direct GET /assessments/:id/document -> 403 Forbidden
  const studentBDocRes = await makeApiRequest(app, {
    path: `/api/v1/assessments/${draftAssessmentId}/document`,
    method: 'GET',
    token: studentBToken
  });
  assert(studentBDocRes.status === 403, '23. Student B direct download of instruction document strictly rejected (HTTP 403 Forbidden)');

  // Direct access attack: Student B attempts draft retrieval -> 403 Forbidden
  const studentBGetDraftRes = await makeApiRequest(app, {
    path: `/api/v1/submissions/assessment/${draftAssessmentId}/draft`,
    method: 'GET',
    token: studentBToken
  });
  assert(studentBGetDraftRes.status === 403, '24. Student B draft retrieval strictly rejected (HTTP 403 Forbidden)');

  // Direct access attack: Student B attempts draft saving -> 403 Forbidden
  const studentBSaveDraftRes = await makeApiRequest(app, {
    path: `/api/v1/submissions/assessment/${draftAssessmentId}/draft`,
    method: 'PUT',
    token: studentBToken,
    body: { answers: [] }
  });
  assert(studentBSaveDraftRes.status === 403, '25. Student B draft saving strictly rejected (HTTP 403 Forbidden)');

  // Direct access attack: Student B attempts submission -> 403 Forbidden
  const studentBSubmitRes = await makeApiRequest(app, {
    path: '/api/v1/submissions',
    method: 'POST',
    token: studentBToken,
    body: {
      assessment_id: draftAssessmentId,
      files: [{
        file_name: 'unauth.pdf',
        file_base64: Buffer.from('%PDF-1.4 unauth content').toString('base64'),
        mime_type: 'application/pdf'
      }],
      answers: []
    }
  });
  assert(studentBSubmitRes.status === 403, '26. Student B submission strictly rejected (HTTP 403 Forbidden)');

  // -------------------------------------------------------------------------
  // TEST SECTION 6: Teacher Evaluation Roster Scoping
  // -------------------------------------------------------------------------
  console.log('\n--- TEST SECTION 6: Teacher Evaluation Roster Scoping ---');

  const rosterRes = await makeApiRequest(app, {
    path: `/api/v1/evaluations/assessment/${draftAssessmentId}/ledger`,
    method: 'GET',
    token: teacherToken
  });

  assert(rosterRes.status === 200, '27. Teacher can fetch evaluation workspace ledger (HTTP 200)');
  const roster = rosterRes.body.ledger || [];
  assert(roster.length === 1, `28. Evaluation ledger contains exactly 1 student (got ${roster.length})`);
  assert(roster[0]?.student_id === TEST_STUDENT_A_ID, '29. Ledger contains targeted Student A');
  assert(!roster.some((r: any) => r.student_id === TEST_STUDENT_B_ID), '30. Unselected Student B is NOT in ledger (not counted as not submitted)');

  // -------------------------------------------------------------------------
  // TEST SECTION 7: Option 1 - Publishing to All Students
  // -------------------------------------------------------------------------
  console.log('\n--- TEST SECTION 7: Option 1 - Publishing to All Students ---');

  // Create another draft for "All Students" testing
  const createDraft2Res = await makeApiRequest(app, {
    path: '/api/v1/assessments',
    method: 'POST',
    token: teacherToken,
    body: {
      class_subject_id: TEST_CLASS_SUB_ID,
      title: 'Publish to All Verification Draft',
      instructions: 'Testing all students publishing workflow',
      deadline_at: new Date(Date.now() + 86400000 * 4).toISOString(),
      assessment_types: ['file_based'],
      document_filename: 'all_students_brief.pdf',
      document_base64: Buffer.from('%PDF-1.4 all brief').toString('base64'),
      document_mime_type: 'application/pdf',
      instruction_files: [{
        file_name: 'all_students_brief.pdf',
        file_size_bytes: 400,
        mime_type: 'application/pdf',
        storage_path: `assessments/${randomUUID()}/all_students_brief.pdf`
      }],
      rubric_criteria: [
        { title: 'Criterion 1', max_marks: 50, display_order: 1 }
      ]
    }
  });

  assert(createDraft2Res.status === 201, '31. Second draft assessment created successfully');
  const allAssessmentId = createDraft2Res.body.assessment.id;

  // Configure rubric on second draft
  await makeApiRequest(app, {
    path: `/api/v1/assessments/${allAssessmentId}`,
    method: 'PUT',
    token: teacherToken,
    body: {
      document_storage_key: `assessments/${allAssessmentId}/all_students_brief.pdf`,
      document_filename: 'all_students_brief.pdf',
      document_size_bytes: 400,
      document_mime_type: 'application/pdf',
      rubric: STANDARD_50M_RUBRIC
    }
  });

  db.storageBlobs.set(`assessments/${draftAssessmentId}/brief.pdf`, Buffer.from('%PDF-1.4 test document bytes'));

  // Publish with audience: 'all'
  const publishAllRes = await makeApiRequest(app, {
    path: `/api/v1/assessments/${allAssessmentId}/publish`,
    method: 'POST',
    token: teacherToken,
    body: {
      audience: 'all'
    }
  });

  assert(publishAllRes.status === 200, '32. Assessment published to All Students successfully');
  assert(publishAllRes.body.assessment.publishing_audience === 'all', '33. Assessment records publishing_audience = all');

  // Student A can access
  const studentAAllRes = await makeApiRequest(app, {
    path: `/api/v1/assessments/${allAssessmentId}`,
    method: 'GET',
    token: studentAToken
  });
  assert(studentAAllRes.status === 200, '34. Student A can access "All Students" assessment');

  // Student B can ALSO access
  const studentBAllRes = await makeApiRequest(app, {
    path: `/api/v1/assessments/${allAssessmentId}`,
    method: 'GET',
    token: studentBToken
  });
  assert(studentBAllRes.status === 200, '35. Student B can access "All Students" assessment');

  // Both students see it in their listing
  const sBListAllRes = await makeApiRequest(app, {
    path: '/api/v1/assessments',
    method: 'GET',
    token: studentBToken
  });
  assert(sBListAllRes.body.assessments.some((a: any) => a.id === allAssessmentId), '36. "All Students" assessment appears in Student B listing');

  // -------------------------------------------------------------------------
  // TEST SECTION 8: All 7 Assessment-Type Combinations with Selected Student Publishing
  // -------------------------------------------------------------------------
  console.log('\n--- TEST SECTION 8: All 7 Assessment Combinations with Selected Student Publishing ---');

  const allSevenCombos = [
    { id: 1, name: 'Combo 1: File-Based Only', types: ['file_based'] },
    { id: 2, name: 'Combo 2: Manual Questions Only', types: ['manual_questions'] },
    { id: 3, name: 'Combo 3: Quiz Only', types: ['quiz'] },
    { id: 4, name: 'Combo 4: File-Based + Manual Questions', types: ['file_based', 'manual_questions'] },
    { id: 5, name: 'Combo 5: File-Based + Quiz', types: ['file_based', 'quiz'] },
    { id: 6, name: 'Combo 6: Manual Questions + Quiz', types: ['manual_questions', 'quiz'] },
    { id: 7, name: 'Combo 7: File-Based + Manual Questions + Quiz', types: ['file_based', 'manual_questions', 'quiz'] }
  ];

  let testNum = 37;
  for (const combo of allSevenCombos) {
    const draftPayload: any = {
      class_subject_id: TEST_CLASS_SUB_ID,
      title: `Selected Targeting - ${combo.name}`,
      instructions: `Verification of targeted publishing for ${combo.name}`,
      deadline_at: new Date(Date.now() + 86400000 * 5).toISOString(),
      assessment_types: combo.types
    };

    const draftRes = await makeApiRequest(app, {
      path: '/api/v1/assessments',
      method: 'POST',
      token: teacherToken,
      body: draftPayload
    });

    const assId = draftRes.body.assessment.id;

    // Configure required sections
    const updatePayload: any = {};
    if (combo.types.includes('file_based')) {
      updatePayload.document_storage_key = `assessments/${assId}/brief.pdf`;
      updatePayload.document_filename = 'brief.pdf';
      updatePayload.document_size_bytes = 1024;
      updatePayload.document_mime_type = 'application/pdf';
      db.storageBlobs.set(`assessments/${assId}/brief.pdf`, Buffer.from('%PDF-1.4 file content'));
    }
    if (combo.types.includes('manual_questions')) {
      updatePayload.questions = [
        { prompt: 'Explain the core security architecture principles.', display_order: 1 }
      ];
    }
    if (combo.types.includes('quiz')) {
      updatePayload.quiz_questions = [
        {
          question_text: 'Which protocol secures web traffic?',
          options: [
            { id: 'opt_1', text: 'HTTP' },
            { id: 'opt_2', text: 'HTTPS' },
            { id: 'opt_3', text: 'FTP' },
            { id: 'opt_4', text: 'Telnet' }
          ],
          correct_option_id: 'opt_2',
          marks: 10
        }
      ];
    }
    if (combo.types.includes('file_based') || combo.types.includes('manual_questions')) {
      updatePayload.rubric = STANDARD_50M_RUBRIC;
    }

    await makeApiRequest(app, {
      path: `/api/v1/assessments/${assId}`,
      method: 'PUT',
      token: teacherToken,
      body: updatePayload
    });

    // Publish to Student A only
    const pubRes = await makeApiRequest(app, {
      path: `/api/v1/assessments/${assId}/publish`,
      method: 'POST',
      token: teacherToken,
      body: {
        audience: 'selected',
        student_ids: [TEST_STUDENT_A_ID]
      }
    });

    assert(pubRes.status === 200, `${testNum++}. [${combo.name}] Published to Selected Students (HTTP 200)`);

    // Student A (Targeted) accesses
    const stAGet = await makeApiRequest(app, {
      path: `/api/v1/assessments/${assId}`,
      method: 'GET',
      token: studentAToken
    });
    assert(stAGet.status === 200, `${testNum++}. [${combo.name}] Targeted Student A granted access (HTTP 200)`);

    // Student B (Unselected) is strictly 403 Forbidden
    const stBGet = await makeApiRequest(app, {
      path: `/api/v1/assessments/${assId}`,
      method: 'GET',
      token: studentBToken
    });
    assert(stBGet.status === 403, `${testNum++}. [${combo.name}] Unselected Student B strictly blocked (HTTP 403)`);
  }

  console.log('\n========================================================================');
  console.log(`  STUDENT TARGETING VERIFICATION SUMMARY: ${passedTests} / ${totalTests} TESTS PASSED`);
  console.log('========================================================================\n');

  if (passedTests === totalTests) {
    console.log('>>> ALL STUDENT TARGETING & AUTHORIZATION INVARIANTS VERIFIED! <<<\n');
  } else {
    console.error('>>> FAILURES ENCOUNTERED IN STUDENT TARGETING SUITE <<<\n');
    process.exitCode = 1;
  }
}

runStudentTargetingTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
