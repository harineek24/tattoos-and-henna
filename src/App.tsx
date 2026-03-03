import { useState, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import HandCanvas from './components/HandCanvas';
import DesignGallery from './components/DesignGallery';
import DrawingCanvas from './components/DrawingCanvas';
import type { PlacedDesign } from './types';

export default function App() {
  const [placedDesigns, setPlacedDesigns] = useState<PlacedDesign[]>([]);
  const [galleryRefresh, setGalleryRefresh] = useState(0);

  const handleDropDesign = useCallback((imageUrl: string, x: number, y: number) => {
    const newDesign: PlacedDesign = {
      id: uuidv4(),
      designId: '',
      image_url: imageUrl,
      x: x - 40,
      y: y - 40,
      scaleX: 0.5,
      scaleY: 0.5,
      rotation: 0,
    };
    setPlacedDesigns((prev) => [...prev, newDesign]);
  }, []);

  const handleUpdateDesign = useCallback((id: string, attrs: Partial<PlacedDesign>) => {
    setPlacedDesigns((prev) =>
      prev.map((d) => (d.id === id ? { ...d, ...attrs } : d))
    );
  }, []);

  const handleDeleteDesign = useCallback((id: string) => {
    setPlacedDesigns((prev) => prev.filter((d) => d.id !== id));
  }, []);

  const handleDesignSaved = useCallback(() => {
    setGalleryRefresh((n) => n + 1);
  }, []);

  return (
    <div className="h-screen w-screen flex flex-col bg-[var(--bg-dark)]">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-[var(--border)] shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold tracking-tight">
            <span className="text-[var(--accent)]">Ink</span>
            <span className="text-[var(--text-muted)]"> & </span>
            <span className="text-[var(--accent)]">Henna</span>
          </h1>
          <span className="text-xs text-[var(--text-muted)] hidden sm:block">Virtual Tattoo Studio</span>
        </div>
        <div className="flex items-center gap-4 text-xs text-[var(--text-muted)]">
          <span>{placedDesigns.length} design{placedDesigns.length !== 1 ? 's' : ''} placed</span>
          {placedDesigns.length > 0 && (
            <button
              onClick={() => setPlacedDesigns([])}
              className="text-red-400 hover:text-red-300 transition-colors"
            >
              Clear all
            </button>
          )}
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex min-h-0">
        {/* Left — Hand Canvas */}
        <div className="flex-[3] border-r border-[var(--border)] min-w-0">
          <HandCanvas
            placedDesigns={placedDesigns}
            onUpdateDesign={handleUpdateDesign}
            onDeleteDesign={handleDeleteDesign}
            onDropDesign={handleDropDesign}
          />
        </div>

        {/* Right — Gallery + Drawing */}
        <div className="flex-[2] flex flex-col min-w-0 max-w-[480px]">
          {/* Top: Gallery */}
          <div className="flex-1 min-h-0 border-b border-[var(--border)] overflow-hidden">
            <DesignGallery refreshTrigger={galleryRefresh} />
          </div>

          {/* Bottom: Drawing */}
          <div className="flex-1 min-h-0 overflow-hidden">
            <DrawingCanvas onDesignSaved={handleDesignSaved} />
          </div>
        </div>
      </div>
    </div>
  );
}
