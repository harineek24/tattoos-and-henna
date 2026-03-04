import { useRef, useEffect, useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import { Stage, Layer, Image as KonvaImage, Transformer } from 'react-konva';
import type Konva from 'konva';
import type { PlacedDesign } from '../types';

interface HandCanvasProps {
  placedDesigns: PlacedDesign[];
  onUpdateDesign: (id: string, attrs: Partial<PlacedDesign>) => void;
  onDeleteDesign: (id: string) => void;
  onDropDesign: (imageUrl: string, x: number, y: number) => void;
}

export interface HandCanvasHandle {
  getStage: () => Konva.Stage | null;
}

function useImage(url: string): HTMLImageElement | null {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.src = url;
    img.onload = () => setImage(img);
    return () => { img.onload = null; };
  }, [url]);
  return image;
}

function PlacedDesignImage({
  design,
  isSelected,
  onSelect,
  onChange,
}: {
  design: PlacedDesign;
  isSelected: boolean;
  onSelect: () => void;
  onChange: (attrs: Partial<PlacedDesign>) => void;
}) {
  const shapeRef = useRef<Konva.Image>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const image = useImage(design.image_url);

  useEffect(() => {
    if (isSelected && trRef.current && shapeRef.current) {
      trRef.current.nodes([shapeRef.current]);
      trRef.current.getLayer()?.batchDraw();
    }
  }, [isSelected]);

  if (!image) return null;

  return (
    <>
      <KonvaImage
        ref={shapeRef}
        image={image}
        x={design.x}
        y={design.y}
        scaleX={design.scaleX}
        scaleY={design.scaleY}
        rotation={design.rotation}
        draggable
        onClick={onSelect}
        onTap={onSelect}
        onDragEnd={(e) => {
          onChange({ x: e.target.x(), y: e.target.y() });
        }}
        onTransformEnd={() => {
          const node = shapeRef.current;
          if (!node) return;
          onChange({
            x: node.x(),
            y: node.y(),
            scaleX: node.scaleX(),
            scaleY: node.scaleY(),
            rotation: node.rotation(),
          });
        }}
      />
      {isSelected && (
        <Transformer
          ref={trRef}
          rotateEnabled={true}
          enabledAnchors={[
            'top-left', 'top-right', 'bottom-left', 'bottom-right',
          ]}
          boundBoxFunc={(oldBox, newBox) => {
            if (Math.abs(newBox.width) < 10 || Math.abs(newBox.height) < 10) {
              return oldBox;
            }
            return newBox;
          }}
        />
      )}
    </>
  );
}

const HandCanvas = forwardRef<HandCanvasHandle, HandCanvasProps>(function HandCanvas(
  { placedDesigns, onUpdateDesign, onDeleteDesign, onDropDesign },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const [dimensions, setDimensions] = useState({ width: 600, height: 800 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const handImage = useImage('/toppng.com-hand-female-hand-282x440.png');

  useImperativeHandle(ref, () => ({
    getStage: () => stageRef.current,
  }));

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setDimensions({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;

    const imageUrl = e.dataTransfer.getData('design-url');
    if (!imageUrl) return;

    stage.setPointersPositions(e);
    const pos = stage.getPointerPosition();
    if (!pos) return;

    onDropDesign(imageUrl, pos.x, pos.y);
  }, [onDropDesign]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleStageClick = (e: Konva.KonvaEventObject<any>) => {
    if (e.target === e.target.getStage() || e.target.name() === 'hand-image') {
      setSelectedId(null);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        onDeleteDesign(selectedId);
        setSelectedId(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedId, onDeleteDesign]);

  const handScale = handImage
    ? Math.min(
        dimensions.width / handImage.width,
        dimensions.height / handImage.height
      ) * 0.92
    : 1;
  const handX = handImage ? (dimensions.width - handImage.width * handScale) / 2 : 0;
  const handY = handImage ? (dimensions.height - handImage.height * handScale) / 2 : 0;

  return (
    <div
      ref={containerRef}
      className="h-full w-full relative bg-gray-50"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      <Stage
        ref={stageRef}
        width={dimensions.width}
        height={dimensions.height}
        onClick={handleStageClick}
        onTap={handleStageClick}
      >
        <Layer>
          {handImage && (
            <KonvaImage
              image={handImage}
              x={handX}
              y={handY}
              scaleX={handScale}
              scaleY={handScale}
              name="hand-image"
              listening={true}
            />
          )}
          {placedDesigns.map((d) => (
            <PlacedDesignImage
              key={d.id}
              design={d}
              isSelected={d.id === selectedId}
              onSelect={() => setSelectedId(d.id)}
              onChange={(attrs) => onUpdateDesign(d.id, attrs)}
            />
          ))}
        </Layer>
      </Stage>

      {placedDesigns.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl px-5 py-3 text-sm text-[var(--text-muted)] shadow-sm text-center">
            Drag a design from the gallery onto the hand
          </div>
        </div>
      )}

      {selectedId && (
        <div className="absolute top-3 right-3 bg-white/80 backdrop-blur-sm rounded-xl px-3 py-1.5 text-xs text-[var(--text-muted)] shadow-sm">
          Press Delete to remove
        </div>
      )}
    </div>
  );
});

export default HandCanvas;
