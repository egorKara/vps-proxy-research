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
export function cityName(value) { return ({ Frankfurt: 'Франкфурт-на-Майне', Nürnberg: 'Нюрнберг', Limburg: 'Лимбург' })[value] || displayValue(value); }
export function countryName(value) { return ({ RU: 'Россия', DE: 'Германия' })[value] || displayValue(value); }
export function displayText(value) {
  if (value == null) return 'Не установлено';
  const exact = {
    Frankfurt: 'Франкфурт-на-Майне', Nürnberg: 'Нюрнберг', Limburg: 'Лимбург',
    RUB: 'руб.', USD: 'долл.', EUR: 'евро',
    'DigitalOcean platform status; Droplets/FRA1 titles only, no proof of effect on a future FRA1 VM': 'Статус всей платформы DigitalOcean; отобраны заголовки о Droplets/FRA1. Влияние на будущий сервер FRA1 не доказано.',
    'OVHcloud Bare Metal Cloud platform status; VPS titles only, no proof of effect on a future German VM or LIM': 'Статус платформы OVHcloud Bare Metal Cloud; отобраны заголовки о VPS. Влияние на будущий немецкий сервер или площадку LIM не доказано.',
    'VDS 2-2-40; hourly pay-as-you-go per billing terms': 'VDS 2-2-40; почасовая оплата по условиям тарифа.',
    'Bundled Plan': 'Тариф с включёнными услугами',
    'Germany FSN/NBG': 'Германия, площадки FSN/NBG',
    'Primary IPv4': 'Основной адрес IPv4',
    'Почасовое pay-as-you-go; 400 RUB/мес. на витрине, итог не гарантирован': 'Почасовая оплата; на витрине ориентир 400 руб./мес., итоговая сумма не гарантирована.',
    'Per-second с месячным cap 18 USD для Bundled Plan': 'Посекундная оплата с месячным пределом 18 долл. для тарифа с включёнными услугами.',
    'Почасовой счёт с месячным cap': 'Почасовая оплата с месячным пределом.',
    'НДС для конкретного аккаунта и суммы 400 RUB не установлен': 'НДС для конкретного аккаунта и ориентира 400 руб. не установлен.',
    'Bundled Plan включает публичный IPv4': 'Тариф с включёнными услугами содержит публичный адрес IPv4.',
    'Документация Droplets описывает Linux VM': 'Документация Droplets описывает виртуальную машину с Linux.',
    'Recovery Console; rebuild отдельно: https://docs.digitalocean.com/products/droplets/how-to/rebuild/': 'Консоль восстановления; переустановка описана отдельно в документации DigitalOcean.',
    'От 4.53 EUR/мес. с НДС на немецкой витрине; срок и финальный счёт неизвестны': 'От 4,53 евро в месяц с НДС на немецкой витрине; срок и итоговый счёт неизвестны.',
    'Cloud location nbg1; немецкий fallback от Frankfurt': 'Облачная площадка nbg1; запасная немецкая локация вместо Франкфурта-на-Майне.',
    'ASN будущего Primary IPv4': 'ASN будущего основного адреса IPv4',
    'Префикс будущего Primary IPv4': 'Сетевой префикс будущего основного адреса IPv4',
    'Доступен отдельный Primary IPv4 за 0.50 EUR/мес. без НДС': 'Отдельный основной адрес IPv4 предлагается за 0,50 евро в месяц без НДС.',
    'Страница показывает not available, доступность nbg1 не установлена': 'На странице указано «недоступно»; возможность заказа в nbg1 не установлена.',
    'Два отдельных VPS; RUB и USD/EUR не суммируются; состав зависит от аккаунта': 'Два отдельных VPS; суммы в рублях, долларах и евро не складываются. Итог зависит от аккаунта.',
    'Nürnberg — допустимый немецкий fallback, но отклонение от предпочтительного Frankfurt; влияние на маршрут не измерено': 'Нюрнберг — допустимая запасная локация в Германии вместо предпочтительного Франкфурта-на-Майне; влияние на маршрут не измерено.',
    'Nürnberg — fallback вместо предпочтительного Frankfurt; влияние на маршрут неизвестно': 'Нюрнберг — запасная локация вместо предпочтительного Франкфурта-на-Майне; влияние на маршрут неизвестно.',
    'Нет измерения домашнего и прикладного маршрутов, ASN/IP и данных заказа; гипервизор/эквивалентность остаётся UNKNOWN.': 'Домашний и прикладной маршруты не измерены; ASN и IP будущего сервера, условия заказа и гипервизор не установлены.',
    'Город/площадка конкретного VPS-1, гипервизор и финальный счёт не подтверждены; домашний маршрут UNKNOWN.': 'Город и площадка конкретного VPS-1, гипервизор и итоговый счёт не подтверждены; домашний маршрут не проверен.',
    'Официальная цена новых заказов есть, но CX23 отображается not available; заказ, гипервизор и домашний маршрут UNKNOWN.': 'Цена для новых заказов опубликована, но CX23 помечен как «недоступен». Возможность заказа, гипервизор и домашний маршрут не проверены.',
    'Frankfurt совпадает с целевым городом и текущим выходом; концентрация площадок требует отдельной оценки': 'Франкфурт-на-Майне совпадает с целевым городом и текущим выходом; близость площадок требует отдельной оценки.',
    'Немецкий VPS не локализован до города; Limburg лишь контекст OVHcloud, а не доказанная площадка VPS-1': 'Город немецкого VPS не установлен; Лимбург упомянут только как контекст OVHcloud, а не как доказанная площадка VPS-1.',
    'Nürnberg — немецкий fallback вместо Frankfurt; задержка и маршрут не измерены': 'Нюрнберг — запасная немецкая локация вместо Франкфурта-на-Майне; задержка и маршрут не измерены.',
    'KVM console — удалённый ввод/вывод, гипервизор не подтверждён': 'Удалённая консоль KVM позволяет управлять сервером, но не подтверждает тип гипервизора.',
    'Гипервизор не установлен; KVM console не является доказательством гипервизора': 'Тип гипервизора не установлен; удалённая консоль KVM его не подтверждает.',
    'Bundled Droplet': 'Тариф Droplet с включёнными услугами',
    'Пул и группа ЦОД; корпус будущей VM не установлен': 'Пул и группа ЦОД известны; корпус будущей виртуальной машины не установлен.',
    'nbg1-dc3 — виртуальный код, физическое здание будущей VM неизвестно': 'nbg1-dc3 — код площадки; физическое здание будущей виртуальной машины неизвестно.',
    'Шестимесячное покрытие A/B/C для будущей VM не подтверждено': 'Полнота шестимесячной истории по классам A, B и C для будущей виртуальной машины не подтверждена.',
    'Rescue; VNC и rebuild отдельно: https://docs.hetzner.com/cloud/servers/getting-started/vnc-console/ ; https://docs.hetzner.com/cloud/servers/faq/': 'Режим восстановления; удалённая консоль VNC и переустановка описаны отдельно в документации Hetzner.',
    'Provider reports do not establish all incidents or coverage of a specific VPS': 'Сообщения поставщика не охватывают все возможные события и не доказывают состояние конкретного VPS.',
    'Provider incident reports do not establish complete application coverage or home-route reachability': 'Сообщения поставщика не дают полной истории работы приложений и домашнего маршрута.',
    'Provider status history does not prove effects on a particular VPS or full service availability': 'История статус-панели не доказывает влияние на конкретный VPS или полную доступность услуги.',
    'Atom feed has no confirmed historical pagination; earlier incidents may be missing': 'У ленты Atom не подтверждён просмотр ранних страниц; старые события могут отсутствовать.',
  };
  if (Object.hasOwn(exact, value)) return exact[value];
  const detail = /^Official incident detail unavailable: ([a-z0-9]+)$/.exec(value);
  if (detail) return `Подробности события ${detail[1]} недоступны у официального источника.`;
  return String(value);
}
export function errorText(value) {
  if (!value) return 'Не зафиксирована';
  const message = String(value);
  if (/Official incident detail unavailable/i.test(message)) return 'Часть подробностей события недоступна у официального источника.';
  if (/timeout|timed out|abort/i.test(message)) return 'Источник не ответил вовремя.';
  if (/HTTP\s+\d{3}/i.test(message)) return `Источник вернул ошибку ${message.match(/HTTP\s+\d{3}/i)[0]}.`;
  return 'Последний сбор завершился с ошибкой; подробности доступны в журнале обновления.';
}
export function affectedType(value) { return ({SERVICE:'Сервис',SITE:'Площадка',REGION:'Регион',ASN:'Автономная система',PREFIX:'Сетевой префикс'})[value] || 'Область влияния'; }
export function countText(count, one, few, many) { const n = Math.abs(count), r = n % 10, h = n % 100; return `${count} ${h >= 11 && h <= 14 ? many : r === 1 ? one : r >= 2 && r <= 4 ? few : many}`; }
export function displayValue(value) {
  if (value === null || value === undefined || value === '') return 'Не установлено';
  if (typeof value === 'boolean') return value ? 'Да' : 'Нет';
  if (Array.isArray(value)) return value.length ? value.map(displayValue).join(', ') : 'Не установлено';
  if (typeof value === 'object') { const names = {console:'Консоль',rescue:'Режим восстановления',outOfBandConsole:'Внешняя консоль',recoveryISO:'Загрузочный образ восстановления',available:'Доступна',wipesDisk:'Удаляет данные',retainsIP:'Сохраняет IP',vcpu:'vCPU',ramGB:'RAM, ГБ',ramGiB:'RAM, ГиБ',diskGB:'Диск, ГБ',diskGiB:'Диск, ГиБ',diskType:'Тип диска'}; return Object.entries(value).map(([key, item]) => `${names[key] || key}: ${displayValue(item)}`).join(' · '); }
  return displayText(value);
}
export function formatDate(value) {
  if (!value) return 'Нет данных';
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return 'Нет данных';
  const iso = new Date(time).toISOString();
  return value.includes('T') ? `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC` : iso.slice(0, 10);
}
export function statusText(value) { return {PASS:'Условие подтверждено', RISK:'Есть риск', UNKNOWN:'Не установлено'}[value] || 'Не установлено'; }
export function provenanceText(value) { return {CONFIRMED:'Сведения из указанного источника', INFERRED:'Вывод из источников', UNKNOWN:'Происхождение не установлено'}[value] || 'Происхождение не установлено'; }
export function decisionText(value) { return {INCLUDED:'Включена', EXCLUDED:'Исключена', UNDECIDED:'Решение не принято'}[value] || 'Решение не принято'; }
export function criterionName(id) { return ({'entry-location':'Локация первого VPS','foreign-exit':'Локация выхода','entry-provider-exclusion':'Провайдер первого VPS','foreign-provider-exclusion':'Зарубежный провайдер','independent-owner':'Независимость владельцев','entry-ipv4':'IPv4 первого VPS','foreign-cpu':'Процессор выхода','foreign-ram':'Память выхода','foreign-disk':'Диск выхода','foreign-ipv4':'IPv4 выхода','foreign-linux':'Linux','foreign-virtualization':'Виртуализация','foreign-console':'Консоль','foreign-rescue':'Режим восстановления','foreign-reinstall':'Переустановка','monthly-billing':'Помесячная оплата','order-availability':'Наличие при заказе','home-route':'Домашний маршрут','application-availability':'Прикладная доступность','history-coverage':'Покрытие истории','frankfurt-deviation':'Отклонение от Франкфурта-на-Майне','primary-ipv4-extra-cost':'Доплата за IPv4'})[id] || id.replaceAll('-', ' '); }
export function pairNodes(pair) { return [nodeById.get(pair.entryNodeId), nodeById.get(pair.foreignNodeId)]; }
export function pairTitle(pair) { const [a,b] = pairNodes(pair); return `${displayValue(a?.properties.brand?.value)} → ${displayValue(b?.properties.brand?.value)}`; }
export function nodeSources(node) { return (node?.statusSourceIds || []).map((id) => sourceById.get(id)).filter(Boolean).filter((s) => s.profileIds.includes(activeProfile?.id)); }
export function coverageFor(sourceId) { return activeCoverage.filter((c) => c.sourceId === sourceId); }
export function eventsFor(sourceId, klass) { return snapshot.events.filter((e) => e.sourceId === sourceId && e.class === klass); }
export function recentEventsFor(sourceId, limit=8) { return snapshot.events.filter((e) => e.sourceId === sourceId && e.status !== 'PLANNED').sort((a,b) => Date.parse(b.startedAt)-Date.parse(a.startedAt)).slice(0,limit); }
export function evidenceFor(event) { return snapshot.evidence.filter((e) => event.evidenceIds.includes(e.id)); }
export function routeLabel(profile) { return profile ? `${cityName(profile.originLocation.city)} · ${profile.originProvider.name} (AS${profile.originProvider.asn ?? '?'}) → ${cityName(profile.foreignExit.city)}` : 'Нет активного профиля'; }

