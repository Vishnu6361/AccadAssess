process.env.SMARTFA_TEST_MODE = 'true';
import jwt from 'jsonwebtoken';
import http from 'http';
import app from '../../apps/api/src/index.js';
import { 
  getAcademicRepository, 
  InMemoryAcademicRepository 
} from '../../apps/api/src/storage/academicRepository.js';
import { 
  getUserRepository, 
  InMemoryUserRepository 
} from '../../apps/api/src/storage/userRepository.js';
import { db } from '../../apps/api/src/storage/db.js';
import { InviteUserRequestSchema } from '@smartfa/contracts';

console.log('================================================================');
console.log(' ACADASSESS: HOD USER CREATION & FACULTY ASSIGNMENT VERIFICATION ');
console.log('================================================================\n');

const DEV_JWT_SECRET = process.env.JWT_DEV_SECRET || 'smartfa-test-hmac-dev-secret-key-32chars';
const PORT = 4005;

let server: http.Server;

function createTestToken(userId: string, email: string = 'test@acadassess.edu', expiresIn: string = '1h'): string {
  return jwt.sign({ sub: userId, email }, DEV_JWT_SECRET, { expiresIn });
}

function makeRequest(
  method: string,
  path: string,
  token?: string,
  body?: any
): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const payload = body ? JSON.stringify(body) : undefined;
    if (payload) {
      headers['Content-Length'] = Buffer.byteLength(payload).toString();
    }

    const req = http.request(
      {
        hostname: 'localhost',
        port: PORT,
        path,
        method,
        headers
      },
      (res) => {
        let rawData = '';
        res.on('data', chunk => rawData += chunk);
        res.on('end', () => {
          try {
            const parsed = rawData ? JSON.parse(rawData) : {};
            resolve({ status: res.statusCode || 500, body: parsed });
          } catch {
            resolve({ status: res.statusCode || 500, body: rawData });
          }
        });
      }
    );

    req.on('error', reject);
    if (payload) {
      req.write(payload);
    }
    req.end();
  });
}

let totalTests = 0;
let passedTests = 0;

