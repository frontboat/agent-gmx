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

3. **queries.ts** - Market data abstraction layer
   - Formats complex GMX data into AI-readable strings
   - Provides: market info, positions, orders, trades, price feeds

4. **utils.ts** - Financial calculations and utilities
   - BigInt-based precision for blockchain compatibility
   - Position sizing, PnL calculations, liquidation prices
   - Risk management calculations

5. **logger.ts** - Custom file-based logging system
   - Session-based log files in `logs/` directory
   - Handles BigInt serialization
   - Debug logging for all trading actions

### Key Design Patterns

- **AI-First Data Formatting**: All data returned as formatted strings, not objects
- **Action-Based Architecture**: Modular actions with consistent structure
- **Memory System**: Tracks positions, trades, and performance metrics
- **Error Resilience**: Comprehensive error handling with detailed logging
- **Risk Management**: Built-in position sizing and stop-loss mechanisms

## Development Requirements

### Environment Variables

Create a `.env` file with:

```bash
# Required API Keys
ANTHROPIC_API_KEY=
OPENROUTER_API_KEY=
SYNTH_API_KEY=
DISCORD_TOKEN=
DISCORD_BOT_NAME=
MONGODB_STRING=

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

- **ChromaDB**: Must be running at `http://localhost:8000` for vector storage
- **MongoDB**: Accessible via connection string for persistent memory
- **Funded Wallet**: On specified network with ETH for gas fees
- **Active Internet**: Required for Synth AI predictions and GMX oracle data

## Important Conventions

1. **TypeScript Strict Mode**: All code must pass strict TypeScript checks (configured in tsconfig.json)
2. **ES Modules**: Use import/export syntax, not require() (specified in package.json)
3. **BigInt for Precision**: All financial values use BigInt to avoid floating-point precision issues
4. **Async/Await**: All blockchain operations are asynchronous and use proper error handling
5. **Structured Logging**: Use custom logger (`debugLog`, `debugError`) for session-based file logging
6. **30-Decimal Precision**: GMX uses 30-decimal precision for USD values (USD_DECIMALS constant)
7. **Action Pattern**: All trading actions follow consistent structure with name, description, handler

## Trading Action Pattern

When adding new trading actions to `gmx-actions.ts`:

```typescript
{
  name: "actionName",
  description: "Clear description for AI understanding",
  handler: async ({ memory, queries, logger }) => {
    try {
      // Implementation
      logger.debug("Action context", { /* details */ });
      
      // Update memory if needed
      memory.recentTrades.push(/* trade info */);
      
      // Return formatted string
      return "Human-readable result";
    } catch (error) {
      logger.debug("Error context", { error });
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
- **OpenRouter**: AI model access (Claude Sonnet 4 for main agent, Gemini for vector embeddings)
- **Synth AI**: Real-time market predictions from decentralized AI miners
- **MongoDB**: Persistent memory storage across sessions
- **ChromaDB**: Vector storage for semantic memory and context retrieval

## Debugging and Logging

- **Session-based Logs**: All debug output saved to `logs/gmx-debug-{timestamp}.log`
- **BigInt-safe JSON**: Custom serialization handles BigInt values in logs
- **Structured Debug Logging**: Use `debugLog(category, message, data)` and `debugError(category, error, context)`
- **Trading Action Logging**: Every trade action is logged with context and results