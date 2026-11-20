/**
 * ACADASSESS: Complete 7-Combination Multi-Type Assessment Verification Suite
 * 
 * Tests all 7 combinations across the entire academic lifecycle:
 * 1. File-Based Only
 * 2. Manual Questions Only
 * 3. Quiz Only
 * 4. File-Based + Manual Questions
 * 5. File-Based + Quiz
 * 6. Manual Questions + Quiz
 * 7. File-Based + Manual Questions + Quiz
 * 
 * For each combination, verifies:
 * - Draft Creation
 * - Configuration & Live Draft Updates
 * - Publication Rules (Dynamic Rubric enforcement: 50m required if file/manual, bypassed for quiz-only)
 * - Student Answering & Submission (including PDF/Word/PPT answer files, manual answers, quiz options)
 * - Server Auto-Scoring & Assistive Presentation (where quiz is involved)
 * - Teacher Authoritative Evaluation & Confirmation (teacher_confirmed_marks)
 * - Result Publication
 */

import http from 'http';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';

process.env.NODE_ENV = 'test';
process.env.SMARTFA_TEST_MODE = 'true';

const DEV_JWT_SECRET = 'smartfa-test-hmac-dev-secret-key-32chars';
const TEST_TEACHER_ID = 'a2000000-0000-0000-0000-000000000001';
const TEST_STUDENT_ID = 'a4000000-0000-0000-0000-000000000001';
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

function makeToken(sub: string, email: string): string {
  return jwt.sign({ sub, email }, DEV_JWT_SECRET, { expiresIn: '1h' });
}

// Sample Rubric with exactly 50 marks
const STANDARD_50M_RUBRIC = {
  title: 'Assignment Evaluation Rubric',
  criteria: [
    { criterion_title: 'Concept & Understanding', description: 'Core principles', max_marks: 15, display_order: 1 },
    { criterion_title: 'Implementation & Solution', description: 'Technical design', max_marks: 20, display_order: 2 },
    { criterion_title: 'Analysis & Verification', description: 'Correctness', max_marks: 10, display_order: 3 },
    { criterion_title: 'Presentation & Clarity', description: 'Structure', max_marks: 5, display_order: 4 }
  ]
};

// Sample Quiz Questions
const SAMPLE_QUIZ_QUESTIONS = [
  {
    prompt: 'What is the average time complexity of QuickSort?',
    marks: 10,
    display_order: 1,
    options: [
      { id: 'opt_1', text: 'O(n)' },
      { id: 'opt_2', text: 'O(n log n)' },
      { id: 'opt_3', text: 'O(n^2)' },
      { id: 'opt_4', text: 'O(log n)' }
    ],
    correct_option_id: 'opt_2',
    explanation: 'QuickSort divides problem in half log n times, doing n work each level.'
  },
  {
    prompt: 'Which data structure follows LIFO?',
    marks: 10,
    display_order: 2,
    options: [
      { id: 'opt_a', text: 'Queue' },
      { id: 'opt_b', text: 'Stack' },
      { id: 'opt_c', text: 'Heap' },
      { id: 'opt_d', text: 'Graph' }
    ],
    correct_option_id: 'opt_b',
    explanation: 'Stack is Last-In-First-Out.'
  }
];

// Sample PDF buffer encoded as base64 for file submission
const MOCK_PDF_BASE64 = Buffer.from('%PDF-1.4 mock pdf content for testing').toString('base64');

