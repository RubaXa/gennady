// @file: Renders the self-contained eval-history report (docs/eval-history.html) from the reconciled
//   dataset (docs/journal/eval-history.json). The JSON is the source of truth — edit it and re-run.
//   Chronicle of every tool/directive/prompt change across the Codex RCv5 → Claude RC v6 sessions:
//   before→after diff, decision + why, and three deltas (time / tokens / trajectory). No agent needed.
// @usage: node --import tsx ai/flow-eval/scripts/build-history-report.ts   (from repo root; args optional: <in.json> <out.html>)
// @consumers: docs/eval-history.html (generated); docs/README.md links it.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const HERE = fileURLToPath(new URL('.', import.meta.url));
const IN = process.argv[2] || `${HERE}../docs/journal/eval-history.json`;
const OUT = process.argv[3] || `${HERE}../docs/eval-history.html`;
const H = JSON.parse(readFileSync(IN, 'utf8'));
const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const AXIS = {
  'A-understanding': ['A', 'Понимание задачи'],
  'B-flow-simplification': ['B', 'Упрощение флоу'],
  'C-tool-work': ['C', 'Работа инструментов'],
  'D-fact-in-tool': ['D', 'Факт в инструменте'],
  'E-lazy-loading-abuse': ['E', 'Ленивая подгрузка'],
  'F-edit-discipline': ['F', 'Дисциплина правок'],
  'G-methodology': ['G', 'Методология eval'],
};
const VERDICT = {
  KEPT: ['Оставлено', 'v-kept'],
  REVERTED: ['Откат', 'v-rev'],
  BROKE_THEN_FIXED: ['Сломали→починили', 'v-fix'],
  NEUTRAL: ['Нейтрально', 'v-neu'],
  DOC: ['Документация', 'v-doc'],
};
const axisKey = (a) => (AXIS[a] ? a : 'G-methodology');

const sessions = [...new Set(H.entries.map((e) => e.session))];
const counts = (fn) => H.entries.reduce((m, e) => ((m[fn(e)] = (m[fn(e)] || 0) + 1), m), {});
const byVerdict = counts((e) => e.verdict);
const byDecision = counts((e) => (e.impact && e.impact.decision) || '—');
const bySession = counts((e) => e.session);
const discs = H.entries.filter((e) => e.discrepancy);

const chip = (val, label, group, cls = '') =>
  `<button class="chip ${cls}" data-group="${group}" data-val="${esc(val)}" aria-pressed="true">${esc(label)}</button>`;

function diffBlock(e) {
  const before = e.diff_before && String(e.diff_before).trim();
  const after = e.diff_after && String(e.diff_after).trim();
  if (!before && !after) return '';
  return `<div class="diff">
    <div class="diff-col diff-before"><span class="diff-tag">было</span><pre>${esc(before || '—')}</pre></div>
    <div class="diff-col diff-after"><span class="diff-tag">стало</span><pre>${esc(after || '—')}</pre></div>
  </div>`;
}
function deltaRow(icon, label, val) {
  if (!val) return '';
  const dim = /не измер|n\/a|^—$/i.test(String(val).trim()) ? ' dim' : '';
  return `<div class="delta${dim}"><span class="d-ic">${icon}</span><span class="d-lab">${label}</span><span class="d-val">${esc(val)}</span></div>`;
}
function impactBlock(e) {
  const im = e.impact;
  if (!im) return '';
  const why = im.why ? `<p class="why"><span class="why-lab">почему</span>${esc(im.why)}</p>` : '';
  const deltas = [
    deltaRow('⏱', 'время', im.d_time),
    deltaRow('◈', 'токены', im.d_tokens),
    deltaRow('⟿', 'траектория', im.d_trajectory),
  ].join('');
  return `${why}${deltas ? `<div class="deltas">${deltas}</div>` : ''}`;
}
function entryHTML(e) {
  const [aShort, aLabel] = AXIS[axisKey(e.axis)];
  const [vLabel, vCls] = VERDICT[e.verdict] || ['—', 'v-neu'];
  const files = (e.files || []).map((f) => `<code>${esc(f)}</code>`).join(' ');
  return `<article class="entry" data-session="${esc(e.session)}" data-axis="${esc(axisKey(e.axis))}" data-verdict="${esc(e.verdict)}">
    <div class="rail"><span class="seq">${String(e.seq).padStart(2, '0')}</span><span class="rail-date">${esc(e.date)}</span><span class="tick tick-${e.session === sessions[0] ? '1' : '2'}" title="${esc(e.session)}"></span></div>
    <div class="body">
      <header class="e-head">
        <h3>${esc(e.title)}</h3>
        <div class="tags">
          <span class="axis ax-${aShort}">${aShort} · ${esc(aLabel)}</span>
          <span class="verdict ${vCls}">${esc(vLabel)}</span>
          ${e.kind ? `<span class="kind">${esc(e.kind)}</span>` : ''}
          ${e['restored-gap'] ? `<span class="gapbadge">восстановлено при сверке</span>` : ''}
        </div>
      </header>
      <p class="what">${esc(e.what)}</p>
      ${impactBlock(e)}
      ${diffBlock(e)}
      <footer class="e-foot">
        ${files ? `<span class="files">${files}</span>` : ''}
        <span class="meta">${e.journal_ref ? `<span class="jref">${esc(e.journal_ref)}</span>` : ''}${e.commit ? `<span class="commit">${esc(e.commit)}</span>` : ''}</span>
      </footer>
      ${e.discrepancy ? `<div class="disc"><span class="disc-tag">расхождение журнал ↔ git</span>${esc(e.discrepancy)}</div>` : ''}
    </div>
  </article>`;
}

