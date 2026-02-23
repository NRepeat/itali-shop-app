import { AuditService } from "./audit.service";

/**
 * @abstract
 * @class BaseSyncer
 * @description Provides a foundational structure for handling webhook-based entity synchronization.
 * It enforces a common pattern for processing data, reconciling entities, and preventing stale updates.
 *
 * @template TPayload The expected type of the webhook payload.
 */
export abstract class BaseSyncer<TPayload extends { updated_at: string }> {
  /**
   * @protected
   * @abstract
   * @property {string} queueName - The name of the BullMQ queue for this specific syncer.
   */
  protected abstract readonly queueName: string;

  /**
   * @protected
   * @property {AuditService} auditService - An instance of the audit service for logging.
   */
  protected readonly auditService: AuditService;

  constructor() {
    this.auditService = new AuditService();
  }

  /**
   * @public
   * @async
   * @method handleWebhook
   * @description Primary entry point for incoming webhook data. It checks for data staleness
   * before deferring the main processing logic.
   *
   * @param {TPayload} payload - The webhook payload.
   * @returns {Promise<void>}
   */
  public async handleWebhook(payload: TPayload): Promise<void> {
    if (await this.isStale(payload)) {
      console.log(`Skipping stale webhook for ${this.queueName}`);
      // Optionally log this to the audit log as an "IGNORED" event
      return;
    }
    // In a real implementation, this would add to a BullMQ queue.
    // For now, we'll call process directly.
    return this.process(payload);
  }

  /**
   * @protected
   * @abstract
   * @method process
   * @description The core logic for processing a webhook payload. This is where entity
   * creation or updates should happen.
   *
   * @param {TPayload} payload - The webhook payload to process.
   * @returns {Promise<void>}
   */
  protected abstract process(payload: TPayload): Promise<void>;

  /**
   * @public
   * @abstract
   * @method reconcile
   * @description A method to perform a full reconciliation of all entities of this type.
   * This is typically triggered manually or on a schedule.
   *
   * @returns {Promise<void>}
   */
  public abstract reconcile(): Promise<void>;

  /**
   * @protected
   * @abstract
   * @method isStale
   * @description Compares the `updated_at` timestamp from the incoming webhook payload
   * with the existing record in the database to prevent race conditions and stale updates.
   *
   * @param {TPayload} payload - The incoming webhook payload.
   * @returns {Promise<boolean>} - True if the payload is stale, false otherwise.
   */
  protected abstract isStale(payload: TPayload): Promise<boolean>;
}
