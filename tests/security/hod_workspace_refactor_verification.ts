/**
 * ==============================================================================
 * ACADASSESS: HOD WORKSPACE SIMPLIFICATION & FACULTY SUBJECT ASSIGNMENT TEST SUITE
 * ==============================================================================
 */

process.env.SMARTFA_TEST_MODE = 'true';
import jwt from 'jsonwebtoken';
import http from 'http';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { randomUUID } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import app from '../../apps/api/src/index.js';
import { 
  getAcademicRepository, 
  InMemoryAcademicRepository,
  SupabaseAcademicRepository
} from '../../apps/api/src/storage/academicRepository.js';
import { 
  getUserRepository, 
  InMemoryUserRepository 
} from '../../apps/api/src/storage/userRepository.js';
import { db } from '../../apps/api/src/storage/db.js';

console.log('================================================================');
console.log(' ACADASSESS: HOD WORKSPACE & FACULTY SUBJECT ASSIGNMENT VERIFICATION ');
console.log('================================================================\n');

const DEV_JWT_SECRET = process.env.JWT_DEV_SECRET || 'smartfa-test-hmac-dev-secret-key-32chars';
const PORT = 4006;

let server: http.Server;
let passedTests = 0;
let totalTests = 0;

function assert(condition: boolean, message: string) {
  totalTests++;
  if (condition) {
    console.log(`  [PASS] Test ${totalTests}: ${message}`);
    passedTests++;
  } else {
    console.error(`  [FAIL] Test ${totalTests}: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
}

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

async function runTests() {
  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(PORT, resolve));

  try {
    // -------------------------------------------------------------------------
    // SECTION 1: Fix Academic Structure Error (PostgREST Disambiguation Verification)
    // -------------------------------------------------------------------------
    console.log('--- 1. Academic Structure Proctor Relationship Disambiguation ---');
    
    // Read academicRepository.ts to verify explicit hints are present in the code
    const repoFilePath = path.resolve(process.cwd(), 'apps/api/src/storage/academicRepository.ts');
    const repoContent = fs.readFileSync(repoFilePath, 'utf8');

    assert(
      repoContent.includes('student:profiles!student_id(full_name, email, usn)'),
      'Explicit foreign key hint !student_id present in listProctorAssignments query'
    );
    assert(
      repoContent.includes('proctor:profiles!proctor_id(full_name, email)'),
      'Explicit foreign key hint !proctor_id present in listProctorAssignments query'
    );

    // If live Supabase credentials exist in .env, test live query against remote schema
    const envPath = path.resolve(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
      const parsedEnv = dotenv.parse(fs.readFileSync(envPath, 'utf8'));
      const sbUrl = parsedEnv.SUPABASE_URL || parsedEnv.VITE_SUPABASE_URL;
      const sbKey = parsedEnv.SUPABASE_SERVICE_ROLE_KEY || parsedEnv.VITE_SUPABASE_PUBLISHABLE_KEY;
      if (sbUrl && sbKey) {
        const liveSbClient = createClient(sbUrl, sbKey, { auth: { persistSession: false } });
        const { data, error } = await liveSbClient
          .from('proctor_assignments')
          .select('*, student:profiles!student_id(full_name, email, usn), proctor:profiles!proctor_id(full_name, email), class:classes(programme, semester, section)')
          .limit(5);

        assert(
          error === null,
          `Live Supabase query executes without ambiguous FK error (error: ${error?.message || 'none'})`
        );
      }
    }

    // -------------------------------------------------------------------------
    // SECTION 2: UI File Verification (Audit and Manage Roles & Subjects Cleanup)
    // -------------------------------------------------------------------------
    console.log('\n--- 2. UI Simplification & Dead Feature Removal ---');

    const sidebarPath = path.resolve(process.cwd(), 'apps/web/src/components/Sidebar.tsx');
    const sidebarContent = fs.readFileSync(sidebarPath, 'utf8');
    assert(
      !sidebarContent.includes("'audit'"),
      'Audit Records navigation item removed from HOD sidebar (Sidebar.tsx)'
    );

    const appPath = path.resolve(process.cwd(), 'apps/web/src/app/App.tsx');
    const appContent = fs.readFileSync(appPath, 'utf8');
    assert(
      !appContent.includes('<AuditViewer />'),
      'AuditViewer component rendering removed from App.tsx'
    );
    assert(
      !appContent.includes("import { AuditViewer }"),
      'AuditViewer unused import removed from App.tsx'
    );

    const userMgmtPath = path.resolve(process.cwd(), 'apps/web/src/features/hod/UserManagement.tsx');
    const userMgmtContent = fs.readFileSync(userMgmtPath, 'utf8');
    assert(
      !userMgmtContent.includes('Manage Roles & Subjects'),
      'Separate "Manage Roles & Subjects" button and modal removed from UserManagement.tsx'
    );
    assert(
      userMgmtContent.includes('activeTab === \'faculties\'') && userMgmtContent.includes('activeTab === \'students\''),
      'Two clear sections (Faculties and Students) implemented via segmented control'
    );
    assert(
      userMgmtContent.includes('Assign Subjects'),
      'Direct "Assign Subjects" action button present in Faculties section'
    );
    assert(
      userMgmtContent.includes('Assign Faculty Subjects'),
      'Dedicated compact modal for subject assignment present'
    );

    // -------------------------------------------------------------------------
    // SECTION 3: Initial User Creation Rules (Student USN vs Faculty USN)
    // -------------------------------------------------------------------------
    console.log('\n--- 3. Initial User Creation Rules ---');

    const hodId = 'a1000000-0000-0000-0000-000000000001';
    const hodToken = createTestToken(hodId, 'hod@smartfa.edu');

    // Student without USN -> rejected
    const studentNoUsnRes = await makeRequest(
      'POST',
      '/api/v1/admin/hod/users/invite',
      hodToken,
      {
        full_name: 'Invalid Student No USN',
        email: `test_stud_nousn_${Date.now()}@acadassess.edu`,
        account_type: 'student',
        role: 'student'
      }
    );
    assert(
      studentNoUsnRes.status === 400,
      'Student account without USN rejected with HTTP 400'
    );

    // Student with USN -> succeeds
    const studentEmail = `student_valid_${Date.now()}@acadassess.edu`;
    const studentRes = await makeRequest(
      'POST',
      '/api/v1/admin/hod/users/invite',
      hodToken,
      {
        full_name: 'Valid Student Test',
        email: studentEmail,
        account_type: 'student',
        role: 'student',
        usn: '1RV24MC099'
      }
    );
    assert(
      studentRes.status === 201 && studentRes.body.user?.usn === '1RV24MC099',
      'Student account provisioned with required authoritative USN'
    );

    // Faculty without USN -> succeeds, USN is null, role is subject_teacher base
    const facultyEmail = `faculty_valid_${Date.now()}@acadassess.edu`;
    const facultyRes = await makeRequest(
      'POST',
      '/api/v1/admin/hod/users/invite',
      hodToken,
      {
        full_name: 'Prof. Ramesh Gupta',
        email: facultyEmail,
        account_type: 'faculty',
        role: 'faculty'
      }
    );
    assert(
      facultyRes.status === 201 && facultyRes.body.user?.usn === null,
      'Faculty account created without USN (USN is strictly null in database)'
    );
    assert(
      facultyRes.body.role?.role === 'subject_teacher',
      'Faculty account granted safe minimum base role ("subject_teacher") for portal access'
    );

    const createdFacultyId = facultyRes.body.user.id;

    // -------------------------------------------------------------------------
    // SECTION 4: Subject Assignment Workflow Inside Faculties Section
    // -------------------------------------------------------------------------
    console.log('\n--- 4. Direct Faculty Subject Assignment Workflow ---');

    // Create a fresh class and subject for testing
    const academicRepo = getAcademicRepository();
    const term = await academicRepo.createTerm({
      id: randomUUID(),
      name: 'Academic Term Verification',
      starts_on: '2026-08-01',
      ends_on: '2026-12-31',
      active: true
    });

    const testClass = await academicRepo.createClass({
      id: randomUUID(),
      department_id: 'd1000000-0000-0000-0000-000000000001',
      term_id: term.id,
      programme: 'MCA',
      semester: 3,
      section: 'A',
      class_teacher_id: null
    });

    const testSubject = await academicRepo.createSubject({
      id: randomUUID(),
      department_id: 'd1000000-0000-0000-0000-000000000001',
      code: `MCA${Math.floor(100 + Math.random() * 800)}`,
      name: 'Advanced Cloud Architecture',
      credits: 4
    });

    // 4.1 Assign subject to faculty member
    const assignRes = await makeRequest(
      'POST',
      '/api/v1/admin/hod/class-subjects',
      hodToken,
      {
        class_id: testClass.id,
        subject_id: testSubject.id,
        subject_teacher_id: createdFacultyId
      }
    );
    assert(
      assignRes.status === 201 && assignRes.body.class_subject?.subject_teacher_id === createdFacultyId,
      'HOD successfully assigns subject to faculty member (HTTP 201)'
    );

    const classSubjectId = assignRes.body.class_subject.id;

    // 4.2 Verify assignment persists and appears when queried
    const listRes = await makeRequest('GET', '/api/v1/admin/hod/class-subjects', hodToken);
    assert(
      listRes.status === 200 && Array.isArray(listRes.body.class_subjects),
      'GET /api/v1/admin/hod/class-subjects returns HTTP 200'
    );
    const foundAssignment = listRes.body.class_subjects.find((cs: any) => cs.id === classSubjectId);
    assert(
      foundAssignment !== undefined && foundAssignment.subject_teacher_id === createdFacultyId,
      'Assignment persists in database and is returned upon reloading/querying'
    );

    // 4.3 Prevent duplicate assignment
    const duplicateRes = await makeRequest(
      'POST',
      '/api/v1/admin/hod/class-subjects',
      hodToken,
      {
        class_id: testClass.id,
        subject_id: testSubject.id,
        subject_teacher_id: createdFacultyId
      }
    );
    assert(
      duplicateRes.status === 409 && duplicateRes.body.error?.code === 'CLASS_SUBJECT_CONFLICT',
      'Duplicate subject assignment rejected with HTTP 409 CLASS_SUBJECT_CONFLICT'
    );

    // 4.4 Remove assignment
    const unassignRes = await makeRequest(
      'DELETE',
      `/api/v1/admin/hod/class-subjects/${classSubjectId}`,
      hodToken
    );
    assert(
      unassignRes.status === 200 && unassignRes.body.success === true,
      'HOD successfully unassigns subject (HTTP 200)'
    );

    // Verify unassignment persists
    const listAfterUnassign = await makeRequest('GET', '/api/v1/admin/hod/class-subjects', hodToken);
    const stillFound = listAfterUnassign.body.class_subjects.find((cs: any) => cs.id === classSubjectId);
    assert(
      stillFound === undefined,
      'Subject unassignment persists; assignment no longer exists'
    );

    // -------------------------------------------------------------------------
    // SECTION 5: Security & Role Authorization Enforcements
    // -------------------------------------------------------------------------
    console.log('\n--- 5. Security & Authorization Safeguards ---');

    const studentToken = createTestToken(studentRes.body.user.id, studentEmail);

    // Student cannot assign subject
    const studentAssignRes = await makeRequest(
      'POST',
      '/api/v1/admin/hod/class-subjects',
      studentToken,
      {
        class_id: testClass.id,
        subject_id: testSubject.id,
        subject_teacher_id: createdFacultyId
      }
    );
    assert(
      studentAssignRes.status === 403,
      'Student forbidden from assigning subjects (HTTP 403)'
    );

    // Unauthenticated user cannot assign subject
    const unauthAssignRes = await makeRequest(
      'POST',
      '/api/v1/admin/hod/class-subjects',
      undefined,
      {
        class_id: testClass.id,
        subject_id: testSubject.id,
        subject_teacher_id: createdFacultyId
      }
    );
    assert(
      unauthAssignRes.status === 401,
      'Unauthenticated request rejected with HTTP 401'
    );

    // Backend audit logging verification
    const auditRes = await makeRequest('GET', '/api/v1/admin/hod/audit', hodToken);
    assert(
      auditRes.status === 200 && Array.isArray(auditRes.body.events),
      'Backend audit service and retrieval remain fully functional'
    );
    const hasAssignAudit = auditRes.body.events.some((e: any) => e.action === 'ASSIGN_CLASS_SUBJECT');
    const hasUnassignAudit = auditRes.body.events.some((e: any) => e.action === 'UNASSIGN_CLASS_SUBJECT');
    assert(
      hasAssignAudit && hasUnassignAudit,
      'Both ASSIGN_CLASS_SUBJECT and UNASSIGN_CLASS_SUBJECT are recorded in authoritative audit trail'
    );

    console.log('\n================================================================');
    console.log(` ALL CHECKS COMPLETE: ${passedTests}/${totalTests} TESTS PASSED`);
    console.log('================================================================\n');

  } finally {
    server.close();
  }
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  if (server) server.close();
  process.exit(1);
});
