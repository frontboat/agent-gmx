/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🌟 VEGA - GMX TRADING AGENT (OPTIMIZED WITH LOADER PATTERN)
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * This version fully leverages the Daydreams loader API pattern:
 * - All market data is pre-fetched by the loader before each step
 * - The agent sees all data in the render output - no need to call actions
 * - Only write actions (trades, orders) remain
 * - Dramatically reduces action calls and costs
 * 
 * ═══════════════════════════════════════════════════════════════════════════════
 */

// ═══════════════════════════════════════════════════════════════════════════════
// 📦 IMPORTS
// ═══════════════════════════════════════════════════════════════════════════════

import { anthropic } from "@ai-sdk/anthropic";
import { 
    createDreams, 
    context, 
    render,
    input,
    extension,
    validateEnv, 
    LogLevel,
    Logger
} from "@daydreamsai/core";
import { createSupabaseBaseMemory } from "@daydreamsai/supabase";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { createGmxWalletFromEnv } from './gmx-wallet';
import { EnhancedDataCache } from './gmx-cache';
import { 
    get_btc_eth_markets_str, 
    get_daily_volumes_str, 
    get_portfolio_balance_str, 
    get_positions_str, 
    get_tokens_data_str, 
    get_orders_str, 
    get_synth_analysis_str, 
    get_technical_analysis_str, 
    get_trading_history_str 
} from "./gmx-queries";

// Import only write actions from the original file
import { createGmxActions } from './gmx-actions';

// ═══════════════════════════════════════════════════════════════════════════════
// ⚙️ ENVIRONMENT VALIDATION & SETUP
// ═══════════════════════════════════════════════════════════════════════════════

console.warn("🚀 Starting GMX Trading Agent (Optimized with Loader)...");

const env = validateEnv(
    z.object({
        ANTHROPIC_API_KEY: z.string().min(1, "ANTHROPIC_API_KEY is required"),
        OPENAI_API_KEY: z.string().min(1, "OPENAI_API_KEY is required"),
        GMX_NETWORK: z.enum(["arbitrum", "avalanche"]).default("arbitrum"),
        GMX_CHAIN_ID: z.string(),
        GMX_ORACLE_URL: z.string(),
        GMX_RPC_URL: z.string(),
        GMX_SUBSQUID_URL: z.string(),
        GMX_WALLET_ADDRESS: z.string(),
        GMX_PRIVATE_KEY: z.string(),
        SYNTH_API_KEY: z.string().min(1, "SYNTH_API_KEY is required for market intelligence"),
        SUPABASE_URL: z.string().min(1, "SUPABASE_URL is required for persistent memory"),
        SUPABASE_KEY: z.string().min(1, "SUPABASE_KEY is required for persistent memory"),
    })
);

// ═══════════════════════════════════════════════════════════════════════════════
// 🔐 WALLET & SDK CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

// Initialize wallet and SDK using the new module
const { sdk } = createGmxWalletFromEnv(env);

// Create enhanced data cache
const gmxDataCache = new EnhancedDataCache(sdk);

// ═══════════════════════════════════════════════════════════════════════════════
// 🤖 VEGA CHARACTER DEFINITION (OPTIMIZED FOR LOADER)
// ═══════════════════════════════════════════════════════════════════════════════

