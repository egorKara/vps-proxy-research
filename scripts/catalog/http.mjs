const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function getText(url, { host, timeoutMs = 8000, attempts = 3, maxBytes = 750000, fetchImpl = fetch } = {}) {
  const target = new URL(url);
  if (target.protocol !== 'https:' || target.hostname !== host) throw new Error('request outside source host');
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const response = await fetchImpl(target, {
        signal: AbortSignal.timeout(timeoutMs), redirect: 'manual',
        headers: { 'accept': 'application/json, application/atom+xml, text/html;q=0.9', 'user-agent': 'vps-proxy-research/0.1 (public-data)' }
      });
      if (response.status === 429 || response.status >= 500) {
        const header = response.headers.get('retry-after');
        const seconds = header !== null && /^\d+(?:\.\d+)?$/.test(header) ? Number(header) : null;
        const retryAfterMs = seconds !== null ? seconds * 1000 : header ? Date.parse(header) - Date.now() : null;
        lastError = new Error(`HTTP ${response.status}`);
        if (attempt + 1 < attempts) {
          if (retryAfterMs !== null && Number.isFinite(retryAfterMs) && retryAfterMs > 8000) throw new Error(`HTTP ${response.status}: Retry-After exceeds 8-second wait budget`);
          await delay(retryAfterMs !== null && Number.isFinite(retryAfterMs) ? Math.max(0, retryAfterMs) : 500 * 2 ** attempt);
        }
        continue;
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const reader = response.body.getReader();
      const chunks = [];
      let size = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > maxBytes) { await reader.cancel(); throw new Error('response too large'); }
        chunks.push(value);
      }
      return new TextDecoder().decode(Buffer.concat(chunks));
    } catch (error) {
      lastError = error;
      if (attempt + 1 < attempts && (error.name === 'TimeoutError' || error.name === 'AbortError')) await delay(500 * 2 ** attempt);
      else break;
    }
  }
  throw lastError;
}
