import { type GmxSdk } from "@gmx-io/sdk";
import * as fs from 'fs/promises';
import * as path from 'path';

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


    public async getMergedPercentileBounds(asset: 'BTC' | 'ETH', currentPrice: number): Promise<{ percentile: number; mergedBounds: { timestamp: string; percentiles: Array<{ price: number; percentile: number }> } } | null> {
        const now = Date.now();
        const twentyThreeHoursAgo = now - (23 * 60 * 60 * 1000);
        const twentyFourHoursAgo = now - (24 * 60 * 60 * 1000);
        
        // Filter snapshots in 24h-23h window (one hour window from exactly 24h ago to 23h ago)
        const snapshots = this.lpBoundsSnapshots.snapshots[asset].filter(
            snapshot => snapshot.timestamp >= twentyFourHoursAgo && snapshot.timestamp <= twentyThreeHoursAgo
        );
        
        if (snapshots.length === 0) {
            console.warn(`[MergedPercentile] No snapshots available in 24h-23h window for ${asset}`);
            return null;
        }

        // Merge all probability_below data from all snapshots into a single unified range
        const allPriceLevels = new Map<number, number[]>(); // price -> array of probability_below values
        
        snapshots.forEach(snapshot => {
            const probabilityBelow = snapshot.bounds.data['24h'].probability_below;
            Object.entries(probabilityBelow).forEach(([priceStr, probBelow]) => {
                const price = parseFloat(priceStr);
                if (!allPriceLevels.has(price)) {
                    allPriceLevels.set(price, []);
                }
                allPriceLevels.get(price)!.push(probBelow);
            });
        });

        // Create merged percentile bounds by averaging probability values at each price level
        const mergedPercentiles: Array<{ price: number; percentile: number }> = [];
        allPriceLevels.forEach((probabilities, price) => {
            const avgProbability = probabilities.reduce((sum, prob) => sum + prob, 0) / probabilities.length;
            const percentile = avgProbability * 100; // Convert to percentage
            mergedPercentiles.push({ price, percentile });
        });

        // Sort by price (ascending)
        mergedPercentiles.sort((a, b) => a.price - b.price);

        // Calculate current price percentile within merged bounds
        let currentPercentile = 50; // default

        if (mergedPercentiles.length > 0) {
            // Find which percentile band the current price falls into
            if (currentPrice <= mergedPercentiles[0].price) {
                // Below all predictions
                currentPercentile = 0;
            } else if (currentPrice >= mergedPercentiles[mergedPercentiles.length - 1].price) {
                // Above all predictions
                currentPercentile = 100;
            } else {
                // Interpolate between percentile bands
                for (let i = 0; i < mergedPercentiles.length - 1; i++) {
                    const lowerBand = mergedPercentiles[i];
                    const upperBand = mergedPercentiles[i + 1];
                    
                    if (currentPrice >= lowerBand.price && currentPrice <= upperBand.price) {
                        const priceDiff = upperBand.price - lowerBand.price;
                        const levelDiff = upperBand.percentile - lowerBand.percentile;
                        
                        if (priceDiff > 0) {
                            const fraction = (currentPrice - lowerBand.price) / priceDiff;
                            currentPercentile = Math.round(lowerBand.percentile + (fraction * levelDiff));
                        } else {
                            currentPercentile = Math.round(lowerBand.percentile);
                        }
                        break;
                    }
                }
            }
        }

        console.warn(`[MergedPercentile] ${asset} at $${currentPrice.toFixed(0)}: P${currentPercentile} from ${snapshots.length} snapshots`);

        // Create merged percentile data structure for formatSynthAnalysisSimplified
        const mergedPercentileData = {
            timestamp: new Date().toISOString(),
            percentiles: mergedPercentiles
        };

        return {
            percentile: currentPercentile,
            mergedBounds: mergedPercentileData
        };
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
