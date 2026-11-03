// @file: Positive and adversarial qualification of bounded exit-echo CLI proof; no model or shell execution.
// @spec: AI-SKILLS
// @consumers: brownfield invocation measurement and offline reevaluation

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  brownfieldProposalInvocationProven,
  brownfieldConfirmationAccepted,
  registry,
} from '../brownfield-benchmark.ts';
import {
  brownfieldCommandInvocation,
  type BrownfieldCommandEvent,
} from '../brownfield-command-proof.ts';

const lint = `npx --no-install gennady lint --spec=${registry.module} ${registry.source}`;
const proposal = `npx --no-install gennady sdd-log ${registry.module} decision --payload-file .claude/tmp/lint-proposal.json`;
/** @purpose Supply one complete host-SDK fixture per call, retaining event/capture identity and output consistency. */
function fixture(suffix = '; echo EXIT:$?') {
  const events: BrownfieldCommandEvent[] = [lint, proposal].map((command, i) => ({
    i,
    tool: 'bash',
    status: 'completed',
    exitCode: 0,
    sessionId: 'session',
    messageId: `session:message-${i}`,
    callId: `call-${i}`,
    startedAt: 100 + i * 100,
    finishedAt: 150 + i * 100,
    command: command + suffix,
  }));
  const capture = {
    complete: true,
    messages: events.map((event, i) => ({
      info: { id: `message-${i}`, sessionID: 'session', role: 'assistant' },
      parts: [
        {
          type: 'tool',
          tool: 'bash',
          callID: event.callId,
          messageID: `message-${i}`,
          sessionID: 'session',
          state: {
            status: 'completed',
            input: { command: event.command },
            time: { start: event.startedAt, end: event.finishedAt },
            output: `actual CLI diagnostic\nEXIT:${i === 0 ? 1 : 0}\n`,
            metadata: {
              exit: 0,
              truncated: false,
              output: `actual CLI diagnostic\nEXIT:${i === 0 ? 1 : 0}\n`,
            },
          },
        },
      ],
    })),
  };
  return { events, capture };
}
/** @purpose Change both SDK output representations so a rejection tests content, not incidental disagreement. */
function output(f: ReturnType<typeof fixture>, index: number, text: string) {
  const state = f.capture.messages[index]!.parts[0]!.state;
  state.output = text;
  state.metadata.output = text;
}

test('quoted and unquoted echo wrappers recover actual lint1/proposal0, including mixed bare commands', () => {
  for (const suffix of ['; echo EXIT:$?', '; echo "EXIT:$?"', ';\techo\t"EXIT:$?"\t']) {
    const f = fixture(suffix);
    assert.equal(brownfieldProposalInvocationProven(f.events, f.capture), true);
    assert.equal(brownfieldCommandInvocation(f.events[0]!, f.capture)?.exitCode, 1);
    output(f, 0, 'actual CLI diagnostic\r\nEXIT:1\r\n\r\n');
    assert.equal(brownfieldProposalInvocationProven(f.events, f.capture), true);
    const mixed = fixture(suffix);
    mixed.events[0]!.command = lint;
    mixed.events[0]!.exitCode = 1;
    assert.equal(brownfieldProposalInvocationProven(mixed.events, mixed.capture), true);
  }
  const bare = [
    { i: 0, tool: 'bash', status: 'completed', exitCode: 1, command: lint },
    { i: 1, tool: 'bash', status: 'completed', exitCode: 0, command: proposal },
  ];
  assert.equal(brownfieldProposalInvocationProven(bare), true);
});

test('wrapper proof requires complete unique matching SDK identity, command, timestamps and tool exit', () => {
  const changes: Array<(f: ReturnType<typeof fixture>) => void> = [
    (f) => {
      f.capture.complete = false;
    },
    (f) => {
      f.capture.messages = [];
    },
    (f) => {
      f.events[1]!.callId = 'foreign';
    },
    (f) => {
      f.events[1]!.messageId = 'session:foreign';
    },
    (f) => {
      f.events[1]!.sessionId = 'foreign';
    },
    (f) => {
      f.events[1]!.startedAt = 201;
    },
    (f) => {
      f.events[1]!.finishedAt = 251;
    },
    (f) => {
      f.events[1]!.startedAt = undefined;
    },
    (f) => {
      f.events[1]!.status = 'error';
    },
    (f) => {
      f.events[1]!.exitCode = 1;
    },
    (f) => {
      f.events[1]!.exitCode = undefined;
    },
    (f) => {
      f.capture.messages[1]!.info.role = 'user';
    },
    (f) => {
      f.capture.messages[1]!.parts[0]!.tool = 'read';
    },
    (f) => {
      f.capture.messages[1]!.parts[0]!.messageID = 'foreign';
    },
    (f) => {
      f.capture.messages[1]!.parts[0]!.sessionID = 'foreign';
    },
    (f) => {
      f.capture.messages[1]!.parts[0]!.state.metadata.truncated = true;
    },
    (f) => {
      f.capture.messages[1]!.parts[0]!.state.metadata.output = 'different';
    },
    (f) => {
      f.capture.messages[1]!.parts[0]!.state.metadata.exit = 1;
    },
    (f) => {
      f.capture.messages[1]!.parts[0]!.state.status = 'running';
    },
    (f) => {
      f.capture.messages[1]!.parts[0]!.state.input.command = proposal;
    },
    (f) => {
      f.capture.messages.push(structuredClone(f.capture.messages[1]!));
    },
    (f) => {
      const duplicate = structuredClone(f.capture.messages[1]!);
      duplicate.info.role = 'user';
      f.capture.messages.push(duplicate);
    },
    (f) => {
      f.events[1]!.i = Number.NaN;
    },
  ];
  changes.forEach((change, i) => {
    const f = fixture();
    change(f);
    assert.equal(
      brownfieldProposalInvocationProven(f.events, f.capture),
      false,
      `adversarial identity ${i}`
    );
  });
  const f = fixture();
  assert.equal(brownfieldProposalInvocationProven(f.events), false);
});

