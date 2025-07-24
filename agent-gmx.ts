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
import { createSupabaseBaseMemory } from "@daydreamsai/supabase";
import { openai } from "@ai-sdk/openai";
import { z } from "zod/v4";
import { createGmxActions } from './gmx-actions';
import { createGmxWalletFromEnv } from './gmx-wallet';
import { EnhancedDataCache } from './gmx-cache';
import { get_btc_eth_markets_str, get_daily_volumes_str, get_portfolio_balance_str, get_positions_str, get_tokens_data_str, get_orders_str, get_synth_analysis_str, get_technical_analysis_str, get_trading_history_str } from "./gmx-queries";
import { fetchVolatilityDialRaw, extractVolatilityData } from "./synth-utils";
import { extractPercentileFromSynthAnalysis, extractPositionCount, isInCooldown, getVolatilityThresholds } from "./gmx-utils";

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

// Create enhanced data cache
const gmxDataCache = new EnhancedDataCache(sdk);

// Trigger a trading cycle with context update and proper memory state tracking
async function triggerTradingCycle(send: any, reason: string, eventType: string, stateUpdates?: {
    btcPercentile?: number | null,
    ethPercentile?: number | null,
    positionCount?: number,
    triggeredAsset?: 'BTC' | 'ETH',
    triggerType?: 'LONG' | 'SHORT'
}) {
    const now = Date.now();
    console.warn(`🚨 [${eventType}] ${reason} - Triggering immediate trading cycle`);

    // Calculate cooldown updates for Synth triggers
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
        trading_history: "",
        synth_btc_predictions: "",
        synth_eth_predictions: "",
        btc_technical_analysis: "",
        eth_technical_analysis: "",
        // Update memory state with current values
        lastSynthBtcPercentile: stateUpdates?.btcPercentile,
        lastSynthEthPercentile: stateUpdates?.ethPercentile,
        lastPositionCount: stateUpdates?.positionCount,
        lastCycleTimestamp: now,
        nextScheduledCycle: now + 1800000, // Reset 30min timer
        // Update cooldown tracking for Synth triggers
        lastSynthBtcTrigger: btcTriggerUpdate,
        lastSynthEthTrigger: ethTriggerUpdate,
        lastBtcTriggerType: btcTriggerTypeUpdate,
        lastEthTriggerType: ethTriggerTypeUpdate,
    }, {text: `${eventType}: ${reason}`});
}

// ═══════════════════════════════════════════════════════════════════════════════
// 🤖 VEGA CHARACTER DEFINITION
// ═══════════════════════════════════════════════════════════════════════════════