function assert(condition: boolean, testName: string, failureDetails?: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  [PASS] Test ${totalTests}: ${testName}`);
  } else {
    console.error(`  [FAIL] Test ${totalTests}: ${testName}`);
    if (failureDetails) {
      console.error(`         Details: ${failureDetails}`);
    }
    process.exitCode = 1;
  }
}

async function runTests() {
  server = app.listen(PORT);

  const HOD_ID = 'a1000000-0000-0000-0000-000000000001';
  const TEACHER_ID = 'a2000000-0000-0000-0000-000000000001';
  const STUDENT_ID = 'a4000000-0000-0000-0000-000000000001';

  const hodToken = createTestToken(HOD_ID, 'hod@smartfa.edu');
  const teacherToken = createTestToken(TEACHER_ID, 'teacher1@smartfa.edu');
  const studentToken = createTestToken(STUDENT_ID, 'student.a@smartfa.edu');

  try {
    // -------------------------------------------------------------------------
    // 1. Initial User Creation Simplification & Schema Validation
    // -------------------------------------------------------------------------
    console.log('\n--- 1. Initial User Creation Simplification & Schema Validation ---');

    // Schema accepts student and faculty
    const validStudentSchema = InviteUserRequestSchema.safeParse({
      full_name: 'Test Student',
      email: 'student.schema@smartfa.edu',
      usn: '1RV24MC100',
      account_type: 'student',
      role: 'student'
    });
    assert(validStudentSchema.success, 'InviteUserRequestSchema validates student account');

    const validFacultySchema = InviteUserRequestSchema.safeParse({
      full_name: 'Test Faculty',
      email: 'faculty.schema@smartfa.edu',
      account_type: 'faculty',
      role: 'faculty'
    });
    assert(validFacultySchema.success, 'InviteUserRequestSchema validates faculty account without USN');

    // Direct HOD invitation via regular endpoint must be rejected
    const hodInviteAttempt = await makeRequest(
      'POST',
      '/api/v1/admin/hod/users/invite',
      hodToken,
      {
        full_name: 'Attempted HOD',
        email: 'fakehod@smartfa.edu',
        role: 'hod',
        account_type: 'faculty'
      }
    );
    assert(
      hodInviteAttempt.status === 403 && hodInviteAttempt.body.error?.code === 'FORBIDDEN_PRIVILEGE_ESCALATION',
      'HOD role cannot be granted via standard user invitation (HTTP 403 FORBIDDEN_PRIVILEGE_ESCALATION)'
    );

    // -------------------------------------------------------------------------
    // 2. Conditional Form Rules: USN Required for Student
    // -------------------------------------------------------------------------
    console.log('\n--- 2. Conditional USN Rules (Mandatory for Student) ---');

    const studentWithoutUsn = await makeRequest(
      'POST',
      '/api/v1/admin/hod/users/invite',
      hodToken,
      {
        full_name: 'No USN Student',
        email: 'nousn.student@smartfa.edu',
        role: 'student',
        account_type: 'student'
      }
    );
    assert(
      studentWithoutUsn.status === 400 && studentWithoutUsn.body.error?.message?.includes('USN is required'),
      'Student account without USN rejected with HTTP 400 (USN is required for student accounts)'
    );

    const validStudent = await makeRequest(
      'POST',
      '/api/v1/admin/hod/users/invite',
      hodToken,
      {
        full_name: 'Valid New Student',
        email: 'valid.student@smartfa.edu',
        usn: '1RV24MC201',
        role: 'student',
        account_type: 'student'
      }
    );
    assert(
      validStudent.status === 201 && validStudent.body.user?.usn === '1RV24MC201',
      'Student account with USN successfully provisioned (HTTP 201, USN persisted)'
    );

    // -------------------------------------------------------------------------
    // 3. Conditional Form Rules: USN Hidden & Not Required for Faculty
    // -------------------------------------------------------------------------
    console.log('\n--- 3. USN Hidden & Omitted for Faculty Accounts ---');

    const validFaculty = await makeRequest(
      'POST',
      '/api/v1/admin/hod/users/invite',
      hodToken,
      {
        full_name: 'Dr. Ramesh Sharma',
        email: 'ramesh.sharma@smartfa.edu',
        role: 'faculty',
        account_type: 'faculty'
      }
    );
    assert(
      validFaculty.status === 201 && (validFaculty.body.user?.usn === null || validFaculty.body.user?.usn === undefined),
      'Faculty account created without USN (HTTP 201, USN is null)'
    );

    // -------------------------------------------------------------------------
    // 4. Safe Base Faculty Role Provisioning & Zero Accidental Privileges
    // -------------------------------------------------------------------------
    console.log('\n--- 4. Safe Base Faculty Provisioning & Zero Accidental Roles ---');

    const createdFacultyId = validFaculty.body.user.id;
    const userRepo = getUserRepository();
    const facultyRoles = await userRepo.getActiveRolesByUserId(createdFacultyId);

    assert(
      facultyRoles.length === 1 && facultyRoles[0] === 'subject_teacher',
      'Faculty receives safe base portal role ("subject_teacher") without unearned privileges'
    );
    assert(
      !facultyRoles.includes('class_teacher') && !facultyRoles.includes('proctor') && !facultyRoles.includes('hod'),
      'Faculty account does NOT automatically receive Class Teacher, Proctor, or HOD roles'
    );

    const assignmentsCheck = await makeRequest(
      'GET',
      `/api/v1/admin/hod/users/${createdFacultyId}/assignments`,
      hodToken
    );
    assert(
      assignmentsCheck.status === 200 &&
      assignmentsCheck.body.class_subjects.length === 0 &&
      assignmentsCheck.body.class_teacher_classes.length === 0 &&
      assignmentsCheck.body.proctor_assignments.length === 0,
      'New faculty account has zero initial class or subject allocations'
    );

    // -------------------------------------------------------------------------
    // 5. Separate Faculty Assignment Workflow (Manage Roles & Subjects)
    // -------------------------------------------------------------------------
    console.log('\n--- 5. Separate Faculty Assignment Workflow ---');

    // Assign Class Teacher role
    const addClassTeacherRole = await makeRequest(
      'POST',
      `/api/v1/admin/hod/users/${createdFacultyId}/roles`,
      hodToken,
      { role: 'class_teacher' }
    );
    assert(
      addClassTeacherRole.status === 201 && addClassTeacherRole.body.role?.role === 'class_teacher',
      'HOD assigns Class Teacher role through separate workflow (HTTP 201)'
    );

    // Assign Proctor role
    const addProctorRole = await makeRequest(
      'POST',
      `/api/v1/admin/hod/users/${createdFacultyId}/roles`,
      hodToken,
      { role: 'proctor' }
    );
    assert(
      addProctorRole.status === 201 && addProctorRole.body.role?.role === 'proctor',
      'HOD assigns Proctor role through separate workflow (HTTP 201)'
    );

    // Create a new class to test allocation
    const academicRepo = getAcademicRepository();
    const existingDept = (await academicRepo.listDepartments())[0];
    const newTermRes = await makeRequest(
      'POST',
      '/api/v1/admin/hod/terms',
      hodToken,
      {
        name: 'Spring 2027',
        starts_on: '2027-01-01',
        ends_on: '2027-05-31',
        active: true
      }
    );
    assert(newTermRes.status === 201, 'Fresh academic term created');
    const existingTerm = newTermRes.body.term;

    const newClassRes = await makeRequest(
      'POST',
      '/api/v1/admin/hod/classes',
      hodToken,
      {
        department_id: existingDept.id,
        term_id: existingTerm.id,
        programme: 'MCA',
        semester: 3,
        section: 'B'
      }
    );
    assert(newClassRes.status === 201, 'Fresh test class created successfully', JSON.stringify(newClassRes.body));
    const targetClass = newClassRes.body?.class;
    // Create a new subject to test allocation
    const newSubjectRes = await makeRequest(
      'POST',
      '/api/v1/admin/hod/subjects',
      hodToken,
      {
        department_id: existingDept.id,
        code: 'MCA399',
        name: 'Advanced Software Engineering',
        credits: 4
      }
    );
    assert(newSubjectRes.status === 201, 'Fresh subject created with valid UUID');
    const targetSubject = newSubjectRes.body.subject;

    const assignSubjectRes = await makeRequest(
      'POST',
      '/api/v1/admin/hod/class-subjects',
      hodToken,
      {
        class_id: targetClass.id,
        subject_id: targetSubject.id,
        subject_teacher_id: createdFacultyId
      }
    );
    assert(
      assignSubjectRes.status === 201 && assignSubjectRes.body?.class_subject?.subject_teacher_id === createdFacultyId,
      'HOD allocates subject & class to faculty member (HTTP 201)',
      JSON.stringify(assignSubjectRes.body)
    );
    const assignedClassSubjectId = assignSubjectRes.body?.class_subject?.id;

    // Designate as class teacher for class
    const assignClassTeacherRes = await makeRequest(
      'PATCH',
      `/api/v1/admin/hod/classes/${targetClass.id}/class-teacher`,
      hodToken,
      { class_teacher_id: createdFacultyId }
    );
    assert(
      assignClassTeacherRes.status === 200 && assignClassTeacherRes.body.class?.class_teacher_id === createdFacultyId,
      'HOD designates faculty member as Class Teacher for class (HTTP 200)'
    );

    // Verify GET assignments reflects the new allocations
    const updatedAssignments = await makeRequest(
      'GET',
      `/api/v1/admin/hod/users/${createdFacultyId}/assignments`,
      hodToken
    );
    assert(
      updatedAssignments.status === 200 &&
      updatedAssignments.body.roles.includes('class_teacher') &&
      updatedAssignments.body.roles.includes('proctor') &&
      updatedAssignments.body.class_subjects.some((cs: any) => cs.id === assignedClassSubjectId) &&
      updatedAssignments.body.class_teacher_classes.some((c: any) => c.id === targetClass.id),
      'GET /api/v1/admin/hod/users/:id/assignments returns all active roles, subject allocations, and class designations'
    );

    // Unassign subject from class
    const unassignSubjectRes = await makeRequest(
      'DELETE',
      `/api/v1/admin/hod/class-subjects/${assignedClassSubjectId}`,
      hodToken
    );
    assert(
      unassignSubjectRes.status === 200 && unassignSubjectRes.body.success === true,
      'HOD unassigns subject from class (HTTP 200)'
    );

    // Revoke proctor role
    const revokeRoleRes = await makeRequest(
      'DELETE',
      `/api/v1/admin/hod/users/${createdFacultyId}/roles/proctor`,
      hodToken
    );
    assert(
      revokeRoleRes.status === 200 && revokeRoleRes.body.removed_role === 'proctor',
      'HOD revokes proctor role from faculty member (HTTP 200)'
    );

    // -------------------------------------------------------------------------
    // 6. Security, RBAC & Self-Escalation Guards
    // -------------------------------------------------------------------------
    console.log('\n--- 6. Security Invariants & Unauthorized Protection ---');

    // Student token cannot access HOD routes
    const studentUnauthorized = await makeRequest(
      'POST',
      '/api/v1/admin/hod/users/invite',
      studentToken,
      { full_name: 'Hacker', email: 'hacker@test.com', role: 'student', usn: '1RV99' }
    );
    assert(
      studentUnauthorized.status === 403,
      'Student token rejected from HOD endpoints (HTTP 403 FORBIDDEN)'
    );

    // Teacher token without HOD role cannot access HOD routes
    const teacherUnauthorized = await makeRequest(
      'POST',
      `/api/v1/admin/hod/users/${createdFacultyId}/roles`,
      teacherToken,
      { role: 'hod' }
    );
    assert(
      teacherUnauthorized.status === 403,
      'Non-HOD faculty token rejected from role assignment endpoints (HTTP 403 FORBIDDEN)'
    );

    // HOD cannot alter own roles (prevent self-modification)
    const selfModificationAttempt = await makeRequest(
      'DELETE',
      `/api/v1/admin/hod/users/${HOD_ID}/roles/hod`,
      hodToken
    );
    assert(
      selfModificationAttempt.status === 403 &&
      selfModificationAttempt.body.error?.code === 'FORBIDDEN_SELF_MODIFICATION',
      'HOD cannot self-revoke or self-alter own roles (HTTP 403 FORBIDDEN_SELF_MODIFICATION)'
    );

    // HOD role cannot be revoked through regular role endpoint
    const revokeHodAttempt = await makeRequest(
      'DELETE',
      `/api/v1/admin/hod/users/${createdFacultyId}/roles/hod`,
      hodToken
    );
    assert(
      revokeHodAttempt.status === 403 &&
      revokeHodAttempt.body.error?.code === 'FORBIDDEN_PRIVILEGE_ESCALATION',
      'HOD role cannot be revoked through regular role endpoint (HTTP 403 FORBIDDEN_PRIVILEGE_ESCALATION)'
    );

    // -------------------------------------------------------------------------
    // 7. Portal Separation & Authentic Access Verification
    // -------------------------------------------------------------------------
    console.log('\n--- 7. Portal Separation & Auth Verification ---');

    // Student accesses student portal
    const studentPortalRes = await makeRequest(
      'POST',
      '/api/v1/auth/verify-portal',
      studentToken,
      { portal: 'student' }
    );
    assert(
      studentPortalRes.status === 200 && studentPortalRes.body.authorized === true,
      'Student account successfully enters Student Portal (HTTP 200)'
    );

    // Faculty accesses faculty portal
    const facultyToken = createTestToken(createdFacultyId, 'ramesh.sharma@smartfa.edu');
    const facultyPortalRes = await makeRequest(
      'POST',
      '/api/v1/auth/verify-portal',
      facultyToken,
      { portal: 'faculty' }
    );
    assert(
      facultyPortalRes.status === 200 && facultyPortalRes.body.authorized === true,
      'Provisioned faculty account enters Faculty Portal with base access (HTTP 200)'
    );

    // Faculty denied student portal
    const facultyInStudentPortal = await makeRequest(
      'POST',
      '/api/v1/auth/verify-portal',
      facultyToken,
      { portal: 'student' }
    );
    assert(
      facultyInStudentPortal.status === 403 &&
      facultyInStudentPortal.body.error?.code === 'PORTAL_ACCESS_DENIED',
      'Faculty account denied from Student Portal (HTTP 403 PORTAL_ACCESS_DENIED)'
    );

    // Student denied faculty portal
    const studentInFacultyPortal = await makeRequest(
      'POST',
      '/api/v1/auth/verify-portal',
      studentToken,
      { portal: 'faculty' }
    );
    assert(
      studentInFacultyPortal.status === 403 &&
      studentInFacultyPortal.body.error?.code === 'PORTAL_ACCESS_DENIED',
      'Student account denied from Faculty Portal (HTTP 403 PORTAL_ACCESS_DENIED)'
    );

    // Audit logs verify role operations
    const auditRes = await makeRequest('GET', '/api/v1/admin/hod/audit', hodToken);
    assert(
      auditRes.status === 200 && Array.isArray(auditRes.body.events) && auditRes.body.events.length > 0,
      'Role and assignment changes recorded in authoritative audit system'
    );

    console.log('\n================================================================');
    console.log(` HOD WORKFLOW VERIFICATION: ${passedTests}/${totalTests} TESTS PASSED`);
    console.log('================================================================\n');

  } finally {
    server.close();
  }
}

runTests().catch((err) => {
  console.error('Fatal test runner error:', err);
  if (server) server.close();
  process.exit(1);
});
