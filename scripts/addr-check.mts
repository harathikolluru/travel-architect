import '../app/lib/mcp-setup.ts';
import { findCandidates } from '../app/lib/candidates.ts';
const r = await findCandidates('new york', 'oda house');
r.forEach(p => console.log(`${p.name} → address: ${p.address ?? 'NONE'}`));
