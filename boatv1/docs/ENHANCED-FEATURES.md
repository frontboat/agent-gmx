# Enhanced GMX Trading Agent - Native Daydreams Features

This enhanced version of the GMX trading agent leverages advanced native features from the Daydreams AI framework for improved performance, reliability, and learning capabilities.

## 🚀 New Features Implemented

### 1. **Concurrent Task Execution (TaskRunner)**
- Fetches market data, positions, and predictions concurrently
- Configurable concurrency limits (default: 5 tasks)
- Automatic retry logic for failed operations
- Timeout handling for long-running tasks

### 2. **Trade Validation (Evaluators)**
- **Profit Target Evaluator**: Ensures trades meet minimum 2% profit target
- **Risk/Reward Evaluator**: Validates 2:1 risk/reward ratio minimum
- **Drawdown Evaluator**: Prevents trading during excessive drawdown (>15%)
- Automatic failure callbacks for learning from rejected trades

### 3. **Event-Driven Architecture**
- **Position Events**: `positionOpened`, `positionClosed`
- **Profit Events**: `profitTargetHit`, `stopLossTriggered`
- **Risk Alerts**: `riskAlert` for drawdown, leverage, correlation warnings
- **Market Signals**: `marketSignal` for trading opportunities

### 4. **Working Memory Optimization**
- Automatic memory trimming to prevent overflow
- Configurable retention limits:
  - 20 thoughts
  - 10 inputs/outputs
  - 50 trading actions
- Efficient memory usage during long trading sessions

### 5. **Episodic Learning System**
- Stores successful and failed trade patterns
- Tracks performance metrics:
  - Win rate
  - Total profit/loss
  - Sharpe ratio
  - Maximum drawdown
- Learns from past experiences for improved decision-making

### 6. **Service Lifecycle Management**
- **GMX Connection Service**: Manages SDK lifecycle
- **Market Data Service**: Handles real-time price feeds
- Graceful startup/shutdown procedures
- Health monitoring and recovery

### 7. **Multi-Model Support**
- **Main Model**: Claude Sonnet 4 for trading decisions
- **Reasoning Model**: Gemini 2.5 Flash for technical analysis
- **Vector Model**: GPT-4 Mini for embeddings
- Model-specific temperature and settings

### 8. **Training Data Export**
- Automatic capture of successful trading strategies
- Exports to `./training/successful-trades`
- Episode-based learning format
- Performance analysis data

## 📊 Performance Monitoring

The enhanced agent provides real-time performance metrics every 5 minutes:
- Total trades executed
- Win rate percentage
- Total profit in USD
- Current drawdown percentage

## 🏃 Running the Enhanced Agent

```bash
# Install dependencies
bun install

# Run the enhanced agent
bun run start:enhanced

# Or in development mode
bun run dev:enhanced
```

## 🔧 Configuration

The enhanced agent uses the same environment variables as the original, with these additions:

```env
# All original env vars plus:
# No additional env vars needed - all features use existing configuration
```

## 📈 Benefits

1. **Improved Performance**: Concurrent operations reduce latency
2. **Better Reliability**: Retry logic and error recovery
3. **Risk Management**: Built-in evaluators prevent bad trades
4. **Learning Capability**: Episodic memory improves over time
5. **Real-time Alerts**: Event system for immediate notifications
6. **Resource Efficiency**: Memory optimization prevents crashes
7. **Professional Architecture**: Service-based design for maintainability

## 🚨 Monitoring

The enhanced agent logs additional information:
- Task execution times
- Evaluation results
- Event emissions
- Performance metrics
- Memory usage

## 🔍 Debugging

Enable debug logging to see detailed operation:
```typescript
logger: new Logger({ level: LogLevel.DEBUG })
```

## 📝 Notes

- The enhanced agent is backward compatible with existing actions
- All original trading logic remains intact
- New features are additive, not breaking
- Performance overhead is minimal despite additional features