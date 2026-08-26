import { fileURLToPath } from 'node:url';
import { createGame, applyMove, status, render, type GameState } from './game.ts';

export function play(moves: number[]): { state: GameState; outcome: string } {
  let state = createGame();
  for (const m of moves) {
    state = applyMove(state, m);
    if (status(state).kind !== 'in-progress') break;
  }
  const s = status(state);
  const outcome =
    s.kind === 'win' ? `Winner: ${s.winner}` : s.kind === 'draw' ? 'Draw' : 'In progress';
  return { state, outcome };
}

function main(argv: string[]): void {
  const { state, outcome } = play(argv.map((a) => Number.parseInt(a, 10)));
  console.log(render(state));
  console.log(outcome);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2));
}
