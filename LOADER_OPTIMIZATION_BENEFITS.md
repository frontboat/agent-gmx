# GMX Agent Loader Optimization Benefits

## Overview

This document explains the benefits of implementing the Daydreams loader API pattern in the GMX trading agent.

## Key Improvements

### 1. Dramatic Reduction in Action Calls

**Before (Original Implementation):**
- Agent calls `get_portfolio_balance` action
- Agent calls `get_positions` action  
- Agent calls `get_btc_eth_markets` action
- Agent calls `get_orders` action
- Agent calls `get_synth_btc_predictions` action
- Agent calls `get_synth_eth_predictions` action
- Agent calls `get_btc_technical_analysis` action
- Agent calls `get_eth_technical_analysis` action
- Agent calls `get_trading_history` action
- Agent calls `get_tokens_data` action
- Agent calls `get_daily_volumes` action
- **Total: 11+ action calls per decision cycle**

**After (Loader Optimization):**
- Loader automatically fetches all data before agent runs
- Agent sees all data in the render output
- Agent only calls write actions (trades, orders)
- **Total: 0 read action calls needed**

### 2. Cost Savings

Each action call costs tokens because:
- The agent must formulate the action call
- The system processes the action
- The agent receives and processes the response

**Estimated Token Savings: 80-90% reduction**

### 3. Performance Improvements

- **Faster Decisions**: No waiting for data fetches
- **Parallel Loading**: All data fetched simultaneously in loader
- **Better Cache Utilization**: Single batch fetch maximizes cache hits
- **Reduced Latency**: Agent can make decisions immediately

### 4. Cleaner Agent Logic

**Before:**
```
Agent: "I need to check my positions"
Agent: calls get_positions
Agent: "Now I need market data"  
Agent: calls get_btc_eth_markets
Agent: "Let me check predictions"
Agent: calls get_synth_eth_predictions
Agent: "Based on all this data, I'll open a long"
Agent: calls open_long_market
```

**After:**
```
Agent: "I can see from the data that ETH is oversold with bullish divergence"
Agent: "Opening long position immediately"
Agent: calls open_long_market
```

### 5. Implementation Changes

1. **Context Loader**: Added comprehensive `loader` function that pre-fetches all data
2. **Template Update**: Modified render template to show all data is pre-loaded
3. **Action Filtering**: Removed all read-only actions, kept only write actions
4. **Subscription Simplification**: Trading cycle just triggers context, loader handles data

### 6. Example Code Comparison

**Original Pattern:**
```typescript
action({
    name: "get_portfolio_balance",
    handler: async () => {
        // Fetch data from SDK
        const data = await get_portfolio_balance_str(sdk);
        // Update memory
        memory.portfolio = data;
        return data;
    }
})
```

**Loader Pattern:**
```typescript
async loader({ memory }) {
    // Pre-fetch ALL data in parallel
    const [portfolio, positions, markets, ...] = await Promise.all([
        get_portfolio_balance_str(sdk),
        get_positions_str(sdk),
        get_btc_eth_markets_str(sdk),
        // ... all other data fetches
    ]);
    
    // Update memory with all data
    memory.portfolio = portfolio;
    memory.positions = positions;
    memory.markets = markets;
    // ... etc
}
```

## Running the Optimized Agent

```bash
# Run the optimized version
bun run agent-gmx-optimized.ts

# Benefits you'll see:
# - Fewer action calls in logs
# - Faster decision making
# - Lower API costs
# - More focused agent behavior
```

## Monitoring the Improvement

Watch the logs for:
- `[LOADER]` tags showing batch data fetching
- Absence of `get_` action calls
- Faster time from cycle start to trade execution
- More focused agent reasoning without data fetching steps

## Summary

The loader pattern transforms the agent from a "fetch-then-decide" model to a "see-and-act" model, dramatically improving efficiency and reducing costs while maintaining the same trading capabilities.