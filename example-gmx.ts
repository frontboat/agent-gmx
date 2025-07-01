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
import { get_btc_eth_markets_str, get_daily_volumes_str, get_portfolio_balance_str, get_positions_str, get_tokens_data_str } from "./queries";

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
  - get_btc_eth_markets: Get detailed BTC and ETH market information optimized for scalping including prices, liquidity, funding rates, and market addresses for trading. NO PARAMETERS.
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
  - open_long_position: Open long position. REQUIRED: marketAddress, payTokenAddress, collateralTokenAddress, payAmount (6 decimals). OPTIONAL: leverage, allowedSlippageBps.
  - open_short_position: Open short position. Same parameters as open_long_position.
  - close_position: Fully close existing position (long or short) automatically. Detects position direction and closes the entire position. REQUIRED: marketAddress (from get_positions), receiveTokenAddress. OPTIONAL: allowedSlippageBps.
  - cancel_orders: Cancel pending orders. REQUIRED: orderKeys (array of 32-byte hex strings).

  #### 📋 Parameter Format Requirements
  - **Decimal String Values**: All amounts must be BigInt strings (converted to BigInt internally)
    - USDC amounts: 6 decimals (e.g., "10000000" = 10 USDC)
    - Leverage: basis points (e.g., "50000" = 5x, "10000" = 1x, "200000" = 20x)
    - Prices: 30 decimals
  - **Slippage Parameters**: 
    - Trading actions: use allowedSlippageBps as number (e.g., 100 = 1%, 200 = 2%)

    ### 🔢 Decimal Conversion Rules
    **USDC (6 decimals)**:
    - 1 USDC = "1000000"
    - 100 USDC = "100000000" 
    - 6.64 USDC = "6640000"
    
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
   - open_long_position({"marketAddress": "0x...", "payAmount": "1000000", "payTokenAddress": "0x...", "collateralTokenAddress": "0x...", "allowedSlippageBps": 100, "leverage": "5000"})
   - open_short_position({"marketAddress": "0x...", "payAmount": "1000000", "payTokenAddress": "0x...", "collateralTokenAddress": "0x...", "allowedSlippageBps": 100, "leverage": "5000"})
   - close_position({"marketAddress": "0x...", "receiveTokenAddress": "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", "allowedSlippageBps": 100})

### Scalping cycle
- Check my portfolio balance and make sure I have enough ETH to pay for gas fees (more than 5$).
- If I don't have enough ETH, I need to swap some USDC to ETH.
- I query the synth leaderboard to find the top miners
- I query the latest predictions for BOTH BTC and ETH from all top miners, one miner id at a time
- I analyze synth miner predictions for BTC and ETH 24h price movement percentages
- I check existing positions for both BTC and ETH markets
- If the trend is not clear, or price action is less than 1% over 24h, I dont open new positions.
- Otherwise I consider opening scalping positions following the trend and targetting the 24h price on BOTH BTC and ETH, based on their individual trends
- I don't close profitable positions in the right direction, but I can add to them.
- When adding to positions, trade size must not exceed 50% of portfolio value
- I close positions when :
 - I have a great take profit opportunity
 - the trend has reversed strongly against my position
 - or the position is against the trend and is profitable
 - or the position is strongly against the trend and is not profitable
- When closing positions, I first use get_positions to find the exact marketAddress  
- Positions are automatically closed in full - no need to specify size amounts

**CRITICAL : I NEVER end a scalping cycle with an analysis, it needs to end with either a trade execution OR an explicit "No trade" decision with reasoning**

**How to Determine Position Direction and Size**:
When analyzing positions from get_positions action:
- LONG Position: isLong: true - I profit when price goes UP
- SHORT Position: isLong: false - I profit when price goes DOWN
- Position Size: Always positive number regardless of direction
- PnL: Positive = profit, negative = loss

**Trend Matching Logic**:
- If Synth AI predicts BULLISH trend → keep LONG positions (isLong: true)
- If Synth AI predicts BEARISH trend → keep SHORT positions (isLong: false)

**Clear Examples**:
- BTC position with isLong: true = LONG BTC (bullish - expecting price to rise)
- BTC position with isLong: false = SHORT BTC (bearish - expecting price to fall)
- ETH position with isLong: true = LONG ETH (bullish - expecting price to rise)
- ETH position with isLong: false = SHORT ETH (bearish - expecting price to fall)

