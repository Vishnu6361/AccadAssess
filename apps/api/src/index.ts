import express, { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import cors from 'cors';
import dotenv from 'dotenv';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import { DEV_JWT_SECRET, REAUTH_JWT_SECRET, authenticateJWT, supabaseAdmin, invalidateVerifiedToken } from './auth/jwt.js';
import { loadUserContext, invalidateUserContextCache } from './authorization/rbac.js';
import { getUserRepository } from './storage/userRepository.js';
import { db } from './storage/db.js';

// Route imports
import hodRouter from './admin/hodRoutes.js';
import assessmentRouter from './assessments/assessmentRoutes.js';
import submissionRouter from './submissions/submissionRoutes.js';
import evaluationRouter from './evaluations/evaluationRoutes.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

// Security and utility middlewares

/**
 * Normalizes an origin candidate to protocol://host[:port] in lowercase.
 * Safely strips enclosing quotes, trailing slashes, paths, and trailing whitespace.
 */
export function normalizeOrigin(input: string): string {
  if (!input) return '';
  let cleaned = input.trim();
  // Strip enclosing quotes ('...' or "...")
  if (
    (cleaned.startsWith('"') && cleaned.endsWith('"')) ||
    (cleaned.startsWith("'") && cleaned.endsWith("'"))
  ) {
    cleaned = cleaned.slice(1, -1).trim();
  }
  // Strip trailing slashes
  cleaned = cleaned.replace(/\/+$/, '');
  if (!cleaned) return '';

  // Preserve subdomain wildcard patterns like *.vercel.app or *.institution.edu
  if (cleaned.startsWith('*.')) {
    return cleaned.toLowerCase();
  }

  // Extract origin scheme + host + port
  try {
    const hasProtocol = /^https?:\/\//i.test(cleaned);
    const url = new URL(hasProtocol ? cleaned : `https://${cleaned}`);
    return url.origin.toLowerCase();
  } catch {
    return cleaned.toLowerCase();
  }
}

// Built-in trusted production origins for AcadAssess
const TRUSTED_PRODUCTION_ORIGINS = [
  'https://acad-assess.vercel.app',
  'https://accad-assess.vercel.app',
  'https://acadassess.vercel.app'
];

// Local development origins
const LOCAL_DEV_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost:4000',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:4000'
];

/**
 * Resolves all configured and trusted allowed origins dynamically.
 * Combines built-in production origins with environment variable configurations:
 * CORS_ORIGIN, CORS_ORIGINS, FRONTEND_URL, CLIENT_URL, ALLOWED_ORIGINS.
 */
export function getAllowedOrigins(): Set<string> {
  const allowed = new Set<string>();

  // Always include trusted institutional production frontend origins
  for (const origin of TRUSTED_PRODUCTION_ORIGINS) {
    allowed.add(origin);
  }

  // Include local development origins when not running in strict production
  if (process.env.NODE_ENV !== 'production') {
    for (const origin of LOCAL_DEV_ORIGINS) {
      allowed.add(origin);
    }
  }

  // Collect from all common environment variables
  const envSources = [
    process.env.CORS_ORIGIN,
    process.env.CORS_ORIGINS,
    process.env.FRONTEND_URL,
    process.env.CLIENT_URL,
    process.env.ALLOWED_ORIGINS
  ];

  for (const envVal of envSources) {
    if (!envVal) continue;
    // Split across commas, semicolons, whitespace, or newlines
    const tokens = envVal.split(/[,;\s]+/).map(s => s.trim()).filter(Boolean);
    for (const token of tokens) {
      const normalized = normalizeOrigin(token);
      if (normalized) {
        allowed.add(normalized);
      }
    }
  }

  return allowed;
}

/**
 * Validates whether an incoming HTTP request origin is authorized.
 */
export function isOriginAllowed(origin: string | undefined): boolean {
  // Allow non-browser requests (e.g. mobile apps, curl, server-to-server health probes)
  if (!origin) return true;

  const normalized = normalizeOrigin(origin);
  const allowedSet = getAllowedOrigins();

  // 1. Exact match against allowed origins
  if (allowedSet.has(normalized)) return true;

  // 2. Allow wildcard only in non-production environments if explicitly configured
  if (process.env.NODE_ENV !== 'production' && allowedSet.has('*')) {
    return true;
  }

  // 3. Support explicit subdomain wildcards (e.g. *.vercel.app, *.institution.edu)
  for (const entry of allowedSet) {
    if (entry.startsWith('*.')) {
      const rootDomain = entry.slice(2);
      try {
        const host = new URL(normalized).hostname;
        if (host === rootDomain || host.endsWith('.' + rootDomain)) {
          return true;
        }
      } catch {
        // Ignore parsing errors
      }
    }
  }

  return false;
}

