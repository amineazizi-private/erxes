import Mutation from './mutations';

import Query from './queries';

import customScalars from '@erxes/api-utils/src/customScalars';
import Order from './order';
import OrderItem from './orderItem';

const resolvers: any = async () => ({
  ...customScalars,

  Mutation,
  Query,
  Order,
  OrderItem
});

export default resolvers;
