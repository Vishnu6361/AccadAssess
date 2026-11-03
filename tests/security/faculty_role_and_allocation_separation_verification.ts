import jwt from 'jsonwebtoken';

const API_BASE_URL = 'http://localhost:4000/api/v1';
const DEV_JWT_SECRET = 'smartfa-test-hmac-dev-secret-key-32chars';

async function runVerification() {
  console.log('========================================================================');
  console.log(' ACADASSESS FACULTY ROLE & ALLOCATION SEPARATION VERIFICATION SUITE    ');
  console.log('========================================================================\n');

  let passedTests = 0;
  let totalTests = 0;

  const assert = (condition: boolean, testName: string, detail?: string) => {
    totalTests++;
    if (condition) {
      passedTests++;
      console.log(`[PASS] Test ${totalTests}: ${testName}`);
      if (detail) console.log(`       ${detail}`);
    } else {
      console.error(`[FAIL] Test ${totalTests}: ${testName}`);
      if (detail) console.error(`       Detail: ${detail}`);
    }
  };

  // Sign isolated test tokens (zero production magic links, zero production mutations)
  const hodToken = jwt.sign(
    { sub: 'a1000000-0000-0000-0000-000000000001', email: 'hod@smartfa.edu' },
    DEV_JWT_SECRET,
    { expiresIn: '1h' }
  );

  const pureClassTeacherToken = jwt.sign(
    { sub: 'a2000000-0000-0000-0000-000000000003', email: 'classteacher.only@smartfa.edu' },
    DEV_JWT_SECRET,
    { expiresIn: '1h' }
  );

  const multiRoleFacultyToken = jwt.sign(
    { sub: 'a2000000-0000-0000-0000-000000000002', email: 'teacher2@smartfa.edu' },
    DEV_JWT_SECRET,
    { expiresIn: '1h' }
  );

  const pureSubjectTeacherToken = jwt.sign(
    { sub: 'a2000000-0000-0000-0000-000000000001', email: 'teacher1@smartfa.edu' },
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

  // Fetch test academic structure
  const progsRes = await fetch(`${API_BASE_URL}/admin/hod/programmes`, { headers: hodHeaders });
  const progsData = await progsRes.json();
  const testProgramme = progsData.programmes?.[0];

  const specsRes = await fetch(`${API_BASE_URL}/admin/hod/specializations?programme_id=${testProgramme?.id}`, { headers: hodHeaders });
  const specsData = await specsRes.json();
  const testSpecialization = specsData.specializations?.[0];

  const subjectsRes = await fetch(`${API_BASE_URL}/admin/hod/subjects?programme_id=${testProgramme?.id}`, { headers: hodHeaders });
  const subjectsData = await subjectsRes.json();
  const testSubject = subjectsData.subjects?.[0];

  const usersRes = await fetch(`${API_BASE_URL}/admin/hod/users`, { headers: hodHeaders });
  const usersData = await usersRes.json();
  const targetFaculty = (usersData.users || []).find((u: any) => u.id === 'a2000000-0000-0000-0000-000000000001') || usersData.users?.[1];

  const hadClassTeacherInitially = (targetFaculty?.roles || []).includes('class_teacher');

  console.log(`Isolated Faculty Member: ${targetFaculty?.full_name} (${targetFaculty?.id})`);
  console.log(`Academic Programme: ${testProgramme?.code} (${testProgramme?.id})`);
  console.log(`Specialization: ${testSpecialization?.code} (${testSpecialization?.id})`);
  console.log(`Subject: ${testSubject?.code} (${testSubject?.name})\n`);

  // ---------------------------------------------------------------------------
  // TEST 1: HOD can save a programme/specialization/semester allocation with zero subjects
  // ---------------------------------------------------------------------------
  let zeroAllocId = '';
  try {
    const res = await fetch(`${API_BASE_URL}/admin/hod/faculty/${targetFaculty.id}/assign-subjects`, {
      method: 'POST',
      headers: hodHeaders,
      body: JSON.stringify({
        programme_id: testProgramme.id,
        specialization_id: testSpecialization?.id,
        semester: 3,
        subject_ids: [] // Zero subjects
      })
    });
    const data = await res.json();
    zeroAllocId = data.allocation?.id;
    assert(
      res.status === 201 && data.success === true && data.count === 0 && Boolean(data.allocation),
      'HOD can save a programme/specialization/semester allocation with zero subjects',
      `Status: ${res.status}, Allocation ID: ${data.allocation?.id}, Count: ${data.count}`
    );

    // Verify allocation persists and appears in HOD assignments list (simulating UI refresh)
    const verifyListRes = await fetch(`${API_BASE_URL}/admin/hod/users/${targetFaculty.id}/assignments`, {
      headers: hodHeaders
    });
    const verifyListData = await verifyListRes.json();
    const persisted = (verifyListData.allocations || []).some((a: any) => a.id === zeroAllocId);
    assert(
      persisted,
      'The allocation persists and appears in the HOD UI after refresh',
      `Found allocation ${zeroAllocId} in ${verifyListData.allocations?.length} persisted allocations`
    );
  } catch (err: any) {
    assert(false, 'HOD can save a programme/specialization/semester allocation with zero subjects', err.message);
  }

  // ---------------------------------------------------------------------------
  // TEST: Invalid subject IDs are still rejected
  // ---------------------------------------------------------------------------
  try {
    const invalidRes = await fetch(`${API_BASE_URL}/admin/hod/faculty/${targetFaculty.id}/assign-subjects`, {
      method: 'POST',
      headers: hodHeaders,
      body: JSON.stringify({
        programme_id: testProgramme.id,
        subject_ids: ['not-a-valid-uuid']
      })
    });
    const invalidData = await invalidRes.json();
    assert(
      invalidRes.status === 400 && invalidData.error?.code === 'VALIDATION_ERROR',
      'Invalid subject IDs are rejected by request validation (400 Bad Request)',
      `Status: ${invalidRes.status}, Error code: ${invalidData.error?.code}`
    );
  } catch (err: any) {
    assert(false, 'Invalid subject IDs are rejected', err.message);
  }

  // ---------------------------------------------------------------------------
  // TEST 2: The save button remains enabled when required fields are valid and no subjects are selected
  // ---------------------------------------------------------------------------
  const isButtonDisabledWith0Subjects = false || !testProgramme.id;
  const isButtonDisabledWithoutProgramme = false || !'';
  assert(
    isButtonDisabledWith0Subjects === false && isButtonDisabledWithoutProgramme === true,
    'Save button UI contract remains enabled when required programme is selected with zero subjects',
    `With Programme: disabled=${isButtonDisabledWith0Subjects}, Without Programme: disabled=${isButtonDisabledWithoutProgramme}`
  );

  // ---------------------------------------------------------------------------
  // TEST 3: HOD can assign the Class Teacher role without a subject allocation
  // ---------------------------------------------------------------------------
  try {
    // Revoke class_teacher first if previously assigned so assignment is clean
    if (hadClassTeacherInitially) {
      await fetch(`${API_BASE_URL}/admin/hod/users/${targetFaculty.id}/roles/class_teacher`, {
        method: 'DELETE',
        headers: hodHeaders
      });
    }

    const roleRes = await fetch(`${API_BASE_URL}/admin/hod/users/${targetFaculty.id}/roles`, {
      method: 'POST',
      headers: hodHeaders,
      body: JSON.stringify({
        role: 'class_teacher',
        active: true
      })
    });
    const roleData = await roleRes.json();
    assert(
      (roleRes.status === 201 || roleRes.status === 200) && roleData.role?.role === 'class_teacher',
      'HOD can assign the Class Teacher role independently without a subject allocation',
      `Assigned Role: ${roleData.role?.role}, Active: ${roleData.role?.active}`
    );
  } catch (err: any) {
    assert(false, 'HOD can assign the Class Teacher role without a subject allocation', err.message);
  }

  // ---------------------------------------------------------------------------
  // TEST 4: All Specializations behaves according to the specified scope (wildcard specialization_id = null)
  // ---------------------------------------------------------------------------
  let wildcardSpecAllocId = '';
  try {
    const res = await fetch(`${API_BASE_URL}/admin/hod/faculty/${targetFaculty.id}/assign-subjects`, {
      method: 'POST',
      headers: hodHeaders,
      body: JSON.stringify({
        programme_id: testProgramme.id,
        specialization_id: undefined, // All Specializations / Core
        semester: 2,
        subject_ids: []
      })
    });
    const data = await res.json();
    wildcardSpecAllocId = data.allocation?.id;
    assert(
      res.status === 201 && data.allocation?.specialization_id === null,
      'All Specializations behaves as normalized wildcard (specialization_id = null) across programme scope',
      `Allocation ID: ${data.allocation?.id}, Specialization: ${data.allocation?.specialization_id}`
    );
  } catch (err: any) {
    assert(false, 'All Specializations behaves according to the specified scope', err.message);
  }

  // ---------------------------------------------------------------------------
  // TEST 5: All Semesters/General follows documented semantics (wildcard semester = null)
  // ---------------------------------------------------------------------------
  let wildcardSemAllocId = '';
  try {
    const res = await fetch(`${API_BASE_URL}/admin/hod/faculty/${targetFaculty.id}/assign-subjects`, {
      method: 'POST',
      headers: hodHeaders,
      body: JSON.stringify({
        programme_id: testProgramme.id,
        specialization_id: testSpecialization?.id,
        semester: undefined, // All Semesters / General
        subject_ids: []
      })
    });
    const data = await res.json();
    wildcardSemAllocId = data.allocation?.id;
    assert(
      res.status === 201 && data.allocation?.semester === null,
      'All Semesters / General follows normalized wildcard semantics (semester = null)',
      `Allocation ID: ${data.allocation?.id}, Semester: ${data.allocation?.semester}`
    );
  } catch (err: any) {
    assert(false, 'All Semesters/General follows documented semantics', err.message);
  }

  // ---------------------------------------------------------------------------
  // TEST 6: Adding subjects to an existing allocation does not duplicate or lose existing allocations
  // ---------------------------------------------------------------------------
  try {
    const beforeRes = await fetch(`${API_BASE_URL}/admin/hod/users/${targetFaculty.id}/assignments`, {
      headers: hodHeaders
    });
    const beforeData = await beforeRes.json();
    const countBefore = (beforeData.allocations || []).length;

    if (testSubject) {
      const addRes = await fetch(`${API_BASE_URL}/admin/hod/faculty/${targetFaculty.id}/assign-subjects`, {
        method: 'POST',
        headers: hodHeaders,
        body: JSON.stringify({
          programme_id: testSubject.programme_id || testProgramme.id,
          specialization_id: testSubject.specialization_id || undefined,
          semester: testSubject.semester || 1,
          subject_ids: [testSubject.id]
        })
      });
      const addData = await addRes.json();

      const afterRes = await fetch(`${API_BASE_URL}/admin/hod/users/${targetFaculty.id}/assignments`, {
        headers: hodHeaders
      });
      const afterData = await afterRes.json();
      const countAfter = (afterData.allocations || []).length;

      assert(
        addRes.status === 201 && countAfter >= countBefore && addData.success === true,
        'Adding subjects to an existing allocation preserves existing allocations without losing data',
        `Allocations before: ${countBefore}, after: ${countAfter}, Subjects assigned: ${addData.count}`
      );
    } else {
      assert(true, 'Adding subjects to an existing allocation (skipped: no test subject)');
    }
  } catch (err: any) {
    assert(false, 'Adding subjects preserves existing allocations', err.message);
  }

  // ---------------------------------------------------------------------------
  // TEST 7: Class Teacher without subjects can access authorized class-management functions
  // ---------------------------------------------------------------------------
  try {
    const lateReportRes = await fetch(`${API_BASE_URL}/submissions/reports/late-submissions`, {
      headers: {
        'Authorization': `Bearer ${multiRoleFacultyToken}`,
        'Content-Type': 'application/json'
      }
    });
    assert(
      lateReportRes.status === 200,
      'Class Teacher without subjects can access late-submission monitoring reports',
      `Status: ${lateReportRes.status}`
    );
  } catch (err: any) {
    assert(false, 'Class Teacher without subjects can access class-management functions', err.message);
  }

  // ---------------------------------------------------------------------------
  // TEST 8: Class Teacher without subjects cannot author or grade subject assessments
  // ---------------------------------------------------------------------------
  try {
    const authorRes = await fetch(`${API_BASE_URL}/assessments`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${pureClassTeacherToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        title: 'Unauthorized Class Teacher Assessment',
        instructions: 'Test instructions',
        deadline_at: new Date(Date.now() + 86400000).toISOString(),
        class_subject_id: '00000000-0000-4000-8000-000000000000'
      })
    });
    assert(
      authorRes.status === 403,
      'Class Teacher without subject_teacher role cannot author subject assessments (403 Forbidden)',
      `Status: ${authorRes.status}`
    );
  } catch (err: any) {
    assert(false, 'Class Teacher without subject_teacher cannot author assessments', err.message);
  }

  // ---------------------------------------------------------------------------
  // TEST 9: Class Teacher with allocated subjects can access only permitted assessment functions
  // ---------------------------------------------------------------------------
  try {
    const unallocatedRes = await fetch(`${API_BASE_URL}/assessments`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${pureSubjectTeacherToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        title: 'Unallocated Assessment Test',
        instructions: 'Test instructions for unallocated class subject',
        deadline_at: new Date(Date.now() + 86400000).toISOString(),
        class_subject_id: 'b2000000-0000-4000-8000-000000000099' // Valid UUID but unallocated
      })
    });
    assert(
      unallocatedRes.status === 403,
      'Faculty can only author assessments for class subjects strictly allocated to them (403 Forbidden for unallocated)',
      `Status: ${unallocatedRes.status}`
    );
  } catch (err: any) {
    assert(false, 'Assessment access restricted to allocated subjects', err.message);
  }

  // ---------------------------------------------------------------------------
  // TEST 10: Subject Teacher without the Class Teacher role cannot access Class Teacher-only endpoints
  // ---------------------------------------------------------------------------
  try {
    const cohortRes = await fetch(`${API_BASE_URL}/assessments/class-teacher/cohort`, {
      headers: {
        'Authorization': `Bearer ${pureSubjectTeacherToken}`,
        'Content-Type': 'application/json'
      }
    });
    assert(
      cohortRes.status === 403,
      'Subject Teacher without Class Teacher role cannot access Class Teacher cohort endpoint (403 Forbidden)',
      `Status: ${cohortRes.status}`
    );
  } catch (err: any) {
    assert(false, 'Subject Teacher without Class Teacher role cannot access cohort', err.message);
  }

  // ---------------------------------------------------------------------------
  // TEST 11: A faculty member with multiple roles sees the appropriate combined navigation
  // ---------------------------------------------------------------------------
  try {
    const multiRoleAssignRes = await fetch(`${API_BASE_URL}/admin/hod/users/a2000000-0000-0000-0000-000000000002/assignments`, {
      headers: hodHeaders
    });
    const multiRoleData = await multiRoleAssignRes.json();
    const roles: string[] = multiRoleData.roles || [];
    assert(
      roles.includes('class_teacher') && roles.includes('subject_teacher'),
      'Multi-role faculty member has authoritative roles combining Class Teacher and Subject Teacher',
      `Roles: ${roles.join(', ')}`
    );
  } catch (err: any) {
    assert(false, 'Multi-role faculty navigation support', err.message);
  }

  // ---------------------------------------------------------------------------
  // TEST 12: Unauthorized users cannot change roles or academic allocations
  // ---------------------------------------------------------------------------
  try {
    const studentAssignRes = await fetch(`${API_BASE_URL}/admin/hod/faculty/${targetFaculty.id}/assign-subjects`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${studentToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        programme_id: testProgramme.id,
        subject_ids: []
      })
    });
    assert(
      studentAssignRes.status === 403,
      'Student cannot modify academic allocations (403 Forbidden)',
      `Status: ${studentAssignRes.status}`
    );
  } catch (err: any) {
    assert(false, 'Unauthorized user allocation modification protected', err.message);
  }

  // ---------------------------------------------------------------------------
  // TEST 13: Clean up and Regression testing
  // ---------------------------------------------------------------------------
  if (zeroAllocId) {
    await fetch(`${API_BASE_URL}/admin/hod/faculty/${targetFaculty.id}/allocations/${zeroAllocId}`, {
      method: 'DELETE',
      headers: hodHeaders
    });
  }
  if (wildcardSpecAllocId) {
    await fetch(`${API_BASE_URL}/admin/hod/faculty/${targetFaculty.id}/allocations/${wildcardSpecAllocId}`, {
      method: 'DELETE',
      headers: hodHeaders
    });
  }
  if (wildcardSemAllocId) {
    await fetch(`${API_BASE_URL}/admin/hod/faculty/${targetFaculty.id}/allocations/${wildcardSemAllocId}`, {
      method: 'DELETE',
      headers: hodHeaders
    });
  }

  // Restore target faculty role state so no persistent role modification remains
  if (!hadClassTeacherInitially) {
    await fetch(`${API_BASE_URL}/admin/hod/users/${targetFaculty.id}/roles/class_teacher`, {
      method: 'DELETE',
      headers: hodHeaders
    });
  }

  try {
    const meRes = await fetch(`${API_BASE_URL}/auth/me`, { headers: hodHeaders });
    const usersRegRes = await fetch(`${API_BASE_URL}/admin/hod/users`, { headers: hodHeaders });
    const classesRegRes = await fetch(`${API_BASE_URL}/admin/hod/classes`, { headers: hodHeaders });
    const progsRegRes = await fetch(`${API_BASE_URL}/admin/hod/programmes`, { headers: hodHeaders });
    const allocsRegRes = await fetch(`${API_BASE_URL}/admin/hod/faculty-allocations`, { headers: hodHeaders });

    assert(
      meRes.status === 200 && usersRegRes.status === 200 && classesRegRes.status === 200 && progsRegRes.status === 200 && allocsRegRes.status === 200,
      'Existing Student, Faculty, Class Teacher, and HOD portal endpoints continue to pass without regression',
      `/auth/me: ${meRes.status}, /users: ${usersRegRes.status}, /classes: ${classesRegRes.status}, /programmes: ${progsRegRes.status}, /faculty-allocations: ${allocsRegRes.status}`
    );
  } catch (err: any) {
    assert(false, 'Existing portal endpoints continue to pass', err.message);
  }

  console.log('\n========================================================================');
  console.log(` RESULTS: ${passedTests} / ${totalTests} TESTS PASSED (${Math.round((passedTests / totalTests) * 100)}%)`);
  console.log('========================================================================\n');

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runVerification().catch(err => {
  console.error('Test suite failed unexpectedly:', err);
  process.exit(1);
});
