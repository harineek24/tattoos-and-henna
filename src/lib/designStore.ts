import { sql, isNeonConfigured } from './neon';
import type { Design, SharedCreation } from '../types';
import { v4 as uuidv4 } from 'uuid';

const LOCAL_STORAGE_KEY = 'tattoo-designs';
const COMMUNITY_STORAGE_KEY = 'tattoo-community';

const getLocalDesigns = (): Design[] => {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

const saveLocalDesigns = (designs: Design[]) => {
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(designs));
};

// Seed designs bundled in public/designs/
const SEED_DESIGNS: Design[] = [
  { id: 'seed-1', name: 'Mandala Flower', image_url: '/designs/mandala-flower.svg', created_at: '2024-01-01' },
  { id: 'seed-2', name: 'Lotus', image_url: '/designs/lotus.svg', created_at: '2024-01-01' },
  { id: 'seed-3', name: 'Paisley', image_url: '/designs/paisley.svg', created_at: '2024-01-01' },
  { id: 'seed-4', name: 'Sun Mandala', image_url: '/designs/sun-mandala.svg', created_at: '2024-01-01' },
  { id: 'seed-5', name: 'Vine', image_url: '/designs/vine.svg', created_at: '2024-01-01' },
  { id: 'seed-6', name: 'Rose', image_url: '/designs/rose.svg', created_at: '2024-01-01' },
  { id: 'seed-7', name: 'Geometric Diamond', image_url: '/designs/geometric-diamond.svg', created_at: '2024-01-01' },
  { id: 'seed-8', name: 'Crescent Moon', image_url: '/designs/crescent-moon.svg', created_at: '2024-01-01' },
  { id: 'seed-9', name: 'Butterfly', image_url: '/designs/butterfly.svg', created_at: '2024-01-01' },
  { id: 'seed-10', name: 'Hamsa', image_url: '/designs/hamsa.svg', created_at: '2024-01-01' },
  { id: 'seed-11', name: 'Elephant', image_url: '/designs/elephant.svg', created_at: '2024-01-01' },
  { id: 'seed-12', name: 'Feather', image_url: '/designs/feather.svg', created_at: '2024-01-01' },
];

export async function fetchDesigns(): Promise<Design[]> {
  if (isNeonConfigured() && sql) {
    try {
      const rows = await sql`SELECT id, name, image_url, created_at FROM designs ORDER BY created_at DESC`;
      const neonDesigns: Design[] = rows.map((r) => ({
        id: r.id as string,
        name: r.name as string,
        image_url: r.image_url as string,
        created_at: r.created_at as string,
      }));
      return [...SEED_DESIGNS, ...neonDesigns];
    } catch (err) {
      console.error('Neon fetch error:', err);
      return [...SEED_DESIGNS, ...getLocalDesigns()];
    }
  }

  return [...SEED_DESIGNS, ...getLocalDesigns()];
}

export async function saveDesign(name: string, dataUrl: string): Promise<Design | null> {
  const id = uuidv4();
  const now = new Date().toISOString();

  if (isNeonConfigured() && sql) {
    try {
      // Store the base64 data URL directly in the DB — no separate file storage needed
      await sql`INSERT INTO designs (id, name, image_url, created_at) VALUES (${id}, ${name}, ${dataUrl}, ${now})`;
      return { id, name, image_url: dataUrl, created_at: now };
    } catch (err) {
      console.error('Neon insert error:', err);
      return null;
    }
  }

  // Local fallback
  const design: Design = { id, name, image_url: dataUrl, created_at: now };
  const locals = getLocalDesigns();
  locals.unshift(design);
  saveLocalDesigns(locals);
  return design;
}

export async function deleteDesign(id: string): Promise<boolean> {
  // Don't allow deleting seed designs
  if (id.startsWith('seed-')) return false;

  if (isNeonConfigured() && sql) {
    try {
      await sql`DELETE FROM designs WHERE id = ${id}`;
      return true;
    } catch (err) {
      console.error('Neon delete error:', err);
      return false;
    }
  }

  const locals = getLocalDesigns();
  const filtered = locals.filter((d) => d.id !== id);
  if (filtered.length === locals.length) return false;
  saveLocalDesigns(filtered);
  return true;
}

// ─── Community / Shared Creations ───────────────────────────────────

const getLocalCommunity = (): SharedCreation[] => {
  try {
    const raw = localStorage.getItem(COMMUNITY_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

const saveLocalCommunity = (items: SharedCreation[]) => {
  localStorage.setItem(COMMUNITY_STORAGE_KEY, JSON.stringify(items));
};

async function ensureCommunityTable(): Promise<void> {
  if (!sql) return;
  try {
    await sql`CREATE TABLE IF NOT EXISTS shared_creations (
      id TEXT PRIMARY KEY,
      author TEXT NOT NULL,
      image_url TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`;
  } catch (err) {
    console.error('Failed to create shared_creations table:', err);
  }
}

let communityTableReady: Promise<void> | null = null;

function getCommunityTableReady(): Promise<void> {
  if (!communityTableReady && isNeonConfigured()) {
    communityTableReady = ensureCommunityTable();
  }
  return communityTableReady ?? Promise.resolve();
}

export async function fetchCommunityCreations(): Promise<SharedCreation[]> {
  if (isNeonConfigured() && sql) {
    await getCommunityTableReady();
    try {
      const rows = await sql`SELECT id, author, image_url, created_at FROM shared_creations ORDER BY created_at DESC`;
      return rows.map((r) => ({
        id: r.id as string,
        author: r.author as string,
        image_url: r.image_url as string,
        created_at: r.created_at as string,
      }));
    } catch (err) {
      console.error('Neon community fetch error:', err);
      return getLocalCommunity();
    }
  }
  return getLocalCommunity();
}

export async function saveSharedCreation(author: string, dataUrl: string): Promise<SharedCreation | null> {
  const id = uuidv4();
  const now = new Date().toISOString();

  if (isNeonConfigured() && sql) {
    await getCommunityTableReady();
    try {
      await sql`INSERT INTO shared_creations (id, author, image_url, created_at) VALUES (${id}, ${author}, ${dataUrl}, ${now})`;
      return { id, author, image_url: dataUrl, created_at: now };
    } catch (err) {
      console.error('Neon community insert error:', err);
      return null;
    }
  }

  // Local fallback
  const creation: SharedCreation = { id, author, image_url: dataUrl, created_at: now };
  const locals = getLocalCommunity();
  locals.unshift(creation);
  saveLocalCommunity(locals);
  return creation;
}

export async function deleteCommunityCreation(id: string): Promise<boolean> {
  if (isNeonConfigured() && sql) {
    await getCommunityTableReady();
    try {
      await sql`DELETE FROM shared_creations WHERE id = ${id}`;
      return true;
    } catch (err) {
      console.error('Neon community delete error:', err);
      return false;
    }
  }

  const locals = getLocalCommunity();
  const filtered = locals.filter((c) => c.id !== id);
  if (filtered.length === locals.length) return false;
  saveLocalCommunity(filtered);
  return true;
}
