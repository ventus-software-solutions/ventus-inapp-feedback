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
Viewport screenshots are loaded lazily through `html2canvas-pro`, with the
demo's password and explicitly marked private fields masked before capture.

## Real API dogfooding

From the repository root:

```bash
docker compose up --build
```

Open `http://localhost:3100`, submit through either form, and copy the stable
feedback ID from the receipt. The API is at `http://localhost:8180`; an MCP agent
using `demo-service-token` can search for and claim the new record immediately.

The single command starts the demo, API, PostgreSQL, and MinIO. Stop the stack
with `docker compose down`; add `-v` only when you intentionally want to remove
the local feedback and attachment data as well.

The values are local-only. The `VITE_` project key is intentionally a public,
submit-only credential restricted to the configured demo origin. Never place an
agent or service token in browser-visible environment variables.

For non-Docker UI development, copy `.env.example` in this directory to
`.env.local` and run `npm run demo:dogfood`. Delete `.env.local` to return to the
disposable mock transport.

Built and maintained by
[Ventus Software Solutions GmbH](https://ventus.works/?utm_source=github&utm_medium=referral&utm_campaign=feedback-demo).
