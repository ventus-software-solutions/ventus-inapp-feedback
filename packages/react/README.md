# @ventus/feedback-react

A thin, SSR-safe React wrapper around `@ventus/feedback-widget`. React is a peer
dependency and the wrapper does not duplicate widget behavior.

```tsx
import { FeedbackWidget } from "@ventus/feedback-react";

export function AppFeedback() {
  return (
    <FeedbackWidget
      endpoint="/v1/feedback"
      sourceApp="storefront"
      context={() => ({ route: "checkout" })}
      onSuccess={({ receipt }) => console.info(receipt.id)}
    />
  );
}
```

The forwarded ref exposes the Web Component's `open()` and `close()` methods.
