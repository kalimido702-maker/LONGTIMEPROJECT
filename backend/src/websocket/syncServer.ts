import { FastifyInstance } from "fastify";
import type { WebSocket } from "ws";
import { logger } from "../config/logger.js";
import { getDatabase, isUsingSQLite } from "../config/database-factory.js";
import { RowDataPacket } from "mysql2/promise";

interface JwtPayload {
  userId?: number;
  clientId: string | number;  // Support both string UUIDs and legacy numbers
  branchId: string | number;  // Support both string UUIDs and legacy numbers
  role?: string;
  permissions?: string[];
  // License token fields
  licenseKey?: string;
  deviceId?: string;
  type?: string;
}

interface WebSocketClient {
  connection: WebSocket;
  userId: number | undefined;
  clientId: string | number;
  branchId: string | number;
  deviceId: string;
  role: string | undefined;
  rooms: string[];
  lastPing: Date;
}

interface SyncMessage {
  type: "sync" | "sync:change" | "ping" | "pong" | "subscribe" | "unsubscribe";
  table_name?: string;
  record_id?: string;
  operation?: "create" | "update" | "delete";
  data?: any;
  room?: string;
  timestamp?: string;
  sourceDeviceId?: string;
  payload?: any; // For sync:change messages
}

class WebSocketSyncServer {
  private clients: Map<string, WebSocketClient> = new Map();
  private rooms: Map<string, Set<string>> = new Map();
  private pingInterval: NodeJS.Timeout | null = null;
  private queueMonitor: NodeJS.Timeout | null = null;
  private readonly PING_INTERVAL = 30000;
  private readonly PING_TIMEOUT = 10000;

  constructor(private server: FastifyInstance) { }

  async initialize(): Promise<void> {
    // Register WebSocket route directly on the server
    this.server.get("/ws", { websocket: true }, (connection, req) => {
      this.handleConnection(connection, req);
    });

    this.startPingInterval();
    this.startQueueMonitoring();
    logger.info("✅ WebSocket Sync Server initialized");
  }

  private handleConnection(connection: any, req: any): void {
    let deviceId: string | null = null;
    // Handle both registration styles - connection.socket for nested register, connection directly for fastify.get
    const socket: WebSocket = connection.socket || connection;

    try {
      const url = new URL(req.url, `ws://${req.headers.host}`);
      const token = url.searchParams.get("token");
      const device_id = url.searchParams.get("device_id");

      if (!token || !device_id) {
        socket.send(
          JSON.stringify({
            type: "error",
            message: "Missing token or device_id",
          })
        );
        socket.close();
        return;
      }

      const decoded = this.server.jwt.verify(token) as JwtPayload;
      deviceId = device_id;

      const client: WebSocketClient = {
        connection: socket,
        userId: decoded.userId,
        clientId: decoded.clientId,
        branchId: decoded.branchId,
        deviceId: device_id,
        role: decoded.role,
        rooms: [],
        lastPing: new Date(),
      };

      this.clients.set(device_id, client);

      const defaultRoom = `${decoded.clientId}:${decoded.branchId}`;
      this.joinRoom(device_id, defaultRoom);

      if (decoded.role === "super_admin") {
        const adminRoom = `${decoded.clientId}:*`;
        this.joinRoom(device_id, adminRoom);
      }

      logger.info(
        {
          device_id,
          user_id: decoded.userId,
          client_id: decoded.clientId,
          branch_id: decoded.branchId,
          rooms: client.rooms,
        },
        "WebSocket client connected"
      );

      socket.send(
        JSON.stringify({
          type: "connected",
          device_id,
          rooms: client.rooms,
          timestamp: new Date().toISOString(),
        })
      );

      socket.on("message", (raw: any) => this.handleMessage(device_id!, raw));
      socket.on("close", () => this.handleDisconnect(device_id!));
      socket.on("error", (error: Error) => {
        logger.error({ error, device_id }, "WebSocket error");
        this.handleDisconnect(device_id!);
      });
    } catch (error) {
      logger.error({ error }, "WebSocket connection error");
      socket.send(
        JSON.stringify({ type: "error", message: "Authentication failed" })
      );
      socket.close();
      if (deviceId) this.handleDisconnect(deviceId);
    }
  }

