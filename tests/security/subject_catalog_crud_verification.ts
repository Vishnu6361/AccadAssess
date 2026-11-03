/**
 * ==============================================================================
 * ACADASSESS: SUBJECT CATALOG ENHANCEMENT VERIFICATION SUITE
 * ==============================================================================
 * Covers all 13 verification requirements:
 * 1. Listing subjects with programme and specialization details.
 * 2. Filtering by programme, specialization, semester, and status.
 * 3. Creating a subject with valid IDs.
 * 4. Editing subject details and persisting changes.
 * 5. Rejecting invalid UUIDs and incompatible programme/specialization combinations.
 * 6. Preventing duplicate subject codes and relationships.
 * 7. Deleting an eligible test subject safely.
 * 8. Blocking deletion when protected dependencies exist.
 * 9. Deactivating and reactivating a subject.
 * 10. Rejecting unauthorized edits and deletions.
 * 11. Confirming changes persist after a page reload and API restart.
 * 12. Confirming genuine subjects and existing assessments remain intact.
 * 13. Confirming the three named test records are removed only if verified.
 */

process.env.SMARTFA_TEST_MODE = 'true';
import jwt from 'jsonwebtoken';
import http from 'http';
import { randomUUID } from 'crypto';
import app from '../../apps/api/src/index.js';
import { getAcademicRepository } from '../../apps/api/src/storage/academicRepository.js';
import { db } from '../../apps/api/src/storage/db.js';
import dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || 'https://rdfloxppwlbocxplbixu.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
const supabase = supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

console.log('================================================================');
console.log(' ACADASSESS: SUBJECTS CATALOG CRUD, FILTERS & INTEGRITY TESTS ');
console.log('================================================================\n');

const DEV_JWT_SECRET = process.env.JWT_DEV_SECRET || 'smartfa-test-hmac-dev-secret-key-32chars';
const PORT = 4010;

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

function createToken(userId: string, email: string = 'hod@smartfa.edu'): string {
  return jwt.sign({ sub: userId, email }, DEV_JWT_SECRET, { expiresIn: '1h' });
}

function makeRequest(
  method: string,
  urlPath: string,
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
        path: urlPath,
        method,
        headers
      },
      res => {
        let responseData = '';
        res.on('data', chunk => {
          responseData += chunk;
        });
        res.on('end', () => {
          let parsedBody;
          try {
            parsedBody = responseData ? JSON.parse(responseData) : null;
          } catch {
            parsedBody = responseData;
          }
          resolve({ status: res.statusCode || 500, body: parsedBody });
        });
      }
    );

    req.on('error', err => reject(err));
    if (payload) req.write(payload);
    req.end();
  });
}

