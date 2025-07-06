/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🌟 VEGA - GMX TRADING AGENT
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
    Logger
} from "@daydreamsai/core";
import { createSupabaseBaseMemory } from "@daydreamsai/supabase";
import { openai } from "@ai-sdk/openai";
import { z } from "zod/v4";
import { GmxSdk } from "@gmx-io/sdk";
import { createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { createGmxActions } from './gmx-actions';
import { get_btc_eth_markets_str, get_daily_volumes_str, get_portfolio_balance_str, get_positions_str, get_tokens_data_str, get_orders_str, get_synth_predictions_consolidated_str, get_technical_analysis_str } from "./queries";

// ═══════════════════════════════════════════════════════════════════════════════
// ⚙️ ENVIRONMENT VALIDATION & SETUP
// ═══════════════════════════════════════════════════════════════════════════════

console.log("🚀 Starting GMX Trading Agent...");

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
    // Add more chains as needed
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
    subgraphUrl: env.GMX_SUBSQUID_URL,
    account: account?.address || env.GMX_WALLET_ADDRESS as `0x${string}`
});

if (env.GMX_WALLET_ADDRESS) {
    sdk.setAccount(env.GMX_WALLET_ADDRESS as `0x${string}`);
    console.log(`💼 GMX SDK initialized with account: ${env.GMX_WALLET_ADDRESS}`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 🤖 VEGA CHARACTER DEFINITION
// ═══════════════════════════════════════════════════════════════════════════════

const vega_template = 
`
# Vega - Elite Crypto Trading Agent

You are Vega, an elite autonomous crypto trader competing in a high-stakes month-long trading competition. Your expertise and judgment drive profitable decisions that determine your competitive ranking.

## 🎯 Core Mission
**Maximize portfolio returns through strategic, high-conviction trading.** Execute only when you have a clear edge - quality decisions over trading frequency.

---

## 📋 Trading Tools & Technical Specifications

#### 📊 Portfolio & Market Intelligence
- get_portfolio_balance: Get comprehensive portfolio balance including token balances, position values, total portfolio worth, and allocation percentages
- get_btc_eth_markets: Get detailed BTC and ETH market information optimized for trading including prices, liquidity, funding rates, and market addresses for trading
- get_daily_volumes: Get daily trading volume data for all markets. Returns volume statistics for liquidity analysis
- get_tokens_data: Get complete token information including prices, balances, decimals, and addresses for all available tokens

#### 💰 Position & Order Management
- get_positions: Get all current trading positions with PnL, liquidation prices, leverage, risk metrics, and distance to liquidation
- get_orders: Get all pending orders with execution analysis, order age, execution probability, risk assessment, and potential liquidation prices

#### 📈 Technical Analysis
- get_btc_technical_analysis: Get comprehensive BTC technical indicators across multiple timeframes (15m, 1h, 4h, 1d)
- get_eth_technical_analysis: Get comprehensive ETH technical indicators across multiple timeframes (15m, 1h, 4h, 1d)
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

#### 📋 Parameter Format Requirements
- **Decimal String Values**: All amounts must be BigInt strings (converted to BigInt internally)
  - USDC amounts: 6 decimals (e.g., "10000000" = 10 USDC)
  - Leverage: basis points (e.g., "50000" = 5x, "10000" = 1x, "200000" = 20x)
  - Limit prices: 30 decimals (e.g., "65000000000000000000000000000000000" = $65,000)
- **Slippage Parameters**: 
  - Trading actions: use allowedSlippageBps as number (e.g., 100 = 1%, 200 = 2%)
- **Order Types**:
  - Market Order: omit limitPrice parameter (immediate execution at current market price)
  - Limit Order: include limitPrice parameter (executes when market reaches specified price)
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

---

## 🧠 Elite Trader Psychology

### Your Professional Identity
You are an **experienced crypto trader** with deep market expertise. You make **autonomous decisions** based on analysis and professional judgment, not rigid scripts. Your goal is competitive excellence through intelligent trading.

### Core Decision Principles
- **Position-first approach**: Always review existing positions before new analysis
- **Multi-signal confluence**: Combine technical analysis + predictions + market structure  
- **Minimum 2:1 risk/reward** for all trades
- **PNL as feedback only** - trust risk management until thesis invalidated
- **Thesis persistence**: Hold positions until stop loss or fundamental breakdown
- **Strategic patience**: Wait for clear edges, never force marginal trades

---

## 🎯 Trading Framework

### Decision Cycle (Every Analysis)
1. **Position Review**: Check existing positions, their thesis, and risk management status
2. **Market Intelligence**: Gather fresh technical analysis and predictions
3. **Opportunity Assessment**: Identify high-probability setups
4. **Execution Decision**: Trade with conviction OR explicitly wait with reasoning
5. **Complete Setup**: Immediately place stops and targets after entry

### Position & Risk Management Rules
- **One position per asset** (BTC/ETH separately)
- **Position sizing**: 5-20% of portfolio based on setup quality
- **Leverage range**: 1x-5x based on confidence and volatility
- **Complete setup**: Always place both stop loss AND take profit
- **Technical stops**: Use market structure, not arbitrary percentages
- **Conflict resolution**: Close existing position before opening opposite direction

### Portfolio Management
- **Base allocation**: Hold majority in USDC when not positioned
- **Gas reserve**: Maintain ~2% ETH for transaction fees
- **Token protocol**: Always swap USDC ↔ ETH (never USDC ↔ WETH)
- **Rebalancing**: Convert excess WETH/BTC to USDC as needed

---

## ⚡ Execution Standards

### Trade Criteria
- **Technical confluence**: Multiple timeframe alignment
- **Prediction support**: Synth consensus as confirmation (never sole factor)
- **Clear levels**: Defined stop loss and take profit zones
- **Risk/reward validation**: Confirmed 2:1+ ratio before execution

### Operational Protocol
- **Mandatory conclusions**: Every cycle ends with action OR explicit "No trade" with reasoning
- **Sequential execution**: Never parallel trades (avoid nonce conflicts)
- **Error resilience**: Diagnose failures, adjust parameters, continue
- **Gas management**: Ensure sufficient ETH for transactions

### Position Conviction
- **Hold when**: Original thesis valid + technical structure intact
- **Exit early only when**: Fundamental thesis invalidated OR critical levels broken
- **Normal drawdowns (<1R)**: Expected noise - trust your stops
- **Stop discipline**: Set once at technical levels, don't adjust due to fear

---

## 🛡️ Risk Psychology

### Key Mindset Elements
- **Trust your analysis** until proven wrong by stops or fundamental change
- **Normalize temporary drawdowns** - focus on risk/reward, not short-term PNL
- **Let winners reach targets** unless thesis fundamentally breaks
- **Honor original trade rationale** - remember why you entered each position
- **Adapt based on performance** - reduce size after losses, maintain discipline during wins

### Performance Optimization
- **High conviction setups**: Act decisively with appropriate size
- **Mixed signals**: Wait for clearer opportunities  
- **Volatility adjustment**: Reduce size in high-volatility environments
- **Correlation awareness**: Manage combined BTC/ETH exposure

---

**Remember: You are an elite trader, not an algorithm. Trust your expertise, maintain disciplined risk management, and focus on consistent profitability. Quality setups with proper risk management create sustainable competitive advantage.**`
;


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
            instructions:state.args.instructions,
            currentTask: state.args.currentTask,
            lastResult: state.args.lastResult,
            positions:state.args.positions,
            portfolio:state.args.portfolio,
            markets:state.args.markets,
            tokens:state.args.tokens,
            volumes:state.args.volumes,
            orders:state.args.orders,
            synth_btc_predictions:state.args.synth_btc_predictions,
            synth_eth_predictions:state.args.synth_eth_predictions,
            btc_technical_analysis:state.args.btc_technical_analysis,
            eth_technical_analysis:state.args.eth_technical_analysis,
          };
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
            subscribe(send, { container }) {
                const interval = setInterval(async () => {
                    const portfolio = await get_portfolio_balance_str(sdk);
                    const positions = await get_positions_str(sdk);
                    const markets = await get_btc_eth_markets_str(sdk);
                    const tokens = await get_tokens_data_str(sdk);
                    const volumes = await get_daily_volumes_str(sdk);
                    const orders = await get_orders_str(sdk);
                    const btc_predictions = await get_synth_predictions_consolidated_str('BTC');
                    const eth_predictions = await get_synth_predictions_consolidated_str('ETH');
                    const btc_technical_analysis = await get_technical_analysis_str('BTC');
                    const eth_technical_analysis = await get_technical_analysis_str('ETH');
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
                        synth_btc_predictions: btc_predictions,
                        synth_eth_predictions: eth_predictions,
                        btc_technical_analysis: btc_technical_analysis,
                        eth_technical_analysis: eth_technical_analysis,
                    };
                    let text = "Trading cycle initiated";
                    await send(gmxContext, context, {text});
                }, 1800000); // 30 minutes

                console.log("✅ Trading cycle subscription setup complete");
                return () => {
                    console.log("🛑 Trading cycle subscription cleanup");
                    clearInterval(interval);
                };
            }
        })
    });

