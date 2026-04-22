/**
 * Central export file for all MikroORM entities.
 * Organized by PostgreSQL schema.
 */

// === IAM ===
export { User } from './iam/user.entity';
export { Role } from './iam/role.entity';
export { UserProfile } from './iam/user-profile.entity';
export { UserRole } from './iam/user-role.entity';
export { RefreshSession } from './iam/refresh-session.entity';

// === Catalog ===
export { Area } from './catalog/area.entity';
export { Station } from './catalog/station.entity';

// === App ===
export { UserPinnedStation } from './app/user-pinned-station.entity';
export { UserPreference } from './app/user-preference.entity';
export { UserAlertRule } from './app/user-alert-rule.entity';
export { NotificationTemplate } from './app/notification-template.entity';
export { Notification } from './app/notification.entity';
export { NotificationDelivery } from './app/notification-delivery.entity';

// === Ingest ===
export { SourceProvider } from './ingest/source-provider.entity';
export { SourceEndpoint } from './ingest/source-endpoint.entity';
export { StationSourceBinding } from './ingest/station-source-binding.entity';
export { PipelineDefinition } from './ingest/pipeline-definition.entity';
export { PipelineRun } from './ingest/pipeline-run.entity';
export { OutboundRequest } from './ingest/outbound-request.entity';
export { RawPayload } from './ingest/raw-payload.entity';
export { NormalizeRun } from './ingest/normalize-run.entity';

// === Core ===
export { AirQualityObservation } from './core/air-quality-observation.entity';
export { WeatherObservation } from './core/weather-observation.entity';
export { TrafficObservation } from './core/traffic-observation.entity';

// === Analytics ===
export { FeatureSnapshot } from './analytics/feature-snapshot.entity';
export { AnalysisRun } from './analytics/analysis-run.entity';
export { StationDailySummary } from './analytics/station-daily-summary.entity';
export { AnomalyEvent } from './analytics/anomaly-event.entity';
export { AnalysisReport } from './analytics/analysis-report.entity';
export { DailySummary } from './analytics/daily-summary.entity';
export { Anomaly } from './analytics/anomaly.entity';
export { SeasonalPattern } from './analytics/seasonal-pattern.entity';
export { CorrelationMatrix } from './analytics/correlation-matrix.entity';
export { TrendAnalysis } from './analytics/trend-analysis.entity';
export { HealthImpact } from './analytics/health-impact.entity';

// === Forecast ===
export { ModelRegistry } from './forecast/model-registry.entity';
export { ModelVersion } from './forecast/model-version.entity';
export { TrainingRun } from './forecast/training-run.entity';
export { PredictionRun } from './forecast/prediction-run.entity';
export { Prediction } from './forecast/prediction.entity';
export { ForecastRun } from './forecast/forecast-run.entity';
export { ForecastPoint } from './forecast/forecast-point.entity';

// === Ops ===
export { ServiceConfig } from './ops/service-config.entity';
export { ServiceHealthCheck } from './ops/service-health-check.entity';
export { AuditLog } from './ops/audit-log.entity';

// === Enums ===
export { UserStatus, AreaLevel, StationType } from './iam/enums';
