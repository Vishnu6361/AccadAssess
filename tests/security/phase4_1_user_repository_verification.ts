process.env.SMARTFA_TEST_MODE = 'true';
import jwt from 'jsonwebtoken';
import http from 'http';
import app from '../../apps/api/src/index.js';
import { 
  getUserRepository, 
  setUserRepositoryForTesting, 
  InMemoryUserRepository,
  IUserRepository 
} from '../../apps/api/src/storage/userRepository.js';
import { db } from '../../apps/api/src/storage/db.js';
import { Profile, AppRole } from '@smartfa/contracts';

console.log('================================================================');
console.log(' ACADASSESS PHASE 4.1: USER REPOSITORY & RBAC SECURITY SUITE    ');
console.log('================================================================\n');

const DEV_JWT_SECRET = process.env.JWT_DEV_SECRET || 'smartfa-test-hmac-dev-secret-key-32chars';
const PORT = 4001;

let server: http.Server;

function createTestToken(userId: string, email: string = 'test@acadassess.edu', expiresIn: string = '1h'): string {
  return jwt.sign({ sub: userId, email }, DEV_JWT_SECRET, { expiresIn });
}

function makeRequest(
  method: string,
  path: string,
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

let totalTests = 0;
let passedTests = 0;

function assert(condition: boolean, testName: string, failureDetails?: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`[PASS] Test ${totalTests}: ${testName}`);
  } else {
    console.error(`[FAIL] Test ${totalTests}: ${testName}`);
    if (failureDetails) {
      console.error(`       Details: ${failureDetails}`);
    }
  }
}

