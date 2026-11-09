/**
 * ACADASSESS: ASSIGNMENT CREATION IDEMPOTENCY & DEDUPLICATION VERIFICATION
 *
 * Verifies:
 * 1. Single click creation creates exactly 1 assignment (HTTP 201).
 * 2. Rapid double-click with identical key returns original assignment without creating duplicate rows (HTTP 200).
 * 3. 5 concurrent identical requests fired simultaneously (via Promise.all) deduplicate to exactly 1 draft record.
 * 4. Retry after client-side timeout returns original assignment ID and idempotent_replay: true.
 * 5. Distinct creation requests with identical titles but different idempotency keys create distinct assignments.
 * 6. Failed creation (invalid deadline) does not leave phantom records and allows safe retry with the same key.
 * 7. Existing assignment creation modes (PDF only, Manual questions only, Both together) with 50-mark rubrics remain fully operational.
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
  server: http.Server,
  port: number,
  options: {
    path: string;
    method: string;
    token?: string;
    idempotencyKey?: string;
    body?: any;
  }
): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const postData = options.body ? JSON.stringify(options.body) : null;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    if (options.token) {
      headers['Authorization'] = `Bearer ${options.token}`;
    }
    if (options.idempotencyKey) {
      headers['Idempotency-Key'] = options.idempotencyKey;
    }
    if (postData) {
      headers['Content-Length'] = Buffer.byteLength(postData).toString();
    }

    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: options.path,
        method: options.method,
        headers
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
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
      reject(err);
    });

    if (postData) {
      req.write(postData);
    }
    req.end();
  });
}

function makeToken(sub: string, email: string): string {
  return jwt.sign({ sub, email }, DEV_JWT_SECRET, { expiresIn: '1h' });
}

const FUTURE_DATE = new Date(Date.now() + 86400000 * 7).toISOString();
const VALID_RUBRIC = {
  title: 'Assignment Evaluation Rubric',
  criteria: [
    { title: 'Analysis & Formulation', description: 'Core formulation', max_marks: 25, display_order: 1 },
    { title: 'Implementation & Clarity', description: 'Code quality', max_marks: 25, display_order: 2 }
  ]
};

async function run() {
  console.log('========================================================================');
  console.log('  ACADASSESS: ASSIGNMENT CREATION IDEMPOTENCY & DEDUPLICATION VERIFY    ');
  console.log('========================================================================\n');

  const appModule = await import('../../apps/api/src/index.js');
  const app = (appModule as any).app || (appModule as any).default;
  const { db } = await import('../../apps/api/src/storage/db.js');
  const teacherToken = makeToken(TEST_TEACHER_ID, 'teacher1@sjbit.edu.in');

  // Pre-seed teacher class subject authorization in db
  const testClassSubId = 'c5100000-0000-0000-0000-000000000001';
  const existingCs = db.classSubjects.find((cs: any) => cs.id === testClassSubId);
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

  // Start single HTTP test server
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const port = (server.address() as any).port;

  try {
    // -------------------------------------------------------------------------
    // Phase 1: Single Normal Click Creation
    // -------------------------------------------------------------------------
    console.log('--- Phase 1: Single Click Normal Creation ---');
    const key1 = randomUUID();
    const res1 = await makeApiRequest(server, port, {
      path: '/api/v1/assessments',
      method: 'POST',
      token: teacherToken,
      idempotencyKey: key1,
      body: {
        class_subject_id: testClassSubId,
        title: 'Assignment 1: Distributed Algorithms',
        instructions: 'Solve problems 1 through 5.',
        deadline_at: FUTURE_DATE,
        max_marks: 50,
        idempotency_key: key1,
        questions: [{ prompt: 'Explain Paxos consensus algorithm.', display_order: 1 }],
        rubric: VALID_RUBRIC
      }
    });

    assert(res1.status === 201, 'Normal creation returned HTTP 201', `Status was ${res1.status}: ${JSON.stringify(res1.body)}`);
    assert(Boolean(res1.body.assessment?.id), 'Created assessment returned a valid ID');
    assert(res1.body.assessment.title === 'Assignment 1: Distributed Algorithms', 'Returned assessment title matches payload');
    const id1 = res1.body.assessment.id;

    // -------------------------------------------------------------------------
    // Phase 2: Rapid Double-Click Deduplication
    // -------------------------------------------------------------------------
    console.log('\n--- Phase 2: Rapid Double-Click Deduplication ---');
    const res2 = await makeApiRequest(server, port, {
      path: '/api/v1/assessments',
      method: 'POST',
      token: teacherToken,
      idempotencyKey: key1,
      body: {
        class_subject_id: testClassSubId,
        title: 'Assignment 1: Distributed Algorithms',
        instructions: 'Solve problems 1 through 5.',
        deadline_at: FUTURE_DATE,
        max_marks: 50,
        idempotency_key: key1,
        questions: [{ prompt: 'Explain Paxos consensus algorithm.', display_order: 1 }],
        rubric: VALID_RUBRIC
      }
    });

    assert(res2.status === 200, 'Duplicate request returned HTTP 200 idempotent replay', `Status was ${res2.status}`);
    assert(res2.body.assessment?.id === id1, 'Returned assessment ID exactly matches original');
    assert(res2.body.idempotent_replay === true, 'idempotent_replay flag is true');

    const matchingDrafts1 = db.assessments.filter((a: any) => a.title === 'Assignment 1: Distributed Algorithms');
    assert(matchingDrafts1.length === 1, 'Database contains exactly 1 assessment row (no duplicates)', `Found ${matchingDrafts1.length}`);

    // -------------------------------------------------------------------------
    // Phase 3: 5 Concurrent Identical Requests In-Flight Deduplication
    // -------------------------------------------------------------------------
    console.log('\n--- Phase 3: 5 Concurrent Identical Requests In-Flight Deduplication ---');
    const keyConcurrent = randomUUID();
    const payloadConcurrent = {
      class_subject_id: testClassSubId,
      title: 'Assignment 2: Cloud Storage Architectures',
      instructions: 'Analyze storage replication policies.',
      deadline_at: FUTURE_DATE,
      max_marks: 50,
      idempotency_key: keyConcurrent,
      questions: [{ prompt: 'Discuss erasure coding vs replication.', display_order: 1 }],
      rubric: VALID_RUBRIC
    };

    const concurrentResults = await Promise.all(
      [1, 2, 3, 4, 5].map(() =>
        makeApiRequest(server, port, {
          path: '/api/v1/assessments',
          method: 'POST',
          token: teacherToken,
          idempotencyKey: keyConcurrent,
          body: payloadConcurrent
        })
      )
    );

    const statuses = concurrentResults.map((r) => r.status);
    const assessmentIds = concurrentResults.map((r) => r.body.assessment?.id);

    const allSuccessful = statuses.every((s) => s === 201 || s === 200);
    assert(allSuccessful, 'All 5 concurrent requests succeeded with HTTP 200 or 201', `Statuses: ${statuses.join(', ')}`);

    const uniqueIds = Array.from(new Set(assessmentIds));
    assert(uniqueIds.length === 1, 'All 5 concurrent requests returned the identical assessment ID', `Found IDs: ${uniqueIds.join(', ')}`);

    const matchingDrafts2 = db.assessments.filter((a: any) => a.title === 'Assignment 2: Cloud Storage Architectures');
    assert(matchingDrafts2.length === 1, 'Database contains exactly 1 assessment row for the 5 concurrent attempts', `Found ${matchingDrafts2.length}`);

    // -------------------------------------------------------------------------
    // Phase 4: Retry After Network Timeout
    // -------------------------------------------------------------------------
    console.log('\n--- Phase 4: Retry After Network Timeout ---');
    const resRetry = await makeApiRequest(server, port, {
      path: '/api/v1/assessments',
      method: 'POST',
      token: teacherToken,
      idempotencyKey: keyConcurrent,
      body: payloadConcurrent
    });

    assert(resRetry.status === 200, 'Replayed retry request returned HTTP 200');
    assert(resRetry.body.assessment?.id === uniqueIds[0], 'Retry returned the original assignment ID');
    assert(resRetry.body.idempotent_replay === true, 'idempotent_replay is true on retry');

    // -------------------------------------------------------------------------
    // Phase 5: Distinct Creations with Identical Titles Permitted
    // -------------------------------------------------------------------------
    console.log('\n--- Phase 5: Distinct Creations with Identical Titles Permitted ---');
    const keyDistinct1 = randomUUID();
    const keyDistinct2 = randomUUID();

    const resDistinct1 = await makeApiRequest(server, port, {
      path: '/api/v1/assessments',
      method: 'POST',
      token: teacherToken,
      idempotencyKey: keyDistinct1,
      body: {
        class_subject_id: testClassSubId,
        title: 'Lab Quiz 1: Foundation Concepts',
        instructions: 'Attempt for batch 1.',
        deadline_at: FUTURE_DATE,
        max_marks: 50,
        idempotency_key: keyDistinct1,
        rubric: VALID_RUBRIC
      }
    });

    const resDistinct2 = await makeApiRequest(server, port, {
      path: '/api/v1/assessments',
      method: 'POST',
      token: teacherToken,
      idempotencyKey: keyDistinct2,
      body: {
        class_subject_id: testClassSubId,
        title: 'Lab Quiz 1: Foundation Concepts', // Identical title
        instructions: 'Attempt for batch 2.',
        deadline_at: FUTURE_DATE,
        max_marks: 50,
        idempotency_key: keyDistinct2,
        rubric: VALID_RUBRIC
      }
    });

    assert(resDistinct1.status === 201, 'First distinct assignment created with HTTP 201');
    assert(resDistinct2.status === 201, 'Second distinct assignment created with HTTP 201');
    assert(resDistinct1.body.assessment.id !== resDistinct2.body.assessment.id, 'Distinct assignments have distinct IDs');

    // -------------------------------------------------------------------------
    // Phase 6: Safe Retry After Failed Creation
    // -------------------------------------------------------------------------
    console.log('\n--- Phase 6: Safe Retry After Failed Creation ---');
    const keyFailed = randomUUID();
    const resFail = await makeApiRequest(server, port, {
      path: '/api/v1/assessments',
      method: 'POST',
      token: teacherToken,
      idempotencyKey: keyFailed,
      body: {
        class_subject_id: testClassSubId,
        title: 'Assignment with Past Deadline',
        instructions: 'Invalid deadline attempt.',
        deadline_at: '2020-01-01T00:00:00Z', // Past deadline!
        max_marks: 50,
        idempotency_key: keyFailed,
        rubric: VALID_RUBRIC
      }
    });

    assert(resFail.status === 400, 'Past deadline rejected with HTTP 400');
    assert(resFail.body.error?.code === 'INVALID_DEADLINE', 'Error code is INVALID_DEADLINE');

    // Safe retry with corrected deadline using the same key
    const resFixed = await makeApiRequest(server, port, {
      path: '/api/v1/assessments',
      method: 'POST',
      token: teacherToken,
      idempotencyKey: keyFailed,
      body: {
        class_subject_id: testClassSubId,
        title: 'Assignment with Corrected Deadline',
        instructions: 'Valid deadline attempt.',
        deadline_at: FUTURE_DATE,
        max_marks: 50,
        idempotency_key: keyFailed,
        rubric: VALID_RUBRIC
      }
    });

    assert(resFixed.status === 201, 'Corrected retry succeeded with HTTP 201');
    assert(Boolean(resFixed.body.assessment?.id), 'Corrected retry created valid assessment');

    // -------------------------------------------------------------------------
    // Phase 7: All Creation Modes (PDF, Questions, Both) Preserved
    // -------------------------------------------------------------------------
    console.log('\n--- Phase 7: All 3 Creation Modes Preserved ---');

    // Mode A: PDF document only
    const keyModeA = randomUUID();
    const resModeA = await makeApiRequest(server, port, {
      path: '/api/v1/assessments',
      method: 'POST',
      token: teacherToken,
      idempotencyKey: keyModeA,
      body: {
        class_subject_id: testClassSubId,
        title: 'Mode A: PDF Only Assessment',
        instructions: 'Solve questions from attached PDF.',
        deadline_at: FUTURE_DATE,
        document_filename: 'assignment.pdf',
        document_base64: Buffer.from('%PDF-1.4 test document').toString('base64'),
        document_mime_type: 'application/pdf',
        max_marks: 50,
        idempotency_key: keyModeA,
        rubric: VALID_RUBRIC
      }
    });
    assert(resModeA.status === 201, 'Mode A created with HTTP 201');
    assert(Boolean(resModeA.body.assessment?.document_storage_key), 'Mode A stored document key');
    assert(resModeA.body.assessment.questions.length === 0, 'Mode A has 0 manual questions');

    // Mode B: Manual questions only
    const keyModeB = randomUUID();
    const resModeB = await makeApiRequest(server, port, {
      path: '/api/v1/assessments',
      method: 'POST',
      token: teacherToken,
      idempotencyKey: keyModeB,
      body: {
        class_subject_id: testClassSubId,
        title: 'Mode B: Manual Questions Only Assessment',
        instructions: 'Answer all written questions.',
        deadline_at: FUTURE_DATE,
        max_marks: 50,
        idempotency_key: keyModeB,
        questions: [
          { prompt: 'What is vector clock synchronization?', display_order: 1 },
          { prompt: 'Compare Raft and Zab consensus.', display_order: 2 }
        ],
        rubric: VALID_RUBRIC
      }
    });
    assert(resModeB.status === 201, 'Mode B created with HTTP 201');
    assert(resModeB.body.assessment.questions.length === 2, 'Mode B preserved 2 manual questions');

    // Mode C: Both together
    const keyModeC = randomUUID();
    const resModeC = await makeApiRequest(server, port, {
      path: '/api/v1/assessments',
      method: 'POST',
      token: teacherToken,
      idempotencyKey: keyModeC,
      body: {
        class_subject_id: testClassSubId,
        title: 'Mode C: Both PDF and Questions Assessment',
        instructions: 'Refer to PDF and answer online questions.',
        deadline_at: FUTURE_DATE,
        document_filename: 'spec.pdf',
        document_base64: Buffer.from('%PDF-1.4 spec').toString('base64'),
        document_mime_type: 'application/pdf',
        max_marks: 50,
        idempotency_key: keyModeC,
        questions: [{ prompt: 'Online Reflection 1', display_order: 1 }],
        rubric: VALID_RUBRIC
      }
    });
    assert(resModeC.status === 201, 'Mode C created with HTTP 201');
    assert(Boolean(resModeC.body.assessment?.document_storage_key), 'Mode C preserved document key');
    assert(resModeC.body.assessment.questions.length === 1, 'Mode C preserved manual question');

    console.log('\n========================================================================');
    console.log(`  VERIFICATION COMPLETE: ${passedTests}/${totalTests} TESTS PASSED`);
    console.log('========================================================================');
  } finally {
    server.close();
  }
}

run().catch((err) => {
  console.error('\n[FATAL ERROR]:', err);
  process.exit(1);
});
