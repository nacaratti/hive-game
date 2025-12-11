import React, { useRef, useState, useEffect } from 'react';
import { GameState, Hex } from '../game/types';
import { hexToString, stringToHex } from '../game/utils';
import HexagonComponent from './Hexagon.tsx';

interface BoardProps {
  gameState: GameState;
  onHexClick: (hexStr: string) => void;
}

const Board: React.FC<BoardProps> = ({ gameState, onHexClick }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [viewBox, setViewBox] = useState({ x: -200, y: -200, w: 400, h: 400 });
  const [isDragging, setIsDragging] = useState(false);
  const [lastPos, setLastPos] = useState({ x: 0, y: 0 });

  // Compute bounding box to auto-center eventually, but for now manual drag/pan
  // Generate renderable hexes:
  // 1. All occupied hexes
  // 2. All valid move/placement targets (phantom hexes)
  
  const renderMap = new Map<string, { type: 'piece' | 'phantom', hex: Hex }>();

  gameState.board.forEach((cell, key) => {
    renderMap.set(key, { type: 'piece', hex: cell.hex });
  });

  gameState.validMoves.forEach(key => {
    if (!renderMap.has(key)) {
      renderMap.set(key, { type: 'phantom', hex: stringToHex(key) });
    }
  });

  const handleMouseDown = (e: React.MouseEvent) => {
    // Only drag if background
    if (e.target === svgRef.current) {
      setIsDragging(true);
      setLastPos({ x: e.clientX, y: e.clientY });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      const dx = e.clientX - lastPos.x;
      const dy = e.clientY - lastPos.y;
      setViewBox(prev => ({
        ...prev,
        x: prev.x - dx, // Drag moves viewbox opposite
        y: prev.y - dy
      }));
      setLastPos({ x: e.clientX, y: e.clientY });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleWheel = (e: React.WheelEvent) => {
    const scale = e.deltaY > 0 ? 1.1 : 0.9;
    setViewBox(prev => ({
      ...prev,
      w: prev.w * scale,
      h: prev.h * scale,
      x: prev.x - (prev.w * scale - prev.w) / 2, // zoom center approx
      y: prev.y - (prev.h * scale - prev.h) / 2
    }));
  };

  return (
    <div className="w-full h-full bg-slate-800 overflow-hidden relative shadow-inner">
      <svg
        ref={svgRef}
        viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
        className="w-full h-full touch-none cursor-move"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      >
        <defs>
          <pattern id="grid" width="100" height="100" patternUnits="userSpaceOnUse">
             <circle cx="1" cy="1" r="1" className="fill-slate-700" />
          </pattern>
        </defs>
        <rect x={viewBox.x} y={viewBox.y} width={viewBox.w} height={viewBox.h} fill="url(#grid)" />
        
        {Array.from(renderMap.entries()).map(([key, data]) => {
          const cell = gameState.board.get(key);
          const topPiece = cell ? cell.stack[cell.stack.length - 1] : undefined;
          const isSelected = gameState.selectedHex === key;
          const isValid = gameState.validMoves.includes(key);

          return (
            <HexagonComponent
              key={key}
              q={data.hex.q}
              r={data.hex.r}
              size={18} // Base hex size
              piece={topPiece}
              stackSize={cell?.stack.length}
              isSelected={isSelected}
              isValidMove={isValid}
              isValidPlacement={isValid && !topPiece}
              onClick={() => onHexClick(key)}
            />
          );
        })}
      </svg>
      <div className="absolute bottom-4 left-4 text-xs text-slate-500 pointer-events-none">
        Controls: Drag to Pan, Scroll to Zoom
      </div>
    </div>
  );
};

export default Board;
