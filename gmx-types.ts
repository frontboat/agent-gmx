/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🏗️ GMX TRADING TYPES
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Type definitions for GMX trading agent
 */

// Asset definitions
export const ASSETS = ['BTC', 'ETH', 'SOL'] as const;
export type Asset = typeof ASSETS[number];

// Main memory interface
export interface GmxMemory {
    portfolio: string;
    positions: string;
    orders: string;
    markets: string;
    tokens: string;
    volumes: string;
    tradingHistory: string;
    currentTask: string | null;
    lastResult: string | null;
    instructions: string;
    assetTechnicalAnalysis: string;
    assetSynthAnalysis: string;
}