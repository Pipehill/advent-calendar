# .NET SDK 10.0.401 (musl), shared offline C# checks.
FROM mcr.microsoft.com/dotnet/sdk:10.0.401-alpine3.24@sha256:3cc3bbbbf93d82104892f42aa9106b6be4d120346dea0649643a97c801525256 AS dotnet
RUN dotnet tool install --tool-path /formatters csharpier --version 1.3.0

# MegaLinter documentation v10.1.0, extended for authored C# and SQL.
FROM ghcr.io/oxsecurity/megalinter-documentation:v10.1.0@sha256:51e0142d7359a44cb705bcca904edc7a3080c52fc97d5e1174a79fda28870bba
ENV PATH="/quality/node_modules/.bin:/node-deps/node_modules/.bin:${PATH}" \
    PUPPETEER_SKIP_DOWNLOAD=true \
    DOTNET_ROOT=/usr/share/dotnet \
    MEGALINTER_FLAVOR=all \
    DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=true \
    DOTNET_CLI_TELEMETRY_OPTOUT=1
COPY --from=dotnet /usr/share/dotnet /usr/share/dotnet
COPY --from=dotnet /formatters /formatters
RUN ln -s /usr/share/dotnet/dotnet /usr/local/bin/dotnet \
    && ln -s /formatters/csharpier /usr/local/bin/csharpier
RUN apk add --no-cache chromium=155.0.8059.39-r0
COPY requirements.txt /quality/requirements.txt
RUN python -m venv /quality/venv \
    && /quality/venv/bin/pip install --no-cache-dir -r /quality/requirements.txt
COPY package.json package-lock.json /quality/
RUN cd /quality && npm ci --ignore-scripts
# Check scripts and browser settings are mounted read-only from each input snapshot.
WORKDIR /workspace
