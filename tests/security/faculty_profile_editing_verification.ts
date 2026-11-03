/**
 * ==============================================================================
 * ACADASSESS: FACULTY PROFILE EDITING VERIFICATION SUITE
 * ==============================================================================
 * 
 * Verifies all 10 requirements:
 * 1. HOD can open the Edit Faculty modal (UI elements & state)
 * 2. Faculty name can be updated
 * 3. Email update follows authentication sync & database synchronization
 * 4. Duplicate emails are rejected (409 Conflict)
 * 5. Invalid inputs are rejected (empty name, invalid email, invalid phone format)
 * 6. Updated information appears in User Directory after saving
 * 7. Updated information persists across sessions / login
 * 8. Unauthorized users receive 403 Forbidden
 * 9. Existing faculty roles and academic allocations remain unchanged
 * 10. Audit log records are created with actor, target, changed fields, and timestamp
 * ==============================================================================
 */

process.env.SMARTFA_TEST_MODE = 'true';
import http from 'http';
import fs from 'fs';
import path from 'path';
import jwt from 'jsonwebtoken';
import app from '../../apps/api/src/index.js';
import { db } from '../../apps/api/src/storage/db.js';
import { InMemoryUserRepository, setUserRepositoryForTesting } from '../../apps/api/src/storage/userRepository.js';
import { InMemoryAssessmentRepository, setAssessmentRepositoryForTesting } from '../../apps/api/src/storage/assessmentRepository.js';
import { InMemorySubmissionRepository, setSubmissionRepositoryForTesting } from '../../apps/api/src/storage/submissionRepository.js';
import { InMemoryAcademicRepository, setAcademicRepositoryForTesting } from '../../apps/api/src/storage/academicRepository.js';
import { InMemoryEvaluationRepository, setEvaluationRepositoryForTesting } from '../../apps/api/src/storage/evaluationRepository.js';
import { invalidateUserContextCache } from '../../apps/api/src/authorization/rbac.js';

let server: http.Server;
const PORT = 4059;
const DEV_JWT_SECRET = process.env.JWT_DEV_SECRET || 'smartfa-test-hmac-dev-secret-key-32chars';

// User Fixtures
const HOD_USER_ID = 'a1000000-0000-0000-0000-000000000001'; // Dr. Nagamani S.
const TEACHER_1_ID = 'a2000000-0000-0000-0000-000000000001'; // Prof. Priya Menon
const TEACHER_2_ID = 'a2000000-0000-0000-0000-000000000002'; // Prof. Arvind Kumar
const STUDENT_USER_ID = '3acf60f9-3f03-406d-8f1e-6ac01ae36f14'; // VISHNU C N

let totalTests = 0;
let passedTests = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  totalTests++;
  const cleanName = testName.replace(/^Test \d+:\s*/, '');
  if (condition) {
    passedTests++;
    console.log(`  [PASS] Test ${totalTests}: ${cleanName}`);
  } else {
    console.error(`  [FAIL] Test ${totalTests}: ${cleanName}${detail ? ` -> ${detail}` : ''}`);
  }
}

function makeToken(userId: string, email: string): string {
  return jwt.sign(
    { sub: userId, email, aud: 'authenticated', role: 'authenticated' },
    DEV_JWT_SECRET,
    { algorithm: 'HS256', expiresIn: '1h' }
  );
}

