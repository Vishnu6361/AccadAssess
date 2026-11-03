import fs from 'fs';
import path from 'path';
import { z } from 'zod';

export const STAGING_PROJECT_REF = 'gemuhhrsciilclbtzkcx';
export const STAGING_HOST = 'gemuhhrsciilclbtzkcx.supabase.co';
export const PROD_PROJECT_REF = 'rdfloxppwlbocxplbixu';

export const PROTECTED_HISTORICAL_IDS = [
  '59d2f729-cdec-48df-86bb-57320a666ae0', // Historical HOD
  'fff01fb6-5ce4-475b-9043-2f19299dc62f', // Historical Proctor
  '9d16bf13-ecc4-43b5-8838-b45e28e9722f', // Historical Teacher
  '8c6ef051-aad5-42d1-8441-ed2b6f3168ad'  // Historical Student
];

export const CleanupActionOutcomeSchema = z.object({
  action: z.string(),
  target_id: z.string(),
  target_type: z.string(),
  outcome: z.enum(['success', 'failed']),
  error: z.string().optional(),
  timestamp: z.string()
});
export type CleanupActionOutcome = z.infer<typeof CleanupActionOutcomeSchema>;

export const ProvisioningEntitiesSchema = z.object({
  auth_user_id: z.string().uuid().nullable().default(null),
  auth_email: z.string().email().nullable().default(null),
  profile_id: z.string().uuid().nullable().default(null),
  role_ids: z.array(z.string().uuid()).default([]),
  programmes: z.array(z.string().uuid()).default([]),
  specializations: z.array(z.string().uuid()).default([]),
  academic_terms: z.array(z.string().uuid()).default([]),
  classes: z.array(z.string().uuid()).default([]),
  subjects: z.array(z.string().uuid()).default([]),
  class_subjects: z.array(z.string().uuid()).default([])
});
export type ProvisioningEntities = z.infer<typeof ProvisioningEntitiesSchema>;

export const ProvisioningJournalSchema = z.object({
  version: z.literal(1).default(1),
  run_id: z.string().min(1),
  created_at: z.string(),
  updated_at: z.string(),
  target_project_ref: z.literal(STAGING_PROJECT_REF),
  target_host: z.literal(STAGING_HOST),
  correlation_id: z.string().uuid(),
  stage: z.enum([
    'preflight_passed',
    'auth_user_created',
    'profile_created',
    'role_assigned',
    'resources_created',
    'verification_completed',
    'cleanup_in_progress',
    'cleaned_up',
    'cleanup_failed'
  ]),
  entities: ProvisioningEntitiesSchema,
  retained_audit_event_ids: z.array(z.string()).default([]),
  cleanup_actions: z.array(CleanupActionOutcomeSchema).default([]),
  unresolved_failures: z.array(z.string()).default([])
});
export type ProvisioningJournal = z.infer<typeof ProvisioningJournalSchema>;

/**
 * Validates that no entity ID in the journal matches any protected historical test identity.
 */
export function validateJournalIsolation(journal: ProvisioningJournal): void {
  const allIds = [
    journal.entities.auth_user_id,
    journal.entities.profile_id,
    ...journal.entities.role_ids,
    ...journal.entities.programmes,
    ...journal.entities.specializations,
    ...journal.entities.academic_terms,
    ...journal.entities.classes,
    ...journal.entities.subjects,
    ...journal.entities.class_subjects
  ].filter((id): id is string => Boolean(id));

  for (const id of allIds) {
    if (PROTECTED_HISTORICAL_IDS.includes(id)) {
      throw new Error(`[CRITICAL SECURITY VIOLATION] Protected historical identity ${id} found in run journal! Aborting.`);
    }
  }

  if (journal.target_project_ref !== STAGING_PROJECT_REF) {
    throw new Error(`[CRITICAL SECURITY VIOLATION] Target project reference mismatch: expected ${STAGING_PROJECT_REF}, got ${journal.target_project_ref}`);
  }

  if (journal.target_host !== STAGING_HOST) {
    throw new Error(`[CRITICAL SECURITY VIOLATION] Target host mismatch: expected exact "${STAGING_HOST}", got "${journal.target_host}"`);
  }
}

/**
 * Crash-safe journal manager with atomic filesystem writes.
 */
export class ProvisioningJournalManager {
  private journalPath: string;
  private journal: ProvisioningJournal;

