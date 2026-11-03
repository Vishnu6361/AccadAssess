/**
 * ==============================================================================
 * ACADASSESS: DRAFT STAGING PROVISIONING & E2E EXECUTION SCRIPT
 * ==============================================================================
 * 
 * REVIEW DRAFT ONLY - DO NOT EXECUTE WITHOUT EXPLICIT ADMINISTRATOR APPROVAL.
 * 
 * Target Environment: Staging ONLY (project ref: gemuhhrsciilclbtzkcx)
 * Prohibited: Production (project ref: rdfloxppwlbocxplbixu)
 * 
 * Safety Guardrails:
 * 1. Requires explicit command-line argument: --execute-staging-provisioning.
 * 2. Defaults to read-only dry-run safety review if flag is omitted.
 * 3. Does NOT execute when imported by other modules.
 * 4. Maintains crash-safe atomic journal for every provisioning step.
 * 5. Refuses to touch any historical test identity.
 * 6. Preserves audit attribution permanently (never deletes profile with audit records).
 * ==============================================================================
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
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

export interface ExecutionOptions {
  executeRemote?: boolean;
  journalDir?: string;
  clientOverride?: SupabaseClient;
}

export interface RecoveryOptions {
  isExplicitExecute?: boolean;
}

/**
 * Asserts that remote execution is explicitly authorized and that the target host matches staging exactly.
 */
export function assertMutationBoundary(isExplicitExecute: boolean, targetHost?: string) {
  if (!isExplicitExecute) {
    throw new Error('[CRITICAL MUTATION BOUNDARY] Remote execution flag is false; aborting prior to privileged remote mutation.');
  }
  if (targetHost && targetHost !== STAGING_HOST) {
    throw new Error(`[CRITICAL MUTATION BOUNDARY] Target host mismatch: expected exact "${STAGING_HOST}", got "${targetHost}"`);
  }
}

/**
 * Idempotent recovery routine: Reads a journal and deactivates/purges only run-owned resources.
 */
