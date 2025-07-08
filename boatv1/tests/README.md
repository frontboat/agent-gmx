# GMX Trading Agent Tests

This directory contains comprehensive tests for the enhanced GMX trading agent, demonstrating all the native Daydreams AI features.

## 🧪 Test Structure

```
tests/
├── agent-enhanced.test.ts    # Unit tests for individual features
├── integration.test.ts       # Integration tests with real OpenRouter API
├── mocks/                    # Mock implementations
│   ├── gmx-sdk-mock.ts      # Mock GMX SDK
│   ├── queries-mock.ts      # Mock query functions
│   └── supabase-mock.ts     # Mock Supabase memory
└── run-tests.sh             # Test runner script
```

## 🏃 Running Tests

### Quick Start
```bash
# Run all tests
bun test

# Run specific test file
bun test tests/integration.test.ts

# Run with watch mode
bun run test:watch
```

### With Real OpenRouter API
```bash
# Set your API key
export OPENROUTER_API_KEY=your-actual-key

# Run tests
bun test
```

## 📋 Test Coverage

### 1. **TaskRunner Tests**
- ✅ Concurrent market data fetching
- ✅ Retry logic for failed tasks
- ✅ Timeout handling

### 2. **Evaluator Tests**
- ✅ Profit target validation (2% minimum)
- ✅ Risk/reward ratio enforcement (2:1 minimum)
- ✅ Drawdown prevention (15% maximum)

### 3. **Event System Tests**
- ✅ Position opened/closed events
- ✅ Risk alert emissions
- ✅ Market signal events

### 4. **Memory Management Tests**
- ✅ Working memory trimming
- ✅ Episodic memory storage
- ✅ Performance metrics tracking

### 5. **Service Lifecycle Tests**
- ✅ Service boot/stop procedures
- ✅ Connection management

### 6. **Integration Tests**
- ✅ Real AI market analysis (requires API key)
- ✅ Trade validation with evaluators
- ✅ Concurrent operations

## 🔍 What's Being Tested

### Unit Tests (`agent-enhanced.test.ts`)
Tests individual components in isolation:
- Verifies TaskRunner executes tasks concurrently
- Ensures evaluators correctly validate/reject trades
- Confirms events are emitted properly
- Validates memory management functions

### Integration Tests (`integration.test.ts`)
Tests the full system with real OpenRouter API:
- AI analyzes mock market data and makes decisions
- Actions are called based on AI reasoning
- Evaluators validate AI-proposed trades
- Concurrent operations work end-to-end

## 🎭 Mocking Strategy

All external dependencies are mocked:
- **GMX SDK**: Returns realistic market data, positions, and orders
- **Supabase**: In-memory storage for testing
- **Market Data**: Consistent test data for reproducible results

Only the OpenRouter API uses real calls when an API key is provided.

## 📊 Example Test Output

```
🧪 Running Enhanced GMX Agent Tests...
=====================================

🏃 Running test suite...
✓ TaskRunner - Concurrent Operations > should fetch market data concurrently
✓ TaskRunner - Concurrent Operations > should retry failed tasks
✓ TaskRunner - Concurrent Operations > should handle task timeout
✓ Evaluators - Trade Validation > profit target evaluator should validate trades
✓ Event System > should emit position opened events
✓ Working Memory Management > should trim working memory to prevent overflow
✓ Integration Test > should create agent with all enhanced features

✅ All tests passed!
```

## 🔧 Debugging Tests

Enable debug logging in tests:
```typescript
logger: new Logger({ level: LogLevel.DEBUG })
```

Run a single test:
```bash
bun test -t "should fetch market data concurrently"
```

## 📝 Writing New Tests

1. Add test to appropriate file
2. Use existing mocks for consistency
3. Keep tests focused and fast
4. Document what's being tested

Example:
```typescript
test('should validate new feature', async () => {
    // Arrange
    const mockData = createMockData();
    
    // Act
    const result = await performAction(mockData);
    
    // Assert
    expect(result).toBeDefined();
    expect(result.success).toBe(true);
});
```