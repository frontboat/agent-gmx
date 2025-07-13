// ═══════════════════════════════════════════════════════════════════════════════
// 🔐 GMX WALLET & SDK INITIALIZATION MODULE
// ═══════════════════════════════════════════════════════════════════════════════
// This module handles all wallet and SDK initialization logic for GMX trading
// ═══════════════════════════════════════════════════════════════════════════════

import { GmxSdk } from "@gmx-io/sdk";
import { createWalletClient, http, type WalletClient, type Account } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

// ═══════════════════════════════════════════════════════════════════════════════
// 📋 TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════

export interface ChainConfig {
    name: string;
    symbol: string;
    decimals: number;
    network: 'arbitrum' | 'avalanche';
}

export interface WalletConfig {
    privateKey: string;
    walletAddress: string;
    chainId: number;
    rpcUrl: string;
    oracleUrl: string;
    subsquidUrl: string;
    network: 'arbitrum' | 'avalanche';
}

export interface InitializedWallet {
    sdk: GmxSdk;
    walletClient: WalletClient;
    account: Account;
    chainConfig: ChainConfig;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 🔧 CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

// Define supported chain configurations
export const SUPPORTED_CHAINS: Record<number, ChainConfig> = {
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

// ═══════════════════════════════════════════════════════════════════════════════
// ✅ VALIDATION FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Validates if a string is a valid hex address (40 hex chars with 0x prefix)
 */
export const validateHexAddress = (address: string): address is `0x${string}` => {
    return /^0x[a-fA-F0-9]{40}$/.test(address);
};

/**
 * Validates if a string is a valid private key (64 hex chars with 0x prefix)
 */
export const validatePrivateKey = (key: string): key is `0x${string}` => {
    return /^0x[a-fA-F0-9]{64}$/.test(key);
};

/**
 * Returns all supported chain configurations
 */
export const getSupportedChains = (): Record<number, ChainConfig> => {
    return SUPPORTED_CHAINS;
};

/**
 * Validates that the provided network matches the chain ID
 * @throws Error if validation fails
 */
export const validateChainNetwork = (chainId: number, network: string): void => {
    const chainConfig = SUPPORTED_CHAINS[chainId as keyof typeof SUPPORTED_CHAINS];
    
    if (!chainConfig) {
        throw new Error(
            `Unsupported chain ID: ${chainId}. Supported chains: ${Object.keys(SUPPORTED_CHAINS).join(', ')}`
        );
    }
    
    if (chainConfig.network !== network) {
        throw new Error(
            `Network mismatch: Chain ID ${chainId} corresponds to ${chainConfig.network}, but network is set to ${network}`
        );
    }
};

// ═══════════════════════════════════════════════════════════════════════════════
// 🏗️ INITIALIZATION FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Creates and initializes a GMX wallet with SDK
 * @param config Wallet configuration parameters
 * @returns Initialized wallet, SDK, and chain configuration
 * @throws Error if validation fails
 */
export const createGmxWallet = (config: WalletConfig): InitializedWallet => {
    // Validate private key format
    if (!validatePrivateKey(config.privateKey)) {
        throw new Error("Invalid private key format. Must be 64 hex characters with 0x prefix.");
    }
    
    // Validate wallet address format
    if (!validateHexAddress(config.walletAddress)) {
        throw new Error("Invalid wallet address format. Must be 40 hex characters with 0x prefix.");
    }
    
    // Validate chain and network match
    validateChainNetwork(config.chainId, config.network);
    
    // Get chain configuration
    const chainConfig = SUPPORTED_CHAINS[config.chainId];
    
    // Create account from private key
    const account = privateKeyToAccount(config.privateKey as `0x${string}`);
    
    // Verify that the derived address matches the provided address
    if (account.address.toLowerCase() !== config.walletAddress.toLowerCase()) {
        throw new Error(
            `Address mismatch: Private key derives to ${account.address}, but wallet address is ${config.walletAddress}`
        );
    }
    
    // Create wallet client
    const walletClient = createWalletClient({
        account,
        transport: http(config.rpcUrl),
        chain: { 
            id: config.chainId,
            name: chainConfig.name,
            nativeCurrency: {
                decimals: chainConfig.decimals,
                name: chainConfig.name,
                symbol: chainConfig.symbol
            },
            rpcUrls: {
                default: { http: [config.rpcUrl] },
                public: { http: [config.rpcUrl] }
            }
        }
    });
    
    // Initialize GMX SDK
    const sdk = new GmxSdk({
        rpcUrl: config.rpcUrl,
        chainId: config.chainId,
        oracleUrl: config.oracleUrl,
        walletClient: walletClient,
        subsquidUrl: config.subsquidUrl,
        subgraphUrl: config.subsquidUrl,
        account: account.address
    });
    
    // Set the account in the SDK
    sdk.setAccount(config.walletAddress as `0x${string}`);
    
    console.warn(`💼 GMX SDK initialized with account: ${config.walletAddress}`);
    console.warn(`🔗 Connected to ${chainConfig.name} (Chain ID: ${config.chainId})`);
    
    return {
        sdk,
        walletClient,
        account,
        chainConfig
    };
};

/**
 * Convenience function to create GMX wallet from environment variables
 * @param env Environment variables object with GMX configuration
 * @returns Initialized wallet, SDK, and chain configuration
 */
export const createGmxWalletFromEnv = (env: {
    GMX_PRIVATE_KEY: string;
    GMX_WALLET_ADDRESS: string;
    GMX_CHAIN_ID: string;
    GMX_RPC_URL: string;
    GMX_ORACLE_URL: string;
    GMX_SUBSQUID_URL: string;
    GMX_NETWORK: 'arbitrum' | 'avalanche';
}): InitializedWallet => {
    const config: WalletConfig = {
        privateKey: env.GMX_PRIVATE_KEY,
        walletAddress: env.GMX_WALLET_ADDRESS,
        chainId: parseInt(env.GMX_CHAIN_ID),
        rpcUrl: env.GMX_RPC_URL,
        oracleUrl: env.GMX_ORACLE_URL,
        subsquidUrl: env.GMX_SUBSQUID_URL,
        network: env.GMX_NETWORK
    };
    
    return createGmxWallet(config);
};