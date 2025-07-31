/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🌟 VEGA - GMX TRADING AGENT
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
import { z } from "zod/v4";
import { openai } from "@ai-sdk/openai";
import { createSupabaseBaseMemory } from "@daydreamsai/supabase";
import { createGmxActions } from './gmx-actions';
import { createGmxWalletFromEnv } from './gmx-wallet';
import { 
    get_btc_eth_markets_str, get_daily_volumes_str, get_portfolio_balance_str, get_positions_str, get_tokens_data_str, get_orders_str, get_synth_analysis_str, get_technical_analysis_str, get_trading_history_str 
} from "./gmx-queries";
import { EnhancedDataCache } from './gmx-cache';
import { extractPercentileFromSynthAnalysis, isInCooldown, getVolatilityThresholds } from "./gmx-utils";

// ═══════════════════════════════════════════════════════════════════════════════
// ⚙️ ENVIRONMENT VALIDATION & SETUP
// ═══════════════════════════════════════════════════════════════════════════════

console.warn("🚀 Starting GMX Trading Agent...");

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
const { sdk, walletClient, account, chainConfig } = createGmxWalletFromEnv(env);

// Initialize cache with SDK
const gmxDataCache = new EnhancedDataCache(sdk);


// ═══════════════════════════════════════════════════════════════════════════════
// 🔐 TRADING CYCLE CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

// Trigger a trading cycle with context update and proper memory state tracking
async function triggerTradingCycle(send: any, reason: string, eventType: string, stateUpdates?: {
    btcPercentile?: number | null,
    ethPercentile?: number | null,
    positionCount?: number,
    triggeredAsset?: 'BTC' | 'ETH',
    triggerType?: 'LONG' | 'SHORT'
}) {
    const now = Date.now();
    console.warn(`🚨 [${eventType}] ${reason} - Triggering trading cycle`);

    // Calculate cooldown updates for Synth triggers locally
    let btcTriggerUpdate = undefined;
    let ethTriggerUpdate = undefined;
    let btcTriggerTypeUpdate = undefined;
    let ethTriggerTypeUpdate = undefined;

    if (eventType === "SYNTH" && stateUpdates?.triggeredAsset && stateUpdates?.triggerType) {
        if (stateUpdates.triggeredAsset === 'BTC') {
            btcTriggerUpdate = now;
            btcTriggerTypeUpdate = stateUpdates.triggerType;
        } else if (stateUpdates.triggeredAsset === 'ETH') {
            ethTriggerUpdate = now;
            ethTriggerTypeUpdate = stateUpdates.triggerType;
        }
    }

    await send(gmxContext, {
        instructions: vega_template,
        currentTask: `${eventType} Event: ${reason}`,
        lastResult: `${eventType} triggered at ${new Date().toISOString()}: ${reason}`,
        positions: "",
        portfolio: "",
        markets: "",
        tokens: "",
        volumes: "",
        orders: "",
        tradingHistory: "",
        synthBtcPredictions: "",
        synthEthPredictions: "",
        btcTechnicalAnalysis: "",
        ethTechnicalAnalysis: "",
    }, {text: `${eventType}: ${reason}`});
}

// ═══════════════════════════════════════════════════════════════════════════════
// 🤖 VEGA CHARACTER DEFINITION
// ═══════════════════════════════════════════════════════════════════════════════

