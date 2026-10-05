FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY voidly-pay-mcp/package.json voidly-pay-mcp/package-lock.json ./voidly-pay-mcp/
WORKDIR /app/voidly-pay-mcp
RUN npm ci
WORKDIR /app
COPY voidly-pay-mcp/tsconfig.json voidly-pay-mcp/tsup.config.ts ./voidly-pay-mcp/
COPY voidly-pay-mcp/src ./voidly-pay-mcp/src
COPY voidly-pay-mcp/scripts ./voidly-pay-mcp/scripts
COPY creator-client/src/client.ts ./creator-client/src/client.ts
COPY landing/lib/marketplacePublishingProtocol.ts landing/lib/marketplaceCollectionProtocol.ts landing/lib/marketplaceQualifiedInventory.ts landing/lib/marketplacePublicService.ts ./landing/lib/
WORKDIR /app/voidly-pay-mcp
RUN npm run typecheck && npm run build && npm run smoke

FROM node:24-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY voidly-pay-mcp/package.json voidly-pay-mcp/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY --from=build /app/voidly-pay-mcp/dist ./dist
COPY voidly-pay-mcp/LICENSE ./LICENSE
USER node
CMD ["node", "dist/cli.js"]
