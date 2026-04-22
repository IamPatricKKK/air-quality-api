import { Injectable, NotFoundException } from "@nestjs/common";
import { EntityManager } from "@mikro-orm/postgresql";
import { UserAlertRule } from "../entities";

export interface AlertRuleRow {
  id: string;
  user_id: string;
  station_id: string | null;
  metric: string;
  operator: string;
  threshold: number;
  channels: string[];
  cooldown_min: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  station_name?: string;
}

export interface CreateRuleDto {
  station_id?: string | null;
  metric?: string;
  operator?: string;
  threshold: number;
  channels?: string[];
  cooldown_min?: number;
}

export interface UpdateRuleDto {
  station_id?: string | null;
  metric?: string;
  operator?: string;
  threshold?: number;
  channels?: string[];
  cooldown_min?: number;
  is_active?: boolean;
}

@Injectable()
export class AlertRulesService {
  constructor(private readonly em: EntityManager) {}

  async listByUser(userId: string): Promise<AlertRuleRow[]> {
    const rows = await this.em.getConnection().execute(
      `SELECT r.id, r.user_id, r.station_id, r.metricCode as metric, r.operator, r.thresholdValue as threshold,
              r.channels, r.cooldownMinutes as cooldown_min, r.isActive as is_active, r.createdAt as created_at, r.updatedAt as updated_at,
              s.name AS station_name
       FROM app.user_alert_rules r
       LEFT JOIN catalog.stations s ON s.id = r.station_id
       WHERE r.user_id = $1
       ORDER BY r.createdAt DESC`,
      [userId],
    );
    return rows.rows ?? [];
  }

  async getById(ruleId: string, userId: string): Promise<AlertRuleRow> {
    const rows = await this.em.getConnection().execute(
      `SELECT r.id, r.user_id, r.station_id, r.metricCode as metric, r.operator, r.thresholdValue as threshold,
              r.channels, r.cooldownMinutes as cooldown_min, r.isActive as is_active, r.createdAt as created_at, r.updatedAt as updated_at,
              s.name AS station_name
       FROM app.user_alert_rules r
       LEFT JOIN catalog.stations s ON s.id = r.station_id
       WHERE r.id = $1 AND r.user_id = $2`,
      [ruleId, userId],
    );
    const row = rows.rows?.[0];
    if (!row) throw new NotFoundException("Rule not found");
    return row;
  }

  async create(userId: string, dto: CreateRuleDto): Promise<AlertRuleRow> {
    const rule = this.em.create(UserAlertRule, {
      user: { id: userId } as any,
      station: dto.station_id ? { id: dto.station_id } as any : null,
      metricCode: dto.metric ?? "aqi",
      operator: dto.operator ?? ">=",
      thresholdValue: dto.threshold,
      channels: dto.channels ?? ["in_app"],
      cooldownMinutes: dto.cooldown_min ?? 360,
      isActive: true,
    });
    await this.em.persistAndFlush(rule);

    // Return as AlertRuleRow format
    return {
      id: rule.id,
      user_id: userId,
      station_id: dto.station_id ?? null,
      metric: rule.metricCode,
      operator: rule.operator,
      threshold: rule.thresholdValue,
      channels: rule.channels,
      cooldown_min: rule.cooldownMinutes,
      is_active: rule.isActive,
      created_at: rule.createdAt.toISOString(),
      updated_at: rule.updatedAt.toISOString(),
    };
  }

  async update(ruleId: string, userId: string, dto: UpdateRuleDto): Promise<AlertRuleRow> {
    const existing = await this.getById(ruleId, userId);

    const rule = await this.em.findOne(UserAlertRule, ruleId);
    if (!rule) throw new NotFoundException("Rule not found");

    if (dto.station_id !== undefined) rule.station = dto.station_id ? { id: dto.station_id } as any : null;
    if (dto.metric !== undefined) rule.metricCode = dto.metric;
    if (dto.operator !== undefined) rule.operator = dto.operator;
    if (dto.threshold !== undefined) rule.thresholdValue = dto.threshold;
    if (dto.channels !== undefined) rule.channels = dto.channels;
    if (dto.cooldown_min !== undefined) rule.cooldownMinutes = dto.cooldown_min;
    if (dto.is_active !== undefined) rule.isActive = dto.is_active;
    rule.updatedAt = new Date();

    await this.em.persistAndFlush(rule);

    return {
      id: rule.id,
      user_id: rule.user.id,
      station_id: rule.station?.id ?? null,
      metric: rule.metricCode,
      operator: rule.operator,
      threshold: rule.thresholdValue,
      channels: rule.channels,
      cooldown_min: rule.cooldownMinutes,
      is_active: rule.isActive,
      created_at: rule.createdAt.toISOString(),
      updated_at: rule.updatedAt.toISOString(),
    };
  }

  async delete(ruleId: string, userId: string): Promise<void> {
    await this.getById(ruleId, userId);
    const rule = await this.em.findOne(UserAlertRule, ruleId);
    if (rule) {
      await this.em.removeAndFlush(rule);
    }
  }

  async listActiveRules(): Promise<AlertRuleRow[]> {
    const rows = await this.em.getConnection().execute(
      `SELECT r.id, r.user_id, r.station_id, r.metricCode as metric, r.operator, r.thresholdValue as threshold,
              r.channels, r.cooldownMinutes as cooldown_min, r.isActive as is_active, r.createdAt as created_at, r.updatedAt as updated_at,
              s.name AS station_name
       FROM app.user_alert_rules r
       LEFT JOIN catalog.stations s ON s.id = r.station_id
       WHERE r.isActive = TRUE`,
    );
    return rows.rows ?? [];
  }
}
