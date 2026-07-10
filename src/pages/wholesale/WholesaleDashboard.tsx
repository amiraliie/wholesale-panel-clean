import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { StatsCard } from '../../components/StatsCard';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { StatusBadge } from '../../components/ui/Badge';
import { EmptyState, ErrorState, LoadingState } from '../../components/RemoteState';
import { useRemoteData } from '../../hooks/useRemoteData';
import { backend } from '../../services/backend';
import { formatPrice, formatBytes, formatDateTime } from '../../lib/utils';
import {
  Activity,
  AlertCircle,
  ArrowUpRight,
  Clock,
  Plus,
  RefreshCw,
  ShoppingCart,
  TrendingDown,
  Users,
  Wallet,
  Wifi,
  Zap,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

function getValue(item: any, camel: string, snake: string, fallback: any = '') {
  if (item?.[camel] !== undefined && item?.[camel] !== null && item?.[camel] !== '') return item[camel];
  if (item?.[snake] !== undefined && item?.[snake] !== null && item?.[snake] !== '') return item[snake];
  return fallback;
}

function toNumber(value: any) {
  const num = Number(value || 0);
  return Number.isFinite(num) ? num : 0;
}

function bytesToGB(value: any) {
  return toNumber(value) / 1024 / 1024 / 1024;
}

function getTrafficUsed(user: any) {
  return toNumber(getValue(user, 'trafficUsed', 'traffic_used', 0));
}

function getTrafficLimit(user: any) {
  return toNumber(getValue(user, 'trafficLimit', 'traffic_limit', 0));
}

function getTrafficRemainingGB(user: any) {
  return Math.max(0, bytesToGB(getTrafficLimit(user) - getTrafficUsed(user)));
}

function getTrafficPercent(user: any) {
  const limit = getTrafficLimit(user);
  if (!limit) return 0;
  return Math.min(100, Math.round((getTrafficUsed(user) / limit) * 100));
}

function getDaysLeft(user: any) {
  const expiry = getValue(user, 'expiryTime', 'expiry_time', '');
  if (!expiry) return 0;

  const timestamp = new Date(expiry).getTime();
  if (!Number.isFinite(timestamp)) return 0;

  return Math.ceil((timestamp - Date.now()) / 86400000);
}

function getPlanName(item: any) {
  return (
    getValue(item, 'planName', 'plan_name', '') ||
    item?.plan?.name ||
    'بدون پلن'
  );
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    active: 'فعال',
    disabled: 'غیرفعال',
    expired: 'منقضی',
    limited: 'محدود',
    completed: 'تکمیل‌شده',
    processing: 'در پردازش',
    pending: 'در انتظار',
    failed: 'ناموفق',
    cancelled: 'لغوشده',
    refunded: 'برگشت‌خورده',
  };

  return labels[status] || status || '-';
}

function orderTypeLabel(type: string) {
  const labels: Record<string, string> = {
    new: 'سرویس جدید',
    renew: 'تمدید',
    upgrade: 'ارتقا',
    traffic_add: 'افزایش ترافیک',
  };

  return labels[type] || type || '-';
}

function makeLast14DaysOrders(orders: any[]) {
  const days = Array.from({ length: 14 }).map((_, index) => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - (13 - index));

    return {
      key: date.toISOString().slice(0, 10),
      name: date.toLocaleDateString('fa-IR', { month: 'short', day: 'numeric' }),
      amount: 0,
      orders: 0,
    };
  });

  const map = new Map(days.map((day) => [day.key, day]));

  orders.forEach((order: any) => {
    const createdAt = getValue(order, 'createdAt', 'created_at', '');
    if (!createdAt) return;

    const key = new Date(createdAt).toISOString().slice(0, 10);
    const day = map.get(key);
    if (!day) return;

    day.orders += 1;

    if (order.status === 'completed') {
      day.amount += toNumber(getValue(order, 'totalPrice', 'total_price', 0));
    }
  });

  return days;
}

