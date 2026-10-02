import { Router } from 'express';
import type pg from 'pg';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';
import {
  clearSessionCookie,
  createSession,
  deleteSession,
  readCookie,
  sessionCookie,
  SESSION_COOKIE
} from '../services/sessions.js';

/**
 * Development identity picker. The browser sends a user id.
 * Roles are read from the database when the session is used.
 */
export function sessionRouter(db: pg.Pool): Router {
  const router = Router();

  router.get('/demo-users', async (_req, res) => {
    const result = await db.query(
      `
        SELECT
          u.id,
          u.email,
          u.display_name,
          COALESCE(array_agg(r.code ORDER BY r.code) FILTER (WHERE r.code IS NOT NULL), '{}') AS roles
        FROM users u
        LEFT JOIN user_roles ur ON ur.user_id = u.id
        LEFT JOIN roles r ON r.id = ur.role_id
        WHERE u.active = TRUE
        GROUP BY u.id
        ORDER BY u.display_name
      `
    );
    return res.json({
      users: result.rows.map((row) => ({
        id: String(row.id),
        email: String(row.email),
        displayName: String(row.display_name),
        roles: Array.isArray(row.roles) ? row.roles.map(String) : []
      }))
    });
  });

  router.post('/login', async (req, res) => {
    const userId = String(req.body?.userId || '');
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }
    const found = await db.query(
      'SELECT id FROM users WHERE id = $1 AND active = TRUE',
      [userId]
    );
    if (!found.rowCount) {
      return res.status(404).json({ error: 'Demo user not found' });
    }
    const session = await createSession(db, userId);
    res.setHeader('Set-Cookie', sessionCookie(session.token));
    return res.json({ ok: true });
  });

  router.post('/logout', async (req, res) => {
    const token = readCookie(req.headers.cookie, SESSION_COOKIE);
    await deleteSession(db, token);
    res.setHeader('Set-Cookie', clearSessionCookie());
    return res.json({ ok: true });
  });

  router.get('/me', requireAuth(db), (req: AuthedRequest, res) => {
    return res.json({ user: req.user });
  });

  return router;
}
