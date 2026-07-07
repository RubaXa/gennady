// @file: Shared stop-word dictionary for prompts and generated artifacts — catches bookish words,
//   calques and slang that leak into operator output (AUTHORING §6, writing-style).
// @consumers: inbox-review-plan validate; (later) gennady lint prompt-check
// @tasks: TSK-105

// #region START_DICTIONARY

/** @purpose One stop-word rule for the dictionary. */
export type StopWord = {
  /** @purpose Matcher for the banned word (Unicode word boundaries, `iu` flags). */
  re: RegExp;
  /** @purpose Short reason category shown to the operator (Russian data). */
  why: string;
  /** @purpose Suggested replacement shown to the operator (Russian data). */
  use: string;
};

// JS `\b` does not know Cyrillic (only ASCII counts), so word boundaries use a Unicode lookaround.
const NB = '(?<!\\p{L})';
const NA = '(?!\\p{L})';
const w = (body: string) => new RegExp(`${NB}${body}${NA}`, 'iu');
const stem = (body: string) => new RegExp(`${NB}${body}\\p{L}*`, 'iu');

/**
 * @purpose High-precision banned Russian words (bookish, calque, slang). Extended as offenders appear.
 * @invariant Review domain terms are excluded; `why`/`use` are Russian operator-facing data.
 */
export const STOP_WORDS: StopWord[] = [
  { re: w('проз[аыуе]'), why: 'книжное', use: 'текст' },
  { re: w('новь[её]'), why: 'сленг', use: 'новое' },
  { re: stem('докрут'), why: 'сленг', use: 'доработать' },
  { re: stem('обстук'), why: 'сленг', use: 'проверить' },
  { re: stem('запил'), why: 'сленг', use: 'сделать' },
  { re: stem('реифиц'), why: 'калька (reify)', use: 'создать объект / сохранить' },
  { re: stem('инстанцир'), why: 'калька (instantiate)', use: 'создать' },
  { re: w('дабы'), why: 'архаизм', use: 'чтобы' },
  { re: w('посему'), why: 'архаизм', use: 'поэтому' },
  { re: w('сие'), why: 'архаизм', use: 'это' },
  { re: w('надлежит'), why: 'канцелярит', use: 'нужно / следует' },
  { re: w('зиждется'), why: 'книжное', use: 'основан на' },
  { re: stem('воззрени'), why: 'книжное', use: 'взгляд / подход' },
  { re: stem('лейтмотив'), why: 'книжное', use: 'основная мысль' },
];

// #endregion END_DICTIONARY

// #region START_FINDER

/** @purpose A found stop-word occurrence. */
export type StopWordHit = {
  /** @purpose The matched word as it appears in the text. */
  word: string;
  /** @purpose 1-based line number of the match. */
  line: number;
  /** @purpose 1-based column number of the match. */
  col: number;
  /** @purpose Reason category from the dictionary (Russian data). */
  why: string;
  /** @purpose Suggested replacement from the dictionary (Russian data). */
  use: string;
};

/**
 * @purpose Find stop-words in text, skipping code and comments (mentions-as-tokens, not usage).
 * @invariant Skips inline backticks, fenced blocks, HTML comments; `<!-- stop-ok -->` opts a line out. Pure.
 * @param text Text to scan (markdown / prompt).
 * @returns Hits in order of appearance; empty when clean.
 */
export function findStopWords(text: string): StopWordHit[] {
  const hits: StopWordHit[] = [];
  // HTML comments are agent guidance, not operator output — strip them, keeping the line count.
  const origLines = text.split('\n');
  const withoutComments = text.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, ' '));
  const lines = withoutComments.split('\n');
  let inFence = false;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();

    if (trimmed.startsWith('```')) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if (origLines[i].includes('<!-- stop-ok')) continue;

    const scrubbed = raw.replace(/`[^`]*`/g, (m) => ' '.repeat(m.length));

    for (const sw of STOP_WORDS) {
      const re = new RegExp(
        sw.re.source,
        sw.re.flags.includes('g') ? sw.re.flags : sw.re.flags + 'g'
      );
      let m: RegExpExecArray | null;
      while ((m = re.exec(scrubbed)) !== null) {
        hits.push({ word: m[0], line: i + 1, col: m.index + 1, why: sw.why, use: sw.use });
        if (m.index === re.lastIndex) re.lastIndex++;
      }
    }
  }

  return hits;
}

// #endregion END_FINDER
