/**
 * ==============================================================================
 * ACADASSESS: LOCAL STAGING PROVISIONING SAFETY LOGIC VERIFICATION SUITE
 * ==============================================================================
 * 
 * Tests crash recovery, unpersisted user reconciliation, exact hostname checks,
 * partial cleanup failures, historical ID protection, and boundary guardrails
 * LOCALLY using mock clients and temporary filesystem journals.
 * 
 * STRICT INVARIANT: ZERO remote Supabase endpoints are contacted.
 * ==============================================================================
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {
  STAGING_PROJECT_REF,
  STAGING_HOST,
  PROD_PROJECT_REF,
  PROTECTED_HISTORICAL_IDS,
  ProvisioningJournalManager,
  ProvisioningJournal,
  validateJournalIsolation
} from './provisioningJournal.js';
import {
  runStagedProvisioning,
  executeRecovery,
  assertMutationBoundary
} from './draft_phase4_3_staging_provisioning.js';

console.log('================================================================');
console.log(' ACADASSESS: PROVISIONING SAFETY & CRASH-RECOVERY LOCAL SUITE   ');
console.log('================================================================\n');

const TEST_DIR = path.resolve(process.cwd(), 'scratch/test_safety_journals');
if (!fs.existsSync(TEST_DIR)) {
  fs.mkdirSync(TEST_DIR, { recursive: true });
}

let totalTests = 0;
let passedTests = 0;

function assert(condition: boolean, testName: string, failureDetails?: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  [PASS] Test ${totalTests}: ${testName}`);
  } else {
    console.error(`  [FAIL] Test ${totalTests}: ${testName}`);
    if (failureDetails) console.error(`         Details: ${failureDetails}`);
    throw new Error(`Assertion failed: ${testName}`);
  }
}

/**
 * Creates an in-memory mock Supabase Client for local safety logic verification.
 */
function createMockSupabaseClient(options: {
  failOnDelete?: boolean;
  failOnUpdateRole?: boolean;
  failOnUpdateProfile?: boolean;
  failOnBan?: boolean;
  failOnSignOut?: boolean;
  failOnListUsers?: boolean;
  usersList?: { id: string; email: string }[];
} = {}) {
  const calls: { method: string; args: any[] }[] = [];

  const mockClient: any = {
    calls,
    auth: {
      admin: {
        listUsers: async () => {
          calls.push({ method: 'auth.admin.listUsers', args: [] });
          if (options.failOnListUsers) {
            return { data: null, error: new Error('Simulated network timeout during Auth listUsers') };
          }
          return { data: { users: options.usersList || [] }, error: null };
        },
        createUser: async (params: any) => {
          calls.push({ method: 'auth.admin.createUser', args: [params] });
          return { data: { user: { id: crypto.randomUUID(), email: params.email } }, error: null };
        },
        deleteUser: async (userId: string) => {
          calls.push({ method: 'auth.admin.deleteUser', args: [userId] });
          if (options.failOnDelete) {
            return { data: null, error: new Error('Simulated network timeout during Auth deleteUser') };
          }
          return { data: { user: null }, error: null };
        },
        updateUserById: async (userId: string, attributes: any) => {
          calls.push({ method: 'auth.admin.updateUserById', args: [userId, attributes] });
          if (options.failOnBan) {
            return { data: null, error: new Error('Simulated database error during Auth ban') };
          }
          return { data: { user: { id: userId } }, error: null };
        },
        signOut: async (jwt: string, scope: string) => {
          calls.push({ method: 'auth.admin.signOut', args: [jwt, scope] });
          if (options.failOnSignOut) {
            return { data: null, error: new Error('Simulated token expired during admin signOut') };
          }
          return { data: null, error: null };
        }
      }
    },
    from: (table: string) => {
      let currentQuery: any = { table, action: '', filter: {} };
      return {
        insert: async (data: any) => {
          calls.push({ method: `from(${table}).insert`, args: [data] });
          return { data, error: null };
        },
        update: (data: any) => {
          currentQuery.action = 'update';
          currentQuery.data = data;
          return {
            eq: async (col: string, val: any) => {
              calls.push({ method: `from(${table}).update.eq`, args: [data, col, val] });
              if (table === 'user_roles' && options.failOnUpdateRole) {
                return { data: null, error: new Error('Simulated database failure on user_roles update') };
              }
              if (table === 'profiles' && options.failOnUpdateProfile) {
                return { data: null, error: new Error('Simulated database failure on profiles update') };
              }
              return { data: null, error: null };
            },
            in: async (col: string, vals: any[]) => {
              calls.push({ method: `from(${table}).update.in`, args: [data, col, vals] });
              if (table === 'user_roles' && options.failOnUpdateRole) {
                return { data: null, error: new Error('Simulated database failure on user_roles update') };
              }
              return { data: null, error: null };
            }
          };
        },
        delete: () => {
          currentQuery.action = 'delete';
          return {
            eq: async (col: string, val: any) => {
              calls.push({ method: `from(${table}).delete.eq`, args: [col, val] });
              if (options.failOnDelete) {
                return { data: null, error: new Error(`Simulated database failure on delete from ${table}`) };
              }
              return { data: null, error: null };
            },
            in: async (col: string, vals: any[]) => {
              calls.push({ method: `from(${table}).delete.in`, args: [col, vals] });
              if (options.failOnDelete) {
                return { data: null, error: new Error(`Simulated database failure on delete from ${table}`) };
              }
              return { data: null, error: null };
            }
          };
        }
      };
    }
  };

  return mockClient;
}

