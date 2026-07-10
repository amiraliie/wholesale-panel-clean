import { backend } from './backend';

export const walletService = {
  getWallet: backend.wallet.current,
  getTransactions: backend.wallet.transactions,
  creditCustomer: backend.wallet.creditCustomer,
  debitCustomer: backend.wallet.debitCustomer,
};

export default walletService;
