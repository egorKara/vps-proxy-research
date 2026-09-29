# Data contract v1

`profiles.json` is the saved search context. Its stable `id` and `version` bind
pair evaluations and coverage to the conditions under which they were made.
Changing `activeProfileId` only changes selection; it never deletes another
profile's pairs, decisions, or history. A new three-parameter combination gets a
new profile ID. Unknown origin ASN is `null`, never inferred from a brand.

`nodes.json`, `pairs.json`, and `editorial.json` are human-reviewed data. A node
property must carry `value`, `sourceUrl`, `observedAt`, `scope`, and `provenance`
(`CONFIRMED`, `INFERRED`, or `UNKNOWN`). A pair has `profileId`, `entryNodeId`
(the first VPS in the profile's origin location), `foreignNodeId`, structured
monthly `price` (`amount`, `currency`, `observedAt`,
`components`, source URL and scope), per-condition `PASS`/`RISK`/`UNKNOWN`,
and `decision`/`reason`.
Each criterion has an evaluation date and source URL, or an explicit UNKNOWN
without a source. Final decisions have their own date.
An optional `statusSourceIds` array on a node contains unique IDs from the
explicit registry. It associates the node with a provider's status source for
coverage lookup; company or platform incidents do not prove that particular
VPS was affected or reachable. An empty array means no matched status source.
Mandatory-condition failure means explicit `EXCLUDED`. Neither a condition PASS
nor a BGP observation is a home-route or application-availability PASS.
The `entry-location` and `foreign-exit` criteria compare the two VPS locations
with the profile. Frankfurt is preferred, with nearby Germany or Europe as an
explained fallback; geographic deviation is a risk, not an automatic exclusion.
A provider status page alone cannot pass location criteria.
Affected event scopes are typed as service, site, region, ASN, or prefix.

`registry.json` is the only network allowlist. The collector never accepts URLs
from profile input or an imported report. It writes only `snapshot.json`, which
is the last validated observation snapshot. Events use source-scoped stable IDs,
class A/B/C, event time, affected scopes, explicit cause provenance, and evidence.
Unknown class C coverage stays UNKNOWN. BGP timelines live separately in
`bgpObservations`; they never create incident events automatically.

Coverage records include `profileId`, source, class, requested and observed
window, gaps, and whether backfill is complete. A source failure preserves its
last good facts and original dates. `sourceState` records attempts, successes,
errors, and expected frequency. `changelog` records meaningful data changes.
The website build time is separate from every source observation time.

Selectel's public status history has cursor pagination but only HTML. The
adapter reports partial backfill until all pages in the six-month window have
been read; HTML changes fail validation and leave last good data in place.
Hetzner's public Atom feed has no confirmed historical pagination. Its coverage
is the actual returned window, with an explicit gap to the requested start.
DigitalOcean and OVHcloud use their official public Statuspage quarterly history
and incident JSON. The DigitalOcean adapter selects Droplets/FRA1 titles; the
OVHcloud adapter selects VPS titles. Each run limits detail requests, saves a
page/offset cursor and revisits changed history entries. A 404 detail remains
an explicit `unavailableDetails`/coverage gap; `backfillComplete` means the
quarterly pages were traversed, not that every incident or future VM is covered.
RIPEstat is disabled until a real candidate's ASN or prefix is verified and
entered in the explicit registry. This registry is an integration shortlist,
not a researched or accepted VPS pair.

The collector never runs SSH, TLS, UDP, VPN, RIPE Atlas measurements, or any
origin-to-entry probe. `import-report` accepts only a local, pre-anonymized report
with `ORIGIN_TO_ENTRY` or `ENTRY_TO_EXIT` scope,
validates its declared profile and scope, and cannot run a measurement.

Refresh selects only the active profile's explicit registry sources.
`policy.json` carries daily and weekly cadence metadata; the proposed cron is
disabled. Owner operation and publication are described in `docs/OPERATIONS.md`.

Local commands (Node.js 22.12 or newer):

```sh
node scripts/catalog/cli.mjs validate
node scripts/catalog/cli.mjs collect --source=selectel-status
node scripts/catalog/cli.mjs profile show
node scripts/catalog/cli.mjs profile set --origin-city=Москва --origin-country=RU --provider=МТС --exit-city=Amsterdam --exit-country=NL
```

`profile set` chooses an existing matching profile or creates one with a stable
ID and makes it active. A new profile intentionally has zero matched sources,
zero pairs, and UNKNOWN coverage until its registry and editorial data are
reviewed. `profile select ID` only changes the active selector. No command here
publishes data or enables a workflow.
