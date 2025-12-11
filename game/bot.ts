import { GameState, PlayerColor, BugType, BoardMap, BoardCell, Piece } from './types';
import { getValidPlacements, getPieceMoves } from './logic';
import { getNeighbors, hexToString, stringToHex } from './utils';

export type BotMove = 
  | { action: 'PLACE'; piece: BugType; hex: string }
  | { action: 'MOVE'; from: string; to: string };

// Helper to deep copy board for simulation to avoid mutating state
const cloneBoard = (board: BoardMap): BoardMap => {
  const newBoard = new Map<string, BoardCell>();
  for (const [k, v] of board) {
    newBoard.set(k, { hex: v.hex, stack: v.stack.map(p => ({ ...p })) });
  }
  return newBoard;
};

const getQueenHex = (board: BoardMap, color: PlayerColor): string | null => {
  for (const [hexStr, cell] of board) {
    if (cell.stack.some(p => p.type === BugType.QUEEN && p.color === color)) {
      return hexStr;
    }
  }
  return null;
};

const countOccupiedNeighbors = (board: BoardMap, hexStr: string): number => {
  const neighbors = getNeighbors(stringToHex(hexStr));
  return neighbors.reduce((acc, n) => acc + (board.has(hexToString(n)) ? 1 : 0), 0);
};

// Simple heuristic scoring
const evaluateBoard = (board: BoardMap, botColor: PlayerColor): number => {
  const enemyColor = botColor === PlayerColor.WHITE ? PlayerColor.BLACK : PlayerColor.WHITE;
  
  const myQueen = getQueenHex(board, botColor);
  const enemyQueen = getQueenHex(board, enemyColor);
  
  let score = 0;

  // Defensive: Reward keeping my queen free
  if (myQueen) {
    const myOpen = 6 - countOccupiedNeighbors(board, myQueen);
    score += myOpen * 20; 
  } else {
    // Large penalty if Queen is not yet placed (unless early game)
    score -= 20; 
  }

  // Offensive: Reward surrounding enemy queen
  if (enemyQueen) {
    const enemyClosed = countOccupiedNeighbors(board, enemyQueen);
    score += enemyClosed * 25;
  }

  // General Aggression: Reward being close to enemy queen with any piece
  if (enemyQueen) {
      const enemyQHex = stringToHex(enemyQueen);
      const surrounding = getNeighbors(enemyQHex);
      let pressure = 0;
      surrounding.forEach(n => {
          const key = hexToString(n);
          if (board.has(key)) {
              const stack = board.get(key)!.stack;
              const top = stack[stack.length - 1];
              if (top.color === botColor) pressure++;
          }
      });
      score += pressure * 5;
  }

  return score;
};

export const getBotMove = (gameState: GameState): BotMove | null => {
  const { board, currentPlayer, turnNumber, players } = gameState;
  const hand = players[currentPlayer].hand;
  const possibleMoves: { move: BotMove, score: number }[] = [];

  // Calculate Player Turn (1, 2, 3, 4...)
  const playerTurnIndex = Math.ceil(turnNumber / 2);
  
  const canPlace = turnNumber === 1 || Object.values(hand).some(c => c > 0);
  const queenNotPlaced = hand[BugType.QUEEN] > 0;
  // Rule: Must place queen by YOUR 4th turn
  const mustPlaceQueen = playerTurnIndex === 4 && queenNotPlaced;

  // 1. Placements
  if (canPlace) {
    const placementSpots = getValidPlacements(gameState);
    
    let piecesToTry: BugType[] = [];

    if (mustPlaceQueen) {
      piecesToTry = [BugType.QUEEN];
    } else {
      piecesToTry = (Object.keys(hand) as BugType[]).filter(t => hand[t] > 0);
      
      // Heuristic: Prefer placing Queen early (Turn 2 or 3)
      if (queenNotPlaced && playerTurnIndex >= 2) {
         // Prioritize Queen
      }
    }

    const uniquePieces = Array.from(new Set(piecesToTry));

    // Limit search space
    const spotsToCheck = placementSpots.length > 12 
        ? placementSpots.sort(() => 0.5 - Math.random()).slice(0, 12) 
        : placementSpots;

    for (const piece of uniquePieces) {
       for (const spot of spotsToCheck) {
          const simBoard = cloneBoard(board);
          const newPiece: Piece = { id: 'sim', type: piece, color: currentPlayer };
          simBoard.set(spot, { hex: stringToHex(spot), stack: [newPiece] });
          
          const score = evaluateBoard(simBoard, currentPlayer);
          
          possibleMoves.push({
            move: { action: 'PLACE', piece, hex: spot },
            score: score + Math.random()
          });
       }
    }
  }

  // 2. Movements (Only if Queen is placed)
  if (!queenNotPlaced) {
     const myPieces: string[] = [];
     board.forEach((cell, hexStr) => {
         const top = cell.stack[cell.stack.length - 1];
         if (top.color === currentPlayer) myPieces.push(hexStr);
     });

     for (const hexStr of myPieces) {
         const validDestinations = getPieceMoves(gameState, hexStr);
         
         for (const dest of validDestinations) {
            const simBoard = cloneBoard(board);
            const originCell = simBoard.get(hexStr)!;
            const movingPiece = originCell.stack.pop()!;
            
            if (originCell.stack.length === 0) simBoard.delete(hexStr);
            
            if (simBoard.has(dest)) {
               simBoard.get(dest)!.stack.push(movingPiece);
            } else {
               simBoard.set(dest, { hex: stringToHex(dest), stack: [movingPiece] });
            }
            
            const score = evaluateBoard(simBoard, currentPlayer);
            possibleMoves.push({
               move: { action: 'MOVE', from: hexStr, to: dest },
               score: score + Math.random()
            });
         }
     }
  }

  if (possibleMoves.length === 0) return null;

  possibleMoves.sort((a, b) => b.score - a.score);
  return possibleMoves[0].move;
};