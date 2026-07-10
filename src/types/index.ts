// ==========================================
// 3x-ui API Types (Based on v2.8.8)
// ==========================================

export interface ThreeXUIClient {
  id: string;           // UUID for VLESS/VMESS/Trojan, password for others
  flow?: string;        // Only for VLESS with XTLS
  email: string;        // Client identifier
  limitIp?: number;     // IP limit, 0 = unlimited
  totalGB: number;      // Total traffic in bytes
  expiryTime: number;   // Unix timestamp in milliseconds, 0 = never
  enable: boolean;
  tgId?: string;        // Telegram ID
  subId: string;        // Subscription ID
  reset?: number;       // Traffic reset interval in days
}

export interface ThreeXUIInbound {
  id: number;
  up: number;
  down: number;
  total: number;
  remark: string;
  enable: boolean;
  expiryTime: number;
  clientStats?: ThreeXUIClientStat[];
  listen: string;
  port: number;
  protocol: 'vmess' | 'vless' | 'trojan' | 'shadowsocks' | 'dokodemo-door' | 'socks' | 'http' | 'wireguard';
  settings: string;     // JSON string
  streamSettings: string; // JSON string
  tag: string;
  sniffing: string;     // JSON string
}

export interface ThreeXUIClientStat {
  id: number;
  inboundId: number;
  enable: boolean;
  email: string;
  up: number;
  down: number;
  expiryTime: number;
  total: number;
  reset?: number;
}

export interface ThreeXUIServerStatus {
  cpu: number;
  cpuCores: number;
  cpuSpeedMhz: number;
  mem: { current: number; total: number };
  swap: { current: number; total: number };
  disk: { current: number; total: number };
  xray: { state: string; errorMsg?: string; version?: string };
  uptime: number;
  loads: number[];
  tcpCount: number;
  udpCount: number;
  netIO: { up: number; down: number };
  netTraffic: { sent: number; recv: number };
  publicIP: { ipv4?: string; ipv6?: string };
  appStats: { threads: number; mem: number; uptime: number };
}

export interface ThreeXUIApiResponse<T = any> {
  success: boolean;
  msg: string;
  obj?: T;
}

// ==========================================
// Application Types
// ==========================================

export type UserRole = 'super_admin' | 'admin' | 'wholesale';

export interface User {
  id: string;
  username: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface WholesaleCustomer {
  id: string;
  userId: string;
  companyName?: string;
  phone?: string;
  walletBalance: number;
  creditLimit: number;
  minBalance: number;
  isActive: boolean;
  allowedServerId: string[];
  allowedInboundIds: string[];
  allowedPlanIds: string[];
  dailyOrderLimit: number;
  monthlyOrderLimit: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  user?: User;
  wallet?: Wallet;
}

export interface Wallet {
  id: string;
  wholesaleCustomerId: string;
  balance: number;
  createdAt: string;
  updatedAt: string;
}

export interface WalletTransaction {
  id: string;
  walletId: string;
  type: 'credit' | 'debit' | 'refund' | 'adjustment';
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  description: string;
  orderId?: string;
  createdBy: string;
  status: 'pending' | 'completed' | 'failed' | 'cancelled';
  idempotencyKey: string;
  createdAt: string;
}

export interface Server {
  id: string;
  name: string;
  host: string;
  port: number;
  basePath: string;
  username: string;
  passwordEncrypted: string;
  isActive: boolean;
  location?: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Inbound {
  id: string;
  serverId: string;
  threeXUIInboundId: number;
  name: string;
  protocol: string;
  port: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  server?: Server;
}

export interface Plan {
  id: string;
  name: string;
  description?: string;
  trafficGB: number;        // in GB
  durationDays: number;
  basePrice: number;        // in Toman
  pricePerGB: number;       // in Toman
  ipLimit: number;
  isActive: boolean;
  allowedInboundIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CustomerSpecificPrice {
  id: string;
  wholesaleCustomerId: string;
  planId?: string;
  pricePerGB?: number;
  flatPrice?: number;
  discountPercent?: number;
  createdAt: string;
  updatedAt: string;
}

export interface EndUser {
  id: string;
  wholesaleCustomerId: string;
  serverId: string;
  inboundId: string;
  threeXUIClientId: string;
  email: string;
  subId: string;
  planId: string;
  trafficLimit: number;     // in bytes
  trafficUsed: number;      // in bytes
  expiryTime: string | Date;
  ipLimit: number;
  isActive: boolean;
  status: 'active' | 'disabled' | 'expired' | 'limited';
  createdAt: string;
  updatedAt: string;
  plan?: Plan;
  inbound?: Inbound;
}

export interface Order {
  id: string;
  wholesaleCustomerId: string;
  type: 'new' | 'renew' | 'upgrade' | 'traffic_add';
  endUserId?: string;
  planId: string;
  serverId: string;
  inboundId: string;
  trafficGB: number;
  durationDays: number;
  pricePerGB: number;
  totalPrice: number;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled' | 'refunded';
  threeXUIResponse?: string;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
  plan?: Plan;
  endUser?: EndUser;
}

export interface Invoice {
  id: string;
  wholesaleCustomerId: string;
  orderId: string;
  invoiceNumber: string;
  amount: number;
  status: 'pending' | 'paid' | 'cancelled';
  dueDate: string;
  paidAt?: string;
  createdAt: string;
  order?: Order;
}

export interface AuditLog {
  id: string;
  userId: string;
  action: string;
  entityType: string;
  entityId: string;
  oldValue?: string;
  newValue?: string;
  ipAddress: string;
  userAgent: string;
  createdAt: string;
  user?: User;
}

// ==========================================
// Form Types
// ==========================================

export interface LoginForm {
  username: string;
  password: string;
}

export interface CreateConfigForm {
  planId: string;
  serverId: string;
  inboundId: string;
  email: string;
  trafficGB?: number;
  durationDays?: number;
}

export interface WalletChargeForm {
  wholesaleCustomerId: string;
  amount: number;
  description: string;
}

export interface CreateCustomerForm {
  username: string;
  email: string;
  password: string;
  companyName?: string;
  phone?: string;
  creditLimit: number;
  minBalance: number;
  dailyOrderLimit: number;
  monthlyOrderLimit: number;
  allowedServerIds: string[];
  allowedInboundIds: string[];
  allowedPlanIds: string[];
}

// ==========================================
// Dashboard Stats
// ==========================================

export interface AdminStats {
  totalCustomers: number;
  activeCustomers: number;
  totalEndUsers: number;
  activeEndUsers: number;
  totalRevenue: number;
  monthlyRevenue: number;
  totalOrders: number;
  pendingOrders: number;
  totalWalletBalance: number;
  lowBalanceCustomers: number;
}

export interface WholesaleStats {
  walletBalance: number;
  totalEndUsers: number;
  activeEndUsers: number;
  expiringSoon: number;
  lowTrafficUsers: number;
  totalSpent: number;
  monthlySpent: number;
  ordersThisMonth: number;
}
