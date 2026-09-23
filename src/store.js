import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

// Every giveaway (running or ended) persists to the FadeHost bot's /data
// volume, so a restart picks the timers up again.
const DATA_FILE = process.env.CONFIG_PATH || '/data/giveaways.json';

let cache = null;

export async function load() {
  if (cache) return cache;
  try {
    cache = JSON.parse(await readFile(DATA_FILE, 'utf8'));
  } catch {
    cache = { giveaways: {} };
  }
  return cache;
}

export async function save() {
  try {
    await mkdir(dirname(DATA_FILE), { recursive: true });
    await writeFile(DATA_FILE, JSON.stringify(cache, null, 2));
  } catch (err) {
    console.error('[giveaway-bot] could not save:', err.message);
  }
}
