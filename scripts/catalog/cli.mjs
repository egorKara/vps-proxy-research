#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import { collect } from './collect.mjs';
import { load, atomicJson, validateProfiles, validateRegistry, validateEditorial, validateSnapshot } from './model.mjs';

const [command, subcommand, ...args] = process.argv.slice(2);
const options = () => Object.fromEntries(args.filter((x) => x.startsWith('--') && x.includes('=')).map((x) => x.slice(2).split(/=(.*)/s).slice(0, 2)));
const fail = (message) => { throw new Error(message); };
const identity = (city, country, provider, exitCity, exitCountry) =>
  JSON.stringify([city, country, provider, exitCity, exitCountry].map((x) => x.trim().toLowerCase()));

export async function validateAll() {
  const profiles = validateProfiles(await load('profiles.json'));
  const registry = validateRegistry(await load('registry.json'), profiles);
  validateEditorial(await load('nodes.json'), await load('pairs.json'), await load('editorial.json'), profiles, registry);
  validateSnapshot(await load('snapshot.json'), registry, profiles);
  const reports = await load('reports.json');
  if (reports.schemaVersion !== 1 || !Array.isArray(reports.reports)) fail('invalid reports');
  for (const report of reports.reports) validateReport(report, profiles);
  const policy = await load('policy.json');
  if (policy.schemaVersion !== 1 || policy.manualRun !== true || typeof policy.scheduleEnabled !== 'boolean' ||
      policy.cadenceHints?.daily?.staleAfterHours !== 48 || policy.cadenceHints?.weekly?.staleAfterDays !== 14) fail('invalid collection policy');
  return { profiles, registry };
}

export function validateReport(report, profiles) {
  if (!report || report.schemaVersion !== 1 || !profiles.profiles.some((x) => x.id === report.profileId)) fail('report profile invalid');
  if (!['ORIGIN_TO_ENTRY', 'ENTRY_TO_EXIT'].includes(report.scope) || !['SSH', 'TLS', 'UDP', 'VPN'].includes(report.protocol)) fail('report scope/protocol invalid');
  if (!report.observedAt || Number.isNaN(Date.parse(report.observedAt)) || !['PASS', 'RISK', 'UNKNOWN'].includes(report.result)) fail('report observation invalid');
  if (!report.summary || typeof report.summary !== 'string' || report.summary.length > 500) fail('report summary invalid');
  const raw = JSON.stringify(report);
  if (/\b(?:\d{1,3}\.){3}\d{1,3}\b|-----BEGIN|(?:api[_-]?key|token|password|secret)/i.test(raw)) fail('report contains possible IP or secret');
  if ((report.summary.match(/\[?[0-9a-f:]{2,}\]?/gi) ?? []).some((value) => isIP(value.replace(/^\[|\]$/g, '')) === 6)) fail('report contains possible IPv6 address');
  const allowed = new Set(['schemaVersion','profileId','scope','protocol','observedAt','result','summary','id']);
  if (Object.keys(report).some((x) => !allowed.has(x))) fail('report has unapproved fields');
  return report;
}

