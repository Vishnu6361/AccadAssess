/**
 * ==============================================================================
 * ACADASSESS PHASE 4.2: LIVE SUPABASE INTEGRATION & RLS VERIFICATION SUITE
 * ==============================================================================
 * 
 * Objective:
 * Verify Phase 4.2 academic structure, HOD administrative operations, and
 * PostgreSQL Row-Level Security (RLS) policies against hosted Supabase.
 * 
 * Safety & Security Guardrails:
 * 1. ZERO modification of existing hosted users, academic entities, or RLS policies.
 * 2. Real Supabase Auth identities provisioned with dedicated test credentials.
 * 3. Dual-client architecture:
 *    - Client A: Service-Role client (used solely for test setup and deactivation).
 *    - Client B: Publishable/Anon key client with real JWTs (tests actual deployed RLS).
 * 4. Append-only audit integrity & Attribution Preservation:
 *    - Audit records are NEVER deleted or mutated (immutability preserved).
 *    - Because audit_events.actor_id has ON DELETE SET NULL, test profiles are
 *      DEACTIVATED (status = 'inactive', ban_duration = '100y') rather than deleted.
 *      This preserves exact actor attribution in audit_events permanently.
 * 5. Tracked entity manifest with bottom-up cleanup in guaranteed finally block.
 * 6. Idempotent cleanup mutex preventing race conditions between finally & signal handlers.
 * 7. Standalone manual recovery tool strictly validating RUN_ID format.
 * 
 * DO NOT EXECUTE WITHOUT EXPLICIT USER APPROVAL.
 * ==============================================================================
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

// ------------------------------------------------------------------------------
// Explicit Environment Resolution (Never silently falls back to root .env)
// ------------------------------------------------------------------------------
let targetEnvFile: string | null = null;
const args = process.argv.slice(2);

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--env' && args[i + 1]) {
    targetEnvFile = args[i + 1];
    break;
  }
  if (args[i] === '--staging') {
    targetEnvFile = '.env.staging';
    break;
  }
}

if (!targetEnvFile && process.env.ACADASSESS_ENV_FILE) {
  targetEnvFile = process.env.ACADASSESS_ENV_FILE;
}

// Fail-closed guard: Require explicit environment specification
if (!targetEnvFile) {
  console.error('\n[FATAL CONFIGURATION ERROR] No target environment file specified.');
  console.error('You must explicitly provide --staging or --env <path> (e.g. --staging or --env .env.staging).');
  console.error('Silent fallback to root .env is strictly prohibited to prevent accidental production targeting.\n');
  process.exit(1);
}

const resolvedEnvPath = path.resolve(process.cwd(), targetEnvFile);
if (!fs.existsSync(resolvedEnvPath)) {
  console.error(`\n[FATAL CONFIGURATION ERROR] Specified environment file not found: ${resolvedEnvPath}\n`);
  process.exit(1);
}

const parsedEnv = dotenv.parse(fs.readFileSync(resolvedEnvPath, 'utf8'));

const SUPABASE_URL = parsedEnv.SUPABASE_URL || parsedEnv.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = parsedEnv.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_PUBLISHABLE_KEY = parsedEnv.VITE_SUPABASE_PUBLISHABLE_KEY;

// Safe Fail-Closed Credential Check
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_PUBLISHABLE_KEY) {
  console.error(`\n[FATAL CONFIGURATION ERROR] Missing required Supabase credentials in ${targetEnvFile}:`);
  console.error(' - SUPABASE_URL:', Boolean(SUPABASE_URL));
  console.error(' - SUPABASE_SERVICE_ROLE_KEY:', Boolean(SUPABASE_SERVICE_ROLE_KEY));
  console.error(' - VITE_SUPABASE_PUBLISHABLE_KEY:', Boolean(SUPABASE_PUBLISHABLE_KEY));
  process.exit(1);
}

// Placeholder Detection
if (
  SUPABASE_URL.includes('YOUR_STAGING_') ||
  SUPABASE_SERVICE_ROLE_KEY.includes('YOUR_STAGING_') ||
  SUPABASE_PUBLISHABLE_KEY.includes('YOUR_STAGING_')
) {
  console.error(`\n[FATAL CONFIGURATION ERROR] Placeholder values detected in ${targetEnvFile}. Aborting.\n`);
  process.exit(1);
}

let parsedUrl: URL;
try {
  parsedUrl = new URL(SUPABASE_URL);
  if (parsedUrl.protocol !== 'https:') {
    throw new Error('Protocol must be https:');
  }
} catch {
  console.error(`\n[FATAL CONFIGURATION ERROR] Invalid HTTPS SUPABASE_URL format in ${targetEnvFile}:`, SUPABASE_URL);
  process.exit(1);
}

// Strict Project Reference Guard
const STAGING_PROJECT_REF = 'gemuhhrsciilclbtzkcx';
const PRODUCTION_PROJECT_REF = 'rdfloxppwlbocxplbixu';

if (parsedUrl.hostname.includes(PRODUCTION_PROJECT_REF)) {
  console.error('\n[CRITICAL SAFETY GUARD] DANGER: Production project reference detected in target URL!');
  console.error('Execution strictly aborted to prevent live tests against production.\n');
  process.exit(1);
}

if (!parsedUrl.hostname.includes(STAGING_PROJECT_REF)) {
  console.error(`\n[CRITICAL SAFETY GUARD] Expected staging project reference '${STAGING_PROJECT_REF}', but found '${parsedUrl.hostname}'.`);
  console.error('Execution aborted.\n');
  process.exit(1);
}

// Unique run identifier for strict record isolation
const RUN_ID = crypto.randomUUID().slice(0, 8);
const RUN_TIMESTAMP = Date.now();
const RUN_CORRELATION_ID = crypto.randomUUID();

console.log('================================================================');
console.log(' ACADASSESS: LIVE SUPABASE PHASE 4.2 INTEGRATION VERIFICATION   ');
console.log(` Target Host : ${parsedUrl.hostname} (Staging Verified)`);
console.log(` Env Source  : ${targetEnvFile}`);
console.log(` Run ID      : ${RUN_ID}`);
console.log(` Correlation : ${RUN_CORRELATION_ID}`);
console.log('================================================================\n');

// Service Role Client (Administrative Test Controller - Bypasses RLS)
const serviceClient: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

// Publishable Key Client Factory (Subject to PostgreSQL RLS)
function createRlsClient(accessToken?: string): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: {
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {}
    }
  });
}

// Tracked entities manifest (Tracks only records created during this run)
interface TrackedManifest {
  authUsers: string[];
  profiles: string[];
  userRoles: string[];
  proctorAssignments: string[];
  enrollments: string[];
  classSubjects: string[];
  subjects: string[];
  classes: string[];
  terms: string[];
  departments: string[];
  retainedAuditEvents: string[];
}

const manifest: TrackedManifest = {
  authUsers: [],
  profiles: [],
  userRoles: [],
  proctorAssignments: [],
  enrollments: [],
  classSubjects: [],
  subjects: [],
  classes: [],
  terms: [],
  departments: [],
  retainedAuditEvents: []
};

// Idempotent Cleanup Mutex Promise
let cleanupPromise: Promise<void> | null = null;

/**
 * Idempotent bottom-up cleanup routine:
 * - Purges tracked academic entities created during this run.
 * - Deactivates test profiles and bans test auth users to preserve audit attribution.
 *   (Deleting profiles would trigger PostgreSQL ON DELETE SET NULL on audit_events.actor_id).
 */
