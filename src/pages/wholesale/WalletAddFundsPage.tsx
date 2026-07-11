import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  ArrowRight,
  CreditCard,
  MessageCircle,
  ShieldCheck,
  Wallet,
} from 'lucide-react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { backend } from '../../services/backend';
import { formatPrice } from '../../lib/utils';

const quickAmounts = [
  500_000,
  1_000_000,
  2_000_000,
  5_000_000,
  10_000_000,
];

export default function WalletAddFundsPage() {
  const navigate = useNavigate();
  const [amount, setAmount] = useState('');
  const [telegramId, setTelegramId] = useState('');
  const [telegramInitialized, setTelegramInitialized] =
    useState(false);

  const walletQuery = useQuery({
    queryKey: ['wallet'],
    queryFn: backend.wallet.current,
  });

  useEffect(() => {
    if (telegramInitialized || !walletQuery.data) return;

    setTelegramId(walletQuery.data.telegramId || '');
    setTelegramInitialized(true);
  }, [telegramInitialized, walletQuery.data]);

  const mutation = useMutation({
    mutationFn: backend.walletTopups.create,
    onSuccess: (invoice) => {
      toast.success('فاکتور شارژ ایجاد شد');
      navigate(`/dashboard/wallet/invoices/${invoice.id}`);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'خطا در ایجاد فاکتور');
    },
  });

  function submit(event: FormEvent) {
    event.preventDefault();

    const numericAmount = Number(amount);

    if (!Number.isInteger(numericAmount) || numericAmount < 10_000) {
      toast.error('مبلغ باید حداقل ۱۰ هزار تومان باشد');
      return;
    }

    if (telegramId.trim().length < 2) {
      toast.error('آیدی تلگرام را وارد کنید');
      return;
    }

    mutation.mutate({
      amount: numericAmount,
      telegramId: telegramId.trim(),
    });
  }

  return (
    <DashboardLayout title="افزایش موجودی">
      <div className="mx-auto max-w-4xl space-y-6">
        <button
          type="button"
          onClick={() => navigate('/dashboard/wallet')}
          className="inline-flex items-center gap-2 text-sm text-slate-500 transition hover:text-sky-600 dark:text-slate-400"
        >
          <ArrowRight className="h-4 w-4" />
          بازگشت به کیف پول
        </button>

        <div className="rounded-3xl border border-sky-200 bg-gradient-to-l from-sky-600 via-indigo-600 to-violet-600 p-6 text-white shadow-lg dark:border-sky-900">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm text-sky-100">موجودی فعلی</p>
              <h1 className="mt-2 text-3xl font-bold">
                {walletQuery.data
                  ? formatPrice(Number(walletQuery.data.balance || 0))
                  : 'در حال دریافت...'}
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-7 text-sky-100">
                مبلغ موردنظر را وارد کنید. پس از ثبت، فاکتور و اطلاعات
                حساب بانکی برای شما نمایش داده می‌شود.
              </p>
            </div>

            <div className="rounded-2xl bg-white/15 p-4 ring-1 ring-white/25">
              <Wallet className="h-12 w-12" />
            </div>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>ساخت فاکتور شارژ کیف پول</CardTitle>
          </CardHeader>

          <CardContent>
            <form onSubmit={submit} className="space-y-6">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200">
                  مبلغ شارژ به تومان
                </label>

                <Input
                  type="number"
                  min={10000}
                  step={10000}
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  placeholder="مثلاً ۱۰۰۰۰۰۰"
                  required
                />

                {amount && Number(amount) > 0 && (
                  <p className="mt-2 text-sm font-medium text-emerald-600 dark:text-emerald-300">
                    {formatPrice(Number(amount))}
                  </p>
                )}

                <div className="mt-3 flex flex-wrap gap-2">
                  {quickAmounts.map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => setAmount(String(item))}
                      className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 transition hover:border-sky-400 hover:text-sky-600 dark:border-slate-700 dark:text-slate-300"
                    >
                      {formatPrice(item)}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
                  <MessageCircle className="h-4 w-4 text-sky-500" />
                  آیدی تلگرام
                </label>

                <Input
                  value={telegramId}
                  onChange={(event) => setTelegramId(event.target.value)}
                  placeholder="@username یا شناسه عددی"
                  dir="ltr"
                  required
                />

                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  این شناسه برای پیگیری پرداخت و اطلاع‌رسانی فاکتور ثبت می‌شود.
                </p>
              </div>

              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-950/30">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                  <p className="text-sm leading-7 text-emerald-800 dark:text-emerald-200">
                    کیف پول تنها پس از بررسی رسید و تأیید نهایی مدیر شارژ می‌شود.
                    ساخت فاکتور به‌تنهایی موجودی را تغییر نمی‌دهد.
                  </p>
                </div>
              </div>

              <div className="flex justify-end">
                <Button
                  type="submit"
                  disabled={mutation.isPending}
                  leftIcon={<CreditCard className="h-4 w-4" />}
                >
                  {mutation.isPending
                    ? 'در حال ساخت فاکتور...'
                    : 'ادامه و مشاهده اطلاعات پرداخت'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
