import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Load root environment
const rootEnvPath = path.resolve(process.cwd(), '.env');
const stagingEnvPath = path.resolve(process.cwd(), '.env.staging');

const rootEnv = dotenv.parse(fs.readFileSync(rootEnvPath, 'utf8'));
const stagingEnv = fs.existsSync(stagingEnvPath) ? dotenv.parse(fs.readFileSync(stagingEnvPath, 'utf8')) : {};

const API_BASE_URL = 'http://localhost:4000/api/v1';

const sanitizeUrl = (urlStr?: string): string => {
  if (!urlStr) return '[NOT CONFIGURED]';
  try {
    const u = new URL(urlStr);
    return `${u.protocol}//${u.hostname}`;
  } catch {
    return '[INVALID URL]';
  }
};

const getProjectRef = (urlStr?: string): string => {
  if (!urlStr) return 'unknown';
  try {
    const u = new URL(urlStr);
    return u.hostname.split('.')[0] || 'unknown';
  } catch {
    return 'unknown';
  }
};

async function runVerification() {
  console.log('================================================================');
  console.log(' ACADASSESS AUTHENTICATION & TOKEN DIAGNOSTICS VERIFICATION     ');
  console.log('================================================================\n');

  let passedTests = 0;
  let totalTests = 0;

  const assert = (condition: boolean, testName: string, detail?: string) => {
    totalTests++;
    if (condition) {
      passedTests++;
      console.log(`[PASS] ${testName}`);
      if (detail) console.log(`       ${detail}`);
    } else {
      console.error(`[FAIL] ${testName}`);
      if (detail) console.error(`       Detail: ${detail}`);
    }
  };

  // Test 1: Project reference alignment check
  const rootSupabaseUrl = rootEnv.SUPABASE_URL || rootEnv.VITE_SUPABASE_URL;
  const rootProjectRef = getProjectRef(rootSupabaseUrl);
  const stagingSupabaseUrl = stagingEnv.SUPABASE_URL || stagingEnv.VITE_SUPABASE_URL;
  const stagingProjectRef = getProjectRef(stagingSupabaseUrl);

  console.log(`Configured Default Project: ${sanitizeUrl(rootSupabaseUrl)} (ref: ${rootProjectRef})`);
  console.log(`Configured Staging Project: ${sanitizeUrl(stagingSupabaseUrl)} (ref: ${stagingProjectRef})\n`);

  assert(
    rootProjectRef === 'rdfloxppwlbocxplbixu',
    'Root .env targets Production Supabase instance',
    `Resolved ref: ${rootProjectRef}`
  );

  assert(
    stagingProjectRef === 'gemuhhrsciilclbtzkcx',
    'Staging .env.staging targets Staging Supabase instance',
    `Resolved ref: ${stagingProjectRef}`
  );

  // Test 2: Verify API Health and database mode
  try {
    const healthRes = await fetch('http://localhost:4000/health');
    const healthData = await healthRes.json();
    assert(
      healthRes.status === 200 && healthData.status === 'ok',
      'Express API is healthy and reachable on port 4000',
      `Service: ${healthData.service}, DB Mode: ${healthData.database_mode}`
    );
    assert(
      healthData.database_mode === 'supabase_postgresql',
      'Express API is operating in live supabase_postgresql mode',
      `is_persistent: ${healthData.is_persistent}`
    );
  } catch (err: any) {
    assert(false, 'Express API is healthy and reachable on port 4000', err.message);
  }

  // Test 3: Authenticate with Production Supabase
  const anonKey = rootEnv.VITE_SUPABASE_PUBLISHABLE_KEY || rootEnv.VITE_SUPABASE_ANON_KEY || rootEnv.SUPABASE_ANON_KEY;
  const prodSupabase = createClient(rootSupabaseUrl, anonKey);
  const adminClient = createClient(rootSupabaseUrl, rootEnv.SUPABASE_SERVICE_ROLE_KEY);

  // Fetch verified faculty / HOD account
  const { data: usersData, error: userListErr } = await adminClient.auth.admin.listUsers();
  assert(
    !userListErr && Boolean(usersData?.users?.length),
    'Admin access to Production Supabase Auth users directory',
    `Found ${usersData?.users?.length || 0} user records`
  );

  const hodUser = usersData?.users?.find(u => u.email === 'vishnucn944@gmail.com');
  assert(
    Boolean(hodUser),
    'Authorized Faculty / HOD test user exists in Production Supabase Auth',
    `User ID: ${hodUser?.id}`
  );

  // Test 4: Token generation and backend acceptance via /api/v1/auth/me
  // Generate a valid session for the verified user without altering their password
  let userToken = '';
  if (hodUser) {
    // Generate magic link / recovery token or direct session using admin API
    const { data: linkData, error: linkErr } = await adminClient.auth.admin.generateLink({
      type: 'magiclink',
      email: hodUser.email!
    });

    if (linkData?.properties?.action_link) {
      // Extract hashed token or verify OTP to obtain session
      const { data: sessionData, error: sessionErr } = await prodSupabase.auth.verifyOtp({
        token_hash: linkData.properties.hashed_token,
        type: 'magiclink'
      });

      if (sessionData?.session?.access_token) {
        userToken = sessionData.session.access_token;
      }
    }
  }

  if (userToken) {
    assert(true, 'Acquired valid Supabase session access token for Faculty/HOD user');

    // Test 5: Backend /api/v1/auth/me accepts token
    try {
      const meRes = await fetch(`${API_BASE_URL}/auth/me`, {
        headers: {
          'Authorization': `Bearer ${userToken}`,
          'Content-Type': 'application/json'
        }
      });
      const meData = await meRes.json();

      assert(
        meRes.status === 200,
        'Backend /api/v1/auth/me accepts Production Supabase access token',
        `HTTP Status: ${meRes.status}`
      );

      assert(
        meData.user?.email === 'vishnucn944@gmail.com',
        'Backend correctly resolves authenticated user identity',
        `Email: ${meData.user?.email}`
      );

      assert(
        meData.profile?.status === 'active',
        'Backend loads authoritative active profile from database',
        `Profile Name: ${meData.profile?.full_name}, Status: ${meData.profile?.status}`
      );

      assert(
        Array.isArray(meData.roles) && meData.roles.includes('hod'),
        'Backend loads authoritative roles (including HOD) from database',
        `Roles: ${meData.roles?.join(', ')}, isHOD: ${meData.isHOD}`
      );

      // Test 6: Authoritative Portal Access Verification
      // Faculty portal should succeed
      const facultyPortalRes = await fetch(`${API_BASE_URL}/auth/verify-portal`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${userToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ portal: 'faculty' })
      });
      const facultyPortalData = await facultyPortalRes.json();

      assert(
        facultyPortalRes.status === 200 && facultyPortalData.authorized === true,
        'Faculty user is authorized for Faculty Portal',
        `Portal: ${facultyPortalData.portal}, activeRole: ${facultyPortalData.activeRole}`
      );

      // Student portal should be strictly rejected with 403
      const studentPortalRes = await fetch(`${API_BASE_URL}/auth/verify-portal`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${userToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ portal: 'student' })
      });
      const studentPortalData = await studentPortalRes.json();

      assert(
        studentPortalRes.status === 403 && studentPortalData.error?.code === 'PORTAL_ACCESS_DENIED',
        'Faculty user is strictly denied access to Student Portal (RBAC Enforcement)',
        `Code: ${studentPortalData.error?.code}, Recommended: ${studentPortalData.error?.recommendedPortal}`
      );

        // Test 6b: Student user testing
        const studentUser = usersData?.users?.find(u => u.email === 'adm25mca9718@sjbit.edu.in');
        if (studentUser) {
          const { data: sLink } = await adminClient.auth.admin.generateLink({
            type: 'magiclink',
            email: studentUser.email!
          });
          if (sLink?.properties?.action_link) {
            const { data: sSession } = await prodSupabase.auth.verifyOtp({
              token_hash: sLink.properties.hashed_token,
              type: 'magiclink'
            });
            const sToken = sSession?.session?.access_token;
            if (sToken) {
              const sMeRes = await fetch(`${API_BASE_URL}/auth/me`, {
                headers: { 'Authorization': `Bearer ${sToken}`, 'Content-Type': 'application/json' }
              });
              const sMeData = await sMeRes.json();
              assert(
                sMeRes.status === 200 && sMeData.roles?.includes('student'),
                'Student user /api/v1/auth/me returns active student role',
                `Roles: ${sMeData.roles?.join(', ')}`
              );

              // Student portal authorization
              const sPortalRes = await fetch(`${API_BASE_URL}/auth/verify-portal`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${sToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ portal: 'student' })
              });
              assert(sPortalRes.status === 200, 'Student user is authorized for Student Portal');

              // Faculty portal rejection
              const fDeniedRes = await fetch(`${API_BASE_URL}/auth/verify-portal`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${sToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ portal: 'faculty' })
              });
              assert(
                fDeniedRes.status === 403,
                'Student user is strictly denied access to Faculty Portal (RBAC Enforcement)'
              );
            }
          }
        }

    } catch (err: any) {
      assert(false, 'Backend /api/v1/auth/me accepts Production Supabase access token', err.message);
    }
  } else {
    assert(false, 'Acquired valid Supabase session access token for Faculty/HOD user');
  }

  // Test 7: Verify project mismatch detection and error code
  // Obtain a token from staging and send to production backend
  const stagingAnonKey = stagingEnv.VITE_SUPABASE_PUBLISHABLE_KEY || stagingEnv.VITE_SUPABASE_ANON_KEY || stagingEnv.SUPABASE_ANON_KEY;
  if (stagingSupabaseUrl && stagingEnv.SUPABASE_SERVICE_ROLE_KEY && stagingAnonKey) {
    try {
      const stagingAdmin = createClient(stagingSupabaseUrl, stagingEnv.SUPABASE_SERVICE_ROLE_KEY);
      const stagingClient = createClient(stagingSupabaseUrl, stagingAnonKey);
      const { data: stUsers } = await stagingAdmin.auth.admin.listUsers();
      const stagingUser = stUsers?.users?.[0];

      if (stagingUser) {
        const { data: stLink } = await stagingAdmin.auth.admin.generateLink({
          type: 'magiclink',
          email: stagingUser.email!
        });

        if (stLink?.properties?.action_link) {
          const { data: stSession } = await stagingClient.auth.verifyOtp({
            token_hash: stLink.properties.hashed_token,
            type: 'magiclink'
          });

          if (stSession?.session?.access_token) {
            // Send staging token to production backend
            const mismatchRes = await fetch(`${API_BASE_URL}/auth/me`, {
              headers: {
                'Authorization': `Bearer ${stSession.session.access_token}`,
                'Content-Type': 'application/json'
              }
            });
            const mismatchData = await mismatchRes.json();

            assert(
              mismatchRes.status === 401 && mismatchData.error?.code === 'TOKEN_PROJECT_MISMATCH',
              'Cross-environment token rejection with TOKEN_PROJECT_MISMATCH code',
              `Code: ${mismatchData.error?.code}, Details: ${mismatchData.error?.details}`
            );
          }
        }
      }
    } catch (err: any) {
      console.warn('Staging cross-check note:', err.message);
    }
  }

  // Test 8: Verify expired / invalid token handling
  const fakeToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.invalid_sig';
  const invalidRes = await fetch(`${API_BASE_URL}/auth/me`, {
    headers: {
      'Authorization': `Bearer ${fakeToken}`,
      'Content-Type': 'application/json'
    }
  });
  const invalidData = await invalidRes.json();

  assert(
    invalidRes.status === 401 && (invalidData.error?.code === 'INVALID_TOKEN' || invalidData.error?.code === 'TOKEN_PROJECT_MISMATCH'),
    'Invalid token is safely rejected with HTTP 401',
    `Code: ${invalidData.error?.code}`
  );

  console.log('\n================================================================');
  console.log(` RESULTS: ${passedTests} / ${totalTests} assertions passed (${Math.round((passedTests / totalTests) * 100)}%)`);
  console.log('================================================================\n');

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runVerification().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
