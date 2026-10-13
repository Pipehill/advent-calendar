# Node 24.14.0 LTS provides the pinned offline contract validator after npm ci.
FROM docker.io/library/node:24.14.0-bookworm-slim@sha256:4bd6219054c8bebcd26a66bfd8ca0bd6e1024b4b97474c59bb7ee3bbcbef4fe8 AS node

# .NET SDK 10.0.401 and ASP.NET 10.0.12, official multi-platform manifests.
FROM mcr.microsoft.com/dotnet/sdk:10.0.401@sha256:0eeb52c76e35a5431ca707ad2bc75e38006a05393045d8532ae44c15d9474523 AS build
COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=node /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/npm
RUN ln -s /usr/local/lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm
WORKDIR /source
COPY global.json ./
COPY .config/ .config/
COPY src/ src/
COPY tools/backend/ tools/backend/
COPY tools/quality/local-settings.mjs tools/quality/local-settings.mjs
RUN npm ci --prefix src/contract \
    && CI=true node tools/backend/check.mjs publish \
    && cp -r src/backend/publish /app

FROM mcr.microsoft.com/dotnet/aspnet:10.0.12@sha256:0fa044f682cb7d93a5a90401a00c626c66f7b00b86922be9441f869eae039f80
WORKDIR /app
COPY --from=build /app/ ./
USER $APP_UID
ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080
ENTRYPOINT ["dotnet", "Calendar.Api.dll"]
