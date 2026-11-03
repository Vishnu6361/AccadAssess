/**
 * ==============================================================================
 * ACADASSESS: SUBJECT CREATION UUID VALIDATION & INTEGRATION TEST
 * ==============================================================================
 * Verifies all 7 user requirements:
 * 1. Add Subject sends and validates strictly valid programme & specialization UUIDs.
 * 2. A subject can be created under CYBER for semester 3.
 * 3. A subject can be created under AIDS for semester 3.
 * 4. A specialization cannot be paired with an unrelated programme.
 * 5. Invalid UUIDs are rejected with a useful error.
 * 6. The created subject appears in the specialization after refreshing.
 * 7. Existing programme and specialization records remain unchanged.
 */

process.env.SMARTFA_TEST_MODE = 'true';
import jwt from 'jsonwebtoken';
import http from 'http';
import { randomUUID } from 'crypto';
import app from '../../apps/api/src/index.js';
import { getAcademicRepository } from '../../apps/api/src/storage/academicRepository.js';
import { db } from '../../apps/api/src/storage/db.js';

console.log('================================================================');
console.log(' ACADASSESS: SUBJECT CREATION UUID VALIDATION VERIFICATION ');
console.log('================================================================\n');

const DEV_JWT_SECRET = process.env.JWT_DEV_SECRET || 'smartfa-test-hmac-dev-secret-key-32chars';
const PORT = 4009;

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

function createTestToken(userId: string, email: string = 'hod@smartfa.edu', expiresIn: string = '1h'): string {
  return jwt.sign({ sub: userId, email }, DEV_JWT_SECRET, { expiresIn });
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
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
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

    req.on('error', reject);
    if (payload) {
      req.write(payload);
    }
    req.end();
  });
}