// Authoritative CORS Configuration
export const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    if (isOriginAllowed(origin)) {
      return callback(null, true);
    }
    return callback(new Error(`Origin ${origin} not allowed by CORS`));
  },
  credentials: true,
  methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Active-Role',
    'x-active-role',
    'X-Reauth-Token',
    'x-reauth-token',
    'Accept',
    'Origin',
    'X-Requested-With'
  ],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
  maxAge: 86400,
  optionsSuccessStatus: 204
};

app.use(cors(corsOptions));
// Handle preflight OPTIONS requests across all routes
app.options('*', cors(corsOptions));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Health Check Response Schema
const HealthResponseSchema = z.object({
  status: z.literal('ok'),
  service: z.string(),
  version: z.string(),
  timestamp: z.string(),
  environment: z.string(),
  database_mode: z.enum(['supabase_postgresql', 'in_memory_mock']),
  is_persistent: z.boolean()
});

/**
 * Health Endpoints
 */
const getHealthStatus = () => {
  const isLive = Boolean(
    (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL) &&
    process.env.SUPABASE_SERVICE_ROLE_KEY &&
    process.env.SMARTFA_TEST_MODE !== 'true'
  );
  const payload = {
    status: 'ok' as const,
    service: 'smartfa-api',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    database_mode: isLive ? ('supabase_postgresql' as const) : ('in_memory_mock' as const),
    is_persistent: isLive
  };
  return HealthResponseSchema.parse(payload);
};

app.get('/health', (req: Request, res: Response) => {
  res.status(200).json(getHealthStatus());
});

app.get('/api/v1/health', (req: Request, res: Response) => {
  res.status(200).json(getHealthStatus());
});

// User Identity & Authoritative Context Endpoint
app.get('/api/v1/auth/me', authenticateJWT, loadUserContext, (req: Request, res: Response) => {
  res.status(200).json({
    user: req.user,
    profile: {
      id: req.userContext!.profile.id,
      email: req.userContext!.profile.email,
      full_name: req.userContext!.profile.full_name,
      status: req.userContext!.profile.status
    },
    roles: req.userContext!.roles,
    isHOD: req.userContext!.isHOD,
    activeRole: req.userContext!.activeRole
  });
});

/**
 * Authoritative Portal Access Verification Endpoint
 */
app.post('/api/v1/auth/verify-portal', authenticateJWT, loadUserContext, (req: Request, res: Response) => {
  const { portal } = req.body || {};
  if (!portal || (portal !== 'student' && portal !== 'faculty' && portal !== 'admin')) {
    return res.status(400).json({
      error: {
        code: 'INVALID_PORTAL',
        message: "Portal parameter must be 'student', 'faculty', or 'admin'"
      }
    });
  }

  const { roles, profile, isHOD } = req.userContext!;
  const facultyRoles = ['subject_teacher', 'class_teacher', 'proctor'];
  const hasFacultyRole = roles.some(r => facultyRoles.includes(r as any));

  if (portal === 'student') {
    // Explicitly reject accounts possessing HOD or faculty roles, even if they have a student role
    if (roles.includes('hod') || hasFacultyRole) {
      return res.status(403).json({
        error: {
          code: 'PORTAL_ACCESS_DENIED',
          message: 'Access denied: Accounts with faculty or administrative privileges cannot access the Student Portal.',
          recommendedPortal: roles.includes('hod') ? 'admin' : 'faculty',
          userRoles: roles
        }
      });
    }

    if (!roles.includes('student')) {
      return res.status(403).json({
        error: {
          code: 'PORTAL_ACCESS_DENIED',
          message: 'Access denied: This portal is restricted to enrolled students.',
          recommendedPortal: roles.includes('hod') ? 'admin' : (hasFacultyRole ? 'faculty' : 'student'),
          userRoles: roles
        }
      });
    }

    return res.status(200).json({
      authorized: true,
      portal: 'student',
      profile: {
        id: profile.id,
        email: profile.email,
        full_name: profile.full_name,
        status: profile.status
      },
      roles,
      activeRole: 'student'
    });
  }

  if (portal === 'faculty') {
    // Reject any account possessing the HOD role, regardless of other assigned roles
    if (roles.includes('hod')) {
      return res.status(403).json({
        error: {
          code: 'PORTAL_ACCESS_DENIED',
          message: 'Access denied: Accounts with Head of Department (HOD) privileges must sign in exclusively through the Admin Portal.',
          recommendedPortal: 'admin',
          userRoles: roles
        }
      });
    }

    // Invariant: Faculty Portal strictly rejects accounts possessing the student role
    if (roles.includes('student')) {
      return res.status(403).json({
        error: {
          code: 'PORTAL_ACCESS_DENIED',
          message: 'Access denied: Student accounts cannot access the Faculty Portal.',
          recommendedPortal: 'student',
          userRoles: roles
        }
      });
    }

    if (!hasFacultyRole) {
      return res.status(403).json({
        error: {
          code: 'PORTAL_ACCESS_DENIED',
          message: 'Access denied: This portal is restricted to faculty, instructors, and proctors. Please sign in through your designated portal.',
          recommendedPortal: roles.includes('student') ? 'student' : 'admin',
          userRoles: roles
        }
      });
    }

    return res.status(200).json({
      authorized: true,
      portal: 'faculty',
      profile: {
        id: profile.id,
        email: profile.email,
        full_name: profile.full_name,
        status: profile.status
      },
      roles,
      isHOD: false
    });
  }

  if (portal === 'admin') {
    // Reject any account without the HOD role
    if (!roles.includes('hod')) {
      return res.status(403).json({
        error: {
          code: 'PORTAL_ACCESS_DENIED',
          message: 'Access denied: The Admin Portal is strictly reserved for the Head of Department (HOD).',
          recommendedPortal: hasFacultyRole ? 'faculty' : 'student',
          userRoles: roles
        }
      });
    }

    return res.status(200).json({
      authorized: true,
      portal: 'admin',
      profile: {
        id: profile.id,
        email: profile.email,
        full_name: profile.full_name,
        status: profile.status
      },
      roles,
      isHOD: true,
      activeRole: 'hod'
    });
  }
});