export async function executeRecovery(
  journal: ProvisioningJournal,
  serviceClient: SupabaseClient,
  journalManager?: ProvisioningJournalManager,
  options: RecoveryOptions = {}
): Promise<{ success: boolean; unresolved: string[]; dryRun?: boolean }> {
  validateJournalIsolation(journal);
  if (journal.target_host !== STAGING_HOST) {
    throw new Error(`[FATAL SECURITY VIOLATION] Recovery aborted: Target host mismatch: expected exact "${STAGING_HOST}", got "${journal.target_host}"`);
  }

  const isExplicitExecute = options.isExplicitExecute ?? false;
  if (!isExplicitExecute) {
    console.log(`[DRY-RUN] executeRecovery invoked without explicit execution flag. Zero remote operations performed.`);
    return { success: true, unresolved: [], dryRun: true };
  }

  console.log(`\n--- EXECUTING AUTHORIZED RECOVERY FOR RUN ${journal.run_id} ---`);
  const unresolved: string[] = [];

  // 0. Crash Reconciliation: Check for unpersisted Auth user created before crash
  if (!journal.entities.auth_user_id) {
    const targetEmail = `staging.hod.${journal.run_id}@smartfa.edu`.toLowerCase();
    console.log(`[RECOVERY RECONCILIATION] Checking for unpersisted Auth user with email: ${targetEmail}`);
    try {
      assertMutationBoundary(isExplicitExecute, journal.target_host);
      const { data, error } = await serviceClient.auth.admin.listUsers();
      if (error) {
        throw new Error(`Failed listing users during reconciliation: ${error.message}`);
      }
      const matchingUsers = (data?.users || []).filter(
        (u: any) => u.email?.toLowerCase() === targetEmail
      );

      if (matchingUsers.length === 0) {
        console.log(`[RECOVERY RECONCILIATION] Zero unpersisted Auth users found matching ${targetEmail}. Safe to proceed.`);
        journalManager?.recordCleanupAction('reconcile_auth_user', 'none', 'auth.users', 'success');
      } else if (matchingUsers.length === 1) {
        const candidateUser = matchingUsers[0];
        if (PROTECTED_HISTORICAL_IDS.includes(candidateUser.id)) {
          throw new Error(`[CRITICAL SECURITY VIOLATION] Candidate user matches historical protected ID: ${candidateUser.id}`);
        }
        console.log(`[RECOVERY RECONCILIATION] Exactly 1 unpersisted Auth user found: ${candidateUser.id}. Adopting into recovery.`);
        journal.entities.auth_user_id = candidateUser.id;
        journal.entities.auth_email = targetEmail;
        journalManager?.recordAuthUserCreated(candidateUser.id, targetEmail);
      } else {
        // Ambiguous multiple matches: DO NOT GUESS!
        const errMsg = `[CRITICAL RECOVERY AMBIGUITY] Found ${matchingUsers.length} users matching ${targetEmail}. Automated cleanup refused for safety.`;
        unresolved.push(errMsg);
        journalManager?.recordCleanupAction('reconcile_auth_user', targetEmail, 'auth.users', 'failed', errMsg);
      }
    } catch (err: any) {
      const errMsg = `Auth user reconciliation failed: ${err.message}`;
      unresolved.push(errMsg);
      journalManager?.recordCleanupAction('reconcile_auth_user', targetEmail, 'auth.users', 'failed', err.message);
    }
  }

  // 0b. Profile reconciliation: If profile_id is null but auth_user_id exists, adopt auth_user_id
  if (!journal.entities.profile_id && journal.entities.auth_user_id) {
    journal.entities.profile_id = journal.entities.auth_user_id;
  }

  // 1. Purge transient test academic entities (bottom-up reverse dependency order)
  const entityCleanupOrder: (keyof typeof journal.entities)[] = [
    'class_subjects',
    'subjects',
    'classes',
    'academic_terms',
    'specializations',
    'programmes'
  ];

  for (const entityKey of entityCleanupOrder) {
    const ids = journal.entities[entityKey];
    if (Array.isArray(ids) && ids.length > 0) {
      assertMutationBoundary(isExplicitExecute, journal.target_host);
      try {
        const { error } = await serviceClient.from(entityKey).delete().in('id', ids);
        if (error) {
          throw error;
        }
        for (const id of ids) {
          journalManager?.recordCleanupAction('delete', id, entityKey, 'success');
        }
      } catch (err: any) {
        const msg = `Failed deleting ${entityKey}: ${err.message}`;
        unresolved.push(msg);
        for (const id of ids) {
          journalManager?.recordCleanupAction('delete', id, entityKey, 'failed', err.message);
        }
      }
    }
  }

  // 2. Deactivate test roles (active = false)
  // 2a. By explicit role IDs recorded in journal
  if (journal.entities.role_ids.length > 0) {
    assertMutationBoundary(isExplicitExecute, journal.target_host);
    for (const roleId of journal.entities.role_ids) {
      try {
        const { error } = await serviceClient
          .from('user_roles')
          .update({ active: false })
          .eq('id', roleId);
        if (error) throw error;
        journalManager?.recordCleanupAction('deactivate_role', roleId, 'user_roles', 'success');
      } catch (err: any) {
        const msg = `Failed deactivating role ${roleId}: ${err.message}`;
        unresolved.push(msg);
        journalManager?.recordCleanupAction('deactivate_role', roleId, 'user_roles', 'failed', err.message);
      }
    }
  }

  // 2b. Fallback: Deactivate all roles for auth_user_id in case crash occurred before recordRoleAssigned
  if (journal.entities.auth_user_id) {
    assertMutationBoundary(isExplicitExecute, journal.target_host);
    try {
      const { error } = await serviceClient
        .from('user_roles')
        .update({ active: false })
        .eq('user_id', journal.entities.auth_user_id);
      if (error) throw error;
      journalManager?.recordCleanupAction('deactivate_roles_by_user_id', journal.entities.auth_user_id, 'user_roles', 'success');
    } catch (err: any) {
      const msg = `Failed fallback deactivating roles for user ${journal.entities.auth_user_id}: ${err.message}`;
      unresolved.push(msg);
      journalManager?.recordCleanupAction('deactivate_roles_by_user_id', journal.entities.auth_user_id, 'user_roles', 'failed', err.message);
    }
  }

  // 3. Deactivate profile (status = 'inactive')
  // CRITICAL INVARIANT: We NEVER delete the profile if audit events exist,
  // because audit_events.actor_id ON DELETE SET NULL would wipe audit attribution!
  if (journal.entities.profile_id) {
    assertMutationBoundary(isExplicitExecute, journal.target_host);
    const profileId = journal.entities.profile_id;
    try {
      const { error } = await serviceClient
        .from('profiles')
        .update({ status: 'inactive' })
        .eq('id', profileId);
      if (error) throw error;
      journalManager?.recordCleanupAction('deactivate_profile', profileId, 'profiles', 'success');
    } catch (err: any) {
      const msg = `Failed deactivating profile ${profileId}: ${err.message}`;
      unresolved.push(msg);
      journalManager?.recordCleanupAction('deactivate_profile', profileId, 'profiles', 'failed', err.message);
    }
  }

  // 4. Ban test Auth user account in Supabase Auth to block authentication & refresh
  if (journal.entities.auth_user_id) {
    assertMutationBoundary(isExplicitExecute, journal.target_host);
    const authUserId = journal.entities.auth_user_id;
    try {
      const { error } = await serviceClient.auth.admin.updateUserById(authUserId, {
        ban_duration: '876000h' // 100 years
      });
      if (error) throw error;
      journalManager?.recordCleanupAction('ban_auth_user', authUserId, 'auth.users', 'success');
    } catch (err: any) {
      const msg = `Failed banning auth user ${authUserId}: ${err.message}`;
      unresolved.push(msg);
      journalManager?.recordCleanupAction('ban_auth_user', authUserId, 'auth.users', 'failed', err.message);
    }
  }

  journalManager?.recordCleanupCompleted();

  return {
    success: unresolved.length === 0,
    unresolved
  };
}

