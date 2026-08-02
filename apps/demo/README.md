# Ventus Feedback Capture Lab

Local dogfooding application for the public Ventus feedback packages.

The demo deliberately uses synthetic data and a disposable mock transport. It imports workspace packages through their public package exports and does not import package source files directly. Its scenarios cover console serialization, browser errors, unhandled rejections, failed requests, URL and value redaction, shared lifecycle teardown, and the screenshot-loader boundary. The fixed right-edge trigger dogfoods the framework-neutral Web Component and the same typed transport contract used by the lower-level capture lab.

The demo is intentionally local-only until privacy controls, abuse protection, and a production backend are ready.
