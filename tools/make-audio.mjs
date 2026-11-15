// Generates one pronunciation mp3 per word with the Google Cloud Text-to-Speech API.
//
//   PowerShell:  $env:GOOGLE_TTS_API_KEY = "<your key>"
//                node tools/make-audio.mjs --limit 20     (try a small batch first)
//                node tools/make-audio.mjs                (everything; safe to re-run, skips existing files)
//   Preview without a key or network:  node tools/make-audio.mjs --dry
//
// The key is read from the environment only and is sent in a request header, never logged or written to disk.
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRequest, pendingWords, speakable, totalChars } from './audio-lib.mjs';

const DEFAULT_ENDPOINT = 'https://texttospeech.googleapis.com/v1/text:synthesize';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function synthesize({ text, endpoint, apiKey, voice, rate, retries, retryDelayMs, fetchImpl }) {
  let lastError = 'unknown error';
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetchImpl(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify(buildRequest(text, { voice, rate })),
      });
      if (res.ok) {
        const json = await res.json();
        if (!json.audioContent) throw new Error('response had no audioContent');
        return Buffer.from(json.audioContent, 'base64');
      }
      let detail = '';
      try { detail = (await res.json())?.error?.message ?? ''; } catch { /* ignore */ }
      lastError = `HTTP ${res.status}${detail ? `: ${detail}` : ''}`;
      if (res.status !== 429 && res.status < 500) throw Object.assign(new Error(lastError), { fatal: true });
    } catch (e) {
      if (e.fatal) throw e;
      lastError = e.message;
    }
    if (attempt < retries) await sleep(retryDelayMs * 2 ** attempt);
  }
  throw new Error(lastError);
}

export async function generate({
  words, outDir, endpoint = DEFAULT_ENDPOINT, apiKey, voice, rate = 0.9,
  concurrency = 4, limit = Infinity, retries = 4, retryDelayMs = 1000, fetchImpl = fetch, onProgress = () => {},
}) {
  mkdirSync(outDir, { recursive: true });
  const fileOf = (id) => join(outDir, `${id}.mp3`);
  const hasFile = (id) => existsSync(fileOf(id)) && statSync(fileOf(id)).size > 0;

  const existing = new Set(words.filter((w) => hasFile(w.id)).map((w) => w.id));
  const skipped = existing.size;
  const todo = pendingWords(words, existing, limit);
  const failed = [];
  let generated = 0;
  let next = 0;

  const writeManifest = () => {
    const ids = [...new Set([...existing])].sort((a, b) => a - b);
    writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(ids));
  };

  async function worker() {
    while (next < todo.length) {
      const w = todo[next++];
      try {
        const audio = await synthesize({ text: speakable(w.en), endpoint, apiKey, voice, rate, retries, retryDelayMs, fetchImpl });
        const tmp = `${fileOf(w.id)}.part`;
        writeFileSync(tmp, audio);
        renameSync(tmp, fileOf(w.id));
        existing.add(w.id);
        generated++;
        if (generated % 100 === 0) writeManifest();
      } catch (e) {
        failed.push({ id: w.id, en: w.en, error: String(e.message).slice(0, 200) });
      }
      onProgress({ done: generated + failed.length, total: todo.length });
    }
  }

  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));
  writeManifest();
  return { generated, skipped, failed };
}

function parseArgs(argv) {
  const o = { dry: false, limit: Infinity, voice: process.env.TTS_VOICE || 'en-US-Neural2-F', rate: 0.9, out: 'audio' };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--dry') o.dry = true;
    else if (argv[i] === '--limit') o.limit = Number(argv[++i]);
    else if (argv[i] === '--voice') o.voice = argv[++i];
    else if (argv[i] === '--rate') o.rate = Number(argv[++i]);
    else if (argv[i] === '--out') o.out = argv[++i];
  }
  return o;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const opts = parseArgs(process.argv.slice(2));
  const words = JSON.parse(readFileSync('data/words.json', 'utf8'));
  const outDir = opts.out;
  const have = new Set(words.filter((w) => existsSync(join(outDir, `${w.id}.mp3`))).map((w) => w.id));
  const todo = pendingWords(words, have, opts.limit);
  console.log(`단어 ${words.length}개 중 이미 있는 mp3 ${have.size}개, 만들 것 ${todo.length}개, 글자 수 약 ${totalChars(todo)}자 (목소리 ${opts.voice})`);
  if (opts.dry) {
    console.log('--dry: 아무것도 만들지 않았습니다. (구글 요금은 목소리 종류와 월 무료 한도에 따라 다르니 콘솔에서 확인하세요)');
  } else if (!process.env.GOOGLE_TTS_API_KEY) {
    console.error('환경변수 GOOGLE_TTS_API_KEY가 없습니다. PowerShell: $env:GOOGLE_TTS_API_KEY = "키"');
    process.exit(2);
  } else {
    const r = await generate({
      words, outDir, apiKey: process.env.GOOGLE_TTS_API_KEY, voice: opts.voice, rate: opts.rate, limit: opts.limit,
      onProgress: ({ done, total }) => { if (done % 50 === 0 || done === total) process.stdout.write(`\r${done}/${total}`); },
    });
    console.log(`\n만든 것 ${r.generated}개, 건너뛴 것 ${r.skipped}개, 실패 ${r.failed.length}개`);
    for (const f of r.failed.slice(0, 20)) console.log(` - ${f.id} ${f.en}: ${f.error}`);
    process.exit(r.failed.length ? 1 : 0);
  }
}