const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function runTests() {
  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(PORT, resolve));
  console.log(`Test API Server running on port ${PORT}\n`);

  try {
    const academicRepo = getAcademicRepository();

    // Snapshot existing programme and specialization records before tests
    const initialProgrammes = await academicRepo.listProgrammes();
    const initialSpecializations = await academicRepo.listSpecializations();

    const mcaProg = initialProgrammes.find(p => p.code === 'MCA');
    const cyberSpec = initialSpecializations.find(s => s.code === 'CYBER');
    const aidsSpec = initialSpecializations.find(s => s.code === 'AIDS');

    console.log('--- Initial Academic State Validation ---');
    assert(Boolean(mcaProg), 'MCA programme exists in repository');
    assert(Boolean(cyberSpec), 'CYBER specialization exists in repository');
    assert(Boolean(aidsSpec), 'AIDS specialization exists in repository');

    // 1. Verify IDs are strictly valid RFC 4122 UUIDs
    console.log('\n--- Test Requirement 1: Valid UUID Format ---');
    assert(UUID_V4_REGEX.test(mcaProg!.id), `MCA Programme ID is a valid RFC 4122 UUID: ${mcaProg!.id}`);
    assert(UUID_V4_REGEX.test(cyberSpec!.id), `CYBER Specialization ID is a valid RFC 4122 UUID: ${cyberSpec!.id}`);
    assert(UUID_V4_REGEX.test(aidsSpec!.id), `AIDS Specialization ID is a valid RFC 4122 UUID: ${aidsSpec!.id}`);
    assert(cyberSpec!.programme_id === mcaProg!.id, 'CYBER specialization is associated with MCA programme UUID');
    assert(aidsSpec!.programme_id === mcaProg!.id, 'AIDS specialization is associated with MCA programme UUID');

    const hodToken = createTestToken('a1000000-0000-0000-0000-000000000001', 'hod@smartfa.edu');

    // 2. Create subject under CYBER for Semester 3
    console.log('\n--- Test Requirement 2: Subject Creation under CYBER (Sem 3) ---');
    const cyberSubjectCode = `CYB${Date.now().toString().slice(-4)}`;
    const cyberRes = await makeRequest(
      'POST',
      '/api/v1/admin/hod/subjects',
      hodToken,
      {
        code: cyberSubjectCode,
        name: 'Advanced Threat Intelligence & Forensics',
        credits: 4,
        programme_id: mcaProg!.id,
        specialization_id: cyberSpec!.id,
        semester: 3
      }
    );

    assert(cyberRes.status === 201, `Subject creation under CYBER returned 201 (got ${cyberRes.status})`);
    assert(cyberRes.body.subject?.code === cyberSubjectCode, `Created subject has code ${cyberSubjectCode}`);
    assert(cyberRes.body.subject?.specialization_id === cyberSpec!.id, `Subject specialization_id matches CYBER UUID`);
    assert(cyberRes.body.subject?.semester === 3, 'Subject is assigned to semester 3');
    assert(UUID_V4_REGEX.test(cyberRes.body.subject?.id), `Created subject has valid UUID: ${cyberRes.body.subject?.id}`);

    // 3. Create subject under AIDS for Semester 3
    console.log('\n--- Test Requirement 3: Subject Creation under AIDS (Sem 3) ---');
    const aidsSubjectCode = `AID${Date.now().toString().slice(-4)}`;
    const aidsRes = await makeRequest(
      'POST',
      '/api/v1/admin/hod/subjects',
      hodToken,
      {
        code: aidsSubjectCode,
        name: 'Deep Learning & Neural Networks',
        credits: 4,
        programme_id: mcaProg!.id,
        specialization_id: aidsSpec!.id,
        semester: 3
      }
    );

    assert(aidsRes.status === 201, `Subject creation under AIDS returned 201 (got ${aidsRes.status})`);
    assert(aidsRes.body.subject?.code === aidsSubjectCode, `Created subject has code ${aidsSubjectCode}`);
    assert(aidsRes.body.subject?.specialization_id === aidsSpec!.id, `Subject specialization_id matches AIDS UUID`);
    assert(aidsRes.body.subject?.semester === 3, 'Subject is assigned to semester 3');

    // 4. Specialization cannot be paired with an unrelated programme
    console.log('\n--- Test Requirement 4: Rejection of Mismatched Programme & Specialization ---');
    // Create an unrelated dummy programme
    const unrelatedProg = await academicRepo.createProgramme({
      id: randomUUID(),
      code: 'MBA_TEST',
      name: 'Master of Business Administration (Test)',
      duration_years: 2,
      total_semesters: 4,
      status: 'active',
      active: true
    });

    const mismatchRes = await makeRequest(
      'POST',
      '/api/v1/admin/hod/subjects',
      hodToken,
      {
        code: `MIS${Date.now().toString().slice(-4)}`,
        name: 'Mismatched Subject Test',
        credits: 3,
        programme_id: unrelatedProg.id, // MBA
        specialization_id: cyberSpec!.id, // CYBER (belongs to MCA)
        semester: 3
      }
    );

    assert(mismatchRes.status === 400, `Mismatched programme/specialization returned HTTP 400 (got ${mismatchRes.status})`);
    assert(
      mismatchRes.body.error?.code === 'INVALID_SPECIALIZATION',
      `Error code is INVALID_SPECIALIZATION (got ${mismatchRes.body.error?.code})`
    );
    assert(
      mismatchRes.body.error?.message.includes('Specialization does not belong to the selected programme'),
      `Error message is descriptive: "${mismatchRes.body.error?.message}"`
    );

    // 5. Invalid UUIDs are rejected with a useful error
    console.log('\n--- Test Requirement 5: Non-UUID strings Rejected with Useful Error ---');
    // 5a. Display code "MCA" in programme_id
    const codeAsUuidRes = await makeRequest(
      'POST',
      '/api/v1/admin/hod/subjects',
      hodToken,
      {
        code: 'INV001',
        name: 'Display Code Test',
        credits: 3,
        programme_id: 'MCA', // invalid UUID
        specialization_id: cyberSpec!.id,
        semester: 3
      }
    );

    assert(codeAsUuidRes.status === 400, `Display code string returned HTTP 400 (got ${codeAsUuidRes.status})`);
    assert(
      codeAsUuidRes.body.error?.code === 'VALIDATION_ERROR',
      `Error code is VALIDATION_ERROR (got ${codeAsUuidRes.body.error?.code})`
    );
    assert(
      codeAsUuidRes.body.error?.message.includes('programme_id') && codeAsUuidRes.body.error?.message.includes('Invalid uuid'),
      `Validation error clearly points to programme_id: "${codeAsUuidRes.body.error?.message}"`
    );

    // 5b. Synthetic 'p1000000...' prefix non-hex ID
    const syntheticIdRes = await makeRequest(
      'POST',
      '/api/v1/admin/hod/subjects',
      hodToken,
      {
        code: 'INV002',
        name: 'Synthetic Prefix Test',
        credits: 3,
        programme_id: 'p1000000-0000-0000-0000-000000000001',
        specialization_id: 'sp100000-0000-0000-0000-000000000001',
        semester: 3
      }
    );

    assert(syntheticIdRes.status === 400, `Non-hex synthetic ID returned HTTP 400 (got ${syntheticIdRes.status})`);
    assert(
      syntheticIdRes.body.error?.message.includes('Invalid uuid'),
      `Synthetic non-hex string rejected as invalid uuid: "${syntheticIdRes.body.error?.message}"`
    );

    // 5c. Semester out of specialization's applicable range
    const invalidSemRes = await makeRequest(
      'POST',
      '/api/v1/admin/hod/subjects',
      hodToken,
      {
        code: 'INV003',
        name: 'Inapplicable Semester Test',
        credits: 3,
        programme_id: mcaProg!.id,
        specialization_id: cyberSpec!.id,
        semester: 1 // CYBER only applicable to semesters [3, 4]
      }
    );

    assert(invalidSemRes.status === 400, `Semester out of specialization range returned HTTP 400 (got ${invalidSemRes.status})`);
    assert(
      invalidSemRes.body.error?.code === 'INVALID_SEMESTER_FOR_SPECIALIZATION',
      `Error code is INVALID_SEMESTER_FOR_SPECIALIZATION: ${invalidSemRes.body.error?.code}`
    );

    // 6. Created subjects appear in specialization after refreshing
    console.log('\n--- Test Requirement 6: Created Subject Appears in Specialization Refresh ---');
    // Refresh 1: via GET /admin/hod/subjects?specialization_id=...
    const refreshSubjectsRes = await makeRequest(
      'GET',
      `/api/v1/admin/hod/subjects?specialization_id=${cyberSpec!.id}`,
      hodToken
    );

    assert(refreshSubjectsRes.status === 200, `List subjects by specialization returned 200`);
    const foundCyberSub = refreshSubjectsRes.body.subjects?.find((s: any) => s.code === cyberSubjectCode);
    assert(Boolean(foundCyberSub), `Created CYBER subject ${cyberSubjectCode} found in specialization subjects list`);
    assert(foundCyberSub?.semester === 3, `Found subject has correct semester 3`);

    // Refresh 2: via GET /admin/hod/specializations/:id/subjects
    const refreshSpecSubRes = await makeRequest(
      'GET',
      `/api/v1/admin/hod/specializations/${aidsSpec!.id}/subjects`,
      hodToken
    );

    assert(refreshSpecSubRes.status === 200, `Get specialization subjects returned 200`);
    const foundAidsSub = refreshSpecSubRes.body.subjects?.find((s: any) => s.code === aidsSubjectCode);
    assert(Boolean(foundAidsSub), `Created AIDS subject ${aidsSubjectCode} found in specialization subjects endpoint`);

    // 7. Existing programme and specialization records remain unchanged
    console.log('\n--- Test Requirement 7: Existing Records Integrity Preservation ---');
    const finalProgrammes = await academicRepo.listProgrammes();
    const finalSpecializations = await academicRepo.listSpecializations();

    const mcaFinal = finalProgrammes.find(p => p.id === mcaProg!.id);
    const cyberFinal = finalSpecializations.find(s => s.id === cyberSpec!.id);
    const aidsFinal = finalSpecializations.find(s => s.id === aidsSpec!.id);

    assert(Boolean(mcaFinal), 'MCA programme record still exists with original UUID');
    assert(mcaFinal?.code === 'MCA', 'MCA programme code is intact');
    assert(mcaFinal?.name === mcaProg!.name, 'MCA programme name is intact');
    assert(mcaFinal?.total_semesters === mcaProg!.total_semesters, 'MCA total semesters is intact');

    assert(Boolean(cyberFinal), 'CYBER specialization record still exists with original UUID');
    assert(cyberFinal?.code === 'CYBER', 'CYBER code is intact');
    assert(cyberFinal?.programme_id === mcaProg!.id, 'CYBER parent programme link is intact');

    assert(Boolean(aidsFinal), 'AIDS specialization record still exists with original UUID');
    assert(aidsFinal?.code === 'AIDS', 'AIDS code is intact');
    assert(aidsFinal?.programme_id === mcaProg!.id, 'AIDS parent programme link is intact');

    console.log('\n================================================================');
    console.log(` ALL ${passedTests}/${totalTests} TESTS PASSED SUCCESSFULLY! `);
    console.log('================================================================\n');
  } finally {
    server.close();
  }
}

runTests().catch((err) => {
  console.error('\nTest Suite Failed:', err);
  if (server) server.close();
  process.exit(1);
});
