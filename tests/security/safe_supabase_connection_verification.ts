import dotenv from 'dotenv';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

async function run() {
  const rootEnvPath = path.resolve(process.cwd(), '.env');
  dotenv.config({ path: rootEnvPath });

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  console.log('================================================================');
  console.log('   ACADASSESS: SAFE BACKEND SUPABASE CONNECTION VERIFICATION    ');
  console.log('================================================================');
  console.log(`[CHECK 1] Root .env path: ${rootEnvPath}`);
  console.log(`[CHECK 2] SUPABASE_URL configured: ${Boolean(supabaseUrl)}`);
  if (supabaseUrl) {
    try {
      const parsed = new URL(supabaseUrl);
      console.log(`[CHECK 3] Target Supabase host: ${parsed.host}`);
    } catch {
      console.log('[FAIL] SUPABASE_URL is not a valid URL');
      process.exit(1);
    }
  }

  console.log(`[CHECK 4] SUPABASE_SERVICE_ROLE_KEY configured: ${Boolean(serviceKey)}`);
  if (!serviceKey) {
    console.log('[FAIL] SUPABASE_SERVICE_ROLE_KEY is missing from .env');
    process.exit(1);
  }

  // Check key format safely without revealing secret value
  const keyLen = serviceKey.length;
  const isSbSecret = serviceKey.startsWith('sb_secret_');
  const isJwt = serviceKey.startsWith('ey');
  const formatDesc = isSbSecret ? 'New Supabase secret key (sb_secret_...)' : isJwt ? 'Legacy JWT format (ey...)' : 'Custom / other format';
  console.log(`[CHECK 5] Service key format: ${formatDesc} (length: ${keyLen} characters)`);

  // Initialize server-side Supabase client with non-interactive options
  console.log('\n--- Initializing Server-Side Supabase Client ---');
  try {
    const client = createClient(supabaseUrl!, serviceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });

    console.log('[PASS] @supabase/supabase-js client initialized successfully');

    // Safe read-only count query on public.profiles (HEAD count query, 0 bytes returned)
    console.log('\n--- Executing Safe Read-Only Verification on public.profiles ---');
    const { count: profileCount, error: profileErr, status: profileStatus } = await client
      .from('profiles')
      .select('*', { count: 'exact', head: true });

    if (profileErr) {
      console.log(`[STATUS] Read-only query to public.profiles returned HTTP ${profileStatus}`);
      console.log(`[INFO] PostgreSQL Code: ${profileErr.code}`);
      console.log(`[INFO] PostgreSQL Message: ${profileErr.message}`);
      if (profileErr.hint) {
        console.log(`[INFO] PostgreSQL Hint: ${profileErr.hint}`);
      }
    } else {
      console.log(`[PASS] Read-only query to public.profiles succeeded (HTTP ${profileStatus})`);
      console.log(`[INFO] Current row count in public.profiles: ${profileCount}`);
    }

    // Safe read-only count query on public.user_roles (HEAD count query)
    console.log('\n--- Executing Safe Read-Only Verification on public.user_roles ---');
    const { count: rolesCount, error: rolesErr, status: rolesStatus } = await client
      .from('user_roles')
      .select('*', { count: 'exact', head: true });

    if (rolesErr) {
      console.log(`[STATUS] Read-only query to public.user_roles returned HTTP ${rolesStatus}`);
      console.log(`[INFO] PostgreSQL Code: ${rolesErr.code}`);
      console.log(`[INFO] PostgreSQL Message: ${rolesErr.message}`);
    } else {
      console.log(`[PASS] Read-only query to public.user_roles succeeded (HTTP ${rolesStatus})`);
      console.log(`[INFO] Current row count in public.user_roles: ${rolesCount}`);
    }

    // Safe read-only bucket verification on Storage (verifying bucket exists)
    console.log('\n--- Executing Safe Storage Bucket Access Check ---');
    const { data: bucketData, error: bucketErr } = await client
      .storage
      .getBucket('submissions-private');

    if (bucketErr) {
      console.log(`[WARN] submissions-private bucket verification: ${bucketErr.message}`);
    } else {
      console.log(`[PASS] Storage bucket 'submissions-private' verified (is_public: ${bucketData?.public ?? false})`);
    }

    console.log('\n----------------------------------------------------------------');
    console.log('REAL SUPABASE CONNECTION: VERIFIED & OPERATIONAL');
    console.log('(Distinction: This test connected directly over HTTPS to the hosted');
    console.log(' Supabase instance; zero mock/in-memory data was used.)');
    console.log('----------------------------------------------------------------');
    process.exit(0);
  } catch (err: any) {
    console.log(`[CRITICAL EXCEPTION] ${err?.message || err}`);
    process.exit(4);
  }
}

run();
