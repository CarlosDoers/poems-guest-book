# Universal Error Patterns

## Pattern 1: Circuit Breaker
Prevent cascading failures in distributed systems by rejecting requests when a service is known to be failing.

### Logic Flow
1. **CLOSED**: Normal operation. Failures count toward threshold.
2. **OPEN**: Reject all calls for a specific timeout duration.
3. **HALF_OPEN**: Allow a limited number of test calls to see if the service has recovered.

```python
# Simplified Logic
if state == OPEN:
    if timeout_passed: state = HALF_OPEN
    else: raise CircuitBreakerError()
```

## Pattern 2: Error Aggregation
Collect multiple errors instead of failing on first error. Essential for validation logic and bulk operations.

```typescript
class ErrorCollector {
  private errors: Error[] = [];
  add(error: Error) { this.errors.push(error); }
  throwIfAny() {
    if (this.errors.length > 0) throw new AggregateError(this.errors);
  }
}
```

## Pattern 3: Graceful Degradation
Provide fallback functionality when errors occur.

```python
def with_fallback(primary, fallback):
    try:
        return primary()
    except Exception:
        return fallback()
```
