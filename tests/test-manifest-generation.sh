#!/bin/bash

# Usage: ./test-manifest-generation.sh <entrypoint> [expected-dir]
# Run from within a test directory (e.g., tests/basic/)
# Tests manifest generation against expected outputs
#
# Arguments:
#   entrypoint    - Required: The entrypoint file to test (e.g., index.ts)
#   expected-dir  - Optional: Directory containing expected manifests (defaults to 'expected')

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

# Function to compare JSON files
compare_json_files() {
  local file1="$1"
  local file2="$2"

  # Check if jq is available for better JSON comparison
  if command -v jq >/dev/null 2>&1; then
    # Use jq to normalize and compare JSON
    if ! diff -q <(jq -S . "$file1" 2>/dev/null) <(jq -S . "$file2" 2>/dev/null) >/dev/null 2>&1; then
      return 1
    fi
  else
    # Fallback to basic diff
    if ! diff -q "$file1" "$file2" >/dev/null 2>&1; then
      return 1
    fi
  fi
  return 0
}

# Check if entrypoint argument is provided
if [ $# -eq 0 ]; then
  print_error "Error: Entrypoint file argument is required"
  echo "Usage: $0 <entrypoint> [expected-dir]"
  echo "Example: $0 index.ts"
  echo "Run this script from within a test directory"
  exit 1
fi

# Get entrypoint from argument
ENTRYPOINT="$1"

# Get expected directory (default to 'expected')
EXPECTED_DIR="${2:-expected}"

# Check if entrypoint file exists
if [ ! -f "$ENTRYPOINT" ]; then
  print_error "Error: Entrypoint file '$ENTRYPOINT' not found"
  echo "Usage: $0 <entrypoint> [expected-dir]"
  echo "Run this script from within a test directory"
  exit 1
fi

# Check if expected directory exists
if [ ! -d "$EXPECTED_DIR" ]; then
  print_error "Error: Expected directory '$EXPECTED_DIR' not found"
  echo "This test requires an 'expected' directory with reference manifests"
  exit 1
fi

# Detect the test directory name
TEST_DIR_NAME=$(basename "$(pwd)")
TEST_BASE_DIR=$(dirname "$(pwd)")

print_header "Manifest Generation Test"
print_info "Test directory: $TEST_DIR_NAME"
print_info "Entrypoint: $ENTRYPOINT"
print_info "Expected manifests: $EXPECTED_DIR/"

# Cleanup function
cleanup() {
  # Keep .browserbase directory for debugging if test fails
  if [ "$TEST_FAILED" != "1" ]; then
    rm -rf .browserbase 2>/dev/null || true
  fi
}

# Set up trap to cleanup on exit
trap cleanup EXIT

# Initialize test status
TEST_FAILED=0

print_info "Running manifest generation..."

# Step 1: Clean any existing .browserbase directory
print_info "Cleaning existing .browserbase directory..."
rm -rf .browserbase 2>/dev/null || true

# Step 2: Run introspection to generate manifests
print_info "Running introspection phase..."
if BB_FUNCTIONS_PHASE=introspect pnpm tsx "$ENTRYPOINT" 2>/dev/null; then
  print_success "Introspection completed successfully"
else
  print_error "Introspection failed"
  exit 1
fi

# Step 3: Verify manifests were created
if [ ! -d ".browserbase/functions/manifests" ]; then
  print_error "No manifest directory created at .browserbase/functions/manifests"
  exit 1
fi

# Count generated manifests
MANIFEST_COUNT=$(find .browserbase/functions/manifests -name "*.json" -type f | wc -l | tr -d ' ')
if [ "$MANIFEST_COUNT" -eq 0 ]; then
  print_error "No manifest files were generated"
  exit 1
fi
print_info "Generated $MANIFEST_COUNT manifest(s)"

# Step 4: Compare manifests with expected
print_info "Comparing generated manifests with expected..."

# Get list of expected and generated files
EXPECTED_FILES=$(cd "$EXPECTED_DIR" && find . -name "*.json" -type f | sort)
GENERATED_FILES=$(cd .browserbase/functions/manifests && find . -name "*.json" -type f | sort)

# Check if same files exist in both directories
if [ "$EXPECTED_FILES" != "$GENERATED_FILES" ]; then
  print_error "Different manifest files generated"
  echo ""
  echo "Expected files:"
  for f in $EXPECTED_FILES; do
    echo "  $f"
  done
  echo ""
  echo "Generated files:"
  for f in $GENERATED_FILES; do
    echo "  $f"
  done
  TEST_FAILED=1
  echo ""
  echo "Keeping .browserbase directory for debugging"
  exit 1
fi

# Compare each file's content
COMPARISON_FAILED=0
for file in $EXPECTED_FILES; do
  EXPECTED_FILE="$EXPECTED_DIR/$file"
  GENERATED_FILE=".browserbase/functions/manifests/$file"

  if ! compare_json_files "$EXPECTED_FILE" "$GENERATED_FILE"; then
    print_error "Manifest content differs: $file"

    # Show the difference
    echo ""
    if command -v jq >/dev/null 2>&1; then
      echo "Expected (formatted):"
      jq -S . "$EXPECTED_FILE" 2>/dev/null || cat "$EXPECTED_FILE"
      echo ""
      echo "Generated (formatted):"
      jq -S . "$GENERATED_FILE" 2>/dev/null || cat "$GENERATED_FILE"
      echo ""
      echo "Diff:"
      diff <(jq -S . "$EXPECTED_FILE" 2>/dev/null) <(jq -S . "$GENERATED_FILE" 2>/dev/null) || true
    else
      echo "Diff:"
      diff "$EXPECTED_FILE" "$GENERATED_FILE" || true
    fi
    echo ""
    COMPARISON_FAILED=1
  else
    print_success "Manifest matches: $file"
  fi
done

if [ $COMPARISON_FAILED -eq 0 ]; then
  print_success "All manifests match expected!"
else
  TEST_FAILED=1
  echo "Keeping .browserbase directory for debugging"
  exit 1
fi

# Step 5: Report success
print_header "Test Summary"
print_success "Manifest generation test completed successfully!"
print_info "All generated manifests match the expected output"

exit 0

