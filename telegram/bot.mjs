/**
 * Bot Telegram: comandos definidos en commands.json del repo.
 * Opcional: CONFIG_URL = URL raw de GitHub para actualizar respuestas sin redeploy.
 *
 * Env: TELEGRAM_BOT_TOKEN (obligatorio), CONFIG_URL (opcional), CONFIG_CACHE_MS (default 30000)
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const CONFIG_URL = (process.env.CONFIG_URL || '').trim();
const CACHE_MS = Math.max(5000, parseInt(process.env.CONFIG_CACHE_MS || '30000', 10) || 30000);

let cachedConfig = null;
let cachedAt = 0;
let localDefaults = null;

async function loadLocalCommands() {
  if (localDefaults) return localDefaults;
  const raw = await readFile(join(__dirname, 'commands.json'), 'utf8');
  localDefaults = JSON.parse(raw);
  return localDefaults;
}

async function fetchRemoteConfig() {
  if (!CONFIG_URL) return null;
  const res = await fetch(CONFIG_URL, { cache: 'no-store' });
  if (!res.ok) throw new Error('CONFIG_URL HTTP ' + res.status);
  return res.json();
}

async function getConfig() {
  const now = Date.now();
  if (cachedConfig && now - cachedAt < CACHE_MS) return cachedConfig;

  let merged = await loadLocalCommands();
  if (CONFIG_URL) {
    try {
      const remote = await fetchRemoteConfig();
      if (remote && remote.commands) {
        merged = {
          ...merged,
          ...remote,
          commands: { ...(merged.commands || {}), ...(remote.commands || {}) }
        };
      }
    } catch (e) {
      console.warn('[telegram] CONFIG_URL:', e.message);
    }
  }
  cachedConfig = merged;
  cachedAt = now;
  return merged;
}

function invalidateConfig() {
  cachedConfig = null;
  cachedAt = 0;
}

async function tg(method, body) {
  const url = `https://api.telegram.org/bot${TOKEN}/${method}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const j = await res.json().catch(() => ({}));
  if (!j.ok) console.warn('[telegram]', method, j);
  return j;
}

function parseCommand(text) {
  if (!text || typeof text !== 'string') return { cmd: '', args: '' };
  const t = text.trim();
  if (!t.startsWith('/')) return { cmd: '', args: '' };
  const space = t.indexOf(' ');
  const head = space === -1 ? t : t.slice(0, space);
  const args = space === -1 ? '' : t.slice(space + 1).trim();
  const at = head.indexOf('@');
  const cmd = (at === -1 ? head : head.slice(0, at)).slice(1).toLowerCase();
  return { cmd, args };
}

async function handleUpdate(update) {
  const msg = update.message || update.edited_message;
  if (!msg || !msg.chat) return;
  const chatId = msg.chat.id;
  const text = msg.text || '';
  const { cmd, args } = parseCommand(text);

  if (!cmd) return;

  const config = await getConfig();
  const defs = (config && config.commands) || {};
  const entry = defs[cmd];

  if (entry && entry.action === 'reload_config') {
    invalidateConfig();
    await getConfig();
  }

  let reply = entry && typeof entry.reply === 'string' ? entry.reply : null;
  if (!entry) {
    reply = 'Comando /' + cmd + ' no definido. Editá telegram/commands.json en el repo.';
  }
  if (entry && entry.include_chat_id) {
    reply = (reply ? reply + '\n\n' : '') + 'chat_id: ' + String(chatId);
  }
  if (!reply) reply = 'Sin respuesta configurada.';

  await tg('sendMessage', { chat_id: chatId, text: reply });
}

async function pollLoop() {
  let offset = 0;
  for (;;) {
    const url = new URL(`https://api.telegram.org/bot${TOKEN}/getUpdates`);
    url.searchParams.set('offset', String(offset));
    url.searchParams.set('timeout', '50');
    const res = await fetch(url);
    const data = await res.json();
    if (!data.ok) {
      console.error('[telegram] getUpdates:', data);
      await new Promise((r) => setTimeout(r, 5000));
      continue;
    }
    for (const u of data.result || []) {
      offset = u.update_id + 1;
      try {
        await handleUpdate(u);
      } catch (e) {
        console.error('[telegram] handleUpdate', e);
      }
    }
  }
}

async function main() {
  if (!TOKEN) {
    console.error('Falta TELEGRAM_BOT_TOKEN');
    process.exit(1);
  }
  await loadLocalCommands();
  await getConfig();
  console.log('[telegram] Bot en marcha. CONFIG_URL:', CONFIG_URL || '(solo archivo local)');
  await pollLoop();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
