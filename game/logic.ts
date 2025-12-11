import { BoardMap, BugType, GameState, Hex, PlayerColor, Piece } from './types';
import { hexToString, getNeighbors, stringToHex, areNeighbors, getCommonNeighbors, hexNeighbor } from './utils';

// Initial pieces count
export const INITIAL_HAND = {
  [BugType.QUEEN]: 1,
  [BugType.SPIDER]: 2,
  [BugType.BEETLE]: 2,
  [BugType.GRASSHOPPER]: 3,
  [BugType.ANT]: 3,
};

// Check if One Hive rule is preserved if we remove a piece from `fromHex`
export const isHiveConnected = (board: BoardMap, ignoreHexStr?: string): boolean => {
  const keys = Array.from(board.keys());
  const activeKeys = keys.filter(k => k !== ignoreHexStr);
  
  if (activeKeys.length <= 1) return true;

  const startNode = activeKeys[0];
  const queue = [startNode];
  const visited = new Set<string>();
  visited.add(startNode);

  while (queue.length > 0) {
    const currentStr = queue.shift()!;
    const currentHex = stringToHex(currentStr);
    const neighbors = getNeighbors(currentHex);

    for (const n of neighbors) {
      const nStr = hexToString(n);
      if (activeKeys.includes(nStr) && !visited.has(nStr)) {
        visited.add(nStr);
        queue.push(nStr);
      }
    }
  }

  return visited.size === activeKeys.length;
};

// Get all possible placement locations
export const getValidPlacements = (state: GameState): string[] => {
  const { board, currentPlayer } = state;
  const boardKeys = Array.from(board.keys());

  // Count how many pieces the current player has on the board
  let myPieceCount = 0;
  board.forEach(cell => {
    if (cell.stack.some(p => p.color === currentPlayer)) {
      myPieceCount++;
    }
  });

  // Case 0: Very first move of the game (White)
  if (boardKeys.length === 0) return ['0,0'];

  // Case 1: First move for this player (usually Black's first turn), but board is not empty
  // Rule: Must touch existing pieces (opponent's), because I have no color to touch yet.
  if (myPieceCount === 0) {
     const validStartSpots = new Set<string>();
     board.forEach(cell => {
         const neighbors = getNeighbors(cell.hex);
         neighbors.forEach(n => {
             const nStr = hexToString(n);
             if (!board.has(nStr)) {
                 validStartSpots.add(nStr);
             }
         });
     });
     return Array.from(validStartSpots);
  }

  // Case 2: General Placement (Turn 3+)
  // 1. Must touch OWN color (top of stack).
  // 2. Must NOT touch ENEMY color (top of stack).
  
  const validSpots = new Set<string>();
  const enemyColor = currentPlayer === PlayerColor.WHITE ? PlayerColor.BLACK : PlayerColor.WHITE;

  board.forEach((cell, keyStr) => {
    const topPiece = cell.stack[cell.stack.length - 1];
    
    // We can only spawn off our own active pieces
    if (topPiece.color === currentPlayer) {
      const neighbors = getNeighbors(cell.hex);
      for (const n of neighbors) {
        const nStr = hexToString(n);
        
        // Target spot must be empty
        if (!board.has(nStr)) {
          // Check neighbors of this candidate spot
          const neighborsOfCandidate = getNeighbors(n);
          
          // Rule: Cannot touch ANY enemy piece
          const touchesEnemy = neighborsOfCandidate.some(nn => {
            const nnStr = hexToString(nn);
            const nnCell = board.get(nnStr);
            if (nnCell) {
              const nnTop = nnCell.stack[nnCell.stack.length - 1];
              return nnTop.color === enemyColor;
            }
            return false;
          });

          if (!touchesEnemy) {
            validSpots.add(nStr);
          }
        }
      }
    }
  });

  return Array.from(validSpots);
};

// Movement Rules
const canSlide = (from: Hex, to: Hex, board: BoardMap): boolean => {
  // Common Logic: Sliding into a spot requires 'freedom to move'.
  // If 2 common neighbors are occupied, it's a gate (blocked).
  // If < 2, it's open.
  const n1 = getNeighbors(from);
  const common = n1.filter(n => areNeighbors(n, to));
  
  let blockedCount = 0;
  common.forEach(c => {
    if (board.has(hexToString(c))) blockedCount++;
  });
  
  return blockedCount < 2;
};

