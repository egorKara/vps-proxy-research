// Event counts are source IDs, not claims of distinct root causes.
export function summarizeEvents(events, { from = null, to = null } = {}) {
  const byId = new Map(events.map((event) => [event.id, event]));
  const relevant = [...byId.values()].filter((e) => e.status !== 'PLANNED' &&
    (!from || Date.parse(e.startedAt) >= Date.parse(from)) && (!to || Date.parse(e.startedAt) < Date.parse(to)));
  const complete = relevant.filter((e) => e.status === 'RESOLVED' && e.endedAt && Date.parse(e.endedAt) >= Date.parse(e.startedAt));
  const durations = complete.map((e) => Date.parse(e.endedAt) - Date.parse(e.startedAt));
  // Merge intersections for total known affected time. This does not equate
  // overlapping incidents with one cause or one provider outage.
  const intervals = complete.map((e) => [Date.parse(e.startedAt), Date.parse(e.endedAt)]).sort((a,b) => a[0] - b[0]);
  let unionMs = 0, end = -Infinity;
  for (const [start, finish] of intervals) {
    unionMs += Math.max(0, finish - Math.max(start, end));
    end = Math.max(end, finish);
  }
  return { knownEventCount: relevant.length, resolvedSampleSize: complete.length,
    meanTimeToResolveMs: durations.length ? Math.round(durations.reduce((a,b) => a+b, 0) / durations.length) : null,
    knownIntervalUnionMs: unionMs, uptime: null };
}
