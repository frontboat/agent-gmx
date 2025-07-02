# 🤖 Agent GMX - Autonomous Trading Agent

> **An AI-powered autonomous trading agent specialized in GMX perpetual futures scalping on Arbitrum blockchain**

## 🚀 Overview

Agent GMX is a sophisticated cryptocurrency trading agent built with the Daydreams AI framework. It specializes in high-frequency GMX perpetual futures trading with AI-driven decision making, optimized for trading competitions and scalping strategies.

### Key Features

- **🎯 Autonomous Trading**: AI-driven decision making with sub-30-second execution
- **📊 High-Frequency Scalping**: 5-minute cycles, maximum 60-minute holds
- **🔍 Advanced Analytics**: Real-time market analysis and portfolio tracking
- **⚡ GMX Protocol Integration**: Full GMX SDK v1.1.2 integration with limit orders
- **🛡️ Risk Management**: Multi-layer protection with stop-loss and take-profit
- **📈 AI Predictions**: Synth AI integration for market intelligence
- **💬 Discord Integration**: Real-time notifications and monitoring

## 🏗️ Architecture

### Core Components

```
├── agent-gmx.ts          # Main agent initialization and personality
├── gmx-actions.ts        # Trading actions and GMX protocol interactions
├── types.ts              # TypeScript interfaces and data structures
├── utils.ts              # Mathematical utilities and calculations
├── queries.ts            # Market data queries and formatting
├── logger.ts             # Debug logging and file output
└── logs/                 # Trading session logs
```

### Technology Stack

- **Runtime**: Bun (JavaScript/TypeScript runtime)
- **Framework**: Daydreams AI Core (v0.3.8)
- **Blockchain**: Arbitrum (Ethereum L2)
- **Protocol**: GMX SDK v1.1.2
- **Database**: MongoDB (persistent memory)
- **AI**: OpenRouter with Google Gemini 2.5 Flash
- **Notifications**: Discord integration

## 🎯 Trading Capabilities

### Market Operations

- **📊 Market Data**: Real-time prices, volumes, funding rates
- **📈 Position Management**: Open/close long/short positions
- **🎯 Order Types**: Market orders, limit orders, stop-loss, take-profit
- **💱 Token Swaps**: Multi-token swapping for portfolio management
- **📊 Portfolio Tracking**: Real-time balance and PnL monitoring

### Risk Management

- **🛡️ Position Limits**: Maximum 10% of portfolio per position
- **📉 Stop-Loss**: Mandatory 0.5% maximum loss per trade
- **📈 Take-Profit**: Automatic profit-taking mechanisms
- **⚖️ Leverage Control**: Maximum 5x leverage on high-confidence signals
- **⏰ Time Limits**: Absolute 60-minute maximum hold times

### AI Intelligence

- **🧠 Synth AI**: Market predictions and signal processing
- **🏆 Leaderboard**: Top miner prediction tracking
- **📊 Technical Analysis**: Multi-timeframe market analysis
- **🎯 Competition Mode**: Aggressive strategies for ranking optimization

## 🛠️ Installation & Setup

### Prerequisites

- **Bun Runtime**: Latest version
- **Node.js**: v18+ (for package compatibility)
- **MongoDB**: Local or cloud instance
- **Arbitrum Wallet**: With trading capital
- **API Keys**: OpenRouter, Synth AI, Discord

### Installation

```bash
# Clone repository
git clone <repository-url>
cd agent-gmx

# Install dependencies
bun install

# Configure environment
cp .env.example .env
# Edit .env with your configuration
```

### Environment Variables

```env
# API Keys
ANTHROPIC_API_KEY=your_anthropic_key
OPENROUTER_API_KEY=your_openrouter_key
SYNTH_API_KEY=your_synth_api_key
DISCORD_TOKEN=your_discord_token
DISCORD_BOT_NAME=your_bot_name

# GMX Configuration
GMX_NETWORK=arbitrum
GMX_CHAIN_ID=42161
GMX_ORACLE_URL=https://arbitrum-api.gmxinfra.io
GMX_RPC_URL=https://arb1.arbitrum.io/rpc
GMX_SUBSQUID_URL=https://gmx.squids.live/gmx-arbitrum/graphql
GMX_WALLET_ADDRESS=your_wallet_address
GMX_PRIVATE_KEY=your_private_key

# Database
MONGODB_URL=mongodb://localhost:27017/agent-gmx
CHROMA_URL=http://localhost:8000
```

## 🚀 Usage

### Start Trading Agent

```bash
# Start main trading agent
bun run start

# Development mode
bun run dev

# Discord bot mode
bun run discord
```

### Available Commands

The agent responds to various trading commands and queries:

- **Market Analysis**: `get_btc_eth_markets`, `get_daily_volumes`
- **Portfolio**: `get_portfolio_balance`, `get_positions`, `get_orders`
- **Trading**: `open_long_position`, `open_short_position`, `close_position`
- **Risk Management**: `set_stop_loss`, `set_take_profit`
- **Swaps**: `swap_tokens` for portfolio rebalancing

## 📊 Trading Actions

### Position Management

