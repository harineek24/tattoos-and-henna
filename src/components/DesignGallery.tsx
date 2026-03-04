import { useEffect, useState, useCallback } from 'react';
import type { Design } from '../types';
import { fetchDesigns } from '../lib/designStore';

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
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
