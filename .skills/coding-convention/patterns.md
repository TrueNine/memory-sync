## Composition Over Inheritance

Prefer composition for building complex objects, avoid inheritance hierarchy bloat.

```rust
// ✓ Composition pattern, flexible and configurable
struct Logger {
  formatter: Box<dyn LogFormatter>,
  transport: Box<dyn LogTransport>,
}

impl Logger {
  fn log(&self, level: Level, msg: &str) {
    let formatted = self.formatter.format(level, msg);
    self.transport.send(&formatted);
  }
}

// ✗ Deep inheritance causes fragile base class problem
// BaseLogger -> FormattedLogger -> ColorLogger -> CloudColorLogger
```

## Dependency Injection

Inject dependencies via constructor, avoid hardcoded instantiation.

```rust
// ✓ Generic injection, easy to test and swap
struct UserService<R: UserRepository, C: CacheService> {
  repo: R,
  cache: C,
}

impl<R: UserRepository, C: CacheService> UserService<R, C> {
  fn new(repo: R, cache: C) -> Self {
    Self { repo, cache }
  }
}

// ✗ Hardcoded dependencies, tight coupling, cannot swap
struct UserService {
  repo: MySqlUserRepository,
  cache: RedisCache,
}
```

## Strategy Pattern

When behavior varies by type, use Strategy Pattern instead of conditional branches.

```rust
// ✓ Strategy registration, adding methods only requires registering new strategy
trait PaymentStrategy {
  fn pay(&self, amount: u64) -> Result<Receipt, PaymentError>;
}

struct PaymentProcessor {
  strategies: HashMap<String, Box<dyn PaymentStrategy>>,
}

impl PaymentProcessor {
  fn process(&self, method: &str, amount: u64) -> Result<Receipt, PaymentError> {
    let strategy = self.strategies.get(method)
      .ok_or(PaymentError::UnknownMethod)?;
    strategy.pay(amount)
  }
}

// ✗ Conditional bloat, violates open-closed principle
fn process_payment(method: &str, amount: u64) -> Result<Receipt, PaymentError> {
  if method == "alipay" { pay_alipay(amount) }
  else if method == "wechat" { pay_wechat(amount) }
  else if method == "stripe" { pay_stripe(amount) }
  else { Err(PaymentError::UnknownMethod) }
}
```