const vega_template = 
`
# Vega - Elite Crypto Trading Agent (Loader-Optimized Edition)

I am Vega, an elite autonomous crypto trader competing in a high-stakes month-long trading competition. My sole purpose is to MAKE MONEY and maximize portfolio returns through aggressive, profitable trading.

**IMPORTANT: All market data is automatically loaded and available below. I do NOT need to call any get_ actions for data - it's already here!**

---

## 🎯 Core Identity & Mission

**I am an autonomous trading agent with one clear goal: MAKE MONEY.** I process market data, identify profitable opportunities, and execute trades that grow my portfolio. My competitive edge comes from relentless focus on profitability, strategic positioning, and disciplined risk management.

**Primary Objective:** Maximize portfolio value through profitable trading. Every decision, every analysis, every trade must be driven by the singular goal of making money in this competitive trading environment.

---

## 📊 MARKET DATA (AUTOMATICALLY LOADED)

The following data is automatically refreshed and available for analysis:

### 💰 PORTFOLIO STATUS
{{portfolio}}

### 📈 CURRENT POSITIONS
{{positions}}

### 📋 PENDING ORDERS
{{orders}}

### 🏛️ MARKET INFORMATION
{{markets}}

### 💎 TOKEN DATA
{{tokens}}

### 📊 DAILY VOLUMES
{{volumes}}

### 📈 TRADING HISTORY & PERFORMANCE
{{trading_history}}

### 🤖 BTC SYNTH AI PREDICTIONS
{{synth_btc_predictions}}

### 🤖 ETH SYNTH AI PREDICTIONS
{{synth_eth_predictions}}

### 📊 BTC TECHNICAL ANALYSIS
{{btc_technical_analysis}}

### 📊 ETH TECHNICAL ANALYSIS
{{eth_technical_analysis}}

---

## 💪 TRADING ACTIONS (WRITE OPERATIONS ONLY)

Since all data is pre-loaded, I only need these write actions:

### ⚡ Trading Execution
- open_long_market: Open long position with market order (immediate execution). REQUIRED: marketAddress, payTokenAddress, collateralTokenAddress, payAmount (6 decimals). OPTIONAL: leverage, allowedSlippageBps.
- open_long_limit: Open long position with limit order (executes when price reaches or goes below limit). REQUIRED: marketAddress, payTokenAddress, collateralTokenAddress, payAmount (6 decimals), limitPrice (30 decimals). OPTIONAL: leverage, allowedSlippageBps.
- open_short_market: Open short position with market order (immediate execution). REQUIRED: marketAddress, payTokenAddress, collateralTokenAddress, payAmount (6 decimals). OPTIONAL: leverage, allowedSlippageBps.
- open_short_limit: Open short position with limit order (executes when price reaches or goes above limit). REQUIRED: marketAddress, payTokenAddress, collateralTokenAddress, payAmount (6 decimals), limitPrice (30 decimals). OPTIONAL: leverage, allowedSlippageBps.
- close_position: Fully close existing position (long or short) automatically. Detects position direction and closes the entire position. REQUIRED: marketAddress (from positions data), receiveTokenAddress. OPTIONAL: allowedSlippageBps.
- cancel_orders: Cancel pending orders. REQUIRED: orderKeys (array of 32-byte hex strings from orders data).

### 💱 Token Swaps
- swap_tokens: Swap tokens using GMX liquidity pools. REQUIRED: fromTokenAddress, toTokenAddress, and either fromAmount (when swapping FROM USDC) or toAmount (when swapping TO USDC). OPTIONAL: allowedSlippageBps, triggerPrice (for limit swaps).

### 🛡️ Risk Management
- set_take_profit: Set take profit order for existing position. REQUIRED: marketAddress (from positions data), triggerPrice (30 decimals). OPTIONAL: sizeDeltaUsd, allowedSlippageBps.
- set_stop_loss: Set stop loss order for existing position. REQUIRED: marketAddress (from positions data), triggerPrice (30 decimals). OPTIONAL: sizeDeltaUsd, allowedSlippageBps.

**IMPORTANT: WETH and ETH are different tokens. WETH is the wrapped version of ETH. ETH is the native token of the chain.**

**CRITICAL: Do not trade BTC, only ETH. Never try to open, cancel, set limit orders, or close positions for BTC.**

---

## 🎯 TRADING DECISION MATRIX

### PHASE 1: Market Context Analysis
All data is already loaded above - analyze it directly!

**Q1: What is the current market structure?**
- Analyze the price data from markets section
- Check technical indicators for trend confirmation
- Review Synth AI predictions for directional bias

**Q2: What are the critical price levels?**
- Identify support/resistance from technical analysis
- Check Synth percentile levels for natural boundaries
- Calculate distance from current price

**Q3: How strong is the current momentum?**
- Review multi-timeframe technical indicators
- Check Synth momentum scores
- Analyze volume patterns

### PHASE 2: Position & Order Review
Check loaded data for existing exposure:

**Q1: What is the status of my current positions?**
- Review positions section for P&L status
- Check distance to liquidation
- Evaluate if thesis still valid

**Q2: Are there pending orders to manage?**
- Review orders section
- Cancel outdated orders
- Adjust limits if market has moved

### PHASE 3: New Trade Evaluation
Based on all pre-loaded data:

**Q1: Is there a high-probability setup?**
- Technical and Synth signals align?
- Risk/reward favorable?
- Portfolio has capacity?

**Q2: How should I execute?**
- Market order for momentum
- Limit order for precision
- Scale in with multiple orders

---

## ⏰ 30-MINUTE TRADING CYCLE

Since data auto-refreshes every cycle, I focus on:

1. **Review positions** - Check P&L, adjust stops/targets
2. **Manage orders** - Cancel stale, place new limits  
3. **Identify setups** - Scan for new opportunities
4. **Execute trades** - Act on high-conviction setups
5. **Risk management** - Always set stops after entry

---

## 📊 PORTFOLIO & RISK MANAGEMENT

### Position Sizing
- **Base size**: 20% of portfolio
- **Maximum**: 80% on single position
- **Leverage**: 1-3x only
- **Adjust for**: Setup quality, volatility, existing exposure

### Capital Allocation
- **Core**: 90% USDC when not trading
- **Active**: Deploy on high-conviction setups
- **Reserve**: Always keep ~2% ETH for gas
- **Protection**: Reduce size after losses

---

**My mission is simple: MAKE MONEY. All data is pre-loaded. I analyze and execute. No data fetching needed. Pure trading focus.**
`;

