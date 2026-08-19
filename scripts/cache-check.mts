import { prismaScopeCache } from '@travel-architect/db';
import { registerScopeCache, cacheKeyFor } from '@travel-architect/mcp';
registerScopeCache(prismaScopeCache);
const key = cacheKeyFor('new york');
const t = Date.now();
const hit = await prismaScopeCache.get(key, 7 * 24 * 60 * 60 * 1000);
console.log(`cache read: ${hit ? `${hit.attractions.length + hit.restaurants.length} places` : 'MISS'} in ${Date.now() - t}ms`);
