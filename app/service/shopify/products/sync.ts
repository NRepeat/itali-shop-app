import { BaseSyncer } from "~/service/sync/base.syncer";

export class ProductSyncer extends BaseSyncer {
  constructor() {
    super({
      entity: "product",
      entityIdField: "id",
      entityNameField: "title",
      updatedAtField: "updated_at",
    });
  }

  protected async process(payload: any): Promise<void> {
    console.log(`Processing product update for ${payload.title}`);
    const handle = await this.resolveHandleCollision(payload.handle, payload.id);
    // ...
  }

  private async resolveHandleCollision(
    handle: string,
    productId: string
  ): Promise<string> {
    // This is a placeholder. The actual implementation will depend on how products are stored and queried.
    const handleExists = false;
    if (handleExists) {
      return `${handle}-${productId}`;
    }
    return handle;
  }


  protected async isStale(payload: any): Promise<boolean> {
    console.log(
      `Checking if product ${payload.title} is stale.`,
      payload.updated_at
    );
    return false;
  }
}
