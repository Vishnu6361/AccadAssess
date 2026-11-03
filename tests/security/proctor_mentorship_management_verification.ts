import 'dotenv/config';
import { getAcademicRepository } from '../../apps/api/src/storage/academicRepository.js';
import { getUserRepository } from '../../apps/api/src/storage/userRepository.js';
import { randomUUID } from 'crypto';

interface TestResult {
  title: string;
  passed: boolean;
  message?: string;
}

const results: TestResult[] = [];

function assert(condition: boolean, title: string, message?: string) {
  if (condition) {
    results.push({ title, passed: true });
    console.log(`  [PASS] ${title}`);
  } else {
    results.push({ title, passed: false, message });
    console.error(`  [FAIL] ${title} - ${message || 'Assertion failed'}`);
  }
}

async function runTests() {
  console.log('==============================================================================');
  console.log('PROCTOR MENTORSHIP MANAGEMENT VERIFICATION TEST SUITE');
  console.log('==============================================================================');

  const academicRepo = getAcademicRepository();
  const userRepo = getUserRepository();
  console.log('Repository Mode:', academicRepo.getMode());

  // 1. Verify Proctors in User Directory
  console.log('\n--- 1. Faculty with Proctor Role Authorization ---');
  const allUsers = await userRepo.listUsers();
  const proctorUsers = allUsers.filter(u => u.roles?.includes('proctor') && u.status === 'active');
  
  assert(proctorUsers.length > 0, 'At least one active faculty member has the proctor role');
  for (const p of proctorUsers) {
    assert(p.roles.includes('proctor'), `Faculty ${p.full_name} authoritatively possesses proctor role`);
    assert(p.status === 'active', `Faculty ${p.full_name} is active`);
    assert(!p.usn, `Proctor ${p.full_name} is a faculty account (no USN assigned)`);
  }

  const studentUsers = allUsers.filter(u => u.roles?.includes('student'));
  for (const s of studentUsers) {
    assert(!s.roles?.includes('proctor'), `Student ${s.full_name} does NOT possess proctor role`);
  }

  // 2. Existing Student & Enrollment Verification
  console.log('\n--- 2. Student & Specialization Preservation ---');
  const enrollments = await academicRepo.listEnrollments();
  const vishnuEnrollment = enrollments.find(e => e.student_name?.includes('VISHNU') || e.student_usn === 'adm25mca9718');
  assert(Boolean(vishnuEnrollment), 'Target student VISHNU C N has valid enrollment');
  assert(vishnuEnrollment?.specialization_code === 'CYBER', 'VISHNU C N specialization is CYBER / Security stream');
  assert(vishnuEnrollment?.class_name === 'MCA Semester 3', 'VISHNU C N belongs to common MCA Semester 3 cohort');

  const studentId = vishnuEnrollment!.student_id;
  const classId = vishnuEnrollment!.class_id;
  const proctor = proctorUsers[0];

  // 3. Proctor Assignment & Bulk Allocation
  console.log('\n--- 3. Bulk & Individual Proctor Assignment ---');
  // Clean up any pre-existing test assignments for student to start clean
  const existingAssignments = await academicRepo.listProctorAssignments();
  const prior = existingAssignments.find(pa => pa.student_id === studentId);
  if (prior) {
    await academicRepo.removeProctorAssignment(prior.id);
  }

  // Create assignment
  const assignmentId = randomUUID();
  const createdAssignment = await academicRepo.assignProctor({
    id: assignmentId,
    class_id: classId,
    student_id: studentId,
    proctor_id: proctor.id,
    valid_from: new Date().toISOString().split('T')[0],
    valid_to: null,
    assigned_by: null
  });

  assert(Boolean(createdAssignment), 'Proctor assignment created successfully');
  assert(createdAssignment.proctor_id === proctor.id, 'Proctor ID matches assigned faculty');
  assert(createdAssignment.student_id === studentId, 'Student ID matches mentee');

  // 4. Proctor Assignment Retrieval & Enrichment
  console.log('\n--- 4. Proctor Assignment Retrieval & Enrichment ---');
  const proctorList = await academicRepo.listProctorAssignments();
  const fetched = proctorList.find(pa => pa.id === assignmentId);
  assert(Boolean(fetched), 'Assignment retrievable from listProctorAssignments');
  assert(fetched?.student_name === vishnuEnrollment!.student_name, 'Retrieved assignment contains enriched student_name');
  assert(fetched?.student_usn === vishnuEnrollment!.student_usn, 'Retrieved assignment contains student_usn');
  assert(fetched?.proctor_name === proctor.full_name, 'Retrieved assignment contains enriched proctor_name');
  assert(fetched?.class_name === vishnuEnrollment!.class_name, 'Retrieved assignment contains class_name');
  assert(fetched?.specialization_name === 'Security stream', 'Retrieved assignment contains specialization_name');

  // Test listProctorAssignmentsByProctor
  const byProctor = await academicRepo.listProctorAssignmentsByProctor(proctor.id);
  assert(byProctor.some(pa => pa.id === assignmentId), 'Assignment retrievable by proctor ID');

  // 5. Duplicate Prevention
  console.log('\n--- 5. Duplicate Assignment Prevention ---');
  const duplicate = await academicRepo.getProctorAssignment(classId, studentId, proctor.id);
  assert(Boolean(duplicate), 'System correctly detects existing assignment for same (class, student, proctor)');

  // 6. Proctor Reassignment Flow
  console.log('\n--- 6. Proctor Reassignment Flow ---');
  // Reassign to another valid profile
  const otherFaculty = allUsers.find(u => u.id !== proctor.id && u.status === 'active' && !u.usn);
  const otherFacultyId = otherFaculty ? otherFaculty.id : proctor.id;
  const updatedAssignment = await academicRepo.reassignProctor(assignmentId, otherFacultyId);
  assert(updatedAssignment.proctor_id === otherFacultyId, 'Reassignment updates proctor_id on existing record');

  // Reassign back to primary proctor
  await academicRepo.reassignProctor(assignmentId, proctor.id);
  const reverted = (await academicRepo.listProctorAssignments()).find(pa => pa.id === assignmentId);
  assert(reverted?.proctor_id === proctor.id, 'Reverted assignment points back to authoritative proctor');

  // 7. Safe Assignment Removal
  console.log('\n--- 7. Safe Removal (Non-destructive to Student or Enrollment) ---');
  const removeSuccess = await academicRepo.removeProctorAssignment(assignmentId);
  assert(removeSuccess, 'Proctor assignment removed successfully');

  const afterRemoval = await academicRepo.listProctorAssignments();
  assert(!afterRemoval.some(pa => pa.id === assignmentId), 'Assignment no longer exists in proctor_assignments');

  // Verify Student Profile & Enrollment are completely unaffected
  const studentProfileAfter = await userRepo.getProfileById(studentId);
  assert(Boolean(studentProfileAfter), 'Student user profile remains completely intact');
  assert(studentProfileAfter?.status === 'active', 'Student profile remains active');

  const enrollmentsAfter = await academicRepo.listEnrollments();
  const enrollmentAfter = enrollmentsAfter.find(e => e.student_id === studentId);
  assert(Boolean(enrollmentAfter), 'Student enrollment remains completely intact');
  assert(enrollmentAfter?.specialization_code === 'CYBER', 'Student specialization remains CYBER / Security stream');
  assert(enrollmentAfter?.class_name === 'MCA Semester 3', 'Student class remains MCA Semester 3');

  // Summary
  console.log('\n==============================================================================');
  const passed = results.filter(r => r.passed).length;
  const total = results.length;
  console.log(`VERIFICATION SUMMARY: ${passed} / ${total} TESTS PASSED`);
  console.log('==============================================================================');

  if (passed !== total) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
