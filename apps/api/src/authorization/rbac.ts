import { Request, Response, NextFunction } from 'express';
import { AppRole, Profile } from '@smartfa/contracts';
import { db } from '../storage/db.js';

export interface UserContext {
  profile: Profile;
  roles: AppRole[];
  isHOD: boolean;
}

declare global {
  namespace Express {
    interface Request {
      userContext?: UserContext;
    }
  }
}

/**
 * Loads user profile and authoritative roles strictly from database records.
 * NEVER trusts client-supplied roles in headers, cookies, or request bodies.
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

  // 1. Fetch profile from database
  const profile = db.profiles.find(p => p.id === req.user?.id);
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
        message: 'Your account is inactive or pending approval. Contact the Department HOD.'
      }
    });
  }

  // 3. Fetch active roles from database (users cannot self-write roles)
  const activeRoles = db.roles
    .filter(r => r.user_id === profile.id && r.active)
    .map(r => r.role);

  req.userContext = {
    profile,
    roles: activeRoles,
    isHOD: activeRoles.includes('hod')
  };

  next();
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

    next();
  };
};
