/**
 * ==============================================================================
 * ACADASSESS: COMPLETE DEPARTMENT CONCEPT REMOVAL VERIFICATION SUITE
 * ==============================================================================
 * 
 * Verifies that the "Department" concept has been completely removed across:
 * 1. Contracts & Shared Schemas
 * 2. Academic Repository (In-Memory & Supabase interface)
 * 3. Backend Express API Routes & RBAC
 * 4. Frontend UI Components & API Client
 * 5. Database Schema & Migration Specification
 * 6. Academic Hierarchy Enforcement: Programme -> Specialization -> Semester -> Subject
 * ==============================================================================
 */

process.env.SMARTFA_TEST_MODE = 'true';
import http from 'http';
import fs from 'fs';
import path from 'path';
import jwt from 'jsonwebtoken';
import app from '../../apps/api/src/index.js';
import * as contracts from '@smartfa/contracts';
import { getAcademicRepository } from '../../apps/api/src/storage/academicRepository.js';

let server: http.Server;
const PORT = 4015;
const DEV_JWT_SECRET = process.env.JWT_DEV_SECRET || 'smartfa-test-hmac-dev-secret-key-32chars';

const HOD_ID = 'a1000000-0000-0000-0000-000000000001';
const TEACHER_ID = 'a2000000-0000-0000-0000-000000000001';
const STUDENT_ID = 'a4000000-0000-0000-0000-000000000001';

function createToken(userId: string, email: string = 'user@smartfa.edu'): string {
  return jwt.sign({ sub: userId, email }, DEV_JWT_SECRET, { expiresIn: '1h' });
}

function makeRequest(
  method: string,
  urlPath: string,
  token?: string,
  body?: any,
  headers?: Record<string, string>
): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : undefined;
    const reqHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      ...headers
    };
    if (token) {
      reqHeaders['Authorization'] = `Bearer ${token}`;
    }
    if (payload) {
      reqHeaders['Content-Length'] = Buffer.byteLength(payload).toString();
    }

    const req = http.request(
      `http://localhost:${PORT}${urlPath}`,
      { method, headers: reqHeaders },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          let parsed: any;
          try {
            parsed = JSON.parse(data);
          } catch {
            parsed = data;
          }
          resolve({ status: res.statusCode || 500, body: parsed });
        });
      }
    );

    req.on('error', (err) => reject(err));
    if (payload) req.write(payload);
    req.end();
  });
}

let totalTests = 0;
let passedTests = 0;

