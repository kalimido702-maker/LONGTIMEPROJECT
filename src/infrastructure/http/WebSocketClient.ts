// Browser-compatible WebSocket Client
// Uses native browser WebSocket API

export enum ConnectionState {
  CONNECTING = "connecting",
  CONNECTED = "connected",
  DISCONNECTED = "disconnected",
  RECONNECTING = "reconnecting",
  ERROR = "error",
}

export interface WebSocketConfig {
  url: string;
  reconnectInterval?: number;
  maxReconnectInterval?: number;
  reconnectDecay?: number;
  maxReconnectAttempts?: number;
  heartbeatInterval?: number;
}

export interface WebSocketMessage {
  type: string;
  payload?: any;
  timestamp?: number;
  // Sync message fields from backend
  table_name?: string;
  record_id?: string;
  operation?: 'create' | 'update' | 'delete';
  data?: any;
  room?: string;
  sourceDeviceId?: string;
}

type EventCallback = (...args: any[]) => void;

export class WebSocketClient {
  private ws: WebSocket | null = null;
  private config: Required<WebSocketConfig>;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private messageBuffer: WebSocketMessage[] = [];
  private currentState: ConnectionState = ConnectionState.DISCONNECTED;
  private authToken: string | null = null;
  private deviceId: string | null = null;

  // Simple event emitter implementation
  private eventListeners: Map<string, Set<EventCallback>> = new Map();

  constructor(config: WebSocketConfig) {
    this.config = {
      url: config.url,
      reconnectInterval: config.reconnectInterval || 1000,
      maxReconnectInterval: config.maxReconnectInterval || 30000,
      reconnectDecay: config.reconnectDecay || 1.5,
      maxReconnectAttempts: config.maxReconnectAttempts || Infinity,
      heartbeatInterval: config.heartbeatInterval || 30000,
    };
  }

