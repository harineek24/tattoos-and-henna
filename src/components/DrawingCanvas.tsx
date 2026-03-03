import { useRef, useState, useEffect, useCallback } from 'react';
import { saveDesign } from '../lib/designStore';

interface DrawingCanvasProps {
  onDesignSaved: () => void;
}

export default function DrawingCanvas({ onDesignSaved }: DrawingCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [brushSize, setBrushSize] = useState(3);
  const [brushColor, setBrushColor] = useState('#000000');
  const [saving, setSaving] = useState(false);
  const [designName, setDesignName] = useState('');
  const [canvasSize, setCanvasSize] = useState({ width: 300, height: 200 });

  // Resize canvas to fit container
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

  // Redraw white background is NOT needed — we want transparency
  // But we need to clear the canvas when size changes
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

  const handleSave = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const name = designName.trim() || `Design ${Date.now()}`;
    setSaving(true);

    // Trim the canvas to just the drawn content
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const { data, width, height } = imageData;

    let minX = width, minY = height, maxX = 0, maxY = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const alpha = data[(y * width + x) * 4 + 3];
        if (alpha > 0) {
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
      }
    }

    if (maxX < minX) {
      setSaving(false);
      return; // Nothing drawn
    }

    // Add some padding
    const pad = 8;
    minX = Math.max(0, minX - pad);
    minY = Math.max(0, minY - pad);
    maxX = Math.min(width - 1, maxX + pad);
    maxY = Math.min(height - 1, maxY + pad);

    const trimW = maxX - minX + 1;
    const trimH = maxY - minY + 1;

    const trimCanvas = document.createElement('canvas');
    trimCanvas.width = trimW;
    trimCanvas.height = trimH;
    const trimCtx = trimCanvas.getContext('2d')!;
    trimCtx.drawImage(canvas, minX, minY, trimW, trimH, 0, 0, trimW, trimH);

    const dataUrl = trimCanvas.toDataURL('image/png');
    const result = await saveDesign(name, dataUrl);

    if (result) {
      clearCanvas();
      setDesignName('');
      onDesignSaved();
    }

    setSaving(false);
  }, [designName, onDesignSaved]);

  const colors = ['#000000', '#1a1a2e', '#6b2fa0', '#c9a87c', '#d4380d', '#237804', '#0050b3', '#8c8c8c'];

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border)]">
        <h2 className="text-sm font-semibold tracking-wide uppercase text-[var(--accent)]">
          Draw Your Own
        </h2>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--border)] flex-wrap">
        {/* Colors */}
        <div className="flex gap-1">
          {colors.map((c) => (
            <button
              key={c}
              onClick={() => setBrushColor(c)}
              className={`w-5 h-5 rounded-full border-2 transition-transform ${
                brushColor === c ? 'border-[var(--accent)] scale-125' : 'border-[var(--border)]'
              }`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>

        {/* Brush size */}
        <input
          type="range"
          min="1"
          max="12"
          value={brushSize}
          onChange={(e) => setBrushSize(Number(e.target.value))}
          className="w-16 accent-[var(--accent)]"
        />
        <span className="text-[10px] text-[var(--text-muted)] w-5">{brushSize}px</span>

        {/* Clear */}
        <button
          onClick={clearCanvas}
          className="ml-auto text-xs px-2 py-1 rounded bg-[var(--bg-dark)] border border-[var(--border)]
                     hover:border-red-500 hover:text-red-400 transition-colors"
        >
          Clear
        </button>
      </div>

      {/* Canvas area */}
      <div
        ref={containerRef}
        className="flex-1 min-h-0 bg-white/5 drawing-active relative"
      >
        {/* Transparency checkerboard */}
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              'linear-gradient(45deg, #333 25%, transparent 25%), linear-gradient(-45deg, #333 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #333 75%), linear-gradient(-45deg, transparent 75%, #333 75%)',
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

      {/* Save bar */}
      <div className="flex items-center gap-2 px-3 py-2 border-t border-[var(--border)]">
        <input
          type="text"
          placeholder="Design name..."
          value={designName}
          onChange={(e) => setDesignName(e.target.value)}
          className="flex-1 text-sm bg-[var(--bg-dark)] border border-[var(--border)] rounded px-2 py-1.5
                     text-[var(--text)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]"
        />
        <button
          onClick={handleSave}
          disabled={saving}
          className="text-sm px-3 py-1.5 rounded bg-[var(--accent)] text-black font-medium
                     hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save & Add'}
        </button>
      </div>
    </div>
  );
}