  private handleMessage(deviceId: string, raw: any): void {
    try {
      const message: SyncMessage = JSON.parse(raw.toString());
      const client = this.clients.get(deviceId);
      if (!client) return;

      switch (message.type) {
        case "ping":
          client.lastPing = new Date();
          client.connection.send(JSON.stringify({ type: "pong" }));
          break;

        case "pong":
          client.lastPing = new Date();
          break;

        case "subscribe":
          if (message.room && this.canJoinRoom(client, message.room)) {
            this.joinRoom(deviceId, message.room);
            client.connection.send(
              JSON.stringify({ type: "subscribed", room: message.room })
            );
          } else {
            client.connection.send(
              JSON.stringify({
                type: "error",
                message: "Unauthorized to join room",
              })
            );
          }
          break;

        case "unsubscribe":
          if (message.room) {
            this.leaveRoom(deviceId, message.room);
            client.connection.send(
              JSON.stringify({ type: "unsubscribed", room: message.room })
            );
          }
          break;

        case "sync:change":
          // Client is notifying us of a change - broadcast to other clients
          if (message.payload) {
            const { table, recordId, operation, data, timestamp } = message.payload;
            const room = `${client.clientId}:${client.branchId}`;

            // Broadcast to all clients in the same room except sender
            this.broadcastSyncUpdate(room, {
              type: "sync:update",
              table,
              recordId,
              operation,
              data,
              timestamp: timestamp || new Date().toISOString(),
              sourceDeviceId: deviceId,
            }, deviceId);

            logger.debug({ deviceId, table, recordId, operation }, "Broadcasting sync:change");
          }
          break;
      }
    } catch (error) {
      logger.error({ error, deviceId }, "Failed to handle message");
    }
  }

  private handleDisconnect(deviceId: string): void {
    const client = this.clients.get(deviceId);
    if (!client) return;

    for (const room of client.rooms) {
      this.leaveRoom(deviceId, room);
    }

    this.clients.delete(deviceId);
    logger.info(
      {
        device_id: deviceId,
        user_id: client.userId,
        client_id: client.clientId,
        branch_id: client.branchId,
      },
      "WebSocket client disconnected"
    );
  }

  private joinRoom(deviceId: string, room: string): void {
    const client = this.clients.get(deviceId);
    if (!client) return;

    if (!this.rooms.has(room)) {
      this.rooms.set(room, new Set());
    }
    this.rooms.get(room)!.add(deviceId);

    if (!client.rooms.includes(room)) {
      client.rooms.push(room);
    }

    logger.debug({ device_id: deviceId, room }, "Client joined room");
  }

  private leaveRoom(deviceId: string, room: string): void {
    const client = this.clients.get(deviceId);
    if (!client) return;

    const roomClients = this.rooms.get(room);
    if (roomClients) {
      roomClients.delete(deviceId);
      if (roomClients.size === 0) {
        this.rooms.delete(room);
      }
    }

    client.rooms = client.rooms.filter((r) => r !== room);
    logger.debug({ device_id: deviceId, room }, "Client left room");
  }

  private canJoinRoom(client: WebSocketClient, room: string): boolean {
    const [roomClientId, roomBranchId] = room.split(":");

    // Convert to strings for comparison (supports both UUID strings and legacy numbers)
    const clientIdStr = String(client.clientId);
    const branchIdStr = String(client.branchId);

    if (client.role === "super_admin" && roomClientId === clientIdStr) {
      return true;
    }

    return (
      roomClientId === clientIdStr &&
      (roomBranchId === "*" || roomBranchId === branchIdStr)
    );
  }

  async broadcastToRoom(
    room: string,
    table_name: string,
    record_id: string,
    operation: "create" | "update" | "delete",
    data: any,
    excludeDeviceId?: string
  ): Promise<void> {
    const roomClients = this.rooms.get(room);
    if (!roomClients || roomClients.size === 0) return;

    const message: SyncMessage = {
      type: "sync",
      table_name,
      record_id,
      operation,
      data,
      room,
    };
    const messageStr = JSON.stringify(message);

    for (const deviceId of roomClients) {
      if (deviceId === excludeDeviceId) continue;

      const client = this.clients.get(deviceId);
      if (client && client.connection.readyState === 1) {
        try {
          client.connection.send(messageStr);
        } catch (error) {
          logger.error(
            { error, device_id: deviceId },
            "Failed to send message"
          );
        }
      }
    }

    logger.debug(
      {
        room,
        table_name,
        record_id,
        operation,
        recipients: roomClients.size - (excludeDeviceId ? 1 : 0),
      },
      "Broadcast sync message"
    );
  }

  /**
   * Broadcast a sync update to all clients in a room (for real-time sync)
   */
  private broadcastSyncUpdate(room: string, update: any, excludeDeviceId?: string): void {
    const roomClients = this.rooms.get(room);
    if (!roomClients || roomClients.size === 0) return;

    const messageStr = JSON.stringify(update);

    for (const deviceId of roomClients) {
      if (deviceId === excludeDeviceId) continue;

      const client = this.clients.get(deviceId);
      if (client && client.connection.readyState === 1) {
        try {
          client.connection.send(messageStr);
        } catch (error) {
          logger.error(
            { error, device_id: deviceId },
            "Failed to send sync update"
          );
        }
      }
    }

    logger.debug(
      {
        room,
        type: update.type,
        table: update.table,
        recordId: update.recordId,
        recipients: roomClients.size - (excludeDeviceId ? 1 : 0),
      },
      "Broadcast sync update"
    );
  }

