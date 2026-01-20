
import React, { useState, useRef, useEffect } from 'react';
import { OCRBlock } from '../types';

interface LensOverlayProps {
  blocks: OCRBlock[];
  onToggleBlock: (blockId: string) => void;
  onSelectArea: (box: { xmin: number; ymin: number; xmax: number; ymax: number }) => void;
  activeBlockId?: string;
}

const LensOverlay: React.FC<LensOverlayProps> = ({ blocks, onToggleBlock, onSelectArea, activeBlockId }) => {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [dragCurrent, setDragCurrent] = useState<{ x: number; y: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 1000;
      const y = ((e.clientY - rect.top) / rect.height) * 1000;
      setDragStart({ x, y });
      setDragCurrent({ x, y });
      setIsDragging(true);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 1000;
      const y = ((e.clientY - rect.top) / rect.height) * 1000;
      setDragCurrent({ x, y });
    }
  };

  const handleMouseUp = () => {
    if (isDragging && dragStart && dragCurrent) {
      const xmin = Math.min(dragStart.x, dragCurrent.x);
      const ymin = Math.min(dragStart.y, dragCurrent.y);
      const xmax = Math.max(dragStart.x, dragCurrent.x);
      const ymax = Math.max(dragStart.y, dragCurrent.y);
      
      // If drag was very small, it's probably just a click
      if (xmax - xmin > 5 || ymax - ymin > 5) {
        onSelectArea({ xmin, ymin, xmax, ymax });
      }
    }
    setIsDragging(false);
    setDragStart(null);
    setDragCurrent(null);
  };

  return (
    <div 
      ref={containerRef}
      className="absolute inset-0 cursor-crosshair overflow-hidden rounded-lg pointer-events-auto"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      <svg className="w-full h-full pointer-events-none" viewBox="0 0 1000 1000" preserveAspectRatio="none">
        {blocks.map((block) => {
          const [ymin, xmin, ymax, xmax] = block.box_2d;
          const isActive = activeBlockId === block.id;
          const isSelected = block.isSelected;
          
          return (
            <g key={block.id}>
              <rect
                x={xmin}
                y={ymin}
                width={xmax - xmin}
                height={ymax - ymin}
                rx={2}
                className={`transition-all duration-200 pointer-events-auto cursor-pointer ${
                  isActive 
                    ? 'fill-indigo-500/20 stroke-indigo-600 stroke-[3]' 
                    : isSelected
                      ? 'fill-indigo-400/10 stroke-indigo-400/40 stroke-[1.5]'
                      : 'fill-transparent hover:fill-gray-200/10'
                }`}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleBlock(block.id);
                }}
              />
            </g>
          );
        })}

        {isDragging && dragStart && dragCurrent && (
          <rect
            x={Math.min(dragStart.x, dragCurrent.x)}
            y={Math.min(dragStart.y, dragCurrent.y)}
            width={Math.abs(dragCurrent.x - dragStart.x)}
            height={Math.abs(dragCurrent.y - dragStart.y)}
            className="fill-indigo-600/20 stroke-indigo-600 stroke-2"
            strokeDasharray="4 2"
          />
        )}
      </svg>
    </div>
  );
};

export default LensOverlay;
