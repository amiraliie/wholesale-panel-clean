import { useMemo } from 'react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { StatsCard } from '../../components/StatsCard';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { StatusBadge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { ErrorState, LoadingState, EmptyState } from '../../components/RemoteState';
import { useRemoteData } from '../../hooks/useRemoteData';
import { backend } from '../../services/backend';
import { formatPrice } from '../../lib/utils';
import {
  Users,
  Wallet,
  ShoppingCart,
  TrendingUp,
  AlertTriangle,
  Activity,
  RefreshCw,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';

const STATUS_COLORS: Record<string, string> = {
  completed: '#10B981',
  pending: '#3B82F6',
  processing: '#8B5CF6',
  failed: '#EF4444',
  cancelled: '#F59E0B',
  refunded: '#64748B',
};

function getValue(item: any, camel: string, snake: string, fallback: any = 0) {
  if (item?.[camel] !== undefined && item?.[camel] !== null) return item[camel];
  if (item?.[snake] !== undefined && item?.[snake] !== null) return item[snake];
  return fallback;
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    completed: 'تکمیل شده',
    pending: 'در انتظار',
    processing: 'در پردازش',
    failed: 'ناموفق',
    cancelled: 'لغو شده',
    refunded: 'برگشت وجه',
  };

  return labels[status] || status;
}

function customerName(customer: any) {
  return getValue(customer, 'companyName', 'company_name', '') || customer.username || customer.email || '-';
}

