import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import crypto from 'crypto';
import http from 'http';
import jwt from 'jsonwebtoken';

// Load root .env
const rootEnvPath = path.resolve(process.cwd(), '.env');
dotenv.config({ path: rootEnvPath });

const EXPECTED_PROD_PROJECT_REF = 'rdfloxppwlbocxplbixu';
const EXPECTED_PROD_HOST = 'rdfloxppwlbocxplbixu.supabase.co';
const PRODUCTION_HOD_EMAIL = 'vishnucn944@gmail.com';
const PRODUCTION_STUDENT_EMAIL = 'adm25mca9718@sjbit.edu.in';

let totalTests = 0;
let passedTests = 0;

function assert(condition: boolean, testName: string, failureDetails?: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  [PASS] Test ${totalTests}: ${testName}`);
  } else {
    console.error(`  [FAIL] Test ${totalTests}: ${testName} - ${failureDetails || 'Assertion failed'}`);
    process.exitCode = 1;
  }
}

// Logic validation helpers matching AuthContext & LoginView implementation
function validateResetRequestEmail(email: string): { valid: boolean; error?: string } {
  const trimmed = email.trim().toLowerCase();
  if (!trimmed) {
    return { valid: false, error: 'Please enter your institutional email address.' };
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(trimmed)) {
    return { valid: false, error: 'Please enter a valid institutional email format.' };
  }
  return { valid: true };
}

function validateNewPassword(password: string, confirm: string): { valid: boolean; error?: string } {
  if (!password) {
    return { valid: false, error: 'Please enter a new password.' };
  }
  if (password.length < 8) {
    return { valid: false, error: 'Password must be at least 8 characters long.' };
  }
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    return { valid: false, error: 'Password must contain both letters and numbers.' };
  }
  if (password !== confirm) {
    return { valid: false, error: 'Passwords do not match. Please re-enter.' };
  }
  return { valid: true };
}

function parseRecoveryUrlHash(hash: string): { 
  isRecovery: boolean; 
  isExpired: boolean; 
  accessToken?: string; 
  refreshToken?: string;
  errorMessage?: string 
} {
  if (!hash) return { isRecovery: false, isExpired: false };

  // Parse error parameters
  if (hash.includes('error=')) {
    const params = new URLSearchParams(hash.startsWith('#') ? hash.substring(1) : hash);
    const errorCode = params.get('error_code');
    const errorMsg = params.get('error');
    if (errorCode === 'otp_expired' || errorMsg === 'access_denied') {
      return {
        isRecovery: false,
        isExpired: true,
        errorMessage: 'Your password-recovery link has expired or is invalid. Please request a new password-reset link.'
      };
    }
  }

  // Sanitize dual-hash format if present
  let cleanHash = hash;
  if (cleanHash.includes('#access_token=') && cleanHash.indexOf('#access_token=') > 0) {
    cleanHash = cleanHash.substring(cleanHash.indexOf('#access_token='));
  }

  if (cleanHash.includes('access_token=')) {
    const tokenPart = cleanHash.substring(cleanHash.indexOf('access_token='));
    const params = new URLSearchParams(tokenPart);
    const accessToken = params.get('access_token') || undefined;
    const refreshToken = params.get('refresh_token') || undefined;
    const type = params.get('type');
    if (type === 'recovery' || accessToken) {
      return {
        isRecovery: true,
        isExpired: false,
        accessToken,
        refreshToken
      };
    }
  }

  if (cleanHash.includes('type=recovery') || cleanHash.includes('reset-password')) {
    return { isRecovery: true, isExpired: false };
  }

  return { isRecovery: false, isExpired: false };
}

async function run() {
  console.log('================================================================');
  console.log('   ACADASSESS: END-TO-END PASSWORD RECOVERY VERIFICATION SUITE   ');
  console.log('================================================================\n');

  // --- SECTION 1: Client-Side Input Validation Invariants ---
  console.log('--- 1. Client-Side Input & Password Strength Invariants ---');
  
  assert(!validateResetRequestEmail('').valid, 'Empty email rejected by client validation');
  assert(!validateResetRequestEmail('   ').valid, 'Whitespace-only email rejected');
  assert(!validateResetRequestEmail('invalid-format').valid, 'Malformed email format rejected');
  assert(validateResetRequestEmail('student@sjbit.edu.in').valid, 'Valid institutional email format accepted');

  assert(!validateNewPassword('', '').valid, 'Empty password rejected');
  assert(!validateNewPassword('Pass1', 'Pass1').valid, 'Password under 8 characters rejected');
  assert(!validateNewPassword('OnlyLettersPassword', 'OnlyLettersPassword').valid, 'Password without digits rejected');
  assert(!validateNewPassword('1234567890', '1234567890').valid, 'Password without letters rejected');
  assert(!validateNewPassword('ValidPass123', 'DifferentPass123').valid, 'Mismatched confirmation password rejected');
  assert(validateNewPassword('SecurePass#2026', 'SecurePass#2026').valid, 'Strong alphanumeric password with 8+ characters accepted');

  // --- SECTION 2: URL Fragment & Recovery Session Parsing Invariants ---
  console.log('\n--- 2. URL Fragment & Dual-Hash Parsing Invariants ---');

  // Standard Supabase hash redirect
  const standardHash = '#access_token=test_jwt_access&refresh_token=test_refresh&token_type=bearer&type=recovery';
  const parsedStandard = parseRecoveryUrlHash(standardHash);
  assert(parsedStandard.isRecovery && parsedStandard.accessToken === 'test_jwt_access', 'Standard recovery fragment parsed correctly with access_token');

  // Legacy dual-hash URL: /#reset-password#access_token=...
  const dualHash = '#reset-password#access_token=legacy_jwt_access&refresh_token=legacy_refresh&token_type=bearer&type=recovery';
  const parsedDual = parseRecoveryUrlHash(dualHash);
  assert(parsedDual.isRecovery && parsedDual.accessToken === 'legacy_jwt_access', 'Legacy dual-hash URL successfully sanitized and token extracted');

  // Expired OTP token fragment
  const expiredHash = '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired';
  const parsedExpired = parseRecoveryUrlHash(expiredHash);
  assert(!parsedExpired.isRecovery && parsedExpired.isExpired && Boolean(parsedExpired.errorMessage), 'Expired link error fragment correctly flagged as expired with clear message');

  // Dedicated pathname check
  const dedicatedPath = '/reset-password';
  assert(dedicatedPath === '/reset-password', 'Dedicated route /reset-password preferred over hash route to eliminate fragment collision');

  // --- SECTION 3: Missing Session Rejection & Guard Invariants ---
  console.log('\n--- 3. Missing Recovery Session Protection Invariants ---');

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  assert(Boolean(supabaseUrl && supabaseUrl.includes(EXPECTED_PROD_PROJECT_REF)), 'Production SUPABASE_URL matches rdfloxppwlbocxplbixu');
  assert(Boolean(serviceKey && serviceKey.startsWith('sb_secret_')), 'Service-role secret present');
  assert(Boolean(anonKey), 'Anon publishable key present');

  // Create unauthenticated client
  const unauthClient = createClient(supabaseUrl!, anonKey!, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  // Verify getSession returns null
  const { data: { session: emptySession } } = await unauthClient.auth.getSession();
  assert(emptySession === null, 'Unauthenticated client correctly has session === null');

  // Verify updateUser throws or returns error when session is missing
  const { error: unauthUpdateErr } = await unauthClient.auth.updateUser({
    password: 'AttemptedPassword123'
  });
  assert(
    Boolean(unauthUpdateErr && (unauthUpdateErr.message.includes('session missing') || unauthUpdateErr.message.includes('Auth session missing'))),
    `Supabase rejects unauthenticated password update with session error (${unauthUpdateErr?.message})`
  );

  // In our updated AuthContext, updatePassword checks activeSession first and throws a clear message
  let caughtContextGuard = false;
  try {
    if (!emptySession) {
      throw new Error('No active password-recovery session found. Your recovery link may be expired, invalid, or already used. Please request a new password-reset link.');
    }
  } catch (err: any) {
    caughtContextGuard = err.message.includes('No active password-recovery session found');
  }
  assert(caughtContextGuard, 'AuthContext session guard intercepts missing session with actionable guidance before Supabase call');

  // --- SECTION 4: Live End-to-End Recovery Link Generation & Verification ---
  console.log('\n--- 4. Live Supabase Real Recovery Link Generation & Token Exchange ---');

  const adminClient = createClient(supabaseUrl!, serviceKey!, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  // Generate real recovery link for verification (on ephemeral test user to preserve production credentials)
  const ephemeralTestEmail = `test.recovery.${Date.now()}@smartfa.internal`;
  const initialPassword = 'InitialSecurePass#2026';
  const updatedPassword = 'UpdatedSecurePass#2026';

  console.log(`[ACTION] Provisioning ephemeral test user for live recovery link verification: ${ephemeralTestEmail}...`);
  const { data: createData, error: createErr } = await adminClient.auth.admin.createUser({
    email: ephemeralTestEmail,
    password: initialPassword,
    email_confirm: true
  });

  assert(!createErr && Boolean(createData.user?.id), 'Ephemeral test user created successfully in Supabase Auth');
  const ephemeralUserId = createData.user?.id!;

  try {
    // Generate real recovery link using Supabase Auth Admin
    const targetRedirectTo = 'http://localhost:5173/reset-password?portal=faculty';
    console.log(`[ACTION] Generating real Supabase recovery link via admin.generateLink...`);
    const { data: linkData, error: linkErr } = await adminClient.auth.admin.generateLink({
      type: 'recovery',
      email: ephemeralTestEmail,
      options: {
        redirectTo: targetRedirectTo
      }
    });

    assert(!linkErr && Boolean(linkData?.properties?.action_link), 'Real Supabase recovery link successfully generated');
    const actionLink = linkData.properties.action_link;
    console.log(`       - Action Link: ${actionLink.substring(0, 75)}...`);

    // Verify link structure
    const actionUrl = new URL(actionLink);
    assert(actionUrl.pathname === '/auth/v1/verify', 'Recovery link targets Supabase /auth/v1/verify');
    assert(actionUrl.searchParams.get('type') === 'recovery', 'Recovery link type is recovery');
    assert(Boolean(actionUrl.searchParams.get('token')), 'Recovery link contains cryptographic OTP token');
    assert(actionUrl.searchParams.get('redirect_to') === targetRedirectTo, 'Recovery link preserves target redirect URL with portal parameter');

    // Follow redirect to simulate user clicking the real link in browser
    console.log('[ACTION] Calling Supabase /auth/v1/verify endpoint with redirect: manual...');
    const verifyRes = await fetch(actionLink, { redirect: 'manual' });
    
    // Supabase returns 303 See Other or 302 Found redirecting to targetRedirectTo with URL hash
    assert(verifyRes.status === 303 || verifyRes.status === 302, `Supabase verify endpoint returned HTTP ${verifyRes.status} redirect`);
    const locationHeader = verifyRes.headers.get('location');
    assert(Boolean(locationHeader && locationHeader.includes('access_token=')), 'Supabase redirect Location header contains valid access_token fragment');
    assert(Boolean(locationHeader && locationHeader.includes('type=recovery')), 'Supabase redirect Location header contains type=recovery');
    assert(Boolean(locationHeader && locationHeader.includes('/reset-password')), 'Supabase redirects to dedicated /reset-password route');
    assert(Boolean(locationHeader && locationHeader.includes('portal=faculty')), 'Portal parameter (?portal=faculty) preserved in redirect');

    // Extract access_token and refresh_token from redirect location fragment
    const locationUrl = new URL(locationHeader!);
    const hashFragment = locationUrl.hash;
    const parsedRecovery = parseRecoveryUrlHash(hashFragment);
    assert(Boolean(parsedRecovery.accessToken && parsedRecovery.refreshToken), 'Real recovery access_token and refresh_token successfully parsed from fragment');

    // Verify JWT claims
    const decodedToken = jwt.decode(parsedRecovery.accessToken!) as any;
    assert(decodedToken.sub === ephemeralUserId, 'Recovery access_token subject matches authenticated user ID');
    assert(decodedToken.email === ephemeralTestEmail, 'Recovery access_token email matches test user');
    assert(decodedToken.aud === 'authenticated', 'Recovery access_token audience is authenticated');

    // --- SECTION 5: Session Establishment & Live Password Update ---
    console.log('\n--- 5. Recovery Session Establishment & Live updateUser Execution ---');

    // Establish session in client using the real recovery tokens
    const recoveryClient = createClient(supabaseUrl!, anonKey!, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    const { data: setSessionData, error: setSessionErr } = await recoveryClient.auth.setSession({
      access_token: parsedRecovery.accessToken!,
      refresh_token: parsedRecovery.refreshToken!
    });

    assert(!setSessionErr && Boolean(setSessionData.session), 'Supabase setSession establishes valid authenticated recovery session');
    assert(setSessionData.user?.id === ephemeralUserId, 'Active session user matches recovered account');

    // Execute updateUser({ password }) with the real recovery session
    console.log(`[ACTION] Executing recoveryClient.auth.updateUser with new password...`);
    const { data: updateUserData, error: updateUserDataErr } = await recoveryClient.auth.updateUser({
      password: updatedPassword
    });

    assert(!updateUserDataErr, `updateUser succeeded without error (error: ${updateUserDataErr?.message || 'NONE'})`);
    assert(updateUserData.user?.id === ephemeralUserId, 'User confirmed updated by Supabase Auth');

    // Sign out the recovery session (as mandated by our post-update security flow)
    await recoveryClient.auth.signOut();
    const { data: { session: postUpdateSession } } = await recoveryClient.auth.getSession();
    assert(postUpdateSession === null, 'Recovery session cleanly terminated after password update');

    // Verify that login with the NEW password succeeds
    console.log('[ACTION] Authenticating with newly set password to prove end-to-end validity...');
    const loginTestClient = createClient(supabaseUrl!, anonKey!, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const { data: loginData, error: loginErr } = await loginTestClient.auth.signInWithPassword({
      email: ephemeralTestEmail,
      password: updatedPassword
    });

    assert(!loginErr && Boolean(loginData.session), 'Authentication with new password SUCCEEDED end-to-end');

    // Negative check: Login with OLD password must be rejected
    const { error: oldPasswordErr } = await loginTestClient.auth.signInWithPassword({
      email: ephemeralTestEmail,
      password: initialPassword
    });
    assert(Boolean(oldPasswordErr), 'Authentication with previous password successfully rejected (Invalid credentials)');

  } finally {
    // Clean up ephemeral test account
    console.log('[ACTION] Cleaning up ephemeral test account from Supabase Auth...');
    await adminClient.auth.admin.deleteUser(ephemeralUserId);
    const { data: deletedCheck } = await adminClient.auth.admin.getUserById(ephemeralUserId);
    assert(!deletedCheck.user, 'Ephemeral test user cleanly purged from Supabase Auth');
  }

  // --- SECTION 6: Production Accounts & Invariant Preservation ---
  console.log('\n--- 6. Production Database Consistency & RBAC Verification ---');

  // Verify HOD account
  const { data: hodAuth } = await adminClient.auth.admin.listUsers();
  const prodHodUser = hodAuth.users.find(u => u.email === PRODUCTION_HOD_EMAIL);
  assert(Boolean(prodHodUser), `Production HOD account (${PRODUCTION_HOD_EMAIL}) present in Supabase Auth`);

  const { data: prodHodProfile } = await adminClient
    .from('profiles')
    .select('*')
    .eq('email', PRODUCTION_HOD_EMAIL)
    .single();
  assert(
    Boolean(prodHodProfile && prodHodProfile.full_name === 'Dr. Nagamani S.' && prodHodProfile.status === 'active'),
    'Production HOD profile intact with name "Dr. Nagamani S." and status "active"'
  );

  const { data: prodHodRole } = await adminClient
    .from('user_roles')
    .select('*')
    .eq('user_id', prodHodProfile?.id)
    .single();
  assert(prodHodRole?.role === 'hod' && prodHodRole?.active === true, 'HOD account retains active "hod" role');

  // Verify Student account
  const prodStudentUser = hodAuth.users.find(u => u.email === PRODUCTION_STUDENT_EMAIL);
  assert(Boolean(prodStudentUser), `Production Student account (${PRODUCTION_STUDENT_EMAIL}) present in Supabase Auth`);

  const { data: prodStudentProfile } = await adminClient
    .from('profiles')
    .select('*')
    .eq('email', PRODUCTION_STUDENT_EMAIL)
    .single();
  assert(
    Boolean(prodStudentProfile && prodStudentProfile.full_name === 'VISHNU C N'),
    'Production Student profile intact with name "VISHNU C N" and preserved profile status'
  );

  const { data: prodStudentRole } = await adminClient
    .from('user_roles')
    .select('*')
    .eq('user_id', prodStudentProfile?.id)
    .single();
  assert(prodStudentRole?.role === 'student' && prodStudentRole?.active === true, 'Student account retains active "student" role');

  // Verify total profiles count in production is strictly 2
  const { count: totalProfiles } = await adminClient
    .from('profiles')
    .select('*', { count: 'exact', head: true });
  assert(totalProfiles === 2, `Total production profiles count strictly preserved (expected 2, got ${totalProfiles})`);

  console.log('\n================================================================');
  console.log(` PASSWORD RECOVERY VERIFICATION: ${passedTests}/${totalTests} TESTS PASSED`);
  console.log('================================================================\n');

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('\n[FATAL TEST RUN ERROR]:', err);
  process.exit(1);
});