// ═══════════════════════════════════════════════════════════════════════════════
// 📊 GMX TRADING CONTEXT WITH LOADER
// ═══════════════════════════════════════════════════════════════════════════════

const gmxContext = context({
    type: "gmx-trading-agent",
    maxSteps: 20,
    maxWorkingMemorySize: 5,
    schema: z.object({
        instructions: z.string().describe("The agent's instructions"),
        currentTask: z.string().describe("The agent's current task"),
        lastResult: z.string().describe("The agent's last result"),
        positions: z.string().describe("The agent's positions"),
        portfolio: z.string().describe("The agent's portfolio"),
        markets: z.string().describe("The agent's markets"),
        tokens: z.string().describe("The agent's tokens"),
        volumes: z.string().describe("The agent's volumes"),
        orders: z.string().describe("The agent's pending orders"),
        trading_history: z.string().describe("The agent's trading history and performance analysis"),
        synth_btc_predictions: z.string().describe("The agent's BTC predictions"),
        synth_eth_predictions: z.string().describe("The agent's ETH predictions"),
        btc_technical_analysis: z.string().describe("The agent's BTC technical analysis"),
        eth_technical_analysis: z.string().describe("The agent's ETH technical analysis"),
    }),

    key({ id }) {
      return id;
    },

    create: (state) => {
        return {
            instructions: state.args.instructions,
            currentTask: state.args.currentTask,
            lastResult: state.args.lastResult,
            positions: state.args.positions,
            portfolio: state.args.portfolio,
            markets: state.args.markets,
            tokens: state.args.tokens,
            volumes: state.args.volumes,
            orders: state.args.orders,
            trading_history: state.args.trading_history,
            synth_btc_predictions: state.args.synth_btc_predictions,
            synth_eth_predictions: state.args.synth_eth_predictions,
            btc_technical_analysis: state.args.btc_technical_analysis,
            eth_technical_analysis: state.args.eth_technical_analysis,
        };
    },

    // ═══════════════════════════════════════════════════════════════════════════════
    // 🔄 LOADER - THIS IS THE KEY! Pre-fetches all data before agent acts
    // ═══════════════════════════════════════════════════════════════════════════════
    async loader({ memory }) {
        console.log("🔄 [LOADER] Pre-fetching all GMX trading data...");
        const startTime = Date.now();
        
        try {
            // Load all data in parallel for maximum speed
            const [
                portfolio,
                positions, 
                markets,
                tokens,
                volumes,
                orders,
                trading_history,
                btc_predictions,
                eth_predictions,
                btc_technical_analysis,
                eth_technical_analysis
            ] = await Promise.all([
                get_portfolio_balance_str(sdk, gmxDataCache),
                get_positions_str(sdk, gmxDataCache),
                get_btc_eth_markets_str(sdk, gmxDataCache),
                get_tokens_data_str(sdk, gmxDataCache),
                get_daily_volumes_str(sdk, gmxDataCache),
                get_orders_str(sdk, gmxDataCache),
                get_trading_history_str(sdk, gmxDataCache),
                get_synth_analysis_str('BTC', gmxDataCache),
                get_synth_analysis_str('ETH', gmxDataCache),
                get_technical_analysis_str(sdk, 'BTC', gmxDataCache),
                get_technical_analysis_str(sdk, 'ETH', gmxDataCache)
            ]);

            // Update memory with fresh data
            memory.portfolio = portfolio;
            memory.positions = positions;
            memory.markets = markets;
            memory.tokens = tokens;
            memory.volumes = volumes;
            memory.orders = orders;
            memory.trading_history = trading_history;
            memory.synth_btc_predictions = btc_predictions;
            memory.synth_eth_predictions = eth_predictions;
            memory.btc_technical_analysis = btc_technical_analysis;
            memory.eth_technical_analysis = eth_technical_analysis;
            memory.currentTask = "All data pre-loaded - ready for trading decisions";
            memory.lastResult = `Data loaded in ${Date.now() - startTime}ms at ${new Date().toISOString()}`;

            console.log(`✅ [LOADER] All data loaded in ${Date.now() - startTime}ms!`);
        } catch (error) {
            console.error("❌ [LOADER] Error loading GMX data:", error);
            memory.lastResult = `Data loading failed: ${error instanceof Error ? error.message : error}`;
        }
    },

    // Render function presents all pre-loaded data to the agent
    render({ memory }) {
        console.log("🎨 [RENDER] Presenting pre-loaded data to agent...");

        return render(vega_template, {
            instructions: memory.instructions,
            currentTask: memory.currentTask,
            lastResult: memory.lastResult,
            positions: memory.positions,
            portfolio: memory.portfolio,
            markets: memory.markets,
            tokens: memory.tokens,
            volumes: memory.volumes,
            orders: memory.orders,
            trading_history: memory.trading_history,
            synth_btc_predictions: memory.synth_btc_predictions,
            synth_eth_predictions: memory.synth_eth_predictions,
            btc_technical_analysis: memory.btc_technical_analysis,
            eth_technical_analysis: memory.eth_technical_analysis,
        });
    },
}).setInputs({
    "gmx:trading-cycle": input({  
        schema: z.object({
            text: z.string(),
        }),
        subscribe: (send) => {
            const tradingCycle = async () => {
                console.log("⏰ [CYCLE] Trading cycle triggered - loader will fetch fresh data");
                
                // Simply trigger the context - the loader will handle data fetching
                await send(gmxContext, {
                    instructions: vega_template,
                    currentTask: "Trading cycle - analyzing fresh data",
                    lastResult: "New cycle started",
                    // Initial empty values - loader will populate
                    positions: "",
                    portfolio: "",
                    markets: "",
                    tokens: "",
                    volumes: "",
                    orders: "",
                    trading_history: "",
                    synth_btc_predictions: "",
                    synth_eth_predictions: "",
                    btc_technical_analysis: "",
                    eth_technical_analysis: "",
                }, { text: "Trading cycle initiated" });
            }
            
            // Initial run
            tradingCycle();

            // Run every 30 minutes
            const interval = setInterval(tradingCycle, 1800000);

            console.warn("✅ Trading cycle subscription setup complete");
            return () => {
                console.warn("🛑 Trading cycle subscription cleanup");
                clearInterval(interval);
            };
        }
    })
});

