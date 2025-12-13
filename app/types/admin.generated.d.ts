/* eslint-disable eslint-comments/disable-enable-pair */
/* eslint-disable eslint-comments/no-unlimited-disable */
/* eslint-disable */
import type * as AdminTypes from './admin.types';

export type CreateCollectionMutationVariables = AdminTypes.Exact<{
  input: AdminTypes.CollectionInput;
}>;


export type CreateCollectionMutation = { collectionCreate?: AdminTypes.Maybe<{ collection?: AdminTypes.Maybe<Pick<AdminTypes.Collection, 'id' | 'title' | 'handle'>>, userErrors: Array<Pick<AdminTypes.UserError, 'field' | 'message'>> }> };

export type CreateBasicAutomaticDiscountMutationVariables = AdminTypes.Exact<{
  basicAutomaticDiscount: AdminTypes.DiscountAutomaticBasicInput;
}>;


export type CreateBasicAutomaticDiscountMutation = { discountAutomaticBasicCreate?: AdminTypes.Maybe<{ automaticDiscountNode?: AdminTypes.Maybe<Pick<AdminTypes.DiscountAutomaticNode, 'id'>>, userErrors: Array<Pick<AdminTypes.DiscountUserError, 'field' | 'message' | 'code'>> }> };

export type CreateMetafieldDefinitionMutationVariables = AdminTypes.Exact<{
  definition: AdminTypes.MetafieldDefinitionInput;
}>;


export type CreateMetafieldDefinitionMutation = { metafieldDefinitionCreate?: AdminTypes.Maybe<{ createdDefinition?: AdminTypes.Maybe<(
      Pick<AdminTypes.MetafieldDefinition, 'id' | 'name' | 'key' | 'namespace' | 'ownerType'>
      & { type: Pick<AdminTypes.MetafieldDefinitionType, 'name' | 'category'> }
    )>, userErrors: Array<Pick<AdminTypes.MetafieldDefinitionCreateUserError, 'field' | 'message' | 'code'>> }> };

export type DeleteMetafieldDefinitionMutationVariables = AdminTypes.Exact<{
  id: AdminTypes.Scalars['ID']['input'];
  deleteAssociated: AdminTypes.Scalars['Boolean']['input'];
}>;


export type DeleteMetafieldDefinitionMutation = { metafieldDefinitionDelete?: AdminTypes.Maybe<(
    Pick<AdminTypes.MetafieldDefinitionDeletePayload, 'deletedDefinitionId'>
    & { userErrors: Array<Pick<AdminTypes.MetafieldDefinitionDeleteUserError, 'field' | 'message' | 'code'>> }
  )> };

export type GetMetafieldDefinitionsQueryVariables = AdminTypes.Exact<{
  ownerType: AdminTypes.MetafieldOwnerType;
  namespace?: AdminTypes.InputMaybe<AdminTypes.Scalars['String']['input']>;
}>;


export type GetMetafieldDefinitionsQuery = { metafieldDefinitions: { edges: Array<{ node: Pick<AdminTypes.MetafieldDefinition, 'id' | 'name' | 'key' | 'namespace'> }> } };

export type MetafieldDefinitionsQueryVariables = AdminTypes.Exact<{
  ownerType: AdminTypes.MetafieldOwnerType;
  first?: AdminTypes.InputMaybe<AdminTypes.Scalars['Int']['input']>;
  query?: AdminTypes.InputMaybe<AdminTypes.Scalars['String']['input']>;
  key?: AdminTypes.InputMaybe<AdminTypes.Scalars['String']['input']>;
}>;


export type MetafieldDefinitionsQuery = { metafieldDefinitions: { nodes: Array<(
      Pick<AdminTypes.MetafieldDefinition, 'id' | 'name' | 'namespace' | 'key'>
      & { type: Pick<AdminTypes.MetafieldDefinitionType, 'name'> }
    )> } };

export type MetafieldDefinitionPinMutationVariables = AdminTypes.Exact<{
  definitionId: AdminTypes.Scalars['ID']['input'];
}>;


export type MetafieldDefinitionPinMutation = { metafieldDefinitionPin?: AdminTypes.Maybe<{ pinnedDefinition?: AdminTypes.Maybe<Pick<AdminTypes.MetafieldDefinition, 'name' | 'key' | 'namespace' | 'pinnedPosition'>>, userErrors: Array<Pick<AdminTypes.MetafieldDefinitionPinUserError, 'field' | 'message'>> }> };

