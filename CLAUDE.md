# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is **Vega**, an autonomous AI-powered trading agent for GMX perpetual futures on Arbitrum/Avalanche networks. It uses the Daydreams AI framework to create an aggressive, high-frequency scalping trader personality.

## Key Commands

```bash
# Install dependencies
bun install
# or alternatively
pnpm install

# Run the trading agent
bun run start
# or
bun run dev
# or directly
bun run agent-gmx.ts

# No build step needed - Bun handles TypeScript compilation
# No test commands - testing framework not implemented
# No lint commands defined - TypeScript strict mode enforces code quality
```

## Architecture Overview

### Core Components

1. **agent-gmx.ts** - Main entry point defining the "Vega" personality and agent configuration
   - Implements aggressive scalping strategy
   - Integrates with Daydreams AI framework
   - Handles memory persistence and action orchestration

2. **gmx-actions.ts** - All trading actions and GMX SDK integration
   - Each action follows a consistent pattern: name, description, handler
   - Actions include: portfolio queries, position management, order placement
   - All outputs formatted as strings for AI comprehension

3. **gmx-queries.ts** - Market data abstraction layer
   - Formats complex GMX data into AI-readable strings
   - Provides: market info, positions, orders, trades, price feeds
   - Cache-first approach with fallback to SDK
   - Contains advanced Synth AI analysis with intelligent trading signals

4. **gmx-utils.ts** - Financial calculations and utilities
   - BigInt-based precision for blockchain compatibility
   - Position sizing, PnL calculations, liquidation prices
   - Risk management calculations

5. **gmx-cache.ts** - High-performance caching system with promise deduplication
   - Handles multi-level caching with 5-minute TTL for all GMX data types
   - Prevents concurrent duplicate API calls with promise deduplication
   - Used by all query functions for optimal data access and reduced latency
   - Includes comprehensive cache management and status monitoring

6. **transaction-queue.ts** - Sequential transaction execution
   - Singleton pattern for managing blockchain transactions
   - 3-second delays between write operations to prevent nonce errors
   - Separate queues for read-after-write operations

7. **gmx-wallet.ts** - Wallet and SDK initialization module
   - Handles all wallet creation and validation logic
   - Supports Arbitrum and Avalanche networks
   - Validates private keys, addresses, and chain configurations

8. **synth-utils.ts** - Synth AI integration utilities
   - Dynamic asset support for all trading pairs (BTC/ETH/SOL)
   - Volatility dial data fetching and parsing
   - Past percentile data analysis with scalable architecture
   - Consolidated prediction formatting for AI consumption
   - Risk percentile calculations based on market conditions

### Key Design Patterns

- **AI-First Data Formatting**: All data returned as formatted strings, not objects
- **Action-Based Architecture**: Modular actions with consistent structure
- **Cache-First Data Access**: High-performance caching with 5-minute TTL and promise deduplication
- **Sequential Transaction Execution**: Write operations queued with delays to prevent nonce errors
- **Memory System**: Tracks positions, trades, and performance metrics
- **Error Resilience**: Comprehensive error handling with detailed logging
- **Risk Management**: Built-in position sizing and stop-loss mechanisms with failsafe validations
- **Dynamic Asset Support**: Scalable architecture supporting multiple trading pairs (BTC/ETH/SOL)
- **Intelligent Analysis**: Advanced Synth AI integration with momentum analysis and dynamic levels
- **Event-Driven Trading**: Multiple trigger types (scheduled, Synth alerts, user input)

## Development Requirements

### Environment Variables

Create a `.env` file with:

```bash
# Required API Keys
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
SYNTH_API_KEY=
SUPABASE_URL=
SUPABASE_KEY=

# GMX Configuration
GMX_NETWORK=arbitrum  # or avalanche
GMX_CHAIN_ID=42161    # 43114 for avalanche
GMX_RPC_URL=
GMX_ORACLE_URL=
GMX_SUBSQUID_URL=
GMX_WALLET_ADDRESS=0x...  # 40 hex chars
GMX_PRIVATE_KEY=0x...     # 64 hex chars
```

### External Dependencies

- **Supabase**: Database service for persistent memory and vector storage
- **Funded Wallet**: On specified network with ETH for gas fees
- **Active Internet**: Required for Synth AI predictions and GMX oracle data

