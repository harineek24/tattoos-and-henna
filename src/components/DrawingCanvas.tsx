import { useRef, useState, useEffect, forwardRef, useImperativeHandle } from 'react';

// ─── Henna & tattoo palette: whites, blacks, browns, reds (8 cols × 8 rows) ──
const COLORS = [
  // Whites & creams
  '#ffffff', '#fdfcfb', '#faf5ef', '#f5ede3', '#f0e6d8', '#ebe0cc', '#e6d9c1', '#dfd1b5',
  // Light browns / beige
  '#d4c5a9', '#c9b89c', '#bfab8f', '#b59e82', '#ab9175', '#a08468', '#96785c', '#8c6b50',
  // Medium browns
  '#8b6f47', '#7e6340', '#725a39', '#665032', '#5d4a2e', '#54412a', '#4b3826', '#422f22',
  // Dark browns / espresso
  '#3b291e', '#34231a', '#2d1e16', '#261912', '#1f140e', '#180f0a', '#120b07', '#0b0604',
  // Warm reds / henna
  '#e8c4b8', '#d4a08e', '#c07d65', '#b5684d', '#a64b33', '#963d28', '#862f1e', '#762114',
  // Deep reds / maroon
  '#6b1a10', '#5f150d', '#54100a', '#4a0c07', '#3f0805', '#350503', '#2b0302', '#200201',
  // Grays (tattoo shading)
  '#f0f0f0', '#d9d9d9', '#bfbfbf', '#a6a6a6', '#8c8c8c', '#737373', '#595959', '#404040',
  // Blacks / charcoal
  '#333333', '#2b2b2b', '#242424', '#1c1c1c', '#141414', '#0d0d0d', '#060606', '#000000',
];

// Fixed canvas resolution so drawings don't get wiped on resize
const CANVAS_W = 400;
const CANVAS_H = 300;

export interface DrawingCanvasHandle {
  getDataUrl: () => string | null;
}

interface DrawingCanvasProps {
  onSave?: (name: string, dataUrl: string) => void;
}

