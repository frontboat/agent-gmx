# Agent GMX

An autonomous AI trading agent for GMX perpetual futures, built with the Daydreams AI framework.

## Features

- **Autonomous Trading**: AI-driven position management and scalping
- **GMX Integration**: Full GMX SDK integration with comprehensive market data
- **Risk Management**: Built-in stop-loss, take-profit, and position sizing
- **AI Predictions**: Synth AI integration for market intelligence
- **Real-time Monitoring**: Discord notifications and portfolio tracking
- **Persistent Memory**: MongoDB-backed state management

## Quick Start

### Prerequisites

- Node.js 18+ or Bun runtime
- Arbitrum wallet with trading capital
- Pre-approved tokens on [app.gmx.io](https://app.gmx.io)

### Installation

```bash
git clone <repository>
cd agent-gmx
pnpm install
```

### Configuration

Create `.env` file:

```env
# AI & APIs
ANTHROPIC_API_KEY=your_key
OPENROUTER_API_KEY=your_key
SYNTH_API_KEY=your_key

# GMX Configuration
GMX_NETWORK=arbitrum
GMX_CHAIN_ID=42161
GMX_RPC_URL=https://arb1.arbitrum.io/rpc
GMX_ORACLE_URL=https://arbitrum-api.gmxinfra.io
GMX_SUBSQUID_URL=https://gmx.squids.live/gmx-synthetics-arbitrum:prod/api/graphql
GMX_WALLET_ADDRESS=0xYourAddress
GMX_PRIVATE_KEY=0xYourKey

# Risk Management
GMX_MAX_POSITION_SIZE=5    # % of portfolio
GMX_MAX_LEVERAGE=5         # Maximum leverage
GMX_SLIPPAGE_TOLERANCE=125 # Basis points

# Infrastructure
DISCORD_TOKEN=your_token
DISCORD_BOT_NAME=your_bot
MONGODB_STRING=your_connection
```

### Run

```bash
bun run example-gmx.ts
```

## Trading Actions

### Market Data
- `get_portfolio_balance` - Portfolio overview with balances and positions
- `get_markets_info` - Market data with prices and addresses
- `get_positions` - Current positions with PnL and risk metrics
- `get_orders` - Pending orders with execution analysis

### Trading
- `open_long_position` - Open long position
- `open_short_position` - Open short position  
- `close_position_market` - Close at market price
- `create_take_profit_order` - Set profit target
- `create_stop_loss_order` - Set stop loss
- `swap_tokens` - Token swapping

### AI Intelligence
- `get_synth_leaderboard` - Top AI miners
- `get_latest_predictions` - Market predictions

## Usage Examples

### Open Position
```javascript
// 1. Get market address
const markets = await get_markets_info();
const btcMarket = markets.allMarkets.find(m => m.name === "BTC/USD [BTC-USDC]");

// 2. Open position
await open_long_position({
  sizeAmount: "1000000000000000000000000000000000", // $1000
  marketAddress: btcMarket.marketAddress,
  payTokenAddress: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", // USDC
  collateralTokenAddress: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
  leverage: "20000" // 2x
});
```

### Risk Management
```javascript
// Set stop loss and take profit
await create_stop_loss_order({
  marketAddress: btcMarket.marketAddress,
  collateralTokenAddress: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
  isLong: true,
  triggerPrice: "95000000000000000000000000000000000", // $95k
  sizeDeltaUsd: "1000000000000000000000000000000000"   // $1000
});
```

## Parameter Formats

### Position Opening
- **Either** `payAmount` (token decimals) **OR** `sizeAmount` (USD with 30 decimals)
- **Required**: `marketAddress`, `payTokenAddress`, `collateralTokenAddress`
- **Optional**: `leverage` (basis points), `limitPrice`, `allowedSlippageBps`

### Market Addresses
1. Call `get_markets_info()`
2. Find market in `allMarkets` array by name
3. Use `marketAddress` field for trading

### Price Formats
- **USD amounts**: 30 decimal precision (`"1000000000000000000000000000000000"` = $1000)
- **Token amounts**: Native token decimals (`"1000000"` = 1 USDC)
- **Leverage**: Basis points (`"50000"` = 5x)

## Architecture

- **Framework**: Daydreams AI for autonomous decision making
- **Blockchain**: Arbitrum via GMX SDK
- **Database**: MongoDB for persistent memory
- **Notifications**: Discord integration
- **Runtime**: Bun/Node.js with TypeScript

## Security

- Private keys used locally only
- No fund custody - assets remain in your wallet
- Environment variables for sensitive data
- Built-in risk controls and position limits

## License

MIT License