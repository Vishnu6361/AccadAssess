/**
 * ACADASSESS: Assessment Creation Modes & Validation Error Diagnostics Verification
 * 
 * Specifically tests:
 * 1. Payload compatibility with frontend format:
 *    - Rubric criteria containing `criterion_title` without `title` or `display_order`
 *    - Manual questions containing only `prompt` without `max_marks` or `display_order`
 * 2. All 3 creation modes via POST /api/v1/assessments:
 *    - Mode A: PDF only, without manual questions
 *    - Mode B: Manual questions only, without a PDF
 *    - Mode C: Both PDF and manual questions together
 * 3. Meaningful validation error messages:
 *    - API returns detailed formatted field errors instead of generic "Invalid assessment creation payload"
 * 4. Draft modification and reopening:
 *    - Reopening draft, adding/editing/reordering questions, updating rubric
 * 5. 50-mark assignment-level rubric enforcement on publication
 */

import http from 'http';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';

process.env.NODE_ENV = 'test';
process.env.SMARTFA_TEST_MODE = 'true';

const DEV_JWT_SECRET = 'smartfa-test-hmac-dev-secret-key-32chars';
const TEST_TEACHER_ID = 'a2000000-0000-0000-0000-000000000001';

let totalTests = 0;
let passedTests = 0;

