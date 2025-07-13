// ═══════════════════════════════════════════════════════════════════════════════
// 🔄 TRANSACTION QUEUE SYSTEM
// ═══════════════════════════════════════════════════════════════════════════════

export enum TransactionType {
    WRITE = 'write',
    READ_AFTER_WRITE = 'read_after_write'
}

export interface QueuedTransaction {
    id: string;
    name: string;
    type: TransactionType;
    execute: () => Promise<any>;
    resolve: (value: any) => void;
    reject: (error: any) => void;
    timestamp: number;
}

export class TransactionQueue {
    private static instance: TransactionQueue;
    private queue: QueuedTransaction[] = [];
    private isProcessing: boolean = false;
    private readonly TRANSACTION_DELAY_MS = 3000; // 3 seconds between transactions

    private constructor() {}

    public static getInstance(): TransactionQueue {
        if (!TransactionQueue.instance) {
            TransactionQueue.instance = new TransactionQueue();
        }
        return TransactionQueue.instance;
    }

    /**
     * Add a write transaction to the queue
     */
    public async enqueueWriteTransaction<T>(
        name: string, 
        executeFunction: () => Promise<T>
    ): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            const transaction: QueuedTransaction = {
                id: `${name}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                name,
                type: TransactionType.WRITE,
                execute: executeFunction,
                resolve,
                reject,
                timestamp: Date.now()
            };

            this.queue.push(transaction);
            console.warn(`[QUEUE] Added transaction: ${name} (Queue size: ${this.queue.length})`);
            
            // Start processing if not already running
            if (!this.isProcessing) {
                this.processQueue();
            }
        });
    }

    /**
     * Add a read operation that needs fresh data after writes to the queue
     */
    public async enqueueReadAfterWrite<T>(
        name: string, 
        executeFunction: () => Promise<T>
    ): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            const transaction: QueuedTransaction = {
                id: `${name}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                name,
                type: TransactionType.READ_AFTER_WRITE,
                execute: executeFunction,
                resolve,
                reject,
                timestamp: Date.now()
            };

            this.queue.push(transaction);
            console.warn(`[QUEUE] Added read-after-write: ${name} (Queue size: ${this.queue.length})`);
            
            // Start processing if not already running
            if (!this.isProcessing) {
                this.processQueue();
            }
        });
    }

    /**
     * Process the queue sequentially
     */
    private async processQueue(): Promise<void> {
        if (this.isProcessing || this.queue.length === 0) {
            return;
        }

        this.isProcessing = true;
        console.warn(`[QUEUE] Starting to process ${this.queue.length} transactions`);

        while (this.queue.length > 0) {
            const transaction = this.queue.shift()!;
            
            try {
                console.warn(`[QUEUE] Executing: ${transaction.name} (ID: ${transaction.id})`);
                const startTime = Date.now();
                
                // Execute the transaction
                const result = await transaction.execute();
                
                const executionTime = Date.now() - startTime;
                console.warn(`[QUEUE] Completed: ${transaction.name} in ${executionTime}ms`);
                
                // Resolve the promise
                transaction.resolve(result);
                
                // Wait after write transactions before processing next transaction
                // This prevents nonce conflicts and rate limiting
                if (this.queue.length > 0 && transaction.type === TransactionType.WRITE) {
                    console.warn(`[QUEUE] Waiting ${this.TRANSACTION_DELAY_MS}ms after write transaction before next`);
                    await this.sleep(this.TRANSACTION_DELAY_MS);
                }
                
            } catch (error) {
                console.error(`[QUEUE] Failed: ${transaction.name} - ${error}`);
                transaction.reject(error);
                
                // Wait after failed write transactions to avoid overwhelming the network
                if (this.queue.length > 0 && transaction.type === TransactionType.WRITE) {
                    console.warn(`[QUEUE] Waiting ${this.TRANSACTION_DELAY_MS}ms after failed write transaction`);
                    await this.sleep(this.TRANSACTION_DELAY_MS);
                }
            }
        }

        this.isProcessing = false;
        console.warn(`[QUEUE] Queue processing completed`);
    }

    /**
     * Get current queue status
     */
    public getStatus(): {
        queueLength: number;
        isProcessing: boolean;
        nextTransaction?: string;
    } {
        return {
            queueLength: this.queue.length,
            isProcessing: this.isProcessing,
            nextTransaction: this.queue[0]?.name
        };
    }

    /**
     * Clear the queue (emergency stop)
     */
    public clearQueue(): void {
        const clearedCount = this.queue.length;
        this.queue.forEach(transaction => {
            transaction.reject(new Error('Queue cleared'));
        });
        this.queue = [];
        console.warn(`[QUEUE] Cleared ${clearedCount} pending transactions`);
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Export singleton instance
export const transactionQueue = TransactionQueue.getInstance();