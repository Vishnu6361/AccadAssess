process.env.SMARTFA_TEST_MODE = 'true';
import jwt from 'jsonwebtoken';
import app from '../../apps/api/src/index.js';
import http from 'http';
import { db } from '../../apps/api/src/storage/db.js';
import { randomUUID, createHash } from 'crypto';

/**
 * Phase 6 Comprehensive Local End-to-End Academic Integration Verification Suite
 * 
 * Verifies the full core lifecycle from HOD academic setup through student results publication:
 * 1. HOD creates department, academic term, class, subject, teacher assignment (class_subject), and student enrollments.
 * 2. Role restrictions and boundary enforcement on assessment authoring.
 * 3. Assigned teacher authors assessment, configures questions, binds rubric criteria and achievement levels, and publishes.
 * 4. Post-publish lifecycle locking (assessments, questions, rubrics become frozen).
 * 5. Student uploads PDF submission with SHA-256 fingerprint; submits revision before deadline (v2 supersedes v1).
 * 6. Premature grade leakage prevention & cross-student submission privacy.
 * 7. Faculty rubric grading: validation of score bounds [0, max_marks], server-side total computation, draft state, incomplete rubric rejection.
 * 8. Atomic results publication: result_publications record created, evaluation status transitioned to published.
 * 9. Post-publication access: student retrieves published marks and criterion feedback; cross-student access denied.
 * 10. Immutability guarantees: published assessments and published evaluations cannot be mutated.
 * 11. Immutable audit trail validation for all lifecycle events.
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

function createValidPdfBuffer(content: string = 'Institutional answer sheet'): Buffer {
  return Buffer.from(`%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n% Content: ${content}\n%%EOF`);
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
    throw new Error(`Assertion failed: ${testName} - ${failureDetails || ''}`);
  }
}

async function runPhase6E2E() {
  console.log('================================================================');
  console.log(' ACADASSESS: PHASE 6 END-TO-END INTEGRATION VERIFICATION SUITE  ');
  console.log('================================================================\n');

  // Authoritative identities
  const HOD_ID = 'a1000000-0000-0000-0000-000000000001';
  const TEACHER1_ID = 'a2000000-0000-0000-0000-000000000001'; // Will be assigned
  const TEACHER2_ID = 'a2000000-0000-0000-0000-000000000002'; // Unassigned
  const PROCTOR_ID = 'a3000000-0000-0000-0000-000000000001';
  const STUDENT_A_ID = 'a4000000-0000-0000-0000-000000000001';
  const STUDENT_B_ID = 'a4000000-0000-0000-0000-000000000002';

  const hodToken = createToken(HOD_ID, 'hod@smartfa.edu');
  const teacher1Token = createToken(TEACHER1_ID, 'teacher1@smartfa.edu');
  const teacher2Token = createToken(TEACHER2_ID, 'teacher2@smartfa.edu');
  const proctorToken = createToken(PROCTOR_ID, 'proctor@smartfa.edu');
  const studentAToken = createToken(STUDENT_A_ID, 'student.a@smartfa.edu');
  const studentBToken = createToken(STUDENT_B_ID, 'student.b@smartfa.edu');

  // --- STAGE 1: HOD ACADEMIC STRUCTURE SETUP ---
  console.log('--- 1. HOD Academic Structure Setup & Role Checks ---');

  // Non-HOD cannot create programme
  const unauthProgRes = await makeRequest({
    path: '/api/v1/admin/hod/programmes',
    method: 'POST',
    token: teacher1Token,
    body: { code: 'E2E_CS', name: 'Computer Science & Engineering', duration_years: 2, total_semesters: 4 }
  });
  assert(unauthProgRes.status === 403, 'Teacher cannot create academic programme (HTTP 403)');

  // HOD creates new Programme
  const progCode = `MCA_${Date.now().toString().slice(-4)}`;
  const createProgRes = await makeRequest({
    path: '/api/v1/admin/hod/programmes',
    method: 'POST',
    token: hodToken,
    body: { code: progCode, name: 'Master of Computer Applications E2E', duration_years: 2, total_semesters: 4 }
  });
  assert(createProgRes.status === 201, 'HOD creates programme (HTTP 201)');
  const progId = createProgRes.body.programme.id;

  // HOD creates Academic Term
  const termRes = await makeRequest({
    path: '/api/v1/admin/hod/terms',
    method: 'POST',
    token: hodToken,
    body: {
      name: `Spring 2027 E2E ${Date.now().toString().slice(-4)}`,
      starts_on: '2027-01-01',
      ends_on: '2027-06-30'
    }
  });
  assert(termRes.status === 201, 'HOD creates academic term (HTTP 201)');
  const termId = termRes.body.term.id;

  // HOD creates Class
  const classRes = await makeRequest({
    path: '/api/v1/admin/hod/classes',
    method: 'POST',
    token: hodToken,
    body: {
      term_id: termId,
      programme: 'MCA',
      semester: 4,
      section: 'A'
    }
  });
  assert(classRes.status === 201, 'HOD creates class section (HTTP 201)', JSON.stringify(classRes.body));
  const classId = classRes.body.class.id;

  // HOD creates Subject
  const subjectCode = `CS${Date.now().toString().slice(-4)}`;
  const subjectRes = await makeRequest({
    path: '/api/v1/admin/hod/subjects',
    method: 'POST',
    token: hodToken,
    body: {
      code: subjectCode,
      name: 'Advanced Web Architectures & Security',
      credits: 4
    }
  });
  assert(subjectRes.status === 201, 'HOD creates subject (HTTP 201)', JSON.stringify(subjectRes.body));
  const subjectId = subjectRes.body.subject.id;

  // HOD allocates Teacher 1 to Class & Subject
  const assignRes = await makeRequest({
    path: '/api/v1/admin/hod/class-subjects',
    method: 'POST',
    token: hodToken,
    body: {
      class_id: classId,
      subject_id: subjectId,
      subject_teacher_id: TEACHER1_ID
    }
  });
  assert(assignRes.status === 201, 'HOD assigns Teacher 1 to class-subject (HTTP 201)');
  const classSubjectId = assignRes.body.class_subject.id;

  // HOD enrolls Student A and Student B into Class
  const enrollARes = await makeRequest({
    path: '/api/v1/admin/hod/enrollments',
    method: 'POST',
    token: hodToken,
    body: { class_id: classId, student_id: STUDENT_A_ID }
  });
  assert(enrollARes.status === 201, 'HOD enrolls Student A into class (HTTP 201)');

  const enrollBRes = await makeRequest({
    path: '/api/v1/admin/hod/enrollments',
    method: 'POST',
    token: hodToken,
    body: { class_id: classId, student_id: STUDENT_B_ID }
  });
  assert(enrollBRes.status === 201, 'HOD enrolls Student B into class (HTTP 201)');

  // --- STAGE 2: TEACHER ASSESSMENT AUTHORING & RUBRIC CONFIGURATION ---
  console.log('\n--- 2. Teacher Assessment Authoring & Rubric Configuration ---');

  // Student prohibited from creating assessment
  const studentCreateRes = await makeRequest({
    path: '/api/v1/assessments',
    method: 'POST',
    token: studentAToken,
    body: {
      class_subject_id: classSubjectId,
      title: 'Hacked Assessment',
      deadline_at: new Date(Date.now() + 86400000).toISOString()
    }
  });
  assert(studentCreateRes.status === 403, 'Student cannot create assessment (HTTP 403)');

  // Unassigned Teacher 2 prohibited from creating assessment for this class_subject
  const teacher2CreateRes = await makeRequest({
    path: '/api/v1/assessments',
    method: 'POST',
    token: teacher2Token,
    body: {
      class_subject_id: classSubjectId,
      title: 'Unauthorized Teacher Assessment',
      instructions: 'Unauthorized instructions',
      deadline_at: new Date(Date.now() + 86400000).toISOString()
    }
  });
  assert(teacher2CreateRes.status === 403, 'Unassigned Teacher 2 prohibited from creating assessment (HTTP 403)', `Status: ${teacher2CreateRes.status}, Body: ${JSON.stringify(teacher2CreateRes.body)}`);

  // Assigned Teacher 1 creates Assessment
  const assessmentDeadline = new Date(Date.now() + 7 * 86400000).toISOString();
  const createAssessRes = await makeRequest({
    path: '/api/v1/assessments',
    method: 'POST',
    token: teacher1Token,
    body: {
      class_subject_id: classSubjectId,
      title: 'Formative Assessment 1: Microservices Architecture',
      instructions: 'Submit handwritten or digital architectural breakdown as a PDF.',
      deadline_at: assessmentDeadline
    }
  });
  assert(createAssessRes.status === 201, 'Assigned Teacher creates draft assessment (HTTP 201)');
  const assessmentId = createAssessRes.body.assessment.id;
  assert(createAssessRes.body.assessment.status === 'draft', 'Assessment starts in draft status');

  // Enrolled student cannot view draft assessment
  const studentViewDraftRes = await makeRequest({
    path: `/api/v1/assessments/${assessmentId}`,
    method: 'GET',
    token: studentAToken
  });
  assert(studentViewDraftRes.status === 403, 'Student prohibited from viewing draft assessment (HTTP 403)');

  // Teacher adds Question to Assessment
  const addQuestionRes = await makeRequest({
    path: `/api/v1/assessments/${assessmentId}/questions`,
    method: 'POST',
    token: teacher1Token,
    body: {
      prompt: 'Q1: Design and explain a resilient event-driven microservices pattern.',
      display_order: 1,
      max_marks: 20
    }
  });
  assert(addQuestionRes.status === 201, 'Teacher adds Question 1 (20 marks) (HTTP 201)');
  const questionId = addQuestionRes.body.question.id;

  // Teacher configures Rubric for Question 1 (Criterion 1: 12 marks, Criterion 2: 8 marks = 20 marks total)
  const saveRubricRes = await makeRequest({
    path: `/api/v1/assessments/${assessmentId}/questions/${questionId}/rubric`,
    method: 'POST',
    token: teacher1Token,
    body: {
      title: 'Architectural Correctness & Resiliency Rubric',
      criteria: [
        {
          display_order: 1,
          title: 'Architectural Correctness & Decomposition',
          description: 'Sound boundary decomposition and event messaging topology',
          max_marks: 12,
          levels: [
            { display_order: 1, label: 'Exemplary', description: 'Flawless event topology with failure recovery' },
            { display_order: 2, label: 'Proficient', description: 'Sound service separation with minor gaps' },
            { display_order: 3, label: 'Developing', description: 'Partial decomposition with tight coupling' },
            { display_order: 4, label: 'Unacceptable', description: 'Monolithic or severely flawed design' }
          ]
        },
        {
          display_order: 2,
          title: 'Data Consistency & Resiliency',
          description: 'Saga patterns, idempotency and outbox table management',
          max_marks: 8,
          levels: [
            { display_order: 1, label: 'Exemplary', description: 'Distributed saga with idempotency verified' },
            { display_order: 2, label: 'Satisfactory', description: 'Basic saga pattern implemented' },
            { display_order: 3, label: 'Insufficient', description: 'No consistency or distributed recovery' }
          ]
        }
      ]
    }
  });
  assert(saveRubricRes.status === 201, 'Teacher creates Rubric with 2 balanced criteria (HTTP 201)', JSON.stringify(saveRubricRes.body));
  const savedCriteria = saveRubricRes.body.rubric.criteria;
  const criterion1Id = savedCriteria[0].id;
  const exemplaryLevel1Id = savedCriteria[0].levels[0]?.id;
  const criterion2Id = savedCriteria[1].id;
  const exemplaryLevel2Id = savedCriteria[1].levels[0]?.id;

  // --- STAGE 3: ASSESSMENT PUBLICATION & IMMUTABILITY FREEZE ---
  console.log('\n--- 3. Assessment Publication & Immutability Freeze ---');

  // Teacher publishes assessment
  const publishAssessRes = await makeRequest({
    path: `/api/v1/assessments/${assessmentId}/publish`,
    method: 'POST',
    token: teacher1Token
  });
  assert(publishAssessRes.status === 200, 'Teacher publishes assessment (HTTP 200)');
  assert(publishAssessRes.body.assessment.status === 'published', 'Assessment status is published');

  // Invariant: Cannot add questions once published
  const postPubQuestionRes = await makeRequest({
    path: `/api/v1/assessments/${assessmentId}/questions`,
    method: 'POST',
    token: teacher1Token,
    body: { prompt: 'Q2: Extra Question', display_order: 2, max_marks: 10 }
  });
  assert(postPubQuestionRes.status === 400, 'Cannot add questions to published assessment (HTTP 400)');

  // Invariant: Cannot mutate rubric once assessment is published
  const postPubRubricRes = await makeRequest({
    path: `/api/v1/assessments/${assessmentId}/questions/${questionId}/rubric`,
    method: 'POST',
    token: teacher1Token,
    body: {
      title: 'Mutated Rubric',
      criteria: [
        {
          display_order: 1,
          title: 'Late Mutated Criterion',
          description: 'Should be rejected',
          max_marks: 20,
          levels: []
        }
      ]
    }
  });
  assert(postPubRubricRes.status === 400, 'Cannot mutate rubric once assessment is published (HTTP 400)');

  // Enrolled Student A can now view published assessment
  const studentViewPubRes = await makeRequest({
    path: `/api/v1/assessments/${assessmentId}`,
    method: 'GET',
    token: studentAToken
  });
  assert(studentViewPubRes.status === 200, 'Student A can view published assessment (HTTP 200)');
  assert(studentViewPubRes.body.assessment.questions.length === 1, 'Assessment contains published question');

  // --- STAGE 4: STUDENT PDF SUBMISSION & REVISION VERSIONING ---
  console.log('\n--- 4. Student PDF Submission & Revision Versioning ---');

  const pdfV1 = createValidPdfBuffer('Aarav Patel Solution Version 1: Initial event-driven architecture.');
  const pdfHashV1 = createHash('sha256').update(pdfV1).digest('hex');

  // Student A submits Version 1
  const submitV1Res = await makeRequest({
    path: '/api/v1/submissions',
    method: 'POST',
    token: studentAToken,
    body: {
      assessment_id: assessmentId,
      question_id: questionId,
      file_base64: pdfV1.toString('base64'),
      file_name: 'patel_aarav_fa1_v1.pdf',
      file_size_bytes: pdfV1.length,
      mime_type: 'application/pdf',
      sha256: pdfHashV1
    }
  });
  assert(submitV1Res.status === 201, 'Student A uploads PDF submission v1 (HTTP 201)', JSON.stringify(submitV1Res.body));
  const submissionId = submitV1Res.body.receipt.submission_id;
  assert(submitV1Res.body.receipt.sha256 === pdfHashV1, 'SHA-256 fingerprint verified for v1');

  // Student A submits Version 2 before deadline (revision)
  const pdfV2 = createValidPdfBuffer('Aarav Patel Solution Version 2: Enhanced with Outbox Pattern & CDC.');
  const pdfHashV2 = createHash('sha256').update(pdfV2).digest('hex');

  const submitV2Res = await makeRequest({
    path: '/api/v1/submissions',
    method: 'POST',
    token: studentAToken,
    body: {
      assessment_id: assessmentId,
      question_id: questionId,
      file_base64: pdfV2.toString('base64'),
      file_name: 'patel_aarav_fa1_v2.pdf',
      file_size_bytes: pdfV2.length,
      mime_type: 'application/pdf',
      sha256: pdfHashV2
    }
  });
  assert(submitV2Res.status === 200, 'Student A uploads revision v2 before deadline (HTTP 200)', JSON.stringify(submitV2Res.body));
  assert(submitV2Res.body.receipt.submission_id === submissionId, 'Submission ID retained across versions');
  assert(submitV2Res.body.receipt.version === 2, 'Active version updated to v2');

  // Verify version history: v1 is superseded
  const versionsRes = await makeRequest({
    path: `/api/v1/submissions/${submissionId}`,
    method: 'GET',
    token: studentAToken
  });
  assert(versionsRes.status === 200, 'Student A retrieves submission version history (HTTP 200)', JSON.stringify(versionsRes.body));
  const retrievedVersions = versionsRes.body.submission.versions;
  assert(retrievedVersions.length === 2, 'Two versions recorded in version history');
  const v1Record = retrievedVersions.find((v: any) => v.version === 1);
  assert(Boolean(v1Record?.superseded_at), 'Version 1 marked as superseded');

  // --- STAGE 5: DATA ISOLATION & PREMATURE GRADE LEAKAGE PREVENTION ---
  console.log('\n--- 5. Data Isolation & Premature Grade Leakage Prevention ---');

  // Student B cannot access Student A's submission
  const crossSubRes = await makeRequest({
    path: `/api/v1/submissions/${submissionId}`,
    method: 'GET',
    token: studentBToken
  });
  assert(crossSubRes.status === 403, 'Cross-student submission access denied (HTTP 403)');

  // Student A checks evaluation before publication -> 403 RESULTS_NOT_PUBLISHED
  const preGradeEvalRes = await makeRequest({
    path: `/api/v1/evaluations/submission/${submissionId}`,
    method: 'GET',
    token: studentAToken
  });
  assert(preGradeEvalRes.status === 403, 'Student blocked from querying evaluation before publication (HTTP 403 RESULTS_NOT_PUBLISHED)');

  // Teacher 1 checks evaluation before grading -> 404 EVALUATION_NOT_FOUND
  const teacherPreGradeEvalRes = await makeRequest({
    path: `/api/v1/evaluations/submission/${submissionId}`,
    method: 'GET',
    token: teacher1Token
  });
  assert(teacherPreGradeEvalRes.status === 404, 'Teacher gets 404 for ungraded submission evaluation (HTTP 404)');

  // Student A checks my-results before publication -> returns 0 results
  const prePubResultsRes = await makeRequest({
    path: '/api/v1/evaluations/student/my-results',
    method: 'GET',
    token: studentAToken
  });
  assert(prePubResultsRes.status === 200, 'Student my-results query succeeds (HTTP 200)');
  assert(prePubResultsRes.body.results.length === 0, 'Zero results returned prior to publication');

  // --- STAGE 6: FACULTY RUBRIC EVALUATION & VALIDATION ---
  console.log('\n--- 6. Faculty Rubric Evaluation & Score Validation ---');

  // Unassigned Teacher 2 cannot evaluate submission
  const teacher2EvalRes = await makeRequest({
    path: '/api/v1/evaluations',
    method: 'POST',
    token: teacher2Token,
    body: {
      submission_id: submissionId,
      status: 'draft',
      criterion_scores: [{ criterion_id: criterion1Id, score: 10 }]
    }
  });
  assert(teacher2EvalRes.status === 403, 'Unassigned Teacher 2 cannot evaluate submission (HTTP 403)');

  // Proctor cannot evaluate submission
  const proctorEvalRes = await makeRequest({
    path: '/api/v1/evaluations',
    method: 'POST',
    token: proctorToken,
    body: {
      submission_id: submissionId,
      status: 'draft',
      criterion_scores: [{ criterion_id: criterion1Id, score: 10 }]
    }
  });
  assert(proctorEvalRes.status === 403, 'Proctor cannot evaluate submission (HTTP 403)');

  // Score validation: Negative score rejected
  const negScoreRes = await makeRequest({
    path: '/api/v1/evaluations',
    method: 'POST',
    token: teacher1Token,
    body: {
      submission_id: submissionId,
      status: 'draft',
      criterion_scores: [{ criterion_id: criterion1Id, score: -2 }]
    }
  });
  assert(negScoreRes.status === 400, 'Negative criterion score rejected (HTTP 400)');

  // Score validation: Exceeding criterion max_marks rejected (Criterion 1 max is 12)
  const excessScoreRes = await makeRequest({
    path: '/api/v1/evaluations',
    method: 'POST',
    token: teacher1Token,
    body: {
      submission_id: submissionId,
      status: 'draft',
      criterion_scores: [{ criterion_id: criterion1Id, score: 15 }]
    }
  });
  assert(excessScoreRes.status === 400, 'Score exceeding criterion max_marks rejected (HTTP 400)');

  // Incomplete evaluation: 'completed' status rejected if not all criteria are scored
  const incompleteEvalRes = await makeRequest({
    path: '/api/v1/evaluations',
    method: 'POST',
    token: teacher1Token,
    body: {
      submission_id: submissionId,
      status: 'completed',
      criterion_scores: [{ criterion_id: criterion1Id, score: 11 }] // Missing criterion 2
    }
  });
  assert(incompleteEvalRes.status === 400, 'Incomplete evaluation rejected when marking completed (HTTP 400)');

  // Teacher saves draft evaluation (partial criteria allowed in draft)
  const draftEvalRes = await makeRequest({
    path: '/api/v1/evaluations',
    method: 'POST',
    token: teacher1Token,
    body: {
      submission_id: submissionId,
      status: 'draft',
      general_feedback: 'Drafting initial assessment of microservices topology.',
      criterion_scores: [
        {
          criterion_id: criterion1Id,
          selected_level_id: exemplaryLevel1Id,
          score: 11,
          feedback: 'Comprehensive event modeling'
        }
      ]
    }
  });
  assert(draftEvalRes.status === 201, 'Teacher saves draft evaluation (HTTP 201)');
  assert(draftEvalRes.body.evaluation.status === 'draft', 'Evaluation status is draft');
  assert(draftEvalRes.body.evaluation.total_score === 11, 'Server computed draft total = 11');

  // Student A blocked from viewing draft evaluation (PREVENT PREMATURE LEAKAGE)
  const studentViewDraftEvalRes = await makeRequest({
    path: `/api/v1/evaluations/submission/${submissionId}`,
    method: 'GET',
    token: studentAToken
  });
  assert(studentViewDraftEvalRes.status === 403, 'Student blocked from viewing draft evaluation (HTTP 403 RESULTS_NOT_PUBLISHED)');

  // Teacher updates evaluation to 'completed' with all criteria scored (11 + 7 = 18 marks out of 20)
  const completeEvalRes = await makeRequest({
    path: '/api/v1/evaluations',
    method: 'POST',
    token: teacher1Token,
    body: {
      submission_id: submissionId,
      status: 'completed',
      general_feedback: 'Exceptional submission with clear architectural rationale and outbox pattern.',
      criterion_scores: [
        {
          criterion_id: criterion1Id,
          selected_level_id: exemplaryLevel1Id,
          score: 11,
          feedback: 'Excellent service boundaries'
        },
        {
          criterion_id: criterion2Id,
          selected_level_id: exemplaryLevel2Id,
          score: 7,
          feedback: 'Clear saga orchestration and idempotency semantics'
        }
      ]
    }
  });
  assert(completeEvalRes.status === 200, 'Teacher completes evaluation with all criteria (HTTP 200)');
  assert(completeEvalRes.body.evaluation.status === 'completed', 'Evaluation status is completed');
  assert(completeEvalRes.body.evaluation.total_score === 18, 'Server computed total score = 18 (11 + 7)');

  // Student A STILL blocked from viewing completed evaluation before results publication!
  const studentViewCompletedEvalRes = await makeRequest({
    path: `/api/v1/evaluations/submission/${submissionId}`,
    method: 'GET',
    token: studentAToken
  });
  assert(studentViewCompletedEvalRes.status === 403, 'Student blocked from viewing completed evaluation before publication (HTTP 403)');

  // --- STAGE 7: OFFICIAL RESULTS PUBLICATION ---
  console.log('\n--- 7. Official Results Publication ---');

  // Student cannot publish assessment results
  const studentPubResultsRes = await makeRequest({
    path: `/api/v1/evaluations/assessment/${assessmentId}/publish`,
    method: 'POST',
    token: studentAToken,
    body: { remarks: 'Hacked publication' }
  });
  assert(studentPubResultsRes.status === 403, 'Student cannot publish results (HTTP 403)');

  // Assigned Teacher publishes official results
  const pubResultsRes = await makeRequest({
    path: `/api/v1/evaluations/assessment/${assessmentId}/publish`,
    method: 'POST',
    token: teacher1Token,
    body: { remarks: 'Official Formative Assessment 1 results approved and published.' }
  });
  assert(pubResultsRes.status === 200, 'Assigned Teacher publishes official results (HTTP 200)');
  assert(pubResultsRes.body.published_count === 1, 'Exactly 1 evaluation published');
  assert(Boolean(pubResultsRes.body.publication.published_at), 'Publication timestamp recorded');

  // Invariant: Cannot re-publish assessment results
  const republishRes = await makeRequest({
    path: `/api/v1/evaluations/assessment/${assessmentId}/publish`,
    method: 'POST',
    token: teacher1Token,
    body: { remarks: 'Republish attempt' }
  });
  assert(republishRes.status === 400, 'Cannot re-publish assessment results (HTTP 400 ALREADY_PUBLISHED)');

  // --- STAGE 8: POST-PUBLICATION ACCESS & CROSS-STUDENT PRIVACY ---
  console.log('\n--- 8. Post-Publication Access & Cross-Student Privacy ---');

  // Student A can now view published evaluation
  const studentPubEvalRes = await makeRequest({
    path: `/api/v1/evaluations/submission/${submissionId}`,
    method: 'GET',
    token: studentAToken
  });
  assert(studentPubEvalRes.status === 200, 'Student A accesses evaluation after publication (HTTP 200)');
  assert(studentPubEvalRes.body.evaluation.status === 'published', 'Evaluation status is published');
  assert(studentPubEvalRes.body.evaluation.total_score === 18, 'Total score matches evaluated marks (18/20)');
  assert(studentPubEvalRes.body.evaluation.criterion_scores.length === 2, 'Rubric criterion breakdown returned');

  // Student A retrieves my-results list
  const studentMyResultsRes = await makeRequest({
    path: '/api/v1/evaluations/student/my-results',
    method: 'GET',
    token: studentAToken
  });
  assert(studentMyResultsRes.status === 200, 'Student A retrieves my-results list (HTTP 200)');
  assert(studentMyResultsRes.body.results.length === 1, 'Exactly 1 published result returned to Student A');
  assert(studentMyResultsRes.body.results[0].total_score === 18, 'Published result score is 18');

  // Cross-student privacy: Student B cannot access Student A's published evaluation
  const studentBCrossEvalRes = await makeRequest({
    path: `/api/v1/evaluations/submission/${submissionId}`,
    method: 'GET',
    token: studentBToken
  });
  assert(studentBCrossEvalRes.status === 403, 'Student B denied access to Student A evaluation (HTTP 403)');

  // Student B's my-results remains empty (Student B did not submit or have published results)
  const studentBMyResultsRes = await makeRequest({
    path: '/api/v1/evaluations/student/my-results',
    method: 'GET',
    token: studentBToken
  });
  assert(studentBMyResultsRes.status === 200, 'Student B my-results query succeeds (HTTP 200)');
  assert(studentBMyResultsRes.body.results.length === 0, 'Student B sees zero results for their account');

  // --- STAGE 9: IMMUTABILITY GUARANTEES ---
  console.log('\n--- 9. Immutability Guarantees ---');

  // Invariant: Teacher cannot modify evaluation after publication
  const postPubGradeModRes = await makeRequest({
    path: '/api/v1/evaluations',
    method: 'POST',
    token: teacher1Token,
    body: {
      submission_id: submissionId,
      status: 'completed',
      criterion_scores: [{ criterion_id: criterion1Id, score: 5 }]
    }
  });
  assert(postPubGradeModRes.status === 400, 'Modifying published evaluation rejected (HTTP 400 ALREADY_PUBLISHED)');

  // Invariant: Teacher cannot modify assessment metadata after publication
  const postPubAssessModRes = await makeRequest({
    path: `/api/v1/assessments/${assessmentId}`,
    method: 'PUT',
    token: teacher1Token,
    body: { title: 'Modified Assessment Title' }
  });
  assert(postPubAssessModRes.status === 400, 'Modifying published assessment rejected (HTTP 400 LIFECYCLE_LOCKED)');

  // --- STAGE 10: AUDIT TRAIL COMPLETE VERIFICATION ---
  console.log('\n--- 10. Audit Trail Complete Verification ---');

  const auditRes = await makeRequest({
    path: '/api/v1/admin/hod/audit?limit=100',
    method: 'GET',
    token: hodToken
  });
  assert(auditRes.status === 200, 'HOD retrieves audit trail (HTTP 200)');
  const events = auditRes.body.events || [];

  const requiredActions = [
    'CREATE_PROGRAMME',
    'ASSIGN_CLASS_SUBJECT',
    'ENROLL_STUDENT',
    'CREATE_ASSESSMENT',
    'PUBLISH_ASSESSMENT',
    'SUBMIT_ANSWER',
    'RESUBMIT_ANSWER',
    'SAVE_EVALUATION_DRAFT',
    'COMPLETE_EVALUATION',
    'PUBLISH_ASSESSMENT_RESULTS'
  ];

  for (const action of requiredActions) {
    const hasEvent = events.some((e: any) => e.action === action);
    assert(hasEvent, `Audit event recorded for: ${action}`);
  }

  console.log('\n================================================================');
  console.log(` PHASE 6 E2E INTEGRATION VERIFICATION: ${passedTests}/${totalTests} TESTS PASSED`);
  console.log('================================================================\n');
}

runPhase6E2E().catch((err) => {
  console.error('\n[FATAL TEST RUN ERROR]:', err);
  process.exit(1);
});
