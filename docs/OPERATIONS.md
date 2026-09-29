# Catalog refresh and publication

The owner runs **Refresh catalog and publish Pages** at
https://github.com/egorKara/vps-proxy-research/actions/workflows/refresh.yml.
`profile_mode=current` keeps the saved `activeProfileId`. `select` requires a
saved `profile_id`. `set` requires origin city/country, origin ISP, and foreign
exit city/country; `origin_asn` is optional and must be verified. Inputs are
passed through environment variables to Node, never interpolated into a shell
command. A new profile has no matched sources or inherited pair conclusions;
the resulting catalog remains empty/UNKNOWN until sources and candidates are
explicitly reviewed. The owner must inspect the Actions result and published
site; local workflow validation is not proof of an Actions run.

The workflow collects, validates, tests, builds, commits only
`src/data/catalog/profiles.json` and `src/data/catalog/snapshot.json` when
changed, and explicitly deploys the built Pages artifact. It refuses to push
if `main` advanced after checkout and never force-pushes. The ordinary deploy
checks out `main`, validates/tests/builds, and refuses to publish an artifact
if `main` advanced. Both workflows use the same Pages concurrency group. An
unavailable incident detail or source is recorded as an error/gap while known
good observations keep their original dates. Invalid data stops the run before
commit or deploy. The browser holds no write token.

The daily 03:17 UTC cron is enabled in `refresh.yml`, and
`src/data/catalog/policy.json` has `scheduleEnabled: true`.
A manual run only proves the manual path; wait for an actual
scheduled run before claiming schedule acceptance. GitHub may delay or skip a
scheduled run. Each Monday the owner checks official plan prices, included
IPv4, recovery, availability, ownership and facility information, recording
the source and actual observation date in reviewed catalog data. A build or
weekly reminder does not refresh `observedAt`; facts older than 14 days remain
stale until checked. Daily incident/BGP data is stale after 48 hours.

DigitalOcean and OVHcloud imports follow official quarterly incident history
and individual incident JSON with bounded requests. They cover provider
reports with title filters for Droplets/FRA1 and VPS, respectively; they do not
prove effects on a particular future VM or the home route. Incomplete history
and missing detail JSON remain visible as gaps. RIPEstat remains disabled until
the actual VPS ASN or prefix is verified; a brand ASN is insufficient.
