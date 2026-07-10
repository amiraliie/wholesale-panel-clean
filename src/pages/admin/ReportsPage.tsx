import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { ErrorState, LoadingState } from '../../components/RemoteState';
import { useRemoteData } from '../../hooks/useRemoteData';
import { backend } from '../../services/backend';
import { formatPrice } from '../../lib/utils';
import {
  Activity,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  RefreshCw,
  ShoppingCart,
  TrendingUp,
  Users,
  Wallet,
  Wifi,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

function getValue(item: any, camel: string, snake: string, fallback: any = 0) {
  if (item?.[camel] !== undefined && item?.[camel] !== null) return item[camel];
  if (item?.[snake] !== undefined && item?.[snake] !== null) return item[snake];
  return fallback;
}

function bytesToGB(value: number) {
  return value / 1024 / 1024 / 1024;
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    completed: 'تکمیل‌شده',
    processing: 'در حال پردازش',
    pending: 'در انتظار',
    failed: 'ناموفق',
    cancelled: 'لغوشده',
    refunded: 'برگشت‌خورده',
  };

  return labels[status] || status;
}

function orderTypeLabel(type: string) {
  const labels: Record<string, string> = {
    new: 'جدید',
    renew: 'تمدید',
    upgrade: 'ارتقا',
    traffic_add: 'افزایش ترافیک',
  };

  return labels[type] || type;
}

