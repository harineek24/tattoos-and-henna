import { neon } from '@neondatabase/serverless';

const databaseUrl = import.meta.env.VITE_NEON_DATABASE_URL || '';

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
