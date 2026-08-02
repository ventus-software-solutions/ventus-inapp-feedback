# Ventus Feedback Capture Lab

Local dogfooding application for the public Ventus feedback packages. It uses
the real self-hosted API when both `VITE_VENTUS_FEEDBACK_ENDPOINT` and
`VITE_VENTUS_FEEDBACK_PROJECT_KEY` are configured, and visibly falls back to a
disposable mock transport when they are absent.

It imports workspace packages through their public package exports and does not
import package source files directly. Its scenarios cover console serialization,
browser errors, unhandled rejections, failed requests, URL and value redaction,
shared lifecycle teardown, and the screenshot-loader boundary. The fixed
right-edge trigger dogfoods the framework-neutral Web Component and the same
typed transport contract used by the lower-level capture lab.

## Real API dogfooding

From the repository root in PowerShell:

```powershell
Copy-Item .env.example .env
Copy-Item apps/demo/.env.example apps/demo/.env.local
docker compose up --build
```

In a second terminal:

```powershell
npm run demo:dogfood
```

Open `http://localhost:3100`, submit through either form, and copy the stable
feedback ID from the receipt. The API is at `http://localhost:8180`; an MCP agent
using `demo-service-token` can search for and claim the new record immediately.

The values are local-only. The `VITE_` project key is intentionally a public,
submit-only credential restricted to the configured demo origin. Never place an
agent or service token in browser-visible environment variables.

Delete `apps/demo/.env.local` to return to the disposable mock transport.