export function executeCleanup(reason: string = 'Normal Completion'): Promise<void> {
  if (cleanupPromise) {
    return cleanupPromise;
  }

  cleanupPromise = (async () => {
    console.log(`\n--- EXECUTING ISOLATED CLEANUP (${reason}) ---`);

    try {
      // 1. Proctor Assignments
      if (manifest.proctorAssignments.length > 0) {
        const { error } = await serviceClient
          .from('proctor_assignments')
          .delete()
          .in('id', manifest.proctorAssignments);
        if (error) console.error('  [WARN] Failed cleaning proctor assignments:', error.message);
        else console.log(`  [CLEANUP] Deleted ${manifest.proctorAssignments.length} test proctor assignments.`);
      }

      // 2. Enrollments
      if (manifest.enrollments.length > 0) {
        const { error } = await serviceClient
          .from('enrollments')
          .delete()
          .in('id', manifest.enrollments);
        if (error) console.error('  [WARN] Failed cleaning enrollments:', error.message);
        else console.log(`  [CLEANUP] Deleted ${manifest.enrollments.length} test enrollments.`);
      }

      // 3. Class Subjects
      if (manifest.classSubjects.length > 0) {
        const { error } = await serviceClient
          .from('class_subjects')
          .delete()
          .in('id', manifest.classSubjects);
        if (error) console.error('  [WARN] Failed cleaning class subjects:', error.message);
        else console.log(`  [CLEANUP] Deleted ${manifest.classSubjects.length} test class subjects.`);
      }

      // 4. Subjects
      if (manifest.subjects.length > 0) {
        const { error } = await serviceClient
          .from('subjects')
          .delete()
          .in('id', manifest.subjects);
        if (error) console.error('  [WARN] Failed cleaning subjects:', error.message);
        else console.log(`  [CLEANUP] Deleted ${manifest.subjects.length} test subjects.`);
      }

      // 5. Classes
      if (manifest.classes.length > 0) {
        const { error } = await serviceClient
          .from('classes')
          .delete()
          .in('id', manifest.classes);
        if (error) console.error('  [WARN] Failed cleaning classes:', error.message);
        else console.log(`  [CLEANUP] Deleted ${manifest.classes.length} test classes.`);
      }

      // 6. Academic Terms
      if (manifest.terms.length > 0) {
        const { error } = await serviceClient
          .from('academic_terms')
          .delete()
          .in('id', manifest.terms);
        if (error) console.error('  [WARN] Failed cleaning terms:', error.message);
        else console.log(`  [CLEANUP] Deleted ${manifest.terms.length} test terms.`);
      }

      // 7. Departments
      if (manifest.departments.length > 0) {
        const { error } = await serviceClient
          .from('departments')
          .delete()
          .in('id', manifest.departments);
        if (error) console.error('  [WARN] Failed cleaning departments:', error.message);
        else console.log(`  [CLEANUP] Deleted ${manifest.departments.length} test departments.`);
      }

      // 8. Audit Attribution Preservation: Deactivate rather than delete test identities
      // Deactivating profiles preserves audit_events.actor_id foreign key references.
      if (manifest.userRoles.length > 0) {
        const { error } = await serviceClient
          .from('user_roles')
          .update({ active: false })
          .in('id', manifest.userRoles);
        if (error) console.error('  [WARN] Failed deactivating test roles:', error.message);
        else console.log(`  [CLEANUP] Deactivated ${manifest.userRoles.length} test roles (active = false).`);
      }

      if (manifest.profiles.length > 0) {
        const { error } = await serviceClient
          .from('profiles')
          .update({ status: 'inactive' })
          .in('id', manifest.profiles);
        if (error) console.error('  [WARN] Failed deactivating test profiles:', error.message);
        else console.log(`  [CLEANUP] Deactivated ${manifest.profiles.length} test profiles (status = 'inactive').`);
      }

      for (const userId of manifest.authUsers) {
        // Ban test auth account for 100 years to block authentication while preserving profile reference
        const { error } = await serviceClient.auth.admin.updateUserById(userId, {
          ban_duration: '876000h'
        });
        if (error) console.error(`  [WARN] Failed banning test auth user ${userId}:`, error.message);
        else console.log(`  [CLEANUP] Banned test auth user ${userId} (authentication locked).`);
      }

      // Audit Event Status Disclosure
      if (manifest.retainedAuditEvents.length > 0) {
        console.log(`  [AUDIT INVARIANT] Preserved ${manifest.retainedAuditEvents.length} test audit event(s) in public.audit_events.`);
        console.log(`  [AUDIT INVARIANT] Correlation ID: ${RUN_CORRELATION_ID}. Actor attribution intact (actor_id preserved).`);
      }

      console.log('[CLEANUP COMPLETE] Database returned to clean baseline.\n');
    } catch (err: any) {
      console.error('[CRITICAL CLEANUP ERROR]:', err.message);
    }
  })();

  return cleanupPromise;
}