```typescript
// Open long position with limit order
await agent.open_long_position({
    marketAddress: "0x47c031236e19d024b42f8AE6780E44A573170703",
    payAmount: "1000000000000000000", // 1 ETH
    limitPrice: "109500000000000000000000000000000000", // $109,500
    allowedSlippageBps: 50 // 0.5%
});

// Set stop loss
await agent.set_stop_loss({
    marketAddress: "0x47c031236e19d024b42f8AE6780E44A573170703",
    triggerPrice: "107000000000000000000000000000000000", // $107,000
    allowedSlippageBps: 50
});
```

### Market Data

```typescript
// Get BTC/ETH market information
const markets = await agent.get_btc_eth_markets();

// Get current positions
const positions = await agent.get_positions();

// Get portfolio balance
const balance = await agent.get_portfolio_balance();
```

## 🔧 Advanced Features

### AI-Driven Decision Making

The agent uses multiple AI models for trading decisions:

- **Synth AI**: Market prediction and signal analysis
- **Technical Analysis**: Multi-timeframe pattern recognition
- **Risk Assessment**: Dynamic position sizing and risk management
- **Competition Optimization**: Aggressive strategies for ranking

### Real-Time Monitoring

- **📊 Live Dashboard**: Portfolio performance and positions
- **🔔 Discord Alerts**: Trade notifications and market updates
- **📈 Performance Tracking**: Win rates, P&L, and analytics
- **🚨 Risk Alerts**: Stop-loss triggers and liquidation warnings

### Debug Logging

Comprehensive logging system for troubleshooting:

```bash
# View latest logs
tail -f logs/gmx-debug-*.log

# Search for specific actions
grep "OPEN_LONG" logs/gmx-debug-*.log
```

## 🛡️ Security & Risk Management

### Safety Features

- **🔐 Private Key Security**: Local-only key handling
- **📊 Position Limits**: Automatic position sizing controls
- **⚡ Transaction Timing**: Nonce management and retry logic
- **🛡️ Slippage Protection**: Configurable slippage tolerance
- **📉 Mandatory Stops**: Required stop-loss on all positions

### Risk Controls

- **Maximum Position**: 10% of portfolio per trade
- **Maximum Leverage**: 5x on high-confidence signals
- **Stop-Loss**: 0.5% maximum loss per trade
- **Time Limits**: 60-minute maximum hold time
- **Slippage**: Default 0.5% tolerance

## 📈 Performance Optimization

### High-Frequency Trading

- **⚡ Sub-30s Execution**: Optimized for speed
- **🔄 5-Minute Cycles**: Continuous market scanning
- **📊 Real-Time Data**: Live price feeds and analytics
- **🎯 Scalping Focus**: Short-term profit capture

### Competition Mode

- **🏆 Aggressive Strategies**: Optimized for ranking
- **📈 Risk-Adjusted Returns**: Balanced risk/reward
- **⚡ Rapid Execution**: Minimal slippage and delays
- **📊 Performance Tracking**: Comprehensive analytics

## 🔍 Troubleshooting

### Common Issues

1. **Nonce Errors**: Transactions too fast
   - Solution: 3-second delays implemented between transactions

2. **Price Validation**: $0.00 current price
   - Solution: Proper position data fetching implemented

3. **Market Address**: Invalid market errors
   - Solution: Enhanced market address resolution

4. **Parameter Errors**: Wrong SDK parameters
   - Solution: GMX SDK helper functions used

### Debug Information

```bash
# Check recent logs
ls -la logs/

# Monitor real-time activity
tail -f logs/gmx-debug-*.log

# Search for errors
grep "ERROR" logs/gmx-debug-*.log
```

## 🤝 Contributing

### Development Guidelines

1. **Code Style**: Follow existing TypeScript patterns
2. **Testing**: Test with small positions first
3. **Documentation**: Update CLAUDE.md for changes
4. **Safety**: Never commit private keys or secrets

### Key Development Areas

- **Trading Logic**: `gmx-actions.ts` (lines 200-400)
- **Risk Management**: `gmx-actions.ts` (lines 1500-2000)
- **Market Analysis**: `queries.ts` (lines 50-200)
- **Agent Personality**: `agent-gmx.ts` (lines 100-200)

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

```
MIT License

Copyright (c) 2024 zkorp

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## ⚠️ Disclaimer

**High-Risk Trading Warning**: This software is designed for experienced traders and involves significant financial risk. Cryptocurrency trading can result in substantial losses. Only use with funds you can afford to lose.

- **Not Financial Advice**: This software is for educational and research purposes
- **Use at Your Own Risk**: Authors are not responsible for trading losses
- **Test First**: Always test with small amounts before deploying capital
- **Understand Risks**: Be aware of liquidation, slippage, and market risks

## 🚀 Future Roadmap

- **🔮 Enhanced AI Models**: Multi-model prediction ensemble
- **📊 Advanced Analytics**: Machine learning performance optimization
- **🌐 Multi-Chain Support**: Avalanche and other networks
- **📱 Mobile Interface**: Real-time monitoring app
- **🤖 Strategy Marketplace**: Community-driven trading strategies

---

*Built with ❤️ by [zkorp](https://github.com/z-korp)*  
*Powered by [Daydreams AI](https://github.com/daydreamsai/daydreams)*