/**
 * Institutional Logout Endpoint
 * Immediately invalidates in-memory verified JWT cache and cached user context.
 */
app.post('/api/v1/auth/logout', authenticateJWT, (req: Request, res: Response) => {
  const token = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.split(' ')[1]
    : undefined;

  if (token) {
    invalidateVerifiedToken(token);
  }
  if (req.user?.id) {
    invalidateUserContextCache(req.user.id);
  }

  res.status(200).json({ success: true, message: 'Institutional session invalidated' });
});

/**
 * Password Confirmation Endpoint for High-Privilege Actions (e.g. Permanent Assignment Deletion)
 * Re-authenticates caller and returns a short-lived single-purpose reauth token.
 * Never logs or persists passwords.
 */
app.post('/api/v1/auth/confirm-password', authenticateJWT, loadUserContext, async (req: Request, res: Response) => {
  const { password, assessment_id, purpose } = req.body || {};
  if (!password || typeof password !== 'string' || !password.trim()) {
    return res.status(400).json({
      error: {
        code: 'MISSING_PASSWORD',
        message: 'Institutional login password is required'
      }
    });
  }

  const user = req.userContext!;
  const email = user.profile.email;
  const isOfflineTestMode = process.env.NODE_ENV === 'test' || process.env.SMARTFA_TEST_MODE === 'true';

  let passwordVerified = false;

  // 1. If live Supabase is configured and not running offline unit tests, verify cryptographically via Supabase Auth
  if (supabaseAdmin && !isOfflineTestMode) {
    try {
      const { data, error } = await supabaseAdmin.auth.signInWithPassword({
        email,
        password: password.trim()
      });

      if (!error && data?.user && data.user.id === user.profile.id) {
        passwordVerified = true;
      }
    } catch {
      passwordVerified = false;
    }
  }

  // 2. In local development / test mode: support test passwords
  if (!passwordVerified && (process.env.NODE_ENV !== 'production' || isOfflineTestMode)) {
    const validTestPasswords = ['testpassword', 'faculty123', 'admin123', 'password123', 'correct_password'];
    if (validTestPasswords.includes(password.trim())) {
      passwordVerified = true;
    }
  }

  if (!passwordVerified) {
    return res.status(401).json({
      error: {
        code: 'INVALID_CREDENTIALS',
        message: 'Incorrect password. Please verify your institutional login password.'
      }
    });
  }

  // Issue short-lived, single-purpose, assignment-scoped reauth token (valid for 5 minutes)
  const reauthToken = jwt.sign(
    {
      sub: user.profile.id,
      email: user.profile.email,
      purpose: purpose || 'assignment_deletion',
      assessment_id: assessment_id || null,
      jti: randomUUID(),
      type: 'reauth'
    },
    REAUTH_JWT_SECRET,
    { expiresIn: '5m' }
  );

  return res.status(200).json({
    confirmed: true,
    reauth_token: reauthToken,
    expires_in: 300
  });
});