async function run() {
  if (command === 'validate') {
    await validateAll();
    console.log('catalog validation OK');
  } else if (command === 'collect' || command === 'refresh') {
    const { profiles } = await validateAll();
    const opt = Object.fromEntries([subcommand, ...args].filter((x) => x?.startsWith('--') && x.includes('=')).map((x) => x.slice(2).split(/=(.*)/s).slice(0, 2)));
    const profileId = opt.profile ?? profiles.activeProfileId;
    const maxPages = opt['max-pages'] === undefined ? null : Number(opt['max-pages']);
    if (maxPages !== null && (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 10)) fail('max-pages must be 1..10');
    const result = await collect({ profileId, sourceId: opt.source ?? null, maxPages });
    console.log(JSON.stringify(result, null, 2));
    if (result.errors.length) process.exitCode = 1;
  } else if (command === 'profile') {
    const profiles = validateProfiles(await load('profiles.json'));
    if (subcommand === 'show') {
      const registry = validateRegistry(await load('registry.json'), profiles);
      console.log(JSON.stringify({ activeProfileId: profiles.activeProfileId,
        profiles: profiles.profiles,
        enabledSources: registry.sources.filter((s) => s.enabled && s.profileIds.includes(profiles.activeProfileId)).map((s) => s.id) }, null, 2));
    } else if (subcommand === 'select') {
      const id = args[0];
      if (!profiles.profiles.some((p) => p.id === id)) fail('unknown profile ID');
      profiles.activeProfileId = id;
      validateProfiles(profiles);
      await atomicJson('profiles.json', profiles);
      console.log(`active profile: ${id}; sources and pairs require explicit matching; unmatched coverage is UNKNOWN`);
    } else if (subcommand === 'create' || subcommand === 'set') {
      const opt = options();
      for (const key of ['origin-city','origin-country','provider','exit-city','exit-country']) if (!opt[key]) fail(`missing --${key}`);
      const key = identity(opt['origin-city'], opt['origin-country'], opt.provider, opt['exit-city'], opt['exit-country']);
      const existing = profiles.profiles.find((p) => identity(p.originLocation.city, p.originLocation.country, p.originProvider.name, p.foreignExit.city, p.foreignExit.country) === key);
      if (subcommand === 'set' && existing) {
        profiles.activeProfileId = existing.id;
        await atomicJson('profiles.json', profiles);
        console.log(`active profile: ${existing.id}; existing facts retain their profile links`);
        return;
      }
      if (existing) fail(`same search conditions already exist as ${existing.id}`);
      const hash = createHash('sha256').update(key).digest('hex').slice(0, 12);
      const id = opt.id ?? `profile-${hash}-v1`;
      if (profiles.profiles.some((p) => p.id === id)) fail('profile ID already exists');
      const asn = opt.asn === undefined ? null : Number(opt.asn);
      const profile = { id, version: 1,
        originLocation: { city: opt['origin-city'], country: opt['origin-country'].toUpperCase() },
        originProvider: { name: opt.provider, asn },
        foreignExit: { city: opt['exit-city'], country: opt['exit-country'].toUpperCase() },
        evidence: { kind: 'USER_DECLARED', observedAt: new Date().toISOString(), scope: 'Search conditions only; no service or route test' } };
      profiles.profiles.push(profile);
      if (subcommand === 'set') profiles.activeProfileId = id;
      validateProfiles(profiles);
      await atomicJson('profiles.json', profiles);
      console.log(`${subcommand === 'set' ? 'created and activated' : 'created'} profile: ${id}; no sources or pairs are matched automatically`);
    } else fail('profile command: show | create | select | set');
  } else if (command === 'import-report') {
    const input = process.argv[3];
    if (!input || /(^|\/)(?:\.env(?:\.|$)|.*(?:key|secret|token).*)/i.test(input)) fail('report file path invalid');
    const profiles = validateProfiles(await load('profiles.json'));
    const report = validateReport(JSON.parse(await readFile(input, 'utf8')), profiles);
    const reports = await load('reports.json');
    const id = `${report.profileId}:${report.scope}:${report.protocol}:${report.observedAt}`;
    const next = { ...report, id };
    const index = reports.reports.findIndex((x) => x.id === id);
    if (index >= 0) reports.reports[index] = next; else reports.reports.push(next);
    await atomicJson('reports.json', reports);
    console.log(`imported anonymized report: ${id}`);
  } else {
    fail('commands: validate | collect [--profile=ID] [--source=ID] [--max-pages=1..10] | profile show/create/select/set | import-report FILE');
  }
}

if (process.argv[1] && basename(process.argv[1]) === 'cli.mjs') run().catch((error) => { console.error(error.message); process.exitCode = 1; });
