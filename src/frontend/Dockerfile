# Shared Node.js 24.14.0 LTS and .NET SDK 10.0.401 for spec-first generation.
FROM docker.io/library/node:24.14.0-bookworm-slim@sha256:4bd6219054c8bebcd26a66bfd8ca0bd6e1024b4b97474c59bb7ee3bbcbef4fe8 AS node
FROM mcr.microsoft.com/dotnet/sdk:10.0.401@sha256:0eeb52c76e35a5431ca707ad2bc75e38006a05393045d8532ae44c15d9474523 AS build
COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=node /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/npm
RUN ln -s /usr/local/lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm
WORKDIR /source
COPY global.json biome.json ./
COPY .config/ .config/
COPY src/ src/
COPY tools/frontend/ tools/frontend/
COPY tools/backend/ tools/backend/
COPY tools/development/commands.mjs tools/development/commands.mjs
COPY tools/quality/local-settings.mjs tools/quality/local-settings.mjs
RUN npm ci --prefix tools/frontend \
    && npm ci --prefix src/contract \
    && CI=true node tools/frontend/check.mjs install \
    && CI=true node tools/frontend/check.mjs build

FROM node AS runtime
WORKDIR /app
COPY --from=build --chown=node:node /source/src/frontend/.output/ ./
USER node
ENV HOST=0.0.0.0 PORT=3000
EXPOSE 3000
CMD ["node", "server/index.mjs"]
