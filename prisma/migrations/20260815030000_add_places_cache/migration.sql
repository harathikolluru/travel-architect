-- Turn McpPlaceSource into a persistent Overpass cache. A city's places barely
-- change week to week, and Overpass has no SLA, so repeat destinations should
-- reuse a recent fetch rather than re-query.

ALTER TABLE "McpPlaceSource" ADD COLUMN "cacheKey" TEXT;
ALTER TABLE "McpPlaceSource" ADD COLUMN "cachedPlaces" JSONB;

CREATE INDEX "McpPlaceSource_cacheKey_fetchedAt_idx" ON "McpPlaceSource"("cacheKey", "fetchedAt");
