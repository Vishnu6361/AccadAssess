import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

console.log('================================================================');
console.log('  SMARTFA SUPABASE INTEGRATION & MIGRATION READINESS SUITE      ');
console.log('================================================================\n');

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

// 1. Root .env existence and gitignore check
const rootEnvPath = path.resolve(process.cwd(), '.env');
assert(fs.existsSync(rootEnvPath), 'Root .env exists on filesystem');

const gitignorePath = path.resolve(process.cwd(), '.gitignore');
const gitignoreContent = fs.readFileSync(gitignorePath, 'utf8');
assert(
  gitignoreContent.includes('.env') && gitignoreContent.includes('*.env'),
  '.gitignore contains comprehensive rules protecting .env and *.env'
);

// 2. Parse .env safely without printing values
const envConfig = dotenv.parse(fs.readFileSync(rootEnvPath, 'utf8'));

const viteUrl = envConfig['VITE_SUPABASE_URL'];
assert(
  Boolean(viteUrl && viteUrl.startsWith('https://') && viteUrl.includes('.supabase.co')),
  'VITE_SUPABASE_URL is properly formatted with https://<project>.supabase.co'
);

const vitePubKey = envConfig['VITE_SUPABASE_PUBLISHABLE_KEY'];
assert(
  Boolean(vitePubKey && vitePubKey.length > 20),
  'VITE_SUPABASE_PUBLISHABLE_KEY is configured with valid key length'
);

// 3. Migration files check
const migrationsDir = path.resolve(process.cwd(), 'supabase/migrations');
const migrationFiles = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();

assert(
  migrationFiles.length >= 6,
  `At least 6 migration files present (found ${migrationFiles.length})`
);

// Check migration ordering
const expectedPrefixes = [
  '20261012000001_',
  '20261012000002_',
  '20261012000003_',
  '20261012000004_',
  '20261012000005_',
  '20261012000006_'
];
if (migrationFiles.length >= 7) {
  expectedPrefixes.push('20261012000007_');
}
const prefixesMatch = expectedPrefixes.every((p, idx) => migrationFiles[idx]?.startsWith(p));
assert(prefixesMatch, `Migration timestamps and prefixes follow strict chronological order (01 to ${expectedPrefixes.length < 10 ? '0' + expectedPrefixes.length : expectedPrefixes.length})`);

// 4. Migration 5: Private Storage path indexing check
const m5Content = fs.readFileSync(path.join(migrationsDir, migrationFiles[4]), 'utf8');
assert(
  m5Content.includes('submissions-private'),
  'Migration 5 configures private bucket submissions-private'
);

assert(
  m5Content.includes('(storage.foldername(name))[6] = auth.uid()::text'),
  'Migration 5 handles standard hierarchical path assessments/{id}/.../students/{id}/... (index 6)'
);

assert(
  m5Content.includes('a.id::text = (storage.foldername(name))[2]'),
  'Migration 5 handles assessment ID at folder index 2'
);

assert(
  m5Content.includes('drop policy if exists "Authorized users can read private submission PDFs"'),
  'Migration 5 includes idempotent drop policy if exists for safe re-runs'
);

// 5. Migration 6: Permissions Hardening check
const m6Content = fs.readFileSync(path.join(migrationsDir, migrationFiles[5]), 'utf8');
assert(
  m6Content.includes('revoke execute on function public.has_role(uuid, public.app_role) from public, anon;') &&
  m6Content.includes('grant execute on function public.has_role(uuid, public.app_role) to authenticated, service_role;'),
  'Migration 6 hardens has_role: revoked from public/anon, granted to authenticated/service_role'
);

assert(
  m6Content.includes('revoke execute on function public.is_hod(uuid) from public, anon;') &&
  m6Content.includes('grant execute on function public.is_hod(uuid) to authenticated, service_role;'),
  'Migration 6 hardens is_hod: revoked from public/anon, granted to authenticated/service_role'
);

assert(
  m6Content.includes('revoke execute on function public.is_active_user(uuid) from public, anon;') &&
  m6Content.includes('grant execute on function public.is_active_user(uuid) to authenticated, service_role;'),
  'Migration 6 hardens is_active_user: revoked from public/anon, granted to authenticated/service_role'
);

assert(
  m6Content.includes('revoke execute on function public.publish_assessment(uuid) from public, anon;') &&
  m6Content.includes('grant execute on function public.publish_assessment(uuid) to authenticated, service_role;'),
  'Migration 6 hardens publish_assessment: revoked from public/anon, granted to authenticated/service_role'
);

assert(
  m6Content.includes('revoke execute on function public.finalize_submission(uuid, uuid, text, text, text, integer, text) from public, anon;') &&
  m6Content.includes('grant execute on function public.finalize_submission(uuid, uuid, text, text, text, integer, text) to authenticated, service_role;'),
  'Migration 6 hardens finalize_submission: revoked from public/anon, granted to authenticated/service_role'
);

// 6. Invariant & RLS checks on migrations
const m3Content = fs.readFileSync(path.join(migrationsDir, migrationFiles[2]), 'utf8');
assert(
  m3Content.includes('security definer') && m3Content.includes('set search_path = public'),
  'Migration 3 helper functions use SECURITY DEFINER and explicit search_path'
);

assert(
  m3Content.includes('"HOD can view audit events"') &&
  m3Content.includes('on public.audit_events for select') &&
  !m3Content.includes('on public.audit_events for update') &&
  !m3Content.includes('on public.audit_events for delete'),
  'Migration 3 enforces append-only audit_events with zero update or delete policies'
);

const m4Content = fs.readFileSync(path.join(migrationsDir, migrationFiles[3]), 'utf8');
assert(
  m4Content.includes('create or replace function public.publish_assessment'),
  'Migration 4 includes atomic publish_assessment transactional function'
);

if (migrationFiles.length >= 7) {
  const m7Content = fs.readFileSync(path.join(migrationsDir, migrationFiles[6]), 'utf8');
  const normalizedM7 = m7Content.replace(/\s+/g, ' ');
  assert(
    normalizedM7.includes('grant all privileges on all tables in schema public to service_role;'),
    'Migration 7 grants full table privileges to service_role'
  );
  assert(
    normalizedM7.includes('grant select, insert, update, delete on public.departments,') &&
    normalizedM7.includes('to authenticated;'),
    'Migration 7 grants application table privileges to authenticated'
  );
  assert(
    normalizedM7.includes('revoke update, delete, truncate on public.audit_events from authenticated, anon;'),
    'Migration 7 enforces defense-in-depth append-only on audit_events'
  );
  assert(
    normalizedM7.includes('alter default privileges for role postgres in schema public grant all on tables to service_role;'),
    'Migration 7 explicitly configures default privileges for role postgres'
  );
  assert(
    normalizedM7.includes('revoke select, insert, update, delete, truncate, references, trigger on all tables in schema public from anon;'),
    'Migration 7 revokes unneeded table privileges from anon'
  );
  assert(
    !normalizedM7.includes('grant execute on routines to authenticated'),
    'Migration 7 preserves function hardening by omitting routine grants from default privileges'
  );
}

console.log('\n----------------------------------------------------------------');
console.log(`TOTAL: ${totalTests} | PASSED: ${passedTests} | FAILED: ${totalTests - passedTests}`);
console.log('----------------------------------------------------------------\n');

if (passedTests !== totalTests) {
  process.exit(1);
}
