import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  CheckCircle2,
  Clock,
  Eye,
  FileImage,
  RefreshCw,
  Search,
  Wallet,
  XCircle,
} from 'lucide-react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { EmptyState, ErrorState, LoadingState } from '../../components/RemoteState';
import { backend } from '../../services/backend';
import { formatDateTime, formatPrice } from '../../lib/utils';
import type { WalletTopupInvoice } from '../../types';

const statusLabels: Record<string, string> = {
  unpaid: 'پرداخت‌نشده',
  under_review: 'در انتظار بررسی',
  approved: 'تأییدشده',
  rejected: 'ردشده',
  cancelled: 'لغوشده',
};

const statusClasses: Record<string, string> = {
  unpaid:
    'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-200',
  under_review:
    'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  approved:
    'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  rejected:
    'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
  cancelled:
    'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-300',
};

const paymentLabels: Record<string, string> = {
  card_to_card: 'کارت به کارت',
  paya_satna: 'پایا / ساتنا',
  account_deposit: 'واریز به حساب',
};

export default function WalletTopupsPage() {
  const queryClient = useQueryClient();

  const [statusFilter, setStatusFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selected, setSelected] =
    useState<WalletTopupInvoice | null>(null);

  const [approvedAmount, setApprovedAmount] = useState('');
  const [adminNote, setAdminNote] = useState('');

  const topupsQuery = useQuery({
    queryKey: ['admin-wallet-topups', statusFilter],
    queryFn: () =>
      backend.walletTopups.adminList(
        statusFilter === 'all' ? undefined : statusFilter,
      ),
  });

  const approveMutation = useMutation({
    mutationFn: (input: {
      id: string;
      approvedAmount: number;
      adminNote?: string;
    }) =>
      backend.walletTopups.approve(input.id, {
        approvedAmount: input.approvedAmount,
        adminNote: input.adminNote,
      }),

    onSuccess: () => {
      toast.success('پرداخت تأیید و کیف پول شارژ شد');
      setSelected(null);
      setApprovedAmount('');
      setAdminNote('');

      queryClient.invalidateQueries({
        queryKey: ['admin-wallet-topups'],
      });
      queryClient.invalidateQueries({
        queryKey: ['wallet'],
      });
    },

    onError: (error: Error) => {
      toast.error(error.message || 'خطا در تأیید پرداخت');
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (input: {
      id: string;
      adminNote: string;
    }) =>
      backend.walletTopups.reject(input.id, {
        adminNote: input.adminNote,
      }),

    onSuccess: () => {
      toast.success('رسید رد شد');
      setSelected(null);
      setAdminNote('');

      queryClient.invalidateQueries({
        queryKey: ['admin-wallet-topups'],
      });
    },

    onError: (error: Error) => {
      toast.error(error.message || 'خطا در رد پرداخت');
    },
  });

  const filteredTopups = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();

    return (topupsQuery.data || []).filter((invoice) => {
      if (!q) return true;

      return [
        invoice.invoiceNumber,
        invoice.companyName,
        invoice.username,
        invoice.email,
        invoice.phone,
        invoice.telegramId,
        invoice.trackingCode,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [topupsQuery.data, searchTerm]);

  const stats = useMemo(() => {
    const list = topupsQuery.data || [];

    return {
      total: list.length,
      waiting: list.filter(
        (invoice) => invoice.status === 'under_review',
      ).length,
      approved: list.filter(
        (invoice) => invoice.status === 'approved',
      ).length,
      rejected: list.filter(
        (invoice) => invoice.status === 'rejected',
      ).length,
    };
  }, [topupsQuery.data]);

  function openInvoice(invoice: WalletTopupInvoice) {
    setSelected(invoice);
    setApprovedAmount(
      String(
        invoice.receiptAmount ||
        invoice.requestedAmount ||
        '',
      ),
    );
    setAdminNote(invoice.adminNote || '');
  }

  function approveSelected() {
    if (!selected) return;

    const amount = Number(approvedAmount);

    if (!Number.isInteger(amount) || amount <= 0) {
      toast.error('مبلغ تأییدشده معتبر نیست');
      return;
    }

    if (
      !window.confirm(
        `مبلغ ${formatPrice(amount)} به کیف پول مشتری اضافه شود؟`,
      )
    ) {
      return;
    }

    approveMutation.mutate({
      id: selected.id,
      approvedAmount: amount,
      adminNote: adminNote.trim() || undefined,
    });
  }

  function rejectSelected() {
    if (!selected) return;

    if (adminNote.trim().length < 3) {
      toast.error('دلیل رد پرداخت را وارد کنید');
      return;
    }

    if (!window.confirm('این رسید رد شود؟')) {
      return;
    }

    rejectMutation.mutate({
      id: selected.id,
      adminNote: adminNote.trim(),
    });
  }

  if (topupsQuery.isLoading) {
    return (
      <DashboardLayout title="درخواست‌های شارژ">
        <LoadingState />
      </DashboardLayout>
    );
  }

  if (topupsQuery.error) {
    return (
      <DashboardLayout title="درخواست‌های شارژ">
        <ErrorState
          message={
            topupsQuery.error instanceof Error
              ? topupsQuery.error.message
              : 'خطا در دریافت درخواست‌های شارژ'
          }
          onRetry={() => topupsQuery.refetch()}
        />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="درخواست‌های شارژ">
      <div className="space-y-6">
        <div className="rounded-2xl border border-slate-200 bg-gradient-to-l from-sky-50 via-white to-emerald-50 p-5 dark:border-slate-700 dark:from-slate-900 dark:via-slate-900 dark:to-emerald-950/30">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">
                درخواست‌های شارژ کیف پول
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                بررسی فاکتور، رسید بانکی و تأیید مبلغ نهایی
              </p>
            </div>

            <Button
              variant="outline"
              leftIcon={<RefreshCw className="h-4 w-4" />}
              onClick={() => topupsQuery.refetch()}
            >
              بروزرسانی
            </Button>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatBox
              label="کل درخواست‌ها"
              value={stats.total}
              tone="sky"
            />
            <StatBox
              label="در انتظار بررسی"
              value={stats.waiting}
              tone="amber"
            />
            <StatBox
              label="تأییدشده"
              value={stats.approved}
              tone="emerald"
            />
            <StatBox
              label="ردشده"
              value={stats.rejected}
              tone="rose"
            />
          </div>
        </div>

        <Card>
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
              <div className="relative lg:col-span-3">
                <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

                <Input
                  value={searchTerm}
                  onChange={(event) =>
                    setSearchTerm(event.target.value)
                  }
                  placeholder="شماره فاکتور، مشتری، ایمیل، تلگرام یا کد پیگیری..."
                  className="pr-10"
                />
              </div>

              <select
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(event.target.value)
                }
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-900"
              >
                <option value="all">همه وضعیت‌ها</option>
                <option value="unpaid">پرداخت‌نشده</option>
                <option value="under_review">
                  در انتظار بررسی
                </option>
                <option value="approved">تأییدشده</option>
                <option value="rejected">ردشده</option>
              </select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>فاکتورها و رسیدهای دریافتی</CardTitle>
          </CardHeader>

          <CardContent className="p-0">
            {!filteredTopups.length ? (
              <div className="p-6">
                <EmptyState text="درخواستی یافت نشد." />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1150px]">
                  <thead className="bg-slate-50 dark:bg-slate-800/70">
                    <tr>
                      {[
                        'فاکتور',
                        'مشتری',
                        'مبلغ درخواستی',
                        'مبلغ رسید',
                        'کد پیگیری',
                        'زمان ثبت',
                        'وضعیت',
                        'عملیات',
                      ].map((title) => (
                        <th
                          key={title}
                          className="px-4 py-3 text-right text-xs font-medium text-slate-500"
                        >
                          {title}
                        </th>
                      ))}
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                    {filteredTopups.map((invoice) => (
                      <tr
                        key={invoice.id}
                        className="hover:bg-sky-50/50 dark:hover:bg-slate-800/70"
                      >
                        <td
                          className="px-4 py-4 font-mono text-sm"
                          dir="ltr"
                        >
                          {invoice.invoiceNumber}
                        </td>

                        <td className="px-4 py-4">
                          <p className="font-medium text-slate-800 dark:text-slate-100">
                            {invoice.companyName ||
                              invoice.username ||
                              '-'}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {invoice.email || '-'}
                          </p>
                        </td>

                        <td className="px-4 py-4 text-sm font-bold">
                          {formatPrice(invoice.requestedAmount)}
                        </td>

                        <td className="px-4 py-4 text-sm">
                          {invoice.receiptAmount
                            ? formatPrice(invoice.receiptAmount)
                            : '-'}
                        </td>

                        <td
                          className="px-4 py-4 font-mono text-sm"
                          dir="ltr"
                        >
                          {invoice.trackingCode || '-'}
                        </td>

                        <td className="px-4 py-4 text-sm text-slate-500">
                          {formatDateTime(invoice.createdAt)}
                        </td>

                        <td className="px-4 py-4">
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-medium ${
                              statusClasses[invoice.status] ||
                              statusClasses.unpaid
                            }`}
                          >
                            {statusLabels[invoice.status] ||
                              invoice.status}
                          </span>
                        </td>

                        <td className="px-4 py-4">
                          <Button
                            size="sm"
                            variant="outline"
                            leftIcon={<Eye className="h-4 w-4" />}
                            onClick={() => openInvoice(invoice)}
                          >
                            بررسی
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

        {selected && (
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle>جزئیات درخواست شارژ</CardTitle>
                  <p
                    className="mt-1 font-mono text-xs text-slate-500"
                    dir="ltr"
                  >
                    {selected.invoiceNumber}
                  </p>
                </div>

                <Button
                  variant="outline"
                  onClick={() => setSelected(null)}
                >
                  بستن
                </Button>
              </div>
            </CardHeader>

            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                <Info
                  label="مشتری"
                  value={
                    selected.companyName ||
                    selected.username ||
                    '-'
                  }
                />
                <Info
                  label="ایمیل"
                  value={selected.email || '-'}
                />
                <Info
                  label="شماره تماس"
                  value={selected.phone || '-'}
                />
                <Info
                  label="تلگرام"
                  value={selected.telegramId || '-'}
                />
                <Info
                  label="مبلغ درخواستی"
                  value={formatPrice(selected.requestedAmount)}
                />
                <Info
                  label="مبلغ اعلام‌شده در رسید"
                  value={
                    selected.receiptAmount
                      ? formatPrice(selected.receiptAmount)
                      : '-'
                  }
                />
                <Info
                  label="روش پرداخت"
                  value={
                    paymentLabels[selected.paymentType || ''] ||
                    selected.paymentType ||
                    '-'
                  }
                />
                <Info
                  label="کد پیگیری"
                  value={selected.trackingCode || '-'}
                />
                <Info
                  label="تاریخ پرداخت"
                  value={selected.paymentDate || '-'}
                />
                <Info
                  label="بانک مقصد"
                  value={selected.bankName || '-'}
                />
                <Info
                  label="صاحب حساب"
                  value={selected.ownerName || '-'}
                />
                <Info
                  label="زمان ارسال رسید"
                  value={
                    selected.receiptCreatedAt
                      ? formatDateTime(selected.receiptCreatedAt)
                      : '-'
                  }
                />
              </div>

              {selected.receiptDescription && (
                <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-800">
                  <p className="text-xs text-slate-500">
                    توضیحات مشتری
                  </p>
                  <p className="mt-2 text-sm leading-7">
                    {selected.receiptDescription}
                  </p>
                </div>
              )}

              {selected.receiptId && (
                <a
                  href={backend.walletTopups.receiptUrl(
                    selected.id,
                  )}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-medium text-sky-700 transition hover:bg-sky-100 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-300"
                >
                  <FileImage className="h-5 w-5" />
                  مشاهده تصویر یا PDF رسید
                </a>
              )}

              {selected.status === 'under_review' && (
                <div className="space-y-4 rounded-2xl border border-amber-200 bg-amber-50 p-5 dark:border-amber-900 dark:bg-amber-950/20">
                  <div>
                    <label className="mb-2 block text-sm font-medium">
                      مبلغ نهایی برای شارژ کیف پول
                    </label>

                    <Input
                      type="number"
                      min={1}
                      value={approvedAmount}
                      onChange={(event) =>
                        setApprovedAmount(event.target.value)
                      }
                    />

                    {approvedAmount &&
                      Number(approvedAmount) > 0 && (
                        <p className="mt-2 text-sm font-bold text-emerald-600">
                          {formatPrice(Number(approvedAmount))}
                        </p>
                      )}
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium">
                      یادداشت مدیر / دلیل رد
                    </label>

                    <textarea
                      value={adminNote}
                      onChange={(event) =>
                        setAdminNote(event.target.value)
                      }
                      rows={3}
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                      placeholder="برای تأیید اختیاری و برای رد الزامی است"
                    />
                  </div>

                  <div className="flex flex-wrap justify-end gap-2">
                    <Button
                      variant="outline"
                      disabled={
                        rejectMutation.isPending ||
                        approveMutation.isPending
                      }
                      leftIcon={<XCircle className="h-4 w-4" />}
                      onClick={rejectSelected}
                    >
                      رد پرداخت
                    </Button>

                    <Button
                      disabled={
                        approveMutation.isPending ||
                        rejectMutation.isPending
                      }
                      leftIcon={
                        <CheckCircle2 className="h-4 w-4" />
                      }
                      onClick={approveSelected}
                    >
                      {approveMutation.isPending
                        ? 'در حال تأیید...'
                        : 'تأیید و شارژ کیف پول'}
                    </Button>
                  </div>
                </div>
              )}

              {selected.status === 'approved' && (
                <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-950/30">
                  <Wallet className="h-5 w-5 text-emerald-600" />
                  <div>
                    <p className="font-bold text-emerald-700">
                      این پرداخت تأیید و کیف پول شارژ شده است
                    </p>
                    <p className="mt-1 text-sm">
                      مبلغ تأییدشده:{' '}
                      {formatPrice(
                        Number(selected.approvedAmount || 0),
                      )}
                    </p>
                  </div>
                </div>
              )}

              {selected.status === 'rejected' && (
                <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 dark:border-rose-900 dark:bg-rose-950/30">
                  <XCircle className="h-5 w-5 text-rose-600" />
                  <div>
                    <p className="font-bold text-rose-700">
                      این پرداخت رد شده است
                    </p>
                    <p className="mt-1 text-sm">
                      {selected.adminNote || '-'}
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}

function StatBox({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'sky' | 'amber' | 'emerald' | 'rose';
}) {
  const classes = {
    sky: 'bg-sky-50 text-sky-700 dark:bg-sky-950/30 dark:text-sky-300',
    amber:
      'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300',
    emerald:
      'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300',
    rose: 'bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300',
  };

  return (
    <div className={`rounded-2xl p-4 ${classes[tone]}`}>
      <p className="text-xs">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </div>
  );
}

function Info({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 break-all text-sm font-medium">
        {value}
      </p>
    </div>
  );
}
