process.env.SMARTFA_TEST_MODE = 'true';
import jwt from 'jsonwebtoken';
import app from '../../apps/api/src/index.js';
import http from 'http';

/**
 * Phase 3 Comprehensive Assessment & Rubric Invariant Verification Suite
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
}): Promise<{ status: number; body: any }> {
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
              resolve({ status: res.statusCode || 500, body: parsed });
            } catch {
              resolve({ status: res.statusCode || 500, body: data });
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

async function runTests() {
  console.log('================================================================');
  console.log('  SMARTFA PHASE 3: ASSESSMENT & RUBRIC INVARIANT VERIFICATION   ');
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
    const teacher1Token = createToken('a2000000-0000-0000-0000-000000000001', 'teacher1@smartfa.edu'); // Assigned to cs100000-0000-0000-0000-000000000001
    const teacher2Token = createToken('a2000000-0000-0000-0000-000000000002', 'teacher2@smartfa.edu'); // Not assigned to cs1
    const student1Token = createToken('a4000000-0000-0000-0000-000000000001', 'student.a@smartfa.edu'); // Enrolled in class c1
    const hodToken = createToken('a1000000-0000-0000-0000-000000000001', 'hod@smartfa.edu');

    const classSubjectId = 'c5100000-0000-0000-0000-000000000001';

    // 1. Unauthenticated request to /assessments rejected
    const res1 = await makeRequest({ path: '/api/v1/assessments', method: 'GET' });
    assert(res1.status === 401, 'Test 1: Unauthenticated request rejected (401 UNAUTHORIZED)');

    // 2. Student attempting to author assessment rejected
    const res2 = await makeRequest({
      path: '/api/v1/assessments',
      method: 'POST',
      token: student1Token,
      body: {
        class_subject_id: classSubjectId,
        title: 'Hacked Assessment',
        instructions: 'Should fail',
        deadline_at: new Date(Date.now() + 86400000).toISOString()
      }
    });
    assert(res2.status === 403, 'Test 2: Student denied assessment creation (403 FORBIDDEN)');

    // 3. Unassigned teacher attempting to author assessment for another teacher's class_subject
    const res3 = await makeRequest({
      path: '/api/v1/assessments',
      method: 'POST',
      token: teacher2Token,
      body: {
        class_subject_id: classSubjectId,
        title: 'Unauthorized Assessment',
        instructions: 'Should fail',
        deadline_at: new Date(Date.now() + 86400000).toISOString()
      }
    });
    assert(
      res3.status === 403 && res3.body?.error?.code === 'FORBIDDEN_UNASSIGNED_TEACHER',
      'Test 3: Unassigned teacher denied authoring assessment for unassigned subject (403)'
    );

    // 4. Past deadline rejected
    const res4 = await makeRequest({
      path: '/api/v1/assessments',
      method: 'POST',
      token: teacher1Token,
      body: {
        class_subject_id: classSubjectId,
        title: 'Past Deadline FA',
        instructions: 'Should fail with past deadline',
        deadline_at: new Date(Date.now() - 3600000).toISOString() // 1 hour in the past
      }
    });
    assert(
      res4.status === 400 && res4.body?.error?.code === 'INVALID_DEADLINE',
      'Test 4: Past deadline rejected with 400 INVALID_DEADLINE'
    );

    // 5. Authorized Subject Teacher creates draft assessment
    const validFutureDeadline = new Date(Date.now() + 7 * 86400000).toISOString(); // 7 days from now
    const res5 = await makeRequest({
      path: '/api/v1/assessments',
      method: 'POST',
      token: teacher1Token,
      body: {
        class_subject_id: classSubjectId,
        title: 'Formative Assessment 1: Algorithm Analysis',
        instructions: 'Handwrite answers on plain paper, scan as PDF, and submit before deadline.',
        deadline_at: validFutureDeadline
      }
    });
    assert(
      res5.status === 201 && res5.body?.assessment?.status === 'draft',
      'Test 5: Assigned Subject Teacher creates draft assessment (201 Created)'
    );

    const assessmentId = res5.body?.assessment?.id;

    // 6. Draft assessment is invisible to students
    const res6 = await makeRequest({
      path: `/api/v1/assessments/${assessmentId}`,
      method: 'GET',
      token: student1Token
    });
    assert(
      res6.status === 403 && res6.body?.error?.code === 'FORBIDDEN',
      'Test 6: Invariant enforced: Draft assessment is invisible to students (403 FORBIDDEN)'
    );

    // 7. Add Question 1 (10 marks)
    const res7 = await makeRequest({
      path: `/api/v1/assessments/${assessmentId}/questions`,
      method: 'POST',
      token: teacher1Token,
      body: {
        display_order: 1,
        prompt: 'Explain Time Complexity of QuickSort in Best, Average, and Worst Case scenarios.',
        max_marks: 10
      }
    });
    assert(res7.status === 201 && res7.body?.question?.max_marks === 10, 'Test 7: Added Question 1 (10 marks)');
    const q1Id = res7.body?.question?.id;

    // 8. Add Question 2 (15 marks)
    const res8 = await makeRequest({
      path: `/api/v1/assessments/${assessmentId}/questions`,
      method: 'POST',
      token: teacher1Token,
      body: {
        display_order: 2,
        prompt: 'Prove Master Theorem Case 2 with an example recurrence relation.',
        max_marks: 15
      }
    });
    assert(res8.status === 201 && res8.body?.question?.max_marks === 15, 'Test 8: Added Question 2 (15 marks)');
    const q2Id = res8.body?.question?.id;

    // 9. Reject publication when rubrics are missing
    const res9 = await makeRequest({
      path: `/api/v1/assessments/${assessmentId}/publish`,
      method: 'POST',
      token: teacher1Token
    });
    assert(
      res9.status === 422 && res9.body?.error?.code === 'MISSING_RUBRIC',
      'Test 9: Invariant enforced: Cannot publish assessment with missing rubrics (422)'
    );

    // 10. Rubric sum mismatch test: Question 1 max marks is 10, but criteria sum to 8 (5 + 3 = 8)
    await makeRequest({
      path: `/api/v1/assessments/${assessmentId}/questions/${q1Id}/rubric`,
      method: 'POST',
      token: teacher1Token,
      body: {
        title: 'QuickSort Complexity Rubric',
        criteria: [
          {
            display_order: 1,
            title: 'Recurrence Relations Formulation',
            description: 'Accurate derivation of recurrences',
            max_marks: 5,
            levels: [{ display_order: 1, label: 'Excellent', description: 'Complete formulation' }]
          },
          {
            display_order: 2,
            title: 'Worst Case Partition Analysis',
            description: 'Pivot selection analysis',
            max_marks: 3,
            levels: [{ display_order: 1, label: 'Satisfactory', description: 'Adequate explanation' }]
          }
        ]
      }
    });

    const res10 = await makeRequest({
      path: `/api/v1/assessments/${assessmentId}/publish`,
      method: 'POST',
      token: teacher1Token
    });
    assert(
      res10.status === 422 && res10.body?.error?.code === 'RUBRIC_TOTAL_MISMATCH',
      'Test 10: Invariant enforced: Publication rejected when rubric criteria sum (8) != question max marks (10)'
    );

    // 11. Fix Question 1 rubric: Add Criterion 3 with 2 marks so sum equals question max marks (5 + 3 + 2 = 10)
    const res11 = await makeRequest({
      path: `/api/v1/assessments/${assessmentId}/questions/${q1Id}/rubric`,
      method: 'POST',
      token: teacher1Token,
      body: {
        title: 'QuickSort Complexity Rubric',
        criteria: [
          {
            display_order: 1,
            title: 'Recurrence Relations Formulation',
            description: 'Accurate derivation of recurrences',
            max_marks: 5,
            levels: [{ display_order: 1, label: 'Excellent', description: 'Complete formulation' }]
          },
          {
            display_order: 2,
            title: 'Worst Case Partition Analysis',
            description: 'Pivot selection analysis',
            max_marks: 3,
            levels: [{ display_order: 1, label: 'Satisfactory', description: 'Adequate explanation' }]
          },
          {
            display_order: 3,
            title: 'Asymptotic Bounds Conclusion',
            description: 'Big-O notation conclusions',
            max_marks: 2,
            levels: [{ display_order: 1, label: 'Clear', description: 'Clear bounds stated' }]
          }
        ]
      }
    });
    assert(
      res11.status === 201 && res11.body?.rubric?.criteria?.length === 3,
      'Test 11: Saved balanced rubric for Question 1 (201 Created)'
    );

    // 12. Also add matching rubric for Question 2 (max_marks = 15; criteria sum: 10 + 5 = 15)
    const res12 = await makeRequest({
      path: `/api/v1/assessments/${assessmentId}/questions/${q2Id}/rubric`,
      method: 'POST',
      token: teacher1Token,
      body: {
        title: 'Master Theorem Proof Rubric',
        criteria: [
          {
            display_order: 1,
            title: 'Proof Derivation',
            description: 'Mathematical induction on recursion tree',
            max_marks: 10,
            levels: [{ display_order: 1, label: 'Rigorous', description: 'Step by step proof' }]
          },
          {
            display_order: 2,
            title: 'Worked Example Application',
            description: 'Correct execution on sample recurrence',
            max_marks: 5,
            levels: [{ display_order: 1, label: 'Accurate', description: 'Correct application' }]
          }
        ]
      }
    });
    assert(
      res12.status === 201 && res12.body?.rubric?.criteria?.length === 2,
      'Test 12: Saved balanced rubric for Question 2 (201 Created)'
    );

    // 13. Publish assessment now succeeds transactionally!
    const res13 = await makeRequest({
      path: `/api/v1/assessments/${assessmentId}/publish`,
      method: 'POST',
      token: teacher1Token
    });
    assert(
      res13.status === 200 &&
      res13.body?.assessment?.status === 'published' &&
      res13.body?.assessment?.published_at != null,
      'Test 13: Assessment published successfully; rubric versions frozen (200 OK)'
    );

    // 14. Post-publication lock invariant: cannot modify published assessment
    const res14 = await makeRequest({
      path: `/api/v1/assessments/${assessmentId}`,
      method: 'PUT',
      token: teacher1Token,
      body: { title: 'Modified Title After Publish' }
    });
    assert(
      res14.status === 400 && res14.body?.error?.code === 'LIFECYCLE_LOCKED',
      'Test 14: Invariant enforced: Cannot modify published assessment (400 LIFECYCLE_LOCKED)'
    );

    // 15. Post-publication lock invariant: cannot add question to published assessment
    const res15 = await makeRequest({
      path: `/api/v1/assessments/${assessmentId}/questions`,
      method: 'POST',
      token: teacher1Token,
      body: { display_order: 3, prompt: 'Extra Question', max_marks: 5 }
    });
    assert(
      res15.status === 400 && res15.body?.error?.code === 'LIFECYCLE_LOCKED',
      'Test 15: Invariant enforced: Cannot add questions to published assessment (400 LIFECYCLE_LOCKED)'
    );

    // 16. Post-publication lock invariant: cannot modify rubric on published assessment
    const res16 = await makeRequest({
      path: `/api/v1/assessments/${assessmentId}/questions/${q1Id}/rubric`,
      method: 'POST',
      token: teacher1Token,
      body: {
        title: 'Tampered Rubric Post Publish',
        criteria: [{ display_order: 1, title: 'Cheating', description: 'desc', max_marks: 10, levels: [] }]
      }
    });
    assert(
      res16.status === 400 && res16.body?.error?.code === 'LIFECYCLE_LOCKED',
      'Test 16: Invariant enforced: Cannot modify rubric after assessment is published (400 LIFECYCLE_LOCKED)'
    );

    // 17. Post-publication lock invariant: cannot delete question on published assessment
    const res17 = await makeRequest({
      path: `/api/v1/assessments/${assessmentId}/questions/${q1Id}`,
      method: 'DELETE',
      token: teacher1Token
    });
    assert(
      res17.status === 400 && res17.body?.error?.code === 'LIFECYCLE_LOCKED',
      'Test 17: Invariant enforced: Cannot delete question on published assessment (400 LIFECYCLE_LOCKED)'
    );

    // 18. Student enrolled in class can now access the published assessment
    const res18 = await makeRequest({
      path: `/api/v1/assessments/${assessmentId}`,
      method: 'GET',
      token: student1Token
    });
    assert(
      res18.status === 200 && res18.body?.assessment?.status === 'published',
      'Test 18: Enrolled student can now view published assessment with questions (200 OK)'
    );

    // 19. Non-enrolled student denied access to published assessment
    const nonEnrolledStudentToken = createToken('a4000000-0000-0000-0000-000000000099', 'outsider.student@smartfa.edu');
    const res19 = await makeRequest({
      path: `/api/v1/assessments/${assessmentId}`,
      method: 'GET',
      token: nonEnrolledStudentToken
    });
    assert(
      res19.status === 403,
      'Test 19: Non-enrolled student denied access to published assessment (403 FORBIDDEN)'
    );

    // 20. Teacher not assigned to this class/subject denied viewing assessment
    const res20 = await makeRequest({
      path: `/api/v1/assessments/${assessmentId}`,
      method: 'GET',
      token: teacher2Token
    });
    assert(
      res20.status === 403,
      'Test 20: Unassigned teacher denied viewing assessment of other class/subject (403 FORBIDDEN)'
    );

    // 21. Audit events recorded
    const res21 = await makeRequest({
      path: '/api/v1/admin/hod/audit',
      method: 'GET',
      token: hodToken
    });
    assert(
      res21.status === 200 &&
      res21.body.events.some((e: any) => e.action === 'PUBLISH_ASSESSMENT'),
      'Test 21: Audit trail contains PUBLISH_ASSESSMENT event'
    );

  } catch (err) {
    console.error('Unexpected error during test execution:', err);
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
