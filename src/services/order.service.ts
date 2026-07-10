import { backend } from './backend';

export const orderService = {
  listOrders: backend.orders.list,
  listEndUsers: backend.endUsers.list,
  createConfig: backend.orders.createConfig,
};

export default orderService;
