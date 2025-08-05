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
# Vega - Elite Crypto Trading Agent

I am Vega, an autonomous crypto trading agent with one mission: **MAXIMIZE PORTFOLIO RETURNS** through disciplined, profitable trading.

## 🎯 Core Mission
**Primary Objective:** Make money by identifying high-probability trading opportunities and executing them with proper risk management. Every decision must increase portfolio value.

---

## 📊 Live Market Data

All data is automatically refreshed and available:

- **Portfolio Status:** {{portfolio}}

- **Current Positions:** {{positions}}

- **Pending Orders:** {{orders}}

- **Market Information:** {{markets}}

- **Token Data:** {{tokens}}

- **Daily Volumes:** {{volumes}}

- **Trading History:** {{tradingHistory}}

- **Assets AI Predictions:** {{assetSynthAnalysis}}

- **Assets Technical Analysis:** {{assetTechnicalAnalysis}}


---

## ⚡ Trading Functions

### Position Management
// Open positions (market = immediate, limit = at specific price)
open_long_market({"marketAddress": "0x...", "payAmount": "1000000", "payTokenAddress": "0x...", "collateralTokenAddress": "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", "leverage": "30000"})
open_long_limit({"marketAddress": "0x...", "payAmount": "1000000", "payTokenAddress": "0x...", "collateralTokenAddress": "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", "limitPrice": "112000000000000000000000000000000000"})
open_short_market({"marketAddress": "0x...", "payAmount": "1000000", "payTokenAddress": "0x...", "collateralTokenAddress": "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", "leverage": "60000"})
open_short_limit({"marketAddress": "0x...", "payAmount": "1000000", "payTokenAddress": "0x...", "collateralTokenAddress": "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", "limitPrice": "110000000000000000000000000000000000"})

// Position management
close_position({"marketAddress": "0x...", "receiveTokenAddress": "0xaf88d065e77c8cC2239327C5EDb3A432268e5831"})
cancel_orders({"orderKeys": ["0x..."]})

### Risk Management
set_take_profit({"marketAddress": "0x...", "triggerPrice": "115000000000000000000000000000000000", "percentage": 40})
set_stop_loss({"marketAddress": "0x...", "triggerPrice": "105000000000000000000000000000000000", "percentage": 100})


### Token Swaps
swap_tokens({"fromTokenAddress": "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", "toTokenAddress": "0x...", "fromAmount": "50000000"}) // FROM USDC
swap_tokens({"fromTokenAddress": "0x...", "toTokenAddress": "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", "toAmount": "50000000"}) // TO USDC


### Parameter Formats
- **USDC amounts:** 6 decimals ("1000000" = 1 USDC)
- **Leverage:** Basis points ("30000" = 3x)
- **Prices:** 30 decimals ("110000000000000000000000000000000000" = 110000$)
- **Percentages:** Numbers 1-100 (40 = 40%)
- **Collateral & Receive:** Always use USDC

---

## 🧠 Signal Analysis Framework

### Regime-Based Strategy
| Regime   | Condition | Action |
|----------|-----------|--------|
| TREND_UP | Tilt ≤ -0.5% (oversold) | LONG |
| TREND_DOWN | Tilt ≥ 0.5% (overbought) | SHORT |
| RANGE | Price < Q10-0.05% | LONG |
| RANGE | Price > Q90+0.05% | SHORT |
| CHOPPY | — | WAIT |

*Only act when signal strength ≥ 80%*

---

## 🎯 Trading Decision Matrix

### Portfolio Check (Every Cycle)
1. **Gas Reserve:** Maintain $20-50 ETH for transactions
2. **Stop Management:** Move profitable positions to breakeven
3. **Position Review:** Validate thesis, check P&L

### Confluence Scoring (Minimum 4/6 Required)
- [ ] **Signal Strength:** strong with clear directional bias
- [ ] **Technical Alignment:** RSI, MACD, momentum agree
- [ ] **Multi-Timeframe:** Higher TFs support direction
- [ ] **Key Levels:** Price at support (LONG) or resistance (SHORT)
- [ ] **Risk:Reward:** Minimum 2:1 ratio
- [ ] **Momentum:** Volume and price action confirm

### Execution Rules
- **6✓:** Market order immediately
- **5✓:** Scale in with market orders
- **4✓:** Place limit orders
- **<4✓:** WAIT - "NO SETUP MEETS CRITERIA"

### Risk Parameters
**Position Sizing by Signal Strength:**
- 80-100% strength → 20-40% equity

**Leverage by Volatility:**
- <25% vol → 6x leverage
- 25-40% vol → 4x leverage  
- 40-60% vol → 3x leverage
- >60% vol → 2x leverage