## Important Conventions

1. **TypeScript Strict Mode**: All code must pass strict TypeScript checks (configured in tsconfig.json)
2. **ES Modules**: Use import/export syntax, not require() (specified in package.json)
3. **BigInt for Precision**: All financial values use BigInt to avoid floating-point precision issues
4. **Async/Await**: All blockchain operations are asynchronous and use proper error handling
5. **Cache-First Data Access**: All query functions use cache for optimal performance and reduced API calls
6. **Sequential Write Operations**: All write transactions must use the transaction queue to prevent nonce errors
7. **30-Decimal Precision**: GMX uses 30-decimal precision for USD values (USD_DECIMALS constant)
8. **Dynamic Asset Architecture**: Single codebase scales to support any number of trading pairs
9. **Action Pattern**: All trading actions follow consistent structure with name, description, handler
10. **Dynamic Leverage**: Position sizes adjusted based on volatility (higher volatility = lower leverage)
11. **Regime Signal Triggers**: High-strength regime signals (≥80% confidence) trigger immediate trading cycles

## Trading Action Pattern

When adding new trading actions to `gmx-actions.ts`:

```typescript
{
  name: "actionName",
  description: "Clear description for AI understanding",
  handler: async (data, ctx, agent) => {
    try {
      console.log('[Action] Starting actionName');
      let memory = ctx.memory as GmxMemory;
      
      // Access data from cache (passed via createGmxActions)
      const marketsResult = await gmxDataCache.getMarketsInfo();
      const { marketsInfoData, tokensData } = marketsResult;
      
      // For write operations, use transaction queue
      if (isWriteOperation) {
        const result = await transactionQueue.enqueueWriteTransaction(
          'actionName',
          async () => await sdk.doSomething()
        );
        
        // Cache will provide fresh data on next access
        
        return `Success: ${result}`;
      }
      
      // Update memory if needed
      memory = { ...memory, lastResult: "Action completed" };
      
      return "Human-readable result";
    } catch (error) {
      console.error('[Action] actionName error:', error);
      return `Error: ${error.message}`;
    }
  }
}
```

## Critical Safety Notes

- **Never commit private keys or sensitive data**
- **Always validate wallet addresses and amounts**
- **Test with small amounts first**
- **Monitor gas prices and slippage**
- **Handle blockchain errors gracefully**

## Integration Points

- **GMX SDK (@gmx-io/sdk)**: Primary trading interface for positions, orders, markets data
- **Viem**: Low-level blockchain interactions and wallet management
- **Daydreams AI Framework**: Agent orchestration, memory management, and action coordination
- **Anthropic**: Direct AI model access (Claude Sonnet 4 for main agent)
- **OpenAI**: Vector embeddings for memory system
- **Synth AI**: Real-time market predictions from decentralized AI miners
- **Supabase**: Persistent memory storage and vector storage for semantic memory

## Cache-First Data Architecture

All data access uses the high-performance caching system:

### Cache Initialization
```typescript
// In agent-gmx.ts - initialize cache with SDK
const gmxDataCache = new EnhancedDataCache(sdk);
const gmxActions = createGmxActions(sdk, gmxDataCache);
```

### Data Access Pattern
```typescript
// In any query function or action
const marketsResult = await gmxDataCache.getMarketsInfo();
const { marketsInfoData, tokensData } = marketsResult;

// Cache automatically handles TTL and promise deduplication
const positionsResult = await gmxDataCache.getPositions(marketsInfoData, tokensData);
```

### Benefits
- 5-minute TTL prevents redundant API calls
- Promise deduplication prevents concurrent requests for same data
- Automatic cache invalidation and refresh
- Reduced latency and improved performance
- Consistent data across all functions within TTL window

## Transaction Queue System

All write operations must use the transaction queue to prevent nonce errors:

```typescript
// Write operations with 3-second delays
await transactionQueue.enqueueWriteTransaction('operation_name', async () => {
  return await sdk.doWriteOperation();
});

// Read operations immediately after writes (if needed within same cycle)
await transactionQueue.enqueueReadAfterWrite('get_fresh_data', async () => {
  return await sdk.positions.getPositions({marketsData, tokensData});
});
```

## Enhanced Risk Management System