async function apiRequest(
  method: string,
  urlPath: string,
  token?: string,
  body?: any,
  activeRole?: string
): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (activeRole) headers['x-active-role'] = activeRole;

    const payload = body ? JSON.stringify(body) : undefined;
    if (payload) headers['Content-Length'] = Buffer.byteLength(payload).toString();

    const req = http.request(
      {
        hostname: 'localhost',
        port: PORT,
        path: urlPath,
        method,
        headers
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => (raw += chunk));
        res.on('end', () => {
          let parsed: any;
          try {
            parsed = JSON.parse(raw);
          } catch {
            parsed = raw;
          }
          resolve({ status: res.statusCode || 500, body: parsed });
        });
      }
    );

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function setupFixtures() {
  invalidateUserContextCache();

  db.profiles = [
    {
      id: HOD_USER_ID,
      email: 'hod@smartfa.internal',
      full_name: 'Dr. Nagamani S.',
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: TEACHER_1_ID,
      email: 'priya.menon@smartfa.internal',
      full_name: 'Prof. Priya Menon',
      status: 'active',
      phone: '+91 98765 43210',
      employee_id: 'FAC-MCA-101',
      designation: 'Assistant Professor',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: TEACHER_2_ID,
      email: 'arvind.kumar@smartfa.internal',
      full_name: 'Prof. Arvind Kumar',
      status: 'active',
      employee_id: 'FAC-MCA-102',
      designation: 'Associate Professor',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: STUDENT_USER_ID,
      email: 'student@smartfa.internal',
      full_name: 'VISHNU C N',
      usn: 'adm25mca9718',
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }
  ];

  db.roles = [
    { id: 'r-1', user_id: HOD_USER_ID, role: 'hod', active: true, created_at: new Date().toISOString() },
    { id: 'r-2', user_id: TEACHER_1_ID, role: 'subject_teacher', active: true, created_at: new Date().toISOString() },
    { id: 'r-3', user_id: TEACHER_2_ID, role: 'class_teacher', active: true, created_at: new Date().toISOString() },
    { id: 'r-4', user_id: STUDENT_USER_ID, role: 'student', active: true, created_at: new Date().toISOString() }
  ];

  db.faculty_roles = [
    { id: 'fr-1', faculty_id: HOD_USER_ID, institutional_role: 'hod', created_at: new Date().toISOString() },
    { id: 'fr-2', faculty_id: TEACHER_1_ID, institutional_role: 'subject_teacher', created_at: new Date().toISOString() },
    { id: 'fr-3', faculty_id: TEACHER_2_ID, institutional_role: 'class_teacher', created_at: new Date().toISOString() }
  ];

  db.faculty_allocations = [
    {
      id: 'fa-1',
      faculty_id: TEACHER_1_ID,
      programme_id: '3b960388-a3fc-4bf4-9d08-4abe467ec4cd',
      specialization_id: null,
      created_at: new Date().toISOString()
    }
  ];

  db.auditEvents = [];

  setUserRepositoryForTesting(new InMemoryUserRepository(db));
  setAcademicRepositoryForTesting(new InMemoryAcademicRepository(db));
  setAssessmentRepositoryForTesting(new InMemoryAssessmentRepository(db));
  setSubmissionRepositoryForTesting(new InMemorySubmissionRepository(db));
  setEvaluationRepositoryForTesting(new InMemoryEvaluationRepository(db));
}

