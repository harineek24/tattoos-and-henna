import { useEffect, useState, useCallback } from 'react';
import type { SharedCreation } from '../types';
import { fetchCommunityCreations, deleteCommunityCreation } from '../lib/designStore';

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

  const handleDelete = async (e: React.MouseEvent, creation: SharedCreation) => {
    e.stopPropagation();
    const ok = await deleteCommunityCreation(creation.id);
    if (ok) {
      setCreations((prev) => prev.filter((c) => c.id !== creation.id));
      if (selectedImage?.id === creation.id) setSelectedImage(null);
    }
  };

  return (
    <div className="h-full flex flex-col bg-white">
      <div className="flex-1 overflow-y-auto p-2">
        {loading ? (
          <div className="flex items-center justify-center h-full text-[var(--text-muted)] text-sm">
            Loading community designs...
          </div>
        ) : creations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-[var(--text-muted)] text-sm text-center px-4 gap-2">
            <p>No community designs yet.</p>
            <p className="text-xs">Place some designs on the hand, then click &quot;Share&quot; to share!</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {creations.map((creation) => (
              <div
                key={creation.id}
                className="rounded-xl bg-gray-50 border border-[var(--border)]
                           hover:border-[var(--accent)] hover:shadow-sm transition-all
                           flex flex-col overflow-hidden text-left group relative"
              >
                <button
                  onClick={() => setSelectedImage(creation)}
                  className="w-full text-left"
                >
                  <div className="aspect-[3/4] w-full bg-white flex items-center justify-center p-1">
                    <img
                      src={creation.image_url}
                      alt={`Design by ${creation.author}`}
                      className="w-full h-full object-contain"
                      loading="lazy"
                    />
                  </div>
                  <div className="px-2 py-1.5 flex items-center justify-between w-full">
                    <span className="text-xs text-[var(--text)] truncate font-medium">{creation.author}</span>
                    <span className="text-[10px] text-[var(--text-muted)] shrink-0 ml-1">
                      {formatDate(creation.created_at)}
                    </span>
                  </div>
                </button>
                {/* Delete button */}
                <button
                  onClick={(e) => handleDelete(e, creation)}
                  className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/50 hover:bg-red-500
                             text-white flex items-center justify-center
                             opacity-0 group-hover:opacity-100 transition-all"
                  title="Delete"
                >
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Lightbox modal */}
      {selectedImage && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4 md:p-8 animate-[fadeIn_0.2s_ease-out]"
          onClick={() => setSelectedImage(null)}
        >
          <div
            className="relative max-w-lg w-full bg-white rounded-2xl overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-gray-50 flex items-center justify-center p-4">
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
              <div className="flex items-center gap-2">
                <button
                  onClick={(e) => handleDelete(e, selectedImage)}
                  className="text-xs px-3 py-1.5 rounded-lg border border-red-200
                             hover:bg-red-50 transition-colors text-red-500 font-medium"
                >
                  Delete
                </button>
                <button
                  onClick={() => setSelectedImage(null)}
                  className="text-xs px-3 py-1.5 rounded-lg border border-[var(--border)]
                             hover:bg-gray-50 transition-colors text-[var(--text-muted)] font-medium"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
