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
├── agent-gmx.ts          # Main application entry point - "Vega" agent initialization
├── gmx-actions.ts        # Trading actions/functions for GMX protocol
├── types.ts              # TypeScript interfaces for GMX memory and trading data
├── utils.ts              # Mathematical utilities for price calculations and PnL
├── queries.ts            # Market data queries and formatted string outputs
├── logger.ts             # Debug logging system with file output
├── logs/                 # Session-based debug logs directory
├── package.json          # Dependencies and scripts (Bun runtime)
├── tsconfig.json         # TypeScript configuration (ES2022/ESNext)
└── pnpm-lock.yaml        # Package lock file
```

## 🛠 Technology Stack

### Core Dependencies
- **@daydreamsai/core**: AI agent framework for autonomous decision making (v0.3.8)
- **@daydreamsai/discord**: Discord integration for real-time notifications (v0.3.8)
- **@daydreamsai/mongodb**: MongoDB persistence for agent memory (v0.3.8)
- **@gmx-io/sdk**: Official GMX protocol SDK for trading operations (v1.1.2)
- **viem**: Ethereum client library for blockchain interactions (v2.0.0)
- **zod**: Schema validation and type safety (v3.25.23)

### Runtime Environment
- **Runtime**: Bun (alternative to Node.js)
- **Package Manager**: pnpm
- **Language**: TypeScript with strict typing
- **Blockchain**: Arbitrum (Ethereum L2)
- **Database**: MongoDB for persistent memory

## 🎯 Key Components

### Main Files Explained

#### `agent-gmx.ts` (Main Entry Point)
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
- Sleep utility for transaction timing

#### `queries.ts` (Market Data Formatting)
- Formatted string outputs for market data, positions, orders
- Portfolio balance calculations with USD conversion
- Enhanced data processing for agent consumption

#### `logger.ts` (Debug System)
- Session-based file logging with timestamps
- BigInt-safe JSON serialization
- Console and file output for debugging
- Error tracking with stack traces

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
bun install

# Start main trading agent
bun run start
# or
bun run dev

# Development mode
bun run agent-gmx.ts

# Test Discord integration
bun run discord
```

## 🔍 Key Development Areas

### Trading Strategy Logic (`gmx-actions.ts`)
- Market analysis functions (lines 30-150)
- Position management (lines 400-800)
- Risk calculation utilities (lines 1500-2000)
- AI signal integration (lines 200-300)

### Agent Personality (`agent-gmx.ts`)
- "Vega" character definition (lines 100-200)
- Competition-focused behavior patterns
- Memory structure and persistence logic

### Financial Calculations (`utils.ts`)
- Precise BigInt arithmetic for trading calculations
- Leverage and liquidation price formulas
- PnL tracking and risk metrics

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
- **marketAddress**: Market token address from `get_btc_eth_markets()` (NOT indexTokenAddress)
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
- **Solution**: Wait 3-5 seconds between transactions (implemented via `sleep(3000)`)
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

### 🎯 Market Address Resolution (Fixed)

**Problem Solved**: Agent couldn't find market addresses because `get_btc_eth_markets` was filtering them out.

#### Solution Implemented
1. **Enhanced Response Structure**: Added `marketAddress` field to market objects
2. **Complete Markets List**: Both `topMarketsByInterest` and `allMarkets` arrays
3. **Comprehensive Market Data**: Each market object includes:
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

### 🛡️ Error Prevention Strategies

1. **Parameter Validation**: Always use exact schema parameter names
2. **String Format**: All BigInt values must be passed as strings
3. **Decimal Precision**: Respect each token's decimal precision (check tokensData)
4. **Market Addresses**: Use marketTokenAddress from get_btc_eth_markets response
5. **Sequential Execution**: Wait between transactions to avoid nonce conflicts
6. **Market Address Lookup**: Always call get_btc_eth_markets first to resolve market names to addresses

### 🐛 Common Debugging Patterns

#### Stop Loss/Take Profit Price Validation (Fixed)
**Problem**: Actions showing $0.00 current price validation
**Root Cause**: Using index token prices instead of position mark prices
**Solution**: Use existing `get_positions_str` logic and position.markPrice

#### Template Variables Not Resolving  
**Symptoms**: Discord messages show `{{calls[0].portfolio.summary.totalValue}}` instead of values
**Root Cause**: Template engine not processing variables or missing action context
**Solution**: Add agent instructions to format responses directly from action data

#### Parameter Format Errors
**Symptoms**: `ParsingError` or `ZodError` with parameter validation
**Root Cause**: Using raw SDK parameters instead of helper function parameters
**Solution**: Update agent instructions with correct parameter formats and examples

#### Transaction Nonce Errors (Fixed)
**Problem**: "nonce too low" errors during rapid trading
**Root Cause**: Transactions sent too quickly without proper sequencing
**Solution**: Added 3-second sleep before all write operations in gmx-actions.ts

