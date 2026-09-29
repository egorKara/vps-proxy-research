import { createHash } from 'node:crypto';

const iso = (value) => {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) throw new Error('invalid Statuspage date');
  return new Date(value).toISOString();
};
const decode = (value) => value.replace(/&(?:quot|amp|lt|gt|#39|#x27);/g, (entity) =>
  ({ '&quot;': '"', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&#39;': "'", '&#x27;': "'" })[entity]);
const titleMatches = (source, title) => source.kind === 'DIGITALOCEAN_STATUS'
  ? /\b(?:droplets?|FRA1)\b/i.test(title)
  : /virtual private servers|\bVPS\b/i.test(title);

export function statuspageHistory(html, source) {
  const directJson = html.trimStart().startsWith('{');
  const raw = directJson ? html : html.match(/data-react-class="HistoryIndex"\s+data-react-props="([^"]+)"/)?.[1];
  if (!raw) throw new Error('Statuspage history data missing');
  const data = JSON.parse(directJson ? raw : decode(raw));
  if (!Array.isArray(data.months) || !data.months.length || !data.start_time || !data.end_time) throw new Error('Statuspage history incomplete');
  const entries = [];
  for (const month of data.months) {
    if (!Number.isInteger(month.year) || !Array.isArray(month.incidents)) throw new Error('Statuspage history month invalid');
    for (const item of month.incidents) {
      if (!/^[a-z0-9]{12}$/.test(item.code) || typeof item.name !== 'string' || typeof item.message !== 'string') throw new Error('Statuspage history incident invalid');
      if (titleMatches(source, item.name)) entries.push({ id: item.code, marker: createHash('sha256').update(JSON.stringify([item.name,item.message,item.timestamp])).digest('hex') });
    }
  }
  return { start: iso(data.start_time), end: iso(data.end_time), entries };
}

export function statuspageDetail(raw, source, id) {
  const item = JSON.parse(raw).incident;
  if (!item || item.id !== id || typeof item.name !== 'string' || !titleMatches(source, item.name)) throw new Error('Statuspage incident mismatch');
  const startedAt = iso(item.started_at ?? item.created_at);
  const updatedAt = iso(item.updated_at);
  const planned = Boolean(item.scheduled_for) || /scheduled|maintenance/i.test(item.name);
  const endedAt = item.resolved_at ? iso(item.resolved_at) : null;
  const affected = Array.isArray(item.components) ? item.components.filter((x) => typeof x.name === 'string').map((x) => ({ type: 'SERVICE', value: x.name })) : [];
  if (affected.length === 0) affected.push({ type: 'SERVICE', value: source.scope });
  const kind = /\b(?:network|routing|connectivity|BGP)\b/i.test(item.name) ? 'B'
    : /\b(?:SSH|TLS|UDP|VPN)\b/i.test(item.name) ? 'C' : 'A';
  const url = `${new URL(source.url).origin}/incidents/${id}`;
  const evidenceId = `${source.id}:${id}`;
  return {
    event: { id: evidenceId, sourceId: source.id, class: kind, classProvenance: 'INFERRED', status: planned ? 'PLANNED' : endedAt ? 'RESOLVED' : 'OPEN',
      title: item.name, startedAt, endedAt, affected, cause: null, causeProvenance: 'UNKNOWN', evidenceIds: [evidenceId], sourceUpdatedAt: updatedAt },
    evidence: { id: evidenceId, sourceId: source.id, url, observedAt: updatedAt,
      scope: `${source.scope}; provider incident; affected components: ${affected.map((x) => x.value).join(', ')}`, provenance: 'CONFIRMED' }
  };
}
