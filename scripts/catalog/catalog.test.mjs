import test from 'node:test';
import assert from 'node:assert/strict';
import { collect } from './collect.mjs';
import { load, stale, validateSnapshot, validateEditorial, validateProfiles, validateRegistry } from './model.mjs';
import { selectelIndex, selectelDetail, hetznerFeed, hetznerDetail, ripeHistory } from './adapters.mjs';
import { summarizeEvents } from './stats.mjs';
import { getText } from './http.mjs';
import { validateReport } from './cli.mjs';
import { statuspageHistory, statuspageDetail } from './statuspage.mjs';

const now = '2026-09-29T12:00:00Z';
const detail = `<main><h1 class="incident-title">Проблема сети SPB-1</h1><div class="incident--header"><span class="incident--type-name-tag status-type-minor">Minor incident</span><span class="incident--service">SPB-1</span><span class="incident--time-elapsed"><span data-js-date="2026-09-27T10:00:00"></span></span></div><hr><div class="activity"><a class="activity--type"><span>Решено</span></a><div class="activity--description"></div><span class="activity--date" data-js-date="2026-09-27T11:00:00"></span></div></main>`;
const index = (next = '') => `<table><tbody><tr><td><span data-js-date="2026-09-27T10:00:00"></span><a href="https://selectel.live/incidents/123">Проблема сети SPB-1</a></td></tr></tbody></table>${next ? '<a class="next-link" href="https://selectel.live/incidents?after=abc">Следующий</a>' : ''}`;
const fakeFetch = (bad = false, next = false) => async (url) => new Response(url.pathname.endsWith('/123') ? (bad ? '<html>changed markup</html>' : detail) : index(next), { status: 200 });

async function memoryStorage() {
  const files = Object.fromEntries(await Promise.all(['profiles.json','registry.json','nodes.json','pairs.json','editorial.json','snapshot.json'].map(async (name) => [name, await load(name)])));
  for (const source of files['registry.json'].sources) source.enabled = source.id === 'selectel-status';
  files['snapshot.json'] = { schemaVersion: 1, siteBuiltAt: null, events: [], bgpObservations: [], evidence: [], sourceState: {}, coverage: [], changelog: [] };
  const storage = { load: async (name) => structuredClone(files[name]), save: async (name, value) => { files[name] = structuredClone(value); } };
  return { files, storage };
}

test('normal collection, duplicate collection and corrected old event', async () => {
  const { files, storage } = await memoryStorage();
  const profileId = files['profiles.json'].activeProfileId;
  const first = await collect({ profileId, now, fetchImpl: fakeFetch(), maxPages: 1, storage });
  assert.equal(first.errors.length, 0);
  assert.equal(files['snapshot.json'].events.length, 1);
  const stable = await collect({ profileId, now: '2026-09-29T13:00:00Z', fetchImpl: fakeFetch(), maxPages: 1, storage });
  assert.equal(stable.changes, 0);
  assert.equal(files['snapshot.json'].events.length, 1);
  assert.equal(files['snapshot.json'].changelog.length, 2);
  const updated = detail.replace('2026-09-27T11:00:00', '2026-09-27T12:00:00');
  const changed = await collect({ profileId, now: '2026-09-29T14:00:00Z',
    fetchImpl: async (url) => new Response(url.pathname.endsWith('/123') ? updated : index(), { status: 200 }), maxPages: 1, storage });
  assert.equal(changed.errors.length, 0);
  assert.equal(files['snapshot.json'].events.length, 1);
  assert.equal(files['snapshot.json'].events[0].endedAt, '2026-09-27T12:00:00.000Z');
});

