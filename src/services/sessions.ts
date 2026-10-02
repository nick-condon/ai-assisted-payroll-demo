import { createHash, randomBytes } from 'node:crypto';
import type pg from 'pg';

export const SESSION_COOKIE = 'demo_session';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

export type DemoUser = {
  id: string;
  email: string;
  displayName: string;
  roles: string[];
};

export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function newSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

export async function createSession(
  db: pg.Pool,
  userId: string
): Promise<{ token: string; expiresAt: Date }> {
  const token = newSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.query(
    `INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
    [userId, hashToken(token), expiresAt.toISOString()]
  );
  return { token, expiresAt };
}

export async function deleteSession(db: pg.Pool, token: string | undefined): Promise<void> {
  if (!token) return;
  await db.query('DELETE FROM sessions WHERE token_hash = $1', [hashToken(token)]);
}

export async function loadUserBySessionToken(
  db: pg.Pool,
  token: string | undefined
): Promise<DemoUser | null> {
  if (!token) return null;
  const result = await db.query(
    `
      SELECT
        u.id,
        u.email,
        u.display_name,
        u.active,
        COALESCE(array_agg(r.code) FILTER (WHERE r.code IS NOT NULL), '{}') AS roles
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      LEFT JOIN user_roles ur ON ur.user_id = u.id
      LEFT JOIN roles r ON r.id = ur.role_id
      WHERE s.token_hash = $1
        AND s.expires_at > now()
      GROUP BY u.id
    `,
    [hashToken(token)]
  );
  const row = result.rows[0];
  if (!row || row.active !== true) return null;
  return {
    id: String(row.id),
    email: String(row.email),
    displayName: String(row.display_name),
    roles: Array.isArray(row.roles) ? row.roles.map(String) : []
  };
}

export function sessionCookie(token: string): string {
  const maxAge = Math.floor(SESSION_TTL_MS / 1000);
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}

export function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`;
}

export function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator <= 0) continue;
    const key = part.slice(0, separator).trim();
    if (key !== name) continue;
    return decodeURIComponent(part.slice(separator + 1).trim());
  }
  return undefined;
}