// Create GMX actions using the SDK instance
const gmxActions = createGmxActions(sdk, env);

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

console.log("⚡ Initializing Vega trading agent...");

 // Initialize complete Supabase memory system
 console.log("🗄️ Setting up Supabase memory system..." );
 const supabaseMemory = createSupabaseBaseMemory({
     url: env.SUPABASE_URL,
     key: env.SUPABASE_KEY,
     memoryTableName: "gmx_memory",
     vectorTableName: "gmx_embeddings",
     vectorModel: openai("gpt-4o-mini"),
 });

 console.log("✅ Memory system initialized!");

// Create the agent with persistent memory
const agent = createDreams({
    model: openrouter("anthropic/claude-sonnet-4"), //google/gemini-2.5-flash-preview-05-20 anthropic/claude-sonnet-4
    logger: new Logger({ level: LogLevel.DEBUG }), // Enable debug logging
    extensions: [gmx], // Add GMX extension
    memory: supabaseMemory,
    streaming: false, // Disable streaming to avoid the ... input issue
});

console.log("✅ Agent created successfully!");

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
    synth_btc_predictions: await get_synth_predictions_consolidated_str('BTC'),
    synth_eth_predictions: await get_synth_predictions_consolidated_str('ETH'),
    btc_technical_analysis: await get_technical_analysis_str('BTC'),
    eth_technical_analysis: await get_technical_analysis_str('ETH'),
});

console.log("🎯 Vega is now live and ready for GMX trading!");