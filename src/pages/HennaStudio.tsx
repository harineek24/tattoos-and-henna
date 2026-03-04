import { useState, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import HandCanvas from '../components/HandCanvas';
import type { HandCanvasHandle } from '../components/HandCanvas';
import DesignGallery from '../components/DesignGallery';
import CommunityGallery from '../components/CommunityGallery';
import DrawingCanvas from '../components/DrawingCanvas';
import { saveSharedCreation } from '../lib/designStore';
import type { PlacedDesign } from '../types';

export default function HennaStudio() {
  const [placedDesigns, setPlacedDesigns] = useState<PlacedDesign[]>([]);
  const [communityRefresh, setCommunityRefresh] = useState(0);
  const handCanvasRef = useRef<HandCanvasHandle>(null);
  const [shareStatus, setShareStatus] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'gallery' | 'community'>('gallery');
  const [savingToCommunity, setSavingToCommunity] = useState(false);
  const [authorName, setAuthorName] = useState('');

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

  const handleSaveToCommunity = useCallback(async () => {
    const dataUrl = getStageDataUrl();
    if (!dataUrl) return;
    const name = authorName.trim() || 'Anonymous';
    setSavingToCommunity(true);
    const result = await saveSharedCreation(name, dataUrl);
    setSavingToCommunity(false);
    if (result) {
      setCommunityRefresh((n) => n + 1);
      setActiveTab('community');
      setShareStatus('Saved to community!');
      setTimeout(() => setShareStatus(null), 2500);
    }
  }, [authorName]);

  const getStageDataUrl = (): string | null => {
    const stage = handCanvasRef.current?.getStage();
    if (!stage) return null;
    return stage.toDataURL({ pixelRatio: 2 });
  };

  const handleDownload = () => {
    const dataUrl = getStageDataUrl();
    if (!dataUrl) return;
    const link = document.createElement('a');
    link.download = 'my-henna-design.png';
    link.href = dataUrl;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleShare = async () => {
    const dataUrl = getStageDataUrl();
    if (!dataUrl) return;
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    const file = new File([blob], 'my-henna-design.png', { type: 'image/png' });

    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({
          title: 'My Design — Color & Henna',
          text: 'Check out this henna design I made!',
          files: [file],
        });
        return;
      } catch (err) {
        if ((err as DOMException).name === 'AbortError') return;
      }
    }

    try {
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob }),
      ]);
      setShareStatus('Copied to clipboard!');
    } catch {
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
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold tracking-tight">
            <span className="text-[var(--accent)]">Color</span>
            <span className="text-[var(--text-muted)]"> & </span>
            <span className="text-[var(--accent)]">Henna</span>
          </h1>
          <nav className="flex items-center gap-3 text-xs">
            <span className="text-[var(--accent)] font-bold">Henna</span>
            <Link to="/color" className="text-[var(--text-muted)] hover:text-[var(--text)] font-bold transition-colors">
              Coloring
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className="text-[var(--text-muted)]">
            {placedDesigns.length} design{placedDesigns.length !== 1 ? 's' : ''} placed
          </span>

          {placedDesigns.length > 0 && (
            <>
              <button
                onClick={handleDownload}
                className="px-2 py-1 text-[var(--accent)] font-bold hover:text-[var(--accent-hover)] transition-colors"
              >
                Download
              </button>
              <button
                onClick={handleShare}
                className="px-2 py-1 text-[var(--accent)] font-bold hover:text-[var(--accent-hover)] transition-colors"
              >
                Share
              </button>
              <div className="flex items-center gap-1.5 relative">
                <input
                  type="text"
                  placeholder="Your name"
                  value={authorName}
                  onChange={(e) => setAuthorName(e.target.value)}
                  className="w-24 text-xs bg-transparent border-b border-[var(--border)] px-1 py-1
                             text-[var(--text)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]"
                />
                <button
                  onClick={handleSaveToCommunity}
                  disabled={savingToCommunity}
                  className="px-2 py-1 text-emerald-400 font-bold hover:text-emerald-300 transition-colors
                             disabled:opacity-50 whitespace-nowrap"
                >
                  {savingToCommunity ? 'Saving...' : 'Save to Community'}
                </button>
                {shareStatus && (
                  <span className="absolute -bottom-7 right-0 whitespace-nowrap
                                   bg-green-600 text-white text-[10px] px-2 py-0.5 rounded z-10">
                    {shareStatus}
                  </span>
                )}
              </div>
              <button
                onClick={() => setPlacedDesigns([])}
                className="px-2 py-1 text-red-400 font-bold hover:text-red-300 transition-colors"
              >
                Clear
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

        {/* Right — Gallery/Community + Drawing */}
        <div className="flex-[2] flex flex-col min-w-0 max-w-[480px]">
          {/* Tabs */}
          <div className="flex border-b border-[var(--border)] shrink-0">
            <button
              onClick={() => setActiveTab('gallery')}
              className={`flex-1 text-xs font-semibold tracking-wide uppercase py-2.5 transition-colors ${
                activeTab === 'gallery'
                  ? 'text-[var(--accent)] border-b-2 border-[var(--accent)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text)]'
              }`}
            >
              Design Gallery
            </button>
            <button
              onClick={() => setActiveTab('community')}
              className={`flex-1 text-xs font-semibold tracking-wide uppercase py-2.5 transition-colors ${
                activeTab === 'community'
                  ? 'text-[var(--accent)] border-b-2 border-[var(--accent)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text)]'
              }`}
            >
              Community
            </button>
          </div>

          {/* Tab content */}
          <div className="flex-1 min-h-0 border-b border-[var(--border)] overflow-hidden">
            {activeTab === 'gallery' ? (
              <DesignGallery refreshTrigger={0} />
            ) : (
              <CommunityGallery refreshTrigger={communityRefresh} />
            )}
          </div>

          {/* Bottom: Drawing */}
          <div className="flex-1 min-h-0 overflow-hidden">
            <DrawingCanvas />
          </div>
        </div>
      </div>
    </div>
  );
}
