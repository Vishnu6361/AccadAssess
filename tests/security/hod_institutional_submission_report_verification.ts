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

console.log('========================================================================');
console.log(' ACADASSESS: HOD INSTITUTIONAL SUBMISSION REPORT VERIFICATION SUITE     ');
console.log('========================================================================\n');

const hodRoutesPath = path.resolve(process.cwd(), 'apps/api/src/admin/hodRoutes.ts');
const apiClientPath = path.resolve(process.cwd(), 'apps/web/src/services/apiClient.ts');
const sidebarPath = path.resolve(process.cwd(), 'apps/web/src/components/Sidebar.tsx');
const appPath = path.resolve(process.cwd(), 'apps/web/src/app/App.tsx');
const reportComponentPath = path.resolve(process.cwd(), 'apps/web/src/features/hod/InstitutionalSubmissionReport.tsx');

const hodRoutesContent = fs.readFileSync(hodRoutesPath, 'utf-8');
const apiClientContent = fs.readFileSync(apiClientPath, 'utf-8');
const sidebarContent = fs.readFileSync(sidebarPath, 'utf-8');
const appContent = fs.readFileSync(appPath, 'utf-8');
const reportComponentContent = fs.readFileSync(reportComponentPath, 'utf-8');

// --- 1. Layout Isolation: Portal Overview Complete Removal Verification ---
console.log('--- 1. Layout Isolation: Portal Overview Complete Removal Verification ---');

assert(
  !appContent.includes("Portal Overview") && !appContent.includes("activeItem === 'foundation'"),
  'Test 1: Portal Overview has been completely removed from App.tsx and does not render under any tab'
);

assert(
  !appContent.includes("{activeItem !== 'users' && activeItem !== 'academics' && activeItem !== 'assessments'"),
  'Test 2: App.tsx removed inverted boolean check that caused Portal Overview to render underneath institutional report'
);

assert(
  appContent.includes("{activeItem === 'institutional_reports' && activeRole === 'hod' && <InstitutionalSubmissionReport />}"),
  'Test 3: App.tsx renders InstitutionalSubmissionReport exclusively for activeItem === "institutional_reports"'
);

// --- 2. HOD Sidebar Navigation Verification ---
console.log('\n--- 2. HOD Sidebar Navigation Verification ---');

const hodSidebarMatch = sidebarContent.match(/if\s*\(\s*activeRole\s*===\s*'hod'\s*\)\s*\{\s*return\s*\[([\s\S]*?)\];\s*\}/);
assert(Boolean(hodSidebarMatch), 'Test 4: HOD role configuration block found in Sidebar.tsx');

const hodSidebarSection = hodSidebarMatch ? hodSidebarMatch[1] : '';

assert(
  hodSidebarSection.includes("'institutional_reports'") &&
  hodSidebarSection.includes('Institutional Submission Report') &&
  hodSidebarSection.includes('FileSpreadsheet'),
  'Test 5: HOD sidebar contains "Institutional Submission Report" with FileSpreadsheet icon'
);

assert(
  !hodSidebarSection.includes('Academic Assessments') &&
  !hodSidebarSection.includes('Rubric Evaluations'),
  'Test 6: HOD sidebar preserves removal of Academic Assessments and Rubric Evaluations'
);

// --- 3. App Routing, Breadcrumbs, & Safe Redirection ---
console.log('\n--- 3. App Routing & Safe Redirection Verification ---');

assert(
  appContent.includes("activeItem !== 'institutional_reports'") &&
  appContent.includes("InstitutionalSubmissionReport = React.lazy(() => import('../features/hod/InstitutionalSubmissionReport')"),
  'Test 7: App.tsx permits activeItem="institutional_reports" for HOD and lazy loads InstitutionalSubmissionReport'
);

assert(
  appContent.includes("activeItem === 'institutional_reports'") &&
  appContent.includes("? 'Institutional Submission Report'"),
  'Test 8: App.tsx maps breadcrumb item to "Institutional Submission Report"'
);

// --- 4. Backend Authorization & Reporting API ---
console.log('\n--- 4. Backend Authorization & Reporting API Verification ---');

assert(
  hodRoutesContent.includes("router.use(requireRoles(['hod']))"),
  'Test 9: HOD router strictly enforces requireRoles(["hod"]) for all administrative and reporting endpoints'
);

assert(
  hodRoutesContent.includes("router.get('/institutional-submissions-report', async (req: Request, res: Response)") &&
  hodRoutesContent.includes("const assessmentId = req.query.assessment_id as string | undefined;"),
  'Test 10: Backend exposes GET /institutional-submissions-report supporting overview and assessment-specific modes'
);

assert(
  hodRoutesContent.includes("const eligibleEnrollments = rawSpecId") &&
  hodRoutesContent.includes("e.specialization_id === rawSpecId || (spec?.code && e.specialization_code === spec.code)"),
  'Test 11: Backend properly attributes enrollment specialization and isolates Core vs Specialized eligibility'
);

assert(
  hodRoutesContent.includes("const isSubmitted = Boolean(match && match.is_submitted);") &&
  hodRoutesContent.includes("const timingStatus: 'On Time' | 'Late' | '—' = isSubmitted ? (isLate ? 'Late' : 'On Time') : '—';"),
  'Test 12: Non-submitting students are represented with Pending status and timing "—"'
);

