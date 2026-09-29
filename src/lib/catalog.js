import { summarizeEvents } from '../../scripts/catalog/stats.mjs';
import profilesData from '../data/catalog/profiles.json';
import nodesData from '../data/catalog/nodes.json';
import pairsData from '../data/catalog/pairs.json';
import editorialData from '../data/catalog/editorial.json';
import registryData from '../data/catalog/registry.json';
import snapshot from '../data/catalog/snapshot.json';
import reportsData from '../data/catalog/reports.json';

export const activeProfile = profilesData.profiles.find((p) => p.id === profilesData.activeProfileId);
export const activePairs = activeProfile ? pairsData.pairs.filter((p) => p.profileId === activeProfile.id).slice(0, 3) : [];
export const nodeById = new Map(nodesData.nodes.map((n) => [n.id, n]));
export const sourceById = new Map(registryData.sources.map((s) => [s.id, s]));
export const editorialByPair = new Map(editorialData.decisions.filter((d) => d.profileId === activeProfile?.id).map((d) => [d.pairId, d]));
export const sourceState = snapshot.sourceState;
export const siteBuiltAt = new Date().toISOString();
export const activeReports = reportsData.reports.filter((r) => r.profileId === activeProfile?.id);
export const activeCoverage = snapshot.coverage.filter((c) => c.profileId === activeProfile?.id);
export const activeSources = registryData.sources.filter((s) => s.profileIds.includes(activeProfile?.id));
export const recentChanges = snapshot.changelog.filter((c) => activeSources.some((s) => s.id === c.sourceId));

export function safeUrl(value) {
  try { const u = new URL(value); return ['https:', 'http:'].includes(u.protocol) ? u.href : null; } catch { return null; }
}
export function displayValue(value) {
  if (value === null || value === undefined || value === '') return 'Не установлено';
  if (typeof value === 'boolean') return value ? 'Да' : 'Нет';
  if (Array.isArray(value)) return value.length ? value.map(displayValue).join(', ') : 'Не установлено';
  if (typeof value === 'object') { const names = {console:'Консоль',rescue:'Режим восстановления',outOfBandConsole:'Внешняя консоль',recoveryISO:'Загрузочный образ восстановления',available:'Доступна',wipesDisk:'Удаляет данные',retainsIP:'Сохраняет IP',vcpu:'vCPU',ramGB:'RAM, ГБ',ramGiB:'RAM, ГиБ',diskGB:'Диск, ГБ',diskGiB:'Диск, ГиБ',diskType:'Тип диска'}; return Object.entries(value).map(([key, item]) => `${names[key] || key}: ${displayValue(item)}`).join(' · '); }
  return String(value);
}
export function formatDate(value) {
  if (!value) return 'Нет данных';
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return 'Нет данных';
  const iso = new Date(time).toISOString();
  return value.includes('T') ? `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC` : iso.slice(0, 10);
}
export function statusText(value) { return {PASS:'Условие подтверждено', RISK:'Есть риск', UNKNOWN:'Не установлено'}[value] || 'Не установлено'; }
export function provenanceText(value) { return {CONFIRMED:'Подтверждённый источник', INFERRED:'Вывод из источников', UNKNOWN:'Не установлено'}[value] || 'Не установлено'; }
export function decisionText(value) { return {INCLUDED:'Включена', EXCLUDED:'Исключена', UNDECIDED:'Решение не принято'}[value] || 'Решение не принято'; }
export function criterionName(id) { return ({'entry-location':'Локация первого VPS','foreign-exit':'Локация выхода','entry-provider-exclusion':'Провайдер первого VPS','foreign-provider-exclusion':'Зарубежный провайдер','independent-owner':'Независимость владельцев','entry-ipv4':'IPv4 первого VPS','foreign-cpu':'Процессор выхода','foreign-ram':'Память выхода','foreign-disk':'Диск выхода','foreign-ipv4':'IPv4 выхода','foreign-linux':'Linux','foreign-virtualization':'Виртуализация','foreign-console':'Консоль','foreign-rescue':'Режим восстановления','foreign-reinstall':'Переустановка','monthly-billing':'Помесячная оплата','order-availability':'Наличие при заказе','home-route':'Домашний маршрут','application-availability':'Прикладная доступность','history-coverage':'Покрытие истории','frankfurt-deviation':'Отклонение от Frankfurt','primary-ipv4-extra-cost':'Доплата за IPv4'})[id] || id.replaceAll('-', ' '); }
export function pairNodes(pair) { return [nodeById.get(pair.entryNodeId), nodeById.get(pair.foreignNodeId)]; }
export function pairTitle(pair) { const [a,b] = pairNodes(pair); return `${displayValue(a?.properties.brand?.value)} → ${displayValue(b?.properties.brand?.value)}`; }
export function nodeSources(node) { return (node?.statusSourceIds || []).map((id) => sourceById.get(id)).filter(Boolean).filter((s) => s.profileIds.includes(activeProfile?.id)); }
export function coverageFor(sourceId) { return activeCoverage.filter((c) => c.sourceId === sourceId); }
export function eventsFor(sourceId, klass) { return snapshot.events.filter((e) => e.sourceId === sourceId && e.class === klass); }
export function recentEventsFor(sourceId, limit=8) { return snapshot.events.filter((e) => e.sourceId === sourceId && e.status !== 'PLANNED').sort((a,b) => Date.parse(b.startedAt)-Date.parse(a.startedAt)).slice(0,limit); }
export function evidenceFor(event) { return snapshot.evidence.filter((e) => event.evidenceIds.includes(e.id)); }
export function routeLabel(profile) { return profile ? `${profile.originLocation.city} / ${profile.originProvider.name} (AS${profile.originProvider.asn ?? '?'}) / ${profile.foreignExit.city}` : 'Нет активного профиля'; }

export function eventCountText(count) { const last = count % 10, tens = count % 100; const word = last === 1 && tens !== 11 ? 'событие' : last >= 2 && last <= 4 && !(tens >= 12 && tens <= 14) ? 'события' : 'событий'; return `${count} ${count % 10 === 1 && count % 100 !== 11 ? 'опубликованное' : count % 10 >= 2 && count % 10 <= 4 && !(count % 100 >= 12 && count % 100 <= 14) ? 'опубликованных' : 'опубликованных'} ${word}`; }

export function eventMetrics(sourceId, klass) { const cover = activeCoverage.find((c) => c.sourceId === sourceId && c.class === klass); if (!cover?.observedStart) return null; const to = sourceState[sourceId]?.lastSuccessAt || cover.observedEnd; return summarizeEvents(eventsFor(sourceId, klass), { from: cover.requestedStart, to }); }
export function formatDuration(ms) { if (ms == null || !Number.isFinite(ms)) return "Не рассчитывается"; const minutes = Math.round(ms / 60000); const days = Math.floor(minutes / 1440); const hours = Math.floor((minutes % 1440) / 60); const rest = minutes % 60; return [days && `${days} сут.`, hours && `${hours} ч`, (rest || (!days && !hours)) && `${rest} мин`].filter(Boolean).join(" "); }
