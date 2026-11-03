/**
 * ==============================================================================
 * ACADASSESS: SIMILARITY REVIEWS COMPLETE REMOVAL VERIFICATION SUITE
 * ==============================================================================
 * 
 * Verifies:
 * 1. Absence of Similarity Reviews from all workspace navigation structures:
 *    - Subject Teacher sidebar
 *    - HOD sidebar
 *    - Class Teacher sidebar
 *    - Proctor sidebar
 *    - Student sidebar
 * 2. Unused similarity terms completely absent from codebase.
 * 3. Authoritative boundary guidelines updated (no similarity score references).
 * 4. Elimination of similarity contracts (SubmissionStatusSchema, ReviewStatusSchema).
 * 5. Elimination of similarity processing code in Python processor service.
 * 6. Elimination of scikit-learn dependency from processor requirements.txt.
 * 7. Verification of clean database migration 20261101000018_remove_similarity_reviews.sql.
 * 8. Comprehensive source code scan ensuring 0 occurrences across active codebase.
 * ==============================================================================
 */

import fs from 'fs';
import path from 'path';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`  [FAIL] ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`  [PASS] ${message}`);
}

async function runVerification() {
  console.log('\n==============================================================================');
  console.log('STARTING ACADASSESS SIMILARITY REVIEWS COMPLETE REMOVAL VERIFICATION');
  console.log('==============================================================================\n');

  // --- 1. Frontend Sidebar & Navigation Inspection ---
  console.log('--- 1. Frontend Navigation & Workspace Inspection ---');
  const sidebarPath = path.resolve('apps/web/src/components/Sidebar.tsx');
  const sidebarContent = fs.readFileSync(sidebarPath, 'utf8');

  assert(
    !sidebarContent.includes('Similarity Reviews'),
    'Sidebar.tsx: "Similarity Reviews" label completely removed'
  );
  assert(
    !sidebarContent.includes("id: 'similarity'"),
    'Sidebar.tsx: "similarity" navigation ID completely removed'
  );
  assert(
    !sidebarContent.includes('Scale'),
    'Sidebar.tsx: "Scale" icon import and usage completely removed'
  );

  // --- 2. Boundary Inspection in App.tsx ---
  console.log('\n--- 2. Boundary Inspection in App.tsx ---');
  const appPath = path.resolve('apps/web/src/app/App.tsx');
  const appContent = fs.readFileSync(appPath, 'utf8');

  assert(
    !appContent.includes('TF-IDF'),
    'App.tsx: TF-IDF removed from Document Processing Worker description'
  );
  assert(
    !appContent.includes('pairwise similarity'),
    'App.tsx: pairwise similarity removed from Document Processing Worker description'
  );
  assert(
    !appContent.includes('scikit-learn'),
    'App.tsx: scikit-learn removed from Document Processing Worker description'
  );
  assert(
    !appContent.includes('Similarity scores'),
    'App.tsx: "Similarity scores" removed from boundary guidelines'
  );
  assert(
    appContent.includes('Teacher-Controlled Evaluations'),
    'App.tsx: Updated guideline "Teacher-Controlled Evaluations" present'
  );

  // --- 3. Backend Trusted API Inspection ---
  console.log('\n--- 3. Backend API Inspection ---');
  const apiIndexPath = path.resolve('apps/api/src/index.ts');
  const apiIndexContent = fs.readFileSync(apiIndexPath, 'utf8');

  assert(
    !apiIndexContent.includes('Similarity Review'),
    'apps/api/src/index.ts: Root info endpoint description does not mention Similarity Review'
  );

  // --- 4. Contracts & Schemas Inspection ---
  console.log('\n--- 4. Contracts & Enums Inspection ---');
  const contractsPath = path.resolve('packages/contracts/src/index.ts');
  const contractsContent = fs.readFileSync(contractsPath, 'utf8');

  assert(
    !contractsContent.includes('similarity_completed'),
    'packages/contracts: "similarity_completed" removed from SubmissionStatusSchema'
  );
  assert(
    !contractsContent.includes('similarity_failed'),
    'packages/contracts: "similarity_failed" removed from SubmissionStatusSchema'
  );
  assert(
    !contractsContent.includes('ReviewStatusSchema'),
    'packages/contracts: ReviewStatusSchema completely removed'
  );
  assert(
    !contractsContent.includes('ReviewStatus'),
    'packages/contracts: ReviewStatus type completely removed'
  );

  // --- 5. Python Document Processing Worker Inspection ---
  console.log('\n--- 5. Python Document Processing Worker Inspection ---');
  const similarityDirPath = path.resolve('services/processor/app/similarity');
  assert(
    !fs.existsSync(similarityDirPath),
    'services/processor/app/similarity: Directory completely deleted'
  );

  const processorMainPath = path.resolve('services/processor/app/main.py');
  const processorMainContent = fs.readFileSync(processorMainPath, 'utf8');
  assert(
    !processorMainContent.includes('similarity'),
    'services/processor/app/main.py: Zero mentions of similarity'
  );

  const reqsPath = path.resolve('services/processor/requirements.txt');
  const reqsContent = fs.readFileSync(reqsPath, 'utf8');
  assert(
    !reqsContent.includes('scikit-learn'),
    'services/processor/requirements.txt: scikit-learn dependency removed'
  );

  // --- 6. Database Migration Inspection ---
  console.log('\n--- 6. Database Cleanup Migration Inspection ---');
  const migrationPath = path.resolve('supabase/migrations/20261101000018_remove_similarity_reviews.sql');
  assert(
    fs.existsSync(migrationPath),
    'supabase/migrations: 20261101000018_remove_similarity_reviews.sql created'
  );

  const migrationContent = fs.readFileSync(migrationPath, 'utf8');
  assert(
    migrationContent.includes('drop type if exists public.review_status restrict;') ||
    migrationContent.includes('drop type if exists public.review_status cascade;'),
    'Migration drops obsolete review_status enum'
  );
  assert(
    migrationContent.includes("set status = 'ready_for_review'"),
    'Migration sanitizes submissions with obsolete status'
  );

  // --- 7. Full Codebase Static Scan ---
  console.log('\n--- 7. Source Code Comprehensive Scan ---');
  function scanDirForPattern(dir: string, pattern: RegExp, excludeDirs: string[]): string[] {
    const findings: string[] = [];
    const files = fs.readdirSync(dir, { withFileTypes: true });
    for (const file of files) {
      const fullPath = path.join(dir, file.name);
      if (file.isDirectory()) {
        if (!excludeDirs.includes(file.name)) {
          findings.push(...scanDirForPattern(fullPath, pattern, excludeDirs));
        }
      } else {
        if (!file.name.endsWith('.pyc') && !file.name.endsWith('.map')) {
          const content = fs.readFileSync(fullPath, 'utf8');
          if (pattern.test(content)) {
            findings.push(fullPath);
          }
        }
      }
    }
    return findings;
  }

  const activeDirs = ['apps', 'packages', 'services/processor/app'];
  const excludeDirs = ['node_modules', '.git', 'dist', 'venv', '__pycache__'];
  let totalFindings: string[] = [];

  for (const ad of activeDirs) {
    const fullDir = path.resolve(ad);
    if (fs.existsSync(fullDir)) {
      totalFindings.push(...scanDirForPattern(fullDir, /similarity|TF-IDF|plagiarism/i, excludeDirs));
    }
  }

  assert(
    totalFindings.length === 0,
    `Zero similarity/TF-IDF/plagiarism occurrences across active apps, packages, and services (found: ${totalFindings.length})`
  );

  console.log('\n==============================================================================');
  console.log('SIMILARITY REVIEWS COMPLETE REMOVAL: ALL VERIFICATIONS PASSED');
  console.log('==============================================================================\n');
}

runVerification().catch((err) => {
  console.error('\n❌ VERIFICATION TEST FAILED:', err);
  process.exit(1);
});

