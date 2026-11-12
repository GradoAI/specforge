FROM node:24-bookworm-slim@sha256:dc26ae92c9fb15cf6b1d63e20f0944b2efe0f115b20e00be48fb23fceb061c54 AS build
WORKDIR /workspace
ENV SOURCE_DATE_EPOCH=0
RUN npm install --global --ignore-scripts pnpm@12.16.1
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @fasrun/fasrun-core-svc... build
RUN node deploy/docker/prepare-deploy.mjs fasrun-core-svc && pnpm --filter @fasrun/fasrun-core-svc --prod deploy /out

FROM gcr.io/distroless/nodejs24-debian13:nonroot@sha256:9fc11f6ee65993285c0fe3c4c9bbc4fd275fd4470572f58834ce490df91056e3
WORKDIR /app
ENV NODE_ENV=production
ENV FASRUN_CORE_HOST=0.0.0.0
COPY --from=build --chown=65532:65532 /out /app
USER 65532:65532
ENTRYPOINT ["/nodejs/bin/node"]
CMD ["dist/index.mjs"]