// group entries by session, preserving order
const groups = sessions.map((s) => ({ s, items: H.entries.filter((e) => e.session === s) }));
const timeline = groups
  .map(
    (g, i) => `<section class="ses-group">
    <div class="ses-head ses-${i + 1}"><span class="ses-num">${i === 0 ? 'I' : 'II'}</span><div><h2>${esc(g.s)}</h2><span class="ses-dates">${esc((H.sessions.find((x) => x.name === g.s) || {}).dates || '')}</span></div><span class="ses-count">${g.items.length} изменений</span></div>
    ${g.items.map(entryHTML).join('\n')}
  </section>`
  )
  .join('\n');

const stat = (n, l, cls = '') =>
  `<div class="stat ${cls}"><span class="s-n">${n}</span><span class="s-l">${esc(l)}</span></div>`;

const html = `<title>Хроника SDD eval</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,560;9..144,680&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
:root{
  --bg:#f4f5f3; --surface:#fdfdfc; --surface-2:#f0f1ee; --ink:#171a19; --ink-2:#3f4643; --muted:#727b76; --hair:#e0e3de; --hair-2:#eceee9;
  --accent:#1c7d70; --accent-ink:#0f5147;
  --kept:#2f8f4e; --rev:#b4472e; --fix:#7458bd; --neu:#7c8592; --doc:#9a8f74;
  --del-bg:rgba(180,71,46,.09); --del-ink:#9a3a24; --add-bg:rgba(47,143,78,.11); --add-ink:#226b3b;
  --s1:#1c7d70; --s2:#8a5a2b;
  --shadow:0 1px 2px rgba(20,30,25,.04),0 4px 16px rgba(20,30,25,.05);
  --serif:'Fraunces',Georgia,serif; --sans:'IBM Plex Sans',system-ui,sans-serif; --mono:'IBM Plex Mono',ui-monospace,monospace;
}
:root:not([data-theme="light"]){ @media (prefers-color-scheme:dark){
  --bg:#12140f; --surface:#191c17; --surface-2:#20241d; --ink:#eceee6; --ink-2:#c2c7ba; --muted:#8b9384; --hair:#2b3025; --hair-2:#222720;
  --accent:#4fd0bd; --accent-ink:#8ee6d8;
  --kept:#5cc37e; --rev:#e0805f; --fix:#a893e6; --neu:#9aa394; --doc:#c4b487;
  --del-bg:rgba(224,128,95,.11); --del-ink:#e79a7f; --add-bg:rgba(92,195,126,.13); --add-ink:#82d69f;
  --s1:#4fd0bd; --s2:#d09a5a;
  --shadow:0 1px 2px rgba(0,0,0,.3),0 6px 22px rgba(0,0,0,.32);
}}
:root[data-theme="dark"]{
  --bg:#12140f; --surface:#191c17; --surface-2:#20241d; --ink:#eceee6; --ink-2:#c2c7ba; --muted:#8b9384; --hair:#2b3025; --hair-2:#222720;
  --accent:#4fd0bd; --accent-ink:#8ee6d8;
  --kept:#5cc37e; --rev:#e0805f; --fix:#a893e6; --neu:#9aa394; --doc:#c4b487;
  --del-bg:rgba(224,128,95,.11); --del-ink:#e79a7f; --add-bg:rgba(92,195,126,.13); --add-ink:#82d69f;
  --s1:#4fd0bd; --s2:#d09a5a;
  --shadow:0 1px 2px rgba(0,0,0,.3),0 6px 22px rgba(0,0,0,.32);
}
*{box-sizing:border-box}
body{background:var(--bg);color:var(--ink);font-family:var(--sans);line-height:1.55;-webkit-font-smoothing:antialiased}
.wrap{max-width:1080px;margin:0 auto;padding:0 24px 96px}
a{color:var(--accent-ink)}
code{font-family:var(--mono);font-size:.82em;background:var(--surface-2);padding:.08em .35em;border-radius:4px;color:var(--ink-2)}
::selection{background:var(--accent);color:var(--bg)}

/* Masthead */
.mast{padding:64px 0 32px;border-bottom:1px solid var(--hair)}
.eyebrow{font-family:var(--mono);font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:var(--accent-ink);margin:0 0 18px}
.mast h1{font-family:var(--serif);font-weight:680;font-size:clamp(38px,6vw,68px);line-height:1.02;letter-spacing:-.01em;margin:0 0 20px;text-wrap:balance;max-width:16ch}
.lede{font-size:19px;color:var(--ink-2);max-width:62ch;margin:0 0 28px}
.lede b{color:var(--ink);font-weight:600}
.lineage{display:flex;flex-wrap:wrap;gap:10px 14px;align-items:center;font-family:var(--mono);font-size:13px;color:var(--muted)}
.lin-node{display:inline-flex;align-items:center;gap:8px;padding:7px 13px;border:1px solid var(--hair);border-radius:999px;background:var(--surface)}
.lin-node .dot{width:9px;height:9px;border-radius:50%}
.lin-node.n1 .dot{background:var(--s1)} .lin-node.n2 .dot{background:var(--s2)}
.lin-node b{color:var(--ink);font-weight:500}
.lin-arw{color:var(--hair);font-size:16px}

/* Stats */
.stats{display:flex;flex-wrap:wrap;gap:0;margin:36px 0 8px;border:1px solid var(--hair);border-radius:14px;background:var(--surface);overflow:hidden;box-shadow:var(--shadow)}
.stat{flex:1 1 120px;padding:20px 22px;border-right:1px solid var(--hair-2);display:flex;flex-direction:column;gap:3px}
.stat:last-child{border-right:0}
.s-n{font-family:var(--serif);font-weight:600;font-size:30px;line-height:1;font-variant-numeric:tabular-nums}
.s-l{font-size:12.5px;color:var(--muted);letter-spacing:.02em}
.stat.k .s-n{color:var(--kept)} .stat.f .s-n{color:var(--fix)} .stat.r .s-n{color:var(--rev)}

/* Discrepancies */
.disc-panel{margin:34px 0 8px;border:1px solid var(--hair);border-left:3px solid var(--fix);border-radius:12px;background:var(--surface);padding:20px 24px}
.disc-panel h2{font-family:var(--serif);font-weight:600;font-size:20px;margin:0 0 6px}
.disc-panel .sub{color:var(--muted);font-size:13.5px;margin:0 0 16px}
.disc-panel ul{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:11px}
.disc-panel li{font-size:14px;color:var(--ink-2);padding-left:20px;position:relative}
.disc-panel li::before{content:"↺";position:absolute;left:0;color:var(--fix);font-weight:600}
.disc-panel li b{color:var(--ink);font-weight:600}

/* Filters */
.filters{position:sticky;top:0;z-index:5;background:color-mix(in srgb,var(--bg) 90%,transparent);backdrop-filter:blur(8px);padding:16px 0;margin:28px 0 8px;border-bottom:1px solid var(--hair)}
.frow{display:flex;flex-wrap:wrap;gap:8px;align-items:baseline;margin-bottom:9px}
.frow:last-child{margin-bottom:0}
.frow-label{font-family:var(--mono);font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);width:74px;flex-shrink:0}
.chip{font-family:var(--sans);font-size:13px;padding:5px 12px;border:1px solid var(--hair);border-radius:999px;background:var(--surface);color:var(--ink-2);cursor:pointer;transition:all .12s;line-height:1.3}
.chip:hover{border-color:var(--accent)}
.chip[aria-pressed="false"]{opacity:.4;text-decoration:line-through}
.chip.on{background:var(--accent);border-color:var(--accent);color:var(--bg)}
.chip:focus-visible{outline:2px solid var(--accent);outline-offset:2px}

/* Session groups */
.ses-group{margin-top:14px}
.ses-head{display:flex;align-items:center;gap:16px;padding:26px 0 14px;margin-top:22px}
.ses-num{font-family:var(--serif);font-weight:400;font-size:34px;color:var(--surface);-webkit-text-stroke:1.4px var(--muted);line-height:1;flex-shrink:0}
.ses-head h2{font-family:var(--serif);font-weight:600;font-size:26px;margin:0;letter-spacing:-.01em}
.ses-dates{font-family:var(--mono);font-size:11.5px;color:var(--muted)}
.ses-count{margin-left:auto;font-family:var(--mono);font-size:12px;color:var(--muted)}
.ses-1 h2{color:var(--s1)} .ses-2 h2{color:var(--s2)}

/* Entry */
.entry{display:grid;grid-template-columns:92px 1fr;gap:0;position:relative}
.entry.hide{display:none}
.rail{display:flex;flex-direction:column;align-items:center;gap:6px;padding-top:22px;position:relative}
.rail::before{content:"";position:absolute;top:0;bottom:-1px;left:50%;width:1px;background:var(--hair);transform:translateX(-.5px)}
.entry:last-child .rail::before{bottom:auto;height:40px}
.seq{font-family:var(--mono);font-size:13px;font-weight:500;color:var(--muted);background:var(--bg);padding:2px 0;z-index:1;position:relative;font-variant-numeric:tabular-nums}
.rail-date{font-family:var(--mono);font-size:10.5px;color:var(--muted);background:var(--bg);z-index:1;writing-mode:vertical-rl;transform:rotate(180deg);margin-top:2px;letter-spacing:.04em}
.tick{width:11px;height:11px;border-radius:50%;background:var(--surface);border:2px solid var(--s1);z-index:1;position:absolute;top:26px}
.tick-2{border-color:var(--s2)}
.body{padding:22px 0 26px 24px;border-bottom:1px solid var(--hair-2);min-width:0}
.e-head{display:flex;flex-direction:column;gap:9px;margin-bottom:11px}
.e-head h3{font-family:var(--serif);font-weight:560;font-size:21px;line-height:1.22;margin:0;letter-spacing:-.005em;text-wrap:balance}
.tags{display:flex;flex-wrap:wrap;gap:7px;align-items:center}
.axis,.verdict,.kind{font-family:var(--mono);font-size:11px;padding:3px 9px;border-radius:6px;letter-spacing:.02em;white-space:nowrap}
.axis{background:var(--surface-2);color:var(--ink-2)}
.verdict{font-weight:500}
.v-kept{background:color-mix(in srgb,var(--kept) 16%,transparent);color:var(--kept)}
.v-rev{background:color-mix(in srgb,var(--rev) 16%,transparent);color:var(--rev)}
.v-fix{background:color-mix(in srgb,var(--fix) 18%,transparent);color:var(--fix)}
.v-neu{background:var(--surface-2);color:var(--neu)}
.v-doc{background:color-mix(in srgb,var(--doc) 18%,transparent);color:var(--doc)}
.kind{background:transparent;border:1px solid var(--hair);color:var(--muted)}
.what{font-size:15px;color:var(--ink-2);margin:0 0 15px;max-width:66ch}

.why{font-size:14px;color:var(--ink-2);margin:0 0 13px;max-width:66ch}
.why-lab{font-family:var(--mono);font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--accent-ink);margin-right:9px;white-space:nowrap}
.deltas{display:flex;flex-direction:column;gap:1px;margin:0 0 15px;border:1px solid var(--hair);border-radius:9px;overflow:hidden;background:var(--hair-2);max-width:72ch}
.delta{display:grid;grid-template-columns:24px 96px 1fr;align-items:baseline;gap:10px;background:var(--surface);padding:9px 13px}
.delta.dim{background:var(--surface-2)}
.d-ic{font-size:13px;color:var(--accent);text-align:center;align-self:center}
.delta.dim .d-ic{color:var(--muted)}
.d-lab{font-family:var(--mono);font-size:10.5px;letter-spacing:.07em;text-transform:uppercase;color:var(--muted)}
.d-val{font-family:var(--mono);font-size:12px;line-height:1.45;color:var(--ink-2);word-break:break-word}
.delta.dim .d-val{color:var(--muted);font-style:italic}
.gapbadge{font-family:var(--mono);font-size:10px;padding:3px 9px;border-radius:6px;background:color-mix(in srgb,var(--accent) 14%,transparent);color:var(--accent-ink);letter-spacing:.02em}

.diff{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:0 0 15px}
.diff-col{border:1px solid var(--hair);border-radius:9px;padding:0;overflow:hidden;min-width:0}
.diff-before{background:var(--del-bg)} .diff-after{background:var(--add-bg)}
.diff-tag{display:block;font-family:var(--mono);font-size:10px;letter-spacing:.1em;text-transform:uppercase;padding:6px 12px;border-bottom:1px solid var(--hair-2)}
.diff-before .diff-tag{color:var(--del-ink)} .diff-after .diff-tag{color:var(--add-ink)}
.diff pre{font-family:var(--mono);font-size:12px;line-height:1.5;margin:0;padding:11px 12px;white-space:pre-wrap;word-break:break-word;overflow-x:auto}
.diff-before pre{color:var(--del-ink)} .diff-after pre{color:var(--add-ink)}

.e-foot{display:flex;flex-wrap:wrap;gap:8px 16px;align-items:baseline;justify-content:space-between}
.files{display:flex;flex-wrap:wrap;gap:6px}
.files code{font-size:11px}
.meta{display:flex;gap:12px;font-family:var(--mono);font-size:11px;color:var(--muted);flex-shrink:0}
.jref{color:var(--accent-ink)}
.disc{margin-top:13px;font-size:13px;color:var(--ink-2);background:color-mix(in srgb,var(--fix) 7%,var(--surface));border:1px solid color-mix(in srgb,var(--fix) 22%,var(--hair));border-radius:8px;padding:10px 13px}
.disc-tag{display:block;font-family:var(--mono);font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--fix);margin-bottom:4px}

.empty{padding:60px 0;text-align:center;color:var(--muted);font-family:var(--mono);font-size:14px;display:none}
.theme-btn{position:fixed;top:16px;right:16px;z-index:10;width:38px;height:38px;border-radius:50%;border:1px solid var(--hair);background:var(--surface);color:var(--ink-2);cursor:pointer;font-size:16px;box-shadow:var(--shadow)}
.foot{margin-top:48px;padding-top:22px;border-top:1px solid var(--hair);font-family:var(--mono);font-size:11.5px;color:var(--muted);display:flex;flex-wrap:wrap;gap:6px 18px;justify-content:space-between}
@media(max-width:680px){
  .entry{grid-template-columns:56px 1fr}
  .rail-date{display:none}
  .diff{grid-template-columns:1fr}
  .body{padding-left:18px}
  .stat{flex-basis:33%}
}
@media(prefers-reduced-motion:reduce){*{transition:none!important}}
</style>

<button class="theme-btn" id="themeBtn" aria-label="Сменить тему">◐</button>
<div class="wrap">
  <header class="mast">
    <p class="eyebrow">Хроника eval-харнесса · ${esc(H.span.first_date)} → ${esc((H.span.last_date || '').replace(/\\s*\\(.*\\)/, ''))}</p>
    <h1>Как менялся флоу через eval</h1>
    <p class="lede">Полная реконструкция от рождения первого eval (<code>${esc(H.span.first_eval_commit)}</code>) до текущего состояния — через две операторские сессии. Тезис на всём протяжении: <b>когда слабая модель не справляется, виноват флоу, а не модель</b>. Каждая карточка — реальное изменение инструмента, директивы или промпта: обрезанный before→после, <b>решение (приняли / отвергли / нейтрально) и почему</b>, и три дельты — <b>⏱ время · ◈ токены · ⟿ траектория агента</b>. Числа восстановлены из git + журнала + RESULTS + сырых трасс; где источник не мерил — честно «не измерялось», ничего не выдумано.</p>
    <div class="lineage">
      <span class="lin-node n1"><span class="dot"></span><b>${esc(H.sessions[0]?.name || 'RCv5')}</b> · ${bySession[sessions[0]] || 0}</span>
      <span class="lin-arw">→</span>
      <span class="lin-node n2"><span class="dot"></span><b>${esc(H.sessions[1]?.name || 'RC v6')}</b> · ${bySession[sessions[1]] || 0}</span>
    </div>
    <div class="stats">
      ${stat(H.entries.length, 'изменений всего')}
      ${stat(byDecision.accepted || 0, 'принято', 'k')}
      ${stat(byDecision.neutral || 0, 'нейтрально')}
      ${stat(byDecision['not-a-run'] || 0, 'не agent-прогон')}
      ${stat(discs.length, 'расхождений журнал↔git', 'f')}
    </div>
  </header>

  ${
    discs.length
      ? `<section class="disc-panel">
    <h2>Где мы сами себя поправили</h2>
    <p class="sub">Места, где журнал расходился с реальным диффом, или вывод позже был отозван — самоконтроль флоу, а не заметание под ковёр.</p>
    <ul>${discs.map((e) => `<li><b>${esc(e.title.replace(/\\s*\\(.*\\)/, ''))}:</b> ${esc(e.discrepancy)}</li>`).join('')}</ul>
  </section>`
      : ''
  }

  <nav class="filters" id="filters" aria-label="Фильтры">
    <div class="frow"><span class="frow-label">Сессия</span>${sessions.map((s) => chip(s, s, 'session', 'on')).join('')}</div>
    <div class="frow"><span class="frow-label">Ось</span>${Object.entries(AXIS)
      .filter(([k]) => H.entries.some((e) => axisKey(e.axis) === k))
      .map(([k, [sh, lab]]) => chip(k, sh + ' · ' + lab, 'axis', 'on'))
      .join('')}</div>
    <div class="frow"><span class="frow-label">Вердикт</span>${Object.entries(VERDICT)
      .filter(([k]) => byVerdict[k])
      .map(([k, [lab]]) => chip(k, lab, 'verdict', 'on'))
      .join('')}</div>
  </nav>

  <main id="timeline">
    ${timeline}
    <div class="empty" id="empty">Ничего не подходит под фильтры.</div>
  </main>

  <footer class="foot">
    <span>Сгенерировано ${esc((H.generated || '').slice(0, 10))} · источники: git (${esc(H.span.first_eval_commit)}→working tree), журнал eval, транскрипты RCv5/RC&nbsp;v6</span>
    <span>${H.entries.length} записей · ${sessions.length} сессии</span>
  </footer>
</div>

<script>
(function(){
  var state={session:{},axis:{},verdict:{}};
  document.querySelectorAll('.chip').forEach(function(c){ state[c.dataset.group][c.dataset.val]=true; });
  function apply(){
    var any=false;
    document.querySelectorAll('.entry').forEach(function(el){
      var ok=state.session[el.dataset.session]&&state.axis[el.dataset.axis]&&state.verdict[el.dataset.verdict];
      el.classList.toggle('hide',!ok); if(ok)any=true;
    });
    document.querySelectorAll('.ses-group').forEach(function(g){
      var vis=g.querySelectorAll('.entry:not(.hide)').length; g.style.display=vis?'':'none';
    });
    document.getElementById('empty').style.display=any?'none':'block';
  }
  document.getElementById('filters').addEventListener('click',function(e){
    var c=e.target.closest('.chip'); if(!c)return;
    var on=c.getAttribute('aria-pressed')==='true'; c.setAttribute('aria-pressed',String(!on));
    c.classList.toggle('on',!on); state[c.dataset.group][c.dataset.val]=!on; apply();
  });
  var root=document.documentElement, btn=document.getElementById('themeBtn');
  btn.addEventListener('click',function(){
    var cur=root.getAttribute('data-theme');
    var next=cur==='dark'?'light':cur==='light'?'dark':(matchMedia('(prefers-color-scheme: dark)').matches?'light':'dark');
    root.setAttribute('data-theme',next);
  });
})();
</script>`;
writeFileSync(OUT, html);
console.log('wrote', OUT, html.length, 'bytes');
