import { useEffect, useState, useCallback } from 'react';
import type { SharedCreation } from '../types';
import { fetchCommunityCreations } from '../lib/designStore';

interface CommunityGalleryProps {
  refreshTrigger: number;
}

export default function CommunityGallery({ refreshTrigger }: CommunityGalleryProps) {
  const [creations, setCreations] = useState<SharedCreation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState<SharedCreation | null>(null);

  const loadCreations = useCallback(async () => {
    setLoading(true);
    const data = await fetchCommunityCreations();
    setCreations(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadCreations();
  }, [loadCreations, refreshTrigger]);

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return '';
    }
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 overflow-y-auto p-2">
        {loading ? (
          <div className="flex items-center justify-center h-full text-[var(--text-muted)] text-sm">
            Loading community designs...
          </div>
        ) : creations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-[var(--text-muted)] text-sm text-center px-4 gap-2">
            <span className="text-2xl">&#x1f3a8;</span>
            <p>No community designs yet.</p>
            <p className="text-xs">Place some designs on the hand, then click &quot;Save to Community&quot; to share!</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {creations.map((creation) => (
              <button
                key={creation.id}
                onClick={() => setSelectedImage(creation)}
                className="rounded-lg bg-[#1e1e1e] border border-[var(--border)]
                           hover:border-[var(--accent)] transition-colors
                           flex flex-col overflow-hidden text-left"
              >
                <div className="aspect-[3/4] w-full bg-[#151515] flex items-center justify-center p-1">
                  <img
                    src={creation.image_url}
                    alt={`Design by ${creation.author}`}
                    className="w-full h-full object-contain"
                    loading="lazy"
                  />
                </div>
                <div className="px-2 py-1.5 flex items-center justify-between w-full">
                  <span className="text-xs text-[var(--text)] truncate">{creation.author}</span>
                  <span className="text-[10px] text-[var(--text-muted)] shrink-0 ml-1">
                    {formatDate(creation.created_at)}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Lightbox modal */}
      {selectedImage && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-8"
          onClick={() => setSelectedImage(null)}
        >
          <div
            className="relative max-w-lg w-full bg-[var(--bg-panel)] rounded-xl overflow-hidden border border-[var(--border)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-[#111] flex items-center justify-center p-4">
              <img
                src={selectedImage.image_url}
                alt={`Design by ${selectedImage.author}`}
                className="max-h-[60vh] object-contain"
              />
            </div>
            <div className="px-4 py-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-[var(--text)]">By {selectedImage.author}</p>
                <p className="text-xs text-[var(--text-muted)]">{formatDate(selectedImage.created_at)}</p>
              </div>
              <button
                onClick={() => setSelectedImage(null)}
                className="text-xs px-3 py-1.5 rounded border border-[var(--border)]
                           hover:border-[var(--text-muted)] transition-colors text-[var(--text-muted)]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
