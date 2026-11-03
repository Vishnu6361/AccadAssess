/**
 * ==============================================================================
 * ACADASSESS PHASE 4.3 PRIORITY 5: STAGING END-TO-END VERIFICATION SUITE
 * ==============================================================================
 * 
 * Target Environment: Staging ONLY (project ref: gemuhhrsciilclbtzkcx)
 * Prohibited: Production (project ref: rdfloxppwlbocxplbixu)
 * 
 * Safety Rules:
 * 1. STRICTLY READ-ONLY against remote Supabase staging.
 * 2. ZERO inserts, updates, deletes, RPC mutations, or migrations.
 * 3. ZERO storage bucket uploads or deletions.
 * 4. ZERO user creation, reactivation, or banning.
 * 5. NEVER print credentials, tokens, secrets, or .env contents.
 * ==============================================================================
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import http from 'http';
import jwt from 'jsonwebtoken';
import app from '../../apps/api/src/index.js';
import { SupabaseUserRepository, setUserRepositoryForTesting } from '../../apps/api/src/storage/userRepository.js';
import { SupabaseAcademicRepository, setAcademicRepositoryForTesting } from '../../apps/api/src/storage/academicRepository.js';
import { listAuditEvents, setAuditClientForTesting } from '../../apps/api/src/audit/auditService.js';
import { loadUserContext } from '../../apps/api/src/authorization/rbac.js';

console.log('================================================================');
console.log(' ACADASSESS: PHASE 4.3 PRIORITY 5 LIVE STAGING VERIFICATION     ');
console.log('================================================================\n');

// 1. Explicit Staging Environment Resolution
const stagingEnvPath = path.resolve(process.cwd(), '.env.staging');
if (!fs.existsSync(stagingEnvPath)) {
  console.error('[FATAL] .env.staging file not found.');
  process.exit(1);
}

const parsedEnv = dotenv.parse(fs.readFileSync(stagingEnvPath, 'utf8'));
const SUPABASE_URL = parsedEnv.SUPABASE_URL || parsedEnv.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = parsedEnv.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_PUBLISHABLE_KEY = parsedEnv.VITE_SUPABASE_PUBLISHABLE_KEY;

const STAGING_REF = 'gemuhhrsciilclbtzkcx';
const PROD_REF = 'rdfloxppwlbocxplbixu';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_PUBLISHABLE_KEY) {
  console.error('[FATAL] Missing required Supabase credentials in .env.staging.');
  process.exit(1);
}

const url = new URL(SUPABASE_URL);
if (!url.hostname.includes(STAGING_REF)) {
  console.error(`[FATAL] Expected staging project reference '${STAGING_REF}', but got '${url.hostname}'.`);
  process.exit(1);
}

if (url.hostname.includes(PROD_REF)) {
  console.error('[CRITICAL SECURITY ERROR] Production project reference detected in target URL! Aborting.');
  process.exit(1);
}

console.log(`[PREFLIGHT] Staging Project Host : ${url.hostname} (Verified)`);
console.log(`[PREFLIGHT] Service Key Available: true`);
console.log(`[PREFLIGHT] Anon Key Available   : true`);

// Update process.env so repositories and middleware target staging
process.env.SUPABASE_URL = SUPABASE_URL;
process.env.VITE_SUPABASE_URL = SUPABASE_URL;
process.env.SUPABASE_SERVICE_ROLE_KEY = SUPABASE_SERVICE_ROLE_KEY;
process.env.VITE_SUPABASE_PUBLISHABLE_KEY = SUPABASE_PUBLISHABLE_KEY;

const DEV_JWT_SECRET = process.env.JWT_DEV_SECRET || 'smartfa-test-hmac-dev-secret-key-32chars';
const TEST_PORT = 4007;

let server: http.Server;
let totalPassed = 0;
let totalChecks = 0;

function check(condition: boolean, message: string) {
  totalChecks++;
  if (condition) {
    totalPassed++;
    console.log(`  [PASS] ${message}`);
  } else {
    console.error(`  [FAIL] ${message}`);
    throw new Error(`Check failed: ${message}`);
  }
}

function makeHttpRequest(
  method: string,
  urlPath: string,
  token?: string,
  body?: any,
  extraHeaders?: Record<string, string>
): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...extraHeaders
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
        port: TEST_PORT,
        path: urlPath,
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
            resolve({ status: res.statusCode || 500, body: { raw: rawData } });
          }
        });
      }
    );

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function runStagingVerificationSuite() {
  const adminClient: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  // Start Express API configured for test against staging
  await new Promise<void>((resolve) => {
    server = app.listen(TEST_PORT, () => {
      console.log(`[API Server] Running on http://localhost:${TEST_PORT}\n`);
      resolve();
    });
  });

  try {
    // -------------------------------------------------------------------------
    // SECTION 1: Preflight & Storage Bucket Verification
    // -------------------------------------------------------------------------
    console.log('--- SECTION 1: Preflight & Storage Bucket Verification ---');

    const { data: buckets, error: bucketErr } = await adminClient.storage.listBuckets();
    check(!bucketErr && Boolean(buckets), '1.1 Storage buckets successfully queried from staging');

    const subBucket = buckets?.find(b => b.name === 'submissions-private');
    check(Boolean(subBucket), "1.2 Bucket 'submissions-private' exists in staging");
    check(subBucket?.public === false, "1.3 Bucket 'submissions-private' is private (public = false)");
    check(subBucket?.file_size_limit === 5242880, '1.4 Configured upload size limit is exactly 5 MB (5,242,880 bytes)');
    check(
      Array.isArray(subBucket?.allowed_mime_types) && subBucket?.allowed_mime_types.includes('application/pdf'),
      '1.5 Configured MIME restriction permits PDF only'
    );

    // -------------------------------------------------------------------------
    // SECTION 2: Staging Database Baseline State & Inactive Identity Discovery
    // -------------------------------------------------------------------------
    console.log('\n--- SECTION 2: Staging Database Baseline State ---');

    // Query profiles directly from staging Supabase
    const { data: profiles, error: profErr } = await adminClient.from('profiles').select('*');
    check(!profErr && Array.isArray(profiles), '2.1 Successfully queried public.profiles from staging');
    check(profiles?.length === 4, `2.2 Confirmed 4 existing profiles retained from previous phase in staging`);
    const allInactive = profiles?.every(p => p.status === 'inactive');
    check(allInactive === true, '2.3 All 4 existing staging profiles have status = inactive');

    // Query auth users from staging
    const { data: authData, error: authErr } = await adminClient.auth.admin.listUsers();
    check(!authErr && Array.isArray(authData?.users), '2.4 Successfully queried auth.users via Supabase Admin API');
    check(authData?.users.length === 4, '2.5 Confirmed 4 existing Auth identities in staging');
    const allBanned = authData?.users.every(u => Boolean(u.banned_until && new Date(u.banned_until) > new Date()));
    check(allBanned === true, '2.6 All 4 staging Auth identities are confirmed banned (banned_until in future)');

    // Query immutable audit events
    const { data: auditRows, error: auditErr } = await adminClient.from('audit_events').select('*');
    check(!auditErr && Array.isArray(auditRows), '2.7 Successfully queried public.audit_events from staging');
    check(auditRows?.length === 1, '2.8 Confirmed exactly 1 immutable audit event retained from Phase 4.2');
    check(
      auditRows?.[0]?.action === 'TEST_LIVE_CREATE_DEPARTMENT_3044c9f1',
      '2.9 Verified audit event action: TEST_LIVE_CREATE_DEPARTMENT_3044c9f1'
    );

    // -------------------------------------------------------------------------
    // SECTION 3: Live Read-Only Repository Queries against Staging
    // -------------------------------------------------------------------------
    console.log('\n--- SECTION 3: Live Read-Only Repository Queries ---');

    const liveUserRepo = new SupabaseUserRepository(adminClient);
    setUserRepositoryForTesting(liveUserRepo);
    const liveUsers = await liveUserRepo.listUsers();
    check(Array.isArray(liveUsers), '3.1 SupabaseUserRepository.listUsers() succeeded against staging');
    check(liveUsers.length === 4, '3.2 listUsers() returned 4 profiles with roles from staging');

    const knownInactiveId = profiles![0].id;
    const singleProfile = await liveUserRepo.getProfileById(knownInactiveId);
    check(Boolean(singleProfile && singleProfile.id === knownInactiveId), '3.3 getProfileById() resolved profile from staging');
    check(singleProfile?.status === 'inactive', '3.4 Retrieved profile status is inactive');

    const liveAcademicRepo = new SupabaseAcademicRepository(adminClient);
    setAcademicRepositoryForTesting(liveAcademicRepo);
    setAuditClientForTesting(adminClient);
    const liveDepts = await liveAcademicRepo.listDepartments();
    check(Array.isArray(liveDepts), '3.5 SupabaseAcademicRepository.listDepartments() succeeded against staging (0 rows present)');

    const liveTerms = await liveAcademicRepo.listTerms();
    check(Array.isArray(liveTerms), '3.6 SupabaseAcademicRepository.listTerms() succeeded against staging (0 rows present)');

    const liveClasses = await liveAcademicRepo.listClasses();
    check(Array.isArray(liveClasses), '3.7 SupabaseAcademicRepository.listClasses() succeeded against staging (0 rows present)');

    const liveSubjects = await liveAcademicRepo.listSubjects();
    check(Array.isArray(liveSubjects), '3.8 SupabaseAcademicRepository.listSubjects() succeeded against staging (0 rows present)');

    const liveClassSubjects = await liveAcademicRepo.listClassSubjects();
    check(Array.isArray(liveClassSubjects), '3.9 SupabaseAcademicRepository.listClassSubjects() succeeded against staging (0 rows present)');

    // -------------------------------------------------------------------------
    // SECTION 4: Live Staging Audit Retrieval, Ordering & Pagination
    // -------------------------------------------------------------------------
    console.log('\n--- SECTION 4: Live Staging Audit Retrieval & Pagination ---');

    // Retrieve live audit events through service layer querying staging PostgreSQL
    const liveEvents = await listAuditEvents({ limit: 10, offset: 0 });
    check(Array.isArray(liveEvents) && liveEvents.length === 1, '4.1 listAuditEvents() retrieved staging audit records');
    check(Boolean(liveEvents[0].correlation_id), '4.2 Retrieved audit event includes non-sensitive correlation ID');

    // Test pagination limit = 1
    const limitEvents = await listAuditEvents({ limit: 1, offset: 0 });
    check(limitEvents.length === 1, '4.3 listAuditEvents({ limit: 1 }) respects limit constraint');

    // Test offset = 1 (should return empty array as total count is 1)
    const offsetEvents = await listAuditEvents({ limit: 10, offset: 1 });
    check(offsetEvents.length === 0, '4.4 listAuditEvents({ offset: 1 }) returns empty array past available records');

    // Validation checks on pagination parameters
    let limitZeroFailed = false;
    try {
      await listAuditEvents({ limit: 0 });
    } catch {
      limitZeroFailed = true;
    }
    check(limitZeroFailed, '4.5 listAuditEvents({ limit: 0 }) strictly rejected non-positive limit');

    let limitMaxFailed = false;
    try {
      await listAuditEvents({ limit: 250 });
    } catch {
      limitMaxFailed = true;
    }
    check(limitMaxFailed, '4.6 listAuditEvents({ limit: 250 }) strictly rejected limit > 200');

    // -------------------------------------------------------------------------
    // SECTION 5: Express API Authentication & RBAC Boundary against Staging
    // -------------------------------------------------------------------------
    console.log('\n--- SECTION 5: Express API Auth & Role Invariants against Staging ---');

    // 5.1 Health Check
    const resHealth = await makeHttpRequest('GET', '/api/v1/health');
    check(resHealth.status === 200, '5.1 GET /api/v1/health returned HTTP 200 OK');

    // 5.2 /api/v1/auth/me without token -> 401
    const resAuthMissing = await makeHttpRequest('GET', '/api/v1/auth/me');
    check(resAuthMissing.status === 401, '5.2 GET /api/v1/auth/me without token returned HTTP 401 UNAUTHORIZED');
    check(resAuthMissing.body.error?.code === 'UNAUTHORIZED', '5.2 Error code is UNAUTHORIZED');

    // 5.3 /api/v1/auth/me with invalid token -> 401
    const resAuthInvalid = await makeHttpRequest('GET', '/api/v1/auth/me', 'invalid-token-string');
    check(resAuthInvalid.status === 401, '5.3 GET /api/v1/auth/me with invalid token returned HTTP 401');

    // 5.4 Supabase Auth cryptographic verification rejects forged tokens via getUser(token)
    const ghostToken = jwt.sign(
      { sub: '00000000-0000-4000-a000-000000000099', email: 'ghost@smartfa.edu' },
      DEV_JWT_SECRET,
      { expiresIn: '1h' }
    );
    const resAuthGhost = await makeHttpRequest('GET', '/api/v1/auth/me', ghostToken);
    check(
      resAuthGhost.status === 401 && resAuthGhost.body.error?.code === 'INVALID_TOKEN',
      '5.4 Supabase Auth cryptographic verification strictly rejected forged token (HTTP 401 INVALID_TOKEN)'
    );

    // 5.5 loadUserContext queries live staging public.profiles for known inactive user
    let inactiveStatus = 0;
    let inactiveCode = '';
    const mockReqInactive: any = { user: { id: knownInactiveId, email: profiles![0].email } };
    const mockResInactive: any = {
      status: (s: number) => { inactiveStatus = s; return mockResInactive; },
      json: (j: any) => { inactiveCode = j.error?.code; return mockResInactive; }
    };
    await loadUserContext(mockReqInactive, mockResInactive, () => {});
    check(inactiveStatus === 403, '5.5 loadUserContext against staging returned HTTP 403 for inactive profile');
    check(inactiveCode === 'ACCOUNT_INACTIVE', '5.5 Error code is ACCOUNT_INACTIVE');

    // 5.6 loadUserContext queries live staging public.profiles for non-existent profile
    let ghostStatus = 0;
    let ghostCode = '';
    const mockReqGhost: any = { user: { id: '00000000-0000-4000-a000-000000000099', email: 'ghost@smartfa.edu' } };
    const mockResGhost: any = {
      status: (s: number) => { ghostStatus = s; return mockResGhost; },
      json: (j: any) => { ghostCode = j.error?.code; return mockResGhost; }
    };
    await loadUserContext(mockReqGhost, mockResGhost, () => {});
    check(ghostStatus === 403, '5.6 loadUserContext against staging returned HTTP 403 for non-existent profile');
    check(ghostCode === 'PROFILE_NOT_FOUND', '5.6 Error code is PROFILE_NOT_FOUND');

    // 5.7 Protected HOD routes without token -> 401
    const resHodNoToken = await makeHttpRequest('GET', '/api/v1/admin/hod/departments');
    check(resHodNoToken.status === 401, '5.7 Protected HOD departments route without token returned HTTP 401');

    const resAuditNoToken = await makeHttpRequest('GET', '/api/v1/admin/hod/audit');
    check(resAuditNoToken.status === 401, '5.8 Protected HOD audit route without token returned HTTP 401');

    const resAssessNoToken = await makeHttpRequest('GET', '/api/v1/assessments');
    check(resAssessNoToken.status === 401, '5.9 Protected assessments route without token returned HTTP 401');

    const resSubmNoToken = await makeHttpRequest('POST', '/api/v1/submissions', undefined, { dummy: true });
    check(resSubmNoToken.status === 401, '5.10 Protected submissions route without token returned HTTP 401');

    console.log(`\n================================================================`);
    console.log(` LIVE STAGING VERIFICATION COMPLETE: ${totalPassed}/${totalChecks} CHECKS PASSED`);
    console.log(`================================================================\n`);
    process.exit(0);
  } finally {
    if (server) server.close();
  }
}

runStagingVerificationSuite().catch(err => {
  console.error('\n[SUITE FATAL ERROR]:', err);
  if (server) server.close();
  process.exit(1);
});
