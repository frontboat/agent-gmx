/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🌟 VEGA - GMX TRADING AGENT
 * ═══════════════════════════════════════════════════════════════════════════════
  */

// ═══════════════════════════════════════════════════════════════════════════════
// 📦 IMPORTS
// ═══════════════════════════════════════════════════════════════════════════════
import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { z } from "zod/v4";
import { createDreams, context, render, input, extension, validateEnv, LogLevel, Logger } from "@daydreamsai/core";
import { createSupabaseBaseMemory } from "@daydreamsai/supabase";
import { createGmxActions } from './gmx-actions';
import { createGmxWalletFromEnv } from './gmx-wallet';
import { EnhancedDataCache } from './gmx-cache';
import { ASSETS, type Asset } from "./gmx-types";
import { extractPercentileFromSynthAnalysis, extractRegimeSignalFromSynthAnalysis, isInCooldown, formatError } from "./gmx-utils";
import { get_assets_markets_str, get_daily_volumes_str, get_portfolio_balance_str, get_positions_str, get_tokens_data_str, get_orders_str, get_synth_analysis_str, get_technical_analysis_str, get_trading_history_str } from "./gmx-queries";

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
    positionCount?: number,
    triggeredAsset?: Asset,
    triggerType?: 'LONG' | 'SHORT'
}) {
    const now = Date.now();
    console.warn(`🚨 [${eventType}] ${reason} - Triggering trading cycle`);

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
        assetTechnicalAnalysis: "",
        assetSynthAnalysis: ""
    }, {text: `${eventType}: ${reason}`});
}

// ═══════════════════════════════════════════════════════════════════════════════
// 🤖 VEGA CHARACTER DEFINITION
// ═══════════════════════════════════════════════════════════════════════════════

