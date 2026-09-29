import { load, atomicJson, validateProfiles, validateRegistry, validateEditorial, validateSnapshot, upsertById } from './model.mjs';
import { fetchSource, selectelIndex, selectelDetail, hetznerFeed, hetznerDetail, ripeHistory } from './adapters.mjs';
import { statuspageHistory, statuspageDetail } from './statuspage.mjs';

const monthsAgo = (now, months) => {
  const value = new Date(now);
  value.setUTCMonth(value.getUTCMonth() - months);
  return value.toISOString();
};
const minimumDate = (dates) => dates.length ? new Date(Math.min(...dates.map(Date.parse))).toISOString() : null;
const maximumDate = (dates) => dates.length ? new Date(Math.max(...dates.map(Date.parse))).toISOString() : null;
const coverage = (profileId, sourceId, kind, requestedStart, observedStart, observedEnd, gaps, backfillComplete) =>
  ({ profileId, sourceId, class: kind, requestedStart, observedStart, observedEnd, gaps, backfillComplete });

async function collectSelectel(source, previous, now, fetchImpl, maxPages) {
  const cutoff = monthsAgo(now, source.historyMonths);
  const backfill = !previous.backfillComplete;
  const startUrl = backfill ? previous.nextCursor ?? source.url : previous.refreshCursor ?? source.url;
  const indexUrls = [startUrl];
  const seen = new Set();
  const rows = [];
  let nextCursor = null;
  let complete = previous.backfillComplete ?? false;
  let reachedEnd = false;
  let pages = 0;
  if (startUrl !== source.url) {
    const recent = selectelIndex(await fetchSource(source.url, 'selectel.live', fetchImpl), source.url);
    rows.push(...recent.rows.filter((x) => Date.parse(x.startedAt) >= Date.parse(cutoff)));
  }
  while (indexUrls.length && pages < maxPages) {
    const url = indexUrls.shift();
    if (seen.has(url)) throw new Error('Selectel pagination loop');
    seen.add(url);
    const parsed = selectelIndex(await fetchSource(url, 'selectel.live', fetchImpl), source.url);
    rows.push(...parsed.rows.filter((x) => Date.parse(x.startedAt) >= Date.parse(cutoff)));
    pages++;
    const reachedCutoff = parsed.rows.some((x) => Date.parse(x.startedAt) < Date.parse(cutoff));
    if (reachedCutoff || !parsed.next) { complete = true; reachedEnd = true; nextCursor = null; break; }
    nextCursor = parsed.next;
    indexUrls.push(parsed.next);
  }
  const byId = new Map(rows.map((x) => [x.id, x]));
  const events = [], evidence = [];
  for (const row of byId.values()) {
    const detail = selectelDetail(await fetchSource(row.url, 'selectel.live', fetchImpl), source, row.id, now);
    events.push(detail.event); evidence.push(detail.evidence);
  }
  const dates = rows.map((x) => x.startedAt).filter((x) => Date.parse(x) <= Date.parse(now));
  return { events, evidence, bgpObservations: [], nextCursor: backfill && !complete ? nextCursor : null,
    refreshCursor: !backfill && !reachedEnd ? nextCursor : null,
    backfillComplete: complete, observedStart: minimumDate(dates), observedEnd: maximumDate(dates), requestedStart: cutoff,
    gaps: complete ? ['Provider reports do not establish all incidents or coverage of a specific VPS']
      : ['Archive backfill incomplete; next cursor saved', 'Provider reports do not establish all incidents or coverage of a specific VPS'],
    classes: ['A', 'B', 'C'] };
}

async function collectHetzner(source, previous, now, fetchImpl) {
  const cutoff = monthsAgo(now, source.historyMonths);
  const feed = hetznerFeed(await fetchSource(source.url, 'status.hetzner.com', fetchImpl));
  const events = [], evidence = [];
  for (const entry of feed) {
    if (Date.parse(entry.updatedAt) < Date.parse(cutoff)) continue;
    const detail = hetznerDetail(await fetchSource(entry.url, 'status.hetzner.com', fetchImpl), source, entry.id, now);
    events.push(detail.event); evidence.push(detail.evidence);
  }
  const dates = feed.map((x) => x.updatedAt).filter((x) => Date.parse(x) >= Date.parse(cutoff));
  return { events, evidence, bgpObservations: [], nextCursor: null, backfillComplete: false,
    observedStart: minimumDate(dates), observedEnd: maximumDate(dates), requestedStart: cutoff,
    gaps: ['Atom feed has no confirmed historical pagination; earlier incidents may be missing',
      'Provider reports do not establish all incidents or coverage of a specific VPS'], classes: ['A', 'B', 'C'] };
}