  // Event emitter methods
  public on(event: string, callback: EventCallback): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(callback);
  }

  public off(event: string, callback: EventCallback): void {
    this.eventListeners.get(event)?.delete(callback);
  }

  public emit(event: string, ...args: any[]): void {
    this.eventListeners.get(event)?.forEach(callback => {
      try {
        callback(...args);
      } catch (error) {
        console.error(`Error in event listener for ${event}:`, error);
      }
    });
  }

  public setAuthToken(token: string): void {
    this.authToken = token;
  }

  public setDeviceId(id: string): void {
    this.deviceId = id;
  }

  public connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      console.log("WebSocket already connected");
      return;
    }

    this.setState(ConnectionState.CONNECTING);
    console.log("🔌 Connecting to WebSocket...", this.config.url);

    try {
      let url = this.config.url;
      const params = new URLSearchParams();

      if (this.authToken) {
        params.set("token", this.authToken);
      }
      if (this.deviceId) {
        params.set("device_id", this.deviceId);
      }

      const queryString = params.toString();
      if (queryString) {
        url = `${url}${url.includes('?') ? '&' : '?'}${queryString}`;
      }

      console.log("🔌 WebSocket URL:", url);
      this.ws = new WebSocket(url);
      this.setupEventHandlers();
    } catch (error) {
      console.error("❌ Failed to create WebSocket connection:", error);
      this.setState(ConnectionState.ERROR);
      this.scheduleReconnect();
    }
  }

  private setupEventHandlers(): void {
    if (!this.ws) return;

    this.ws.onopen = () => {
      console.log("✅ WebSocket connected");
      this.setState(ConnectionState.CONNECTED);
      this.reconnectAttempts = 0;
      this.startHeartbeat();
      this.flushMessageBuffer();
      this.emit("connected");
    };

    this.ws.onmessage = (event: MessageEvent) => {
      try {
        const data = typeof event.data === "string" ? event.data : String(event.data);
        const message = JSON.parse(data) as WebSocketMessage;
        this.handleMessage(message);
      } catch (error) {
        console.error("Failed to parse WebSocket message:", error);
      }
    };

    this.ws.onclose = (event: CloseEvent) => {
      console.log(`📴 WebSocket closed: ${event.code} - ${event.reason}`);
      this.setState(ConnectionState.DISCONNECTED);
      this.stopHeartbeat();
      this.emit("disconnected", { code: event.code, reason: event.reason });
      this.scheduleReconnect();
    };

    this.ws.onerror = (error: Event) => {
      console.error("❌ WebSocket error:", error);
      this.setState(ConnectionState.ERROR);
      this.emit("error", error);
    };
  }

  private handleMessage(message: WebSocketMessage): void {
    console.log("📨 Received WebSocket message:", message.type);

    switch (message.type) {
      case "ping":
        // Server-initiated heartbeat - must respond with pong
        if (this.ws?.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ type: "pong" }));
        }
        break;
      case "pong":
        // Heartbeat response
        break;
      case "sync":
        // Backend sends: { type, table_name, record_id, operation, data }
        // Construct payload from message properties
        this.emit("sync", {
          table: message.table_name,
          tableName: message.table_name,
          recordId: message.record_id,
          operation: message.operation,
          data: message.data,
          sourceDeviceId: message.sourceDeviceId || 'server',
          timestamp: message.timestamp || new Date().toISOString()
        });
        break;
      case "update":
        this.emit("update", message.payload);
        break;
      case "delete":
        this.emit("delete", message.payload);
        break;
      case "notification":
        this.emit("notification", message.payload);
        break;
      case "sync:change":
        this.emit("sync:change", message.payload);
        break;
      default:
        this.emit("message", message);
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.send({ type: "ping", payload: {} });
      }
    }, this.config.heartbeatInterval);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      return; // Already scheduled
    }

    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      console.error("Max reconnect attempts reached");
      this.emit("maxReconnectAttemptsReached");
      return;
    }

    const timeout = Math.min(
      this.config.reconnectInterval *
      Math.pow(this.config.reconnectDecay, this.reconnectAttempts),
      this.config.maxReconnectInterval
    );

    console.log(
      `🔄 Reconnecting in ${timeout}ms (attempt ${this.reconnectAttempts + 1})`
    );
    this.setState(ConnectionState.RECONNECTING);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.reconnectAttempts++;
      this.connect();
    }, timeout);
  }

  private flushMessageBuffer(): void {
    if (this.messageBuffer.length === 0) return;

    console.log(`📤 Flushing ${this.messageBuffer.length} buffered messages`);
    const buffer = [...this.messageBuffer];
    this.messageBuffer = [];

    buffer.forEach((message) => {
      this.send(message);
    });
  }

  public send(message: WebSocketMessage): void {
    message.timestamp = message.timestamp || Date.now();

    if (this.ws?.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(message));
      } catch (error) {
        console.error("Failed to send WebSocket message:", error);
        this.messageBuffer.push(message);
      }
    } else {
      // Buffer message if not connected
      this.messageBuffer.push(message);
      if (this.currentState === ConnectionState.DISCONNECTED) {
        this.connect();
      }
    }
  }

  public disconnect(): void {
    console.log("📴 Disconnecting WebSocket...");

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.stopHeartbeat();

    if (this.ws) {
      this.ws.close(1000, "Client disconnect");
      this.ws = null;
    }

    this.setState(ConnectionState.DISCONNECTED);
  }

  public getState(): ConnectionState {
    return this.currentState;
  }

  private setState(state: ConnectionState): void {
    if (this.currentState !== state) {
      this.currentState = state;
      this.emit("stateChange", state);
    }
  }

  public isConnected(): boolean {
    return this.currentState === ConnectionState.CONNECTED;
  }

  public getBufferedMessageCount(): number {
    return this.messageBuffer.length;
  }

  public clearBuffer(): void {
    this.messageBuffer = [];
  }
}

// Singleton instance
let webSocketClientInstance: WebSocketClient | null = null;

export function createWebSocketClient(
  config: WebSocketConfig
): WebSocketClient {
  webSocketClientInstance = new WebSocketClient(config);
  return webSocketClientInstance;
}

export function getWebSocketClient(): WebSocketClient {
  if (!webSocketClientInstance) {
    throw new Error(
      "WebSocketClient not initialized. Call createWebSocketClient first."
    );
  }
  return webSocketClientInstance;
}