export type CreateMetaobjectMutationVariables = AdminTypes.Exact<{
  metaobject: AdminTypes.MetaobjectCreateInput;
}>;


export type CreateMetaobjectMutation = { metaobjectCreate?: AdminTypes.Maybe<{ metaobject?: AdminTypes.Maybe<Pick<AdminTypes.Metaobject, 'handle' | 'id' | 'type'>>, userErrors: Array<Pick<AdminTypes.MetaobjectUserError, 'field' | 'message' | 'code'>> }> };

export type CreateMetaobjectDefinitionMutationVariables = AdminTypes.Exact<{
  definition: AdminTypes.MetaobjectDefinitionCreateInput;
}>;


export type CreateMetaobjectDefinitionMutation = { metaobjectDefinitionCreate?: AdminTypes.Maybe<{ metaobjectDefinition?: AdminTypes.Maybe<(
      Pick<AdminTypes.MetaobjectDefinition, 'id' | 'name' | 'type'>
      & { fieldDefinitions: Array<Pick<AdminTypes.MetaobjectFieldDefinition, 'name' | 'key'>> }
    )>, userErrors: Array<Pick<AdminTypes.MetaobjectUserError, 'field' | 'message' | 'code'>> }> };

export type GetMetaobjectsQueryVariables = AdminTypes.Exact<{
  type: AdminTypes.Scalars['String']['input'];
  first: AdminTypes.Scalars['Int']['input'];
}>;


export type GetMetaobjectsQuery = { metaobjects: { nodes: Array<(
      Pick<AdminTypes.Metaobject, 'id' | 'handle' | 'displayName'>
      & { field?: AdminTypes.Maybe<Pick<AdminTypes.MetaobjectField, 'value'>> }
    )> } };

export type DeleteMetaobjectsMutationVariables = AdminTypes.Exact<{
  where: AdminTypes.MetaobjectBulkDeleteWhereCondition;
}>;


export type DeleteMetaobjectsMutation = { metaobjectBulkDelete?: AdminTypes.Maybe<{ job?: AdminTypes.Maybe<Pick<AdminTypes.Job, 'id' | 'done'>>, userErrors: Array<Pick<AdminTypes.MetaobjectUserError, 'message'>> }> };

export type DeleteMetaobjectDefinitionMutationVariables = AdminTypes.Exact<{
  id: AdminTypes.Scalars['ID']['input'];
}>;


export type DeleteMetaobjectDefinitionMutation = { metaobjectDefinitionDelete?: AdminTypes.Maybe<(
    Pick<AdminTypes.MetaobjectDefinitionDeletePayload, 'deletedId'>
    & { userErrors: Array<Pick<AdminTypes.MetaobjectUserError, 'field' | 'message' | 'code'>> }
  )> };

export type ProductVariantsCreateMutationVariables = AdminTypes.Exact<{
  productId: AdminTypes.Scalars['ID']['input'];
  variants: Array<AdminTypes.ProductVariantsBulkInput> | AdminTypes.ProductVariantsBulkInput;
}>;


export type ProductVariantsCreateMutation = { productVariantsBulkCreate?: AdminTypes.Maybe<{ productVariants?: AdminTypes.Maybe<Array<Pick<AdminTypes.ProductVariant, 'id' | 'title'>>>, userErrors: Array<Pick<AdminTypes.ProductVariantsBulkCreateUserError, 'field' | 'message'>> }> };

export type CreateProductAsynchronousMutationVariables = AdminTypes.Exact<{
  productSet: AdminTypes.ProductSetInput;
  synchronous: AdminTypes.Scalars['Boolean']['input'];
}>;


export type CreateProductAsynchronousMutation = { productSet?: AdminTypes.Maybe<{ product?: AdminTypes.Maybe<Pick<AdminTypes.Product, 'id'>>, productSetOperation?: AdminTypes.Maybe<(
      Pick<AdminTypes.ProductSetOperation, 'id' | 'status'>
      & { userErrors: Array<Pick<AdminTypes.ProductSetUserError, 'code' | 'field' | 'message'>> }
    )>, userErrors: Array<Pick<AdminTypes.ProductSetUserError, 'code' | 'field' | 'message'>> }> };

