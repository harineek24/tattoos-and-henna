import { useState, useCallback, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import HandCanvas from './components/HandCanvas';
import type { HandCanvasHandle } from './components/HandCanvas';
import DesignGallery from './components/DesignGallery';
import DrawingCanvas from './components/DrawingCanvas';
import type { PlacedDesign } from './types';

export default function App() {
  const [placedDesigns, setPlacedDesigns] = useState<PlacedDesign[]>([]);
  const [galleryRefresh, setGalleryRefresh] = useState(0);
  const handCanvasRef = useRef<HandCanvasHandle>(null);
  const [shareStatus, setShareStatus] = useState<string | null>(null);

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

  // Export the Konva stage as a PNG data URL
  const getStageDataUrl = (): string | null => {
    const stage = handCanvasRef.current?.getStage();
    if (!stage) return null;
    return stage.toDataURL({ pixelRatio: 2 });
  };

  // Download the hand with designs as PNG
  const handleDownload = () => {
    const dataUrl = getStageDataUrl();
    if (!dataUrl) return;

    const link = document.createElement('a');
    link.download = 'my-tattoo-design.png';
    link.href = dataUrl;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Share the hand design
  const handleShare = async () => {
    const dataUrl = getStageDataUrl();
    if (!dataUrl) return;

    // Convert data URL to blob for sharing
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    const file = new File([blob], 'my-tattoo-design.png', { type: 'image/png' });

    // Try native Web Share API first (works on mobile & some desktops)
    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({
          title: 'My Tattoo Design — Ink & Henna',
          text: 'Check out this tattoo design I made!',
          files: [file],
        });
        return;
      } catch (err) {
        // User cancelled or share failed — fall through to clipboard
        if ((err as DOMException).name === 'AbortError') return;
      }
    }

    // Fallback: copy image to clipboard
    try {
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob }),
      ]);
      setShareStatus('Copied to clipboard!');
    } catch {
      // Last resort: open in new tab
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setShareStatus('Opened in new tab');
    }

    setTimeout(() => setShareStatus(null), 2500);
  };

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
        <div className="flex items-center gap-3 text-xs">
          <span className="text-[var(--text-muted)]">
            {placedDesigns.length} design{placedDesigns.length !== 1 ? 's' : ''} placed
          </span>

          {placedDesigns.length > 0 && (
            <>
              <button
                onClick={handleDownload}
                className="px-2.5 py-1.5 rounded bg-[var(--accent)] text-black font-medium
                           hover:bg-[var(--accent-hover)] transition-colors"
              >
                Download PNG
              </button>
              <button
                onClick={handleShare}
                className="px-2.5 py-1.5 rounded border border-[var(--accent)] text-[var(--accent)]
                           hover:bg-[var(--accent)]/10 transition-colors relative"
              >
                Share
                {shareStatus && (
                  <span className="absolute -bottom-7 left-1/2 -translate-x-1/2 whitespace-nowrap
                                   bg-green-600 text-white text-[10px] px-2 py-0.5 rounded">
                    {shareStatus}
                  </span>
                )}
              </button>
              <button
                onClick={() => setPlacedDesigns([])}
                className="text-red-400 hover:text-red-300 transition-colors"
              >
                Clear all
              </button>
            </>
          )}
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex min-h-0">
        {/* Left — Hand Canvas */}
        <div className="flex-[3] border-r border-[var(--border)] min-w-0">
          <HandCanvas
            ref={handCanvasRef}
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