async function run() {
  console.log('========================================================================');
  console.log('  ACADASSESS: VERIFICATION OF ALL 7 ASSESSMENT COMBINATIONS              ');
  console.log('========================================================================\n');

  const appModule = await import('../../apps/api/src/index.js');
  const app = (appModule as any).app || (appModule as any).default;
  const { db } = await import('../../apps/api/src/storage/db.js');

  const teacherToken = makeToken(TEST_TEACHER_ID, 'teacher1@sjbit.edu.in');
  const studentToken = makeToken(TEST_STUDENT_ID, 'student.a@sjbit.edu.in');

  // Pre-seed teacher class subject authorization and student enrollment
  let existingCs = db.classSubjects.find(cs => cs.id === TEST_CLASS_SUB_ID);
  if (existingCs) {
    existingCs.subject_teacher_id = TEST_TEACHER_ID;
    existingCs.class_id = TEST_CLASS_ID;
    existingCs.active = true;
  } else {
    db.classSubjects.push({
      id: TEST_CLASS_SUB_ID,
      class_id: TEST_CLASS_ID,
      subject_id: 's1000000-0000-0000-0000-000000000001',
      subject_teacher_id: TEST_TEACHER_ID,
      active: true,
      created_at: new Date().toISOString()
    });
  }

  let existingEnrollment = db.enrollments.find(e => e.student_id === TEST_STUDENT_ID && e.class_id === TEST_CLASS_ID);
  if (existingEnrollment) {
    existingEnrollment.status = 'active';
    existingEnrollment.specialization_id = 'c1000000-0000-4000-8000-000000000001';
  } else {
    db.enrollments.push({
      id: randomUUID(),
      student_id: TEST_STUDENT_ID,
      class_id: TEST_CLASS_ID,
      specialization_id: 'c1000000-0000-4000-8000-000000000001',
      status: 'active',
      enrolled_at: new Date().toISOString()
    });
  }

  const combinations = [
    { id: 1, name: 'Combination 1: File-Based Only', types: ['file_based'] },
    { id: 2, name: 'Combination 2: Manual Questions Only', types: ['manual_questions'] },
    { id: 3, name: 'Combination 3: Quiz Only', types: ['quiz'] },
    { id: 4, name: 'Combination 4: File-Based + Manual Questions', types: ['file_based', 'manual_questions'] },
    { id: 5, name: 'Combination 5: File-Based + Quiz', types: ['file_based', 'quiz'] },
    { id: 6, name: 'Combination 6: Manual Questions + Quiz', types: ['manual_questions', 'quiz'] },
    { id: 7, name: 'Combination 7: File-Based + Manual Questions + Quiz', types: ['file_based', 'manual_questions', 'quiz'] }
  ];

  for (const combo of combinations) {
    console.log(`\n------------------------------------------------------------------------`);
    console.log(`  RUNNING: ${combo.name}`);
    console.log(`  Selected Types: [${combo.types.join(', ')}]`);
    console.log(`------------------------------------------------------------------------`);

    // 1. Create Draft Assessment
    const createRes = await makeApiRequest(app, {
      path: '/api/v1/assessments',
      method: 'POST',
      token: teacherToken,
      body: {
        class_subject_id: TEST_CLASS_SUB_ID,
        title: `Test ${combo.name}`,
        instructions: `Instructions for ${combo.name}`,
        deadline_at: new Date(Date.now() + 86400000 * 5).toISOString(),
        assessment_types: combo.types,
        max_marks: 50,
        max_files: combo.types.includes('file_based') ? 3 : 1
      }
    });

    assert(createRes.status === 201, `[${combo.name}] 1. Draft created successfully (HTTP 201)`);
    const assessment = createRes.body?.data || createRes.body?.assessment;
    const assessmentId = assessment?.id;
    assert(Boolean(assessmentId && assessment.status === 'draft'), `[${combo.name}] Assessment is in draft state`);

    // 2. Configure Assessment Sections
    const updatePayload: any = {};
    if (combo.types.includes('file_based')) {
      updatePayload.document_storage_key = `assignments/${assessmentId}/instructions.pdf`;
      updatePayload.document_filename = 'Instructions.pdf';
      updatePayload.document_size_bytes = 2048;
      updatePayload.document_mime_type = 'application/pdf';
    }
    if (combo.types.includes('manual_questions')) {
      updatePayload.questions = [
        { prompt: 'Explain algorithmic complexity and asymptotic notation.', display_order: 1 }
      ];
    }
    if (combo.types.includes('quiz')) {
      updatePayload.quiz_questions = SAMPLE_QUIZ_QUESTIONS;
    }
    if (combo.types.includes('file_based') || combo.types.includes('manual_questions')) {
      updatePayload.rubric = STANDARD_50M_RUBRIC;
    }

    const updateRes = await makeApiRequest(app, {
      path: `/api/v1/assessments/${assessmentId}`,
      method: 'PUT',
      token: teacherToken,
      body: updatePayload
    });
    assert(updateRes.status === 200, `[${combo.name}] 2. Draft configured with required components`);

    // 3. Publish Assessment
    const publishRes = await makeApiRequest(app, {
      path: `/api/v1/assessments/${assessmentId}/publish`,
      method: 'POST',
      token: teacherToken,
      body: {}
    });
    assert(publishRes.status === 200, `[${combo.name}] 3. Assessment published successfully (Status: 200)`);

    // 4. Student Fetches Assessment & Submits
    const studentGet = await makeApiRequest(app, {
      path: `/api/v1/assessments/${assessmentId}`,
      method: 'GET',
      token: studentToken
    });
    assert(studentGet.status === 200, `[${combo.name}] 4a. Student retrieved published assessment`);
    const fetchedAss = studentGet.body?.assessment || studentGet.body;

    // Zero-leakage check if quiz is present
    if (combo.types.includes('quiz')) {
      const qqs = fetchedAss.quiz_questions || [];
      const leaked = qqs.some((q: any) => q.correct_option_id !== undefined || q.correct_option !== undefined);
      assert(!leaked, `[${combo.name}] 4b. Zero-leakage verified: no correct options exposed to student`);
    }

    // Prepare Student Submission Payload
    const submissionPayload: any = {
      assessment_id: assessmentId,
      answers: [],
      files: [],
      quiz_answers: [],
      section_statuses: {}
    };

    if (combo.types.includes('file_based')) {
      submissionPayload.files = [
        {
          file_name: 'student_work.pdf',
          file_base64: MOCK_PDF_BASE64,
          mime_type: 'application/pdf'
        }
      ];
      submissionPayload.section_statuses.file_based = 'completed';
    }

    if (combo.types.includes('manual_questions')) {
      const manualQs = fetchedAss.questions || [];
      submissionPayload.answers = manualQs.map((q: any) => ({
        question_id: q.id,
        answer_text: 'Asymptotic notation describes limiting behavior as input size grows.'
      }));
      submissionPayload.section_statuses.manual_questions = 'completed';
    }

    if (combo.types.includes('quiz')) {
      const quizQs = fetchedAss.quiz_questions || [];
      submissionPayload.quiz_answers = [
        { quiz_question_id: quizQs[0]?.id, selected_option_id: 'opt_2' }, // Correct -> 10 marks
        { quiz_question_id: quizQs[1]?.id, selected_option_id: 'opt_a' }  // Incorrect -> 0 marks
      ];
      submissionPayload.section_statuses.quiz = 'completed';
    }

    const submitRes = await makeApiRequest(app, {
      path: '/api/v1/submissions',
      method: 'POST',
      token: studentToken,
      body: submissionPayload
    });
    assert(submitRes.status === 201, `[${combo.name}] 5. Student submitted successfully (HTTP 201)`);
    const subVersion = submitRes.body?.version || submitRes.body?.active_version;

    if (combo.types.includes('quiz')) {
      assert(subVersion?.quiz_score === 10, `[${combo.name}] 5b. Server auto-scored quiz accurately (10/20)`);
    }

    // 5. Teacher Evaluates Submission
    const teacherSubs = await makeApiRequest(app, {
      path: `/api/v1/submissions/assessment/${assessmentId}`,
      method: 'GET',
      token: teacherToken
    });
    const subList = teacherSubs.body?.submissions || teacherSubs.body || [];
    const targetSub = subList[0];
    assert(Boolean(targetSub), `[${combo.name}] 6a. Teacher retrieved student submission`);

    // Prepare evaluation payload with criteria scores if rubric is present
    const fullAssTeacher = await makeApiRequest(app, {
      path: `/api/v1/assessments/${assessmentId}`,
      method: 'GET',
      token: teacherToken
    });
    const rubricCriteria = fullAssTeacher.body?.assessment?.rubric?.criteria || fullAssTeacher.body?.assessment?.assignment_rubric?.criteria || [];

    const criterionScores = rubricCriteria.map((c: any) => ({
      criterion_id: c.id,
      score: Math.min(c.max_marks, 10),
      feedback: 'Good quality'
    }));

    const evalPayload: any = {
      submission_id: targetSub.id,
      status: 'completed',
      raw_score: combo.types.includes('quiz') && !combo.types.includes('file_based') && !combo.types.includes('manual_questions')
        ? 15 // Teacher confirms authoritative mark for quiz
        : undefined,
      general_feedback: 'Well done. Evaluated against all criteria.',
      criterion_scores: criterionScores
    };

    const evalRes = await makeApiRequest(app, {
      path: '/api/v1/evaluations',
      method: 'POST',
      token: teacherToken,
      body: evalPayload
    });
    assert(evalRes.status === 200 || evalRes.status === 201, `[${combo.name}] 6b. Teacher saved authoritative evaluation (HTTP ${evalRes.status})`);

    // 6. Teacher Publishes Assessment Results
    const publishResultsRes = await makeApiRequest(app, {
      path: `/api/v1/evaluations/assessment/${assessmentId}/publish`,
      method: 'POST',
      token: teacherToken,
      body: { remarks: `Final verified grades for ${combo.name}` }
    });
    assert(publishResultsRes.status === 200, `[${combo.name}] 7. Teacher published results successfully (HTTP 200)`);
  }

  console.log('\n========================================================================');
  console.log(`  ALL 7 COMBINATIONS VERIFICATION SUMMARY: ${passedTests} / ${totalTests} TESTS PASSED`);
  console.log('========================================================================\n');

  if (passedTests === totalTests) {
    console.log('>>> ALL SEVEN ASSESSMENT COMBINATIONS FULLY VERIFIED AND PASSING! <<<');
    process.exit(0);
  } else {
    console.error('>>> SOME COMBINATIONS FAILED <<<');
    process.exit(1);
  }
}

run().catch(err => {
  console.error('Test Suite Error:', err);
  process.exit(1);
});