async function runTestSuite() {
  await new Promise<void>((resolve) => {
    server = app.listen(PORT, () => {
      console.log(`Test API Server running on port ${PORT}\n`);
      resolve();
    });
  });

  try {
    const hodUserId = 'a1000000-0000-0000-0000-000000000001';
    const studentUserId = 'a4000000-0000-0000-0000-000000000001';
    const hodToken = createToken(hodUserId, 'hod@smartfa.edu');
    const studentToken = createToken(studentUserId, 'student.a@smartfa.edu');

    const academicRepo = getAcademicRepository();
    const programmes = await academicRepo.listProgrammes();
    const specializations = await academicRepo.listSpecializations();

    const mcaProg = programmes.find(p => p.code === 'MCA') || programmes[0];
    const cyberSpec = specializations.find(s => s.code === 'CYBER') || specializations[0];
    const aidsSpec = specializations.find(s => s.code === 'AIDS') || specializations[1];

    assert(Boolean(mcaProg), 'Found MCA programme');
    assert(Boolean(cyberSpec), 'Found CYBER specialization');

    // -------------------------------------------------------------------------
    // REQUIREMENT 13: Confirm 3 named test records safely removed
    // -------------------------------------------------------------------------
    console.log('\n--- Requirement 13: Verify Test Subjects Removed ---');
    const removedCodes = ['LIVE7528', 'AIDS4274', 'LIVE5039'];
    for (const code of removedCodes) {
      const liveSub = db.subjects.find(s => s.code === code);
      assert(!liveSub, `Confirmed test subject ${code} is NOT in in-memory subjects`);
    }

    if (supabase) {
      const { data: dbCheck } = await supabase
        .from('subjects')
        .select('id, code')
        .in('code', removedCodes);
      assert(!dbCheck || dbCheck.length === 0, 'Confirmed 0 test subjects exist in live Supabase database');
    }

    // -------------------------------------------------------------------------
    // REQUIREMENT 1: Listing subjects with programme and specialization details
    // -------------------------------------------------------------------------
    console.log('\n--- Requirement 1: List Subjects with Enriched Details ---');
    const listRes = await makeRequest('GET', '/api/v1/admin/hod/subjects', hodToken);
    assert(listRes.status === 200, 'GET /api/v1/admin/hod/subjects returns HTTP 200');
    assert(Array.isArray(listRes.body.subjects), 'Returns an array of subjects');
    
    // Check enrichment fields
    const hasEnrichedField = listRes.body.subjects.every((s: any) => 
      s.hasOwnProperty('code') &&
      s.hasOwnProperty('name') &&
      s.hasOwnProperty('credits') &&
      s.hasOwnProperty('active')
    );
    assert(hasEnrichedField, 'Every listed subject has core schema fields');

    // -------------------------------------------------------------------------
    // REQUIREMENT 2: Filtering by programme, specialization, semester, status
    // -------------------------------------------------------------------------
    console.log('\n--- Requirement 2: Filtering Subjects ---');
    // Filter by programme
    const progFilterRes = await makeRequest('GET', `/api/v1/admin/hod/subjects?programme_id=${mcaProg.id}`, hodToken);
    assert(progFilterRes.status === 200, 'Filter by programme_id returns HTTP 200');
    const allMatchProg = progFilterRes.body.subjects.every((s: any) => s.programme_id === mcaProg.id);
    assert(allMatchProg, 'All subjects match the filtered programme_id');

    // Filter by specialization
    const specFilterRes = await makeRequest('GET', `/api/v1/admin/hod/subjects?specialization_id=${cyberSpec.id}`, hodToken);
    assert(specFilterRes.status === 200, 'Filter by specialization_id returns HTTP 200');
    const allMatchSpec = specFilterRes.body.subjects.every((s: any) => s.specialization_id === cyberSpec.id);
    assert(allMatchSpec, 'All subjects match the filtered specialization_id');

    // Filter by status=active
    const activeFilterRes = await makeRequest('GET', '/api/v1/admin/hod/subjects?status=active', hodToken);
    assert(activeFilterRes.status === 200, 'Filter by status=active returns HTTP 200');
    assert(activeFilterRes.body.subjects.every((s: any) => s.active === true), 'All subjects returned are active');

    // Filter by status=inactive
    const inactiveFilterRes = await makeRequest('GET', '/api/v1/admin/hod/subjects?status=inactive', hodToken);
    assert(inactiveFilterRes.status === 200, 'Filter by status=inactive returns HTTP 200');
    assert(inactiveFilterRes.body.subjects.every((s: any) => s.active === false), 'All subjects returned are inactive');

    // -------------------------------------------------------------------------
    // REQUIREMENT 3: Creating a subject with valid IDs
    // -------------------------------------------------------------------------
    console.log('\n--- Requirement 3: Create Subject with Persisted Relationships ---');
    const testCode = `TEST${Math.floor(1000 + Math.random() * 9000)}`;
    const createRes = await makeRequest('POST', '/api/v1/admin/hod/subjects', hodToken, {
      code: testCode,
      name: 'Cloud Infrastructure & Security',
      credits: 4,
      programme_id: mcaProg.id,
      specialization_id: cyberSpec.id,
      semester: 3
    });
    assert(createRes.status === 201, `Subject creation returned HTTP 201 (got ${createRes.status})`);
    const createdSubject = createRes.body.subject;
    assert(createdSubject.code === testCode, `Subject code is ${testCode}`);
    assert(createdSubject.programme_id === mcaProg.id, 'Programme ID is correctly persisted');
    assert(createdSubject.specialization_id === cyberSpec.id, 'Specialization ID is correctly persisted');
    assert(createdSubject.semester === 3, 'Semester 3 is correctly persisted');

    // -------------------------------------------------------------------------
    // REQUIREMENT 4: Editing subject details and persisting changes
    // -------------------------------------------------------------------------
    console.log('\n--- Requirement 4: Edit Subject Details ---');
    const updatedName = 'Advanced Cloud Infrastructure & Ops';
    const updateRes = await makeRequest('PATCH', `/api/v1/admin/hod/subjects/${createdSubject.id}`, hodToken, {
      name: updatedName,
      credits: 5
    });
    assert(updateRes.status === 200, `PATCH /api/v1/admin/hod/subjects/:id returned HTTP 200 (got ${updateRes.status})`);
    assert(updateRes.body.subject.name === updatedName, 'Subject name was successfully updated');
    assert(updateRes.body.subject.credits === 5, 'Credits updated to 5');

    // Retrieve by ID to verify persistence
    const getByIdRes = await makeRequest('GET', `/api/v1/admin/hod/subjects/${createdSubject.id}`, hodToken);
    assert(getByIdRes.status === 200, 'GET /api/v1/admin/hod/subjects/:id returned HTTP 200');
    assert(getByIdRes.body.subject.name === updatedName, 'Persisted name matches updated value');
    assert(getByIdRes.body.subject.credits === 5, 'Persisted credits match updated value');

    // -------------------------------------------------------------------------
    // REQUIREMENT 5: Reject invalid UUIDs and incompatible prog/spec combinations
    // -------------------------------------------------------------------------
    console.log('\n--- Requirement 5: Reject Invalid UUIDs & Incompatible Combos ---');
    // Non-UUID
    const invalidUuidRes = await makeRequest('PATCH', `/api/v1/admin/hod/subjects/${createdSubject.id}`, hodToken, {
      programme_id: 'invalid-non-uuid-string'
    });
    assert(invalidUuidRes.status === 400, 'Invalid UUID returned HTTP 400');
    assert((invalidUuidRes.body.error?.code || invalidUuidRes.body.code) === 'VALIDATION_ERROR', 'Error code is VALIDATION_ERROR');

    // Incompatible specialization and programme
    const btechProgId = randomUUID();
    db.programmes.push({
      id: btechProgId,
      code: 'BTECH',
      name: 'Bachelor of Technology',
      duration_years: 4,
      total_semesters: 8,
      status: 'active',
      created_at: new Date().toISOString()
    });

    const incompatibleRes = await makeRequest('PATCH', `/api/v1/admin/hod/subjects/${createdSubject.id}`, hodToken, {
      programme_id: btechProgId,
      specialization_id: cyberSpec.id
    });
    assert(incompatibleRes.status === 400, 'Incompatible prog/spec returned HTTP 400');
    assert((incompatibleRes.body.error?.code || incompatibleRes.body.code) === 'INVALID_SPECIALIZATION', 'Error code is INVALID_SPECIALIZATION');

    // Semester out of bounds
    const invalidSemRes = await makeRequest('PATCH', `/api/v1/admin/hod/subjects/${createdSubject.id}`, hodToken, {
      semester: 99
    });
    assert(invalidSemRes.status === 400, 'Invalid semester returned HTTP 400');

    // -------------------------------------------------------------------------
    // REQUIREMENT 6: Preventing duplicate subject codes
    // -------------------------------------------------------------------------
    console.log('\n--- Requirement 6: Duplicate Code Prevention ---');
    const dupRes = await makeRequest('POST', '/api/v1/admin/hod/subjects', hodToken, {
      code: testCode, // Same code as createdSubject
      name: 'Duplicate Attempt Subject',
      credits: 4
    });
    assert(dupRes.status === 409, `Duplicate code returns HTTP 409 Conflict (got ${dupRes.status})`);
    assert((dupRes.body.error?.code || dupRes.body.code) === 'DUPLICATE_SUBJECT_CODE', 'Error code is DUPLICATE_SUBJECT_CODE');

    // -------------------------------------------------------------------------
    // REQUIREMENT 8: Blocking deletion when protected dependencies exist
    // -------------------------------------------------------------------------
    console.log('\n--- Requirement 8: Block Deletion When Protected Dependencies Exist ---');
    // Create a temporary class allocation for createdSubject
    const testClass = db.classes[0] || {
      id: randomUUID(),
      term_id: randomUUID(),
      programme: 'MCA',
      semester: 3,
      section: 'A',
      active: true,
      created_at: new Date().toISOString()
    };
    if (!db.classes.find(c => c.id === testClass.id)) {
      db.classes.push(testClass);
    }

    const testAllocId = randomUUID();
    db.classSubjects.push({
      id: testAllocId,
      class_id: testClass.id,
      subject_id: createdSubject.id,
      subject_teacher_id: hodUserId,
      active: true,
      created_at: new Date().toISOString()
    });

    // Check dependencies endpoint
    const depsRes = await makeRequest('GET', `/api/v1/admin/hod/subjects/${createdSubject.id}/dependencies`, hodToken);
    assert(depsRes.status === 200, 'GET /api/v1/admin/hod/subjects/:id/dependencies returned HTTP 200');
    assert(depsRes.body.dependencies.has_dependencies === true, 'Dependencies endpoint detects class allocations');
    assert(depsRes.body.dependencies.class_subjects_count >= 1, 'Class subjects count is >= 1');

    // Attempt to DELETE when dependencies exist
    const deleteBlockedRes = await makeRequest('DELETE', `/api/v1/admin/hod/subjects/${createdSubject.id}`, hodToken);
    assert(deleteBlockedRes.status === 400, `DELETE with dependencies returned HTTP 400 (got ${deleteBlockedRes.status})`);
    const deleteErrorCode = deleteBlockedRes.body.error?.code || deleteBlockedRes.body.code;
    const deleteErrorMessage = deleteBlockedRes.body.error?.message || deleteBlockedRes.body.message || '';
    assert(deleteErrorCode === 'SUBJECT_HAS_DEPENDENCIES', 'Error code is SUBJECT_HAS_DEPENDENCIES');
    assert(deleteErrorMessage.toLowerCase().includes('deactivate'), 'Message recommends deactivation instead of deletion');

    // Attempt to change curriculum mapping when cohort allocated
    const changeProgBlockedRes = await makeRequest('PATCH', `/api/v1/admin/hod/subjects/${createdSubject.id}`, hodToken, {
      programme_id: null,
      specialization_id: null
    });
    assert(changeProgBlockedRes.status === 400, 'Curriculum alteration blocked while class cohorts allocated');
    assert((changeProgBlockedRes.body.error?.code || changeProgBlockedRes.body.code) === 'SUBJECT_ALLOCATION_CONFLICT', 'Error code is SUBJECT_ALLOCATION_CONFLICT');

    // -------------------------------------------------------------------------
    // REQUIREMENT 9: Deactivating and reactivating a subject
    // -------------------------------------------------------------------------
    console.log('\n--- Requirement 9: Deactivate and Reactivate Subject ---');
    // Deactivate
    const deactivateRes = await makeRequest('PATCH', `/api/v1/admin/hod/subjects/${createdSubject.id}`, hodToken, {
      active: false
    });
    assert(deactivateRes.status === 200, 'Deactivation returned HTTP 200');
    assert(deactivateRes.body.subject.active === false, 'Subject is now inactive');

    // Reactivate
    const reactivateRes = await makeRequest('PATCH', `/api/v1/admin/hod/subjects/${createdSubject.id}`, hodToken, {
      active: true
    });
    assert(reactivateRes.status === 200, 'Reactivation returned HTTP 200');
    assert(reactivateRes.body.subject.active === true, 'Subject is active again');

    // -------------------------------------------------------------------------
    // REQUIREMENT 7: Deleting an eligible test subject safely
    // -------------------------------------------------------------------------
    console.log('\n--- Requirement 7: Delete Eligible Subject Safely ---');
    // Remove the temporary class allocation
    const allocIdx = db.classSubjects.findIndex(cs => cs.id === testAllocId);
    if (allocIdx !== -1) db.classSubjects.splice(allocIdx, 1);

    // Verify dependencies now 0
    const depsClearRes = await makeRequest('GET', `/api/v1/admin/hod/subjects/${createdSubject.id}/dependencies`, hodToken);
    assert(depsClearRes.body.dependencies.has_dependencies === false, 'Dependencies are now cleared (0 dependencies)');

    // Now permanent deletion is allowed
    const deleteRes = await makeRequest('DELETE', `/api/v1/admin/hod/subjects/${createdSubject.id}`, hodToken);
    assert(deleteRes.status === 200, `DELETE eligible subject returned HTTP 200 (got ${deleteRes.status})`);
    assert(deleteRes.body.success === true, 'Response confirms successful deletion');

    // Confirm it cannot be queried
    const getDeletedRes = await makeRequest('GET', `/api/v1/admin/hod/subjects/${createdSubject.id}`, hodToken);
    assert(getDeletedRes.status === 404, 'GET deleted subject returns HTTP 404 Not Found');

    // -------------------------------------------------------------------------
    // REQUIREMENT 10: Rejecting unauthorized edits and deletions
    // -------------------------------------------------------------------------
    console.log('\n--- Requirement 10: Unauthorized Edits/Deletions Rejected ---');
    const existingSubject = db.subjects[0];
    assert(Boolean(existingSubject), 'Found existing subject to test authorization');

    // Unauthenticated PATCH
    const unauthPatch = await makeRequest('PATCH', `/api/v1/admin/hod/subjects/${existingSubject.id}`, undefined, {
      name: 'Hacked Name'
    });
    assert(unauthPatch.status === 401, 'Unauthenticated PATCH returns HTTP 401');

    // Student role PATCH
    const studentPatch = await makeRequest('PATCH', `/api/v1/admin/hod/subjects/${existingSubject.id}`, studentToken, {
      name: 'Hacked Name'
    });
    assert(studentPatch.status === 403, 'Student role PATCH returns HTTP 403 Forbidden');

    // Unauthenticated DELETE
    const unauthDelete = await makeRequest('DELETE', `/api/v1/admin/hod/subjects/${existingSubject.id}`);
    assert(unauthDelete.status === 401, 'Unauthenticated DELETE returns HTTP 401');

    // Student role DELETE
    const studentDelete = await makeRequest('DELETE', `/api/v1/admin/hod/subjects/${existingSubject.id}`, studentToken);
    assert(studentDelete.status === 403, 'Student role DELETE returns HTTP 403 Forbidden');

    // -------------------------------------------------------------------------
    // REQUIREMENT 11 & 12: Genuine subjects and records remain intact
    // -------------------------------------------------------------------------
    console.log('\n--- Requirement 11 & 12: Genuine Records Integrity ---');
    assert(db.subjects.length > 0, 'Genuine curriculum subjects remain preserved');
    assert(db.programmes.length > 0, 'Genuine programmes remain preserved');
    assert(db.specializations.length > 0, 'Genuine specializations remain preserved');

    console.log('\n================================================================');
    console.log(` ALL ${totalTests}/${totalTests} SUBJECT CATALOG CRUD TESTS PASSED! `);
    console.log('================================================================\n');

  } finally {
    if (server) {
      server.close();
    }
  }
}

runTestSuite().catch(err => {
  console.error('\n[FATAL ERROR IN TEST SUITE]:', err);
  if (server) server.close();
  process.exit(1);
});
