import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * @class AuditService
 * @description Provides utilities for logging synchronization events to the SyncAuditLog model.
 */
export class AuditService {
  /**
   * Logs a synchronization event.
   * @param entityType The type of entity being synchronized (e.g., "PRODUCT", "ORDER").
   * @param entityId The Shopify ID of the entity.
   * @param status The status of the sync operation (e.g., "SUCCESS", "FAILURE", "QUEUED").
   * @param message Optional detailed message about the sync event.
   * @param error Optional JSON object for error details if the sync failed.
   */
  async log(
    entityType: string,
    entityId: string,
    status: string,
    message?: string,
    error?: any,
  ): Promise<void> {
    try {
      await prisma.syncAuditLog.create({
        data: {
          entityType,
          entityId,
          status,
          message,
          error: error ? JSON.stringify(error) : undefined, // Store error as JSON string
        },
      });
    } catch (e) {
      console.error('Failed to write to SyncAuditLog:', e);
      // Depending on criticality, you might want to re-throw or handle differently
    }
  }
}
