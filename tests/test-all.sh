#!/bin/bash

# Usage: ./test-all.sh [entrypoint]
# Run from within a test directory (e.g., tests/basic/)
# Runs all tests: manifest generation, dev server, and publish
# Optional: provide entrypoint file as argument (defaults to index.ts)

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
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

# Get entrypoint from argument (required)
if [ $# -eq 0 ]; then
  print_error "Error: No entrypoint specified"
  echo "Usage: $0 <entrypoint>"
  echo "Example: $0 index.ts"
  echo "Run this script from within a test directory"
  exit 1
fi

ENTRYPOINT="$1"

# Check if entrypoint exists
if [ ! -f "$ENTRYPOINT" ]; then
  print_error "Error: Entrypoint file '$ENTRYPOINT' not found"
  echo "Usage: $0 <entrypoint>"
  echo "Run this script from within a test directory"
  exit 1
fi

# Detect the test directory name
TEST_DIR_NAME=$(basename "$(pwd)")
TEST_BASE_DIR=$(dirname "$(pwd)")

print_header "Running all tests for: $TEST_DIR_NAME"
print_info "Entrypoint: $ENTRYPOINT"
print_info "Working directory: $(pwd)"

# Track overall test results
FAILED_TESTS=()

# Test 1: Manifest generation (if expected directory exists)
if [ -d "expected" ]; then
  print_header "Test 1: Manifest Generation"

  # Use the new test-manifest-generation.sh script
  if [ -f "$TEST_BASE_DIR/test-manifest-generation.sh" ]; then
    if "$TEST_BASE_DIR/test-manifest-generation.sh" "$ENTRYPOINT"; then
      print_success "Manifest generation test passed"
    else
      print_error "Manifest generation test failed"
      FAILED_TESTS+=("Manifest generation")
    fi
  else
    print_error "test-manifest-generation.sh not found"
    FAILED_TESTS+=("Manifest generation")
  fi
else
  print_info "No expected directory found, skipping manifest test"
fi

# Test 2: Dev server test
if [ -f "$TEST_BASE_DIR/test-dev.sh" ]; then
  print_header "Test 2: Development Server"

  if "$TEST_BASE_DIR/test-dev.sh" "$ENTRYPOINT"; then
    print_success "Dev server test passed"
  else
    print_error "Dev server test failed"
    FAILED_TESTS+=("Dev server")
  fi
else
  print_info "No test-dev.sh found, skipping dev server test"
fi

# Test 3: Publish test
if [ -f "$TEST_BASE_DIR/test-publish.sh" ]; then
  print_header "Test 3: Publish Command"

  if "$TEST_BASE_DIR/test-publish.sh" "$ENTRYPOINT"; then
    print_success "Publish test passed"
  else
    print_error "Publish test failed"
    FAILED_TESTS+=("Publish")
  fi
else
  print_info "No test-publish.sh found, skipping publish test"
fi

# Summary
print_header "Test Summary for $TEST_DIR_NAME"

if [ ${#FAILED_TESTS[@]} -eq 0 ]; then
  print_success "All tests passed! 🎉"
  exit 0
else
  print_error "Failed tests: ${FAILED_TESTS[*]}"
  exit 1
fi

