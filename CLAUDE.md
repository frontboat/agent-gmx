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
- **Market Data**: Price feeds, volume analysis, oracle integration, comprehensive portfolio balance
- **Position Management**: Open/close positions using GMX SDK helper functions, leverage control, PnL tracking
- **Risk Management**: Stop-loss, take-profit, position sizing calculations with liquidation price analysis
- **AI Integration**: Synth AI predictions and signal processing with leaderboard access
- **Order Management**: Comprehensive order tracking with execution analysis and risk metrics
- **Trading History**: Advanced analytics with win rate, slippage analysis, and performance tracking

#### `types.ts` (Data Structures)
- `GmxMemory`: Agent memory interface for persistent state including portfolio balance tracking
- Trading position types and market data structures
- Validation schemas for external API responses
- Portfolio balance interface with token/position allocation tracking

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

## 🔧 GMX SDK Integration Learnings

### 🎯 Critical Parameter Format Requirements

**MANDATORY**: All trading actions must use GMX SDK helper functions with precise parameter formats:

#### Position Opening (Either/Or Parameters)
- **payAmount**: Token amount in BigInt string using token's native decimals
  - Example: `"1000000"` for 1 USDC (6 decimals)
  - Example: `"1000000000000000000"` for 1 ETH (18 decimals)
- **sizeAmount**: Position size in BigInt string with USD_DECIMALS (30) precision
  - Example: `"5000000000000000000000000000000000"` for $5000 position

#### Required Parameters for All Positions
- **marketAddress**: Market token address from `getMarketsInfo()` (NOT indexTokenAddress)
- **payTokenAddress**: ERC20 contract address of token being paid with
- **collateralTokenAddress**: ERC20 contract address for collateral

#### Optional Parameters
- **leverage**: Basis points as BigInt string (e.g., `"50000"` for 5x leverage)
- **limitPrice**: For limit orders, USD price with 30 decimal precision
- **allowedSlippageBps**: Slippage tolerance in basis points (default: 100 = 1%)
- **referralCodeForTxn**: Optional referral code string

### ❌ Common Parameter Errors to Avoid