### Failsafe Validations
All take profit and stop loss actions include comprehensive failsafe mechanisms:

#### Take Profit Failsafes:
- **Price Direction Validation**: LONG positions require TP price > current price, SHORT positions require TP price < current price
- **Minimum Distance Check**: 0.1% minimum distance from current price to prevent accidental triggering
- **Liquidation Protection**: Ensures TP levels don't conflict with liquidation thresholds

#### Stop Loss Failsafes:
- **Price Direction Validation**: LONG positions require SL price < current price, SHORT positions require SL price > current price
- **Minimum Distance Check**: 0.1% minimum distance from current price
- **Maximum Loss Protection**: Prevents setting stops that would result in catastrophic losses

```typescript
// Example failsafe validation in action
if (isLong && triggerPriceBigInt <= markPrice) {
    throw new Error(`Invalid take profit for LONG: price (${triggerPriceFormatted}) must be higher than current price (${currentPriceFormatted})`);
}

const minimumDistance = markPrice * 1n / 1000n; // 0.1%
if (isLong && triggerPriceBigInt < markPrice + minimumDistance) {
    throw new Error(`Take profit too close to current price. Minimum distance: 0.1%`);
}
```

## Advanced Synth AI Integration

### Intelligent Analysis System
The `get_synth_analysis_str` function provides comprehensive market intelligence:

#### Multi-Timeframe Momentum Analysis:
- **Short-term (15m-1h)**: High-frequency signals for entry timing
- **Medium-term (1h-4h)**: Trend confirmation and direction bias
- **Long-term (4h+)**: Overall market structure and major levels

#### Dynamic Stop/Take Profit Recommendations:
- **Prediction-Based Levels**: Uses actual AI prediction clusters instead of arbitrary percentages
- **Risk/Reward Optimization**: Ensures minimum 2:1 R:R ratios
- **Volatility Adjustment**: Adapts stops based on current market volatility regime

#### Smart Setup Detection:
- **WAIT**: When timeframes conflict or insufficient prediction range
- **LONG/SHORT**: Only when multiple signals align with sufficient confidence
- **Trade Quality Grading**: A, B+, B, C, D based on setup confluence

```typescript
// Example analysis output structure
BEARISH bias with MODERATE confidence. Best Setup: WAIT. Key level: $3532.

// Only shows detailed metrics for actionable setups (not WAIT)
BULLISH bias with HIGH confidence. Trade Quality: A. Best Setup: LONG. Key level: $3587.
```

### Synth Data Flow Architecture:
1. **Cache Layer**: Stores consolidated prediction arrays from top 10 miners
2. **Analysis Function**: Processes raw data into intelligent trading signals
3. **Action Layer**: Consumes analyzed recommendations for trading decisions

## Debugging and Logging

- **Console Logging**: All actions log with `[Action]` prefix for easy filtering
- **Cache Logging**: Cache operations logged with `[CacheType]` prefix
- **Transaction Queue**: Operations logged with execution timing
- **Error Handling**: Comprehensive error logging with context
- **Failsafe Logging**: Detailed validation error messages for debugging risk management

## Recent Architectural Changes

### Advanced Caching System Implementation
- **High-Performance Cache**: Implemented comprehensive caching with 5-minute TTL across all data types
- **Promise Deduplication**: Prevents concurrent duplicate API calls for optimal performance
- **Cache-First Architecture**: All query functions and actions use cache for data access
- **Simplified Integration**: Clean separation between data fetching and string formatting

### Dynamic Multi-Asset Architecture
- **Scalable Asset Support**: Single codebase dynamically supports BTC, ETH, SOL and can easily add new assets
- **ASSETS Constant**: Central configuration in gmx-types.ts - adding new assets requires only updating the ASSETS array
- **Dynamic Market Detection**: Automatically generates market mappings and helper functions for all assets
- **Unified Data Processing**: Same logic handles all assets through dynamic iteration patterns

### Enhanced Trading Intelligence
- **Dynamic Leverage**: Position sizes adjust based on market volatility
- **Regime Signal Triggers**: High-confidence regime signals (≥80% strength) trigger immediate trading cycles
- **Multi-Event System**: Scheduled, Synth-based, and user-input triggers
- **Volatility-Based Risk Management**: Higher volatility = lower leverage automatically