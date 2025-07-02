# Vega - AI Trading Agent

Vega is an autonomous AI agent that trades GMX perpetual futures on Arbitrum. Built with the Daydreams AI framework, it specializes in high-frequency scalping strategies.

## Features

- **Autonomous Trading**: AI-driven decision making for GMX perpetual futures
- **Risk Management**: Built-in stop-loss, take-profit, and position sizing
- **Real-time Monitoring**: Discord integration for trade notifications
- **Market Intelligence**: Synth AI integration for predictive signals

## Quick Start

### Prerequisites

- Bun runtime
- Arbitrum wallet with trading capital
- API keys: OpenRouter, Synth AI, Discord

### Installation

```bash
bun install
```

### Configuration

Create a `.env` file with your API keys and wallet details:

```env
OPENROUTER_API_KEY=your_key
SYNTH_API_KEY=your_key
DISCORD_TOKEN=your_token
GMX_WALLET_ADDRESS=your_address
GMX_PRIVATE_KEY=your_private_key
# See agent-gmx.ts for complete environment variables
```

### Run

```bash
bun run agent-gmx.ts
```

## Trading Actions

- **Market Data**: `get_portfolio_balance`, `get_positions`, `get_orders`
- **Trading**: `open_long_position`, `open_short_position`, `close_position`
- **Risk Management**: `set_stop_loss`, `set_take_profit`
- **Swaps**: `swap_tokens`

## Architecture

- `agent-gmx.ts` - Main agent with Vega personality
- `gmx-actions.ts` - Trading actions and GMX integration
- `queries.ts` - Market data queries
- `types.ts` - TypeScript interfaces
- `utils.ts` - Financial calculations

## Risk Warning

⚠️ **High Risk**: Cryptocurrency trading involves significant financial risk. Only trade with funds you can afford to lose. This software is for educational purposes and is not financial advice.

## License

MIT License - Copyright (c) 2024 zkorp

---

Built by [zkorp](https://github.com/z-korp)  
Powered by [Daydreams AI](https://github.com/daydreamsai/daydreams)