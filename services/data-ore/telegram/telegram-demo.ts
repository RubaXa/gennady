import { dirname, join } from 'node:path';
import { TelegramDataOre } from './telegram-data-ore.ts';
import { homedir, hostname, platform, release } from 'node:os';
import { mkdirSync } from 'node:fs';
import { SqliteStorage } from '@mtcute/node';
import packageJson from '../../../package.json' with { type: 'json' };
import { generateMusicDescription } from './telegram-demo-music-helper.ts';

if (!process.env.GENNADY_OPENROUTER_API_KEY) {
  throw new Error('[telegram-demo] GENNADY_OPENROUTER_API_KEY is not set');
}

if (!process.env.GENNADY_TELEGRAM_API_ID) {
  throw new Error('[telegram-demo] GENNADY_TELEGRAM_API_ID is not set');
}

if (!process.env.GENNADY_TELEGRAM_API_HASH) {
  throw new Error('[telegram-demo] GENNADY_TELEGRAM_API_HASH is not set');
}

const storagePath = join(homedir(), '.gennady', 'tg', 'sessions', 'main.session');

mkdirSync(dirname(storagePath), { recursive: true });

export const tg = new TelegramDataOre({
  apiId: +process.env.GENNADY_TELEGRAM_API_ID,
  apiHash: process.env.GENNADY_TELEGRAM_API_HASH,
  storage: new SqliteStorage(storagePath),
  initConnectionOptions: {
    appVersion: `Gennady Assistant ${packageJson.version}`,
    deviceModel: hostname(),
    systemVersion: (() => {
      const osType = platform(); // 'darwin', 'win32', 'linux'
      const osRelease = release(); // Версия ядра

      switch (osType) {
        case 'darwin':
          // Для macOS нужно немного магии, чтобы получить красивую версию
          const major = parseInt(osRelease.split('.')[0], 10);
          const macOsVersion = major - 4; // 23.x.x -> macOS 14, 22.x.x -> macOS 13
          return `macOS ${macOsVersion}.${osRelease.split('.')[1]}`;
        case 'win32':
          const build = parseInt(osRelease.split('.')[2], 10);
          if (build >= 22000) return 'Windows 11';
          return 'Windows 10';
        case 'linux':
          return `Linux ${osRelease}`;
        default:
          return `${osType} ${osRelease}`;
      }
    })(),
  },
});

const user = await tg.authorize();
const dialogs = await tg.getDialogs();

console.info('User:', {
  id: user.id,
  username: user.username,
  displayName: user.displayName,
});

console.info('---');

for await (const dialog of dialogs) {
  const peer = dialog.peer;

  const peerId = peer.id;
  const peerType = peer.type;
  const peerUsername = peer.username ?? null;
  const peerTitle = 'title' in peer ? peer.title : peer.displayName;

  const unreadCount = dialog.unreadCount;

  const headerParts = [
    unreadCount ? `🔅 [${unreadCount}]` : null,
    `[${peerType}]`,
    `${peerTitle}`,
    peerUsername ? `@${peerUsername}` : null,
    `#${peerId}`,
  ].filter(Boolean);

  console.info(headerParts.join(' '));
  await generateMusicDescription(dialog);

  // if (lastMessage) {
  //   const text = lastMessage.text ?? '';
  //   const textPreview = text.length > 100 ? `${text.slice(0, 100)}…` : text;

  //   if (textPreview) {
  //     console.info(textPreview);
  //   }
  // }

  console.info('---');
}
