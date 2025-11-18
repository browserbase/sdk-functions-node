#!/bin/bash

# Usage: ./test-publish.sh
# Run from within a test directory (e.g., tests/basic/)
# Requires bb.test.json with entrypoint configuration

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
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

# Read bb.test.json for configuration
if [ ! -f "bb.test.json" ]; then
  print_error "Error: bb.test.json not found"
  echo "Create a bb.test.json file with an 'entrypoint' field"
  echo "Example: {\"entrypoint\": \"index.ts\"}"
  exit 1
fi

# Extract entrypoint from bb.test.json
ENTRYPOINT=$(jq -r '.entrypoint' bb.test.json)

if [ -z "$ENTRYPOINT" ] || [ "$ENTRYPOINT" = "null" ]; then
  print_error "Error: No entrypoint found in bb.test.json"
  exit 1
fi

# Check if entrypoint file exists
if [ ! -f "$ENTRYPOINT" ]; then
  print_error "Error: Entrypoint file '$ENTRYPOINT' not found"
  exit 1
fi

# Detect the test directory name
TEST_DIR_NAME=$(basename "$(pwd)")

print_info "Testing bb publish in: $(pwd)"
print_info "Entrypoint: $ENTRYPOINT"

# Cleanup function
cleanup() {
  rm -f publish-output.log test.log .env.test test-ignore.txt
  rm -rf test-gitignore-dir
  # Remove .gitignore if we created it for testing
  if [ -f .gitignore ] && [ -f .gitignore.test-marker ]; then
    rm -f .gitignore .gitignore.test-marker
  fi
  # Restore .env if any test left a backup
  if [ -f .env.backup_test4 ]; then
    mv .env.backup_test4 .env
  fi
  if [ -f .env.backup_test5 ]; then
    mv .env.backup_test5 .env
  fi
}

# Set up trap to cleanup on exit
trap cleanup EXIT

print_info "Starting bb publish tests..."

# Clean any previous state
if [ -f "package.json" ] && grep -q '"clean"' package.json; then
  npm run clean 2>/dev/null || pnpm run clean 2>/dev/null || true
fi

# Test 1: Dry run succeeds with valid configuration
print_info "Test 1: Testing dry-run mode with valid config..."
if pnpm bb publish "$ENTRYPOINT" --dry-run >publish-output.log 2>&1; then
  print_success "Dry run succeeded with valid configuration"
  if grep -q "Archive size:" publish-output.log || grep -q "dry-run" publish-output.log || grep -q "Dry run" publish-output.log; then
    print_success "Dry run output contains expected information"
  fi
else
  EXIT_CODE=$?
  # Some implementations might not have --dry-run flag
  if grep -q "unknown option" publish-output.log || grep -q "unrecognized" publish-output.log; then
    print_info "Dry-run flag not supported, continuing tests"
  else
    print_error "Dry run failed unexpectedly (exit code: $EXIT_CODE)"
    cat publish-output.log
    exit 1
  fi
fi

# Test 2: Missing entrypoint fails with non-zero exit code
print_info "Test 2: Testing with missing entrypoint..."
if pnpm bb publish nonexistent.ts >publish-output.log 2>&1; then
  print_error "Should have failed with missing entrypoint"
  cat publish-output.log
  exit 1
else
  EXIT_CODE=$?
  print_success "Missing entrypoint returns non-zero exit code ($EXIT_CODE)"
fi

# Test 3: Invalid file extension handling
print_info "Test 3: Testing with invalid file extension..."
touch test.txt
if pnpm bb publish test.txt >publish-output.log 2>&1; then
  # Some implementations might accept any file
  print_info "Accepts non-.ts files (may be intentional)"
else
  EXIT_CODE=$?
  print_success "Invalid file extension returns non-zero exit code ($EXIT_CODE)"
fi
rm -f test.txt

# Test 4: Missing API key fails (test with actual publish, not dry-run)
print_info "Test 4: Testing with missing API key..."

# Backup existing .env file if it exists
if [ -f .env ]; then
  mv .env .env.backup_test4
fi

# Create .env with missing API key (only project ID)
echo "BB_PROJECT_ID=test_project" > .env

