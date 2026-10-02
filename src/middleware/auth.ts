import type { NextFunction, Request, Response } from 'express';
import type pg from 'pg';
import {
  loadUserBySessionToken,
  readCookie,
  SESSION_COOKIE,
  type DemoUser
} from '../services/sessions.js';

export type AuthedRequest = Request & { user?: DemoUser };

export function requireAuth(db: pg.Pool) {
  return async (req: AuthedRequest, res: Response, next: NextFunction) => {
    try {
      const token = readCookie(req.headers.cookie, SESSION_COOKIE);
      const user = await loadUserBySessionToken(db, token);
      if (!user) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      req.user = user;
      return next();
    } catch (error) {
      console.error(error);
      return res.status(401).json({ error: 'Authentication required' });
    }
  };
}

/**
 * Roles are loaded from the database onto the session user.
 * The client cannot supply a role that this check will trust.
 */
export function requireRole(...allowed: string[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    const roles = req.user?.roles ?? [];
    if (!roles.some((role) => allowed.includes(role))) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    return next();
  };
}
