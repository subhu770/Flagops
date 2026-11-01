# FlagOps Client SDK (`@flagops/sdk`)

High-throughput, ultra-low latency feature flag evaluation SDK with real-time Server-Sent Events (SSE) streaming updates for FlagOps.

## Key Features

- **Microsecond In-Memory Evaluation**: Synchronous `client.isEnabled(flagKey, userContext)` resolves in **< 0.01ms** without outbound network requests.
- **Deterministic Bucketing**: Pure TypeScript MurmurHash3 (32-bit x86) algorithm guarantees the exact same user ID always receives the exact same flag variation.
- **Real-Time SSE Streaming**: Seamlessly maintains a persistent SSE connection with FlagOps. Invalidation events (`flag_update`) apply to the in-memory cache instantly.
- **Attribute Matcher**: Supports complex user segment rules including `EQUALS`, `IN_ARRAY`, `REGEX`, `GREATER_THAN`, `CONTAINS`, `ENDS_WITH`, and more.
- **Zero Dependencies**: Self-contained single-file module compatible with Node.js and modern browsers.

## Installation & Usage

```typescript
import { FlagOpsClient } from "@flagops/sdk";

// 1. Initialize client with Environment API Key
const flagops = new FlagOpsClient("flagops_env_prod_8f39a04b1c78e9f2a0e718b5239", {
  baseUrl: "http://localhost:3000",
});

// 2. Wait for initial flag configuration
await flagops.waitForReady();

// 3. Ultra-low latency synchronous evaluation (zero network calls)
const isEnabled = flagops.isEnabled("new-checkout-flow", {
  userId: "user_alice_8492",
  attributes: {
    country: "IN",
    email: "alice@beta.com",
    tier: "enterprise",
  },
});

if (isEnabled) {
  // Execute feature code
}
```

## Real-Time Live Updates

```typescript
flagops.on("update", (event) => {
  console.log(`Flag [${event.flagKey}] updated via SSE invalidation:`, event.action);
});
```