export function eventCountText(count) { const last = count % 10, tens = count % 100; const word = last === 1 && tens !== 11 ? 'событие' : last >= 2 && last <= 4 && !(tens >= 12 && tens <= 14) ? 'события' : 'событий'; return `${count} ${count % 10 === 1 && count % 100 !== 11 ? 'опубликованное' : count % 10 >= 2 && count % 10 <= 4 && !(count % 100 >= 12 && count % 100 <= 14) ? 'опубликованных' : 'опубликованных'} ${word}`; }

export function eventMetrics(sourceId, klass) { const cover = activeCoverage.find((c) => c.sourceId === sourceId && c.class === klass); if (!cover?.observedStart) return null; const to = sourceState[sourceId]?.lastSuccessAt || cover.observedEnd; return summarizeEvents(eventsFor(sourceId, klass), { from: cover.requestedStart, to }); }
export function formatDuration(ms) { if (ms == null || !Number.isFinite(ms)) return "Не рассчитывается"; const minutes = Math.round(ms / 60000); const days = Math.floor(minutes / 1440); const hours = Math.floor((minutes % 1440) / 60); const rest = minutes % 60; return [days && `${days} сут.`, hours && `${hours} ч`, (rest || (!days && !hours)) && `${rest} мин`].filter(Boolean).join(" "); }