**NEVER use these parameters** (they're for raw SDK methods, not helpers):
- `indexTokenAddress`
- `acceptablePrice`
- `minOutputAmount`
- `orderType`
- `sizeUsd`
- `collateralAmount`
- `triggerPrice` (for positions - use `limitPrice` instead)

### 🔧 Helper Function Benefits

1. **Simplified Parameters**: No complex calculations required
2. **Auto-Detection**: SDK automatically picks strategy based on payAmount vs sizeAmount
3. **Built-in Validation**: Parameter validation and market compatibility checks
4. **Order Type Detection**: Presence of limitPrice/triggerPrice determines order type
5. **Error Handling**: Better error messages and transaction simulation

### ⚠️ Transaction Timing Issues

**Nonce Too Low Error**: If you encounter "nonce too low" errors:
- **Cause**: Transactions sent too quickly without proper sequencing
- **Solution**: Wait 3-5 seconds between transactions
- **Prevention**: Use sequential execution only (never parallel transactions)

### 📊 Enhanced Action Capabilities

#### Portfolio Management
- `get_portfolio_balance`: Complete portfolio overview with token/position allocation
- Automatic USD value calculation using current market prices
- Position net value calculation including PnL and fees

#### Advanced Analytics
- `get_trade_history`: Comprehensive trading analytics including:
  - Win rate, profit factor, risk-adjusted returns
  - Slippage analysis and fee tracking
  - Market-by-market performance breakdown
  - Daily trading activity patterns

#### Position Risk Analysis
- `get_positions`: Enhanced with liquidation price calculations
- Distance to liquidation percentage
- Leverage calculation with fee consideration
- Risk level assessment (High/Medium/Low)

#### Order Intelligence
- `get_orders`: Smart order analysis including:
  - Execution probability based on current market price
  - Order age tracking and performance metrics
  - Potential liquidation price if order executes
  - Risk assessment for pending orders

### 🎯 Market Address Resolution (Critical Fix)

**Problem Discovered**: Agent couldn't find market addresses because `get_markets_info` was filtering them out in the response.

#### Root Cause Analysis
- Market addresses were stored internally in `simplifiedMarketsData` 
- But `topMarketsByInterest` mapping was only returning name, indexToken, interests
- Missing `marketAddress` field caused "invalid market address" errors
- Agent had no way to map market names to required addresses

#### Solution Implemented
1. **Enhanced Response Structure**: Added `marketAddress` field to `topMarketsByInterest`
2. **Complete Markets List**: Added `allMarkets` array with ALL available markets
3. **Comprehensive Market Data**: Each market object now includes:
   ```typescript
   {
     name: "BTC/USD [BTC-USDC]",
     marketAddress: "0x47c031236e19d024b42f8AE6780E44A573170703", // ✅ CRITICAL
     indexToken: "BTC",
     indexTokenAddress: "0x47904963fc8b2340414262125aF798B9655E58Cd",
     longToken: "BTC", 
     shortToken: "USDC",
     isSpotOnly: false
   }
   ```

#### Market Address Lookup Process
1. **Call `get_markets_info`** to fetch market data
2. **Search in response arrays**:
   - `allMarkets`: Complete list of all markets
   - `topMarketsByInterest`: Top 10 by volume
3. **Match by market name**: Find desired market (e.g., "BTC/USD [BTC-USDC]")
4. **Extract `marketAddress`**: Use this for all trading actions
5. **Validate address format**: Must be valid hex address starting with 0x

#### Code Changes Made
```typescript
// Before (❌ Missing market address)
topMarketsByInterest: topMarketsByInterest.map(m => ({
  name: m.name,
  indexToken: m.indexToken,
  longInterest: m.longInterestUsd,
  shortInterest: m.shortInterestUsd,
  totalInterest: m.longInterestUsd + m.shortInterestUsd
}))

// After (✅ Includes market address)
topMarketsByInterest: topMarketsByInterest.map(m => ({
  name: m.name,
  marketAddress: m.marketTokenAddress, // ✅ ADDED
  indexToken: m.indexToken,
  longInterest: m.longInterestUsd,
  shortInterest: m.shortInterestUsd,
  totalInterest: m.longInterestUsd + m.shortInterestUsd
}))
```

### 🛡️ Error Prevention Strategies

1. **Parameter Validation**: Always use exact schema parameter names
2. **String Format**: All BigInt values must be passed as strings
3. **Decimal Precision**: Respect each token's decimal precision (check tokensData)
4. **Market Addresses**: Use marketTokenAddress from get_markets_info response
5. **Sequential Execution**: Wait between transactions to avoid nonce conflicts
6. **Market Address Lookup**: Always call get_markets_info first to resolve market names to addresses

### 🐛 Common Debugging Patterns

#### Agent Can't Find Market Addresses
**Symptoms**: Agent reports "cannot find marketAddress" or uses wrong addresses
**Root Cause**: Action response missing market addresses in summary data
**Solution**: Ensure action responses include complete market objects with addresses

#### Template Variables Not Resolving  
**Symptoms**: Discord messages show `{{calls[0].portfolio.summary.totalValue}}` instead of values
**Root Cause**: Template engine not processing variables or missing action context
**Solution**: Add agent instructions to format responses directly from action data

#### Parameter Format Errors
**Symptoms**: `ParsingError` or `ZodError` with parameter validation
**Root Cause**: Using raw SDK parameters instead of helper function parameters
**Solution**: Update agent instructions with correct parameter formats and examples

#### Transaction Nonce Errors
**Symptoms**: "nonce too low" errors during rapid trading
**Root Cause**: Transactions sent too quickly without proper sequencing
**Solution**: Add wait periods and sequential execution instructions

#### Missing Required Parameters
**Symptoms**: Action calls fail with missing parameter errors
**Root Cause**: Agent using old parameter names or missing required fields
**Solution**: Update action descriptions with precise parameter requirements

#### JSON Parsing Errors with Optional Parameters
**Symptoms**: `ParsingError: JSON Parse error: Unexpected EOF` when calling actions
**Root Cause**: Agent sending malformed or empty JSON for actions with optional parameters
**Solution**: Explicitly instruct agent to use empty object {} for optional parameters
**Example Fix**: 
```typescript
// Wrong: get_markets_list() or get_markets_list("")
// Correct: get_markets_list({}) or get_markets_list({"limit": 10})
```

## 🤝 Code Reuse Guidelines

- Always check existing components before creating new ones
- Reuse calculation utilities from `utils.ts`
- Follow established patterns in `gmx-actions.ts`
- Maintain consistency with agent personality in `example-gmx.ts`
- Use GMX SDK helper functions instead of raw SDK methods
- Validate all parameters against action schemas before implementation