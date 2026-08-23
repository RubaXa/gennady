// @file: ai/inspector — UI: skill list → (1) structure tree, (2) step-through debugger of the flow.

import { renderMarkdown, renderInline } from './markdown.js';
import {
  base,
  dirOf,
  gather,
  toolsOf,
  readsOf,
  runsOutsideSwitch,
  stepMd,
  unitsOf,
  transOf,
  mainDirective,
  transitionsFor,
  simulate,
} from './debug.js';

const KIND = {
  skill: ['k-skill', 'skill'],
  section: ['k-tag', 'tag'],
  step: ['k-step', 'step'],
  tool: ['k-tool', 'cmd'],
  read: ['k-read', 'read'],
  run: ['k-run', 'run'],
  directive: ['k-run', 'directive'],
  axiom: ['k-axiom', 'axiom'],
  halt: ['k-halt', 'halt'],
  switch: ['k-switch', 'switch'],
  branch: ['k-switch', 'branch'],
  text: ['k-tag', 'tag'],
  unparsed: ['k-warn', 'unparsed'],
};
const LEGEND = ['step', 'tool', 'read', 'run', 'axiom', 'switch', 'halt', 'unparsed'];

function el(tag, cls, txt) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (txt != null) e.textContent = txt;
  return e;
}

// Open files via the editor's URL scheme (vscode://file/<abs>:<line>) — the OS launches the editor,
// no server-side spawn (avoids EACCES). repoRoot comes from trace.json; editor scheme is user-picked.
let REPO_ROOT = '';
let EDITOR =
  (typeof localStorage !== 'undefined' && localStorage.getItem('inspector.editor')) || 'vscode';
const editorUrl = (loc) => EDITOR + '://file' + REPO_ROOT + '/' + loc.file + ':' + loc.line;

/** A small "open in editor" link bound to a node's source loc (clicking does not toggle the row). */
function openCtl(loc) {
  const a = el('a', 'opensrc', '↗');
  a.href = editorUrl(loc);
  a.title = 'open ' + loc.file + ':' + loc.line + ' in ' + EDITOR;
  a.addEventListener('click', (e) => e.stopPropagation());
  return a;
}

/** Detail block: CLI help stays raw/aligned (<pre>-like); prompt prose renders as markdown-lite. */
function detailEl(node) {
  if (node.kind === 'tool') return el('div', 'detail', node.detail); // aligned help — keep raw
  const d = el('div', 'md');
  d.innerHTML = renderMarkdown(node.detail);
  return d;
}

// ---------- structure tree ----------
function renderNode(node, depth) {
  const wrap = el('div', 'node');
  const row = el('div', 'row');
  row.dataset.kind = node.kind;
  const hasStructural = !!(node.children && node.children.length);
  const hasKids = hasStructural || node.detail;
  const chev = el('span', 'chev' + (hasKids ? '' : ' leaf'), '▸');
  row.appendChild(chev);
  const meta = KIND[node.kind] || ['k-tag', '·'];
  row.appendChild(el('span', 'k ' + meta[0], meta[1]));
  const lab = el('div', 'lab');
  lab.appendChild(el('span', 'tag', node.label));
  if (node.note) {
    lab.appendChild(document.createTextNode(' '));
    const n = el('span', 'note');
    n.innerHTML = '— ' + renderInline(node.note);
    lab.appendChild(n);
  }
  row.appendChild(lab);
  if (node.loc) row.appendChild(openCtl(node.loc));
  wrap.appendChild(row);
  if (hasKids) {
    const kids = el('div', 'kids');
    if (node.detail) kids.appendChild(detailEl(node));
    (node.children || []).forEach((ch) => kids.appendChild(renderNode(ch, depth + 1)));
    const open = depth < 2 && hasStructural;
    if (open) chev.classList.add('open');
    else kids.classList.add('collapsed');
    wrap.appendChild(kids);
    row.classList.add('clk');
    row.addEventListener('click', () => {
      kids.classList.toggle('collapsed');
      chev.classList.toggle('open');
    });
  }
  return wrap;
}

