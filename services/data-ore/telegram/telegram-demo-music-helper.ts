import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import type { Dialog } from '@mtcute/node';
import type { MessageContext } from '@mtcute/dispatcher';
import { OpenRouterProvider } from '@services/ai-client/providers/open-router/open-router-provider.ts';
import { isLikelyAboutMusic } from 'assistant/music/music-filter.ts';

// const MODEL_FREE = 'google/gemma-3n-e2b-it:free';
// const openAiLike = new OpenRouterProvider({
//   baseURL: 'https://openrouter.ai/api/v1',
//   apiKey: process.env.GENNADY_OPENROUTER_API_KEY,
// });

const MODEL_FREE = 'glm-4.5-air';
const openAiLike = new OpenRouterProvider({
  baseURL: 'https://llm-proxy.vkteam.ru/v1',
  apiKey: process.env.LLM_PROXY_API_KEY!,
});

const MUSIC_PROMPT_TEMPLATE = readFileSync('assistant/music/music-prompt.md', 'utf-8');
const MUSIC_REPORT_PATH = join(homedir(), '.gennady', 'tg', 'music-report.md');

type TelegramSource = Dialog | MessageContext;

type MusicReleaseRelated = {
  artist: string;
  title: string | null;
  relation: string;
};

type MusicRelease = {
  artist: string;
  type: string;
  title: string;
  links: string[];
  features: string[];
  related: MusicReleaseRelated[];
};

type TelegramMessageContext = {
  text: string;
  chatTitle: string;
  chatUsername: string | null;
  messageId: number | null;
  senderUsername: string | null;
  senderDisplayName: string | null;
};

function ensureReportDirExists(): void {
  mkdirSync(dirname(MUSIC_REPORT_PATH), { recursive: true });
}

function extractTelegramContext(source: TelegramSource): TelegramMessageContext | null {
  if ('lastMessage' in source) {
    const dialog = source as Dialog;
    const message = dialog.lastMessage;

    if (!message) {
      return null;
    }

    const text = message.text ?? '';
    const peer: unknown = dialog.peer;
    const peerAny = peer as { title?: string; displayName?: string; username?: string | null };

    const chatTitle = peerAny.title ?? peerAny.displayName ?? '';
    const chatUsername = peerAny.username ?? null;

    const sender: unknown = (message as unknown as { sender?: unknown }).sender;
    const senderAny = sender as { username?: string | null; displayName?: string | null } | null;

    return {
      text,
      chatTitle,
      chatUsername,
      messageId: (message as unknown as { id?: number }).id ?? null,
      senderUsername: senderAny?.username ?? null,
      senderDisplayName: senderAny?.displayName ?? null,
    };
  }

  const update = source as MessageContext;
  const text = update.text ?? '';

  const chatAny = update.chat as
    | { displayName?: string; username?: string | null }
    | null
    | undefined;

  const senderAny = update.sender as
    | { username?: string | null; displayName?: string | null }
    | null
    | undefined;

  return {
    text,
    chatTitle: chatAny?.displayName ?? '',
    chatUsername: chatAny?.username ?? null,
    messageId: update.id ?? null,
    senderUsername: senderAny?.username ?? null,
    senderDisplayName: senderAny?.displayName ?? null,
  };
}

function sliceJsonArray(raw: string): string {
  const firstIndex = raw.indexOf('[');
  const lastIndex = raw.lastIndexOf(']');

  if (firstIndex === -1 || lastIndex === -1 || lastIndex <= firstIndex) {
    return raw;
  }

  return raw.slice(firstIndex, lastIndex + 1);
}

function parseReleases(raw: string): MusicRelease[] | null {
  const jsonText = sliceJsonArray(raw);

  let parsed: unknown;

  try {
    parsed = JSON.parse(jsonText);
  } catch (error) {
    console.error(`${MODEL_FREE} json-parse-error`, { error });
    return null;
  }

  if (!Array.isArray(parsed)) {
    return null;
  }

  return parsed as MusicRelease[];
}

