-- CreateEnum
CREATE TYPE "TripStatus" AS ENUM ('DRAFT', 'ACTIVE', 'COMPLETE');

-- CreateEnum
CREATE TYPE "Pace" AS ENUM ('RELAXED', 'MODERATE', 'PACKED');

-- CreateEnum
CREATE TYPE "SlotType" AS ENUM ('ACTIVITY', 'MEAL');

-- CreateEnum
CREATE TYPE "ActiveChoice" AS ENUM ('PRIMARY', 'BACKUP');

-- CreateEnum
CREATE TYPE "PlaceCategory" AS ENUM ('ATTRACTION', 'RESTAURANT');

-- CreateEnum
CREATE TYPE "CoverageQuality" AS ENUM ('RICH', 'THIN');

-- CreateEnum
CREATE TYPE "ReplanTrigger" AS ENUM ('WEATHER_CHANGE', 'DAY_COMPLETE', 'SLOT_SWAP', 'PREF_CHANGE', 'DATES_CHANGE');

-- CreateEnum
CREATE TYPE "OutputType" AS ENUM ('MAP_UI', 'PDF', 'EMAIL');

-- CreateEnum
CREATE TYPE "AgentJobType" AS ENUM ('GENERATE_PLAN', 'REPLAN');

-- CreateEnum
CREATE TYPE "AgentJobStatus" AS ENUM ('QUEUED', 'RUNNING', 'DONE', 'FAILED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "personaType" TEXT,
    "preferredPace" "Pace",
    "dietaryPreference" TEXT,
    "interests" TEXT[],
    "notificationEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripPlan" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "destinationLat" DOUBLE PRECISION NOT NULL,
    "destinationLng" DOUBLE PRECISION NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "pace" "Pace" NOT NULL DEFAULT 'MODERATE',
    "interests" TEXT[],
    "dietaryPreference" TEXT,
    "mustVisit" TEXT[],
    "budgetBand" INTEGER,
    "status" "TripStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "geocodingId" TEXT,

    CONSTRAINT "TripPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DayPlan" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "dayNumber" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "weatherId" TEXT,
    "clusterCentroidLat" DOUBLE PRECISION,
    "clusterCentroidLng" DOUBLE PRECISION,
    "neighbourhoodLabel" TEXT,
    "isComplete" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "DayPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItinerarySlot" (
    "id" TEXT NOT NULL,
    "dayId" TEXT NOT NULL,
    "placeId" TEXT NOT NULL,
    "backupPlaceId" TEXT,
    "slotType" "SlotType" NOT NULL,
    "sequenceOrder" INTEGER NOT NULL,
    "scheduledTime" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "backupRationale" TEXT,
    "isIndoorAlternative" BOOLEAN NOT NULL DEFAULT false,
    "wasSwapped" BOOLEAN NOT NULL DEFAULT false,
    "activeChoice" "ActiveChoice" NOT NULL DEFAULT 'PRIMARY',
    "replanReason" TEXT,

    CONSTRAINT "ItinerarySlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Place" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT,
    "externalId" TEXT,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "category" "PlaceCategory" NOT NULL,
    "openingHours" JSONB,
    "cuisineTags" TEXT[],
    "dietaryTags" TEXT[],
    "priceLevel" INTEGER,
    "isIndoor" BOOLEAN NOT NULL DEFAULT false,
    "dataCoverageFlag" "CoverageQuality" NOT NULL DEFAULT 'RICH',
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Place_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PackingList" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PackingList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PackingItem" (
    "id" TEXT NOT NULL,
    "listId" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "dayId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PackingItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReplanEvent" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "triggerType" "ReplanTrigger" NOT NULL,
    "triggeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "affectedDayIds" TEXT[],
    "diffSummary" TEXT NOT NULL,
    "prevVersion" INTEGER NOT NULL,
    "newVersion" INTEGER NOT NULL,
    "emailDigestSent" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ReplanEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanOutput" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "outputType" "OutputType" NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "replanEventId" TEXT,
    "shareUrl" TEXT,
    "pdfUrl" TEXT,
    "emailSentAt" TIMESTAMP(3),

    CONSTRAINT "PlanOutput_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MapMarker" (
    "id" TEXT NOT NULL,
    "slotId" TEXT NOT NULL,
    "dayColor" TEXT NOT NULL,
    "sequenceLabel" TEXT NOT NULL,

    CONSTRAINT "MapMarker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeatherForecast" (
    "id" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "forecastDate" TIMESTAMP(3) NOT NULL,
    "condition" TEXT NOT NULL,
    "tempMin" DOUBLE PRECISION NOT NULL,
    "tempMax" DOUBLE PRECISION NOT NULL,
    "precipitationProbability" DOUBLE PRECISION NOT NULL,
    "windSpeed" DOUBLE PRECISION,
    "isIndoorDay" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT NOT NULL DEFAULT 'open-meteo',
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WeatherForecast_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "McpPlaceSource" (
    "id" TEXT NOT NULL,
    "geocodingId" TEXT,
    "destinationBbox" JSONB NOT NULL,
    "rawPlacesCount" INTEGER NOT NULL,
    "coverageQuality" "CoverageQuality" NOT NULL DEFAULT 'RICH',
    "provider" TEXT NOT NULL,
    "categoryFilter" TEXT,
    "dietFilterApplied" TEXT,
    "clusterAlgorithm" TEXT NOT NULL DEFAULT 'k-means',
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "McpPlaceSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GeocodingResult" (
    "id" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "resolvedLat" DOUBLE PRECISION NOT NULL,
    "resolvedLng" DOUBLE PRECISION NOT NULL,
    "boundingBox" JSONB NOT NULL,
    "provider" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GeocodingResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentJob" (
    "id" TEXT NOT NULL,
    "type" "AgentJobType" NOT NULL,
    "status" "AgentJobStatus" NOT NULL DEFAULT 'QUEUED',
    "planId" TEXT NOT NULL,
    "payload" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentRunLog" (
    "id" TEXT NOT NULL,
    "jobId" TEXT,
    "planId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL,
    "outputTokens" INTEGER NOT NULL,
    "costUsd" DOUBLE PRECISION NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentRunLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "TripPlan_userId_startDate_idx" ON "TripPlan"("userId", "startDate");

-- CreateIndex
CREATE UNIQUE INDEX "DayPlan_planId_dayNumber_key" ON "DayPlan"("planId", "dayNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ItinerarySlot_dayId_sequenceOrder_key" ON "ItinerarySlot"("dayId", "sequenceOrder");

-- CreateIndex
CREATE INDEX "Place_lat_lng_idx" ON "Place"("lat", "lng");

-- CreateIndex
CREATE UNIQUE INDEX "Place_sourceId_externalId_key" ON "Place"("sourceId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "PackingList_planId_key" ON "PackingList"("planId");

-- CreateIndex
CREATE UNIQUE INDEX "MapMarker_slotId_key" ON "MapMarker"("slotId");

-- CreateIndex
CREATE UNIQUE INDEX "WeatherForecast_destination_forecastDate_key" ON "WeatherForecast"("destination", "forecastDate");

-- CreateIndex
CREATE UNIQUE INDEX "GeocodingResult_query_key" ON "GeocodingResult"("query");

-- AddForeignKey
ALTER TABLE "TripPlan" ADD CONSTRAINT "TripPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripPlan" ADD CONSTRAINT "TripPlan_geocodingId_fkey" FOREIGN KEY ("geocodingId") REFERENCES "GeocodingResult"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DayPlan" ADD CONSTRAINT "DayPlan_planId_fkey" FOREIGN KEY ("planId") REFERENCES "TripPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DayPlan" ADD CONSTRAINT "DayPlan_weatherId_fkey" FOREIGN KEY ("weatherId") REFERENCES "WeatherForecast"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItinerarySlot" ADD CONSTRAINT "ItinerarySlot_dayId_fkey" FOREIGN KEY ("dayId") REFERENCES "DayPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItinerarySlot" ADD CONSTRAINT "ItinerarySlot_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "Place"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItinerarySlot" ADD CONSTRAINT "ItinerarySlot_backupPlaceId_fkey" FOREIGN KEY ("backupPlaceId") REFERENCES "Place"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Place" ADD CONSTRAINT "Place_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "McpPlaceSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackingList" ADD CONSTRAINT "PackingList_planId_fkey" FOREIGN KEY ("planId") REFERENCES "TripPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackingItem" ADD CONSTRAINT "PackingItem_listId_fkey" FOREIGN KEY ("listId") REFERENCES "PackingList"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackingItem" ADD CONSTRAINT "PackingItem_dayId_fkey" FOREIGN KEY ("dayId") REFERENCES "DayPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReplanEvent" ADD CONSTRAINT "ReplanEvent_planId_fkey" FOREIGN KEY ("planId") REFERENCES "TripPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanOutput" ADD CONSTRAINT "PlanOutput_planId_fkey" FOREIGN KEY ("planId") REFERENCES "TripPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanOutput" ADD CONSTRAINT "PlanOutput_replanEventId_fkey" FOREIGN KEY ("replanEventId") REFERENCES "ReplanEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MapMarker" ADD CONSTRAINT "MapMarker_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "ItinerarySlot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "McpPlaceSource" ADD CONSTRAINT "McpPlaceSource_geocodingId_fkey" FOREIGN KEY ("geocodingId") REFERENCES "GeocodingResult"("id") ON DELETE SET NULL ON UPDATE CASCADE;
