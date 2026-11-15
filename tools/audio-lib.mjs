// Pure helpers for generating pronunciation audio (no network, no file access).
export function speakable(text) {
  return text.replace(/~/g, ' ').replace(/\s+/g, ' ').trim();
}

export function buildRequest(text, { voice, rate }) {
  return {
    input: { text },
    voice: { languageCode: 'en-US', name: voice },
    audioConfig: { audioEncoding: 'MP3', speakingRate: rate },
  };
}

export function pendingWords(words, existingIds, limit = Infinity) {
  return words.filter((w) => !existingIds.has(w.id)).slice(0, limit);
}

export function totalChars(words) {
  return words.reduce((n, w) => n + speakable(w.en).length, 0);
}
