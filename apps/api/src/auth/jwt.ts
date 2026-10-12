import { Request, Response, NextFunction } from 'express';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';

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

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const isLiveSupabaseConfigured = Boolean(supabaseUrl && supabaseServiceKey);

export const supabaseAdmin: SupabaseClient | null = isLiveSupabaseConfigured
  ? createClient(supabaseUrl!, supabaseServiceKey!)
  : null;

// Dev secret used exclusively for local testing signature verification
const DEV_JWT_SECRET = process.env.JWT_DEV_SECRET || 'smartfa-test-hmac-dev-secret-key-32chars';

/**
 * Middleware: Verify Supabase JWT access token from Authorization header.
 * Strictly adheres to:
 * - 02_TRD_Formative_Assessment_Web_System.pdf (Section 4)
 * - Production safety: Fallback is STRICTLY PROHIBITED in production mode.
 */
export const authenticateJWT = async (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Missing or malformed Authorization Bearer header'
      }
    });
  }

  const token = authHeader.split(' ')[1];

  // 1. If live Supabase is configured, verify cryptographically via Supabase Auth
  if (supabaseAdmin) {
    try {
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