test('invalid batch and timeout preserve last good event', async () => {
  const { files, storage } = await memoryStorage();
  const profileId = files['profiles.json'].activeProfileId;
  await collect({ profileId, now, fetchImpl: fakeFetch(), maxPages: 1, storage });
  const good = structuredClone(files['snapshot.json'].events);
  const invalid = await collect({ profileId, now: '2026-09-29T13:00:00Z', fetchImpl: fakeFetch(true), maxPages: 1, storage });
  assert.equal(invalid.errors.length, 1);
  assert.deepEqual(files['snapshot.json'].events, good);
  assert.equal(files['snapshot.json'].sourceState['selectel-status'].lastSuccessAt, now);
  const timedOut = await collect({ profileId, now: '2026-09-29T14:00:00Z',
    fetchImpl: async () => { throw new DOMException('timed out', 'TimeoutError'); }, maxPages: 1, storage });
  assert.equal(timedOut.errors.length, 1);
  assert.deepEqual(files['snapshot.json'].events, good);
});

test('partial archive remains visibly incomplete and unknown profile inherits nothing', async () => {
  const { files, storage } = await memoryStorage();
  const profileId = files['profiles.json'].activeProfileId;
  await collect({ profileId, now, fetchImpl: fakeFetch(false, true), maxPages: 1, storage });
  assert.equal(files['snapshot.json'].sourceState['selectel-status'].backfillComplete, false);
  assert.ok(files['snapshot.json'].coverage.find((x) => x.class === 'A').gaps.some((gap) => gap.includes('backfill incomplete')));
  assert.equal(files['snapshot.json'].coverage.find((x) => x.class === 'C').observedStart, null);
  const p = structuredClone(files['profiles.json'].profiles[0]); p.id = 'other-context-v1';
  files['profiles.json'].profiles.push(p);
  const result = await collect({ profileId: p.id, now, fetchImpl: fakeFetch(), storage });
  assert.equal(result.selected, 0);
  assert.equal(files['snapshot.json'].coverage.filter((x) => x.profileId === p.id).length, 0);
});

test('source parsers fail closed and BGP stays separate from incidents', () => {
  assert.throws(() => selectelIndex('<html>no table</html>'));
  assert.throws(() => selectelDetail('<html>changed</html>', { id: 'selectel-status' }, '1', now));
  const atom = `<feed xmlns="http://www.w3.org/2005/Atom"><entry><updated>2026-09-28T00:00:00Z</updated><link href="https://status.hetzner.com/incident/0a75c7ae-3377-41dc-aabe-601063724d24" /></entry></feed>`;
  assert.equal(hetznerFeed(atom).length, 1);
  const nextData = { props: { pageProps: { incident: { uuid:'0a75c7ae-3377-41dc-aabe-601063724d24', titleEn:'Cloud servers affected', startTime:'2026-09-27T10:00:00Z', endTime:'2026-09-27T11:00:00Z', updatedAt:'2026-09-27T11:00:00Z', system:'/systems/2' }, systems:[{ '@id':'/systems/2', titleEn:'Cloud' }] } } };
  const parsed = hetznerDetail(`<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(nextData)}</script>`, { id:'hetzner-status' }, nextData.props.pageProps.incident.uuid, now);
  assert.equal(parsed.event.status, 'RESOLVED');
  nextData.props.pageProps.incident.incidentType = 'maintenance';
  const planned = hetznerDetail(`<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(nextData)}</script>`, { id:'hetzner-status' }, nextData.props.pageProps.incident.uuid, now);
  assert.equal(planned.event.status, 'PLANNED');
  const bgp = ripeHistory(JSON.stringify({ status:'ok', data:{ query_starttime:'2026-09-01T00:00:00Z', query_endtime:'2026-09-02T00:00:00Z', by_origin:[{ origin:3333, prefixes:[{ prefix:'193.0.0.0/21', timelines:[{ starttime:'2026-09-01T00:00:00Z', endtime:'2026-09-02T00:00:00Z' }] }] }] } }), { id:'ripestat-routing-history' }, 'AS3333', now);
  assert.equal(bgp.observations[0].class, 'BGP_OBSERVATION');
});