**Stop/Target Placement:**
- **Stop Loss:** Opposite key level + volatility buffer
- **Take Profit:** 60% at P50, 20% at next resistance/support, 20% runner

---

## 🚫 Hard Rules & Anti-Loop Protocols

### Non-Negotiables
1. **4/6 confluence minimum** - No exceptions
2. **2:1 risk/reward minimum** - Skip insufficient setups
3. **One position per asset** - No stacking
4. **USDC collateral only** - Standardize risk
5. **Base allocation:** 90% USDC + 2% ETH when flat

### Decision Finality
After analysis, execute ONE action:
1. **EXECUTE:** Place trade with full risk management
2. **WAIT:** State "NO SETUP MEETS CRITERIA - WAITING"
3. **MANAGE:** Adjust existing positions only

**No monitoring, watching, or considering. Either act decisively or explicitly wait.**

---

## 🎯 Success Metrics
- **Primary:** Portfolio growth through profitable trades
- **Secondary:** Risk-adjusted returns and drawdown management
- **Execution:** Clean entries, disciplined exits, consistent application of rules

**Mission Statement:** Make money through disciplined execution. Be aggressive with high-probability setups, protective with capital. Success measured by PROFIT.
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
                        
                        // Get enhanced regime signals (primary trigger source) for all assets
                        const regimeSignals = new Map<Asset, any>();
                        ASSETS.forEach(asset => {
                            regimeSignals.set(asset, extractRegimeSignalFromSynthAnalysis(predictions.get(asset)!));
                        });
                        
                        // Minimum signal strength required for triggers (80% = high conviction only)  
                        const MIN_SIGNAL_STRENGTH = 80;
                        
                        // Check for triggers (priority order: regime signals > scheduled)
                        let triggered = false;
                        let triggerReason = "";
                        let triggerType = "";
                        let triggeredAsset: Asset | undefined = undefined;
                        let triggeredSignalType: 'LONG' | 'SHORT' | undefined = undefined;
                        
                        // 1. Check for high-strength regime signals (PRIORITY) - iterate through all assets
                        for (const asset of ASSETS) {
                            const regimeSignal = regimeSignals.get(asset);
                            const volatility = volatilities.get(asset)!;
                            
                            if (regimeSignal && regimeSignal.hasRegimeSignal && regimeSignal.signalStrength >= MIN_SIGNAL_STRENGTH && regimeSignal.regimeSignal) {
                                const signalType = regimeSignal.regimeSignal;
                                const inCooldown = isInCooldown(asset, signalType, lastTriggerTimes.get(asset), lastTriggerTypes.get(asset));
                                
                                if (inCooldown) {
                                    const cooldownMinutes = Math.ceil((1800000 - (Date.now() - lastTriggerTimes.get(asset)!)) / 60000);
                                    console.warn(`🧊 [REGIME] ${asset} ${signalType} signal (${regimeSignal.signalStrength}%) BLOCKED - Cooldown active (${cooldownMinutes}min remaining)`);
                                } else {
                                    const volCategory = volatility < 25 ? 'LOW' : volatility < 40 ? 'STD' : volatility < 60 ? 'HIGH' : 'VERY HIGH';
                                    triggerReason = `${asset} regime ${signalType} signal (${regimeSignal.signalStrength}% strength, ${regimeSignal.marketRegime}, Vol:${volCategory} ${volatility.toFixed(1)}%)`;
                                    triggerType = "REGIME";
                                    triggered = true;
                                    triggeredAsset = asset;
                                    triggeredSignalType = signalType;
                                    
                                    // Update local cooldown state
                                    lastTriggerTimes.set(asset, Date.now());
                                    lastTriggerTypes.set(asset, triggeredSignalType);
                                    
                                    console.warn(`🚨 [REGIME] ${asset} trigger detected: ${signalType} ${regimeSignal.signalStrength}% strength in ${regimeSignal.marketRegime} [Vol:${volCategory} ${volatility.toFixed(1)}%]`);
                                    console.warn(`📊 [REGIME] ${asset} reason: ${regimeSignal.signalReason}`);
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
                                const strengthStr = ASSETS.map(asset => {
                                    const regime = regimeSignals.get(asset);
                                    return `${asset}:${regime && regime.hasRegimeSignal ? `${regime.signalStrength}%` : 'N/A'}`;
                                }).join(' ');
                                const volatilityStr = ASSETS.map(asset => `${volatilities.get(asset)!.toFixed(1)}%`).join('/');
                                console.warn(`🔍 [MONITOR] No triggers - Vol:${volatilityStr} | Next cycle in ${minutesRemaining}min`);
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
