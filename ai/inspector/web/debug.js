// @file: ai/inspector — pure, DOM-free debugger model for the step-through flow.
// Deterministic: given a parsed+resolved skill tree and a list of moves, simulate() replays the
// descent (auto-enter at EMBODY, step-into runs, LOGIC_SWITCH branches) into a log + frame stack.
// No DOM here — renderDebug() in app.js draws from this. Unit-tested in __tests__/debug.test.ts.

export const base = (p) => (p || '').split('/').pop();

export const dirOf = (run) =>
  ((run && run.children) || []).find((c) => c.kind === 'directive') || null;

/** Collect descendant nodes of a kind within a unit, NOT crossing into a run's resolved directive. */
export function gather(node, kind) {
  const out = [];
  (function walk(n) {
    for (const c of n.children || []) {
      if (c.kind === kind) out.push(c);
      if (c.kind !== 'run') walk(c); // a run's children are the sub-directive — not this step's own content
    }
  })(node);
  return out;
}
export const toolsOf = (unit) => gather(unit, 'tool');
export const readsOf = (unit) => gather(unit, 'read');

/** Runs the step loads UNCONDITIONALLY (directly in the Action) — excludes runs inside a switch/branch,
 *  which are conditional and shown in the switch block, not as "loaded here". */
export function runsOutsideSwitch(node) {
  const out = [];
  (function walk(n) {
    for (const c of n.children || []) {
      if (c.kind === 'run') {
        out.push(c);
        continue;
      }
      if (c.kind === 'switch' || c.kind === 'branch') continue; // conditional → belongs to the switch box
      walk(c);
    }
  })(node);
  return out;
}

/** Full step text as ONE markdown string (rendered, highlighted) — no separate raw summary line. */
export function stepMd(unit) {
  if (unit.detail) return unit.detail; // skill step: its whole body
  const child = (label) => (unit.children || []).find((c) => c.label === label);
  const goal = child('<Goal>');
  const action = child('<Action>');
  if (!goal && !action) return unit.note || '';
  const parts = [];
  if (goal && (goal.detail || goal.note)) parts.push('**Цель:** ' + (goal.detail || goal.note));
  if (action && (action.detail || action.note))
    parts.push('**Действие:** ' + (action.detail || action.note));
  return parts.join('\n\n');
}

/** Execution units of a frame: ExecutionPlan steps, then a trailing top-level <LogicSwitch> (router). */
export function unitsOf(node) {
  const u = [];
  const ep = (node.children || []).find((c) => c.label === '<ExecutionPlan>');
  if (ep) (ep.children || []).forEach((s) => u.push(s));
  const sw = (node.children || []).find((c) => c.kind === 'switch');
  if (sw) u.push(sw);
  return u;
}

/** Possible moves from a unit: switch → branches; step → step-into per run child + linear next. */
export function transOf(unit) {
  if (unit.kind === 'switch') {
    return (unit.children || []).map((br, i) => ({
      type: 'branch',
      i,
      label: br.label,
      run: (br.children || []).find((c) => c.kind === 'run'),
    }));
  }
  // a step that embeds a structured <LogicSwitch> → its branches ARE the choices
  const sw = gather(unit, 'switch')[0];
  if (sw) return transOf(sw);
  const runs = gather(unit, 'run');
  const t = runs.map((r, i) => ({ type: 'into', i, label: r.ref, run: r }));
  t.push({ type: 'next', label: 'следующий шаг →' });
  return t;
}

/** The directive a skill embodies = the first non-preflight directive it loads (entered at EMBODY). */
export function mainDirective(skillNode) {
  for (const r of gather(skillNode, 'run')) {
    const b = base(r.ref);
    if (b === 'migration-v1-v2.directive.xml' || b === 'readiness.directive.xml') continue;
    const dir = dirOf(r);
    if (dir) return { run: r, dir };
  }
  return null;
}

/** Frame-aware transitions: in a skill, the main directive is entered AUTOMATICALLY at EMBODY, so it is
 *  not offered as a manual step-into on the loader steps. Directive frames use transOf unchanged. */
