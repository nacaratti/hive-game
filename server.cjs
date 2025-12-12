const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const validator = require('validator');
require('dotenv').config();

const app = express();
const server = http.createServer(app);

// Security: Helmet for HTTP headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      connectSrc: ["'self'", "ws:", "wss:"],
    },
  },
}));

// Security: Rate limiting for HTTP endpoints
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use(limiter);

// Security: Configurable CORS
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:3000'];

const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps or Postman)
      if (!origin) return callback(null, true);

      if (allowedOrigins.indexOf(origin) !== -1 || process.env.NODE_ENV === 'development') {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    methods: ["GET", "POST"],
    credentials: true
  },
  // Security: Connection timeout
  pingTimeout: 60000,
  pingInterval: 25000,
  // Security: Max payload size
  maxHttpBufferSize: 1e6, // 1MB
  // Security: Disconnect on error
  allowEIO3: false
});

// Game Constants
const INITIAL_HAND = {
  'QUEEN': 1, 'SPIDER': 2, 'BEETLE': 2, 'GRASSHOPPER': 3, 'ANT': 3
};

// State
let queue = []; // Array of { id, nickname, wins }
let players = {
  white: null, // { id, nickname, hand, wins }
  black: null  // { id, nickname, hand, wins }
};

let gameState = {
  board: [], // Array of [key, cell] for easy serialization
  turnNumber: 1,
  currentPlayer: 'WHITE',
  winner: null,
  log: [],
  lastMoveTime: Date.now()
};

let gameTimer = null;
const MOVE_TIME_LIMIT = 30; // Seconds

// Bot Game State
let botGame = {
  active: false,
  humanPlayerId: null,
  humanNickname: null,
  humanColor: null,
  botTimer: null,
  botResponseTimer: null
};

const BOT_MIN_DELAY = 1500;
const BOT_MAX_DELAY = 3500;

// Security: Rate limiting per socket
const socketRateLimits = new Map();
const SOCKET_RATE_LIMIT = 10; // Max actions per second
const SOCKET_RATE_WINDOW = 1000; // 1 second

// Security: Input validation and sanitization
const sanitizeNickname = (nickname) => {
  if (!nickname || typeof nickname !== 'string') return null;

  // Remove any HTML/script tags
  let clean = validator.escape(nickname.toString());

  // Limit length
  clean = clean.substring(0, 20);

  // Only allow alphanumeric, spaces, and some safe characters
  clean = clean.replace(/[^a-zA-Z0-9\s\-_]/g, '');

  // Trim whitespace
  clean = clean.trim();

  // Ensure minimum length
  if (clean.length < 2) return null;

  return clean;
};

const isValidHexCoordinate = (hexStr) => {
  if (!hexStr || typeof hexStr !== 'string') return false;

  const parts = hexStr.split(',');
  if (parts.length !== 2) return false;

  const [q, r] = parts.map(Number);
  if (!Number.isInteger(q) || !Number.isInteger(r)) return false;

  // Reasonable bounds check (prevent memory exhaustion)
  if (Math.abs(q) > 50 || Math.abs(r) > 50) return false;

  return true;
};

const isValidPieceType = (type) => {
  const validTypes = ['QUEEN', 'SPIDER', 'BEETLE', 'GRASSHOPPER', 'ANT'];
  return validTypes.includes(type);
};

const isValidColor = (color) => {
  return color === 'WHITE' || color === 'BLACK';
};

const checkSocketRateLimit = (socketId) => {
  const now = Date.now();
  const record = socketRateLimits.get(socketId) || { count: 0, resetAt: now + SOCKET_RATE_WINDOW };

  if (now > record.resetAt) {
    // Reset window
    socketRateLimits.set(socketId, { count: 1, resetAt: now + SOCKET_RATE_WINDOW });
    return true;
  }

  if (record.count >= SOCKET_RATE_LIMIT) {
    return false; // Rate limit exceeded
  }

  record.count++;
  socketRateLimits.set(socketId, record);
  return true;
};

// --- Helper Functions ---

function resetGame(keepWinnerColor) {
  gameState.board = [];
  gameState.turnNumber = 1;
  gameState.currentPlayer = 'WHITE';
  gameState.winner = null;
  gameState.log = ['New Game Started!'];
  gameState.lastMoveTime = Date.now();
  
  // Reset hands
  if (players.white) players.white.hand = { ...INITIAL_HAND };
  if (players.black) players.black.hand = { ...INITIAL_HAND };
  
  startTimer();
  broadcastState();
}

function startTimer() {
  clearInterval(gameTimer);
  gameState.lastMoveTime = Date.now();
  
  gameTimer = setInterval(() => {
    const elapsed = (Date.now() - gameState.lastMoveTime) / 1000;
    if (elapsed >= MOVE_TIME_LIMIT) {
      // Timeout Logic: Pass turn or lose? 
      // King of the hill: Speed is key. Random move or pass? 
      // Simple version: Pass turn
      const nextPlayer = gameState.currentPlayer === 'WHITE' ? 'BLACK' : 'WHITE';
      gameState.currentPlayer = nextPlayer;
      gameState.turnNumber++;
      gameState.log.push(`Time out! Turn passed to ${nextPlayer}.`);
      gameState.lastMoveTime = Date.now();
      broadcastState();
    }
  }, 1000);
}

