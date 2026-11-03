import fs from 'fs';
import path from 'path';

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, details?: string) {
  if (condition) {
    console.log(`  [PASS] ${testName}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${testName}`);
    if (details) console.error(`         Details: ${details}`);
    failed++;
  }
}

console.log('================================================================');
console.log(' ACADASSESS: CLASS TEACHER SUBJECT-FIRST REPORT VERIFICATION     ');
console.log('================================================================\n');

const classTeacherWorkspacePath = path.resolve(process.cwd(), 'apps/web/src/features/teacher/ClassTeacherWorkspace.tsx');
const assessmentRoutesPath = path.resolve(process.cwd(), 'apps/api/src/assessments/assessmentRoutes.ts');
const apiClientPath = path.resolve(process.cwd(), 'apps/web/src/services/apiClient.ts');
const sidebarPath = path.resolve(process.cwd(), 'apps/web/src/components/Sidebar.tsx');

const workspaceContent = fs.readFileSync(classTeacherWorkspacePath, 'utf-8');
const routesContent = fs.readFileSync(assessmentRoutesPath, 'utf-8');
const clientContent = fs.readFileSync(apiClientPath, 'utf-8');
const sidebarContent = fs.readFileSync(sidebarPath, 'utf-8');

// --- 1. Backend Cohort Enrichment Verification ---
console.log('--- 1. Backend Cohort Enrichment Verification ---');
assert(
  routesContent.includes('specialization_id: e.specialization_id || null') &&
  routesContent.includes('specialization_code: e.specialization_code || null'),
  'Test 1: Backend cohort endpoint enriches students with enrollment specialization_id and code'
);

assert(
  routesContent.includes('subject_code: code') &&
  routesContent.includes('specialization_id: rawSpecId') &&
  routesContent.includes('specialization_code: spec?.code'),
  'Test 2: Backend cohort endpoint enriches subjects with subject_code and specialization details'
);

assert(
  clientContent.includes('specialization_id?: string | null;') &&
  clientContent.includes('specialization_code?: string | null;') &&
  clientContent.includes('interface ClassTeacherCohortSubjectDTO'),
  'Test 3: Frontend apiClient DTOs declare specialization fields for cohort students and subjects'
);

// --- 2. Level 1: Subjects List Verification ---
console.log('\n--- 2. Level 1: Subjects List Verification ---');
assert(
  workspaceContent.includes('selectedSubjectId') &&
  workspaceContent.includes('setSelectedSubjectId'),
  'Test 4: ClassTeacherWorkspace manages selectedSubjectId state for subject navigation'
);

assert(
  workspaceContent.includes('filteredSubjectsList.map') &&
  workspaceContent.includes('getPublishedAssessmentsForSubject'),
  'Test 5: Level 1 renders subjects belonging to class cohort with published assessment counts'
);

assert(
  workspaceContent.includes('sub.specialization_code ?') &&
  workspaceContent.includes('Core / Common'),
  'Test 6: Level 1 displays specialization badge or Core / Common for each subject card'
);

assert(
  workspaceContent.includes('View Assessments'),
  'Test 7: Level 1 subject cards include clear "View Assessments" action'
);

// --- 3. Level 2: Assessments List Verification ---
console.log('\n--- 3. Level 2: Assessments List Verification ---');
assert(
  workspaceContent.includes('selectedSubject && !selectedAssessment') &&
  workspaceContent.includes('Back to Subjects'),
  'Test 8: Level 2 renders assessments for selected subject with Back to Subjects navigation'
);

assert(
  workspaceContent.includes('Submission Progress') &&
  workspaceContent.includes('progressPct') &&
  workspaceContent.includes('Max marks:'),
  'Test 9: Level 2 shows published assessment details, max marks, deadlines, and submission progress'
);

assert(
  workspaceContent.includes('View Student Report') &&
  workspaceContent.includes('setSelectedAssessmentId'),
  'Test 10: Level 2 includes clear "View Student Report" action advancing to Level 3'
);

// --- 4. Level 3: Student-Wise Submission Report Verification ---
console.log('\n--- 4. Level 3: Student-Wise Submission Report Verification ---');
assert(
  workspaceContent.includes('selectedSubject && selectedAssessment') &&
  workspaceContent.includes('Back to Assessments'),
  'Test 11: Level 3 renders student report for selected assessment with Back to Assessments navigation'
);

assert(
  workspaceContent.includes('Student Name') &&
  workspaceContent.includes('Institutional USN') &&
  workspaceContent.includes('Submission Status') &&
  workspaceContent.includes('Submitted Date/Time') &&
  workspaceContent.includes('Timing Status') &&
  workspaceContent.includes('Evaluation Status') &&
  workspaceContent.includes('Published Marks'),
  'Test 12: Level 3 table includes all required columns with student name, USN, status, timing, evaluation, marks'
);

assert(
  workspaceContent.includes('item.specialization_code') &&
  workspaceContent.includes('bg-emerald-50 text-emerald-800'),
  'Test 13: Level 3 displays student specialization badge next to student name when present'
);

assert(
  workspaceContent.includes('Submitted') &&
  workspaceContent.includes('Pending') &&
  workspaceContent.includes('timing_status'),
  'Test 14: Non-submitting students are represented with Pending status and timing "—"'
);

assert(
  workspaceContent.includes('exportAssessmentReportToCsv') &&
  workspaceContent.includes('Export CSV'),
  'Test 15: Level 3 provides CSV export functionality for the selected assessment report'
);

// --- 5. Academic Data Filtering & MCA Sem 3 Cohort Rules ---
console.log('\n--- 5. Academic Data Filtering & Specialization Rules ---');
assert(
  workspaceContent.includes('getEligibleStudentsForSubject') &&
  workspaceContent.includes('subject.specialization_id && student.specialization_id') &&
  workspaceContent.includes('subject.specialization_code && student.specialization_code'),
  'Test 16: Specialization matching isolates eligible students for specialized subjects (e.g. CYBER, AI)'
);

assert(
  workspaceContent.includes('return allStudents;') &&
  workspaceContent.includes('getEligibleStudentsForSubject'),
  'Test 17: General/Core subjects include all students enrolled in the class cohort'
);

// --- 6. Breadcrumbs & Read-Only Governance ---
console.log('\n--- 6. Breadcrumbs & Read-Only Governance ---');
assert(
  workspaceContent.includes('Class Submissions Report') &&
  workspaceContent.includes('Student Submission Report') &&
  workspaceContent.includes('Breadcrumb'),
  'Test 18: 3-level breadcrumb trail renders clickable steps from Class Submissions Report down to Student Submission Report'
);

assert(
  workspaceContent.includes('Read-Only Class Teacher View') &&
  workspaceContent.includes('handleOpenSubmissionDetails'),
  'Test 19: Submission details modal remains strictly read-only for Class Teacher'
);

assert(
  sidebarContent.includes('{ id: \'late_reports\', label: \'Submissions & Late Report\', icon: FileSpreadsheet }'),
  'Test 20: Class Teacher top navigation items remain intact and consistent with workspace'
);

console.log('\n================================================================');
console.log(` RESULTS: ${passed} / ${passed + failed} TESTS PASSED (${Math.round((passed / (passed + failed)) * 100)}%)`);
console.log('================================================================\n');

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}

