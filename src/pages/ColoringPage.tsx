import { useState, useRef, useEffect, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import PartySocket from 'partysocket';

// ─── Curated color palette ──────────────────────────────────────
const COLORS = [
  '#000000', '#434343', '#9e9e9e', '#ffffff',
  '#e53935', '#ff7043', '#ffb74d', '#fff176',
  '#66bb6a', '#26a69a', '#42a5f5', '#5c6bc0',
  '#ab47bc', '#ec407a', '#8d6e63', '#f5d2b5',
];

// ─── B&W templates ──────────────────────────────────────────────
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

interface UserJoinedEvent {
  type: 'user-joined';
  name: string;
  id: string;
}

interface UserLeftEvent {
  type: 'user-left';
  id: string;
}

type SyncEvent = StrokeEvent | FillEvent | ImageEvent | CursorEvent | UserJoinedEvent | UserLeftEvent;

// ─── Flood fill (scanline) ───────────────────────────────────────
function floodFill(ctx: CanvasRenderingContext2D, startX: number, startY: number, fillColor: string) {
  const { width, height } = ctx.canvas;
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  const sx = Math.round(startX);
  const sy = Math.round(startY);
  if (sx < 0 || sx >= width || sy < 0 || sy >= height) return;

  const tmp = document.createElement('canvas');
  tmp.width = tmp.height = 1;
  const tmpCtx = tmp.getContext('2d')!;
  tmpCtx.fillStyle = fillColor;
  tmpCtx.fillRect(0, 0, 1, 1);
  const fc = tmpCtx.getImageData(0, 0, 1, 1).data;

  const targetIdx = (sy * width + sx) * 4;
  const tr = data[targetIdx], tg = data[targetIdx + 1], tb = data[targetIdx + 2], ta = data[targetIdx + 3];

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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 });
  const [color, setColor] = useState('#e53935');
  const [brushSize, setBrushSize] = useState(4);
  const [tool, setTool] = useState<Tool>('brush');
  const [isDrawing, setIsDrawing] = useState(false);
  const [roomId, setRoomId] = useState(roomParam || '');
  const [connected, setConnected] = useState(false);
  const [connectionError, setConnectionError] = useState('');
  const [userName, setUserName] = useState('');
  const [remoteCursors, setRemoteCursors] = useState<Record<string, { x: number; y: number; color: string; name: string }>>({});
  const [toasts, setToasts] = useState<{ id: string; message: string }[]>([]);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showMultiplayer, setShowMultiplayer] = useState(false);
  const socketRef = useRef<PartySocket | null>(null);
  const myId = useRef(uuidv4());
  const strokeBuffer = useRef<[number, number][]>([]);
  const undoStack = useRef<ImageData[]>([]);

  const showToast = useCallback((message: string) => {
    const id = uuidv4();
    setToasts((prev) => [...prev, { id, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  }, []);

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
      query: { name: userName || 'Guest' },
    });

    ws.addEventListener('open', () => {
      failCount = 0;
      setConnected(true);
      setConnectionError('');
      setShowMultiplayer(false);
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
      case 'user-joined':
        showToast(`${event.name} joined the room`);
        break;
      case 'user-left':
        setRemoteCursors((prev) => {
          const next = { ...prev };
          delete next[event.id];
          return next;
        });
        showToast('A user left the room');
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

      broadcast({ type: 'image', dataUrl: canvas.toDataURL() });
    };
    img.onerror = () => {
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
      showToast('Link copied!');
    } catch {
      // fallback
    }
  };

  const toolBtn = (t: Tool, label: string, icon: React.ReactNode) => (
    <button
      key={t}
      onClick={() => setTool(t)}
      className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
        tool === t
          ? 'bg-[var(--accent)] text-white shadow-sm'
          : 'text-[var(--text-muted)] hover:bg-gray-100 hover:text-[var(--text)]'
      }`}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );

  return (
    <div className="h-screen w-screen flex flex-col bg-white">
      {/* ─── Top bar ──────────────────────────────────────────── */}
      <header className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--border)] shrink-0 bg-white">
        <Link
          to="/"
          className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
          title="Back to Henna Studio"
        >
          <svg className="w-5 h-5 text-[var(--text-muted)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </Link>

        <h1 className="text-sm font-semibold text-[var(--text)] tracking-tight">Coloring</h1>

        <button
          onClick={() => setShowMultiplayer(!showMultiplayer)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
            connected
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              : 'border border-[var(--border)] text-[var(--text-muted)] hover:bg-gray-50'
          }`}
        >
          {connected && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />}
          {connected ? `Room` : 'Join Room'}
        </button>
      </header>

      {/* ─── Multiplayer dropdown ─────────────────────────────── */}
      {showMultiplayer && (
        <div className="absolute top-12 right-3 z-40 bg-white rounded-xl shadow-xl border border-[var(--border)] p-4 w-72 animate-[slideIn_0.2s_ease-out]">
          {!connected ? (
            <div className="flex flex-col gap-3">
              <input
                type="text"
                placeholder="Your name"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                className="text-sm bg-gray-50 rounded-lg px-3 py-2 text-[var(--text)]
                           placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30 border border-[var(--border)]"
              />
              <button
                onClick={handleCreateRoom}
                className="text-sm font-medium text-white bg-[var(--accent)] hover:bg-[var(--accent-hover)]
                           rounded-lg px-3 py-2 transition-colors"
              >
                Create Room
              </button>
              {connectionError && (
                <p className="text-xs text-red-500">{connectionError}</p>
              )}
              <div className="flex items-center gap-2">
                <div className="flex-1 h-px bg-[var(--border)]" />
                <span className="text-[10px] text-[var(--text-muted)] uppercase">or join</span>
                <div className="flex-1 h-px bg-[var(--border)]" />
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Room code"
                  value={roomId}
                  onChange={(e) => setRoomId(e.target.value)}
                  className="flex-1 text-sm bg-gray-50 rounded-lg px-3 py-2 text-[var(--text)]
                             placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30 border border-[var(--border)]"
                />
                <button
                  onClick={handleJoinRoom}
                  className="text-sm font-medium text-[var(--accent)] hover:bg-[var(--accent-light)]
                             rounded-lg px-3 py-2 transition-colors border border-[var(--border)]"
                >
                  Join
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                <span className="text-sm text-emerald-600 font-medium">Connected</span>
              </div>
              <div className="text-xs text-[var(--text-muted)] bg-gray-50 rounded-lg px-3 py-2 break-all font-mono">
                {roomId}
              </div>
              <button
                onClick={copyShareLink}
                className="text-sm font-medium text-[var(--accent)] hover:bg-[var(--accent-light)]
                           rounded-lg px-3 py-2 transition-colors border border-[var(--border)] mt-1"
              >
                Copy invite link
              </button>
            </div>
          )}
        </div>
      )}

      {/* ─── Canvas area ──────────────────────────────────────── */}
      <div
        ref={containerRef}
        className="flex-1 min-h-0 relative bg-gray-50"
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
              className="w-3 h-3 rounded-full border-2 border-white shadow-sm"
              style={{ backgroundColor: cursor.color }}
            />
            <span className="text-[10px] text-white bg-black/50 px-1.5 rounded-full mt-0.5 whitespace-nowrap">
              {cursor.name}
            </span>
          </div>
        ))}

        {/* Empty state hint */}
        {!connected && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="bg-white/80 backdrop-blur-sm rounded-2xl px-6 py-4 text-sm text-[var(--text-muted)] shadow-sm text-center max-w-xs">
              Pick a template or start drawing
            </div>
          </div>
        )}

        {/* Toast notifications */}
        <div className="absolute top-4 left-1/2 -translate-x-1/2 flex flex-col gap-2 z-30 pointer-events-none">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className="bg-[var(--text)] text-white text-sm font-medium px-4 py-2 rounded-full shadow-lg
                         animate-[slideIn_0.3s_ease-out] whitespace-nowrap"
            >
              {toast.message}
            </div>
          ))}
        </div>
      </div>

      {/* ─── Bottom toolbar ───────────────────────────────────── */}
      <div className="shrink-0 border-t border-[var(--border)] bg-white">
        {/* Color row */}
        <div className="flex items-center gap-2 px-4 py-2.5 overflow-x-auto">
          {COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              className={`w-8 h-8 rounded-full shrink-0 transition-all ${
                color === c
                  ? 'ring-2 ring-[var(--accent)] ring-offset-2 scale-110'
                  : 'hover:scale-110'
              }`}
              style={{
                backgroundColor: c,
                border: c === '#ffffff' ? '1.5px solid #ddd' : 'none',
              }}
            />
          ))}
        </div>

        {/* Tools + actions row */}
        <div className="flex items-center justify-between px-3 py-2 border-t border-gray-100">
          {/* Left: tools */}
          <div className="flex items-center gap-1">
            {toolBtn('brush', 'Brush',
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
              </svg>
            )}
            {toolBtn('fill', 'Fill',
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
              </svg>
            )}
            {toolBtn('eraser', 'Eraser',
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.9-9.9c1-1 2.5-1 3.4 0l3.3 3.3c1 1 1 2.5 0 3.4L9.4 21" />
                <path d="M22 21H7" />
              </svg>
            )}

            {/* Brush size */}
            {tool !== 'fill' && (
              <div className="flex items-center gap-1.5 ml-2">
                <input
                  type="range"
                  min="1"
                  max="30"
                  value={brushSize}
                  onChange={(e) => setBrushSize(Number(e.target.value))}
                  className="w-16 sm:w-24 accent-[var(--accent)]"
                />
                <span className="text-[10px] text-[var(--text-muted)] w-6">{brushSize}px</span>
              </div>
            )}
          </div>

          {/* Right: actions */}
          <div className="flex items-center gap-0.5">
            {/* Templates */}
            <button
              onClick={() => setShowTemplates(true)}
              className="p-2 rounded-lg text-[var(--text-muted)] hover:bg-gray-100 hover:text-[var(--text)] transition-colors"
              title="Templates"
            >
              <svg className="w-4.5 h-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7" />
                <rect x="14" y="3" width="7" height="7" />
                <rect x="3" y="14" width="7" height="7" />
                <rect x="14" y="14" width="7" height="7" />
              </svg>
            </button>

            {/* Upload */}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="p-2 rounded-lg text-[var(--text-muted)] hover:bg-gray-100 hover:text-[var(--text)] transition-colors"
              title="Upload image"
            >
              <svg className="w-4.5 h-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <path d="m21 15-5-5L5 21" />
              </svg>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleUpload}
              className="hidden"
            />

            {/* Undo */}
            <button
              onClick={undo}
              className="p-2 rounded-lg text-[var(--text-muted)] hover:bg-gray-100 hover:text-[var(--text)] transition-colors"
              title="Undo"
            >
              <svg className="w-4.5 h-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 7v6h6" />
                <path d="M3 13a9 9 0 1 0 2-7.7L3 7" />
              </svg>
            </button>

            <div className="w-px h-5 bg-[var(--border)] mx-1" />

            {/* Download */}
            <button
              onClick={handleDownload}
              className="p-2 rounded-lg text-[var(--text-muted)] hover:bg-gray-100 hover:text-[var(--text)] transition-colors"
              title="Download"
            >
              <svg className="w-4.5 h-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <path d="M7 10l5 5 5-5" />
                <path d="M12 15V3" />
              </svg>
            </button>

            {/* Clear */}
            <button
              onClick={clearCanvas}
              className="p-2 rounded-lg text-[var(--text-muted)] hover:bg-red-50 hover:text-red-500 transition-colors"
              title="Clear canvas"
            >
              <svg className="w-4.5 h-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 6h18" />
                <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* ─── Templates modal ──────────────────────────────────── */}
      {showTemplates && (
        <div
          className="fixed inset-0 z-50 bg-black/20 animate-[fadeIn_0.2s_ease-out]"
          onClick={() => setShowTemplates(false)}
        >
          <div
            className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl shadow-2xl animate-[slideUp_0.3s_ease-out]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 pt-5 pb-3">
              <h3 className="text-base font-semibold text-[var(--text)]">Choose a Template</h3>
              <button
                onClick={() => setShowTemplates(false)}
                className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-[var(--text-muted)]"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="grid grid-cols-4 sm:grid-cols-4 gap-3 px-5 pb-6 max-h-[40vh] overflow-y-auto">
              {TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => {
                    loadImageToCanvas(t.url);
                    setShowTemplates(false);
                  }}
                  className="aspect-square rounded-xl bg-gray-50 border border-[var(--border)]
                             hover:border-[var(--accent)] hover:shadow-md transition-all
                             flex flex-col items-center justify-center p-2 group"
                  title={t.name}
                >
                  <img src={t.url} alt={t.name} className="w-full h-full object-contain" />
                  <span className="text-[10px] text-[var(--text-muted)] mt-1 group-hover:text-[var(--accent)] transition-colors">
                    {t.name}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