// ---------- debugger view ----------
function renderDebug(container, skill) {
  let moves = [];
  function draw() {
    const sim = simulate(skill, moves);
    container.innerHTML = '';

    const bc = el('div', 'dbg-stack');
    bc.appendChild(document.createTextNode('стек: '));
    sim.stack.forEach((f, i) => {
      if (i) bc.appendChild(document.createTextNode('  ›  '));
      bc.appendChild(el('b', null, f.node.label));
    });
    container.appendChild(bc);

    sim.log.forEach((e) => {
      const ind = (e.depth || 0) * 16; // indent by stack depth — the descent reads as a staircase
      if (e.div) {
        const d = el('div', 'dbg-div', e.div);
        d.style.marginLeft = ind + 'px';
        container.appendChild(d);
        // entered a directive → drop it in collapsed, right under the divider, no extra frame.
        // the divider text already says we loaded it; the row below is the affordance to read it.
        if (e.dir) {
          const r = renderNode(e.dir, 2);
          r.style.marginLeft = ind + 'px';
          container.appendChild(r);
        }
        return;
      }
      const row = el('div', 'dbg-ev');
      row.style.marginLeft = ind + 'px';
      row.appendChild(el('span', 'dbg-ic', '✓'));
      const b = el('div');
      b.appendChild(el('span', 'dbg-step', e.step.label));
      const extra = [];
      const tools = toolsOf(e.step)
        .map((t) => t.label)
        .join(', ');
      if (tools) extra.push('тулы: ' + tools);
      const reads = readsOf(e.step)
        .map((r) => r.label)
        .join(', ');
      if (reads) extra.push('READ_AND_USE: ' + reads);
      if (e.into) extra.push('вошли в ' + base(e.into));
      if (e.branch) extra.push('ветка: ' + e.branch);
      if (extra.length) b.appendChild(el('span', 'dbg-mut', ' — ' + extra.join(' · ')));
      row.appendChild(b);
      container.appendChild(row);
    });

    if (sim.done) {
      container.appendChild(el('div', 'dbg-div', 'флоу завершён'));
    } else if (sim.current) {
      const { unit, transitions } = sim.current;
      const card = el('div', 'dbg-card');
      card.style.marginLeft = (sim.current.depth || 0) * 16 + 'px';
      const hd = el('div', 'dbg-hd');
      const meta = KIND[unit.kind] || ['k-step', 'step'];
      hd.appendChild(el('span', 'k ' + meta[0], meta[1]));
      hd.appendChild(el('span', 'dbg-cur', unit.label));
      if (unit.loc) hd.appendChild(openCtl(unit.loc));
      card.appendChild(hd);
      if (unit.kind === 'switch') {
        if (unit.note) {
          const n = el('div', 'dbg-note');
          n.innerHTML = renderInline(unit.note);
          card.appendChild(n);
        }
      } else {
        const md = stepMd(unit);
        if (md) {
          const d = el('div', 'md');
          d.innerHTML = renderMarkdown(md);
          card.appendChild(d);
        }
        const tools = toolsOf(unit);
        if (tools.length)
          card.appendChild(
            el('div', 'dbg-mut', 'выполняет: ' + tools.map((t) => t.label).join(', '))
          );
        const reads = readsOf(unit);
        if (reads.length)
          card.appendChild(
            el('div', 'dbg-read', 'READ_AND_USE: ' + reads.map((r) => r.label).join(', '))
          );
        gather(unit, 'unparsed').forEach((u) =>
          card.appendChild(el('div', 'dbg-mut', '⚠ ' + u.label + (u.note ? ' — ' + u.note : '')))
        );
        // READ_AND_USE: show WHAT this step loads directly (not switch branches), collapsed + inspectable
        runsOutsideSwitch(unit).forEach((r) => {
          const dir = dirOf(r);
          if (!dir) return;
          const box = el('div', 'dbg-loaded');
          box.appendChild(el('div', 'dbg-mut', '↘ загружает (осмотреть): ' + base(r.ref)));
          box.appendChild(renderNode(dir, 2)); // depth 2 → collapsed by default
          card.appendChild(box);
        });
      }
      // if the choices come from a structured switch, give it an explicit, labelled block
      const govSwitch = unit.kind === 'switch' ? unit : gather(unit, 'switch')[0];
      let host = card;
      if (govSwitch && unit.kind !== 'switch') {
        const box = el('div', 'dbg-switchbox');
        const h = el('div', 'dbg-switch-hd');
        h.appendChild(el('span', 'k k-switch', 'switch'));
        h.appendChild(el('span', 'dbg-sw-tag', 'LOGIC_SWITCH'));
        if (govSwitch.note) h.appendChild(el('span', 'dbg-mut', '· ' + govSwitch.note));
        h.appendChild(el('span', 'dbg-mut', '— выбери ветку:'));
        box.appendChild(h);
        card.appendChild(box);
        host = box;
      }
      const tr = el('div', 'dbg-branches');
      transitions.forEach((t) => {
        const btn = el('div', 'dbg-br');
        if (t.type === 'branch') {
          btn.classList.add('dbg-case');
          const br = govSwitch && govSwitch.children ? govSwitch.children[t.i] : null;
          const run = br && (br.children || []).find((c) => c.kind === 'run');
          const txt = br && (br.children || []).find((c) => c.kind === 'text');
          btn.appendChild(
            el('span', 'cond', t.label === 'DEFAULT' ? 'DEFAULT — иначе' : 'когда ' + t.label)
          );
          btn.appendChild(
            el('span', 'to', run ? '→ ' + base(run.ref) + ' ↘' : txt ? txt.label : '→ дальше')
          );
        } else if (t.type === 'into') {
          btn.appendChild(el('span', 'cond', 'войти'));
          btn.appendChild(el('span', 'to', '→ ' + base(t.label) + ' ↘'));
        } else {
          btn.appendChild(el('span', 'cond', 'следующий шаг'));
          btn.appendChild(el('span', 'to', '→'));
        }
        btn.addEventListener('click', () => {
          moves.push(t.type === 'next' ? { type: 'next' } : { type: t.type, i: t.i });
          draw();
        });
        tr.appendChild(btn);
      });
      host.appendChild(tr);
      container.appendChild(card);
    }

    const ctl = el('div', 'dbg-controls');
    const back = el('span', 'dbg-ctl', '← шаг назад');
    back.addEventListener('click', () => {
      moves.pop();
      draw();
    });
    const reset = el('span', 'dbg-ctl', '⟲ сброс');
    reset.addEventListener('click', () => {
      moves = [];
      draw();
    });
    ctl.appendChild(back);
    ctl.appendChild(reset);
    container.appendChild(ctl);
  }
  draw();
}