export type ProductDeleteMutationMutationVariables = AdminTypes.Exact<{
  id: AdminTypes.Scalars['ID']['input'];
}>;


export type ProductDeleteMutationMutation = { productDelete?: AdminTypes.Maybe<(
    Pick<AdminTypes.ProductDeletePayload, 'deletedProductId'>
    & { userErrors: Array<Pick<AdminTypes.UserError, 'field' | 'message'>> }
  )> };

export type ProductsQueryVariables = AdminTypes.Exact<{
  first: AdminTypes.Scalars['Int']['input'];
  after?: AdminTypes.InputMaybe<AdminTypes.Scalars['String']['input']>;
}>;


export type ProductsQuery = { products: { pageInfo: Pick<AdminTypes.PageInfo, 'hasNextPage' | 'endCursor'>, edges: Array<{ node: (
        Pick<AdminTypes.Product, 'id' | 'title' | 'handle'>
        & { variants: { edges: Array<{ node: Pick<AdminTypes.ProductVariant, 'id' | 'sku' | 'title'> }> } }
      ) }> } };

export type ProductCreateMediaMutationVariables = AdminTypes.Exact<{
  media: Array<AdminTypes.CreateMediaInput> | AdminTypes.CreateMediaInput;
  productId: AdminTypes.Scalars['ID']['input'];
}>;


export type ProductCreateMediaMutation = { productCreateMedia?: AdminTypes.Maybe<{ mediaUserErrors: Array<Pick<AdminTypes.MediaUserError, 'field' | 'message'>>, product?: AdminTypes.Maybe<Pick<AdminTypes.Product, 'id' | 'title'>> }> };

export type ProductVariantsCreateAMutationVariables = AdminTypes.Exact<{
  productId: AdminTypes.Scalars['ID']['input'];
  variants: Array<AdminTypes.ProductVariantsBulkInput> | AdminTypes.ProductVariantsBulkInput;
}>;


export type ProductVariantsCreateAMutation = { productVariantsBulkCreate?: AdminTypes.Maybe<{ productVariants?: AdminTypes.Maybe<Array<(
      Pick<AdminTypes.ProductVariant, 'id' | 'title'>
      & { selectedOptions: Array<Pick<AdminTypes.SelectedOption, 'name' | 'value'>> }
    )>>, userErrors: Array<Pick<AdminTypes.ProductVariantsBulkCreateUserError, 'field' | 'message'>> }> };

export type ProductVariantsBulkUpdateMutationVariables = AdminTypes.Exact<{
  productId: AdminTypes.Scalars['ID']['input'];
  variants: Array<AdminTypes.ProductVariantsBulkInput> | AdminTypes.ProductVariantsBulkInput;
  locationId: AdminTypes.Scalars['ID']['input'];
}>;


export type ProductVariantsBulkUpdateMutation = { productVariantsBulkUpdate?: AdminTypes.Maybe<{ product?: AdminTypes.Maybe<Pick<AdminTypes.Product, 'id'>>, productVariants?: AdminTypes.Maybe<Array<(
      Pick<AdminTypes.ProductVariant, 'id'>
      & { inventoryItem: (
        Pick<AdminTypes.InventoryItem, 'id'>
        & { inventoryLevel?: AdminTypes.Maybe<(
          Pick<AdminTypes.InventoryLevel, 'id'>
          & { quantities: Array<Pick<AdminTypes.InventoryQuantity, 'quantity'>> }
        )> }
      ) }
    )>>, userErrors: Array<Pick<AdminTypes.ProductVariantsBulkUpdateUserError, 'field' | 'message'>> }> };

export type UpdateProductWithNewMediaMutationVariables = AdminTypes.Exact<{
  product: AdminTypes.ProductUpdateInput;
  media?: AdminTypes.InputMaybe<Array<AdminTypes.CreateMediaInput> | AdminTypes.CreateMediaInput>;
}>;


