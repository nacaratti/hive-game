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
      fillColor = 'fill-white'; // White player = White piece
      strokeColor = 'stroke-stone-300';
      strokeWidth = 1;
    } else {
      fillColor = 'fill-black'; // Black player = Black piece
      strokeColor = 'stroke-stone-700';
      strokeWidth = 1;
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

  // Text color: black for white pieces, white for black pieces
  const textColor = piece?.color === PlayerColor.WHITE ? 'fill-black' : 'fill-white';

  // Liquid glass effect ID (unique per piece)
  const glassId = `glass-${q}-${r}`;
  const shineId = `shine-${q}-${r}`;

  return (
    <g
      transform={`translate(${x}, ${y})`}
      onClick={onClick}
      className="cursor-pointer transition-all duration-200 hover:opacity-90"
    >
      <defs>
        {/* Liquid glass gradient for white pieces */}
        <linearGradient id={`${glassId}-white`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
          <stop offset="50%" stopColor="#f8fafc" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#e2e8f0" stopOpacity="0.9" />
        </linearGradient>

        {/* Liquid glass gradient for black pieces */}
        <linearGradient id={`${glassId}-black`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#1a1a1a" stopOpacity="1" />
          <stop offset="50%" stopColor="#000000" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#0a0a0a" stopOpacity="0.9" />
        </linearGradient>

        {/* Glass shine overlay */}
        <radialGradient id={shineId}>
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.4" />
          <stop offset="60%" stopColor="#ffffff" stopOpacity="0.1" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>

        {/* Glass blur filter */}
        <filter id={`blur-${glassId}`}>
          <feGaussianBlur in="SourceGraphic" stdDeviation="0.3" />
        </filter>
      </defs>

      {/* Base hexagon with liquid glass fill */}
      <polygon
        points={`
          ${size * Math.sqrt(3) / 2},${-size / 2}
          ${size * Math.sqrt(3) / 2},${size / 2}
          0,${size}
          ${-size * Math.sqrt(3) / 2},${size / 2}
          ${-size * Math.sqrt(3) / 2},${-size / 2}
          0,${-size}
        `}
        fill={piece ? (piece.color === PlayerColor.WHITE ? `url(#${glassId}-white)` : `url(#${glassId}-black)`) : fillColor}
        className={!piece ? fillColor : ''}
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        style={{ filter: piece ? 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))' : undefined }}
      />

      {/* Glass shine effect overlay */}
      {piece && (
        <ellipse
          cx="0"
          cy={-size / 3}
          rx={size / 2}
          ry={size / 3}
          fill={`url(#${shineId})`}
          opacity="0.6"
          style={{ pointerEvents: 'none' }}
        />
      )}

      {piece && (
        <text
          x="0"
          y={size * 0.2}
          textAnchor="middle"
          fontSize={size}
          className={`${textColor} select-none pointer-events-none font-bold`}
          style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.2))' }}
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