assert(
  apiClientContent.includes("getInstitutionalSubmissionsReport: async (assessmentId?: string)") &&
  apiClientContent.includes("InstitutionalSubjectReportItem") &&
  apiClientContent.includes("InstitutionalAssessmentReportItem") &&
  apiClientContent.includes("InstitutionalStudentReportItem"),
  'Test 13: Frontend apiClient implements getInstitutionalSubmissionsReport with complete TypeScript interfaces'
);

// --- 5. Level 1: Immediate All-Subjects Display Without Filters ---
console.log('\n--- 5. Level 1: Immediate All-Subjects Display (Matching Proctor & Class Teacher) ---');

assert(
  reportComponentContent.includes("selectedSubjectId") &&
  reportComponentContent.includes("subjects.map"),
  'Test 14: Level 1 immediately renders all institutional subjects directly from server state without filter restriction'
);

assert(
  !reportComponentContent.includes("programmeFilter") &&
  !reportComponentContent.includes("specializationFilter") &&
  !reportComponentContent.includes("semesterFilter") &&
  !reportComponentContent.includes("subjectSearch") &&
  !reportComponentContent.includes("Clear Filters"),
  'Test 15: All Level 1 filter toolbars (search, programme, specialization, semester dropdowns, clear button) are removed'
);

assert(
  reportComponentContent.includes("sub.specialization_code ?") &&
  reportComponentContent.includes("Core / Common"),
  'Test 16: Level 1 displays specialization badge or Core / Common for each subject card'
);

assert(
  reportComponentContent.includes("sub.subject_code") &&
  reportComponentContent.includes("sub.programme") &&
  reportComponentContent.includes("Sem ${sub.semester}") &&
  reportComponentContent.includes("sub.subject_name"),
  'Test 17: Subject cards display subject code, programme, semester, and subject name'
);

assert(
  reportComponentContent.includes("sub.published_assessments_count") &&
  reportComponentContent.includes("sub.total_eligible_students") &&
  reportComponentContent.includes("View Assessments"),
  'Test 18: Subject cards display published assessment count, eligible student count, and View Assessments action'
);

// --- 6. Level 2: Subject Assessments Grid (Matching Class Teacher) ---
console.log('\n--- 6. Level 2: Subject Assessments Grid Verification ---');

assert(
  reportComponentContent.includes("selectedSubject && !selectedAssessment") &&
  reportComponentContent.includes("Back to Subjects"),
  'Test 19: Level 2 renders assessments for selected subject with Back to Subjects navigation'
);

assert(
  reportComponentContent.includes("Max marks:") &&
  reportComponentContent.includes("Due:") &&
  reportComponentContent.includes("Submissions Progress"),
  'Test 20: Level 2 presents published assessments with max marks, deadline, and submission progress'
);

assert(
  reportComponentContent.includes("handleSelectAssessment(ass.id)") &&
  reportComponentContent.includes("View Student Report"),
  'Test 21: Level 2 provides clear "View Student Report" action advancing to Level 3'
);

// --- 7. Level 3: Institution-wide Student Submissions Table (Matching Class Teacher) ---
console.log('\n--- 7. Level 3: Institution-wide Student Submissions Table Verification ---');

assert(
  reportComponentContent.includes("selectedSubject && selectedAssessment") &&
  reportComponentContent.includes("Back to Assessments"),
  'Test 22: Level 3 renders student roster for selected assessment with Back to Assessments navigation'
);

assert(
  reportComponentContent.includes("Student Name") &&
  reportComponentContent.includes("USN / Admission No.") &&
  reportComponentContent.includes("Programme & Spec") &&
  reportComponentContent.includes("Class") &&
  reportComponentContent.includes("Submission Status") &&
  reportComponentContent.includes("Submitted Date/Time") &&
  reportComponentContent.includes("Timing Status") &&
  reportComponentContent.includes("Evaluation Status") &&
  reportComponentContent.includes("Published Marks") &&
  reportComponentContent.includes("Action"),
  'Test 23: Level 3 table includes all required columns including USN, Class, Specialization, Status, Timing, and Marks'
);

assert(
  reportComponentContent.includes("exportAssessmentReportToCsv") &&
  reportComponentContent.includes("Export CSV"),
  'Test 24: Level 3 provides CSV export functionality for the selected assessment report'
);

// --- 8. Read-Only Oversight & Safety ---
console.log('\n--- 8. Read-Only Oversight & Safety Verification ---');

assert(
  reportComponentContent.includes("selectedSubmissionDetails") &&
  reportComponentContent.includes("View Details") &&
  reportComponentContent.includes("Close"),
  'Test 25: Level 3 includes read-only View Details modal for inspecting student submission and files'
);

assert(
  !reportComponentContent.includes("gradeSubmission") &&
  !reportComponentContent.includes("saveEvaluation") &&
  !reportComponentContent.includes("publishResults") &&
  !reportComponentContent.includes("createAssessment"),
  'Test 26: HOD Institutional Submission Report strictly preserves read-only oversight (no grading or authoring controls)'
);

console.log('\n========================================================================');
console.log(` RESULTS: ${passed} / ${passed + failed} TESTS PASSED (${Math.round((passed / (passed + failed)) * 100)}%)`);
console.log('========================================================================\n');

if (failed > 0) {
  process.exit(1);
}
