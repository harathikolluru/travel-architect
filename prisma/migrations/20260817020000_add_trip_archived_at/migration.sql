-- Soft delete for trips. Nullable, so existing rows are unaffected.
ALTER TABLE "TripPlan" ADD COLUMN "archivedAt" TIMESTAMP(3);

-- The trip list filters on this for every page load.
CREATE INDEX "TripPlan_userId_archivedAt_idx" ON "TripPlan"("userId", "archivedAt");