async function collectRipe(source, previous, now, fetchImpl) {
  if (!source.resources.length) throw new Error('RIPEstat has no verified resources');
  const cutoff = monthsAgo(now, source.historyMonths);
  // Continue from the last successful window, with a bounded overlap for late RIS updates.
  const lastEnd = previous.observedEnd ?? previous.lastSuccessAt;
  const overlap = lastEnd ? new Date(Math.max(Date.parse(cutoff), Date.parse(lastEnd) - 7 * 86400000)).toISOString() : cutoff;
  const start = previous.nextCursor ?? overlap;
  const end = new Date(Math.min(Date.parse(now), Date.parse(start) + 30 * 86400000)).toISOString();
  const bgpObservations = [];
  const observed = [];
  for (const resource of source.resources) {
    const url = new URL(source.url);
    url.searchParams.set('resource', resource);
    url.searchParams.set('starttime', start);
    url.searchParams.set('endtime', end);
    const result = ripeHistory(await fetchSource(url.href, 'stat.ripe.net', fetchImpl), source, resource, now);
    bgpObservations.push(...result.observations);
    observed.push(result.observedStart, result.observedEnd);
  }
  const complete = Date.parse(end) >= Date.parse(now);
  return { events: [], evidence: [], bgpObservations, nextCursor: complete ? null : end,
    backfillComplete: complete, observedStart: minimumDate(observed), observedEnd: maximumDate(observed), requestedStart: cutoff,
    gaps: complete ? [] : ['RIPEstat history between the last successful window and now is still being filled'], classes: ['BGP'] };
}

async function collectStatuspage(source, previous, now, fetchImpl) {
  const cutoff = monthsAgo(now, source.historyMonths);
  const origin = new URL(source.url).origin;
  const markers = { ...(previous.historyMarkers ?? {}) };
  const events = [], evidence = [];
  const earlierUnavailable = previous.unavailableDetails ?? [...(previous.error ?? '').matchAll(/Official incident detail unavailable: ([a-z0-9]{12})/g)].map((match) => match[1]);
  const unavailable = new Set(earlierUnavailable);
  let remaining = source.maxDetailsPerRun;
  const cache = new Map();
  const page = async (number) => {
    if (number > 5) throw new Error('Statuspage history exceeds five quarterly pages');
    if (!cache.has(number)) cache.set(number, statuspageHistory(await fetchSource(`${origin}/history?page=${number}`, new URL(source.url).hostname, fetchImpl), source));
    return cache.get(number);
  };
  const scan = async (number, offset) => {
    const history = await page(number);
    let index = offset;
    for (; index < history.entries.length; index++) {
      const entry = history.entries[index];
      if (markers[entry.id] === entry.marker) continue;
      if (remaining === 0) break;
      let detail;
      try {
        detail = statuspageDetail(await fetchSource(`${origin}/api/v2/incidents/${entry.id}.json`, new URL(source.url).hostname, fetchImpl), source, entry.id);
      } catch (error) {
        if (error.message !== 'HTTP 404') throw error;
        unavailable.add(entry.id);
        remaining--;
        continue;
      }
      unavailable.delete(entry.id);
      if (Date.parse(detail.event.startedAt) >= Date.parse(cutoff)) {
        events.push(detail.event); evidence.push(detail.evidence);
      }
      markers[entry.id] = entry.marker;
      remaining--;
    }
    return { history, index };
  };
  const cursor = /^([1-5]):(\d+)$/.exec(previous.nextCursor ?? '1:0');
  if (!cursor) throw new Error('Statuspage cursor invalid');
  const targetPage = Number(cursor[1]), targetOffset = Number(cursor[2]);
  const recent = await scan(1, targetPage === 1 ? targetOffset : 0);
  let target = recent;
  const recentPending = targetPage > 1 && recent.index < recent.history.entries.length;
  if (targetPage > 1 && !recentPending) target = await scan(targetPage, targetOffset);
  let complete = previous.backfillComplete ?? false;
  let nextCursor = null;
  if (!complete) {
    if (recentPending) nextCursor = previous.nextCursor;
    else if (target.index < target.history.entries.length) nextCursor = `${targetPage}:` + target.index;
    else if (Date.parse(target.history.start) <= Date.parse(cutoff)) complete = true;
    else nextCursor = `${targetPage + 1}:0`;
  }
  if (previous.backfillComplete && targetPage === 1) {
    const refreshPage = previous.refreshCursor === '3' ? 3 : 2;
    if (remaining > 0) await scan(refreshPage, 0);
  }
  return { events, evidence, bgpObservations: [], nextCursor, refreshCursor: complete ? (previous.refreshCursor === '2' ? '3' : '2') : null,
    partialErrors: [...unavailable].sort().map((id) => `Official incident detail unavailable: ${id}`),
    unavailableDetails: [...unavailable].sort(),
    historyMarkers: markers, backfillComplete: complete, observedStart: null, observedEnd: now, requestedStart: cutoff,
    gaps: complete ? ['Provider status history does not prove effects on a particular VPS or full service availability']
      : ['Six-month status history is still being imported', 'Provider status history does not prove effects on a particular VPS or full service availability'],
    classes: ['A', 'B', 'C'] };
}

