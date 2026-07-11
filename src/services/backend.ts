import { api } from './api';
import type { EndUser, Order, Plan, Server, Inbound, Wallet, WalletTransaction, WholesaleCustomer, BankAccount, WalletTopupInvoice } from '../types';

export interface CreateServerInput {
  name: string;
  host: string;
  port: number;
  basePath: string;
  username: string;
  password: string;
  location?: string;
  description?: string;
  isActive?: boolean;
}

export interface CreatePlanInput {
  name: string;
  description?: string;
  trafficGB: number;
  durationDays: number;
  basePrice: number;
  pricePerGB: number;
  ipLimit: number;
  isActive?: boolean;
}

export interface CreateCustomerInput {
  username: string;
  email: string;
  password: string;
  companyName?: string;
  phone?: string;
  creditLimit?: number;
  minBalance?: number;
  dailyOrderLimit?: number;
  monthlyOrderLimit?: number;
  allowedServerIds?: string[];
  allowedInboundIds?: string[];
  allowedPlanIds?: string[];
}

export const backend = {
  health: () => api.get<{ status: string; time: string }>('/health'),
  customers: {
    list: () => api.get<WholesaleCustomer[]>('/customers'),
    create: (input: CreateCustomerInput) => api.post<WholesaleCustomer>('/customers', input),
    update: (id: string, input: Partial<CreateCustomerInput> & { notes?: string }) =>
      api.patch<WholesaleCustomer>(`/customers/${id}`, input),
    setStatus: (id: string, input: { isActive: boolean; disabledReason?: string }) =>
      api.patch<WholesaleCustomer>(`/customers/${id}/status`, input),
    remove: (id: string, options?: { force?: boolean }) =>
      api.delete<{ deleted: boolean; force?: boolean; ordersDeleted?: number; invoicesDeleted?: number; endUsersDeleted?: number }>(
        `/customers/${id}${options?.force ? '?force=true' : ''}`,
      ),
  },
  wallet: {
    current: () => api.get<Wallet>('/wallet'),
    transactions: () => api.get<WalletTransaction[]>('/wallet/transactions'),
    creditCustomer: (customerId: string, amount: number, description: string) =>
      api.post<WalletTransaction>(`/wallet/customers/${customerId}/credit`, { amount, description }),
    debitCustomer: (customerId: string, amount: number, description: string) =>
      api.post<WalletTransaction>(`/wallet/customers/${customerId}/debit`, { amount, description }),
  },

  bankAccounts: {
    list: () => api.get<BankAccount[]>('/bank-accounts'),
    create: (input: Omit<BankAccount, 'id' | 'createdAt' | 'updatedAt'>) =>
      api.post<BankAccount>('/bank-accounts', input),
    update: (id: string, input: Partial<BankAccount>) =>
      api.patch<BankAccount>(`/bank-accounts/${id}`, input),
    archive: (id: string) =>
      api.delete<BankAccount>(`/bank-accounts/${id}`),
  },

  walletTopups: {
    create: (input: { amount: number; telegramId: string }) =>
      api.post<WalletTopupInvoice>('/wallet-topups', input),

    mine: () =>
      api.get<WalletTopupInvoice[]>('/wallet-topups/mine'),

    get: (id: string) =>
      api.get<WalletTopupInvoice>(`/wallet-topups/${id}`),

    submitReceipt: (id: string, data: FormData) =>
      api.postForm<WalletTopupInvoice>(
        `/wallet-topups/${id}/receipt`,
        data,
      ),

    adminList: (status?: string) =>
      api.get<WalletTopupInvoice[]>(
        `/wallet-topups/admin${status ? `?status=${encodeURIComponent(status)}` : ''}`,
      ),

    approve: (
      id: string,
      input: { approvedAmount: number; adminNote?: string },
    ) => api.post<any>(`/wallet-topups/${id}/approve`, input),

    reject: (id: string, input: { adminNote: string }) =>
      api.post<WalletTopupInvoice>(
        `/wallet-topups/${id}/reject`,
        input,
      ),

    receiptUrl: (id: string) =>
      `/api/wallet-topups/${encodeURIComponent(id)}/receipt-file`,
  },

  plans: {
    list: () => api.get<Plan[]>('/plans'),
    create: (input: CreatePlanInput) => api.post<Plan>('/plans', input),
    update: (id: string, input: Partial<CreatePlanInput>) =>
      api.patch<Plan>(`/plans/${id}`, input),
    setStatus: (id: string, input: { isActive: boolean }) =>
      api.patch<Plan>(`/plans/${id}/status`, input),
    remove: (id: string) => api.delete<{ deleted: boolean }>(`/plans/${id}`),
    calculate: (planId: string, customerId?: string) => api.get<{ plan: Plan; finalPrice: number; pricePerGb: number }>(`/pricing/plans/${planId}/calculate${customerId ? `?customerId=${encodeURIComponent(customerId)}` : ''}`),
  },
  pricing: {
    getCustomerPrices: (customerId: string) =>
      api.get<any>(`/pricing/customers/${customerId}`),
    saveCustomerPrice: (
      customerId: string,
      planId: string,
      input: { pricePerGB?: number | null; flatPrice?: number | null; discountPercent?: number | null },
    ) => api.put<any>(`/pricing/customers/${customerId}/plans/${planId}`, input),
    deleteCustomerPrice: (customerId: string, planId: string) =>
      api.delete<{ deleted: boolean }>(`/pricing/customers/${customerId}/plans/${planId}`),
  },
  servers: {
    list: () => api.get<Server[]>('/servers'),
    create: (input: CreateServerInput) => api.post<Server>('/servers', input),
    update: (id: string, input: Partial<CreateServerInput>) => api.patch<Server>(`/servers/${id}`, input),
    test: (id: string) => api.post<{ success: boolean; msg?: string }>(`/servers/${id}/test`),
    syncInbounds: (id: string) => api.post<Inbound[]>(`/servers/${id}/sync-inbounds`),
    remove: (id: string) => api.delete<{ deleted: boolean; serverId: string; deletedInbounds: number }>(`/servers/${id}`),
  },
  inbounds: {
    list: (serverId?: string) => api.get<Inbound[]>(`/inbounds${serverId ? `?serverId=${encodeURIComponent(serverId)}` : ''}`),
  },
  orders: {
    list: () => api.get<Order[]>('/orders'),
    createConfig: (input: { planId: string; serverId: string; inboundId: string; email: string; idempotencyKey?: string }) =>
      api.post<{ order: Order; endUser: EndUser; configLink: string; subscriptionLink: string }>('/orders', input),
  },
  endUsers: {
    list: () => api.get<EndUser[]>('/end-users'),
    renew: (id: string, input: { planId?: string; customDays?: number; customGB?: number }) =>
      api.post<any>(`/end-users/${id}/renew`, input),
    update: (id: string, input: { addDays?: number; addTrafficGB?: number; isActive?: boolean }) =>
      api.patch<any>(`/end-users/${id}`, input),
    remove: (id: string) => api.delete<any>(`/end-users/${id}`),
    setPaid: (id: string, input: { paid: boolean; note?: string }) =>
      api.patch<any>(`/end-users/${id}/payment`, input),
  },
  reports: {
    summary: () => api.get<any>('/reports/summary'),
  },
  audit: {
    list: (params?: {
      search?: string;
      action?: string;
      entityType?: string;
      userId?: string;
      dateFrom?: string;
      dateTo?: string;
      limit?: string | number;
    }) => {
      const qs = new URLSearchParams();
      if (params) {
        Object.entries(params).forEach(([key, value]) => {
          if (value !== undefined && value !== null && String(value).trim() !== '') {
            qs.set(key, String(value));
          }
        });
      }
      const suffix = qs.toString() ? `?${qs.toString()}` : '';
      return api.get<any[]>(`/audit-logs${suffix}`);
    },
  },
  settings: {
    get: () => api.get<Record<string, unknown>>('/settings'),
  },
};
