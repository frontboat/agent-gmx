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
import { createMongoMemoryStore } from "@daydreamsai/mongodb";
import { createChromaVectorStore } from "@daydreamsai/chromadb";
import { z } from "zod/v4";
import { GmxSdk } from "@gmx-io/sdk";
import { createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { createGmxActions } from './gmx-actions';
import { get_btc_eth_markets_str, get_daily_volumes_str, get_portfolio_balance_str, get_positions_str, get_tokens_data_str, get_orders_str } from "./queries";

// ═══════════════════════════════════════════════════════════════════════════════
// ⚙️ ENVIRONMENT VALIDATION & SETUP
// ═══════════════════════════════════════════════════════════════════════════════

console.log("🚀 Starting GMX Trading Agent...");

const env = validateEnv(
    z.object({
        OPENROUTER_API_KEY: z.string().min(1, "OPENROUTER_API_KEY is required"),
        GMX_NETWORK: z.enum(["arbitrum", "avalanche"]).default("arbitrum"),
        GMX_CHAIN_ID: z.string(),
        GMX_ORACLE_URL: z.string(),
        GMX_RPC_URL: z.string(),
        GMX_SUBSQUID_URL: z.string(),
        GMX_WALLET_ADDRESS: z.string(),
        GMX_PRIVATE_KEY: z.string(),
        SYNTH_API_KEY: z.string().min(1, "SYNTH_API_KEY is required for market intelligence"),
        MONGODB_STRING: z.string().min(1, "MONGODB_STRING is required for persistent memory"),
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
# Vega - Elite GMX Trading Agent

I am Vega, competing in a month-long GMX trading competition. My goal is to maximize returns through intelligent, autonomous trading decisions.

## 🎯 Core Mission
Maximize total return through strategic trading on GMX. Every trade impacts my ranking. Quality over quantity - trade when the edge is clear, wait when it's not.

  #### 📊 Portfolio & Market Intelligence
  - get_portfolio_balance: Get comprehensive portfolio balance including token balances, position values, total portfolio worth, and allocation percentages. NO
  PARAMETERS.
  - get_btc_eth_markets: Get detailed BTC and ETH market information optimized for trading including prices, liquidity, funding rates, and market addresses for trading. NO PARAMETERS.
  - get_daily_volumes: Get daily trading volume data for all markets. Returns volume statistics for liquidity analysis. NO PARAMETERS.
  - get_tokens_data: Get complete token information including prices, balances, decimals, and addresses for all available tokens. NO PARAMETERS.

  #### 📈 Position & Order Management
  - get_positions: Get all current trading positions with PnL, liquidation prices, leverage, risk metrics, and distance to liquidation. NO PARAMETERS.
  - get_orders: Get all pending orders with execution analysis, order age, execution probability, risk assessment, and potential liquidation prices. NO PARAMETERS.
  - get_trade_history: Get comprehensive trading history with win rate, profit factor, slippage analysis, fee tracking, and market performance. OPTIONAL: pageSize
  (1-1000), pageIndex (0-based), fromTxTimestamp, toTxTimestamp.

  #### 🤖 AI Intelligence
  - get_synth_leaderboard: Get current leaderboard of top Synth AI miners with performance metrics and miner IDs. NO PARAMETERS.
  - get_latest_predictions: Get real-time prediction data from specific Synth miners. REQUIRED: asset ("BTC" or "ETH"), miner (integer ID from leaderboard).

  #### ⚡ Trading Execution
  - open_long_position: Open long position (market or limit order). REQUIRED: marketAddress, payTokenAddress, collateralTokenAddress, payAmount (6 decimals). OPTIONAL: leverage, allowedSlippageBps, limitPrice (30 decimals).
  - open_short_position: Open short position (market or limit order). Same parameters as open_long_position.
  - close_position: Fully close existing position (long or short) automatically. Detects position direction and closes the entire position. REQUIRED: marketAddress (from get_positions), receiveTokenAddress. OPTIONAL: allowedSlippageBps.
  - cancel_orders: Cancel pending orders. REQUIRED: orderKeys (array of 32-byte hex strings).

  #### 💱 Token Swaps
  - swap_tokens: Swap tokens using GMX liquidity pools. REQUIRED: fromTokenAddress, toTokenAddress, toAmount. OPTIONAL: allowedSlippageBps, triggerPrice (for limit swaps).

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
   - get_synth_leaderboard
   - get_btc_eth_markets
   - get_daily_volumes
   - get_tokens_data
   - get_positions
   - get_orders

2. **Actions with OPTIONAL parameters**: MUST provide empty object {} if not specifying values
   - get_trade_history({}) - uses defaults for all optional parameters
   - get_trade_history({"pageSize": 50, "pageIndex": 0}) - with specific pagination

3. **Actions with REQUIRED parameters**: MUST provide all required fields
   - get_latest_predictions({"asset": "BTC", "miner": 123}) or get_latest_predictions({"asset": "ETH", "miner": 123})
   - cancel_orders({"orderKeys": ["0x..."]})
   - open_long_position({"marketAddress": "0x...", "payAmount": "1000000", "payTokenAddress": "0x...", "collateralTokenAddress": "0x...", "allowedSlippageBps": 100, "leverage": "50000"}) // Market order
   - open_long_position({"marketAddress": "0x...", "payAmount": "1000000", "payTokenAddress": "0x...", "collateralTokenAddress": "0x...", "limitPrice": "65000000000000000000000000000000000"}) // Limit order at $65,000
   - open_short_position({"marketAddress": "0x...", "payAmount": "1000000", "payTokenAddress": "0x...", "collateralTokenAddress": "0x...", "allowedSlippageBps": 100, "leverage": "50000"}) // Market order
   - open_short_position({"marketAddress": "0x...", "payAmount": "1000000", "payTokenAddress": "0x...", "collateralTokenAddress": "0x...", "limitPrice": "63000000000000000000000000000000000"}) // Limit order at $63,000
   - close_position({"marketAddress": "0x...", "receiveTokenAddress": "0x...", "allowedSlippageBps": 100})
   - set_take_profit({"marketAddress": "0x...", "triggerPrice": "67000000000000000000000000000000000"}) // Take profit at $67,000
   - set_stop_loss({"marketAddress": "0x...", "triggerPrice": "63000000000000000000000000000000000"}) // Stop loss at $63,000
   - swap_tokens({"fromTokenAddress": "0x...", "toTokenAddress": "0x...", "toAmount": "50000000"})

## 🧠 Trading Philosophy

### Decision Framework
- **Assess market regime based on fresh data**: Is this a trending or ranging environment?
- **Evaluate prediction strength**: Strong consensus vs conflicting signals
- **Consider portfolio context**: Current exposure, recent performance, available capital
- **Size intelligently**: Scale with confidence, account for volatility and correlation
- **Manage risk dynamically**: Adapt stop losses and targets to market conditions

### Key Principles
- Trade with conviction when edge is clear, sit tight when uncertain
- Manage risk before chasing returns - protect capital first
- Learn and adapt within the session based on market feedback
- Consider BTC/ETH correlation when holding both positions

### Position Management
- One primary position per asset maximum (avoid over-trading)
- Close conflicting positions before opening new ones
- Set stop losses and take profits immediately after entry
- Leverage: Scale with prediction confidence and market volatility (from 1x up to 3x max leverage)
- Position size: Adapt to portfolio value, recent performance, and opportunity quality (from 5% up to 10% of the porfolio value)

### Decision Quality Over Frequency
- Strong signal (clear consensus, significant predicted move): Act decisively with appropriate size
- Mixed signals or low confidence: Wait for better opportunity
- Conflicting with existing positions: Consider closing vs opening new
- Recent losses: Reduce size temporarily, focus on higher-probability setups

### IMPORTANT - Risk Management
- Leverage: Scale with prediction confidence and market volatility (from 1x up to 3x max leverage)
- Position size: Adapt to portfolio value, recent performance, and opportunity quality (from 5% up to 10% of the porfolio value)
- Stop losses: Set based on technical levels and volatility, not rigid percentages
- Take profits: Target levels that make sense given predicted move and market structure

## CRITICAL - Execution Protocol
- Always end each cycle with either a trade execution OR explicit "No trade" decision with clear reasoning. Never end with just analysis
- Sequential Execution: Perform trading actions sequentially, never in parallel to avoid nonce conflicts
- You can only have one stop loss and one take profit order per position
- You need to have enough ETH (AND NOT WETH) in your wallet to pay for the gas fees of the trades you make
- Rebalance your portfolio to maintain between 2% and 5% of ETH and the rest in USDC (DONT HOLD WETH/BTC/WBTC)
- Error Handling: If actions fail, diagnose the issue, adapt parameters if needed, and continue. Don't get stuck in retry loops

### Trading Cycle
Keep all previous instructions in mind and refer to them when making decisions
1. **Gather Fresh Intelligence**: Check portfolio, get top miner predictions for both BTC and ETH
2. **Assess Opportunities**: Analyze prediction consensus and strength
3. **Evaluate Current Risk**: Review existing positions and their alignment with predictions
4. **Make Decision**: Trade with sizing appropriate to confidence, or explicitly choose not to trade
5. **Execute Completely**: If trading, set stop loss and take profit orders

*Remember: I'm an autonomous trader, not a script. Use judgment, adapt to conditions, and focus on sustainable profitability over activity.
`
;


// ═══════════════════════════════════════════════════════════════════════════════
// 📊 GMX TRADING CONTEXT CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

const gmxContext = context({
    type: "gmx-trading-agent",
    maxSteps: 50,
    maxWorkingMemorySize: 5,
    schema: z.object({
        instructions: z.string().describe("The agent's instructions"),
        positions: z.string().describe("The agent's positions"),
        portfolio: z.string().describe("The agent's portfolio"),
        markets: z.string().describe("The agent's markets"),
        tokens: z.string().describe("The agent's tokens"),
        volumes: z.string().describe("The agent's volumes"),
        orders: z.string().describe("The agent's pending orders"),
    }),

    key({ id }) {
      return id;
    },

    create: (state) => {
          return {
            instructions:state.args.instructions,
            positions:state.args.positions,
            portfolio:state.args.portfolio,
            markets:state.args.markets,
            tokens:state.args.tokens,
            volumes:state.args.volumes,
            orders:state.args.orders,
          };
      },

    render({ memory }) {
        return render(vega_template, {
            instructions: memory.instructions,
            positions: memory.positions,
            portfolio: memory.portfolio,
            markets: memory.markets,
            tokens: memory.tokens,
            volumes: memory.volumes,
            orders: memory.orders,
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
                    let context = {
                        type: "gmx-trading-agent",
                        maxSteps: 50,
                        instructions: vega_template,
                        positions: positions,
                        portfolio: portfolio,
                        markets: markets,
                        tokens: tokens,
                        volumes: volumes,
                        orders: orders,
                    };
                    let text = "Trading cycle initiated";
                    await send(gmxContext, context, {text});
                }, 1200000); // 20 minutes

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

// Initialize persistent memory stores
console.log("🗄️ Setting up MongoDB persistent memory...");
const mongoMemoryStore = await createMongoMemoryStore({
    uri: env.MONGODB_STRING,
    dbName: "vega_trading_agent", 
    collectionName: "gmx_memory",
});

console.log("✅ Memory stores initialized!");

// Create the agent with persistent memory
const agent = createDreams({
    model: openrouter("anthropic/claude-sonnet-4"), //google/gemini-2.5-flash-preview-05-20
    logger: new Logger({ level: LogLevel.INFO }), // Enable debug logging
    extensions: [gmx], // Add GMX extension
    memory: {
        store: mongoMemoryStore,
        vector: createChromaVectorStore("agent", "http://localhost:8000"),
        vectorModel: openrouter("google/gemini-2.0-flash-001"),
    },
    streaming: false,
});

console.log("✅ Agent created successfully!");

// Start the agent with GMX context arguments
await agent.start({
    instructions: vega_template,
    positions: await get_positions_str(sdk),
    portfolio: await get_portfolio_balance_str(sdk),
    markets: await get_btc_eth_markets_str(sdk),
    tokens: await get_tokens_data_str(sdk),
    volumes: await get_daily_volumes_str(sdk),
    orders: await get_orders_str(sdk),
});

console.log("🎯 Vega is now live and ready for GMX trading!");