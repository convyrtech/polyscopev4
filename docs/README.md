# 📚 WhaleScope Documentation

**Версия:** 2.0  
**Обновлено:** 2026-01-12

---

## 📋 Содержание

| Документ | Описание |
|----------|----------|
| [OVERVIEW_RU.md](./OVERVIEW_RU.md) | Обзор системы на русском языке |
| [ARCHITECTURE_ANALYSIS.md](./ARCHITECTURE_ANALYSIS.md) | Детальный архитектурный анализ, рекомендации по развитию |
| [STATE_MACHINES.md](./STATE_MACHINES.md) | Mermaid-диаграммы состояний для всех компонентов |

---

## 🏗️ Архитектура

```
┌──────────────────────────────────────────────────────────────────┐
│                        WhaleScope                                 │
├──────────────────────────────────────────────────────────────────┤
│  INGESTOR              │  SERVICES              │  CLIENTS       │
│  ├─ WebSocket Pulse    │  ├─ AnalysisService    │  ├─ Chrome Ext │
│  ├─ HTTP Detective     │  ├─ StrategyService    │  ├─ Web App    │
│  └─ Auto Discovery     │  ├─ RiskService        │  └─ API        │
│                        │  ├─ PaperTrading       │                │
│                        │  ├─ Resolution         │                │
│                        │  ├─ Funding            │                │
│                        │  └─ Syndicate          │                │
└──────────────────────────────────────────────────────────────────┘
```

---

## 📦 Структура проекта

```
whalescope/
├── apps/
│   ├── api/          # Hono.js Backend + Ingestor
│   ├── web/          # Next.js Dashboard
│   └── extension/    # Chrome Extension (Plasmo)
├── packages/
│   ├── db/           # Prisma Schema + Client
│   ├── shared/       # Shared utilities
│   └── tsconfig/     # TypeScript configs
└── docs/             # Документация (вы здесь)
```

---

## 🗄️ Database Schema

### Основные модели

| Модель | Описание |
|--------|----------|
| `User` | Подписчики приложения |
| `Whale` | Профили китов Polymarket (адрес, winrate, pnl, tags) |
| `Signal` | Сделки/сигналы (цена, outcome, aiScore, status) |
| `Strategy` | Конфигурации paper trading стратегий |
| `PaperPosition` | Виртуальные позиции с TP/SL/costs |
| `Watchlist` | User → Whale подписки |

> Полная схема: [packages/db/prisma/schema.prisma](../packages/db/prisma/schema.prisma)

---

## 🔌 API Endpoints

### Public

| Endpoint | Метод | Описание |
|----------|-------|----------|
| `/health` | GET | Health check |
| `/api/markets/:slug/sentiment` | GET | Sentiment анализ для рынка |
| `/api/signals/feed` | GET | Лента сигналов |

### Strategies

| Endpoint | Метод | Описание |
|----------|-------|----------|
| `/api/strategies` | GET | Список стратегий |
| `/api/strategies/:id` | GET | Детали стратегии |
| `/api/strategies/:id/positions` | GET | Позиции стратегии |
| `/api/strategies/:id/stats` | GET | Статистика стратегии |

### Monitoring

| Endpoint | Метод | Описание |
|----------|-------|----------|
| `/api/monitoring/ingestor` | GET | Статус Ingestor |
| `/api/monitoring/paper-trading` | GET | Статус Paper Trading |
| `/api/monitoring/signals/summary` | GET | Сводка по сигналам |

---

## 🚀 Deployment

| Компонент | Порт | URL |
|-----------|------|-----|
| API | 3001 | `http://87.120.186.161:3001` |
| Web Dashboard | 3000 | `http://87.120.186.161:3000` |
| PostgreSQL | 5432 | Local |

### Environment Variables

```env
DATABASE_URL=postgresql://...
PORT=3001
ALCHEMY_API_KEY=...
```

---

## 🔗 Ссылки

- **GitHub**: (internal)
- **Chrome Extension**: Plasmo-based, content script на `polymarket.com`
- **External APIs**: Polymarket Gamma, CLOB WebSocket, Data API, Alchemy
