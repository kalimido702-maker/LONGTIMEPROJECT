/**
 * WhatsApp Bot Listener - يستمع للرسائل الواردة ويرد عليها
 * 
 * يعمل كـ React hook - يتم تفعيله في App.tsx أو في أي مكان مناسب
 * يستمع للرسائل عبر IPC ويستدعي whatsappBotService لمعالجتها
 * يدعم إرسال ملفات PDF مع الردود (فواتير، إيصالات...)
 */

import { useEffect, useRef } from "react";
import { handleBotMessage, getBotSettings } from "./whatsappBotService";

/**
 * Hook لتشغيل بوت الواتساب
 * يجب استدعاؤه مرة واحدة في App.tsx
 */
export function useWhatsAppBot() {
    const processingRef = useRef(new Set<string>());

    useEffect(() => {
        const api = (window as any).electronAPI?.whatsapp;
        if (!api?.onBotIncoming || !api?.botReply) {
            console.log("[WhatsApp Bot] Electron API not available - bot disabled");
            return;
        }

        // Sync bot enabled state to main process
        const settings = getBotSettings();
        api.botSetEnabled?.(settings.enabled);

        // Listen for incoming messages
        api.onBotIncoming(async (data: any) => {
            const { accountId, senderPhone, senderJid, messageText } = data;
            
            // Deduplicate (prevent double-processing)
            const msgKey = `${senderPhone}:${messageText}:${Date.now()}`;
            if (processingRef.current.has(msgKey)) return;
            processingRef.current.add(msgKey);
            
            // Cleanup old keys after 10 seconds
            setTimeout(() => processingRef.current.delete(msgKey), 10000);

            try {
                console.log(`[WhatsApp Bot] Processing: "${messageText}" from ${senderPhone}`);
                
                const reply = await handleBotMessage(senderPhone, messageText);
                
                if (reply) {
                    console.log(`[WhatsApp Bot] Sending reply to ${senderPhone}:`, reply.text.substring(0, 100), reply.media ? "(+PDF)" : "(text only)");
                    
                    let result: any;
                    
                    if (reply.media && api.botReplyWithMedia) {
                        // إرسال نص + ملف PDF
                        result = await api.botReplyWithMedia(
                            accountId,
                            senderJid,
                            reply.text,
                            reply.media.base64,
                            reply.media.filename
                        );
                    } else {
                        // إرسال نص فقط
                        result = await api.botReply(accountId, senderJid, reply.text);
                    }
                    
                    if (result?.success) {
                        console.log(`[WhatsApp Bot] ✅ Reply sent to ${senderPhone}${reply.media ? " (with PDF)" : ""}`);
                    } else {
                        console.error(`[WhatsApp Bot] ❌ Failed to send reply:`, result?.message);
                    }
                }
            } catch (error) {
                console.error("[WhatsApp Bot] Error:", error);
            }
        });

        console.log("[WhatsApp Bot] 🤖 Bot listener registered (with PDF support)");

        return () => {
            api.removeBotIncomingListener?.();
            console.log("[WhatsApp Bot] Bot listener removed");
        };
    }, []);
}
