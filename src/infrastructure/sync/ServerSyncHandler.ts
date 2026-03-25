import { SyncEngine } from "./SyncEngine";
import { getDatabaseService } from "../database/DatabaseService";

import { getStoreName } from './syncConstants';

/**
 * ServerSyncHandler - Handles incoming sync updates from the server
 * 
 * Listens to SyncEngine events and updates local IndexedDB without triggering circular sync
 */
export class ServerSyncHandler {
    private syncEngine: SyncEngine;

    constructor(syncEngine: SyncEngine) {
        this.syncEngine = syncEngine;
        this.setupEventListeners();
    }

    private setupEventListeners(): void {
        // Handle batch of changes from server
        this.syncEngine.on("serverChanges", (changes: any[]) => {
            this.handleServerChanges(changes);
        });

        // Handle real-time update from WebSocket
        this.syncEngine.on("remoteUpdate", (data: any) => {
            this.handleRemoteUpdate(data);
        });

        // Handle real-time delete from WebSocket
        this.syncEngine.on("remoteDelete", (data: any) => {
            this.handleRemoteDelete(data);
        });
    }

    private async handleServerChanges(changes: any[]): Promise<void> {
        console.log(`[ServerSyncHandler] Processing ${changes.length} changes from server`);

        const dbService = getDatabaseService();
        let applied = 0;
        let failed = 0;

        for (const change of changes) {
            try {
                // Get table/store name - handle both formats
                const tableName = change.table_name || change.tableName;
                const storeName = getStoreName(tableName);

                // Get record ID and data
                const recordId = change.record_id || change.recordId || change.data?.id;
                const recordData = change.data || change;

                if (!storeName || !recordId) {
                    console.warn(`[ServerSyncHandler] Invalid change format:`, change);
                    continue;
                }

                const repository = dbService.getRepository(storeName);

                if (change.is_deleted || change.isDeleted) {
                    // Delete record
                    await repository.deleteFromServer(recordId);
                    console.log(`[ServerSyncHandler] ✅ Deleted: ${storeName}#${recordId}`);
                } else {
                    // Update or create record - use correct signature (id, data)
                    await repository.updateFromServer(recordId, recordData);
                    console.log(`[ServerSyncHandler] ✅ Updated: ${storeName}#${recordId}`);
                }
                applied++;
            } catch (error) {
                failed++;
                console.error(
                    `[ServerSyncHandler] ❌ Failed: ${change.table_name}#${change.record_id}:`,
                    error
                );
            }
        }

        console.log(`[ServerSyncHandler] Complete: ${applied} applied, ${failed} failed`);

        // Emit event for UI refresh
        if (applied > 0) {
            window.dispatchEvent(new CustomEvent('sync:dataUpdated', {
                detail: { count: applied }
            }));
        }
    }

    private async handleRemoteUpdate(data: any): Promise<void> {
        const tableName = data.table_name || data.tableName || data.table;
        const recordId = data.record_id || data.recordId || data.id;
        const recordData = data.data || data;

        console.log(`[ServerSyncHandler] Remote update for ${tableName}#${recordId}`);

        try {
            const dbService = getDatabaseService();
            const storeName = getStoreName(tableName);
            const repository = dbService.getRepository(storeName);
            await repository.updateFromServer(recordId, recordData);

            // Emit event for UI refresh
            window.dispatchEvent(new CustomEvent('sync:dataUpdated', {
                detail: { table: storeName, id: recordId }
            }));
        } catch (error) {
            console.error(`[ServerSyncHandler] Failed remote update ${tableName}#${recordId}:`, error);
        }
    }

    private async handleRemoteDelete(data: any): Promise<void> {
        const { table_name, record_id } = data;

        console.log(`ServerSyncHandler: Remote delete for ${table_name}#${record_id}`);

        try {
            const dbService = getDatabaseService();
            const repository = dbService.getRepository(table_name);
            await repository.deleteFromServer(record_id);
        } catch (error) {
            console.error(`Failed to handle remote delete for ${table_name}#${record_id}:`, error);
        }
    }

    public destroy(): void {
        // Remove all event listeners
        this.syncEngine.removeAllListeners("serverChanges");
        this.syncEngine.removeAllListeners("remoteUpdate");
        this.syncEngine.removeAllListeners("remoteDelete");
    }
}

// Singleton instance
let serverSyncHandlerInstance: ServerSyncHandler | null = null;

export function createServerSyncHandler(syncEngine: SyncEngine): ServerSyncHandler {
    serverSyncHandlerInstance = new ServerSyncHandler(syncEngine);
    return serverSyncHandlerInstance;
}

export function getServerSyncHandler(): ServerSyncHandler | null {
    return serverSyncHandlerInstance;
}