export function transitionsFor(frame, unit) {
  if (frame.node.kind !== 'skill') return transOf(unit);
  if (unit.kind === 'switch' || gather(unit, 'switch')[0]) return transOf(unit);
  const main = mainDirective(frame.node);
  const runs = gather(unit, 'run').filter((r) => !(main && r.ref === main.run.ref));
  const t = runs.map((r, i) => ({ type: 'into', i, label: r.ref, run: r }));
  t.push({ type: 'next', label: 'следующий шаг →' });
  return t;
}

/** Deterministic replay: given the skill + the list of moves taken, compute log + current frame/unit. */
export function simulate(skill, moves) {
  const stack = [{ node: skill, u: unitsOf(skill), idx: 0, resume: -1 }];
  const log = [];
  const top = () => stack[stack.length - 1];
  const push = (e) => log.push({ ...e, depth: stack.length - 1 }); // stamp current stack depth for indentation
  push({ div: 'загружен скил ' + skill.label });
  const unwind = () => {
    while (stack.length > 1 && top().idx >= top().u.length) {
      const child = stack.pop();
      push({ div: 'возврат из ' + child.node.label });
      top().idx = child.resume + 1;
    }
  };
  // A skill is a loader: at its EMBODY step it BECOMES the main directive — auto-descend into it (no manual
  // click), folding the rest of the skill. Derived (not a recorded move), so replay stays deterministic.
  const autoEnter = () => {
    for (let g = 0; g < 64; g++) {
      unwind();
      const t = top();
      const unit = t.u[t.idx];
      if (t.node.kind === 'skill' && unit && unit.attrs && unit.attrs.id === 'EMBODY') {
        const main = mainDirective(t.node);
        if (main) {
          push({ step: unit, into: main.run.ref });
          stack.push({ node: main.dir, u: unitsOf(main.dir), idx: 0, resume: t.u.length - 1 });
          push({
            div:
              'загружена ' +
              main.dir.label +
              ' — раскрыть ниже, чтобы прочитать (' +
              base(main.run.ref) +
              ')',
            dir: main.dir,
          });
          continue;
        }
      }
      break;
    }
  };
  autoEnter();
  for (const m of moves) {
    const t = top();
    const unit = t.u[t.idx];
    if (!unit) break;
    const trans = transitionsFor(t, unit);
    if (m.type === 'next') {
      push({ step: unit });
      t.idx++;
    } else if (m.type === 'into') {
      const tr = trans.find((x) => x.type === 'into' && x.i === m.i);
      if (tr) {
        push({ step: unit, into: tr.run.ref });
        const dir = dirOf(tr.run);
        if (dir) {
          stack.push({ node: dir, u: unitsOf(dir), idx: 0, resume: t.idx });
          push({
            div:
              'загружена ' +
              dir.label +
              ' — раскрыть ниже, чтобы прочитать (' +
              base(tr.run.ref) +
              ')',
            dir,
          });
        } else t.idx++;
      } else t.idx++;
    } else if (m.type === 'branch') {
      const tr = trans.find((x) => x.type === 'branch' && x.i === m.i);
      if (tr) {
        push({ step: unit, branch: tr.label });
        const dir = tr.run ? dirOf(tr.run) : null;
        if (dir) {
          stack.push({ node: dir, u: unitsOf(dir), idx: 0, resume: t.idx });
          push({
            div: 'ветка → загружена ' + dir.label + ' — раскрыть ниже, чтобы прочитать',
            dir,
          });
        } else {
          push({ div: 'ветка: ' + tr.label });
          t.idx++;
        }
      } else t.idx++;
    }
    autoEnter();
  }
  const t = top();
  const unit = t.idx < t.u.length ? t.u[t.idx] : null;
  return {
    log,
    stack,
    current: unit ? { unit, transitions: transitionsFor(t, unit), depth: stack.length - 1 } : null,
    done: !unit && stack.length === 1,
  };
}
