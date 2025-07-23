import { type GmxSdk } from "@gmx-io/sdk";
import { fetchSynthData } from './synth-utils';

// Enhanced cache for all GMX data types and external APIs
export class EnhancedDataCache {
    // Market data cache
    private marketCache: Map<string, { marketsInfoData: any, tokensData: any }> = new Map();
    private lastMarketFetch: number = 0;
    private readonly MARKET_TTL_MS = 300_000; // 5 minutes
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

    // Synth AI cache - stores consolidated arrays
    private synthCache: Map<string, any[]> = new Map();
    private synthLastFetch: Map<string, number> = new Map();
    private readonly SYNTH_TTL_MS = 300_000; // 5 minutes
    private synthFetchPromises: Map<string, Promise<any[]>> = new Map();
    
    // Synth percentile cache - stores dashboard percentile data
    private synthPercentileCache: Map<string, any> = new Map();
    private synthPercentileLastFetch: Map<string, number> = new Map();
    private readonly SYNTH_PERCENTILE_TTL_MS = 300_000; // 5 minutes
    private synthPercentileFetchPromises: Map<string, Promise<any>> = new Map();
    
    // Synth past percentile cache - stores historical percentile data with actual price
    private synthPastPercentileCache: Map<string, any> = new Map();
    private synthPastPercentileLastFetch: Map<string, number> = new Map();
    private readonly SYNTH_PAST_PERCENTILE_TTL_MS = 300_000; // 5 minutes
    private synthPastPercentileFetchPromises: Map<string, Promise<any>> = new Map();

    constructor(private sdk: GmxSdk) {}

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
    // 🤖 SYNTH AI API METHODS
    // ═══════════════════════════════════════════════════════════════════════════════

    // Get cached consolidated array (raw data)
    async getSynthConsolidatedArray(asset: 'BTC' | 'ETH', forceRefresh = false): Promise<any[]> {
        const now = Date.now();
        const cacheKey = `synth_${asset}`;
        const lastFetch = this.synthLastFetch.get(cacheKey) || 0;

        // Return cached data if still valid
        if (!forceRefresh && this.synthCache.has(cacheKey) && (now - lastFetch) < this.SYNTH_TTL_MS) {
            console.warn(`[SynthCache] Returning cached ${asset} consolidated array (age: ${now - lastFetch}ms, ttl: ${this.SYNTH_TTL_MS}ms)`);
            return this.synthCache.get(cacheKey)!;
        }

        // If a fetch is already in progress, return that promise
        const existingPromise = this.synthFetchPromises.get(cacheKey);
        if (existingPromise) {
            console.warn(`[SynthCache] Returning in-progress ${asset} consolidated array fetch`);
            return existingPromise;
        }

        // Start new fetch
        console.warn(`[SynthCache] Fetching fresh ${asset} consolidated array`);
        const fetchPromise = this.fetchSynthConsolidatedArray(asset);
        this.synthFetchPromises.set(cacheKey, fetchPromise);

        try {
            const consolidatedArray = await fetchPromise;
            this.synthCache.set(cacheKey, consolidatedArray);
            this.synthLastFetch.set(cacheKey, now);
            console.warn(`[SynthCache] ${asset} consolidated array cached at ${now} (timeSlots: ${consolidatedArray.length})`);
            return consolidatedArray;
        } finally {
            this.synthFetchPromises.delete(cacheKey);
        }
    }

