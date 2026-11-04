import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import { DEV_JWT_SECRET, authenticateJWT } from './auth/jwt.js';
import { loadUserContext } from './authorization/rbac.js';
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
  if (!portal || (portal !== 'student' && portal !== 'faculty')) {
    return res.status(400).json({
      error: {
        code: 'INVALID_PORTAL',
        message: "Portal parameter must be either 'student' or 'faculty'"
      }
    });
  }

  const { roles, profile, isHOD } = req.userContext!;

  if (portal === 'student') {
    if (!roles.includes('student')) {
      return res.status(403).json({
        error: {
          code: 'PORTAL_ACCESS_DENIED',
          message: 'Access denied: This portal is restricted to students. Your account has faculty/staff credentials. Please sign in through the Faculty Portal.',
          recommendedPortal: 'faculty',
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
    const staffRoles = ['subject_teacher', 'class_teacher', 'proctor', 'hod'];
    const hasStaffRole = roles.some(r => staffRoles.includes(r as any));

    if (!hasStaffRole) {
      return res.status(403).json({
        error: {
          code: 'PORTAL_ACCESS_DENIED',
          message: 'Access denied: This portal is restricted to faculty, instructors, and academic administrators. Please sign in through the Student Portal.',
          recommendedPortal: 'student',
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
      isHOD
    });
  }
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
