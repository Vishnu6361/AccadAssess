import { randomUUID } from 'crypto';
import { AuditEvent } from '@smartfa/contracts';
import { db } from '../storage/db.js';
import { supabaseAdmin, isLiveSupabaseConfigured } from '../auth/jwt.js';
import { SupabaseClient } from '@supabase/supabase-js';

interface LogAuditParams {
  actorId?: string | null;
  action: string;
  resourceType: string;
  resourceId: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  correlationId?: string;
  ipHash?: string | null;
}

export interface ListAuditEventsParams {
  limit?: number;
  offset?: number;
}

// Configurable client override for isolated unit testing
let activeAuditClientOverride: SupabaseClient | null = null;

export const setAuditClientForTesting = (client: SupabaseClient | null): void => {
  activeAuditClientOverride = client;
};

/**
 * Records an immutable, append-only audit event.
 * Prohibits edits or deletions in accordance with 05_Backend_Schema.
 * Persists to public.audit_events when live Supabase is configured.
 */
export const logAuditEvent = async (params: LogAuditParams): Promise<AuditEvent> => {
  const event: AuditEvent = {
    id: randomUUID(),
    actor_id: params.actorId || null,
    action: params.action,
    resource_type: params.resourceType,
    resource_id: params.resourceId,
    before: params.before || null,
    after: params.after || null,
    correlation_id: params.correlationId || randomUUID(),
    ip_hash: params.ipHash || null,
    created_at: new Date().toISOString()
  };

  // Keep in-memory cache synchronized for local testing and inspection
  db.auditEvents.unshift(event);

  // If live Supabase is active, persist to hosted PostgreSQL public.audit_events
  const isOfflineTest = process.env.NODE_ENV === 'test' || process.env.SMARTFA_TEST_MODE === 'true';
  const client = activeAuditClientOverride || (isOfflineTest ? null : supabaseAdmin);

  if (client) {
    const { error } = await client.from('audit_events').insert({
      id: event.id,
      actor_id: event.actor_id,
      action: event.action,
      resource_type: event.resource_type,
      resource_id: event.resource_id,
      before: event.before as any,
      after: event.after as any,
      correlation_id: event.correlation_id,
      ip_hash: event.ip_hash,
      created_at: event.created_at
    });

    if (error) {
      if (error.code === '23503') {
        const retry = await client.from('audit_events').insert({
          id: event.id,
          actor_id: null,
          action: event.action,
          resource_type: event.resource_type,
          resource_id: event.resource_id,
          before: event.before as any,
          after: event.after as any,
          correlation_id: event.correlation_id,
          ip_hash: event.ip_hash,
          created_at: event.created_at
        });
        if (!retry.error) return event;
      }
      throw new Error(`Audit persistence failed: ${error.message}`);
    }
  }

  return event;
};

/**
 * Retrieves audit events with newest-first ordering (created_at DESC).
 * Enforces production fail-closed invariants and parameter validation.
 * Prohibits silent fallbacks to mock data when live database retrieval fails.
 */
export const listAuditEvents = async (params: ListAuditEventsParams = {}): Promise<AuditEvent[]> => {
  const { limit = 50, offset = 0 } = params;

  if (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1 || limit > 200) {
    const err: any = new Error('Invalid limit parameter: must be an integer between 1 and 200');
    err.code = 'INVALID_PARAMETER';
    throw err;
  }

  if (typeof offset !== 'number' || !Number.isInteger(offset) || offset < 0) {
    const err: any = new Error('Invalid offset parameter: must be a non-negative integer');
    err.code = 'INVALID_PARAMETER';
    throw err;
  }

  const isProduction = process.env.NODE_ENV === 'production';
  const isOfflineTest = process.env.NODE_ENV === 'test' || process.env.SMARTFA_TEST_MODE === 'true';

  // In production, ensure live Supabase credentials are configured; fail closed otherwise
  if (isProduction && !activeAuditClientOverride) {
    const hasProdCreds = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY && (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL));
    if (!hasProdCreds || !isLiveSupabaseConfigured || !supabaseAdmin) {
      throw new Error(
        'CRITICAL CONFIGURATION ERROR: Production mode requires active Supabase credentials for audit retrieval. Offline mock storage is strictly prohibited in production.'
      );
    }
  }

  const client = activeAuditClientOverride || (isOfflineTest ? null : supabaseAdmin);

  if (client) {
    const { data, error } = await client
      .from('audit_events')
      .select('id, actor_id, action, resource_type, resource_id, before, after, correlation_id, ip_hash, created_at')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      throw new Error(`Failed to retrieve audit events from database: ${error.message}`);
    }

    return (data || []).map((row: any) => ({
      id: row.id,
      actor_id: row.actor_id || null,
      action: row.action,
      resource_type: row.resource_type,
      resource_id: row.resource_id,
      before: row.before || null,
      after: row.after || null,
      correlation_id: row.correlation_id,
      ip_hash: row.ip_hash || null,
      created_at: row.created_at
    }));
  }

  // Fallback to in-memory store for offline unit tests and development
  const sorted = [...db.auditEvents].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  return sorted.slice(offset, offset + limit);
};