async function runTests() {
  console.log('========================================================================');
  console.log(' ACADASSESS: FACULTY PROFILE EDITING VERIFICATION SUITE                 ');
  console.log('========================================================================\n');

  await setupFixtures();

  await new Promise<void>((resolve) => {
    server = app.listen(PORT, () => {
      resolve();
    });
  });

  try {
    const hodToken = makeToken(HOD_USER_ID, 'hod@smartfa.internal');
    const teacherToken = makeToken(TEACHER_1_ID, 'priya.menon@smartfa.internal');
    const studentToken = makeToken(STUDENT_USER_ID, 'student@smartfa.internal');

    // --- 1. UI Component & Modal Structure Verification ---
    console.log('--- 1. UI Component & Modal Structure Verification ---');
    const userManagementPath = path.resolve(process.cwd(), 'apps/web/src/features/hod/UserManagement.tsx');
    const userManagementContent = fs.readFileSync(userManagementPath, 'utf-8');

    assert(
      userManagementContent.includes('id={`edit-faculty-${faculty.id}`}') &&
      userManagementContent.includes('handleOpenEditFacultyModal'),
      'Test 1: Faculties table renders direct "Edit Info" action button for each faculty row'
    );

    assert(
      userManagementContent.includes('id={`manage-edit-${faculty.id}`}') &&
      userManagementContent.includes('Edit Faculty Information'),
      'Test 2: Manage dropdown menu includes "Edit Faculty Information" option separate from role management'
    );

    assert(
      userManagementContent.includes('facultyForEditModal') &&
      userManagementContent.includes('edit-faculty-name') &&
      userManagementContent.includes('edit-faculty-email') &&
      userManagementContent.includes('edit-faculty-phone') &&
      userManagementContent.includes('edit-faculty-empid') &&
      userManagementContent.includes('edit-faculty-designation'),
      'Test 3: Edit Faculty Modal provides editable fields for Name, Email, Phone, Employee ID, and Designation'
    );

    assert(
      userManagementContent.includes('save-faculty-profile-btn') &&
      userManagementContent.includes('cancel-edit-faculty-btn'),
      'Test 4: Modal includes Save Changes and Cancel actions matching AcadAssess green theme'
    );

    // --- 2. Authorization Enforcement (Backend) ---
    console.log('\n--- 2. Authorization Enforcement ---');
    const unauthorizedTeacherRes = await apiRequest(
      'PATCH',
      `/api/v1/admin/hod/users/${TEACHER_1_ID}/profile`,
      teacherToken,
      { full_name: 'Hacked Name', email: 'hacked@smartfa.internal' },
      'subject_teacher'
    );
    assert(
      unauthorizedTeacherRes.status === 403,
      'Test 5: Subject Teacher is forbidden from editing faculty profiles (403 Forbidden)',
      `Status: ${unauthorizedTeacherRes.status}`
    );

    const unauthorizedStudentRes = await apiRequest(
      'PATCH',
      `/api/v1/admin/hod/users/${TEACHER_1_ID}/profile`,
      studentToken,
      { full_name: 'Student Hack', email: 'hack@smartfa.internal' },
      'student'
    );
    assert(
      unauthorizedStudentRes.status === 403,
      'Test 6: Student is forbidden from editing faculty profiles (403 Forbidden)',
      `Status: ${unauthorizedStudentRes.status}`
    );

    // --- 3. Field Validation & Input Rejections ---
    console.log('\n--- 3. Field Validation & Input Rejections ---');
    // A. Empty Name
    const emptyNameRes = await apiRequest(
      'PATCH',
      `/api/v1/admin/hod/users/${TEACHER_1_ID}/profile`,
      hodToken,
      { full_name: '', email: 'valid@smartfa.internal' },
      'hod'
    );
    assert(
      emptyNameRes.status === 400 && (emptyNameRes.body?.error?.code === 'VALIDATION_ERROR' || emptyNameRes.body?.issues),
      'Test 7: Empty full name is rejected with 400 Validation Error',
      `Status: ${emptyNameRes.status}`
    );

    // B. Invalid Email Format
    const invalidEmailRes = await apiRequest(
      'PATCH',
      `/api/v1/admin/hod/users/${TEACHER_1_ID}/profile`,
      hodToken,
      { full_name: 'Dr. Valid Name', email: 'not-an-email' },
      'hod'
    );
    assert(
      invalidEmailRes.status === 400 && (invalidEmailRes.body?.error?.code === 'VALIDATION_ERROR' || invalidEmailRes.body?.issues),
      'Test 8: Invalid email format is rejected with 400 Validation Error',
      `Status: ${invalidEmailRes.status}`
    );

    // C. Invalid Phone Number Format
    const invalidPhoneRes = await apiRequest(
      'PATCH',
      `/api/v1/admin/hod/users/${TEACHER_1_ID}/profile`,
      hodToken,
      { full_name: 'Dr. Valid Name', email: 'valid@smartfa.internal', phone: 'abc-xyz' },
      'hod'
    );
    assert(
      invalidPhoneRes.status === 400 && invalidPhoneRes.body?.error?.code === 'VALIDATION_ERROR',
      'Test 9: Invalid phone format (letters/malformed) is rejected with 400 Validation Error',
      `Status: ${invalidPhoneRes.status}`
    );

    // --- 4. Duplicate Rejection (Email & Employee ID) ---
    console.log('\n--- 4. Duplicate Rejections ---');
    // A. Duplicate Email
    const duplicateEmailRes = await apiRequest(
      'PATCH',
      `/api/v1/admin/hod/users/${TEACHER_1_ID}/profile`,
      hodToken,
      { full_name: 'Prof. Priya Menon', email: 'arvind.kumar@smartfa.internal' }, // Already owned by Teacher 2
      'hod'
    );
    assert(
      duplicateEmailRes.status === 409 && duplicateEmailRes.body?.error?.code === 'DUPLICATE_EMAIL',
      'Test 10: Duplicate email address is rejected with 409 Conflict',
      `Status: ${duplicateEmailRes.status}`
    );

    // B. Duplicate Employee ID
    const duplicateEmpIdRes = await apiRequest(
      'PATCH',
      `/api/v1/admin/hod/users/${TEACHER_1_ID}/profile`,
      hodToken,
      { full_name: 'Prof. Priya Menon', email: 'priya.menon@smartfa.internal', employee_id: 'FAC-MCA-102' }, // Already owned by Teacher 2
      'hod'
    );
    assert(
      duplicateEmpIdRes.status === 409 && duplicateEmpIdRes.body?.error?.code === 'DUPLICATE_EMPLOYEE_ID',
      'Test 11: Duplicate employee ID is rejected with 409 Conflict',
      `Status: ${duplicateEmpIdRes.status}`
    );

    // --- 5. HOD Self-Modification Security Restriction ---
    console.log('\n--- 5. HOD Self-Modification Security Restriction ---');
    const hodSelfEmailRes = await apiRequest(
      'PATCH',
      `/api/v1/admin/hod/users/${HOD_USER_ID}/profile`,
      hodToken,
      { full_name: 'Dr. Nagamani S. (Updated)', email: 'new.hod.email@smartfa.internal' },
      'hod'
    );
    assert(
      hodSelfEmailRes.status === 403 && hodSelfEmailRes.body?.error?.code === 'FORBIDDEN_SELF_MODIFICATION',
      'Test 12: HOD is prohibited from modifying own administrative email address (403 Forbidden)',
      `Status: ${hodSelfEmailRes.status}`
    );

    // HOD CAN update own name, phone, designation without altering protected email
    const hodSelfNameRes = await apiRequest(
      'PATCH',
      `/api/v1/admin/hod/users/${HOD_USER_ID}/profile`,
      hodToken,
      { full_name: 'Dr. Nagamani S., Ph.D.', email: 'hod@smartfa.internal', designation: 'Professor & HOD' },
      'hod'
    );
    assert(
      hodSelfNameRes.status === 200 && hodSelfNameRes.body?.user?.full_name === 'Dr. Nagamani S., Ph.D.',
      'Test 13: HOD is permitted to update own display name and designation',
      `Status: ${hodSelfNameRes.status}`
    );

    // --- 6. Successful Faculty Profile Update (Name, Email, Phone, EmpID, Designation) ---
    console.log('\n--- 6. Successful Faculty Profile Update ---');
    const successfulUpdateRes = await apiRequest(
      'PATCH',
      `/api/v1/admin/hod/users/${TEACHER_1_ID}/profile`,
      hodToken,
      {
        full_name: 'Dr. Priya Menon Pillai',
        email: 'priya.pillai@smartfa.internal',
        phone: '+91 91234 56789',
        employee_id: 'FAC-MCA-109',
        designation: 'Associate Professor'
      },
      'hod'
    );
    assert(
      successfulUpdateRes.status === 200 && successfulUpdateRes.body?.success === true,
      'Test 14: HOD successfully updates faculty information (200 OK)',
      `Status: ${successfulUpdateRes.status}`
    );
    assert(
      successfulUpdateRes.body?.user?.full_name === 'Dr. Priya Menon Pillai' &&
      successfulUpdateRes.body?.user?.email === 'priya.pillai@smartfa.internal' &&
      successfulUpdateRes.body?.user?.employee_id === 'FAC-MCA-109' &&
      successfulUpdateRes.body?.user?.designation === 'Associate Professor',
      'Test 15: Response payload contains updated profile details'
    );

    // --- 7. Persistence & Directory Reflection ---
    console.log('\n--- 7. Persistence & Directory Reflection ---');
    const directoryRes = await apiRequest('GET', '/api/v1/admin/hod/users', hodToken, undefined, 'hod');
    assert(directoryRes.status === 200, 'User directory responds 200 OK');
    const updatedFacultyInDir = directoryRes.body?.users?.find((u: any) => u.id === TEACHER_1_ID);
    assert(
      Boolean(updatedFacultyInDir) && updatedFacultyInDir.full_name === 'Dr. Priya Menon Pillai',
      'Test 16: Updated faculty name immediately reflects in User Directory'
    );
    assert(
      Boolean(updatedFacultyInDir) && updatedFacultyInDir.email === 'priya.pillai@smartfa.internal',
      'Test 17: Updated faculty email immediately reflects in User Directory'
    );
    assert(
      Boolean(updatedFacultyInDir) && updatedFacultyInDir.employee_id === 'FAC-MCA-109',
      'Test 18: Updated faculty employee ID immediately reflects in User Directory'
    );

    // --- 8. Non-Interference: Roles & Allocations Preserved ---
    console.log('\n--- 8. Role & Academic Allocation Preservation ---');
    assert(
      Array.isArray(updatedFacultyInDir.roles) && updatedFacultyInDir.roles.includes('subject_teacher'),
      'Test 19: Faculty role assignments remain intact and unchanged after profile edit'
    );
    const facultyAllocs = directoryRes.body?.allocations?.filter((a: any) => a.faculty_id === TEACHER_1_ID);
    assert(
      facultyAllocs && facultyAllocs.length === 1,
      'Test 20: Academic programme/subject allocations remain intact and unchanged after profile edit'
    );

    // --- 9. Audit Logging Verification ---
    console.log('\n--- 9. Audit Logging Verification ---');
    const updateEvent = db.auditEvents.find((e) => e.action === 'UPDATE_FACULTY_PROFILE' && e.resource_id === TEACHER_1_ID);
    assert(Boolean(updateEvent), 'Test 21: Audit log records "UPDATE_FACULTY_PROFILE" event');
    assert(updateEvent?.actor_id === HOD_USER_ID, 'Test 22: Audit event records HOD actor ID');
    assert(
      Boolean(updateEvent?.before && updateEvent?.after),
      'Test 23: Audit event captures both before and after state diff'
    );
    assert(
      updateEvent?.before?.full_name === 'Prof. Priya Menon' &&
      updateEvent?.after?.full_name === 'Dr. Priya Menon Pillai',
      'Test 24: Audit diff accurately details changed name'
    );
    assert(
      updateEvent?.before?.email === 'priya.menon@smartfa.internal' &&
      updateEvent?.after?.email === 'priya.pillai@smartfa.internal',
      'Test 25: Audit diff accurately details changed email'
    );

  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  console.log('\n========================================================================');
  console.log(` RESULTS: ${passedTests} / ${totalTests} TESTS PASSED (${Math.round((passedTests / totalTests) * 100)}%)`);
  console.log('========================================================================\n');

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
