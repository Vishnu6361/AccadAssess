import jwt from 'jsonwebtoken';
import { formatClassName } from '@smartfa/contracts';

const API_BASE_URL = 'http://localhost:4000/api/v1';
const DEV_JWT_SECRET = 'smartfa-test-hmac-dev-secret-key-32chars';

async function runMcaStandardizationVerification() {
  console.log('========================================================================');
  console.log(' ACADASSESS MCA STRUCTURE STANDARDIZATION & VERIFICATION SUITE         ');
  console.log('========================================================================\n');

  let passed = 0;
  let total = 0;

  const assert = (condition: boolean, testName: string, detail?: string) => {
    total++;
    if (condition) {
      passed++;
      console.log(`[PASS] Test ${total}: ${testName}`);
      if (detail) console.log(`       ${detail}`);
    } else {
      console.error(`[FAIL] Test ${total}: ${testName}`);
      if (detail) console.error(`       Detail: ${detail}`);
    }
  };

  const hodToken = jwt.sign(
    { sub: 'a1000000-0000-0000-0000-000000000001', email: 'hod@smartfa.edu' },
    DEV_JWT_SECRET,
    { expiresIn: '1h' }
  );

  const teacherToken = jwt.sign(
    { sub: 'a2000000-0000-0000-0000-000000000002', email: 'teacher2@smartfa.edu' },
    DEV_JWT_SECRET,
    { expiresIn: '1h' }
  );

  const studentToken = jwt.sign(
    { sub: 'a4000000-0000-0000-0000-000000000001', email: 'student.a@smartfa.edu' },
    DEV_JWT_SECRET,
    { expiresIn: '1h' }
  );

  const hodHeaders = {
    'Authorization': `Bearer ${hodToken}`,
    'Content-Type': 'application/json'
  };

  // ---------------------------------------------------------------------------
  // TEST 1: Helper formatClassName standardizes MCA to "MCA Semester {N}"
  // ---------------------------------------------------------------------------
  const mcaStandardName = formatClassName({ programme: 'MCA', semester: 3, section: 'A' });
  const mcaAiName = formatClassName({ programme: 'MCA', semester: 3, section: 'AI' });
  const mcaNoSecName = formatClassName({ programme: 'MCA', semester: 3, section: null });
  const otherProgName = formatClassName({ programme: 'BCA', semester: 2, section: 'B' });

  assert(
    mcaStandardName === 'MCA Semester 3' && mcaAiName === 'MCA Semester 3' && mcaNoSecName === 'MCA Semester 3',
    'formatClassName contracts helper standardizes all MCA cohorts to "MCA Semester {N}"',
    `mcaStandard: "${mcaStandardName}", mcaAi: "${mcaAiName}", mcaNoSec: "${mcaNoSecName}"`
  );

  assert(
    otherProgName === 'BCA Sem 2-B',
    'formatClassName preserves section formatting for non-MCA programmes that use sections',
    `otherProgName: "${otherProgName}"`
  );

  // ---------------------------------------------------------------------------
  // TEST 2: The HOD directory & assignments API returns standardized class names
  // ---------------------------------------------------------------------------
  try {
    const csRes = await fetch(`${API_BASE_URL}/admin/hod/class-subjects`, { headers: hodHeaders });
    const csData = await csRes.json();
    const classSubjects: any[] = csData.class_subjects || [];

    const mcaClassSubjects = classSubjects.filter(cs => cs.class_name?.includes('MCA'));
    const allMcaStandardized = mcaClassSubjects.length > 0 && mcaClassSubjects.every(cs => cs.class_name.startsWith('MCA Semester '));

    assert(
      allMcaStandardized,
      'All MCA class subjects returned by API standardize class_name to "MCA Semester {N}" without sections',
      `MCA Class Names: ${mcaClassSubjects.map(cs => cs.class_name).join(', ')}`
    );
  } catch (err: any) {
    assert(false, 'HOD class subjects API class_name standardization', err.message);
  }

  // ---------------------------------------------------------------------------
  // TEST 3: No fabricated MCA section labels (e.g. "MCA Sem 3-A", "MCA Sem 3-AI") appear in API
  // ---------------------------------------------------------------------------
  try {
    const csRes = await fetch(`${API_BASE_URL}/admin/hod/class-subjects`, { headers: hodHeaders });
    const csData = await csRes.json();
    const classSubjects: any[] = csData.class_subjects || [];

    const hasFabricatedSection = classSubjects.some(
      cs => cs.class_name?.includes('3-A') || cs.class_name?.includes('3-AI') || cs.class_name?.includes('Sem 3-')
    );

    assert(
      !hasFabricatedSection,
      'No fabricated MCA section labels ("MCA Sem 3-A", "MCA Sem 3-AI") appear in class-subjects API output',
      `Evaluated ${classSubjects.length} class subjects`
    );
  } catch (err: any) {
    assert(false, 'Check for fabricated MCA sections', err.message);
  }

  // ---------------------------------------------------------------------------
  // TEST 4: The Class Teacher dashboard resolves the correct academic scope
  // ---------------------------------------------------------------------------
  try {
    const cohortRes = await fetch(`${API_BASE_URL}/assessments/class-teacher/cohort`, {
      headers: { 'Authorization': `Bearer ${hodToken}` }
    });
    const cohortData = await cohortRes.json();
    const classes: any[] = cohortData.classes || [];

    const mcaCohort = classes.find(c => c.programme === 'MCA');
    assert(
      cohortRes.status === 200 && Boolean(mcaCohort) && mcaCohort?.name === 'MCA Semester 3',
      'Class Teacher cohort endpoint resolves academic scope as "MCA Semester 3"',
      `Status: ${cohortRes.status}, Name: "${mcaCohort?.name}"`
    );
  } catch (err: any) {
    assert(false, 'Class Teacher cohort resolution', err.message);
  }

  // ---------------------------------------------------------------------------
  // TEST 5: Existing assessment, submission, evaluation, and grade records remain accessible
  // ---------------------------------------------------------------------------
  try {
    const assRes = await fetch(`${API_BASE_URL}/assessments`, { headers: hodHeaders });
    const assData = await assRes.json();
    const assessments: any[] = assData.assessments || [];

    assert(
      assessments.length > 0,
      'Existing assessment records remain accessible and intact',
      `Loaded ${assessments.length} assessment(s)`
    );

    const mcaAssessment = assessments.find((a: any) => a.class_details?.includes('MCA') || a.title?.toLowerCase().includes('formative') || a.title?.toLowerCase().includes('cloud'));
    if (mcaAssessment) {
      assert(
        !mcaAssessment.class_details?.includes('-A'),
        'Assessment class_details displays standardized MCA semester without "-A"',
        `class_details: "${mcaAssessment.class_details}"`
      );
    } else {
      assert(true, 'Assessment class_details check (skipped: no MCA assessment)');
    }
  } catch (err: any) {
    assert(false, 'Assessment records preservation', err.message);
  }

  // ---------------------------------------------------------------------------
  // TEST 6: Late submissions report uses standardized class name
  // ---------------------------------------------------------------------------
  try {
    const lateRes = await fetch(`${API_BASE_URL}/submissions/reports/late-submissions`, {
      headers: { 'Authorization': `Bearer ${teacherToken}` }
    });
    const lateData = await lateRes.json();
    const reports: any[] = Array.isArray(lateData) ? lateData : lateData.reports || [];

    const hasOldSectionInReport = reports.some(r => r.class_name?.includes('3-A') || r.class_name?.includes('3-AI'));
    assert(
      lateRes.status === 200 && !hasOldSectionInReport,
      'Late submissions monitoring report uses standardized class names without fabricated sections',
      `Status: ${lateRes.status}, Report count: ${reports.length}`
    );
  } catch (err: any) {
    assert(false, 'Late submissions report class name check', err.message);
  }

  // ---------------------------------------------------------------------------
  // TEST 7: Role and authorization boundaries continue to be enforced
  // ---------------------------------------------------------------------------
  try {
    const studentCohortRes = await fetch(`${API_BASE_URL}/assessments/class-teacher/cohort`, {
      headers: { 'Authorization': `Bearer ${studentToken}` }
    });
    assert(
      studentCohortRes.status === 403,
      'Student unauthorized access to Class Teacher cohort endpoint remains blocked (403 Forbidden)',
      `Status: ${studentCohortRes.status}`
    );
  } catch (err: any) {
    assert(false, 'Role boundary enforcement check', err.message);
  }

  console.log('\n========================================================================');
  console.log(` RESULTS: ${passed} / ${total} TESTS PASSED (${Math.round((passed / total) * 100)}%)`);
  console.log('========================================================================\n');

  if (passed !== total) {
    process.exit(1);
  }
}

runMcaStandardizationVerification().catch(err => {
  console.error('Verification suite failed:', err);
  process.exit(1);
});
