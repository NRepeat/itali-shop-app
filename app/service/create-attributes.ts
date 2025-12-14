import { externalDB } from "@shared/lib/prisma/prisma.server";
import { createMetaobject } from "./shopify/metaobjects/createMetaobject";
import { CreateMetaobjectMutationVariables, MetaobjectStatus } from "@/types";
import { AdminApiContext } from "@shopify/shopify-app-react-router/server";

export const createAttributes = async (productId:number, admin: AdminApiContext): Promise<string[]> => {

  const createdMetaobjectGids: string[] = [];

  const product_attributes = await externalDB.bc_product_attribute.findMany({ where: { product_id: productId, language_id: { in: [1, 3] } } });
  if (product_attributes && product_attributes.length > 0) {
    const uniqueAttributeIds = [...new Set(product_attributes.map(attr => attr.attribute_id))];

    for (const attributeId of uniqueAttributeIds) {
      const ukAttr = product_attributes.find(attr => attr.attribute_id === attributeId && attr.language_id === 3);
      const ruAttr = product_attributes.find(attr => attr.attribute_id === attributeId && attr.language_id === 1);

      if (!ukAttr) continue; // Must have UK attribute data

      const attribute = await externalDB.bc_attribute.findFirst({ where: { attribute_id: attributeId } });
      if (!attribute) continue;

      const ukAttributeDesc = await externalDB.bc_attribute_description.findFirst({ where: { attribute_id: attributeId, language_id: 3 } });
      if (!ukAttributeDesc) continue; // Must have UK attribute description

      const ruAttributeDesc = await externalDB.bc_attribute_description.findFirst({ where: { attribute_id: attributeId, language_id: 1 } });

      const input: CreateMetaobjectMutationVariables = {
        metaobject: {
          type: "attribute",
          capabilities: {
            publishable: { status: "ACTIVE" as MetaobjectStatus.Active }
          },
          fields: [
            { key: "title", value: ukAttributeDesc?.name },
            { key: "atribute_payload", value: ukAttr.text },
            { key: "ru_title", value: ruAttributeDesc?.name || "" },
            { key: "ru_translation", value: ruAttr?.text || "" }
          ]
        }
      };
      const createdMetaobject = await createMetaobject(input, admin);
      if (createdMetaobject && createdMetaobject.id) {
        createdMetaobjectGids.push(createdMetaobject.id);
      }
    }
  }
  return createdMetaobjectGids;
};
