/**
 * Mock GMX SDK for testing
 */

export class MockGmxSdk {
    account: string;
    
    constructor(config: any) {
        this.account = config.account || '0x1234567890123456789012345678901234567890';
    }
    
    setAccount(address: string) {
        this.account = address;
    }
    
    markets = {
        getMarkets: async () => ({
            data: {
                'BTC/USD': {
                    marketAddress: '0xBTC123456789',
                    indexTokenAddress: '0xBTC',
                    longTokenAddress: '0xWETH',
                    shortTokenAddress: '0xUSDC',
                    indexPrice: '65000000000000000000000000000000000',
                    fundingRate: '0.00001',
                    openInterestLong: '50000000000',
                    openInterestShort: '45000000000'
                },
                'ETH/USD': {
                    marketAddress: '0xETH123456789',
                    indexTokenAddress: '0xETH',
                    longTokenAddress: '0xWETH',
                    shortTokenAddress: '0xUSDC',
                    indexPrice: '3500000000000000000000000000000000',
                    fundingRate: '0.00002',
                    openInterestLong: '30000000000',
                    openInterestShort: '28000000000'
                }
            }
        }),
        
        getMarketTokenPrice: async (marketAddress: string) => ({
            min: '1000000',
            max: '1000000'
        })
    };
    
    positions = {
        getPositions: async () => ([
            {
                marketAddress: '0xBTC123456789',
                isLong: true,
                sizeInUsd: '10000000000',
                collateralAmount: '2000000000',
                averagePrice: '64000000000000000000000000000000000',
                unrealizedPnl: '150000000',
                liquidationPrice: '58000000000000000000000000000000000'
            }
        ]),
        
        getPositionInfo: async (account: string, marketAddress: string, isLong: boolean) => ({
            position: {
                sizeInUsd: '10000000000',
                collateralAmount: '2000000000'
            }
        })
    };
    
    orders = {
        getOrders: async () => ([
            {
                marketAddress: '0xETH123456789',
                isLong: false,
                orderType: 2, // Limit order
                sizeInUsd: '5000000000',
                triggerPrice: '3600000000000000000000000000000000',
                createdAt: Date.now() - 3600000 // 1 hour ago
            }
        ])
    };
    
    tokens = {
        getTokens: async () => ({
            '0xUSDC': {
                symbol: 'USDC',
                decimals: 6,
                address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831'
            },
            '0xWETH': {
                symbol: 'WETH',
                decimals: 18,
                address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1'
            },
            '0xBTC': {
                symbol: 'BTC',
                decimals: 8,
                address: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f'
            }
        })
    };
    
    reader = {
        getAccountBalances: async (account: string) => ({
            '0xUSDC': '50000000000', // 50k USDC
            '0xWETH': '10000000000000000', // 0.01 ETH
            '0xBTC': '0'
        }),
        
        getMarketInfo: async (marketAddress: string) => ({
            market: {
                marketToken: marketAddress,
                indexToken: '0xBTC',
                longToken: '0xWETH',
                shortToken: '0xUSDC'
            }
        })
    };
    
    // Mock order execution
    createOrder = async (params: any) => ({
        txHash: '0x' + Math.random().toString(16).substring(2),
        orderKey: '0x' + Math.random().toString(16).substring(2)
    });
    
    createSwapOrder = async (params: any) => ({
        txHash: '0x' + Math.random().toString(16).substring(2),
        orderKey: '0x' + Math.random().toString(16).substring(2)
    });
    
    cancelOrder = async (orderKey: string) => ({
        txHash: '0x' + Math.random().toString(16).substring(2),
        success: true
    });
}

// Mock market data for technical analysis
export const mockMarketCandles = {
    BTC: {
        '15m': Array(100).fill(0).map((_, i) => ({
            time: Date.now() - (100 - i) * 15 * 60 * 1000,
            open: 64000 + Math.random() * 2000,
            high: 65000 + Math.random() * 1000,
            low: 63000 + Math.random() * 1000,
            close: 64500 + Math.random() * 1500,
            volume: 1000000 + Math.random() * 500000
        })),
        '1h': Array(100).fill(0).map((_, i) => ({
            time: Date.now() - (100 - i) * 60 * 60 * 1000,
            open: 64000 + Math.random() * 2000,
            high: 65000 + Math.random() * 1000,
            low: 63000 + Math.random() * 1000,
            close: 64500 + Math.random() * 1500,
            volume: 5000000 + Math.random() * 2000000
        }))
    },
    ETH: {
        '15m': Array(100).fill(0).map((_, i) => ({
            time: Date.now() - (100 - i) * 15 * 60 * 1000,
            open: 3400 + Math.random() * 200,
            high: 3500 + Math.random() * 100,
            low: 3300 + Math.random() * 100,
            close: 3450 + Math.random() * 150,
            volume: 500000 + Math.random() * 200000
        })),
        '1h': Array(100).fill(0).map((_, i) => ({
            time: Date.now() - (100 - i) * 60 * 60 * 1000,
            open: 3400 + Math.random() * 200,
            high: 3500 + Math.random() * 100,
            low: 3300 + Math.random() * 100,
            close: 3450 + Math.random() * 150,
            volume: 2000000 + Math.random() * 1000000
        }))
    }
};