export type UpdateProductWithNewMediaMutation = { productUpdate?: AdminTypes.Maybe<{ product?: AdminTypes.Maybe<(
      Pick<AdminTypes.Product, 'id'>
      & { media: { nodes: Array<(
          Pick<AdminTypes.ExternalVideo, 'alt' | 'mediaContentType'>
          & { preview?: AdminTypes.Maybe<Pick<AdminTypes.MediaPreviewImage, 'status'>> }
        ) | (
          Pick<AdminTypes.MediaImage, 'alt' | 'mediaContentType'>
          & { preview?: AdminTypes.Maybe<Pick<AdminTypes.MediaPreviewImage, 'status'>> }
        ) | (
          Pick<AdminTypes.Model3d, 'alt' | 'mediaContentType'>
          & { preview?: AdminTypes.Maybe<Pick<AdminTypes.MediaPreviewImage, 'status'>> }
        ) | (
          Pick<AdminTypes.Video, 'alt' | 'mediaContentType'>
          & { preview?: AdminTypes.Maybe<Pick<AdminTypes.MediaPreviewImage, 'status'>> }
        )> } }
    )>, userErrors: Array<Pick<AdminTypes.UserError, 'field' | 'message'>> }> };

export type CollectionCreateMutationVariables = AdminTypes.Exact<{
  input: AdminTypes.CollectionInput;
}>;


export type CollectionCreateMutation = { collectionCreate?: AdminTypes.Maybe<{ collection?: AdminTypes.Maybe<Pick<AdminTypes.Collection, 'id' | 'handle'>>, userErrors: Array<Pick<AdminTypes.UserError, 'field' | 'message'>> }> };

export type TranslatableResourceQueryVariables = AdminTypes.Exact<{
  id: AdminTypes.Scalars['ID']['input'];
}>;


export type TranslatableResourceQuery = { translatableResource?: AdminTypes.Maybe<{ translatableContent: Array<Pick<AdminTypes.TranslatableContent, 'key' | 'digest' | 'value'>> }> };

export type TranslationsRegisterMutationVariables = AdminTypes.Exact<{
  resourceId: AdminTypes.Scalars['ID']['input'];
  translations: Array<AdminTypes.TranslationInput> | AdminTypes.TranslationInput;
}>;


export type TranslationsRegisterMutation = { translationsRegister?: AdminTypes.Maybe<{ userErrors: Array<Pick<AdminTypes.TranslationUserError, 'field' | 'message'>>, translations?: AdminTypes.Maybe<Array<Pick<AdminTypes.Translation, 'key' | 'value'>>> }> };

interface GeneratedQueryTypes {
  "\n  #graphql\n  query GetMetafieldDefinitions($ownerType: MetafieldOwnerType!, $namespace: String) {\n    metafieldDefinitions(\n      first: 50,\n      ownerType: $ownerType,\n      namespace: $namespace\n    ) {\n      edges {\n        node {\n          id\n          name\n          key\n          namespace\n        }\n      }\n    }\n  }\n": {return: GetMetafieldDefinitionsQuery, variables: GetMetafieldDefinitionsQueryVariables},
  "\n  #graphql\n  query MetafieldDefinitions($ownerType: MetafieldOwnerType!, $first: Int, $query:String,$key:String) {\n    metafieldDefinitions(ownerType: $ownerType, first: $first, query:$query ,key:$key) {\n      nodes {\n        id\n        name\n        namespace\n        key\n        type {\n          name\n        }\n      }\n    }\n  }\n  ": {return: MetafieldDefinitionsQuery, variables: MetafieldDefinitionsQueryVariables},
  "\n  #graphql\n  query GetMetaobjects ($type:String!,$first:Int!) {\n    metaobjects(type: $type, first: $first) {\n      nodes {\n        id\n        handle\n        displayName\n        field(key:\"slug\"){\n          value\n        }\n      }\n    }\n  }\n  ": {return: GetMetaobjectsQuery, variables: GetMetaobjectsQueryVariables},
  "\n  #graphql\n  query Products($first: Int!, $after: String) {\n    products(first: $first, after: $after) {\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n      edges {\n        node {\n          id\n          title\n          handle\n          variants(first:1) {\n            edges {\n              node {\n                id\n                sku\n                title\n              }\n            }\n          }\n        }\n      }\n    }\n  }\n": {return: ProductsQuery, variables: ProductsQueryVariables},
  "\n   #graphql\n   query translatableResource($id: ID!) {\n       translatableResource(resourceId: $id) {\n         translatableContent {\n           key\n           digest # Використовуйте 'digest' замість 'translatableContentDigest'\n           value\n         }\n       }\n     }\n": {return: TranslatableResourceQuery, variables: TranslatableResourceQueryVariables},
  "\n   #graphql\n   query translatableResource($id: ID!) {\n       translatableResource(resourceId: $id) {\n         translatableContent {\n           key\n           digest\n           value\n         }\n       }\n     }\n": {return: TranslatableResourceQuery, variables: TranslatableResourceQueryVariables},
}