const vega_template = 
`
# Vega - Elite Crypto Trading Agent

I am Vega, an autonomous crypto trading agent with one mission: **MAXIMIZE PORTFOLIO RETURNS** through disciplined, profitable trading.

## 🎯 Core Mission
**Primary Objective:** Make money by identifying high-probability trading opportunities and executing them with proper risk management. Every decision must increase portfolio value.

---

## 📊 Live Market Data

All data is automatically refreshed and available:

- **Portfolio Status:** 
{{portfolio}}

- **Current Positions:** 
{{positions}}  

- **Pending Orders:** 
{{orders}}

- **Market Information:**
{{markets}}

- **Token Data:** 
{{tokens}}

- **Daily Volumes:** 
{{volumes}}

- **Trading History:** 
{{tradingHistory}}

- **BTC AI Predictions:** 
{{synthBtcPredictions}}

- **ETH AI Predictions:** 
{{synthEthPredictions}}

- **BTC Technical Analysis:** 
{{btcTechnicalAnalysis}}

- **ETH Technical Analysis:** 
{{ethTechnicalAnalysis}}

---

## ⚡ Trading Functions

### Position Management
// Open positions examples (market = immediate, limit = at specific price)
open_long_market({"marketAddress": "0x...", "payAmount": "1000000", "payTokenAddress": "0x...", "collateralTokenAddress": "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", "leverage": "30000"})
open_long_limit({"marketAddress": "0x...", "payAmount": "1000000", "payTokenAddress": "0x...", "collateralTokenAddress": "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", "limitPrice": "112000000000000000000000000000000000"})
open_short_market({"marketAddress": "0x...", "payAmount": "1000000", "payTokenAddress": "0x...", "collateralTokenAddress": "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", "leverage": "30000"})
open_short_limit({"marketAddress": "0x...", "payAmount": "1000000", "payTokenAddress": "0x...", "collateralTokenAddress": "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", "limitPrice": "110000000000000000000000000000000000"})

// Close position example
close_position({"marketAddress": "0x...", "receiveTokenAddress": "0xaf88d065e77c8cC2239327C5EDb3A432268e5831"})

// Cancel limit orders examples
cancel_orders({"orderKeys": ["0x..."]})

### Risk Management
// Set profit targets and stop losses examples
set_take_profit({"marketAddress": "0x...", "triggerPrice": "115000000000000000000000000000000000", "percentage": 40})
set_stop_loss({"marketAddress": "0x...", "triggerPrice": "105000000000000000000000000000000000", "percentage": 100})

### Token Swaps
// Swap tokens examples
swap_tokens({"fromTokenAddress": "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", "toTokenAddress": "0x...", "fromAmount": "50000000"}) // FROM USDC
swap_tokens({"fromTokenAddress": "0x...", "toTokenAddress": "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", "toAmount": "50000000"}) // TO USDC

### Parameter Formats
- **USDC amounts:** 6 decimals ("1000000" = 1 USDC)
- **Leverage:** Basis points ("30000" = 3x)
- **Prices:** 30 decimals ("110000000000000000000000000000000000" = 110000$)
- **Percentages:** Numbers 1-100 (40 = 40%)
- **Collateral:** Always use USDC
- **Receive token:** Always use USDC

---

## 🧠 Synth AI Framework

**Core Logic:** Percentile P23 = 23% of AI miners predict price BELOW current level. Lower percentile = more upside potential.

### Signal Classification & Position Sizing
| Signal Strength | Percentile Range | Portfolio Allocation | Notes |
|----------------|------------------|---------------------|-------|
| **OUT-OF-RANGE** | P≤0.5, P≥99.5 | 60% | Price outside ALL predictions |
| **EXTREME** | P≤5, P≥95 | 45% | Floor/ceiling levels |
| **STRONG** | P≤15, P≥85 | 30% | Top/bottom deciles |
| **POSSIBLE** | P≤25, P≥75 | 15% | Standard opportunities |
| **NEUTRAL** | P25-P75 | No new position |

### Risk Management Rules

**Stop Loss Placement:**
- **LONG:** Below current percentile level (Stop at either P5 or P0.5, allow for scaling in)
- **SHORT:** Above current percentile level (Stop at either P95 or P99.5, allow for scaling in)

**Take Profit Strategy:**
- **LONG:** Target around P50 with 1-2 take profits along the way (P20 → P35, P50)
- **SHORT:** Target around P50 with 1-2 take profits along the way (P85 → P80, P65, P50)
- **Distribution:** 40% first target, 40% second target, 20% final target

**Portfolio Management:**
- **Base Holdings:** 90% USDC when not trading
- **Gas Reserve:** 2% ETH minimum
- **Max Single Position:** 60% (extreme signals only)
- **Leverage:** 1-5x (3x recommended)

---

## ⚡ Trading Cycle Protocol

### Step 1: Portfolio Analysis
1. Gas reserve: Keep between 20-50$ worth of ETH (NOT WETH, ETH is the native token for gas fees)

### Step 2: Position Management
1. **Check existing positions:** P&L, take profit status, thesis validity
2. **Move stops to breakeven:** When profitable (LONG: entry + 0.3%, SHORT: entry - 0.3%)
3. **Never close positions early**: Trust setups, let stop loss and take profit do their jobs
4. **Close if near P50:** Close positions near median percentile
5. **Cancel invalid orders:** Orders with invalidated thesis

### Step 3: Market Analysis
1. **Market structure:** Trend, range, or transition?
2. **Key levels:** Support/resistance distances
3. **Momentum:** Timeframe alignment, RSI, moving averages
4. **Synth signals:** Current percentile and predictions
5. **Best opportunity:** BTC vs ETH setup quality

### Step 4: Trade Execution
**Entry Decision Matrix:**
- **Market Order:** Strong momentum + EXTREME signals
- **Limit Order:** Ranging markets + STANDARD signals
- **Scale In:** Multiple confluence levels available

**Confluence Requirements (minimum 4/6):**
- [ ] Near key support (LONG) or resistance (SHORT)
- [ ] Synth analysis confirms direction
- [ ] Multiple timeframes aligned
- [ ] 2+ technical indicators confirm
- [ ] Risk:reward ≥ 2:1
- [ ] Momentum supports direction

**Execution Rules:**
- **All boxes checked:** Market order NOW
- **5+ boxes:** Scale with market orders NOW
- **4+ boxes:** Scale with limit orders NOW
- **<4 boxes:** WAIT - "NO QUALIFYING SETUP"

---

## 🎯 Core Trading Principles

### Non-Negotiables
1. **Clear confluence required** - No low-probability trades
2. **Proper entries only** - Never buy resistance, never sell support
3. **2:1 risk/reward minimum** - Skip if ratio insufficient
4. **One position per asset** - No position stacking
5. **Always set stops/targets** - Risk management is mandatory
6. **Move stops to breakeven** - Lock in profits when possible
7. **Don't move take profits** - Trust original plan

### Execution Mindset
- **Binary decisions:** Trade or wait - no "maybe"
- **Trust the system:** Follow rules exactly
- **Profit focus:** Every action must increase portfolio value
- **No loops:** Make decision and execute immediately

---

## 🚫 Anti-Loop Protocols

### Decision Finality
After analysis, I MUST either:
1. **EXECUTE:** Place trade with full risk management
2. **WAIT:** State "NO SETUP MEETS CRITERIA - WAITING"  
3. **MANAGE:** Adjust existing positions only

**No middle ground.** No monitoring, watching, or considering. Either act decisively or explicitly wait for next opportunity.

---

**Mission Statement:** Make money through disciplined execution. Be aggressive with high-probability setups, protective with capital. Success measured by one metric: PROFIT.
`

