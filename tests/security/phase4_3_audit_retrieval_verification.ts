process.env.SMARTFA_TEST_MODE = 'true';
import jwt from 'jsonwebtoken';
import http from 'http';
import app from '../../apps/api/src/index.js';
import { 
  logAuditEvent, 
  listAuditEvents, 
  setAuditClientForTesting 
} from '../../apps/api/src/audit/auditService.js';
import { db } from '../../apps/api/src/storage/db.js';
import { AuditEvent } from '@smartfa/contracts';

console.log('================================================================');
console.log(' ACADASSESS PHASE 4.3: LIVE AUDIT RETRIEVAL SECURITY SUITE     ');
console.log('================================================================\n');

const DEV_JWT_SECRET = process.env.JWT_DEV_SECRET || 'smartfa-test-hmac-dev-secret-key-32chars';
const PORT = 4004;

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

  const HOD_ID = 'a1000000-0000-0000-0000-000000000001';
  const TEACHER_ID = 'a2000000-0000-0000-0000-000000000001';
  const STUDENT_ID = 'a4000000-0000-0000-0000-000000000001';

  const hodToken = createTestToken(HOD_ID);
  const teacherToken = createTestToken(TEACHER_ID);
  const studentToken = createTestToken(STUDENT_ID);

  try {
    // -------------------------------------------------------------------------
    // SECTION 1: Service Layer Parameter Validation & Invariants
    // -------------------------------------------------------------------------
    console.log('\n--- SECTION 1: Service Layer Parameter Validation & Invariants ---');

    // 1. Invalid limit <= 0 rejected
    let limitZeroErr = false;
    try {
      await listAuditEvents({ limit: 0 });
    } catch (err: any) {
      limitZeroErr = err.code === 'INVALID_PARAMETER';
    }
    assert(limitZeroErr, 'listAuditEvents rejects non-positive limit (limit: 0)');

    // 2. Negative limit rejected
    let limitNegativeErr = false;
    try {
      await listAuditEvents({ limit: -10 });
    } catch (err: any) {
      limitNegativeErr = err.code === 'INVALID_PARAMETER';
    }
    assert(limitNegativeErr, 'listAuditEvents rejects negative limit (limit: -10)');

    // 3. Limit exceeding maximum (200) rejected
    let limitMaxErr = false;
    try {
      await listAuditEvents({ limit: 250 });
    } catch (err: any) {
      limitMaxErr = err.code === 'INVALID_PARAMETER';
    }
    assert(limitMaxErr, 'listAuditEvents rejects limit exceeding maximum (limit: 250 > 200)');

    // 4. Non-integer limit rejected
    let limitFloatErr = false;
    try {
      await listAuditEvents({ limit: 5.5 as any });
    } catch (err: any) {
      limitFloatErr = err.code === 'INVALID_PARAMETER';
    }
    assert(limitFloatErr, 'listAuditEvents rejects floating point limit (limit: 5.5)');

    // 5. Negative offset rejected
    let offsetNegativeErr = false;
    try {
      await listAuditEvents({ offset: -1 });
    } catch (err: any) {
      offsetNegativeErr = err.code === 'INVALID_PARAMETER';
    }
    assert(offsetNegativeErr, 'listAuditEvents rejects negative offset (offset: -1)');

    // -------------------------------------------------------------------------
    // SECTION 2: Chronological Ordering & Pagination
    // -------------------------------------------------------------------------
    console.log('\n--- SECTION 2: Chronological Ordering & Pagination ---');

    // Seed test audit events with deterministic timestamps
    const now = Date.now();
    const eventOld = await logAuditEvent({
      actorId: HOD_ID,
      action: 'ACTION_OLD',
      resourceType: 'system',
      resourceId: 'res-old',
      correlationId: 'c0000000-0000-0000-0000-000000000001'
    });
    // Manually skew created_at for deterministic ordering verification
    eventOld.created_at = new Date(now - 100000).toISOString();

    const eventMid = await logAuditEvent({
      actorId: HOD_ID,
      action: 'ACTION_MID',
      resourceType: 'system',
      resourceId: 'res-mid',
      correlationId: 'c0000000-0000-0000-0000-000000000002'
    });
    eventMid.created_at = new Date(now - 50000).toISOString();

    const eventNew = await logAuditEvent({
      actorId: HOD_ID,
      action: 'ACTION_NEW',
      resourceType: 'system',
      resourceId: 'res-new',
      correlationId: 'c0000000-0000-0000-0000-000000000003'
    });
    eventNew.created_at = new Date(now).toISOString();

    // 6. Newest-first ordering (created_at DESC)
    const sortedEvents = await listAuditEvents({ limit: 10 });
    const newIdx = sortedEvents.findIndex(e => e.action === 'ACTION_NEW');
    const midIdx = sortedEvents.findIndex(e => e.action === 'ACTION_MID');
    const oldIdx = sortedEvents.findIndex(e => e.action === 'ACTION_OLD');
    assert(
      newIdx !== -1 && midIdx !== -1 && oldIdx !== -1 && newIdx < midIdx && midIdx < oldIdx,
      'listAuditEvents returns events in strict chronological descending order (newest first)'
    );

    // 7. Result limits enforced
    const limitedEvents = await listAuditEvents({ limit: 2 });
    assert(limitedEvents.length === 2, 'listAuditEvents respects exact limit constraint (limit: 2)');

    // 8. Offset pagination operates accurately
    const pagedEvents = await listAuditEvents({ limit: 2, offset: 1 });
    assert(
      pagedEvents.length === 2 && pagedEvents[0].id === sortedEvents[1].id,
      'listAuditEvents offset accurately skips records for pagination'
    );

    // 9. Empty result handling when offset exceeds data
    const emptyEvents = await listAuditEvents({ offset: 10000 });
    assert(Array.isArray(emptyEvents) && emptyEvents.length === 0, 'listAuditEvents returns empty array when offset exceeds available records');

    // -------------------------------------------------------------------------
    // SECTION 3: Supabase Query Integration & Fail-Closed Invariants
    // -------------------------------------------------------------------------
    console.log('\n--- SECTION 3: Supabase Query Integration & Fail-Closed Invariants ---');

    // 10. Supabase query parameters and mapping
    let queriedTable = '';
    let selectedCols = '';
    let orderCol = '';
    let orderAsc: boolean | undefined = undefined;
    let rangeFrom: number | undefined = undefined;
    let rangeTo: number | undefined = undefined;

    const mockSupabaseSuccess: any = {
      from: (table: string) => {
        queriedTable = table;
        return {
          select: (cols: string) => {
            selectedCols = cols;
            return {
              order: (col: string, opts: { ascending: boolean }) => {
                orderCol = col;
                orderAsc = opts.ascending;
                return {
                  range: async (from: number, to: number) => {
                    rangeFrom = from;
                    rangeTo = to;
                    return {
                      data: [
                        {
                          id: 'mock-audit-1',
                          actor_id: HOD_ID,
                          action: 'MOCK_ACTION',
                          resource_type: 'profiles',
                          resource_id: 'target-1',
                          before: { status: 'invited' },
                          after: { status: 'active' },
                          correlation_id: 'c1111111-1111-1111-1111-111111111111',
                          ip_hash: null,
                          created_at: new Date().toISOString()
                        }
                      ],
                      error: null
                    };
                  }
                };
              }
            };
          }
        };
      }
    };

    setAuditClientForTesting(mockSupabaseSuccess);
    const mockResults = await listAuditEvents({ limit: 10, offset: 5 });
    setAuditClientForTesting(null);

    assert(
      queriedTable === 'audit_events' &&
      orderCol === 'created_at' &&
      orderAsc === false &&
      rangeFrom === 5 &&
      rangeTo === 14 &&
      mockResults.length === 1 &&
      mockResults[0].action === 'MOCK_ACTION',
      'Supabase query correctly queries public.audit_events with created_at DESC, range pagination, and field mapping'
    );

    // 11. Database error fails closed and does not silently fall back to mock data
    const mockSupabaseError: any = {
      from: () => ({
        select: () => ({
          order: () => ({
            range: async () => ({
              data: null,
              error: { message: 'Connection to PostgreSQL audit partition failed' }
            })
          })
        })
      })
    };

    setAuditClientForTesting(mockSupabaseError);
    let dbErrorThrew = false;
    try {
      await listAuditEvents({ limit: 10 });
    } catch (err: any) {
      dbErrorThrew = err.message.includes('Failed to retrieve audit events from database');
    }
    setAuditClientForTesting(null);

    assert(
      dbErrorThrew,
      'Database query failure strictly throws and fails closed without silent fallback to mock data'
    );

    // 12. Production fail-closed invariant
    const savedTestMode = process.env.SMARTFA_TEST_MODE;
    const savedNodeEnv = process.env.NODE_ENV;
    const savedSupabaseUrl = process.env.SUPABASE_URL;
    const savedSupabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    let prodThrew = false;
    try {
      delete process.env.SMARTFA_TEST_MODE;
      process.env.NODE_ENV = 'production';
      delete process.env.SUPABASE_URL;
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      await listAuditEvents();
    } catch (err: any) {
      prodThrew = err.message.includes('CRITICAL CONFIGURATION ERROR');
    } finally {
      process.env.SMARTFA_TEST_MODE = savedTestMode;
      process.env.NODE_ENV = savedNodeEnv;
      if (savedSupabaseUrl) process.env.SUPABASE_URL = savedSupabaseUrl;
      if (savedSupabaseKey) process.env.SUPABASE_SERVICE_ROLE_KEY = savedSupabaseKey;
    }
    assert(
      prodThrew,
      'Production mode strictly fails closed when Supabase credentials are missing'
    );

    // -------------------------------------------------------------------------
    // SECTION 4: HTTP Endpoint Authentication & RBAC Boundary
    // -------------------------------------------------------------------------
    console.log('\n--- SECTION 4: HTTP Endpoint Authentication & RBAC Boundary ---');

    // 13. Unauthenticated request rejected
    const unauthRes = await makeRequest('GET', '/api/v1/admin/hod/audit');
    assert(
      unauthRes.status === 401 && unauthRes.body.error?.code === 'UNAUTHORIZED',
      'Unauthenticated request to GET /admin/hod/audit rejected (401 UNAUTHORIZED)'
    );

    // 14. Student access rejected
    const studentRes = await makeRequest('GET', '/api/v1/admin/hod/audit', studentToken);
    assert(
      studentRes.status === 403 && studentRes.body.error?.code === 'FORBIDDEN',
      'Student identity strictly forbidden from GET /admin/hod/audit (403 FORBIDDEN)'
    );

    // 15. Teacher access rejected
    const teacherRes = await makeRequest('GET', '/api/v1/admin/hod/audit', teacherToken);
    assert(
      teacherRes.status === 403 && teacherRes.body.error?.code === 'FORBIDDEN',
      'Teacher identity strictly forbidden from GET /admin/hod/audit (403 FORBIDDEN)'
    );

    // 16. Client-supplied identity/role spoofing headers ignored
    const spoofRes = await makeRequest('GET', '/api/v1/admin/hod/audit', studentToken, undefined, {
      'x-user-id': HOD_ID,
      'x-role': 'hod'
    });
    assert(
      spoofRes.status === 403,
      'Client-supplied identity spoofing headers strictly ignored (403 FORBIDDEN)'
    );

    // 17. Authenticated HOD access allowed
    const hodRes = await makeRequest('GET', '/api/v1/admin/hod/audit', hodToken);
    assert(
      hodRes.status === 200 && Array.isArray(hodRes.body.events),
      'Authenticated HOD retrieves audit timeline (200 OK)'
    );

    // -------------------------------------------------------------------------
    // SECTION 5: HTTP Endpoint Query Parameters & Error Responses
    // -------------------------------------------------------------------------
    console.log('\n--- SECTION 5: HTTP Endpoint Query Parameters & Error Responses ---');

    // 18. Valid limit query param
    const limitRes = await makeRequest('GET', '/api/v1/admin/hod/audit?limit=2', hodToken);
    assert(
      limitRes.status === 200 && limitRes.body.events.length <= 2,
      'GET /audit?limit=2 returns at most 2 events (200 OK)'
    );

    // 19. Valid limit & offset pagination
    const pageRes = await makeRequest('GET', '/api/v1/admin/hod/audit?limit=1&offset=1', hodToken);
    assert(
      pageRes.status === 200 && pageRes.body.events.length === 1,
      'GET /audit?limit=1&offset=1 paginates accurately (200 OK)'
    );

    // 20. Invalid limit query param (negative) returns 400 VALIDATION_ERROR
    const invalidLimitRes1 = await makeRequest('GET', '/api/v1/admin/hod/audit?limit=-1', hodToken);
    assert(
      invalidLimitRes1.status === 400 && invalidLimitRes1.body.error?.code === 'VALIDATION_ERROR',
      'GET /audit with negative limit returns 400 VALIDATION_ERROR'
    );

    // 21. Invalid limit query param (non-numeric string) returns 400 VALIDATION_ERROR
    const invalidLimitRes2 = await makeRequest('GET', '/api/v1/admin/hod/audit?limit=abc', hodToken);
    assert(
      invalidLimitRes2.status === 400 && invalidLimitRes2.body.error?.code === 'VALIDATION_ERROR',
      'GET /audit with non-numeric limit returns 400 VALIDATION_ERROR'
    );

    // 22. Invalid limit query param (> 200) returns 400 VALIDATION_ERROR
    const invalidLimitRes3 = await makeRequest('GET', '/api/v1/admin/hod/audit?limit=500', hodToken);
    assert(
      invalidLimitRes3.status === 400 && invalidLimitRes3.body.error?.code === 'VALIDATION_ERROR',
      'GET /audit with limit > 200 returns 400 VALIDATION_ERROR'
    );

    // 23. Invalid offset query param (negative) returns 400 VALIDATION_ERROR
    const invalidOffsetRes = await makeRequest('GET', '/api/v1/admin/hod/audit?offset=-5', hodToken);
    assert(
      invalidOffsetRes.status === 400 && invalidOffsetRes.body.error?.code === 'VALIDATION_ERROR',
      'GET /audit with negative offset returns 400 VALIDATION_ERROR'
    );

    // 24. Database failure in route returns 500 DATABASE_ERROR
    setAuditClientForTesting(mockSupabaseError);
    const dbErrHttpRes = await makeRequest('GET', '/api/v1/admin/hod/audit', hodToken);
    setAuditClientForTesting(null);
    assert(
      dbErrHttpRes.status === 500 && dbErrHttpRes.body.error?.code === 'DATABASE_ERROR',
      'Database failure in route returns safe 500 DATABASE_ERROR without crashing process'
    );

    // 25. Append-only integrity: verify auditService exposes NO update or delete functions
    const auditServiceModule = await import('../../apps/api/src/audit/auditService.js');
    const exportedKeys = Object.keys(auditServiceModule);
    const hasUnsafeOperations = exportedKeys.some(k => 
      k.toLowerCase().includes('update') || 
      k.toLowerCase().includes('delete') || 
      k.toLowerCase().includes('remove') ||
      k.toLowerCase().includes('purge')
    );
    assert(
      !hasUnsafeOperations,
      'Audit service strictly prohibits update or delete operations (append-only integrity guaranteed)'
    );

  } finally {
    server.close();
  }

  console.log('\n================================================================');
  console.log(` RESULTS: ${passedTests}/${totalTests} Tests Passed`);
  console.log('================================================================\n');

  if (passedTests === totalTests) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('[FATAL TEST ERROR]', err);
  process.exit(1);
});
