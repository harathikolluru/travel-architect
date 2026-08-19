import { getForecast, ForecastOutOfRangeError } from '../packages/mcp/src/index.ts';
try {
  const days = await getForecast({ lat: 40.7128, lng: -74.006, startDate: '2026-09-01', endDate: '2026-09-14' });
  console.log(`straddling range → ${days.length} day(s) returned`);
  days.forEach(d => console.log(`  ${d.forecastDate}  ${d.condition}  ${d.tempMax}°C  indoor=${d.isIndoorDay}`));
} catch (e) {
  console.log(e instanceof ForecastOutOfRangeError ? `out of range: ${e.message}` : `error: ${(e as Error).message}`);
}
try {
  const far = await getForecast({ lat: 40.7128, lng: -74.006, startDate: '2027-03-01', endDate: '2027-03-05' });
  console.log(`\nfully out of range → ${far.length} days`);
} catch (e) {
  console.log(`\nfully out of range → ${e instanceof ForecastOutOfRangeError ? 'ForecastOutOfRangeError (correct)' : (e as Error).message}`);
}
