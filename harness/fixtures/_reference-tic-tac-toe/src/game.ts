export type Player = 'X' | 'O';
export type Cell = Player | null;
export type GameState = { board: readonly Cell[]; turn: Player };
export type Status = { kind: 'in-progress' } | { kind: 'win'; winner: Player } | { kind: 'draw' };

const LINES: readonly (readonly [number, number, number])[] = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

export function createGame(): GameState {
  return { board: Array(9).fill(null), turn: 'X' };
}

export function applyMove(state: GameState, cell: number): GameState {
  if (!Number.isInteger(cell) || cell < 0 || cell > 8) {
    throw new RangeError(`cell ${cell} is out of range 0-8`);
  }
  if (state.board[cell] !== null) {
    throw new Error(`cell ${cell} is occupied`);
  }
  const board = state.board.slice();
  board[cell] = state.turn;
  return { board, turn: state.turn === 'X' ? 'O' : 'X' };
}

export function status(state: GameState): Status {
  for (const [a, b, c] of LINES) {
    const mark = state.board[a];
    if (mark && mark === state.board[b] && mark === state.board[c]) {
      return { kind: 'win', winner: mark };
    }
  }
  return state.board.every((c) => c !== null) ? { kind: 'draw' } : { kind: 'in-progress' };
}

export function render(state: GameState): string {
  const rows: string[] = [];
  for (let r = 0; r < 3; r++) {
    const cells = state.board.slice(r * 3, r * 3 + 3).map((c) => c ?? '.');
    rows.push(cells.join(' | '));
  }
  return rows.join('\n---------\n');
}