test('RIPEstat completed backfill uses overlap, not the full archive', async () => {
  const { files, storage } = await memoryStorage();
  const profileId = files['profiles.json'].activeProfileId;
  for (const source of files['registry.json'].sources) source.enabled = source.id === 'ripestat-routing-history';
  Object.assign(files['registry.json'].sources.find((s) => s.id === 'ripestat-routing-history'), { enabled:true, profileIds:[profileId], resources:['AS3333'] });
  files['snapshot.json'].sourceState['ripestat-routing-history'] = { lastAttemptAt:now, lastSuccessAt:now, error:null, nextCursor:null, backfillComplete:true };
  let requestedStart = null;
  const response = async (url) => {
    requestedStart = url.searchParams.get('starttime');
    return new Response(JSON.stringify({ status:'ok', data:{ by_origin:[], query_starttime:requestedStart, query_endtime:url.searchParams.get('endtime') } }), { status:200 });
  };
  const result = await collect({ profileId, now, fetchImpl:response, storage });
  assert.equal(result.errors.length, 0);
  assert.equal(requestedStart, '2026-09-22T12:00:00.000Z');
  assert.equal(files['snapshot.json'].events.length, 0);
});

test('RIPEstat resumes after a 30-day pause and keeps a visible gap until caught up', async () => {
  const { files, storage } = await memoryStorage();
  const profileId = files['profiles.json'].activeProfileId;
  for (const source of files['registry.json'].sources) source.enabled = source.id === 'ripestat-routing-history';
  Object.assign(files['registry.json'].sources.find((s) => s.id === 'ripestat-routing-history'), { profileIds:[profileId], resources:['AS3333'] });
  files['snapshot.json'].sourceState['ripestat-routing-history'] = { lastAttemptAt:'2026-08-30T12:00:00Z', lastSuccessAt:'2026-08-30T12:00:00Z', error:null, nextCursor:null, backfillComplete:true, observedEnd:'2026-08-30T12:00:00Z' };
  const windows = [];
  const response = async (url) => {
    const start = url.searchParams.get('starttime'), end = url.searchParams.get('endtime');
    windows.push([start,end]);
    return new Response(JSON.stringify({ status:'ok', data:{ by_origin:[], query_starttime:start, query_endtime:end } }), { status:200 });
  };
  await collect({ profileId, now, fetchImpl:response, storage });
  assert.equal(windows[0][0], '2026-08-23T12:00:00.000Z');
  assert.equal(files['snapshot.json'].sourceState['ripestat-routing-history'].backfillComplete, false);
  assert.ok(files['snapshot.json'].coverage.find((x) => x.class === 'BGP').gaps.length);
  await collect({ profileId, now, fetchImpl:response, storage });
  assert.equal(windows[1][0], windows[0][1]);
  assert.equal(files['snapshot.json'].sourceState['ripestat-routing-history'].backfillComplete, true);
});

