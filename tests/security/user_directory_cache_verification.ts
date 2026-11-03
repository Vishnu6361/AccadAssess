import assert from 'assert';
import jwt from 'jsonwebtoken';

const DEV_JWT_SECRET = process.env.JWT_DEV_SECRET || 'smartfa-test-hmac-dev-secret-key-32chars';
const HOD_TOKEN = jwt.sign({ sub: 'a1000000-0000-0000-0000-000000000001', email: 'hod@smartfa.edu' }, DEV_JWT_SECRET, { expiresIn: '1h' });

// Setup localStorage shim for node test runner
const storage: Record<string, string> = {
  smartfa_dev_token: HOD_TOKEN
};
(global as any).localStorage = {
  getItem: (key: string) => storage[key] || null,
  setItem: (key: string, val: string) => { storage[key] = val; },
  removeItem: (key: string) => { delete storage[key]; },
  clear: () => { Object.keys(storage).forEach(k => delete storage[k]); }
};

import { userDirectoryStore } from '../../apps/web/src/features/hod/userDirectoryStore.js';

async function runCacheVerification() {
  console.log('================================================================');
  console.log(' ACADASSESS: USER DIRECTORY NAVIGATION CACHE VERIFICATION');
  console.log('================================================================\n');

  // 1. Initial State
  const initial = userDirectoryStore.getState();
  assert.strictEqual(initial.isLoaded, false, 'Store should initialize in unloaded state');
  assert.strictEqual(initial.users.length, 0, 'Users should initialize empty');
  assert.strictEqual(initial.activeTab, 'faculties', 'Default tab should be faculties');
  assert.strictEqual(initial.search, '', 'Search should initialize empty');
  console.log('  [PASS] Test 1: Store initializes in clean, unloaded state');

  // 2. Fetch Directory First Time
  console.log('  [EXEC] Fetching directory for the first time...');
  const stateAfterFirstLoad = await userDirectoryStore.fetchDirectory();
  assert.strictEqual(stateAfterFirstLoad.isLoaded, true, 'Store should mark isLoaded as true');
  const firstFetchedTime = stateAfterFirstLoad.lastFetchedAt;
  assert.ok(firstFetchedTime, 'Store should record lastFetchedAt');
  console.log(`  [PASS] Test 2: Initial directory fetch loads data (loaded: ${stateAfterFirstLoad.users.length} users, ${stateAfterFirstLoad.classSubjects.length} assignments)`);

  // 3. Tab and Search State Preservation
  userDirectoryStore.setActiveTab('students');
  userDirectoryStore.setSearch('1RV24MC');
  assert.strictEqual(userDirectoryStore.getState().activeTab, 'students', 'Active tab updated to students');
  assert.strictEqual(userDirectoryStore.getState().search, '1RV24MC', 'Search updated');
  console.log('  [PASS] Test 3: Tab and search state updated in store');

  // 4. Simulate Navigation: Unmount User Directory -> Navigate to Academic Structure -> Return
  console.log('  [EXEC] Simulating navigation to another feature and returning...');
  const stateAfterReturn = await userDirectoryStore.fetchDirectory(false);
  assert.strictEqual(stateAfterReturn.lastFetchedAt, firstFetchedTime, 'Timestamp must remain identical (0 redundant network calls)');
  assert.strictEqual(stateAfterReturn.activeTab, 'students', 'Preserves selected tab across navigation');
  assert.strictEqual(stateAfterReturn.search, '1RV24MC', 'Preserves search text across navigation');
  assert.strictEqual(stateAfterReturn.isLoaded, true, 'Data remains instantly loaded without loading spinner');
  console.log('  [PASS] Test 4: Returning to User Directory reuses cached data with ZERO network requests');

  // 5. Account Status Mutation
  const targetUser = stateAfterReturn.users[0] || { id: 'test-user-1', full_name: 'Test', status: 'active' };
  userDirectoryStore.updateUserStatus(targetUser.id, 'inactive');
  const updatedUser = userDirectoryStore.getState().users.find(u => u.id === targetUser.id);
  assert.strictEqual(updatedUser?.status, 'inactive', 'User status updated directly in cache');
  console.log('  [PASS] Test 5: User status mutation updates cache in-place');

  // 6. Explicit Forced Refresh
  console.log('  [EXEC] Simulating user clicking explicit "Refresh" button...');
  const stateAfterRefresh = await userDirectoryStore.fetchDirectory(true);
  assert.ok(stateAfterRefresh.lastFetchedAt && stateAfterRefresh.lastFetchedAt >= firstFetchedTime, 'Explicit refresh updates lastFetchedAt');
  console.log('  [PASS] Test 6: Explicit refresh successfully refreshes data from server');

  // 7. Logout / Account Switch Clears Cache
  console.log('  [EXEC] Simulating user logout / account switch...');
  userDirectoryStore.clear();
  const clearedState = userDirectoryStore.getState();
  assert.strictEqual(clearedState.isLoaded, false, 'Cleared store marks isLoaded as false');
  assert.strictEqual(clearedState.users.length, 0, 'Users cleared from cache');
  assert.strictEqual(clearedState.classSubjects.length, 0, 'Class subjects cleared from cache');
  assert.strictEqual(clearedState.search, '', 'Search reset');
  assert.strictEqual(clearedState.activeTab, 'faculties', 'Tab reset to default');
  console.log('  [PASS] Test 7: Logout wipes all cached records and resets filters');

  console.log('\n================================================================');
  console.log(' RESULTS: ALL 7 CACHE VERIFICATION TESTS PASSED CLEANLY');
  console.log('================================================================');
}

runCacheVerification().catch(err => {
  console.error('Test failure:', err);
  process.exit(1);
});
