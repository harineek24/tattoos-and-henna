import { useEffect, useState, useCallback } from 'react';
import type { Design } from '../types';
import { fetchDesigns, deleteDesign } from '../lib/designStore';

interface DesignGalleryProps {
  refreshTrigger: number;
}

export default function DesignGallery({ refreshTrigger }: DesignGalleryProps) {
  const [designs, setDesigns] = useState<Design[]>([]);
  const [loading, setLoading] = useState(true);

  const loadDesigns = useCallback(async () => {
    setLoading(true);
    const data = await fetchDesigns();
    setDesigns(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadDesigns();
  }, [loadDesigns, refreshTrigger]);

  const handleDragStart = (e: React.DragEvent, design: Design) => {
    e.dataTransfer.setData('design-url', design.image_url);
    e.dataTransfer.effectAllowed = 'copy';
  };

  const handleDelete = async (e: React.MouseEvent, design: Design) => {
    e.stopPropagation();
    e.preventDefault();
    const ok = await deleteDesign(design.id);
    if (ok) {
      setDesigns((prev) => prev.filter((d) => d.id !== design.id));
    }
  };

  return (
    <div className="h-full flex flex-col bg-white">
      <div className="flex items-center justify-end px-3 py-1.5 border-b border-[var(--border)]">
        <span className="text-xs text-[var(--text-muted)]">{designs.length} designs</span>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {loading ? (
          <div className="flex items-center justify-center h-full text-[var(--text-muted)] text-sm">
            Loading designs...
          </div>
        ) : designs.length === 0 ? (
          <div className="flex items-center justify-center h-full text-[var(--text-muted)] text-sm text-center px-4">
            No designs yet. Draw one below and save it!
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {designs.map((design) => (
              <div
                key={design.id}
                draggable
                onDragStart={(e) => handleDragStart(e, design)}
                className="aspect-square rounded-xl bg-gray-50 border border-[var(--border)]
                           hover:border-[var(--accent)] hover:shadow-sm cursor-grab active:cursor-grabbing
                           transition-all flex items-center justify-center p-2 group relative"
                title={design.name}
              >
                <img
                  src={design.image_url}
                  alt={design.name}
                  className="w-full h-full object-contain select-none"
                  draggable={false}
                  loading="lazy"
                />
                <div className="absolute inset-x-0 bottom-0 bg-white/90 text-[10px] text-center py-0.5
                                rounded-b-xl opacity-0 group-hover:opacity-100 transition-opacity truncate px-1
                                text-[var(--text-muted)]">
                  {design.name}
                </div>
                {/* Delete button — only for user-created designs (not seed) */}
                {!design.id.startsWith('seed-') && (
                  <button
                    onClick={(e) => handleDelete(e, design)}
                    className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/50 hover:bg-red-500
                               text-white flex items-center justify-center
                               opacity-0 group-hover:opacity-100 transition-all"
                    title="Delete design"
                  >
                    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
