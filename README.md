# Vega - Advanced AI Trading Agent

Vega is an autonomous AI-powered trading agent for GMX perpetual futures on Arbitrum/Avalanche networks. Built with the Daydreams AI framework, it implements sophisticated scalping strategies with advanced risk management and AI-driven market intelligence.

## 🚀 Features

### Core Trading Capabilities
- **Autonomous Trading**: AI-driven decision making with Claude Sonnet 4
- **Multi-Network Support**: Arbitrum and Avalanche GMX markets
- **Advanced Risk Management**: Comprehensive failsafe validations and position sizing
- **Intelligent Market Analysis**: Synth AI integration with multi-timeframe momentum analysis
- **Real-time Execution**: Sequential transaction queue with nonce management

### Enhanced Safety
- **Failsafe Validations**: Price direction validation for all take profit/stop loss orders
- **Error Prevention**: Pre-validation eliminates common trading mistakes
- **Dynamic Leverage Management**: Adjusts position sizes based on market volatility

### AI Intelligence
- **Synth AI Integration**: Decentralized AI miner predictions for BTC/ETH
- **Multi-Timeframe Analysis**: Short (15m-1h), Medium (1h-4h), Long (4h+) term signals
- **Dynamic Levels**: Prediction-based stops and targets (not arbitrary percentages)
- **Smart Setup Detection**: WAIT vs actionable signals with trade quality grading (A-D)
- **Momentum Confluence**: Aligns multiple timeframes for high-probability setups

### Performance Optimization
- **Advanced Caching System**: 5-minute TTL cache with promise deduplication prevents redundant API calls
- **Smart Data Loading**: Context-based data loading with cache-first architecture
- **Request Deduplication**: Prevents concurrent duplicate API calls at cache level
- **Transaction Queue**: Sequential execution prevents nonce errors
- **Optimized Trading Cycles**: Event-driven architecture with intelligent triggers

## 📋 Quick Start

### Prerequisites

- **Bun Runtime**: Fast JavaScript runtime and package manager
- **Funded Wallet**: Arbitrum/Avalanche wallet with trading capital and ETH for gas
- **API Keys**: Anthropic, OpenAI, Synth AI, Supabase

### Installation

```bash
# Clone repository
git clone <repository-url>
cd agent-gmx

# Install dependencies
bun install
```

### Configuration

Create a `.env` file with required API keys and wallet configuration:

```env
# Required API Keys
ANTHROPIC_API_KEY=your_anthropic_key
OPENAI_API_KEY=your_openai_key
SYNTH_API_KEY=your_synth_key
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_key

# GMX Configuration
GMX_NETWORK=arbitrum  # or avalanche
GMX_CHAIN_ID=42161    # 43114 for avalanche
GMX_RPC_URL=your_rpc_url
GMX_ORACLE_URL=your_oracle_url
GMX_SUBSQUID_URL=your_subsquid_url
GMX_WALLET_ADDRESS=0x...  # 40 hex chars
GMX_PRIVATE_KEY=0x...     # 64 hex chars
```

### Run Trading Agent

```bash
# Start the autonomous trading agent
bun run start

# Or run directly
bun run agent-gmx.ts

# Development mode
bun run dev
```

## 🛠 Trading Actions

### Market Intelligence
- `get_portfolio_balance` - Complete portfolio analysis with token balances
- `get_positions` - Position analysis with PnL, liquidation prices, risk metrics
- `get_orders` - Pending orders with execution probability analysis
- `get_trading_history` - Performance metrics and trade analysis
- `get_synth_btc_predictions` - Advanced BTC analysis with AI predictions
- `get_synth_eth_predictions` - Advanced ETH analysis with AI predictions

### Position Management
- `open_long_market` / `open_long_limit` - Long position entry (market/limit orders)
- `open_short_market` / `open_short_limit` - Short position entry (market/limit orders)
- `close_position` - Complete position closure with optimal execution
- `cancel_orders` - Cancel pending limit orders

### Risk Management
- `set_take_profit` - Take profit orders with failsafe validation
- `set_stop_loss` - Stop loss orders with direction and distance validation
- `swap_tokens` - Token swaps for capital management

## 🏗 Architecture

### Core Components
- **agent-gmx.ts** - Main agent with Vega personality and trading cycle
- **gmx-actions.ts** - All trading actions with GMX SDK integration
- **gmx-queries.ts** - Market data queries and Synth AI analysis
- **gmx-cache.ts** - High-performance caching system with 5-minute TTL and promise deduplication
- **gmx-utils.ts** - Financial calculations and BigInt precision utilities
- **gmx-wallet.ts** - Wallet initialization and network configuration
- **synth-utils.ts** - Synth AI integration for volatility and predictions
- **transaction-queue.ts** - Sequential transaction execution management
- **gmx-types.ts** - TypeScript type definitions for GMX data structures

### Design Patterns
- **AI-First Data Formatting**: All data returned as AI-readable strings
- **Cache-First Architecture**: Minimizes API calls with intelligent caching
- **Sequential Transaction Execution**: Prevents nonce errors and race conditions
- **Failsafe Validations**: Comprehensive error prevention in risk management
- **Modular Actions**: Consistent structure for easy extension and maintenance

## 🧠 AI Intelligence System

### Synth AI Integration
Vega leverages decentralized AI miners for market predictions:

### Smart Setup Detection
- **High Confidence + Aligned Timeframes** → Actionable LONG/SHORT signals
- **Conflicting Signals or Low Confidence** → WAIT recommendation
- **Trade Quality Grading** → A (excellent) to D (poor) based on confluence

## ⚠️ Risk Warning

**HIGH RISK - REAL MONEY TRADING**: This is a live trading system that uses real cryptocurrency. 

- Only use funds you can afford to lose completely
- Cryptocurrency trading involves significant financial risk
- Past performance does not guarantee future results
- This software is for educational/research purposes
- Not financial advice - trade at your own risk
- Test with small amounts before deploying significant capital
- Monitor the agent continuously during operation

## 🔧 Development

### Testing
```bash
# No formal testing framework - relies on TypeScript strict mode
# Test manually with small amounts first
bun run agent-gmx.ts
```

### Key Files to Understand
1. **CLAUDE.md** - Comprehensive development guide and architecture documentation
2. **agent-gmx.ts** - Main entry point and agent configuration
3. **gmx-actions.ts** - All trading logic and risk management
4. **gmx-queries.ts** - Market data and AI analysis functions
5. **gmx-cache.ts** - High-performance caching system for optimal data access

## 📝 License

MIT License - Copyright (c) 2025 zkorp

## 🏆 Credits

**Built with:**
- [GMX SDK](https://github.com/gmx-io/gmx-sdk) - Decentralized perpetual futures
- [Daydreams AI](https://github.com/daydreamsai/daydreams) - AI agent framework
- [Anthropic Claude](https://anthropic.com) - Advanced AI reasoning
- [Synth AI](https://synthdata.co) - Decentralized market predictions
- [Supabase](https://supabase.com) - Database and vector storage

---

Built by [zkorp](https://github.com/z-korp)  
Powered by [Daydreams AI](https://github.com/daydreamsai/daydreams)