#### Missing Trigger Price in Orders (Fixed)
**Problem**: Stop loss and take profit orders executing with trigger price = 0
**Root Cause**: Missing `triggerPrice` field in decreaseAmounts object
**Solution**: Added `triggerPrice: BigInt(data.triggerPrice)` to both actions

#### JSON Parsing Errors with Optional Parameters
**Symptoms**: `ParsingError: JSON Parse error: Unexpected EOF` when calling actions
**Root Cause**: Agent sending malformed or empty JSON for actions with optional parameters
**Solution**: Explicitly instruct agent to use empty object {} for optional parameters

#### ACTION_MISMATCH Errors
**Symptoms**: `[ERROR] [agent:action] ACTION_MISMATCH` with data: ""
**Root Cause**: Agent passing empty string "" to actions that don't expect parameters
**Solution**: Clearly document which actions have no schema (no parameters)

### 📋 Current Action List

#### Market Data Actions
- `get_btc_eth_markets` - BTC/ETH market data with addresses (no params)
- `get_daily_volumes` - Volume data for liquidity analysis (no params)
- `get_tokens_data` - Token balances and prices (no params)
- `get_portfolio_balance` - Complete portfolio overview (no params)
- `get_positions` - Current positions with risk metrics (no params)
- `get_orders` - Pending orders with analysis (no params)

#### Trading Actions
- `open_long_position` - Open long with limit order support
- `open_short_position` - Open short with limit order support
- `close_position` - Close position at market price
- `swap_tokens` - Token swapping for portfolio management

#### Risk Management Actions
- `set_stop_loss` - Set stop loss on existing position
- `set_take_profit` - Set take profit on existing position

#### AI Intelligence Actions
- `get_synth_leaderboard` - Top AI miner rankings (no params)
- `get_latest_predictions` - Market predictions by miner ID

### 🔧 Debug Logging System

#### File-Based Logging
- **Location**: `logs/gmx-debug-{timestamp}.log`
- **Functions**: `debugLog(category, message, data)`, `debugError(category, error, context)`
- **Features**: BigInt-safe JSON serialization, stack trace capture, timestamp headers

#### Usage Patterns
```typescript
// Standard debug logging
debugLog('OPEN_LONG', 'Starting position creation', { input: data });

// Error logging with context
debugError('OPEN_LONG', error, { stage: 'transaction', marketAddress: data.marketAddress });
```

### 📊 Position Data Fetching (Fixed)

**Critical Fix**: Both `set_stop_loss` and `set_take_profit` now properly fetch position data:

1. Use same logic as working `get_positions_str` function
2. Call `sdk.positions.getPositionsInfo()` for enhanced position data
3. Use `position.markPrice` for current market price validation
4. Proper error handling if position not found

## 🤝 Code Reuse Guidelines

- Always check existing components before creating new ones
- Reuse calculation utilities from `utils.ts`
- Follow established patterns in `gmx-actions.ts`
- Maintain consistency with agent personality in `agent-gmx.ts`
- Use GMX SDK helper functions instead of raw SDK methods
- Validate all parameters against action schemas before implementation
- Leverage existing query functions from `queries.ts` for data formatting

## 🔄 Recent Major Updates

### 1. Limit Order Support (Added)
- Added `limitPrice` parameter to position opening actions
- Supports both market and limit order execution
- Proper 30-decimal precision handling

### 2. Token Swap Functionality (Added)
- Implemented `swap_tokens` action using GMX SDK
- Support for ETH/WETH and ERC20 token swaps
- Proper slippage and fee handling

### 3. Enhanced Order Display (Fixed)
- Fixed `get_orders` showing "[Data Missing]"
- Proper field mapping for enhanced order properties
- Complete order analysis with execution probability

### 4. Transaction Timing (Fixed)
- Added 3-second delays before all write operations
- Prevents nonce collision errors
- Sequential transaction execution

### 5. Debug Logging System (Added)
- Comprehensive file-based logging
- BigInt-safe JSON serialization
- Session-based log files with timestamps

### 6. Stop Loss/Take Profit Fix (Fixed)
- Fixed $0.00 price validation errors
- Proper position data fetching using existing queries
- Added `triggerPrice` field to decrease amounts

### 7. Market Address Resolution (Enhanced)
- Complete market data with addresses in responses
- Simplified market lookup for trading actions
- Proper market validation and error handling

## 🎯 Agent Instructions

### Trading Behavior
- Focus on BTC and ETH markets for liquidity
- Maximum 60-minute hold times for scalping
- Mandatory stop-loss on all positions
- Use AI predictions for entry/exit timing

### Risk Management
- Never exceed 10% portfolio allocation per position
- Maximum 5x leverage on high-confidence signals
- Always validate current prices before setting stops
- Monitor liquidation distances continuously

### Error Handling
- Always check market addresses before trading
- Validate all BigInt parameter formats
- Use proper decimal precisions for tokens
- Sequential execution for all write operations

### Communication
- Provide clear trade summaries in Discord
- Log all critical actions for debugging
- Format responses with proper price/percentage displays
- Update memory state after each action