/**
 * Main execution controller for staged provisioning and verification.
 */
export async function runStagedProvisioning(options: ExecutionOptions = {}) {
  const args = process.argv.slice(2);
  const isExplicitExecute = options.executeRemote ?? args.includes('--execute-staging-provisioning');

  if (!isExplicitExecute) {
    console.log('================================================================');
    console.log(' ACADASSESS: STAGING PROVISIONING SCRIPT - DRY-RUN SAFETY REVIEW');
    console.log('================================================================');
    console.log('[DRY-RUN] No remote writes were executed.');
    console.log('[INFO] To execute, explicit administrator approval and --execute-staging-provisioning flag are required.');
    return { executed: false, reason: 'DRY_RUN_DEFAULT' };
  }

  // 1. Resolve and Validate Staging Environment
  const stagingEnvPath = path.resolve(process.cwd(), '.env.staging');
  if (!fs.existsSync(stagingEnvPath)) {
    throw new Error('[FATAL] .env.staging file not found.');
  }

  const parsedEnv = dotenv.parse(fs.readFileSync(stagingEnvPath, 'utf8'));
  const SUPABASE_URL = parsedEnv.SUPABASE_URL || parsedEnv.VITE_SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = parsedEnv.SUPABASE_SERVICE_ROLE_KEY;
  const SUPABASE_PUBLISHABLE_KEY = parsedEnv.VITE_SUPABASE_PUBLISHABLE_KEY;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_PUBLISHABLE_KEY) {
    throw new Error('[FATAL] Missing required Supabase credentials in .env.staging.');
  }

  const url = new URL(SUPABASE_URL);
  if (url.protocol !== 'https:') {
    throw new Error(`[FATAL SECURITY VIOLATION] Protocol must be https:, got "${url.protocol}"`);
  }
  if (url.hostname !== STAGING_HOST) {
    throw new Error(`[FATAL SECURITY VIOLATION] Hostname mismatch: expected exact "${STAGING_HOST}", got "${url.hostname}"`);
  }

  // 2. Initialize Run Manifest and Crash-Safe Journal
  const RUN_ID = crypto.randomUUID().slice(0, 8);
  const CORRELATION_ID = crypto.randomUUID();
  const journalDir = options.journalDir || path.resolve(process.cwd(), 'tests/security/journals');

  const journalManager = new ProvisioningJournalManager(journalDir, RUN_ID, CORRELATION_ID);
  console.log(`[JOURNAL] Initialized crash-safe journal: ${journalManager.getFilePath()}`);

  const serviceClient = options.clientOverride || createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const testEmail = `staging.hod.${RUN_ID}@smartfa.edu`;
  const testPassword = `StgPass!_${crypto.randomBytes(16).toString('base64url')}`;

  let authUserId: string | null = null;
  let profileId: string | null = null;
  let roleId: string | null = null;
  let accessToken: string | null = null;

  try {
    // -------------------------------------------------------------------------
    // STAGE 1: Provision Isolated Staging Test HOD
    // -------------------------------------------------------------------------
    console.log(`\n--- STAGE 1: Provisioning Test HOD via Admin API ---`);

    // Explicit check at the immediate mutation boundary
    assertMutationBoundary(isExplicitExecute, STAGING_HOST);

    // 1a. Auth User Creation
    const { data: authData, error: authErr } = await serviceClient.auth.admin.createUser({
      email: testEmail,
      password: testPassword,
      email_confirm: true,
      user_metadata: { full_name: `Staging Test HOD (${RUN_ID})` }
    });
    if (authErr || !authData.user) {
      throw new Error(`Failed creating Auth user: ${authErr?.message}`);
    }
    authUserId = authData.user.id;
    journalManager.recordAuthUserCreated(authUserId, testEmail);

    // 1b. Profile Creation
    assertMutationBoundary(isExplicitExecute, STAGING_HOST);
    const { error: profErr } = await serviceClient.from('profiles').insert({
      id: authUserId,
      full_name: `Staging Test HOD (${RUN_ID})`,
      email: testEmail,
      status: 'active'
    });
    if (profErr) {
      throw new Error(`Failed creating profile: ${profErr.message}`);
    }
    profileId = authUserId;
    journalManager.recordProfileCreated(profileId);

    // 1c. Role Assignment (Global HOD)
    assertMutationBoundary(isExplicitExecute, STAGING_HOST);
    roleId = crypto.randomUUID();
    const { error: roleErr } = await serviceClient.from('user_roles').insert({
      id: roleId,
      user_id: authUserId,
      role: 'hod',
      scope_id: null,
      active: true,
      assigned_by: null
    });
    if (roleErr) {
      throw new Error(`Failed assigning HOD role: ${roleErr.message}`);
    }
    journalManager.recordRoleAssigned(roleId);

    // -------------------------------------------------------------------------
    // STAGE 2: Verification of Client Login & Session Lifecycle
    // -------------------------------------------------------------------------
    console.log(`\n--- STAGE 2: Authenticated Verification ---`);

    const anonClient = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    const { data: loginData, error: loginErr } = await anonClient.auth.signInWithPassword({
      email: testEmail,
      password: testPassword
    });
    if (loginErr || !loginData.session) {
      throw new Error(`Client login failed: ${loginErr?.message}`);
    }
    accessToken = loginData.session.access_token;

    // Verify session token against Supabase Auth
    const { data: authUserCheck, error: authUserErr } = await anonClient.auth.getUser(accessToken);
    if (authUserErr || !authUserCheck.user) {
      throw new Error(`Token verification failed: ${authUserErr?.message}`);
    }

    journalManager.recordVerificationCompleted();

    // -------------------------------------------------------------------------
    // STAGE 3: Session Revocation Verification
    // -------------------------------------------------------------------------
    console.log(`\n--- STAGE 3: Session Revocation ---`);

    // Global session revocation via user's JWT
    if (accessToken) {
      const { error: signOutErr } = await serviceClient.auth.admin.signOut(accessToken, 'global');
      if (signOutErr) {
        console.warn(`  [WARN] Admin signOut returned: ${signOutErr.message}`);
      }
    }

    return {
      executed: true,
      runId: RUN_ID,
      email: testEmail,
      authUserId
    };

  } finally {
    // -------------------------------------------------------------------------
    // STAGE 4: Guaranteed Isolated Cleanup
    // -------------------------------------------------------------------------
    const recoveryResult = await executeRecovery(journalManager.getJournal(), serviceClient, journalManager, { isExplicitExecute });
    if (!recoveryResult.success) {
      console.error('[CRITICAL] Unresolved cleanup actions remaining:', recoveryResult.unresolved);
    }
  }
}

// Direct CLI invocation guard: only runs when executed directly, not when imported
const isDirectExecution = process.argv[1] && (
  process.argv[1].endsWith('draft_phase4_3_staging_provisioning.ts') ||
  process.argv[1].endsWith('draft_phase4_3_staging_provisioning.js')
);

if (isDirectExecution) {
  runStagedProvisioning().catch(err => {
    console.error('\n[FATAL STAGING PROVISIONING ERROR]:', err);
    process.exit(1);
  });
}

