FROM node:22.19.0-bookworm-slim@sha256:4a4884e8a44826194dff92ba316264f392056cbe243dcc9fd3551e71cea02b90 AS build
WORKDIR /app
COPY . .
RUN npm ci --ignore-scripts --workspace @ventus-software-solutions/feedback-contracts --workspace @ventus-software-solutions/feedback-browser --workspace @ventus-software-solutions/feedback-api --include-workspace-root
RUN npm run build --workspace @ventus-software-solutions/feedback-contracts \
 && npm run build --workspace @ventus-software-solutions/feedback-browser \
 && npm run build --workspace @ventus-software-solutions/feedback-api

FROM node:22.19.0-bookworm-slim@sha256:4a4884e8a44826194dff92ba316264f392056cbe243dcc9fd3551e71cea02b90 AS runtime
LABEL org.opencontainers.image.title="Ventus Feedback API" \
      org.opencontainers.image.description="Self-hosted API for Ventus In-App Feedback" \
      org.opencontainers.image.licenses="BUSL-1.1"
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/contracts/package.json ./packages/contracts/package.json
COPY --from=build /app/packages/contracts/dist ./packages/contracts/dist
COPY --from=build /app/packages/browser/package.json ./packages/browser/package.json
COPY --from=build /app/packages/browser/dist ./packages/browser/dist
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/apps/api/LICENSE ./LICENSE
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/migrations ./apps/api/migrations
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8080/v1/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "apps/api/dist/start.js"]
