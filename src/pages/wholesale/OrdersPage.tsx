import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { StatusBadge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { EmptyState, ErrorState, LoadingState } from '../../components/RemoteState';
import { useRemoteData } from '../../hooks/useRemoteData';
import { backend } from '../../services/backend';
import { formatDateTime, formatPrice } from '../../lib/utils';
import {
  Activity,
  CheckCircle2,
  Download,
  Eye,
  Filter,
  Package,
  RefreshCw,
  Search,
  ShoppingCart,
  Wallet,
  XCircle,
} from 'lucide-react';

function getValue(item: any, camel: string, snake?: string, fallback: any = '') {
  if (item?.[camel] !== undefined && item?.[camel] !== null && item?.[camel] !== '') return item[camel];
  if (snake && item?.[snake] !== undefined && item?.[snake] !== null && item?.[snake] !== '') return item[snake];
  return fallback;
}

function toNumber(value: any) {
  const num = Number(value || 0);
  return Number.isFinite(num) ? num : 0;
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

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    pending: 'در انتظار',
    processing: 'در پردازش',
    completed: 'تکمیل‌شده',
    failed: 'ناموفق',
    cancelled: 'لغوشده',
    refunded: 'برگشت‌خورده',
  };

  return labels[status] || status || '-';
}

function getOrderId(order: any) {
  return String(order?.id || '');
}

function getOrderShortId(order: any) {
  const id = getOrderId(order);
  return id ? id.slice(0, 8) : '-';
}

function getOrderEmail(order: any) {
  return (
    getValue(order, 'endUserEmail', 'end_user_email', '') ||
    order?.endUser?.email ||
    order?.end_user?.email ||
    getValue(order, 'email', 'email', '') ||
    '-'
  );
}

function getPlanName(order: any) {
  return (
    getValue(order, 'planName', 'plan_name', '') ||
    order?.plan?.name ||
    '-'
  );
}

function getServerName(order: any) {
  return (
    getValue(order, 'serverName', 'server_name', '') ||
    order?.server?.name ||
    getValue(order, 'serverId', 'server_id', '') ||
    '-'
  );
}

function getInboundName(order: any) {
  return (
    getValue(order, 'inboundName', 'inbound_name', '') ||
    order?.inbound?.name ||
    getValue(order, 'inboundId', 'inbound_id', '') ||
    '-'
  );
}

function getTrafficGB(order: any) {
  return toNumber(getValue(order, 'trafficGB', 'traffic_gb', 0));
}

function getDurationDays(order: any) {
  return toNumber(getValue(order, 'durationDays', 'duration_days', 0));
}

function getTotalPrice(order: any) {
  return toNumber(getValue(order, 'totalPrice', 'total_price', 0));
}

function getPricePerGB(order: any) {
  return toNumber(getValue(order, 'pricePerGB', 'price_per_gb', 0));
}

function getCreatedAt(order: any) {
  return String(getValue(order, 'createdAt', 'created_at', ''));
}

function escapeCsv(value: any) {
  const text = String(value ?? '');
  return `"${text.replaceAll('"', '""')}"`;
}

