/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🏗️ GMX TRADING TYPES
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Type definitions for GMX trading agent
 */

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
    synthBtcPredictions: string;
    synthEthPredictions: string;
    btcTechnicalAnalysis: string;
    ethTechnicalAnalysis: string;
}