import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Headers,
  Param,
  Body,
} from "@nestjs/common";
import { requireAuth } from "../auth/jwt";
import { AlertRulesService, CreateRuleDto, UpdateRuleDto } from "./alert-rules.service";

@Controller("alert-rules")
export class AlertRulesController {
  constructor(private readonly rulesService: AlertRulesService) {}

  @Get()
  async list(@Headers("authorization") authHeader?: string) {
    const claims = requireAuth(authHeader);
    return this.rulesService.listByUser(claims.sub);
  }

  @Get(":id")
  async getOne(
    @Param("id") id: string,
    @Headers("authorization") authHeader?: string,
  ) {
    const claims = requireAuth(authHeader);
    return this.rulesService.getById(id, claims.sub);
  }

  @Post()
  async create(
    @Body() dto: CreateRuleDto,
    @Headers("authorization") authHeader?: string,
  ) {
    const claims = requireAuth(authHeader);
    return this.rulesService.create(claims.sub, dto);
  }

  @Put(":id")
  async update(
    @Param("id") id: string,
    @Body() dto: UpdateRuleDto,
    @Headers("authorization") authHeader?: string,
  ) {
    const claims = requireAuth(authHeader);
    return this.rulesService.update(id, claims.sub, dto);
  }

  @Delete(":id")
  async remove(
    @Param("id") id: string,
    @Headers("authorization") authHeader?: string,
  ) {
    const claims = requireAuth(authHeader);
    await this.rulesService.delete(id, claims.sub);
    return { success: true };
  }
}
