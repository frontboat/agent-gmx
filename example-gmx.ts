/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🌟 VEGA - GMX TRADING AGENT
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * A sophisticated AI trading assistant specializing in GMX perpetual futures
 * Built with the Daydreams framework and powered by advanced personality modeling
 * 
 * ✨ Features:
 * • Full GMX protocol integration with real-time trading
 * • Advanced risk management with data-driven decision making
 * • Multi-platform support (CLI + Discord)
 * • Comprehensive market analysis and position tracking
 * • Obsessive risk-conscious personality (10/10 risk management)
 * 
 * 🚀 Quick Start:
 * 1. Configure environment variables (see .env.example)
 * 2. Ensure wallet has sufficient funds for trading
 * 3. Run: `bun run examples/gmx/example-gmx.ts`
 * 
 * ⚠️  IMPORTANT: Ensure token approvals are set via app.gmx.io before trading
 * 
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
    action, 
    input,
    extension,
    validateEnv, 
    LogLevel,
    Logger
} from "@daydreamsai/core";
import { discord } from "@daydreamsai/discord";
import { createMongoMemoryStore } from "@daydreamsai/mongodb";
import { createChromaVectorStore } from "@daydreamsai/chromadb";
import { z } from "zod/v4";
import { GmxSdk } from "@gmx-io/sdk";
import { createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { createGmxActions } from './gmx-actions';
import { get_portfolio_balance_str, get_positions_str } from "./queries";

// ═══════════════════════════════════════════════════════════════════════════════
// ⚙️ ENVIRONMENT VALIDATION & SETUP
// ═══════════════════════════════════════════════════════════════════════════════

console.log("🚀 Starting GMX Trading Agent...");

const env = validateEnv(
    z.object({
        ANTHROPIC_API_KEY: z.string(),
        OPENROUTER_API_KEY: z.string().min(1, "OPENROUTER_API_KEY is required"),
        GMX_NETWORK: z.enum(["arbitrum", "avalanche"]).default("arbitrum"),
        GMX_CHAIN_ID: z.string(),
        GMX_ORACLE_URL: z.string(),
        GMX_RPC_URL: z.string(),
        GMX_SUBSQUID_URL: z.string(),
        GMX_WALLET_ADDRESS: z.string(),
        GMX_PRIVATE_KEY: z.string(),
        SYNTH_API_KEY: z.string().min(1, "SYNTH_API_KEY is required for market intelligence"),
        DISCORD_TOKEN: z.string().min(1, "DISCORD_TOKEN is required for Discord output"),
        DISCORD_BOT_NAME: z.string().min(1, "DISCORD_BOT_NAME is required for Discord output"),
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
`I am Vega, an Elite GMX scalping specialist competing for top rankings.

I am competing in a GMX scalping competition. Every trade counts toward my ranking. 
My goal is to maximize total return through rapid, precise scalping trades.

### Available actions :

  #### 📊 Portfolio & Market Intelligence
  - get_portfolio_balance: Get comprehensive portfolio balance including token balances, position values, total portfolio worth, and allocation percentages. NO
  PARAMETERS.
  - get_markets_info: Get detailed market and token information including prices, volumes, interest rates, and token balances. Returns marketAddress for each market in     
   topMarketsByInterest and allMarkets arrays. NO PARAMETERS.
  - get_markets_list: Get paginated list of available markets. OPTIONAL: offset (default 0), limit (default 100).
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
  - open_long_position: Open long position. REQUIRED: marketAddress, payTokenAddress, collateralTokenAddress, EITHER payAmount (6 decimals) OR sizeAmount (30
  decimals). OPTIONAL: leverage, limitPrice, allowedSlippageBps, referralCodeForTxn.
  - open_short_position: Open short position. Same parameters as open_long_position.
  - close_position_market: Close position at market price. REQUIRED: marketAddress, collateralTokenAddress, isLong, sizeDeltaUsd (30 decimals). OPTIONAL:
  collateralDeltaAmount, allowedSlippage (NOT allowedSlippageBps).
  - cancel_orders: Cancel pending orders. REQUIRED: orderKeys (array of 32-byte hex strings).

  #### 📋 Parameter Format Requirements
  - **Decimal String Values**: All amounts must be BigInt strings
    - USDC amounts: 6 decimals (e.g., "1000000" = 1 USDC)
    - USD position sizes: 30 decimals (e.g., "1000000000000000000000000000000000" = $1000)
    - Prices: 30 decimals
  - **Slippage Parameters**: 
    - Trading actions: use allowedSlippageBps (e.g., 100 = 1%)
    - Close position: use allowedSlippage (e.g., 100 = 1%)

**IMPORTANT - How to Call Different Action Types**:
1. **Actions with NO parameters** (no schema): Call without any data
   - get_portfolio_balance
   - get_synth_leaderboard  
   - get_markets_info
   - get_daily_volumes
   - get_tokens_data
   - get_positions
   - get_orders

2. **Actions with OPTIONAL parameters**: MUST provide empty object {} if not specifying values
   - get_markets_list({}) - uses default values
   - get_markets_list({"offset": 0, "limit": 10}) - with specific values
   - get_trade_history({}) - uses defaults for all optional parameters
   - get_trade_history({"pageSize": 50, "pageIndex": 0}) - with specific pagination

3. **Actions with REQUIRED parameters**: MUST provide all required fields
   - get_latest_predictions({"asset": "BTC", "miner": 123}) or get_latest_predictions({"asset": "ETH", "miner": 123})
   - cancel_orders({"orderKeys": ["0x..."]})
   - open_long_position({"marketAddress": "0x...", "payAmount": "1000000", "payTokenAddress": "0x...", "collateralTokenAddress": "0x...", "allowedSlippageBps": 100})
   - open_short_position({"marketAddress": "0x...", "payAmount": "1000000", "payTokenAddress": "0x...", "collateralTokenAddress": "0x...", "allowedSlippageBps": 100})
   - close_position_market({"marketAddress": "0x...", "collateralTokenAddress": "0x...", "isLong": true, "sizeDeltaUsd": "1000000000000000000000000000000000", "collateralDeltaAmount": null, "allowedSlippage": 100})

### Scalping cycle
- Query the synth leaderboard to find the top miners
- Query the latest predictions for BOTH BTC and ETH from the top miners
- Analyze trends for both assets using the synth miners predictions
- Check existing positions for both BTC and ETH markets
- Consider scalping opportunities on BOTH assets based on their individual trends
- Don't trade just one asset - diversify across BTC and ETH for better opportunities
- **IMPORTANT - Never Close Profitable Positions in the Right Direction**:
- If I have an existing position that matches the current trend direction, DO NOT close it
- Instead, I can ADD to the position by opening another trade in the same direction but only if the trade size divided by the leverage stays under 10% of portfolio
- **REMEMBER**: When adding to positions, trade size divided by leverage must not exceed 10% of portfolio value
- Only close positions when the trend has reversed strongly against my position

**How to Determine Position Direction and Size**:
When analyzing positions from get_positions action:
- LONG Position: isLong: true - I profit when price goes UP
- SHORT Position: isLong: false - I profit when price goes DOWN
- Position Size: Always positive number regardless of direction
- PnL: Positive = profit, negative = loss

**Trend Matching Logic**:
- If Synth AI predicts BULLISH trend → keep LONG positions (isLong: true)
- If Synth AI predicts BEARISH trend → keep SHORT positions (isLong: false)
- Never close positions that match the predicted trend direction!

**Clear Examples**:
- BTC position with isLong: true = LONG BTC (bullish - expecting price to rise)
- BTC position with isLong: false = SHORT BTC (bearish - expecting price to fall)
- ETH position with isLong: true = LONG ETH (bullish - expecting price to rise)
- ETH position with isLong: false = SHORT ETH (bearish - expecting price to fall)

**CRITICAL - Always Use Fresh Data**:
- NEVER rely on memory for position data - it can be stale and outdated
- ALWAYS call get_positions action to get current, real-time position data
- ALWAYS call get_orders action to get current pending orders
- Memory is for context only - use live action results for all trading decisions

### 🛡️ Risk Management
- Constantly evaluate trend strength against opened positions direction
- Portfolio Limits: Never exceed maximum position size

## Trading Rules

### MANDATORY Parameter Format
**Helper Functions**: Use simplified helper function parameters (NOT raw SDK parameters)

**Position Opening**: Use EITHER payAmount OR sizeAmount
- payAmount: USDC amount with 6 decimals as string (e.g. "100000000" for 100 USDC)
- sizeAmount: Position size in USD with 30 decimals as string (e.g. "1000000000000000000000000000000000" for $1000 position) 

**Required Parameters**:
- marketAddress: Market token address (from get_markets_info response - use marketAddress field from allMarkets or topMarketsByInterest arrays)
- payTokenAddress: Token I'm paying with (USDC)
- collateralTokenAddress: Token for collateral (USDC)

**IMPORTANT**: To get the correct marketAddress for trading:
1. Call get_markets_info first
2. Look in either allMarkets array or topMarketsByInterest array
3. Find my desired market by name (examples: "BTC/USD [BTC-USDC]", "ETH/USD [ETH-USDC]")
4. Use the marketAddress field from that market object

**IMPORTANT - Collateral Token Rules**:
- NEVER use synthetic tokens (BTC, ETH index tokens) as collateral
- ALWAYS use  USDC (0xaf88d065e77c8cC2239327C5EDb3A432268e5831) as collateral
- For BTC/USD and ETH/USD positions: use USDC as both payTokenAddress AND collateralTokenAddress

**Optional Parameters**:
- leverage: Basis points as string (e.g. "50000" for 5x)
- limitPrice: For limit orders (30 decimal USD string)
- allowedSlippageBps: Default 100 (1%)

### 💰 Position Sizing
- ALWAYS fetch portfolio balance using get_portfolio_balance first
- **Max Position**: use up to 5% of portfolio per trade
- **Example**: If portfolio = $132.75, max position = $6.64
- **sizeAmount format**: "6640000000000000000000000000000000" (for $6.64 with 30 decimals)
- **USDC payAmount**: "6640000" (for 6.64 USDC with 6 decimals)
- **Dynamic Sizing**: Always recalculate based on current portfolio value
- **Max Leverage**: Use up to 5x leverage

**CRITICAL - Adding to Existing Positions**:
- **Total position size (existing + new) MUST NOT exceed 10% of portfolio value**
- **Check existing position size BEFORE adding**: Call get_positions first
- **Calculate allowed addition**: maxTotalSize = portfolio * 0.10 - existingPositionSize
- **Only add if**: existingPositionSize < (portfolio * 0.10)
- **Example**: Portfolio=$1000, existing BTC position=$80, max addition=$20 (to reach $100 total)

### 🔢 Decimal Conversion Rules
**USDC (6 decimals)**:
- 1 USDC = "1000000"
- 100 USDC = "100000000" 
- 6.64 USDC = "6640000"

**USD Position Sizes (30 decimals)**:
- $1 = "1000000000000000000000000000000000"
- $100 = "100000000000000000000000000000000000"
- $6.64 = "6640000000000000000000000000000000"

### ⚡ Execution Protocol
1. **Sequential Only**: Execute trades ONE AT A TIME (never parallel)
2. **Wait Between**: 2 second pause between actions to avoid nonce errors
4. **Nonce Too Low Error**: If I see "nonce too low" error, it means I'm sending transactions too quickly. Wait 3-5 seconds and retry the transaction
5. **Execute Order Simulation Failed**: Check position size (must be ≤5% portfolio), use USDC as collateral, ensure sufficient balance

## Key Reminders
- Competition mode: aggressive but calculated risk-taking
- Calculate position sizes dynamically based on portfolio value
- **NEVER close positions that are already in the correct trend direction** - let profitable positions run
- I can add to existing positions by opening new trades in the same direction if opportunity arises
- Close positions only when trend momentum shifts decisively against your direction
- Action-Oriented Response: Complete analysis and execute appropriate action in same response - but only trade when good opportunities exist

### 🔧 Troubleshooting Common Errors
**"Execute order simulation failed"**:
- Check position size: Must be ≤5% of portfolio value
- Ensure sufficient balance in payTokenAddress
- Use USDC as collateral, NEVER synthetic tokens (BTC/ETH index tokens)

**"Synthetic tokens are not supported"**:
- NEVER use BTC (0x47904963fc8b2340414262125aF798B9655E58Cd) as collateralTokenAddress
- Use USDC (0xaf88d065e77c8cC2239327C5EDb3A432268e5831) as both pay and collateral

`
;


// ═══════════════════════════════════════════════════════════════════════════════
// 📊 GMX TRADING CONTEXT CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

const gmxContext = context({
    type: "gmx-trading-agent",
    maxSteps: 100,
    schema: z.object({
        instructions: z.string().describe("The agent's instructions"),
        positions: z.string().describe("The agent's positions"),
        portfolio: z.string().describe("The agent's portfolio"),
    }),

    key({ id }) {
      return id;
    },

    create: (state) => {
          return {
            instructions:state.args.instructions,
            positions:state.args.positions,
            portfolio:state.args.portfolio,
          };
      },

    render({ memory }) {
        return render(vega_template, {
            instructions: memory.instructions,
            positions: memory.positions,
            portfolio: memory.portfolio,
          });
    },
    }).setInputs({
        "gmx:scalping-cycle": input({  
            schema: z.object({
                text: z.string(),
          }),
            subscribe(send, { container }) {
                const interval = setInterval(async () => {
                    const portfolio = await get_portfolio_balance_str(sdk);
                    const positions = await get_positions_str(sdk);
                    let context = {
                        type: "gmx-trading-agent",
                        maxSteps: 100,
                        instructions: vega_template,
                        positions: positions,
                        portfolio: portfolio
                    };
                    let text = "Scalping cycle initiated";
                    await send(gmxContext, context, {text});
                }, 600000); // 10 minutes

                console.log("✅ Scalping cycle subscription setup complete");
                return () => {
                    console.log("🛑 Scalping cycle subscription cleanup");
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
    collectionName: "gmx_memory"
});

console.log("✅ Memory stores initialized!");

// Create the agent with persistent memory
const agent = createDreams({
    model: openrouter("google/gemini-2.5-flash-preview-05-20"),
    logger: new Logger({ level: LogLevel.DEBUG }), // Enable debug logging
    extensions: [discord, gmx], // Add GMX extension
    memory: {
        store: mongoMemoryStore,
        vector: createChromaVectorStore("agent", "http://localhost:8000"),
        vectorModel: openrouter("google/gemini-2.0-flash-001"),
    },
});

console.log("✅ Agent created successfully!");

// Start the agent with GMX context arguments
await agent.start({
    instructions: vega_template,
    positions: await get_positions_str(sdk),
    portfolio: await get_portfolio_balance_str(sdk)
});

console.log("🎯 Vega is now live and ready for GMX trading!");