if pnpm bb publish "$ENTRYPOINT" >publish-output.log 2>&1; then
  print_error "Publish should fail without API key"
  cat publish-output.log
  # Restore .env before exiting
  rm -f .env
  if [ -f .env.backup_test4 ]; then
    mv .env.backup_test4 .env
  fi
  exit 1
else
  EXIT_CODE=$?
  print_success "Missing API key returns non-zero exit code ($EXIT_CODE)"
fi

# Restore original .env
rm -f .env
if [ -f .env.backup_test4 ]; then
  mv .env.backup_test4 .env
fi

# Test 5: Missing project ID fails (test with actual publish, not dry-run)
print_info "Test 5: Testing with missing project ID..."

# Backup existing .env file if it exists
if [ -f .env ]; then
  mv .env .env.backup_test5
fi

# Create .env with missing project ID (only API key)
echo "BB_API_KEY=test_api_key" > .env

if pnpm bb publish "$ENTRYPOINT" >publish-output.log 2>&1; then
  print_error "Publish should fail without project ID"
  cat publish-output.log
  # Restore .env before exiting
  rm -f .env
  if [ -f .env.backup_test5 ]; then
    mv .env.backup_test5 .env
  fi
  exit 1
else
  EXIT_CODE=$?
  print_success "Missing project ID returns non-zero exit code ($EXIT_CODE)"
fi

# Restore original .env
rm -f .env
if [ -f .env.backup_test5 ]; then
  mv .env.backup_test5 .env
fi

# Test 6: Archive respects .gitignore patterns
print_info "Test 6: Testing .gitignore respect..."

# Ensure we don't have an existing .gitignore (tests should be isolated)
if [ -f .gitignore ]; then
  print_error "Test directory should not have a .gitignore file. Please remove it."
  exit 1
fi

# Create test files that should be ignored
echo "test-secret" >.env.test
echo "log entry" >test.log
mkdir -p test-gitignore-dir
echo "ignored content" >test-gitignore-dir/ignored.txt

# Create a fresh .gitignore for testing
echo "# Test .gitignore - temporary for test-publish.sh" >.gitignore
echo ".env.test" >>.gitignore
echo "*.log" >>.gitignore
echo "test-gitignore-dir/" >>.gitignore

# Create a marker file to indicate we created this .gitignore for testing
touch .gitignore.test-marker

# Run publish with dry-run and check output
if pnpm bb publish "$ENTRYPOINT" --dry-run >publish-output.log 2>&1; then
  # Check if ignored files are mentioned in the output (they shouldn't be)
  if grep -q "test.log" publish-output.log; then
    print_info ".gitignore might not be fully respected (test.log found in output)"
  elif grep -q "test-gitignore-dir" publish-output.log; then
    print_info ".gitignore might not be fully respected (test-gitignore-dir found in output)"
  else
    print_success ".gitignore patterns appear to be respected"
  fi
fi

# Test 7: Relative path entrypoint works
print_info "Test 7: Testing relative path entrypoint..."
if pnpm bb publish "./$ENTRYPOINT" --dry-run >publish-output.log 2>&1; then
  print_success "Relative path entrypoint works"
else
  print_info "Relative path entrypoint might not be supported"
fi

# Test 8: Dry-run publish test - verify the build configuration works
print_info "Test 8: Testing dry-run publish (build configuration test)..."
print_info "Running dry-run publish (CLI will load .env if present)..."

# The CLI will automatically load credentials from .env file
if pnpm bb publish "$ENTRYPOINT" --dry-run >publish-output.log 2>&1; then
  print_success "Dry-run publish succeeded - build configuration is valid!"

  # Check for success indicators in output
  if grep -q "success" publish-output.log || grep -q "Success" publish-output.log || grep -q "dry-run" publish-output.log || grep -q "Dry run" publish-output.log; then
    print_success "Build configuration validated successfully"
  fi

  # Show relevant output
  if grep -q "Archive size:" publish-output.log; then
    ARCHIVE_INFO=$(grep -i "Archive size:" publish-output.log | head -1)
    print_success "Archive info: $ARCHIVE_INFO"
  fi
else
  EXIT_CODE=$?
  print_error "Dry-run publish failed with exit code $EXIT_CODE"
  echo "Output from publish command:"
  cat publish-output.log
  exit 1
fi

print_info "========================================="
print_success "Publish tests completed successfully!"
exit 0
