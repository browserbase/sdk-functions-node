#!/bin/bash

# Usage: ./test-dev.sh
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

# Detect the test directory name and expected function names
TEST_DIR_NAME=$(basename "$(pwd)")

# Try to detect function names from the entrypoint file
FUNCTION_NAMES=()
if [ -f "$ENTRYPOINT" ]; then
  # Extract function names from defineFn calls
  while IFS= read -r func_name; do
    FUNCTION_NAMES+=("$func_name")
  done < <(grep -o 'defineFn\s*(\s*["'"'"']\([^"'"'"']*\)' "$ENTRYPOINT" | sed 's/.*["'"'"']\(.*\)/\1/')
fi

# If no functions found, use the directory name as default
if [ ${#FUNCTION_NAMES[@]} -eq 0 ]; then
  FUNCTION_NAMES=("$TEST_DIR_NAME")
fi

PRIMARY_FUNCTION="${FUNCTION_NAMES[0]}"

print_info "Testing dev server in: $(pwd)"
print_info "Entrypoint: $ENTRYPOINT"
print_info "Detected functions: ${FUNCTION_NAMES[*]}"
print_info "Primary function for testing: $PRIMARY_FUNCTION"

# Cleanup function
cleanup() {
  # Short circuit if no port defined
  if [ -z "$PORT" ]; then
    rm -f dev-server.log dev-response.json
    return
  fi

  # Kill any process listening on the port using lsof
  print_info "Cleaning up any process on port $PORT..."
  PIDS=$(lsof -t -i:$PORT 2>/dev/null)
  if [ ! -z "$PIDS" ]; then
    for pid in $PIDS; do
      print_info "Killing process $pid on port $PORT..."
      kill $pid 2>/dev/null || true
      sleep 0.5
      kill -9 $pid 2>/dev/null || true
    done
  fi

  rm -f dev-server.log dev-response.json
}

# Set up trap to cleanup on exit
trap cleanup EXIT

print_info "Starting bb dev server tests..."

# Find an available port (starting from 14113)
BASE_PORT=14113
PORT=$BASE_PORT
MAX_PORT_ATTEMPTS=10
for i in $(seq 0 $MAX_PORT_ATTEMPTS); do
  if ! nc -z 127.0.0.1 $PORT 2>/dev/null; then
    print_info "Using port $PORT for dev server"
    break
  else
    print_info "Port $PORT is in use, trying next port..."
    PORT=$((BASE_PORT + i + 1))
  fi
done

if [ $PORT -eq $((BASE_PORT + MAX_PORT_ATTEMPTS + 1)) ]; then
  print_error "Could not find an available port after $MAX_PORT_ATTEMPTS attempts"
  exit 1
fi

# Start dev server in background
print_info "Starting dev server with 'pnpm bb dev $ENTRYPOINT --port $PORT'..."
pnpm bb dev "$ENTRYPOINT" --port "$PORT" >dev-server.log 2>&1 &

# If the port flag doesn't work, check the log for "already in use" and retry with different port
sleep 2
if grep -q "Port.*is already in use" dev-server.log 2>/dev/null; then
  print_info "Port conflict detected, incrementing port and retrying..."
  PORT=$((PORT + 1))
  print_info "Trying with port $PORT..."

  # Retry with new port
  pnpm bb dev "$ENTRYPOINT" --port "$PORT" >dev-server.log 2>&1 &
fi

# Wait for server to be ready (check for up to 30 seconds)
# Now that we have a healthcheck endpoint at /, we can properly check for server readiness
MAX_WAIT=30
WAIT_COUNT=0
print_info "Waiting for server to start on port $PORT..."

while [ $WAIT_COUNT -lt $MAX_WAIT ]; do
  # First check if any process is listening on the port (faster than curl)
  if lsof -i:$PORT >/dev/null 2>&1; then
    # Process is listening, now try to hit the healthcheck endpoint
    HEALTH_CHECK=$(curl -s "http://127.0.0.1:$PORT/" 2>/dev/null)
    if echo "$HEALTH_CHECK" | grep -q '"ok":true' 2>/dev/null; then
      print_success "Server healthcheck responded on port $PORT"
      break
    fi
  else
    # No process listening on port - check if server crashed
    # Give it a few seconds before declaring it dead (it might still be starting)
    if [ $WAIT_COUNT -gt 3 ]; then
      print_error "Dev server process died unexpectedly (no process listening on port $PORT)"
      echo ""
      echo "Full server logs:"
      echo "================="
      cat dev-server.log
      echo "================="
      exit 1
    fi
  fi

  sleep 1
  WAIT_COUNT=$((WAIT_COUNT + 1))

  # Provide progress updates with better error detection
  if [ $WAIT_COUNT -eq 3 ]; then
    # Check for common startup errors
    if grep -q "Error\|error\|ERROR\|Failed\|failed\|FAILED\|Cannot\|cannot" dev-server.log 2>/dev/null; then
      print_error "Startup errors detected in server log:"
      echo ""
      grep -i "error\|failed\|cannot" dev-server.log | head -5
      echo ""
      echo "Full server logs:"
      echo "================="
      cat dev-server.log
      echo "================="
      exit 1
    fi
  elif [ $WAIT_COUNT -eq 5 ]; then
    print_info "Still waiting for server to start (attempt $WAIT_COUNT/$MAX_WAIT)..."
  elif [ $WAIT_COUNT -eq 10 ]; then
    print_info "Server taking longer than expected (attempt $WAIT_COUNT/$MAX_WAIT)..."
    echo "Recent server logs:"
    tail -10 dev-server.log
  elif [ $WAIT_COUNT -eq 20 ]; then
    print_info "Still trying to connect (attempt $WAIT_COUNT/$MAX_WAIT)..."
    # Try to see if server is listening on our port
    echo "Checking if anything is listening on port $PORT:"
    lsof -i:$PORT 2>/dev/null | grep LISTEN || echo "  No process found listening on port $PORT"
  fi
done

if [ $WAIT_COUNT -eq $MAX_WAIT ]; then
  print_error "Dev server failed to start within $MAX_WAIT seconds"
  echo ""
  echo "Full server logs:"
  echo "================="
  cat dev-server.log
  echo "================="
  exit 1
fi

print_success "Dev server started successfully on port $PORT"

# Wait for function to be registered (poll for non-404 response)
print_info "Waiting for function '$PRIMARY_FUNCTION' to be registered..."
FUNCTION_READY_WAIT=15  # Wait up to 15 seconds for function registration
FUNCTION_WAIT_COUNT=0

while [ $FUNCTION_WAIT_COUNT -lt $FUNCTION_READY_WAIT ]; do
  # Try to invoke the function and check if it's registered (non-404)
  FUNC_STATUS=$(curl -s -w "%{http_code}" -X POST "http://127.0.0.1:$PORT/v1/functions/$PRIMARY_FUNCTION/invoke" \
    -H "Content-Type: application/json" \
    -H "x-bb-api-key: ${BB_API_KEY}" \
    -d '{"params": {}}' \
    -o /dev/null 2>/dev/null)

  # If we get anything other than 404, the function is registered
  if [ "$FUNC_STATUS" != "404" ] && [ -n "$FUNC_STATUS" ]; then
    print_success "Function '$PRIMARY_FUNCTION' is registered and ready (status: $FUNC_STATUS)"
    break
  fi

  sleep 0.5
  FUNCTION_WAIT_COUNT=$((FUNCTION_WAIT_COUNT + 1))

  # Show progress every 3 seconds
  if [ $((FUNCTION_WAIT_COUNT % 6)) -eq 0 ]; then
    echo "  Still waiting for function to register... ($FUNCTION_WAIT_COUNT seconds)"
  fi
done

if [ $FUNCTION_WAIT_COUNT -eq $FUNCTION_READY_WAIT ]; then
  print_error "Function '$PRIMARY_FUNCTION' was not registered within $FUNCTION_READY_WAIT seconds"
  echo "Server logs:"
  tail -30 dev-server.log
  exit 1
fi

# Test 1: Server healthcheck endpoint
print_info "Test 1: Checking server healthcheck endpoint..."
HEALTH_RESPONSE=$(curl -s "http://127.0.0.1:$PORT/" 2>/dev/null)
if echo "$HEALTH_RESPONSE" | grep -q '"ok":true' 2>/dev/null; then
  print_success "Server healthcheck endpoint working correctly"
else
  print_error "Server healthcheck not responding correctly"
  echo "Expected: {\"ok\":true}"
  echo "Got: $HEALTH_RESPONSE"
  echo "Server logs:"
  tail -20 dev-server.log
  exit 1
fi

# Test 2: Invoke the primary function
print_info "Test 2: Invoking '$PRIMARY_FUNCTION' function..."
HTTP_STATUS=$(curl -s -w "%{http_code}" -X POST "http://127.0.0.1:$PORT/v1/functions/$PRIMARY_FUNCTION/invoke" \
  -H "Content-Type: application/json" \
  -H "x-bb-api-key: ${BB_API_KEY}" \
  -d '{"params": {}}' \
  -o dev-response.json)

if [ "$HTTP_STATUS" = "200" ] || [ "$HTTP_STATUS" = "201" ]; then
  print_success "Function invocation succeeded (HTTP $HTTP_STATUS)"
  if [ -f dev-response.json ] && [ -s dev-response.json ]; then
    echo "  Response: $(cat dev-response.json | head -c 200)"
  fi
else
  print_error "Function invocation failed (HTTP $HTTP_STATUS)"
  if [ -f dev-response.json ]; then
    echo "Response: $(cat dev-response.json)"
  fi
  echo "Server logs:"
  tail -20 dev-server.log
  exit 1
fi

# Test 3: Test all detected functions if multiple
if [ ${#FUNCTION_NAMES[@]} -gt 1 ]; then
  print_info "Testing additional functions..."
  for func in "${FUNCTION_NAMES[@]:1}"; do
    print_info "  Invoking '$func' function..."
    HTTP_STATUS=$(curl -s -w "%{http_code}" -X POST "http://127.0.0.1:$PORT/v1/functions/$func/invoke" \
      -H "Content-Type: application/json" \
      -H "x-bb-api-key: ${BB_API_KEY}" \
      -d '{"params": {}}' \
      -o dev-response-$func.json)

    if [ "$HTTP_STATUS" = "200" ] || [ "$HTTP_STATUS" = "201" ]; then
      print_success "  Function '$func' invocation succeeded"
    else
      print_error "  Function '$func' invocation failed (HTTP $HTTP_STATUS)"
    fi
    rm -f dev-response-$func.json
  done
fi

# Test 3: Invalid function returns 404
print_info "Test 3: Testing invalid function endpoint..."
INVALID_STATUS=$(curl -s -w "%{http_code}" -X POST \
  "http://127.0.0.1:$PORT/v1/functions/nonexistent/invoke" \
  -H "Content-Type: application/json" \
  -H "x-bb-api-key: ${BB_API_KEY}" \
  -d '{"params": {}}' \
  -o /dev/null)

if [ "$INVALID_STATUS" = "404" ]; then
  print_success "Invalid function correctly returns 404"
elif [ "$INVALID_STATUS" = "400" ] || [ "$INVALID_STATUS" = "422" ]; then
  # Some servers return 400/422 for invalid requests
  print_success "Invalid function returns error status ($INVALID_STATUS)"
else
  print_info "Invalid function endpoint returned $INVALID_STATUS (expected 404)"
fi

print_info "========================================="
print_success "Dev server tests completed successfully!"
exit 0
