Simplified Perpetual futures trading bot for [Lighter DEX](https://mainnet.zklighter.elliot.ai) (zkLighter mainnet). Each cycle it fetches candle data, computes technical indicators, asks a model (Flagships across Claude/Qwen/OpenAI) to decide what to do on **SOL**, **ZEC**, and **HYPE**, then signs and submits market orders via the bundled `lighter-sdk-ts` signer.


**Warning:** This bot places **real orders** on mainnet with real funds. Use a small account, understand liquidation risk, and treat this as experimental software.



1. **Indicators** — For each market, load the last 10 points of mid price, EMA(20), MACD, and RSI from 5m and 4h candles (`stockPrices.ts`, `indicators.ts`).
2. **Stop-loss (code)** — Before the model runs, `stopLoss.ts` closes any position whose unrealized PnL drawdown exceeds `STOP_LOSS_PCT` (default 2% of notional; see `config.ts`).
3. **LLM decision** — The model must call `evaluateAllMarkets` with **exactly three** decisions (one per symbol): `hold`, `openLong`, `openShort`, `close`, `closeAndOpenLong`, or `closeAndOpenShort`.
4. **Execution** — `createPosition.ts` and `closeAllPosition.ts` submit IOC market orders through `SignerClient`.
5. **Logging** — Each invocation and tool result is stored in `trading.db` (`db.ts`). Optional live UI: `dashboard.ts`.

Trading rules and sizing guidance live in `prompt.ts` (injected with portfolio, positions, and indicator snapshots).


## Setup

```bash
bun install
```

```
# Lighter signing keys (one per row in accounts.ts)
API_KEY_QWEN_SUBACC__WITH_INDEX_2=...
API_KEY_MAIN_ACC=...
API_KEY_XIAOMI=...
```

Edit `accounts.ts` to map env vars to `accountIndex`, display `Name`, and `modelName` (OpenAI model id). The bot loop uses `SUPPORTED_ACCOUNTS[0]` by default.


## Markets

Defined in `markets.ts`:

| Symbol | Market ID | Leverage (prompt) |
|--------|-----------|-------------------|
| SOL | 2 | 10x |
| ZEC | 90 | 5x |
| HYPE | 24 | 10x |

## Run

### Trading loop (main entry)

```bash
bun llm_stuff.ts
```

Runs forever: invocation #0, #1, … with a **15 second** pause between cycles. Console output includes open positions, per-market tool actions (`[hold]`, `[open]`, `[close]`, `[reverse]`), and `[agent] response:`.

To use a different account, change the index in the `import.meta.main` block at the bottom of `llm_stuff.ts`.

### Dashboard

After at least one invocation has written to `trading.db`:

```bash
bun dashboard.ts
```

Open http://localhost:3001 — invocations and tool calls with SSE refresh on `/api/stream`.

### Utilities (read-only or one-off)

```bash
bun getPortfolio.ts    # collateral + available balance
bun getPositions.ts    # open positions for SUPPORTED_ACCOUNTS[0]
```

`createPosition.ts` and `closeAllPosition.ts` are libraries; they run standalone only if their `import.meta.main` blocks are present.

## Project layout

```
ai-trading/
├── llm_stuff.ts       # Agent loop + evaluateAllMarkets tool
├── prompt.ts          # System prompt template
├── accounts.ts        # Account ↔ API key ↔ model mapping
├── config.ts          # BASE_URL, API_KEY_INDEX, stop-loss %
├── markets.ts         # Symbol → marketId, decimals
├── stockPrices.ts     # Candles + indicator bundles
├── indicators.ts      # EMA, MACD, RSI
├── createPosition.ts  # Open LONG/SHORT market order
├── closeAllPosition.ts # closePosition(symbol) + closeAllPosition()
├── stopLoss.ts        # Pre-LLM drawdown guard
├── getPositions.ts    # Account positions API
├── getPortfolio.ts    # Balance API
├── db.ts              # SQLite schema + logging
├── dashboard.ts       # Bun.serve UI on :3001
├── dashboard.html     # Dashboard frontend
└── lighter-sdk-ts/    # Lighter signer + generated OpenAPI client
```


## Development notes

- Orders are **market IOC** with a 1% slippage cushion on price (see `createPosition.ts` / `closeAllPosition.ts`).
- The model is forced to use a tool each step (`toolChoice: 'required'`) and is limited to one tool step (`maxSteps: 1`).
- Position sizing is prompt-guided (~28% of margin per market when entering); the code does not hard-cap size beyond exchange rejection.
- `trading.db` is created on first run; delete it to reset history (does not affect exchange positions).

## Disclaimer

Not financial advice. Leveraged perpetuals can lose more than your deposit. Review `prompt.ts`, `STOP_LOSS_PCT`, and account config before running with real capital.