const vega_template = 
`
# VEGA - GMX Trading Agent

## 🎯 OBJECTIVE
Maximize returns via high-probability trades with strict risk management.

## 📊 LIVE DATA
- **Portfolio:**
{{portfolio}}

- **Positions:** 
{{positions}}
 
- **Orders:** 
{{orders}}

- **Markets:** 
{{markets}}

- **Tokens:** 
{{tokens}}

- **Volumes:** 
{{volumes}}

- **History:** 
{{tradingHistory}}

- **Assets AI Predictions:** 
{{assetSynthAnalysis}}

- **Assets Technical Analysis:** 
{{assetTechnicalAnalysis}}

## ⚡ SIGNAL FRAMEWORK

**Percentile Logic:** P23 = 23% predict BELOW current price (lower = more upside)

### Entry Signals by Volatility
| Volatility | LONG Entry | SHORT Entry | Size | Leverage |
|------------|------------|-------------|------|----------|
| VL (0-20%) | ≤P20       | ≥P80        | 20%  | 5x       |
| L (20-40%) | ≤P15       | ≥P85        | 25%  | 4x       |
| M (40-60%) | ≤P10       | ≥P90        | 30%  | 3x       |
| H (60%+)   | ≤P5        | ≥P95        | 35%  | 2x       |

### Risk Management Rules
| Position | Stop Loss | TP1 (60%) | TP2 (30%) | TP3 (10%) | Move Stop to BE |
|----------|-----------|-----------|-----------|-----------|-----------------|
| **LONG** | P1        | P30       | P40       | P50       | After P30 hit   |
| **SHORT**| P99       | P70       | P60       | P50       | After P70 hit   |

### Execution Checklist
✅ **ENTER** when ALL conditions met:
- Valid signal per volatility table
- Near support (long) or resistance (short)
- Technical confluence confirms
- Risk/Reward > 1

❌ **EXIT** when ANY condition met:
- Price reaches P50 (mean reversion)
- Opposite signal triggers
- Stop loss hit

## 🔄 TRADING CYCLE PRIORITY

### 1. MANAGE EXISTING (FIRST)
- Close if P50 reached or opposite signal triggered
- If TP1 executed → cancel old stop, set new at breakeven
- Cancel all orphaned orders from closed positions

### 2. SCAN & EXECUTE (ONLY AFTER STEP 1)
When opening position:
1. Enter position (market/limit)
2. Set 1 stop loss at P1 for long or P99 for shorts (as per Risk Management Rules)
3. Set 3 take profits as per Risk Management Rules:
   - LONG: P30/P40/P50 (60/30/10%)
   - SHORT: P70/P60/P50 (60/30/10%)

## 💻 TRADING FUNCTIONS

**CRITICAL: Prices = 30 decimals (36 digits), USDC = 6 decimals, Leverage = basis points**

// POSITIONS
open_long_market({"marketAddress": "0x...", "payAmount": "1000000", "payTokenAddress": "0x...", "collateralTokenAddress": "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", "leverage": "30000"})
open_long_limit({"marketAddress": "0x...", "payAmount": "1000000", "payTokenAddress": "0x...", "collateralTokenAddress": "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", "limitPrice": "112000000000000000000000000000000000"})
open_short_market({"marketAddress": "0x...", "payAmount": "1000000", "payTokenAddress": "0x...", "collateralTokenAddress": "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", "leverage": "60000"})
open_short_limit({"marketAddress": "0x...", "payAmount": "1000000", "payTokenAddress": "0x...", "collateralTokenAddress": "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", "limitPrice": "110000000000000000000000000000000000"})

// MANAGEMENT
close_position({"marketAddress": "0x...", "receiveTokenAddress": "0xaf88d065e77c8cC2239327C5EDb3A432268e5831"})
cancel_orders({"orderKeys": ["0x..."]})

// RISK (30 decimal prices, percentage 1-100)
set_stop_loss({"marketAddress": "0x...", "triggerPrice": "105000000000000000000000000000000000", "percentage": 100}) // $105 000
set_take_profit({"marketAddress": "0x...", "triggerPrice": "108000000000000000000000000000000000", "percentage": 60}) // $108 000

// SWAPS
swap_tokens({"fromTokenAddress": "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", "toTokenAddress": "0x...", "fromAmount": "50000000"}) // FROM USDC
swap_tokens({"fromTokenAddress": "0x...", "toTokenAddress": "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", "toAmount": "50000000"}) // TO USDC


**Formats:**
- USDC: "1000000" = 1 USDC (6 decimals)
- Leverage: "30000" = 3x (basis points)
- Prices: "110000000000000000000000000000000000" = $110 000 (30 decimals)
- Percentages: 40 = 40% (no decimals)

## 📝 RESPONSE FORMAT

### 1. POSITION REVIEW
[TOKEN]: Entry $X, Current $Y, P/L +/-Z%
- Percentile: PXX | Orders: [list keys]
- Action: [HOLD/CLOSE/UPDATE STOP]

### 2. ORDER CLEANUP
Cancelled: [keys] - Reason: [duplicate/orphaned]

### 3. TRADE DECISION
**IF EXECUTING:**
EXECUTING [LONG/SHORT] [TOKEN]:
- Entry: $X at PXX
- Size: X USDC (X% portfolio)
- Leverage: Xx
- Stop: $X at P1/P99 (Risk: $X)
- TP1: $X at P30/P70 (60%)
- TP2: $X at P40/P60 (30%)
- TP3: $X at P50 (10%)
- R:R: X:1 | Signal: PXX with [VOL] regime

**IF NOT:**
NO QUALIFYING SETUP - [reason]

### 4. NEXT ACTIONS
- Monitor for TP1 → move stop to BE
- Track remaining position after partials

## ⛔ ABSOLUTE RULES (CRITICAL)

**NEVER:**
- Trade without stops
- Duplicate TPs at same level
- Mix decimal formats (SL and TP must match)
- Use >50% portfolio per trade
- Keep positions past P50

**ALWAYS:**
- Manage existing positions FIRST
- Cancel old pending orders before opening new ones
- Never set more than 3 TPs per Risk Management table
- Move stop to BE after TP1 (P30 long/P70 short)
- Use 30 decimals for ALL prices
- Keep $20-50 ETH gas reserve

---
*Execute with precision. Manage with discipline. No emotions.*
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
        assetTechnicalAnalysis: z.string().describe("Technical analysis for all assets"),
        assetSynthAnalysis: z.string().describe("AI predictions for all assets"),
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
            assetTechnicalAnalysis:state.args.assetTechnicalAnalysis,
            assetSynthAnalysis:state.args.assetSynthAnalysis,
          };
      },

    async loader({ memory }) {
        try {
            // Load all data in parallel for maximum speed
            const basePromises = [
                get_portfolio_balance_str(gmxDataCache),
                get_positions_str(gmxDataCache),
                get_assets_markets_str(gmxDataCache),
                get_tokens_data_str(gmxDataCache),
                get_daily_volumes_str(sdk, gmxDataCache),
                get_orders_str(sdk, gmxDataCache),
                get_trading_history_str(sdk, gmxDataCache),
            ];
            
            const assetPromises = ASSETS.flatMap(asset => [
                get_synth_analysis_str(asset, gmxDataCache),
                get_technical_analysis_str(asset, gmxDataCache)
            ]);
            
            const allResults = await Promise.all([...basePromises, ...assetPromises]);
            
            // Destructure base results
            const [
                portfolio,
                positions,
                markets,
                tokens,
                volumes,
                orders,
                tradingHistory
            ] = allResults;
            
            // Combine all asset synth analysis into one string
            const synthAnalysisArray: string[] = [];
            const techAnalysisArray: string[] = [];
            let assetIndex = basePromises.length;
            
            ASSETS.forEach(asset => {
                synthAnalysisArray.push(allResults[assetIndex++]);
                techAnalysisArray.push(allResults[assetIndex++]);
            });
            
            // Update memory with fresh data
            memory.portfolio = portfolio;
            memory.positions = positions;
            memory.markets = markets;
            memory.tokens = tokens;
            memory.volumes = volumes;
            memory.orders = orders;
            memory.tradingHistory = tradingHistory;
            memory.assetSynthAnalysis = synthAnalysisArray.join('\n\n');
            memory.assetTechnicalAnalysis = techAnalysisArray.join('\n\n');
            
            memory.currentTask = "Data loaded - ready for trading analysis";
            memory.lastResult = `Data refresh completed at ${new Date().toISOString()}`;

        } catch (error) {
            console.error("❌ Error loading GMX data:", error);
            memory.lastResult = `Data loading failed: ${formatError(error)}`;
        }
    },

    render({ memory }) {
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
            assetTechnicalAnalysis: memory.assetTechnicalAnalysis,
            assetSynthAnalysis: memory.assetSynthAnalysis,
          });
    },
    }).setInputs({
        // 🎯 UNIFIED TRADING MONITOR - Handles all events with scheduled cycle as fallback
        "gmx:trading-monitor": input({
            schema: z.object({
                text: z.string(),
            }),
            subscribe: (send) => {
                // Track cooldown state locally - dynamic for all assets
                const lastTriggerTimes = new Map<Asset, number | undefined>();
                const lastTriggerTypes = new Map<Asset, string | undefined>();
                
                // Initialize tracking for all assets
                ASSETS.forEach(asset => {
                    lastTriggerTimes.set(asset, undefined);
                    lastTriggerTypes.set(asset, undefined);
                });

                // Track timing for scheduled cycles
                let lastTradingCycleTime = Date.now();
                
                const unifiedMonitor = async () => {
                    const now = Date.now();
                        // Fetch all monitoring data for all assets (synth and volatility independently)
                        const [predictionsResults, volatilityResults] = await Promise.all([
                            Promise.all(ASSETS.map(asset => get_synth_analysis_str(asset, gmxDataCache))),
                            Promise.all(ASSETS.map(asset => gmxDataCache.getVolatility(asset)))
                        ]);
                        
                        // Create maps for easier access
                        const predictions = new Map<Asset, string>();
                        const volatilities = new Map<Asset, number>();
                        
                        ASSETS.forEach((asset, index) => {
                            predictions.set(asset, predictionsResults[index]);
                            volatilities.set(asset, volatilityResults[index]);
                        });
                        
                        // Get percentile data for display
                        const percentiles = new Map<Asset, number | null>();
                        ASSETS.forEach(asset => {
                            percentiles.set(asset, extractPercentileFromSynthAnalysis(predictions.get(asset)!));
                        });
                        
                        // Get enhanced prediction signals (primary trigger source) for all assets
                        const regimeSignals = new Map<Asset, any>();
                        ASSETS.forEach(asset => {
                            regimeSignals.set(asset, extractRegimeSignalFromSynthAnalysis(predictions.get(asset)!));
                        });
                        
                        // Check for valid percentile-based signals from simplified strategy
                        
                        // Check for triggers (priority order: percentile signals > scheduled)
                        let triggered = false;
                        let triggerReason = "";
                        let triggerType = "";
                        let triggeredAsset: Asset | undefined = undefined;
                        let triggeredSignalType: 'LONG' | 'SHORT' | undefined = undefined;
                        
                        // 1. Check for percentile-based signals (PRIORITY) - iterate through all assets
                        for (const asset of ASSETS) {
                            const regimeSignal = regimeSignals.get(asset);
                            const volatility = volatilities.get(asset)!;
                            const percentile = percentiles.get(asset);
                            
                            if (regimeSignal && regimeSignal.hasRegimeSignal && regimeSignal.regimeSignal) {
                                const signalType = regimeSignal.regimeSignal;
                                const inCooldown = isInCooldown(asset, signalType, lastTriggerTimes.get(asset), lastTriggerTypes.get(asset));
                                
                                if (inCooldown) {
                                    const cooldownMinutes = Math.ceil((3600000 - (Date.now() - lastTriggerTimes.get(asset)!)) / 60000);
                                    console.warn(`🧊 [SIGNAL] ${asset} ${signalType} signal BLOCKED - Cooldown active (${cooldownMinutes}min remaining)`);
                                } else {
                                    const volCategory = volatility < 20 ? 'VERY_LOW' : volatility < 40 ? 'LOW' : volatility < 60 ? 'MEDIUM' : 'HIGH';
                                    const percentileStr = percentile !== null ? `P${percentile.toFixed(1)}` : 'N/A';
                                    triggerReason = `${asset} ${signalType} signal at ${percentileStr} (${volCategory} volatility ${volatility.toFixed(1)}%)`;
                                    triggerType = "SIGNAL";
                                    triggered = true;
                                    triggeredAsset = asset;
                                    triggeredSignalType = signalType;
                                    
                                    // Update local cooldown state
                                    lastTriggerTimes.set(asset, Date.now());
                                    lastTriggerTypes.set(asset, triggeredSignalType);
                                    
                                    console.warn(`🚨 [SIGNAL] ${asset} ${signalType} triggered at ${percentileStr} | ${volCategory} vol (${volatility.toFixed(1)}%)`);
                                    console.warn(`📊 [SIGNAL] Trigger thresholds: ${volCategory === 'VERY_LOW' ? 'P20/P80' : volCategory === 'LOW' ? 'P15/P85' : volCategory === 'MEDIUM' ? 'P10/P90' : 'P5/P95'}`);
                                    break; // Exit loop after first valid trigger
                                }
                            }
                        }
                        // 2. Check for scheduled cycle (lowest priority - only if no regime triggers)
                        if (!triggered) {
                            const timeSinceLastCycle = now - lastTradingCycleTime;
                            const cycleInterval = 1200000; // 20 minutes in milliseconds
                            if (timeSinceLastCycle >= cycleInterval) {
                                triggerReason = "Regular 20-minute scheduled check";
                                triggerType = "SCHEDULED";
                                triggered = true;
                                console.warn(`⏰ [SCHEDULED] 20-minute timer triggered - fallback trading cycle`);
                            } else {
                                const minutesRemaining = Math.ceil((cycleInterval - timeSinceLastCycle) / 60000);
                                // Build detailed status for each asset
                                const statusLines = ASSETS.map(asset => {
                                    const percentile = percentiles.get(asset);
                                    const volatility = volatilities.get(asset)!;
                                    const regime = regimeSignals.get(asset);
                                    const signal = regime && regime.hasRegimeSignal ? regime.regimeSignal : 'WAIT';
                                    const percentileStr = percentile !== null ? `P${percentile.toFixed(1)}` : 'N/A';
                                    const volCategory = volatility < 20 ? 'VL' : volatility < 40 ? 'L' : volatility < 60 ? 'M' : 'H';
                                    return `${asset}:${percentileStr}/${signal}/${volCategory}`;
                                }).join(' | ');
                                console.warn(`🔍 [MONITOR] ${statusLines} | Next check: ${minutesRemaining}min`);
                            }
                        }
                        
                        if (triggered) {
                            // Create data for triggerTradingCycle function
                            const triggerData = {
                                triggeredAsset,
                                triggerType: triggeredSignalType
                            };
                            await triggerTradingCycle(send, triggerReason, triggerType, triggerData);
                            // Update last trading cycle time
                            lastTradingCycleTime = now;
                        }                        
                    }
                
                // Initial run
                unifiedMonitor();
                
                // Check every minute
                const interval = setInterval(unifiedMonitor, 60000);
                return () => clearInterval(interval);
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
    assetTechnicalAnalysis: "Loading...",
    assetSynthAnalysis: "Loading...",
});

console.warn("🎯 Vega is now live and ready for GMX trading!");