async function runTests() {
  server = app.listen(PORT);

  try {
    // -------------------------------------------------------------------------
    // Test 1: Valid authenticated HOD resolves correct profile & roles from repo
    // -------------------------------------------------------------------------
    const hodToken = createTestToken('a1000000-0000-0000-0000-000000000001');
    const res1 = await makeRequest('GET', '/api/v1/admin/hod/programmes', hodToken);
    assert(
      res1.status === 200 && Array.isArray(res1.body.programmes),
      'Valid authenticated HOD resolves profile & active roles (200 OK)'
    );

    // -------------------------------------------------------------------------
    // Test 2: Invalid cryptographic signature rejected
    // -------------------------------------------------------------------------
    const forgedToken = jwt.sign(
      { sub: 'a1000000-0000-0000-0000-000000000001' },
      'wrong-secret-key-that-should-fail-32chars'
    );
    const res2 = await makeRequest('GET', '/api/v1/admin/hod/programmes', forgedToken);
    assert(
      res2.status === 401 && res2.body.error?.code === 'INVALID_TOKEN',
      'Forged JWT with invalid signature rejected (401 INVALID_TOKEN)'
    );

    // -------------------------------------------------------------------------
    // Test 3: Expired token rejected
    // -------------------------------------------------------------------------
    const expiredToken = jwt.sign(
      { sub: 'a1000000-0000-0000-0000-000000000001' },
      DEV_JWT_SECRET,
      { expiresIn: '-10s' }
    );
    const res3 = await makeRequest('GET', '/api/v1/admin/hod/programmes', expiredToken);
    assert(
      res3.status === 401 && res3.body.error?.code === 'INVALID_TOKEN',
      'Expired token rejected (401 INVALID_TOKEN)'
    );

    // -------------------------------------------------------------------------
    // Test 4: Missing profile safely rejected
    // -------------------------------------------------------------------------
    const ghostUserToken = createTestToken('00000000-0000-0000-0000-000000000999');
    const res4 = await makeRequest('GET', '/api/v1/admin/hod/programmes', ghostUserToken);
    assert(
      res4.status === 403 && res4.body.error?.code === 'PROFILE_NOT_FOUND',
      'Authenticated identity with missing profile safely rejected (403 PROFILE_NOT_FOUND)'
    );

    // -------------------------------------------------------------------------
    // Test 5: Inactive profile strictly denied
    // -------------------------------------------------------------------------
    const inactiveUserToken = createTestToken('a9000000-0000-0000-0000-000000000001');
    const res5 = await makeRequest('GET', '/api/v1/admin/hod/programmes', inactiveUserToken);
    assert(
      res5.status === 403 && res5.body.error?.code === 'ACCOUNT_INACTIVE',
      'Inactive profile strictly denied (403 ACCOUNT_INACTIVE)'
    );

    // -------------------------------------------------------------------------
    // Test 6: Client-supplied role claim in payload/header completely ignored
    // -------------------------------------------------------------------------
    const studentToken = createTestToken('a4000000-0000-0000-0000-000000000001');
    const res6 = await makeRequest('GET', '/api/v1/admin/hod/programmes', studentToken, undefined, {
      'X-User-Role': 'hod',
      'X-Claimed-Role': 'hod'
    });
    assert(
      res6.status === 403 && res6.body.error?.code === 'FORBIDDEN',
      'Client-supplied role headers ignored; student denied HOD access (403 FORBIDDEN)'
    );

    // -------------------------------------------------------------------------
    // Test 7: Client-supplied user ID in request body cannot override token identity
    // -------------------------------------------------------------------------
    const spoofAttempt = await makeRequest('POST', '/api/v1/assessments', studentToken, {
      userId: 'a2000000-0000-0000-0000-000000000001', // Teacher ID spoof attempt
      title: 'Spoofed Assessment',
      instructions: 'Test instructions',
      deadline_at: new Date(Date.now() + 86400000).toISOString(),
      class_subject_id: 'cs100000-0000-0000-0000-000000000001'
    });
    assert(
      spoofAttempt.status === 403 && spoofAttempt.body.error?.code === 'FORBIDDEN',
      'Client-supplied user ID ignored; student blocked from creating assessment (403)'
    );

    // -------------------------------------------------------------------------
    // Test 8: Database error fails safely without leaking access (Fail-Closed)
    // -------------------------------------------------------------------------
    class FaultyDatabaseRepository implements IUserRepository {
      async getProfileById(userId: string): Promise<Profile | null> {
        throw new Error('Connection refused to database pool');
      }
      async getActiveRolesByUserId(userId: string): Promise<AppRole[]> {
        return [];
      }
      isPersistent(): boolean { return true; }
      getMode(): 'supabase_postgresql' { return 'supabase_postgresql'; }
    }

    setUserRepositoryForTesting(new FaultyDatabaseRepository());
    const faultRes = await makeRequest('GET', '/api/v1/admin/hod/programmes', hodToken);
    assert(
      faultRes.status === 500 && faultRes.body.error?.code === 'DATABASE_ERROR',
      'Database failure fails closed and returns safe error (500 DATABASE_ERROR)'
    );

    // Restore standard repository
    setUserRepositoryForTesting(null);

    // -------------------------------------------------------------------------
    // Test 9: In-memory repository fallback operates correctly for tests
    // -------------------------------------------------------------------------
    const defaultRepo = getUserRepository();
    assert(
      defaultRepo instanceof InMemoryUserRepository && !defaultRepo.isPersistent(),
      'Default development/test mode uses InMemoryUserRepository with is_persistent=false'
    );

    const testProfile = await defaultRepo.getProfileById('a1000000-0000-0000-0000-000000000001');
    const testRoles = await defaultRepo.getActiveRolesByUserId('a1000000-0000-0000-0000-000000000001');
    assert(
      testProfile?.email === 'hod@smartfa.edu' && testRoles.includes('hod'),
      'InMemoryUserRepository correctly resolves seeded fixtures'
    );

    // -------------------------------------------------------------------------
    // Test 10: Production mode strictly forbids in-memory fallback
    // -------------------------------------------------------------------------
    const originalEnv = process.env.NODE_ENV;
    const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    process.env.NODE_ENV = 'production';
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    let caughtConfigError = false;

    try {
      // With empty SUPABASE_SERVICE_ROLE_KEY, getUserRepository must throw in production
      getUserRepository();
    } catch (e: any) {
      caughtConfigError = e.message.includes('CRITICAL CONFIGURATION ERROR');
    } finally {
      process.env.NODE_ENV = originalEnv;
      process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
    }

    assert(
      caughtConfigError,
      'Production mode strictly throws CRITICAL CONFIGURATION ERROR when Supabase credentials missing'
    );

    // -------------------------------------------------------------------------
    // Test 12: Production safety enforced at HTTP middleware level
    // -------------------------------------------------------------------------
    process.env.NODE_ENV = 'production';
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const prodHttpRes = await makeRequest('GET', '/api/v1/admin/hod/programmes', hodToken);
    process.env.NODE_ENV = originalEnv;
    process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;

    assert(
      prodHttpRes.status === 500 && prodHttpRes.body.error?.code === 'AUTH_MISCONFIGURED',
      'Production mode request rejected with 500 AUTH_MISCONFIGURED if Supabase is unconfigured'
    );

  } finally {
    server.close();
  }

  console.log('\n----------------------------------------------------------------');
  console.log(`TOTAL: ${totalTests} | PASSED: ${passedTests} | FAILED: ${totalTests - passedTests}`);
  console.log('----------------------------------------------------------------\n');

  if (passedTests === totalTests) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
