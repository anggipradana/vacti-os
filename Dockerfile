# syntax=docker/dockerfile:1

# ---- deps + build ----
FROM node:20-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
# Copy the whole monorepo BEFORE install: npm workspaces needs every libs/*/package.json present so
# it can create the @vacti/* symlinks in node_modules (installing first would skip them).
COPY . .
# --legacy-peer-deps: framer-motion declares a React 18 peer but works with React 19 (project pin).
RUN npm ci --legacy-peer-deps
RUN npx next build apps/web

# ---- app runtime (Next.js production server) ----
FROM node:20-bookworm-slim AS runtime
WORKDIR /app
# PLAYWRIGHT_BROWSERS_PATH: shared world-readable location so the browser installed at build (root)
# is usable by the non-root runtime user (the default ~/.cache path would be root-only).
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PLAYWRIGHT_BROWSERS_PATH=/ms-playwright HOME=/home/vacti
COPY --from=build /app ./
# Chromium for PDF report rendering: the /reports/va and /reports/ti route handlers render PDFs
# in-process (Playwright), so the app image needs the browser too, not just the worker.
RUN npx playwright install --with-deps chromium && chmod -R a+rX /ms-playwright
# Non-root runtime (defense in depth): only the dirs Next writes to belong to the user.
RUN useradd -m -u 10001 vacti && chown -R vacti:vacti /app/apps/web/.next /home/vacti
USER vacti
EXPOSE 3000
CMD ["npx", "next", "start", "apps/web", "-p", "3000"]

# ---- worker runtime (recon engine + reports) ----
# Self-contained worker image: pinned ProjectDiscovery binaries + nuclei-templates + Chromium, so
# scans and PDF report rendering run entirely in the container (nothing required on the host).
FROM node:20-bookworm-slim AS worker
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
# Runtime deps: libpcap for naabu; curl/unzip to fetch the pinned release binaries.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl unzip libpcap0.8 \
  && rm -rf /var/lib/apt/lists/*
# Pinned active-scan toolset (prebuilt release zips - keeps the image free of the Go toolchain).
# Bump these to upgrade tools (subfinder/httpx/naabu/nuclei).
ARG SUBFINDER_VERSION=2.14.0
ARG HTTPX_VERSION=1.9.0
ARG NAABU_VERSION=2.6.1
ARG NUCLEI_VERSION=3.8.0
RUN set -eux; cd /tmp; \
  for spec in \
    "subfinder:${SUBFINDER_VERSION}" \
    "httpx:${HTTPX_VERSION}" \
    "naabu:${NAABU_VERSION}" \
    "nuclei:${NUCLEI_VERSION}"; do \
    name="${spec%%:*}"; ver="${spec##*:}"; \
    curl -fsSL --retry 5 --retry-delay 3 --retry-all-errors \
      -o tool.zip "https://github.com/projectdiscovery/${name}/releases/download/v${ver}/${name}_${ver}_linux_amd64.zip"; \
    unzip -o tool.zip "${name}" -d /usr/local/bin; \
    chmod +x "/usr/local/bin/${name}"; \
    rm tool.zip; \
  done; \
  subfinder -version; httpx -version; naabu -version; nuclei -version
COPY --from=build /app ./
# Chromium for PDF report rendering (Playwright) and the nuclei template catalog, baked in so the
# first scan/report doesn't pay a cold download. Browsers go to a shared path (see runtime stage);
# templates + tool configs live under the non-root user's HOME (nuclei/subfinder/httpx/naabu all
# write to $HOME at runtime: configs, resume files, template updates).
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright HOME=/home/vacti
RUN npx playwright install --with-deps chromium && chmod -R a+rX /ms-playwright
RUN useradd -m -u 10001 vacti \
  && (nuclei -update-templates -silent || true) \
  && chown -R vacti:vacti /home/vacti
USER vacti
CMD ["npx", "tsx", "apps/worker/src/main.ts"]
