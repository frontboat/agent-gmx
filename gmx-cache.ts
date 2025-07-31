import { type GmxSdk } from "@gmx-io/sdk";
import * as fs from 'fs/promises';
import * as path from 'path';
import type { PercentileAnalysis } from './gmx-utils';

// Types for LP bounds snapshots
interface LPBoundsSnapshot {
    timestamp: number;
    bounds: any; // LPBoundsResponse from synth-utils
}

interface SnapshotStorage {
    version: string;
    snapshots: {
        BTC: LPBoundsSnapshot[];
        ETH: LPBoundsSnapshot[];
    };
}


// Enhanced cache for all GMX data types and external APIs
export class EnhancedDataCache {
    // Market data cache
    private marketCache: Map<string, { marketsInfoData: any, tokensData: any }> = new Map();
    private lastMarketFetch: number = 0;
    private readonly MARKET_TTL_MS = 60_000; // 1 minute
    private marketFetchPromise: Promise<{ marketsInfoData: any, tokensData: any }> | null = null;

    // Token data cache
    private tokenCache: Map<string, any> = new Map();
    private lastTokenFetch: number = 0;
    private readonly TOKEN_TTL_MS = 300_000; // 5 minutes
    private tokenFetchPromise: Promise<any> | null = null;

    // Position data cache
    private positionCache: Map<string, any> = new Map();
    private lastPositionFetch: number = 0;
    private readonly POSITION_TTL_MS = 300_000; // 5 minutes
    private positionFetchPromise: Promise<any> | null = null;

    // Position info cache
    private positionInfoCache: Map<string, any> = new Map();
    private lastPositionInfoFetch: number = 0;
    private readonly POSITION_INFO_TTL_MS = 300_000; // 5 minutes
    private positionInfoFetchPromise: Promise<any> | null = null;

    // Volatility cache
    private volatilityCache: Map<string, number> = new Map();
    private lastVolatilityFetch: Map<string, number> = new Map();
    private readonly VOLATILITY_TTL_MS = 900_000; // 15 minutes
    private volatilityFetchPromises: Map<string, Promise<number>> = new Map();

    // LP Bounds data cache
    private lpBoundsCache: Map<string, any> = new Map();
    private lastLPBoundsFetch: Map<string, number> = new Map();
    private readonly LP_BOUNDS_TTL_MS = 300_000; // 5 minutes
    private lpBoundsFetchPromises: Map<string, Promise<any>> = new Map();
    private lastLPBoundsApiCall: number = 0;
    private readonly LP_BOUNDS_COOLDOWN_MS = 3000; // 3 seconds between API calls
    
    // LP Bounds snapshot storage
    private readonly SNAPSHOT_FILE_PATH = './data/lp-bounds-snapshots.json';
    private readonly SNAPSHOT_RETENTION_MS = 48 * 60 * 60 * 1000; // 48 hours
    private lpBoundsSnapshots: SnapshotStorage = {
        version: '1.0',
        snapshots: { BTC: [], ETH: [] }
    };
    
    constructor(private sdk: GmxSdk) {
        // Load snapshots from file on initialization
        this.loadSnapshots().catch(error => {
            console.error('[SnapshotStorage] Failed to load snapshots on init:', error);
        });
    }

    // ═══════════════════════════════════════════════════════════════════════════════
    // 📊 MARKET DATA METHODS
    // ═══════════════════════════════════════════════════════════════════════════════

