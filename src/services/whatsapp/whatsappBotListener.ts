/**
 * WhatsApp Bot Listener - يستمع لإشعارات البوت من السيرفر
 *
 * البوت يعمل على السيرفر الآن (BotService)
 * هذا الـ hook يستقبل الأحداث عبر WebSocket فقط لعرضها في الواجهة
 */

import { useEffect, useCallback } from "react";
import { getWebSocketClient } from "@/infrastructure/http/WebSocketClient";

interface BotEvent {
  type: "whatsapp:bot-incoming";
  payload: {
    accountId: string;
    senderPhone: string;
    messageText: string;
    reply?: string;
  };
}

type BotNotificationHandler = (event: BotEvent["payload"]) => void;

let notificationHandlers: BotNotificationHandler[] = [];

/**
 * Hook لتشغيل مستمع إشعارات بوت الواتساب
 * يستقبل الأحداث من السيرفر عبر WebSocket
 */
export function useWhatsAppBot() {
  useEffect(() => {
    let wsClient: ReturnType<typeof getWebSocketClient> | null = null;

    try {
      wsClient = getWebSocketClient();
    } catch {
      console.log("[WhatsApp Bot] WebSocket not available yet");
      return;
    }

    const handleMessage = (message: any) => {
      if (message?.type === "whatsapp:bot-incoming") {
        const payload = message.payload;
        console.log(
          `[WhatsApp Bot] 🤖 ${payload.senderPhone}: "${payload.messageText}"`,
        );
        notificationHandlers.forEach((h) => h(payload));
      }
    };

    wsClient.on("message", handleMessage);
    console.log("[WhatsApp Bot] 🤖 Bot listener registered (server-side)");

    return () => {
      wsClient?.off("message", handleMessage);
      console.log("[WhatsApp Bot] Bot listener removed");
    };
  }, []);
}

/**
 * Hook للاشتراك في إشعارات البوت (للعرض في UI)
 */
export function useWhatsAppBotNotifications(
  handler: BotNotificationHandler,
): void {
  const stableHandler = useCallback(handler, [handler]);

  useEffect(() => {
    notificationHandlers.push(stableHandler);
    return () => {
      notificationHandlers = notificationHandlers.filter(
        (h) => h !== stableHandler,
      );
    };
  }, [stableHandler]);
}
