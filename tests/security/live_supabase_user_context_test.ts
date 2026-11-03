import dotenv from 'dotenv';
import path from 'path';
import http from 'http';
import assert from 'assert';
import { createClient } from '@supabase/supabase-js';

// Load root .env
const rootEnvPath = path.resolve(process.cwd(), '.env');
dotenv.config({ path: rootEnvPath });

// Ensure SMARTFA_TEST_MODE is NOT set so API runs in live Supabase mode
delete process.env.SMARTFA_TEST_MODE;

console.log('================================================================');
console.log(' ACADASSESS: LIVE SUPABASE AUTH & USER CONTEXT VERIFICATION     ');
console.log('================================================================\n');

// 1. Verify required environment variables
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const publishableKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !serviceKey || !publishableKey) {
  console.error('[CRITICAL PREREQUISITE ERROR] Missing required Supabase configuration:');
  if (!supabaseUrl) console.error('  - SUPABASE_URL / VITE_SUPABASE_URL is missing');
  if (!serviceKey) console.error('  - SUPABASE_SERVICE_ROLE_KEY is missing');
  if (!publishableKey) console.error('  - VITE_SUPABASE_PUBLISHABLE_KEY is missing');
  process.exit(1);
}

// Dynamically import API app to ensure environment is parsed first
import app from '../../apps/api/src/index.js';

const PORT = 4005;
let server: http.Server;
let testUserId: string | null = null;
let totalTests = 0;
let passedTests = 0;

function runTest(name: string, fn: () => void | Promise<void>) {
  totalTests++;
  try {
    const res = fn();
    if (res instanceof Promise) {
      return res.then(() => {
        passedTests++;
        console.log(`[PASS] Test ${totalTests}: ${name}`);
      }).catch((err) => {
        console.error(`[FAIL] Test ${totalTests}: ${name} - ${err?.message || err}`);
        throw err;
      });
    } else {
      passedTests++;
      console.log(`[PASS] Test ${totalTests}: ${name}`);
    }
  } catch (err: any) {
    console.error(`[FAIL] Test ${totalTests}: ${name} - ${err?.message || err}`);
    throw err;
  }
}

function makeRequest(
  method: string,
  urlPath: string,
  token?: string,
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

    const req = http.request(
      {
        hostname: 'localhost',
        port: PORT,
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
            resolve({ status: res.statusCode || 500, body: rawData });
          }
        });
      }
    );

    req.on('error', reject);
    req.end();
  });
}

