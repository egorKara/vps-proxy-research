# vps-proxy-research (Astro + GitHub Pages)

Статический сайт‑архив ваших заметок:
- **VPS (EU)**: выбор провайдера под SSH, IPv4/IPv6, риски, “что проверить”
- **Proxy (US)**: точка выхода трафика, стратегии и базовая эксплуатация
- **Таблицы**: быстрые фильтры/поиск

## Локальный запуск

```bash
npm install
npm run dev
```

## Сборка

```bash
npm run build
npm run preview
```

## Деплой в GitHub Pages

В репозитории уже есть workflow: `.github/workflows/deploy.yml`.

1) Создайте репозиторий `vps-proxy-research` и залейте код:
```bash
git init
git add .
git commit -m "Initial site"
git branch -M main
git remote add origin git@github.com:<ваш-логин>/vps-proxy-research.git
git push -u origin main
```
2) В GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3) Подождите выполнения workflow — сайт появится на `https://<ваш-логин>.github.io/vps-proxy-research/`.

### Важно про base path

В `astro.config.mjs` выставлен `base: '/vps-proxy-research'` под Pages‑деплой проекта.  
Если вы решите деплоить как `username.github.io` (корневой сайт) — base нужно будет убрать.