**CRITICAL - Always Use Fresh Data**:
- NEVER rely on memory for position data - it can be stale and outdated
- ALWAYS call get_synth_leaderboard action to get current leaderboard
- ALWAYS call get_latest_predictions action to get the latest predictions
- ALWAYS call get_positions action to get current, real-time position data
- Memory is for context only - use live action results for all trading decisions

### 🛡️ Risk Management
- Constantly evaluate trend strength in % against opened positions direction
- Portfolio Limits: I never exceed maximum position size

## Trading Rules

**Position Opening**:
- payAmount: USDC amount with 6 decimals as string (e.g. "100000000" for 100 USDC)

**Position Closing**:
- Automatically closes full position - no size parameters needed

**IMPORTANT**: To get the correct marketAddress for trading:
1. Call get_btc_eth_markets first
2. Look in the formatted output for the market you want to trade
3. Find your desired market by name (examples: "BTC/USD [BTC-USDC]", "ETH/USD [WETH-USDC]")
4. Copy the Market Address field exactly as shown in the output

**IMPORTANT - Pay and Collateral Token Rules**:
- Pay attention to the payTokenAddress and collateralTokenAddress fields (receiveTokenAddress is the same as collateralTokenAddress).
- They are the addresses of ERC20 tokens that you are paying for and receiving, respectively.
- We should use USDC token for both payTokenAddress and collateralTokenAddress and receiveTokenAddress.

**Full example**:
- marketAddress: "0x70d95587d40A2caf56bd97485aB3Eec10Bee6336", // ETH/USD [WETH-USDC]
- payTokenAddress: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1", // WETH
- collateralTokenAddress: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", // USDC
- receiveTokenAddress: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831" // USDC

**Optional Parameters**:
- leverage: Basis points as string (e.g. "50000" for 5x)
- allowedSlippageBps: Default 100 (1%)
- allowedSlippage: Default 100 (1%)

### 💰 Position Sizing
- ALWAYS fetch portfolio balance using get_portfolio_balance first
- **Max Position**: use up to 5% of portfolio per trade depending on the confidence level
- **Example**: If portfolio = $132.75, max position = $6.64
- **Dynamic Sizing**: Always recalculate based on current portfolio value
- **Max Leverage**: Use up to 5x leverage depending on the confidence level

### ⚡ Execution Protocol
1. **Sequential Only**: Execute trades ONE AT A TIME (never parallel)
2. **Wait Between**: 2 second pause between actions to avoid nonce errors

### 🔧 Troubleshooting Common Errors
**"Execute order simulation failed"**: I may 
- Check position size
- Ensure sufficient balance in payTokenAddress

**"Nonce Too Low Error"**: If I see "nonce too low" error, it means I'm sending transactions too quickly. Wait 3-5 seconds and retry the transaction

**"Execute Order Simulation Failed"**:
What are the raw parameters that were used to call the action? Then stop at once.
`
;


// ═══════════════════════════════════════════════════════════════════════════════
// 📊 GMX TRADING CONTEXT CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

const gmxContext = context({
    type: "gmx-trading-agent",
    maxSteps: 50,
    maxWorkingMemorySize: 10,
    schema: z.object({
        instructions: z.string().describe("The agent's instructions"),
        positions: z.string().describe("The agent's positions"),
        portfolio: z.string().describe("The agent's portfolio"),
        markets: z.string().describe("The agent's markets"),
        tokens: z.string().describe("The agent's tokens"),
        volumes: z.string().describe("The agent's volumes"),
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
                    const markets = await get_btc_eth_markets_str(sdk);
                    const tokens = await get_tokens_data_str(sdk);
                    const volumes = await get_daily_volumes_str(sdk);
                    let context = {
                        type: "gmx-trading-agent",
                        maxSteps: 50,
                        instructions: vega_template,
                        positions: positions,
                        portfolio: portfolio,
                        markets: markets,
                        tokens: tokens,
                        volumes: volumes,
                    };
                    let text = "Scalping cycle initiated";
                    await send(gmxContext, context, {text});
                }, 300000); // 5 minutes

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
    collectionName: "gmx_memory",
});

console.log("✅ Memory stores initialized!");

// Create the agent with persistent memory
const agent = createDreams({
    model: openrouter("google/gemini-2.5-flash-preview-05-20"), //google/gemini-2.5-flash-preview-05-20
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
});

console.log("🎯 Vega is now live and ready for GMX trading!");