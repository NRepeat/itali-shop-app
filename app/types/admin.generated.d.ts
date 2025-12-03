/* eslint-disable eslint-comments/disable-enable-pair */
/* eslint-disable eslint-comments/no-unlimited-disable */
/* eslint-disable */
import type * as AdminTypes from './admin.types';

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

interface GeneratedQueryTypes {
  "\n  #graphql\n  query GetMetafieldDefinitions($ownerType: MetafieldOwnerType!, $namespace: String) {\n    metafieldDefinitions(\n      first: 50,\n      ownerType: $ownerType,\n      namespace: $namespace\n    ) {\n      edges {\n        node {\n          id\n          name\n          key\n          namespace\n        }\n      }\n    }\n  }\n": {return: GetMetafieldDefinitionsQuery, variables: GetMetafieldDefinitionsQueryVariables},
}

interface GeneratedMutationTypes {
  "\n  #graphql\n  mutation CreateMetafieldDefinition($definition: MetafieldDefinitionInput!) {\n    metafieldDefinitionCreate(definition: $definition) {\n      createdDefinition {\n        id\n        name\n        key\n        namespace\n        ownerType\n        type{\n          name\n          category\n        }\n      }\n      userErrors {\n        field\n        message\n        code\n      }\n    }\n  }\n": {return: CreateMetafieldDefinitionMutation, variables: CreateMetafieldDefinitionMutationVariables},
  "\n  #graphql\n  mutation DeleteMetafieldDefinition($id: ID!,$deleteAssociated: Boolean!) {\n    metafieldDefinitionDelete(id: $id,deleteAllAssociatedMetafields: $deleteAssociated) {\n      deletedDefinitionId\n      userErrors {\n        field\n        message\n        code\n      }\n    }\n  }\n": {return: DeleteMetafieldDefinitionMutation, variables: DeleteMetafieldDefinitionMutationVariables},
  "\n  #graphql\n  mutation metafieldDefinitionPin($definitionId: ID!) {\n    metafieldDefinitionPin(definitionId: $definitionId) {\n      pinnedDefinition {\n        name\n        key\n        namespace\n        pinnedPosition\n      }\n      userErrors {\n        field\n        message\n      }\n    }\n  }\n": {return: MetafieldDefinitionPinMutation, variables: MetafieldDefinitionPinMutationVariables},
}
declare module '@shopify/admin-api-client' {
  type InputMaybe<T> = AdminTypes.InputMaybe<T>;
  interface AdminQueries extends GeneratedQueryTypes {}
  interface AdminMutations extends GeneratedMutationTypes {}
}
