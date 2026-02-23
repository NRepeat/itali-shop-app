import { BaseSyncer } from "~/service/sync/base.syncer";

export class OrderSyncer extends BaseSyncer {
  constructor() {
    super({
      entity: "order",
      entityIdField: "id",
      entityNameField: "name",
      updatedAtField: "updated_at",
    });
  }

  protected async process(payload: any): Promise<void> {
    console.log(`Processing order update for ${payload.name}`);
    //
  }

  protected async isStale(payload: any): Promise<boolean> {
    console.log(
      `Checking if order ${payload.name} is stale.`,
      payload.updated_at
    );
    return false;
  }
}