async function run() {
  server = app.listen(PORT);

  // Initialize Supabase clients
  const adminClient = createClient(supabaseUrl!, serviceKey!, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const authClient = createClient(supabaseUrl!, publishableKey!, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  // Generate ephemeral, collision-free test user credentials
  const uniqueId = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const testEmail = `temp_student_${uniqueId}@smartfa.edu`;
  const testPassword = `P@ssw0rd_${uniqueId}_Ephemeral!`;

  try {
    // -------------------------------------------------------------------------
    // Pre-Checks: Unauthenticated and Tampered Tokens
    // -------------------------------------------------------------------------
    await runTest('Missing Authorization header rejected with 401 UNAUTHORIZED', async () => {
      const res = await makeRequest('GET', '/api/v1/auth/me');
      assert.strictEqual(res.status, 401);
      assert.strictEqual(res.body.error?.code, 'UNAUTHORIZED');
    });

    await runTest('Tampered / forged bearer token rejected with 401 INVALID_TOKEN', async () => {
      const forgedToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.fake-tampered-signature-12345';
      const res = await makeRequest('GET', '/api/v1/auth/me', forgedToken);
      assert.strictEqual(res.status, 401);
      assert.strictEqual(res.body.error?.code, 'INVALID_TOKEN');
    });

    // -------------------------------------------------------------------------
    // Step 1: Create Ephemeral User in Supabase Auth
    // -------------------------------------------------------------------------
    console.log('\n--- Creating Temporary Test User in Supabase Auth ---');
    const { data: createData, error: createError } = await adminClient.auth.admin.createUser({
      email: testEmail,
      password: testPassword,
      email_confirm: true,
      user_metadata: { full_name: 'Temporary Test Student' }
    });

    if (createError || !createData.user) {
      throw new Error(`Failed to create test user in Supabase Auth: ${createError?.message}`);
    }

    testUserId = createData.user.id;
    console.log(`[AUTH] Ephemeral user created in auth.users (ID: ${testUserId})`);

    // -------------------------------------------------------------------------
    // Step 2: Provision Profile & Role in Hosted PostgreSQL
    // -------------------------------------------------------------------------
    console.log('--- Provisioning Profile and Least-Privileged Role in PostgreSQL ---');
    const { error: profileInsertErr } = await adminClient
      .from('profiles')
      .insert({
        id: testUserId,
        full_name: 'Temporary Test Student',
        email: testEmail,
        status: 'active'
      });

    if (profileInsertErr) {
      throw new Error(`Failed to insert test profile in public.profiles: ${profileInsertErr.message}`);
    }

    const { error: roleInsertErr } = await adminClient
      .from('user_roles')
      .insert({
        user_id: testUserId,
        role: 'student',
        active: true
      });

    if (roleInsertErr) {
      throw new Error(`Failed to insert test role in public.user_roles: ${roleInsertErr.message}`);
    }

    // -------------------------------------------------------------------------
    // Step 3: Sign In to Acquire Real Supabase JWT
    // -------------------------------------------------------------------------
    const { data: signInData, error: signInError } = await authClient.auth.signInWithPassword({
      email: testEmail,
      password: testPassword
    });

    if (signInError || !signInData.session?.access_token) {
      throw new Error(`Failed to sign in temporary test user: ${signInError?.message}`);
    }

    const realBearerToken = signInData.session.access_token;

    // -------------------------------------------------------------------------
    // Step 4: Verify Valid Identity & Role Resolution
    // -------------------------------------------------------------------------
    await runTest('Valid authenticated student resolves live profile & active roles (200 OK)', async () => {
      const res = await makeRequest('GET', '/api/v1/auth/me', realBearerToken);
      assert.strictEqual(res.status, 200, `Expected 200 but got ${res.status}: ${JSON.stringify(res.body)}`);
      assert.strictEqual(res.body.user?.id, testUserId, 'User ID matches Supabase Auth subject');
      assert.strictEqual(res.body.profile?.status, 'active', 'Profile status matches live record');
      assert.deepStrictEqual(res.body.roles, ['student'], 'Authoritative roles match live user_roles');
      assert.strictEqual(res.body.isHOD, false, 'Student role is not HOD');
    });

    await runTest('Client-supplied role/identity headers ignored on live endpoint', async () => {
      const res = await makeRequest('GET', '/api/v1/auth/me', realBearerToken, {
        'x-user-role': 'hod',
        'x-user-id': '00000000-0000-0000-0000-000000000000'
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.user?.id, testUserId, 'Client x-user-id override strictly ignored');
      assert.deepStrictEqual(res.body.roles, ['student'], 'Client x-user-role override strictly ignored');
      assert.strictEqual(res.body.isHOD, false);
    });

    // -------------------------------------------------------------------------
    // Step 5: Test Inactive Profile Enforcement
    // -------------------------------------------------------------------------
    await runTest('Inactive profile rejected with 403 ACCOUNT_INACTIVE', async () => {
      // Temporarily mark status = 'inactive'
      const { error: updErr } = await adminClient
        .from('profiles')
        .update({ status: 'inactive' })
        .eq('id', testUserId);

      assert(!updErr, `Failed to update status to inactive: ${updErr?.message}`);

      const res = await makeRequest('GET', '/api/v1/auth/me', realBearerToken);
      assert.strictEqual(res.status, 403, `Expected 403 but got ${res.status}`);
      assert.strictEqual(res.body.error?.code, 'ACCOUNT_INACTIVE');

      // Restore status = 'active'
      await adminClient
        .from('profiles')
        .update({ status: 'active' })
        .eq('id', testUserId);
    });

    // -------------------------------------------------------------------------
    // Step 6: Test Missing Profile (Ghost Account) Enforcement
    // -------------------------------------------------------------------------
    await runTest('Missing profile safely rejected with 403 PROFILE_NOT_FOUND', async () => {
      // Temporarily delete profile row
      const { error: delErr } = await adminClient
        .from('profiles')
        .delete()
        .eq('id', testUserId);

      assert(!delErr, `Failed to temporarily delete profile: ${delErr?.message}`);

      const res = await makeRequest('GET', '/api/v1/auth/me', realBearerToken);
      assert.strictEqual(res.status, 403, `Expected 403 but got ${res.status}`);
      assert.strictEqual(res.body.error?.code, 'PROFILE_NOT_FOUND');
    });

  } finally {
    // -------------------------------------------------------------------------
    // Guaranteed Cleanup Path
    // -------------------------------------------------------------------------
    console.log('\n--- Guaranteed Cleanup Path ---');
    if (testUserId) {
      try {
        const { error: cleanupErr } = await adminClient.auth.admin.deleteUser(testUserId);
        if (cleanupErr) {
          console.error(`[CLEANUP WARNING] Failed to delete temporary user from auth.users: ${cleanupErr.message}`);
        } else {
          console.log(`[CLEANUP] Deleted temporary test user from auth.users (ID: ${testUserId})`);
        }

        // Verify no orphan records remain for this test user
        const { data: profileCheck } = await adminClient
          .from('profiles')
          .select('id')
          .eq('id', testUserId);

        const { data: rolesCheck } = await adminClient
          .from('user_roles')
          .select('id')
          .eq('user_id', testUserId);

        const profileClean = !profileCheck || profileCheck.length === 0;
        const rolesClean = !rolesCheck || rolesCheck.length === 0;

        if (profileClean && rolesClean) {
          console.log('[CLEANUP VERIFIED] Zero orphan rows remain in public.profiles and public.user_roles for test user.');
        } else {
          console.error(`[CLEANUP WARNING] Remnants detected: profiles=${profileCheck?.length}, roles=${rolesCheck?.length}`);
        }
      } catch (err: any) {
        console.error(`[CLEANUP EXCEPTION] ${err?.message || err}`);
      }
    }

    server.close();
    console.log('\n----------------------------------------------------------------');
    console.log(`LIVE TEST RESULTS: TOTAL: ${totalTests} | PASSED: ${passedTests} | FAILED: ${totalTests - passedTests}`);
    console.log('----------------------------------------------------------------\n');
    process.exit(totalTests === passedTests ? 0 : 1);
  }
}

run().catch((err) => {
  console.error('[UNCAUGHT TEST RUNNER ERROR]:', err);
  process.exit(1);
});
