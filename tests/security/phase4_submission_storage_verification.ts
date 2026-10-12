import jwt from 'jsonwebtoken';
import app from '../../apps/api/src/index.js';
import http from 'http';
import { db } from '../../apps/api/src/storage/db.js';

/**
 * Phase 4 Comprehensive Student Submission & Private Storage Verification Suite
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

// Generate valid synthetic PDF buffer starting with '%PDF-1.4'
function createValidPdfBuffer(content: string = 'Sample handwritten answer text'): Buffer {
  return Buffer.from(`%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n% ${content}\n%%EOF`);
}

async function runTests() {
  console.log('================================================================');
  console.log('  SMARTFA PHASE 4: SUBMISSION & PRIVATE STORAGE VERIFICATION    ');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail: string = '') {
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName} - ${detail}`);
      failed++;
    }
  }

  try {
    // Identities from seed
    const teacher1Token = createToken('a2000000-0000-0000-0000-000000000001', 'teacher1@smartfa.edu'); // Assigned to cs1
    const teacher2Token = createToken('a2000000-0000-0000-0000-000000000002', 'teacher2@smartfa.edu'); // Not assigned to cs1
    const student1Token = createToken('a4000000-0000-0000-0000-000000000001', 'student.a@smartfa.edu'); // Enrolled in c1
    const student2Token = createToken('a4000000-0000-0000-0000-000000000002', 'student.b@smartfa.edu'); // Enrolled in c1
    const unenrolledStudentToken = createToken('a4000000-0000-0000-0000-000000000003', 'student.c@smartfa.edu'); // Student role, but not enrolled in c1
    const hodToken = createToken('a1000000-0000-0000-0000-000000000001', 'hod@smartfa.edu');

    // Setup an active published assessment for testing
    const classSubjectId = 'c5100000-0000-0000-0000-000000000001';
    const futureDeadline = new Date(Date.now() + 2 * 86400000).toISOString();

    const createAssRes = await makeRequest({
      path: '/api/v1/assessments',
      method: 'POST',
      token: teacher1Token,
      body: {
        class_subject_id: classSubjectId,
        title: 'Phase 4 Submission Test Assessment',
        instructions: 'Submit handwritten solutions as PDF before deadline.',
        deadline_at: futureDeadline
      }
    });
    const assessmentId = createAssRes.body?.assessment?.id;

    const addQ1Res = await makeRequest({
      path: `/api/v1/assessments/${assessmentId}/questions`,
      method: 'POST',
      token: teacher1Token,
      body: { display_order: 1, prompt: 'Solve Dynamic Programming Knapsack problem.', max_marks: 10 }
    });
    const q1Id = addQ1Res.body?.question?.id;

    // Add valid rubric to question
    await makeRequest({
      path: `/api/v1/assessments/${assessmentId}/questions/${q1Id}/rubric`,
      method: 'POST',
      token: teacher1Token,
      body: {
        title: 'DP Knapsack Rubric',
        criteria: [
          { display_order: 1, title: 'State Definition', description: 'Table structure', max_marks: 5, levels: [] },
          { display_order: 2, title: 'Recurrence Proof', description: 'Correct formula', max_marks: 5, levels: [] }
        ]
      }
    });

    // 1. Unauthenticated submission upload rejected
    const res1 = await makeRequest({
      path: '/api/v1/submissions',
      method: 'POST',
      body: { assessment_id: assessmentId, question_id: q1Id, file_name: 'test.pdf', file_base64: 'abc' }
    });
    assert(res1.status === 401, 'Test 1: Unauthenticated upload rejected (401 UNAUTHORIZED)');

    // 2. Teacher attempting to upload submission rejected (only students submit)
    const validPdf = createValidPdfBuffer();
    const res2 = await makeRequest({
      path: '/api/v1/submissions',
      method: 'POST',
      token: teacher1Token,
      body: {
        assessment_id: assessmentId,
        question_id: q1Id,
        file_name: 'teacher.pdf',
        file_base64: validPdf.toString('base64')
      }
    });
    assert(res2.status === 403, 'Test 2: Non-student role denied submission creation (403 FORBIDDEN)');

    // 3. Submitting to draft assessment rejected
    const res3 = await makeRequest({
      path: '/api/v1/submissions',
      method: 'POST',
      token: student1Token,
      body: {
        assessment_id: assessmentId,
        question_id: q1Id,
        file_name: 'draft_submission.pdf',
        file_base64: validPdf.toString('base64')
      }
    });
    assert(
      res3.status === 400 && res3.body?.error?.code === 'ASSESSMENT_NOT_OPEN',
      'Test 3: Submission to draft assessment rejected (400 ASSESSMENT_NOT_OPEN)'
    );

    // Publish the assessment now
    await makeRequest({
      path: `/api/v1/assessments/${assessmentId}/publish`,
      method: 'POST',
      token: teacher1Token
    });

    // 4. Student not enrolled in the class rejected
    const res4 = await makeRequest({
      path: '/api/v1/submissions',
      method: 'POST',
      token: unenrolledStudentToken,
      body: {
        assessment_id: assessmentId,
        question_id: q1Id,
        file_name: 'outsider.pdf',
        file_base64: validPdf.toString('base64')
      }
    });
    assert(
      res4.status === 403 && res4.body?.error?.code === 'NOT_ENROLLED',
      'Test 4: Non-enrolled student denied submission (403 NOT_ENROLLED)'
    );

    // 5. Invalid question ID rejected
    const res5 = await makeRequest({
      path: '/api/v1/submissions',
      method: 'POST',
      token: student1Token,
      body: {
        assessment_id: assessmentId,
        question_id: '00000000-0000-0000-0000-000000000099',
        file_name: 'invalid_q.pdf',
        file_base64: validPdf.toString('base64')
      }
    });
    assert(
      res5.status === 400 && res5.body?.error?.code === 'INVALID_QUESTION',
      'Test 5: Submitting to invalid question rejected (400 INVALID_QUESTION)'
    );

    // 6. Non-PDF file (corrupt magic bytes) rejected
    const fakePdfBuffer = Buffer.from('Plain text file masquerading as a PDF document');
    const res6 = await makeRequest({
      path: '/api/v1/submissions',
      method: 'POST',
      token: student1Token,
      body: {
        assessment_id: assessmentId,
        question_id: q1Id,
        file_name: 'fake.pdf',
        file_base64: fakePdfBuffer.toString('base64')
      }
    });
    assert(
      res6.status === 400 && res6.body?.error?.code === 'INVALID_FILE_TYPE',
      'Test 6: Non-PDF file missing magic bytes rejected (400 INVALID_FILE_TYPE)'
    );

    // 7. File exceeding 5 MB limit rejected
    const oversizedBuffer = Buffer.alloc(5 * 1024 * 1024 + 1024); // 5 MB + 1 KB
    oversizedBuffer.write('%PDF-1.4\n');
    const res7 = await makeRequest({
      path: '/api/v1/submissions',
      method: 'POST',
      token: student1Token,
      body: {
        assessment_id: assessmentId,
        question_id: q1Id,
        file_name: 'oversized.pdf',
        file_base64: oversizedBuffer.toString('base64')
      }
    });
    assert(
      res7.status === 400 && res7.body?.error?.code === 'FILE_SIZE_EXCEEDED',
      'Test 7: File exceeding 5 MB rejected (400 FILE_SIZE_EXCEEDED)'
    );

    // 8. Valid student PDF submission succeeds (201 Created)
    const validAnswerPdf = createValidPdfBuffer('Student 1 Answer for Question 1');
    const res8 = await makeRequest({
      path: '/api/v1/submissions',
      method: 'POST',
      token: student1Token,
      body: {
        assessment_id: assessmentId,
        question_id: q1Id,
        file_name: 'student1_q1_v1.pdf',
        file_base64: validAnswerPdf.toString('base64')
      }
    });
    assert(
      res8.status === 201 &&
      res8.body?.receipt?.version === 1 &&
      res8.body?.receipt?.sha256?.length === 64 &&
      res8.body?.receipt?.is_resubmission === false,
      'Test 8: Valid PDF submission succeeds; receipt generated (201 Created)'
    );
    const submissionId = res8.body?.receipt?.submission_id;
    const v1Id = res8.body?.receipt?.version_id;
    const v1StoragePath = res8.body?.receipt?.storage_path;

    // 9. Verify storage blob exists in private storage
    assert(
      db.storageBlobs.has(v1StoragePath),
      'Test 9: Private storage contains PDF buffer at authorized path'
    );

    // 10. Resubmission before deadline succeeds (200 OK) with version incremented to 2
    const revisedAnswerPdf = createValidPdfBuffer('Student 1 Revised Answer for Question 1');
    const res10 = await makeRequest({
      path: '/api/v1/submissions',
      method: 'POST',
      token: student1Token,
      body: {
        assessment_id: assessmentId,
        question_id: q1Id,
        file_name: 'student1_q1_v2.pdf',
        file_base64: revisedAnswerPdf.toString('base64')
      }
    });
    assert(
      res10.status === 200 &&
      res10.body?.receipt?.submission_id === submissionId &&
      res10.body?.receipt?.version === 2 &&
      res10.body?.receipt?.is_resubmission === true,
      'Test 10: Resubmission before deadline succeeds with version 2 (200 OK)'
    );
    const v2Id = res10.body?.receipt?.version_id;

    // 11. Verify historical versioning: v1 is marked superseded, v2 is active
    const subRecord = db.submissions.find(s => s.id === submissionId);
    const v1Record = db.submissionVersions.find(v => v.id === v1Id);
    const v2Record = db.submissionVersions.find(v => v.id === v2Id);
    assert(
      subRecord?.active_version_id === v2Id &&
      v1Record?.superseded_at !== null &&
      v2Record?.superseded_at === null,
      'Test 11: Invariant enforced: v1 is superseded and v2 is active version'
    );

    // 12. Student can query their submission for the assessment (200 OK)
    const res12 = await makeRequest({
      path: `/api/v1/submissions/assessment/${assessmentId}`,
      method: 'GET',
      token: student1Token
    });
    assert(
      res12.status === 200 &&
      res12.body?.submissions?.length === 1 &&
      res12.body?.submissions[0]?.versions?.length === 2,
      'Test 12: Student queries own submissions with version history (200 OK)'
    );

    // 13. Another student (student 2) cannot download student 1's submitted PDF (403 FORBIDDEN)
    const res13 = await makeRequest({
      path: `/api/v1/submissions/${submissionId}/versions/${v2Id}/download`,
      method: 'GET',
      token: student2Token
    });
    assert(
      res13.status === 403,
      'Test 13: Cross-student private download denied (403 FORBIDDEN)'
    );

    // 14. Owner student (student 1) can securely download their own submission (200 OK)
    const res14 = await makeRequest({
      path: `/api/v1/submissions/${submissionId}/versions/${v2Id}/download`,
      method: 'GET',
      token: student1Token
    });
    assert(
      res14.status === 200 &&
      res14.headers['content-type'] === 'application/pdf',
      'Test 14: Owner student downloads private PDF with application/pdf header (200 OK)'
    );

    // 15. Assigned Subject Teacher can query student submissions for the assessment (200 OK)
    const res15 = await makeRequest({
      path: `/api/v1/submissions/assessment/${assessmentId}`,
      method: 'GET',
      token: teacher1Token
    });
    assert(
      res15.status === 200 &&
      res15.body?.submissions?.length >= 1,
      'Test 15: Assigned Subject Teacher accesses student submissions (200 OK)'
    );

    // 16. Assigned Subject Teacher can download student's PDF (200 OK)
    const res16 = await makeRequest({
      path: `/api/v1/submissions/${submissionId}/versions/${v2Id}/download`,
      method: 'GET',
      token: teacher1Token
    });
    assert(
      res16.status === 200 &&
      res16.headers['content-type'] === 'application/pdf',
      'Test 16: Assigned Subject Teacher downloads student submission PDF (200 OK)'
    );

    // 17. Unassigned teacher cannot query or download submissions for this subject (403 FORBIDDEN)
    const res17 = await makeRequest({
      path: `/api/v1/submissions/assessment/${assessmentId}`,
      method: 'GET',
      token: teacher2Token
    });
    assert(
      res17.status === 403,
      'Test 17: Unassigned teacher denied accessing assessment submissions (403 FORBIDDEN)'
    );

    // 18. Deadline enforcement: Manipulate assessment deadline into the past and verify submission is locked
    const targetAss = db.assessments.find(a => a.id === assessmentId);
    if (targetAss) {
      targetAss.deadline_at = new Date(Date.now() - 3600000).toISOString(); // 1 hour ago
    }

    const res18 = await makeRequest({
      path: '/api/v1/submissions',
      method: 'POST',
      token: student1Token,
      body: {
        assessment_id: assessmentId,
        question_id: q1Id,
        file_name: 'late_v3.pdf',
        file_base64: validPdf.toString('base64')
      }
    });
    assert(
      res18.status === 400 && res18.body?.error?.code === 'DEADLINE_PASSED',
      'Test 18: Invariant enforced: Submissions strictly locked past deadline (400 DEADLINE_PASSED)'
    );

    // 19. Audit trail contains both SUBMIT_ANSWER and RESUBMIT_ANSWER events
    const res19 = await makeRequest({
      path: '/api/v1/admin/hod/audit',
      method: 'GET',
      token: hodToken
    });
    const hasSubmitEvent = res19.body?.events?.some((e: any) => e.action === 'SUBMIT_ANSWER');
    const hasResubmitEvent = res19.body?.events?.some((e: any) => e.action === 'RESUBMIT_ANSWER');
    assert(
      res19.status === 200 && hasSubmitEvent && hasResubmitEvent,
      'Test 19: Audit trail contains SUBMIT_ANSWER and RESUBMIT_ANSWER events'
    );

  } catch (err) {
    console.error('Unexpected error during Phase 4 test execution:', err);
    failed++;
  }

  console.log('\n----------------------------------------------------------------');
  console.log(`TOTAL: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log('----------------------------------------------------------------\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests();
