#!/bin/bash

echo "🧪 Running Enhanced GMX Agent Tests..."
echo "=====================================\n"

# Check if OPENROUTER_API_KEY is set
if [ -z "$OPENROUTER_API_KEY" ]; then
    echo "⚠️  Warning: OPENROUTER_API_KEY not set. Using mock API key."
    echo "   For real API testing, set: export OPENROUTER_API_KEY=your-key"
    echo ""
fi

# Get the directory of this script
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$( cd "$SCRIPT_DIR/../.." && pwd )"

# Create test directories if they don't exist
mkdir -p "$SCRIPT_DIR/training"

# Run tests with bun from project root
echo "🏃 Running test suite..."
cd "$PROJECT_ROOT"

# Run all test files in boatv1/tests directory
echo "📁 Running unit tests..."
bun test "$SCRIPT_DIR/agent-enhanced.test.ts" --timeout 30000

echo -e "\n📁 Running integration tests..."
bun test "$SCRIPT_DIR/integration-fixed.test.ts" --timeout 60000

# Check test results
if [ $? -eq 0 ]; then
    echo -e "\n✅ All tests passed!"
else
    echo -e "\n❌ Some tests failed!"
    exit 1
fi

# Clean up test artifacts
rm -rf "$SCRIPT_DIR/training/*"

echo -e "\n🎉 Test run complete!"