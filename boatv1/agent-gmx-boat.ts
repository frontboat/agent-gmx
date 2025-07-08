/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🌟 VEGA - BOAT x GMX TRADING AGENT
 * ═══════════════════════════════════════════════════════════════════════════════
 */

// ═══════════════════════════════════════════════════════════════════════════════
// 📦 IMPORTS
// ═══════════════════════════════════════════════════════════════════════════════

import { openrouter } from "@openrouter/ai-sdk-provider";
import { 
    createDreams, 
    context, 
    render, 
    input,
    extension,
    validateEnv, 
    LogLevel,
    Logger,
    TaskRunner,
    task,
    type Evaluator,
    type ServiceProvider,
    service,
    createServiceManager,
    trimWorkingMemory,
    type Episode,
    type EpisodicMemory,
    memory,
    type Memory
} from "@daydreamsai/core";
import { createSupabaseBaseMemory } from "@daydreamsai/supabase";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { GmxSdk } from "@gmx-io/sdk";
import { createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { createGmxActions } from './gmx-actions';
import { productionOutputHandlers, setDiscordClient } from './output-handlers';
import { TradingDiscordClient } from './discord-integration';
import { 
    get_btc_eth_markets_str, 
    get_daily_volumes_str, 
    get_portfolio_balance_str, 
    get_positions_str, 
    get_tokens_data_str, 
    get_orders_str, 
    get_synth_predictions_consolidated_str, 
    get_technical_analysis_str, 
    get_trading_history_str 
} from "./queries";
import { GmxMemory } from "./types";

// ═══════════════════════════════════════════════════════════════════════════════
// ⚙️ ENVIRONMENT VALIDATION & SETUP
// ═══════════════════════════════════════════════════════════════════════════════

console.log("🚀 Starting Enhanced GMX Trading Agent...");

const env = validateEnv(
    z.object({
        OPENROUTER_API_KEY: z.string().min(1, "OPENROUTER_API_KEY is required"),
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
        DISCORD_TOKEN: z.string().optional(),
        DISCORD_BOT_NAME: z.string().optional(),
        DISCORD_CHANNEL_ID: z.string().optional(),
    })
);

// ═══════════════════════════════════════════════════════════════════════════════
// 🔐 WALLET & SDK CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

// Validate hex address format
const validateHexAddress = (address: string): address is `0x${string}` => {
    return /^0x[a-fA-F0-9]{40}$/.test(address);
};

const validatePrivateKey = (key: string): key is `0x${string}` => {
    return /^0x[a-fA-F0-9]{64}$/.test(key);
};

// Validate private key format
if (!validatePrivateKey(env.GMX_PRIVATE_KEY)) {
    throw new Error("Invalid private key format. Must be 64 hex characters with 0x prefix.");
}

// Validate wallet address format
if (!validateHexAddress(env.GMX_WALLET_ADDRESS)) {
    throw new Error("Invalid wallet address format. Must be 40 hex characters with 0x prefix.");
}

const account = privateKeyToAccount(env.GMX_PRIVATE_KEY as `0x${string}`);

// Define supported chain configurations
const SUPPORTED_CHAINS = {
    42161: { 
        name: "Arbitrum One", 
        symbol: "ETH", 
        decimals: 18,
        network: "arbitrum"
    },
    43114: { 
        name: "Avalanche", 
        symbol: "AVAX", 
        decimals: 18,
        network: "avalanche"
    },
} as const;

const chainId = parseInt(env.GMX_CHAIN_ID);
const chainConfig = SUPPORTED_CHAINS[chainId as keyof typeof SUPPORTED_CHAINS];

if (!chainConfig) {
    throw new Error(`Unsupported chain ID: ${chainId}. Supported chains: ${Object.keys(SUPPORTED_CHAINS).join(', ')}`);
}

// Validate that network matches chain ID
if (chainConfig.network !== env.GMX_NETWORK) {
    throw new Error(`Network mismatch: Chain ID ${chainId} corresponds to ${chainConfig.network}, but GMX_NETWORK is set to ${env.GMX_NETWORK}`);
}

const walletClient = createWalletClient({
    account,
    transport: http(env.GMX_RPC_URL),
    chain: { 
        id: chainId,
        name: chainConfig.name,
        nativeCurrency: {
            decimals: chainConfig.decimals,
            name: chainConfig.name,
            symbol: chainConfig.symbol
        },
        rpcUrls: {
            default: { http: [env.GMX_RPC_URL] },
            public: { http: [env.GMX_RPC_URL] }
        }
    }
});

const sdk = new GmxSdk({
    rpcUrl: env.GMX_RPC_URL,
    chainId: chainId,
    oracleUrl: env.GMX_ORACLE_URL,
    walletClient: walletClient,
    subsquidUrl: env.GMX_SUBSQUID_URL,
    account: account?.address || env.GMX_WALLET_ADDRESS as `0x${string}`
});

if (env.GMX_WALLET_ADDRESS) {
    sdk.setAccount(env.GMX_WALLET_ADDRESS as `0x${string}`);
    console.log(`💼 GMX SDK initialized with account: ${env.GMX_WALLET_ADDRESS}`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 📊 ENHANCED MEMORY WITH EPISODIC LEARNING
// ═══════════════════════════════════════════════════════════════════════════════

interface EnhancedGmxMemory extends GmxMemory {
    // Episodic memory for learning from past trades
    episodicMemory?: EpisodicMemory;
    
    // Performance tracking
    totalTrades: number;
    winningTrades: number;
    losingTrades: number;
    totalProfitUSD: number;
    
    // Risk metrics
    currentDrawdown: number;
    maxDrawdown: number;
    sharpeRatio: number;
    
    // Pattern recognition
    successfulPatterns: string[];
    failedPatterns: string[];
}

const enhancedMemory: Memory<EnhancedGmxMemory> = memory({
    key: "enhanced-gmx-memory",
    create: async () => ({
        // Core trading data
        positions: "",
        orders: "",
        markets: "",
        tokens: "",
        volumes: "",
        portfolioBalance: "",
        tradingHistory: "",
        currentTask: null,
        lastResult: null,
        synthBtcPredictions: "",
        synthEthPredictions: "",
        btcTechnicalAnalysis: "",
        ethTechnicalAnalysis: "",
        
        // Enhanced features
        episodicMemory: {
            episodes: [],
            index: 0
        },
        totalTrades: 0,
        winningTrades: 0,
        losingTrades: 0,
        totalProfitUSD: 0,
        currentDrawdown: 0,
        maxDrawdown: 0,
        sharpeRatio: 0,
        successfulPatterns: [],
        failedPatterns: []
    })
});

// ═══════════════════════════════════════════════════════════════════════════════
// ✅ EVALUATORS FOR TRADE VALIDATION
// ═══════════════════════════════════════════════════════════════════════════════

const profitTargetEvaluator: Evaluator = {
    name: "profit-target-evaluator",
    description: "Validates that trades meet minimum profit requirements",
    handler: async (result: any, ctx, agent) => {
        const minProfitPercent = 0.02; // 2% minimum profit target
        if (result.profitPercent && result.profitPercent >= minProfitPercent) {
            return true;
        }
        return false;
    },
    onFailure: async (ctx, agent) => {
        console.warn("⚠️ Trade failed to meet minimum profit target");
        // Log to episodic memory for learning
        const episode: Episode = {
            id: crypto.randomUUID(),
            timestamp: Date.now(),
            observation: "Trade failed profit target",
            result: "failure",
            thoughts: "Need to improve entry timing or position sizing",
            metadata: {
                success: false,
                tags: ["low-profit", "evaluation-failed"]
            }
        };
        const memory = ctx.memory as EnhancedGmxMemory;
        memory.episodicMemory?.episodes.push(episode);
    }
};

const riskRewardEvaluator: Evaluator = {
    name: "risk-reward-evaluator", 
    description: "Ensures trades have minimum 2:1 risk/reward ratio",
    handler: async (result: any, ctx, agent) => {
        const minRiskReward = 2.0;
        if (result.riskRewardRatio && result.riskRewardRatio >= minRiskReward) {
            return true;
        }
        return false;
    },
    onFailure: async (ctx, agent) => {
        console.warn("⚠️ Trade failed risk/reward requirements");
    }
};

const drawdownEvaluator: Evaluator = {
    name: "drawdown-evaluator",
    description: "Prevents trading during excessive drawdown",
    handler: async (result: any, ctx, agent) => {
        const maxAllowedDrawdown = 0.15; // 15% max drawdown
        const memory = ctx.memory as EnhancedGmxMemory;
        if (memory.currentDrawdown > maxAllowedDrawdown) {
            console.error("🚫 Trading suspended - excessive drawdown");
            return false;
        }
        return true;
    }
};

// ═══════════════════════════════════════════════════════════════════════════════
// 🎯 SERVICE PROVIDERS FOR LIFECYCLE MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════

const gmxConnectionService: ServiceProvider = service({
    register: (container) => {
        container.singleton('gmxSdk', () => sdk);
        container.singleton('logger', () => new Logger({ level: LogLevel.DEBUG }));
    },
    
    boot: async (container) => {
        const logger = container.resolve<Logger>('logger');
        logger.info('gmx-service', '🔌 Connecting to GMX...');
        
        try {
            // Verify connection
            const markets = await sdk.markets.getMarkets();
            const marketCount = Object.keys(markets.data || {}).length;
            logger.info('gmx-service', `✅ Connected to GMX - ${marketCount} markets available`);
        } catch (error) {
            logger.error('gmx-service', '❌ Failed to connect to GMX', error);
            throw error;
        }
    },
    
    stop: async (container) => {
        const logger = container.resolve<Logger>('logger');
        logger.info('gmx-service', '🔌 Disconnecting from GMX...');
        // Clean up any subscriptions or connections
    }
});

const marketDataService: ServiceProvider = service({
    register: (container) => {
        container.singleton('marketDataInterval', () => null);
    },
    
    boot: async (container) => {
        const logger = container.resolve<Logger>('logger');
        logger.info('market-data', '📊 Starting market data service...');
        
        // Set up real-time price feeds
        const interval = setInterval(async () => {
            // Update market data
            logger.trace('market-data', 'Updating market prices...');
        }, 60000); // Every minute
        
        container.instance('marketDataInterval', interval);
    },
    
    stop: async (container) => {
        const interval = container.resolve<any>('marketDataInterval');
        if (interval) {
            clearInterval(interval);
        }
    }
});

// ═══════════════════════════════════════════════════════════════════════════════
// 📊 CONCURRENT TASK DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════

const updateMarketDataTask = task({
    key: "update-market-data",
    concurrency: 3, // Allow 3 concurrent market updates
    retry: 2,
    timeoutMs: 30000, // 30 second timeout
    handler: async ({ markets }: { markets: string[] }, ctx) => {
        const results = await Promise.all(
            markets.map(async (market) => {
                try {
                    if (market === 'BTC') {
                        return await get_technical_analysis_str(sdk, 'BTC');
                    } else if (market === 'ETH') {
                        return await get_technical_analysis_str(sdk, 'ETH');
                    }
                } catch (error) {
                    console.error(`Failed to update ${market}:`, error);
                    return null;
                }
            })
        );
        return results;
    }
});

const checkMultiplePositionsTask = task({
    key: "check-positions",
    concurrency: 5,
    retry: 3,
    handler: async (params, ctx) => {
        const [positions, orders, portfolio] = await Promise.all([
            get_positions_str(sdk),
            get_orders_str(sdk),
            get_portfolio_balance_str(sdk)
        ]);
        
        return { positions, orders, portfolio };
    }
});

// ═══════════════════════════════════════════════════════════════════════════════
// 🤖 VEGA CHARACTER DEFINITION (same as before)
// ═══════════════════════════════════════════════════════════════════════════════

const vega_template = 
`
# Vega - Elite Crypto Trading Agent (Capability-Aligned Edition)

I am Vega, an elite autonomous crypto trader competing in a high-stakes month-long trading competition. My sole purpose is to MAKE MONEY and maximize portfolio returns through aggressive, profitable trading.

---

## 🎯 Core Identity & Mission

**I am an autonomous trading agent with one clear goal: MAKE MONEY.** I process market data, identify profitable opportunities, and execute trades that grow my portfolio. My competitive edge comes from relentless focus on profitability, strategic positioning, and disciplined risk management.

**Primary Objective:** Maximize portfolio value through profitable trading. Every decision, every analysis, every trade must be driven by the singular goal of making money in this competitive trading environment.

---

## 📋 Trading Tools & Technical Specifications

#### 📊 Portfolio & Market Intelligence
- get_portfolio_balance: Get comprehensive portfolio balance including token balances, position values, total portfolio worth, and allocation percentages. NO PARAMETERS.
- get_btc_eth_markets: Get detailed BTC and ETH market information optimized for trading including prices, liquidity, funding rates, and market addresses for trading. NO PARAMETERS.
- get_daily_volumes: Get daily trading volume data for all markets. Returns volume statistics for liquidity analysis. NO PARAMETERS.
- get_tokens_data: Get complete token information including prices, balances, decimals, and addresses for all available tokens. NO PARAMETERS.

#### 💰 Position & Order Management
- get_positions: Get all current trading positions with PnL, liquidation prices, leverage, risk metrics, and distance to liquidation. NO PARAMETERS.
- get_orders: Get all pending orders with execution analysis, order age, execution probability, risk assessment, and potential liquidation prices. NO PARAMETERS.
- get_trading_history: Get comprehensive trading history analysis including performance metrics, win rates, profit factors, and recent trades. Essential for analyzing trading performance and improving money-making strategies. NO PARAMETERS.

#### 📈 Technical Analysis
- get_btc_technical_analysis: Get comprehensive BTC technical indicators across multiple timeframes (15m, 1h, 4h, 1d). Returns raw indicator data including moving averages, RSI, MACD, Bollinger Bands, ATR, Stochastic, and support/resistance levels for BTC analysis.
- get_eth_technical_analysis: Get comprehensive ETH technical indicators across multiple timeframes (15m, 1h, 4h, 1d). Returns raw indicator data including moving averages, RSI, MACD, Bollinger Bands, ATR, Stochastic, and support/resistance levels for ETH analysis.
- get_synth_btc_predictions: Get consolidated BTC price predictions from top-performing Synth miners
- get_synth_eth_predictions: Get consolidated ETH price predictions from top-performing Synth miners

#### ⚡ Trading Execution
- open_long_position: Open long position (market or limit order). REQUIRED: marketAddress, payTokenAddress, collateralTokenAddress, payAmount (6 decimals). OPTIONAL: leverage, allowedSlippageBps, limitPrice (30 decimals).
- open_short_position: Open short position (market or limit order). Same parameters as open_long_position.
- close_position: Fully close existing position (long or short) automatically. Detects position direction and closes the entire position. REQUIRED: marketAddress (from get_positions), receiveTokenAddress. OPTIONAL: allowedSlippageBps.
- cancel_orders: Cancel pending orders. REQUIRED: orderKeys (array of 32-byte hex strings).

#### 💱 Token Swaps
- swap_tokens: Swap tokens using GMX liquidity pools. REQUIRED: fromTokenAddress, toTokenAddress, and either fromAmount (when swapping FROM USDC) or toAmount (when swapping TO USDC). OPTIONAL: allowedSlippageBps, triggerPrice (for limit swaps).

#### 🛡️ Risk Management
- set_take_profit: Set take profit order for existing position. REQUIRED: marketAddress (from get_positions), triggerPrice (30 decimals). OPTIONAL: sizeDeltaUsd, allowedSlippageBps.
- set_stop_loss: Set stop loss order for existing position. REQUIRED: marketAddress (from get_positions), triggerPrice (30 decimals). OPTIONAL: sizeDeltaUsd, allowedSlippageBps.

**CRITICAL - How to Call Different Action Types**:
1. **Actions with NO parameters**: Call with NO data whatsoever - DO NOT pass (), {}, ""
   - get_portfolio_balance
   - get_synth_btc_predictions
   - get_synth_eth_predictions
   - get_btc_technical_analysis
   - get_eth_technical_analysis
   - get_btc_eth_markets
   - get_daily_volumes
   - get_tokens_data
   - get_positions
   - get_orders
   - get_trading_history

2. **Actions with REQUIRED parameters**: MUST provide all required fields
   - cancel_orders({"orderKeys": ["0x..."]})
   - open_long_position({"marketAddress": "0x...", "payAmount": "1000000", "payTokenAddress": "0x...", "collateralTokenAddress": "0x...", "allowedSlippageBps": 100, "leverage": "50000"}) // Market order
   - open_long_position({"marketAddress": "0x...", "payAmount": "1000000", "payTokenAddress": "0x...", "collateralTokenAddress": "0x...", "limitPrice": "65000000000000000000000000000000000"}) // Limit order at $65,000
   - open_short_position({"marketAddress": "0x...", "payAmount": "1000000", "payTokenAddress": "0x...", "collateralTokenAddress": "0x...", "allowedSlippageBps": 100, "leverage": "50000"}) // Market order
   - open_short_position({"marketAddress": "0x...", "payAmount": "1000000", "payTokenAddress": "0x...", "collateralTokenAddress": "0x...", "limitPrice": "63000000000000000000000000000000000"}) // Limit order at $63,000
   - close_position({"marketAddress": "0x...", "receiveTokenAddress": "0x...", "allowedSlippageBps": 100})
   - set_take_profit({"marketAddress": "0x...", "triggerPrice": "67000000000000000000000000000000000"}) // Take profit at $67,000
   - set_stop_loss({"marketAddress": "0x...", "triggerPrice": "63000000000000000000000000000000000"}) // Stop loss at $63,000
   - swap_tokens({"fromTokenAddress": "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", "toTokenAddress": "0x...", "fromAmount": "50000000"}) // When swapping FROM USDC, use fromAmount
   - swap_tokens({"fromTokenAddress": "0x...", "toTokenAddress": "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", "toAmount": "50000000"}) // When swapping TO USDC, use toAmount
   
#### 📋 Parameter Format Requirements
- **Decimal String Values**: All amounts must be BigInt strings (converted to BigInt internally)
  - USDC amounts: 6 decimals (e.g., "10000000" = 10 USDC)
  - Leverage: basis points (e.g., "50000" = 5x, "10000" = 1x, "200000" = 20x)
  - Limit prices: 30 decimals (e.g., "65000000000000000000000000000000000" = $65,000)
- **Slippage Parameters**: 
  - Trading actions: use allowedSlippageBps as number (e.g., 100 = 1%, 200 = 2%)
- **Order Types**:
  - Limit Order: include limitPrice parameter (executes when market reaches specified price)
  - Market Order: omit limitPrice parameter (immediate execution at current market price)
  - Take Profit: triggerPrice above current for LONG, below current for SHORT
  - Stop Loss: triggerPrice below current for LONG, above current for SHORT

### 🔢 Decimal Conversion Rules
**USDC (6 decimals)**:
- 1 USDC = "1000000"
- 100 USDC = "100000000" 
- 6.64 USDC = "6640000"

**ETH (18 decimals)**:
- 0.001 ETH = "1000000000000000"
- 0.01 ETH = "10000000000000000"
- 0.1 ETH = "100000000000000000"
- 1 ETH = "1000000000000000000"

---

## 🎯 TRADING DECISION MATRIX

### PHASE 1: Market Context Analysis
Answer each question thoroughly before proceeding:

**Q1: What is the current market structure?**
- Is price making higher highs and higher lows (uptrend)?
- Is price making lower highs and lower lows (downtrend)?
- Is price bouncing between clear horizontal levels (range)?
- Is price in a transition phase (breaking range or trend weakening)?

**Q2: What are the critical price levels?**
- What is the nearest major support level below current price?
- What is the nearest major resistance level above current price?
- How far is price from each level (percentage distance)?
- Which level is price gravitating toward?

**Q3: How strong is the current momentum?**
- Are shorter timeframes (15m, 1h) aligned with longer timeframes (4h, 1d)?
- Is volume increasing or decreasing with price movement?
- Is RSI showing divergence or confirmation?
- Are moving averages supporting or resisting price?

### PHASE 2: Trade Setup Evaluation
Only proceed if Phase 1 shows opportunity:

**Q4: Where is my exact entry?**
- If trending: Where is the pullback support/resistance for entry?
- If ranging: Am I close enough to range boundary for good R:R?
- If breakout: Has the breakout been confirmed with volume?
- Should I use market order (momentum) or limit order (precision)?

**Q5: How will I build this position?**
- Single entry: Is there one clear level with strong confluence?
- Scaled entry: Are there 2-3 support/resistance levels to work?
- If scaling: What size at each level? (1/3, 1/3, 1/3 method)
- What is my maximum total position size for this trade?

**Q6: What is my complete risk management plan?**
- Where exactly is my stop loss? (must be at technical level)
- What invalidates this trade? (price action, not just stop level)
- Where are my profit targets? (first target, second target)
- What is my risk:reward ratio? (must be minimum 2:1)

### PHASE 3: Trade Execution Decision
Based on Phase 1 & 2 analysis, choose execution method:

**Confluence Score Checklist:**
□ Multiple timeframes agree on direction
□ At least 3 technical indicators confirm
□ Near key support/resistance level
□ Volume supports the setup
□ Risk:reward ratio exceeds 2:1

**Entry Method Selection:**
- **All boxes checked + momentum strong** → Market order single entry
- **All boxes checked + multiple levels** → Scale in with limit orders
- **4/5 boxes checked** → Reduced size, strict stops
- **Less than 4 boxes** → NO TRADE

**Position Building Execution:**
1. **Single Entry Method**
   - Use when: Strong momentum or single clear level
   - Size: Up to 60% of capital on high conviction
   - Entry: Market order or single limit

2. **Scaled Entry Method (Preferred for most setups)**
   - Use when: Multiple support/resistance levels exist
   - Entry 1: 1/3 of intended size at first level
   - Entry 2: 1/3 at better level (if reached)
   - Entry 3: 1/3 at optimal level (if reached)
   - Stop: Single stop below/above all entries
   - Benefit: Better average price, reduced risk

3. **Breakout Entry Method**
   - Initial: Market order for 1/2 position on break
   - Add: Limit order for 1/2 on retest of breakout level
   - Stop: Below breakout level
   - Critical: Must see volume confirmation

---

## 📊 PORTFOLIO & RISK MANAGEMENT

### Position Sizing
- **Base size**: 20% of portfolio
- **Maximum**: 80% on single position
- **Leverage**: 1-3x only
- **Adjust for**: Setup quality, volatility, existing exposure

### Risk Controls
- **Stop loss**: ALWAYS set at technical invalidation
- **Take profit**: Set at logical resistance/support
- **Portfolio heat**: Monitor total risk exposure
- **Correlation**: Avoid concentrated directional bias

### Scaled Position Management
- **Combined risk**: Total position risk stays within original plan
- **Stop adjustment**: One stop for entire position at key level
- **Profit taking**: Can scale out in reverse (1/3 at each target)
- **Record keeping**: Track average entry and total size

### Capital Allocation
- **Core**: 60-80% USDC when not trading
- **Active**: Deploy on high-conviction setups
- **Reserve**: 2% ETH for gas always
- **Protection**: Reduce size after losses

---

## 🔄 CONTINUOUS OPTIMIZATION

### Performance Analysis
After each trade:
- What worked? What didn't?
- Was the setup quality accurate?
- Entry/exit timing assessment
- Update pattern recognition

### Adaptation Rules
- **Winning streak**: Gradually increase position size
- **Losing streak**: Reduce size, increase quality threshold
- **Market change**: Reassess entire approach
- **Track metrics**: Win rate, profit factor, average R

---

## ⏰ 30-MINUTE TRADING CYCLE

### CYCLE START: Position Management Questions
Answer these first, before looking for new trades:

**Q1: What is the status of my current positions?**
- What is the current P&L of each position?
- Are any positions profitable enough to move stops to breakeven?
- Are any losing positions approaching my stop loss?
- Has the original thesis for any position been invalidated?

**Q2: Should I take any immediate action on existing positions?**
- Are any positions at or near profit targets?
- Are any positions showing signs of reversal?
- Should I partially close any positions to lock in profits?
- Are any stops too tight and need adjustment?

**CRITICAL: Drawdown Tolerance Assessment**
- Is this normal price fluctuation or structural breakdown?
- Has my original technical thesis been invalidated, or is this just noise?
- Am I panicking due to temporary drawdown instead of waiting for thesis to play out?
- Is my stop loss still at the logical technical level where I planned it?

### CYCLE MIDDLE: Market Analysis Questions
Only after position management, scan for new opportunities:

**Q3: What is the current market environment?**
- Has the market regime changed since last cycle (trending vs ranging)?
- Are we approaching any major support/resistance levels?
- What is the overall market sentiment (risk-on vs risk-off)?
- Are we in a high-volatility or low-volatility period?

**Q4: Which market offers the best setup?**
- Does BTC show clearer technical confluence than ETH?
- Which market has better risk/reward potential?
- Which market has stronger volume and momentum?
- Are there any correlation considerations between the two?

**Q5: What are the Synth predictions telling me?**
- Bullish vs bearish?
- How strong is the consensus? (weight this at 10% maximum)
- Do predictions align with my technical analysis?
- Are there any extreme readings that warrant attention?

### CYCLE END: Execution Questions
Before taking any new positions:

**Q6: Do I have a high-probability setup?**
- Does this setup meet my confluence checklist?
- Are multiple timeframes aligned?
- Am I near key support/resistance levels?
- Is the risk:reward ratio at least 2:1?

**Q7: How should I enter this position?**
- Should I use a market order (strong momentum) or limit order (precision)?
- Are there multiple levels to scale into?
- What is my maximum position size for this trade?
- Where will I place my stop loss and take profit?

**Q8: What is my proactive plan for upcoming cycles?**
- Are there key levels I should place limit orders at?
- What news or events should I watch for?
- Are there any time-based patterns I should prepare for?
- Where will I add to positions if they move favorably?

---

## 🎯 CORE TRADING PRINCIPLES

### The Non-Negotiables
1. Never trade without clear confluence
2. Always set stop loss before entry confirmation
3. Minimum 2:1 risk/reward or skip
4. One position per asset maximum
5. Document every trade for learning

### The Mental Framework
- **Patience**: Wait for A+ setups only
- **Discipline**: Follow the system exactly
- **Objectivity**: Let data drive decisions
- **Adaptability**: Adjust to market regime
- **Focus**: Profit is the only goal

---

**My mission is simple: MAKE MONEY. Use every tool, every analysis, every trade to grow my portfolio. Be aggressive when profitable opportunities arise, be protective when risks threaten capital. My success is measured in one metric only: PROFIT.**
`

// ═══════════════════════════════════════════════════════════════════════════════
// 📊 ENHANCED GMX TRADING CONTEXT WITH EVENTS
// ═══════════════════════════════════════════════════════════════════════════════

const gmxContext = context({
    type: "gmx-trading-agent",
    maxSteps: 20,
    maxWorkingMemorySize: 50, // Increased for more history
    
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
    
    // Events for trade notifications
    events: {
        positionOpened: z.object({
            market: z.string(),
            size: z.string(),
            direction: z.enum(["long", "short"]),
            leverage: z.string(),
            entryPrice: z.string()
        }),
        
        positionClosed: z.object({
            market: z.string(),
            profit: z.number(),
            profitPercent: z.number(),
            duration: z.number()
        }),
        
        profitTargetHit: z.object({
            position: z.string(),
            profit: z.number(),
            profitPercent: z.number()
        }),
        
        stopLossTriggered: z.object({
            position: z.string(),
            loss: z.number(),
            lossPercent: z.number()
        }),
        
        riskAlert: z.object({
            type: z.enum(["drawdown", "leverage", "correlation", "position-size"]),
            severity: z.enum(["warning", "critical"]),
            message: z.string(),
            currentValue: z.number(),
            threshold: z.number()
        }),
        
        marketSignal: z.object({
            market: z.string(),
            signal: z.enum(["bullish", "bearish", "neutral"]),
            confidence: z.number(),
            indicators: z.array(z.string())
        })
    },

    key({ id }) {
        return id;
    },

    // Enhanced create with episodic memory
    create: async (state) => {
        const memory = await enhancedMemory.create();
        return {
            ...memory,
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
    
    // Lifecycle hooks
    onRun: async (ctx, agent) => {
        console.log("🏃 Starting trading cycle...");
        
        // Check risk limits before trading
        const memory = ctx.memory as EnhancedGmxMemory;
        if (memory.currentDrawdown > 0.15) {
            console.warn("⚠️ High drawdown detected - reducing position sizes");
            // Note: ctx.emit will be available in runtime, TypeScript just doesn't know about it
            (ctx as any).emit("riskAlert", {
                type: "drawdown",
                severity: "critical",
                message: "Drawdown exceeds 15% - risk reduction mode active",
                currentValue: memory.currentDrawdown,
                threshold: 0.15
            });
        }
    },
    
    onStep: async (ctx, agent) => {
        // Trim working memory to prevent overflow
        trimWorkingMemory(ctx.workingMemory, {
            thoughts: 20,    // Keep last 20 thoughts
            inputs: 10,      // Keep last 10 inputs
            outputs: 10,     // Keep last 10 outputs
            actions: 50      // Keep last 50 actions (important for trade history)
        });
    },
    
    onError: async (error, ctx, agent) => {
        console.error("❌ Trading error:", error);
        
        // Log error to episodic memory
        const episode: Episode = {
            id: crypto.randomUUID(),
            timestamp: Date.now(),
            observation: "Trading error occurred",
            result: String(error),
            thoughts: "Need to review error handling and recovery",
            metadata: {
                success: false,
                tags: ["error", "system-failure"]
            }
        };
        
        const memory = ctx.memory as EnhancedGmxMemory;
        memory.episodicMemory?.episodes.push(episode);
    },

    render({ memory }) {
        console.log(memory);

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
    
    // Use production output handlers
    outputs: productionOutputHandlers
}).setInputs({
    "gmx:trading-cycle": input({  
        schema: z.object({
            text: z.string(),
        }),
        subscribe: (send, agent) => {
            const tradingCycle = async () => {
                try {
                    // Use TaskRunner for concurrent data fetching
                    const taskRunner = agent.taskRunner;
                    
                    // Fetch all data concurrently
                    const [
                        marketData,
                        positionData,
                        predictions
                    ] = await Promise.all([
                        // Market data task
                        taskRunner.enqueueTask(
                            updateMarketDataTask,
                            { markets: ['BTC', 'ETH'] }
                        ),
                        // Position data task
                        taskRunner.enqueueTask(
                            checkMultiplePositionsTask,
                            {}
                        ),
                        // Predictions (not using task runner for these)
                        Promise.all([
                            get_synth_predictions_consolidated_str('BTC'),
                            get_synth_predictions_consolidated_str('ETH')
                        ])
                    ]);

                    const [btc_technical_analysis, eth_technical_analysis] = marketData;
                    const { positions, orders, portfolio } = positionData;
                    const [btc_predictions, eth_predictions] = predictions;

                    // Get additional data
                    const [markets, tokens, volumes, trading_history] = await Promise.all([
                        get_btc_eth_markets_str(sdk),
                        get_tokens_data_str(sdk),
                        get_daily_volumes_str(sdk),
                        get_trading_history_str(sdk)
                    ]);

                    const currentTask = "Trading cycle initiated";
                    const lastResult = "Trading cycle initiated";
                    
                    let context = {
                        type: "gmx-trading-agent",
                        maxSteps: 20,
                        instructions: vega_template,
                        currentTask: currentTask,
                        lastResult: lastResult,
                        positions: positions,
                        portfolio: portfolio,
                        markets: markets,
                        tokens: tokens,
                        volumes: volumes,
                        orders: orders,
                        trading_history: trading_history,
                        synth_btc_predictions: btc_predictions,
                        synth_eth_predictions: eth_predictions,
                        btc_technical_analysis: btc_technical_analysis || "",
                        eth_technical_analysis: eth_technical_analysis || "",
                    };
                    
                    let text = "Trading cycle initiated";
                    await send(gmxContext, context, {text});
                } catch (error) {
                    console.error("❌ Trading cycle error:", error);
                }
            };
            
            // Initial run
            tradingCycle();
            
            // Set up interval
            const interval = setInterval(tradingCycle, 1800000); // 30 minutes

            console.log("✅ Enhanced trading cycle subscription setup complete");
            
            return () => {
                console.log("🛑 Trading cycle subscription cleanup");
                clearInterval(interval);
            };
        }
    })
});

// Create enhanced GMX actions with evaluators
const gmxActions = createGmxActions(sdk, env).map(action => {
    // Add evaluators to trading actions
    if (action.name === 'open_long_position' || action.name === 'open_short_position') {
        return {
            ...action,
            evaluator: profitTargetEvaluator,
            retry: 3, // Retry failed trades up to 3 times
            onSuccess: async (result, ctx, agent) => {
                // Emit position opened event
                (ctx as any).emit("positionOpened", {
                    market: result.market,
                    size: result.size,
                    direction: action.name.includes('long') ? 'long' : 'short',
                    leverage: result.leverage,
                    entryPrice: result.entryPrice
                });
                
                // Add to episodic memory
                const episode: Episode = {
                    id: crypto.randomUUID(),
                    timestamp: Date.now(),
                    observation: `Opened ${action.name.includes('long') ? 'long' : 'short'} position`,
                    result: JSON.stringify(result),
                    thoughts: "Position opened successfully",
                    metadata: {
                        success: true,
                        tags: ["position-opened", result.market]
                    }
                };
                
                const memory = ctx.agentMemory as EnhancedGmxMemory;
                if (memory?.episodicMemory) {
                    memory.episodicMemory.episodes.push(episode);
                    memory.totalTrades++;
                }
            }
        };
    }
    
    if (action.name === 'close_position') {
        return {
            ...action,
            evaluator: profitTargetEvaluator,
            onSuccess: async (result, ctx, agent) => {
                // Emit position closed event
                (ctx as any).emit("positionClosed", {
                    market: result.market,
                    profit: result.profit,
                    profitPercent: result.profitPercent,
                    duration: result.duration
                });
                
                // Update performance metrics
                const memory = ctx.agentMemory as EnhancedGmxMemory;
                if (memory) {
                    if (result.profit > 0) {
                        memory.winningTrades++;
                        (ctx as any).emit("profitTargetHit", {
                            position: result.market,
                            profit: result.profit,
                            profitPercent: result.profitPercent
                        });
                    } else {
                        memory.losingTrades++;
                    }
                    memory.totalProfitUSD += result.profit;
                }
            }
        };
    }
    
    return action;
});

// ═══════════════════════════════════════════════════════════════════════════════
// 🔌 ENHANCED GMX EXTENSION
// ═══════════════════════════════════════════════════════════════════════════════

const gmx = extension({
    name: "gmx-enhanced",
    contexts: {
        gmxTrading: gmxContext,
    },
    actions: gmxActions,
    services: [
        gmxConnectionService,
        marketDataService
    ],
    // Add event handlers
    events: {
        // Listen for risk alerts
        riskAlert: z.object({
            type: z.string(),
            severity: z.string(),
            message: z.string()
        }),
        // Listen for market signals
        marketSignal: z.object({
            market: z.string(),
            signal: z.string(),
            confidence: z.number()
        })
    }
});

console.log("⚡ Initializing Enhanced Vega trading agent...");

// Initialize complete Supabase memory system
console.log("🗄️ Setting up Supabase memory system...");
const supabaseMemory = createSupabaseBaseMemory({
    url: env.SUPABASE_URL,
    key: env.SUPABASE_KEY,
    memoryTableName: "gmx_memory_enhanced",
    vectorTableName: "gmx_embeddings_enhanced",
    vectorModel: openai("gpt-4o-mini"),
});

console.log("✅ Enhanced memory system initialized!");

// Initialize Discord if credentials are provided
let discordClient: TradingDiscordClient | null = null;
if (env.DISCORD_TOKEN && env.DISCORD_BOT_NAME && env.DISCORD_CHANNEL_ID) {
    console.log("🤖 Initializing Discord integration...");
    try {
        discordClient = new TradingDiscordClient(
            {
                discord_token: env.DISCORD_TOKEN,
                discord_bot_name: env.DISCORD_BOT_NAME
            },
            env.DISCORD_CHANNEL_ID,
            LogLevel.INFO
        );
        setDiscordClient(discordClient);
        console.log("✅ Discord client connected!");
    } catch (error) {
        console.error("❌ Failed to initialize Discord:", error);
    }
} else {
    console.log("ℹ️ Discord integration disabled (missing credentials)");
}

// Create the enhanced agent with all features
const agent = createDreams({
    // Multi-model support
    model: openrouter("anthropic/claude-sonnet-4"), // Main model for trading decisions
    reasoningModel: openrouter("google/gemini-2.5-flash"), // Fast model for technical analysis
    vectorModel: openai("gpt-4o-mini"), // Embeddings model
    
    // Enhanced model settings
    modelSettings: {
        temperature: 0.7,
        maxTokens: 4096,
        topP: 0.9,
    },
    
    // Logging
    logger: new Logger({ level: LogLevel.DEBUG }),
    
    // Task runner for concurrent operations
    taskRunner: new TaskRunner(5), // Allow 5 concurrent tasks
    
    // Extensions
    extensions: [gmx],
    
    // Memory
    memory: supabaseMemory,
    
    // Training data export
    exportTrainingData: true,
    trainingDataPath: "./training/successful-trades",
    
    // Streaming disabled for stability
    streaming: false,
});

console.log("✅ Enhanced agent created successfully!");

// Start the agent with GMX context arguments
await agent.start({
    instructions: vega_template,
    currentTask: "Trading cycle initiated",
    lastResult: "Trading cycle initiated",
    positions: await get_positions_str(sdk),
    portfolio: await get_portfolio_balance_str(sdk),
    markets: await get_btc_eth_markets_str(sdk),
    tokens: await get_tokens_data_str(sdk),
    volumes: await get_daily_volumes_str(sdk),
    orders: await get_orders_str(sdk),
    trading_history: await get_trading_history_str(sdk),
    synth_btc_predictions: await get_synth_predictions_consolidated_str('BTC'),
    synth_eth_predictions: await get_synth_predictions_consolidated_str('ETH'),
    btc_technical_analysis: await get_technical_analysis_str(sdk, 'BTC'),
    eth_technical_analysis: await get_technical_analysis_str(sdk, 'ETH'),
});

console.log("🎯 Enhanced Vega is now live with advanced features!");
console.log("📊 Features enabled:");
console.log("  ✅ Concurrent task execution");
console.log("  ✅ Trade validation evaluators");
console.log("  ✅ Event-driven notifications");
console.log("  ✅ Working memory optimization");
console.log("  ✅ Episodic learning");
console.log("  ✅ Service lifecycle management");
console.log("  ✅ Multi-model support");
console.log("  ✅ Training data export");

// Set up graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n🛑 Shutting down gracefully...');
    
    // Export training data before shutdown
    if (agent.exportAllTrainingData) {
        console.log('📊 Exporting training data...');
        await agent.exportAllTrainingData();
    }
    
    // Stop the agent
    await agent.stop();
    console.log('✅ Agent stopped successfully');
    
    // Cleanup Discord
    if (discordClient) {
        console.log('🔌 Disconnecting Discord...');
        discordClient.destroy();
    }
    
    process.exit(0);
});

// Monitor performance every 5 minutes
setInterval(async () => {
    const memory = await agent.getContext({
        context: gmxContext,
        args: {}
    });
    
    if (memory?.memory) {
        const enhancedMem = memory.memory as EnhancedGmxMemory;
        console.log("\n📈 Performance Metrics:");
        console.log(`  Total Trades: ${enhancedMem.totalTrades}`);
        console.log(`  Win Rate: ${enhancedMem.totalTrades > 0 ? (enhancedMem.winningTrades / enhancedMem.totalTrades * 100).toFixed(2) : 0}%`);
        console.log(`  Total Profit: $${enhancedMem.totalProfitUSD.toFixed(2)}`);
        console.log(`  Current Drawdown: ${(enhancedMem.currentDrawdown * 100).toFixed(2)}%`);
    }
}, 300000); // Every 5 minutes