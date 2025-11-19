# Future Test Cases for SDK Functions Node

This document outlines additional test cases that should be implemented to ensure comprehensive testing of the SDK functionality.

## 1. Nested Entrypoint Test (`tests/nested-entrypoint/`)

**Purpose**: Test that functions defined in imported modules are properly discovered and registered during the introspection phase.

**Implementation**:

```typescript
// index.ts
import "./nested/functions.js";
import "./nested/deep/more-functions.js";

// nested/functions.ts
defineFn("nested-func1", async () => {
  /* ... */
});
defineFn("nested-func2", async () => {
  /* ... */
});

// nested/deep/more-functions.ts
defineFn("deep-nested-func", async () => {
  /* ... */
});
```

**Expected**: All 3 functions should generate manifests despite being in imported files.

## 2. Multiple Functions Test (`tests/multiple-functions/`)

**Purpose**: Test that multiple functions can be defined in a single entrypoint file.

**Implementation**:

```typescript
// index.ts
defineFn("func1", async () => ({ result: 1 }));
defineFn("func2", async () => ({ result: 2 }));
defineFn("func3", async () => ({ result: 3 }), {
  sessionConfig: { browserSettings: { advancedStealth: true } },
});
```

**Expected**:

- 3 separate manifest files generated
- Each function independently invocable via dev server
- Each function has correct configuration

## 3. Invalid Configuration Test (`tests/invalid-config/`)

**Purpose**: Negative testing to ensure proper error handling and non-zero exit codes.

**Test Cases**:

1. Missing entrypoint file
2. Invalid file extension (.txt, .json)
3. Syntax errors in TypeScript
4. Missing required environment variables
5. Invalid function names (special characters, reserved words)
6. Circular dependencies

**Expected**: All cases should return non-zero exit codes with clear error messages.

## 4. Complex Parameter Schema Test (`tests/complex-params/`)

**Purpose**: Test advanced Zod schema validation for function parameters.

**Implementation**:

```typescript
const ComplexSchema = z.object({
  nested: z.object({
    array: z.array(z.string()),
    optional: z.string().optional(),
  }),
  union: z.union([z.string(), z.number()]),
  enum: z.enum(["option1", "option2"]),
});

defineFn("complex-params", async (ctx, params) => {
  const validated = ComplexSchema.parse(params);
  return validated;
});
```

## 5. Error Handling Test (`tests/error-handling/`)

**Purpose**: Test that functions properly handle and report errors.

**Test Cases**:

1. Thrown errors in function body
2. Async rejection
3. Timeout scenarios
4. Invalid browser session
5. Network failures

## 6. Session Lifecycle Test (`tests/session-lifecycle/`)

**Purpose**: Test browser session creation, reuse, and cleanup.

**Implementation**:

- Multiple functions sharing session config
- Functions with different session configs
- Session cleanup on function completion
- Session timeout handling

## 7. Large Payload Test (`tests/large-payload/`)

**Purpose**: Test handling of large request/response payloads.

**Test Cases**:

1. Large input parameters (> 1MB JSON)
2. Large response data
3. Binary data handling
4. Streaming responses

## 8. Concurrent Invocation Test (`tests/concurrent/`)

**Purpose**: Test multiple simultaneous function invocations.

**Implementation**:

- Start dev server
- Send 10+ concurrent requests to same function
- Send concurrent requests to different functions
- Verify all responses are correct

## 9. Hot Reload Test (`tests/hot-reload/`)

**Purpose**: Test that the dev server properly handles file changes.

**Test Cases**:

1. Modify function implementation
2. Add new function
3. Remove function
4. Change function configuration

## 10. Performance Benchmark (`tests/performance/`)

**Purpose**: Establish baseline performance metrics.

**Metrics to Track**:

- Startup time (from command to server ready)
- First invocation latency
- Subsequent invocation latency
- Memory usage over time
- CPU usage during invocation

## Implementation Priority

### High Priority (Essential)

- Multiple Functions Test
- Invalid Configuration Test
- Error Handling Test

### Medium Priority (Important)

- Nested Entrypoint Test (partially implemented)
- Complex Parameter Schema Test
- Session Lifecycle Test

### Low Priority (Nice to Have)

- Large Payload Test
- Concurrent Invocation Test
- Hot Reload Test
- Performance Benchmark

## Testing Best Practices

1. **Isolation**: Each test should be completely independent
2. **Cleanup**: Always clean up resources (processes, files, sessions)
3. **Timeouts**: Set reasonable timeouts for all async operations
4. **Logging**: Capture logs for debugging failed tests
5. **Exit Codes**: Always verify non-zero exit codes for failure cases
6. **Portability**: Tests should work on different OS/environments

## Running Future Tests

When implemented, each test directory should support:

```bash
# Run all tests for a directory
cd tests/test-name
../test-all.sh

# Run specific test types
../test-dev.sh      # Dev server tests
../test-publish.sh  # Publish command tests
npm test           # Manifest generation tests
```
