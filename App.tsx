import React, { useState, useEffect, useRef } from 'react';
import io, { Socket } from 'socket.io-client';
import { 
  GameState, PlayerColor, BugType, BoardMap, PlayerState, Piece, BoardCell
} from './game/types';
import { 
  getValidPlacements, getPieceMoves
} from './game/logic';
import { hexToString, stringToHex } from './game/utils';
import Board from './components/Board';
import { Play, RotateCcw, User, Clock, Trophy, Hexagon as HexIcon, Users, Unplug, BookOpen, X, Volume2, VolumeX } from 'lucide-react';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3000';

// --- Helper Components ---

const HexButton = ({ type, count, selected, onClick, disabled, label, isOpponent, playerColor }: any) => {
  // Determine piece color based on player
  const isWhitePlayer = playerColor === PlayerColor.WHITE;

  // Liquid glass effect with gradient backgrounds
  const pieceStyle = isWhitePlayer
    ? 'bg-gradient-to-b from-white via-slate-50 to-slate-200'
    : 'bg-gradient-to-b from-zinc-800 via-black to-zinc-900';

  const pieceBorder = isWhitePlayer ? 'border-stone-300' : 'border-stone-700';
  const pieceTextColor = isWhitePlayer ? 'text-black' : 'text-white';

  return (
    <div className={`relative flex flex-col items-center justify-center ${isOpponent ? 'scale-75 opacity-60' : 'hover:scale-105'} transition-all duration-200`}>
      <button
        onClick={onClick}
        disabled={disabled || count === 0}
        style={{
          clipPath: 'polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)',
          filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))'
        }}
        className={`
          w-16 h-14 flex items-center justify-center border relative overflow-hidden
          ${pieceStyle} ${pieceTextColor}
          ${selected
            ? 'border-white border-2 shadow-[0_0_15px_rgba(255,255,255,0.8)]'
            : pieceBorder}
          ${(disabled || count === 0) ? 'opacity-30 grayscale cursor-not-allowed' : 'cursor-pointer'}
        `}
      >
        {/* Glass shine effect */}
        <div
          className="absolute inset-0 bg-gradient-to-b from-white/40 via-white/10 to-transparent pointer-events-none"
          style={{ clipPath: 'polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)' }}
        />
        <span className="text-2xl z-10 filter drop-shadow-md relative">{label}</span>
      </button>

      <div className="absolute -bottom-1 bg-black px-1.5 rounded-full text-[10px] font-bold text-stone-400 border border-stone-700 z-20">
        x{count}
      </div>
    </div>
  );
};

const PlayerHand = ({ player, isActive, isBottom, selectedPiece, onSelect, playerColor }: { player: PlayerState, isActive: boolean, isBottom: boolean, selectedPiece: BugType | null, onSelect: (t: BugType) => void, playerColor: PlayerColor }) => {
  if (!player || !player.hand) return null;
  return (
    <div className={`flex gap-3 p-4 bg-transparent ${!isBottom ? 'flex-row-reverse' : ''}`}>
       {Object.entries(player.hand).map(([type, count]) => (
          <HexButton
            key={type}
            label={
              type === BugType.QUEEN ? '🐝' :
              type === BugType.ANT ? '🐜' :
              type === BugType.BEETLE ? '🪲' :
              type === BugType.GRASSHOPPER ? '🦗' : '🕷️'
            }
            count={count}
            selected={selectedPiece === type}
            onClick={() => onSelect(type as BugType)}
            disabled={!isBottom || !isActive}
            isOpponent={!isBottom}
            playerColor={playerColor}
          />
       ))}
    </div>
  );
};

// --- Main App ---

