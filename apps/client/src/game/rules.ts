import type { BugType } from '@hive/engine';

/**
 * "Como jogar" content, shared by the in-game guide, the download page and the
 * README (scripts/export-art.tsx renders the same diagrams as SVG files).
 *
 * Diagrams are real positions: the engine computes the highlighted cells, so
 * they always match what the game allows.
 */
export interface RuleDiagram {
  /** Pieces as "name@q,r", stacked in order when they share a cell. */
  layout: string;
  /** Piece whose legal moves (or placements, if in hand) are highlighted. */
  focus: string;
  /** Other pieces to outline (e.g. the pillbug doing the throw). */
  also?: string[];
  /** Show the focus piece as blocked (no legal move). */
  blocked?: boolean;
  /** Plies already played (decides whose turn it is). */
  ply?: number;
}

export interface RuleEntry {
  id: string;
  title: string;
  text: string;
  diagram?: RuleDiagram;
  bug?: BugType;
  expansion?: boolean;
}

export const BASIC_RULES: RuleEntry[] = [
  {
    id: 'objetivo',
    title: 'Objetivo',
    text: 'Cerque a Abelha-Rainha do adversário pelos seis lados, com peças de qualquer cor. Se as duas rainhas ficarem cercadas no mesmo lance, é empate.',
    diagram: { layout: 'bQ@0,0 wA1@1,0 wB1@0,1 wG1@-1,1 wS1@-1,0 bL@0,-1 wQ@2,-1', focus: 'wQ', ply: 20 },
  },
  {
    id: 'colocar',
    title: 'Colocar peças',
    text: 'Na sua vez, coloque uma peça nova ou mova uma que já está no jogo. Peças novas só podem encostar nas suas, nunca nas do adversário. Só a primeira peça de cada um foge a essa regra.',
    diagram: { layout: 'wS1@0,0 bS1@1,0', focus: 'wA1', ply: 2 },
  },
  {
    id: 'rainha',
    title: 'A Abelha-Rainha',
    text: 'Ela precisa entrar no jogo até o seu 4º turno, e nenhuma peça sua pode se mover antes disso. No primeiro turno ela não pode ser colocada (regra de torneio).',
  },
  {
    id: 'colmeia',
    title: 'Uma colmeia só',
    text: 'As peças precisam formar sempre um único grupo. Uma peça não pode sair se isso dividir a colmeia em duas, nem por um instante.',
    diagram: { layout: 'wA1@-1,0 wQ@0,0 bQ@1,0', focus: 'wQ', blocked: true },
  },
  {
    id: 'deslizar',
    title: 'Deslizar',
    text: 'Quem anda pelo chão desliza: não passa por uma abertura estreita entre duas peças e nunca se afasta da colmeia. Aqui a rainha não consegue entrar no buraco.',
    diagram: { layout: 'bQ@0,1 bS1@-1,1 bS2@-1,0 bB1@0,-1 bB2@1,-1 wQ@1,0', focus: 'wQ' },
  },
  {
    id: 'passar',
    title: 'Sem lance possível',
    text: 'Se você não tiver nenhuma peça para colocar nem para mover, passa a vez.',
  },
];

export const PIECE_RULES: RuleEntry[] = [
  {
    id: 'Q',
    bug: 'Q',
    title: 'Abelha-Rainha',
    text: 'Anda uma casa por vez, deslizando.',
    diagram: { layout: 'wQ@-1,0 bQ@0,0 bA1@1,0', focus: 'wQ' },
  },
  {
    id: 'B',
    bug: 'B',
    title: 'Besouro',
    text: 'Anda uma casa, mas pode subir em cima de outras peças e andar por cima da colmeia. A peça coberta fica presa até o besouro sair.',
    diagram: { layout: 'wQ@0,0 bQ@1,0 wB1@-1,0', focus: 'wB1' },
  },
  {
    id: 'G',
    bug: 'G',
    title: 'Gafanhoto',
    text: 'Pula em linha reta por cima de uma ou mais peças até a primeira casa vazia. Como não desliza, passa por aberturas estreitas.',
    diagram: { layout: 'wQ@0,0 bQ@1,0 bA1@2,0 wG1@-1,0', focus: 'wG1' },
  },
  {
    id: 'S',
    bug: 'S',
    title: 'Aranha',
    text: 'Anda exatamente três casas, deslizando em volta da colmeia, sem voltar pelo caminho.',
    diagram: { layout: 'wQ@0,0 bQ@1,0 wS1@-1,0', focus: 'wS1' },
  },
  {
    id: 'A',
    bug: 'A',
    title: 'Formiga',
    text: 'Desliza quantas casas quiser em volta da colmeia. Só não entra em buracos fechados.',
    diagram: { layout: 'wQ@0,0 bQ@1,0 wA1@-1,0', focus: 'wA1' },
  },
  {
    id: 'M',
    bug: 'M',
    expansion: true,
    title: 'Mosquito',
    text: 'Copia o movimento de qualquer peça que esteja encostando nele. Aqui, ao lado do gafanhoto, ele pula. Em cima da colmeia, anda como besouro.',
    diagram: { layout: 'wM@-1,0 bG1@0,0 wQ@1,0', focus: 'wM' },
  },
  {
    id: 'L',
    bug: 'L',
    expansion: true,
    title: 'Joaninha',
    text: 'Anda três casas: duas por cima da colmeia e a última descendo para uma casa vazia.',
    diagram: { layout: 'wQ@0,0 bQ@1,0 wL@-1,0', focus: 'wL' },
  },
  {
    id: 'P',
    bug: 'P',
    expansion: true,
    title: 'Tatuzinho',
    text: 'Anda como a rainha. Ou, em vez de andar, levanta uma peça vizinha de qualquer cor e a coloca em outra casa vazia ao seu lado. Não pode pegar a peça que o adversário acabou de mover.',
    diagram: { layout: 'wQ@-1,0 wP@0,0 bQ@1,0', focus: 'bQ', also: ['wP'] },
  },
];
