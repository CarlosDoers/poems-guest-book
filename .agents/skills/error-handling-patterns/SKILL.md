---
name: managing-errors
description: Master error handling patterns across languages including exceptions, Result types, and graceful degradation. Use when implementing error handling, designing APIs, or debugging production issues.
---

# Error Handling Patterns

Build resilient applications with robust error handling strategies that gracefully handle failures and provide excellent debugging experiences.

## When to use this skill
- Implementing error handling in new features.
- Designing error-resilient APIs.
- Debugging production issues.
- Improving application reliability.
- Handling async/concurrent errors.

## Workflow

### 1. Diagnosis Checklist
- [ ] identify if the error is **Recoverable** (timeouts, invalid input) or **Unrecoverable** (OOM, logic bugs).
- [ ] Determine the appropriate philosophy: Exceptions (unexpected) vs Result Types (expected).
- [ ] Check for resource cleanup needs (files, connections, sessions).

### 2. Implementation Loop
1. **Plan**: Choose the pattern (Retry, Circuit Breaker, Fallback).
2. **Validate**: Ensure the error propagation doesn't swallow context or stack traces.
3. **Execute**: Apply consistent error types/classes.
4. **Test**: Write a failing test that triggers the error condition.

## Instructions

### Core Principles
- **Fail Fast**: Validate input early.
- **Preserve Context**: Always include stack traces and relevant metadata.
- **Meaningful Messages**: Explain what happened and how to fix it.
- **Don't Swallow Errors**: Log or re-throw; never ignore silently.

### Pattern References
- **Circuit Breaker**: Use to prevent cascading failures in distributed systems.
- **Error Aggregation**: Collect multiple errors (e.g., in forms) instead of failing on the first one.
- **Graceful Degradation**: Fall back to cached data or local defaults when services fail.

[See detailed patterns in resources/patterns.md](resources/patterns.md)

### Language-Specific Implementation
For concrete code examples in Python, TypeScript, Rust, or Go:
[See language examples in examples/concrete-code.md](examples/concrete-code.md)

## Resources
- `resources/patterns.md`: Detailed logic for modern error patterns.
- `examples/concrete-code.md`: Templates for custom exception hierarchies and Result types.
