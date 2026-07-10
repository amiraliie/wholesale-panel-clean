import { backend } from './backend';

export const walletService = {
  getWallet: backend.wallet.current,
  getTransactions: backend.wallet.transactions,
  creditCustomer: backend.wallet.creditCustomer,
};

export default walletService;
