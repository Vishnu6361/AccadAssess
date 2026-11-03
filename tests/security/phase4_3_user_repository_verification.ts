process.env.SMARTFA_TEST_MODE = 'true';
import jwt from 'jsonwebtoken';
import http from 'http';
import app from '../../apps/api/src/index.js';
import { 
  getUserRepository, 
  setUserRepositoryForTesting, 
  InMemoryUserRepository,
  SupabaseUserRepository,
  IUserRepository
} from '../../apps/api/src/storage/userRepository.js';
import { db } from '../../apps/api/src/storage/db.js';
import { Profile, AppRole } from '@smartfa/contracts';

console.log('================================================================');
console.log(' ACADASSESS PHASE 4.3: USER REPOSITORY & HOD SECURITY SUITE     ');
console.log('================================================================\n');

const DEV_JWT_SECRET = process.env.JWT_DEV_SECRET || 'smartfa-test-hmac-dev-secret-key-32chars';
const PORT = 4003;

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

  try {
    console.log('\n--- SECTION 1: Repository Architecture & Fail-Closed Invariants ---');

    // 1. In-memory test mode verification
    const defaultRepo = getUserRepository();
    assert(
      defaultRepo instanceof InMemoryUserRepository && !defaultRepo.isPersistent(),
      'Test environment instantiates typed InMemoryUserRepository with isPersistent()=false'
    );

    // 2. Production fail-closed behavior
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
      setUserRepositoryForTesting(null as any);
      getUserRepository();
    } catch (err: any) {
      prodThrew = err.message.includes('CRITICAL CONFIGURATION ERROR');
    } finally {
      process.env.SMARTFA_TEST_MODE = savedTestMode;
      process.env.NODE_ENV = savedNodeEnv;
      if (savedSupabaseUrl) process.env.SUPABASE_URL = savedSupabaseUrl;
      if (savedSupabaseKey) process.env.SUPABASE_SERVICE_ROLE_KEY = savedSupabaseKey;
      setUserRepositoryForTesting(new InMemoryUserRepository(db));
    }
    assert(
      prodThrew,
      'Production mode strictly fails closed without credentials (throws CRITICAL CONFIGURATION ERROR)'
    );

    // 3. InMemoryUserRepository core operations
    const inMemRepo = new InMemoryUserRepository(db);
    const listedUsers = await inMemRepo.listUsers();
    assert(
      Array.isArray(listedUsers) && listedUsers.length > 0 && Array.isArray(listedUsers[0].roles),
      'InMemoryUserRepository.listUsers() returns users with active roles array'
    );

    const foundByEmail = await inMemRepo.getProfileByEmail('hod@smartfa.edu');
    assert(
      foundByEmail !== null && foundByEmail.email === 'hod@smartfa.edu',
      'InMemoryUserRepository.getProfileByEmail() correctly resolves profile'
    );

    const notFoundByEmail = await inMemRepo.getProfileByEmail('nonexistent@nowhere.edu');
    assert(
      notFoundByEmail === null,
      'InMemoryUserRepository.getProfileByEmail() returns null for unknown email'
    );

    console.log('\n--- SECTION 2: Partial Invitation Failure Rollback in SupabaseUserRepository ---');

    // 6. Partial failure rollback: profile insert failure triggers auth.admin.deleteUser
    let deletedUserId: string | null = null;
    const mockClientProfileFail: any = {
      auth: {
        admin: {
          createUser: async (opts: any) => ({
            data: { user: { id: 'mock-auth-user-999', email: opts.email } },
            error: null
          }),
          deleteUser: async (uid: string) => {
            deletedUserId = uid;
            return { data: {}, error: null };
          }
        }
      },
      from: (table: string) => {
        if (table === 'profiles') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: null, error: null })
              })
            }),
            insert: () => ({
              select: () => ({
                single: async () => ({ data: null, error: { message: 'Database insert failed on profiles' } })
              })
            })
          };
        }
        return {};
      }
    };

    const supabaseRepoFail1 = new SupabaseUserRepository(mockClientProfileFail, true);
    let errorCaught1 = false;
    try {
      await supabaseRepoFail1.inviteUser({
        full_name: 'Test Failure User',
        email: 'fail1@test.edu',
        role: 'subject_teacher',
        assigned_by: HOD_ID
      });
    } catch (err: any) {
      errorCaught1 = true;
    }
    assert(
      errorCaught1 && deletedUserId === 'mock-auth-user-999',
      'SupabaseUserRepository rolls back created Auth user via deleteUser on profile insert failure'
    );

    // 7. Partial failure rollback: role insert failure triggers auth.admin.deleteUser
    let deletedUserId2: string | null = null;
    const mockClientRoleFail: any = {
      auth: {
        admin: {
          createUser: async (opts: any) => ({
            data: { user: { id: 'mock-auth-user-888', email: opts.email } },
            error: null
          }),
          deleteUser: async (uid: string) => {
            deletedUserId2 = uid;
            return { data: {}, error: null };
          }
        }
      },
      from: (table: string) => {
        if (table === 'profiles') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: null, error: null })
              })
            }),
            insert: () => ({
              select: () => ({
                single: async () => ({
                  data: {
                    id: 'mock-auth-user-888',
                    full_name: 'Test Failure User 2',
                    email: 'fail2@test.edu',
                    status: 'active',
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                  },
                  error: null
                })
              })
            })
          };
        }
        if (table === 'user_roles') {
          return {
            insert: () => ({
              select: () => ({
                single: async () => ({ data: null, error: { message: 'Role insert failed' } })
              })
            })
          };
        }
        return {};
      }
    };

    const supabaseRepoFail2 = new SupabaseUserRepository(mockClientRoleFail, true);
    let errorCaught2 = false;
    try {
      await supabaseRepoFail2.inviteUser({
        full_name: 'Test Failure User 2',
        email: 'fail2@test.edu',
        role: 'subject_teacher',
        assigned_by: HOD_ID
      });
    } catch (err: any) {
      errorCaught2 = true;
    }
    assert(
      errorCaught2 && deletedUserId2 === 'mock-auth-user-888',
      'SupabaseUserRepository rolls back created Auth user via deleteUser on role insert failure'
    );

    // 8. SupabaseUserRepository prevents duplicate email before Auth createUser
    let authCreateCalled = false;
    const mockClientDuplicateEmail: any = {
      auth: {
        admin: {
          createUser: async () => {
            authCreateCalled = true;
            return { data: { user: { id: 'mock-auth-id' } }, error: null };
          }
        }
      },
      from: (table: string) => {
        if (table === 'profiles') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { id: 'existing-id', email: 'duplicate@test.edu' },
                  error: null
                })
              })
            })
          };
        }
        return {};
      }
    };

    const supabaseRepoDup = new SupabaseUserRepository(mockClientDuplicateEmail, true);
    let dupCaught = false;
    try {
      await supabaseRepoDup.inviteUser({
        full_name: 'Duplicate Test',
        email: 'duplicate@test.edu',
        role: 'subject_teacher'
      });
    } catch (err: any) {
      dupCaught = err.code === 'DUPLICATE_EMAIL';
    }
    assert(
      dupCaught && !authCreateCalled,
      'SupabaseUserRepository rejects duplicate email before calling Auth createUser (no orphaned accounts)'
    );

    console.log('\n--- SECTION 3: Authentication & Authorization Boundary Controls ---');

    // 9. Unauthenticated request to /users rejected
    const unauthRes = await makeRequest('GET', '/api/v1/admin/hod/users');
    assert(
      unauthRes.status === 401 && unauthRes.body.error?.code === 'UNAUTHORIZED',
      'Unauthenticated request to GET /users rejected (401 UNAUTHORIZED)'
    );

    // 10. Student identity rejected from HOD user management
    const studentToken = createTestToken(STUDENT_ID);
    const studentRes = await makeRequest('GET', '/api/v1/admin/hod/users', studentToken);
    assert(
      studentRes.status === 403 && studentRes.body.error?.code === 'FORBIDDEN',
      'Student identity rejected from GET /users (403 FORBIDDEN)'
    );

    // 11. Teacher identity rejected from HOD user management
    const teacherToken = createTestToken(TEACHER_ID);
    const teacherRes = await makeRequest('GET', '/api/v1/admin/hod/users', teacherToken);
    assert(
      teacherRes.status === 403 && teacherRes.body.error?.code === 'FORBIDDEN',
      'Teacher identity rejected from GET /users (403 FORBIDDEN)'
    );

    // 12. Client-supplied spoofed headers ignored
    const spoofRes = await makeRequest('GET', '/api/v1/admin/hod/users', studentToken, undefined, {
      'x-user-id': HOD_ID,
      'x-role': 'hod'
    });
    assert(
      spoofRes.status === 403,
      'Client-supplied identity spoofing headers strictly ignored (403 FORBIDDEN)'
    );

    console.log('\n--- SECTION 4: HOD User Listing via Repository ---');

    const hodToken = createTestToken(HOD_ID);

    // 13. HOD lists users via repository
    const listRes = await makeRequest('GET', '/api/v1/admin/hod/users', hodToken);
    assert(
      listRes.status === 200 && Array.isArray(listRes.body.users) && listRes.body.users.length >= 3,
      'Authenticated HOD retrieves user directory with active roles from repository (200 OK)'
    );

    console.log('\n--- SECTION 5: User Invitation & Privilege Escalation Guards ---');

    // 14. HOD successfully invites teacher user
    const inviteTeacherRes = await makeRequest('POST', '/api/v1/admin/hod/users/invite', hodToken, {
      full_name: 'Dr. Alan Turing',
      email: 'alan.turing@smartfa.edu',
      role: 'subject_teacher'
    });
    assert(
      inviteTeacherRes.status === 201 &&
      inviteTeacherRes.body.user?.email === 'alan.turing@smartfa.edu' &&
      inviteTeacherRes.body.role?.role === 'subject_teacher',
      'HOD invites new teacher member with permitted role (201 Created)'
    );

    // 15. HOD successfully invites student user with USN
    const inviteStudentRes = await makeRequest('POST', '/api/v1/admin/hod/users/invite', hodToken, {
      full_name: 'Ada Lovelace',
      email: 'ada.lovelace@smartfa.edu',
      usn: '1MS23CS099',
      role: 'student'
    });
    assert(
      inviteStudentRes.status === 201 &&
      inviteStudentRes.body.user?.usn === '1MS23CS099' &&
      inviteStudentRes.body.role?.role === 'student',
      'HOD invites new student with USN (201 Created)'
    );

    // 16. Invalid invitation schema (missing email) rejected
    const invalidInviteRes1 = await makeRequest('POST', '/api/v1/admin/hod/users/invite', hodToken, {
      full_name: 'Incomplete User',
      role: 'subject_teacher'
    });
    assert(
      invalidInviteRes1.status === 400 && invalidInviteRes1.body.error?.code === 'VALIDATION_ERROR',
      'Invitation with missing required email rejected (400 VALIDATION_ERROR)'
    );

    // 17. Invalid role rejected
    const invalidInviteRes2 = await makeRequest('POST', '/api/v1/admin/hod/users/invite', hodToken, {
      full_name: 'Invalid Role User',
      email: 'invalid.role@smartfa.edu',
      role: 'superadmin'
    });
    assert(
      invalidInviteRes2.status === 400 && invalidInviteRes2.body.error?.code === 'VALIDATION_ERROR',
      'Invitation with invalid role value rejected (400 VALIDATION_ERROR)'
    );

    // 18. Privilege escalation: HOD cannot invite another HOD
    const escalateInviteRes = await makeRequest('POST', '/api/v1/admin/hod/users/invite', hodToken, {
      full_name: 'Second HOD',
      email: 'hod2@smartfa.edu',
      role: 'hod'
    });
    assert(
      escalateInviteRes.status === 403 &&
      escalateInviteRes.body.error?.code === 'FORBIDDEN_PRIVILEGE_ESCALATION',
      'HOD prevented from granting HOD role in invitation (403 FORBIDDEN_PRIVILEGE_ESCALATION)'
    );

    // 19. Duplicate email rejected
    const duplicateEmailRes = await makeRequest('POST', '/api/v1/admin/hod/users/invite', hodToken, {
      full_name: 'Duplicate Alan',
      email: 'alan.turing@smartfa.edu',
      role: 'subject_teacher'
    });
    assert(
      duplicateEmailRes.status === 409 &&
      duplicateEmailRes.body.error?.code === 'DUPLICATE_EMAIL',
      'Duplicate email invitation rejected (409 DUPLICATE_EMAIL)'
    );

    console.log('\n--- SECTION 6: Role Assignment & Self-Modification Guards ---');

    const createdTeacherId = inviteTeacherRes.body.user.id;

    // 20. Permitted role assignment: assign proctor to teacher
    const assignRoleRes = await makeRequest(
      'POST',
      `/api/v1/admin/hod/users/${createdTeacherId}/roles`,
      hodToken,
      {
        role: 'proctor'
      }
    );
    assert(
      assignRoleRes.status === 201 && assignRoleRes.body.role?.role === 'proctor',
      'HOD assigns permitted secondary role (proctor) to teacher (201 Created)'
    );

    // 21. Duplicate active role rejected
    const duplicateRoleRes = await makeRequest(
      'POST',
      `/api/v1/admin/hod/users/${createdTeacherId}/roles`,
      hodToken,
      {
        role: 'proctor'
      }
    );
    assert(
      duplicateRoleRes.status === 409 &&
      duplicateRoleRes.body.error?.code === 'DUPLICATE_ROLE_ASSIGNMENT',
      'Duplicate active role assignment rejected (409 DUPLICATE_ROLE_ASSIGNMENT)'
    );

    // 22. Self-role modification forbidden
    const selfRoleRes = await makeRequest(
      'POST',
      `/api/v1/admin/hod/users/${HOD_ID}/roles`,
      hodToken,
      {
        role: 'class_teacher'
      }
    );
    assert(
      selfRoleRes.status === 403 &&
      selfRoleRes.body.error?.code === 'FORBIDDEN_SELF_MODIFICATION',
      'HOD self-role modification strictly forbidden (403 FORBIDDEN_SELF_MODIFICATION)'
    );

    // 23. Privilege escalation: assigning HOD role rejected
    const escalateRoleRes = await makeRequest(
      'POST',
      `/api/v1/admin/hod/users/${createdTeacherId}/roles`,
      hodToken,
      {
        role: 'hod'
      }
    );
    assert(
      escalateRoleRes.status === 403 &&
      escalateRoleRes.body.error?.code === 'FORBIDDEN_PRIVILEGE_ESCALATION',
      'HOD delegation via role assignment rejected (403 FORBIDDEN_PRIVILEGE_ESCALATION)'
    );

    // 24. Role assignment on non-existent user returns 404
    const nonExistentRoleRes = await makeRequest(
      'POST',
      '/api/v1/admin/hod/users/00000000-0000-0000-0000-000000000999/roles',
      hodToken,
      {
        role: 'proctor'
      }
    );
    assert(
      nonExistentRoleRes.status === 404 &&
      nonExistentRoleRes.body.error?.code === 'USER_NOT_FOUND',
      'Role assignment to non-existent user rejected (404 USER_NOT_FOUND)'
    );

    console.log('\n--- SECTION 7: Account Status Transitions & Self-Deactivation Guard ---');

    // 25. Transition active user to inactive
    const deactivateRes = await makeRequest(
      'PATCH',
      `/api/v1/admin/hod/users/${createdTeacherId}/status`,
      hodToken,
      {
        status: 'inactive'
      }
    );
    assert(
      deactivateRes.status === 200 && deactivateRes.body.user?.status === 'inactive',
      'HOD transitions user status from active to inactive (200 OK)'
    );

    // 26. Cannot assign role to inactive account
    const roleInactiveRes = await makeRequest(
      'POST',
      `/api/v1/admin/hod/users/${createdTeacherId}/roles`,
      hodToken,
      {
        role: 'class_teacher'
      }
    );
    assert(
      roleInactiveRes.status === 400 &&
      roleInactiveRes.body.error?.code === 'ACCOUNT_INACTIVE',
      'Role assignment to inactive account rejected (400 ACCOUNT_INACTIVE)'
    );

    // 27. Transition inactive user back to active
    const reactivateRes = await makeRequest(
      'PATCH',
      `/api/v1/admin/hod/users/${createdTeacherId}/status`,
      hodToken,
      {
        status: 'active'
      }
    );
    assert(
      reactivateRes.status === 200 && reactivateRes.body.user?.status === 'active',
      'HOD transitions user status from inactive back to active (200 OK)'
    );

    // 28. HOD self-deactivation strictly forbidden
    const selfDeactivateRes = await makeRequest(
      'PATCH',
      `/api/v1/admin/hod/users/${HOD_ID}/status`,
      hodToken,
      {
        status: 'inactive'
      }
    );
    assert(
      selfDeactivateRes.status === 403 &&
      selfDeactivateRes.body.error?.code === 'FORBIDDEN_SELF_MODIFICATION',
      'HOD self-deactivation strictly forbidden (403 FORBIDDEN_SELF_MODIFICATION)'
    );

    // 29. Status transition on non-existent user returns 404
    const nonExistentStatusRes = await makeRequest(
      'PATCH',
      '/api/v1/admin/hod/users/00000000-0000-0000-0000-000000000999/status',
      hodToken,
      {
        status: 'inactive'
      }
    );
    assert(
      nonExistentStatusRes.status === 404 &&
      nonExistentStatusRes.body.error?.code === 'USER_NOT_FOUND',
      'Status change for non-existent user rejected (404 USER_NOT_FOUND)'
    );

    // 30. Invalid status value rejected
    const invalidStatusRes = await makeRequest(
      'PATCH',
      `/api/v1/admin/hod/users/${createdTeacherId}/status`,
      hodToken,
      {
        status: 'invalid_status'
      }
    );
    assert(
      invalidStatusRes.status === 400 &&
      invalidStatusRes.body.error?.code === 'VALIDATION_ERROR',
      'Invalid account status value rejected by schema validation (400 VALIDATION_ERROR)'
    );

    console.log('\n--- SECTION 8: Audit Trail Integrity & Actor Attribution ---');

    // 31. Audit events recorded with authenticated HOD attribution
    const auditRes = await makeRequest('GET', '/api/v1/admin/hod/audit', hodToken);
    assert(
      auditRes.status === 200 && Array.isArray(auditRes.body.events),
      'GET /audit returns list of recorded audit events (200 OK)'
    );

    const userInviteEvent = auditRes.body.events.find(
      (e: any) => e.action === 'INVITE_USER_WITH_ROLE' && e.resource_id === createdTeacherId
    );
    assert(
      userInviteEvent !== undefined && userInviteEvent.actor_id === HOD_ID,
      'INVITE_USER_WITH_ROLE audit event accurately records authenticated HOD actor attribution'
    );

    const roleAssignEvent = auditRes.body.events.find(
      (e: any) => e.action === 'ASSIGN_USER_ROLE' && e.actor_id === HOD_ID
    );
    assert(
      roleAssignEvent !== undefined && roleAssignEvent.actor_id === HOD_ID,
      'ASSIGN_USER_ROLE audit event accurately records authenticated HOD actor attribution'
    );

    const statusUpdateEvent = auditRes.body.events.find(
      (e: any) => e.action === 'UPDATE_USER_STATUS' && e.resource_id === createdTeacherId && e.after?.status === 'inactive'
    );
    assert(
      statusUpdateEvent !== undefined &&
      statusUpdateEvent.actor_id === HOD_ID &&
      statusUpdateEvent.before?.status === 'active' &&
      statusUpdateEvent.after?.status === 'inactive',
      'UPDATE_USER_STATUS audit event accurately captures before/after state diff and actor attribution'
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
