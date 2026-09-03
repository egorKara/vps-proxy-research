---
title: "VPS (Европа): исследование рынка"
description: "Проверенный срез европейских VPS-кандидатов: цена, IPv4/IPv6, восстановление и доступность."
updated: "2026-09-03"
---

# VPS (Европа) — проверенный срез 2026-09-03

> Цель: выбрать VPS в Европе под SSH-only backend с обязательным IPv4, KVM или сопоставимой полной виртуализацией, бюджетом около €5–10/мес и нормальным self-service восстановлением.

## Результат аудита

- Старые кандидаты перепроверены: **20/20**.
- Добавлено новых рабочих/watchlist-кандидатов: **8**.
- Всего в актуальном `vps_eu.json`: **28** позиций.
- Распределение: **Tier A — 8**, **Tier B — 10**, **Tier C — 6**, **Tier D — 4**.
- Каждая строка содержит `verified_at`, `verification`, `change` и массив `sources`.
- Неизменяемый снимок этого аудита: `src/data/history/vps_eu_2026-09-03.json`.

Это аудит публичных условий и текущей доступности. **RTT, packet loss, реальная стабильность SSH и маршрутизация из сетей пользователя пока не измерялись** — это отдельный acceptance после покупки или тестового доступа.

## Критерии

1. Ориентир цены: **€5–10/мес**; более дешёвые тарифы допустимы, если не теряется управляемость.
2. Минимум: **1 vCPU / 1 GB RAM**; предпочтительно KVM.
3. **Выделенный IPv4 обязателен** либо должен однозначно добавляться к тарифу до оплаты.
4. Желательны IPv6, console/VNC/KVM-console, self-service reinstall/rescue/custom ISO, rDNS/PTR, snapshots/backup.
5. Приоритетные локации: FI / EE / LT / PL / DE; LU оставлен как резервный watchlist.

## Статусы

- **Tier A** — текущий shortlist: ключевые условия достаточно подтверждены, предложение рационально для покупки/пилота.
- **Tier B** — рабочий кандидат, но есть заметный компромисс или непроверенное обязательное свойство.
- **Tier C** — перед оплатой обязательна контрольная проверка корзины или пресейл.
- **Tier D** — сейчас нет слотов, локация снята или предложение оставлено только для наблюдения.

`confirmed` означает, что основные свойства подтверждены актуальными источниками; `partial` — что хотя бы одно существенное поле публично не удалось подтвердить; `confirmed_unavailable` — что недоступность подтверждена.

## Текущий shortlist

### 1. OVHcloud — Germany

**VPS-1: от €4.53/мес incl. VAT**, 2 vCores, 4 GB RAM, 40 GB NVMe, dedicated IPv4, IPv6, integrated KVM console и ежедневный automatic backup. По совокупности ресурсов, цены и recovery это главный новый ориентир текущего среза.

Источники: https://www.ovhcloud.com/de/vps/vps-deutschland/ · https://www.ovhcloud.com/de/vps/

### 2. netcup — Nuremberg

**VPS nano G11s: €3.08/мес incl. 19% VAT**, 2 vCore, 2 GB RAM, 60 GB SSD, public IPv4 + /64 IPv6, remote console, custom ISO/images и snapshots. Главный минус — минимальный срок и биллинг по 6 месяцев.

Источник: https://www.netcup.com/en/server/vps/vps-nano-g11s-iv-6m-nue

### 3–4. EDIS Global — Helsinki / Tallinn

**KVM Smart: €4.99/мес**, 1 GB RAM, 15 GB, dedicated static IPv4, /64 IPv6, NoVNC, собственные ISO/QCOW2, one-click OS install и self-service rDNS. Очень сильный вариант, когда важна именно северная/балтийская локация и прозрачное восстановление.

Источники: https://www.edisglobal.com/vps-hosting/finland/helsinki · https://www.edisglobal.com/vps-hosting/estonia/tallinn

