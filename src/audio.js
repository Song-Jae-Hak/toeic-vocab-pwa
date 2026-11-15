// Pronunciation audio: files are audio/<id>.mp3 and audio/manifest.json lists which ids exist.
export const AUDIO_CACHE = 'toeic-audio-v1';

export function audioUrl(id) {
  return `audio/${id}.mp3`;
}

export function parseManifest(json) {
  if (!Array.isArray(json)) return new Set();
  return new Set(json.filter((n) => Number.isInteger(n) && n > 0));
}

// Returns the audio Blob (from the Cache API when present, otherwise fetched and cached) or null if unavailable.
export async function loadAudioBlob(id, { cache, fetchImpl = fetch } = {}) {
  const url = audioUrl(id);
  try {
    if (cache) {
      const hit = await cache.match(url);
      if (hit) return await hit.blob();
    }
    const res = await fetchImpl(url);
    if (!res.ok) return null;
    if (cache) {
      try { await cache.put(url, res.clone()); } catch { /* storage full or blocked: still play it */ }
    }
    return await res.blob();
  } catch {
    return null;
  }
}
