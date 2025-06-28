# CLAUDE.md - Development Instructions

## 🤖 Project Context

This is **agent-gmx**, an autonomous cryptocurrency trading agent specialized in GMX perpetual futures scalping. The agent is built using the Daydreams AI framework and operates on Arbitrum blockchain.

### Core Purpose
- **Trading Agent**: Autonomous GMX scalping with AI-driven decisions
- **Competition Focus**: Optimized for trading competitions with aggressive strategies
- **High-Frequency**: 5-minute cycles, sub-30-second execution, maximum 60-minute holds
- **AI-Powered**: Uses Synth AI predictions and Daydreams framework for decision making

## 📁 Codebase Structure

```
/home/djizus/agent-gmx/
├── example-gmx.ts         # Main application entry point - "Vega" agent initialization
├── gmx-actions.ts         # Trading actions/functions for GMX protocol
├── types.ts               # TypeScript interfaces for GMX memory and trading data
├── utils.ts               # Mathematical utilities for price calculations and PnL
├── package.json           # Dependencies and scripts (Bun runtime)
├── tsconfig.json          # TypeScript configuration (ES2022/ESNext)
└── pnpm-lock.yaml         # Package lock file
```

## 🛠 Technology Stack

### Core Dependencies
- **@daydreamsai/core**: AI agent framework for autonomous decision making
- **@daydreamsai/discord**: Discord integration for real-time notifications
- **@daydreamsai/mongodb**: MongoDB persistence for agent memory
- **@gmx-io/sdk**: Official GMX protocol SDK for trading operations
- **viem**: Ethereum client library for blockchain interactions
- **zod**: Schema validation and type safety

### Runtime Environment
- **Runtime**: Bun (alternative to Node.js)
- **Package Manager**: pnpm
- **Language**: TypeScript with strict typing
- **Blockchain**: Arbitrum (Ethereum L2)
- **Database**: MongoDB for persistent memory

## 🎯 Key Components

### Main Files Explained

#### `example-gmx.ts` (Main Entry Point)
- Initializes "Vega" trading agent with personality and context
- Sets up 5-minute automated trading cycles
- Configures MongoDB persistence and Discord integration
- Defines agent memory structure and behavior patterns

#### `gmx-actions.ts` (Trading Engine)
- **Market Data**: Price feeds, volume analysis, oracle integration
- **Position Management**: Open/close positions, leverage control, PnL tracking
- **Risk Management**: Stop-loss, take-profit, position sizing calculations
- **AI Integration**: Synth AI predictions and signal processing

#### `types.ts` (Data Structures)
- `GmxMemory`: Agent memory interface for persistent state
- Trading position types and market data structures
- Validation schemas for external API responses

#### `utils.ts` (Financial Calculations)
- Price calculations with BigInt precision
- Leverage and liquidation price computations
- PnL calculations and risk metrics

## 🔧 Development Guidelines

### Code Conventions
- **TypeScript**: Strict typing with comprehensive interfaces
- **BigInt Arithmetic**: All financial calculations use BigInt for precision
- **Error Handling**: Comprehensive try-catch blocks and validation
- **Modular Actions**: Each trading operation is a separate, testable function

### Architecture Patterns
- **Agent-Based**: Autonomous decision making with personality modeling
- **Action-Oriented**: Each trading operation is an atomic action
- **Memory Persistence**: MongoDB stores agent state between cycles
- **Event-Driven**: Discord notifications for real-time updates

### Security Practices
- **Private Key Handling**: Only used locally for transaction signing
- **Environment Variables**: Sensitive data in `.env` file (not committed)
- **Validation**: Zod schemas for all external data
- **Risk Controls**: Built-in position limits and stop-loss mechanisms

## 🚀 Development Commands

```bash
# Install dependencies
pnpm install

# Start main trading agent
bun run start
# or
bun run dev

# Development mode
bun run example-gmx.ts

# Test Discord integration
bun run test:discord
```

## 🔍 Key Development Areas

### Trading Strategy Logic (`gmx-actions.ts`)
- Market analysis functions (lines 50-150)
- Position management (lines 200-400)
- Risk calculation utilities (lines 450-550)
- AI signal integration (lines 600-700)

### Agent Personality (`example-gmx.ts`)
- "Vega" character definition (lines 20-60)
- Competition-focused behavior patterns
- Memory structure and persistence logic

### Financial Calculations (`utils.ts`)
- Precise BigInt arithmetic for trading calculations
- Leverage and liquidation price formulas
- PnL tracking and risk metrics

## 📊 Testing and Validation

### Manual Testing
- Use testnet environments when available
- Small position sizes for initial testing
- Monitor Discord notifications for real-time feedback

### Performance Metrics
- Win rate tracking (target >75%)
- Trade frequency (15-30 trades/day)
- Average hold time (<3 minutes for scalping)
- Total return optimization

## ⚠️ Important Considerations

### Risk Management
- **Maximum Position Size**: 10% of portfolio
- **Maximum Leverage**: 5x on high-confidence signals
- **Stop-Loss**: Mandatory 0.5% maximum loss per trade
- **Hold Time**: Absolute maximum 60 minutes (scalping focus)

### Environment Requirements
- **Arbitrum Wallet**: Substantial trading capital required
- **API Access**: Synth AI subscription for predictions
- **MongoDB**: Database for persistent agent memory
- **Discord Bot**: Required for notifications and monitoring

### Development Safety
- Always test with small positions first
- Validate all calculations with known good values
- Monitor gas costs and transaction fees
- Ensure proper error handling for failed transactions

## 🔗 External Integrations

### APIs Used
- **GMX Oracle**: Real-time price feeds
- **Synth AI**: Market predictions and signals
- **Discord API**: Notifications and status updates
- **Arbitrum RPC**: Blockchain transaction execution

### Data Sources
- GMX Subsquid GraphQL for historical data
- GMX infrastructure APIs for market data
- OpenRouter for AI model access (Google Gemini 2.5 Flash)

## 📝 Development Notes

- **Scalping Focus**: All logic optimized for high-frequency trading
- **Competition Mode**: Aggressive strategies for ranking optimization
- **AI-Driven**: Heavy reliance on external AI predictions
- **Real-Time**: Sub-minute response times for market opportunities
- **Risk-Aware**: Multiple layers of protection against significant losses

## 🤝 Code Reuse Guidelines

- Always check existing components before creating new ones
- Reuse calculation utilities from `utils.ts`
- Follow established patterns in `gmx-actions.ts`
- Maintain consistency with agent personality in `example-gmx.ts`