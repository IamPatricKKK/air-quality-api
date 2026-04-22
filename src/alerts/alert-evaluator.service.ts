import { Injectable, Logger } from "@nestjs/common";
import { EntityManager } from "@mikro-orm/postgresql";
import { AlertRulesService, AlertRuleRow } from "./alert-rules.service";
import { DeliveryDispatcher } from "./delivery-dispatcher.service";

interface LatestReading {
  station_id: string;
  station_name: string;
  aqi: number | null;
  pm25: number | null;
  pm10: number | null;
  o3: number | null;
  no2: number | null;
  so2: number | null;
  co: number | null;
  observed_at: string;
}

interface CreatedAlert {
  id: string;
  rule_id: string;
  user_id: string;
  station_id: string | null;
  metric: string;
  threshold: number;
  actual_value: number;
  aqi_category: string | null;
  title: string;
  message: string;
  channels: string[];
}

@Injectable()
export class AlertEvaluatorService {
  private readonly logger = new Logger(AlertEvaluatorService.name);

  constructor(
    private readonly rulesService: AlertRulesService,
    private readonly dispatcher: DeliveryDispatcher,
    private readonly em: EntityManager,
  ) {}

  async evaluate(): Promise<number> {
    const rules = await this.rulesService.listActiveRules();
    if (!rules.length) {
      this.logger.log("No active alert rules — skip");
      return 0;
    }

    const readings = await this.getLatestReadings();
    if (!readings.length) {
      this.logger.log("No recent readings — skip");
      return 0;
    }

    const readingMap = new Map<string, LatestReading>();
    for (const r of readings) readingMap.set(r.station_id, r);

    let alertCount = 0;

    for (const rule of rules) {
      try {
        const alert = await this.evaluateRule(rule, readingMap);
        if (alert) {
          alertCount++;
        }
      } catch (err) {
        this.logger.error(`Error evaluating rule ${rule.id}: ${err}`);
      }
    }

    this.logger.log(`Evaluated ${rules.length} rules → ${alertCount} alerts created`);
    return alertCount;
  }

  private async evaluateRule(
    rule: AlertRuleRow,
    readingMap: Map<string, LatestReading>,
  ): Promise<CreatedAlert | null> {
    if (rule.station_id) {
      const reading = readingMap.get(rule.station_id);
      if (!reading) return null;
      return this.checkAndCreate(rule, reading);
    }

    for (const reading of readingMap.values()) {
      const alert = await this.checkAndCreate(rule, reading);
      if (alert) return alert;
    }
    return null;
  }

  private async checkAndCreate(
    rule: AlertRuleRow,
    reading: LatestReading,
  ): Promise<CreatedAlert | null> {
    const value = this.getMetricValue(reading, rule.metric);
    if (value === null || value === undefined) return null;

    const triggered = this.compare(value, rule.operator, Number(rule.threshold));
    if (!triggered) return null;

    const isDuplicate = await this.isDuplicateWithinCooldown(rule.id, rule.cooldown_min);
    if (isDuplicate) return null;

    const aqiCategory = reading.aqi !== null ? this.getAqiCategoryCode(reading.aqi) : null;
    const title = `Canh bao: ${rule.metric.toUpperCase()} tai ${reading.station_name}`;
    const message = `${rule.metric.toUpperCase()} = ${value} (nguong: ${rule.operator} ${rule.threshold}) tai tram ${reading.station_name}.`;

    const result = await this.em.getConnection().execute(
      `INSERT INTO app.alerts (rule_id, user_id, station_id, metric, threshold, actual_value, aqi_category, title, message)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [
        rule.id,
        rule.user_id,
        reading.station_id,
        rule.metric,
        rule.threshold,
        value,
        aqiCategory,
        title,
        message,
      ],
    );

    if (!result.rows?.[0]) return null;

    const alert: CreatedAlert = {
      id: result.rows[0].id,
      rule_id: rule.id,
      user_id: rule.user_id,
      station_id: reading.station_id,
      metric: rule.metric,
      threshold: Number(rule.threshold),
      actual_value: value,
      aqi_category: aqiCategory,
      title,
      message,
      channels: rule.channels,
    };

    await this.dispatcher.dispatch(alert);

    return alert;
  }

  private getMetricValue(reading: LatestReading, metric: string): number | null {
    switch (metric) {
      case "aqi":  return reading.aqi;
      case "pm25": return reading.pm25;
      case "pm10": return reading.pm10;
      case "o3":   return reading.o3;
      case "no2":  return reading.no2;
      case "so2":  return reading.so2;
      case "co":   return reading.co;
      default:     return null;
    }
  }

  private compare(value: number, operator: string, threshold: number): boolean {
    switch (operator) {
      case "gte": return value >= threshold;
      case "lte": return value <= threshold;
      case "gt":  return value > threshold;
      case "lt":  return value < threshold;
      default:    return false;
    }
  }

  private async isDuplicateWithinCooldown(ruleId: string, cooldownMin: number): Promise<boolean> {
    const row = await this.em.getConnection().execute(
      `SELECT COUNT(*)::TEXT AS cnt FROM app.alerts
       WHERE rule_id = $1 AND created_at > now() - ($2 || ' minutes')::INTERVAL`,
      [ruleId, String(cooldownMin)],
    );
    const cnt = row.rows?.[0]?.cnt;
    return cnt ? parseInt(cnt, 10) > 0 : false;
  }

  private getAqiCategoryCode(aqi: number): string {
    if (aqi <= 50)  return "good";
    if (aqi <= 100) return "moderate";
    if (aqi <= 150) return "unhealthy_sensitive";
    if (aqi <= 200) return "unhealthy";
    if (aqi <= 300) return "very_unhealthy";
    return "hazardous";
  }

  private async getLatestReadings(): Promise<LatestReading[]> {
    const rows = await this.em.getConnection().execute(`
      SELECT DISTINCT ON (s.id)
        s.id          AS station_id,
        s.name        AS station_name,
        a.aqi,
        a.pm25,
        a.pm10,
        a.o3,
        a.no2,
        a.so2,
        a.co,
        a.observed_at
      FROM catalog.stations s
      JOIN core.air_quality_observations a ON a.station_id = s.id
      WHERE a.observed_at > now() - INTERVAL '2 hours'
      ORDER BY s.id, a.observed_at DESC
    `);
    return rows.rows ?? [];
  }
}
