import { randomUUID } from 'crypto';
import { AuditEvent } from '@smartfa/contracts';
import { db } from '../storage/db.js';

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

/**
 * Records an immutable, append-only audit event.
 * Prohibits edits or deletions in accordance with 05_Backend_Schema.
 */
export const logAuditEvent = (params: LogAuditParams): AuditEvent => {
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

  db.auditEvents.unshift(event);
  return event;
};