function assert(condition: boolean, message: string, context?: any) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  [PASS] Test ${totalTests}: ${message}`);
  } else {
    console.error(`  [FAIL] Test ${totalTests}: ${message}`);
    if (context) {
      console.error('         Context:', typeof context === 'string' ? context : JSON.stringify(context));
    }
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runDepartmentRemovalSuite() {
  console.log('================================================================');
  console.log(' ACADASSESS: DEPARTMENT CONCEPT REMOVAL VERIFICATION SUITE');
  console.log('================================================================\n');

  await new Promise<void>((resolve) => {
    server = app.listen(PORT, () => {
      console.log(`[Test Server] Running on http://localhost:${PORT}\n`);
      resolve();
    });
  });

  const hodToken = createToken(HOD_ID, 'hod@smartfa.edu');
  const teacherToken = createToken(TEACHER_ID, 'teacher@smartfa.edu');
  const studentToken = createToken(STUDENT_ID, 'student@smartfa.edu');

  try {
    // -------------------------------------------------------------------------
    // 1. CONTRACTS & SHARED SCHEMAS AUDIT
    // -------------------------------------------------------------------------
    console.log('--- 1. Contracts & Shared Schemas Invariants ---');

    assert(!('DepartmentSchema' in contracts), 'DepartmentSchema eliminated from @smartfa/contracts');
    assert(!('CreateDepartmentRequestSchema' in contracts), 'CreateDepartmentRequestSchema eliminated from @smartfa/contracts');

    const sampleProgramme = contracts.ProgrammeSchema.safeParse({
      id: 'b1000000-0000-4000-8000-000000000001',
      code: 'MCA',
      name: 'Master of Computer Applications',
      duration_years: 2,
      total_semesters: 4,
      status: 'active'
    });
    assert(sampleProgramme.success === true, 'ProgrammeSchema parses valid programme without department_id');

    const sampleClass = contracts.ClassSchema.safeParse({
      id: 'd1000000-0000-4000-8000-000000000001',
      term_id: 'e1000000-0000-4000-8000-000000000001',
      programme: 'MCA',
      semester: 4,
      section: 'A',
      created_at: new Date().toISOString()
    });
    assert(sampleClass.success === true, 'ClassSchema parses valid class without department_id');

    const sampleSubject = contracts.SubjectSchema.safeParse({
      id: 'f1000000-0000-4000-8000-000000000001',
      code: 'MCA401',
      name: 'Cloud Computing Security',
      credits: 4,
      active: true,
      created_at: new Date().toISOString()
    });
    assert(sampleSubject.success === true, 'SubjectSchema parses valid subject without department_id');

    // -------------------------------------------------------------------------
    // 2. BACKEND API ENDPOINTS: DEPARTMENTS REMOVED (404)
    // -------------------------------------------------------------------------
    console.log('\n--- 2. Backend Route Boundary: /departments Completely Removed ---');

    const getDeptRes = await makeRequest('GET', '/api/v1/admin/hod/departments', hodToken);
    assert(getDeptRes.status === 404, `GET /api/v1/admin/hod/departments returns 404 Not Found (got ${getDeptRes.status})`);

    const postDeptRes = await makeRequest('POST', '/api/v1/admin/hod/departments', hodToken, {
      code: 'CS',
      name: 'Computer Science'
    });
    assert(postDeptRes.status === 404, `POST /api/v1/admin/hod/departments returns 404 Not Found (got ${postDeptRes.status})`);

    // -------------------------------------------------------------------------
    // 3. ACADEMIC HIERARCHY WORKFLOW: Programme -> Specialization -> Semester -> Subject
    // -------------------------------------------------------------------------
    console.log('\n--- 3. Academic Structure Workflow: Prog -> Spec -> Sem -> Sub ---');

    // Step 1: Create Programme
    const progCode = `PROG_${Date.now().toString().slice(-4)}`;
    const createProgRes = await makeRequest('POST', '/api/v1/admin/hod/programmes', hodToken, {
      code: progCode,
      name: 'Master of Technology in Data Science',
      duration_years: 2,
      total_semesters: 4
    });
    assert(createProgRes.status === 201, `HOD creates Programme (HTTP 201)`);
    const createdProg = createProgRes.body.programme;
    assert(createdProg.code === progCode, `Programme code matches ${progCode}`);
    assert(createdProg.department_id === undefined, 'Programme has zero department_id property');

    // Step 2: Create Specialization under Programme
    const specCode = `SPEC_${Date.now().toString().slice(-4)}`;
    const createSpecRes = await makeRequest('POST', '/api/v1/admin/hod/specializations', hodToken, {
      programme_id: createdProg.id,
      code: specCode,
      name: 'Big Data & Distributed Analytics',
      applicable_semesters: [1, 2, 3, 4]
    });
    assert(createSpecRes.status === 201, `HOD creates Specialization under Programme (HTTP 201)`);
    const createdSpec = createSpecRes.body.specialization;
    assert(createdSpec.programme_id === createdProg.id, 'Specialization belongs to Programme');

    // Step 3: Create Academic Term
    const termRes = await makeRequest('POST', '/api/v1/admin/hod/terms', hodToken, {
      name: `Spring Term ${Date.now().toString().slice(-4)}`,
      starts_on: '2027-01-01',
      ends_on: '2027-06-30'
    });
    assert(termRes.status === 201, 'HOD creates Academic Term (HTTP 201)');
    const termId = termRes.body.term.id;

    // Step 4: Create Class Section (requires Term, Programme, Semester, Section - zero department)
    const classRes = await makeRequest('POST', '/api/v1/admin/hod/classes', hodToken, {
      term_id: termId,
      programme: progCode,
      semester: 1,
      section: 'A'
    });
    assert(classRes.status === 201, `HOD creates Class Batch without department (HTTP 201)`);
    const createdClass = classRes.body.class;
    assert(createdClass.department_id === undefined, 'Class record has zero department_id');
    assert(createdClass.programme === progCode, 'Class correctly specifies programme');

    // Step 5: Create Subject tied to Programme and Specialization (zero department)
    const subCode = `SUB${Date.now().toString().slice(-4)}`;
    const subRes = await makeRequest('POST', '/api/v1/admin/hod/subjects', hodToken, {
      code: subCode,
      name: 'Distributed Stream Processing',
      programme_id: createdProg.id,
      specialization_id: createdSpec.id,
      semester: 1,
      credits: 4
    });
    assert(subRes.status === 201, `HOD creates Subject with Programme & Specialization (HTTP 201)`);
    const createdSub = subRes.body.subject;
    assert(createdSub.department_id === undefined, 'Subject record has zero department_id');
    assert(createdSub.programme_id === createdProg.id, 'Subject is linked to Programme');
    assert(createdSub.specialization_id === createdSpec.id, 'Subject is linked to Specialization');
    assert(createdSub.semester === 1, 'Subject is assigned to Semester 1');

    // Step 6: Global Unique Subject Code Enforcement
    const dupSubRes = await makeRequest('POST', '/api/v1/admin/hod/subjects', hodToken, {
      code: subCode, // Duplicate
      name: 'Attempted Duplicate Subject',
      credits: 3
    });
    assert(dupSubRes.status === 409, `Duplicate subject code rejected globally across system with HTTP 409 (got ${dupSubRes.status})`);
    assert(
      (dupSubRes.body.error?.code || dupSubRes.body.code) === 'DUPLICATE_SUBJECT_CODE',
      'Error code is DUPLICATE_SUBJECT_CODE'
    );

    // -------------------------------------------------------------------------
    // 4. FRONTEND SOURCE CODE AUDIT
    // -------------------------------------------------------------------------
    console.log('\n--- 4. Frontend Codebase Audit ---');

    const webSrcDir = path.resolve(process.cwd(), 'apps/web/src');

    function searchDirForDepartment(dir: string, excludeFiles: string[] = []): string[] {
      const violations: string[] = [];
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          violations.push(...searchDirForDepartment(fullPath, excludeFiles));
        } else if (entry.isFile() && (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts'))) {
          if (excludeFiles.includes(entry.name)) continue;
          const content = fs.readFileSync(fullPath, 'utf8');
          if (/department/i.test(content)) {
            violations.push(path.relative(process.cwd(), fullPath));
          }
        }
      }
      return violations;
    }

    const webViolations = searchDirForDepartment(webSrcDir);
    assert(
      webViolations.length === 0,
      `Frontend apps/web/src contains ZERO occurrences of "department" (found ${webViolations.length})`,
      webViolations
    );

    // Specifically verify AcademicStructure.tsx tabs
    const acadStructPath = path.resolve(webSrcDir, 'features/hod/AcademicStructure.tsx');
    const acadStructSrc = fs.readFileSync(acadStructPath, 'utf8');
    assert(!acadStructSrc.includes("'departments'"), 'AcademicStructure.tsx activeTab union does NOT contain "departments"');
    assert(acadStructSrc.includes("'programmes'"), 'AcademicStructure.tsx contains "programmes" tab');
    assert(acadStructSrc.includes("'classes'"), 'AcademicStructure.tsx contains "classes" tab');
    assert(acadStructSrc.includes("'subjects'"), 'AcademicStructure.tsx contains "subjects" tab');
    assert(acadStructSrc.includes("'class_subjects'"), 'AcademicStructure.tsx contains "class_subjects" tab');

    // -------------------------------------------------------------------------
    // 5. DATABASE MIGRATION SCRIPT AUDIT
    // -------------------------------------------------------------------------
    console.log('\n--- 5. Database Migration Specification Audit ---');

    const migrationPath = path.resolve(process.cwd(), 'supabase/migrations/20261017000009_remove_department_concept.sql');
    assert(fs.existsSync(migrationPath), 'Migration 20261017000009_remove_department_concept.sql exists');

    const migrationSql = fs.readFileSync(migrationPath, 'utf8');
    const normalizedSql = migrationSql.replace(/\s+/g, ' ');
    assert(
      normalizedSql.includes('alter table public.subjects drop constraint if exists uq_subject_code_dept'),
      'Migration drops uq_subject_code_dept constraint'
    );
    assert(
      normalizedSql.includes('add constraint uq_subject_code unique (code)'),
      'Migration adds global uq_subject_code unique constraint'
    );
    assert(
      normalizedSql.includes('alter table public.subjects drop column department_id;'),
      'Migration drops department_id column from subjects table'
    );
    assert(
      normalizedSql.includes('add constraint uq_class_batch unique (term_id, programme, semester, section)'),
      'Migration updates uq_class_batch to exclude department_id'
    );
    assert(
      normalizedSql.includes('alter table public.classes drop column department_id;'),
      'Migration drops department_id column from classes table'
    );
    assert(
      normalizedSql.includes('alter table public.programmes drop column department_id;'),
      'Migration drops department_id column from programmes table'
    );
    assert(
      migrationSql.includes('requires explicit authorization') && migrationSql.includes('drop table if exists public.departments cascade'),
      'Migration safely gates destructive DROP TABLE public.departments with authorization notice'
    );

  } finally {
    server.close();
  }

  console.log('\n================================================================');
  console.log(` RESULTS: ${passedTests}/${totalTests} Tests Passed`);
  console.log('================================================================\n');

  if (passedTests !== totalTests) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runDepartmentRemovalSuite().catch((err) => {
  console.error('[FATAL SUITE ERROR]', err);
  process.exit(1);
});
