import { BaseSyncer } from "~/service/sync/base.syncer";

export class CustomerSyncer extends BaseSyncer {
  constructor() {
    super({
      entity: "customer",
      entityIdField: "id",
      entityNameField: "email",
      updatedAtField: "updated_at",
    });
  }

  protected async process(payload: any): Promise<void> {
    console.log(`Processing customer update for ${payload.email}`);
    //
  }

  protected async isStale(payload: any): Promise<boolean> {
    console.log(
      `Checking if customer ${payload.email} is stale.`,
      payload.updated_at
    );
    return false;
  }
}
