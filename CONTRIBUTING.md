# Contributing

The project is not accepting external contributions until the inbound
contribution terms for the commercially licensed backend are approved. Issues
and design discussion may still be useful, but do not submit code that cannot be
distributed under the component's license and, for `apps/api`, commercially
relicensed by Ventus Software Solutions GmbH.

For local validation, use Node.js 22.19.0 or newer within the supported Node 22
line, run `npm ci --ignore-scripts`, and then run `npm run verify`. Use synthetic
feedback only. Changes to public schemas, API paths, event names, state transitions,
or MCP tools require a compatibility note and tests.