function formatReleaseMarkdown(
  ctx: TelegramMessageContext,
  releases: MusicRelease[],
  durationMs: number
): string {
  const parts: string[] = [];
  const now = new Date().toISOString();

  parts.push(`## ${ctx.chatTitle || 'Unknown chat'} — ${now}`);

  const chatLink =
    ctx.chatUsername && ctx.messageId ? `https://t.me/${ctx.chatUsername}/${ctx.messageId}` : null;

  const authorLabel =
    ctx.senderDisplayName ?? (ctx.senderUsername ? `@${ctx.senderUsername}` : 'Unknown author');

  const authorLink = ctx.senderUsername ? `https://t.me/${ctx.senderUsername}` : null;

  parts.push('');
  parts.push(`- **Model**: ${MODEL_FREE} (${durationMs.toFixed(2)}ms)`);
  parts.push(`- **Chat**: ${ctx.chatTitle}${chatLink ? ` — [link](${chatLink})` : ''}`);
  parts.push(`- **Author**: ${authorLabel}${authorLink ? ` — [profile](${authorLink})` : ''}`);

  parts.push('');
  parts.push('- **Source message**:');
  parts.push('');
  parts.push('```');
  parts.push(ctx.text);
  parts.push('```');

  parts.push('');
  parts.push(`- **Releases** (${releases.length}):`);
  parts.push('');

  releases.forEach((release, index) => {
    parts.push(`  - **${index + 1}. ${release.artist} — "${release.title}" (${release.type})**`);

    if (release.links?.length) {
      const linkItems = release.links.map((link, i) => `[link ${i + 1}](${link})`).join(', ');
      parts.push(`    - **Links**: ${linkItems}`);
    }

    if (release.features?.length) {
      parts.push(`    - **Features**: ${release.features.join(', ')}`);
    }

    if (release.related?.length) {
      const relatedItems = release.related
        .map((rel) => {
          const title = rel.title ? ` — "${rel.title}"` : '';
          return `${rel.artist}${title} (${rel.relation})`;
        })
        .join('; ');

      parts.push(`    - **Related**: ${relatedItems}`);
    }
  });

  return parts.join('\n');
}

function appendToReport(markdown: string): void {
  ensureReportDirExists();

  let previous = '';

  try {
    previous = readFileSync(MUSIC_REPORT_PATH, 'utf-8');
  } catch {
    previous = '';
  }

  const nextContent = previous ? `${markdown}\n\n${previous}` : markdown;
  writeFileSync(MUSIC_REPORT_PATH, nextContent, 'utf-8');
}

/**
 * @purpose Generate structured music release description from Telegram data.
 * @param source Telegram dialog or message context.
 */
export async function generateMusicDescription(source: TelegramSource): Promise<void> {
  try {
    const ctx = extractTelegramContext(source);

    if (!ctx) {
      return;
    }

    if (!ctx.text || !isLikelyAboutMusic(ctx.text)) {
      return;
    }

    const start = performance.now();
    const prompt = MUSIC_PROMPT_TEMPLATE.replace(/%TEXT%/, ctx.text);

    const raw = await openAiLike.generateText(MODEL_FREE, prompt);
    const durationMs = performance.now() - start;

    const releases = parseReleases(raw);

    if (!releases || releases.length === 0) {
      console.info(`${MODEL_FREE} no-releases`, { durationMs });
      return;
    }

    const markdown = formatReleaseMarkdown(ctx, releases, durationMs);
    appendToReport(markdown);

    console.info(`${MODEL_FREE} releases-written`, {
      count: releases.length,
      durationMs,
    });
  } catch (error: unknown) {
    const err = error as { statusCode?: number; responseBody?: unknown };
    console.error(`${MODEL_FREE} error`, err);
  }
}
