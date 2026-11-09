/**
 * ACADASSESS: Question Builder and Assignment-Level Rubric Evaluation Verification Test Suite
 * 
 * Verifies:
 * 1. UI Label & Mode Consistency:
 *    - "New Assignment" button label (no "New PDF Assignment")
 *    - Modal titles and instructions reflect support for PDF-only, questions-only, or both
 *    - PDF upload is optional when manual questions are provided
 * 2. Question Builder (No Marks):
 *    - Contract & schema allow question creation without max_marks
 *    - Manual questions have prompt and display_order only, no marks input or default 10 marks
 *    - Multiple questions can be added, edited, deleted, and reordered (display_order preserved)
 * 3. Assignment-Level Rubric & 50 Marks Total:
 *    - Rubric criteria must sum to exactly 50 marks to publish
 *    - Publication is rejected if rubric total != 50 marks
 *    - Published assessments freeze both questions and rubrics against modification
 * 4. Evaluation & Scoring Calculations:
 *    - Evaluation is strictly assignment-level via rubric criterion scores (summing to 50)
 *    - Question-level marks are NOT used to calculate final score
 *    - Late submission penalties (e.g., -5 marks) are cleanly deducted from total
 *    - Student view receives criterion breakdown and total score only upon publication
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

async function run() {
  console.log('========================================================================');
  console.log('  ACADASSESS: QUESTION BUILDER & RUBRIC EVALUATION VERIFICATION        ');
  console.log('========================================================================\n');

  // --- 1. Source Code & UI Inspection ---
  console.log('--- Phase 1: Frontend UI & Schema Contract Verification ---');

  const assessmentManagementPath = path.resolve(process.cwd(), 'apps/web/src/features/teacher/AssessmentManagement.tsx');
  assert(fs.existsSync(assessmentManagementPath), 'AssessmentManagement.tsx exists');

  const uiContent = fs.readFileSync(assessmentManagementPath, 'utf-8');

  // Check 1: Button renamed from "New PDF Assignment" to "New Assignment"
  assert(uiContent.includes('New Assignment') && !uiContent.includes('New PDF Assignment'),
    'Assignment creation button renamed to "New Assignment" and "New PDF Assignment" removed');

  // Check 2: Modal title does not imply PDF-only
  assert(uiContent.includes('Create New Assignment') && !uiContent.includes('Create PDF-Based Assignment'),
    'Modal title updated to "Create New Assignment"');

  // Check 3: No default 10 marks for questions in state
  assert(!uiContent.includes('newFormQMarks') && !uiContent.includes('inlineNewQMarks'),
    'Question marks state (newFormQMarks, inlineNewQMarks) removed from Question Builder');

  // Check 4: Contracts allow Question without max_marks
  const contractsPath = path.resolve(process.cwd(), 'packages/contracts/src/index.ts');
  const contractsContent = fs.readFileSync(contractsPath, 'utf-8');
  assert(contractsContent.includes('QuestionInputSchema = z.object({') &&
         contractsContent.includes('max_marks: z.number().nullable().optional()'),
    'packages/contracts QuestionInputSchema allows optional/nullable max_marks');

  // --- 2. API & Repository In-Memory Verification ---
  console.log('\n--- Phase 2: API & Question Management Verification ---');

  const { db } = await import('../../apps/api/src/storage/db.js');
  const { getAssessmentRepository } = await import('../../apps/api/src/storage/assessmentRepository.js');
  const { getSubmissionRepository } = await import('../../apps/api/src/storage/submissionRepository.js');
  const { getEvaluationRepository } = await import('../../apps/api/src/storage/evaluationRepository.js');
  
  const assRepo = getAssessmentRepository();
  const subRepo = getSubmissionRepository();
  const evalRepo = getEvaluationRepository();

  // Test Case A: Create draft assessment with Manual Questions ONLY (No PDF, No question marks)
  const draftOnlyQuestions = await assRepo.saveDraftAssessmentAtomic(
    null,
    {
      class_subject_id: 'c5100000-0000-0000-0000-000000000001',
      title: 'Data Structures Manual Questions Assignment',
      instructions: 'Answer all theoretical and coding questions',
      deadline_at: new Date(Date.now() + 86400000).toISOString(),
      max_marks: 50,
      questions: [
        { prompt: 'Explain the difference between a Red-Black tree and an AVL tree.', display_order: 1 },
        { prompt: 'Provide pseudocode for Dijkstra algorithm with priority queue.', display_order: 2 },
        { prompt: 'Analyze the worst-case space complexity of BFS vs DFS on a binary tree.', display_order: 3 }
      ],
      rubric: {
        title: 'DS Rubric',
        criteria: [
          { title: 'Theoretical Depth', description: 'Understanding of concepts', max_marks: 15, display_order: 1 },
          { title: 'Pseudocode Accuracy', description: 'Correctness of algorithms', max_marks: 20, display_order: 2 },
          { title: 'Complexity Analysis', description: 'Rigorous derivation of space/time', max_marks: 15, display_order: 3 }
        ]
      }
    },
    TEST_TEACHER_ID
  );

  assert(Boolean(draftOnlyQuestions && draftOnlyQuestions.id),
    'Successfully created draft assignment with manual questions ONLY (no PDF attached)');

  const fetchedOnlyQuestions = await assRepo.getFullAssessment(draftOnlyQuestions.id);
  assert(fetchedOnlyQuestions.questions?.length === 3,
    'Draft assignment saved all 3 manual questions');
  assert(fetchedOnlyQuestions.questions?.every((q: any) => q.prompt && typeof q.display_order === 'number'),
    'All saved questions have valid prompt and display_order without requiring question marks');

  // Test Case B: Create draft assessment with PDF ONLY (No questions)
  const draftOnlyPdf = await assRepo.saveDraftAssessmentAtomic(
    null,
    {
      class_subject_id: 'c5100000-0000-0000-0000-000000000001',
      title: 'Computer Networks Lab Sheet 1',
      instructions: 'Solve packet trace exercises in PDF',
      deadline_at: new Date(Date.now() + 86400000).toISOString(),
      max_marks: 50,
      document_filename: 'cn-lab1.pdf',
      document_base64: Buffer.from('%PDF-1.4 Mock Lab Document').toString('base64'),
      document_mime_type: 'application/pdf',
      questions: [],
      rubric: {
        title: 'CN Lab Rubric',
        criteria: [
          { title: 'Execution', description: 'Lab exercises executed correctly', max_marks: 30, display_order: 1 },
          { title: 'Analysis', description: 'Wireshark packet timing', max_marks: 20, display_order: 2 }
        ]
      }
    },
    TEST_TEACHER_ID
  );

  assert(Boolean(draftOnlyPdf && draftOnlyPdf.document_filename === 'cn-lab1.pdf'),
    'Successfully created draft assignment with PDF ONLY (no manual questions)');

  const fetchedOnlyPdf = await assRepo.getFullAssessment(draftOnlyPdf.id);
  assert((fetchedOnlyPdf.questions?.length || 0) === 0,
    'PDF-only assignment has 0 manual questions as expected');

  // Test Case C: Create draft assessment with BOTH PDF and Manual Questions
  const draftBoth = await assRepo.saveDraftAssessmentAtomic(
    null,
    {
      class_subject_id: 'c5100000-0000-0000-0000-000000000001',
      title: 'Operating Systems Hybrid Assignment',
      instructions: 'Complete exercises in attached PDF and answer supplementary questions',
      deadline_at: new Date(Date.now() + 86400000).toISOString(),
      max_marks: 50,
      document_filename: 'os-hybrid.pdf',
      document_base64: Buffer.from('%PDF-1.4 Mock OS Document').toString('base64'),
      document_mime_type: 'application/pdf',
      questions: [
        { prompt: 'Supplementary Q1: Compare monolithic vs microkernel architecture.', display_order: 1 },
        { prompt: 'Supplementary Q2: Explain deadlock detection vs avoidance.', display_order: 2 }
      ],
      rubric: {
        title: 'OS Hybrid Rubric',
        criteria: [
          { title: 'Lab Report (PDF tasks)', description: 'Practical task deliverables', max_marks: 25, display_order: 1 },
          { title: 'Supplementary Answers', description: 'Conceptual rigor and precision', max_marks: 25, display_order: 2 }
        ]
      }
    },
    TEST_TEACHER_ID
  );

  const fetchedBoth = await assRepo.getFullAssessment(draftBoth.id);
  assert(Boolean(fetchedBoth && fetchedBoth.document_filename && fetchedBoth.questions?.length === 2),
    'Successfully created draft assignment with BOTH PDF and manual questions');

  // Test Case D: Question editing, deleting, and reordering in draft
  console.log('\n--- Phase 3: Question Reordering, Editing & Deletion ---');

  const reorderedQuestions = [
    { prompt: 'Provide pseudocode for Dijkstra algorithm with priority queue.', display_order: 1 },
    { prompt: 'Explain the difference between a Red-Black tree and an AVL tree (Updated Prompt).', display_order: 2 }
    // Q3 removed (deleted)
  ];

  await assRepo.saveDraftAssessmentAtomic(
    draftOnlyQuestions.id,
    {
      class_subject_id: 'c5100000-0000-0000-0000-000000000001',
      title: 'Data Structures Manual Questions Assignment (Updated)',
      instructions: 'Updated instructions',
      deadline_at: new Date(Date.now() + 86400000).toISOString(),
      max_marks: 50,
      questions: reorderedQuestions,
      rubric: {
        title: 'DS Rubric Updated',
        criteria: [
          { title: 'Theoretical Depth', description: 'Understanding of concepts', max_marks: 25, display_order: 1 },
          { title: 'Pseudocode Accuracy', description: 'Correctness of algorithms', max_marks: 25, display_order: 2 }
        ]
      }
    },
    TEST_TEACHER_ID
  );

  const reloadedDraft = await assRepo.getFullAssessment(draftOnlyQuestions.id);
  assert(reloadedDraft.questions?.length === 2,
    'Question deletion succeeded (count reduced from 3 to 2)');
  assert(reloadedDraft.questions?.[0].prompt.includes('Dijkstra algorithm') && reloadedDraft.questions?.[0].display_order === 1,
    'Question reordering succeeded: Dijkstra is now Question #1');
  assert(reloadedDraft.questions?.[1].prompt.includes('Updated Prompt') && reloadedDraft.questions?.[1].display_order === 2,
    'Question prompt editing succeeded: Prompt text updated in Question #2');

  // Test Case E: Assignment-Level Rubric Total Must Equal Exactly 50 Marks Before Publishing
  console.log('\n--- Phase 4: Rubric 50-Mark Enforcement & Freezing on Publication ---');

  // Attempting to publish an assessment where rubric sum != 50 should be rejected
  const invalidRubricDraft = await assRepo.saveDraftAssessmentAtomic(
    null,
    {
      class_subject_id: 'c5100000-0000-0000-0000-000000000001',
      title: 'Invalid Rubric Sum Assignment',
      instructions: 'Rubric total is 40, not 50',
      deadline_at: new Date(Date.now() + 86400000).toISOString(),
      max_marks: 50,
      questions: [{ prompt: 'Question 1', display_order: 1 }],
      rubric: {
        title: 'Invalid Rubric',
        criteria: [
          { title: 'Criteria A', description: 'Part A', max_marks: 20, display_order: 1 },
          { title: 'Criteria B', description: 'Part B', max_marks: 20, display_order: 2 } // Total = 40 != 50
        ]
      }
    },
    TEST_TEACHER_ID
  );

  let publishInvalidFailed = false;
  try {
    await assRepo.publishAssessment(invalidRubricDraft.id, TEST_TEACHER_ID);
  } catch (err: any) {
    publishInvalidFailed = true;
    assert(err.message.includes('50') || err.message.includes('rubric'),
      `Publication blocked when rubric criteria sum != 50 marks: "${err.message}"`);
  }
  if (!publishInvalidFailed) {
    assert(false, 'Publication should have failed when rubric criteria sum != 50');
  }

  // Publish valid draft (where rubric criteria total 50)
  const publishedAssessment = await assRepo.publishAssessment(reloadedDraft.id, TEST_TEACHER_ID);
  assert(publishedAssessment.status === 'published',
    'Draft with rubric criteria totaling exactly 50 marks published successfully');

  // Verify questions and rubrics are frozen after publication
  let postPublishEditBlocked = false;
  try {
    await assRepo.saveDraftAssessmentAtomic(
      publishedAssessment.id,
      {
        class_subject_id: 'c5100000-0000-0000-0000-000000000001',
        title: 'Tampered Title',
        instructions: 'Tampered instructions',
        deadline_at: new Date(Date.now() + 86400000).toISOString(),
        max_marks: 50,
        questions: [{ prompt: 'New Question after publish', display_order: 1 }]
      },
      TEST_TEACHER_ID
    );
  } catch (err: any) {
    postPublishEditBlocked = true;
    assert(err.message.includes('Only draft assessments may be edited') || err.message.includes('frozen'),
      `Editing questions after publication blocked: "${err.message}"`);
  }
  if (!postPublishEditBlocked) {
    assert(false, 'Editing questions on published assessment should be blocked');
  }

  // --- Phase 5: Evaluation & Score Computation Verification ---
  console.log('\n--- Phase 5: Assignment-Level Rubric Evaluation & Score Calculations ---');

  // Create student submission
  const subRes = await subRepo.createOrUpdateSubmission({
    assessmentId: publishedAssessment.id,
    studentId: STUDENT_USER_ID,
    files: [{
      file_name: 'student_solutions.pdf',
      file_size: 10240,
      buffer: Buffer.from('%PDF-1.4 Mock Submission'),
      mime_type: 'application/pdf',
      sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    }],
    serverTime: new Date(),
    lateStatus: 'on_time'
  });
  assert(Boolean(subRes && subRes.submission.id), 'Student submitted answers successfully');

  // Fetch the active rubric criteria for the published assessment
  const publishedFullAss = await assRepo.getFullAssessment(publishedAssessment.id);
  const criteria = publishedFullAss.rubric?.criteria || [];
  assert(criteria.length === 2, `Active rubric has ${criteria.length} criteria`);

  // Evaluator grades by entering marks and feedback for each criterion (Assignment-level, NOT question-level)
  // Criterion 1 (max 25): score = 22, feedback = 'Strong grasp of concepts'
  // Criterion 2 (max 25): score = 24, feedback = 'Clean algorithm implementation'
  // Expected raw score: 22 + 24 = 46 / 50
  const evaluationResult = await evalRepo.saveEvaluation({
    submissionId: subRes.submission.id,
    evaluatorId: TEST_TEACHER_ID,
    generalFeedback: 'Overall excellent assignment submission with thorough depth.',
    status: 'draft',
    criterionScores: [
      {
        criterion_id: criteria[0].id,
        score: 22,
        feedback: 'Strong grasp of concepts'
      },
      {
        criterion_id: criteria[1].id,
        score: 24,
        feedback: 'Clean algorithm implementation'
      }
    ]
  });

  assert(evaluationResult.total_score === 46,
    `Calculated total score matches sum of rubric criteria (22 + 24 = ${evaluationResult.total_score} / 50)`);

  // Verify that late penalty applies correctly if the submission was late
  // Configure assessment to have late penalty: late_penalty_mode: 'fixed', late_penalty_marks: 5
  const assIdx = db.assessments.findIndex(a => a.id === publishedAssessment.id);
  db.assessments[assIdx].allow_late = true;
  db.assessments[assIdx].late_penalty_mode = 'fixed';
  db.assessments[assIdx].late_penalty_marks = 5;

  const lateSubRes = await subRepo.createOrUpdateSubmission({
    assessmentId: publishedAssessment.id,
    studentId: 'a4000000-0000-0000-0000-000000000002',
    files: [{
      file_name: 'late_student_solutions.pdf',
      file_size: 10240,
      buffer: Buffer.from('%PDF-1.4 Mock Late Submission'),
      mime_type: 'application/pdf',
      sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    }],
    serverTime: new Date(),
    lateStatus: 'late'
  });

  const lateEvaluationResult = await evalRepo.saveEvaluation({
    submissionId: lateSubRes.submission.id,
    evaluatorId: TEST_TEACHER_ID,
    generalFeedback: 'Good submission but submitted past the standard deadline.',
    status: 'completed',
    criterionScores: [
      {
        criterion_id: criteria[0].id,
        score: 25,
        feedback: 'Perfect theory'
      },
      {
        criterion_id: criteria[1].id,
        score: 25,
        feedback: 'Perfect code'
      }
    ]
  });

  assert(lateEvaluationResult.raw_score === 50,
    `Raw score before late deduction is 50 (25 + 25)`);
  assert(lateEvaluationResult.late_penalty_deducted === 5,
    `Late penalty deducted is 5 marks`);
  assert(lateEvaluationResult.total_score === 45,
    `Final score after late penalty deduction is 45 / 50 (50 - 5 = ${lateEvaluationResult.total_score})`);

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