export async function collect({ profileId, sourceId = null, now = new Date().toISOString(), fetchImpl = fetch, maxPages = null, storage = null } = {}) {
  const read = storage?.load ?? load;
  const save = storage?.save ?? atomicJson;
  const profiles = validateProfiles(await read('profiles.json'));
  const registry = validateRegistry(await read('registry.json'), profiles);
  validateEditorial(await read('nodes.json'), await read('pairs.json'), await read('editorial.json'), profiles, registry);
  const snapshot = validateSnapshot(await read('snapshot.json'), registry, profiles);
  if (!profiles.profiles.some((x) => x.id === profileId)) throw new Error('unknown profile ID');
  const selected = registry.sources.filter((s) => s.enabled && s.profileIds.includes(profileId) && (!sourceId || s.id === sourceId));
  if (sourceId && !selected.length) throw new Error('source not enabled for profile');
  if (!selected.length) return { selected: 0, changes: 0, errors: [], reason: 'No matched sources; coverage remains UNKNOWN' };
  const result = structuredClone(snapshot);
  const errors = [];
  let changeCount = 0;
  for (const source of selected) {
    const previous = result.sourceState[source.id] ?? { lastAttemptAt: null, lastSuccessAt: null, error: null, nextCursor: null, backfillComplete: false };
    const attempt = { ...previous, lastAttemptAt: now, expectedFrequency: source.frequency };
    try {
      const batch = source.kind === 'INCIDENT_HTML'
        ? await collectSelectel(source, previous, now, fetchImpl, maxPages ?? source.maxPagesPerRun)
        : source.kind === 'INCIDENT_ATOM'
          ? await collectHetzner(source, previous, now, fetchImpl)
          : source.kind === 'DIGITALOCEAN_STATUS' || source.kind === 'OVHCLOUD_STATUS'
            ? await collectStatuspage(source, previous, now, fetchImpl)
            : await collectRipe(source, previous, now, fetchImpl);
      const next = structuredClone(result);
      const mergedEvents = upsertById(next.events, batch.events);
      const mergedEvidence = upsertById(next.evidence, batch.evidence);
      const mergedBgp = upsertById(next.bgpObservations, batch.bgpObservations);
      next.events = mergedEvents.items; next.evidence = mergedEvidence.items; next.bgpObservations = mergedBgp.items;
      next.sourceState[source.id] = { ...attempt, lastSuccessAt: now, error: batch.partialErrors?.length ? batch.partialErrors.join('; ').slice(0, 300) : null,
        nextCursor: batch.nextCursor, refreshCursor: batch.refreshCursor ?? null,
        backfillComplete: batch.backfillComplete, historyMarkers: batch.historyMarkers ?? previous.historyMarkers,
        unavailableDetails: batch.unavailableDetails ?? previous.unavailableDetails,
        observedEnd: batch.observedEnd ?? previous.observedEnd ?? null };
      const oldCoverage = next.coverage.filter((c) => c.profileId === profileId && c.sourceId === source.id);
      next.coverage = next.coverage.filter((c) => !(c.profileId === profileId && c.sourceId === source.id));
      for (const kind of batch.classes) {
        const classDates = next.events.filter((e) => e.sourceId === source.id && e.class === kind).map((e) => e.startedAt);
        const prior = oldCoverage.find((c) => c.class === kind);
        const reportedStart = kind === 'A' || kind === 'B' ? minimumDate(next.events
          .filter((e) => e.sourceId === source.id && e.class === kind && e.status !== 'PLANNED'
            && Date.parse(e.startedAt) >= Date.parse(batch.requestedStart) && Date.parse(e.startedAt) <= Date.parse(now))
          .map((e) => e.startedAt)) : null;
        const observedStart = kind === 'C' ? minimumDate(classDates) : minimumDate([prior?.observedStart, batch.observedStart, reportedStart].filter(Boolean));
        const combinedEnd = kind === 'C' ? maximumDate(classDates) : maximumDate([prior?.observedEnd, batch.observedEnd].filter(Boolean));
        const observedEnd = combinedEnd && Date.parse(combinedEnd) > Date.parse(now) ? now : combinedEnd;
        next.coverage.push(coverage(profileId, source.id, kind, batch.requestedStart,
          observedStart, observedEnd,
          kind === 'C' ? ['Provider incident reports do not establish complete application coverage or home-route reachability'] : [...batch.gaps, ...(batch.partialErrors ?? [])],
          batch.backfillComplete && kind !== 'C'));
      }
      const changes = [...mergedEvents.changes, ...mergedEvidence.changes, ...mergedBgp.changes];
      for (const change of changes) next.changelog.push({ at: now, sourceId: source.id, ...change });
      validateSnapshot(next, registry, profiles);
      Object.assign(result, next);
      changeCount += changes.length;
      if (batch.partialErrors?.length) errors.push({ sourceId: source.id, error: batch.partialErrors.join('; ').slice(0, 300) });
    } catch (error) {
      result.sourceState[source.id] = { ...attempt, error: String(error.message).slice(0, 300) };
      errors.push({ sourceId: source.id, error: String(error.message).slice(0, 300) });
    }
  }
  validateSnapshot(result, registry, profiles);
  await save('snapshot.json', result);
  return { selected: selected.length, changes: changeCount, errors, sourceState: result.sourceState };
}
