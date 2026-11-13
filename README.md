# Binance Trade Chart

A TradingView-style Binance USD-M Futures chart terminal.

## Features
- Binance Futures REST historical candles and live WebSocket updates
- TradingView Lightweight Charts
- Last / Mark / Index price modes
- Searchable futures watchlist, favorites, Top 100, gainers and losers
- Drawing tools, drawing favorites and one-shot tool selection
- Price alerts, sound and vibration controls
- Custom timeframes and bar replay
- Installable PWA

## Run locally
Requires Node.js 22.12+.

```bash
npm install
npm run dev
```

## Production build
```bash
npm run build
npm run preview
```

No Binance API key is required for public market data. Do not commit private API keys or Cloudflare secrets.