// Demo Login Endpoint (Non-production testing)
if (process.env.NODE_ENV !== 'production') {
  app.post('/api/v1/auth/demo-login', async (req: Request, res: Response) => {
    const { email } = req.body || {};
    if (!email) {
      return res.status(400).json({ error: { code: 'MISSING_EMAIL', message: 'Email is required' } });
    }

    try {
      const userRepo = getUserRepository();
      const dbProfile = await userRepo.getProfileByEmail(String(email).trim());
      let resolvedProfile: any = dbProfile;
      let activeRoles: string[] = [];

      if (dbProfile) {
        activeRoles = await userRepo.getActiveRolesByUserId(dbProfile.id);
      } else {
        const inMemProfile = db.profiles.find((p: any) => p.email.toLowerCase() === String(email).trim().toLowerCase());
        if (!inMemProfile) {
          return res.status(404).json({ error: { code: 'PROFILE_NOT_FOUND', message: `Profile not found for email: ${email}` } });
        }
        resolvedProfile = inMemProfile;
        activeRoles = db.roles.filter((r: any) => r.user_id === inMemProfile.id && r.active).map((r: any) => r.role);
      }

      if (!resolvedProfile) {
        return res.status(404).json({ error: { code: 'PROFILE_NOT_FOUND', message: 'User profile not found' } });
      }

      const token = jwt.sign({ sub: resolvedProfile.id, email: resolvedProfile.email }, DEV_JWT_SECRET, { expiresIn: '8h' });

      return res.status(200).json({
        token,
        user: {
          id: resolvedProfile.id,
          email: resolvedProfile.email
        },
        profile: {
          id: resolvedProfile.id,
          email: resolvedProfile.email,
          full_name: resolvedProfile.full_name,
          status: resolvedProfile.status
        },
        roles: activeRoles,
        isHOD: activeRoles.includes('hod')
      });
    } catch (err: any) {
      return res.status(500).json({ error: { code: 'AUTH_ERROR', message: err?.message || 'Login error' } });
    }
  });
}

// Mount API routes
app.use('/api/v1/admin/hod', hodRouter);
app.use('/api/v1/assessments', assessmentRouter);
app.use('/api/v1/submissions', submissionRouter);
app.use('/api/v1/evaluations', evaluationRouter);

/**
 * Root Info Endpoint
 */
app.get('/', (req: Request, res: Response) => {
  res.status(200).json({
    name: 'SmartFA Trusted API',
    description: 'Institutional Formative Assessment and Evaluation API',
    version: '1.0.0',
    documentation: '/docs',
    health: '/health'
  });
});

/**
 * Global 404 Not Found Handler
 */
app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: `Cannot ${req.method} ${req.originalUrl}`
    }
  });
});

/**
 * Global Error Handler
 */
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  if (err instanceof z.ZodError) {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request payload',
        details: err.errors
      }
    });
  }

  if (err.message && err.message.includes('not allowed by CORS')) {
    console.warn(`[CORS Blocked]: ${err.message}`);
    return res.status(403).json({
      error: {
        code: 'CORS_FORBIDDEN',
        message: err.message
      }
    });
  }

  console.error('[API Error]:', err);
  return res.status(500).json({
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected internal error occurred'
    }
  });
});

const isTestExecution = 
  process.env.NODE_ENV === 'test' || 
  process.env.SMARTFA_TEST_MODE === 'true' ||
  (process.argv[1] && (process.argv[1].includes('verification') || process.argv[1].includes('test') || process.argv[1].includes('provision')));

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Unhandled Rejection at]:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[Uncaught Exception]:', err);
});

if (!isTestExecution) {
  app.listen(PORT, () => {
    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const isLive = Boolean(supabaseUrl && process.env.SUPABASE_SERVICE_ROLE_KEY);
    console.log(`[SmartFA API] Running on http://localhost:${PORT}`);
    if (isLive) {
      console.log(`[DATABASE] Connected to Supabase PostgreSQL at ${supabaseUrl}`);
    } else {
      console.warn(`[DATABASE NOTICE] Running in IN_MEMORY_MOCK mode. PostgreSQL database not connected. Data persistence is disabled.`);
    }
  });
}

export default app;
