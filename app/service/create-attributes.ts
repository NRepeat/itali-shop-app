import { externalDB } from "@shared/lib/prisma/prisma.server";
import { createMetaobject } from "./shopify/metaobjects/createMetaobject";
import { CreateMetaobjectMutationVariables, MetaobjectStatus } from "@/types";
import { AdminApiContext } from "@shopify/shopify-app-react-router/server";

export const createAttributes = async (productId:number, admin: AdminApiContext): Promise<string[]> => {

  const createdMetaobjectGids: string[] = [];

 const product_attributes = await externalDB.bc_product_attribute.findMany({where:{product_id:productId,language_id:{ in: [1, 3] }}})
 if(product_attributes && product_attributes.length > 0){
   const uk = product_attributes.filter(attr => attr.language_id === 3);
   const ru = product_attributes.filter(attr => attr.language_id === 1);
   for(const attr of product_attributes){
    const attribute =  await externalDB.bc_attribute.findFirst({where:{attribute_id:attr.attribute_id}})
    if(!attribute) continue;
    const attributeDesc = await externalDB.bc_attribute_description.findFirst({where:{attribute_id:attribute.attribute_id,language_id:3}})
    if(!attributeDesc) continue;
    const input:CreateMetaobjectMutationVariables = {
      metaobject:{
        type:"attribute",
        capabilities:{
          publishable:{status:"ACTIVE" as MetaobjectStatus.Active}
        },
        // handle:attributeDesc?.name +"-"+ productId.toString(),
        fields:[{key:"title",value:attributeDesc?.name},{key:'atribute_payload',value:attr.text},{key:'ru_translation',},{key:"ru_title"}]
      }
    }
    const createdMetaobject = await createMetaobject(input,admin)
    if (createdMetaobject && createdMetaobject.id) {
        createdMetaobjectGids.push(createdMetaobject.id);
    }
   }
 }
 return createdMetaobjectGids;
};