// ---------- wiring ----------
function renderLegend() {
  const box = document.getElementById('legend');
  LEGEND.forEach((k) => {
    const meta = KIND[k];
    const s = el('span');
    s.appendChild(el('span', 'k ' + meta[0], meta[1]));
    box.appendChild(s);
  });
}

async function main() {
  renderLegend();
  const data = await (await fetch('./trace.json')).json();
  REPO_ROOT = data.repoRoot || '';
  const list = document.getElementById('skills');
  const trace = document.getElementById('trace');
  let cur = 0;
  const select = (i) => {
    cur = i;
    [...list.children].forEach((c, j) => c.classList.toggle('active', j === i));
    trace.innerHTML = '';
    const skill = data.skills[i];
    // skills that aren't XML/HTML-form are listed but not parsed — say so plainly, no tree/debugger.
    if (skill.attrs?.unsupported) {
      const box = el('div', 'unsupported-panel');
      box.appendChild(el('div', 'unsupported-title', skill.label + ' — не поддерживается'));
      box.appendChild(
        el(
          'div',
          'unsupported-body',
          'Инспектор разбирает только скилы в XML/HTML-форме (корневой элемент, например <SddSkill>). Этот SKILL.md — markdown/frontmatter, поэтому показать структуру и прогон нельзя.'
        )
      );
      if (skill.detail) box.appendChild(el('div', 'dbg-mut', skill.detail));
      trace.appendChild(box);
      return;
    }
    const struct = el('div', 'structure');
    struct.appendChild(el('div', 'section-head', 'Структура промпта'));
    struct.appendChild(renderNode(skill, 0));
    trace.appendChild(struct);
    trace.appendChild(el('div', 'big-div', '▼ Прогон — пошаговый дебаг флоу'));
    const dbg = el('div', 'dbg');
    trace.appendChild(dbg);
    renderDebug(dbg, skill);
  };
  data.skills.forEach((s, i) => {
    const b = el('button', 'skill-btn', s.label);
    if (s.attrs?.unsupported) b.classList.add('unsupported');
    b.dataset.idx = i;
    b.addEventListener('click', () => select(i));
    list.appendChild(b);
  });
  const ed = document.getElementById('editor');
  if (ed) {
    ed.value = EDITOR;
    ed.addEventListener('change', () => {
      EDITOR = ed.value;
      localStorage.setItem('inspector.editor', EDITOR);
      select(cur);
    });
  }
  if (data.skills.length) select(0);
}

main();
