#!/bin/bash

# Usage: ./run-all-tests.sh
# Discovers and runs all tests in subdirectories that have bb.test.json

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Function to print colored output
print_success() {
  echo -e "${GREEN}✅ $1${NC}"
}

print_error() {
  echo -e "${RED}❌ $1${NC}"
}

print_info() {
  echo -e "${YELLOW}ℹ️  $1${NC}"
}

print_header() {
  echo -e "${BLUE}════════════════════════════════════════${NC}"
  echo -e "${BLUE}▶ $1${NC}"
  echo -e "${BLUE}════════════════════════════════════════${NC}"
}

print_test_header() {
  echo -e "${CYAN}╔════════════════════════════════════════╗${NC}"
  echo -e "${CYAN}║ TEST: $1${NC}"
  echo -e "${CYAN}╚════════════════════════════════════════╝${NC}"
}

# Get the directory of this script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Track test results
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=()

print_header "Browserbase SDK Tests Runner"
print_info "Discovering test directories..."

# Find all directories with bb.test.json
TEST_DIRS=()
for dir in "$SCRIPT_DIR"/*/; do
  if [ -f "$dir/bb.test.json" ]; then
    TEST_NAME=$(basename "$dir")
    TEST_DIRS+=("$TEST_NAME")
  fi
done

if [ ${#TEST_DIRS[@]} -eq 0 ]; then
  print_error "No test directories found with bb.test.json"
  exit 1
fi

print_info "Found ${#TEST_DIRS[@]} test(s): ${TEST_DIRS[*]}"
echo ""

# Run tests for each directory
for test_dir in "${TEST_DIRS[@]}"; do
  TOTAL_TESTS=$((TOTAL_TESTS + 1))
  print_test_header "$test_dir"

  cd "$SCRIPT_DIR/$test_dir"

  # Read test description if available
  if command -v jq >/dev/null 2>&1 && [ -f "bb.test.json" ]; then
    DESCRIPTION=$(jq -r '.description // ""' bb.test.json)
    if [ -n "$DESCRIPTION" ] && [ "$DESCRIPTION" != "null" ]; then
      print_info "Description: $DESCRIPTION"
    fi
  fi

  # Run the test
  if "$SCRIPT_DIR/test-all.sh"; then
    print_success "Test '$test_dir' PASSED"
    PASSED_TESTS=$((PASSED_TESTS + 1))
  else
    print_error "Test '$test_dir' FAILED"
    FAILED_TESTS+=("$test_dir")
  fi

  echo ""
done

# Final summary
print_header "Test Results Summary"
echo "Total tests run: $TOTAL_TESTS"
echo "Passed: $PASSED_TESTS"
echo "Failed: ${#FAILED_TESTS[@]}"

if [ ${#FAILED_TESTS[@]} -gt 0 ]; then
  echo ""
  print_error "Failed tests:"
  for failed in "${FAILED_TESTS[@]}"; do
    echo "  - $failed"
  done
  echo ""
  print_error "TESTS FAILED"
  exit 1
else
  echo ""
  print_success "ALL TESTS PASSED! 🎉"
  exit 0
fi