import { useState, useRef, useEffect, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import PartySocket from 'partysocket';

// ─── Color palette ──────────────────────────────────────────────
const COLORS = [
  // Row 1: basics
  '#000000', '#ffffff', '#808080', '#c0c0c0',
  // Row 2: reds
  '#ff0000', '#cc0000', '#990000', '#ff6666',
  // Row 3: oranges / browns
  '#ff8800', '#cc6600', '#994400', '#ffbb66',
  // Row 4: yellows
  '#ffff00', '#cccc00', '#999900', '#ffff88',
  // Row 5: greens
  '#00ff00', '#00cc00', '#009900', '#66ff66',
  // Row 6: cyans
  '#00ffff', '#00cccc', '#009999', '#66ffff',
  // Row 7: blues
  '#0000ff', '#0000cc', '#000099', '#6666ff',
  // Row 8: purples
  '#9900ff', '#7700cc', '#550099', '#bb66ff',
  // Row 9: pinks
  '#ff00ff', '#cc00cc', '#990099', '#ff66ff',
  // Row 10: skin tones / pastels
  '#f5d2b5', '#d4a07a', '#8d5524', '#ffcccc',
];

// ─── B&W template thumbnails ─────────────────────────────────────
const TEMPLATES = [
  { id: 'mandala', name: 'Mandala', url: '/designs/mandala-flower.svg' },
  { id: 'lotus', name: 'Lotus', url: '/designs/lotus.svg' },
  { id: 'butterfly', name: 'Butterfly', url: '/designs/butterfly.svg' },
  { id: 'elephant', name: 'Elephant', url: '/designs/elephant.svg' },
  { id: 'paisley', name: 'Paisley', url: '/designs/paisley.svg' },
  { id: 'hamsa', name: 'Hamsa', url: '/designs/hamsa.svg' },
  { id: 'rose', name: 'Rose', url: '/designs/rose.svg' },
  { id: 'feather', name: 'Feather', url: '/designs/feather.svg' },
];

type Tool = 'brush' | 'fill' | 'eraser';

interface StrokeEvent {
  type: 'stroke';
  points: [number, number][];
  color: string;
  size: number;
  tool: Tool;
}

interface FillEvent {
  type: 'fill';
  x: number;
  y: number;
  color: string;
}

interface ImageEvent {
  type: 'image';
  dataUrl: string;
}

interface CursorEvent {
  type: 'cursor';
  id: string;
  x: number;
  y: number;
  color: string;
  name: string;
}

type SyncEvent = StrokeEvent | FillEvent | ImageEvent | CursorEvent;

// ─── Flood fill (scanline) ───────────────────────────────────────
function floodFill(ctx: CanvasRenderingContext2D, startX: number, startY: number, fillColor: string) {
  const { width, height } = ctx.canvas;
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  const sx = Math.round(startX);
  const sy = Math.round(startY);
  if (sx < 0 || sx >= width || sy < 0 || sy >= height) return;

  // Parse fill color
  const tmp = document.createElement('canvas');
  tmp.width = tmp.height = 1;
  const tmpCtx = tmp.getContext('2d')!;
  tmpCtx.fillStyle = fillColor;
  tmpCtx.fillRect(0, 0, 1, 1);
  const fc = tmpCtx.getImageData(0, 0, 1, 1).data;

  const targetIdx = (sy * width + sx) * 4;
  const tr = data[targetIdx], tg = data[targetIdx + 1], tb = data[targetIdx + 2], ta = data[targetIdx + 3];

  // Don't fill if same color
  if (tr === fc[0] && tg === fc[1] && tb === fc[2] && ta === fc[3]) return;

  const tolerance = 32;
  const matches = (i: number) =>
    Math.abs(data[i] - tr) <= tolerance &&
    Math.abs(data[i + 1] - tg) <= tolerance &&
    Math.abs(data[i + 2] - tb) <= tolerance &&
    Math.abs(data[i + 3] - ta) <= tolerance;

  const stack: [number, number][] = [[sx, sy]];
  const visited = new Uint8Array(width * height);

  while (stack.length > 0) {
    const [x, y] = stack.pop()!;
    const idx = y * width + x;
    if (visited[idx]) continue;
    visited[idx] = 1;

    const pi = idx * 4;
    if (!matches(pi)) continue;

    data[pi] = fc[0];
    data[pi + 1] = fc[1];
    data[pi + 2] = fc[2];
    data[pi + 3] = fc[3];

    if (x > 0) stack.push([x - 1, y]);
    if (x < width - 1) stack.push([x + 1, y]);
    if (y > 0) stack.push([x, y - 1]);
    if (y < height - 1) stack.push([x, y + 1]);
  }

  ctx.putImageData(imageData, 0, 0);
}

// ─── Component ───────────────────────────────────────────────────
export default function ColoringPage() {
  const [searchParams] = useSearchParams();
  const roomParam = searchParams.get('room');

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 });
  const [color, setColor] = useState('#ff0000');
  const [brushSize, setBrushSize] = useState(4);
  const [tool, setTool] = useState<Tool>('brush');
  const [isDrawing, setIsDrawing] = useState(false);
  const [roomId, setRoomId] = useState(roomParam || '');
  const [connected, setConnected] = useState(false);
  const [connectionError, setConnectionError] = useState('');
  const [userName, setUserName] = useState('');
  const [remoteCursors, setRemoteCursors] = useState<Record<string, { x: number; y: number; color: string; name: string }>>({});
  const socketRef = useRef<PartySocket | null>(null);
  const myId = useRef(uuidv4());
  const strokeBuffer = useRef<[number, number][]>([]);
  const undoStack = useRef<ImageData[]>([]);

  const saveSnapshot = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    undoStack.current.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    if (undoStack.current.length > 50) undoStack.current.shift();
  };

  const undo = useCallback(() => {
    const snapshot = undoStack.current.pop();
    if (!snapshot) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.putImageData(snapshot, 0, 0);
  }, []);

  // Ctrl+Z listener
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

  // Resize canvas to fit container
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setCanvasSize({
          width: Math.floor(entry.contentRect.width),
          height: Math.floor(entry.contentRect.height),
        });
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Fill canvas white on size change
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }, [canvasSize]);

  // ─── PartyKit connection ───────────────────────────────────────
  const connectToRoom = useCallback((id: string) => {
    if (socketRef.current) {
      socketRef.current.close();
    }

    setConnectionError('');

    const partyHost = import.meta.env.VITE_PARTYKIT_HOST || 'color-henna.harineek24.partykit.dev';
    if (!partyHost) {
      setConnectionError('Could not connect to multiplayer server');
      return;
    }

    let failCount = 0;

    const ws = new PartySocket({
      host: partyHost,
      room: id,
      id: myId.current,
      maxRetries: 3,
    });

    ws.addEventListener('open', () => {
      failCount = 0;
      setConnected(true);
      setConnectionError('');
    });

    ws.addEventListener('close', () => {
      setConnected(false);
      failCount++;
      if (failCount > 3) {
        setConnectionError('Could not connect to server');
        ws.close();
        socketRef.current = null;
      }
    });

    ws.addEventListener('error', () => {
      failCount++;
      if (failCount > 3) {
        setConnectionError('Could not connect to server');
        ws.close();
        socketRef.current = null;
      }
    });

    ws.addEventListener('message', (e) => {
      try {
        const event: SyncEvent = JSON.parse(e.data);
        applyRemoteEvent(event);
      } catch {
        // ignore malformed messages
      }
    });

    socketRef.current = ws;
    setRoomId(id);

    // Update URL with room param
    const url = new URL(window.location.href);
    url.searchParams.set('room', id);
    window.history.replaceState({}, '', url.toString());
  }, []);

  const applyRemoteEvent = (event: SyncEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    switch (event.type) {
      case 'stroke': {
        ctx.strokeStyle = event.tool === 'eraser' ? '#ffffff' : event.color;
        ctx.lineWidth = event.size;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        if (event.points.length > 0) {
          ctx.moveTo(event.points[0][0], event.points[0][1]);
          for (let i = 1; i < event.points.length; i++) {
            ctx.lineTo(event.points[i][0], event.points[i][1]);
          }
          ctx.stroke();
        }
        break;
      }
      case 'fill':
        floodFill(ctx, event.x, event.y, event.color);
        break;
      case 'image': {
        const img = new Image();
        img.onload = () => {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          const scale = Math.min(canvas.width / img.width, canvas.height / img.height) * 0.9;
          const x = (canvas.width - img.width * scale) / 2;
          const y = (canvas.height - img.height * scale) / 2;
          ctx.drawImage(img, x, y, img.width * scale, img.height * scale);
        };
        img.src = event.dataUrl;
        break;
      }
      case 'cursor':
        setRemoteCursors((prev) => ({
          ...prev,
          [event.id]: { x: event.x, y: event.y, color: event.color, name: event.name },
        }));
        break;
    }
  };

  const broadcast = (event: SyncEvent) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(event));
    }
  };

  // ─── Drawing handlers ─────────────────────────────────────────
  const getPos = (e: React.MouseEvent | React.TouchEvent): [number, number] => {
    const canvas = canvasRef.current;
    if (!canvas) return [0, 0];
    const rect = canvas.getBoundingClientRect();
    if ('touches' in e) {
      return [e.touches[0].clientX - rect.left, e.touches[0].clientY - rect.top];
    }
    return [e.clientX - rect.left, e.clientY - rect.top];
  };

  const handlePointerDown = (e: React.MouseEvent | React.TouchEvent) => {
    const [x, y] = getPos(e);

    if (tool === 'fill') {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      saveSnapshot();
      floodFill(ctx, x, y, color);
      broadcast({ type: 'fill', x, y, color });
      return;
    }

    saveSnapshot();
    setIsDrawing(true);
    strokeBuffer.current = [[x, y]];

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.strokeStyle = tool === 'eraser' ? '#ffffff' : color;
    ctx.lineWidth = brushSize;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  };

  const handlePointerMove = (e: React.MouseEvent | React.TouchEvent) => {
    const [x, y] = getPos(e);

    // Send cursor position
    broadcast({
      type: 'cursor',
      id: myId.current,
      x,
      y,
      color,
      name: userName || 'Guest',
    });

    if (!isDrawing) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.lineTo(x, y);
    ctx.stroke();
    strokeBuffer.current.push([x, y]);
  };

  const handlePointerUp = () => {
    if (isDrawing && strokeBuffer.current.length > 0) {
      broadcast({
        type: 'stroke',
        points: strokeBuffer.current,
        color,
        size: brushSize,
        tool,
      });
    }
    setIsDrawing(false);
    strokeBuffer.current = [];
  };

  // ─── Load image onto canvas ────────────────────────────────────
  const loadImageToCanvas = (src: string) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    saveSnapshot();

    const img = new Image();
    // Only set crossOrigin for non-data URLs
    if (!src.startsWith('data:')) {
      img.crossOrigin = 'anonymous';
    }
    img.onload = () => {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const scale = Math.min(canvas.width / img.width, canvas.height / img.height) * 0.9;
      const w = img.width * scale;
      const h = img.height * scale;
      const x = (canvas.width - w) / 2;
      const y = (canvas.height - h) / 2;
      ctx.drawImage(img, x, y, w, h);

      // Broadcast to room
      broadcast({ type: 'image', dataUrl: canvas.toDataURL() });
    };
    img.onerror = () => {
      // Retry without crossOrigin if it fails
      const retry = new Image();
      retry.onload = () => {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        const scale = Math.min(canvas.width / retry.width, canvas.height / retry.height) * 0.9;
        const w = retry.width * scale;
        const h = retry.height * scale;
        const x = (canvas.width - w) / 2;
        const y = (canvas.height - h) / 2;
        ctx.drawImage(retry, x, y, w, h);
      };
      retry.src = src;
    };
    img.src = src;
  };

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        loadImageToCanvas(reader.result);
      }
    };
    reader.readAsDataURL(file);
    // Reset so the same file can be re-selected
    e.target.value = '';
  };

  const handleCreateRoom = () => {
    const id = uuidv4().slice(0, 8);
    connectToRoom(id);
  };

  const handleJoinRoom = () => {
    if (roomId.trim()) {
      connectToRoom(roomId.trim());
    }
  };

  const handleDownload = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = 'coloring-page.png';
    link.href = canvas.toDataURL();
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    saveSnapshot();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  };

  const shareLink = roomId ? `${window.location.origin}/color?room=${roomId}` : '';

  const copyShareLink = async () => {
    if (!shareLink) return;
    try {
      await navigator.clipboard.writeText(shareLink);
    } catch {
      // fallback
    }
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
            <Link to="/" className="text-[var(--text-muted)] hover:text-[var(--text)] font-bold transition-colors">
              Henna
            </Link>
            <span className="text-[var(--accent)] font-bold">Coloring</span>
          </nav>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <button
            onClick={handleDownload}
            className="px-2 py-1 text-[var(--accent)] font-bold hover:text-[var(--accent-hover)] transition-colors"
          >
            Download
          </button>
          <button
            onClick={clearCanvas}
            className="px-2 py-1 text-red-400 font-bold hover:text-red-300 transition-colors"
          >
            Clear
          </button>
        </div>
      </header>

      <div className="flex-1 flex min-h-0">
        {/* Left sidebar — tools + colors */}
        <div className="w-56 border-r border-[var(--border)] flex flex-col overflow-y-auto shrink-0">
          {/* Room / Multiplayer */}
          <div className="p-3 border-b border-[var(--border)]">
            <h3 className="text-xs font-bold text-[var(--accent)] uppercase tracking-wide mb-2">Multiplayer</h3>
            {!connected ? (
              <div className="flex flex-col gap-2">
                <input
                  type="text"
                  placeholder="Your name"
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  className="text-xs bg-transparent border-b border-[var(--border)] px-1 py-1
                             text-[var(--text)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]"
                />
                <button
                  onClick={handleCreateRoom}
                  className="text-xs text-emerald-400 font-bold hover:text-emerald-300 transition-colors text-left"
                >
                  Create Room
                </button>
                {connectionError && (
                  <p className="text-[10px] text-red-400">{connectionError}</p>
                )}
                <div className="flex gap-1">
                  <input
                    type="text"
                    placeholder="Room code"
                    value={roomId}
                    onChange={(e) => setRoomId(e.target.value)}
                    className="flex-1 text-xs bg-transparent border-b border-[var(--border)] px-1 py-1
                               text-[var(--text)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]"
                  />
                  <button
                    onClick={handleJoinRoom}
                    className="text-xs text-[var(--accent)] font-bold hover:text-[var(--accent-hover)] transition-colors"
                  >
                    Join
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  <span className="text-xs text-emerald-400">Connected</span>
                </div>
                <div className="text-[10px] text-[var(--text-muted)] break-all">Room: {roomId}</div>
                <button
                  onClick={copyShareLink}
                  className="text-xs text-[var(--accent)] font-bold hover:text-[var(--accent-hover)] transition-colors text-left mt-1"
                >
                  Copy invite link
                </button>
              </div>
            )}
          </div>

          {/* Tools */}
          <div className="p-3 border-b border-[var(--border)]">
            <h3 className="text-xs font-bold text-[var(--accent)] uppercase tracking-wide mb-2">Tools</h3>
            <div className="flex gap-2">
              {([
                ['brush', 'Brush'],
                ['fill', 'Fill'],
                ['eraser', 'Eraser'],
              ] as [Tool, string][]).map(([t, label]) => (
                <button
                  key={t}
                  onClick={() => setTool(t)}
                  className={`text-xs px-2 py-1 rounded transition-colors ${
                    tool === t
                      ? 'text-[var(--accent)] font-bold'
                      : 'text-[var(--text-muted)] hover:text-[var(--text)]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {tool !== 'fill' && (
              <div className="flex items-center gap-2 mt-2">
                <input
                  type="range"
                  min="1"
                  max="30"
                  value={brushSize}
                  onChange={(e) => setBrushSize(Number(e.target.value))}
                  className="flex-1 accent-[var(--accent)]"
                />
                <span className="text-[10px] text-[var(--text-muted)] w-7">{brushSize}px</span>
              </div>
            )}
          </div>

          {/* Colors */}
          <div className="p-3 border-b border-[var(--border)]">
            <h3 className="text-xs font-bold text-[var(--accent)] uppercase tracking-wide mb-2">Colors</h3>
            <div className="grid grid-cols-4 gap-1.5">
              {COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={`w-8 h-8 rounded border-2 transition-transform ${
                    color === c ? 'border-[var(--accent)] scale-110' : 'border-transparent'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          {/* Upload */}
          <div className="p-3 border-b border-[var(--border)]">
            <h3 className="text-xs font-bold text-[var(--accent)] uppercase tracking-wide mb-2">Upload Image</h3>
            <label className="text-xs text-[var(--text-muted)] font-bold hover:text-[var(--text)] transition-colors cursor-pointer">
              Choose PNG/JPG...
              <input
                type="file"
                accept="image/*"
                onChange={handleUpload}
                className="hidden"
              />
            </label>
          </div>

          {/* Templates */}
          <div className="p-3">
            <h3 className="text-xs font-bold text-[var(--accent)] uppercase tracking-wide mb-2">Templates</h3>
            <div className="grid grid-cols-2 gap-2">
              {TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => loadImageToCanvas(t.url)}
                  className="aspect-square rounded bg-white border border-[var(--border)]
                             hover:border-[var(--accent)] transition-colors flex items-center justify-center p-1"
                  title={t.name}
                >
                  <img src={t.url} alt={t.name} className="w-full h-full object-contain" />
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Canvas area */}
        <div
          ref={containerRef}
          className="flex-1 min-w-0 relative bg-[#1a1a1a]"
          style={{ cursor: tool === 'fill' ? 'crosshair' : tool === 'eraser' ? 'cell' : 'default' }}
        >
          <canvas
            ref={canvasRef}
            width={canvasSize.width}
            height={canvasSize.height}
            className="touch-none"
            onMouseDown={handlePointerDown}
            onMouseMove={handlePointerMove}
            onMouseUp={handlePointerUp}
            onMouseLeave={handlePointerUp}
            onTouchStart={handlePointerDown}
            onTouchMove={handlePointerMove}
            onTouchEnd={handlePointerUp}
          />

          {/* Remote cursors */}
          {Object.entries(remoteCursors).map(([id, cursor]) => (
            <div
              key={id}
              className="absolute pointer-events-none z-20 flex flex-col items-center"
              style={{
                left: cursor.x,
                top: cursor.y,
                transform: 'translate(-4px, -4px)',
              }}
            >
              <div
                className="w-3 h-3 rounded-full border-2 border-white"
                style={{ backgroundColor: cursor.color }}
              />
              <span className="text-[10px] text-white bg-black/60 px-1 rounded mt-0.5 whitespace-nowrap">
                {cursor.name}
              </span>
            </div>
          ))}

          {/* Empty state */}
          {!connected && (
            <div className="absolute inset-0 flex items-end justify-center pb-8 pointer-events-none">
              <div className="bg-black/60 backdrop-blur-sm rounded-lg px-4 py-2 text-sm text-[var(--text-muted)]">
                Pick a template, upload an image, or create a room to color together
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