export default function WholesaleDashboard() {
  const {
    data,
    isLoading,
    error,
    reload,
  } = useRemoteData(async () => ({
    wallet: await backend.wallet.current(),
    endUsers: await backend.endUsers.list(),
    orders: await backend.orders.list(),
  }), []);

  const dashboard = useMemo(() => {
    if (!data) return null;

    const wallet = data.wallet || {};
    const endUsers = data.endUsers || [];
    const orders = data.orders || [];

    const walletBalance = toNumber(wallet.balance);
    const minBalance = toNumber(getValue(wallet, 'minBalance', 'min_balance', 0));
    const activeUsers = endUsers.filter((user: any) => user.status === 'active' || getValue(user, 'isActive', 'is_active', false)).length;

    const expiringSoon = endUsers
      .map((user: any) => ({
        ...user,
        daysLeft: getDaysLeft(user),
        remainingGB: getTrafficRemainingGB(user),
      }))
      .filter((user: any) => user.daysLeft >= 0 && user.daysLeft <= 7)
      .sort((a: any, b: any) => a.daysLeft - b.daysLeft)
      .slice(0, 6);

    const lowTrafficUsers = endUsers
      .map((user: any) => ({
        ...user,
        remainingGB: getTrafficRemainingGB(user),
        usagePercent: getTrafficPercent(user),
      }))
      .filter((user: any) => getTrafficLimit(user) > 0 && user.remainingGB <= 5)
      .sort((a: any, b: any) => a.remainingGB - b.remainingGB);

    const recentEndUsers = [...endUsers]
      .sort((a: any, b: any) => new Date(getValue(b, 'createdAt', 'created_at', 0)).getTime() - new Date(getValue(a, 'createdAt', 'created_at', 0)).getTime())
      .slice(0, 7);

    const recentOrders = [...orders]
      .sort((a: any, b: any) => new Date(getValue(b, 'createdAt', 'created_at', 0)).getTime() - new Date(getValue(a, 'createdAt', 'created_at', 0)).getTime())
      .slice(0, 5);

    const totalTrafficUsed = endUsers.reduce((sum: number, user: any) => sum + getTrafficUsed(user), 0);
    const totalTrafficLimit = endUsers.reduce((sum: number, user: any) => sum + getTrafficLimit(user), 0);
    const totalTrafficPercent = totalTrafficLimit > 0 ? Math.min(100, Math.round((totalTrafficUsed / totalTrafficLimit) * 100)) : 0;

    const ordersThisMonth = orders.filter((order: any) => {
      const createdAt = getValue(order, 'createdAt', 'created_at', '');
      if (!createdAt) return false;

      const date = new Date(createdAt);
      const now = new Date();

      return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
    });

    const monthlySpent = ordersThisMonth
      .filter((order: any) => order.status === 'completed')
      .reduce((sum: number, order: any) => sum + toNumber(getValue(order, 'totalPrice', 'total_price', 0)), 0);

    const totalSpent = orders
      .filter((order: any) => order.status === 'completed')
      .reduce((sum: number, order: any) => sum + toNumber(getValue(order, 'totalPrice', 'total_price', 0)), 0);

    const dailyOrders = makeLast14DaysOrders(orders);

    const statusChart = [
      { name: 'فعال', value: endUsers.filter((user: any) => user.status === 'active').length, color: '#10b981' },
      { name: 'محدود', value: endUsers.filter((user: any) => user.status === 'limited').length, color: '#f59e0b' },
      { name: 'منقضی', value: endUsers.filter((user: any) => user.status === 'expired').length, color: '#ef4444' },
      { name: 'غیرفعال', value: endUsers.filter((user: any) => user.status === 'disabled').length, color: '#64748b' },
    ].filter((item) => item.value > 0);

    return {
      wallet,
      walletBalance,
      minBalance,
      totalUsers: endUsers.length,
      activeUsers,
      expiringSoon,
      lowTrafficUsers,
      recentEndUsers,
      recentOrders,
      totalTrafficUsed,
      totalTrafficLimit,
      totalTrafficPercent,
      ordersThisMonth,
      monthlySpent,
      totalSpent,
      dailyOrders,
      statusChart,
    };
  }, [data]);

  if (isLoading) {
    return (
      <DashboardLayout title="داشبورد">
        <LoadingState />
      </DashboardLayout>
    );
  }

  if (error || !data || !dashboard) {
    return (
      <DashboardLayout title="داشبورد">
        <ErrorState message={error || 'خطا در دریافت اطلاعات داشبورد'} onRetry={reload} />
      </DashboardLayout>
    );
  }

  const isLowBalance = dashboard.minBalance > 0 && dashboard.walletBalance < dashboard.minBalance;

  return (
    <DashboardLayout title="داشبورد">
      <div className="space-y-6">
        <div className="rounded-2xl border border-slate-200 bg-gradient-to-l from-sky-50 via-white to-violet-50 p-5 shadow-sm dark:border-slate-700 dark:from-slate-900 dark:via-slate-900 dark:to-violet-950/40">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">
                خوش آمدید 👋
              </h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                خلاصه وضعیت کیف پول، کانفیگ‌ها، سفارش‌ها و مصرف ترافیک شما
              </p>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button variant="outline" leftIcon={<RefreshCw className="h-4 w-4" />} onClick={reload}>
                بروزرسانی
              </Button>

              <Link to="/dashboard/create-config">
                <Button leftIcon={<Plus className="h-4 w-4" />}>
                  ساخت کانفیگ جدید
                </Button>
              </Link>
            </div>
          </div>
        </div>

        <Card className="overflow-hidden border-0 bg-gradient-to-l from-sky-600 via-indigo-600 to-violet-600">
          <CardContent className="relative p-0">
            <div className="absolute inset-0 opacity-20">
              <div className="absolute -left-16 -top-16 h-48 w-48 rounded-full bg-white blur-3xl" />
              <div className="absolute -bottom-20 right-20 h-56 w-56 rounded-full bg-cyan-200 blur-3xl" />
            </div>

            <div className="relative flex flex-col gap-6 p-6 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-4">
                <div className="rounded-2xl bg-white/20 p-4 ring-1 ring-white/30">
                  <Wallet className="h-9 w-9 text-white" />
                </div>

                <div>
                  <p className="text-sm text-sky-100">موجودی کیف پول</p>
                  <p className="mt-1 text-3xl font-bold text-white">
                    {formatPrice(dashboard.walletBalance)}
                  </p>
                  {dashboard.minBalance > 0 && (
                    <p className="mt-2 text-sm text-sky-100">
                      حد هشدار موجودی: {formatPrice(dashboard.minBalance)}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                {isLowBalance && (
                  <div className="rounded-xl bg-amber-100/95 px-4 py-3 text-sm font-medium text-amber-800">
                    موجودی کمتر از حد هشدار است
                  </div>
                )}

                <Link to="/dashboard/wallet">
                  <Button variant="secondary" className="border-0 bg-white/20 text-white hover:bg-white/30">
                    مشاهده تراکنش‌ها
                  </Button>
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatsCard
            title="کل کاربران"
            value={dashboard.totalUsers}
            icon={Users}
            variant="info"
          />

          <StatsCard
            title="کاربران فعال"
            value={dashboard.activeUsers}
            icon={Activity}
            variant="success"
          />

          <StatsCard
            title="در حال انقضا"
            value={dashboard.expiringSoon.length}
            icon={Clock}
            variant="warning"
          />

          <StatsCard
            title="ترافیک کم"
            value={dashboard.lowTrafficUsers.length}
            icon={TrendingDown}
            variant="danger"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <MiniCard
            icon={<ShoppingCart className="h-5 w-5" />}
            label="سفارش‌های این ماه"
            value={String(dashboard.ordersThisMonth.length)}
            description={`مصرف ماه: ${formatPrice(dashboard.monthlySpent)}`}
            tone="sky"
          />

          <MiniCard
            icon={<Wallet className="h-5 w-5" />}
            label="کل خریدهای موفق"
            value={formatPrice(dashboard.totalSpent)}
            description="بر اساس سفارش‌های تکمیل‌شده"
            tone="emerald"
          />

          <MiniCard
            icon={<Wifi className="h-5 w-5" />}
            label="مصرف کل ترافیک"
            value={`${dashboard.totalTrafficPercent}%`}
            description={`${formatBytes(dashboard.totalTrafficUsed)} از ${formatBytes(dashboard.totalTrafficLimit)}`}
            tone="violet"
          />
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <Card className="xl:col-span-2">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>روند خرید ۱۴ روز اخیر</CardTitle>
                <ArrowUpRight className="h-5 w-5 text-sky-500" />
              </div>
            </CardHeader>

            <CardContent>
              <div className="rounded-2xl bg-gradient-to-l from-slate-50 to-sky-50 p-4 dark:from-slate-800 dark:to-sky-950/30">
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={dashboard.dailyOrders}>
                      <defs>
                        <linearGradient id="wholesaleRevenueGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.4} />
                          <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0.03} />
                        </linearGradient>
                      </defs>

                      <CartesianGrid strokeDasharray="3 3" stroke="#dbeafe" />
                      <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} tickFormatter={(value) => `${Math.round(Number(value) / 1000)}k`} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#475569',
                          border: 'none',
                          borderRadius: '14px',
                          color: '#fff',
                        }}
                        formatter={(value: any, name: any) => [
                          name === 'amount' ? formatPrice(Number(value)) : Number(value),
                          name === 'amount' ? 'مبلغ خرید' : 'تعداد سفارش',
                        ]}
                      />
                      <Area
                        type="monotone"
                        dataKey="amount"
                        stroke="#0ea5e9"
                        strokeWidth={3}
                        fill="url(#wholesaleRevenueGradient)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>وضعیت کانفیگ‌ها</CardTitle>
            </CardHeader>

            <CardContent>
              {dashboard.statusChart.length === 0 ? (
                <EmptyState text="هنوز کانفیگی ساخته نشده است." />
              ) : (
                <>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={dashboard.statusChart}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          innerRadius={58}
                          outerRadius={84}
                          paddingAngle={5}
                        >
                          {dashboard.statusChart.map((entry: any, index: number) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2">
                    {dashboard.statusChart.map((item: any) => (
                      <div key={item.name} className="flex items-center gap-2 rounded-xl bg-slate-50 p-2 dark:bg-slate-800">
                        <span className="h-3 w-3 rounded-full" style={{ backgroundColor: item.color }} />
                        <span className="text-sm text-slate-600 dark:text-slate-300">
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

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>در حال انقضا</CardTitle>
                <AlertCircle className="h-5 w-5 text-amber-500" />
              </div>
            </CardHeader>

            <CardContent>
              {dashboard.expiringSoon.length === 0 ? (
                <div className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-200">
                  فعلاً کانفیگ نزدیک انقضا ندارید.
                </div>
              ) : (
                <div className="space-y-3">
                  {dashboard.expiringSoon.map((user: any) => (
                    <div
                      key={user.id}
                      className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-900/20"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <Zap className="h-4 w-4 shrink-0 text-amber-600" />
                          <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                            {user.email}
                          </p>
                        </div>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                          {getPlanName(user)}
                        </p>
                      </div>

                      <div className="text-left text-sm font-bold text-amber-700 dark:text-amber-300">
                        {user.daysLeft} روز
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <Link to="/dashboard/end-users" className="mt-4 block">
                <Button variant="outline" className="w-full" size="sm">
                  مشاهده همه کاربران
                </Button>
              </Link>
            </CardContent>
          </Card>

          <Card className="xl:col-span-2">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>آخرین کاربران</CardTitle>
                <Link to="/dashboard/end-users">
                  <Button variant="ghost" size="sm">
                    مشاهده همه
                  </Button>
                </Link>
              </div>
            </CardHeader>

            <CardContent className="p-0">
              {dashboard.recentEndUsers.length === 0 ? (
                <div className="p-6">
                  <EmptyState text="هنوز کاربری ساخته نشده است." />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px]">
                    <thead className="bg-slate-50 dark:bg-slate-800/70">
                      <tr>
                        {['ایمیل', 'پلن', 'مصرف / سقف', 'انقضا', 'وضعیت'].map((head) => (
                          <th key={head} className="px-4 py-3 text-right text-xs font-medium text-slate-500 dark:text-slate-400">
                            {head}
                          </th>
                        ))}
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                      {dashboard.recentEndUsers.map((user: any) => {
                        const percent = getTrafficPercent(user);
                        const expiry = getValue(user, 'expiryTime', 'expiry_time', '');
                        const status = String(user.status || 'active');

                        return (
                          <tr key={user.id} className="hover:bg-sky-50/50 dark:hover:bg-slate-800/70">
                            <td className="px-4 py-4">
                              <div className="font-medium text-slate-800 dark:text-slate-100">
                                {user.email}
                              </div>
                              <div className="mt-1 text-xs text-slate-500">
                                {getTrafficRemainingGB(user).toFixed(1)} GB باقی‌مانده
                              </div>
                            </td>

                            <td className="px-4 py-4 text-sm text-slate-600 dark:text-slate-300">
                              {getPlanName(user)}
                            </td>

                            <td className="px-4 py-4">
                              <div className="flex items-center gap-2">
                                <div className="h-2 w-28 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                                  <div
                                    className={`h-full rounded-full ${
                                      percent >= 90 ? 'bg-rose-500' : percent >= 70 ? 'bg-amber-500' : 'bg-sky-500'
                                    }`}
                                    style={{ width: `${percent}%` }}
                                  />
                                </div>
                                <span className="whitespace-nowrap text-xs text-slate-500 dark:text-slate-400">
                                  {formatBytes(getTrafficUsed(user))} / {formatBytes(getTrafficLimit(user))}
                                </span>
                              </div>
                            </td>

                            <td className="px-4 py-4 text-sm text-slate-600 dark:text-slate-300">
                              {expiry ? formatDateTime(expiry) : '-'}
                            </td>

                            <td className="px-4 py-4">
                              <StatusBadge status={status} />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>آخرین سفارش‌ها</CardTitle>
              <Link to="/dashboard/orders">
                <Button variant="ghost" size="sm">
                  مشاهده سفارش‌ها
                </Button>
              </Link>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            {dashboard.recentOrders.length === 0 ? (
              <div className="p-6">
                <EmptyState text="هنوز سفارشی ثبت نشده است." />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[780px]">
                  <thead className="bg-slate-50 dark:bg-slate-800/70">
                    <tr>
                      {['شناسه', 'نوع', 'پلن', 'مبلغ', 'وضعیت', 'تاریخ'].map((head) => (
                        <th key={head} className="px-4 py-3 text-right text-xs font-medium text-slate-500 dark:text-slate-400">
                          {head}
                        </th>
                      ))}
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                    {dashboard.recentOrders.map((order: any) => (
                      <tr key={order.id} className="hover:bg-violet-50/50 dark:hover:bg-slate-800/70">
                        <td className="px-4 py-4 font-mono text-xs text-slate-500">
                          {String(order.id).slice(0, 8)}
                        </td>

                        <td className="px-4 py-4 text-sm text-slate-600 dark:text-slate-300">
                          {orderTypeLabel(order.type)}
                        </td>

                        <td className="px-4 py-4 text-sm text-slate-600 dark:text-slate-300">
                          {getPlanName(order)}
                        </td>

                        <td className="px-4 py-4 text-sm font-bold text-slate-800 dark:text-slate-100">
                          {formatPrice(toNumber(getValue(order, 'totalPrice', 'total_price', 0)))}
                        </td>

                        <td className="px-4 py-4">
                          <StatusBadge status={order.status} />
                        </td>

                        <td className="px-4 py-4 text-sm text-slate-600 dark:text-slate-300">
                          {formatDateTime(getValue(order, 'createdAt', 'created_at', ''))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}

function MiniCard({
  icon,
  label,
  value,
  description,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  description: string;
  tone: 'sky' | 'emerald' | 'violet';
}) {
  const tones = {
    sky: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
    emerald: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
    violet: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
  };

  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100 dark:bg-slate-800/70 dark:ring-slate-700">
      <div className="flex items-center gap-3">
        <div className={`rounded-xl p-2 ${tones[tone]}`}>
          {icon}
        </div>

        <div>
          <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
          <p className="mt-1 text-lg font-bold text-slate-800 dark:text-slate-100">{value}</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{description}</p>
        </div>
      </div>
    </div>
  );
}
