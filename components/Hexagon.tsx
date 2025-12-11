import React from 'react';
import { Hex, Piece, BugType, PlayerColor } from '../game/types';
import { hexToString } from '../game/utils';
import { Bug, Crown, Activity, Snowflake, Hexagon as HexIcon, Move } from 'lucide-react';

interface HexProps {
  q: number;
  r: number;
  size: number;
  piece?: Piece; // Top piece
  stackSize?: number;
  isSelected?: boolean;
  isValidMove?: boolean;
  isValidPlacement?: boolean;
  lastMove?: boolean;
  onClick: () => void;
}

const HexagonComponent: React.FC<HexProps> = ({ 
  q, r, size, piece, stackSize, isSelected, isValidMove, isValidPlacement, lastMove, onClick 
}) => {
  // Hex to Pixel conversion (Pointy topped)
  const x = size * (Math.sqrt(3) * q + (Math.sqrt(3) / 2) * r);
  const y = size * ((3 / 2) * r);

  const getLabel = (type: BugType) => {
     switch (type) {
      case BugType.QUEEN: return "🐝";
      case BugType.ANT: return "🐜";
      case BugType.SPIDER: return "🕷️";
      case BugType.BEETLE: return "🪲";
      case BugType.GRASSHOPPER: return "🦗";
      default: return "?";
    }
  };

  let fillColor = 'fill-slate-900';
  let strokeColor = 'stroke-slate-800';
  let strokeWidth = 1;

  // Render Logic for Black vs White pieces
  if (piece) {
    if (piece.color === PlayerColor.WHITE) {
      fillColor = 'fill-stone-100'; // White piece
      strokeColor = 'stroke-stone-400';
      strokeWidth = 2;
    } else {
      fillColor = 'fill-stone-950'; // Black piece
      strokeColor = 'stroke-stone-600';
      strokeWidth = 2;
    }
  }

  if (isSelected) {
    strokeColor = 'stroke-amber-500';
    strokeWidth = 4;
    // Don't change fill too much or we lose piece color id
    if (!piece) fillColor = 'fill-amber-900/40';
  }

  if (isValidMove || isValidPlacement) {
    fillColor = 'fill-emerald-500/20';
    strokeColor = 'stroke-emerald-500';
    strokeWidth = 2;
  }
  
  if (lastMove) {
    strokeColor = 'stroke-blue-500';
    strokeWidth = 3;
  }

  // Text color needs to be opposite of piece color
  const textColor = piece?.color === PlayerColor.WHITE ? 'fill-black' : 'fill-white';

  return (
    <g 
      transform={`translate(${x}, ${y})`} 
      onClick={onClick} 
      className="cursor-pointer transition-all duration-200 hover:opacity-90"
    >
      <polygon
        points={`
          ${size * Math.sqrt(3) / 2},${-size / 2}
          ${size * Math.sqrt(3) / 2},${size / 2}
          0,${size}
          ${-size * Math.sqrt(3) / 2},${size / 2}
          ${-size * Math.sqrt(3) / 2},${-size / 2}
          0,${-size}
        `}
        className={`${fillColor} ${strokeColor}`}
        strokeWidth={strokeWidth}
      />
      
      {piece && (
        <text 
          x="0" 
          y={size * 0.2} 
          textAnchor="middle" 
          fontSize={size} 
          className={`${textColor} select-none pointer-events-none font-bold filter drop-shadow-sm`}
        >
          {getLabel(piece.type)}
        </text>
      )}

      {/* Stack Indicator */}
      {stackSize && stackSize > 1 && (
         <circle cx={size/1.5} cy={-size/1.5} r={size/4} className="fill-red-600 stroke-none" />
      )}
      {stackSize && stackSize > 1 && (
         <text x={size/1.5} y={-size/1.5 + size/6} textAnchor="middle" fontSize={size/2.5} className="fill-white font-bold">{stackSize}</text>
      )}
    </g>
  );
};

export default HexagonComponent;