import { getText } from './http.mjs';

const decode = (s) => s.replace(/&(?:amp|lt|gt|quot|apos|#\d+|#x[\da-f]+);/gi, (e) => {
  const named = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'" };
  if (named[e]) return named[e];
  if (e.startsWith('&#x')) return String.fromCodePoint(parseInt(e.slice(3, -1), 16));
  return String.fromCodePoint(parseInt(e.slice(2, -1), 10));
});
const plain = (s) => decode(s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
const iso = (s) => {
  if (!s || Number.isNaN(Date.parse(s))) throw new Error(`invalid source date: ${s}`);
  return new Date(s.endsWith('Z') || /[+-]\d\d:\d\d$/.test(s) ? s : `${s}Z`).toISOString();
};
const tag = (xml, name) => xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i'))?.[1];
const sourceEvidence = (source, id, url, factDate, scope) => ({ id: `${source.id}:${id}`, sourceId: source.id, url, observedAt: factDate, scope, provenance: 'CONFIRMED' });
const classify = (text) => {
  if (/\b(?:SSH|TLS|UDP|VPN)\b/i.test(text)) return 'C';
  if (/сеть|маршрут|транзит|BGP|network|backbone|routing/i.test(text)) return 'B';
  if (/сервер|ЦОД|электро|облак|VDS|DC\d|datacenter|power|cloud/i.test(text)) return 'A';
  return 'UNKNOWN';
};

export function selectelIndex(html, base = 'https://selectel.live/incidents') {
  const body = html.match(/<tbody\b[^>]*>([\s\S]*?)<\/tbody>/i)?.[1];
  if (!body) throw new Error('Selectel history table missing');
  const rows = [...body.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((m) => {
    const row = m[1];
    const href = row.match(/<a\b[^>]*href="([^"]+)"/i)?.[1];
    const date = row.match(/data-js-date="([^"]+)"/i)?.[1];
    if (!href || !date) throw new Error('Selectel history row missing link/date');
    const url = new URL(decode(href), base);
    if (url.hostname !== 'selectel.live' || !/^\/incidents\/\d+$/.test(url.pathname)) throw new Error('Selectel history link invalid');
    return { id: url.pathname.split('/').at(-1), url: url.href, startedAt: iso(date), title: plain(row.match(/<a\b[^>]*>([\s\S]*?)<\/a>/i)?.[1] ?? '') };
  });
  if (!rows.length) throw new Error('Selectel history unexpectedly empty');
  const nextRaw = html.match(/<a\b[^>]*class="next-link"[^>]*href="([^"]+)"/i)?.[1];
  const next = nextRaw ? new URL(decode(nextRaw), base) : null;
  if (next && (next.hostname !== 'selectel.live' || next.pathname !== '/incidents')) throw new Error('Selectel pagination link invalid');
  return { rows, next: next?.href ?? null };
}

