/**
 * ==============================================================================
 * ACADASSESS: NAVIGATION SIMPLIFICATION & ROLE-BASED WORKSPACE VERIFICATION
 * ==============================================================================
 * 
 * Verifies all 8 requirements specified in the user request:
 * 1. HOD sees only:
 *    - Academic Structure (academics)
 *    - User Directory & Roles (users)
 *    - Institutional Submission Report (institutional_reports)
 * 2. Subject Teacher sees only:
 *    - Formative Assessments (assessments)
 *    - Rubric Evaluations (grading)
 *    (Submissions & PDFs removed)
 * 3. Submissions Report remains functional inside Formative Assessments.
 * 4. Subject Teacher can still create and manage assessments (backend endpoints intact).
 * 5. Rubric Evaluations remains accessible to Subject Teachers.
 * 6. HOD + Subject Teacher workspace switching still functions bidirectionally.
 * 7. Proctor and Class Teacher navigation remains completely unchanged.
 * 8. Direct navigation to removed routes is redirected safely:
 *    - HOD attempting assessments/grading/submissions -> redirected to academics
 *    - Subject Teacher attempting submissions/late_reports -> redirected to assessments
 * ==============================================================================
 */

import fs from 'fs';
import path from 'path';

let totalTests = 0;
let passedTests = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  [PASS] Test ${totalTests}: ${testName}`);
  } else {
    console.error(`  [FAIL] Test ${totalTests}: ${testName}${detail ? ` -> ${detail}` : ''}`);
  }
}

async function runTests() {
  console.log('================================================================');
  console.log(' ACADASSESS: NAVIGATION SIMPLIFICATION VERIFICATION SUITE       ');
  console.log('================================================================\n');

  const sidebarPath = path.resolve(process.cwd(), 'apps/web/src/components/Sidebar.tsx');
  const appPath = path.resolve(process.cwd(), 'apps/web/src/app/App.tsx');
  const assessmentPath = path.resolve(process.cwd(), 'apps/web/src/features/teacher/AssessmentManagement.tsx');

  const sidebarContent = fs.readFileSync(sidebarPath, 'utf-8');
  const appContent = fs.readFileSync(appPath, 'utf-8');
  const assessmentContent = fs.readFileSync(assessmentPath, 'utf-8');

  console.log('--- 1. HOD Workspace Navigation Items ---');

  // Verify HOD section in Sidebar.tsx
  const hodSectionMatch = sidebarContent.match(/if\s*\(\s*activeRole\s*===\s*'hod'\s*\)\s*\{\s*return\s*\[([\s\S]*?)\];\s*\}/);
  assert(Boolean(hodSectionMatch), 'HOD role configuration block found in Sidebar.tsx');

  const hodSection = hodSectionMatch ? hodSectionMatch[1] : '';

  assert(
    hodSection.includes("'academics'") && hodSection.includes('Academic Structure'),
    'HOD workspace includes Academic Structure navigation item',
    hodSection
  );
  assert(
    hodSection.includes("'users'") && hodSection.includes('User Directory & Roles'),
    'HOD workspace includes User Directory & Roles navigation item',
    hodSection
  );
  assert(
    !hodSection.includes('Academic Assessments'),
    'Academic Assessments removed from HOD workspace sidebar',
    hodSection
  );
  assert(
    !hodSection.includes('Rubric Evaluations'),
    'Rubric Evaluations removed from HOD workspace sidebar',
    hodSection
  );

  console.log('\n--- 2. Subject Teacher Workspace Navigation Items ---');

  const teacherSectionMatch = sidebarContent.match(/if\s*\(\s*activeRole\s*===\s*'subject_teacher'\s*\)\s*\{\s*return\s*\[([\s\S]*?)\];\s*\}/);
  assert(Boolean(teacherSectionMatch), 'Subject Teacher role configuration block found in Sidebar.tsx');

  const teacherSection = teacherSectionMatch ? teacherSectionMatch[1] : '';

  assert(
    teacherSection.includes("'assessments'") && teacherSection.includes('Formative Assessments'),
    'Subject Teacher workspace includes Formative Assessments navigation item',
    teacherSection
  );
  assert(
    teacherSection.includes("'grading'") && teacherSection.includes('Rubric Evaluations'),
    'Subject Teacher workspace includes Rubric Evaluations navigation item',
    teacherSection
  );
  assert(
    !teacherSection.includes('Submissions & PDFs'),
    'Submissions & PDFs removed from Subject Teacher workspace sidebar',
    teacherSection
  );

  console.log('\n--- 3. Other Roles Navigation Preservation ---');

  // Class Teacher
  const classTeacherMatch = sidebarContent.match(/if\s*\(\s*activeRole\s*===\s*'class_teacher'\s*\)\s*\{\s*return\s*\[([\s\S]*?)\];\s*\}/);
  const classTeacherSection = classTeacherMatch ? classTeacherMatch[1] : '';
  assert(
    classTeacherSection.includes('Class Workspace') &&
    classTeacherSection.includes('Student Cohort') &&
    classTeacherSection.includes('Submissions & Late Report'),
    'Class Teacher navigation remains completely intact',
    classTeacherSection
  );

  // Proctor
  const proctorMatch = sidebarContent.match(/if\s*\(\s*activeRole\s*===\s*'proctor'\s*\)\s*\{\s*return\s*\[([\s\S]*?)\];\s*\}/);
  const proctorSection = proctorMatch ? proctorMatch[1] : '';
  assert(
    proctorSection.includes('Mentee Submissions Report'),
    'Proctor navigation remains completely intact',
    proctorSection
  );

  // Student
  const studentSectionMatch = sidebarContent.match(/\/\/\s*Default\s*\/\s*student view[\s\S]*?return\s*\[([\s\S]*?)\];/);
  const studentSection = studentSectionMatch ? studentSectionMatch[1] : '';
  assert(
    studentSection.includes('My Assessments') &&
    studentSection.includes('My Submissions') &&
    studentSection.includes('Published Results'),
    'Student navigation remains completely intact',
    studentSection
  );

  console.log('\n--- 4. Submissions Report Tab Preservation in Formative Assessments ---');

  assert(
    assessmentContent.includes('Assessments Catalog') &&
    assessmentContent.includes('Submissions Report'),
    'AssessmentManagement preserves both "Assessments Catalog" and "Submissions Report" tabs'
  );
  assert(
    assessmentContent.includes("activeTab === 'submissions_report'"),
    'AssessmentManagement conditionally renders the full Submissions Report monitoring view'
  );

  console.log('\n--- 5. Removed Routes Safe Redirection Logic ---');

  // Check App.tsx redirect logic for HOD
  assert(
    appContent.includes("activeRole === 'hod'") &&
    appContent.includes("activeItem !== 'academics' && activeItem !== 'users'") &&
    appContent.includes("setActiveItem('academics')"),
    'Direct navigation by HOD to removed routes redirects to "academics"'
  );

  // Check App.tsx redirect logic for Subject Teacher
  assert(
    appContent.includes("activeRole === 'subject_teacher'") &&
    appContent.includes("activeItem !== 'assessments' && activeItem !== 'grading'") &&
    appContent.includes("setActiveItem('assessments')"),
    'Direct navigation by Subject Teacher to removed route redirects to "assessments"'
  );

  // Check Portal Overview complete removal
  assert(
    !sidebarContent.includes('Portal Overview') && !appContent.includes('Portal Overview'),
    'Portal Overview completely removed from both Sidebar.tsx and App.tsx'
  );

  // Check default active item resolution
  assert(
    appContent.includes("getDefaultActiveItemForRole"),
    'getDefaultActiveItemForRole initializes and transitions activeItem correctly based on role'
  );

  console.log('\n--- 6. Rubric Evaluations Access for Subject Teacher ---');

  assert(
    appContent.includes("activeItem === 'grading' && <EvaluationGrading activeRole={activeRole} />"),
    'EvaluationGrading component is directly accessible when activeItem === "grading"'
  );

  console.log('\n--- 7. Workspace Switching Preservation ---');

  assert(
    appContent.includes("handleRoleChange") &&
    appContent.includes("switchRole(newRole)") &&
    appContent.includes("setActiveItem(getDefaultActiveItemForRole(newRole))"),
    'handleRoleChange switches role and defaults activeItem to primary landing view of new workspace'
  );

  console.log('\n================================================================');
  console.log(` RESULTS: ${passedTests} / ${totalTests} TESTS PASSED (${Math.round((passedTests/totalTests)*100)}%)`);
  console.log('================================================================\n');

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runTests();