function handleWin(winnerColor) {
  clearInterval(gameTimer);
  gameState.winner = winnerColor;
  
  const winner = players[winnerColor.toLowerCase()];
  const loserColor = winnerColor === 'WHITE' ? 'black' : 'white';
  const loser = players[loserColor];
  
  if (winner) winner.wins = (winner.wins || 0) + 1;
  gameState.log.push(`GAME OVER! ${winner ? winner.nickname : winnerColor} WINS!`);
  
  broadcastState();

  // King of the Hill Rotation Delay
  setTimeout(() => {
    // 1. Winner stays (becomes White usually, or keep color? Let's make winner WHITE)
    // 2. Loser goes to end of queue
    // 3. First in queue becomes Challenger (Black)
    
    if (queue.length > 0) {
      // Move loser to queue
      if (loser) {
         queue.push({ id: loser.id, nickname: loser.nickname, wins: 0 });
      }
      
      // Winner becomes White
      players.white = winner; 
      
      // Next in queue becomes Black
      const nextPlayer = queue.shift();
      players.black = { ...nextPlayer, hand: { ...INITIAL_HAND }, wins: nextPlayer.wins || 0 };
      
    } else {
      // Just swap colors or keep same if no one waiting?
      // Strict King of Hill: Winner stays White.
      if (loser) {
          // If nobody in queue, play again, winner is White
          players.white = winner;
          players.black = { ...loser, hand: { ...INITIAL_HAND }, wins: 0 };
      }
    }
    
    resetGame();
  }, 5000);
}

function broadcastState() {
  const publicState = {
    ...gameState,
    timeLeft: Math.max(0, MOVE_TIME_LIMIT - Math.floor((Date.now() - gameState.lastMoveTime) / 1000)),
    players: {
      WHITE: players.white,
      BLACK: players.black
    },
    queue: queue.map(p => p.nickname)
  };
  io.emit('state_update', publicState);
}

// --- Bot Logic (adapted from game/bot.ts) ---

// Hex utility functions
const stringToHex = (str) => {
  const [q, r] = str.split(',').map(Number);
  return { q, r, s: -q - r };
};

const hexToString = (hex) => `${hex.q},${hex.r}`;

const getNeighbors = (hex) => {
  const directions = [
    { q: 1, r: 0, s: -1 }, { q: 1, r: -1, s: 0 }, { q: 0, r: -1, s: 1 },
    { q: -1, r: 0, s: 1 }, { q: -1, r: 1, s: 0 }, { q: 0, r: 1, s: -1 },
  ];
  return directions.map(d => ({ q: hex.q + d.q, r: hex.r + d.r, s: hex.s + d.s }));
};

const hexNeighbor = (hex, direction) => {
  const directions = [
    { q: 1, r: 0, s: -1 }, { q: 1, r: -1, s: 0 }, { q: 0, r: -1, s: 1 },
    { q: -1, r: 0, s: 1 }, { q: -1, r: 1, s: 0 }, { q: 0, r: 1, s: -1 },
  ];
  const d = directions[direction % 6];
  return { q: hex.q + d.q, r: hex.r + d.r, s: hex.s + d.s };
};

const areNeighbors = (h1, h2) => {
  return Math.abs(h1.q - h2.q) <= 1 &&
         Math.abs(h1.r - h2.r) <= 1 &&
         Math.abs(h1.s - h2.s) <= 1 &&
         !(h1.q === h2.q && h1.r === h2.r);
};

const canSlide = (from, to, board) => {
  const n1 = getNeighbors(from);
  const common = n1.filter(n => areNeighbors(n, to));

  let blockedCount = 0;
  common.forEach(c => {
    if (board.some(([k]) => k === hexToString(c))) blockedCount++;
  });

  return blockedCount < 2;
};