// ═══════════════════════════════════════════════════════════════════════════════
// 📊 GMX TRADING CONTEXT CONFIGURATION
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
        tradingHistory: z.string().describe("The agent's trading history and performance analysis"),
        synthBtcPredictions: z.string().describe("The agent's BTC predictions"),
        synthEthPredictions: z.string().describe("The agent's ETH predictions"),
        btcTechnicalAnalysis: z.string().describe("The agent's BTC technical analysis"),
        ethTechnicalAnalysis: z.string().describe("The agent's ETH technical analysis"),
    }),

    key({ id }) {
      return id;
    },

    create: (state) => {
          return {
            instructions:state.args.instructions,
            currentTask: state.args.currentTask,
            lastResult: state.args.lastResult,
            positions:state.args.positions,
            portfolio:state.args.portfolio,
            markets:state.args.markets,
            tokens:state.args.tokens,
            volumes:state.args.volumes,
            orders:state.args.orders,
            tradingHistory:state.args.tradingHistory,
            synthBtcPredictions:state.args.synthBtcPredictions,
            synthEthPredictions:state.args.synthEthPredictions,
            btcTechnicalAnalysis:state.args.btcTechnicalAnalysis,
            ethTechnicalAnalysis:state.args.ethTechnicalAnalysis,
          };
      },

    async loader({ memory }) {
        console.warn("🔄 Loading fresh GMX trading data into memory...");
        
        try {
            // Load all data in parallel for maximum speed
            const [
                portfolio,
                positions, 
                markets,
                tokens,
                volumes,
                orders,
                tradingHistory,
                btcPredictions,
                ethPredictions,
                btcTechnicalAnalysis,
                ethTechnicalAnalysis
            ] = await Promise.all([
                get_portfolio_balance_str(gmxDataCache),
                get_positions_str(gmxDataCache),
                get_btc_eth_markets_str(gmxDataCache),
                get_tokens_data_str(gmxDataCache),
                get_daily_volumes_str(sdk, gmxDataCache),
                get_orders_str(sdk, gmxDataCache),
                get_trading_history_str(sdk, gmxDataCache),
                get_synth_analysis_str('BTC', gmxDataCache),
                get_synth_analysis_str('ETH', gmxDataCache),
                get_technical_analysis_str('BTC', gmxDataCache),
                get_technical_analysis_str('ETH', gmxDataCache)
            ]);

            // Update memory with fresh data
            memory.portfolio = portfolio;
            memory.positions = positions;
            memory.markets = markets;
            memory.tokens = tokens;
            memory.volumes = volumes;
            memory.orders = orders;
            memory.tradingHistory = tradingHistory;
            memory.synthBtcPredictions = btcPredictions;
            memory.synthEthPredictions = ethPredictions;
            memory.btcTechnicalAnalysis = btcTechnicalAnalysis;
            memory.ethTechnicalAnalysis = ethTechnicalAnalysis;
            
            memory.currentTask = "Data loaded - ready for trading analysis";
            memory.lastResult = `Data refresh completed at ${new Date().toISOString()}`;
            console.warn(`✅ GMX trading data loaded successfully`);
        } catch (error) {
            console.error("❌ Error loading GMX data:", error);
            memory.lastResult = `Data loading failed: ${error instanceof Error ? error.message : error}`;
        }
    },

    render({ memory }) {
        console.warn("🔄 Rendering GMX trading data...");

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
            tradingHistory: memory.tradingHistory,
            synthBtcPredictions: memory.synthBtcPredictions,
            synthEthPredictions: memory.synthEthPredictions,
            btcTechnicalAnalysis: memory.btcTechnicalAnalysis,
            ethTechnicalAnalysis: memory.ethTechnicalAnalysis,
          });
    },
    }).setInputs({
        // 🎯 UNIFIED TRADING MONITOR - Handles all events with scheduled cycle as fallback
        "gmx:trading-monitor": input({
            schema: z.object({
                text: z.string(),
            }),
            subscribe: (send) => {
                // Track cooldown state locally
                let lastBtcTriggerTime: number | undefined = undefined;
                let lastEthTriggerTime: number | undefined = undefined;
                let lastBtcTriggerType: string | undefined = undefined;
                let lastEthTriggerType: string | undefined = undefined;

                // Track timing for scheduled cycles
                let lastTradingCycleTime = Date.now();
                
                const unifiedMonitor = async () => {
                    const now = Date.now();
                        // Fetch all monitoring data
                        const [btc_predictions, eth_predictions] = await Promise.all([
                            get_synth_analysis_str('BTC', gmxDataCache),
                            get_synth_analysis_str('ETH', gmxDataCache)
                        ]);
                        
                        // Extract volatility from analysis output
                        const extractVolatility = (analysis: string): number => {
                            const match = analysis.match(/VOLATILITY_24H: ([\d.]+)%/);
                            return match ? parseFloat(match[1]) : 30; // Default to 30% if not found
                        };
                        
                        const btcVolatility = extractVolatility(btc_predictions);
                        const ethVolatility = extractVolatility(eth_predictions);
                        
                        // Get volatility-based thresholds
                        const btcThresholds = getVolatilityThresholds(btcVolatility);
                        const ethThresholds = getVolatilityThresholds(ethVolatility);
                        
                        const btcPercentile = extractPercentileFromSynthAnalysis(btc_predictions);
                        const ethPercentile = extractPercentileFromSynthAnalysis(eth_predictions);
                                                
                        // Check for triggers (priority order: synth signals > scheduled)
                        let triggered = false;
                        let triggerReason = "";
                        let triggerType = "";
                        
                        // 1. Check for Synth threshold breaches with cooldown protection
                        if (btcPercentile !== null && (btcPercentile <= btcThresholds.lowThreshold || btcPercentile >= btcThresholds.highThreshold)) {
                            const signalType: 'LONG' | 'SHORT' = btcPercentile <= btcThresholds.lowThreshold ? 'LONG' : 'SHORT';
                            const inCooldown = isInCooldown('BTC', signalType, lastBtcTriggerTime, lastBtcTriggerType);
                            
                            if (inCooldown) {
                                const cooldownMinutes = Math.ceil((1800000 - (Date.now() - lastBtcTriggerTime!)) / 60000);
                                console.warn(`🧊 [SYNTH] BTC P${btcPercentile} ${signalType} signal BLOCKED - Cooldown active (${cooldownMinutes}min remaining)`);
                            } else {
                                const volCategory = btcVolatility < 25 ? 'LOW' : btcVolatility < 40 ? 'STD' : btcVolatility < 60 ? 'HIGH' : 'VERY HIGH';
                                triggerReason = `BTC reached P${btcPercentile} (${signalType} signal, Vol:${volCategory} ${btcVolatility.toFixed(1)}%)`;
                                triggerType = "SYNTH";
                                triggered = true;
                                console.warn(`🚨 [SYNTH] BTC trigger detected: P${btcPercentile} ${btcPercentile <= btcThresholds.lowThreshold ? `≤${btcThresholds.lowThreshold}` : `≥${btcThresholds.highThreshold}`} (${signalType}) [Vol:${volCategory} ${btcVolatility.toFixed(1)}%]`);
                            }
                        }
                        else if (ethPercentile !== null && (ethPercentile <= ethThresholds.lowThreshold || ethPercentile >= ethThresholds.highThreshold)) {
                            const signalType: 'LONG' | 'SHORT' = ethPercentile <= ethThresholds.lowThreshold ? 'LONG' : 'SHORT';
                            const inCooldown = isInCooldown('ETH', signalType, lastEthTriggerTime, lastEthTriggerType);
                            
                            if (inCooldown) {
                                const cooldownMinutes = Math.ceil((1800000 - (Date.now() - lastEthTriggerTime!)) / 60000);
                                console.warn(`🧊 [SYNTH] ETH P${ethPercentile} ${signalType} signal BLOCKED - Cooldown active (${cooldownMinutes}min remaining)`);
                            } else {
                                const volCategory = ethVolatility < 25 ? 'LOW' : ethVolatility < 40 ? 'STD' : ethVolatility < 60 ? 'HIGH' : 'VERY HIGH';
                                triggerReason = `ETH reached P${ethPercentile} (${signalType} signal, Vol:${volCategory} ${ethVolatility.toFixed(1)}%)`;
                                triggerType = "SYNTH";
                                triggered = true;
                                console.warn(`🚨 [SYNTH] ETH trigger detected: P${ethPercentile} ${ethPercentile <= ethThresholds.lowThreshold ? `≤${ethThresholds.lowThreshold}` : `≥${ethThresholds.highThreshold}`} (${signalType}) [Vol:${volCategory} ${ethVolatility.toFixed(1)}%]`);
                            }
                        }
                        // 2. Check for scheduled cycle (lowest priority - only if no other triggers)
                        else {
                            const timeSinceLastCycle = now - lastTradingCycleTime;
                            const cycleInterval = 1200000; // 20 minutes in milliseconds
                            
                            // Don't trigger scheduled cycles if we don't have percentile data
                            if (btcPercentile === null || ethPercentile === null) {
                                console.warn(`🔍 [MONITOR] No triggers - BTC:P${btcPercentile || 'N/A'} ETH:P${ethPercentile || 'N/A'} Volatility: BTC:${btcVolatility.toFixed(1)}% ETH:${ethVolatility.toFixed(1)}% | Waiting for sufficient data before scheduled cycles`);
                            } else if (timeSinceLastCycle >= cycleInterval) {
                                triggerReason = "Regular 20-minute scheduled check";
                                triggerType = "SCHEDULED";
                                triggered = true;
                                console.warn(`⏰ [SCHEDULED] 20-minute timer triggered - fallback trading cycle`);
                            } else {
                                const minutesRemaining = Math.ceil((cycleInterval - timeSinceLastCycle) / 60000);
                                console.warn(`🔍 [MONITOR] No triggers - BTC:P${btcPercentile || 'N/A'} ETH:P${ethPercentile || 'N/A'} Volatility: BTC:${btcVolatility.toFixed(1)}% ETH:${ethVolatility.toFixed(1)}% | Next scheduled cycle in ${minutesRemaining}min`);
                            }
                        }
                        
                        if (triggered) {
                            // Determine which asset and signal type for Synth triggers
                            let triggeredAsset: 'BTC' | 'ETH' | undefined = undefined;
                            let triggeredSignalType: 'LONG' | 'SHORT' | undefined = undefined;
                            
                            if (triggerType === "SYNTH") {
                                if (triggerReason.includes('BTC')) {
                                    triggeredAsset = 'BTC';
                                    triggeredSignalType = btcPercentile! <= btcThresholds.lowThreshold ? 'LONG' : 'SHORT';
                                    // Update local cooldown state
                                    lastBtcTriggerTime = Date.now();
                                    lastBtcTriggerType = triggeredSignalType;
                                } else if (triggerReason.includes('ETH')) {
                                    triggeredAsset = 'ETH';
                                    triggeredSignalType = ethPercentile! <= ethThresholds.lowThreshold ? 'LONG' : 'SHORT';
                                    // Update local cooldown state
                                    lastEthTriggerTime = Date.now();
                                    lastEthTriggerType = triggeredSignalType;
                                }
                            }
                            
                            await triggerTradingCycle(send, triggerReason, triggerType, {
                                btcPercentile,
                                ethPercentile,
                                triggeredAsset,
                                triggerType: triggeredSignalType
                            });
                            
                            // Update last trading cycle time
                            lastTradingCycleTime = now;
                        }                        
                    }
                
                // Initial run
                unifiedMonitor();
                
                // Check every minute
                const interval = setInterval(unifiedMonitor, 60000);
                
                console.warn("✅ Unified trading monitor initialized - checking every 1 minute");
                return () => {
                    console.warn("🛑 Unified trading monitor cleanup");
                    clearInterval(interval);
                };
            }
        })
    });

