FROM node:22.19.0-bookworm-slim@sha256:4a4884e8a44826194dff92ba316264f392056cbe243dcc9fd3551e71cea02b90 AS build
WORKDIR /app
COPY . .
RUN npm ci --ignore-scripts
ARG VITE_VENTUS_FEEDBACK_ENDPOINT=http://localhost:8180/v1/feedback
ARG VITE_VENTUS_FEEDBACK_PROJECT_KEY=demo-browser-key
ENV VITE_VENTUS_FEEDBACK_ENDPOINT=$VITE_VENTUS_FEEDBACK_ENDPOINT \
    VITE_VENTUS_FEEDBACK_PROJECT_KEY=$VITE_VENTUS_FEEDBACK_PROJECT_KEY
RUN npm run build --workspace @ventus-software-solutions/feedback-browser \
 && npm run build --workspace @ventus-software-solutions/feedback-widget \
 && npm run build --workspace @ventus-software-solutions/feedback-react \
 && npm run build --workspace @ventus-software-solutions/feedback-demo

FROM build AS runtime
LABEL org.opencontainers.image.title="Ventus Feedback Demo" \
      org.opencontainers.image.description="Local dogfooding UI for Ventus In-App Feedback" \
      org.opencontainers.image.licenses="MIT"
ENV NODE_ENV=production \
    PORT=3100
USER node
EXPOSE 3100
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3100').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["npm", "run", "start", "--workspace", "@ventus-software-solutions/feedback-demo", "--", "--port", "3100", "--hostname", "0.0.0.0"]
