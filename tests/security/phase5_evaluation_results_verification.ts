process.env.SMARTFA_TEST_MODE = 'true';
import jwt from 'jsonwebtoken';
import app from '../../apps/api/src/index.js';
import http from 'http';
import { db } from '../../apps/api/src/storage/db.js';
import { randomUUID } from 'crypto';

/**
 * Phase 5 Comprehensive Teacher Evaluation, Marks Management & Results Publication Verification Suite
 */

const DEV_JWT_SECRET = 'smartfa-test-hmac-dev-secret-key-32chars';

function createToken(userId: string, email: string): string {
  return jwt.sign({ sub: userId, email }, DEV_JWT_SECRET, { expiresIn: '1h' });
}

function makeRequest(options: {
  path: string;
  method: string;
  token?: string;
  body?: any;
}): Promise<{ status: number; body: any; headers: http.IncomingHttpHeaders }> {
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
              const parsed = JSON.parse(data);
              resolve({ status: res.statusCode || 500, body: parsed, headers: res.headers });
            } catch {
              resolve({ status: res.statusCode || 500, body: data, headers: res.headers });
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

let totalTests = 0;
let passedTests = 0;

function assert(condition: boolean, testName: string, failureDetails?: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  [PASS] Test ${totalTests}: ${testName}`);
  } else {
    console.error(`  [FAIL] Test ${totalTests}: ${testName}`);
    if (failureDetails) console.error(`         Details: ${failureDetails}`);
    throw new Error(`Assertion failed: ${testName}`);
  }
}

async function runPhase5Tests() {
  console.log('================================================================');
  console.log(' ACADASSESS: PHASE 5 EVALUATION & RESULTS PUBLICATION VERIFICATION');
  console.log('================================================================\n');

  // Seed Users
  const teacher1 = db.profiles.find(p => p.email === 'teacher1@smartfa.edu')!;
  const teacher2 = db.profiles.find(p => p.email === 'teacher2@smartfa.edu')!;
  const studentA = db.profiles.find(p => p.email === 'student.a@smartfa.edu')!;
  const studentB = db.profiles.find(p => p.email === 'student.b@smartfa.edu')!;
  const hod = db.profiles.find(p => p.email === 'hod@smartfa.edu')!;

  const tokenTeacher1 = createToken(teacher1.id, teacher1.email);
  const tokenTeacher2 = createToken(teacher2.id, teacher2.email);
  const tokenStudentA = createToken(studentA.id, studentA.email);
  const tokenStudentB = createToken(studentB.id, studentB.email);
  const tokenHOD = createToken(hod.id, hod.email);

  // Setup Test Assessment, Question, Rubric, and Submission in Memory DB
  const classSubject1 = db.classSubjects[0]; // Assigned to teacher1
  const assessmentId = randomUUID();
  const questionId = randomUUID();
  const rubricVersionId = randomUUID();
  const criterion1Id = randomUUID();
  const criterion2Id = randomUUID();
  const level1Id = randomUUID();
  const level2Id = randomUUID();

  // Create Assessment
  db.assessments.push({
    id: assessmentId,
    class_subject_id: classSubject1.id,
    title: 'Phase 5 Formative Test Assessment',
    instructions: 'Submit PDF answer for algorithmic analysis.',
    deadline_at: new Date(Date.now() + 86400000).toISOString(),
    status: 'published',
    created_by: teacher1.id,
    published_at: new Date().toISOString(),
    published_by: teacher1.id,
    version: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  });

  // Create Question (Max 20 Marks)
  db.questions.push({
    id: questionId,
    assessment_id: assessmentId,
    display_order: 1,
    prompt: 'Implement and analyze Dijkstra Shortest Path algorithm complexity.',
    max_marks: 20,
    created_at: new Date().toISOString()
  });

  // Create Rubric Version
  db.rubricVersions.push({
    id: rubricVersionId,
    template_id: null,
    question_id: questionId,
    version: 1,
    title: 'Dijkstra Evaluation Rubric',
    frozen_at: new Date().toISOString(),
    created_by: teacher1.id,
    created_at: new Date().toISOString()
  });

  // Create Rubric Criteria (12 marks + 8 marks = 20 marks)
  db.rubricCriteria.push(
    {
      id: criterion1Id,
      rubric_version_id: rubricVersionId,
      display_order: 1,
      title: 'Algorithm Correctness & Logic',
      description: 'Correct relaxation and priority queue usage',
      max_marks: 12,
      created_at: new Date().toISOString()
    },
    {
      id: criterion2Id,
      rubric_version_id: rubricVersionId,
      display_order: 2,
      title: 'Time & Space Complexity Proof',
      description: 'Formal Big-O derivation for adjacency list',
      max_marks: 8,
      created_at: new Date().toISOString()
    }
  );

  // Create Rubric Levels
  db.rubricLevels.push(
    {
      id: level1Id,
      criterion_id: criterion1Id,
      display_order: 1,
      label: 'Exemplary',
      description: 'Completely correct graph traversal and priority relaxation',
      min_guidance: 10,
      max_guidance: 12,
      created_at: new Date().toISOString()
    },
    {
      id: level2Id,
      criterion_id: criterion2Id,
      display_order: 1,
      label: 'Adequate',
      description: 'Sound theoretical proof with minor derivation gaps',
      min_guidance: 6,
      max_guidance: 8,
      created_at: new Date().toISOString()
    }
  );

  // Create Student Submission
  const submissionId = randomUUID();
  const subVersionId = randomUUID();
  db.submissions.push({
    id: submissionId,
    assessment_id: assessmentId,
    question_id: questionId,
    student_id: studentA.id,
    active_version_id: subVersionId,
    status: 'uploaded',
    first_submitted_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  });

  db.submissionVersions.push({
    id: subVersionId,
    submission_id: submissionId,
    version: 1,
    storage_path: `assessments/${assessmentId}/questions/${questionId}/students/${studentA.id}/submissions/${submissionId}/v1.pdf`,
    original_name: 'student_a_answer.pdf',
    mime_type: 'application/pdf',
    size_bytes: 1024,
    sha256: 'a'.repeat(64),
    uploaded_at: new Date().toISOString(),
    superseded_at: null
  });

  console.log('--- 1. Authentication & Role Authorization Invariants ---');

  // Test 1: Unauthenticated evaluation request rejected with 401
  const res1 = await makeRequest({
    path: '/api/v1/evaluations',
    method: 'POST',
    body: {
      submission_id: submissionId,
      status: 'draft',
      criterion_scores: [{ criterion_id: criterion1Id, score: 10 }]
    }
  });
  assert(res1.status === 401, 'Unauthenticated evaluation rejected with HTTP 401');

  // Test 2: Student caller rejected from saving evaluation (403)
  const res2 = await makeRequest({
    path: '/api/v1/evaluations',
    method: 'POST',
    token: tokenStudentA,
    body: {
      submission_id: submissionId,
      status: 'draft',
      criterion_scores: [{ criterion_id: criterion1Id, score: 10 }]
    }
  });
  assert(res2.status === 403, 'Student caller prohibited from evaluating submissions (HTTP 403)');

  // Test 3: Unassigned teacher rejected from evaluating assessment (403)
  const res3 = await makeRequest({
    path: '/api/v1/evaluations',
    method: 'POST',
    token: tokenTeacher2, // Not assigned to classSubject1
    body: {
      submission_id: submissionId,
      status: 'draft',
      criterion_scores: [{ criterion_id: criterion1Id, score: 10 }]
    }
  });
  assert(res3.status === 403, 'Unassigned teacher prohibited from evaluating subject (HTTP 403)');

  console.log('\n--- 2. Rubric Score Validation & Server-Side Total Computation ---');

  // Test 4: Negative criterion score rejected (400)
  const res4 = await makeRequest({
    path: '/api/v1/evaluations',
    method: 'POST',
    token: tokenTeacher1,
    body: {
      submission_id: submissionId,
      status: 'draft',
      criterion_scores: [{ criterion_id: criterion1Id, score: -2 }]
    }
  });
  assert(
    res4.status === 400 && (res4.body.error?.code === 'VALIDATION_ERROR' || res4.body.error?.code === 'INVALID_SCORE'),
    'Negative criterion score rejected (HTTP 400)'
  );

  // Test 5: Score exceeding criterion max marks rejected (400)
  const res5 = await makeRequest({
    path: '/api/v1/evaluations',
    method: 'POST',
    token: tokenTeacher1,
    body: {
      submission_id: submissionId,
      status: 'draft',
      criterion_scores: [{ criterion_id: criterion1Id, score: 15 }] // Max is 12
    }
  });
  assert(res5.status === 400 && res5.body.error?.code === 'SCORE_EXCEEDS_MAX', 'Score exceeding criterion max marks rejected (HTTP 400)');

  // Test 6: Save evaluation draft succeeds and computes server total
  const res6 = await makeRequest({
    path: '/api/v1/evaluations',
    method: 'POST',
    token: tokenTeacher1,
    body: {
      submission_id: submissionId,
      status: 'draft',
      general_feedback: 'Preliminary review - logic is solid.',
      criterion_scores: [
        { criterion_id: criterion1Id, selected_level_id: level1Id, score: 11, feedback: 'Great relaxation implementation' }
      ]
    }
  });
  assert(res6.status === 201, 'Evaluation draft created successfully (HTTP 201)');
  assert(res6.body.evaluation.status === 'draft', 'Evaluation status recorded as draft');
  assert(res6.body.evaluation.total_score === 11, 'Server calculated total score (11)');

  console.log('\n--- 3. Premature Grade Leakage Prevention ---');

  // Test 7: Student attempting to view unpublished evaluation draft is blocked (403)
  const res7 = await makeRequest({
    path: `/api/v1/evaluations/submission/${submissionId}`,
    method: 'GET',
    token: tokenStudentA
  });
  assert(res7.status === 403 && res7.body.error?.code === 'RESULTS_NOT_PUBLISHED', 'Student blocked from viewing unpublished evaluation (HTTP 403)');

  // Test 8: Student querying /student/my-results receives 0 unpublished results
  const res8 = await makeRequest({
    path: '/api/v1/evaluations/student/my-results',
    method: 'GET',
    token: tokenStudentA
  });
  assert(res8.status === 200, 'Student results query succeeds (HTTP 200)');
  assert(res8.body.results.length === 0, 'Zero results returned to student while assessment results are unpublished');

  console.log('\n--- 4. Completed Evaluation & Incomplete Criteria Rejection ---');

  // Test 9: Marking status 'completed' without scoring all criteria is rejected
  const res9 = await makeRequest({
    path: '/api/v1/evaluations',
    method: 'POST',
    token: tokenTeacher1,
    body: {
      submission_id: submissionId,
      status: 'completed',
      criterion_scores: [
        { criterion_id: criterion1Id, score: 10 } // Missing criterion2Id
      ]
    }
  });
  assert(res9.status === 400 && res9.body.error?.code === 'INCOMPLETE_EVALUATION', 'Completed evaluation requires all criteria to be scored (HTTP 400)');

  // Test 10: Complete evaluation with all criteria scored succeeds
  const res10 = await makeRequest({
    path: '/api/v1/evaluations',
    method: 'POST',
    token: tokenTeacher1,
    body: {
      submission_id: submissionId,
      status: 'completed',
      general_feedback: 'Comprehensive and thorough Dijkstra solution.',
      criterion_scores: [
        { criterion_id: criterion1Id, selected_level_id: level1Id, score: 11, feedback: 'Correct algorithm structure' },
        { criterion_id: criterion2Id, selected_level_id: level2Id, score: 7, feedback: 'Good complexity analysis' }
      ]
    }
  });
  assert(res10.status === 200, 'Complete evaluation updated successfully (HTTP 200)');
  assert(res10.body.evaluation.status === 'completed', 'Evaluation status updated to completed');
  assert(res10.body.evaluation.total_score === 18, 'Server computed total score = 11 + 7 = 18');

  console.log('\n--- 5. Atomic Results Publication & Student Results Access ---');

  // Test 11: Teacher publishes results for assessment
  const res11 = await makeRequest({
    path: `/api/v1/evaluations/assessment/${assessmentId}/publish`,
    method: 'POST',
    token: tokenTeacher1,
    body: {
      remarks: 'Formative Assessment 1 official grades released.'
    }
  });
  assert(res11.status === 200, 'Assessment results published successfully (HTTP 200)');
  assert(res11.body.published_count === 1, 'Published count equals 1');

  // Test 12: Cannot republish already published assessment results
  const res12 = await makeRequest({
    path: `/api/v1/evaluations/assessment/${assessmentId}/publish`,
    method: 'POST',
    token: tokenTeacher1,
    body: { remarks: 'Republish attempt' }
  });
  assert(res12.status === 400 && res12.body.error?.code === 'ALREADY_PUBLISHED', 'Republishing assessment results rejected (HTTP 400)');

  // Test 13: Student can now view their published evaluation with complete breakdown
  const res13 = await makeRequest({
    path: `/api/v1/evaluations/submission/${submissionId}`,
    method: 'GET',
    token: tokenStudentA
  });
  assert(res13.status === 200, 'Student can access evaluation after publication (HTTP 200)');
  assert(res13.body.evaluation.status === 'published', 'Evaluation status is published');
  assert(res13.body.evaluation.total_score === 18, 'Total score matches evaluated marks');
  assert(res13.body.evaluation.criterion_scores.length === 2, 'Criterion score breakdown includes both criteria');

  // Test 14: Student A querying /student/my-results returns 1 published result
  const res14 = await makeRequest({
    path: '/api/v1/evaluations/student/my-results',
    method: 'GET',
    token: tokenStudentA
  });
  assert(res14.status === 200, 'Student results retrieval succeeds (HTTP 200)');
  assert(res14.body.results.length === 1, 'Exactly 1 published result returned');
  assert(res14.body.results[0].total_score === 18, 'Published result total score is 18');

  // Test 15: Student B cannot view Student A published submission evaluation (403)
  const res15 = await makeRequest({
    path: `/api/v1/evaluations/submission/${submissionId}`,
    method: 'GET',
    token: tokenStudentB
  });
  assert(res15.status === 403, 'Cross-student access to another student evaluation denied (HTTP 403)');

  // Test 16: Modifying already published evaluation is rejected (400)
  const res16 = await makeRequest({
    path: '/api/v1/evaluations',
    method: 'POST',
    token: tokenTeacher1,
    body: {
      submission_id: submissionId,
      status: 'completed',
      criterion_scores: [
        { criterion_id: criterion1Id, score: 10 },
        { criterion_id: criterion2Id, score: 5 }
      ]
    }
  });
  assert(res16.status === 400 && res16.body.error?.code === 'ALREADY_PUBLISHED', 'Tampering with already published evaluation rejected (HTTP 400)');

  console.log('\n--- 6. Audit Trail Invariants ---');

  // Test 17: Audit events logged for save draft, complete evaluation, and publish results
  const evalAuditEvents = db.auditEvents.filter(
    ae => ae.action === 'SAVE_EVALUATION_DRAFT' || ae.action === 'COMPLETE_EVALUATION' || ae.action === 'PUBLISH_ASSESSMENT_RESULTS'
  );
  assert(evalAuditEvents.some(e => e.action === 'SAVE_EVALUATION_DRAFT'), 'Audit event logged for SAVE_EVALUATION_DRAFT');
  assert(evalAuditEvents.some(e => e.action === 'COMPLETE_EVALUATION'), 'Audit event logged for COMPLETE_EVALUATION');
  assert(evalAuditEvents.some(e => e.action === 'PUBLISH_ASSESSMENT_RESULTS'), 'Audit event logged for PUBLISH_ASSESSMENT_RESULTS');

  console.log(`\n================================================================`);
  console.log(` PHASE 5 EVALUATION & RESULTS VERIFICATION: ${passedTests}/${totalTests} TESTS PASSED`);
  console.log(`================================================================\n`);
}

runPhase5Tests().catch((err) => {
  console.error('\n[PHASE 5 TEST FATAL ERROR]:', err);
  process.exit(1);
});