test('Statuspage history and detail import are bounded, deduplicated and scoped', async () => {
  const { files, storage } = await memoryStorage();
  const profileId = files['profiles.json'].activeProfileId;
  for (const source of files['registry.json'].sources) source.enabled = source.id === 'digitalocean-status';
  const source = files['registry.json'].sources.find((s) => s.id === 'digitalocean-status');
  const incident = { id:'abcdefghijkl', name:'Droplet outage in FRA1', started_at:'2026-09-27T10:00:00Z', updated_at:'2026-09-27T11:00:00Z', resolved_at:'2026-09-27T11:00:00Z', components:[{name:'Droplets - FRA1'}] };
  const props = { start_time:'2026-07-01T00:00:00Z', end_time:'2026-09-30T23:59:59Z', months:[{ name:'September', year:2026, incidents:[{ code:incident.id, name:incident.name, message:'Resolved', timestamp:'Sep 27, 11:00 UTC' }] }] };
  const html = `<div data-react-class="HistoryIndex" data-react-props="${JSON.stringify(props).replaceAll('"','&quot;')}"></div>`;
  assert.equal(statuspageHistory(html,source).entries.length,1);
  assert.equal(statuspageHistory(JSON.stringify(props),source).entries.length,1);
  assert.equal(statuspageDetail(JSON.stringify({incident}),source,incident.id).event.affected[0].value,'Droplets - FRA1');
  let detailRequests = 0;
  const fetchImpl = async (url) => {
    if (url.pathname.includes('/api/v2/incidents/')) { detailRequests++; return new Response(JSON.stringify({incident}),{status:200}); }
    return new Response(html,{status:200});
  };
  const first = await collect({profileId,now,fetchImpl,storage});
  assert.equal(first.errors.length,0);
  assert.equal(files['snapshot.json'].events.length,1);
  assert.equal(files['snapshot.json'].coverage.find((x) => x.sourceId === source.id && x.class === 'A').observedStart,'2026-09-27T10:00:00.000Z');
  assert.equal(files['snapshot.json'].sourceState[source.id].backfillComplete,false);
  const repeat = await collect({profileId,now,fetchImpl,storage});
  assert.equal(repeat.changes,0);
  assert.equal(detailRequests,1);
  assert.equal(files['snapshot.json'].events.length,1);
  assert.equal(files['snapshot.json'].coverage.find((x) => x.sourceId === source.id && x.class === 'A').observedStart,'2026-09-27T10:00:00.000Z');
  const changedProps = structuredClone(props);
  changedProps.months[0].incidents[0].message = 'New update';
  const changedHistory = JSON.stringify(changedProps);
  const missing = await collect({profileId,now,fetchImpl:async (url) =>
    new Response(url.pathname.includes('/api/v2/incidents/') ? '' : changedHistory,
      {status:url.pathname.includes('/api/v2/incidents/') ? 404 : 200}),storage});
  assert.equal(missing.errors.length,1);
  assert.deepEqual(files['snapshot.json'].sourceState[source.id].unavailableDetails,[incident.id]);
  assert.ok(files['snapshot.json'].coverage.find((x) => x.sourceId === source.id && x.class === 'A').gaps.some((x) => x.includes(incident.id)));
  await collect({profileId,now,fetchImpl:async (url) => new Response(url.pathname.includes('/api/v2/incidents/') ? JSON.stringify({incident}) : changedHistory,{status:200}),storage});
  assert.deepEqual(files['snapshot.json'].sourceState[source.id].unavailableDetails,[]);
  assert.equal(files['snapshot.json'].events.length,1);
  assert.throws(() => statuspageHistory('<html>broken</html>',source),/missing/);
});

test('report rejects IPv6 and Retry-After respects source wait budget', async () => {
  const profiles = await load('profiles.json');
  const base = { schemaVersion:1, profileId:profiles.activeProfileId, scope:'ORIGIN_TO_ENTRY', protocol:'TLS', observedAt:now, result:'UNKNOWN', summary:'No personal endpoints included' };
  assert.equal(validateReport(base, profiles), base);
  assert.throws(() => validateReport({ ...base, summary:'Endpoint [2001:db8::1]:443 unavailable' }, profiles), /IPv6/);
  assert.throws(() => validateReport({ ...base, summary:'2001:db8::1 unavailable' }, profiles), /IPv6/);
  let requests = 0;
  await assert.rejects(getText('https://selectel.live/incidents', { host:'selectel.live', fetchImpl:async () => {
    requests++;
    return new Response('', { status:429, headers:{ 'retry-after':'60' } });
  }}), /Retry-After exceeds/);
  assert.equal(requests, 1);
  await assert.rejects(getText('https://selectel.live/incidents', { host:'selectel.live', fetchImpl:async () =>
    new Response('', { status:429, headers:{ 'retry-after':new Date(Date.now()+60000).toUTCString() } }) }), /Retry-After exceeds/);
});

