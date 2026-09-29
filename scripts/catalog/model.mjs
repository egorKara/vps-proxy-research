import { readFile, writeFile, rename } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';

export const dataDir = new URL('../../src/data/catalog/', import.meta.url);
export const choices = new Set(['PASS', 'RISK', 'UNKNOWN']);
export const provenance = new Set(['CONFIRMED', 'INFERRED', 'UNKNOWN']);

const assert = (condition, message) => { if (!condition) throw new Error(message); };
const string = (value) => typeof value === 'string' && value.trim().length > 0;
const date = (value) => string(value) && !Number.isNaN(Date.parse(value));
const unique = (values, label) => assert(new Set(values).size === values.length, `duplicate ${label}`);
const url = (value) => {
  try { return new URL(value).protocol === 'https:'; } catch { return false; }
};

export async function load(name) {
  return JSON.parse(await readFile(new URL(name, dataDir), 'utf8'));
}

export async function atomicJson(path, value) {
  const destination = path instanceof URL ? path : new URL(path, dataDir);
  const temporary = new URL(`./.${destination.pathname.split('/').at(-1)}.${randomUUID()}.tmp`, destination);
  try {
    await writeFile(temporary, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
    await rename(temporary, destination);
  } catch (error) {
    try { await import('node:fs/promises').then((fs) => fs.unlink(temporary)); } catch {}
    throw error;
  }
}

export function validateProfiles(data) {
  assert(data?.schemaVersion === 1 && Array.isArray(data.profiles), 'invalid profiles schema');
  unique(data.profiles.map((x) => x.id), 'profile id');
  assert(data.profiles.some((x) => x.id === data.activeProfileId), 'active profile missing');
  for (const p of data.profiles) {
    assert(/^[a-z0-9][a-z0-9-]{2,79}$/.test(p.id), 'invalid profile id');
    assert(Number.isInteger(p.version) && p.version > 0, 'invalid profile version');
    assert(string(p.originLocation?.city) && /^[A-Z]{2}$/.test(p.originLocation?.country), 'invalid origin location');
    assert(string(p.originProvider?.name), 'invalid origin provider');
    assert(p.originProvider.asn === null || (Number.isInteger(p.originProvider.asn) && p.originProvider.asn > 0), 'invalid origin ASN');
    assert(string(p.foreignExit?.city) && /^[A-Z]{2}$/.test(p.foreignExit?.country), 'invalid exit location');
    assert(date(p.evidence?.observedAt) && string(p.evidence?.scope), 'profile evidence missing');
  }
  return data;
}

export function validateRegistry(data, profiles) {
  assert(data?.schemaVersion === 1 && Array.isArray(data.sources), 'invalid registry schema');
  unique(data.sources.map((x) => x.id), 'source id');
  const profileIds = new Set(profiles.profiles.map((x) => x.id));
  const hosts = { 'INCIDENT_HTML': 'selectel.live', 'INCIDENT_ATOM': 'status.hetzner.com', 'BGP_HISTORY': 'stat.ripe.net',
    'DIGITALOCEAN_STATUS': 'status.digitalocean.com', 'OVHCLOUD_STATUS': 'bare-metal-servers.status-ovhcloud.com' };
  for (const source of data.sources) {
    assert(string(source.id) && hosts[source.kind], 'invalid source kind/id');
    assert(url(source.url) && new URL(source.url).hostname === hosts[source.kind], 'source outside fixed host allowlist');
    assert(Array.isArray(source.profileIds) && source.profileIds.every((id) => profileIds.has(id)), 'unknown source profile');
    assert(typeof source.enabled === 'boolean' && Number.isInteger(source.historyMonths) && source.historyMonths >= 6 && source.historyMonths <= 12, 'invalid source configuration');
    if (source.kind === 'BGP_HISTORY') assert(Array.isArray(source.resources) && source.resources.every((x) => /^(AS\d+|[0-9a-f.:]+\/\d+)$/i.test(x)), 'invalid BGP resources');
    if (source.kind === 'DIGITALOCEAN_STATUS' || source.kind === 'OVHCLOUD_STATUS')
      assert(source.url === `https://${hosts[source.kind]}/history` && Number.isInteger(source.maxDetailsPerRun) && source.maxDetailsPerRun >= 1 && source.maxDetailsPerRun <= 30, 'invalid Statuspage source');
  }
  return data;
}

function validateProperty(property) {
  assert(property && 'value' in property && url(property.sourceUrl) && date(property.observedAt) && string(property.scope) && provenance.has(property.provenance), 'invalid sourced property');
}

export function validateEditorial(nodes, pairs, editorial, profiles, registry = null) {
  assert(nodes?.schemaVersion === 1 && Array.isArray(nodes.nodes), 'invalid nodes');
  assert(pairs?.schemaVersion === 1 && Array.isArray(pairs.pairs), 'invalid pairs');
  assert(editorial?.schemaVersion === 1 && Array.isArray(editorial.decisions), 'invalid editorial decisions');
  unique(nodes.nodes.map((x) => x.id), 'node id');
  const ids = new Set(nodes.nodes.map((x) => x.id));
  for (const n of nodes.nodes) {
    assert(string(n.id) && n.properties && typeof n.properties === 'object', 'invalid node');
    const statusSourceIds = n.statusSourceIds ?? [];
    assert(Array.isArray(statusSourceIds) && statusSourceIds.every(string), `node ${n.id} invalid status sources`);
    unique(statusSourceIds, `status source in node ${n.id}`);
    assert(statusSourceIds.every((id) => registry?.sources.some((source) => source.id === id)), `node ${n.id} unknown status source`);
    for (const key of ['brand', 'owner', 'city', 'datacenter', 'asn', 'prefixes', 'plan', 'resources', 'ipv4', 'recovery']) assert(key in n.properties, `node ${n.id} missing ${key}`);
    for (const property of Object.values(n.properties)) validateProperty(property);
  }
  const profileIds = new Set(profiles.profiles.map((x) => x.id));
  unique(pairs.pairs.map((x) => x.id), 'pair id');
  for (const p of pairs.pairs) {
    assert(string(p.id) && profileIds.has(p.profileId) && ids.has(p.entryNodeId) && ids.has(p.foreignNodeId) && p.entryNodeId !== p.foreignNodeId, 'invalid pair links');
    assert(p.price && (p.price.amount === null || (typeof p.price.amount === 'number' && p.price.amount >= 0)) && (p.price.currency === null || /^[A-Z]{3}$/.test(p.price.currency)) && date(p.price.observedAt) && Array.isArray(p.price.components) && url(p.price.sourceUrl) && string(p.price.scope) && provenance.has(p.price.provenance), 'invalid structured price');
    assert(Array.isArray(p.criteria) && p.criteria.every((c) => string(c.id) && choices.has(c.status) && provenance.has(c.provenance) && typeof c.mandatory === 'boolean' && string(c.reason) && date(c.evaluatedAt) && (c.sourceUrl === null && c.status === 'UNKNOWN' || url(c.sourceUrl))), 'invalid criteria');
    for (const id of ['entry-location', 'foreign-exit']) assert(p.criteria.some((c) => c.id === id), `pair missing ${id}`);
    assert(Array.isArray(p.dependencies) && string(p.geoconcentration), 'pair dependence assessment missing');
    assert(['INCLUDED', 'EXCLUDED', 'UNDECIDED'].includes(p.decision) && string(p.reason) && (p.decision === 'UNDECIDED' ? p.decisionAt === null : date(p.decisionAt)), 'invalid pair decision');
    assert(!p.criteria.some((c) => c.mandatory && c.status === 'RISK') || p.decision === 'EXCLUDED', 'mandatory failure must exclude pair');
    assert(p.homeRouteStatus === 'UNKNOWN', 'home route cannot be passed by catalog data');
  }
  for (const d of editorial.decisions) assert(profileIds.has(d.profileId) && string(d.reason) && date(d.decidedAt), 'invalid editorial decision');
  return true;
}

export function validateSnapshot(snapshot, registry, profiles) {
  assert(snapshot?.schemaVersion === 1, 'invalid snapshot version');
  assert(snapshot.siteBuiltAt === null || date(snapshot.siteBuiltAt), 'invalid site build date');
  for (const key of ['events', 'bgpObservations', 'evidence', 'coverage', 'changelog']) assert(Array.isArray(snapshot[key]), `invalid ${key}`);
  assert(snapshot.sourceState && typeof snapshot.sourceState === 'object', 'invalid source state');
  const sourceIds = new Set(registry.sources.map((x) => x.id));
  const profileIds = new Set(profiles.profiles.map((x) => x.id));
  unique(snapshot.events.map((x) => x.id), 'event id');
  unique(snapshot.bgpObservations.map((x) => x.id), 'BGP observation id');
  unique(snapshot.evidence.map((x) => x.id), 'evidence id');
  const evidenceIds = new Set(snapshot.evidence.map((x) => x.id));
  for (const e of snapshot.evidence) assert(sourceIds.has(e.sourceId) && url(e.url) && date(e.observedAt) && string(e.scope) && provenance.has(e.provenance), 'invalid evidence');
  for (const e of snapshot.events) {
    assert(string(e.id) && sourceIds.has(e.sourceId) && ['A','B','C','UNKNOWN'].includes(e.class) && provenance.has(e.classProvenance) && ['OPEN','RESOLVED','PLANNED','UNKNOWN'].includes(e.status), 'invalid event');
    assert(string(e.title) && date(e.startedAt) && (e.endedAt === null || date(e.endedAt)) && (!e.endedAt || Date.parse(e.endedAt) >= Date.parse(e.startedAt)), 'invalid event dates');
    assert(Array.isArray(e.affected) && e.affected.every((x) => ['SERVICE','SITE','REGION','ASN','PREFIX'].includes(x.type) && string(x.value)) && Array.isArray(e.evidenceIds) && e.evidenceIds.length > 0 && e.evidenceIds.every((id) => evidenceIds.has(id)), 'invalid event links');
    assert(provenance.has(e.causeProvenance) && (e.cause === null || string(e.cause)), 'invalid event cause');
  }
  for (const b of snapshot.bgpObservations) assert(sourceIds.has(b.sourceId) && string(b.resource) && date(b.startedAt) && date(b.endedAt) && b.class === 'BGP_OBSERVATION', 'invalid BGP observation');
  for (const c of snapshot.coverage) assert(profileIds.has(c.profileId) && sourceIds.has(c.sourceId) && ['A','B','C','BGP'].includes(c.class) && date(c.requestedStart) && (c.observedStart === null || date(c.observedStart)) && Array.isArray(c.gaps), 'invalid coverage');
  for (const [id, state] of Object.entries(snapshot.sourceState)) assert(sourceIds.has(id) && (state.lastAttemptAt === null || date(state.lastAttemptAt)) && (state.lastSuccessAt === null || date(state.lastSuccessAt)), 'invalid source state');
  return snapshot;
}

export function stale(state, now, frequency) {
  if (!state?.lastSuccessAt) return true;
  const limit = frequency === 'weekly' ? 14 * 86400000 : 48 * 3600000;
  return Date.parse(now) - Date.parse(state.lastSuccessAt) > limit;
}

export function upsertById(oldItems, newItems) {
  const map = new Map(oldItems.map((x) => [x.id, x]));
  const changes = [];
  for (const item of newItems) {
    const previous = map.get(item.id);
    if (JSON.stringify(previous) !== JSON.stringify(item)) {
      changes.push({ id: item.id, change: previous ? 'UPDATED' : 'ADDED' });
      map.set(item.id, item);
    }
  }
  return { items: [...map.values()].sort((a,b) => a.id.localeCompare(b.id)), changes };
}
