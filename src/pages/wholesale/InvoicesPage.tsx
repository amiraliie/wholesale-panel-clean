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
  CheckCircle2,
  Clock,
  Download,
  Eye,
  FileText,
  Filter,
  RefreshCw,
  Search,
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

function getOrderId(order: any) {
  return String(order?.id || '');
}

function getOrderShortId(order: any) {
  const id = getOrderId(order);
  return id ? id.slice(0, 8) : '-';
}

function getInvoiceNumber(order: any) {
  return `INV-${getOrderShortId(order).toUpperCase()}`;
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

function getTotalPrice(order: any) {
  return toNumber(getValue(order, 'totalPrice', 'total_price', 0));
}

function getTrafficGB(order: any) {
  return toNumber(getValue(order, 'trafficGB', 'traffic_gb', 0));
}

function getDurationDays(order: any) {
  return toNumber(getValue(order, 'durationDays', 'duration_days', 0));
}

function getCreatedAt(order: any) {
  return String(getValue(order, 'createdAt', 'created_at', ''));
}

function addDays(dateText: string, days: number) {
  const date = dateText ? new Date(dateText) : new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

function invoiceStatus(orderStatus: string) {
  if (orderStatus === 'completed') return 'paid';
  if (orderStatus === 'pending' || orderStatus === 'processing') return 'pending';
  return 'cancelled';
}

function invoiceStatusLabel(status: string) {
  const labels: Record<string, string> = {
    paid: 'پرداخت‌شده',
    pending: 'در انتظار',
    cancelled: 'لغوشده',
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

function buildInvoice(order: any) {
  const createdAt = getCreatedAt(order);
  const status = invoiceStatus(order.status);

  return {
    id: getInvoiceNumber(order),
    orderId: getOrderId(order),
    orderShortId: getOrderShortId(order),
    order,
    email: getOrderEmail(order),
    plan: getPlanName(order),
    server: getServerName(order),
    inbound: getInboundName(order),
    type: order.type,
    amount: getTotalPrice(order),
    trafficGB: getTrafficGB(order),
    durationDays: getDurationDays(order),
    status,
    orderStatus: order.status,
    createdAt,
    dueDate: addDays(createdAt, 5),
    paidAt: status === 'paid' ? createdAt : '',
  };
}

function escapeCsv(value: any) {
  const text = String(value ?? '');
  return `"${text.replaceAll('"', '""')}"`;
}

function downloadCsv(invoices: any[]) {
  const headers = [
    'invoice_number',
    'order_id',
    'email',
    'plan',
    'server',
    'inbound',
    'type',
    'traffic_gb',
    'duration_days',
    'amount',
    'status',
    'created_at',
    'due_date',
    'paid_at',
  ];

  const rows = invoices.map((invoice) => [
    invoice.id,
    invoice.orderId,
    invoice.email,
    invoice.plan,
    invoice.server,
    invoice.inbound,
    orderTypeLabel(invoice.type),
    invoice.trafficGB,
    invoice.durationDays,
    invoice.amount,
    invoiceStatusLabel(invoice.status),
    invoice.createdAt,
    invoice.dueDate,
    invoice.paidAt || '',
  ]);

  const csv = [
    headers.map(escapeCsv).join(','),
    ...rows.map((row) => row.map(escapeCsv).join(',')),
  ].join('\n');

  downloadTextFile(`invoices-${new Date().toISOString().slice(0, 10)}.csv`, csv, 'text/csv;charset=utf-8;');
}

function downloadTextFile(filename: string, content: string, type = 'text/plain;charset=utf-8;') {
  const blob = new Blob([`\uFEFF${content}`], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function downloadSingleInvoice(invoice: any) {
  const content = `
فاکتور فروش

شماره فاکتور: ${invoice.id}
شناسه سفارش: ${invoice.orderId}
تاریخ صدور: ${invoice.createdAt ? formatDateTime(invoice.createdAt) : '-'}
سررسید: ${invoice.dueDate ? formatDateTime(invoice.dueDate) : '-'}
تاریخ پرداخت: ${invoice.paidAt ? formatDateTime(invoice.paidAt) : '-'}

ایمیل کاربر: ${invoice.email}
نوع سفارش: ${orderTypeLabel(invoice.type)}
پلن: ${invoice.plan}
سرور: ${invoice.server}
اینباند: ${invoice.inbound}
ترافیک: ${invoice.trafficGB} GB
مدت: ${invoice.durationDays} روز

وضعیت فاکتور: ${invoiceStatusLabel(invoice.status)}
مبلغ: ${formatPrice(invoice.amount)}
  `.trim();

  downloadTextFile(`${invoice.id}.txt`, content);
}

export default function InvoicesPage() {
  const { data: orders, isLoading, error, reload } = useRemoteData(() => backend.orders.list(), []);

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedInvoice, setSelectedInvoice] = useState<any | null>(null);

  const invoices = useMemo(() => {
    return (orders || []).map((order: any) => buildInvoice(order));
  }, [orders]);

  const filteredInvoices = useMemo(() => {
    const q = searchTerm.toLowerCase();

    return invoices.filter((invoice: any) => {
      const haystack = [
        invoice.id,
        invoice.orderId,
        invoice.email,
        invoice.plan,
        invoice.server,
        invoice.inbound,
        invoice.status,
        invoice.orderStatus,
      ].join(' ').toLowerCase();

      const matchesSearch = haystack.includes(q);
      const matchesStatus = statusFilter === 'all' || invoice.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [invoices, searchTerm, statusFilter]);

  const stats = useMemo(() => {
    const paid = invoices.filter((invoice: any) => invoice.status === 'paid');
    const pending = invoices.filter((invoice: any) => invoice.status === 'pending');
    const cancelled = invoices.filter((invoice: any) => invoice.status === 'cancelled');

    return {
      total: invoices.length,
      paidCount: paid.length,
      pendingCount: pending.length,
      cancelledCount: cancelled.length,
      paidAmount: paid.reduce((sum: number, invoice: any) => sum + toNumber(invoice.amount), 0),
      pendingAmount: pending.reduce((sum: number, invoice: any) => sum + toNumber(invoice.amount), 0),
      cancelledAmount: cancelled.reduce((sum: number, invoice: any) => sum + toNumber(invoice.amount), 0),
    };
  }, [invoices]);

  return (
    <DashboardLayout title="فاکتورها">
      <div className="space-y-6">
        <div className="rounded-2xl border border-slate-200 bg-gradient-to-l from-sky-50 via-white to-emerald-50 p-5 shadow-sm dark:border-slate-700 dark:from-slate-900 dark:via-slate-900 dark:to-emerald-950/40">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">
                فاکتورهای من
              </h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                فاکتورهای ساخته‌شده بر اساس سفارش‌های واقعی حساب شما
              </p>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button variant="outline" leftIcon={<RefreshCw className="h-4 w-4" />} onClick={reload}>
                بروزرسانی
              </Button>

              <Button
                variant="outline"
                leftIcon={<Download className="h-4 w-4" />}
                disabled={!filteredInvoices.length}
                onClick={() => downloadCsv(filteredInvoices)}
              >
                خروجی CSV
              </Button>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            <StatBox icon={<FileText className="h-5 w-5" />} label="کل فاکتورها" value={String(stats.total)} tone="sky" />
            <StatBox icon={<CheckCircle2 className="h-5 w-5" />} label="پرداخت‌شده" value={formatPrice(stats.paidAmount)} tone="emerald" />
            <StatBox icon={<Clock className="h-5 w-5" />} label="در انتظار" value={formatPrice(stats.pendingAmount)} tone="amber" />
            <StatBox icon={<XCircle className="h-5 w-5" />} label="لغوشده" value={formatPrice(stats.cancelledAmount)} tone="rose" />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <MiniInfo label="تعداد پرداخت‌شده" value={`${stats.paidCount} فاکتور`} />
          <MiniInfo label="تعداد در انتظار" value={`${stats.pendingCount} فاکتور`} />
          <MiniInfo label="نتیجه فیلتر فعلی" value={`${filteredInvoices.length} فاکتور`} />
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Filter className="h-5 w-5 text-sky-600" />
              <CardTitle>فیلترها</CardTitle>
            </div>
          </CardHeader>

          <CardContent>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
              <div className="relative lg:col-span-3">
                <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  placeholder="جستجو بر اساس شماره فاکتور، سفارش، ایمیل، پلن یا سرور..."
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
                <option value="paid">پرداخت‌شده</option>
                <option value="pending">در انتظار</option>
                <option value="cancelled">لغوشده</option>
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
            ) : !filteredInvoices.length ? (
              <div className="p-6">
                <EmptyState text="فاکتوری با این فیلترها پیدا نشد." />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1120px]">
                  <thead className="bg-slate-50 dark:bg-slate-800/70">
                    <tr>
                      {['شماره فاکتور', 'شناسه سفارش', 'کاربر', 'شرح', 'مبلغ', 'تاریخ صدور', 'سررسید', 'پرداخت', 'وضعیت', 'عملیات'].map((head) => (
                        <th key={head} className="px-4 py-3 text-right text-xs font-medium text-slate-500 dark:text-slate-400">
                          {head}
                        </th>
                      ))}
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                    {filteredInvoices.map((invoice: any) => (
                      <tr key={invoice.id} className="hover:bg-sky-50/50 dark:hover:bg-slate-800/70">
                        <td className="px-4 py-4 font-mono text-sm font-medium text-slate-700 dark:text-slate-200">
                          {invoice.id}
                        </td>

                        <td className="px-4 py-4">
                          <div className="font-mono text-xs text-slate-600 dark:text-slate-300">
                            {invoice.orderShortId}
                          </div>
                          <div className="mt-1 max-w-[140px] truncate font-mono text-[11px] text-slate-400">
                            {invoice.orderId}
                          </div>
                        </td>

                        <td className="px-4 py-4 text-sm text-slate-700 dark:text-slate-200">
                          {invoice.email}
                        </td>

                        <td className="px-4 py-4">
                          <div className="text-sm text-slate-700 dark:text-slate-200">
                            {orderTypeLabel(invoice.type)} - {invoice.plan}
                          </div>
                          <div className="mt-1 text-xs text-slate-500">
                            {invoice.trafficGB}GB / {invoice.durationDays} روز
                          </div>
                        </td>

                        <td className="px-4 py-4 text-sm font-bold text-slate-800 dark:text-slate-100">
                          {formatPrice(invoice.amount)}
                        </td>

                        <td className="px-4 py-4 text-sm text-slate-600 dark:text-slate-300">
                          {invoice.createdAt ? formatDateTime(invoice.createdAt) : '-'}
                        </td>

                        <td className="px-4 py-4 text-sm text-slate-600 dark:text-slate-300">
                          {invoice.dueDate ? formatDateTime(invoice.dueDate) : '-'}
                        </td>

                        <td className="px-4 py-4 text-sm text-slate-600 dark:text-slate-300">
                          {invoice.paidAt ? formatDateTime(invoice.paidAt) : '-'}
                        </td>

                        <td className="px-4 py-4">
                          <StatusBadge status={invoice.status} />
                        </td>

                        <td className="px-4 py-4">
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="sm" onClick={() => setSelectedInvoice(invoice)}>
                              <Eye className="h-4 w-4 text-sky-600" />
                            </Button>

                            <Button variant="ghost" size="sm" onClick={() => downloadSingleInvoice(invoice)}>
                              <Download className="h-4 w-4 text-emerald-600" />
                            </Button>
                          </div>
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
          isOpen={!!selectedInvoice}
          onClose={() => setSelectedInvoice(null)}
          title="جزئیات فاکتور"
          size="lg"
        >
          {selectedInvoice && (
            <div className="space-y-5">
              <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-800">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-mono text-sm text-slate-500">
                      {selectedInvoice.id}
                    </p>
                    <p className="mt-1 text-lg font-bold text-slate-800 dark:text-slate-100">
                      {orderTypeLabel(selectedInvoice.type)} - {selectedInvoice.plan}
                    </p>
                  </div>

                  <StatusBadge status={selectedInvoice.status} />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <DetailBox label="شماره فاکتور" value={selectedInvoice.id} />
                <DetailBox label="شناسه سفارش" value={selectedInvoice.orderId} />
                <DetailBox label="ایمیل" value={selectedInvoice.email} />
                <DetailBox label="نوع سفارش" value={orderTypeLabel(selectedInvoice.type)} />
                <DetailBox label="پلن" value={selectedInvoice.plan} />
                <DetailBox label="سرور" value={selectedInvoice.server} />
                <DetailBox label="اینباند" value={selectedInvoice.inbound} />
                <DetailBox label="ترافیک" value={`${selectedInvoice.trafficGB} GB`} />
                <DetailBox label="مدت" value={`${selectedInvoice.durationDays} روز`} />
                <DetailBox label="مبلغ" value={formatPrice(selectedInvoice.amount)} />
                <DetailBox label="تاریخ صدور" value={selectedInvoice.createdAt ? formatDateTime(selectedInvoice.createdAt) : '-'} />
                <DetailBox label="سررسید" value={selectedInvoice.dueDate ? formatDateTime(selectedInvoice.dueDate) : '-'} />
                <DetailBox label="تاریخ پرداخت" value={selectedInvoice.paidAt ? formatDateTime(selectedInvoice.paidAt) : '-'} />
                <DetailBox label="وضعیت" value={invoiceStatusLabel(selectedInvoice.status)} />
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
                <Button variant="outline" onClick={() => downloadSingleInvoice(selectedInvoice)}>
                  <Download className="ml-2 h-4 w-4" />
                  دانلود فاکتور
                </Button>

                <Button variant="outline" onClick={() => setSelectedInvoice(null)}>
                  بستن
                </Button>
              </div>
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
  tone: 'sky' | 'emerald' | 'amber' | 'rose';
}) {
  const tones = {
    sky: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
    emerald: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
    amber: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    rose: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
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
