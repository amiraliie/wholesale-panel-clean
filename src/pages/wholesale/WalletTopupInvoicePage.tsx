import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  ArrowRight,
  Building2,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  FileImage,
  Printer,
  Receipt,
  Send,
  Upload,
  XCircle,
} from 'lucide-react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { ErrorState, LoadingState } from '../../components/RemoteState';
import { backend } from '../../services/backend';
import { formatDateTime, formatPrice } from '../../lib/utils';

const statusLabels: Record<string, string> = {
  unpaid: 'پرداخت‌نشده',
  under_review: 'در انتظار بررسی',
  approved: 'تأیید و شارژ شده',
  rejected: 'رد شده',
  cancelled: 'لغو شده',
};

const paymentTypeLabels: Record<string, string> = {
  card_to_card: 'کارت به کارت',
  paya_satna: 'حواله پایا / ساتنا',
  account_deposit: 'واریز به حساب',
};

export default function WalletTopupInvoicePage() {
  const { invoiceId = '' } = useParams();
  const queryClient = useQueryClient();

  const [copied, setCopied] = useState('');
  const [bankAccountId, setBankAccountId] = useState('');
  const [amount, setAmount] = useState('');
  const [paymentType, setPaymentType] = useState('card_to_card');
  const [trackingCode, setTrackingCode] = useState('');
  const [paymentDate, setPaymentDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [description, setDescription] = useState('');
  const [receiptFile, setReceiptFile] = useState<File | null>(null);

  const invoiceQuery = useQuery({
    queryKey: ['wallet-topup', invoiceId],
    queryFn: () => backend.walletTopups.get(invoiceId),
    enabled: Boolean(invoiceId),
  });

  const banksQuery = useQuery({
    queryKey: ['bank-accounts'],
    queryFn: backend.bankAccounts.list,
  });

  useEffect(() => {
    if (invoiceQuery.data && !amount) {
      setAmount(String(invoiceQuery.data.requestedAmount));
    }
  }, [invoiceQuery.data, amount]);

  useEffect(() => {
    const firstBank = banksQuery.data?.[0];

    if (firstBank && !bankAccountId) {
      setBankAccountId(firstBank.id);
    }
  }, [banksQuery.data, bankAccountId]);

  const submitMutation = useMutation({
    mutationFn: (formData: FormData) =>
      backend.walletTopups.submitReceipt(invoiceId, formData),

    onSuccess: () => {
      toast.success('رسید ثبت شد و در انتظار بررسی است');
      queryClient.invalidateQueries({
        queryKey: ['wallet-topup', invoiceId],
      });
      queryClient.invalidateQueries({
        queryKey: ['wallet-topups'],
      });
    },

    onError: (error: Error) => {
      toast.error(error.message || 'خطا در ثبت رسید');
    },
  });

  function copyValue(value: string, key: string) {
    navigator.clipboard.writeText(value);
    setCopied(key);
    toast.success('کپی شد');

    window.setTimeout(() => {
      setCopied('');
    }, 1500);
  }

  function submitReceipt(event: FormEvent) {
    event.preventDefault();

    if (!bankAccountId) {
      toast.error('حساب بانکی مقصد را انتخاب کنید');
      return;
    }

    if (!receiptFile) {
      toast.error('تصویر یا فایل رسید را انتخاب کنید');
      return;
    }

    const numericAmount = Number(amount);

    if (!Number.isInteger(numericAmount) || numericAmount <= 0) {
      toast.error('مبلغ پرداختی معتبر نیست');
      return;
    }

    const data = new FormData();
    data.append('bankAccountId', bankAccountId);
    data.append('amount', String(numericAmount));
    data.append('paymentType', paymentType);
    data.append('trackingCode', trackingCode.trim());
    data.append('paymentDate', paymentDate);
    data.append('description', description.trim());
    data.append('receipt', receiptFile);

    submitMutation.mutate(data);
  }

  if (invoiceQuery.isLoading || banksQuery.isLoading) {
    return (
      <DashboardLayout title="فاکتور شارژ">
        <LoadingState />
      </DashboardLayout>
    );
  }

  if (invoiceQuery.error || !invoiceQuery.data) {
    return (
      <DashboardLayout title="فاکتور شارژ">
        <ErrorState
          message={
            invoiceQuery.error instanceof Error
              ? invoiceQuery.error.message
              : 'فاکتور یافت نشد'
          }
          onRetry={() => invoiceQuery.refetch()}
        />
      </DashboardLayout>
    );
  }

  const invoice = invoiceQuery.data;
  const banks = banksQuery.data || [];
  const selectedBank = banks.find(
    (bank) => bank.id === bankAccountId,
  );

  const canSubmit =
    invoice.status === 'unpaid' ||
    invoice.status === 'rejected';

  return (
    <DashboardLayout title="فاکتور شارژ">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
          <Link
            to="/dashboard/wallet"
            className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-sky-600"
          >
            <ArrowRight className="h-4 w-4" />
            بازگشت به کیف پول
          </Link>

          <Button
            variant="outline"
            leftIcon={<Printer className="h-4 w-4" />}
            onClick={() => window.print()}
          >
            چاپ فاکتور
          </Button>
        </div>

        <Card className="overflow-hidden">
          <div className="bg-gradient-to-l from-sky-600 via-indigo-600 to-violet-600 p-6 text-white">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm text-sky-100">شماره فاکتور</p>
                <h1 className="mt-1 text-2xl font-bold" dir="ltr">
                  {invoice.invoiceNumber}
                </h1>
              </div>

              <div className="rounded-full bg-white/15 px-4 py-2 text-sm font-medium ring-1 ring-white/25">
                {statusLabels[invoice.status] || invoice.status}
              </div>
            </div>
          </div>

          <CardContent className="space-y-7 p-6">
            <div className="grid grid-cols-1 gap-5 border-b border-slate-200 pb-6 dark:border-slate-700 md:grid-cols-2">
              <div>
                <p className="text-xs text-slate-500">مشتری</p>
                <p className="mt-1 font-bold text-slate-800 dark:text-slate-100">
                  {invoice.companyName || invoice.username || '-'}
                </p>
                <p className="mt-2 text-sm text-slate-500">
                  {invoice.email || '-'}
                </p>
                <p className="mt-1 text-sm text-slate-500" dir="ltr">
                  Telegram: {invoice.telegramId}
                </p>
              </div>

              <div className="md:text-left">
                <p className="text-xs text-slate-500">تاریخ صدور</p>
                <p className="mt-1 text-sm font-medium text-slate-700 dark:text-slate-200">
                  {formatDateTime(invoice.createdAt)}
                </p>
              </div>
            </div>

            <div className="rounded-2xl bg-slate-50 p-5 dark:bg-slate-800/70">
              <div className="flex items-center justify-between gap-4">
                <span className="font-medium text-slate-600 dark:text-slate-300">
                  شارژ کیف پول
                </span>
                <span className="text-xl font-bold text-emerald-600 dark:text-emerald-300">
                  {formatPrice(invoice.requestedAmount)}
                </span>
              </div>
            </div>

            {invoice.status === 'approved' && (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 dark:border-emerald-900 dark:bg-emerald-950/30">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="h-6 w-6 text-emerald-600" />
                  <div>
                    <p className="font-bold text-emerald-800 dark:text-emerald-200">
                      پرداخت تأیید و کیف پول شارژ شد
                    </p>
                    <p className="mt-1 text-sm text-emerald-700 dark:text-emerald-300">
                      مبلغ تأییدشده: {formatPrice(Number(invoice.approvedAmount || 0))}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {invoice.status === 'under_review' && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 dark:border-amber-900 dark:bg-amber-950/30">
                <div className="flex items-start gap-3">
                  <Clock className="h-6 w-6 text-amber-600" />
                  <div>
                    <p className="font-bold text-amber-800 dark:text-amber-200">
                      رسید شما در انتظار بررسی مدیر است
                    </p>
                    <p className="mt-1 text-sm text-amber-700 dark:text-amber-300">
                      تا زمان تأیید مدیر موجودی کیف پول تغییر نمی‌کند.
                    </p>

                    {invoice.receiptId && (
                      <a
                        href={backend.walletTopups.receiptUrl(invoice.id)}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-amber-700 underline"
                      >
                        <FileImage className="h-4 w-4" />
                        مشاهده رسید ثبت‌شده
                      </a>
                    )}
                  </div>
                </div>
              </div>
            )}

            {invoice.status === 'rejected' && (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 dark:border-rose-900 dark:bg-rose-950/30">
                <div className="flex items-start gap-3">
                  <XCircle className="h-6 w-6 text-rose-600" />
                  <div>
                    <p className="font-bold text-rose-800 dark:text-rose-200">
                      رسید توسط مدیر رد شده است
                    </p>
                    <p className="mt-1 text-sm text-rose-700 dark:text-rose-300">
                      {invoice.adminNote || 'لطفاً اطلاعات پرداخت را اصلاح و دوباره ارسال کنید.'}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {canSubmit && (
          <>
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-sky-600" />
                  <CardTitle>حساب‌های بانکی جهت واریز</CardTitle>
                </div>
              </CardHeader>

              <CardContent>
                {!banks.length ? (
                  <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-700">
                    هنوز حساب بانکی فعالی توسط مدیر ثبت نشده است.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    {banks.map((bank) => (
                      <button
                        key={bank.id}
                        type="button"
                        onClick={() => setBankAccountId(bank.id)}
                        className={`rounded-2xl border p-5 text-right transition ${
                          bankAccountId === bank.id
                            ? 'border-sky-500 bg-sky-50 ring-2 ring-sky-100 dark:bg-sky-950/30'
                            : 'border-slate-200 hover:border-sky-300 dark:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-800 dark:text-slate-100">
                            {bank.bankName}
                          </span>
                          {bankAccountId === bank.id && (
                            <CheckCircle2 className="h-5 w-5 text-sky-600" />
                          )}
                        </div>

                        <p className="mt-1 text-sm text-slate-500">
                          به نام {bank.ownerName}
                        </p>

                        {bank.cardNumber && (
                          <CopyRow
                            label="شماره کارت"
                            value={bank.cardNumber}
                            copied={copied === `card-${bank.id}`}
                            onCopy={() =>
                              copyValue(bank.cardNumber!, `card-${bank.id}`)
                            }
                          />
                        )}

                        {bank.accountNumber && (
                          <CopyRow
                            label="شماره حساب"
                            value={bank.accountNumber}
                            copied={copied === `account-${bank.id}`}
                            onCopy={() =>
                              copyValue(
                                bank.accountNumber!,
                                `account-${bank.id}`,
                              )
                            }
                          />
                        )}

                        {bank.iban && (
                          <CopyRow
                            label="شماره شبا"
                            value={bank.iban}
                            copied={copied === `iban-${bank.id}`}
                            onCopy={() =>
                              copyValue(bank.iban!, `iban-${bank.id}`)
                            }
                          />
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Upload className="h-5 w-5 text-emerald-600" />
                  <CardTitle>ثبت اطلاعات و رسید پرداخت</CardTitle>
                </div>
              </CardHeader>

              <CardContent>
                <form onSubmit={submitReceipt} className="space-y-5">
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div>
                      <label className="mb-2 block text-sm font-medium">
                        حساب مقصد
                      </label>
                      <select
                        value={bankAccountId}
                        onChange={(event) =>
                          setBankAccountId(event.target.value)
                        }
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-900"
                        required
                      >
                        <option value="">انتخاب حساب</option>
                        {banks.map((bank) => (
                          <option key={bank.id} value={bank.id}>
                            {bank.bankName} - {bank.ownerName}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-medium">
                        روش پرداخت
                      </label>
                      <select
                        value={paymentType}
                        onChange={(event) =>
                          setPaymentType(event.target.value)
                        }
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-900"
                      >
                        {Object.entries(paymentTypeLabels).map(
                          ([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ),
                        )}
                      </select>
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-medium">
                        مبلغ پرداختی
                      </label>
                      <Input
                        type="number"
                        value={amount}
                        onChange={(event) => setAmount(event.target.value)}
                        required
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-medium">
                        کد پیگیری / شماره ارجاع
                      </label>
                      <Input
                        value={trackingCode}
                        onChange={(event) =>
                          setTrackingCode(event.target.value)
                        }
                        placeholder="شماره پیگیری بانکی"
                        required
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-medium">
                        تاریخ پرداخت
                      </label>
                      <Input
                        type="date"
                        value={paymentDate}
                        onChange={(event) =>
                          setPaymentDate(event.target.value)
                        }
                        required
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-medium">
                        تصویر یا PDF رسید
                      </label>
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp,application/pdf"
                        onChange={(event) =>
                          setReceiptFile(event.target.files?.[0] || null)
                        }
                        className="w-full rounded-xl border border-slate-300 bg-white p-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium">
                      توضیحات اختیاری
                    </label>
                    <textarea
                      value={description}
                      onChange={(event) => setDescription(event.target.value)}
                      rows={3}
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                    />
                  </div>

                  {selectedBank && (
                    <p className="rounded-xl bg-sky-50 p-3 text-sm text-sky-700 dark:bg-sky-950/30 dark:text-sky-300">
                      حساب انتخاب‌شده: {selectedBank.bankName} به نام{' '}
                      {selectedBank.ownerName}
                    </p>
                  )}

                  <div className="flex justify-end">
                    <Button
                      type="submit"
                      disabled={submitMutation.isPending || !banks.length}
                      leftIcon={<Send className="h-4 w-4" />}
                    >
                      {submitMutation.isPending
                        ? 'در حال ارسال رسید...'
                        : 'ارسال رسید برای بررسی'}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}

function CopyRow({
  label,
  value,
  copied,
  onCopy,
}: {
  label: string;
  value: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-slate-100 px-3 py-2 text-xs dark:bg-slate-900">
      <div className="min-w-0">
        <span className="text-slate-500">{label}: </span>
        <span className="break-all font-mono text-slate-800 dark:text-slate-100">
          {value}
        </span>
      </div>

      <span
        role="button"
        tabIndex={0}
        onClick={(event) => {
          event.stopPropagation();
          onCopy();
        }}
        className="shrink-0 cursor-pointer text-sky-600"
      >
        {copied ? (
          <Check className="h-4 w-4 text-emerald-600" />
        ) : (
          <Copy className="h-4 w-4" />
        )}
      </span>
    </div>
  );
}
