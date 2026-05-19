import { GraphQLClient } from 'graphql-request';

const GQL_URL = import.meta.env.VITE_AAVE_GRAPHQL || 'https://api.v4.aave.com/graphql';

export const gql = new GraphQLClient(GQL_URL);