export default function AdminDashboard() {
  const {
    data,
    isLoading,
    error,
    reload,
  } = useRemoteData(async () => ({
    report: await backend.reports.summary(),
    customers: await backend.customers.list(),
    orders: await backend.orders.list(),
  }), []);

  const dashboardData = useMemo(() => {
    if (!data) return null;

    const report = data.report || {};
    const summary = report.summary || {};
    const customers = data.customers || [];
    const orders = data.orders || [];

    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    const monthOrders = orders.filter((order: any) => {
      const createdAt = getValue(order, 'createdAt', 'created_at', '');
      if (!createdAt) return false;

      const date = new Date(createdAt);
      return date.getMonth() === currentMonth && date.getFullYear() === currentYear;
    });

    const revenueData = (report.dailyRevenue || []).map((row: any) => ({
      name: new Date(row.day).toLocaleDateString('fa-IR', { month: 'short', day: 'numeric' }),
      revenue: Number(row.revenue || 0),
    }));

    const orderStatusData = (report.ordersByStatus || []).map((row: any) => ({
      name: statusLabel(row.status),
      status: row.status,
      value: Number(row.count || 0),
      color: STATUS_COLORS[row.status] || '#64748B',
    }));

    const recentOrders = (report.recentOrders || orders || []).slice(0, 8).map((order: any) => ({
      id: order.id,
      customer: order.company_name || order.username || getValue(order, 'customerName', 'customer_name', '-'),
      plan: order.plan_name || getValue(order, 'planName', 'plan_name', '-'),
      amount: Number(getValue(order, 'totalPrice', 'total_price', 0)),
      status: order.status || 'pending',
    }));

    const lowBalanceCustomers = customers
      .map((customer: any) => ({
        id: customer.id,
        name: customerName(customer),
        username: customer.username,
        balance: Number(getValue(customer, 'walletBalance', 'wallet_balance', 0)),
        minBalance: Number(getValue(customer, 'minBalance', 'min_balance', 0)),
      }))
      .filter((customer: any) => customer.minBalance > 0 && customer.balance < customer.minBalance)
      .sort((a: any, b: any) => (a.balance - a.minBalance) - (b.balance - b.minBalance))
      .slice(0, 8);

    return {
      summary,
      monthOrders,
      revenueData,
      orderStatusData,
      recentOrders,
      lowBalanceCustomers,
    };
  }, [data]);

  if (isLoading) {
    return (
      <DashboardLayout title="داشبورد مدیریت">
        <LoadingState />
      </DashboardLayout>
    );
  }

  if (error || !data || !dashboardData) {
    return (
      <DashboardLayout title="داشبورد مدیریت">
        <ErrorState message={error || 'خطا در دریافت اطلاعات داشبورد'} onRetry={reload} />
      </DashboardLayout>
    );
  }

  const {
    summary,
    monthOrders,
    revenueData,
    orderStatusData,
    recentOrders,
    lowBalanceCustomers,
  } = dashboardData;

  return (
    <DashboardLayout title="داشبورد مدیریت">
      <div className="space-y-6">
        <div className="rounded-2xl border border-slate-200 bg-gradient-to-l from-sky-50 via-white to-violet-50 p-5 shadow-sm dark:border-slate-700 dark:from-slate-900 dark:via-slate-900 dark:to-violet-950/40">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">
                داشبورد مدیریت
              </h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                نمای سریع از فروش، سفارش‌ها، کیف پول‌ها و هشدارهای مشتریان
              </p>
            </div>

            <Button variant="outline" leftIcon={<RefreshCw className="h-4 w-4" />} onClick={reload}>
              بروزرسانی
            </Button>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          <StatsCard
            title="کل مشتریان"
            value={Number(summary.wholesale_customers || 0)}
            icon={Users}
            variant="info"
          />

          <StatsCard
            title="موجودی کل کیف پول‌ها"
            value={formatPrice(Number(summary.wallet_total || 0))}
            icon={Wallet}
            variant="success"
          />

          <StatsCard
            title="سفارشات این ماه"
            value={monthOrders.length}
            icon={ShoppingCart}
            variant="default"
          />

          <StatsCard
            title="درآمد ماهانه"
            value={formatPrice(Number(summary.month_revenue || 0))}
            icon={TrendingUp}
            variant="success"
          />
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>نمودار درآمد ۱۴ روز اخیر</CardTitle>
            </CardHeader>

            <CardContent>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={revenueData}>
                    <defs>
                      <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                      </linearGradient>
                    </defs>

                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                    <XAxis dataKey="name" stroke="#9CA3AF" fontSize={12} />
                    <YAxis stroke="#9CA3AF" fontSize={12} tickFormatter={(value) => `${Math.round(Number(value) / 1000)}k`} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#334155',
                        border: 'none',
                        borderRadius: '12px',
                        color: '#fff',
                      }}
                      formatter={(value) => [formatPrice(Number(value) || 0), 'درآمد']}
                    />
                    <Area
                      type="monotone"
                      dataKey="revenue"
                      stroke="#3B82F6"
                      strokeWidth={3}
                      fillOpacity={1}
                      fill="url(#colorRevenue)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>وضعیت سفارشات</CardTitle>
            </CardHeader>

            <CardContent>
              {orderStatusData.length === 0 ? (
                <EmptyState text="هنوز سفارشی ثبت نشده است." />
              ) : (
                <>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={orderStatusData}
                          cx="50%"
                          cy="50%"
                          innerRadius={58}
                          outerRadius={82}
                          paddingAngle={5}
                          dataKey="value"
                        >
                          {orderStatusData.map((entry: any, index: number) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="mt-4 flex flex-wrap justify-center gap-4">
                    {orderStatusData.map((item: any) => (
                      <div key={item.name} className="flex items-center gap-2">
                        <div
                          className="h-3 w-3 rounded-full"
                          style={{ backgroundColor: item.color }}
                        />
                        <span className="text-sm text-slate-600 dark:text-slate-400">
                          {item.name}: {item.value}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Recent Orders & Alerts */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>سفارشات اخیر</CardTitle>
                <Activity className="h-5 w-5 text-slate-400" />
              </div>
            </CardHeader>

            <CardContent className="p-0">
              {recentOrders.length === 0 ? (
                <div className="p-6">
                  <EmptyState text="هنوز سفارشی ثبت نشده است." />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[620px]">
                    <thead className="bg-slate-50 dark:bg-slate-800/70">
                      <tr>
                        {['مشتری', 'پلن', 'مبلغ', 'وضعیت'].map((head) => (
                          <th key={head} className="px-4 py-3 text-right text-xs font-medium text-slate-500 dark:text-slate-400">
                            {head}
                          </th>
                        ))}
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                      {recentOrders.map((order: any) => (
                        <tr key={order.id} className="hover:bg-sky-50/50 dark:hover:bg-slate-800/70">
                          <td className="px-4 py-3 text-sm font-medium text-slate-800 dark:text-slate-100">
                            {order.customer}
                          </td>

                          <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">
                            {order.plan}
                          </td>

                          <td className="px-4 py-3 text-sm font-semibold text-slate-700 dark:text-slate-300">
                            {formatPrice(order.amount)}
                          </td>

                          <td className="px-4 py-3">
                            <StatusBadge status={order.status} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>هشدار موجودی کم</CardTitle>
                <AlertTriangle className="h-5 w-5 text-amber-500" />
              </div>
            </CardHeader>

            <CardContent>
              {lowBalanceCustomers.length === 0 ? (
                <div className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-200">
                  هیچ مشتری‌ای زیر حد هشدار موجودی نیست.
                </div>
              ) : (
                <div className="space-y-4">
                  {lowBalanceCustomers.map((customer: any) => (
                    <div
                      key={customer.id}
                      className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-900/20"
                    >
                      <div>
                        <p className="font-medium text-slate-800 dark:text-slate-100">
                          {customer.name}
                        </p>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                          حداقل موجودی: {formatPrice(customer.minBalance)}
                        </p>
                      </div>

                      <div className="text-left">
                        <p className="font-bold text-rose-600 dark:text-rose-400">
                          {formatPrice(customer.balance)}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          کسری: {formatPrice(customer.minBalance - customer.balance)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