  constructor(journalDir: string, runId: string, correlationId: string) {
    if (!fs.existsSync(journalDir)) {
      fs.mkdirSync(journalDir, { recursive: true });
    }
    this.journalPath = path.resolve(journalDir, `staging_run_${runId}.json`);

    const now = new Date().toISOString();
    this.journal = {
      version: 1,
      run_id: runId,
      created_at: now,
      updated_at: now,
      target_project_ref: STAGING_PROJECT_REF,
      target_host: STAGING_HOST,
      correlation_id: correlationId,
      stage: 'preflight_passed',
      entities: {
        auth_user_id: null,
        auth_email: null,
        profile_id: null,
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

    this.atomicSave();
  }

  public getJournal(): Readonly<ProvisioningJournal> {
    return this.journal;
  }

  public getFilePath(): string {
    return this.journalPath;
  }

  /**
   * Atomically writes the journal to disk:
   * Writes to a temporary file, fsyncs, then renames to target destination.
   * Prevents partially written or corrupted files if process is terminated.
   */
  private atomicSave(): void {
    validateJournalIsolation(this.journal);
    this.journal.updated_at = new Date().toISOString();

    const tempPath = `${this.journalPath}.tmp.${Date.now()}`;
    const payload = JSON.stringify(this.journal, null, 2);

    const fd = fs.openSync(tempPath, 'w');
    fs.writeFileSync(fd, payload, 'utf8');
    fs.fsyncSync(fd);
    fs.closeSync(fd);

    fs.renameSync(tempPath, this.journalPath);
  }

  public recordAuthUserCreated(userId: string, email: string): void {
    this.journal.entities.auth_user_id = userId;
    this.journal.entities.auth_email = email;
    this.journal.stage = 'auth_user_created';
    this.atomicSave();
  }

  public recordProfileCreated(profileId: string): void {
    this.journal.entities.profile_id = profileId;
    this.journal.stage = 'profile_created';
    this.atomicSave();
  }

  public recordRoleAssigned(roleId: string): void {
    if (!this.journal.entities.role_ids.includes(roleId)) {
      this.journal.entities.role_ids.push(roleId);
    }
    this.journal.stage = 'role_assigned';
    this.atomicSave();
  }

  public recordResourceCreated(entityType: keyof ProvisioningEntities, id: string): void {
    const list = this.journal.entities[entityType];
    if (Array.isArray(list) && !list.includes(id)) {
      (list as string[]).push(id);
      this.journal.stage = 'resources_created';
      this.atomicSave();
    }
  }

  public recordAuditEventRetained(auditEventId: string): void {
    if (!this.journal.retained_audit_event_ids.includes(auditEventId)) {
      this.journal.retained_audit_event_ids.push(auditEventId);
      this.atomicSave();
    }
  }

  public recordVerificationCompleted(): void {
    this.journal.stage = 'verification_completed';
    this.atomicSave();
  }

  public recordCleanupAction(
    action: string,
    targetId: string,
    targetType: string,
    outcome: 'success' | 'failed',
    error?: string
  ): void {
    this.journal.stage = 'cleanup_in_progress';
    this.journal.cleanup_actions.push({
      action,
      target_id: targetId,
      target_type: targetType,
      outcome,
      error,
      timestamp: new Date().toISOString()
    });

    if (outcome === 'failed') {
      const errMsg = `[${targetType}:${targetId}] ${action} failed: ${error || 'Unknown error'}`;
      if (!this.journal.unresolved_failures.includes(errMsg)) {
        this.journal.unresolved_failures.push(errMsg);
      }
    }
    this.atomicSave();
  }

  public recordCleanupCompleted(): void {
    if (this.journal.unresolved_failures.length > 0) {
      this.journal.stage = 'cleanup_failed';
    } else {
      this.journal.stage = 'cleaned_up';
    }
    this.atomicSave();
  }

  /**
   * Load and validate an existing journal from disk.
   */
  public static loadAndValidate(filePath: string): ProvisioningJournal {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Journal file not found: ${filePath}`);
    }

    const raw = fs.readFileSync(filePath, 'utf8');
    let parsedJson: any;
    try {
      parsedJson = JSON.parse(raw);
    } catch (e: any) {
      throw new Error(`Corrupted journal file (invalid JSON): ${e.message}`);
    }

    const parsed = ProvisioningJournalSchema.parse(parsedJson);
    validateJournalIsolation(parsed);
    return parsed;
  }
}
