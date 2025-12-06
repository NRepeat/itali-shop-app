/* eslint-disable eslint-comments/disable-enable-pair */
/* eslint-disable eslint-comments/no-unlimited-disable */
/* eslint-disable */
import type * as AdminTypes from './admin.types';

export type CreateCollectionMutationVariables = AdminTypes.Exact<{
  input: AdminTypes.CollectionInput;
}>;


export type CreateCollectionMutation = { collectionCreate?: AdminTypes.Maybe<{ collection?: AdminTypes.Maybe<Pick<AdminTypes.Collection, 'id' | 'title' | 'handle'>>, userErrors: Array<Pick<AdminTypes.UserError, 'field' | 'message'>> }> };

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

interface GeneratedQueryTypes {
  "\n  #graphql\n  query GetMetafieldDefinitions($ownerType: MetafieldOwnerType!, $namespace: String) {\n    metafieldDefinitions(\n      first: 50,\n      ownerType: $ownerType,\n      namespace: $namespace\n    ) {\n      edges {\n        node {\n          id\n          name\n          key\n          namespace\n        }\n      }\n    }\n  }\n": {return: GetMetafieldDefinitionsQuery, variables: GetMetafieldDefinitionsQueryVariables},
}

interface GeneratedMutationTypes {
  "\n  #graphql\n  mutation CreateCollection($input: CollectionInput!) {\n    collectionCreate(input: $input) {\n      collection {\n        id\n        title\n        handle\n      }\n      userErrors {\n        field\n        message\n      }\n    }\n  }\n": {return: CreateCollectionMutation, variables: CreateCollectionMutationVariables},
  "\n  #graphql\n  mutation CreateMetafieldDefinition($definition: MetafieldDefinitionInput!) {\n    metafieldDefinitionCreate(definition: $definition) {\n      createdDefinition {\n        id\n        name\n        key\n        namespace\n        ownerType\n        type{\n          name\n          category\n        }\n      }\n      userErrors {\n        field\n        message\n        code\n      }\n    }\n  }\n": {return: CreateMetafieldDefinitionMutation, variables: CreateMetafieldDefinitionMutationVariables},
  "\n  #graphql\n  mutation DeleteMetafieldDefinition($id: ID!,$deleteAssociated: Boolean!) {\n    metafieldDefinitionDelete(id: $id,deleteAllAssociatedMetafields: $deleteAssociated) {\n      deletedDefinitionId\n      userErrors {\n        field\n        message\n        code\n      }\n    }\n  }\n": {return: DeleteMetafieldDefinitionMutation, variables: DeleteMetafieldDefinitionMutationVariables},
  "\n  #graphql\n  mutation metafieldDefinitionPin($definitionId: ID!) {\n    metafieldDefinitionPin(definitionId: $definitionId) {\n      pinnedDefinition {\n        name\n        key\n        namespace\n        pinnedPosition\n      }\n      userErrors {\n        field\n        message\n      }\n    }\n  }\n": {return: MetafieldDefinitionPinMutation, variables: MetafieldDefinitionPinMutationVariables},
  "\n  #graphql\n  mutation CreateMetaobject($metaobject: MetaobjectCreateInput!) {\n    metaobjectCreate(metaobject: $metaobject) {\n      metaobject {\n        handle\n        id\n        type\n      }\n      userErrors {\n        field\n        message\n        code\n      }\n    }\n  }\n": {return: CreateMetaobjectMutation, variables: CreateMetaobjectMutationVariables},
  "\n  #graphql\n  mutation CreateMetaobjectDefinition($definition: MetaobjectDefinitionCreateInput!) {\n    metaobjectDefinitionCreate(definition: $definition) {\n      metaobjectDefinition {\n        id\n        name\n        type\n        fieldDefinitions {\n          name\n          key\n        }\n      }\n      userErrors {\n        field\n        message\n        code\n      }\n    }\n  }\n": {return: CreateMetaobjectDefinitionMutation, variables: CreateMetaobjectDefinitionMutationVariables},
  "\n  #graphql\n  mutation DeleteMetaobjects($where: MetaobjectBulkDeleteWhereCondition!) {\n    metaobjectBulkDelete(where: $where) {\n      job {\n        id\n        done\n      }\n      userErrors {\n        message\n      }\n    }\n  }\n": {return: DeleteMetaobjectsMutation, variables: DeleteMetaobjectsMutationVariables},
  "\n  #graphql\n  mutation DeleteMetaobjectDefinition($id: ID!) {\n    metaobjectDefinitionDelete(id: $id) {\n      deletedId\n      userErrors {\n        field\n        message\n        code\n      }\n    }\n  }\n": {return: DeleteMetaobjectDefinitionMutation, variables: DeleteMetaobjectDefinitionMutationVariables},
}
declare module '@shopify/admin-api-client' {
  type InputMaybe<T> = AdminTypes.InputMaybe<T>;
  interface AdminQueries extends GeneratedQueryTypes {}
  interface AdminMutations extends GeneratedMutationTypes {}
}
