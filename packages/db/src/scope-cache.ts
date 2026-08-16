// Prisma-backed implementation of the places cache.
//
// Lives here rather than in packages/mcp so that package stays a pure
// data-source layer with no database dependency.

import type { ScopeCacheStore, CachedScope } from '@travel-architect/mcp';
import { prisma } from './client';

export const prismaScopeCache: ScopeCacheStore = {
  async get(key: string, maxAgeMs: number): Promise<CachedScope | null> {
    const row = await prisma.mcpPlaceSource.findFirst({
      where: {
        cacheKey: key,
        fetchedAt: { gte: new Date(Date.now() - maxAgeMs) },
      },
      orderBy: { fetchedAt: 'desc' },
    });
    if (!row?.cachedPlaces) return null;
    return row.cachedPlaces as unknown as CachedScope;
  },

  async set(key: string, value: CachedScope): Promise<void> {
    await prisma.mcpPlaceSource.create({
      data: {
        cacheKey: key,
        destinationBbox: value.geocoding.boundingBox,
        rawPlacesCount: value.restaurants.length + value.attractions.length,
        provider: value.providers.join('+'),
        clusterAlgorithm: 'agent-cluster-itinerary',
        cachedPlaces: value as unknown as object,
      },
    });
  },
};
