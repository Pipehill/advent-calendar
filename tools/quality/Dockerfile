# MegaLinter documentation v10.1.0, shared by local checks and CI.
FROM ghcr.io/oxsecurity/megalinter-documentation:v10.1.0@sha256:51e0142d7359a44cb705bcca904edc7a3080c52fc97d5e1174a79fda28870bba
ENV PATH="/node-deps/node_modules/.bin:${PATH}" \
    PUPPETEER_SKIP_DOWNLOAD=true
RUN apk add --no-cache chromium=152.0.7977.82-r0
COPY requirements.txt /quality/requirements.txt
RUN python -m venv /quality/venv \
    && /quality/venv/bin/pip install --no-cache-dir -r /quality/requirements.txt
COPY package.json package-lock.json /quality/
RUN cd /quality && npm ci --ignore-scripts
# Check scripts and browser settings are mounted read-only from each input snapshot.
WORKDIR /workspace
