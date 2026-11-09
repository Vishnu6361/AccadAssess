import { Request, Response, NextFunction } from 'express';
import { AppRole, Profile } from '@smartfa/contracts';
import { getUserRepository } from '../storage/userRepository.js';

export interface UserContext {
  profile: Profile;
  roles: AppRole[];
  isHOD: boolean;
  activeRole?: AppRole;
}

declare global {
  namespace Express {
    interface Request {
      userContext?: UserContext;
    }
  }
}

interface CachedUserContext {
  context: UserContext;
  expiresAt: number;
}

const userContextCache = new Map<string, CachedUserContext>();
const USER_CONTEXT_CACHE_TTL_MS = 15000; // 15 seconds TTL

export const invalidateUserContextCache = (userId?: string) => {
  if (userId) {
    userContextCache.delete(userId);
  } else {
    userContextCache.clear();
  }
};

/**
 * Loads user profile and authoritative roles strictly from database records.
 * NEVER trusts client-supplied roles in headers, cookies, or request bodies.
 * Uses a short-lived 15s in-memory cache to prevent redundant sequential lookups.
 */
export const loadUserContext = async (req: Request, res: Response, next: NextFunction) => {
  if (!req.user || !req.user.id) {
    return res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication session required'
      }
    });
  }

  const rawActiveRole = (req.headers['x-active-role'] || req.headers['X-Active-Role']) as string | undefined;

  // Check short-lived cache to avoid redundant remote database queries on parallel/rapid requests
  const cached = userContextCache.get(req.user.id);
  if (cached && Date.now() < cached.expiresAt) {
    let activeRole: AppRole | undefined = undefined;
    if (rawActiveRole) {
      if (!cached.context.roles.includes(rawActiveRole as AppRole)) {
        return res.status(403).json({
          error: {
            code: 'FORBIDDEN_ROLE_SWITCH',
            message: `User is not authorized for active workspace role '${rawActiveRole}'. Authorized roles: [${cached.context.roles.join(', ')}]`
          }
        });
      }
      activeRole = rawActiveRole as AppRole;
    }

    req.userContext = {
      ...cached.context,
      activeRole
    };
    return next();
  }

  try {
    const userRepo = getUserRepository();

    // 1. Fetch profile from repository
    const profile = await userRepo.getProfileById(req.user.id);
    if (!profile) {
      return res.status(403).json({
        error: {
          code: 'PROFILE_NOT_FOUND',
          message: 'No institutional profile found for authenticated identity'
        }
      });
    }

    // 2. Enforce active account status invariant
    if (profile.status !== 'active') {
      return res.status(403).json({
        error: {
          code: 'ACCOUNT_INACTIVE',
          message: 'Your account is inactive or pending approval. Contact the Academic HOD.'
        }
      });
    }

    // 3. Fetch active roles from database (users cannot self-write roles)
    const activeRoles = await userRepo.getActiveRolesByUserId(profile.id);

    let activeRole: AppRole | undefined = undefined;
    if (rawActiveRole) {
      if (!activeRoles.includes(rawActiveRole as AppRole)) {
        return res.status(403).json({
          error: {
            code: 'FORBIDDEN_ROLE_SWITCH',
            message: `User is not authorized for active workspace role '${rawActiveRole}'. Authorized roles: [${activeRoles.join(', ')}]`
          }
        });
      }
      activeRole = rawActiveRole as AppRole;
    }

    const context: UserContext = {
      profile,
      roles: activeRoles,
      isHOD: activeRoles.includes('hod'),
      activeRole
    };

    userContextCache.set(req.user.id, {
      context,
      expiresAt: Date.now() + USER_CONTEXT_CACHE_TTL_MS
    });

    req.userContext = context;

    next();
  } catch (err: any) {
    // Fail-closed invariant: Configuration and database errors must never grant access
    const isConfigError = err.message && err.message.includes('CRITICAL CONFIGURATION ERROR');
    if (isConfigError) {
      return res.status(500).json({
        error: {
          code: 'AUTH_MISCONFIGURED',
          message: err.message
        }
      });
    }

    return res.status(500).json({
      error: {
        code: 'DATABASE_ERROR',
        message: 'Failed to retrieve user authorization data from database',
        details: process.env.NODE_ENV !== 'production' ? err.message : undefined
      }
    });
  }
};

/**
 * RBAC Guard: Ensures the authenticated user possesses at least one of the specified roles.
 */
export const requireRoles = (allowedRoles: AppRole[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.userContext) {
      return res.status(500).json({
        error: {
          code: 'SERVER_MISCONFIGURATION',
          message: 'User context was not established before authorization check'
        }
      });
    }

    // 1. Authoritative base role check across user's database-assigned roles
    const hasAllowedRole = req.userContext.roles.some(r => allowedRoles.includes(r));
    if (!hasAllowedRole) {
      return res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: `Access denied. Requires one of roles: [${allowedRoles.join(', ')}]`,
          userRoles: req.userContext.roles
        }
      });
    }

    // 2. Active Workspace Role Guard:
    // If the client explicitly operates within an active workspace (x-active-role header),
    // ensure that workspace role satisfies the permission for this endpoint.
    // Exception: If the endpoint is an HOD-permitted endpoint and the user possesses the database 'hod' role,
    // the HOD's administrative authority is maintained even when operating inside a teaching workspace.
    if (
      req.userContext.activeRole && 
      !allowedRoles.includes(req.userContext.activeRole) &&
      !(allowedRoles.includes('hod') && req.userContext.roles.includes('hod'))
    ) {
      return res.status(403).json({
        error: {
          code: 'WORKSPACE_ROLE_UNAUTHORIZED',
          message: `Endpoint requires one of roles [${allowedRoles.join(', ')}], but current active workspace is '${req.userContext.activeRole}'. Please switch to an authorized workspace.`,
          activeRole: req.userContext.activeRole,
          allowedRoles
        }
      });
    }

    next();
  };
};

/**
 * RBAC Guard: Ensures the authenticated user possesses the authoritative 'hod' role in the database.
 * Does not block if the user's active UI workspace is currently switched to a teaching role.
 */
export const requireHOD = (req: Request, res: Response, next: NextFunction) => {
  if (!req.userContext) {
    return res.status(500).json({
      error: {
        code: 'SERVER_MISCONFIGURATION',
        message: 'User context was not established before authorization check'
      }
    });
  }

  if (!req.userContext.roles.includes('hod')) {
    return res.status(403).json({
      error: {
        code: 'FORBIDDEN',
        message: 'Access denied. Requires active Head of Department (HOD) role.',
        userRoles: req.userContext.roles
      }
    });
  }

  next();
};