test('staleness and statistics exclude planned work and overlapping time', () => {
  assert.equal(stale({ lastSuccessAt:'2026-09-26T00:00:00Z' }, now, 'daily'), true);
  const events = [
    { id:'1', status:'RESOLVED', startedAt:'2026-09-27T10:00:00Z', endedAt:'2026-09-27T12:00:00Z' },
    { id:'2', status:'RESOLVED', startedAt:'2026-09-27T11:00:00Z', endedAt:'2026-09-27T13:00:00Z' },
    { id:'3', status:'PLANNED', startedAt:'2026-09-27T11:00:00Z', endedAt:'2026-09-27T13:00:00Z' }
  ];
  const stats = summarizeEvents(events);
  assert.equal(stats.knownEventCount, 2);
  assert.equal(stats.resolvedSampleSize, 2);
  assert.equal(stats.meanTimeToResolveMs, 7200000);
  assert.equal(stats.knownIntervalUnionMs, 10800000);
  assert.equal(stats.uptime, null);
});

test('validation rejects duplicate nodes and events without evidence; geographic fallback can remain a risk', async () => {
  const profiles = validateProfiles(await load('profiles.json'));
  const registry = validateRegistry(await load('registry.json'), profiles);
  assert.throws(() => validateEditorial({ schemaVersion:1, nodes:[{ id:'duplicate' }, { id:'duplicate' }] },
    { schemaVersion:1, pairs:[] }, { schemaVersion:1, decisions:[] }, profiles), /duplicate node id/);
  const empty = { schemaVersion:1, siteBuiltAt:null, events:[], bgpObservations:[], evidence:[], sourceState:{}, coverage:[], changelog:[] };
  empty.events.push({ id:'selectel-status:1', sourceId:'selectel-status', class:'A', classProvenance:'INFERRED', status:'OPEN', title:'example',
    startedAt:now, endedAt:null, affected:[], cause:null, causeProvenance:'UNKNOWN', evidenceIds:[] });
  assert.throws(() => validateSnapshot(empty, registry, profiles), /invalid event links/);
  const property = { value:null, sourceUrl:'https://selectel.live/', observedAt:now, scope:'unknown', provenance:'UNKNOWN' };
  const node = (id) => ({ id, properties: Object.fromEntries(['brand','owner','city','datacenter','asn','prefixes','plan','resources','ipv4','recovery'].map((key) => [key, property])) });
  const pair = { id:'fallback', profileId:profiles.activeProfileId, entryNodeId:'entry', foreignNodeId:'foreign',
    price:{ amount:null, currency:null, observedAt:now, components:[], sourceUrl:'https://selectel.live/', scope:'unknown', provenance:'UNKNOWN' },
    criteria:[{ id:'entry-location', status:'RISK', provenance:'INFERRED', mandatory:false, reason:'nearby city', evaluatedAt:now, sourceUrl:'https://selectel.live/' },
      { id:'foreign-exit', status:'RISK', provenance:'INFERRED', mandatory:false, reason:'nearby EU fallback', evaluatedAt:now, sourceUrl:'https://selectel.live/' }],
    dependencies:[], geoconcentration:'not established', decision:'UNDECIDED', decisionAt:null, reason:'needs review', homeRouteStatus:'UNKNOWN' };
  assert.equal(validateEditorial({ schemaVersion:1, nodes:[node('entry'),node('foreign')] },
    { schemaVersion:1, pairs:[pair] }, { schemaVersion:1, decisions:[] }, profiles), true);
  const linked = { ...node('linked'), statusSourceIds:['selectel-status'] };
  assert.equal(validateEditorial({ schemaVersion:1, nodes:[linked] },
    { schemaVersion:1, pairs:[] }, { schemaVersion:1, decisions:[] }, profiles, registry), true);
  assert.throws(() => validateEditorial({ schemaVersion:1, nodes:[{ ...linked, statusSourceIds:['missing-source'] }] },
    { schemaVersion:1, pairs:[] }, { schemaVersion:1, decisions:[] }, profiles, registry), /unknown status source/);
  assert.throws(() => validateEditorial({ schemaVersion:1, nodes:[{ ...linked, statusSourceIds:['selectel-status','selectel-status'] }] },
    { schemaVersion:1, pairs:[] }, { schemaVersion:1, decisions:[] }, profiles, registry), /duplicate status source/);
});