test('forged, missing, clipped, multiple, rewritten and wrong exit markers cannot prove a successful proposal', () => {
  for (const text of [
    '',
    'agent says it passed',
    'EXIT:',
    'EXIT:0',
    'EXIT:00\n',
    'EXIT:-0\n',
    'EXIT:256\n',
    'EXIT:0 \n',
    'EXIT:1\n',
    'EXIT:0\nmore output\n',
    'EXIT:1\nEXIT:0\n',
    'diagnostic EXIT:0\nEXIT:0\n',
    'diagnostic\rEXIT:0\n',
    'diagnostic\n\u001b[2KEXIT:0\n',
    'x'.repeat(65536) + '\nEXIT:0\n',
  ]) {
    const f = fixture();
    output(f, 1, text);
    assert.equal(
      brownfieldProposalInvocationProven(f.events, f.capture),
      false,
      JSON.stringify(text.slice(-60))
    );
  }
  const f = fixture();
  output(f, 0, 'EXIT:0\n');
  assert.equal(brownfieldProposalInvocationProven(f.events, f.capture), false);
});

test('only the exact harmless suffix and scoped commands are accepted, never shell composition or side effects', () => {
  for (const bad of [
    `${proposal}; echo EXIT:0`,
    `${proposal}; echo 'EXIT:$?'`,
    `${proposal}; printf 'EXIT:%s' $?`,
    `${proposal} && echo EXIT:$?`,
    `${proposal}; true; echo EXIT:$?`,
    `${proposal}; echo EXIT:$?; true`,
    `${proposal} >out; echo EXIT:$?`,
    `${proposal} | cat; echo EXIT:$?`,
    `${proposal}; echo EXIT:$? # comment`,
    `${proposal}\n; echo EXIT:$?`,
    `${proposal}; echo "EXIT:\\$?"`,
    `echo ${proposal}; echo EXIT:$?`,
    `eval ${proposal}; echo EXIT:$?`,
    `${proposal.replace('npx ', 'npx\u00a0')}; echo EXIT:$?`,
  ]) {
    const f = fixture();
    f.events[1]!.command = bad;
    f.capture.messages[1]!.parts[0]!.state.input.command = bad;
    assert.equal(brownfieldProposalInvocationProven(f.events, f.capture), false, bad);
  }
  for (const bad of [
    `${lint} --autofix`,
    `${lint} --autofix=true`,
    `${lint} other.ts`,
    `npx --no-install gennady lint --spec=other.spec.md ${registry.source}`,
  ]) {
    const f = fixture();
    f.events[0]!.command = bad + '; echo EXIT:$?';
    f.capture.messages[0]!.parts[0]!.state.input.command = f.events[0]!.command;
    assert.equal(brownfieldProposalInvocationProven(f.events, f.capture), false, bad);
  }
  const edit = fixture();
  edit.events.push({ i: 2, tool: 'edit', arg: registry.module });
  assert.equal(brownfieldProposalInvocationProven(edit.events, edit.capture), false);
  const verdict = fixture();
  verdict.events.push({
    i: 2,
    tool: 'bash',
    command: `gennady sdd-log ${registry.module} deviation-verdict REG-DL-1 accepted`,
  });
  assert.equal(brownfieldProposalInvocationProven(verdict.events, verdict.capture), false);
});

test('overlap and reversed order remain unknown; invocation evidence grants neither persistence nor acceptance', () => {
  const f = fixture();
  f.events[1]!.startedAt = 149;
  f.capture.messages[1]!.parts[0]!.state.time.start = 149;
  assert.equal(brownfieldProposalInvocationProven(f.events, f.capture), false);
  const reversed = fixture();
  reversed.events[0]!.i = 2;
  assert.equal(brownfieldProposalInvocationProven(reversed.events, reversed.capture), false);
  const real = fixture();
  assert.equal(brownfieldProposalInvocationProven(real.events, real.capture), true);
  assert.equal(
    brownfieldConfirmationAccepted({
      caseId: 'E3',
      terminal: 'completed-worker',
      functional: true,
      domainPass: true,
      writeBoundary: true,
      runtimeIntact: true,
      traceComplete: true,
      providerError: false,
      trajectoryStatus: 'not-proven',
      judgeVerdict: 'pass',
      cleanup: { safeCleanup: true, rootRemoved: true },
      oracle: { commonPass: true, persistencePass: false, proposalInvocationProven: true },
    }),
    false
  );
});