    async getMarketsInfo(forceRefresh = false): Promise<{ marketsInfoData: any, tokensData: any }> {
        const now = Date.now();
        const cacheKey = "markets";

        // Return cached data if still valid
        if (!forceRefresh && this.marketCache.has(cacheKey) && (now - this.lastMarketFetch) < this.MARKET_TTL_MS) {
            console.warn(`[MarketCache] Returning cached market data (age: ${now - this.lastMarketFetch}ms, ttl: ${this.MARKET_TTL_MS}ms)`);
            return this.marketCache.get(cacheKey)!;
        }

        // If a fetch is already in progress, return that promise
        if (this.marketFetchPromise) {
            console.warn('[MarketCache] Returning in-progress market fetch');
            return this.marketFetchPromise;
        }

        // Start new fetch
        console.warn('[MarketCache] Fetching fresh market data');
        this.marketFetchPromise = this.fetchMarkets();

        try {
            const markets = await this.marketFetchPromise;
            this.marketCache.set(cacheKey, markets);
            this.lastMarketFetch = now;
            console.warn(`[MarketCache] Market data cached at ${now}`);
            return markets;
        } finally {
            this.marketFetchPromise = null;
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════════
    // 🪙 TOKEN DATA METHODS
    // ═══════════════════════════════════════════════════════════════════════════════

    async getTokensData(forceRefresh = false): Promise<any> {
        const now = Date.now();
        const cacheKey = "tokens";

        // Return cached data if still valid
        if (!forceRefresh && this.tokenCache.has(cacheKey) && (now - this.lastTokenFetch) < this.TOKEN_TTL_MS) {
            console.warn(`[TokenCache] Returning cached token data (age: ${now - this.lastTokenFetch}ms, ttl: ${this.TOKEN_TTL_MS}ms)`);
            return this.tokenCache.get(cacheKey)!;
        }

        // If a fetch is already in progress, return that promise
        if (this.tokenFetchPromise) {
            console.warn('[TokenCache] Returning in-progress token fetch');
            return this.tokenFetchPromise;
        }

        // Start new fetch
        console.warn('[TokenCache] Fetching fresh token data');
        this.tokenFetchPromise = this.fetchTokens();

        try {
            const tokens = await this.tokenFetchPromise;
            this.tokenCache.set(cacheKey, tokens);
            this.lastTokenFetch = now;
            console.warn(`[TokenCache] Token data cached at ${now}`);
            return tokens;
        } finally {
            this.tokenFetchPromise = null;
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════════
    // 📈 POSITION DATA METHODS
    // ═══════════════════════════════════════════════════════════════════════════════

    async getPositions(marketsData: any, tokensData: any, forceRefresh = false): Promise<any> {
        const now = Date.now();
        const cacheKey = "positions";

        // Return cached data if still valid
        if (!forceRefresh && this.positionCache.has(cacheKey) && (now - this.lastPositionFetch) < this.POSITION_TTL_MS) {
            console.warn(`[PositionCache] Returning cached position data (age: ${now - this.lastPositionFetch}ms, ttl: ${this.POSITION_TTL_MS}ms)`);
            return this.positionCache.get(cacheKey)!;
        }

        // If a fetch is already in progress, return that promise
        if (this.positionFetchPromise) {
            console.warn('[PositionCache] Returning in-progress position fetch');
            return this.positionFetchPromise;
        }

        // Start new fetch
        console.warn('[PositionCache] Fetching fresh position data');
        this.positionFetchPromise = this.fetchPositions(marketsData, tokensData);

        try {
            const positions = await this.positionFetchPromise;
            this.positionCache.set(cacheKey, positions);
            this.lastPositionFetch = now;
            console.warn(`[PositionCache] Position data cached at ${now}`);
            return positions;
        } finally {
            this.positionFetchPromise = null;
        }
    }

    async getPositionsInfo(marketsInfoData: any, tokensData: any, forceRefresh = false): Promise<any> {
        const now = Date.now();
        const cacheKey = "positionsInfo";

        // Return cached data if still valid
        if (!forceRefresh && this.positionInfoCache.has(cacheKey) && (now - this.lastPositionInfoFetch) < this.POSITION_INFO_TTL_MS) {
            console.warn(`[PositionInfoCache] Returning cached position info data (age: ${now - this.lastPositionInfoFetch}ms, ttl: ${this.POSITION_INFO_TTL_MS}ms)`);
            return this.positionInfoCache.get(cacheKey)!;
        }

        // If a fetch is already in progress, return that promise
        if (this.positionInfoFetchPromise) {
            console.warn('[PositionInfoCache] Returning in-progress position info fetch');
            return this.positionInfoFetchPromise;
        }

        // Start new fetch
        console.warn('[PositionInfoCache] Fetching fresh position info data');
        this.positionInfoFetchPromise = this.fetchPositionsInfo(marketsInfoData, tokensData);

        try {
            const positionsInfo = await this.positionInfoFetchPromise;
            this.positionInfoCache.set(cacheKey, positionsInfo);
            this.lastPositionInfoFetch = now;
            console.warn(`[PositionInfoCache] Position info data cached at ${now}`);
            return positionsInfo;
        } finally {
            this.positionInfoFetchPromise = null;
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════════
    // 🔧 PRIVATE FETCH METHODS
    // ═══════════════════════════════════════════════════════════════════════════════

    private async fetchMarkets(): Promise<{ marketsInfoData: any, tokensData: any }> {
        try {
            const marketsResult = await this.sdk.markets.getMarketsInfo();
            return marketsResult;
        } catch (error) {
            console.error('[MarketCache] Failed to fetch market data:', error);
            throw error;
        }
    }

    private async fetchTokens(): Promise<any> {
        try {
            const tokensResult = await this.sdk.tokens.getTokensData();
            return tokensResult;
        } catch (error) {
            console.error('[TokenCache] Failed to fetch token data:', error);
            throw error;
        }
    }

    private async fetchPositions(marketsData: any, tokensData: any): Promise<any> {
        try {
            const positionsResult = await this.sdk.positions.getPositions({
                marketsData: marketsData,
                tokensData: tokensData,
                start: 0,
                end: 1000,
            });
            return positionsResult;
        } catch (error) {
            console.error('[PositionCache] Failed to fetch position data:', error);
            throw error;
        }
    }

    private async fetchPositionsInfo(marketsInfoData: any, tokensData: any): Promise<any> {
        try {
            const positionsInfoResult = await this.sdk.positions.getPositionsInfo({
                marketsInfoData,
                tokensData,
                showPnlInLeverage: false
            });
            return positionsInfoResult;
        } catch (error) {
            console.error('[PositionInfoCache] Failed to fetch position info data:', error);
            throw error;
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════════
    // 📈 VOLATILITY CACHE METHODS
    // ═══════════════════════════════════════════════════════════════════════════════

    async getVolatility(asset: 'BTC' | 'ETH', forceRefresh = false): Promise<number> {
        const now = Date.now();
        const cacheKey = `volatility_${asset}`;

        // Return cached data if still valid
        if (!forceRefresh && this.volatilityCache.has(cacheKey)) {
            const lastFetch = this.lastVolatilityFetch.get(cacheKey) || 0;
            if ((now - lastFetch) < this.VOLATILITY_TTL_MS) {
                const cachedValue = this.volatilityCache.get(cacheKey)!;
                console.warn(`[VolatilityCache] Returning cached ${asset} volatility: ${cachedValue.toFixed(1)}% (age: ${now - lastFetch}ms)`);
                return cachedValue;
            }
        }

        // If a fetch is already in progress, return that promise
        if (this.volatilityFetchPromises.has(cacheKey)) {
            console.warn(`[VolatilityCache] Returning in-progress ${asset} volatility fetch`);
            return this.volatilityFetchPromises.get(cacheKey)!;
        }

        // Start new fetch
        const fetchPromise = this.fetchVolatility(asset);
        this.volatilityFetchPromises.set(cacheKey, fetchPromise);

        try {
            const result = await fetchPromise;
            
            // Cache the result
            this.volatilityCache.set(cacheKey, result);
            this.lastVolatilityFetch.set(cacheKey, now);
            
            console.warn(`[VolatilityCache] Cached fresh ${asset} volatility: ${result.toFixed(1)}%`);
            return result;
        } finally {
            // Clean up the promise
            this.volatilityFetchPromises.delete(cacheKey);
        }
    }

    private async fetchVolatility(asset: 'BTC' | 'ETH'): Promise<number> {
        try {
            // Import here to avoid circular dependencies
            const { calculate24HourVolatility } = await import('./gmx-utils');
            
            // Fetch 24 hours of 15-minute candles (96 candles)
            const url = `https://arbitrum-api.gmxinfra.io/prices/candles?tokenSymbol=${asset}&period=15m&limit=96`;
            
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`Failed to fetch candlestick data: ${response.status} ${response.statusText}`);
            }
            
            const data = await response.json();
            
            if (!data || !data.candles || !Array.isArray(data.candles) || data.candles.length < 2) {
                console.warn(`[VolatilityCache] Insufficient data for volatility calculation. Got ${data?.candles?.length || 0} candles`);
                return 0;
            }
            
            return calculate24HourVolatility(data.candles);
        } catch (error) {
            console.error(`[VolatilityCache] Error calculating 24h volatility for ${asset}:`, error);
            return 0;
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════════
    // 🔮 LP BOUNDS DATA CACHE METHODS
    // ═══════════════════════════════════════════════════════════════════════════════

    async getLPBoundsData(asset: 'BTC' | 'ETH', forceRefresh = false): Promise<any> {
        const now = Date.now();
        const cacheKey = `lp_bounds_${asset}`;

        // Return cached data if still valid
        if (!forceRefresh && this.lpBoundsCache.has(cacheKey)) {
            const lastFetch = this.lastLPBoundsFetch.get(cacheKey) || 0;
            if ((now - lastFetch) < this.LP_BOUNDS_TTL_MS) {
                const cachedValue = this.lpBoundsCache.get(cacheKey)!;
                console.warn(`[LPBoundsCache] Returning cached ${asset} LP bounds data (age: ${now - lastFetch}ms)`);
                return cachedValue;
            }
        }

        // If a fetch is already in progress, return that promise
        if (this.lpBoundsFetchPromises.has(cacheKey)) {
            console.warn(`[LPBoundsCache] Returning in-progress ${asset} LP bounds fetch`);
            return this.lpBoundsFetchPromises.get(cacheKey)!;
        }

        // Start new fetch
        const fetchPromise = this.fetchLPBounds(asset);
        this.lpBoundsFetchPromises.set(cacheKey, fetchPromise);

        try {
            const result = await fetchPromise;
            
            // Cache the result
            this.lpBoundsCache.set(cacheKey, result);
            this.lastLPBoundsFetch.set(cacheKey, now);
            
            // Add to snapshots
            this.addSnapshot(asset, result);
            
            console.warn(`[LPBoundsCache] Cached fresh ${asset} LP bounds data`);
            return result;
        } finally {
            // Clean up the promise
            this.lpBoundsFetchPromises.delete(cacheKey);
        }
    }

    private async fetchLPBounds(asset: 'BTC' | 'ETH'): Promise<any> {
        try {
            const now = Date.now();
            
            // Check if we need to wait due to rate limiting
            if (this.lastLPBoundsApiCall > 0 && (now - this.lastLPBoundsApiCall) < this.LP_BOUNDS_COOLDOWN_MS) {
                const waitTime = this.LP_BOUNDS_COOLDOWN_MS - (now - this.lastLPBoundsApiCall);
                await new Promise(resolve => setTimeout(resolve, waitTime));
            }
            
            const url = `https://api.synthdata.co/insights/lp-bounds-chart?asset=${asset}`;
            
            // Update last API call timestamp BEFORE making the request
            this.lastLPBoundsApiCall = Date.now();
            
            const response = await fetch(url, {
                headers: {
                    'Authorization': `Apikey ${process.env.SYNTH_API_KEY}`,
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error(`[LPBoundsCache] API Error: ${response.status} - ${errorText}`);
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            // Ensure timestamp is still updated even on error to maintain rate limiting
            if (this.lastLPBoundsApiCall === 0) {
                this.lastLPBoundsApiCall = Date.now();
            }
            console.error(`[LPBoundsCache] Error fetching LP bounds for ${asset}:`, error);
            throw error;
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════════
    // 📸 SNAPSHOT STORAGE METHODS
    // ═══════════════════════════════════════════════════════════════════════════════

    private async loadSnapshots(): Promise<void> {
        try {
            // Ensure directory exists
            const dir = path.dirname(this.SNAPSHOT_FILE_PATH);
            await fs.mkdir(dir, { recursive: true });

            // Check if file exists
            try {
                await fs.access(this.SNAPSHOT_FILE_PATH);
                const data = await fs.readFile(this.SNAPSHOT_FILE_PATH, 'utf-8');
                const parsed = JSON.parse(data) as SnapshotStorage;
                
                // Validate version
                if (parsed.version === '1.0' && parsed.snapshots) {
                    this.lpBoundsSnapshots = parsed;
                    console.warn(`[SnapshotStorage] Loaded ${parsed.snapshots.BTC.length} BTC and ${parsed.snapshots.ETH.length} ETH snapshots`);
                    
                    // Clean old snapshots on load
                    this.cleanOldSnapshots();
                }
            } catch (error) {
                // File doesn't exist yet, use default
                console.warn('[SnapshotStorage] No existing snapshot file found, starting fresh');
            }
        } catch (error) {
            console.error('[SnapshotStorage] Error loading snapshots:', error);
        }
    }

    private async saveSnapshots(): Promise<void> {
        try {
            const dir = path.dirname(this.SNAPSHOT_FILE_PATH);
            await fs.mkdir(dir, { recursive: true });
            
            await fs.writeFile(
                this.SNAPSHOT_FILE_PATH, 
                JSON.stringify(this.lpBoundsSnapshots, null, 2),
                'utf-8'
            );
            
            console.warn(`[SnapshotStorage] Saved ${this.lpBoundsSnapshots.snapshots.BTC.length} BTC and ${this.lpBoundsSnapshots.snapshots.ETH.length} ETH snapshots`);
        } catch (error) {
            console.error('[SnapshotStorage] Error saving snapshots:', error);
        }
    }

    private addSnapshot(asset: 'BTC' | 'ETH', bounds: any): void {
        const snapshot: LPBoundsSnapshot = {
            timestamp: Date.now(),
            bounds
        };
        
        this.lpBoundsSnapshots.snapshots[asset].push(snapshot);
        console.warn(`[SnapshotStorage] Added ${asset} snapshot, total: ${this.lpBoundsSnapshots.snapshots[asset].length}`);
        
        // Clean old snapshots
        this.cleanOldSnapshots();
        
        // Save to file
        this.saveSnapshots().catch(error => {
            console.error('[SnapshotStorage] Failed to save after adding snapshot:', error);
        });
    }

    private cleanOldSnapshots(): void {
        const cutoffTime = Date.now() - this.SNAPSHOT_RETENTION_MS;
        
        for (const asset of ['BTC', 'ETH'] as const) {
            const before = this.lpBoundsSnapshots.snapshots[asset].length;
            this.lpBoundsSnapshots.snapshots[asset] = this.lpBoundsSnapshots.snapshots[asset].filter(
                snapshot => snapshot.timestamp > cutoffTime
            );
            const after = this.lpBoundsSnapshots.snapshots[asset].length;
            
            if (before > after) {
                console.warn(`[SnapshotStorage] Cleaned ${before - after} old ${asset} snapshots`);
            }
        }
    }

    public getHistoricalBounds(asset: 'BTC' | 'ETH', hoursAgo: number = 24): LPBoundsSnapshot | null {
        const targetTime = Date.now() - (hoursAgo * 60 * 60 * 1000);
        const snapshots = this.lpBoundsSnapshots.snapshots[asset];
        
        if (snapshots.length === 0) {
            console.warn(`[SnapshotStorage] No ${asset} snapshots available`);
            return null;
        }
        
        // Find the snapshot closest to target time
        let closestSnapshot = snapshots[0];
        let closestDiff = Math.abs(snapshots[0].timestamp - targetTime);
        
        for (const snapshot of snapshots) {
            const diff = Math.abs(snapshot.timestamp - targetTime);
            if (diff < closestDiff) {
                closestDiff = diff;
                closestSnapshot = snapshot;
            }
        }
        
        const ageHours = (Date.now() - closestSnapshot.timestamp) / (1000 * 60 * 60);
        console.warn(`[SnapshotStorage] Using ${asset} snapshot from ${ageHours.toFixed(1)}h ago for percentile calculation`);
        
        return closestSnapshot;
    }

    public async getPercentileTimeSeries(asset: 'BTC' | 'ETH', currentPrice: number): Promise<PercentileAnalysis> {
        const now = Date.now();
        const threeHoursAgo = now - (3 * 60 * 60 * 1000);
        const twentyFourHoursAgo = now - (24 * 60 * 60 * 1000);
        
        // Filter snapshots in 3h-24h window
        const snapshots = this.lpBoundsSnapshots.snapshots[asset].filter(
            snapshot => snapshot.timestamp >= twentyFourHoursAgo && snapshot.timestamp <= threeHoursAgo
        );
        
        if (snapshots.length === 0) {
            console.warn(`[PercentileAnalysis] No snapshots available in 3h-24h window for ${asset}`);
            // Return default analysis
            return {
                asset,
                currentPrice,
                dataPoints: [],
                min: 50,
                max: 50,
                average: 50,
                median: 50,
                trend: 'stable',
                trendStrength: 0,
                currentPercentile: 50,
                range: 0
            };
        }
        
        // Import required functions
        const { convertProbabilitiesToPercentiles, calculatePricePercentile } = await import('./synth-utils');
        
        // Calculate percentile for current price in each historical snapshot
        const dataPoints = snapshots.map(snapshot => {
            const percentileData = convertProbabilitiesToPercentiles(snapshot.bounds);
            const percentile = calculatePricePercentile(currentPrice, percentileData);
            const hoursAgo = (now - snapshot.timestamp) / (1000 * 60 * 60);
            
            return {
                timestamp: snapshot.timestamp,
                percentile,
                hoursAgo
            };
        }).sort((a, b) => a.timestamp - b.timestamp); // Sort by time ascending
        
        // Calculate statistics
        const percentiles = dataPoints.map(dp => dp.percentile);
        const min = Math.min(...percentiles);
        const max = Math.max(...percentiles);
        const average = percentiles.reduce((sum, p) => sum + p, 0) / percentiles.length;
        const range = max - min;
        
        // Calculate median
        const sortedPercentiles = [...percentiles].sort((a, b) => a - b);
        const median = sortedPercentiles.length % 2 === 0
            ? (sortedPercentiles[sortedPercentiles.length / 2 - 1] + sortedPercentiles[sortedPercentiles.length / 2]) / 2
            : sortedPercentiles[Math.floor(sortedPercentiles.length / 2)];
        
        // Calculate trend using linear regression
        const { trend, trendStrength } = this.calculateTrend(dataPoints);
        
        // Current percentile is from the most recent snapshot (closest to 3h ago)
        const currentPercentile = dataPoints.length > 0 ? dataPoints[dataPoints.length - 1].percentile : 50;
        
        console.warn(`[PercentileAnalysis] ${asset} at $${currentPrice.toFixed(0)}: P${currentPercentile} (range: P${min}-P${max}, avg: P${average.toFixed(0)}, trend: ${trend})`);
        
        return {
            asset,
            currentPrice,
            dataPoints,
            min,
            max,
            average,
            median,
            trend,
            trendStrength,
            currentPercentile,
            range
        };
    }
    
    private calculateTrend(dataPoints: Array<{ timestamp: number; percentile: number }>): { trend: 'rising' | 'falling' | 'stable'; trendStrength: number } {
        if (dataPoints.length < 2) {
            return { trend: 'stable', trendStrength: 0 };
        }
        
        // Simple linear regression
        const n = dataPoints.length;
        let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
        
        // Use hours as X values for easier interpretation
        const firstTime = dataPoints[0].timestamp;
        dataPoints.forEach((dp, i) => {
            const x = (dp.timestamp - firstTime) / (1000 * 60 * 60); // Hours since first point
            const y = dp.percentile;
            
            sumX += x;
            sumY += y;
            sumXY += x * y;
            sumXX += x * x;
        });
        
        // Calculate slope
        const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
        
        // Calculate R-squared for trend strength
        const avgY = sumY / n;
        let ssTotal = 0, ssResidual = 0;
        
        dataPoints.forEach((dp, i) => {
            const x = (dp.timestamp - firstTime) / (1000 * 60 * 60);
            const y = dp.percentile;
            const yPredicted = (slope * x) + (sumY - slope * sumX) / n;
            
            ssTotal += (y - avgY) ** 2;
            ssResidual += (y - yPredicted) ** 2;
        });
        
        const rSquared = 1 - (ssResidual / ssTotal);
        const trendStrength = Math.abs(rSquared);
        
        // Determine trend based on slope
        // Slope is in percentile points per hour
        let trend: 'rising' | 'falling' | 'stable';
        if (Math.abs(slope) < 0.5) { // Less than 0.5 percentile points per hour
            trend = 'stable';
        } else if (slope > 0) {
            trend = 'rising';
        } else {
            trend = 'falling';
        }
        
        console.warn(`[PercentileAnalysis] Trend: ${trend} (slope: ${slope.toFixed(2)} pp/hour, R²: ${rSquared.toFixed(3)})`);
        
        return { trend, trendStrength };
    }

    public hasMinimumSnapshotData(minSnapshots: number = 10, minHours: number = 6): { BTC: boolean; ETH: boolean } {
        const now = Date.now();
        const minHoursAgo = now - (minHours * 60 * 60 * 1000);
        
        const result = { BTC: false, ETH: false };
        
        for (const asset of ['BTC', 'ETH'] as const) {
            const snapshots = this.lpBoundsSnapshots.snapshots[asset];
            
            // Check we have minimum number of snapshots
            const hasMinCount = snapshots.length >= minSnapshots;
            
            // Check we have data going back minimum hours
            const oldestSnapshot = snapshots.length > 0 ? Math.min(...snapshots.map(s => s.timestamp)) : now;
            const hasMinAge = oldestSnapshot <= minHoursAgo;
            
            result[asset] = hasMinCount && hasMinAge;
            
            console.warn(`[DataAvailability] ${asset}: ${snapshots.length} snapshots, oldest: ${((now - oldestSnapshot) / (1000 * 60 * 60)).toFixed(1)}h ago, sufficient: ${result[asset]}`);
        }
        
        return result;
    }

    // ═══════════════════════════════════════════════════════════════════════════════
    // 🖺 CACHE MANAGEMENT METHODS
    // ═══════════════════════════════════════════════════════════════════════════════

    invalidateAll(): void {
        console.warn('[EnhancedCache] Invalidating all caches');
        this.invalidateMarkets();
        this.invalidateTokens();
        this.invalidatePositions();
        this.invalidateVolatility();
        this.invalidateLPBounds();
    }

    invalidateMarkets(): void {
        console.warn('[EnhancedCache] Invalidating market cache');
        this.marketCache.clear();
        this.lastMarketFetch = 0;
        this.marketFetchPromise = null;
    }

    invalidateTokens(): void {
        console.warn('[EnhancedCache] Invalidating token cache');
        this.tokenCache.clear();
        this.lastTokenFetch = 0;
        this.tokenFetchPromise = null;
    }

    invalidatePositions(): void {
        console.warn('[EnhancedCache] Invalidating position caches');
        this.positionCache.clear();
        this.positionInfoCache.clear();
        this.lastPositionFetch = 0;
        this.lastPositionInfoFetch = 0;
        this.positionFetchPromise = null;
        this.positionInfoFetchPromise = null;
    }

    invalidateVolatility(): void {
        console.warn('[EnhancedCache] Invalidating volatility cache');
        this.volatilityCache.clear();
        this.lastVolatilityFetch.clear();
        this.volatilityFetchPromises.clear();
    }

    invalidateLPBounds(): void {
        console.warn('[EnhancedCache] Invalidating LP bounds cache');
        this.lpBoundsCache.clear();
        this.lastLPBoundsFetch.clear();
        this.lpBoundsFetchPromises.clear();
    }

    getCacheAges(): { markets: number, tokens: number, positions: number, positionsInfo: number} {
        const now = Date.now();
        return {
            markets: now - this.lastMarketFetch,
            tokens: now - this.lastTokenFetch,
            positions: now - this.lastPositionFetch,
            positionsInfo: now - this.lastPositionInfoFetch
        };
    }

    getCacheStatus(): { 
        markets: boolean, 
        tokens: boolean, 
        positions: boolean, 
        positionsInfo: boolean
    } {
        const now = Date.now();
        return {
            markets: this.marketCache.has("markets") && (now - this.lastMarketFetch) < this.MARKET_TTL_MS,
            tokens: this.tokenCache.has("tokens") && (now - this.lastTokenFetch) < this.TOKEN_TTL_MS,
            positions: this.positionCache.has("positions") && (now - this.lastPositionFetch) < this.POSITION_TTL_MS,
            positionsInfo: this.positionInfoCache.has("positionsInfo") && (now - this.lastPositionInfoFetch) < this.POSITION_INFO_TTL_MS
        };
    }
}
