/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🏗️ GMX TRADING TYPES
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Type definitions for GMX trading agent
 */

export interface GmxMemory {
    // Core trading data
    positions: string;
    orders: string;
    markets: string;
    tokens: string;
    volumes: string;
        
    // Portfolio balance
    portfolio: string;
    
    // Trading performance data
    tradingHistory?: string;
    
    // Current state
    currentTask: string | null;
    lastResult: string | null;

    // Synth intelligence data - consolidated predictions from top miners
    synthBtcPredictions: string;
    synthEthPredictions: string;
    
    // Technical analysis data - multi-timeframe indicators
    btcTechnicalAnalysis?: string;
    ethTechnicalAnalysis?: string;
}