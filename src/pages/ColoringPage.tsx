import { useState, useRef, useEffect, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import PartySocket from 'partysocket';

// ─── Full color palette (8 cols × 10 rows = 80 colors) ──
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
type BrushType = 'round' | 'square' | 'calligraphy' | 'spray';

interface StrokeEvent {
  type: 'stroke';
  points: [number, number][];
  color: string;
  size: number;
  tool: Tool;
  brushType?: BrushType;
  opacity?: number;
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

// ─── Saved rooms persistence ────────────────────────────────────
interface SavedRoom {
  roomId: string;
  name: string;       // user-chosen name or auto-generated
  thumbnail: string;  // small data-url snapshot
  savedAt: number;    // timestamp
}

const SAVED_ROOMS_KEY = 'coloring-saved-rooms';

function loadSavedRooms(): SavedRoom[] {
  try {
    return JSON.parse(localStorage.getItem(SAVED_ROOMS_KEY) || '[]');
  } catch { return []; }
}

function persistSavedRooms(rooms: SavedRoom[]) {
  localStorage.setItem(SAVED_ROOMS_KEY, JSON.stringify(rooms));
}

function createThumbnail(canvas: HTMLCanvasElement): string {
  const thumb = document.createElement('canvas');
  thumb.width = 120;
  thumb.height = 90;
  const ctx = thumb.getContext('2d')!;
  ctx.drawImage(canvas, 0, 0, 120, 90);
  return thumb.toDataURL('image/jpeg', 0.6);
}

// ─── Component ───────────────────────────────────────────────────
export default function ColoringPage() {
  const [searchParams] = useSearchParams();
  const roomParam = searchParams.get('room');

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [canvasSize] = useState({ width: 800, height: 600 });
  const [color, setColor] = useState('#e53935');
  const [brushSize, setBrushSize] = useState(4);
  const [tool, setTool] = useState<Tool>('brush');
  const [brushType, setBrushType] = useState<BrushType>('round');
  const [opacity, setOpacity] = useState(100);
  const [isDrawing, setIsDrawing] = useState(false);
  const [roomId, setRoomId] = useState(roomParam || '');
  const [connected, setConnected] = useState(false);
  const [connectionError, setConnectionError] = useState('');
  const [userName, setUserName] = useState('');
  const [remoteCursors, setRemoteCursors] = useState<Record<string, { x: number; y: number; color: string; name: string }>>({});
  const [toasts, setToasts] = useState<{ id: string; message: string }[]>([]);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showMultiplayer, setShowMultiplayer] = useState(false);
  const [savedRooms, setSavedRooms] = useState<SavedRoom[]>(loadSavedRooms);
  const [showInvite, setShowInvite] = useState(!!roomParam);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [magnifierOn, setMagnifierOn] = useState(false);
  const [magCenter, setMagCenter] = useState<[number, number]>([0, 0]); // canvas-pixel coords
  const [magZoom, setMagZoom] = useState(4);
  const [draggingMag, setDraggingMag] = useState(false);
  const magCanvasRef = useRef<HTMLCanvasElement>(null);
  const magContainerRef = useRef<HTMLDivElement>(null);
  const magDragOffset = useRef<[number, number]>([0, 0]);
  const magPos = useRef<[number, number]>([20, 20]); // screen position of the magnifier
  const [magPosState, setMagPosState] = useState<[number, number]>([20, 20]);
  const socketRef = useRef<PartySocket | null>(null);
  const myId = useRef(uuidv4());
  const strokeBuffer = useRef<[number, number][]>([]);
  const undoStack = useRef<ImageData[]>([]);
  const redoStack = useRef<ImageData[]>([]);

  const showToast = useCallback((message: string) => {
    const id = uuidv4();
    setToasts((prev) => [...prev, { id, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  }, []);

  const getCurrentSnapshot = (): ImageData | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    return ctx.getImageData(0, 0, canvas.width, canvas.height);
  };

  const saveSnapshot = () => {
    const snapshot = getCurrentSnapshot();
    if (!snapshot) return;
    undoStack.current.push(snapshot);
    if (undoStack.current.length > 50) undoStack.current.shift();
    // New action invalidates redo history
    redoStack.current = [];
  };

  const undo = useCallback(() => {
    const snapshot = undoStack.current.pop();
    if (!snapshot) return;
    // Save current state to redo stack before undoing
    const current = getCurrentSnapshot();
    if (current) redoStack.current.push(current);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.putImageData(snapshot, 0, 0);
  }, []);

  const redo = useCallback(() => {
    const snapshot = redoStack.current.pop();
    if (!snapshot) return;
    // Save current state to undo stack before redoing
    const current = getCurrentSnapshot();
    if (current) undoStack.current.push(current);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.putImageData(snapshot, 0, 0);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'z') {
        e.preventDefault();
        redo();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        undo();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo]);

  // Set canvas to a fixed resolution so art is consistent across devices.
  // The canvas CSS will scale to fill the container.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    const w = canvas.width;
    const h = canvas.height;

    switch (event.type) {
      case 'stroke': {
        // Denormalize from 0-1 range to local canvas pixels
        const localPoints = event.points.map(([nx, ny]) => [nx * w, ny * h] as [number, number]);
        const localSize = event.size * w;
        const strokeColor = event.tool === 'eraser' ? '#ffffff' : event.color;
        const bt = event.brushType || 'round';
        const alpha = event.tool === 'eraser' ? 1 : (event.opacity ?? 100) / 100;

        if (bt === 'spray' && event.tool !== 'eraser') {
          ctx.fillStyle = strokeColor;
          ctx.globalAlpha = alpha * 0.3;
          for (const [px, py] of localPoints) {
            const density = Math.floor(localSize * 2);
            const radius = localSize * 1.5;
            for (let i = 0; i < density; i++) {
              const angle = Math.random() * Math.PI * 2;
              const r = Math.random() * radius;
              ctx.fillRect(px + r * Math.cos(angle), py + r * Math.sin(angle), 1, 1);
            }
          }
          ctx.globalAlpha = 1;
        } else {
          ctx.globalAlpha = alpha;
          ctx.strokeStyle = strokeColor;
          ctx.lineWidth = localSize;
          switch (bt) {
            case 'round':
              ctx.lineCap = 'round';
              ctx.lineJoin = 'round';
              break;
            case 'square':
              ctx.lineCap = 'square';
              ctx.lineJoin = 'miter';
              break;
            case 'calligraphy':
              ctx.lineCap = 'butt';
              ctx.lineJoin = 'bevel';
              ctx.lineWidth = localSize * 0.4;
              break;
            default:
              ctx.lineCap = 'round';
              ctx.lineJoin = 'round';
          }
          ctx.beginPath();
          if (localPoints.length > 0) {
            ctx.moveTo(localPoints[0][0], localPoints[0][1]);
            for (let i = 1; i < localPoints.length; i++) {
              ctx.lineTo(localPoints[i][0], localPoints[i][1]);
            }
            ctx.stroke();
          }
          ctx.globalAlpha = 1;
        }
        break;
      }
      case 'fill':
        // Denormalize fill position
        floodFill(ctx, event.x * w, event.y * h, event.color);
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
        // Denormalize cursor position to local canvas pixels
        setRemoteCursors((prev) => ({
          ...prev,
          [event.id]: { x: event.x * w, y: event.y * h, color: event.color, name: event.name },
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
      const canvas = canvasRef.current;
      if (!canvas) { socketRef.current.send(JSON.stringify(event)); return; }
      const w = canvas.width;
      const h = canvas.height;
      let normalized: SyncEvent;
      switch (event.type) {
        case 'stroke':
          normalized = { ...event, points: event.points.map(([x, y]) => [x / w, y / h] as [number, number]), size: event.size / w };
          break;
        case 'fill':
          normalized = { ...event, x: event.x / w, y: event.y / h };
          break;
        case 'cursor':
          normalized = { ...event, x: event.x / w, y: event.y / h };
          break;
        default:
          normalized = event;
      }
      socketRef.current.send(JSON.stringify(normalized));
    }
  };

  // ─── Drawing handlers ─────────────────────────────────────────
  const getPos = (e: React.MouseEvent | React.TouchEvent): [number, number] => {
    const canvas = canvasRef.current;
    if (!canvas) return [0, 0];
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ('touches' in e) {
      const touch = e.touches[0] || (e as React.TouchEvent).changedTouches[0];
      if (!touch) return [0, 0];
      return [
        (touch.clientX - rect.left) * scaleX,
        (touch.clientY - rect.top) * scaleY,
      ];
    }
    return [
      (e.clientX - rect.left) * scaleX,
      (e.clientY - rect.top) * scaleY,
    ];
  };

  const applyBrushStyle = (ctx: CanvasRenderingContext2D, bt: BrushType, size: number, strokeColor: string, alpha: number) => {
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = size;
    switch (bt) {
      case 'round':
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        break;
      case 'square':
        ctx.lineCap = 'square';
        ctx.lineJoin = 'miter';
        break;
      case 'calligraphy':
        ctx.lineCap = 'butt';
        ctx.lineJoin = 'bevel';
        // Calligraphy uses a narrower horizontal width
        ctx.lineWidth = size * 0.4;
        break;
      case 'spray':
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        break;
    }
  };

  const drawSpray = (ctx: CanvasRenderingContext2D, x: number, y: number, size: number, sprayColor: string, alpha: number) => {
    const density = Math.floor(size * 2);
    const radius = size * 1.5;
    ctx.globalAlpha = alpha * 0.3;
    ctx.fillStyle = sprayColor;
    for (let i = 0; i < density; i++) {
      const angle = Math.random() * Math.PI * 2;
      const r = Math.random() * radius;
      ctx.fillRect(x + r * Math.cos(angle), y + r * Math.sin(angle), 1, 1);
    }
    ctx.globalAlpha = 1;
  };

  const handlePointerDown = (e: React.MouseEvent | React.TouchEvent) => {
    if ('touches' in e) e.preventDefault();
    const [x, y] = getPos(e);
    updateMagCenterFromMainPos(x, y);

    if (tool === 'fill') {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      saveSnapshot();
      floodFill(ctx, x, y, color);
      broadcast({ type: 'fill', x, y, color });
      requestAnimationFrame(updateMagnifier);
      return;
    }

    saveSnapshot();
    setIsDrawing(true);
    strokeBuffer.current = [[x, y]];

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const strokeColor = tool === 'eraser' ? '#ffffff' : color;
    const alpha = tool === 'eraser' ? 1 : opacity / 100;

    if (brushType === 'spray' && tool !== 'eraser') {
      drawSpray(ctx, x, y, brushSize, strokeColor, alpha);
    } else {
      ctx.beginPath();
      ctx.moveTo(x, y);
      applyBrushStyle(ctx, tool === 'eraser' ? 'round' : brushType, brushSize, strokeColor, alpha);
    }
    requestAnimationFrame(updateMagnifier);
  };

  const handlePointerMove = (e: React.MouseEvent | React.TouchEvent) => {
    if ('touches' in e) e.preventDefault();
    const [x, y] = getPos(e);
    updateMagCenterFromMainPos(x, y);

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

    const strokeColor = tool === 'eraser' ? '#ffffff' : color;
    const alpha = tool === 'eraser' ? 1 : opacity / 100;

    if (brushType === 'spray' && tool !== 'eraser') {
      drawSpray(ctx, x, y, brushSize, strokeColor, alpha);
    } else {
      ctx.lineTo(x, y);
      ctx.stroke();
    }
    strokeBuffer.current.push([x, y]);
    requestAnimationFrame(updateMagnifier);
  };

  const handlePointerUp = () => {
    if (isDrawing && strokeBuffer.current.length > 0) {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (ctx) ctx.globalAlpha = 1;
      broadcast({
        type: 'stroke',
        points: strokeBuffer.current,
        color,
        size: brushSize,
        tool,
        brushType,
        opacity,
      });
    }
    setIsDrawing(false);
    strokeBuffer.current = [];
  };

  // ─── Magnifier: repaint zoomed view from main canvas ──────────
  const MAG_SIZE = 200;

  const updateMagnifier = useCallback(() => {
    const magCanvas = magCanvasRef.current;
    const mainCanvas = canvasRef.current;
    if (!magCanvas || !mainCanvas || !magnifierOn) return;
    const magCtx = magCanvas.getContext('2d');
    if (!magCtx) return;

    const srcSize = MAG_SIZE / magZoom;
    const sx = magCenter[0] - srcSize / 2;
    const sy = magCenter[1] - srcSize / 2;

    magCtx.imageSmoothingEnabled = false;
    magCtx.clearRect(0, 0, MAG_SIZE, MAG_SIZE);
    magCtx.drawImage(mainCanvas, sx, sy, srcSize, srcSize, 0, 0, MAG_SIZE, MAG_SIZE);

    // crosshair
    magCtx.strokeStyle = 'rgba(0,0,0,0.25)';
    magCtx.lineWidth = 1;
    magCtx.beginPath();
    magCtx.moveTo(MAG_SIZE / 2, 0);
    magCtx.lineTo(MAG_SIZE / 2, MAG_SIZE);
    magCtx.moveTo(0, MAG_SIZE / 2);
    magCtx.lineTo(MAG_SIZE, MAG_SIZE / 2);
    magCtx.stroke();
  }, [magnifierOn, magCenter, magZoom]);

  useEffect(() => {
    updateMagnifier();
  }, [updateMagnifier]);

  // update magnifier center when drawing on main canvas
  const updateMagCenterFromMainPos = (x: number, y: number) => {
    if (magnifierOn) setMagCenter([x, y]);
  };

  // Convert magnifier-local pixel position to main canvas coords
  const magToCanvas = (mx: number, my: number): [number, number] => {
    const srcSize = MAG_SIZE / magZoom;
    const sx = magCenter[0] - srcSize / 2;
    const sy = magCenter[1] - srcSize / 2;
    return [sx + (mx / MAG_SIZE) * srcSize, sy + (my / MAG_SIZE) * srcSize];
  };

  const getMagPos = (e: React.MouseEvent | React.TouchEvent): [number, number] => {
    const magCanvas = magCanvasRef.current;
    if (!magCanvas) return [0, 0];
    const rect = magCanvas.getBoundingClientRect();
    if ('touches' in e) {
      return [e.touches[0].clientX - rect.left, e.touches[0].clientY - rect.top];
    }
    return [e.clientX - rect.left, e.clientY - rect.top];
  };

  const handleMagPointerDown = (e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    const [mx, my] = getMagPos(e);
    const [cx, cy] = magToCanvas(mx, my);

    if (tool === 'fill') {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      saveSnapshot();
      floodFill(ctx, cx, cy, color);
      broadcast({ type: 'fill', x: cx, y: cy, color });
      requestAnimationFrame(updateMagnifier);
      return;
    }

    saveSnapshot();
    setIsDrawing(true);
    strokeBuffer.current = [[cx, cy]];

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const strokeColor = tool === 'eraser' ? '#ffffff' : color;
    const alpha = tool === 'eraser' ? 1 : opacity / 100;

    if (brushType === 'spray' && tool !== 'eraser') {
      drawSpray(ctx, cx, cy, brushSize, strokeColor, alpha);
    } else {
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      applyBrushStyle(ctx, tool === 'eraser' ? 'round' : brushType, brushSize, strokeColor, alpha);
    }
    requestAnimationFrame(updateMagnifier);
  };

  const handleMagPointerMove = (e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    if (!isDrawing) return;

    const [mx, my] = getMagPos(e);
    const [cx, cy] = magToCanvas(mx, my);

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const strokeColor = tool === 'eraser' ? '#ffffff' : color;
    const alpha = tool === 'eraser' ? 1 : opacity / 100;

    if (brushType === 'spray' && tool !== 'eraser') {
      drawSpray(ctx, cx, cy, brushSize, strokeColor, alpha);
    } else {
      ctx.lineTo(cx, cy);
      ctx.stroke();
    }
    strokeBuffer.current.push([cx, cy]);
    requestAnimationFrame(updateMagnifier);
  };

  const handleMagPointerUp = (e?: React.MouseEvent | React.TouchEvent) => {
    if (e) e.stopPropagation();
    handlePointerUp();
    requestAnimationFrame(updateMagnifier);
  };

  // Drag the magnifier window
  const handleMagDragStart = (e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setDraggingMag(true);
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    magDragOffset.current = [clientX - magPos.current[0], clientY - magPos.current[1]];
  };

  useEffect(() => {
    if (!draggingMag) return;
    const handleMove = (e: MouseEvent | TouchEvent) => {
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
      const nx = clientX - magDragOffset.current[0];
      const ny = clientY - magDragOffset.current[1];
      magPos.current = [nx, ny];
      setMagPosState([nx, ny]);
    };
    const handleUp = () => setDraggingMag(false);
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    window.addEventListener('touchmove', handleMove);
    window.addEventListener('touchend', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('touchend', handleUp);
    };
  }, [draggingMag]);

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

  const shareLink = roomId ? `${window.location.origin}/?room=${roomId}` : '';

  const copyShareLink = async () => {
    if (!shareLink) return;
    try {
      await navigator.clipboard.writeText(shareLink);
      showToast('Link copied!');
    } catch {
      // fallback
    }
  };

  // ─── Room save / restore ──────────────────────────────────────
  const saveRoom = () => {
    if (!roomId) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const thumbnail = createThumbnail(canvas);
    const existing = savedRooms.filter((r) => r.roomId !== roomId);
    const updated: SavedRoom[] = [
      { roomId, name: userName || 'Room ' + roomId.slice(0, 4), thumbnail, savedAt: Date.now() },
      ...existing,
    ].slice(0, 20); // keep at most 20
    setSavedRooms(updated);
    persistSavedRooms(updated);
    showToast('Room saved!');
  };

  const deleteRoom = (id: string) => {
    const updated = savedRooms.filter((r) => r.roomId !== id);
    setSavedRooms(updated);
    persistSavedRooms(updated);
  };

  const rejoinRoom = (id: string) => {
    setShowMultiplayer(false);
    connectToRoom(id);
  };

  // Auto-save current room every 30 seconds while connected
  useEffect(() => {
    if (!connected || !roomId) return;
    const interval = setInterval(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const thumbnail = createThumbnail(canvas);
      setSavedRooms((prev) => {
        const existing = prev.filter((r) => r.roomId !== roomId);
        const updated: SavedRoom[] = [
          { roomId, name: userName || 'Room ' + roomId.slice(0, 4), thumbnail, savedAt: Date.now() },
          ...existing,
        ].slice(0, 20);
        persistSavedRooms(updated);
        return updated;
      });
    }, 30000);
    return () => clearInterval(interval);
  }, [connected, roomId, userName]);

  // ─── Sidebar action button ─────────────────────────────────────
  const actionBtn = (
    onClick: () => void,
    icon: React.ReactNode,
    label: string,
    extraClass = '',
  ) => (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 w-full px-3 py-2 rounded-lg text-xs font-medium transition-all
                  text-[var(--text-muted)] hover:bg-gray-100 hover:text-[var(--text)] ${extraClass}`}
    >
      {icon}
      {label}
    </button>
  );

  return (
    <div className="h-screen w-screen flex flex-col bg-white">
      {/* ─── Top bar ──────────────────────────────────────────── */}
      <header className="flex items-center justify-between px-4 md:px-6 py-2.5 border-b border-[var(--border)] shrink-0 bg-white">
        <div className="flex items-center gap-3 md:gap-4">
          <h1 className="text-base md:text-lg font-semibold tracking-tight text-[var(--text)]">
            Color & Henna
          </h1>
          <nav className="flex items-center gap-2 text-xs">
            <span className="text-[var(--accent)] font-semibold px-2 py-1 bg-[var(--accent-light)] rounded-full">Coloring</span>
            <Link to="/henna" className="text-[var(--text-muted)] hover:text-[var(--text)] font-medium px-2 py-1 rounded-full hover:bg-gray-100 transition-colors">
              Henna
            </Link>
          </nav>
        </div>

        <button
          onClick={() => setShowMultiplayer(!showMultiplayer)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
            connected
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              : 'border border-[var(--border)] text-[var(--text-muted)] hover:bg-gray-50'
          }`}
        >
          {connected && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />}
          {connected ? 'Room' : 'Join Room'}
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

              {/* Saved rooms */}
              {savedRooms.length > 0 && (
                <>
                  <div className="flex items-center gap-2 mt-1">
                    <div className="flex-1 h-px bg-[var(--border)]" />
                    <span className="text-[10px] text-[var(--text-muted)] uppercase">saved rooms</span>
                    <div className="flex-1 h-px bg-[var(--border)]" />
                  </div>
                  <div className="flex flex-col gap-1.5 max-h-40 overflow-y-auto">
                    {savedRooms.map((room) => (
                      <div
                        key={room.roomId}
                        className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-gray-50 transition-colors group"
                      >
                        <img
                          src={room.thumbnail}
                          alt=""
                          className="w-10 h-8 rounded border border-[var(--border)] object-cover shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium text-[var(--text)] truncate">{room.name}</div>
                          <div className="text-[10px] text-[var(--text-muted)] font-mono">{room.roomId}</div>
                        </div>
                        <button
                          onClick={() => rejoinRoom(room.roomId)}
                          className="text-[10px] font-medium text-[var(--accent)] hover:bg-[var(--accent-light)]
                                     px-2 py-1 rounded transition-colors shrink-0"
                        >
                          Rejoin
                        </button>
                        <button
                          onClick={() => deleteRoom(room.roomId)}
                          className="text-[10px] text-[var(--text-muted)] hover:text-red-500
                                     opacity-0 group-hover:opacity-100 transition-all shrink-0"
                          title="Remove"
                        >
                          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M18 6L6 18M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                </>
              )}
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
              <div className="flex gap-2 mt-1">
                <button
                  onClick={copyShareLink}
                  className="flex-1 text-sm font-medium text-[var(--accent)] hover:bg-[var(--accent-light)]
                             rounded-lg px-3 py-2 transition-colors border border-[var(--border)]"
                >
                  Copy invite link
                </button>
                <button
                  onClick={saveRoom}
                  className="text-sm font-medium text-emerald-600 hover:bg-emerald-50
                             rounded-lg px-3 py-2 transition-colors border border-emerald-200"
                  title="Save this room so you can come back later"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                    <polyline points="17 21 17 13 7 13 7 21" />
                    <polyline points="7 3 7 8 15 8" />
                  </svg>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── Main: Canvas + Right Sidebar ─────────────────────── */}
      <div className="flex-1 flex min-h-0 relative overflow-hidden">

        {/* Canvas area */}
        <div
          ref={containerRef}
          className="flex-1 min-w-0 relative bg-gray-50 overflow-hidden"
          style={{ cursor: tool === 'fill' ? 'crosshair' : tool === 'eraser' ? 'cell' : 'default' }}
        >
          <div
            className="absolute inset-0 overflow-auto"
          >
            <canvas
              ref={canvasRef}
              width={canvasSize.width}
              height={canvasSize.height}
              className="touch-none"
              style={{
                transform: `scale(${zoom})`,
                transformOrigin: 'top left',
                width: canvasSize.width,
                height: canvasSize.height,
              }}
              onMouseDown={handlePointerDown}
              onMouseMove={handlePointerMove}
              onMouseUp={handlePointerUp}
              onMouseLeave={handlePointerUp}
              onTouchStart={handlePointerDown}
              onTouchMove={handlePointerMove}
              onTouchEnd={handlePointerUp}
            />
          </div>

          {/* Remote cursors */}
          {Object.entries(remoteCursors).map(([id, cursor]) => (
            <div
              key={id}
              className="absolute pointer-events-none z-20 flex flex-col items-center"
              style={{
                left: cursor.x * zoom,
                top: cursor.y * zoom,
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

          {/* Empty state */}
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

          {/* Mobile sidebar toggle button */}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="md:hidden absolute top-3 right-3 z-30 w-10 h-10 rounded-full bg-white shadow-lg border border-[var(--border)]
                       flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text)] active:scale-95 transition-all"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {sidebarOpen ? (
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

          {/* ─── Magnifier floating window ──────────────────────── */}
          {magnifierOn && (
            <div
              ref={magContainerRef}
              className="fixed z-50 select-none"
              style={{ left: magPosState[0], top: magPosState[1] }}
            >
              {/* Title bar (drag handle) */}
              <div
                className="flex items-center justify-between px-2 py-1 bg-gray-800 text-white rounded-t-xl cursor-grab active:cursor-grabbing"
                onMouseDown={handleMagDragStart}
                onTouchStart={handleMagDragStart}
              >
                <div className="flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8" />
                    <path d="m21 21-4.3-4.3" />
                    <path d="M11 8v6" />
                    <path d="M8 11h6" />
                  </svg>
                  <span className="text-[10px] font-semibold">{magZoom}x Magnifier</span>
                </div>
                <div className="flex items-center gap-0.5">
                  <button
                    onClick={() => setMagZoom((z) => Math.max(2, z - 1))}
                    className="w-5 h-5 flex items-center justify-center rounded hover:bg-white/20 text-[10px] font-bold"
                  >-</button>
                  <button
                    onClick={() => setMagZoom((z) => Math.min(8, z + 1))}
                    className="w-5 h-5 flex items-center justify-center rounded hover:bg-white/20 text-[10px] font-bold"
                  >+</button>
                  <button
                    onClick={() => setMagnifierOn(false)}
                    className="w-5 h-5 flex items-center justify-center rounded hover:bg-red-500/60 text-[10px] font-bold ml-0.5"
                  >x</button>
                </div>
              </div>
              {/* Magnifier canvas */}
              <div className="border-2 border-gray-800 border-t-0 rounded-b-xl overflow-hidden bg-white">
                <canvas
                  ref={magCanvasRef}
                  width={MAG_SIZE}
                  height={MAG_SIZE}
                  className="touch-none block"
                  style={{ width: MAG_SIZE, height: MAG_SIZE, cursor: tool === 'fill' ? 'crosshair' : tool === 'eraser' ? 'cell' : 'crosshair' }}
                  onMouseDown={handleMagPointerDown}
                  onMouseMove={handleMagPointerMove}
                  onMouseUp={handleMagPointerUp}
                  onMouseLeave={handleMagPointerUp}
                  onTouchStart={handleMagPointerDown}
                  onTouchMove={handleMagPointerMove}
                  onTouchEnd={handleMagPointerUp}
                />
              </div>
            </div>
          )}
        </div>

        {/* Mobile backdrop */}
        {sidebarOpen && (
          <div
            className="md:hidden fixed inset-0 bg-black/20 z-30"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* ─── Right sidebar (two columns) ────────────────────── */}
        <div className={`
          w-[340px] shrink-0 border-l border-[var(--border)] bg-white flex overflow-hidden relative
          md:translate-x-0
          max-md:fixed max-md:right-0 max-md:top-0 max-md:bottom-0 max-md:z-40
          max-md:shadow-2xl max-md:transition-transform max-md:duration-300 max-md:ease-in-out
          ${sidebarOpen ? 'max-md:translate-x-0' : 'max-md:translate-x-full'}
        `}>

          {/* Mobile close button inside sidebar */}
          <button
            onClick={() => setSidebarOpen(false)}
            className="md:hidden absolute top-2 right-2 z-10 p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-[var(--text-muted)]"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>

          {/* Column 1: Color swatches (eyeshadow palette) */}
          <div className="w-[180px] border-r border-[var(--border)] flex flex-col overflow-hidden">
            <div className="px-3 py-2 border-b border-[var(--border)]">
              <h3 className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">Palette</h3>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {/* Selected color preview */}
              <div className="flex items-center gap-2 mb-2 px-1">
                <div
                  className="w-6 h-6 rounded-md shadow-inner"
                  style={{ backgroundColor: color, border: color === '#ffffff' ? '1px solid #ddd' : 'none' }}
                />
                <span className="text-[10px] text-[var(--text-muted)] font-mono uppercase">{color}</span>
              </div>
              {/* Swatch grid */}
              <div className="grid grid-cols-8 gap-px bg-[var(--border)] rounded-lg overflow-hidden shadow-inner">
                {COLORS.map((c, i) => (
                  <button
                    key={`${c}-${i}`}
                    onClick={() => setColor(c)}
                    className={`aspect-square transition-all relative ${
                      color === c
                        ? 'ring-2 ring-[var(--accent)] ring-inset z-10 scale-110'
                        : 'hover:scale-105 hover:z-10'
                    }`}
                    style={{
                      backgroundColor: c,
                    }}
                    title={c}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Column 2: Tools & options */}
          <div className="flex-1 flex flex-col overflow-y-auto">
            {/* Tools section */}
            <div className="p-3 border-b border-[var(--border)]">
              <h3 className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">Tools</h3>
              <div className="flex flex-col gap-0.5">
                {([
                  ['brush', 'Brush',
                    <svg key="b" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                    </svg>,
                  ],
                  ['fill', 'Fill',
                    <svg key="f" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
                    </svg>,
                  ],
                  ['eraser', 'Eraser',
                    <svg key="e" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.9-9.9c1-1 2.5-1 3.4 0l3.3 3.3c1 1 1 2.5 0 3.4L9.4 21" />
                      <path d="M22 21H7" />
                    </svg>,
                  ],
                ] as [Tool, string, React.ReactNode][]).map(([t, label, icon]) => (
                  <button
                    key={t}
                    onClick={() => setTool(t)}
                    className={`flex items-center gap-2 w-full px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                      tool === t
                        ? 'bg-[var(--accent)] text-white shadow-sm'
                        : 'text-[var(--text-muted)] hover:bg-gray-100 hover:text-[var(--text)]'
                    }`}
                  >
                    {icon}
                    {label}
                  </button>
                ))}
                {/* Magnifier toggle */}
                <button
                  onClick={() => setMagnifierOn((v) => !v)}
                  className={`flex items-center gap-2 w-full px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                    magnifierOn
                      ? 'bg-[var(--accent)] text-white shadow-sm'
                      : 'text-[var(--text-muted)] hover:bg-gray-100 hover:text-[var(--text)]'
                  }`}
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8" />
                    <path d="m21 21-4.3-4.3" />
                    <path d="M11 8v6" />
                    <path d="M8 11h6" />
                  </svg>
                  Magnifier
                </button>
              </div>

              {/* Brush types */}
              {tool !== 'fill' && (
                <div className="mt-3">
                  <span className="text-[10px] text-[var(--text-muted)] font-medium mb-1.5 block">Brush Type</span>
                  <div className="grid grid-cols-4 gap-1">
                    {([
                      ['round', '●', 'Round'],
                      ['square', '■', 'Flat'],
                      ['calligraphy', '/', 'Calligraphy'],
                      ['spray', '✦', 'Spray'],
                    ] as [BrushType, string, string][]).map(([bt, icon, label]) => (
                      <button
                        key={bt}
                        onClick={() => setBrushType(bt)}
                        className={`flex flex-col items-center gap-0.5 py-1.5 rounded-lg text-[10px] transition-all ${
                          brushType === bt
                            ? 'bg-[var(--accent-light)] ring-1 ring-[var(--accent)] text-[var(--accent)] font-semibold'
                            : 'hover:bg-gray-100 text-[var(--text-muted)]'
                        }`}
                        title={label}
                      >
                        <span className="text-sm leading-none">{icon}</span>
                        <span>{label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Brush sizes */}
              {tool !== 'fill' && (
                <div className="mt-3">
                  <span className="text-[10px] text-[var(--text-muted)] font-medium mb-1.5 block">Size</span>
                  <div className="flex items-center justify-between gap-1 mb-2">
                    {[1, 3, 6, 10, 16, 24].map((s) => (
                      <button
                        key={s}
                        onClick={() => setBrushSize(s)}
                        className={`flex-1 flex items-center justify-center py-1.5 rounded-lg transition-all ${
                          brushSize === s
                            ? 'bg-[var(--accent-light)] ring-1 ring-[var(--accent)]'
                            : 'hover:bg-gray-100'
                        }`}
                        title={`${s}px`}
                      >
                        <span
                          className="rounded-full bg-[var(--text)] shrink-0"
                          style={{ width: Math.max(3, Math.min(s, 18)), height: Math.max(3, Math.min(s, 18)) }}
                        />
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
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
                </div>
              )}

              {/* Opacity */}
              {tool !== 'fill' && (
                <div className="mt-3">
                  <span className="text-[10px] text-[var(--text-muted)] font-medium mb-1.5 block">Opacity</span>
                  <div className="flex items-center gap-2">
                    <div
                      className="w-5 h-5 rounded border border-[var(--border)]"
                      style={{
                        backgroundColor: color,
                        opacity: opacity / 100,
                      }}
                    />
                    <input
                      type="range"
                      min="5"
                      max="100"
                      step="5"
                      value={opacity}
                      onChange={(e) => setOpacity(Number(e.target.value))}
                      className="flex-1 accent-[var(--accent)]"
                    />
                    <span className="text-[10px] text-[var(--text-muted)] w-7">{opacity}%</span>
                  </div>
                </div>
              )}
            </div>

            {/* Undo / Redo */}
            <div className="p-3 border-b border-[var(--border)]">
              <h3 className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">History</h3>
              <div className="flex gap-1">
                <button
                  onClick={undo}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium
                             text-[var(--text-muted)] hover:bg-gray-100 hover:text-[var(--text)] transition-all border border-[var(--border)]"
                  title="Undo (Ctrl+Z)"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 7v6h6" />
                    <path d="M3 13a9 9 0 1 0 2-7.7L3 7" />
                  </svg>
                  Undo
                </button>
                <button
                  onClick={redo}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium
                             text-[var(--text-muted)] hover:bg-gray-100 hover:text-[var(--text)] transition-all border border-[var(--border)]"
                  title="Redo (Ctrl+Shift+Z)"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 7v6h-6" />
                    <path d="M21 13a9 9 0 1 0-2-7.7L21 7" />
                  </svg>
                  Redo
                </button>
              </div>
            </div>

            {/* Zoom */}
            <div className="p-3 border-b border-[var(--border)]">
              <h3 className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">Zoom</h3>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setZoom((z) => Math.max(0.25, z - 0.25))}
                  className="flex-1 flex items-center justify-center py-1.5 rounded-lg text-xs font-medium
                             text-[var(--text-muted)] hover:bg-gray-100 hover:text-[var(--text)] transition-all border border-[var(--border)]"
                  title="Zoom out"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8" />
                    <path d="m21 21-4.3-4.3" />
                    <path d="M8 11h6" />
                  </svg>
                </button>
                <button
                  onClick={() => setZoom(1)}
                  className="flex-1 flex items-center justify-center py-1.5 rounded-lg text-xs font-medium
                             text-[var(--text-muted)] hover:bg-gray-100 hover:text-[var(--text)] transition-all border border-[var(--border)]"
                  title="Reset zoom"
                >
                  {Math.round(zoom * 100)}%
                </button>
                <button
                  onClick={() => setZoom((z) => Math.min(4, z + 0.25))}
                  className="flex-1 flex items-center justify-center py-1.5 rounded-lg text-xs font-medium
                             text-[var(--text-muted)] hover:bg-gray-100 hover:text-[var(--text)] transition-all border border-[var(--border)]"
                  title="Zoom in"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8" />
                    <path d="m21 21-4.3-4.3" />
                    <path d="M11 8v6" />
                    <path d="M8 11h6" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Actions */}
            <div className="p-3 flex flex-col gap-0.5">
              <h3 className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">Options</h3>

              {actionBtn(() => setShowTemplates(true),
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="7" height="7" />
                  <rect x="14" y="3" width="7" height="7" />
                  <rect x="3" y="14" width="7" height="7" />
                  <rect x="14" y="14" width="7" height="7" />
                </svg>,
                'Templates',
              )}

              {actionBtn(() => fileInputRef.current?.click(),
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <path d="m21 15-5-5L5 21" />
                </svg>,
                'Upload Image',
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleUpload}
                className="hidden"
              />

              {actionBtn(handleDownload,
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <path d="M7 10l5 5 5-5" />
                  <path d="M12 15V3" />
                </svg>,
                'Download',
              )}

              {actionBtn(clearCanvas,
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 6h18" />
                  <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                  <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                </svg>,
                'Clear',
                'hover:!bg-red-50 hover:!text-red-500',
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ─── Room invitation popup ─────────────────────────────── */}
      {showInvite && !connected && roomParam && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-80 p-6 flex flex-col gap-4">
            <div className="text-center">
              <div className="w-12 h-12 rounded-full bg-[var(--accent-light)] flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-[var(--accent)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-[var(--text)]">You're Invited!</h3>
              <p className="text-sm text-[var(--text-muted)] mt-1">
                Someone invited you to color together in room <span className="font-mono font-semibold text-[var(--text)]">{roomParam}</span>
              </p>
            </div>
            <input
              type="text"
              placeholder="Your name"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              className="text-sm bg-gray-50 rounded-lg px-3 py-2.5 text-[var(--text)]
                         placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30 border border-[var(--border)]"
            />
            <button
              onClick={() => {
                setShowInvite(false);
                connectToRoom(roomParam);
              }}
              className="w-full text-sm font-semibold text-white bg-[var(--accent)] hover:bg-[var(--accent-hover)]
                         rounded-lg px-4 py-2.5 transition-colors"
            >
              Join Room
            </button>
            <button
              onClick={() => setShowInvite(false)}
              className="text-xs text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
            >
              No thanks
            </button>
          </div>
        </div>
      )}

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
            <div className="grid grid-cols-4 gap-3 px-5 pb-6 max-h-[40vh] overflow-y-auto">
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