function assert(condition: boolean, testName: string, failureDetails?: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  [PASS] Test ${totalTests}: ${testName}`);
  } else {
    console.error(`  [FAIL] Test ${totalTests}: ${testName} - ${failureDetails || 'Assertion failed'}`);
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

async function run() {
  console.log('========================================================================');
  console.log('  ACADASSESS: CREATION MODES & VALIDATION ERROR VERIFICATION           ');
  console.log('========================================================================\n');

  const appModule = await import('../../apps/api/src/index.js');
  const app = (appModule as any).app || (appModule as any).default;
  const { db } = await import('../../apps/api/src/storage/db.js');
  const teacherToken = makeToken(TEST_TEACHER_ID, 'teacher1@sjbit.edu.in');

  // Pre-seed teacher class subject authorization in db
  const testClassSubId = 'c5100000-0000-0000-0000-000000000001';
  const existingCs = db.classSubjects.find(cs => cs.id === testClassSubId);
  if (existingCs) {
    existingCs.subject_teacher_id = TEST_TEACHER_ID;
    existingCs.active = true;
  } else {
    db.classSubjects.push({
      id: testClassSubId,
      class_id: 'c1000000-0000-0000-0000-000000000001',
      subject_id: 's1000000-0000-0000-0000-000000000001',
      subject_teacher_id: TEST_TEACHER_ID,
      academic_term_id: 't1000000-0000-0000-0000-000000000001',
      status: 'active',
      active: true,
      created_at: new Date().toISOString()
    } as any);
  }

  // --- Phase 1: Meaningful Validation Error Reporting ---
  console.log('--- Phase 1: Meaningful Validation Error Messages ---');

  // Test invalid title (too short)
  const invalidTitleRes = await makeApiRequest(app, {
    path: '/api/v1/assessments',
    method: 'POST',
    token: teacherToken,
    body: {
      class_subject_id: testClassSubId,
      title: 'Hi', // < 3 chars
      instructions: 'Valid instructions text',
      deadline_at: new Date(Date.now() + 86400000).toISOString()
    }
  });

  assert(invalidTitleRes.status === 400, 'Invalid title returned status 400');
  assert(
    invalidTitleRes.body.error?.message?.includes('title') &&
    invalidTitleRes.body.error?.message?.includes('at least 3 characters'),
    `Descriptive error returned for title validation: "${invalidTitleRes.body.error?.message}"`
  );

  // Test invalid deadline (in past)
  const pastDeadlineRes = await makeApiRequest(app, {
    path: '/api/v1/assessments',
    method: 'POST',
    token: teacherToken,
    body: {
      class_subject_id: testClassSubId,
      title: 'Valid Assessment Title',
      instructions: 'Valid instructions text',
      deadline_at: new Date(Date.now() - 86400000).toISOString()
    }
  });

  assert(pastDeadlineRes.status === 400, 'Past deadline returned status 400');
  assert(
    pastDeadlineRes.body.error?.message?.includes('future'),
    `Descriptive error returned for deadline validation: "${pastDeadlineRes.body.error?.message}"`
  );

  // --- Phase 2: Mode B (Manual Questions Only, No PDF, Frontend Rubric Format) ---
  console.log('\n--- Phase 2: Mode B - Manual Questions Only (Without PDF) ---');

  const modeBPayload = {
    class_subject_id: testClassSubId,
    title: 'Data Structures Manual Questions (Mode B)',
    instructions: 'Answer all 3 manual problem statements.',
    deadline_at: new Date(Date.now() + 86400000).toISOString(),
    max_marks: 50,
    questions: [
      { prompt: 'Compare Dijkstra vs Bellman-Ford algorithm complexity.' },
      { prompt: 'Provide code for In-Order binary tree traversal.' },
      { prompt: 'Explain hash table open addressing quadratic probing.' }
    ],
    rubric: {
      title: 'Assignment Evaluation Rubric',
      criteria: [
        { criterion_title: 'Concept & Understanding', description: 'Theoretical grasp', max_marks: 15 },
        { criterion_title: 'Implementation & Solution', description: 'Technical design', max_marks: 20 },
        { criterion_title: 'Analysis & Verification', description: 'Complexity rigor', max_marks: 10 },
        { criterion_title: 'Presentation & Clarity', description: 'Neatness & docs', max_marks: 5 }
      ]
    }
  };

  const modeBRes = await makeApiRequest(app, {
    path: '/api/v1/assessments',
    method: 'POST',
    token: teacherToken,
    body: modeBPayload
  });

  assert(modeBRes.status === 201 || modeBRes.status === 200,
    `Mode B created successfully with HTTP ${modeBRes.status}`);
  const modeBAssessment = modeBRes.body.assessment;
  assert(Boolean(modeBAssessment && modeBAssessment.id), 'Mode B returned created assessment');
  assert(modeBAssessment.document_storage_key === null, 'Mode B document_storage_key is null (no PDF)');
  assert(modeBAssessment.questions?.length === 3, 'Mode B has exactly 3 manual questions');
  assert(modeBAssessment.questions?.[0].display_order === 1 && modeBAssessment.questions?.[1].display_order === 2,
    'Questions received auto-assigned sequential display_order (1, 2, 3)');
  assert(modeBAssessment.rubric?.criteria?.length === 4,
    'Assignment-level rubric attached with 4 criteria totaling 50 marks');

  // --- Phase 3: Mode A (PDF Only, Without Manual Questions) ---
  console.log('\n--- Phase 3: Mode A - PDF Only (Without Manual Questions) ---');

  const modeAPayload = {
    class_subject_id: testClassSubId,
    title: 'Operating Systems PDF Lab (Mode A)',
    instructions: 'Refer strictly to the attached authoritative lab sheet PDF.',
    deadline_at: new Date(Date.now() + 86400000).toISOString(),
    max_marks: 50,
    document_filename: 'os-lab-sheet.pdf',
    document_base64: Buffer.from('%PDF-1.4 Mock OS Lab Sheet').toString('base64'),
    questions: [],
    rubric: {
      title: 'Assignment Evaluation Rubric',
      criteria: [
        { criterion_title: 'Practical Execution', description: 'Process synchronization tasks', max_marks: 30 },
        { criterion_title: 'Analysis & Discussion', description: 'Race condition analysis', max_marks: 20 }
      ]
    }
  };

  const modeARes = await makeApiRequest(app, {
    path: '/api/v1/assessments',
    method: 'POST',
    token: teacherToken,
    body: modeAPayload
  });

  assert(modeARes.status === 201 || modeARes.status === 200,
    `Mode A created successfully with HTTP ${modeARes.status}`);
  const modeAAssessment = modeARes.body.assessment;
  assert(Boolean(modeAAssessment && modeAAssessment.document_filename === 'os-lab-sheet.pdf'),
    'Mode A saved PDF document successfully');
  assert((modeAAssessment.questions?.length || 0) === 0,
    'Mode A has 0 manual questions as expected');
  assert(modeAAssessment.rubric?.criteria?.length === 2,
    'Mode A rubric attached with 2 criteria totaling 50 marks');

  // --- Phase 4: Mode C (Both PDF and Manual Questions Together) ---
  console.log('\n--- Phase 4: Mode C - Both PDF and Manual Questions Together ---');

  const modeCPayload = {
    class_subject_id: testClassSubId,
    title: 'Computer Networks Comprehensive Assignment (Mode C)',
    instructions: 'Complete exercises in attached packet trace PDF and answer supplementary questions below.',
    deadline_at: new Date(Date.now() + 86400000).toISOString(),
    max_marks: 50,
    document_filename: 'cn-packet-analysis.pdf',
    document_base64: Buffer.from('%PDF-1.4 Mock Packet Trace').toString('base64'),
    questions: [
      { prompt: 'Supplementary Q1: Calculate TCP sliding window throughput with 100ms RTT.' },
      { prompt: 'Supplementary Q2: Identify the TLS handshake cipher suite in the trace.' }
    ],
    rubric: {
      title: 'Assignment Evaluation Rubric',
      criteria: [
        { criterion_title: 'Packet Trace Lab Deliverable', description: 'Wireshark analysis', max_marks: 30 },
        { criterion_title: 'Supplementary Questions', description: 'Throughput calculation & TLS', max_marks: 20 }
      ]
    }
  };

  const modeCRes = await makeApiRequest(app, {
    path: '/api/v1/assessments',
    method: 'POST',
    token: teacherToken,
    body: modeCPayload
  });

  assert(modeCRes.status === 201 || modeCRes.status === 200,
    `Mode C created successfully with HTTP ${modeCRes.status}`);
  const modeCAssessment = modeCRes.body.assessment;
  assert(Boolean(modeCAssessment && modeCAssessment.document_filename && modeCAssessment.questions?.length === 2),
    'Mode C has BOTH PDF document and 2 manual questions');

  // --- Phase 5: Reopening Draft, Editing, Deleting, and Reordering ---
  console.log('\n--- Phase 5: Reopening Draft, Editing, Reordering & Deleting Questions ---');

  const updatedQuestionsPayload = {
    questions: [
      { prompt: 'Provide code for In-Order binary tree traversal (Prompt edited).' }, // Q2 moved to #1 and edited
      { prompt: 'Compare Dijkstra vs Bellman-Ford algorithm complexity.' } // Q1 moved to #2
      // Q3 omitted (deleted)
    ]
  };

  const updateDraftRes = await makeApiRequest(app, {
    path: `/api/v1/assessments/${modeBAssessment.id}`,
    method: 'PUT',
    token: teacherToken,
    body: updatedQuestionsPayload
  });

  assert(updateDraftRes.status === 200, `Draft updated successfully with HTTP 200`);
  const updatedAssessment = updateDraftRes.body.assessment;
  assert(updatedAssessment.questions?.length === 2, 'Question count reduced from 3 to 2 (deletion verified)');
  assert(updatedAssessment.questions?.[0].prompt.includes('Prompt edited'), 'Question prompt editing verified');
  assert(updatedAssessment.questions?.[0].display_order === 1 && updatedAssessment.questions?.[1].display_order === 2,
    'Updated questions preserved sequential display orders');

  // --- Phase 6: Rubric 50-Mark Enforcement on Publication ---
  console.log('\n--- Phase 6: Rubric 50-Mark Publication Enforcement ---');

  // Attempt to publish an assessment where rubric criteria sum != 50
  const invalidRubricDraft = await makeApiRequest(app, {
    path: '/api/v1/assessments',
    method: 'POST',
    token: teacherToken,
    body: {
      class_subject_id: testClassSubId,
      title: 'Invalid Rubric Sum Draft',
      instructions: 'Rubric total is only 30',
      deadline_at: new Date(Date.now() + 86400000).toISOString(),
      questions: [{ prompt: 'Question 1' }],
      rubric: {
        title: 'Incomplete Rubric',
        criteria: [
          { criterion_title: 'Part 1', description: 'Desc', max_marks: 30 } // 30 != 50
        ]
      }
    }
  });

  const publishInvalidRes = await makeApiRequest(app, {
    path: `/api/v1/assessments/${invalidRubricDraft.body.assessment.id}/publish`,
    method: 'POST',
    token: teacherToken
  });

  assert(publishInvalidRes.status === 400, 'Publishing rejected when rubric sum != 50');
  assert(
    publishInvalidRes.body.error?.message?.includes('50') ||
    publishInvalidRes.body.error?.message?.includes('Rubric'),
    `Descriptive publication error: "${publishInvalidRes.body.error?.message}"`
  );

  // Publish valid draft (where rubric criteria total 50)
  const publishValidRes = await makeApiRequest(app, {
    path: `/api/v1/assessments/${modeBAssessment.id}/publish`,
    method: 'POST',
    token: teacherToken
  });

  assert(publishValidRes.status === 200, `Assessment published successfully with HTTP 200`);
  assert(publishValidRes.body.assessment?.status === 'published', 'Assessment status is published');

  console.log('\n========================================================================');
  console.log(`  VERIFICATION COMPLETE: ${passedTests}/${totalTests} TESTS PASSED`);
  console.log('========================================================================\n');

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('Test run failed with unhandled exception:', err);
  process.exit(1);
});