export default function App() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [view, setView] = useState<'LOBBY' | 'GAME'>('LOBBY');
  const [nickname, setNickname] = useState('');

  // Security: Client-side nickname sanitization (matches server validation)
  const sanitizeNickname = (value: string): string => {
    // Remove HTML tags and special characters
    let clean = value.replace(/[<>'"&]/g, '');
    // Allow only alphanumeric, spaces, hyphens, and underscores
    clean = clean.replace(/[^a-zA-Z0-9\s\-_]/g, '');
    // Limit to 20 characters
    clean = clean.substring(0, 20);
    return clean.trim();
  };

  // Local State mapped from Server
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [myColor, setMyColor] = useState<PlayerColor | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [queue, setQueue] = useState<string[]>([]);
  const [timeLeft, setTimeLeft] = useState(30);

  // Interaction State
  const [selectedHex, setSelectedHex] = useState<string | null>(null);
  const [selectedPiece, setSelectedPiece] = useState<BugType | null>(null);
  const [validMoves, setValidMoves] = useState<string[]>([]);
  const [opponentIsBot, setOpponentIsBot] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const s = io(SOCKET_URL);
    setSocket(s);

    s.on('connect', () => {
      setIsConnected(true);
    });

    s.on('state_update', (serverState: any) => {
      // Reconstruct Map from array
      const boardMap = new Map<string, BoardCell>();
      if (serverState.board && Array.isArray(serverState.board)) {
        serverState.board.forEach(([k, v]: [string, BoardCell]) => {
           boardMap.set(k, v);
        });
      }

      setGameState({
        ...serverState,
        board: boardMap,
        validMoves: [] // Reset local validity on state update
      });

      // Detect if opponent is bot
      if (serverState.players) {
        const whitePlayer = serverState.players[PlayerColor.WHITE];
        const blackPlayer = serverState.players[PlayerColor.BLACK];
        const isWhiteBot = whitePlayer?.isBot === true;
        const isBlackBot = blackPlayer?.isBot === true;
        setOpponentIsBot(isWhiteBot || isBlackBot);
      }

      setQueue(serverState.queue || []);
      setTimeLeft(serverState.timeLeft || 30);
    });

    return () => {
      s.disconnect();
    };
  }, []);

  // Determine my color based on nickname/id match
  useEffect(() => {
    if (gameState && socket) {
      if (gameState.players[PlayerColor.WHITE]?.nickname === nickname) {
        setMyColor(PlayerColor.WHITE);
        if(view === 'LOBBY') setView('GAME');
      } else if (gameState.players[PlayerColor.BLACK]?.nickname === nickname) {
        setMyColor(PlayerColor.BLACK);
        if(view === 'LOBBY') setView('GAME');
      } else {
        // Spectator
        setMyColor(null);
        // Only switch to game view if game is active
        if(gameState.players[PlayerColor.WHITE] && gameState.players[PlayerColor.BLACK] && view === 'LOBBY') {
           setView('GAME');
        }
      }
    }
  }, [gameState, socket, nickname]);

  // Local Timer tick for smoothness between server updates
  useEffect(() => {
    if(!gameState?.winner) {
      const i = setInterval(() => setTimeLeft(t => Math.max(0, t - 1)), 1000);
      return () => clearInterval(i);
    }
  }, [gameState?.winner]);

  // --- Game Logic Handling ---

  const isMyTurn = gameState?.currentPlayer === myColor && !gameState?.winner;

  const handleHexClick = (hexStr: string) => {
    if (!gameState || !isMyTurn || !socket) return;

    // 1. Placing a piece
    if (selectedPiece) {
      if (validMoves.includes(hexStr)) {
        // Emit Place Action
        const pieceToPlace: Piece = {
           id: `${myColor}-${selectedPiece}-${gameState.turnNumber}`,
           type: selectedPiece,
           color: myColor!
        };
        // We need hex coordinates for the server
        const hexObj = stringToHex(hexStr);
        
        socket.emit('game_action', {
           type: 'PLACE',
           piece: pieceToPlace,
           hex: hexStr,
           hexObj: hexObj
        });
        
        resetSelection();
      } else {
        resetSelection();
      }
      return;
    }

    // 2. Moving a piece
    if (selectedHex && validMoves.includes(hexStr)) {
        socket.emit('game_action', {
           type: 'MOVE',
           from: selectedHex,
           to: hexStr
        });
        resetSelection();
        return;
    }

    // 3. Selecting a piece on board
    if (gameState.board.has(hexStr)) {
       const cell = gameState.board.get(hexStr)!;
       const topPiece = cell.stack[cell.stack.length - 1];
       
       if (topPiece.color === myColor) {
          // Check Queen Rule locally
          const hand = gameState.players[myColor].hand;
          const queenPlayed = hand[BugType.QUEEN] === 0;
          const playerTurnIdx = Math.ceil(gameState.turnNumber / 2);

          if (!queenPlayed && playerTurnIdx === 4) {
             // Forced to play queen, cannot move
             // UI feedback handled in render
             return;
          }
          if (!queenPlayed) return; // Cannot move until queen down

          const moves = getPieceMoves(gameState, hexStr);
          setSelectedHex(hexStr);
          setSelectedPiece(null);
          setValidMoves(moves);
       }
    } else {
      resetSelection();
    }
  };

  const handleHandClick = (type: BugType) => {
    if (!gameState || !isMyTurn) return;

    // Queen Rule
    const hand = gameState.players[myColor!].hand;
    const queenPlayed = hand[BugType.QUEEN] === 0;
    const playerTurnIdx = Math.ceil(gameState.turnNumber / 2);

    if (playerTurnIdx === 4 && !queenPlayed && type !== BugType.QUEEN) {
       // Must select Queen
       return;
    }

    const moves = getValidPlacements(gameState);
    setSelectedPiece(type);
    setSelectedHex(null);
    setValidMoves(moves);
  };

  const resetSelection = () => {
    setSelectedHex(null);
    setSelectedPiece(null);
    setValidMoves([]);
  };

  // REMOVIDO: Verificação de vitória agora é feita 100% no servidor
  // O servidor verifica automaticamente após cada movimento via checkVictoryCondition()

  // Audio management
  useEffect(() => {
    if (!audioRef.current) {
      // Cria elemento de audio com música lo-fi do YouTube (via proxy ou link direto)
      // Usando faixa de domínio público / Creative Commons
      const audio = new Audio('https://assets.mixkit.co/music/preview/mixkit-tech-house-vibes-130.mp3'); // Lo-fi alternativa
      audio.loop = true;
      audio.volume = 0.3; // Volume baixo
      audioRef.current = audio;
    }

    if (!isMuted && view === 'GAME') {
      audioRef.current.play().catch(() => {
        // Browser pode bloquear autoplay, usuário precisa interagir primeiro
      });
    } else {
      audioRef.current.pause();
    }

    return () => {
      audioRef.current?.pause();
    };
  }, [isMuted, view]);

  // Toggle mute
  const toggleMute = () => {
    setIsMuted(!isMuted);
  };

  // --- Render ---

  if (view === 'LOBBY') {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-4">
        <div className="bg-stone-900/80 backdrop-blur-md p-10 rounded-3xl shadow-2xl max-w-md w-full border border-stone-800">
          <div className="flex justify-center mb-8">
            <HexIcon size={80} className="text-stone-100 drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]" />
          </div>
          <h1 className="text-5xl font-black text-center text-white mb-2 tracking-tighter">HIVE</h1>
          <p className="text-center text-stone-500 mb-10 tracking-widest uppercase text-xs font-bold">Online Multiplayer</p>
          
          {!isConnected && (
            <div className="bg-red-900/30 text-red-400 p-4 rounded-xl text-center mb-6 border border-red-900">
               <Unplug className="inline mb-1 mr-2" size={16}/> 
               Connecting to server...
            </div>
          )}

          <div className="space-y-6">
            <input
              type="text"
              value={nickname}
              onChange={(e) => setNickname(sanitizeNickname(e.target.value))}
              className="w-full bg-black border border-stone-700 rounded-xl p-4 text-white focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none transition-all placeholder:text-stone-700 font-bold text-center uppercase tracking-widest"
              placeholder="ENTER CALLSIGN"
              maxLength={20}
            />
            <button
              onClick={() => {
                if(nickname && socket) {
                  socket.emit('join_game', nickname);
                }
              }}
              disabled={!nickname || !isConnected}
              className="w-full bg-stone-100 hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed text-black font-black py-4 rounded-xl transition-all hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(255,255,255,0.1)]"
            >
              <Play size={24} strokeWidth={3} />
              JOIN QUEUE
            </button>

            {queue.length === 0 && (
              <button
                onClick={() => {
                  if(nickname && socket) {
                    socket.emit('join_game_bot', nickname);
                  }
                }}
                disabled={!nickname || !isConnected}
                className="w-full bg-amber-800 hover:bg-amber-700 disabled:opacity-30 disabled:cursor-not-allowed text-amber-100 font-black py-4 rounded-xl transition-all hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(180,83,9,0.3)] border border-amber-900"
              >
                <Users size={24} strokeWidth={3} />
                PLAY vs BOT
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (!gameState) return <div className="h-screen bg-stone-900 flex items-center justify-center text-stone-500">Loading Game State...</div>;

  const whitePlayer = gameState.players[PlayerColor.WHITE];
  const blackPlayer = gameState.players[PlayerColor.BLACK];

  return (
    <div className="relative h-screen w-screen bg-stone-900 overflow-hidden font-sans select-none text-stone-200">
      
      {/* 1. Board Layer */}
      <div className="absolute inset-0 z-0">
        <Board 
           gameState={{...gameState, selectedHex, selectedPieceFromHand: selectedPiece, validMoves}} 
           onHexClick={handleHexClick} 
        />
      </div>

      {/* 2. Top HUD: Opponent */}
      <div className="absolute top-0 left-0 right-0 p-4 z-10 pointer-events-none flex flex-col items-center gap-4">
          <div className="flex items-center gap-8 text-stone-300 text-sm font-bold px-8 py-3 pointer-events-auto">

             {/* Black Player (Left side of HUD) */}
             <div className="flex items-center gap-3">
                 <div className={`w-3 h-3 rounded-full ${gameState.currentPlayer === PlayerColor.BLACK ? 'bg-amber-500 animate-pulse shadow-[0_0_8px_rgba(245,158,11,0.8)]' : 'bg-stone-700'}`} />
                 <span className={`${gameState.currentPlayer === PlayerColor.BLACK ? 'text-white font-extrabold' : ''} ${myColor === PlayerColor.BLACK ? 'text-amber-400' : ''}`}>
                    {blackPlayer ? blackPlayer.nickname : 'Waiting...'}
                    {blackPlayer?.wins > 0 && <span className="ml-2 text-xs bg-stone-800/80 px-2 py-0.5 rounded text-amber-400">🏆 {blackPlayer.wins}</span>}
                    {blackPlayer?.isBot && <span className="ml-2 text-xs bg-purple-900/30 px-2 py-0.5 rounded text-purple-300 border border-purple-700/30">BOT</span>}
                 </span>
             </div>

             {/* Timer */}
             <div className={`font-mono text-3xl w-16 text-center font-bold ${timeLeft < 10 ? 'text-red-400 animate-pulse' : 'text-stone-100'}`}>
                {timeLeft}
             </div>

             {/* White Player */}
             <div className="flex items-center gap-3">
                 <span className={`${gameState.currentPlayer === PlayerColor.WHITE ? 'text-white font-extrabold' : ''} ${myColor === PlayerColor.WHITE ? 'text-amber-400' : ''}`}>
                    {whitePlayer ? whitePlayer.nickname : 'Waiting...'}
                    {whitePlayer?.wins > 0 && <span className="ml-2 text-xs bg-stone-800/80 px-2 py-0.5 rounded text-amber-400">🏆 {whitePlayer.wins}</span>}
                    {whitePlayer?.isBot && <span className="ml-2 text-xs bg-purple-900/30 px-2 py-0.5 rounded text-purple-300 border border-purple-700/30">BOT</span>}
                 </span>
                 <div className={`w-3 h-3 rounded-full ${gameState.currentPlayer === PlayerColor.WHITE ? 'bg-amber-500 animate-pulse shadow-[0_0_8px_rgba(245,158,11,0.8)]' : 'bg-stone-700'}`} />
             </div>
          </div>

          {/* Opponent Hand Display */}
          <div className="pointer-events-auto">
             {myColor === PlayerColor.WHITE && blackPlayer && (
                 <PlayerHand player={blackPlayer} isActive={gameState.currentPlayer === PlayerColor.BLACK} isBottom={false} selectedPiece={null} onSelect={()=>{}} playerColor={PlayerColor.BLACK} />
             )}
             {myColor === PlayerColor.BLACK && whitePlayer && (
                 <PlayerHand player={whitePlayer} isActive={gameState.currentPlayer === PlayerColor.WHITE} isBottom={false} selectedPiece={null} onSelect={()=>{}} playerColor={PlayerColor.WHITE} />
             )}
             {/* Spectator View */}
             {!myColor && whitePlayer && (
                 <div className="text-xs text-stone-600">Spectating Mode</div>
             )}
          </div>
      </div>

      {/* Rules Button */}
      <button
        onClick={() => setShowRules(true)}
        className="absolute top-6 left-6 z-20 pointer-events-auto bg-stone-900/70 hover:bg-stone-800/90 backdrop-blur-md p-2 rounded-lg transition-all text-stone-400 hover:text-stone-200"
        title="Game Rules"
      >
        <BookOpen size={20} />
      </button>

      {/* Mute Button */}
      <button
        onClick={toggleMute}
        className="absolute top-6 left-20 z-20 pointer-events-auto bg-stone-900/70 hover:bg-stone-800/90 backdrop-blur-md p-2 rounded-lg transition-all text-stone-400 hover:text-stone-200"
        title={isMuted ? "Unmute Music" : "Mute Music"}
      >
        {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
      </button>

      {/* 3. Queue (Top Right) */}
      <div className="absolute top-6 right-6 z-20 pointer-events-auto hidden md:block">
          <div className="bg-stone-900/90 backdrop-blur-md rounded-xl shadow-xl p-4 min-w-[200px]">
             <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-stone-500 mb-3 pb-2">
                <Users size={12} /> King of the Hill Queue
             </div>
             <div className="flex flex-col gap-2">
                 {queue.length > 0 ? queue.map((p, i) => (
                    <div key={i} className="flex items-center gap-3 text-sm text-stone-300">
                       <span className="text-stone-600 font-mono text-xs">0{i+1}</span>
                       <span>{p}</span>
                       {p === nickname && <span className="w-1.5 h-1.5 bg-green-500 rounded-full ml-auto"/>}
                    </div>
                 )) : (
                    <span className="text-xs text-stone-700 italic text-center py-2">Queue empty</span>
                 )}
             </div>
          </div>
      </div>

      {/* 4. Bottom HUD: My Hand */}
      <div className="absolute bottom-0 left-0 right-0 p-8 z-10 pointer-events-none flex flex-col items-center justify-end">
          
          {isMyTurn && Math.ceil(gameState.turnNumber / 2) === 4 && gameState.players[myColor!].hand[BugType.QUEEN] > 0 && (
              <div className="mb-4 bg-amber-900/90 text-amber-100 border border-amber-700 px-6 py-2 rounded-lg font-bold shadow-lg animate-bounce pointer-events-auto">
                 ⚠️ Must place Queen Bee now!
              </div>
          )}

          <div className="pointer-events-auto transform transition-transform hover:-translate-y-2">
            {myColor && gameState.players[myColor] && (
               <PlayerHand
                 player={gameState.players[myColor]}
                 isActive={isMyTurn}
                 isBottom={true}
                 selectedPiece={selectedPiece}
                 onSelect={handleHandClick}
                 playerColor={myColor}
               />
            )}
          </div>

          {myColor && !gameState.winner && (
            <button
              onClick={() => {
                if (window.confirm('Tem certeza que deseja desistir?')) {
                  socket?.emit('forfeit_game');
                }
              }}
              className="mt-4 bg-red-900 hover:bg-red-800 text-red-100 border border-red-700 px-6 py-2 rounded-lg font-bold text-sm transition-all pointer-events-auto hover:scale-105 active:scale-95"
            >
              Desistir
            </button>
          )}
      </div>

      {/* 5. Logs */}
      <div className="absolute bottom-6 right-6 z-20 w-80 max-h-48 flex flex-col pointer-events-auto">
         <div className="bg-stone-900/90 backdrop-blur-md rounded-2xl shadow-2xl overflow-hidden flex flex-col">
            <div className="p-3 bg-black/20 flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-widest text-stone-500">System Log</span>
                <span className="text-[10px] font-mono text-stone-600">T{gameState.turnNumber}</span>
            </div>
            <div className="overflow-y-auto p-3 space-y-1.5 scrollbar-thin scrollbar-thumb-stone-700 scrollbar-track-transparent h-32 flex flex-col-reverse">
               {[...gameState.log].reverse().map((entry, i) => (
                 <div key={i} className="text-xs font-mono text-stone-400 pl-2 py-0.5">
                   {entry}
                 </div>
               ))}
            </div>
         </div>
      </div>

      {/* Rules Modal */}
      {showRules && (
        <div className="absolute inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center z-50 pointer-events-auto">
          <div className="bg-stone-900 rounded-2xl p-8 max-w-2xl max-h-[80vh] overflow-y-auto m-4 relative">
            <button
              onClick={() => setShowRules(false)}
              className="absolute top-4 right-4 text-stone-400 hover:text-white transition-colors"
            >
              <X size={24} />
            </button>

            <h2 className="text-3xl font-black text-white mb-6 flex items-center gap-3">
              <HexIcon className="text-amber-500" size={32} />
              Hive - Regras do Jogo
            </h2>

            <div className="space-y-4 text-stone-300">
              <div>
                <h3 className="text-xl font-bold text-amber-500 mb-2">🎯 Objetivo</h3>
                <p>Cerque completamente a Rainha (🐝) adversária com peças em todos os 6 lados.</p>
              </div>

              <div>
                <h3 className="text-xl font-bold text-amber-500 mb-2">📦 Peças Iniciais</h3>
                <ul className="list-disc list-inside space-y-1 ml-4">
                  <li>1x Rainha (🐝)</li>
                  <li>3x Formiga (🐜)</li>
                  <li>2x Aranha (🕷️)</li>
                  <li>2x Besouro (🪲)</li>
                  <li>3x Gafanhoto (🦗)</li>
                </ul>
              </div>

              <div>
                <h3 className="text-xl font-bold text-amber-500 mb-2">🔄 Como Jogar</h3>
                <ul className="list-disc list-inside space-y-1 ml-4">
                  <li><strong>Turno 1:</strong> Brancas colocam a primeira peça</li>
                  <li><strong>Turnos seguintes:</strong> Coloque uma peça OU mova uma peça</li>
                  <li><strong>Rainha obrigatória:</strong> Deve ser colocada até o seu 4º turno</li>
                  <li><strong>Movimento:</strong> Só pode mover após colocar a Rainha</li>
                  <li><strong>Regra da Colmeia:</strong> Todas as peças devem permanecer conectadas</li>
                </ul>
              </div>

              <div>
                <h3 className="text-xl font-bold text-amber-500 mb-2">🐛 Movimentos das Peças</h3>
                <div className="space-y-2 ml-4">
                  <p><strong>🐝 Rainha:</strong> Move 1 espaço em qualquer direção (deslizando)</p>
                  <p><strong>🐜 Formiga:</strong> Move distância ilimitada deslizando ao redor da colmeia</p>
                  <p><strong>🕷️ Aranha:</strong> Move exatamente 3 espaços deslizando</p>
                  <p><strong>🪲 Besouro:</strong> Move 1 espaço, pode escalar sobre outras peças</p>
                  <p><strong>🦗 Gafanhoto:</strong> Pula em linha reta sobre 1 ou mais peças</p>
                </div>
              </div>

              <div>
                <h3 className="text-xl font-bold text-amber-500 mb-2">⚡ King of the Hill</h3>
                <p>Vencedor permanece jogando. Perdedor volta para a fila. Primeiro da fila desafia o campeão!</p>
              </div>
            </div>

            <button
              onClick={() => setShowRules(false)}
              className="mt-6 w-full bg-amber-600 hover:bg-amber-700 text-white font-bold py-3 rounded-lg transition-all"
            >
              Começar a Jogar
            </button>
          </div>
        </div>
      )}

      {/* 6. Game Over */}
      {gameState.winner && (
        <div className="absolute inset-0 bg-black/90 backdrop-blur-md flex flex-col items-center justify-center z-50 animate-in fade-in duration-500">
           <Trophy size={96} className="text-amber-500 mb-6 drop-shadow-[0_0_30px_rgba(245,158,11,0.4)] animate-pulse" />
           <h2 className="text-6xl font-black text-white mb-2 tracking-tighter">
             {gameState.winner === 'DRAW' ? 'DRAW' : `${gameState.winner} WINS`}
           </h2>
           <p className="text-stone-400 mb-8 text-xl font-light tracking-wide">
              {gameState.winner === myColor ? "You remain the King!" : "Back to the queue..."}
           </p>
           <div className="text-stone-600 animate-pulse">Next round starts automatically...</div>
        </div>
      )}
    </div>
  );
}