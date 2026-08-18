-- Trips beyond the forecast horizon have no weather values. These were NOT NULL,
-- which left the agent no way to record "unknown"; it supplied Fahrenheit
-- seasonal averages instead and the UI rendered them as 78°C.
ALTER TABLE "WeatherForecast" ALTER COLUMN "tempMin" DROP NOT NULL;
ALTER TABLE "WeatherForecast" ALTER COLUMN "tempMax" DROP NOT NULL;
ALTER TABLE "WeatherForecast" ALTER COLUMN "precipitationProbability" DROP NOT NULL;
