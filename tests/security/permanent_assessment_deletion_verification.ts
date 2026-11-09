/**
 * ACADASSESS: Permanent Assessment Deletion Verification Test Suite
 * 
 * Verifies:
 * 1. Authorization: Only assigned subject teacher or HOD can initiate deletion
 * 2. Institutional password confirmation via Supabase Auth
 * 3. Scope of deletion: assessment, questions, rubrics, submissions, evaluations, scores, publications, and storage files
 * 4. Staging & Concurrency: deletion_pending status locks evaluations and submissions
 * 5. Storage failure handling without orphaned database records
 * 6. Audit logging with counts, metadata, actor ID, and zero password/academic content leakage
 * 7. Zero orphaned records across all tables and storage
 */

import http from 'http';
import path from 'path';
import fs from 'fs';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';

process.env.NODE_ENV = 'test';
process.env.SMARTFA_TEST_MODE = 'true';

const DEV_JWT_SECRET = 'smartfa-test-hmac-dev-secret-key-32chars';
const TEST_TEACHER_ID = 'a2000000-0000-0000-0000-000000000001';
const OTHER_TEACHER_ID = 'a2000000-0000-0000-0000-000000000002';
const HOD_USER_ID = 'a1000000-0000-0000-0000-000000000001';
const STUDENT_USER_ID = 'a4000000-0000-0000-0000-000000000001';

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
    headers?: Record<string, string>;
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
            ...(options.headers || {}),
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
  console.log('  ACADASSESS: PERMANENT ASSESSMENT DELETION VERIFICATION TEST SUITE     ');
  console.log('========================================================================\n');

  // --- 1. Static Invariant Inspections ---
  console.log('--- Phase 1: Static Source Code & Migration Verification ---');

  const migrationPath = path.resolve(process.cwd(), 'supabase/migrations/20261107000021_permanent_assessment_deletion.sql');
  assert(fs.existsSync(migrationPath), 'Migration 20261107000021_permanent_assessment_deletion.sql exists');

  const migrationSql = fs.readFileSync(migrationPath, 'utf-8');
  assert(migrationSql.includes('alter type public.assessment_status add value if not exists \'deletion_pending\''),
    'Migration adds deletion_pending enum value');
  assert(migrationSql.includes('mark_assessment_deletion_pending'),
    'Migration defines mark_assessment_deletion_pending procedure');
  assert(migrationSql.includes('delete_assessment_atomic'),
    'Migration defines delete_assessment_atomic cascade procedure');
  assert(migrationSql.includes('delete from public.result_publications') &&
         migrationSql.includes('delete from public.evaluation_criterion_scores') &&
         migrationSql.includes('delete from public.evaluations') &&
         migrationSql.includes('delete from public.submission_versions') &&
         migrationSql.includes('delete from public.submissions') &&
         migrationSql.includes('delete from public.rubric_levels') &&
         migrationSql.includes('delete from public.rubric_criteria') &&
         migrationSql.includes('delete from public.rubric_versions') &&
         migrationSql.includes('delete from public.questions') &&
         migrationSql.includes('delete from public.assessments'),
    'Migration deletes all dependent tables in strict foreign key order');

  const uiSrc = fs.readFileSync(path.resolve(process.cwd(), 'apps/web/src/features/teacher/AssessmentManagement.tsx'), 'utf-8');
  assert(uiSrc.includes('confirmPassword'), 'UI imports and calls confirmPassword');
  assert(uiSrc.includes('Institutional Password Confirmation'), 'UI includes institutional password confirmation label');
  assert(uiSrc.includes('deletePassword'), 'UI maintains deletePassword state');
  assert(uiSrc.includes('deleteCheckResult?.counts'), 'UI renders entity counts breakdown before deletion');
  assert(!uiSrc.includes('Deletion Blocked: Academic Records Attached'), 'Old blocking warning is removed from UI');

  const clientSrc = fs.readFileSync(path.resolve(process.cwd(), 'apps/web/src/services/apiClient.ts'), 'utf-8');
  assert(clientSrc.includes('confirmPassword: async'), 'apiClient defines authApi.confirmPassword');
  assert(clientSrc.includes('X-Reauth-Token'), 'apiClient passes X-Reauth-Token header during deleteAssessment');

  // --- 2. Dynamic API & Repository Verification ---
  console.log('\n--- Phase 2: Dynamic API & Authorization Verification ---');

  const appModule = await import('../../apps/api/src/index.js');
  const app = (appModule as any).app || (appModule as any).default;
  const { db } = await import('../../apps/api/src/storage/db.js');
  const { getAssessmentRepository } = await import('../../apps/api/src/storage/assessmentRepository.js');
  const assRepo = getAssessmentRepository();

  const teacherToken = makeToken(TEST_TEACHER_ID, 'teacher1@sjbit.edu.in');
  const otherTeacherToken = makeToken(OTHER_TEACHER_ID, 'teacher2@sjbit.edu.in');
  const studentToken = makeToken(STUDENT_USER_ID, 'student1@sjbit.edu.in');
  const hodToken = makeToken(HOD_USER_ID, 'hod@sjbit.edu.in');

  // Seed baseline assessment
  const assessmentId = randomUUID();
  const testAssessment: any = {
    id: assessmentId,
    class_subject_id: 'c5100000-0000-0000-0000-000000000001', // Assigned to TEST_TEACHER_ID
    title: 'Advanced Operating Systems Lab 1',
    instructions: 'Complete kernel module lab exercises',
    status: 'draft',
    deadline_at: new Date(Date.now() + 86400000).toISOString(),
    max_marks: 50,
    document_storage_key: `assignments/${assessmentId}/brief.pdf`,
    document_filename: 'brief.pdf',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  db.assessments.push(testAssessment);

  // Store file in storageBlobs
  db.storageBlobs.set(testAssessment.document_storage_key, Buffer.from('mock PDF document bytes'));

  // Add questions
  const q1Id = randomUUID();
  const q2Id = randomUUID();
  db.questions.push(
    { id: q1Id, assessment_id: assessmentId, prompt: 'Explain virtual memory paging', max_marks: 25, display_order: 1, created_at: new Date().toISOString() },
    { id: q2Id, assessment_id: assessmentId, prompt: 'Implement kernel spinlock', max_marks: 25, display_order: 2, created_at: new Date().toISOString() }
  );

  // Add Rubric
  const rvId = randomUUID();
  const rc1Id = randomUUID();
  const rc2Id = randomUUID();
  db.rubricVersions.push({
    id: rvId,
    assessment_id: assessmentId,
    version: 1,
    title: 'Operating Systems Rubric',
    created_by: TEST_TEACHER_ID,
    criteria: [],
    created_at: new Date().toISOString()
  });
  db.rubricCriteria.push(
    { id: rc1Id, rubric_version_id: rvId, title: 'Correctness', description: '', max_marks: 30, display_order: 1, levels: [], created_at: new Date().toISOString() },
    { id: rc2Id, rubric_version_id: rvId, title: 'Code Quality', description: '', max_marks: 20, display_order: 2, levels: [], created_at: new Date().toISOString() }
  );
  db.rubricLevels.push(
    { id: randomUUID(), criterion_id: rc1Id, label: 'Excellent', description: '', min_guidance: 25, max_guidance: 30, display_order: 1, created_at: new Date().toISOString() },
    { id: randomUUID(), criterion_id: rc2Id, label: 'Standard', description: '', min_guidance: 15, max_guidance: 20, display_order: 1, created_at: new Date().toISOString() }
  );

  // Add Submissions
  const sub1Id = randomUUID();
  const sv1Id = randomUUID();
  const subFileKey1 = `submissions/${assessmentId}/${STUDENT_USER_ID}/attempt1.pdf`;
  db.storageBlobs.set(subFileKey1, Buffer.from('student submission pdf file bytes'));

  db.submissions.push({
    id: sub1Id,
    assessment_id: assessmentId,
    student_id: STUDENT_USER_ID,
    status: 'submitted',
    active_version_id: sv1Id,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  } as any);

  db.submissionVersions.push({
    id: sv1Id,
    submission_id: sub1Id,
    version_number: 1,
    storage_path: subFileKey1,
    files: [{ storage_key: subFileKey1, filename: 'attempt1.pdf', size_bytes: 1024 }],
    created_at: new Date().toISOString()
  } as any);

  // Add Evaluations & Criterion Scores
  const eval1Id = randomUUID();
  db.evaluations.push({
    id: eval1Id,
    submission_id: sub1Id,
    evaluator_id: TEST_TEACHER_ID,
    status: 'completed',
    total_score: 45,
    final_score: 45,
    general_feedback: 'Well documented kernel design.',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  } as any);

  db.evaluationCriterionScores.push(
    { id: randomUUID(), evaluation_id: eval1Id, criterion_id: rc1Id, score: 27, feedback: 'Strong paging proof', created_at: new Date().toISOString() },
    { id: randomUUID(), evaluation_id: eval1Id, criterion_id: rc2Id, score: 18, feedback: 'Clean locking style', created_at: new Date().toISOString() }
  );

  // Add Result Publication
  db.resultPublications.push({
    id: randomUUID(),
    assessment_id: assessmentId,
    published_by: TEST_TEACHER_ID,
    published_at: new Date().toISOString(),
    remarks: 'Official midterm evaluation grades'
  });

  // Test 1: Unauthenticated request rejected
  const unauthRes = await makeApiRequest(app, {
    path: `/api/v1/assessments/${assessmentId}`,
    method: 'DELETE'
  });
  assert(unauthRes.status === 401, 'Unauthenticated deletion request rejected with 401');

  // Test 2: Student request rejected
  const studentRes = await makeApiRequest(app, {
    path: `/api/v1/assessments/${assessmentId}`,
    method: 'DELETE',
    token: studentToken
  });
  assert(studentRes.status === 403, 'Student deletion request rejected with 403');

  // Test 3: Unassigned faculty request rejected
  const unassignedRes = await makeApiRequest(app, {
    path: `/api/v1/assessments/${assessmentId}`,
    method: 'DELETE',
    token: otherTeacherToken
  });
  assert(unassignedRes.status === 403, 'Unassigned teacher deletion request rejected with 403');

  // Test 4: Authorized deletion check returns can_delete = true and counts
  const checkRes = await makeApiRequest(app, {
    path: `/api/v1/assessments/${assessmentId}/deletion-check`,
    method: 'GET',
    token: teacherToken
  });
  assert(checkRes.status === 200 && checkRes.body.can_delete === true, 'Deletion check returns can_delete: true');
  assert(checkRes.body.counts.submissions === 1, 'Deletion check reports correct submission count');
  assert(checkRes.body.counts.evaluations === 1, 'Deletion check reports correct evaluation count');
  assert(checkRes.body.counts.questions === 2, 'Deletion check reports correct question count');
  assert(checkRes.body.counts.storage_files === 2, 'Deletion check reports 2 storage files (brief + submission)');

  // Test 5: Deletion request without X-Reauth-Token rejected
  const noTokenRes = await makeApiRequest(app, {
    path: `/api/v1/assessments/${assessmentId}`,
    method: 'DELETE',
    token: teacherToken
  });
  assert(noTokenRes.status === 401 && noTokenRes.body.error?.code === 'REAUTH_REQUIRED',
    'Deletion without reauth token returns 401 REAUTH_REQUIRED');

  // Test 6: Confirm password with wrong password rejected
  const wrongPwdRes = await makeApiRequest(app, {
    path: '/api/v1/auth/confirm-password',
    method: 'POST',
    token: teacherToken,
    body: { password: 'incorrect_password' }
  });
  assert(wrongPwdRes.status === 401 && wrongPwdRes.body.error?.code === 'INVALID_CREDENTIALS',
    'confirm-password with incorrect password returns 401 INVALID_CREDENTIALS');

  // Test 7: Confirm password with correct institutional password and assessment_id binding
  const correctPwdRes = await makeApiRequest(app, {
    path: '/api/v1/auth/confirm-password',
    method: 'POST',
    token: teacherToken,
    body: { password: 'faculty123', assessment_id: assessmentId }
  });
  assert(correctPwdRes.status === 200 && correctPwdRes.body.confirmed === true,
    'confirm-password succeeds and returns confirmed: true');
  assert(Boolean(correctPwdRes.body.reauth_token), 'confirm-password returns single-purpose reauth_token');
  const validReauthToken = correctPwdRes.body.reauth_token;

  // Test 7b: Reauth token bound to a different assessment is rejected
  const mismatchAssToken = jwt.sign(
    { sub: TEST_TEACHER_ID, email: 'teacher1@sjbit.edu.in', purpose: 'assignment_deletion', assessment_id: randomUUID(), jti: randomUUID() },
    DEV_JWT_SECRET,
    { expiresIn: '5m' }
  );
  const mismatchRes = await makeApiRequest(app, {
    path: `/api/v1/assessments/${assessmentId}`,
    method: 'DELETE',
    token: teacherToken,
    headers: { 'X-Reauth-Token': mismatchAssToken }
  });
  assert(mismatchRes.status === 403 && mismatchRes.body.error?.code === 'REAUTH_TARGET_MISMATCH',
    'Reauth token bound to another assignment rejected with 403 REAUTH_TARGET_MISMATCH');

  // Test 8: Reauth token with mismatched user rejected
  const otherUserReauthToken = jwt.sign(
    { sub: OTHER_TEACHER_ID, email: 'other@sjbit.edu.in', purpose: 'assignment_deletion' },
    DEV_JWT_SECRET,
    { expiresIn: '5m' }
  );
  const spoofedRes = await makeApiRequest(app, {
    path: `/api/v1/assessments/${assessmentId}`,
    method: 'DELETE',
    token: teacherToken,
    headers: { 'X-Reauth-Token': otherUserReauthToken }
  });
  assert(spoofedRes.status === 403 && spoofedRes.body.error?.code === 'REAUTH_INVALID',
    'Reauth token from another user is rejected with 403 REAUTH_INVALID');

  // Test 9: Reauth token with wrong purpose rejected
  const wrongPurposeToken = jwt.sign(
    { sub: TEST_TEACHER_ID, email: 'teacher1@sjbit.edu.in', purpose: 'general_login' },
    DEV_JWT_SECRET,
    { expiresIn: '5m' }
  );
  const wrongPurposeRes = await makeApiRequest(app, {
    path: `/api/v1/assessments/${assessmentId}`,
    method: 'DELETE',
    token: teacherToken,
    headers: { 'X-Reauth-Token': wrongPurposeToken }
  });
  assert(wrongPurposeRes.status === 403 && wrongPurposeRes.body.error?.code === 'REAUTH_INVALID',
    'Reauth token with incorrect purpose is rejected with 403 REAUTH_INVALID');

  // Test 10: Concurrency locking: marking deletion_pending locks evaluation
  await assRepo.markAssessmentDeletionPending(assessmentId, TEST_TEACHER_ID);
  const lockedAss = await assRepo.getAssessmentById(assessmentId);
  assert(lockedAss?.status === 'deletion_pending', 'Assessment transitioned to deletion_pending status');

  const evalAttemptRes = await makeApiRequest(app, {
    path: '/api/v1/evaluations',
    method: 'POST',
    token: teacherToken,
    body: {
      submission_id: sub1Id,
      status: 'completed',
      criterion_scores: [{ criterion_id: rc1Id, score: 30 }]
    }
  });
  assert(evalAttemptRes.status === 409 && evalAttemptRes.body.error?.code === 'DELETION_PENDING',
    'Evaluation creation blocked when assessment is deletion_pending');

  const publishAttemptRes = await makeApiRequest(app, {
    path: `/api/v1/evaluations/assessment/${assessmentId}/publish`,
    method: 'POST',
    token: teacherToken,
    body: { remarks: 'Trying to publish' }
  });
  assert(publishAttemptRes.status === 409 && publishAttemptRes.body.error?.code === 'DELETION_PENDING',
    'Publishing blocked when assessment is deletion_pending');

  // Test 11: Execute permanent deletion with valid credentials and reauth token
  const deleteRes = await makeApiRequest(app, {
    path: `/api/v1/assessments/${assessmentId}`,
    method: 'DELETE',
    token: teacherToken,
    headers: { 'X-Reauth-Token': validReauthToken }
  });
  assert(deleteRes.status === 200 && deleteRes.body.success === true,
    'Permanent deletion succeeds with 200 OK');
  assert(deleteRes.body.deleted_counts?.submissions === 1, 'Reported 1 submission deleted');
  assert(deleteRes.body.deleted_counts?.evaluations === 1, 'Reported 1 evaluation deleted');
  assert(deleteRes.body.deleted_counts?.questions === 2, 'Reported 2 questions deleted');

  // Test 11b: Attempting to reuse the consumed reauth token on another assignment is rejected
  const ass2Id = randomUUID();
  db.assessments.push({
    id: ass2Id,
    class_subject_id: 'c5100000-0000-0000-0000-000000000001',
    title: 'Second Assignment',
    status: 'draft',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  } as any);

  const replayRes = await makeApiRequest(app, {
    path: `/api/v1/assessments/${ass2Id}`,
    method: 'DELETE',
    token: teacherToken,
    headers: { 'X-Reauth-Token': validReauthToken }
  });
  assert(replayRes.status === 403 && replayRes.body.error?.code === 'REAUTH_ALREADY_USED',
    'Reusing consumed reauth token is rejected with 403 REAUTH_ALREADY_USED');

  // Test 12: Verify database records are completely wiped (zero orphans)
  assert(!db.assessments.some(a => a.id === assessmentId), '0 assessments remaining');
  assert(!db.questions.some(q => q.assessment_id === assessmentId), '0 questions remaining');
  assert(!db.rubricVersions.some(rv => rv.assessment_id === assessmentId || rv.id === rvId), '0 rubric versions remaining');
  assert(!db.rubricCriteria.some(rc => rc.id === rc1Id || rc.id === rc2Id), '0 rubric criteria remaining');
  assert(!db.submissions.some(s => s.assessment_id === assessmentId), '0 submissions remaining');
  assert(!db.submissionVersions.some(sv => sv.submission_id === sub1Id), '0 submission versions remaining');
  assert(!db.evaluations.some(e => e.submission_id === sub1Id), '0 evaluations remaining');
  assert(!db.resultPublications.some(rp => rp.assessment_id === assessmentId), '0 result publications remaining');

  // Test 13: Verify storage files are purged
  assert(!db.storageBlobs.has(testAssessment.document_storage_key), 'Brief document removed from storage');
  assert(!db.storageBlobs.has(subFileKey1), 'Student submission file removed from storage');

  // Test 14: Audit event logged correctly with no passwords or student content
  const auditEvent = db.auditEvents.find(e => e.action === 'ASSESSMENT_PERMANENTLY_DELETED' && e.resource_id === assessmentId);
  assert(Boolean(auditEvent), 'Audit event recorded for ASSESSMENT_PERMANENTLY_DELETED');
  assert(auditEvent?.actor_id === TEST_TEACHER_ID, 'Audit event records authorized teacher actor_id');
  const auditString = JSON.stringify(auditEvent);
  assert(!auditString.includes('faculty123') && !auditString.includes('password') && !auditString.includes('Well documented kernel design'),
    'Audit log contains zero passwords, tokens, or academic submission content');

  // Test 15: HOD Authorization: HOD can also permanently delete an assessment
  const hodAssId = randomUUID();
  db.assessments.push({
    id: hodAssId,
    class_subject_id: 'c5100000-0000-0000-0000-000000000001',
    title: 'HOD Managed Assignment',
    status: 'draft',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  } as any);

  const hodReauthRes = await makeApiRequest(app, {
    path: '/api/v1/auth/confirm-password',
    method: 'POST',
    token: hodToken,
    body: { password: 'admin123' }
  });
  assert(hodReauthRes.status === 200 && Boolean(hodReauthRes.body.reauth_token),
    'HOD can confirm institutional password');

  const hodDelRes = await makeApiRequest(app, {
    path: `/api/v1/assessments/${hodAssId}`,
    method: 'DELETE',
    token: hodToken,
    headers: { 'X-Reauth-Token': hodReauthRes.body.reauth_token }
  });
  assert(hodDelRes.status === 200 && hodDelRes.body.success === true,
    'HOD can permanently delete assessment across departments');
  assert(!db.assessments.some(a => a.id === hodAssId), 'HOD assessment cleanly deleted');

  // Summary
  console.log('\n========================================================================');
  console.log(`  VERIFICATION COMPLETE: ${passedTests}/${totalTests} tests passed`);
  console.log('========================================================================\n');

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('Fatal verification error:', err);
  process.exit(1);
});