export default function ReportsPage() {
  const { data, isLoading, error, reload } = useRemoteData(() => backend.reports.summary(), []);

  if (isLoading) {
    return (
      <DashboardLayout title="گزارش‌ها">
        <LoadingState />
      </DashboardLayout>
    );
  }

  if (error || !data) {
    return (
      <DashboardLayout title="گزارش‌ها">
        <ErrorState message={error || 'خطا در دریافت گزارش‌ها'} onRetry={reload} />
      </DashboardLayout>
    );
  }

  const summary = data.summary || {};
  const dailyRevenue = (data.dailyRevenue || []).map((row: any) => ({
    day: new Date(row.day).toLocaleDateString('fa-IR', { month: 'short', day: 'numeric' }),
    revenue: Number(row.revenue || 0),
    orders: Number(row.orders_count || 0),
    completed: Number(row.completed_count || 0),
  }));

  const ordersByStatus = (data.ordersByStatus || []).map((row: any) => ({
    status: statusLabel(row.status),
    count: Number(row.count || 0),
    total: Number(row.total_price || 0),
  }));

  const trafficUsedGB = bytesToGB(Number(summary.traffic_used_total || 0));
  const trafficLimitGB = bytesToGB(Number(summary.traffic_limit_total || 0));
  const trafficPercent = trafficLimitGB > 0 ? Math.min(100, Math.round((trafficUsedGB / trafficLimitGB) * 100)) : 0;

  return (
    <DashboardLayout title="گزارش‌ها">
      <div className="space-y-6">
        <div className="rounded-2xl border border-slate-200 bg-gradient-to-l from-indigo-50 via-white to-sky-50 p-5 shadow-sm dark:border-slate-700 dark:from-slate-900 dark:via-slate-900 dark:to-sky-950/40">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">
                گزارش‌ها و تحلیل فروش
              </h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                نمای کلی درآمد، سفارش‌ها، مشتری‌ها، پلن‌ها و مصرف ترافیک
              </p>
            </div>

            <Button variant="outline" leftIcon={<RefreshCw className="h-4 w-4" />} onClick={reload}>
              بروزرسانی گزارش
            </Button>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            <ReportCard icon={<Wallet className="h-5 w-5" />} label="درآمد کل" value={formatPrice(Number(summary.revenue || 0))} tone="emerald" />
            <ReportCard icon={<CalendarDays className="h-5 w-5" />} label="درآمد امروز" value={formatPrice(Number(summary.today_revenue || 0))} tone="sky" />
            <ReportCard icon={<TrendingUp className="h-5 w-5" />} label="درآمد ماه جاری" value={formatPrice(Number(summary.month_revenue || 0))} tone="violet" />
            <ReportCard icon={<ShoppingCart className="h-5 w-5" />} label="کل سفارش‌ها" value={String(Number(summary.orders || 0))} tone="amber" />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <ReportCard icon={<Users className="h-5 w-5" />} label="مشتریان عمده" value={String(Number(summary.wholesale_customers || 0))} tone="sky" />
          <ReportCard icon={<Activity className="h-5 w-5" />} label="کانفیگ‌های فعال" value={String(Number(summary.active_end_users || 0))} tone="emerald" />
          <ReportCard icon={<CheckCircle2 className="h-5 w-5" />} label="سفارش تکمیل‌شده" value={String(Number(summary.completed_orders || 0))} tone="violet" />
          <ReportCard icon={<Wallet className="h-5 w-5" />} label="موجودی کل کیف پول‌ها" value={formatPrice(Number(summary.wallet_total || 0))} tone="amber" />
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <Card className="xl:col-span-2">
            <CardHeader>
              <CardTitle>درآمد ۱۴ روز اخیر</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={dailyRevenue}>
                    <defs>
                      <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0.03} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} tickFormatter={(value) => `${Math.round(Number(value) / 1000)}k`} />
                    <Tooltip formatter={(value: any) => formatPrice(Number(value))} />
                    <Area type="monotone" dataKey="revenue" stroke="#0ea5e9" fill="url(#revenueGradient)" strokeWidth={3} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>وضعیت سفارش‌ها</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={ordersByStatus}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="status" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#8b5cf6" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>مصرف ترافیک کل</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-2xl bg-slate-50 p-5 dark:bg-slate-800">
                <div className="flex items-center gap-3">
                  <div className="rounded-xl bg-sky-100 p-3 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300">
                    <Wifi className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-500 dark:text-slate-400">مصرف‌شده از کل ظرفیت</p>
                    <p className="text-xl font-bold text-slate-800 dark:text-slate-100">
                      {trafficUsedGB.toFixed(2)} GB / {trafficLimitGB.toFixed(2)} GB
                    </p>
                  </div>
                </div>

                <div className="mt-5 h-3 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                  <div
                    className="h-full rounded-full bg-sky-500"
                    style={{ width: `${trafficPercent}%` }}
                  />
                </div>

                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                  {trafficPercent}% استفاده شده
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="xl:col-span-2">
            <CardHeader>
              <CardTitle>برترین مشتری‌ها</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px]">
                  <thead className="bg-slate-50 dark:bg-slate-800/70">
                    <tr>
                      {['مشتری', 'سفارش‌ها', 'کانفیگ‌ها', 'درآمد', 'کیف پول'].map((head) => (
                        <th key={head} className="px-4 py-3 text-right text-xs font-medium text-slate-500 dark:text-slate-400">
                          {head}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                    {(data.topCustomers || []).map((customer: any) => (
                      <tr key={customer.id} className="hover:bg-sky-50/50 dark:hover:bg-slate-800/70">
                        <td className="px-4 py-4">
                          <div className="font-medium text-slate-800 dark:text-slate-100">{customer.company_name || customer.username}</div>
                          <div className="mt-1 text-xs text-slate-500">@{customer.username}</div>
                        </td>
                        <td className="px-4 py-4 text-sm">{customer.orders_count}</td>
                        <td className="px-4 py-4 text-sm">{customer.end_users_count}</td>
                        <td className="px-4 py-4 text-sm font-bold text-emerald-600 dark:text-emerald-300">{formatPrice(Number(customer.revenue || 0))}</td>
                        <td className="px-4 py-4 text-sm">{formatPrice(Number(customer.wallet_balance || 0))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>برترین پلن‌ها</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px]">
                  <thead className="bg-slate-50 dark:bg-slate-800/70">
                    <tr>
                      {['پلن', 'ترافیک', 'سفارش‌ها', 'کانفیگ‌ها', 'درآمد'].map((head) => (
                        <th key={head} className="px-4 py-3 text-right text-xs font-medium text-slate-500 dark:text-slate-400">
                          {head}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                    {(data.topPlans || []).map((plan: any) => (
                      <tr key={plan.id} className="hover:bg-violet-50/50 dark:hover:bg-slate-800/70">
                        <td className="px-4 py-4 font-medium text-slate-800 dark:text-slate-100">{plan.name}</td>
                        <td className="px-4 py-4 text-sm">{plan.traffic_gb}GB</td>
                        <td className="px-4 py-4 text-sm">{plan.orders_count}</td>
                        <td className="px-4 py-4 text-sm">{plan.end_users_count}</td>
                        <td className="px-4 py-4 text-sm font-bold text-emerald-600 dark:text-emerald-300">{formatPrice(Number(plan.revenue || 0))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>آخرین سفارش‌ها</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[680px]">
                  <thead className="bg-slate-50 dark:bg-slate-800/70">
                    <tr>
                      {['مشتری', 'پلن', 'نوع', 'وضعیت', 'مبلغ'].map((head) => (
                        <th key={head} className="px-4 py-3 text-right text-xs font-medium text-slate-500 dark:text-slate-400">
                          {head}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                    {(data.recentOrders || []).map((order: any) => (
                      <tr key={order.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/70">
                        <td className="px-4 py-4">
                          <div className="font-medium text-slate-800 dark:text-slate-100">{order.company_name || order.username || '-'}</div>
                          <div className="mt-1 text-xs text-slate-500">@{order.username || '-'}</div>
                        </td>
                        <td className="px-4 py-4 text-sm">{order.plan_name || '-'}</td>
                        <td className="px-4 py-4 text-sm">{orderTypeLabel(order.type)}</td>
                        <td className="px-4 py-4 text-sm">{statusLabel(order.status)}</td>
                        <td className="px-4 py-4 text-sm font-bold">{formatPrice(Number(order.total_price || 0))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}

function ReportCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: 'sky' | 'emerald' | 'violet' | 'amber';
}) {
  const tones = {
    sky: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
    emerald: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
    violet: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
    amber: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  };

  return (
    <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-100 dark:bg-slate-800/70 dark:ring-slate-700">
      <div className="flex items-center gap-3">
        <div className={`rounded-xl p-2 ${tones[tone]}`}>
          {icon}
        </div>
        <div>
          <p className="text-xs text-slate-500">{label}</p>
          <p className="mt-1 text-lg font-bold text-slate-800 dark:text-slate-100">{value}</p>
        </div>
      </div>
    </div>
  );
}
