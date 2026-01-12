# 🐳 WhaleScope: Обзор Системы

> **Версия**: 3.0.0  
> **Дата**: 12.01.2026

---

## 1. Проблема

Polymarket страдает от **асимметрии информации**. Пользователь видит только цену и объём, но не видит **КТО** двигает рынок.

**Пример**: Объём $50,000 может быть создан:
- 5000 мелкими игроками ("Толпа") — шум
- 1 игроком ("Инсайдер") — сигнал

Для цены это одинаково, но для прогноза — фундаментальная разница.

---

## 2. Решение

**WhaleScope** — "Рентген" для рынка предсказаний. Мы подключаемся к биржевому стакану (CLOB) напрямую и анализируем каждую сделку.

### Что мы определяем:

| Паттерн | Описание |
|---------|----------|
| **Fresh Wallets** | Новые кошельки ("Burner Accounts") — инсайдеры почти всегда используют их |
| **Smart Money** | Трейдеры с высоким winrate (>65%) и положительным PnL |
| **Syndicate Moves** | Координированные покупки нескольких китов |
| **FOMO Chasers** | Покупки при цене >92% — плохой risk/reward |

---

## 3. Компоненты

### 3.1 Ingestor (`apps/api/src/ingestor.ts`)

Двухпоточный движок сбора данных:

| Stream | Протокол | Назначение |
|--------|----------|------------|
| **Pulse** | WebSocket | Realtime цены, диагностика |
| **Detective** | HTTP Polling | Сбор сделок, round-robin по рынкам |

**Диаграмма состояний**: [STATE_MACHINES.md#ingestor](./STATE_MACHINES.md#1-ingestor-state-machine)

### 3.2 Analysis Service (`analysis.service.ts`)

**Alpha Matrix** — скоринговый движок (0-100):

| Компонент | Вес (Proven) | Вес (Fresh) |
|-----------|--------------|-------------|
| Performance | 60% | — |
| Insider Score | 25% | 50% |
| Volume Signal | 15% | 50% |

**Kill Switches**:
- `amountUSD < $500` → Score 0
- `BUY && price >= 0.92` → Score 0 (FOMO)
- Sports markets → Score 0
- Wash Traders / Spammers → Score 0

### 3.3 Strategy Service (`strategy.service.ts`)

**Radar Score** = Freshness (40) + Conviction (40) + Timing (20)

| Score | Вердикт |
|-------|---------|
| ≥80 | INSIDER (95% confidence) |
| ≥60 | INSIDER (75% confidence) |
| <60 | SNIPER check или SKIP |

### 3.4 Paper Trading (`paper-trading.service.ts`)

Виртуальный портфель с реалистичными издержками:
- **Slippage** — динамический на основе ликвидности
- **Gas costs** — симуляция транзакций
- **TP/SL** — Take Profit / Stop Loss автоматически
- **PANIC** — выход если кит продаёт

### 3.5 Resolution Service (`resolution.service.ts`)

Автоматический settlement каждые 10 минут:
1. Запрос Gamma API для resolved рынков
2. Определение winner (UMA / resolution_price)
3. Обновление Signal.status (WON/LOST)
4. Пересчёт Whale stats

### 3.6 Funding Service (`funding.service.ts`)

Анализ источника средств через Alchemy API:

| Tag | Score Boost | Источники |
|-----|-------------|-----------|
| SUSPICIOUS_INSIDER | +40 | Tornado Cash |
| WHALE | +20 | Известные киты |
| BRIDGE | +10 | Multichain, Hop |
| RETAIL | -10 | CEX (Binance) |

---

## 4. База Данных

```
Whale ─┬─ Signal ─── PaperPosition
       │
       └─ Watchlist ─── User

Strategy ─── PaperPosition
```

| Таблица | Ключевые поля |
|---------|---------------|
| `Whale` | address, winrate, pnl, score, tags, fundingSourceTag |
| `Signal` | marketSlug, outcome, price, aiScore, status (OPEN/WON/LOST) |
| `Strategy` | name, config (JSON), currentBalance |
| `PaperPosition` | entryPrice, shares, exitReason, pnl, slippage |

---

## 5. Клиентские Приложения

### Chrome Extension
- **Технология**: Plasmo + React
- **Инъекция**: Content script на `polymarket.com/event/*`
- **Функция**: Overlay с sentiment bar

### Web Dashboard
- **Технология**: Next.js 14
- **Функции**: Лента сигналов, статистика стратегий
- **API**: `/api/signals/feed`, `/api/strategies`

---

## 6. Deployment

| Сервис | Порт | Статус |
|--------|------|--------|
| API (Hono) | 3001 | ✅ Production |
| Web (Next.js) | 3000 | ✅ Production |
| PostgreSQL | 5432 | ✅ Local |

**VPS**: `87.120.186.161`

---

## 7. Дополнительная Документация

- [ARCHITECTURE_ANALYSIS.md](./ARCHITECTURE_ANALYSIS.md) — детальный архитектурный анализ, roadmap
- [STATE_MACHINES.md](./STATE_MACHINES.md) — mermaid-диаграммы состояний всех компонентов
