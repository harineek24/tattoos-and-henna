import { supabase, isSupabaseConfigured } from './supabase';
import type { Design } from '../types';
import { v4 as uuidv4 } from 'uuid';

// Fallback local designs when Supabase isn't configured
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

// Seed designs — transparent henna/tattoo PNGs bundled in public/designs/
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
  if (isSupabaseConfigured()) {
    const { data, error } = await supabase
      .from('designs')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Supabase fetch error:', error);
      return [...SEED_DESIGNS, ...getLocalDesigns()];
    }
    return [...SEED_DESIGNS, ...(data || [])];
  }

  return [...SEED_DESIGNS, ...getLocalDesigns()];
}

export async function saveDesign(name: string, dataUrl: string): Promise<Design | null> {
  const id = uuidv4();

  if (isSupabaseConfigured()) {
    // Convert data URL to blob
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    const filePath = `designs/${id}.png`;

    const { error: uploadError } = await supabase.storage
      .from('designs')
      .upload(filePath, blob, { contentType: 'image/png' });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      return null;
    }

    const { data: urlData } = supabase.storage
      .from('designs')
      .getPublicUrl(filePath);

    const design: Design = {
      id,
      name,
      image_url: urlData.publicUrl,
      created_at: new Date().toISOString(),
    };

    const { error: insertError } = await supabase
      .from('designs')
      .insert(design);

    if (insertError) {
      console.error('Insert error:', insertError);
      return null;
    }

    return design;
  }

  // Local fallback
  const design: Design = {
    id,
    name,
    image_url: dataUrl,
    created_at: new Date().toISOString(),
  };
  const locals = getLocalDesigns();
  locals.unshift(design);
  saveLocalDesigns(locals);
  return design;
}
