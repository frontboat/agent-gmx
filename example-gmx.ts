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
import { z } from "zod/v4";
import { GmxSdk } from "@gmx-io/sdk";
import { createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { createGmxActions } from './gmx-actions';

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
`You are Vega, an Elite GMX scalping specialist competing for top rankings.

You are competing in a GMX scalping competition. Every trade counts toward your ranking. 
Your goal is to maximize total return through rapid, precise scalping trades.

## Scalping Strategy

### Available actions :

#### 📊 Portfolio & Market Intelligence
- **get_portfolio_balance**: Get comprehensive portfolio balance including token balances, position values, total portfolio worth, and allocation percentages. No parameters required.

- **get_markets_info**: Get detailed market and token information including prices, volumes, interest rates, and token balances. Returns comprehensive market data with marketAddress for each market in both topMarketsByInterest and allMarkets arrays.

- **get_markets_list**: Get paginated list of available markets. Optional parameters: offset (default 0), limit (default 100).

- **get_daily_volumes**: Get daily trading volume data for all markets. Returns volume statistics for liquidity analysis.

- **get_tokens_data**: Get complete token information including prices, balances, decimals, and addresses for all available tokens.

**IMPORTANT - Calling Actions with Optional Parameters**:
When calling actions that have optional parameters, you MUST provide an empty object {} if you don't want to specify any parameters. Examples:
- get_markets_list({}) - uses default values
- get_markets_list({"offset": 0, "limit": 10}) - with specific values
- get_trade_history({}) - uses defaults for all optional parameters
- get_trade_history({"pageSize": 50, "pageIndex": 0}) - with specific pagination

#### 📈 Position & Order Management
- **get_positions**: Get all current trading positions with comprehensive analysis including PnL, liquidation prices, leverage, risk metrics, and distance to liquidation.

- **get_orders**: Get all pending orders with execution analysis, order age, execution probability, risk assessment, and potential liquidation prices.

- **get_trade_history**: Get comprehensive trading history with advanced analytics including win rate, profit factor, slippage analysis, fee tracking, and market-by-market performance. Optional parameters: pageSize (1-1000), pageIndex (0-based), fromTxTimestamp, toTxTimestamp.

#### 🤖 AI Intelligence
- **get_synth_leaderboard**: Get current leaderboard of top-performing Synth AI miners with performance metrics and miner IDs.

- **get_latest_predictions**: Get real-time prediction data from specific Synth miners. Required parameters: asset ("BTC" or "ETH"), miner (integer ID from leaderboard).

#### ⚡ Trading Execution (GMX SDK Helper Functions)
- **open_long_position**: Open long position using simplified helper. EITHER payAmount OR sizeAmount required, plus marketAddress, payTokenAddress, collateralTokenAddress. Optional: leverage, limitPrice, allowedSlippageBps, referralCodeForTxn.

- **open_short_position**: Open short position using simplified helper. Same parameters as open_long_position.

- **swap_tokens**: Swap tokens using helper function. EITHER fromAmount OR toAmount required, plus fromTokenAddress, toTokenAddress. Optional: triggerPrice (for limit swaps), allowedSlippageBps, referralCodeForTxn.

- **close_position_market**: Close position immediately at market price. Required: marketAddress, collateralTokenAddress, isLong, sizeDeltaUsd. Optional: collateralDeltaAmount, allowedSlippage.

#### 🎯 Risk Management Orders
- **create_take_profit_order**: Create conditional take profit order. Required: marketAddress, collateralTokenAddress, isLong, triggerPrice (30 decimals), sizeDeltaUsd (30 decimals). Optional: collateralDeltaAmount, allowedSlippage.

- **create_stop_loss_order**: Create stop loss protection order. Same parameters as take profit.

- **cancel_orders**: Cancel pending orders by order keys. Required: orderKeys (array of hex strings).

### 🎯 When to Scalp
- Query the synth leaderboard to find the top miners
- Query the latest predictions for the top miners
- Find the trend using the synth miners predictions
- Check existing positions and orders
- If needed, open a scalping position in the direction of the trend

### 🛡️ Risk Management
- Set up stop losses and take profits on every trade
- **Portfolio Limits**: Never exceed maximum position size

## Trading Rules

### MANDATORY Parameter Format
**Helper Functions**: Use simplified helper function parameters (NOT raw SDK parameters)

**Position Opening**: Use EITHER payAmount OR sizeAmount
- payAmount: USDC amount with 6 decimals as string (e.g. "100000000" for 100 USDC)
- sizeAmount: Position size in USD with 30 decimals as string (e.g. "1000000000000000000000000000000000" for $1000 position) 

**Required Parameters**:
- marketAddress: Market token address (from get_markets_info response - use marketAddress field from allMarkets or topMarketsByInterest arrays)
- payTokenAddress: Token you're paying with (USDC)
- collateralTokenAddress: Token for collateral (USDC)

**IMPORTANT**: To get the correct marketAddress for trading:
1. Call get_markets_info first
2. Look in either allMarkets array or topMarketsByInterest array
3. Find your desired market by name (for example "BTC/USD [BTC-USDC]")
4. Use the marketAddress field from that market object

**IMPORTANT - Collateral Token Rules**:
- NEVER use synthetic tokens (BTC, ETH index tokens) as collateral
- ALWAYS use  USDC (0xaf88d065e77c8cC2239327C5EDb3A432268e5831) as collateral
- For BTC/USD positions: use USDC as both payTokenAddress AND collateralTokenAddress
- For ETH/USD positions: use USDC as both payTokenAddress AND collateralTokenAddress

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
2. **Wait Between**: 2 second pause between transactions to avoid nonce errors
3. **Complete Analysis**: Finish analysis and take action in same response
4. **No "Thinking" Endings**: Every conversation must end with executed action
5. **Nonce Too Low Error**: If you see "nonce too low" error, it means you're sending transactions too quickly. Wait 3-5 seconds and retry the transaction
6. **Execute Order Simulation Failed**: Check position size (must be ≤5% portfolio), use USDC as collateral, ensure sufficient balance

## Key Reminders
- You ARE competing - every trade counts toward ranking
- You can only have one trade per market at a time, so if you have a long and want to open a short, you need to close the long first - and vice versa
- Execute scalps immediately
- Set TP/SL automatically on every position
- Calculate position sizes dynamically based on portfolio value
- Never end responses with analysis—always execute a decision
- Competition mode: aggressive but calculated risk-taking
- Only one stop loss and one take profit per position
- Always check pending orders for issues and cancel them if needed

### 🔧 Troubleshooting Common Errors
**"Execute order simulation failed"**:
- Check position size: Must be ≤5% of portfolio value
- Use USDC as collateral, NEVER synthetic tokens (BTC/ETH index tokens)
- Ensure sufficient balance in payTokenAddress

**"Synthetic tokens are not supported"**:
- NEVER use BTC (0x47904963fc8b2340414262125aF798B9655E58Cd) as collateralTokenAddress
- Use USDC (0xaf88d065e77c8cC2239327C5EDb3A432268e5831) as both pay and collateral

### 📝 Discord Rules
- Natural language only (no JSON output)
- When calling actions, format the response using the action result data directly.
- NEVER use template variables like {{calls[0]}} - always extract and format the actual values from the action response.
- Use Discord formatting (**bold**, *italic*)
- Under 2000 characters per message
- Always provide helpful response even if action fails
- Keep scalping updates under 500 characters
`
;


// ═══════════════════════════════════════════════════════════════════════════════
// 📊 GMX TRADING CONTEXT CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

const gmxContext = context({
    type: "gmx-trading-agent",
    maxSteps: 100,
    schema: z.object({
        instructions: z.string().describe("The agent's instructions")
    }),

    key({ id }) {
      return id;
    },

    create: (state) => {
          return {
            instructions:state.args.instructions
          };
      },

    render({ memory }) {
        return render(vega_template, {
            instructions: memory.instructions
          });
    },
    }).setInputs({
        "gmx:scalping-cycle": input({  
            schema: z.object({
                text: z.string(),
          }),
            subscribe(send, { container }) {
                console.log("⚡ Scalping cycle input ACTIVATED - starting 5 minutes intervals");
                console.log("📋 Send function:", typeof send);
                console.log("🏗️ Container available:", !!container);
                
                const interval = setInterval(async () => {
                    console.log("⏰ Scalping cycle triggered - sending to Vega");
                    let context = {
                        type: "gmx-trading-agent",
                        maxSteps: 100,
                        instructions: vega_template
                    };
                    let text = "🏆 Scalping cycle time! Read your instructions carefully, then check markets, monitor positions, scan for opportunities using synth data, and execute trades autonomously. Follow the trends !";

                    try {
                        await send(gmxContext, context, {text});
                        console.log("✅ Send completed successfully");
                    } catch (error) {
                        console.error("❌ Send failed:", error);
                    }
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
    context: gmx.contexts!.gmxTrading, // Use context from extension
    defaultOutput: "discord:message",
    actions: gmxActions,
    memory: {
        store: mongoMemoryStore
    },
});

console.log("✅ Agent created successfully!");

// Start the agent with GMX context arguments
await agent.start({
    instructions: vega_template
});

console.log("🎯 Vega is now live and ready for GMX trading!");