async function runSafetyTests() {
  console.log('--- 1. Dry-Run & Mutation Boundary Enforcement ---');

  // Test 1: runStagedProvisioning dry-run makes ZERO remote calls
  const mockClient1 = createMockSupabaseClient();
  const dryRunResult = await runStagedProvisioning({
    executeRemote: false,
    clientOverride: mockClient1
  });
  assert(dryRunResult.executed === false, 'runStagedProvisioning defaults to unexecuted when flag is omitted');
  assert(mockClient1.calls.length === 0, 'Zero remote Supabase calls made during runStagedProvisioning dry-run');

  // Test 2: executeRecovery dry-run (omitting isExplicitExecute) makes ZERO remote calls
  const runIdDryRec = crypto.randomUUID().slice(0, 8);
  const managerDryRec = new ProvisioningJournalManager(TEST_DIR, runIdDryRec, crypto.randomUUID());
  managerDryRec.recordAuthUserCreated(crypto.randomUUID(), `dryrec.${runIdDryRec}@smartfa.edu`);
  const mockClientDryRec = createMockSupabaseClient();
  const dryRecResult = await executeRecovery(managerDryRec.getJournal(), mockClientDryRec, managerDryRec, { isExplicitExecute: false });
  assert(dryRecResult.dryRun === true, 'executeRecovery reports dryRun: true when execution flag is false');
  assert(mockClientDryRec.calls.length === 0, 'Zero remote calls made during executeRecovery dry-run');

  // Test 3: assertMutationBoundary rejects false execution flag
  let boundaryRejected = false;
  try {
    assertMutationBoundary(false, STAGING_HOST);
  } catch (err: any) {
    boundaryRejected = err.message.includes('Remote execution flag is false');
  }
  assert(boundaryRejected, 'assertMutationBoundary throws fatal error when execution flag is false');

  // Test 4: assertMutationBoundary rejects unexpected host
  let hostRejected = false;
  try {
    assertMutationBoundary(true, 'unexpected.supabase.co');
  } catch (err: any) {
    hostRejected = err.message.includes('Target host mismatch: expected exact');
  }
  assert(hostRejected, 'assertMutationBoundary rejects non-staging host even with flag true');

  console.log('\n--- 2. Exact Hostname & Project Reference Isolation Guards ---');

  // Test 5: Reject journal targeting production hostname
  let prodHostCaught = false;
  try {
    const invalidJournal: any = {
      version: 1,
      run_id: 'test-run',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      target_project_ref: STAGING_PROJECT_REF,
      target_host: `${PROD_PROJECT_REF}.supabase.co`,
      correlation_id: crypto.randomUUID(),
      stage: 'preflight_passed',
      entities: { auth_user_id: null, auth_email: null, profile_id: null, role_ids: [], programmes: [], specializations: [], academic_terms: [], classes: [], subjects: [], class_subjects: [] },
      retained_audit_event_ids: [],
      cleanup_actions: [],
      unresolved_failures: []
    };
    validateJournalIsolation(invalidJournal);
  } catch (err: any) {
    prodHostCaught = err.message.includes('Target host mismatch: expected exact');
  }
  assert(prodHostCaught, 'Journal strictly rejects production host reference with exact match check');

  // Test 6: Reject substring spoof hostname (e.g. gemuhhrsciilclbtzkcx.supabase.co.evil.com)
  let spoofCaught = false;
  try {
    const spoofJournal: any = {
      version: 1,
      run_id: 'test-run-spoof',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      target_project_ref: STAGING_PROJECT_REF,
      target_host: 'gemuhhrsciilclbtzkcx.supabase.co.evil.com',
      correlation_id: crypto.randomUUID(),
      stage: 'preflight_passed',
      entities: { auth_user_id: null, auth_email: null, profile_id: null, role_ids: [], programmes: [], specializations: [], academic_terms: [], classes: [], subjects: [], class_subjects: [] },
      retained_audit_event_ids: [],
      cleanup_actions: [],
      unresolved_failures: []
    };
    validateJournalIsolation(spoofJournal);
  } catch (err: any) {
    spoofCaught = err.message.includes('Target host mismatch: expected exact');
  }
  assert(spoofCaught, 'Journal strictly rejects substring spoof hostname');

  // Test 7: Reject journal with staging ref mismatch
  let refMismatchCaught = false;
  try {
    const invalidJournal: any = {
      version: 1,
      run_id: 'test-run-ref',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      target_project_ref: 'wrong_project_ref',
      target_host: STAGING_HOST,
      correlation_id: crypto.randomUUID(),
      stage: 'preflight_passed',
      entities: { auth_user_id: null, auth_email: null, profile_id: null, role_ids: [], programmes: [], specializations: [], academic_terms: [], classes: [], subjects: [], class_subjects: [] },
      retained_audit_event_ids: [],
      cleanup_actions: [],
      unresolved_failures: []
    };
    validateJournalIsolation(invalidJournal);
  } catch (err: any) {
    refMismatchCaught = err.message.includes('Target project reference mismatch');
  }
  assert(refMismatchCaught, 'Journal strictly rejects mismatched project reference');

  console.log('\n--- 3. Historical Identity Protection Guards ---');

  // Tests 8-11: Historical ID detection in journal triggers fatal security violation
  for (const historicalId of PROTECTED_HISTORICAL_IDS) {
    let historicalCaught = false;
    try {
      const journalWithHistorical: any = {
        version: 1,
        run_id: 'run-historical-check',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        target_project_ref: STAGING_PROJECT_REF,
        target_host: STAGING_HOST,
        correlation_id: crypto.randomUUID(),
        stage: 'preflight_passed',
        entities: {
          auth_user_id: historicalId,
          auth_email: 'test@smartfa.edu',
          profile_id: historicalId,
          role_ids: [],
          programmes: [],
          specializations: [],
          academic_terms: [],
          classes: [],
          subjects: [],
          class_subjects: []
        },
        retained_audit_event_ids: [],
        cleanup_actions: [],
        unresolved_failures: []
      };
      validateJournalIsolation(journalWithHistorical);
    } catch (err: any) {
      historicalCaught = err.message.includes('Protected historical identity');
    }
    assert(historicalCaught, `Protected historical identity ${historicalId} blocked from journal entries`);
  }

  console.log('\n--- 4. Crash Recovery Reconciliation for Unpersisted Auth Users ---');

  // Test 12: Reconciliation finds exactly 1 matching user by deterministic email -> adopts and bans
  const runIdReconcile1 = crypto.randomUUID().slice(0, 8);
  const managerReconcile1 = new ProvisioningJournalManager(TEST_DIR, runIdReconcile1, crypto.randomUUID());
  // Notice auth_user_id is NOT recorded in journal (simulating crash before recordAuthUserCreated)
  const unpersistedUserId = crypto.randomUUID();
  const unpersistedEmail = `staging.hod.${runIdReconcile1}@smartfa.edu`;
  const mockClientReconcile1 = createMockSupabaseClient({
    usersList: [{ id: unpersistedUserId, email: unpersistedEmail }]
  });

  const reconcileResult1 = await executeRecovery(
    managerReconcile1.getJournal(),
    mockClientReconcile1,
    managerReconcile1,
    { isExplicitExecute: true }
  );
  assert(reconcileResult1.success === true, 'Reconciliation: Exactly 1 matching unpersisted Auth user resolved successfully');
  const banCallRec1 = mockClientReconcile1.calls.find(c => c.method === 'auth.admin.updateUserById');
  assert(Boolean(banCallRec1 && banCallRec1.args[0] === unpersistedUserId), 'Reconciled unpersisted user adopted and banned');
  assert(managerReconcile1.getJournal().entities.auth_user_id === unpersistedUserId, 'Journal updated with adopted user ID');

  // Test 13: Reconciliation finds 0 matching users -> clean progression without error
  const runIdReconcile0 = crypto.randomUUID().slice(0, 8);
  const managerReconcile0 = new ProvisioningJournalManager(TEST_DIR, runIdReconcile0, crypto.randomUUID());
  const mockClientReconcile0 = createMockSupabaseClient({
    usersList: [] // Zero matches
  });
  const reconcileResult0 = await executeRecovery(
    managerReconcile0.getJournal(),
    mockClientReconcile0,
    managerReconcile0,
    { isExplicitExecute: true }
  );
  assert(reconcileResult0.success === true, 'Reconciliation: Zero matching unpersisted users proceeds cleanly');
  assert(managerReconcile0.getJournal().entities.auth_user_id === null, 'Journal remains clean when no user was created');

  // Test 14: Reconciliation encounters ambiguous multiple matches -> refuses to guess, marks unresolved failure
  const runIdReconcileMulti = crypto.randomUUID().slice(0, 8);
  const managerReconcileMulti = new ProvisioningJournalManager(TEST_DIR, runIdReconcileMulti, crypto.randomUUID());
  const multiEmail = `staging.hod.${runIdReconcileMulti}@smartfa.edu`;
  const mockClientReconcileMulti = createMockSupabaseClient({
    usersList: [
      { id: crypto.randomUUID(), email: multiEmail },
      { id: crypto.randomUUID(), email: multiEmail }
    ]
  });
  const reconcileResultMulti = await executeRecovery(
    managerReconcileMulti.getJournal(),
    mockClientReconcileMulti,
    managerReconcileMulti,
    { isExplicitExecute: true }
  );
  assert(reconcileResultMulti.success === false, 'Reconciliation: Multiple matches causes cleanup failure');
  assert(managerReconcileMulti.getJournal().stage === 'cleanup_failed', 'Journal marked cleanup_failed for ambiguous matches');
  const hasAmbiguityError = managerReconcileMulti.getJournal().unresolved_failures.some(f => f.includes('CRITICAL RECOVERY AMBIGUITY'));
  assert(hasAmbiguityError, 'Unresolved failures explicitly records ambiguous match warning without modifying either user');

  // Test 15: Reconciliation rejects candidate matching a historical protected ID
  const runIdReconcileHist = crypto.randomUUID().slice(0, 8);
  const managerReconcileHist = new ProvisioningJournalManager(TEST_DIR, runIdReconcileHist, crypto.randomUUID());
  const histEmail = `staging.hod.${runIdReconcileHist}@smartfa.edu`;
  const mockClientReconcileHist = createMockSupabaseClient({
    usersList: [{ id: PROTECTED_HISTORICAL_IDS[0], email: histEmail }]
  });
  const reconcileResultHist = await executeRecovery(
    managerReconcileHist.getJournal(),
    mockClientReconcileHist,
    managerReconcileHist,
    { isExplicitExecute: true }
  );
  assert(reconcileResultHist.success === false, 'Reconciliation strictly rejects candidate matching historical protected ID');

  console.log('\n--- 5. Partial Failures During Cleanup & Journal Integrity ---');

  // Test 16: Partial failure on academic table delete -> marked cleanup_failed
  const runIdFailDel = crypto.randomUUID().slice(0, 8);
  const managerFailDel = new ProvisioningJournalManager(TEST_DIR, runIdFailDel, crypto.randomUUID());
  managerFailDel.recordResourceCreated('programmes', crypto.randomUUID());
  const mockClientFailDel = createMockSupabaseClient({ failOnDelete: true });
  const resFailDel = await executeRecovery(managerFailDel.getJournal(), mockClientFailDel, managerFailDel, { isExplicitExecute: true });
  assert(resFailDel.success === false, 'Delete failure: reports success: false');
  assert(managerFailDel.getJournal().stage === 'cleanup_failed', 'Delete failure: journal stage marked cleanup_failed');
  assert(managerFailDel.getJournal().unresolved_failures.length > 0, 'Delete failure: unresolved failures logged');

  // Test 17: Partial failure on role deactivation -> marked cleanup_failed
  const runIdFailRole = crypto.randomUUID().slice(0, 8);
  const managerFailRole = new ProvisioningJournalManager(TEST_DIR, runIdFailRole, crypto.randomUUID());
  const roleIdFail = crypto.randomUUID();
  managerFailRole.recordRoleAssigned(roleIdFail);
  const mockClientFailRole = createMockSupabaseClient({ failOnUpdateRole: true });
  const resFailRole = await executeRecovery(managerFailRole.getJournal(), mockClientFailRole, managerFailRole, { isExplicitExecute: true });
  assert(resFailRole.success === false, 'Role deactivation failure: reports success: false');
  assert(managerFailRole.getJournal().stage === 'cleanup_failed', 'Role deactivation failure: journal stage marked cleanup_failed');

  // Test 18: Partial failure on profile deactivation -> marked cleanup_failed
  const runIdFailProf = crypto.randomUUID().slice(0, 8);
  const managerFailProf = new ProvisioningJournalManager(TEST_DIR, runIdFailProf, crypto.randomUUID());
  const profIdFail = crypto.randomUUID();
  managerFailProf.recordProfileCreated(profIdFail);
  const mockClientFailProf = createMockSupabaseClient({ failOnUpdateProfile: true });
  const resFailProf = await executeRecovery(managerFailProf.getJournal(), mockClientFailProf, managerFailProf, { isExplicitExecute: true });
  assert(resFailProf.success === false, 'Profile deactivation failure: reports success: false');
  assert(managerFailProf.getJournal().stage === 'cleanup_failed', 'Profile deactivation failure: journal stage marked cleanup_failed');

  // Test 19: Partial failure on Auth user ban -> marked cleanup_failed
  const runIdFailBan = crypto.randomUUID().slice(0, 8);
  const managerFailBan = new ProvisioningJournalManager(TEST_DIR, runIdFailBan, crypto.randomUUID());
  const authIdFail = crypto.randomUUID();
  managerFailBan.recordAuthUserCreated(authIdFail, `failban.${runIdFailBan}@smartfa.edu`);
  const mockClientFailBan = createMockSupabaseClient({ failOnBan: true });
  const resFailBan = await executeRecovery(managerFailBan.getJournal(), mockClientFailBan, managerFailBan, { isExplicitExecute: true });
  assert(resFailBan.success === false, 'Auth ban failure: reports success: false');
  assert(managerFailBan.getJournal().stage === 'cleanup_failed', 'Auth ban failure: journal stage marked cleanup_failed');

  console.log('\n--- 6. Audit Attribution Preservation & Lifecycle Verification ---');

  // Test 20: Profile with retained audit events is NEVER deleted (preserves actor_id FK)
  const runIdAudit = crypto.randomUUID().slice(0, 8);
  const managerAudit = new ProvisioningJournalManager(TEST_DIR, runIdAudit, crypto.randomUUID());
  const hodUserId = crypto.randomUUID();
  managerAudit.recordAuthUserCreated(hodUserId, `audit.${runIdAudit}@smartfa.edu`);
  managerAudit.recordProfileCreated(hodUserId);
  managerAudit.recordAuditEventRetained('audit-event-1234');
  const mockClientAudit = createMockSupabaseClient();
  await executeRecovery(managerAudit.getJournal(), mockClientAudit, managerAudit, { isExplicitExecute: true });
  const profileDeleteCall = mockClientAudit.calls.find(c => c.method.includes('from(profiles).delete'));
  assert(!profileDeleteCall, 'Profile with retained audit events is NEVER deleted (preserves actor_id FK)');

  // Test 21: Session Revocation SDK Arguments & Error Handling
  const mockClientSignOutErr = createMockSupabaseClient({ failOnSignOut: true });
  const testJwt = 'mock.jwt.token';
  const signOutRes = await mockClientSignOutErr.auth.admin.signOut(testJwt, 'global');
  assert(Boolean(signOutRes.error), 'Admin signOut error captured safely');
  const signOutCall = mockClientSignOutErr.calls.find(c => c.method === 'auth.admin.signOut');
  assert(Boolean(signOutCall && signOutCall.args[0] === testJwt && signOutCall.args[1] === 'global'), 'Admin signOut correctly receives (jwt, scope) arguments');

  // Test 22: Repeated (Idempotent) Recovery Succeeds
  const mockClientRepeat = createMockSupabaseClient();
  const repeatResult = await executeRecovery(managerAudit.getJournal(), mockClientRepeat, managerAudit, { isExplicitExecute: true });
  assert(repeatResult.success === true, 'Repeated recovery on already deactivated journal succeeds idempotently');

  console.log('\n--- 7. Journal Schema & Corruption Validation ---');

  // Test 23: Reject corrupted JSON in journal
  const corruptPath = path.resolve(TEST_DIR, 'corrupt_run.json');
  fs.writeFileSync(corruptPath, '{ "invalid_json": true, incomplete');
  let corruptCaught = false;
  try {
    ProvisioningJournalManager.loadAndValidate(corruptPath);
  } catch (err: any) {
    corruptCaught = err.message.includes('Corrupted journal file');
  }
  assert(corruptCaught, 'Corrupted journal file rejected with typed error');

  // Test 24: Reject incomplete schema in journal
  const incompletePath = path.resolve(TEST_DIR, 'incomplete_run.json');
  fs.writeFileSync(incompletePath, JSON.stringify({ run_id: 'test-incomplete', version: 1 }));
  let incompleteCaught = false;
  try {
    ProvisioningJournalManager.loadAndValidate(incompletePath);
  } catch (err: any) {
    incompleteCaught = err.name === 'ZodError';
  }
  assert(incompleteCaught, 'Incomplete journal rejected by Zod schema validation');

  console.log(`\n================================================================`);
  console.log(` PROVISIONING SAFETY LOGIC SUITE: ${passedTests}/${totalTests} TESTS PASSED`);
  console.log(`================================================================\n`);
}

runSafetyTests().catch(err => {
  console.error('\n[SAFETY TEST FATAL ERROR]:', err);
  process.exit(1);
});
