/**
 * Mock Supabase memory for testing
 */

export function createMockSupabaseMemory() {
    const memoryStore = new Map<string, any>();
    const vectorStore = new Map<string, any[]>();
    
    return {
        store: {
            get: async <T>(key: string): Promise<T | null> => {
                return memoryStore.get(key) || null;
            },
            
            set: async <T>(key: string, value: T): Promise<void> => {
                memoryStore.set(key, value);
            },
            
            delete: async (key: string): Promise<void> => {
                memoryStore.delete(key);
            },
            
            clear: async (): Promise<void> => {
                memoryStore.clear();
            },
            
            keys: async (base?: string): Promise<string[]> => {
                const allKeys = Array.from(memoryStore.keys());
                if (base) {
                    return allKeys.filter(key => key.startsWith(base));
                }
                return allKeys;
            }
        },
        
        vector: {
            upsert: async (contextId: string, data: any): Promise<void> => {
                const existing = vectorStore.get(contextId) || [];
                existing.push(data);
                vectorStore.set(contextId, existing);
            },
            
            query: async (contextId: string, query: string): Promise<any[]> => {
                // Simple mock - return all stored vectors for the context
                return vectorStore.get(contextId) || [];
            },
            
            createIndex: async (indexName: string): Promise<void> => {
                // Mock implementation
            },
            
            deleteIndex: async (indexName: string): Promise<void> => {
                vectorStore.delete(indexName);
            }
        },
        
        vectorModel: {
            // Mock vector model
            doEmbed: async (options: any) => ({
                embedding: Array(1536).fill(0).map(() => Math.random())
            })
        },
        
        generateMemories: true
    };
}