// Create GMX actions using the SDK instance and enhanced data cache
const gmxActions = createGmxActions(sdk, gmxDataCache);

// ═══════════════════════════════════════════════════════════════════════════════
// 🔌 GMX EXTENSION DEFINITION
// ═══════════════════════════════════════════════════════════════════════════════

const gmx = extension({
    name: "gmx",
    contexts: {
        gmxTrading: gmxContext,
    },
    actions: gmxActions,
});

console.warn("⚡ Initializing Vega trading agent...");

 // Initialize complete Supabase memory system
 console.warn("🗄️ Setting up Supabase memory system..." );
 const supabaseMemory = createSupabaseBaseMemory({
     url: env.SUPABASE_URL,
     key: env.SUPABASE_KEY,
     memoryTableName: "gmx_memory",
     vectorTableName: "gmx_embeddings",
     vectorModel: openai("gpt-4o-mini"),
 });

 console.warn("✅ Memory system initialized!");

// Create the agent with persistent memory
const agent = createDreams({
    model: anthropic("claude-sonnet-4-20250514"),
    logger: new Logger({ level: LogLevel.DEBUG }), // Enable debug logging
    extensions: [gmx], // Add GMX extension
    memory: supabaseMemory,
    streaming: false, // Disable streaming to avoid the ... input issue
});

console.warn("✅ Agent created successfully!");

// Start the agent with GMX context arguments
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
    tradingHistory: "Loading...",
    synthBtcPredictions: "Loading...",
    synthEthPredictions: "Loading...",
    btcTechnicalAnalysis: "Loading...",
    ethTechnicalAnalysis: "Loading...",
});

console.warn("🎯 Vega is now live and ready for GMX trading!");