    // Get cached Synth percentile data (dashboard data)
    async getSynthPercentileData(asset: 'BTC' | 'ETH', forceRefresh = false): Promise<any> {
        const now = Date.now();
        const cacheKey = `synth_percentile_${asset}`;
        const lastFetch = this.synthPercentileLastFetch.get(cacheKey) || 0;

        // Return cached data if still valid
        if (!forceRefresh && this.synthPercentileCache.has(cacheKey) && (now - lastFetch) < this.SYNTH_PERCENTILE_TTL_MS) {
            return this.synthPercentileCache.get(cacheKey)!;
        }

        // If a fetch is already in progress, return that promise
        const existingPromise = this.synthPercentileFetchPromises.get(cacheKey);
        if (existingPromise) {
            return existingPromise;
        }

        // Start new fetch
        const fetchPromise = this.fetchSynthPercentileData(asset);
        this.synthPercentileFetchPromises.set(cacheKey, fetchPromise);

        try {
            const percentileData = await fetchPromise;
            this.synthPercentileCache.set(cacheKey, percentileData);
            this.synthPercentileLastFetch.set(cacheKey, now);
            return percentileData;
        } finally {
            this.synthPercentileFetchPromises.delete(cacheKey);
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

    private async fetchSynthConsolidatedArray(asset: 'BTC' | 'ETH'): Promise<any[]> {
        try {
            // Use the exported function from queries
            const consolidatedArray = await fetchSynthData(asset);
            return consolidatedArray;
        } catch (error) {
            console.error(`[SynthCache] Failed to fetch ${asset} consolidated array:`, error);
            // Return cached data if available, otherwise empty array
            const cacheKey = `synth_${asset}`;
            const cachedData = this.synthCache.get(cacheKey);
            if (cachedData && Array.isArray(cachedData)) {
                console.warn(`[SynthCache] Returning stale ${asset} consolidated array due to fetch error`);
                return cachedData;
            }
            return [];
        }
    }

    // Get cached Synth past percentile data (historical data with actual price)
    async getSynthPastPercentileData(asset: 'BTC' | 'ETH', forceRefresh = false): Promise<any> {
        const now = Date.now();
        const cacheKey = `synth_past_percentile_${asset}`;
        const lastFetch = this.synthPastPercentileLastFetch.get(cacheKey) || 0;

        // Return cached data if still valid
        if (!forceRefresh && this.synthPastPercentileCache.has(cacheKey) && (now - lastFetch) < this.SYNTH_PAST_PERCENTILE_TTL_MS) {
            return this.synthPastPercentileCache.get(cacheKey)!;
        }

        // If a fetch is already in progress, return that promise
        const existingPromise = this.synthPastPercentileFetchPromises.get(cacheKey);
        if (existingPromise) {
            return existingPromise;
        }

        // Start new fetch
        const fetchPromise = this.fetchSynthPastPercentileData(asset);
        this.synthPastPercentileFetchPromises.set(cacheKey, fetchPromise);

        try {
            const pastPercentileData = await fetchPromise;
            this.synthPastPercentileCache.set(cacheKey, pastPercentileData);
            this.synthPastPercentileLastFetch.set(cacheKey, now);
            return pastPercentileData;
        } finally {
            this.synthPastPercentileFetchPromises.delete(cacheKey);
        }
    }

    private async fetchSynthPastPercentileData(asset: 'BTC' | 'ETH'): Promise<any> {
        try {
            // Import fetchSynthPastPercentileData from synth-utils
            const { fetchSynthPastPercentileData } = await import('./synth-utils');
            const dashboardResponse = await fetchSynthPastPercentileData(asset);
            return dashboardResponse;
        } catch (error: any) {
            // Handle rate limiting and API errors
            if (error.message?.includes('429') || error.message?.includes('Too Many Requests')) {
                throw new Error(`Synth API rate limited for ${asset} past data. Please wait before retrying.`);
            }
            if (error.message?.includes('403') || error.message?.includes('Forbidden')) {
                throw new Error(`Synth API access denied for ${asset} past data. Check authentication or permissions.`);
            }
            if (error.message?.includes('500') || error.message?.includes('502') || error.message?.includes('503')) {
                throw new Error(`Synth API server error for ${asset} past data. Service may be temporarily unavailable.`);
            }
            if (error.message?.includes('timeout')) {
                throw new Error(`Synth API timeout for ${asset} past data. Network or server may be slow.`);
            }
            
            // For other errors, try to return cached data as fallback
            const cacheKey = `synth_past_percentile_${asset}`;
            const cachedData = this.synthPastPercentileCache.get(cacheKey);
            if (cachedData) {
                console.warn(`[SynthPastPercentileCache] Using stale ${asset} past percentile data due to fetch error:`, error.message);
                return cachedData;
            }
            
            // If no cache available, throw descriptive error
            throw new Error(`Failed to fetch Synth past percentile data for ${asset}: ${error.message}`);
        }
    }

    private async fetchSynthPercentileData(asset: 'BTC' | 'ETH'): Promise<any> {
        try {
            // Import fetchSynthPercentileData from synth-utils
            const { fetchSynthPercentileData } = await import('./synth-utils');
            const dashboardResponse = await fetchSynthPercentileData(asset);
            return dashboardResponse;
        } catch (error: any) {
            // Handle rate limiting and API errors
            if (error.message?.includes('429') || error.message?.includes('Too Many Requests')) {
                throw new Error(`Synth API rate limited for ${asset}. Please wait before retrying.`);
            }
            if (error.message?.includes('403') || error.message?.includes('Forbidden')) {
                throw new Error(`Synth API access denied for ${asset}. Check authentication or permissions.`);
            }
            if (error.message?.includes('500') || error.message?.includes('502') || error.message?.includes('503')) {
                throw new Error(`Synth API server error for ${asset}. Service may be temporarily unavailable.`);
            }
            if (error.message?.includes('timeout')) {
                throw new Error(`Synth API timeout for ${asset}. Network or server may be slow.`);
            }
            
            // For other errors, try to return cached data as fallback
            const cacheKey = `synth_percentile_${asset}`;
            const cachedData = this.synthPercentileCache.get(cacheKey);
            if (cachedData) {
                console.warn(`[SynthPercentileCache] Using stale ${asset} percentile data due to fetch error:`, error.message);
                return cachedData;
            }
            
            // If no cache available, throw descriptive error
            throw new Error(`Failed to fetch Synth percentile data for ${asset}: ${error.message}`);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════════
    // 🖺 CACHE MANAGEMENT METHODS
    // ═══════════════════════════════════════════════════════════════════════════════

    invalidateAll(): void {
        console.warn('[EnhancedCache] Invalidating all caches');
        this.invalidateMarkets();
        this.invalidateTokens();
        this.invalidatePositions();
        this.invalidateSynth();
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

    invalidateSynth(): void {
        console.warn('[EnhancedCache] Invalidating Synth cache');
        this.synthCache.clear();
        this.synthLastFetch.clear();
        this.synthFetchPromises.clear();
        this.synthPercentileCache.clear();
        this.synthPercentileLastFetch.clear();
        this.synthPercentileFetchPromises.clear();
        this.synthPastPercentileCache.clear();
        this.synthPastPercentileLastFetch.clear();
        this.synthPastPercentileFetchPromises.clear();
    }

    getCacheAges(): { markets: number, tokens: number, positions: number, positionsInfo: number } {
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
        positionsInfo: boolean,
        synth: { btc: boolean, eth: boolean },
        synthPercentile: { btc: boolean, eth: boolean },
        synthPastPercentile: { btc: boolean, eth: boolean }
    } {
        const now = Date.now();
        return {
            markets: this.marketCache.has("markets") && (now - this.lastMarketFetch) < this.MARKET_TTL_MS,
            tokens: this.tokenCache.has("tokens") && (now - this.lastTokenFetch) < this.TOKEN_TTL_MS,
            positions: this.positionCache.has("positions") && (now - this.lastPositionFetch) < this.POSITION_TTL_MS,
            positionsInfo: this.positionInfoCache.has("positionsInfo") && (now - this.lastPositionInfoFetch) < this.POSITION_INFO_TTL_MS,
            synth: {
                btc: this.synthCache.has("synth_BTC") && (now - (this.synthLastFetch.get("synth_BTC") || 0)) < this.SYNTH_TTL_MS,
                eth: this.synthCache.has("synth_ETH") && (now - (this.synthLastFetch.get("synth_ETH") || 0)) < this.SYNTH_TTL_MS
            },
            synthPercentile: {
                btc: this.synthPercentileCache.has("synth_percentile_BTC") && (now - (this.synthPercentileLastFetch.get("synth_percentile_BTC") || 0)) < this.SYNTH_PERCENTILE_TTL_MS,
                eth: this.synthPercentileCache.has("synth_percentile_ETH") && (now - (this.synthPercentileLastFetch.get("synth_percentile_ETH") || 0)) < this.SYNTH_PERCENTILE_TTL_MS
            },
            synthPastPercentile: {
                btc: this.synthPastPercentileCache.has("synth_past_percentile_BTC") && (now - (this.synthPastPercentileLastFetch.get("synth_past_percentile_BTC") || 0)) < this.SYNTH_PAST_PERCENTILE_TTL_MS,
                eth: this.synthPastPercentileCache.has("synth_past_percentile_ETH") && (now - (this.synthPastPercentileLastFetch.get("synth_past_percentile_ETH") || 0)) < this.SYNTH_PAST_PERCENTILE_TTL_MS
            }
        };
    }
}