function downloadOrdersCsv(orders: any[]) {
  const headers = [
    'id',
    'type',
    'email',
    'plan',
    'server',
    'inbound',
    'traffic_gb',
    'duration_days',
    'price_per_gb',
    'total_price',
    'status',
    'created_at',
  ];

  const rows = orders.map((order) => [
    getOrderId(order),
    orderTypeLabel(order.type),
    getOrderEmail(order),
    getPlanName(order),
    getServerName(order),
    getInboundName(order),
    getTrafficGB(order),
    getDurationDays(order),
    getPricePerGB(order),
    getTotalPrice(order),
    statusLabel(order.status),
    getCreatedAt(order),
  ]);

  const csv = [
    headers.map(escapeCsv).join(','),
    ...rows.map((row) => row.map(escapeCsv).join(',')),
  ].join('\n');

  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = `orders-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export default function OrdersPage() {
  const { data: orders, isLoading, error, reload } = useRemoteData(() => backend.orders.list(), []);

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);

  const filteredOrders = useMemo(() => {
    const q = searchTerm.toLowerCase();

    return (orders || []).filter((order: any) => {
      const haystack = [
        getOrderId(order),
        getOrderEmail(order),
        getPlanName(order),
        getServerName(order),
        getInboundName(order),
        order.type,
        order.status,
      ].join(' ').toLowerCase();

      const matchesSearch = haystack.includes(q);
      const matchesStatus = statusFilter === 'all' || order.status === statusFilter;
      const matchesType = typeFilter === 'all' || order.type === typeFilter;

      return matchesSearch && matchesStatus && matchesType;
    });
  }, [orders, searchTerm, statusFilter, typeFilter]);

  const stats = useMemo(() => {
    const list = orders || [];
    const completed = list.filter((order: any) => order.status === 'completed');
    const failed = list.filter((order: any) => order.status === 'failed' || order.status === 'cancelled');
    const pending = list.filter((order: any) => order.status === 'pending' || order.status === 'processing');

    const now = new Date();
    const monthlyCompleted = completed.filter((order: any) => {
      const createdAt = getCreatedAt(order);
      if (!createdAt) return false;

      const date = new Date(createdAt);
      return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
    });

    return {
      total: list.length,
      completed: completed.length,
      pending: pending.length,
      failed: failed.length,
      totalSpent: completed.reduce((sum: number, order: any) => sum + getTotalPrice(order), 0),
      monthlySpent: monthlyCompleted.reduce((sum: number, order: any) => sum + getTotalPrice(order), 0),
    };
  }, [orders]);

  return (
    <DashboardLayout title="سفارشات">
      <div className="space-y-6">
        <div className="rounded-2xl border border-slate-200 bg-gradient-to-l from-sky-50 via-white to-violet-50 p-5 shadow-sm dark:border-slate-700 dark:from-slate-900 dark:via-slate-900 dark:to-violet-950/40">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">
                سفارشات من
              </h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                مشاهده سفارش‌های ساخت، تمدید، ارتقا و افزایش ترافیک
              </p>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button variant="outline" leftIcon={<RefreshCw className="h-4 w-4" />} onClick={reload}>
                بروزرسانی
              </Button>

              <Button
                variant="outline"
                leftIcon={<Download className="h-4 w-4" />}
                disabled={!filteredOrders.length}
                onClick={() => downloadOrdersCsv(filteredOrders)}
              >
                خروجی CSV
              </Button>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            <StatBox icon={<ShoppingCart className="h-5 w-5" />} label="کل سفارش‌ها" value={String(stats.total)} tone="sky" />
            <StatBox icon={<CheckCircle2 className="h-5 w-5" />} label="تکمیل‌شده" value={String(stats.completed)} tone="emerald" />
            <StatBox icon={<Activity className="h-5 w-5" />} label="در انتظار / پردازش" value={String(stats.pending)} tone="amber" />
            <StatBox icon={<Wallet className="h-5 w-5" />} label="مصرف ماه جاری" value={formatPrice(stats.monthlySpent)} tone="violet" />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <MiniInfo label="کل خرید موفق" value={formatPrice(stats.totalSpent)} />
          <MiniInfo label="ناموفق / لغوشده" value={String(stats.failed)} />
          <MiniInfo label="نتیجه فیلتر فعلی" value={`${filteredOrders.length} سفارش`} />
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Filter className="h-5 w-5 text-sky-600" />
              <CardTitle>فیلترها</CardTitle>
            </div>
          </CardHeader>

          <CardContent>
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
              <div className="relative xl:col-span-3">
                <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  placeholder="جستجو بر اساس شناسه، ایمیل، پلن یا سرور..."
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  className="pr-10"
                />
              </div>

              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              >
                <option value="all">همه وضعیت‌ها</option>
                <option value="pending">در انتظار</option>
                <option value="processing">در پردازش</option>
                <option value="completed">تکمیل‌شده</option>
                <option value="failed">ناموفق</option>
                <option value="cancelled">لغوشده</option>
                <option value="refunded">برگشت‌خورده</option>
              </select>

              <select
                value={typeFilter}
                onChange={(event) => setTypeFilter(event.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              >
                <option value="all">همه نوع‌ها</option>
                <option value="new">سرویس جدید</option>
                <option value="renew">تمدید</option>
                <option value="upgrade">ارتقا</option>
                <option value="traffic_add">افزایش ترافیک</option>
              </select>
            </div>
          </CardContent>
        </Card>

        {error && (
          <ErrorState message={error} onRetry={reload} />
        )}

        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <LoadingState />
            ) : !filteredOrders.length ? (
              <div className="p-6">
                <EmptyState text="سفارشی با این فیلترها پیدا نشد." />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1120px]">
                  <thead className="bg-slate-50 dark:bg-slate-800/70">
                    <tr>
                      {['شناسه', 'نوع', 'ایمیل', 'پلن', 'سرور / اینباند', 'ترافیک', 'مبلغ', 'وضعیت', 'تاریخ', 'عملیات'].map((head) => (
                        <th key={head} className="px-4 py-3 text-right text-xs font-medium text-slate-500 dark:text-slate-400">
                          {head}
                        </th>
                      ))}
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                    {filteredOrders.map((order: any) => (
                      <tr key={order.id} className="hover:bg-sky-50/50 dark:hover:bg-slate-800/70">
                        <td className="px-4 py-4">
                          <div className="font-mono text-xs text-slate-600 dark:text-slate-300">
                            {getOrderShortId(order)}
                          </div>
                          <div className="mt-1 max-w-[120px] truncate font-mono text-[11px] text-slate-400">
                            {getOrderId(order)}
                          </div>
                        </td>

                        <td className="px-4 py-4">
                          <span className="inline-flex rounded-full bg-sky-50 px-3 py-1 text-xs font-medium text-sky-700 dark:bg-sky-900/30 dark:text-sky-300">
                            {orderTypeLabel(order.type)}
                          </span>
                        </td>

                        <td className="px-4 py-4 text-sm text-slate-700 dark:text-slate-200">
                          {getOrderEmail(order)}
                        </td>

                        <td className="px-4 py-4 text-sm text-slate-600 dark:text-slate-300">
                          {getPlanName(order)}
                        </td>

                        <td className="px-4 py-4">
                          <div className="text-sm text-slate-700 dark:text-slate-200">
                            {getServerName(order)}
                          </div>
                          <div className="mt-1 text-xs text-slate-500">
                            {getInboundName(order)}
                          </div>
                        </td>

                        <td className="px-4 py-4 text-sm text-slate-600 dark:text-slate-300">
                          {getTrafficGB(order)} GB
                          {getDurationDays(order) > 0 && (
                            <div className="mt-1 text-xs text-slate-500">
                              {getDurationDays(order)} روز
                            </div>
                          )}
                        </td>

                        <td className="px-4 py-4 text-sm font-bold text-slate-800 dark:text-slate-100">
                          {formatPrice(getTotalPrice(order))}
                        </td>

                        <td className="px-4 py-4">
                          <StatusBadge status={order.status} />
                        </td>

                        <td className="px-4 py-4 text-sm text-slate-600 dark:text-slate-300">
                          {getCreatedAt(order) ? formatDateTime(getCreatedAt(order)) : '-'}
                        </td>

                        <td className="px-4 py-4">
                          <Button variant="ghost" size="sm" onClick={() => setSelectedOrder(order)}>
                            <Eye className="h-4 w-4 text-sky-600" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Modal
          isOpen={!!selectedOrder}
          onClose={() => setSelectedOrder(null)}
          title="جزئیات سفارش"
          size="lg"
        >
          {selectedOrder && (
            <div className="space-y-5">
              <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-800">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-mono text-sm text-slate-500">
                      {getOrderId(selectedOrder)}
                    </p>
                    <p className="mt-1 text-lg font-bold text-slate-800 dark:text-slate-100">
                      {orderTypeLabel(selectedOrder.type)} - {getPlanName(selectedOrder)}
                    </p>
                  </div>

                  <StatusBadge status={selectedOrder.status} />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <DetailBox label="ایمیل" value={getOrderEmail(selectedOrder)} />
                <DetailBox label="نوع سفارش" value={orderTypeLabel(selectedOrder.type)} />
                <DetailBox label="پلن" value={getPlanName(selectedOrder)} />
                <DetailBox label="سرور" value={getServerName(selectedOrder)} />
                <DetailBox label="اینباند" value={getInboundName(selectedOrder)} />
                <DetailBox label="ترافیک" value={`${getTrafficGB(selectedOrder)} GB`} />
                <DetailBox label="مدت" value={`${getDurationDays(selectedOrder)} روز`} />
                <DetailBox label="قیمت هر GB" value={formatPrice(getPricePerGB(selectedOrder))} />
                <DetailBox label="مبلغ کل" value={formatPrice(getTotalPrice(selectedOrder))} />
                <DetailBox label="تاریخ" value={getCreatedAt(selectedOrder) ? formatDateTime(getCreatedAt(selectedOrder)) : '-'} />
              </div>

              {getValue(selectedOrder, 'errorMessage', 'error_message', '') && (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-900/30 dark:text-rose-300">
                  {getValue(selectedOrder, 'errorMessage', 'error_message', '')}
                </div>
              )}

              <Button variant="outline" className="w-full" onClick={() => setSelectedOrder(null)}>
                بستن
              </Button>
            </div>
          )}
        </Modal>
      </div>
    </DashboardLayout>
  );
}

function StatBox({
  icon,
  label,
  value,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  tone: 'sky' | 'emerald' | 'amber' | 'violet';
}) {
  const tones = {
    sky: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
    emerald: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
    amber: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    violet: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
  };

  return (
    <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-100 dark:bg-slate-800/70 dark:ring-slate-700">
      <div className="flex items-center gap-3">
        <div className={`rounded-xl p-2 ${tones[tone]}`}>
          {icon}
        </div>

        <div>
          <p className="text-xs text-slate-500">{label}</p>
          <p className="mt-1 text-xl font-bold text-slate-800 dark:text-slate-100">{value}</p>
        </div>
      </div>
    </div>
  );
}

function MiniInfo({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100 dark:bg-slate-800/70 dark:ring-slate-700">
      <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-1 text-lg font-bold text-slate-800 dark:text-slate-100">{value}</p>
    </div>
  );
}

function DetailBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
      <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-1 break-all text-sm font-medium text-slate-800 dark:text-slate-100">{value || '-'}</p>
    </div>
  );
}