  private startPingInterval(): void {
    this.pingInterval = setInterval(() => {
      const now = new Date();

      for (const [deviceId, client] of this.clients.entries()) {
        const timeSinceLastPing = now.getTime() - client.lastPing.getTime();

        if (timeSinceLastPing > this.PING_INTERVAL) {
          if (client.connection.readyState === 1) {
            client.connection.send(JSON.stringify({ type: "ping" }));
          }
        }

        if (timeSinceLastPing > this.PING_INTERVAL + this.PING_TIMEOUT) {
          logger.warn({ device_id: deviceId }, "WebSocket ping timeout");
          client.connection.close();
          this.handleDisconnect(deviceId);
        }
      }
    }, this.PING_INTERVAL);
  }

  private startQueueMonitoring(): void {
    this.queueMonitor = setInterval(async () => {
      try {
        const db = getDatabase();

        // Use correct column names: entity_type, entity_id
        const result = await db.execute<RowDataPacket>(
          `SELECT * FROM sync_queue WHERE processed_at IS NULL ORDER BY created_at ASC LIMIT 100`
        );
        const rows = result.rows || [];

        for (const row of rows) {
          const room = `${row.client_id}:${row.branch_id}`;
          let data = null;

          const tableName = row.entity_type; // entity_type stores the table name
          const recordId = row.entity_id;    // entity_id stores the record id
          const operation = row.operation;

          if (!tableName || !recordId) {
            // Skip invalid records - use SQLite-compatible datetime
            const nowQuery = isUsingSQLite()
              ? `UPDATE sync_queue SET processed_at = datetime('now') WHERE id = ?`
              : `UPDATE sync_queue SET processed_at = NOW() WHERE id = ?`;
            await db.execute(nowQuery, [row.id]);
            continue;
          }

          if (operation !== "delete") {
            try {
              // Note: better-sqlite3 doesn't support ?? placeholder for table names
              // Use string interpolation carefully for table names (validated from sync_queue)
              const recordResult = await db.execute<RowDataPacket>(
                `SELECT * FROM ${tableName} WHERE id = ? AND client_id = ?`,
                [recordId, row.client_id]
              );
              data = recordResult.rows[0] || null;
            } catch (e) {
              // Table might not exist or other error
              logger.warn({ tableName, recordId, error: e }, "Failed to fetch record for broadcast");
            }
          }

          await this.broadcastToRoom(
            room,
            tableName,
            recordId,
            operation,
            data,
            row.device_id // device_id instead of source_device_id
          );

          const updateQuery = isUsingSQLite()
            ? `UPDATE sync_queue SET processed_at = datetime('now') WHERE id = ?`
            : `UPDATE sync_queue SET processed_at = NOW() WHERE id = ?`;
          await db.execute(updateQuery, [row.id]);
        }

        // Cleanup old processed records - use SQLite-compatible date arithmetic
        const cleanupQuery = isUsingSQLite()
          ? `DELETE FROM sync_queue WHERE processed_at IS NOT NULL AND processed_at < datetime('now', '-7 days')`
          : `DELETE FROM sync_queue WHERE processed_at IS NOT NULL AND processed_at < DATE_SUB(NOW(), INTERVAL 7 DAY)`;
        await db.execute(cleanupQuery);
      } catch (error) {
        logger.error({ error }, "Queue monitoring error");
      }
    }, 5000);
  }


  async shutdown(): Promise<void> {
    if (this.pingInterval) clearInterval(this.pingInterval);
    if (this.queueMonitor) clearInterval(this.queueMonitor);

    for (const [deviceId, client] of this.clients.entries()) {
      client.connection.close();
      this.handleDisconnect(deviceId);
    }

    logger.info("WebSocket Sync Server shut down");
  }

  getStats(): any {
    return {
      connected_clients: this.clients.size,
      active_rooms: this.rooms.size,
      clients_per_room: Array.from(this.rooms.entries()).map(
        ([room, clients]) => ({ room, client_count: clients.size })
      ),
    };
  }
}

export let wsSyncServer: WebSocketSyncServer;

export async function initializeWebSocketServer(
  server: FastifyInstance
): Promise<void> {
  wsSyncServer = new WebSocketSyncServer(server);
  await wsSyncServer.initialize();
}