const DrawingCanvas = forwardRef<DrawingCanvasHandle, DrawingCanvasProps>(
  function DrawingCanvas({ onSave }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const isDrawingRef = useRef(false);
    const [brushSize, setBrushSize] = useState(3);
    const [brushColor, setBrushColor] = useState('#8b6f47');
    const [tool, setTool] = useState<'draw' | 'erase'>('draw');
    const [hasContent, setHasContent] = useState(false);

    // Initialize canvas with transparent background
    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    }, []);

    useImperativeHandle(ref, () => ({
      getDataUrl: () => {
        const canvas = canvasRef.current;
        return canvas ? canvas.toDataURL() : null;
      },
    }));

    const getPos = (e: React.MouseEvent | React.TouchEvent): { x: number; y: number } => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      if ('touches' in e) {
        const touch = e.touches[0] || e.changedTouches[0];
        if (!touch) return { x: 0, y: 0 };
        return {
          x: (touch.clientX - rect.left) * scaleX,
          y: (touch.clientY - rect.top) * scaleY,
        };
      }
      return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY,
      };
    };

    const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
      if ('touches' in e) e.preventDefault();
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const pos = getPos(e);
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
      ctx.strokeStyle = tool === 'erase' ? 'rgba(0,0,0,1)' : brushColor;
      ctx.lineWidth = brushSize;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.globalCompositeOperation = tool === 'erase' ? 'destination-out' : 'source-over';
      isDrawingRef.current = true;
      setHasContent(true);
    };

    const draw = (e: React.MouseEvent | React.TouchEvent) => {
      if ('touches' in e) e.preventDefault();
      if (!isDrawingRef.current) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const pos = getPos(e);
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
    };

    const stopDrawing = () => {
      if (!isDrawingRef.current) return;
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (ctx) ctx.globalCompositeOperation = 'source-over';
      isDrawingRef.current = false;
    };

    const clearCanvas = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
      setHasContent(false);
    };

    const handleSave = () => {
      if (!onSave || !hasContent) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const dataUrl = canvas.toDataURL();
      const name = `Drawing ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      onSave(name, dataUrl);
    };

    return (
      <div className="h-full flex flex-col bg-white">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border)]">
          <h2 className="text-xs font-semibold text-[var(--accent)]">
            Draw Your Own
          </h2>
          <div className="flex items-center gap-1.5">
            {/* Draw / Erase toggle */}
            <button
              onClick={() => setTool('draw')}
              className={`text-[10px] px-2 py-1 rounded-md font-medium transition-colors ${
                tool === 'draw'
                  ? 'bg-[var(--accent)] text-white'
                  : 'text-[var(--text-muted)] hover:bg-gray-100'
              }`}
            >
              Draw
            </button>
            <button
              onClick={() => setTool('erase')}
              className={`text-[10px] px-2 py-1 rounded-md font-medium transition-colors ${
                tool === 'erase'
                  ? 'bg-[var(--accent)] text-white'
                  : 'text-[var(--text-muted)] hover:bg-gray-100'
              }`}
            >
              Erase
            </button>
            <div className="w-px h-4 bg-[var(--border)] mx-0.5" />
            <input
              type="range"
              min="1"
              max="16"
              value={brushSize}
              onChange={(e) => setBrushSize(Number(e.target.value))}
              className="w-14 accent-[var(--accent)]"
            />
            <span className="text-[10px] text-[var(--text-muted)] w-5">{brushSize}px</span>
            <button
              onClick={clearCanvas}
              className="text-[10px] px-2 py-1 text-[var(--text-muted)] font-medium
                         hover:text-red-500 hover:bg-red-50 rounded-md transition-colors"
            >
              Clear
            </button>
          </div>
        </div>

        {/* Color swatches — compact strip */}
        <div className="shrink-0 px-3 py-1.5 border-b border-[var(--border)] flex items-center gap-2">
          <div
            className="w-5 h-5 rounded-md shadow-inner shrink-0"
            style={{ backgroundColor: brushColor, border: brushColor === '#ffffff' ? '1px solid #ddd' : 'none' }}
          />
          <div className="flex-1 overflow-x-auto">
            <div className="flex gap-px" style={{ width: 'max-content' }}>
              {COLORS.map((c, i) => (
                <button
                  key={`${c}-${i}`}
                  onClick={() => { setBrushColor(c); setTool('draw'); }}
                  className={`w-4 h-4 shrink-0 rounded-sm transition-all ${
                    brushColor === c && tool === 'draw'
                      ? 'ring-2 ring-[var(--accent)] z-10 scale-125'
                      : 'hover:scale-110 hover:z-10'
                  }`}
                  style={{ backgroundColor: c }}
                  title={c}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Drawing canvas — fixed resolution, CSS-scaled to fill */}
        <div className="flex-1 min-h-[140px] relative bg-[repeating-conic-gradient(#f3f3f3_0%_25%,#fff_0%_50%)_0_0/16px_16px]">
          <canvas
            ref={canvasRef}
            width={CANVAS_W}
            height={CANVAS_H}
            className="touch-none absolute inset-0 w-full h-full"
            style={{ cursor: tool === 'erase' ? 'cell' : 'crosshair' }}
            onMouseDown={startDrawing}
            onMouseMove={draw}
            onMouseUp={stopDrawing}
            onMouseLeave={stopDrawing}
            onTouchStart={startDrawing}
            onTouchMove={draw}
            onTouchEnd={stopDrawing}
          />
        </div>

        {/* Save bar */}
        {onSave && (
          <div className="shrink-0 px-3 py-2 border-t border-[var(--border)] flex items-center justify-between bg-gray-50">
            <span className="text-[10px] text-[var(--text-muted)]">
              {hasContent ? 'Drawing ready' : 'Draw something above'}
            </span>
            <button
              onClick={handleSave}
              disabled={!hasContent}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-[var(--accent)]
                         hover:bg-[var(--accent-hover)] rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                <polyline points="17 21 17 13 7 13 7 21" />
                <polyline points="7 3 7 8 15 8" />
              </svg>
              Save to Designs
            </button>
          </div>
        )}
      </div>
    );
  }
);

export default DrawingCanvas;