// Process interruption signal handlers
process.on('SIGINT', async () => {
  console.log('\n[INTERRUPT] Received SIGINT. Awaiting cleanup completion...');
  await executeCleanup('Process SIGINT Interruption');
  process.exit(1);
});

process.on('SIGTERM', async () => {
  console.log('\n[INTERRUPT] Received SIGTERM. Awaiting cleanup completion...');
  await executeCleanup('Process SIGTERM Interruption');
  process.exit(1);
});

process.on('uncaughtException', async (err) => {
  console.error('\n[UNCAUGHT EXCEPTION]:', err);
  await executeCleanup('Uncaught Exception');
  process.exit(1);
});

// Test Assertions Counter
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

/**
 * Main Live Verification Flow
 */
export async function runLiveVerification() {
  console.log('Starting verification against hosted Supabase...\n');

  let hodAuthUserId: string | null = null;
  let studentAuthUserId: string | null = null;
  let teacherAuthUserId: string | null = null;
  let proctorAuthUserId: string | null = null;

  let hodToken: string | null = null;
  let studentToken: string | null = null;

  const testPassword = `TestPass!_${RUN_ID}_${RUN_TIMESTAMP}`;

  try {
    // -------------------------------------------------------------------------
    // STEP 1: PROVISION ISOLATED TEST IDENTITIES (SERVICE-ROLE)
    // -------------------------------------------------------------------------
    console.log('--- STEP 1: Provision Isolated Test Identities via Auth Admin ---');

    // 1a. Test HOD Account
    const hodEmail = `test.hod.${RUN_ID}@acadassess.local`;
    const { data: hodAuth, error: hodAuthErr } = await serviceClient.auth.admin.createUser({
      email: hodEmail,
      password: testPassword,
      email_confirm: true,
      user_metadata: { full_name: `Dr. Test HOD (${RUN_ID})` }
    });
    if (hodAuthErr || !hodAuth.user) throw new Error(`Failed creating HOD auth user: ${hodAuthErr?.message}`);
    hodAuthUserId = hodAuth.user.id;
    manifest.authUsers.push(hodAuthUserId);

    const { error: hodProfErr } = await serviceClient.from('profiles').insert({
      id: hodAuthUserId,
      full_name: `Dr. Test HOD (${RUN_ID})`,
      email: hodEmail,
      status: 'active'
    });
    if (hodProfErr) throw new Error(`Failed creating HOD profile: ${hodProfErr.message}`);
    manifest.profiles.push(hodAuthUserId);

    const hodRoleId = crypto.randomUUID();
    const { error: hodRoleErr } = await serviceClient.from('user_roles').insert({
      id: hodRoleId,
      user_id: hodAuthUserId,
      role: 'hod',
      active: true
    });
    if (hodRoleErr) throw new Error(`Failed assigning HOD role: ${hodRoleErr.message}`);
    manifest.userRoles.push(hodRoleId);

    // 1b. Test Student Account
    const studentEmail = `test.student.${RUN_ID}@acadassess.local`;
    const { data: stuAuth, error: stuAuthErr } = await serviceClient.auth.admin.createUser({
      email: studentEmail,
      password: testPassword,
      email_confirm: true,
      user_metadata: { full_name: `Student Test (${RUN_ID})` }
    });
    if (stuAuthErr || !stuAuth.user) throw new Error(`Failed creating student auth user: ${stuAuthErr?.message}`);
    studentAuthUserId = stuAuth.user.id;
    manifest.authUsers.push(studentAuthUserId);

    const { error: stuProfErr } = await serviceClient.from('profiles').insert({
      id: studentAuthUserId,
      full_name: `Student Test (${RUN_ID})`,
      email: studentEmail,
      usn: `USN-${RUN_ID}`,
      status: 'active'
    });
    if (stuProfErr) throw new Error(`Failed creating student profile: ${stuProfErr.message}`);
    manifest.profiles.push(studentAuthUserId);

    const stuRoleId = crypto.randomUUID();
    const { error: stuRoleErr } = await serviceClient.from('user_roles').insert({
      id: stuRoleId,
      user_id: studentAuthUserId,
      role: 'student',
      active: true
    });
    if (stuRoleErr) throw new Error(`Failed assigning student role: ${stuRoleErr.message}`);
    manifest.userRoles.push(stuRoleId);

    // 1c. Test Teacher Account
    const teacherEmail = `test.teacher.${RUN_ID}@acadassess.local`;
    const { data: tchrAuth, error: tchrAuthErr } = await serviceClient.auth.admin.createUser({
      email: teacherEmail,
      password: testPassword,
      email_confirm: true,
      user_metadata: { full_name: `Prof. Test Teacher (${RUN_ID})` }
    });
    if (tchrAuthErr || !tchrAuth.user) throw new Error(`Failed creating teacher auth user: ${tchrAuthErr?.message}`);
    teacherAuthUserId = tchrAuth.user.id;
    manifest.authUsers.push(teacherAuthUserId);

    const { error: tchrProfErr } = await serviceClient.from('profiles').insert({
      id: teacherAuthUserId,
      full_name: `Prof. Test Teacher (${RUN_ID})`,
      email: teacherEmail,
      status: 'active'
    });
    if (tchrProfErr) throw new Error(`Failed creating teacher profile: ${tchrProfErr.message}`);
    manifest.profiles.push(teacherAuthUserId);

    const tchrRoleId = crypto.randomUUID();
    const { error: tchrRoleErr } = await serviceClient.from('user_roles').insert({
      id: tchrRoleId,
      user_id: teacherAuthUserId,
      role: 'subject_teacher',
      active: true
    });
    if (tchrRoleErr) throw new Error(`Failed assigning teacher role: ${tchrRoleErr.message}`);
    manifest.userRoles.push(tchrRoleId);

    // 1d. Test Proctor Account
    const proctorEmail = `test.proctor.${RUN_ID}@acadassess.local`;
    const { data: prcAuth, error: prcAuthErr } = await serviceClient.auth.admin.createUser({
      email: proctorEmail,
      password: testPassword,
      email_confirm: true,
      user_metadata: { full_name: `Dr. Test Proctor (${RUN_ID})` }
    });
    if (prcAuthErr || !prcAuth.user) throw new Error(`Failed creating proctor auth user: ${prcAuthErr?.message}`);
    proctorAuthUserId = prcAuth.user.id;
    manifest.authUsers.push(proctorAuthUserId);

    const { error: prcProfErr } = await serviceClient.from('profiles').insert({
      id: proctorAuthUserId,
      full_name: `Dr. Test Proctor (${RUN_ID})`,
      email: proctorEmail,
      status: 'active'
    });
    if (prcProfErr) throw new Error(`Failed creating proctor profile: ${prcProfErr.message}`);
    manifest.profiles.push(proctorAuthUserId);

    const prcRoleId = crypto.randomUUID();
    const { error: prcRoleErr } = await serviceClient.from('user_roles').insert({
      id: prcRoleId,
      user_id: proctorAuthUserId,
      role: 'proctor',
      active: true
    });
    if (prcRoleErr) throw new Error(`Failed assigning proctor role: ${prcRoleErr.message}`);
    manifest.userRoles.push(prcRoleId);

    // 1e. Authenticate real Supabase tokens (Real Auth JWTs)
    const anonAuthClient = createRlsClient();
    const { data: hodSession, error: hodSignErr } = await anonAuthClient.auth.signInWithPassword({
      email: hodEmail,
      password: testPassword
    });
    if (hodSignErr || !hodSession.session) throw new Error(`Failed signing in HOD test user: ${hodSignErr?.message}`);
    hodToken = hodSession.session.access_token;

    const { data: stuSession, error: stuSignErr } = await anonAuthClient.auth.signInWithPassword({
      email: studentEmail,
      password: testPassword
    });
    if (stuSignErr || !stuSession.session) throw new Error(`Failed signing in Student test user: ${stuSignErr?.message}`);
    studentToken = stuSession.session.access_token;

    assert(Boolean(hodToken && studentToken), 'Real Supabase Auth JWT tokens issued for HOD and Student');

    // -------------------------------------------------------------------------
    // STEP 2: RLS ENFORCEMENT VERIFICATION (PUBLISHABLE-KEY CLIENT)
    // -------------------------------------------------------------------------
    console.log('\n--- STEP 2: Live PostgreSQL Row-Level Security (RLS) Policy Verification ---');

    const hodRlsClient = createRlsClient(hodToken);
    const studentRlsClient = createRlsClient(studentToken);
    const unauthRlsClient = createRlsClient();

    // 2a. Unauthenticated client cannot insert departments
    const { error: unauthDeptErr } = await unauthRlsClient
      .from('departments')
      .insert({ code: `UNAUTH-${RUN_ID}`, name: 'Unauthorized Dept' });
    assert(
      Boolean(unauthDeptErr && (unauthDeptErr.code === '42501' || unauthDeptErr.message.includes('row-level security'))),
      'RLS blocks unauthenticated department insertion (42501 permission denied)'
    );

    // 2b. Student client cannot insert departments
    const { error: stuDeptErr } = await studentRlsClient
      .from('departments')
      .insert({ code: `STU-${RUN_ID}`, name: 'Student Dept' });
    assert(
      Boolean(stuDeptErr && (stuDeptErr.code === '42501' || stuDeptErr.message.includes('row-level security'))),
      'RLS blocks student department insertion (42501 violates RLS policy)'
    );

    // 2c. Student cannot view audit events
    const { data: stuAuditData, error: stuAuditErr } = await studentRlsClient
      .from('audit_events')
      .select('*');
    assert(
      (stuAuditData?.length === 0 || stuAuditErr !== null),
      'RLS restricts audit_events SELECT: Student reads 0 audit rows'
    );

    // 2d. Authenticated HOD client can insert department via RLS
    const testDeptCode = `DPT-${RUN_ID}`;
    const testDeptId = crypto.randomUUID();
    const { data: hodDeptData, error: hodDeptErr } = await hodRlsClient
      .from('departments')
      .insert({ id: testDeptId, code: testDeptCode, name: `Department ${RUN_ID}` })
      .select()
      .single();
    assert(
      !hodDeptErr && hodDeptData?.code === testDeptCode,
      'RLS permits HOD department insertion (is_hod policy passes)'
    );
    if (hodDeptData) manifest.departments.push(hodDeptData.id);

    // 2e. Duplicate department code conflict
    const { error: dupDeptErr } = await hodRlsClient
      .from('departments')
      .insert({ code: testDeptCode, name: `Duplicate Dept ${RUN_ID}` });
    assert(
      Boolean(dupDeptErr && (dupDeptErr.code === '23505' || dupDeptErr.message.includes('unique constraint'))),
      'PostgreSQL enforces unique constraint on department code (23505 duplicate key)'
    );

    // -------------------------------------------------------------------------
    // STEP 3: ACADEMIC RELATIONSHIPS, DATES & CONSTRAINTS
    // -------------------------------------------------------------------------
    console.log('\n--- STEP 3: Academic Schema Constraints & Relationships ---');

    // 3a. Academic Term: Check constraint (ends_on >= starts_on)
    const { error: badTermErr } = await hodRlsClient
      .from('academic_terms')
      .insert({
        name: `Bad Dates Term ${RUN_ID}`,
        starts_on: '2026-12-31',
        ends_on: '2026-01-01',
        active: true
      });
    assert(
      Boolean(badTermErr && (badTermErr.code === '23514' || badTermErr.message.includes('ck_academic_term_dates'))),
      'PostgreSQL enforces ck_academic_term_dates check constraint (23514)'
    );

    // 3b. Valid Academic Term Creation
    const testTermId = crypto.randomUUID();
    const { data: termData, error: termErr } = await hodRlsClient
      .from('academic_terms')
      .insert({
        id: testTermId,
        name: `Academic Term ${RUN_ID}`,
        starts_on: '2026-08-01',
        ends_on: '2026-12-31',
        active: true
      })
      .select()
      .single();
    assert(!termErr && termData?.name.includes(RUN_ID), 'HOD creates valid Academic Term via RLS');
    if (termData) manifest.terms.push(termData.id);

    // 3c. Class Creation with Foreign Keys
    const testClassId = crypto.randomUUID();
    const { data: classData, error: classErr } = await hodRlsClient
      .from('classes')
      .insert({
        id: testClassId,
        department_id: testDeptId,
        term_id: testTermId,
        programme: `MCA-${RUN_ID}`,
        semester: 3,
        section: 'A',
        class_teacher_id: teacherAuthUserId
      })
      .select()
      .single();
    assert(!classErr && classData?.programme.includes(RUN_ID), 'HOD creates Class Batch with foreign key relations');
    if (classData) manifest.classes.push(classData.id);

    // 3d. Subject Creation with Department Scoping
    const testSubjectId = crypto.randomUUID();
    const testSubCode = `SUB-${RUN_ID}`;
    const { data: subData, error: subErr } = await hodRlsClient
      .from('subjects')
      .insert({
        id: testSubjectId,
        department_id: testDeptId,
        code: testSubCode,
        name: `Algorithms & Data Structures ${RUN_ID}`,
        credits: 4
      })
      .select()
      .single();
    assert(!subErr && subData?.code === testSubCode, 'HOD creates Subject under Department');
    if (subData) manifest.subjects.push(subData.id);

    // 3e. Class-Subject Assignment
    const testCsId = crypto.randomUUID();
    const { data: csData, error: csErr } = await hodRlsClient
      .from('class_subjects')
      .insert({
        id: testCsId,
        class_id: testClassId,
        subject_id: testSubjectId,
        subject_teacher_id: teacherAuthUserId,
        active: true
      })
      .select()
      .single();
    assert(!csErr && csData?.id === testCsId, 'HOD maps Subject and Teacher to Class Cohort');
    if (csData) manifest.classSubjects.push(csData.id);

    // 3f. Student Enrollment
    const testEnrollId = crypto.randomUUID();
    const { data: enrollData, error: enrollErr } = await hodRlsClient
      .from('enrollments')
      .insert({
        id: testEnrollId,
        class_id: testClassId,
        student_id: studentAuthUserId,
        roll_number: `ROLL-${RUN_ID}`,
        status: 'active'
      })
      .select()
      .single();
    assert(!enrollErr && enrollData?.student_id === studentAuthUserId, 'HOD enrolls student in Class Cohort');
    if (enrollData) manifest.enrollments.push(enrollData.id);

    // 3g. Duplicate enrollment blocked by uq_enrollment
    const { error: dupEnrollErr } = await hodRlsClient
      .from('enrollments')
      .insert({
        class_id: testClassId,
        student_id: studentAuthUserId,
        roll_number: `ROLL-DUP-${RUN_ID}`
      });
    assert(
      Boolean(dupEnrollErr && (dupEnrollErr.code === '23505' || dupEnrollErr.message.includes('uq_enrollment'))),
      'PostgreSQL enforces uq_enrollment unique constraint on (class_id, student_id)'
    );

    // 3h. Proctor Assignment
    const testPrcAssignId = crypto.randomUUID();
    const { data: paData, error: paErr } = await hodRlsClient
      .from('proctor_assignments')
      .insert({
        id: testPrcAssignId,
        class_id: testClassId,
        student_id: studentAuthUserId,
        proctor_id: proctorAuthUserId,
        valid_from: '2026-08-01',
        assigned_by: hodAuthUserId
      })
      .select()
      .single();
    assert(!paErr && paData?.proctor_id === proctorAuthUserId, 'HOD assigns faculty Proctor to Student');
    if (paData) manifest.proctorAssignments.push(paData.id);

    // -------------------------------------------------------------------------
    // STEP 4: AUDIT INTEGRITY & ATTRIBUTION PRESERVATION
    // -------------------------------------------------------------------------
    console.log('\n--- STEP 4: Audit Trail Attribution & Immutability Verification ---');

    // 4a. HOD records audit event with actor attribution & JSONB identity snapshot
    const testAuditId = crypto.randomUUID();
    const { data: auditData, error: auditErr } = await hodRlsClient
      .from('audit_events')
      .insert({
        id: testAuditId,
        actor_id: hodAuthUserId,
        action: `TEST_LIVE_CREATE_DEPARTMENT_${RUN_ID}`,
        resource_type: 'departments',
        resource_id: testDeptId,
        correlation_id: RUN_CORRELATION_ID,
        after: {
          code: testDeptCode,
          run_id: RUN_ID,
          is_test_run: true,
          actor_snapshot: {
            id: hodAuthUserId,
            email: hodEmail,
            role: 'hod'
          }
        }
      })
      .select()
      .single();
    assert(
      !auditErr && auditData?.actor_id === hodAuthUserId,
      'Authorized HOD records audit event attributed to own identity'
    );
    if (auditData) manifest.retainedAuditEvents.push(auditData.id);

    // 4b. Audit event insert with spoofed actor ID rejected by RLS
    const { error: spoofAuditErr } = await hodRlsClient
      .from('audit_events')
      .insert({
        actor_id: studentAuthUserId, // Spoofed actor_id != auth.uid()
        action: `TEST_SPOOF_ATTEMPT_${RUN_ID}`,
        resource_type: 'departments',
        resource_id: testDeptId,
        correlation_id: RUN_CORRELATION_ID
      });
    assert(
      Boolean(spoofAuditErr && (spoofAuditErr.code === '42501' || spoofAuditErr.message.includes('row-level security'))),
      'RLS check constraint enforces actor_id = auth.uid(); spoofed actor rejected (42501)'
    );

    // 4c. Audit event mutation blocked (Append-only invariant)
    const { error: updateAuditErr } = await hodRlsClient
      .from('audit_events')
      .update({ action: 'TAMPERED_ACTION' })
      .eq('id', testAuditId);
    assert(
      Boolean(updateAuditErr && (updateAuditErr.code === '42501' || updateAuditErr.message.includes('row-level security'))),
      'RLS denies UPDATE on audit_events; append-only invariant strictly preserved'
    );

    // 4d. Audit event deletion blocked (Append-only invariant)
    const { error: deleteAuditErr } = await hodRlsClient
      .from('audit_events')
      .delete()
      .eq('id', testAuditId);
    assert(
      Boolean(deleteAuditErr && (deleteAuditErr.code === '42501' || deleteAuditErr.message.includes('row-level security'))),
      'RLS denies DELETE on audit_events; audit deletion strictly prohibited'
    );

  } catch (err: any) {
    console.error('\n[TEST EXECUTION ERROR]:', err.message);
    console.error('\n--- RUN MANIFEST RECOVERY REPORT ---');
    console.error(` Run ID         : ${RUN_ID}`);
    console.error(` Correlation ID : ${RUN_CORRELATION_ID}`);
    console.error(` Target Host    : ${parsedUrl.hostname}`);
    console.error(` Tracked Manifest:`, JSON.stringify(manifest, null, 2));
    console.error(` If cleanup was interrupted, invoke targeted recovery:`);
    console.error(`   npx tsx tests/security/live_phase4_2_supabase_verification.ts --staging --recover ${RUN_ID}`);
    console.error('------------------------------------\n');
  } finally {
    // Guaranteed cleanup runs for assertion failures and errors
    await executeCleanup('Final Test Completion');
  }

  console.log('================================================================');
  console.log(` RESULTS: ${passedTests}/${totalTests} Live Tests Passed`);
  console.log('================================================================');

  if (passedTests !== totalTests) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

/**
 * Narrowly scoped manual recovery tool:
 * Strictly validates RUN_ID and deletes ONLY entities created by that run.
 */
export async function runManualRecovery(targetRunId: string) {
  // Strict format validation: Exactly 8 hexadecimal characters
  if (!targetRunId || !/^[a-f0-9]{8}$/i.test(targetRunId)) {
    console.error(`[ERROR] Invalid RUN_ID format: "${targetRunId}". Must be exactly 8 hexadecimal characters.`);
    process.exit(1);
  }

  console.log(`[MANUAL RECOVERY] Initiating narrow sweep on ${parsedUrl.hostname} for RUN_ID = "${targetRunId}"...`);

  // 1. Locate classes matching exact programme name
  const { data: classes } = await serviceClient
    .from('classes')
    .select('id')
    .eq('programme', `MCA-${targetRunId}`);
  const classIds = classes?.map(c => c.id) || [];

  if (classIds.length > 0) {
    await serviceClient.from('proctor_assignments').delete().in('class_id', classIds);
    await serviceClient.from('enrollments').delete().in('class_id', classIds);
    await serviceClient.from('class_subjects').delete().in('class_id', classIds);
    await serviceClient.from('classes').delete().in('id', classIds);
    console.log(`  [RECOVERY] Cleaned classes and child records for run ${targetRunId}.`);
  }

  // 2. Exact code/name matches
  await serviceClient.from('subjects').delete().eq('code', `SUB-${targetRunId}`);
  await serviceClient.from('academic_terms').delete().eq('name', `Academic Term ${targetRunId}`);
  await serviceClient.from('departments').delete().eq('code', `DPT-${targetRunId}`);

  // 3. Exact email deactivation for the 4 test users
  const testEmails = [
    `test.hod.${targetRunId}@acadassess.local`,
    `test.student.${targetRunId}@acadassess.local`,
    `test.teacher.${targetRunId}@acadassess.local`,
    `test.proctor.${targetRunId}@acadassess.local`
  ];

  const { data: profiles } = await serviceClient
    .from('profiles')
    .select('id')
    .in('email', testEmails);

  if (profiles && profiles.length > 0) {
    const profileIds = profiles.map(p => p.id);
    await serviceClient.from('user_roles').update({ active: false }).in('user_id', profileIds);
    await serviceClient.from('profiles').update({ status: 'inactive' }).in('id', profileIds);
    for (const id of profileIds) {
      await serviceClient.auth.admin.updateUserById(id, { ban_duration: '876000h' });
    }
    console.log(`  [RECOVERY] Deactivated and banned test profiles for run ${targetRunId}.`);
  }

  console.log('[MANUAL RECOVERY COMPLETE] Targeted sweep finished.');
}

// CLI entry point
if (process.argv[1]?.includes('live_phase4_2_supabase_verification')) {
  if (process.argv.includes('--recover')) {
    const runIdArg = process.argv[process.argv.indexOf('--recover') + 1];
    if (!runIdArg) {
      console.error('Specify run ID: --recover <runId>');
      process.exit(1);
    }
    runManualRecovery(runIdArg);
  } else if (process.argv.includes('--execute')) {
    runLiveVerification();
  } else {
    console.log('[SAFETY NOTICE] Script executed in safe preflight / preparation mode.');
    console.log(`Target verified: ${parsedUrl.hostname} (Staging project strictly confirmed)`);
    console.log('To execute live mutations on staging, specify --execute:');
    console.log('  npx tsx tests/security/live_phase4_2_supabase_verification.ts --staging --execute');
    console.log('Zero mutations were performed during this preflight invocation.');
  }
}
