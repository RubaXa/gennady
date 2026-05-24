// @file: Reads a secret from stdin without echoing (masks with *).
// @consumers: telegram-demo
// @tasks: N/A

import * as QRCode from 'qrcode';
import { Dialog, TelegramClient, User, type TelegramClientOptions } from '@mtcute/node';
import { Dispatcher, MessageContext } from '@mtcute/dispatcher';
import type { DialogsQuery } from './telegram-data-ore.types.ts';
import { generateMusicDescription } from './telegram-demo-music-helper.ts';

type PeerLike = {
  type: string;
  chatType?: string;
  isBot?: boolean;
  isSupport?: boolean;
  username?: string;
  displayName?: string;
};

/**
 * @purpose Telegram client wrapper providing authentication and dialog retrieval.
 */
export class TelegramDataOre {
  /** @purpose Underlying mtcute Telegram client instance */
  protected _client: TelegramClient;
  /** @purpose Message dispatcher for routing incoming updates */
  protected _dispatcher: Dispatcher;

  /**
   * @purpose Initialize the Telegram client with given options and wire up message handler.
   * @param options Telegram client configuration options.
   */
  constructor(options: TelegramClientOptions) {
    this._client = new TelegramClient(options);
    this._dispatcher = Dispatcher.for(
      this._client as unknown as Parameters<typeof Dispatcher.for>[0]
    );

    this._dispatcher.onNewMessage(this._handleNewMessage);
  }

  /**
   * @purpose Authorize the Telegram client, using QR login as fallback.
   * @returns Authenticated user object.
   */
  async authorize(): Promise<User> {
    try {
      return await this._client.start();
    } catch {}

    return await this._client.signInQr({
      onUrlUpdated: async (url, expires) => {
        console.info('onUrlUpdated:', url, expires);
        const qr = await QRCode.toString(url, { type: 'terminal' });
        console.info(qr);
        return Promise.resolve(true);
      },
      onQrScanned: (code?: string) => {
        console.info('onQrScanned:', code);
        return Promise.resolve(true);
      },
      password: (hint?: string) => readSecretFromCli(hint),
    });
  }

  /**
   * @purpose Retrieve dialogs from Telegram with optional query filters.
   * @param query Optional query parameters for filtering and pagination.
   * @returns Async iterable iterator of dialogs.
   */
  async getDialogs(query?: DialogsQuery): Promise<AsyncIterableIterator<Dialog>> {
    const limit = query?.limit ?? 100;

    // В Telegram:
    // folder: 0 — список обычных диалогов
    // folder: 1 — список архивированных диалогов
    // поэтому если нам нужны все вместе с архивом, передаём undefined
    const folderId = query?.includedArchived ? undefined : 0;

    const results = await this._client.iterDialogs({
      folder: folderId,
      limit: limit,
    });

    return results;
  }

  /** @purpose Handler for incoming Telegram messages, formats and prints them. */
  protected _handleNewMessage = async (update: MessageContext, _state: never) => {
    const getChatIcon = (peer: PeerLike): string => {
      if (peer.type === 'user') {
        return '💬';
      }

      switch (peer.chatType) {
        case 'group':
        case 'supergroup':
        case 'gigagroup':
          return '👥';
        case 'channel':
          return '📣';
        case 'monoforum':
          return '💭';
        default:
          return '💬';
      }
    };

    const getPeerIcon = (peer: PeerLike): string => {
      if (peer.type === 'user') {
        if (peer.isBot) {
          return '🤖';
        }

        if (peer.isSupport) {
          return '🛟';
        }

        return '👤';
      }

      switch (peer.chatType) {
        case 'channel':
          return '📣';
        case 'monoforum':
          return '💭';
        default:
          return '👥';
      }
    };

    const messageId = update.id;
    const chat = update.chat as unknown as PeerLike;
    const chatIcon = getChatIcon(chat);
    const chatName = chat.displayName ?? '';

    const sender = update.sender as unknown as PeerLike;
    const senderIcon = getPeerIcon(sender);
    const senderLabelRaw = sender.username ?? sender.displayName ?? '';
    const senderLabel = senderLabelRaw.trim() === '' ? '🥷' : senderLabelRaw.trim();

    const headerParts: string[] = [];
    headerParts.push(`${chatIcon} ${messageId}`);
    headerParts.push(chatName);

    headerParts.push(`${senderIcon} ${senderLabel}`);

    let header = headerParts.join(' → ');

    try {
      const replyTo = await update.getReplyTo();

      if (replyTo) {
        const replySender = replyTo.sender as unknown as PeerLike;
        const replySenderIcon = getPeerIcon(replySender);
        const replySenderLabelRaw = replySender.username ?? replySender.displayName ?? '';
        const replySenderLabel =
          replySenderLabelRaw.trim() === '' ? '🥷' : replySenderLabelRaw.trim();

        header += ` @ ${replySenderIcon} ${replySenderLabel}`;
      }
    } catch {
      // ignore reply fetch errors
    }

    const text = update.text ?? '';
    const textPreview = text.length > 100 ? `${text.slice(0, 100)}…` : text;

    const links: string[] = [];

    for (const entity of update.entities ?? []) {
      if (entity.is('url')) {
        links.push(entity.text);
      } else if (entity.is('text_link')) {
        links.push(entity.params.url);
      }
    }

    const parts = [header];
    if (textPreview) parts.push(textPreview);
    if (links.length > 0) links.forEach((link) => parts.push(` - ${link}`));
    parts.push('---');
    const msg = parts.join('\n');

    console.info(msg);
    await generateMusicDescription(update);
  };
}

/**
 * Reads a secret from stdin without echoing (masks with *).
 * @param hint Optional hint shown in the prompt.
 */
function readSecretFromCli(hint?: string): Promise<string> {
  const prompt = hint ? `Password (${hint}): ` : 'Password: ';
  return new Promise((resolve) => {
    const stdin = process.stdin;
    const wasRaw = stdin.isRaw ?? false;
    stdin.setRawMode?.(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    process.stdout.write(prompt);
    let secret = '';
    const onData = (chunk: string) => {
      const lines = chunk.split(/\r?\n/);
      const done = (value: string) => {
        stdin.removeListener('data', onData);
        stdin.pause();
        stdin.setRawMode?.(wasRaw);
        process.stdout.write('\n');
        resolve(value);
      };
      if (lines.length > 1) {
        done(secret + lines[0]);
        return;
      }
      const c = chunk;
      if (c === '\n' || c === '\r' || c === '\u0004') {
        done(secret);
        return;
      }
      if (c === '\u0003') {
        process.exit(130);
      }
      if (c === '\b' || c === '\u007f') {
        secret = secret.slice(0, -1);
        process.stdout.write('\b \b');
        return;
      }
      secret += c;
      process.stdout.write('*');
    };
    stdin.on('data', onData);
  });
}
