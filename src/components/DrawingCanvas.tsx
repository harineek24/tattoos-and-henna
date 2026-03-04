import { useRef, useState, useEffect } from 'react';

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

export default function DrawingCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [brushSize, setBrushSize] = useState(3);
  const [brushColor, setBrushColor] = useState('#8b6f47');
  const [canvasSize, setCanvasSize] = useState({ width: 300, height: 200 });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        const w = Math.floor(entry.contentRect.width);
        const h = Math.floor(entry.contentRect.height);
        setCanvasSize({ width: w, height: h });
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }, [canvasSize]);

  const getPos = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    if ('touches' in e) {
      return {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top,
      };
    }
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    ctx.strokeStyle = brushColor;
    ctx.lineWidth = brushSize;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    setIsDrawing(true);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const pos = getPos(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  return (
    <div className="h-full flex flex-col bg-white">
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border)]">
        <h2 className="text-xs font-semibold text-[var(--accent)]">
          Draw Your Own
        </h2>
        <div className="flex items-center gap-2">
          <input
            type="range"
            min="1"
            max="12"
            value={brushSize}
            onChange={(e) => setBrushSize(Number(e.target.value))}
            className="w-16 accent-[var(--accent)]"
          />
          <span className="text-[10px] text-[var(--text-muted)] w-5">{brushSize}px</span>
          <button
            onClick={clearCanvas}
            className="text-xs px-2 py-1 text-[var(--text-muted)] font-medium
                       hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Full-width color swatches (eyeshadow palette) */}
      <div className="flex-1 min-h-0 overflow-y-auto p-3">
        {/* Selected color preview */}
        <div className="flex items-center gap-2 mb-2">
          <div
            className="w-7 h-7 rounded-lg shadow-inner"
            style={{ backgroundColor: brushColor, border: brushColor === '#ffffff' ? '1px solid #ddd' : 'none' }}
          />
          <span className="text-[10px] text-[var(--text-muted)] font-mono uppercase">{brushColor}</span>
        </div>
        {/* Swatch grid — 10 columns to fill width */}
        <div className="grid grid-cols-10 gap-px bg-[var(--border)] rounded-lg overflow-hidden shadow-inner">
          {COLORS.map((c, i) => (
            <button
              key={`${c}-${i}`}
              onClick={() => setBrushColor(c)}
              className={`aspect-square transition-all relative ${
                brushColor === c
                  ? 'ring-2 ring-[var(--accent)] ring-inset z-10 scale-110'
                  : 'hover:scale-105 hover:z-10'
              }`}
              style={{ backgroundColor: c }}
              title={c}
            />
          ))}
        </div>
      </div>

      {/* Hidden canvas for drawing (used for custom design export) */}
      <div
        ref={containerRef}
        className="hidden"
      >
        <canvas
          ref={canvasRef}
          width={canvasSize.width}
          height={canvasSize.height}
          className="touch-none"
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
        />
      </div>
    </div>
  );
}
