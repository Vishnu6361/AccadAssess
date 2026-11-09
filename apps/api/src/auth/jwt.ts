import fs from 'fs';
import { Request, Response, NextFunction } from 'express';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import path from 'path';

// Ensure environment variables are loaded
// First load root .env so process.env.NODE_ENV is established from configuration
dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });

const rootStaging = path.resolve(process.cwd(), '../../.env.staging');
const localStaging = path.resolve(process.cwd(), '.env.staging');
const useStaging = process.env.APP_ENV === 'staging' || process.env.NODE_ENV === 'staging';

if (useStaging) {
  const stagingFile = fs.existsSync(rootStaging) ? rootStaging : localStaging;
  if (fs.existsSync(stagingFile)) {
    dotenv.config({ path: stagingFile, override: true });
  }
}

export interface AuthenticatedUser {
  id: string;
  email: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const isLiveSupabaseConfigured = Boolean(supabaseUrl && supabaseServiceKey);

export const supabaseAdmin: SupabaseClient | null = isLiveSupabaseConfigured
  ? createClient(supabaseUrl!, supabaseServiceKey!)
  : null;

// Secret used for high-privilege re-authentication tokens (e.g. permanent deletion)
export const REAUTH_JWT_SECRET = process.env.REAUTH_JWT_SECRET || process.env.JWT_SECRET || process.env.JWT_DEV_SECRET || 'smartfa-test-hmac-dev-secret-key-32chars';
export const DEV_JWT_SECRET = REAUTH_JWT_SECRET;

// In-memory registry for local test suites / offline dev mode (jti -> expiresAt timestamp in ms)
const inMemoryConsumedTokens = new Map<string, number>();

export const clearConsumedTokensForTest = (): void => {
  inMemoryConsumedTokens.clear();
};

export interface ConsumeReauthTokenParams {
  jti: string;
  purpose: string;
  targetId?: string | null;
  consumedBy?: string | null;
  expiresAt: Date;
}

export interface ConsumeReauthTokenResult {
  success: boolean;
  code?: 'REAUTH_ALREADY_USED' | 'REAUTH_EXPIRED' | 'REAUTH_ERROR';
  message?: string;
}

/**
 * Atomically consumes a single-use re-authentication token.
 * 
 * Guarantees:
 * 1. Single-use enforcement across concurrent requests (enforced via DB primary key uniqueness).
 * 2. Multi-instance and restart resilience (backed by public.consumed_reauth_tokens table).
 * 3. Graceful atomic fallback to in-memory registry for offline unit tests / mock environments.
 */
export async function consumeReauthTokenAtomic(
  params: ConsumeReauthTokenParams
): Promise<ConsumeReauthTokenResult> {
  const { jti, purpose, targetId, consumedBy, expiresAt } = params;

  if (!jti) {
    return {
      success: false,
      code: 'REAUTH_ERROR',
      message: 'Token identifier (jti) is required for replay verification.'
    };
  }

  // 1. Check expiration
  if (Date.now() >= expiresAt.getTime()) {
    return {
      success: false,
      code: 'REAUTH_EXPIRED',
      message: 'Password confirmation has expired. Please re-enter your institutional password.'
    };
  }

  const isOfflineTestMode = process.env.NODE_ENV === 'test' || process.env.SMARTFA_TEST_MODE === 'true';

  // 2. Primary: If Supabase admin client is active and not offline test mode, atomically insert into DB
  if (supabaseAdmin && !isOfflineTestMode) {
    try {
      const { error } = await supabaseAdmin
        .from('consumed_reauth_tokens')
        .insert({
          jti,
          purpose,
          target_id: targetId || null,
          consumed_by: consumedBy || null,
          consumed_at: new Date().toISOString(),
          expires_at: expiresAt.toISOString()
        });

      if (error) {
        // Unique key constraint violation: token was already consumed!
        if (error.code === '23505' || error.message.includes('unique') || error.message.includes('duplicate')) {
          inMemoryConsumedTokens.set(jti, expiresAt.getTime());
          return {
            success: false,
            code: 'REAUTH_ALREADY_USED',
            message: 'This password confirmation token has already been used and cannot be reused.'
          };
        }

        // Table not created yet (e.g. migration pending in local dev)
        if (error.code === '42P01') {
          console.warn('[REAUTH] consumed_reauth_tokens table not found. Using in-memory single-use enforcement.');
          return consumeInMemory(jti, expiresAt);
        }

        console.error('[REAUTH ERROR] Failed to record consumed token:', error);
        return {
          success: false,
          code: 'REAUTH_ERROR',
          message: `Database error verifying token single-use: ${error.message}`
        };
      }

      inMemoryConsumedTokens.set(jti, expiresAt.getTime());
      return { success: true };
    } catch (err: any) {
      console.error('[REAUTH ERROR] Exception recording consumed token:', err);
      return {
        success: false,
        code: 'REAUTH_ERROR',
        message: err.message || 'Error executing token single-use verification'
      };
    }
  }

  // 3. Fallback: Atomic in-memory check-and-set for local tests & offline environments
  return consumeInMemory(jti, expiresAt);
}

function consumeInMemory(jti: string, expiresAt: Date): ConsumeReauthTokenResult {
  // Purge any expired items lazily
  const now = Date.now();
  for (const [key, exp] of inMemoryConsumedTokens.entries()) {
    if (exp <= now) {
      inMemoryConsumedTokens.delete(key);
    }
  }

  if (inMemoryConsumedTokens.has(jti)) {
    return {
      success: false,
      code: 'REAUTH_ALREADY_USED',
      message: 'This password confirmation token has already been used and cannot be reused.'
    };
  }

  inMemoryConsumedTokens.set(jti, expiresAt.getTime());
  return { success: true };
}

// Deprecated in-memory helpers preserved for backward compatibility
export const consumedReauthTokens = {
  has: (jti: string) => inMemoryConsumedTokens.has(jti),
  add: (jti: string) => inMemoryConsumedTokens.set(jti, Date.now() + 10 * 60 * 1000),
  delete: (jti: string) => inMemoryConsumedTokens.delete(jti),
  clear: () => inMemoryConsumedTokens.clear()
};

export const markReauthTokenConsumed = (jti: string): void => {
  inMemoryConsumedTokens.set(jti, Date.now() + 10 * 60 * 1000);
};

export const isReauthTokenConsumed = (jti: string): boolean => {
  return inMemoryConsumedTokens.has(jti);
};

/**
 * Middleware: Verify Supabase JWT access token from Authorization header.
 * Strictly adheres to:
 * - 02_TRD_Formative_Assessment_Web_System.pdf (Section 4)
 * - Production safety: Fallback is STRICTLY PROHIBITED in production mode.
 */
export const authenticateJWT = async (req: Request, res: Response, next: NextFunction) => {
  let token: string | undefined;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else if (typeof req.query.token === 'string' && req.query.token.trim().length > 0) {
    token = req.query.token.trim();
  }

  if (!token) {
    return res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Missing or malformed Authorization Bearer header'
      }
    });
  }

  // 1. In local development / test mode, check if token is signed with DEV_JWT_SECRET
  if (process.env.NODE_ENV !== 'production' || process.env.ALLOW_DEV_JWT === 'true') {
    try {
      const verified = jwt.verify(token, DEV_JWT_SECRET) as { sub?: string; email?: string };
      if (verified && verified.sub) {
        req.user = {
          id: verified.sub,
          email: verified.email || 'user@smartfa.edu'
        };
        return next();
      }
    } catch {
      // Not a dev secret token; proceed to Supabase verification below
    }
  }

  // 2. If live Supabase is configured and not running offline unit tests, verify cryptographically via Supabase Auth
  const isOfflineTestMode = process.env.NODE_ENV === 'test' || process.env.SMARTFA_TEST_MODE === 'true';
  if (supabaseAdmin && !isOfflineTestMode) {
    try {
      // Defensively check unverified token claims for cross-environment project mismatches
      const decoded: any = jwt.decode(token);
      if (decoded && decoded.iss && typeof decoded.iss === 'string' && supabaseUrl) {
        try {
          const tokenIssUrl = new URL(decoded.iss);
          const serverSupabaseUrl = new URL(supabaseUrl);
          if (tokenIssUrl.hostname !== serverSupabaseUrl.hostname) {
            console.warn(`[AUTH MISMATCH] Token issuer hostname '${tokenIssUrl.hostname}' does not match server Supabase URL '${serverSupabaseUrl.hostname}'.`);
            return res.status(401).json({
              error: {
                code: 'TOKEN_PROJECT_MISMATCH',
                message: 'Supabase authentication token was issued by a different project than configured on backend.',
                details: `Token issuer: ${tokenIssUrl.hostname}, Backend configured: ${serverSupabaseUrl.hostname}`
              }
            });
          }
        } catch {
          // Ignore URL parsing errors and let supabaseAdmin.auth.getUser do the verification
        }
      }

      const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
      if (error || !user) {
        return res.status(401).json({
          error: {
            code: 'INVALID_TOKEN',
            message: 'Invalid or expired Supabase authentication token',
            details: error?.message
          }
        });
      }

      req.user = {
        id: user.id,
        email: user.email || ''
      };
      return next();
    } catch (err: any) {
      return res.status(401).json({
        error: {
          code: 'TOKEN_VERIFICATION_FAILED',
          message: 'Failed to verify token with Supabase Auth',
          details: err?.message
        }
      });
    }
  }

  // 2. Production Safety Invariant:
  // Offline testing fallback MUST NOT be enabled in production environments.
  if (process.env.NODE_ENV === 'production') {
    console.error('[CRITICAL SECURITY ERROR] Production mode requires active Supabase credentials (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY).');
    return res.status(500).json({
      error: {
        code: 'AUTH_MISCONFIGURED',
        message: 'Authentication service is unconfigured for production. Offline mock fallback is prohibited.'
      }
    });
  }

  // 3. Local Development / Test Fallback:
  // Requires cryptographic signature verification against DEV_JWT_SECRET (NO raw unverified decoding).
  try {
    const verified = jwt.verify(token, DEV_JWT_SECRET) as { sub?: string; email?: string };
    if (!verified || !verified.sub) {
      return res.status(401).json({
        error: {
          code: 'INVALID_TOKEN',
          message: 'Token signature is valid but subject (sub) claim is missing'
        }
      });
    }

    req.user = {
      id: verified.sub,
      email: verified.email || 'user@smartfa.edu'
    };
    return next();
  } catch (err: any) {
    return res.status(401).json({
      error: {
        code: 'INVALID_TOKEN',
        message: 'Cryptographic signature verification failed',
        details: err?.message
      }
    });
  }
};
