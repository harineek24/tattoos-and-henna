import { neon } from '@neondatabase/serverless';

const rawUrl: string = import.meta.env.VITE_NEON_DATABASE_URL || '';

// Strip channel_binding param — the HTTP driver doesn't support it and it
// causes a "not a valid URL" error in the neon() constructor.
function sanitizeUrl(url: string): string {
  if (!url) return url;
  try {
    const u = new URL(url);
    u.searchParams.delete('channel_binding');
    return u.toString();
  } catch {
    // If it doesn't parse as a URL, return as-is and let neon() report the error
    return url;
  }
}

const databaseUrl = sanitizeUrl(rawUrl);

export const sql = databaseUrl ? neon(databaseUrl) : null;

export const isNeonConfigured = () => databaseUrl.length > 0;

/**
 * Run this once in the Neon SQL Editor to create the designs table:
 *
 * CREATE TABLE IF NOT EXISTS designs (
 *   id TEXT PRIMARY KEY,
 *   name TEXT NOT NULL,
 *   image_url TEXT NOT NULL,
 *   created_at TIMESTAMPTZ DEFAULT NOW()
 * );
 */
