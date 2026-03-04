import { useState, useCallback, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import HandCanvas from '../components/HandCanvas';
import type { HandCanvasHandle } from '../components/HandCanvas';
import DesignGallery from '../components/DesignGallery';
import CommunityGallery from '../components/CommunityGallery';
import DrawingCanvas from '../components/DrawingCanvas';
import { saveSharedCreation, saveDesign } from '../lib/designStore';
import type { PlacedDesign } from '../types';

export default function HennaStudio() {
  const [placedDesigns, setPlacedDesigns] = useState<PlacedDesign[]>([]);
  const historyRef = useRef<PlacedDesign[][]>([]);
  const [communityRefresh, setCommunityRefresh] = useState(0);
  const handCanvasRef = useRef<HandCanvasHandle>(null);
  const [shareStatus, setShareStatus] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'gallery' | 'community'>('gallery');
  const [savingToCommunity, setSavingToCommunity] = useState(false);
  const [authorName, setAuthorName] = useState('');
  const [showActions, setShowActions] = useState(false);
  const [designRefresh, setDesignRefresh] = useState(0);
  const [panelOpen, setPanelOpen] = useState(false);

  const pushHistory = useCallback(() => {
    setPlacedDesigns((current) => {
      historyRef.current.push([...current]);
      if (historyRef.current.length > 50) historyRef.current.shift();
      return current;
    });
  }, []);

  const undo = useCallback(() => {
    const prev = historyRef.current.pop();
    if (prev !== undefined) {
      setPlacedDesigns(prev);
    }
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        undo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo]);

  const handleDropDesign = useCallback((imageUrl: string, x: number, y: number) => {
    pushHistory();
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
  }, [pushHistory]);

  const handleUpdateDesign = useCallback((id: string, attrs: Partial<PlacedDesign>) => {
    pushHistory();
    setPlacedDesigns((prev) =>
      prev.map((d) => (d.id === id ? { ...d, ...attrs } : d))
    );
  }, [pushHistory]);

  const handleDeleteDesign = useCallback((id: string) => {
    pushHistory();
    setPlacedDesigns((prev) => prev.filter((d) => d.id !== id));
  }, [pushHistory]);

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
      setShowActions(false);
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

  const handleSaveDrawing = useCallback(async (name: string, dataUrl: string) => {
    const result = await saveDesign(name, dataUrl);
    if (result) {
      setDesignRefresh((n) => n + 1);
      setActiveTab('gallery');
      setShareStatus('Design saved!');
      setTimeout(() => setShareStatus(null), 2500);
    }
  }, []);

  return (
    <div className="h-screen w-screen flex flex-col bg-[var(--bg-dark)]">
      {/* Header */}
      <header className="flex items-center justify-between px-4 md:px-6 py-2.5 border-b border-[var(--border)] shrink-0 bg-white">
        <div className="flex items-center gap-3 md:gap-4">
          <h1 className="text-base md:text-lg font-semibold tracking-tight text-[var(--text)]">
            Color & Henna
          </h1>
          <nav className="flex items-center gap-2 text-xs">
            <Link to="/" className="text-[var(--text-muted)] hover:text-[var(--text)] font-medium px-2 py-1 rounded-full hover:bg-gray-100 transition-colors">
              Coloring
            </Link>
            <span className="text-[var(--accent)] font-semibold px-2 py-1 bg-[var(--accent-light)] rounded-full">Henna</span>
          </nav>
        </div>

        <div className="flex items-center gap-2">
          {placedDesigns.length > 0 && (
            <>
              {/* Desktop actions */}
              <span className="hidden md:inline text-xs text-[var(--text-muted)]">
                {placedDesigns.length} design{placedDesigns.length !== 1 ? 's' : ''}
              </span>
              <button
                onClick={handleDownload}
                className="hidden md:inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-[var(--accent)]
                           hover:bg-[var(--accent-light)] rounded-lg transition-colors"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <path d="M7 10l5 5 5-5" />
                  <path d="M12 15V3" />
                </svg>
                Download
              </button>
              <button
                onClick={handleShare}
                className="hidden md:inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-[var(--accent)]
                           hover:bg-[var(--accent-light)] rounded-lg transition-colors"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                  <path d="m16 6-4-4-4 4" />
                  <path d="M12 2v13" />
                </svg>
                Share
              </button>

              {/* Save to Community (desktop) */}
              <div className="hidden md:flex items-center gap-1.5 relative">
                <input
                  type="text"
                  placeholder="Your name"
                  value={authorName}
                  onChange={(e) => setAuthorName(e.target.value)}
                  className="w-24 text-xs bg-gray-50 border border-[var(--border)] rounded-lg px-2 py-1.5
                             text-[var(--text)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30"
                />
                <button
                  onClick={handleSaveToCommunity}
                  disabled={savingToCommunity}
                  className="px-3 py-1.5 text-xs font-medium text-white bg-[var(--accent)] hover:bg-[var(--accent-hover)]
                             rounded-lg transition-colors disabled:opacity-50 whitespace-nowrap"
                >
                  {savingToCommunity ? 'Saving...' : 'Share'}
                </button>
              </div>

              <button
                onClick={() => { pushHistory(); setPlacedDesigns([]); }}
                className="hidden md:inline-flex p-1.5 rounded-lg text-[var(--text-muted)] hover:bg-red-50 hover:text-red-500 transition-colors"
                title="Clear all"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 6h18" />
                  <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                  <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                </svg>
              </button>

              {/* Mobile actions menu */}
              <button
                onClick={() => setShowActions(!showActions)}
                className="md:hidden p-1.5 rounded-lg text-[var(--text-muted)] hover:bg-gray-100 transition-colors"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="1" />
                  <circle cx="19" cy="12" r="1" />
                  <circle cx="5" cy="12" r="1" />
                </svg>
              </button>
            </>
          )}

          {shareStatus && (
            <span className="text-xs text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full font-medium">
              {shareStatus}
            </span>
          )}
        </div>
      </header>

      {/* Mobile actions dropdown */}
      {showActions && (
        <div className="md:hidden bg-white border-b border-[var(--border)] px-4 py-3 flex flex-col gap-2 animate-[slideIn_0.2s_ease-out]">
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownload}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium
                         text-[var(--accent)] border border-[var(--border)] rounded-lg hover:bg-[var(--accent-light)] transition-colors"
            >
              Download
            </button>
            <button
              onClick={handleShare}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium
                         text-[var(--accent)] border border-[var(--border)] rounded-lg hover:bg-[var(--accent-light)] transition-colors"
            >
              Share
            </button>
            <button
              onClick={() => { pushHistory(); setPlacedDesigns([]); }}
              className="flex items-center justify-center px-3 py-2 text-xs font-medium
                         text-red-500 border border-[var(--border)] rounded-lg hover:bg-red-50 transition-colors"
            >
              Clear
            </button>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Your name"
              value={authorName}
              onChange={(e) => setAuthorName(e.target.value)}
              className="flex-1 text-xs bg-gray-50 border border-[var(--border)] rounded-lg px-3 py-2
                         text-[var(--text)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30"
            />
            <button
              onClick={handleSaveToCommunity}
              disabled={savingToCommunity}
              className="px-3 py-2 text-xs font-medium text-white bg-[var(--accent)] hover:bg-[var(--accent-hover)]
                         rounded-lg transition-colors disabled:opacity-50"
            >
              {savingToCommunity ? 'Saving...' : 'Save to Community'}
            </button>
          </div>
        </div>
      )}

      {/* Main content - side-by-side on desktop, full canvas + slide-up panel on mobile */}
      <div className="flex-1 flex flex-col md:flex-row min-h-0 relative">
        {/* Hand Canvas — full height on mobile, flex-[3] on desktop */}
        <div className="flex-1 md:flex-[3] border-b md:border-b-0 md:border-r border-[var(--border)] min-w-0 relative">
          <HandCanvas
            ref={handCanvasRef}
            placedDesigns={placedDesigns}
            onUpdateDesign={handleUpdateDesign}
            onDeleteDesign={handleDeleteDesign}
            onDropDesign={handleDropDesign}
          />

          {/* Mobile toggle button to open design panel */}
          <button
            onClick={() => setPanelOpen(!panelOpen)}
            className="md:hidden absolute bottom-4 right-4 z-30 w-12 h-12 rounded-full bg-[var(--accent)] text-white shadow-lg
                       flex items-center justify-center active:scale-95 transition-all"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {panelOpen ? (
                <path d="M18 6L6 18M6 6l12 12" />
              ) : (
                <>
                  <rect x="3" y="3" width="7" height="7" rx="1" />
                  <rect x="14" y="3" width="7" height="7" rx="1" />
                  <rect x="3" y="14" width="7" height="7" rx="1" />
                  <rect x="14" y="14" width="7" height="7" rx="1" />
                </>
              )}
            </svg>
          </button>
        </div>

        {/* Mobile backdrop */}
        {panelOpen && (
          <div
            className="md:hidden fixed inset-0 bg-black/20 z-30"
            onClick={() => setPanelOpen(false)}
          />
        )}

        {/* Right panel — always visible on desktop, slide-up sheet on mobile */}
        <div className={`
          md:flex-[2] flex flex-col min-w-0 md:max-w-[480px] bg-white
          md:relative md:translate-y-0
          max-md:fixed max-md:left-0 max-md:right-0 max-md:bottom-0 max-md:z-40
          max-md:rounded-t-2xl max-md:shadow-2xl max-md:max-h-[75vh]
          max-md:transition-transform max-md:duration-300 max-md:ease-in-out
          ${panelOpen ? 'max-md:translate-y-0' : 'max-md:translate-y-full'}
        `}>
          {/* Mobile drag handle */}
          <div className="md:hidden flex justify-center py-2 shrink-0">
            <div className="w-10 h-1 rounded-full bg-gray-300" />
          </div>

          {/* Tabs */}
          <div className="flex border-b border-[var(--border)] shrink-0 bg-white">
            <button
              onClick={() => setActiveTab('gallery')}
              className={`flex-1 text-xs font-medium tracking-wide py-2.5 transition-colors ${
                activeTab === 'gallery'
                  ? 'text-[var(--accent)] border-b-2 border-[var(--accent)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text)]'
              }`}
            >
              Designs
            </button>
            <button
              onClick={() => setActiveTab('community')}
              className={`flex-1 text-xs font-medium tracking-wide py-2.5 transition-colors ${
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
              <DesignGallery refreshTrigger={designRefresh} />
            ) : (
              <CommunityGallery refreshTrigger={communityRefresh} />
            )}
          </div>

          {/* Drawing */}
          <div className="flex-[2] min-h-[280px] overflow-hidden">
            <DrawingCanvas onSave={handleSaveDrawing} />
          </div>
        </div>
      </div>
    </div>
  );
}
