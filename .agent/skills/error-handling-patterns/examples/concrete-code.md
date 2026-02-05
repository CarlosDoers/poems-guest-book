# Language-Specific Error Handling Examples

## Python
### Custom Exception Hierarchy
```python
class ApplicationError(Exception):
    def __init__(self, message, code=None, details=None):
        super().__init__(message)
        self.code = code
        self.details = details or {}

class ValidationError(ApplicationError): pass
class NotFoundError(ApplicationError): pass
```

### Context Managers for Cleanup
```python
@contextmanager
def database_transaction(session):
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
```

## TypeScript / JavaScript
### Result Type Pattern
```typescript
type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E };

const Ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
const Err = <E>(error: E): Result<never, E> => ({ ok: false, error });

// Usage
function parseJSON<T>(json: string): Result<T, SyntaxError> {
  try {
    return Ok(JSON.parse(json));
  } catch (e) {
    return Err(e);
  }
}
```

## Rust
```rust
fn read_file(path: &str) -> Result<String, io::Error> {
    let mut file = File::open(path)?; // ? operator propagates errors
    let mut contents = String::new();
    file.read_to_string(&mut contents)?;
    Ok(contents)
}
```

## Go
```go
func getUser(id string) (*User, error) {
    user, err := db.QueryUser(id)
    if err != nil {
        return nil, fmt.Errorf("failed to query user: %w", err)
    }
    return user, nil
}
```
