import { sql, isNeonConfigured } from './neon';
import type { Design } from '../types';
import { v4 as uuidv4 } from 'uuid';

const LOCAL_STORAGE_KEY = 'tattoo-designs';

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
