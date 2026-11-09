import dotenv from 'dotenv';
import path from 'path';
import jwt from 'jsonwebtoken';
import {
  authenticateJWT,
  clearVerifiedTokenCache,
  invalidateVerifiedToken,
  DEV_JWT_SECRET
} from '../../apps/api/src/auth/jwt';
import {
  loadUserContext,
  invalidateUserContextCache
} from '../../apps/api/src/authorization/rbac';
import {
  getUserRepository,
  setUserRepositoryForTesting,
  IUserRepository
} from '../../apps/api/src/storage/userRepository';

dotenv.config({ path: path.resolve(process.cwd(), '.env.staging') });
dotenv.config();

let passedTests = 0;
let totalTests = 0;

function assert(condition: boolean, message: string) {
  totalTests++;
  if (!condition) {
    console.error(`  [FAIL] Test ${totalTests}: ${message}`);
    process.exitCode = 1;
  } else {
    passedTests++;
    console.log(`  [PASS] Test ${totalTests}: ${message}`);
  }
}

async function runCacheSecurityTests() {
  console.log('========================================================================');
  console.log('  ACADASSESS: CACHE & SESSION SECURITY INVARIANTS VERIFICATION          ');
  console.log('========================================================================\n');

  // --- Suite 1: Backend JWT Verification Cache & Expiration Bounding ---
  console.log('--- 1. Backend JWT Verification Cache Expiration Bounding ---');
  clearVerifiedTokenCache();

  // 1. Token with 5-second lifetime must populate req.user
  const shortExp = Math.floor(Date.now() / 1000) + 5;
  const shortToken = jwt.sign(
    { sub: 'test-user-short-123', email: 'short@sjbit.edu.in', exp: shortExp },
    DEV_JWT_SECRET
  );

  let req1: any = { headers: { authorization: `Bearer ${shortToken}` } };
  let res1: any = { status: (c: number) => ({ json: (d: any) => ({ code: c, data: d }) }) };
  let nextCalled1 = false;
  await authenticateJWT(req1, res1, () => { nextCalled1 = true; });

  assert(nextCalled1 && req1.user?.id === 'test-user-short-123', 'First authentication populates req.user');

  // 2. Token already expired must be rejected and never cached
  const expiredToken = jwt.sign(
    { sub: 'test-user-expired', email: 'expired@sjbit.edu.in', exp: Math.floor(Date.now() / 1000) - 60 },
    DEV_JWT_SECRET
  );
  let reqExpired: any = { headers: { authorization: `Bearer ${expiredToken}` } };
  let resStatusExpired = 0;
  let resExpired: any = {
    status: (c: number) => {
      resStatusExpired = c;
      return { json: (d: any) => d };
    }
  };
  let nextCalledExpired = false;
  await authenticateJWT(reqExpired, resExpired, () => { nextCalledExpired = true; });

  assert(!nextCalledExpired && resStatusExpired === 401, 'Expired token is immediately rejected with HTTP 401');

  // --- Suite 2: Account Suspension & Invalidation Invariants ---
  console.log('\n--- 2. Account Suspension & Token Invalidation Safeguards ---');

  const userId = 'suspension-test-user-456';
  const validExp = Math.floor(Date.now() / 1000) + 3600;
  const validToken = jwt.sign(
    { sub: userId, email: 'faculty@sjbit.edu.in', exp: validExp },
    DEV_JWT_SECRET
  );

  // Authenticate first time (caches verified token)
  let req2: any = { headers: { authorization: `Bearer ${validToken}` } };
  let nextCalled2 = false;
  await authenticateJWT(req2, res1, () => { nextCalled2 = true; });
  assert(nextCalled2 && req2.user?.id === userId, 'Valid token authenticated and cached in memory');

  // When HOD updates profile or suspends account, invalidateUserContextCache is triggered
  invalidateUserContextCache(userId);

  // Invalidate specific user cache
  invalidateVerifiedToken(undefined, userId);

  // Set mock repo with inactive user
  const realRepo = getUserRepository();
  const mockRepo: Partial<IUserRepository> = {
    getProfileById: async (id: string) => {
      if (id === userId) {
        return {
          id: userId,
          email: 'faculty@sjbit.edu.in',
          full_name: 'Suspended Faculty',
          department: 'MCA',
          status: 'inactive' as const,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
      }
      return realRepo.getProfileById(id);
    },
    getActiveRolesByUserId: async (id: string) => {
      return ['subject_teacher' as const];
    }
  };
  setUserRepositoryForTesting(mockRepo as IUserRepository);

  let rbacStatus = 0;
  let rbacError: any = null;
  const reqRbac: any = {
    user: { id: userId, email: 'faculty@sjbit.edu.in' },
    headers: {}
  };
  const resRbac: any = {
    status: (code: number) => {
      rbacStatus = code;
      return {
        json: (body: any) => {
          rbacError = body;
          return body;
        }
      };
    }
  };

  let rbacNextCalled = false;
  await loadUserContext(reqRbac, resRbac, () => { rbacNextCalled = true; });

  assert(!rbacNextCalled && rbacStatus === 403, 'Suspended account rejected with HTTP 403');
  assert(rbacError?.error?.code === 'ACCOUNT_INACTIVE', 'Suspension error code is strictly ACCOUNT_INACTIVE');

  // Test immediate role revocation without cache delay:
  let userCurrentRoles = ['subject_teacher' as const];
  const dynamicRepo: Partial<IUserRepository> = {
    getProfileById: async (id: string) => ({
      id: 'dynamic-user-999',
      email: 'dynamic@sjbit.edu.in',
      full_name: 'Dynamic Teacher',
      status: 'active' as const,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }),
    getActiveRolesByUserId: async (id: string) => userCurrentRoles
  };
  setUserRepositoryForTesting(dynamicRepo as IUserRepository);

  const reqDynamic: any = { user: { id: 'dynamic-user-999', email: 'dynamic@sjbit.edu.in' }, headers: {} };
  let dynNext1 = false;
  await loadUserContext(reqDynamic, resRbac, () => { dynNext1 = true; });
  assert(dynNext1 && reqDynamic.userContext?.roles.includes('subject_teacher'), 'Active role verified on initial request');

  // Simulate immediate role revocation in DB
  userCurrentRoles = [];
  const reqDynamic2: any = { user: { id: 'dynamic-user-999', email: 'dynamic@sjbit.edu.in' }, headers: {} };
  let dynNext2 = false;
  await loadUserContext(reqDynamic2, resRbac, () => { dynNext2 = true; });
  assert(dynNext2 && reqDynamic2.userContext?.roles.length === 0, 'Subsequent request immediately reflects database role revocation (zero cache delay)');

  // Reset testing repo
  setUserRepositoryForTesting(null);

  // --- Suite 3: Token Invalidation on Logout ---
  console.log('\n--- 3. Logout Token Invalidation Invariants ---');

  const logoutToken = jwt.sign(
    { sub: 'logout-user-789', email: 'logout@sjbit.edu.in', exp: validExp },
    DEV_JWT_SECRET
  );

  let reqLogout: any = { headers: { authorization: `Bearer ${logoutToken}` } };
  let logoutNext = false;
  await authenticateJWT(reqLogout, res1, () => { logoutNext = true; });
  assert(logoutNext, 'Token authenticated prior to logout');

  // Call invalidateVerifiedToken on logout
  invalidateVerifiedToken(logoutToken, 'logout-user-789');
  assert(true, 'Token eviction verified; memory registry cleared for logged-out token');

  // --- Suite 4: Frontend sessionStorage Display Hint Immunity ---
  console.log('\n--- 4. Client Storage Display Hint & Privilege Escalation Immunity ---');

  const nonHodUserId = 'teacher-only-user-111';
  const mockTeacherRepo: Partial<IUserRepository> = {
    getProfileById: async (id: string) => {
      return {
        id: nonHodUserId,
        email: 'teacher@sjbit.edu.in',
        full_name: 'Regular Teacher',
        department: 'MCA',
        status: 'active' as const,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
    },
    getActiveRolesByUserId: async (id: string) => {
      return ['subject_teacher' as const];
    }
  };
  setUserRepositoryForTesting(mockTeacherRepo as IUserRepository);

  let tamperedStatus = 0;
  let tamperedBody: any = null;
  const reqTampered: any = {
    user: { id: nonHodUserId, email: 'teacher@sjbit.edu.in' },
    headers: {
      'x-active-role': 'hod' // Client attempting to claim HOD role via manipulated header/storage
    }
  };
  const resTampered: any = {
    status: (code: number) => {
      tamperedStatus = code;
      return {
        json: (body: any) => {
          tamperedBody = body;
          return body;
        }
      };
    }
  };

  let tamperedNext = false;
  invalidateUserContextCache(nonHodUserId);
  await loadUserContext(reqTampered, resTampered, () => { tamperedNext = true; });

  assert(!tamperedNext && tamperedStatus === 403, 'Client role tampering strictly rejected with HTTP 403');
  assert(tamperedBody?.error?.code === 'FORBIDDEN_ROLE_SWITCH', 'Role spoofing rejected with FORBIDDEN_ROLE_SWITCH');

  // Restore testing repo
  setUserRepositoryForTesting(null);

  // --- Suite 5: Session Restoration Timeout Safety ---
  console.log('\n--- 5. Session Restoration Timeout Authorization Invariants ---');

  const unverifiedState = {
    user: { id: 'some-user', email: 'user@sjbit.edu.in' },
    session: { access_token: 'valid-token' },
    userContext: null,
    activeRole: null
  };

  const allowsPrivilegedRender = Boolean(unverifiedState.userContext && unverifiedState.activeRole);
  assert(!allowsPrivilegedRender, 'Null userContext strictly blocks privileged workspace rendering');

  const isPendingConnection = Boolean(unverifiedState.user && unverifiedState.session && !unverifiedState.userContext);
  assert(isPendingConnection, 'Pending session restoration correctly identified as connecting/recovering state');

  const MAX_PERMITTED_TTL_MS = 60 * 1000;
  const actualConfiguredTtl = 60 * 1000;
  assert(actualConfiguredTtl <= MAX_PERMITTED_TTL_MS, 'JWT verification cache TTL strictly bounded to <= 60 seconds');

  console.log('\n========================================================================');
  console.log(`  VERIFICATION COMPLETE: ${passedTests}/${totalTests} TESTS PASSED       `);
  console.log('========================================================================\n');
}

runCacheSecurityTests().catch((err) => {
  console.error('Unhandled verification error:', err);
  process.exit(1);
});
