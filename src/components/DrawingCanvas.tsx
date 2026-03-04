import { useRef, useState, useEffect } from 'react';

// ─── Eyeshadow-palette color grid (8 cols × 10 rows = 80 colors) ──
const COLORS = [
  // Neutrals
  '#ffffff', '#f0f0f0', '#d9d9d9', '#bfbfbf', '#8c8c8c', '#595959', '#333333', '#000000',
  // Warm browns / beiges
  '#fff8e1', '#ffe0b2', '#f5d2b5', '#d4a07a', '#c9a87c', '#a67c52', '#8d5524', '#5d4037',
  // Reds
  '#ffcdd2', '#ef9a9a', '#e57373', '#f44336', '#e53935', '#d32f2f', '#c62828', '#b71c1c',
  // Oranges
  '#ffecd2', '#ffcc80', '#ffb74d', '#ff9800', '#fb8c00', '#f57c00', '#ef6c00', '#e65100',
  // Yellows
  '#fff9c4', '#fff59d', '#fff176', '#ffeb3b', '#fdd835', '#fbc02d', '#f9a825', '#f57f17',
  // Greens
  '#c8e6c9', '#a5d6a7', '#81c784', '#4caf50', '#43a047', '#388e3c', '#2e7d32', '#1b5e20',
  // Teals
  '#b2dfdb', '#80cbc4', '#4db6ac', '#009688', '#00897b', '#00796b', '#00695c', '#004d40',
  // Blues
  '#bbdefb', '#90caf9', '#64b5f6', '#2196f3', '#1e88e5', '#1976d2', '#1565c0', '#0d47a1',
  // Purples
  '#e1bee7', '#ce93d8', '#ba68c8', '#9c27b0', '#8e24aa', '#7b1fa2', '#6a1b9a', '#4a148c',
  // Pinks
  '#f8bbd0', '#f48fb1', '#f06292', '#e91e63', '#d81b60', '#c2185b', '#ad1457', '#880e4f',
];

export default function DrawingCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [brushSize, setBrushSize] = useState(3);
  const [brushColor, setBrushColor] = useState('#000000');
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

      {/* Main area: swatch palette + canvas side by side */}
      <div className="flex-1 flex min-h-0">
        {/* Color swatches (eyeshadow palette) */}
        <div className="w-[140px] shrink-0 border-r border-[var(--border)] overflow-y-auto p-1.5">
          {/* Selected color preview */}
          <div className="flex items-center gap-1.5 mb-1.5 px-0.5">
            <div
              className="w-5 h-5 rounded shadow-inner"
              style={{ backgroundColor: brushColor, border: brushColor === '#ffffff' ? '1px solid #ddd' : 'none' }}
            />
            <span className="text-[9px] text-[var(--text-muted)] font-mono uppercase">{brushColor}</span>
          </div>
          {/* Swatch grid */}
          <div className="grid grid-cols-8 gap-px bg-[var(--border)] rounded-lg overflow-hidden shadow-inner">
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

        {/* Canvas area */}
        <div
          ref={containerRef}
          className="flex-1 min-w-0 drawing-active relative bg-gray-50"
        >
          {/* Transparency checkerboard */}
          <div
            className="absolute inset-0 opacity-10"
            style={{
              backgroundImage:
                'linear-gradient(45deg, #999 25%, transparent 25%), linear-gradient(-45deg, #999 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #999 75%), linear-gradient(-45deg, transparent 75%, #999 75%)',
              backgroundSize: '16px 16px',
              backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0px',
            }}
          />
          <canvas
            ref={canvasRef}
            width={canvasSize.width}
            height={canvasSize.height}
            className="relative z-10 touch-none"
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
    </div>
  );
}
