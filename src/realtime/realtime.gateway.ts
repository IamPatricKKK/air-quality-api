import { Logger, OnModuleInit } from "@nestjs/common";
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import type { Server, Socket } from "socket.io";
import { verifyAccessToken } from "../auth/jwt";

interface ObservationUpdate {
  station_id: string;
  station_code?: string;
  station_name?: string;
  aqi: number | null;
  pm25: number | null;
  pm10: number | null;
  observed_at: string;
  provider: string;
}

interface AlertEvent {
  user_id: string;
  alert_id: string;
  station_id: string | null;
  title: string;
  message: string;
  category: string | null;
}

@WebSocketGateway({
  namespace: "/realtime",
  cors: { origin: true, credentials: true },
})
export class RealtimeGateway
  implements OnModuleInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server!: Server;

  onModuleInit() {
    this.logger.log("Realtime gateway initialized on /realtime");
  }

  handleConnection(client: Socket) {
    const token = this.extractToken(client);
    if (!token) {
      client.emit("error", { message: "Missing auth token" });
      client.disconnect(true);
      return;
    }

    try {
      const claims = verifyAccessToken(token);
      client.data.userId = claims.sub;
      client.data.roles = claims.roles ?? [];
      client.join(`user:${claims.sub}`);
      client.join("stations");
      this.logger.debug(`Client connected: ${claims.sub}`);
    } catch (err) {
      this.logger.warn(`Auth rejected: ${String(err)}`);
      client.emit("error", { message: "Invalid token" });
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    if (client.data.userId) {
      this.logger.debug(`Client disconnected: ${client.data.userId}`);
    }
  }

  @SubscribeMessage("ping")
  handlePing() {
    return { pong: Date.now() };
  }

  broadcastObservations(updates: ObservationUpdate[]) {
    if (!updates.length) return;
    this.server.to("stations").emit("observations:updated", { updates, ts: Date.now() });
  }

  broadcastAlert(event: AlertEvent) {
    this.server.to(`user:${event.user_id}`).emit("alert:new", event);
  }

  private extractToken(client: Socket): string | null {
    const auth = client.handshake.auth?.token as string | undefined;
    if (auth) return auth;
    const header = client.handshake.headers?.authorization;
    if (typeof header === "string" && header.startsWith("Bearer ")) {
      return header.slice(7);
    }
    const query = client.handshake.query?.token;
    if (typeof query === "string") return query;
    return null;
  }
}
