import { spawnSync } from 'node:child_process';
import { collect } from './collect.mjs';
import { validateAll } from './cli.mjs';

const mode = process.env.PROFILE_MODE || 'current';
if (!['current', 'select', 'set'].includes(mode)) throw new Error('invalid profile mode');
if (mode !== 'current') {
  const args = mode === 'select'
    ? ['profile', 'select', process.env.PROFILE_ID || '']
    : ['profile', 'set',
      ...[['origin-city','ORIGIN_CITY'],['origin-country','ORIGIN_COUNTRY'],['provider','ORIGIN_PROVIDER'],
        ['exit-city','EXIT_CITY'],['exit-country','EXIT_COUNTRY']].map(([key, variable]) => `--${key}=${process.env[variable] || ''}`),
      ...(process.env.ORIGIN_ASN ? [`--asn=${process.env.ORIGIN_ASN}`] : [])];
  const change = spawnSync(process.execPath, ['scripts/catalog/cli.mjs', ...args], { stdio: 'inherit' });
  if (change.status !== 0) throw new Error('profile operation failed');
}
const { profiles } = await validateAll();
const result = await collect({ profileId: profiles.activeProfileId });
await validateAll();
console.log(`Refresh: ${result.selected} sources; ${result.changes} changed facts; ${result.errors.length} source errors`);
for (const error of result.errors) console.warn(`::warning title=${error.sourceId}::${error.error.replace(/[\r\n]/g, ' ')}`);
if (result.selected === 0) console.warn('::warning::No sources match this profile; coverage remains UNKNOWN');