const isHiveConnected = (board, ignoreHexStr) => {
  const activeKeys = board.filter(([k]) => k !== ignoreHexStr).map(([k]) => k);

  if (activeKeys.length <= 1) return true;

  const startNode = activeKeys[0];
  const queue = [startNode];
  const visited = new Set();
  visited.add(startNode);

  while (queue.length > 0) {
    const currentStr = queue.shift();
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

// Distância Manhattan em hex grid (coordenadas cúbicas)
const hexDistance = (hexA, hexB) => {
  return Math.max(
    Math.abs(hexA.q - hexB.q),
    Math.abs(hexA.r - hexB.r),
    Math.abs(hexA.s - hexB.s)
  );
};

const cloneBoard = (board) => {
  return board.map(([k, v]) => [k, { hex: v.hex, stack: v.stack.map(p => ({ ...p })) }]);
};

const getPieceMoves = (board, hexStr) => {
  const cell = board.find(([k]) => k === hexStr);
  if (!cell) return [];

  const piece = cell[1].stack[cell[1].stack.length - 1];
  const startHex = cell[1].hex;
  const moves = new Set();

  // Check One Hive Rule (only if moving base piece)
  if (cell[1].stack.length === 1) {
    if (!isHiveConnected(board, hexStr)) return [];
  }

  // Helper for slide neighbors
  const getSlideNeighbors = (curr) => {
    return getNeighbors(curr).filter(n => {
      const nStr = hexToString(n);
      if (board.some(([k]) => k === nStr)) return false; // Occupied
      if (!canSlide(curr, n, board)) return false; // Gate closed

      // Must maintain contact with Hive during slide
      const nNeighbors = getNeighbors(n);
      const touchesHive = nNeighbors.some(nn => {
        const nnStr = hexToString(nn);
        return board.some(([k]) => k === nnStr) && nnStr !== hexStr;
      });
      return touchesHive;
    });
  };

  // QUEEN - moves 1 space
  if (piece.type === 'QUEEN') {
    const neighbors = getSlideNeighbors(startHex);
    neighbors.forEach(n => moves.add(hexToString(n)));
  }

  // BEETLE - can climb or slide
  if (piece.type === 'BEETLE') {
    const neighbors = getNeighbors(startHex);
    neighbors.forEach(n => {
      const nStr = hexToString(n);
      if (board.some(([k]) => k === nStr)) {
        // Climb: Beetle can climb onto any occupied tile
        moves.add(nStr);
      } else {
        // Slide: Move to empty spot
        if (canSlide(startHex, n, board)) {
          const nNeighbors = getNeighbors(n);
          // Must touch hive
          const touches = nNeighbors.some(nn => board.some(([k]) => k === hexToString(nn)) && hexToString(nn) !== hexStr);
          if (touches) moves.add(nStr);
        }
      }
    });
  }

  // GRASSHOPPER - jumps in straight lines
  if (piece.type === 'GRASSHOPPER') {
    const directions = [0, 1, 2, 3, 4, 5];
    directions.forEach(dir => {
      let current = hexNeighbor(startHex, dir);
      let jumped = false;
      while (board.some(([k]) => k === hexToString(current))) {
        jumped = true;
        current = hexNeighbor(current, dir);
      }
      if (jumped) {
        moves.add(hexToString(current));
      }
    });
  }

  // SPIDER - exactly 3 moves
  if (piece.type === 'SPIDER') {
    const visited = new Set();
    visited.add(hexStr);

    const search = (curr, depth, path) => {
      if (depth === 3) {
        moves.add(hexToString(curr));
        return;
      }

      const candidates = getNeighbors(curr).filter(n => {
        const nStr = hexToString(n);
        if (board.some(([k]) => k === nStr)) return false;
        if (path.includes(nStr)) return false; // No backtracking
        if (!canSlide(curr, n, board)) return false;

        const nNeighbors = getNeighbors(n);
        const touches = nNeighbors.some(nn => {
          const nnStr = hexToString(nn);
          // Must touch hive
          return board.some(([k]) => k === nnStr);
        });
        return touches;
      });

      candidates.forEach(c => search(c, depth + 1, [...path, hexToString(c)]));
    };

    search(startHex, 0, [hexStr]);
  }

  // ANT - unlimited sliding
  if (piece.type === 'ANT') {
    const visited = new Set();
    visited.add(hexStr);
    const queue = [startHex];

    while (queue.length > 0) {
      const curr = queue.shift();

      const candidates = getNeighbors(curr).filter(n => {
        const nStr = hexToString(n);
        if (board.some(([k]) => k === nStr)) return false;
        if (visited.has(nStr)) return false;
        if (!canSlide(curr, n, board)) return false;

        const nNeighbors = getNeighbors(n);
        const touches = nNeighbors.some(nn => board.some(([k]) => k === hexToString(nn)) && hexToString(nn) !== hexStr);
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

const getQueenHex = (board, color) => {
  for (const [hexStr, cell] of board) {
    if (cell.stack.some(p => p.type === 'QUEEN' && p.color === color)) {
      return hexStr;
    }
  }
  return null;
};

const countOccupiedNeighbors = (board, hexStr) => {
  const neighbors = getNeighbors(stringToHex(hexStr));
  return neighbors.reduce((acc, n) => {
    const key = hexToString(n);
    return acc + (board.some(([k]) => k === key) ? 1 : 0);
  }, 0);
};

// Valores das peças para heurística material
const PIECE_VALUES = {
  'QUEEN': 1000,
  'ANT': 200,
  'SPIDER': 150,
  'BEETLE': 180,
  'GRASSHOPPER': 120
};

const evaluateBoard = (board, botColor) => {
  const enemyColor = botColor === 'WHITE' ? 'BLACK' : 'WHITE';
  const myQueen = getQueenHex(board, botColor);
  const enemyQueen = getQueenHex(board, enemyColor);

  let score = 0;

  // 1. Material (top pieces only)
  let myMaterial = 0;
  let enemyMaterial = 0;
  board.forEach(([hexStr, cell]) => {
    const top = cell.stack[cell.stack.length - 1];
    const val = PIECE_VALUES[top.type] || 50;
    if (top.color === botColor) myMaterial += val;
    else enemyMaterial += val;
  });
  score += (myMaterial - enemyMaterial) * 0.8;

  // 2. Queen safety
  if (myQueen) {
    const myClosed = countOccupiedNeighbors(board, myQueen);
    score += (6 - myClosed) * 40; // livre é bom
    if (myClosed >= 6) score -= 2000; // cercada = derrota
  } else {
    score -= 150; // penalty por não ter queen
  }

  if (enemyQueen) {
    const enemyClosed = countOccupiedNeighbors(board, enemyQueen);
    score += enemyClosed * 70; // cercar inimigo é ótimo
    if (enemyClosed >= 6) score += 2000; // vitória!
  }

  // 3. Mobilidade (vizinhos livres = movimento potencial)
  let myMoves = 0;
  let enemyMoves = 0;
  board.forEach(([hexStr, cell]) => {
    const top = cell.stack[cell.stack.length - 1];
    const hex = stringToHex(hexStr);
    const freeNeighbors = getNeighbors(hex).reduce((acc, n) => {
      return acc + (board.some(([k]) => k === hexToString(n)) ? 0 : 1);
    }, 0);

    if (top.color === botColor) myMoves += freeNeighbors;
    else enemyMoves += freeNeighbors;
  });
  score += (myMoves - enemyMoves) * 3;

  // 4. Peças presas (zero vizinhos livres)
  let myStuck = 0;
  let enemyStuck = 0;
  board.forEach(([hexStr, cell]) => {
    const top = cell.stack[cell.stack.length - 1];
    const hex = stringToHex(hexStr);
    const freeNeighbors = getNeighbors(hex).reduce((acc, n) => {
      return acc + (board.some(([k]) => k === hexToString(n)) ? 0 : 1);
    }, 0);

    if (freeNeighbors === 0) {
      if (top.color === botColor) myStuck++;
      else enemyStuck++;
    }
  });
  score += (enemyStuck - myStuck) * 40;

  // 5. Conectividade do hive
  if (!isHiveConnected(board)) score -= 1000;

  // 6. Proximidade entre rainhas (pressão tática)
  if (myQueen && enemyQueen) {
    const myQueenHex = stringToHex(myQueen);
    const enemyQueenHex = stringToHex(enemyQueen);
    const dist = hexDistance(myQueenHex, enemyQueenHex);
    score += (10 - dist) * 5;
  }

  return score;
};

// Simula movimento em um board clonado
const applyMoveToBoard = (board, move, player) => {
  const newBoard = cloneBoard(board);

  if (move.action === 'PLACE') {
    const newPiece = {
      id: `${player}_${move.piece}_${Math.random()}`,
      type: move.piece,
      color: player
    };

    const existingIdx = newBoard.findIndex(([k]) => k === move.hex);
    if (existingIdx >= 0) {
      newBoard[existingIdx][1].stack.push(newPiece);
    } else {
      newBoard.push([move.hex, {
        hex: stringToHex(move.hex),
        stack: [newPiece]
      }]);
    }
  } else if (move.action === 'MOVE') {
    const fromIdx = newBoard.findIndex(([k]) => k === move.from);
    if (fromIdx >= 0) {
      const movingPiece = newBoard[fromIdx][1].stack.pop();

      if (newBoard[fromIdx][1].stack.length === 0) {
        newBoard.splice(fromIdx, 1);
      }

      const toIdx = newBoard.findIndex(([k]) => k === move.to);
      if (toIdx >= 0) {
        newBoard[toIdx][1].stack.push(movingPiece);
      } else {
        newBoard.push([move.to, {
          hex: stringToHex(move.to),
          stack: [movingPiece]
        }]);
      }
    }
  }

  return newBoard;
};

// Heurística de ordenação simples: avalia rapidamente um movimento sem simular muito
const quickMoveScore = (move, board, botColor) => {
  // Priorizar cercar inimiga, liberar minha rainha, e capturar/andar com peças valiosas
  let score = 0;
  const enemyColor = botColor === 'WHITE' ? 'BLACK' : 'WHITE';

  if (move.action === 'PLACE') {
    if (move.piece === 'QUEEN') score += 200;
    // proximidade com queen inimiga
    const enemyQ = getQueenHex(board, enemyColor);
    if (enemyQ) {
      const moveHex = stringToHex(move.hex);
      const enemyHex = stringToHex(enemyQ);
      const dist = hexDistance(moveHex, enemyHex);
      score += Math.max(0, 6 - dist) * 10;
    }
  } else {
    // mover peça: preferir mover para perto da rainha inimiga
    const dest = move.to;
    const enemyQ = getQueenHex(board, enemyColor);
    if (enemyQ) {
      const destHex = stringToHex(dest);
      const enemyHex = stringToHex(enemyQ);
      const dist = hexDistance(destHex, enemyHex);
      score += Math.max(0, 6 - dist) * 8;
    }
  }
  return score;
};

// Gera todos os moves legais para o jogador atual
const generateAllMoves = (currentPlayer, turnNumber, hand, board) => {
  const moves = [];

  const canPlace = turnNumber === 1 || Object.values(hand).some(c => c > 0);
  const queenNotPlaced = hand['QUEEN'] > 0;
  const playerTurnIndex = Math.ceil(turnNumber / 2);
  const mustPlaceQueen = playerTurnIndex === 4 && queenNotPlaced;

  // Placements
  if (canPlace) {
    const placementSpots = getValidPlacements(currentPlayer, board);
    let piecesToTry = [];

    if (mustPlaceQueen) {
      piecesToTry = ['QUEEN'];
    } else {
      piecesToTry = Object.keys(hand).filter(t => hand[t] > 0);
    }

    for (const piece of piecesToTry) {
      for (const spot of placementSpots) {
        moves.push({ action: 'PLACE', piece, hex: spot });
      }
    }
  }

  // Movements (só se queen colocada)
  if (!queenNotPlaced) {
    board.forEach(([hexStr, cell]) => {
      const top = cell.stack[cell.stack.length - 1];
      if (top.color === currentPlayer) {
        const destinations = getPieceMoves(board, hexStr);
        for (const dest of destinations) {
          moves.push({ action: 'MOVE', from: hexStr, to: dest });
        }
      }
    });
  }

  return moves;
};

// Algoritmo Minimax com poda Alpha-Beta
const minimax = (board, depth, alpha, beta, maximizing, playerToMove, rootPlayer, turnNumber, whiteHand, blackHand) => {
  // Terminal: depth 0
  if (depth === 0) {
    return { score: evaluateBoard(board, rootPlayer), move: null };
  }

  // Preparar hand do jogador atual
  const currentHand = playerToMove === 'WHITE' ? whiteHand : blackHand;

  // Gerar moves
  const moves = generateAllMoves(playerToMove, turnNumber, currentHand, board);

  if (moves.length === 0) {
    return { score: evaluateBoard(board, rootPlayer), move: null };
  }

  // Move ordering: sort by quick heuristic
  moves.sort((a, b) => quickMoveScore(b, board, rootPlayer) - quickMoveScore(a, board, rootPlayer));

  let bestMove = null;

  if (maximizing) {
    let value = -Infinity;
    for (const move of moves) {
      const newBoard = applyMoveToBoard(board, move, playerToMove);
      const nextPlayer = playerToMove === 'WHITE' ? 'BLACK' : 'WHITE';

      // Atualizar hand se foi placement
      let newWhiteHand = { ...whiteHand };
      let newBlackHand = { ...blackHand };
      if (move.action === 'PLACE') {
        if (playerToMove === 'WHITE') newWhiteHand[move.piece]--;
        else newBlackHand[move.piece]--;
      }

      const result = minimax(newBoard, depth - 1, alpha, beta, false, nextPlayer, rootPlayer, turnNumber + 1, newWhiteHand, newBlackHand);

      if (result.score > value) {
        value = result.score;
        bestMove = move;
      }

      alpha = Math.max(alpha, value);
      if (alpha >= beta) break; // Beta cut-off
    }
    return { score: value, move: bestMove };
  } else {
    let value = Infinity;
    for (const move of moves) {
      const newBoard = applyMoveToBoard(board, move, playerToMove);
      const nextPlayer = playerToMove === 'WHITE' ? 'BLACK' : 'WHITE';

      // Atualizar hand
      let newWhiteHand = { ...whiteHand };
      let newBlackHand = { ...blackHand };
      if (move.action === 'PLACE') {
        if (playerToMove === 'WHITE') newWhiteHand[move.piece]--;
        else newBlackHand[move.piece]--;
      }

      const result = minimax(newBoard, depth - 1, alpha, beta, true, nextPlayer, rootPlayer, turnNumber + 1, newWhiteHand, newBlackHand);

      if (result.score < value) {
        value = result.score;
        bestMove = move;
      }

      beta = Math.min(beta, value);
      if (alpha >= beta) break; // Alpha cut-off
    }
    return { score: value, move: bestMove };
  }
};

// Profundidade do Minimax
const MAX_DEPTH = 3; // Ajustado de 2 para 3 (bot.ts usa 4, mas 3 é bom balanço)

const getBotMove = (currentPlayer, turnNumber, hand, board) => {
  // Gerar todos os moves iniciais
  const moves = generateAllMoves(currentPlayer, turnNumber, hand, board);

  if (moves.length === 0) return null;

  // Preparar hands para simulação
  const whitePlayer = players.white;
  const blackPlayer = players.black;
  const whiteHand = currentPlayer === 'WHITE' ? hand : (whitePlayer ? whitePlayer.hand : {});
  const blackHand = currentPlayer === 'BLACK' ? hand : (blackPlayer ? blackPlayer.hand : {});

  // Order root moves and evaluate with minimax
  // Melhor ordenar root moves por quickMoveScore decrescente para melhor poda
  moves.sort((a, b) => quickMoveScore(b, board, currentPlayer) - quickMoveScore(a, board, currentPlayer));

  let best = null;
  let bestScore = -Infinity;

  // Avaliar cada move raiz com minimax
  for (const move of moves) {
    const newBoard = applyMoveToBoard(board, move, currentPlayer);
    const nextPlayer = currentPlayer === 'WHITE' ? 'BLACK' : 'WHITE';

    // Atualizar hand
    let newWhiteHand = { ...whiteHand };
    let newBlackHand = { ...blackHand };
    if (move.action === 'PLACE') {
      if (currentPlayer === 'WHITE') newWhiteHand[move.piece]--;
      else newBlackHand[move.piece]--;
    }

    const result = minimax(
      newBoard,
      MAX_DEPTH - 1,
      -Infinity,
      Infinity,
      false, // Próximo nível é minimizing (oponente)
      nextPlayer,
      currentPlayer, // rootPlayer
      turnNumber + 1,
      newWhiteHand,
      newBlackHand
    );

    if (result.score > bestScore) {
      bestScore = result.score;
      best = move;
    }
  }

  return best;
};

const getValidPlacements = (currentPlayer, board) => {
  if (board.length === 0) return ['0,0'];

  // Count my pieces
  let myPieceCount = 0;
  board.forEach(([, cell]) => {
    if (cell.stack.some(p => p.color === currentPlayer)) {
      myPieceCount++;
    }
  });

  // First move for this player
  if (myPieceCount === 0) {
    const validStartSpots = new Set();
    board.forEach(([, cell]) => {
      const neighbors = getNeighbors(cell.hex);
      neighbors.forEach(n => {
        const nStr = hexToString(n);
        if (!board.some(([k]) => k === nStr)) {
          validStartSpots.add(nStr);
        }
      });
    });
    return Array.from(validStartSpots);
  }

  // General placement
  const validSpots = new Set();
  const enemyColor = currentPlayer === 'WHITE' ? 'BLACK' : 'WHITE';

  board.forEach(([keyStr, cell]) => {
    const topPiece = cell.stack[cell.stack.length - 1];

    if (topPiece.color === currentPlayer) {
      const neighbors = getNeighbors(cell.hex);
      for (const n of neighbors) {
        const nStr = hexToString(n);

        if (!board.some(([k]) => k === nStr)) {
          const neighborsOfCandidate = getNeighbors(n);

          const touchesEnemy = neighborsOfCandidate.some(nn => {
            const nnStr = hexToString(nn);
            const nnCell = board.find(([k]) => k === nnStr);
            if (nnCell) {
              const nnTop = nnCell[1].stack[nnCell[1].stack.length - 1];
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

// Bot game management functions
function handleBotGameInterruption(newPlayerColor, newPlayer) {
  // Clear any pending bot move timers
  clearTimeout(botGame.botTimer);
  clearTimeout(botGame.botResponseTimer);

  // Assign new human player to open slot
  if (newPlayerColor === 'white') {
    players.white = { ...newPlayer, hand: { ...INITIAL_HAND } };
  } else {
    players.black = { ...newPlayer, hand: { ...INITIAL_HAND } };
  }

  // Disable bot
  botGame.active = false;
  botGame.humanPlayerId = null;
  botGame.humanNickname = null;
  botGame.humanColor = null;
  botGame.botTimer = null;
  botGame.botResponseTimer = null;

  gameState.log.push('Human player joined! Bot game ended.');

  // Reset game with two humans
  resetGame();
  broadcastState();
}

function scheduleBotMove() {
  // Random delay for realistic response time
  const delay = BOT_MIN_DELAY + Math.random() * (BOT_MAX_DELAY - BOT_MIN_DELAY);

  botGame.botResponseTimer = setTimeout(() => {
    executeBotMove();
  }, delay);
}

function executeBotMove() {
  if (!botGame.active || gameState.winner) return;

  const botPlayer = gameState.currentPlayer === 'WHITE' ? players.white : players.black;
  if (!botPlayer || !botPlayer.isBot) return;

  // Performance tracking
  const startTime = Date.now();
  const botMove = getBotMove(gameState.currentPlayer, gameState.turnNumber, botPlayer.hand, gameState.board);
  const elapsed = Date.now() - startTime;

  console.log(`[BOT] Move calculated in ${elapsed}ms`);
  if (elapsed > 5000) {
    console.warn(`[BOT WARNING] Move took ${elapsed}ms - consider reducing MAX_DEPTH`);
  }

  if (!botMove) {
    // Bot has no valid moves, pass turn
    gameState.log.push(`${gameState.currentPlayer} (BOT) PASSED (no moves available)`);
    gameState.turnNumber++;
    gameState.currentPlayer = gameState.currentPlayer === 'WHITE' ? 'BLACK' : 'WHITE';
    gameState.lastMoveTime = Date.now();
    broadcastState();
    return;
  }

  // Apply bot move
  if (botMove.action === 'PLACE') {
    if (botPlayer.hand[botMove.piece] > 0) {
      botPlayer.hand[botMove.piece]--;

      const existingIdx = gameState.board.findIndex(x => x[0] === botMove.hex);
      if (existingIdx >= 0) {
        gameState.board[existingIdx][1].stack.push({
          id: `bot-${botMove.piece}-${gameState.turnNumber}`,
          type: botMove.piece,
          color: gameState.currentPlayer
        });
      } else {
        gameState.board.push([botMove.hex, {
          hex: stringToHex(botMove.hex),
          stack: [{
            id: `bot-${botMove.piece}-${gameState.turnNumber}`,
            type: botMove.piece,
            color: gameState.currentPlayer
          }]
        }]);
      }

      gameState.log.push(`${gameState.currentPlayer} (BOT) placed ${botMove.piece}`);

      // End turn
      gameState.turnNumber++;
      gameState.currentPlayer = gameState.currentPlayer === 'WHITE' ? 'BLACK' : 'WHITE';
      gameState.lastMoveTime = Date.now();

      clearInterval(gameTimer);
      startTimer();

      broadcastState();

      // Schedule next bot move if still bot's turn
      if (botGame.active) {
        const isBotTurn =
          (botGame.humanColor === 'white' && gameState.currentPlayer === 'BLACK') ||
          (botGame.humanColor === 'black' && gameState.currentPlayer === 'WHITE');

        if (isBotTurn && !gameState.winner) {
          scheduleBotMove();
        }
      }
    }
  } else if (botMove.action === 'MOVE') {
    const fromIdx = gameState.board.findIndex(x => x[0] === botMove.from);
    if (fromIdx >= 0) {
      const stack = gameState.board[fromIdx][1].stack;
      const piece = stack.pop();

      if (stack.length === 0) {
        gameState.board.splice(fromIdx, 1);
      }

      const toIdx = gameState.board.findIndex(x => x[0] === botMove.to);
      if (toIdx >= 0) {
        gameState.board[toIdx][1].stack.push(piece);
      } else {
        const [q, r] = botMove.to.split(',').map(Number);
        gameState.board.push([botMove.to, {
          hex: { q, r, s: -q - r },
          stack: [piece]
        }]);
      }

      gameState.log.push(`${gameState.currentPlayer} (BOT) moved ${piece.type}`);

      // End turn
      gameState.turnNumber++;
      gameState.currentPlayer = gameState.currentPlayer === 'WHITE' ? 'BLACK' : 'WHITE';
      gameState.lastMoveTime = Date.now();

      clearInterval(gameTimer);
      startTimer();

      broadcastState();

      // Schedule next bot move if still bot's turn
      if (botGame.active) {
        const isBotTurn =
          (botGame.humanColor === 'white' && gameState.currentPlayer === 'BLACK') ||
          (botGame.humanColor === 'black' && gameState.currentPlayer === 'WHITE');

        if (isBotTurn && !gameState.winner) {
          scheduleBotMove();
        }
      }
    }
  }
}

// --- Socket Logic ---

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Security: Track connection count per IP (simple DoS prevention)
  const clientIP = socket.handshake.address;

  socket.on('join_game', (nickname) => {
    // Security: Rate limiting
    if (!checkSocketRateLimit(socket.id)) {
      socket.emit('error', { message: 'Too many requests. Please slow down.' });
      return;
    }

    // Security: Validate and sanitize nickname
    const cleanNickname = sanitizeNickname(nickname);
    if (!cleanNickname) {
      socket.emit('error', { message: 'Invalid nickname. Use 2-20 alphanumeric characters.' });
      return;
    }

    // Security: Check if nickname is already in use
    const nicknameInUse =
      (players.white && players.white.nickname === cleanNickname) ||
      (players.black && players.black.nickname === cleanNickname) ||
      queue.some(p => p.nickname === cleanNickname);

    if (nicknameInUse) {
      socket.emit('error', { message: 'Nickname already in use. Please choose another.' });
      return;
    }

    const user = { id: socket.id, nickname: cleanNickname, wins: 0 };

    // If bot game is active, human joins as opponent (immediate interruption)
    if (botGame.active) {
      const newPlayerColor = botGame.humanColor === 'white' ? 'black' : 'white';
      handleBotGameInterruption(newPlayerColor, user);
      return;
    }

    // Assign to White if empty
    if (!players.white) {
      players.white = { ...user, hand: { ...INITIAL_HAND } };
    }
    // Assign to Black if empty
    else if (!players.black) {
      players.black = { ...user, hand: { ...INITIAL_HAND } };
      resetGame(); // Start game when 2nd player joins
    }
    // Queue
    else {
      queue.push(user);
    }

    broadcastState();
  });

  socket.on('join_game_bot', (nickname) => {
    // Security: Rate limiting
    if (!checkSocketRateLimit(socket.id)) {
      socket.emit('error', { message: 'Too many requests. Please slow down.' });
      return;
    }

    // Security: Validate and sanitize nickname
    const cleanNickname = sanitizeNickname(nickname);
    if (!cleanNickname) {
      socket.emit('error', { message: 'Invalid nickname. Use 2-20 alphanumeric characters.' });
      return;
    }

    // Reject if queue is not empty
    if (queue.length > 0) {
      socket.emit('bot_join_rejected', { reason: 'Queue not empty' });
      return;
    }

    const humanUser = { id: socket.id, nickname: cleanNickname, wins: 0 };
    // Random color assignment
    const humanColor = Math.random() < 0.5 ? 'white' : 'black';

    // Set up bot game state
    botGame.active = true;
    botGame.humanPlayerId = socket.id;
    botGame.humanNickname = nickname;
    botGame.humanColor = humanColor;

    // Assign human player
    if (humanColor === 'white') {
      players.white = { ...humanUser, hand: { ...INITIAL_HAND } };
      players.black = {
        id: 'bot',
        nickname: 'BOT OPPONENT',
        hand: { ...INITIAL_HAND },
        wins: 0,
        isBot: true
      };
    } else {
      players.white = {
        id: 'bot',
        nickname: 'BOT OPPONENT',
        hand: { ...INITIAL_HAND },
        wins: 0,
        isBot: true
      };
      players.black = { ...humanUser, hand: { ...INITIAL_HAND } };
    }

    resetGame();

    // If bot is WHITE, schedule first move
    if (humanColor === 'black') {
      scheduleBotMove();
    }
  });

  socket.on('game_action', (action) => {
    // Security: Rate limiting
    if (!checkSocketRateLimit(socket.id)) {
      socket.emit('error', { message: 'Too many requests. Please slow down.' });
      return;
    }

    // Security: Validate action structure
    if (!action || typeof action !== 'object') {
      console.warn('Invalid action format from', socket.id);
      return;
    }

    const pColor = players.white && players.white.id === socket.id ? 'WHITE' :
                   players.black && players.black.id === socket.id ? 'BLACK' : null;

    // Security: Validate player identity
    if (!pColor || pColor !== gameState.currentPlayer) {
      console.warn('Invalid turn attempt from', socket.id);
      return;
    }

    if (gameState.winner) return;

    // Security: Validate action type
    const validActionTypes = ['PLACE', 'MOVE'];
    if (!validActionTypes.includes(action.type)) {
      console.warn('Invalid action type from', socket.id, action.type);
      return;
    }

    // Apply change to board state
    if (action.type === 'PLACE') {
      // Security: Validate PLACE action structure
      if (!action.piece || !action.hex || !action.hexObj) {
        console.warn('Invalid PLACE action structure from', socket.id);
        return;
      }

      // Security: Validate hex coordinate
      if (!isValidHexCoordinate(action.hex)) {
        console.warn('Invalid hex coordinate from', socket.id, action.hex);
        return;
      }

      // Security: Validate piece type
      if (!isValidPieceType(action.piece.type)) {
        console.warn('Invalid piece type from', socket.id, action.piece.type);
        return;
      }

      // Security: Validate piece color matches player
      if (action.piece.color !== pColor) {
        console.warn('Piece color mismatch from', socket.id);
        return;
      }

      const playerObj = pColor === 'WHITE' ? players.white : players.black;
      if (playerObj.hand[action.piece.type] > 0) {
        playerObj.hand[action.piece.type]--;
        
        // Add to board (simplified structure for wire)
        // Check if exists
        const existingIdx = gameState.board.findIndex(x => x[0] === action.hex);
        if (existingIdx >= 0) {
           gameState.board[existingIdx][1].stack.push(action.piece);
        } else {
           gameState.board.push([action.hex, { hex: action.hexObj, stack: [action.piece] }]);
        }
        
        gameState.log.push(`${pColor} placed ${action.piece.type}`);
        endTurn();
      }
    }

    if (action.type === 'MOVE') {
      // Security: Validate MOVE action structure
      if (!action.from || !action.to) {
        console.warn('Invalid MOVE action structure from', socket.id);
        return;
      }

      // Security: Validate hex coordinates
      if (!isValidHexCoordinate(action.from) || !isValidHexCoordinate(action.to)) {
        console.warn('Invalid MOVE hex coordinates from', socket.id);
        return;
      }

      // Security: Validate source position exists
      const fromIdx = gameState.board.findIndex(x => x[0] === action.from);
      if (fromIdx < 0) {
        console.warn('Invalid MOVE source position from', socket.id);
        return;
      }

      // Security: Validate piece ownership
      const stack = gameState.board[fromIdx][1].stack;
      if (stack.length === 0) {
        console.warn('Invalid MOVE empty stack from', socket.id);
        return;
      }
      const piece = stack[stack.length - 1];
      if (piece.color !== pColor) {
        console.warn('Invalid MOVE piece ownership from', socket.id);
        return;
      }

      // Execute move
      stack.pop();

      if (stack.length === 0) {
        gameState.board.splice(fromIdx, 1);
      }

      const toIdx = gameState.board.findIndex(x => x[0] === action.to);
      if (toIdx >= 0) {
         gameState.board[toIdx][1].stack.push(piece);
      } else {
         // Reconstruct hex obj from string
         const [q,r] = action.to.split(',').map(Number);
         gameState.board.push([action.to, { hex: {q,r,s:-q-r}, stack: [piece] }]);
      }

      gameState.log.push(`${pColor} moved ${piece.type}`);
      endTurn();
    }

    // REMOVIDO: Cliente não pode mais enviar GAME_OVER
    // A vitória é verificada automaticamente no servidor via checkVictoryCondition()
  });

  function checkVictoryCondition() {
    // Verificar se alguma rainha está completamente cercada (6 vizinhos)
    const whiteQueenHex = getQueenHex(gameState.board, 'WHITE');
    const blackQueenHex = getQueenHex(gameState.board, 'BLACK');

    let whiteQueenSurrounded = false;
    let blackQueenSurrounded = false;

    // Verificar rainha branca
    if (whiteQueenHex) {
      const whiteNeighbors = countOccupiedNeighbors(gameState.board, whiteQueenHex);
      whiteQueenSurrounded = whiteNeighbors >= 6;
    }

    // Verificar rainha preta
    if (blackQueenHex) {
      const blackNeighbors = countOccupiedNeighbors(gameState.board, blackQueenHex);
      blackQueenSurrounded = blackNeighbors >= 6;
    }

    // Determinar vencedor
    if (whiteQueenSurrounded && blackQueenSurrounded) {
      // Empate - ambas cercadas (quem fez o movimento perde)
      const winner = gameState.currentPlayer === 'WHITE' ? 'BLACK' : 'WHITE';
      handleWin(winner);
      return true;
    } else if (whiteQueenSurrounded) {
      // Rainha branca cercada - preto vence
      handleWin('BLACK');
      return true;
    } else if (blackQueenSurrounded) {
      // Rainha preta cercada - branco vence
      handleWin('WHITE');
      return true;
    }

    return false;
  }

  function endTurn() {
    // PRIMEIRO: Verificar condição de vitória
    const gameEnded = checkVictoryCondition();
    if (gameEnded) return; // Se o jogo acabou, não continuar

    gameState.turnNumber++;
    gameState.currentPlayer = gameState.currentPlayer === 'WHITE' ? 'BLACK' : 'WHITE';
    gameState.lastMoveTime = Date.now();

    // Check Timer reset
    clearInterval(gameTimer);
    startTimer();

    broadcastState();

    // If bot game is active and it's bot's turn, schedule bot move
    if (botGame.active && !gameState.winner) {
      const isBotTurn =
        (botGame.humanColor === 'white' && gameState.currentPlayer === 'BLACK') ||
        (botGame.humanColor === 'black' && gameState.currentPlayer === 'WHITE');

      if (isBotTurn) {
        scheduleBotMove();
      }
    }
  }

  socket.on('forfeit_game', () => {
    // Security: Rate limiting
    if (!checkSocketRateLimit(socket.id)) {
      socket.emit('error', { message: 'Too many requests. Please slow down.' });
      return;
    }

    const pColor = players.white && players.white.id === socket.id ? 'WHITE' :
                   players.black && players.black.id === socket.id ? 'BLACK' : null;

    // Security: Validate player identity
    if (!pColor) {
      console.warn('Invalid forfeit attempt from non-player', socket.id);
      return;
    }

    // Security: Validate game is active
    if (gameState.winner) {
      console.warn('Forfeit attempt on finished game from', socket.id);
      return;
    }

    const winner = pColor === 'WHITE' ? 'BLACK' : 'WHITE';
    gameState.log.push(`${pColor} forfeited! ${winner} wins!`);

    handleWin(winner);
  });

  socket.on('disconnect', () => {
    // Security: Log disconnection for monitoring
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] Socket disconnected: ${socket.id}`);

    // If bot game is active and human disconnects, cleanup
    if (botGame.active && botGame.humanPlayerId === socket.id) {
      console.log(`[${timestamp}] Bot game terminated - human player disconnected`);
      clearTimeout(botGame.botTimer);
      clearTimeout(botGame.botResponseTimer);
      botGame.active = false;
      botGame.humanPlayerId = null;
      botGame.humanNickname = null;
      botGame.humanColor = null;
      botGame.botTimer = null;
      botGame.botResponseTimer = null;
      gameState.log.push('Human player disconnected. Bot game ended.');
      // Reset to empty state
      players.white = null;
      players.black = null;
      broadcastState();
      return;
    }

    // Handle dropouts
    if (players.white && players.white.id === socket.id) {
       console.log(`[${timestamp}] White player disconnected from active game`);
       gameState.log.push('White disconnected.');
       handleWin('BLACK'); // Default win
       players.white = null;
    } else if (players.black && players.black.id === socket.id) {
       console.log(`[${timestamp}] Black player disconnected from active game`);
       gameState.log.push('Black disconnected.');
       handleWin('WHITE');
       players.black = null;
    } else {
       // Remove from queue
       const wasInQueue = queue.some(u => u.id === socket.id);
       queue = queue.filter(u => u.id !== socket.id);
       if (wasInQueue) {
         console.log(`[${timestamp}] Player removed from queue`);
       }
    }

    // Security: Clean up rate limit tracking for disconnected socket
    socketRateLimits.delete(socket.id);

    broadcastState();
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Hive Server running on port ${PORT}`);
});