export function selectelDetail(html, source, id, now) {
  const title = plain(html.match(/<h1\b[^>]*class="incident-title"[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? '');
  const header = html.match(/<div\b[^>]*class="incident--header"[^>]*>([\s\S]*?)<hr>/i)?.[1] ?? '';
  const start = header.match(/data-js-date="([^"]+)"/i)?.[1];
  const type = plain(header.match(/class="incident--type-name-tag[^" ]*[^\"]*"[^>]*>([\s\S]*?)<\/span>/i)?.[1] ?? '');
  const affected = [...header.matchAll(/class="incident--service"[^>]*>([\s\S]*?)<\/span>/gi)].map((m) => plain(m[1]));
  const activities = [...html.matchAll(/<div\b[^>]*class="activity"[^>]*>([\s\S]*?)<\/div>\s*<span class="activity--date"[^>]*data-js-date="([^"]+)"/gi)].map((m) => ({ label: plain(m[1].match(/class="activity--type"[^>]*>[\s\S]*?<span>([\s\S]*?)<\/span>/i)?.[1] ?? ''), date: m[2] }));
  if (!title || !start || !type || !affected.length) throw new Error('Selectel incident detail incomplete');
  const resolved = activities.find((a) => /решено|resolved/i.test(a.label));
  const planned = /scheduled|maintenance|планов/i.test(type);
  const url = `https://selectel.live/incidents/${id}`;
  const scope = `Selectel status: ${affected.join(', ')}`;
  const kind = classify(`${title} ${affected.join(' ')}`);
  return {
    event: { id: `${source.id}:${id}`, sourceId: source.id, class: kind, classProvenance: kind === 'UNKNOWN' ? 'UNKNOWN' : 'INFERRED',
      status: planned ? 'PLANNED' : resolved ? 'RESOLVED' : 'OPEN', title, startedAt: iso(start),
      endedAt: resolved ? iso(resolved.date) : null,
      affected: affected.map((value) => ({ type: /^(?:SPB|MSK|NSK|HEL|FSN|FRA)[-\d]/i.test(value) ? 'SITE' : 'SERVICE', value })),
      cause: null, causeProvenance: 'UNKNOWN',
      evidenceIds: [`${source.id}:${id}`], sourceUpdatedAt: activities.length ? iso(activities[0].date) : iso(start) },
    evidence: sourceEvidence(source, id, url, activities.length ? iso(activities[0].date) : iso(start), scope)
  };
}

export function hetznerFeed(xml) {
  if (!/<feed\b/.test(xml)) throw new Error('Hetzner Atom feed missing');
  const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/gi)].map((m) => {
    const raw = m[1];
    const urlRaw = raw.match(/<link\b[^>]*href="([^"]+)"/i)?.[1];
    const url = urlRaw ? new URL(decode(urlRaw)) : null;
    if (!url || url.hostname !== 'status.hetzner.com' || !/^\/incident\/[0-9a-f-]{36}$/.test(url.pathname)) throw new Error('Hetzner incident link invalid');
    return { id: url.pathname.split('/').at(-1), url: url.href, updatedAt: iso(plain(tag(raw, 'updated') ?? '')) };
  });
  if (!entries.length) throw new Error('Hetzner Atom feed unexpectedly empty');
  return entries;
}

export function hetznerDetail(html, source, id, now) {
  const json = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/)?.[1];
  if (!json) throw new Error('Hetzner incident data missing');
  const props = JSON.parse(json).props?.pageProps;
  const item = props?.incident;
  if (!item || item.uuid !== id || !item.startTime || !item.titleEn) throw new Error('Hetzner incident detail incomplete');
  const system = props.systems?.find((x) => x['@id'] === item.system);
  const affected = [system?.titleEn ?? 'Hetzner unspecified system'];
  const endedAt = item.endTime ? iso(item.endTime) : null;
  const scope = `Hetzner status: ${affected.join(', ')}`;
  const kind = classify(`${item.titleEn} ${affected.join(' ')}`);
  return {
    event: { id: `${source.id}:${id}`, sourceId: source.id, class: kind, classProvenance: kind === 'UNKNOWN' ? 'UNKNOWN' : 'INFERRED',
      status: /maintenance|scheduled/i.test(item.incidentType) ? 'PLANNED' : endedAt ? 'RESOLVED' : 'OPEN',
      title: item.titleEn, startedAt: iso(item.startTime), endedAt,
      affected: affected.map((value) => ({ type: 'SERVICE', value })),
      cause: null, causeProvenance: 'UNKNOWN', evidenceIds: [`${source.id}:${id}`], sourceUpdatedAt: iso(item.updatedAt) },
    evidence: sourceEvidence(source, id, `https://status.hetzner.com/incident/${id}`, iso(item.updatedAt), scope)
  };
}

export function ripeHistory(json, source, resource, now) {
  const response = JSON.parse(json);
  if (response.status !== 'ok' || !Array.isArray(response.data?.by_origin) || !response.data.query_starttime || !response.data.query_endtime) throw new Error('invalid RIPEstat routing history');
  const observations = [];
  for (const origin of response.data.by_origin) for (const prefix of origin.prefixes ?? []) for (const period of prefix.timelines ?? []) {
    const startedAt = iso(period.starttime), endedAt = iso(period.endtime);
    observations.push({ id: `${source.id}:${resource}:${origin.origin}:${prefix.prefix}:${startedAt}`,
      sourceId: source.id, class: 'BGP_OBSERVATION', resource, origin: origin.origin,
      prefix: prefix.prefix, startedAt, endedAt, observedAt: now,
      scope: 'RIPE RIS collector observations; not application availability' });
  }
  return { observations, observedStart: iso(response.data.query_starttime), observedEnd: iso(response.data.query_endtime) };
}

export async function fetchSource(url, host, fetchImpl) {
  return getText(url, { host, fetchImpl });
}