// Check specific bug moves
export const getPieceMoves = (state: GameState, hexStr: string): string[] => {
  const { board } = state;
  const startHex = stringToHex(hexStr);
  const cell = board.get(hexStr);
  if (!cell) return [];
  const piece = cell.stack[cell.stack.length - 1];

  // 1. Check One Hive Rule (Removal)
  // Only matters if we are moving the base piece (stack size 1)
  if (cell.stack.length === 1) {
    if (!isHiveConnected(board, hexStr)) return [];
  }

  const moves = new Set<string>();

  // Helper for Slide logic
  const getSlideNeighbors = (curr: Hex): Hex[] => {
    return getNeighbors(curr).filter(n => {
      const nStr = hexToString(n);
      if (board.has(nStr)) return false; // Occupied
      if (!canSlide(curr, n, board)) return false; // Gate closed
      
      // Must maintain contact with Hive during slide
      const nNeighbors = getNeighbors(n);
      const touchesHive = nNeighbors.some(nn => {
         const nnStr = hexToString(nn);
         return board.has(nnStr) && nnStr !== hexStr; 
      });
      return touchesHive;
    });
  };

  if (piece.type === BugType.QUEEN) {
    const neighbors = getSlideNeighbors(startHex);
    neighbors.forEach(n => moves.add(hexToString(n)));
  }

  if (piece.type === BugType.BEETLE) {
    const neighbors = getNeighbors(startHex);
    neighbors.forEach(n => {
      const nStr = hexToString(n);
      if (board.has(nStr)) {
        // Climb: Beetle can climb onto any occupied tile
        moves.add(nStr);
      } else {
        // Slide: Move to empty spot
        if (canSlide(startHex, n, board)) {
           const nNeighbors = getNeighbors(n);
           // Must touch hive
           const touches = nNeighbors.some(nn => board.has(hexToString(nn)) && hexToString(nn) !== hexStr);
           if (touches) moves.add(nStr);
        }
      }
    });
  }

  if (piece.type === BugType.GRASSHOPPER) {
    const directions = [0, 1, 2, 3, 4, 5];
    directions.forEach(dir => {
      let current = hexNeighbor(startHex, dir);
      let jumped = false;
      while (board.has(hexToString(current))) {
        jumped = true;
        current = hexNeighbor(current, dir);
      }
      if (jumped) {
        moves.add(hexToString(current));
      }
    });
  }

  if (piece.type === BugType.SPIDER) {
    const visited = new Set<string>();
    visited.add(hexStr);
    
    const search = (curr: Hex, depth: number, path: string[]) => {
      if (depth === 3) {
        moves.add(hexToString(curr));
        return;
      }
      
      const candidates = getNeighbors(curr).filter(n => {
        const nStr = hexToString(n);
        if (board.has(nStr)) return false;
        if (path.includes(nStr)) return false; // No backtracking
        if (!canSlide(curr, n, board)) return false;
        
        const nNeighbors = getNeighbors(n);
        const touches = nNeighbors.some(nn => {
           const nnStr = hexToString(nn);
           // Must touch hive
           return board.has(nnStr); 
        });
        return touches;
      });

      candidates.forEach(c => search(c, depth + 1, [...path, hexToString(c)]));
    };

    search(startHex, 0, [hexStr]);
  }

  if (piece.type === BugType.ANT) {
    const visited = new Set<string>();
    visited.add(hexStr);
    const queue = [startHex];

    while (queue.length > 0) {
      const curr = queue.shift()!;
      
      const candidates = getNeighbors(curr).filter(n => {
        const nStr = hexToString(n);
        if (board.has(nStr)) return false;
        if (visited.has(nStr)) return false;
        if (!canSlide(curr, n, board)) return false;
        
        const nNeighbors = getNeighbors(n);
        const touches = nNeighbors.some(nn => board.has(hexToString(nn)) && hexToString(nn) !== hexStr);
        return touches;
      });

      candidates.forEach(c => {
        const cStr = hexToString(c);
        if (!visited.has(cStr)) {
          visited.add(cStr);
          moves.add(cStr);
          queue.push(c);
        }
      });
    }
  }

  return Array.from(moves);
};