# 🏆 VEGA - Elite GMX Scalping Competitor

An elite AI trading agent specializing in high-frequency GMX scalping for competitive trading rankings. Built with the Daydreams AI framework and optimized for rapid-fire profit extraction in volatile markets.

## ⚡ Competition Overview

Vega is an autonomous scalping specialist designed for GMX trading competitions. Unlike traditional portfolio managers, Vega operates with aggressive scalping tactics to maximize trade frequency, win rate, and total return within strict time constraints.

### 🎯 Competition Capabilities

- **🚀 Lightning Scalping**: 30-minute maximum hold times for rapid profit extraction
- **🤖 AI-Powered Signals**: Synth AI predictions 
- **📊 High-Frequency Trading**: Multiple trades per hour during volatile periods
- **💰 Aggressive Sizing**: 5-10% position sizes for maximum competition impact

## 🚀 Quick Start

### Prerequisites

- Node.js v18+ or Bun runtime
- pnpm package manager  
- Arbitrum wallet with substantial trading capital
- Pre-approved tokens on GMX (visit [app.gmx.io](https://app.gmx.io))
- Synth AI API access for predictions

### Installation

1. **Clone and install dependencies:**
```bash
git clone <repository>
cd examples/gmx
pnpm install
```

2. **Configure environment (.env):**
```env
# AI Provider Keys
ANTHROPIC_API_KEY=your_anthropic_key
OPENROUTER_API_KEY=your_openrouter_key
SYNTH_API_KEY=your_synth_api_key

# GMX Configuration
GMX_NETWORK=arbitrum
GMX_CHAIN_ID=42161
GMX_RPC_URL=https://arb1.arbitrum.io/rpc
GMX_ORACLE_URL=https://arbitrum-api.gmxinfra.io
GMX_SUBSQUID_URL=https://gmx.squids.live/gmx-synthetics-arbitrum:prod/api/graphql
GMX_WALLET_ADDRESS=0xYourWalletAddress
GMX_PRIVATE_KEY=0xYourPrivateKey

# Scalping Parameters
GMX_MAX_POSITION_SIZE=10    # 10% aggressive competition sizing
GMX_MAX_LEVERAGE=5          # Maximum 5x leverage on high-confidence signals
GMX_MIN_POSITION_SIZE=5     # Minimum 5% for meaningful competition impact

# Discord Integration (Required)
DISCORD_TOKEN=your_discord_bot_token
DISCORD_BOT_NAME=your_bot_name
DISCORD_CHANNEL_ID=your_channel_id

# MongoDB Persistence (Required)
MONGODB_STRING=your_mongodb_connection_string
```

3. **Launch Vega:**
```bash
bun run examples/gmx/example-gmx.ts
```

## ⚡ Scalping Competition Strategy

### 💡 Rapid Decision Making

Vega operates as a competitive scalping specialist:

- **5-Minute Cycles**: Complete market refresh, position monitoring, and opportunity execution
- **AI Signal Priority**: Synth AI predictions with 85%+ confidence get immediate execution
- **Aggressive Positioning**: 5-10% position sizes to maximize competition impact
- **Lightning Exits**: Immediate profit-taking at 1-3% targets, strict 0.5% stop losses

### 📊 Competition-Focused Analysis

- **BTC & ETH Only**: Highest liquidity assets for optimal scalping conditions
- **5-Minute Timeframes**: Ultra-short technical analysis for rapid entries/exits
- **Volume Spike Detection**: Identifies momentum breakouts in real-time
- **AI Prediction Integration**: Top Synth miners provide directional bias

### ⚡ High-Frequency Execution

- **Sub-30-Second Trades**: From signal detection to order execution
- **Competition Metrics**: Win rate >75%, total return optimization, trade count maximization
- **Adaptive Leverage**: 3-5x on high-confidence AI signals
- **Risk Management**: Never hold losing positions beyond 5 minutes

## 🛡️ Scalping Risk Management

### 🔒 Competition Safety Protocols

- **Maximum Hold Time**: 5 minutes absolute maximum (scalping discipline)
- **Position Size**: 5-10% of portfolio for aggressive competition impact
- **Leverage Limits**: 3-5x on AI-confirmed signals only
- **Stop-Loss Mandatory**: 0.5% maximum loss per scalp
- **Take-Profit Targets**: 1-3% immediate profit-taking

### 📈 Scalping Position Algorithm

```
Scalp Size = Portfolio × AI Confidence × Competition Aggression
Max Scalp = Portfolio × 10% 
Leverage = AI Signal Strength × 3-5x
Hold Time = MAX 5 minutes (STRICT)
```

### 🎯 Competition Performance Metrics

- **Win Rate**: Target >75% for competitive ranking
- **Trade Frequency**: Multiple trades per hour during volatility
- **Total Return**: Primary competition ranking metric
- **Average Hold Time**: <3 minutes for optimal scalping

## 🏆 Scalping Cycle (Every 5 Minutes)

### ⚡ Automated Competition Cycle

Vega executes a complete scalping cycle every 5 minutes:

1. **🔄 Market Refresh**: Latest BTC/ETH prices and volume conditions
2. **🤖 AI Signal Check**: Fetch predictions from top Synth miners
3. **🎯 Opportunity Scan**: Identify high-confidence scalping setups
4. **⚖️ Position Monitor**: Check all positions for exit signals
5. **💰 Trade Execution**: Execute scalps, set stops/targets, close profits

### 📊 Real-Time Competition Updates

```
⚡ BTC scalp entry at $43,210 - 5x leverage, targeting +1.5% in 3 minutes
💰 ETH scalp closed +2.1% profit in 4m 32s - competition points secured!
🏆 Daily performance: +4.3%, 12/15 wins, currently rank #3 in competition
🚨 Risk alert: Down 2.8% today, reducing size until win streak returns
```

## 🤖 Scalping Actions

### 📊 Market Intelligence

- `get_portfolio_balance` - Comprehensive portfolio balance with token balances, position values, and total worth
- `get_markets_info` - Lightning-fast BTC/ETH price updates and comprehensive market data
- `get_markets_list` - Get list of available markets with pagination
- `get_daily_volumes` - Liquidity analysis for scalping conditions
- `get_tokens_data` - Complete token information including balances and prices
- `get_synth_leaderboard` - Top AI miners for prediction quality
- `get_latest_predictions` - Real-time AI signals for entry timing

### ⚡ High-Frequency Trading (GMX SDK Helper Functions)

- `open_long_position` - Rapid long scalp execution using simplified GMX helper
- `open_short_position` - Lightning short scalp entry with helper function
- `swap_tokens` - Token swapping with limit/market order support
- `cancel_orders` - Cancel pending orders by order keys
- `close_position_market` - Immediate market price position closing

#### 🔧 Critical Parameter Format Requirements

**Position Opening** (Either/Or Parameters):
- `payAmount`: Token amount in native decimals as string (e.g., "1000000" for 1 USDC)
- `sizeAmount`: Position size in USD with 30 decimals as string (e.g., "5000000000000000000000000000000000" for $5000)

**Required Parameters**:
- `marketAddress`: Market token address (from get_markets_info response)
- `payTokenAddress`: Token being paid with
- `collateralTokenAddress`: Collateral token

**Optional Parameters**:
- `leverage`: Basis points as string (e.g., "50000" for 5x)
- `limitPrice`: For limit orders (30 decimal USD string)
- `allowedSlippageBps`: Default 100 (1%)

#### 🎯 Market Address Resolution

**Critical Process**: To get the correct `marketAddress` for trading:

1. **Call `get_markets_info`** first to fetch all available markets
2. **Look in response arrays**:
   - `allMarkets`: Complete list of all available markets
   - `topMarketsByInterest`: Top 10 markets by trading volume
3. **Find your market by name** (e.g., "BTC/USD [BTC-USDC]", "ETH/USD [ETH-USDC]")
4. **Extract `marketAddress`** field from the market object
5. **Use in trading actions** - pass this address to `open_long_position`, `open_short_position`, etc.

**Example Market Object**:
```json
{
  "name": "BTC/USD [BTC-USDC]",
  "marketAddress": "0x47c031236e19d024b42f8AE6780E44A573170703",
  "indexToken": "BTC",
  "indexTokenAddress": "0x47904963fc8b2340414262125aF798B9655E58Cd",
  "longToken": "BTC",
  "shortToken": "USDC"
}
```

### 🎯 Advanced Order Management

- `create_take_profit_order` - Conditional take profit orders (1-3% targets)
- `create_stop_loss_order` - Stop loss protection (0.5% maximum loss)
- `get_orders` - Comprehensive pending orders with execution analysis
- `get_positions` - Enhanced position tracking with PnL, liquidation prices, risk metrics

### 📈 Competition Analytics

- `get_trade_history` - Comprehensive trading history with advanced analytics including:
  - Win rate, profit factor, risk-adjusted returns
  - Portfolio analysis by market and daily activity
  - Slippage analysis and fee tracking
  - Performance metrics for competition ranking

## 💬 Competition Communications

### 🏆 Live Scalping Updates

Vega provides aggressive competition updates:

```
🚀 LONG BTC 5x at $43,250 | Target: $43,890 (+1.5%) | SL: $43,035 (-0.5%)
⚡ ETH scalp exit +2.3% in 2m 47s | Competition points: +23
🏆 Win streak: 8/10 | Daily P&L: +$1,247 | Rank: #2 in competition
🎯 AI Signal: 94% confidence ETH move - executing 8% position NOW
💰 BTC scalp closed +1.8% | Total trades today: 27 | Win rate: 81%
```

### 📊 Competition Performance Tracking

- Real-time ranking updates
- Win rate percentage (target: >75%)
- Trade count optimization
- Total return competition standing
- Risk management alerts

## 🔧 Technical Architecture

### ⚡ Scalping Optimizations

- **5-Minute Cycles**: Single unified scalping input for maximum efficiency
- **MongoDB Persistence**: Competition metrics and trade history storage
- **Discord Integration**: Real-time scalping updates and competition tracking
- **AI Signal Processing**: Synth AI predictions for high-confidence entries

### 🏆 Competition Features

- **Fixed Context ID**: Prevents MongoDB duplication for consistent tracking
- **Scalping Task Names**: Dynamic competition-focused activity descriptions
- **Performance Aggregation**: Win rate, total return, and ranking calculations
- **Risk Monitoring**: 5-minute hold time enforcement and loss prevention

## 📝 Competition Notes

### ⚠️ Scalping Requirements

1. **High Capital**: Minimum $10,000 recommended for meaningful competition impact
2. **Token Approvals**: Pre-approve BTC and ETH on [app.gmx.io](https://app.gmx.io)
3. **Synth AI Access**: Active subscription for prediction signals
4. **Discord Setup**: Required for competition updates and monitoring

### 🏆 Competition Success Factors

- **Speed is Everything**: First to react wins the scalping game
- **AI Signal Discipline**: Only trade 85%+ confidence predictions
- **5-Minute Maximum**: Never break scalping discipline on hold times
- **Win Rate Focus**: Maintain >75% success rate for competitive edge
- **Aggressive Sizing**: 5-10% positions for maximum ranking impact

### 🔒 Security & Risk

- Private keys used locally for transaction signing only
- No fund custody - all assets remain in your personal wallet
- Competition-level risk tolerance with strict stop-loss protection
- MongoDB persistence for competition tracking and performance analysis

## 📊 Competition Metrics

### 🎯 Success Indicators

- **Win Rate**: >75% (competitive threshold)
- **Average Hold Time**: <3 minutes (optimal scalping)
- **Daily Trade Count**: 15-30 trades (high frequency)
- **Total Return**: Primary ranking metric
- **Risk-Adjusted Return**: Competition efficiency measure

## 📄 License

MIT License - See [LICENSE](LICENSE) for details.

---

**⚠️ Competition Risk Disclaimer**: Scalping competitions involve extreme risk and volatility. This agent uses aggressive strategies designed for short-term competitive performance, not long-term wealth preservation. High-frequency trading can result in rapid losses. Only participate with capital you can afford to lose completely. Past performance does not guarantee future results.