interface GeneratedMutationTypes {
  "\n  #graphql\n  mutation CreateCollection($input: CollectionInput!) {\n    collectionCreate(input: $input) {\n      collection {\n        id\n        title\n        handle\n      }\n      userErrors {\n        field\n        message\n      }\n    }\n  }\n": {return: CreateCollectionMutation, variables: CreateCollectionMutationVariables},
  "\n  #graphql\n  mutation CreateBasicAutomaticDiscount($basicAutomaticDiscount: DiscountAutomaticBasicInput!) {\n     discountAutomaticBasicCreate(automaticBasicDiscount: $basicAutomaticDiscount) {\n       automaticDiscountNode {\n       id\n       }\n       userErrors {\n         field\n         message\n         code\n       }\n     }\n   }\n": {return: CreateBasicAutomaticDiscountMutation, variables: CreateBasicAutomaticDiscountMutationVariables},
  "\n  #graphql\n  mutation CreateMetafieldDefinition($definition: MetafieldDefinitionInput!) {\n    metafieldDefinitionCreate(definition: $definition) {\n      createdDefinition {\n        id\n        name\n        key\n        namespace\n        ownerType\n        type{\n          name\n          category\n        }\n      }\n      userErrors {\n        field\n        message\n        code\n      }\n    }\n  }\n": {return: CreateMetafieldDefinitionMutation, variables: CreateMetafieldDefinitionMutationVariables},
  "\n  #graphql\n  mutation DeleteMetafieldDefinition($id: ID!,$deleteAssociated: Boolean!) {\n    metafieldDefinitionDelete(id: $id,deleteAllAssociatedMetafields: $deleteAssociated) {\n      deletedDefinitionId\n      userErrors {\n        field\n        message\n        code\n      }\n    }\n  }\n": {return: DeleteMetafieldDefinitionMutation, variables: DeleteMetafieldDefinitionMutationVariables},
  "\n  #graphql\n  mutation metafieldDefinitionPin($definitionId: ID!) {\n    metafieldDefinitionPin(definitionId: $definitionId) {\n      pinnedDefinition {\n        name\n        key\n        namespace\n        pinnedPosition\n      }\n      userErrors {\n        field\n        message\n      }\n    }\n  }\n": {return: MetafieldDefinitionPinMutation, variables: MetafieldDefinitionPinMutationVariables},
  "\n  #graphql\n  mutation CreateMetaobject($metaobject: MetaobjectCreateInput!) {\n    metaobjectCreate(metaobject: $metaobject) {\n      metaobject {\n        handle\n        id\n        type\n      }\n      userErrors {\n        field\n        message\n        code\n      }\n    }\n  }\n": {return: CreateMetaobjectMutation, variables: CreateMetaobjectMutationVariables},
  "\n  #graphql\n  mutation CreateMetaobjectDefinition($definition: MetaobjectDefinitionCreateInput!) {\n    metaobjectDefinitionCreate(definition: $definition) {\n      metaobjectDefinition {\n        id\n        name\n        type\n        fieldDefinitions {\n          name\n          key\n        }\n      }\n      userErrors {\n        field\n        message\n        code\n      }\n    }\n  }\n": {return: CreateMetaobjectDefinitionMutation, variables: CreateMetaobjectDefinitionMutationVariables},
  "\n  #graphql\n  mutation DeleteMetaobjects($where: MetaobjectBulkDeleteWhereCondition!) {\n    metaobjectBulkDelete(where: $where) {\n      job {\n        id\n        done\n      }\n      userErrors {\n        message\n      }\n    }\n  }\n": {return: DeleteMetaobjectsMutation, variables: DeleteMetaobjectsMutationVariables},
  "\n  #graphql\n  mutation DeleteMetaobjectDefinition($id: ID!) {\n    metaobjectDefinitionDelete(id: $id) {\n      deletedId\n      userErrors {\n        field\n        message\n        code\n      }\n    }\n  }\n": {return: DeleteMetaobjectDefinitionMutation, variables: DeleteMetaobjectDefinitionMutationVariables},
  "\n  #graphql\n  mutation ProductVariantsCreate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {\n    productVariantsBulkCreate(productId: $productId, variants: $variants) {\n      productVariants {\n        id\n        title\n      }\n      userErrors {\n        field\n        message\n      }\n    }\n  }\n": {return: ProductVariantsCreateMutation, variables: ProductVariantsCreateMutationVariables},
  "\n  #graphql\n  mutation createProductAsynchronous($productSet: ProductSetInput!, $synchronous: Boolean!) {\n    productSet(synchronous: $synchronous, input: $productSet) {\n      product {\n        id\n      }\n      productSetOperation {\n        id\n        status\n        userErrors {\n          code\n          field\n          message\n        }\n      }\n      userErrors {\n        code\n        field\n        message\n      }\n    }\n  }\n": {return: CreateProductAsynchronousMutation, variables: CreateProductAsynchronousMutationVariables},
  "#graphql\n  mutation productDeleteMutation ($id:ID!) {\n     productDelete(input: {id: $id}) {\n       deletedProductId\n       userErrors {\n         field\n         message\n       }\n     }\n   }\n  ": {return: ProductDeleteMutationMutation, variables: ProductDeleteMutationMutationVariables},
  "\n  #graphql\n  mutation productCreateMedia($media: [CreateMediaInput!]!, $productId: ID!) {\n    productCreateMedia(media: $media, productId: $productId) {\n      mediaUserErrors {\n        field\n        message\n      }\n      product {\n        id\n        title\n      }\n    }\n  }\n  ": {return: ProductCreateMediaMutation, variables: ProductCreateMediaMutationVariables},
  "\n  #graphql\n  mutation ProductVariantsCreateA($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {\n    productVariantsBulkCreate(productId: $productId, variants: $variants) {\n      productVariants {\n        id\n        title\n        selectedOptions {\n          name\n          value\n        }\n      }\n      userErrors {\n        field\n        message\n      }\n    }\n  }\n": {return: ProductVariantsCreateAMutation, variables: ProductVariantsCreateAMutationVariables},
  "\n  #graphql\n  mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!, $locationId: ID!) {\n    productVariantsBulkUpdate(productId: $productId, variants: $variants) {\n      product {\n        id\n      }\n      productVariants {\n        id\n        inventoryItem{\n          id\n          inventoryLevel(locationId: $locationId){\n            id\n            quantities(names: [\"available\"]){\n              quantity\n            }\n          }\n        }\n      }\n      userErrors {\n        field\n        message\n      }\n    }\n  }\n": {return: ProductVariantsBulkUpdateMutation, variables: ProductVariantsBulkUpdateMutationVariables},
  "\n  #graphql\n  mutation UpdateProductWithNewMedia($product: ProductUpdateInput!, $media: [CreateMediaInput!]) {\n    productUpdate(product: $product, media: $media) {\n      product {\n        id\n        media(first: 10) {\n          nodes {\n            alt\n            mediaContentType\n            preview {\n              status\n            }\n          }\n        }\n      }\n      userErrors {\n        field\n        message\n      }\n    }\n  }\n  ": {return: UpdateProductWithNewMediaMutation, variables: UpdateProductWithNewMediaMutationVariables},
  "\n  #graphql\n  mutation collectionCreate($input: CollectionInput!) {\n    collectionCreate(input: $input) {\n      collection {\n        id\n        handle\n      }\n      userErrors {\n        field\n        message\n      }\n    }\n  }\n": {return: CollectionCreateMutation, variables: CollectionCreateMutationVariables},
  "\n  #graphql\n  mutation translationsRegister($resourceId: ID!, $translations: [TranslationInput!]!) {\n    translationsRegister(resourceId: $resourceId, translations: $translations) {\n      userErrors {\n        field\n        message\n      }\n      translations {\n        key\n        value\n      }\n    }\n  }\n": {return: TranslationsRegisterMutation, variables: TranslationsRegisterMutationVariables},
}
declare module '@shopify/admin-api-client' {
  type InputMaybe<T> = AdminTypes.InputMaybe<T>;
  interface AdminQueries extends GeneratedQueryTypes {}
  interface AdminMutations extends GeneratedMutationTypes {}
}