// ═══════════════════════════════════════════════════════════════════════════════
// 🔌 GMX EXTENSION WITH WRITE-ONLY ACTIONS
// ═══════════════════════════════════════════════════════════════════════════════

// Get all original actions
const allGmxActions = createGmxActions(sdk, gmxDataCache);

// Filter to only keep write actions (no get_ actions needed!)
const writeOnlyActions = allGmxActions.filter(action => {
    const readActions = [
        'get_btc_eth_markets',
        'get_daily_volumes', 
        'get_tokens_data',
        'get_portfolio_balance',
        'get_positions',
        'get_orders',
        'get_trading_history',
        'get_btc_technical_analysis',
        'get_eth_technical_analysis',
        'get_synth_btc_predictions',
        'get_synth_eth_predictions'
    ];
    return !readActions.includes(action.name);
});

console.log(`📝 Filtered to ${writeOnlyActions.length} write-only actions (removed ${allGmxActions.length - writeOnlyActions.length} read actions)`);

const gmx = extension({
    name: "gmx",
    contexts: {
        gmxTrading: gmxContext,
    },
    actions: writeOnlyActions, // Only write actions!
});

console.warn("⚡ Initializing Vega trading agent (Loader-Optimized)...");

// Initialize complete Supabase memory system
console.warn("🗄️ Setting up Supabase memory system..." );
const supabaseMemory = createSupabaseBaseMemory({
    url: env.SUPABASE_URL,
    key: env.SUPABASE_KEY,
    memoryTableName: "gmx_memory_optimized",
    vectorTableName: "gmx_embeddings_optimized",
    vectorModel: openai("gpt-4o-mini"),
});

console.warn("✅ Memory system initialized!");

// Create the agent with persistent memory
const agent = createDreams({
    model: anthropic("claude-sonnet-4-20250514"),
    logger: new Logger({ level: LogLevel.DEBUG }),
    extensions: [gmx],
    memory: supabaseMemory,
    streaming: false,
});

console.warn("✅ Agent created successfully!");

// Start the agent - loader will fetch initial data
await agent.start({
    instructions: vega_template,
    currentTask: "Starting up - waiting for data load",
    lastResult: "Agent initialized",
    positions: "Loading...",
    portfolio: "Loading...",
    markets: "Loading...",
    tokens: "Loading...",
    volumes: "Loading...",
    orders: "Loading...",
    trading_history: "Loading...",
    synth_btc_predictions: "Loading...",
    synth_eth_predictions: "Loading...",
    btc_technical_analysis: "Loading...",
    eth_technical_analysis: "Loading...",
});

console.warn("🎯 Vega is now live with LOADER OPTIMIZATION!");
console.warn("📊 All data is pre-fetched - no read actions needed!");
console.warn("⚡ Agent focuses purely on trading decisions!");