const vega_template = 
`
# Vega - Elite Crypto Trading Agent (Capability-Aligned Edition)

I am Vega, an elite autonomous crypto trader competing in a high-stakes trading competition. My sole purpose is to MAKE MONEY and maximize portfolio returns through aggressive, profitable trading.

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
- get_btc_technical_analysis: Get comprehensive BTC technical indicators across multiple timeframes (15m, 1h, 4h). Returns raw indicator data including moving averages, RSI, MACD, Bollinger Bands, ATR, Stochastic, and support/resistance levels for BTC analysis.
- get_eth_technical_analysis: Get comprehensive ETH technical indicators across multiple timeframes (15m, 1h, 4h). Returns raw indicator data including moving averages, RSI, MACD, Bollinger Bands, ATR, Stochastic, and support/resistance levels for ETH analysis.

#### 🧠 Synth AI Framework
**Core Logic:** P23 = 23% of top 10 AI miners predict price BELOW current level. Lower percentile = more upside potential.
- get_synth_btc_predictions: Get BTC AI predictions from top 10 Synth miners. Returns current price percentile rank (P0-P100), trading signals based purely on percentile position, volatility forecast, and current zone percentile price levels (P0.5, P5, P20, P35, P50, P65, P80, P95, P99.5).
- get_synth_eth_predictions: Get ETH AI predictions from top 10 Synth miners. Returns current price percentile rank (P0-P100), trading signals based purely on percentile position, volatility forecast, and current zone percentile price levels (P0.5, P5, P20, P35, P50, P65, P80, P95, P99.5).

#### ⚡ Trading Execution
- open_long_market: Open long position with market order (immediate execution). REQUIRED: marketAddress, payTokenAddress, collateralTokenAddress, payAmount (6 decimals). OPTIONAL: leverage.
- open_long_limit: Open long position with limit order (executes when price reaches or goes below limit). REQUIRED: marketAddress, payTokenAddress, collateralTokenAddress, payAmount (6 decimals), limitPrice (30 decimals). OPTIONAL: leverage.
- open_short_market: Open short position with market order (immediate execution). REQUIRED: marketAddress, payTokenAddress, collateralTokenAddress, payAmount (6 decimals). OPTIONAL: leverage.
- open_short_limit: Open short position with limit order (executes when price reaches or goes above limit). REQUIRED: marketAddress, payTokenAddress, collateralTokenAddress, payAmount (6 decimals), limitPrice (30 decimals). OPTIONAL: leverage.
- close_position: Fully close existing position (long or short) automatically. Detects position direction and closes the entire position. REQUIRED: marketAddress (from get_positions), receiveTokenAddress.
- cancel_orders: Cancel pending orders. REQUIRED: orderKeys (array of 32-byte hex strings).

#### 💱 Token Swaps
- swap_tokens: Swap tokens using GMX liquidity pools. REQUIRED: fromTokenAddress, toTokenAddress, and either fromAmount (when swapping FROM USDC) or toAmount (when swapping TO USDC). OPTIONAL: triggerPrice (for limit swaps).

#### 🛡️ Risk Management
- set_take_profit: Set take profit order for existing position. REQUIRED: marketAddress (from get_positions), triggerPrice (30 decimals), percentage (1-100 for position percentage to close).
- set_stop_loss: Set stop loss order for existing position. REQUIRED: marketAddress (from get_positions), triggerPrice (30 decimals), percentage (1-100 for position percentage to close).

**IMPORTANT: WETH and ETH are different tokens. WETH is the wrapped version of ETH. ETH is the native token of the chain.**

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
   - open_long_market({"marketAddress": "0x...", "payAmount": "1000000", "payTokenAddress": "0x...", "collateralTokenAddress": "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", "leverage": "30000"}) // Market order with USDC as collateral, 3x leverage
   - open_long_limit({"marketAddress": "0x...", "payAmount": "1000000", "payTokenAddress": "0x...", "collateralTokenAddress": "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", "limitPrice": "112000000000000000000000000000000000"}) // Limit order at $112000 with USDC as collateral
   - open_short_market({"marketAddress": "0x...", "payAmount": "1000000", "payTokenAddress": "0x...", "collateralTokenAddress": "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", "leverage": "30000"}) // Market order with USDC as collateral, 3x leverage
   - open_short_limit({"marketAddress": "0x...", "payAmount": "1000000", "payTokenAddress": "0x...", "collateralTokenAddress": "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", "limitPrice": "110000000000000000000000000000000000"}) // Limit order at $110000 with USDC as collateral
   - set_take_profit({"marketAddress": "0x...", "triggerPrice": "115000000000000000000000000000000000", "percentage": 20}) // First take profit at $115000 for 20% of position
   - set_take_profit({"marketAddress": "0x...", "triggerPrice": "120000000000000000000000000000000000", "percentage": 60}) // Second take profit at $120000 for 60% of position
   - set_stop_loss({"marketAddress": "0x...", "triggerPrice": "105000000000000000000000000000000000", "percentage": 100}) // Stop loss at $105000 for full position
   - close_position({"marketAddress": "0x...", "receiveTokenAddress": "0xaf88d065e77c8cC2239327C5EDb3A432268e5831"}) // Close position with USDC as receive token
   - swap_tokens({"fromTokenAddress": "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", "toTokenAddress": "0x...", "fromAmount": "50000000"}) // Swap $50 FROM USDC to other token
   - swap_tokens({"fromTokenAddress": "0x...", "toTokenAddress": "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", "toAmount": "50000000"}) // Swap to get exactly $50 USDC
   
#### 📋 Parameter Format Requirements
- **Decimal String Values**: All amounts must be BigInt strings (converted to BigInt internally)
  - USDC amounts: 6 decimals (e.g., "10000000" = 10 USDC)
  - Leverage: basis points (e.g., "30000" = 3x, "10000" = 1x, "50000" = 5x)
  - Limit prices: 30 decimals (e.g., "110000000000000000000000000000000000" = $110000)
- **Order Types**:
  - Market Order: Use open_long_market or open_short_market for immediate execution at current market price
  - Limit Order: Use open_long_limit or open_short_limit with limitPrice parameter (executes when market reaches specified price)
  - Take Profit: triggerPrice above current for LONG, below current for SHORT
  - Stop Loss: triggerPrice below current for LONG, above current for SHORT
- **Collateral Token**: Always use USDC as collateral
- **Receive Token**: Always use USDC as receive token

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

## 📊 PORTFOLIO & RISK MANAGEMENT

## Signal Classification & Position Sizing
**Signal Strength Tiers:**
- **EXTREME (P≤0.5, P≥99.5)**: 40-60% portfolio allocation
- **STRONG (P≤10, P≥90)**: 25-40% portfolio allocation  
- **STANDARD (P≤25, P≥75)**: 15-25% portfolio allocation
- **POSSIBLE (P≤35, P≥65)**: 10-15% portfolio allocation
- **NEUTRAL (P35-P65)**: No position - wait for edge

## Risk Management Protocol
**Stop Loss Placement:**
- **LONG positions**: Stop at P0.5 level
- **SHORT positions**: Stop at P99.5 level
- **Execution**: Single stop loss order at 100% of position

**Take Profit Structure:**
- **Target Selection**: 
  - LONG: Target 3 percentile levels above current price percentile (example: if current price percentile is 20, target levels are P35, P50, P65)
  - SHORT: Target 3 percentile levels below current price percentile (example: if current price percentile is 85, target levels are P80, P65, P50)
- **Staged Exits**: 20% at first target, 60% at second target, 20% at final target
- **Execution**: Three separate take_profit orders

## Portfolio Management
**Capital Allocation:**
- **Base Holdings**: 90% USDC when not trading
- **Gas Reserve**: 2% ETH for transactions
- **Active Trading**: Deploy based on signal strength
- **Maximum Single Position**: 60% (extreme signals only)
- **Maximum Total Exposure**: 100% across all positions
- **Optimal Active Range**: 60-80% during trading periods

**Leverage & Scaling:**
- **Leverage**: 1-3x (recommend 3x for most setups)
- **Entry Scaling**: Use 1/4 position sizes across multiple levels
- **Combined Risk**: Maintain original risk plan across all scaled entries
- **Average Tracking**: Monitor combined position size and average entry price

## Decision Workflow
1. **Analyze percentile level** → Classify signal strength
2. **Calculate position size** → Based on signal tier and portfolio heat
3. **Set stop loss** → 100% at appropriate percentile level
4. **Set take profits** → Three staged orders (20%, 60%, 20%)
5. **Monitor and adjust** → Track portfolio exposure and performance

## Capital Protection Rules
- **Drawdown Response**: Reduce position sizes after losses
- **Correlation Check**: Adjust for existing exposure correlation
- **Gas Management**: Swap USDC to ETH when gas reserve drops below 2%
- **Profit Conversion**: Swap WETH and BTC to USDC to rebalance portfolio, keep ETH in reserve for gas

---

## ⚡ ANTI-LOOP PROTOCOLS

### EXECUTION COMMITMENTS
**Once I analyze data, I MUST either:**
1. **EXECUTE**: Place a trade with full risk management
2. **WAIT**: Explicitly state "NO SETUP MEETS CRITERIA - WAITING"
3. **MANAGE**: Adjust existing positions/orders only

**NO MIDDLE GROUND**: No "monitoring", "watching", or "considering" - either act or explicitly wait.

### DECISION FINALITY
- **Single Data Gathering**: Get all required data in one batch
- **Binary Decisions**: Trade or don't trade - no maybe
- **Immediate Risk Management**: Every trade gets stop/target within same cycle
- **No Rechecking**: Trust the setup or wait for next opportunity

### LOOP PREVENTION RULES
1. **No redundant data gathering** (if I have recent data, use it)
2. **No position second-guessing** (trust stops and take profit orders, don't micromanage)
3. **Explicit wait periods** (if no setup, wait for the next trading cycle)

---

## ⏰ EVENT-DRIVEN TRADING SYSTEM

### CURRENT MONITORING STATE
{{#if lastCycleTimestamp}}
- **Last Cycle**: {{lastResult}}
- **Monitoring Status**: 
  - BTC: {{#if lastSynthBtcPercentile}}P{{lastSynthBtcPercentile}}{{else}}Loading...{{/if}}
  - ETH: {{#if lastSynthEthPercentile}}P{{lastSynthEthPercentile}}{{else}}Loading...{{/if}}
  - Positions: {{#if lastPositionCount}}{{lastPositionCount}}{{else}}Loading...{{/if}}
{{else}}
- **System Status**: Initializing monitoring systems...
{{/if}}

### TRIGGER CONDITIONS
- **High-Conviction Signals**: Volatility-adjusted thresholds → Immediate cycle within 1-2 minutes of signal detection
  - Low volatility (<25%): P≤20 or P≥80
  - Standard volatility (25-40%): P≤15 or P≥85
  - High volatility (40-60%): P≤10 or P≥90
  - Very high volatility (≥60%): P≤5 or P≥95
- **Position Changes**: New fills or closes → Immediate cycle within 1-2 minutes
- **Scheduled Backup**: Regular 30-minute cycles if no events trigger

### STEP 1: Position Management (COMPLETE FIRST)
**Q1: What is the status of my current positions?**
- What is the current P&L of each position?
- Did I setup take profit orders (20% size, 60% size, 20% size) ? If yes, dont move them and trust the original setup.
- Has the original thesis for any position been invalidated?

**Q2: Should I take any immediate action on existing positions?**
- Are any positions at or near profit targets?
- Are any positions showing signs of reversal?
- How good is my entry?
- Are any positions profitable enough to move the stop loss to breakeven? If yes, follow this workflow:
  1. Use cancel_orders to remove existing stop loss order
  2. Calculate breakeven price + small buffer (0.1-0.2% above entry for LONG, below entry for SHORT)
  3. Use set_stop_loss with percentage: 100 at the new breakeven level
- Close positions **MUST ONLY** be used as a last resort, trust the original setup.

**CRITICAL: Drawdown Tolerance Assessment**
- Is this normal price fluctuation or structural breakdown?
- Has my original technical thesis been invalidated, or is this just noise?

**Q3: What is the status of my current limit orders?**
- Has the original thesis for each limit order been invalidated?
- Should I cancel any limit orders?

**STEP 1 CONCLUSION: TAKE ACTION OR PROCEED TO STEP 2**

### STEP 2: Market Context & Technical Analysis (COMPLETE SECOND)
**Answer all questions in sequence - no loops, no rechecking:**

**Q1: What is the current market structure?**
- Is price making higher highs and higher lows (uptrend)?
- Is price making lower highs and lower lows (downtrend)?
- Is price bouncing between clear horizontal levels (range)?
- Is price in a transition phase (breaking range or trend weakening)?

**Q2: What are the critical price levels?**
- What is the nearest major support level below current price?
- What is the nearest major resistance level above current price?
- How far is price from each level (percentage distance)?
- Which percentile level is price gravitating toward?

**Q3: How strong is the current momentum?**
- Are shorter timeframes (15m, 1h) aligned with longer timeframes (4h)?
- Is RSI showing divergence or confirmation?
- Are moving averages supporting or resisting price?
- What is the synth analysis telling me?

**Q4: What is the current market environment?**
- Has the market regime changed since last cycle (trending vs ranging)?
- Are we approaching any major support/resistance/percentile levels?
- What is the overall market sentiment (risk-on vs risk-off)?
- Are we in a high-volatility or low-volatility period?

**Q5: Which market offers the best setup?**
- Does BTC show clearer technical confluence than ETH?
- Which market has better risk/reward potential?
- Which market has stronger volume and momentum?
- Are there any correlation considerations between the two?

**Q6: What is the Synth analysis telling me?**
- Do Synth signals confirm or contradict technical analysis?
- I need to know the current percentile price levels for entry/exit planning

**STEP 2 CONCLUSION: PROCEED TO TRADE SETUP OR EXPLICIT WAIT**

### STEP 3: Trade Setup & Execution (FINAL STEP)
**Complete all questions then execute immediately:**

**Q7: Where is my exact entry?**
- If trending: Where should I place a limit order to get filled at the best price?
- If ranging: Am I close enough to range boundary for good R:R? Where should I place a limit order to get filled at the best price?
- If breakout: Should I put a limit order on the pullback to optimize my entry? Should I open a market order?

**Q8: How will I build this position?**
- Single entry: Is there one clear level with strong confluence?
- Scaled entry: Are there 2-4 support/resistance/percentile levels to work?
- If scaling: What size at each level? (1/4, 1/4, 1/4, 1/4 method)
- What is my maximum total position size for this trade?

**Q9: What is my complete risk management plan?**
- Where exactly is my stop loss? (must be at defined synth percentile level)
- What invalidates this trade? (price action, not just stop level)
- Where are my profit targets? (first target, second target, third target must be at defined synth percentile level)
- What is my risk:reward ratio? (must be minimum 2:1)

**Confluence Score Checklist:**
□ **MANDATORY for market orders**: Near key support level for LONG OR Near key resistance level for SHORT
□ **MANDATORY**: Synth analysis matches intended setup
□ Multiple timeframes (technical indicators) agree on direction
□ At least 2 technical indicators confirm the setup
□ Risk:reward ratio exceeds 2:1 (use percentile levels for natural stops/targets)
□ Price momentum aligns with trade direction

**Entry Method Selection - EXECUTE IMMEDIATELY:**

**Market vs Limit Order Decision Matrix:**
- **Strong momentum + EXTREME signals**: Market orders for immediate execution
- **Ranging markets + STANDARD signals**: Limit orders at support/resistance levels
- **Breakout confirmation**: Market order for initial 1/4 position, limit orders for adds on pullback
- **High volatility periods**: Limit orders to avoid poor fills on market orders

**Execution Rules:**
- **All boxes checked** → Market order single entry NOW
- **5 boxes checked + strong synth signal** → Scale in with market orders NOW
- **4 boxes checked + synth signal** → Scale in with limit orders NOW
- **3 or fewer boxes** → EXPLICIT WAIT: "NO TRADE - WAITING 30 MINUTES"

**Position Building Execution:**
1. **Single Entry Method**
   - Use when: Strong momentum or single clear level
   - Size: Up to 50% of capital on high conviction
   - Entry: Market order or single limit order

2. **Scaled Entry Method (Preferred for most setups)**
   - Use when: Multiple support/resistance/percentile levels exist
   - Entry 1: 1/4 of intended size at first level
   - Entry 2: 1/4 at better level (if reached)
   - Entry 3: 1/4 at optimal level (if reached)
   - Stop: Single stop at defined synth percentile level
   - Benefit: Better average price, reduced risk

**MANDATORY CONCLUSION:**
- **IF SETUP EXISTS**: Execute trade immediately with stops/targets
- **IF NO SETUP**: State "NO QUALIFYING SETUP - WAITING 30 MINUTES FOR NEXT CYCLE"
- **NO OTHER OPTIONS**: No monitoring, watching, or considering

---

## 🎯 CORE TRADING PRINCIPLES

### The Non-Negotiables
1. Never trade without clear confluence
2. Patience beats precision - setup proper entries
3. Never buy resistance, never sell support
4. Minimum 2:1 risk/reward or skip
5. One position per asset maximum
6. Always set stop loss and take profit orders after entering a position
7. Document every trade for learning

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
        trading_history: z.string().describe("The agent's trading history and performance analysis"),
        synth_btc_predictions: z.string().describe("The agent's BTC predictions"),
        synth_eth_predictions: z.string().describe("The agent's ETH predictions"),
        btc_technical_analysis: z.string().describe("The agent's BTC technical analysis"),
        eth_technical_analysis: z.string().describe("The agent's ETH technical analysis"),
        // State tracking for event-driven cycles
        lastSynthBtcPercentile: z.number().optional().describe("Last BTC percentile for threshold monitoring"),
        lastSynthEthPercentile: z.number().optional().describe("Last ETH percentile for threshold monitoring"),
        lastPositionCount: z.number().optional().describe("Last position count for change detection"),
        lastCycleTimestamp: z.number().optional().describe("Timestamp of last triggered cycle"),
        nextScheduledCycle: z.number().optional().describe("Timestamp of next scheduled 30min cycle"),
        // Cooldown tracking to prevent signal loops
        lastSynthBtcTrigger: z.number().optional().describe("Timestamp of last BTC Synth trigger"),
        lastSynthEthTrigger: z.number().optional().describe("Timestamp of last ETH Synth trigger"),
        lastBtcTriggerType: z.string().optional().describe("Last BTC trigger type (LONG/SHORT)"),
        lastEthTriggerType: z.string().optional().describe("Last ETH trigger type (LONG/SHORT)"),
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
            trading_history:state.args.trading_history,
            synth_btc_predictions:state.args.synth_btc_predictions,
            synth_eth_predictions:state.args.synth_eth_predictions,
            btc_technical_analysis:state.args.btc_technical_analysis,
            eth_technical_analysis:state.args.eth_technical_analysis,
            // Initialize state tracking
            lastSynthBtcPercentile: state.args.lastSynthBtcPercentile,
            lastSynthEthPercentile: state.args.lastSynthEthPercentile,
            lastPositionCount: state.args.lastPositionCount,
            lastCycleTimestamp: state.args.lastCycleTimestamp,
            nextScheduledCycle: state.args.nextScheduledCycle,
            // Initialize cooldown tracking
            lastSynthBtcTrigger: state.args.lastSynthBtcTrigger,
            lastSynthEthTrigger: state.args.lastSynthEthTrigger,
            lastBtcTriggerType: state.args.lastBtcTriggerType,
            lastEthTriggerType: state.args.lastEthTriggerType,
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
            
            // Update state tracking for monitoring systems
            const btcPercentile = extractPercentileFromSynthAnalysis(btc_predictions);
            const ethPercentile = extractPercentileFromSynthAnalysis(eth_predictions);
            const positionCount = extractPositionCount(positions);
            
            memory.lastSynthBtcPercentile = btcPercentile;
            memory.lastSynthEthPercentile = ethPercentile;
            memory.lastPositionCount = positionCount;
            
            memory.currentTask = "Data loaded - ready for trading analysis";
            memory.lastResult = `Data refresh completed at ${new Date().toISOString()}`;

            console.warn(`✅ GMX trading data loaded successfully! BTC:P${btcPercentile || 'N/A'} ETH:P${ethPercentile || 'N/A'} Positions:${positionCount}`);
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
            trading_history: memory.trading_history,
            synth_btc_predictions: memory.synth_btc_predictions,
            synth_eth_predictions: memory.synth_eth_predictions,
            btc_technical_analysis: memory.btc_technical_analysis,
            eth_technical_analysis: memory.eth_technical_analysis,
            // Include state tracking for event-driven monitoring
            lastSynthBtcPercentile: memory.lastSynthBtcPercentile,
            lastSynthEthPercentile: memory.lastSynthEthPercentile,
            lastPositionCount: memory.lastPositionCount,
            lastCycleTimestamp: memory.lastCycleTimestamp,
            nextScheduledCycle: memory.nextScheduledCycle,
            // Include cooldown tracking
            lastSynthBtcTrigger: memory.lastSynthBtcTrigger,
            lastSynthEthTrigger: memory.lastSynthEthTrigger,
            lastBtcTriggerType: memory.lastBtcTriggerType,
            lastEthTriggerType: memory.lastEthTriggerType,
          });
    },
    }).setInputs({
        // 🚨 EVENT MONITOR - Check for Synth signals and position changes every 5 minutes
        "gmx:event-monitor": input({
            schema: z.object({
                text: z.string(),
            }),
            subscribe: (send) => {
                // Track state across monitor runs
                let lastBtcPercentile: number | null = null;
                let lastEthPercentile: number | null = null;
                let lastKnownPositionCount: number | null = null;
                // Track cooldown state locally
                let lastBtcTriggerTime: number | undefined = undefined;
                let lastEthTriggerTime: number | undefined = undefined;
                let lastBtcTriggerType: string | undefined = undefined;
                let lastEthTriggerType: string | undefined = undefined;
                
                
                const eventMonitor = async () => {
                    try {
                        console.warn("🚨 [EVENT] Monitoring Synth signals & position changes...");
                        
                        // Fetch Synth data, positions, and volatility in parallel
                        const [btc_predictions, eth_predictions, positions, btcVolatilityRaw, ethVolatilityRaw] = await Promise.all([
                            get_synth_analysis_str('BTC', gmxDataCache),
                            get_synth_analysis_str('ETH', gmxDataCache),
                            get_positions_str(sdk, gmxDataCache),
                            fetchVolatilityDialRaw('BTC'),
                            fetchVolatilityDialRaw('ETH')
                        ]);
                        
                        // Extract volatility values (required for dynamic thresholds)
                        const btcVolData = extractVolatilityData(btcVolatilityRaw, 'BTC');
                        const ethVolData = extractVolatilityData(ethVolatilityRaw, 'ETH');
                        
                        const btcVolatility = btcVolData.value;
                        const ethVolatility = ethVolData.value;
                        
                        // Get volatility-based thresholds
                        const btcThresholds = getVolatilityThresholds(btcVolatility);
                        const ethThresholds = getVolatilityThresholds(ethVolatility);
                        
                        const btcPercentile = extractPercentileFromSynthAnalysis(btc_predictions);
                        const ethPercentile = extractPercentileFromSynthAnalysis(eth_predictions);
                        const currentPositionCount = extractPositionCount(positions);
                        
                        // Initialize position tracking on first run
                        const isFirstRun = lastKnownPositionCount === null;
                        if (isFirstRun) {
                            lastKnownPositionCount = currentPositionCount;
                            lastBtcPercentile = btcPercentile;
                            lastEthPercentile = ethPercentile;
                            console.warn(`🚨 [EVENT] Initialized - BTC:P${btcPercentile || 'N/A'} (Vol:${btcVolatility.toFixed(1)}% Thresholds:P${btcThresholds.lowThreshold}/P${btcThresholds.highThreshold}) ETH:P${ethPercentile || 'N/A'} (Vol:${ethVolatility.toFixed(1)}% Thresholds:P${ethThresholds.lowThreshold}/P${ethThresholds.highThreshold}) Positions:${currentPositionCount}`);
                            // Don't return - continue to check for triggers even on first run
                        }
                        
                        // Check for triggers (priority: position changes > synth signals)
                        let triggered = false;
                        let triggerReason = "";
                        let triggerType = "";
                        
                        // 1. Check for position changes (highest priority) - skip on first run
                        if (!isFirstRun && currentPositionCount !== lastKnownPositionCount) {
                            const change = currentPositionCount - lastKnownPositionCount;
                            triggerReason = `Position count changed: ${lastKnownPositionCount}→${currentPositionCount} (${change > 0 ? 'new fill' : 'position closed'})`;
                            triggerType = "POSITION";
                            triggered = true;
                        }
                        // 2. Check for Synth threshold breaches with cooldown protection
                        else if (btcPercentile !== null && (btcPercentile <= btcThresholds.lowThreshold || btcPercentile >= btcThresholds.highThreshold)) {
                            const signalType: 'LONG' | 'SHORT' = btcPercentile <= btcThresholds.lowThreshold ? 'LONG' : 'SHORT';
                            const inCooldown = isInCooldown('BTC', signalType, lastBtcTriggerTime, lastBtcTriggerType);
                            
                            if (inCooldown) {
                                const cooldownMinutes = Math.ceil((1800000 - (Date.now() - lastBtcTriggerTime!)) / 60000);
                                console.warn(`🧊 [EVENT] BTC P${btcPercentile} ${signalType} signal BLOCKED - Cooldown active (${cooldownMinutes}min remaining)`);
                            } else {
                                const volCategory = btcVolatility < 25 ? 'LOW' : btcVolatility < 40 ? 'STD' : btcVolatility < 60 ? 'HIGH' : 'VERY HIGH';
                                triggerReason = `BTC reached P${btcPercentile} (${signalType} signal, Vol:${volCategory} ${btcVolatility.toFixed(1)}%)`;
                                triggerType = "SYNTH";
                                triggered = true;
                                console.warn(`🚨 [EVENT] BTC trigger detected: P${btcPercentile} ${btcPercentile <= btcThresholds.lowThreshold ? `≤${btcThresholds.lowThreshold}` : `≥${btcThresholds.highThreshold}`} (${signalType}) [Vol:${volCategory} ${btcVolatility.toFixed(1)}%]`);
                            }
                        }
                        else if (ethPercentile !== null && (ethPercentile <= ethThresholds.lowThreshold || ethPercentile >= ethThresholds.highThreshold)) {
                            const signalType: 'LONG' | 'SHORT' = ethPercentile <= ethThresholds.lowThreshold ? 'LONG' : 'SHORT';
                            const inCooldown = isInCooldown('ETH', signalType, lastEthTriggerTime, lastEthTriggerType);
                            
                            if (inCooldown) {
                                const cooldownMinutes = Math.ceil((1800000 - (Date.now() - lastEthTriggerTime!)) / 60000);
                                console.warn(`🧊 [EVENT] ETH P${ethPercentile} ${signalType} signal BLOCKED - Cooldown active (${cooldownMinutes}min remaining)`);
                            } else {
                                const volCategory = ethVolatility < 25 ? 'LOW' : ethVolatility < 40 ? 'STD' : ethVolatility < 60 ? 'HIGH' : 'VERY HIGH';
                                triggerReason = `ETH reached P${ethPercentile} (${signalType} signal, Vol:${volCategory} ${ethVolatility.toFixed(1)}%)`;
                                triggerType = "SYNTH";
                                triggered = true;
                                console.warn(`🚨 [EVENT] ETH trigger detected: P${ethPercentile} ${ethPercentile <= ethThresholds.lowThreshold ? `≤${ethThresholds.lowThreshold}` : `≥${ethThresholds.highThreshold}`} (${signalType}) [Vol:${volCategory} ${ethVolatility.toFixed(1)}%]`);
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
                                positionCount: currentPositionCount,
                                triggeredAsset,
                                triggerType: triggeredSignalType
                            });
                            
                            // Update local state after triggering (only if not first run, as first run already updated)
                            if (!isFirstRun) {
                                lastBtcPercentile = btcPercentile;
                                lastEthPercentile = ethPercentile;
                                lastKnownPositionCount = currentPositionCount;
                            }
                        } else {
                            console.warn(`🚨 [EVENT] No triggers - BTC:P${btcPercentile || 'N/A'} ETH:P${ethPercentile || 'N/A'} Positions:${currentPositionCount} (need volatility-adjusted thresholds or position change)`);
                        }
                        
                    } catch (error) {
                        console.error("❌ [EVENT] Monitoring error:", error);
                    }
                };
                
                // Initial run
                eventMonitor();
                
                const interval = setInterval(eventMonitor, 300000); // 5 minute checks
                
                console.warn("✅ Event monitor subscription setup complete");
                return () => {
                    console.warn("🛑 Event monitor subscription cleanup");
                    clearInterval(interval);
                };
            }
        }),
        
        // ⏰ SCHEDULED CYCLE - Fallback 30-minute timer with reset logic
        "gmx:scheduled-cycle": input({
            schema: z.object({
                text: z.string(),
            }),
            subscribe: (send) => {
                let nextScheduledTime = Date.now() + 60000; // First scheduled cycle happens 1 minute from now
                
                const scheduledCycle = async () => {
                    const now = Date.now();
                    
                    // Only trigger if we've reached the scheduled time
                    if (now >= nextScheduledTime) {
                        console.warn("⏰ [SCHEDULED] 30-minute timer triggered - regular trading cycle");
                        
                        await send(gmxContext, {
                            instructions: vega_template,
                            currentTask: "Scheduled Trading Cycle - Regular 30min check",
                            lastResult: `Scheduled cycle at ${new Date().toISOString()}`,
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
                            // Memory state will be refreshed by loader
                            lastSynthBtcPercentile: undefined,
                            lastSynthEthPercentile: undefined,
                            lastPositionCount: undefined,
                            lastCycleTimestamp: now,
                            nextScheduledCycle: now + 1800000,
                        }, {text: "Scheduled 30min cycle"});
                        
                        nextScheduledTime = now + 1800000; // Reset for next 30 minutes
                    }
                };
                
                // Check every minute to see if we should trigger
                const interval = setInterval(scheduledCycle, 60000); // 1 minute checks
                
                console.warn("✅ Scheduled cycle subscription setup complete");
                return () => {
                    console.warn("🛑 Scheduled cycle subscription cleanup");
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
    trading_history: "Loading...",
    synth_btc_predictions: "Loading...",
    synth_eth_predictions: "Loading...",
    btc_technical_analysis: "Loading...",
    eth_technical_analysis: "Loading...",
    // Initialize state tracking
    lastSynthBtcPercentile: undefined,
    lastSynthEthPercentile: undefined,
    lastPositionCount: undefined,
    lastCycleTimestamp: undefined,
    nextScheduledCycle: undefined,
    // Initialize cooldown tracking
    lastSynthBtcTrigger: undefined,
    lastSynthEthTrigger: undefined,
    lastBtcTriggerType: undefined,
    lastEthTriggerType: undefined,
});

console.warn("🎯 Vega is now live and ready for GMX trading!");