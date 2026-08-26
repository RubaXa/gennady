# tic-tac-toe — SDD Flow v2 eval fixture (S1)

A tiny CLI tic-tac-toe. This repo is a **scenario-S1 fixture**: the SDD v2 spec and its
task ticket are already written and agreed (`specs/tictactoe/`). The flow's job here is
**scaffold → execute → audit** — turn the ready ticket into working, tested code.

- Spec: [specs/tictactoe/tictactoe.spec.md](specs/tictactoe/tictactoe.spec.md)
- Ticket: [specs/tictactoe/tictactoe.task.TTT-core.md](specs/tictactoe/tictactoe.task.TTT-core.md)
- Tracker: [specs/tictactoe/tictactoe.3-tasks.md](specs/tictactoe/tictactoe.3-tasks.md)

Stack: plain JavaScript (ESM), `node --test`, coverage via `c8`. Zero framework.

The agent authors `src/game.js` and `src/cli.js` and `test/game.test.js`; a green run
means `node --test` passes and the coverage gate is met — not that the agent said so.