### 5–6. Servinga — Tallinn / Frankfurt

**B1C1: €5/мес**, 1 vCPU, 1 GB RAM, 25 GB, IPv4+IPv6, backup slot; без длинного контракта. Это простой и прозрачный минимальный профиль.

Источники: https://servinga.com/cloud/datacenters/estonia/ · https://servinga.com/cloud/datacenters/germany/

### 7. Melbicom — Vilnius

**VDS-1-SSD-VIL: €3.90/мес**, 1 vCore, 2 GB RAM, 20 GB SSD, 1 IPv4, 16 IPv6, KVM/VNC и custom ISO. Один из лучших дешёвых кандидатов.

Источник: https://www.melbicom.net/virtualserver/lithuania/

### 8. Melbicom — Warsaw

Технически аналогично Vilnius и остаётся в Tier A, но точную текущую цену/stock **€3.90** в этом срезе пришлось подтверждать свежим внешним индексом; перед оплатой нужна контрольная проверка корзины.

Источник: https://www.melbicom.net/virtualserver/poland/

## Что существенно изменилось с 2026-04-05

- **KernelHost**: KVM-1 подорожал с прежних **€4.99 до €9.99/мес**. Технически прозрачен — IPv4, /64 IPv6, rDNS, VNC и backup — но ценовое преимущество исчезло.
- **Servers.guru**: dedicated IPv4 теперь явно включён. Старый 2 GB тариф за €4.99 sold out, зато доступен 1 GB Finland Unmetered за €4.99; гипервизор и console/VNC публично не подтверждены, поэтому Tier B.
- **Servinga**: условия стали гораздо прозрачнее — €5, 1 GB/25 GB, IPv4+IPv6 и backup.
- **Cube-Host**: старая Finland-локация больше не считается действующим предложением; актуальная строка добавлена для Lithuania.
- **THE.Hosting**: старые €5.77 и старые stock-статусы больше не используются. Сейчас надёжно подтверждаются KVM/NVMe и **IPv4 как +€2/мес**, а текущую базовую цену надо проверять в конфигураторе — Tier C.
- **BlueVPS**: прежний 512 MB/$3.99 тариф не проходит наш минимум 1 GB; сравнение переведено на текущий 1 GB вариант.
- **IncogNET Finland**: по-прежнему **0 Available**.
- Добавлены **OVHcloud, netcup, EDIS Global, Time4VPS, актуальная Cube-Host Lithuania**; в watchlist добавлены **Hetzner CX23** и **BuyVM Luxembourg**, которые сейчас недоступны.

## Где смотреть полную матрицу

Полная таблица 28 позиций находится на странице **«Таблицы → VPS (EU)»**. В ней используются данные из `src/data/vps_eu.json`; для каждой строки хранятся цена, ресурсы, IPv4/IPv6, recovery, rDNS, backup, наличие, Tier, статус проверки, дата проверки, изменение относительно прошлого среза и первоисточники.

## Правило актуальности

- `verified_at` — дата последней проверки строки.
- После **30 дней** строку следует считать stale и перепроверять перед покупкой.
- `availability=unknown` не означает «есть в наличии» — только отсутствие надёжного публичного подтверждения.
- Старые значения не переносятся автоматически: если нынешний источник их не подтверждает, поле понижается до `partial/unknown`.
- Исторический апрельский вариант не потерян: он остаётся в Git-истории репозитория.

## Acceptance перед оплатой Tier A/B

1. Проверить выбранную локацию непосредственно в checkout.
2. Проверить, что dedicated IPv4 входит в итоговую цену и выдаётся сразу.
3. Проверить console/VNC/rescue и self-service reinstall.
4. Проверить PTR/rDNS.
5. Зафиксировать финальную цену с VAT, периодом оплаты и setup fee.
6. После покупки: SSH из минимум двух сетей, RTT/packet loss, reinstall/recovery и один тестовый тикет.
