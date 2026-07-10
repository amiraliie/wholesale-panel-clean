import { useMemo } from 'react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { StatusBadge } from '../../components/ui/Badge';
import { EmptyState, ErrorState, LoadingState } from '../../components/RemoteState';
import { useRemoteData } from '../../hooks/useRemoteData';
import { backend } from '../../services/backend';
import { formatDateTime, formatPrice } from '../../lib/utils';
import {
  AlertTriangle,
  ArrowDownCircle,
  ArrowUpCircle,
  Download,
  ExternalLink,
  RefreshCw,
  RotateCcw,
  TrendingDown,
  TrendingUp,
  Wallet,
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

function transactionTypeLabel(type: string) {
  const labels: Record<string, string> = {
    credit: 'شارژ',
    debit: 'برداشت',
    refund: 'برگشت',
    adjustment: 'اصلاحیه',
  };

  return labels[type] || type || '-';
}

function transactionTypeConfig(type: string) {
  const map: Record<string, { color: string; bg: string; sign: string; icon: typeof ArrowUpCircle }> = {
    credit: {
      color: 'text-emerald-600 dark:text-emerald-300',
      bg: 'bg-emerald-50 dark:bg-emerald-900/30',
      sign: '+',
      icon: ArrowUpCircle,
    },
    refund: {
      color: 'text-sky-600 dark:text-sky-300',
      bg: 'bg-sky-50 dark:bg-sky-900/30',
      sign: '+',
      icon: RotateCcw,
    },
    adjustment: {
      color: 'text-violet-600 dark:text-violet-300',
      bg: 'bg-violet-50 dark:bg-violet-900/30',
      sign: '',
      icon: TrendingUp,
    },
    debit: {
      color: 'text-rose-600 dark:text-rose-300',
      bg: 'bg-rose-50 dark:bg-rose-900/30',
      sign: '-',
      icon: ArrowDownCircle,
    },
  };

  return map[type] || map.debit;
}

function escapeCsv(value: any) {
  const text = String(value ?? '');
  return `"${text.replaceAll('"', '""')}"`;
}

function downloadTransactionsCsv(transactions: any[]) {
  const headers = [
    'id',
    'type',
    'amount',
    'balance_before',
    'balance_after',
    'description',
    'status',
    'created_at',
  ];

  const rows = transactions.map((tx: any) => [
    tx.id,
    getValue(tx, 'type', 'type', ''),
    getValue(tx, 'amount', 'amount', 0),
    getValue(tx, 'balanceBefore', 'balance_before', 0),
    getValue(tx, 'balanceAfter', 'balance_after', 0),
    getValue(tx, 'description', 'description', ''),
    getValue(tx, 'status', 'status', ''),
    getValue(tx, 'createdAt', 'created_at', ''),
  ]);

  const csv = [
    headers.map(escapeCsv).join(','),
    ...rows.map((row) => row.map(escapeCsv).join(',')),
  ].join('\n');

  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = `wallet-transactions-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export default function WalletPage() {
  const {
    data,
    isLoading,
    error,
    reload,
  } = useRemoteData(async () => ({
    wallet: await backend.wallet.current(),
    transactions: await backend.wallet.transactions(),
  }), []);

  const walletData = useMemo(() => {
    if (!data) return null;

    const wallet = data.wallet || {};
    const transactions = data.transactions || [];
    const balance = toNumber(getValue(wallet, 'balance', 'balance', 0));
    const minBalance = toNumber(getValue(wallet, 'minBalance', 'min_balance', 0));

    const creditTypes = ['credit', 'refund'];
    const debitTypes = ['debit'];

    const totalCharged = transactions
      .filter((tx: any) => creditTypes.includes(String(tx.type)))
      .reduce((sum: number, tx: any) => sum + toNumber(tx.amount), 0);

    const totalSpent = transactions
      .filter((tx: any) => debitTypes.includes(String(tx.type)))
      .reduce((sum: number, tx: any) => sum + toNumber(tx.amount), 0);

    const now = new Date();
    const monthlySpent = transactions
      .filter((tx: any) => {
        const createdAt = getValue(tx, 'createdAt', 'created_at', '');
        if (!createdAt || String(tx.type) !== 'debit') return false;

        const date = new Date(createdAt);
        return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
      })
      .reduce((sum: number, tx: any) => sum + toNumber(tx.amount), 0);

    const lastCredit = transactions.find((tx: any) => String(tx.type) === 'credit');

    return {
      wallet,
      transactions,
      balance,
      minBalance,
      totalCharged,
      totalSpent,
      monthlySpent,
      lastCredit,
      isLowBalance: minBalance > 0 && balance < minBalance,
      shortage: Math.max(0, minBalance - balance),
    };
  }, [data]);

  if (isLoading) {
    return (
      <DashboardLayout title="کیف پول">
        <LoadingState />
      </DashboardLayout>
    );
  }

  if (error || !data || !walletData) {
    return (
      <DashboardLayout title="کیف پول">
        <ErrorState message={error || 'خطا در دریافت اطلاعات کیف پول'} onRetry={reload} />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="کیف پول">
      <div className="space-y-6">
        <div className="rounded-2xl border border-slate-200 bg-gradient-to-l from-sky-50 via-white to-emerald-50 p-5 shadow-sm dark:border-slate-700 dark:from-slate-900 dark:via-slate-900 dark:to-emerald-950/40">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">
                کیف پول
              </h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                موجودی، شارژها، برداشت‌ها و تاریخچه تراکنش‌های حساب شما
              </p>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button variant="outline" leftIcon={<RefreshCw className="h-4 w-4" />} onClick={reload}>
                بروزرسانی
              </Button>

              <a href="https://t.me/Oritin" target="_blank" rel="noopener noreferrer">
                <Button leftIcon={<ExternalLink className="h-4 w-4" />}>
                  شارژ کیف پول
                </Button>
              </a>
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
                  <Wallet className="h-10 w-10 text-white" />
                </div>

                <div>
                  <p className="text-sm text-sky-100">موجودی فعلی</p>
                  <p className="mt-1 text-4xl font-bold text-white">
                    {formatPrice(walletData.balance)}
                  </p>

                  {walletData.minBalance > 0 && (
                    <p className="mt-2 text-sm text-sky-100">
                      حد هشدار موجودی: {formatPrice(walletData.minBalance)}
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <BalanceMini label="مجموع شارژ" value={formatPrice(walletData.totalCharged)} />
                <BalanceMini label="مجموع مصرف" value={formatPrice(walletData.totalSpent)} />
                <BalanceMini label="مصرف ماه جاری" value={formatPrice(walletData.monthlySpent)} />
              </div>
            </div>
          </CardContent>
        </Card>

        {walletData.isLowBalance && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/30">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex items-start gap-3">
                <div className="rounded-xl bg-amber-100 p-2 text-amber-700 dark:bg-amber-900/60 dark:text-amber-200">
                  <AlertTriangle className="h-5 w-5" />
                </div>

                <div>
                  <p className="font-bold text-amber-800 dark:text-amber-100">
                    موجودی شما کمتر از حد هشدار است.
                  </p>
                  <p className="mt-1 text-sm text-amber-700 dark:text-amber-200">
                    کسری تا حد هشدار: {formatPrice(walletData.shortage)}
                  </p>
                </div>
              </div>

              <a href="https://t.me/Oritin" target="_blank" rel="noopener noreferrer">
                <Button className="bg-amber-600 hover:bg-amber-700">
                  درخواست شارژ
                </Button>
              </a>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <InfoCard
            icon={<TrendingUp className="h-5 w-5" />}
            label="شارژهای موفق"
            value={formatPrice(walletData.totalCharged)}
            tone="emerald"
          />

          <InfoCard
            icon={<TrendingDown className="h-5 w-5" />}
            label="مصرف کل"
            value={formatPrice(walletData.totalSpent)}
            tone="rose"
          />

          <InfoCard
            icon={<ArrowUpCircle className="h-5 w-5" />}
            label="آخرین شارژ"
            value={walletData.lastCredit ? formatPrice(toNumber(walletData.lastCredit.amount)) : 'ندارد'}
            tone="sky"
          />
        </div>

        <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 dark:border-sky-800 dark:bg-sky-900/30">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <p className="text-sm text-sky-800 dark:text-sky-100">
              برای شارژ کیف پول، از طریق تلگرام با پشتیبانی در ارتباط باشید.
            </p>

            <a href="https://t.me/Oritin" target="_blank" rel="noopener noreferrer">
              <Button variant="outline" leftIcon={<ExternalLink className="h-4 w-4" />}>
                ارتباط با پشتیبانی
              </Button>
            </a>
          </div>
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle>تاریخچه تراکنش‌ها</CardTitle>

              <Button
                variant="outline"
                size="sm"
                leftIcon={<Download className="h-4 w-4" />}
                disabled={!walletData.transactions.length}
                onClick={() => downloadTransactionsCsv(walletData.transactions)}
              >
                خروجی CSV
              </Button>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            {!walletData.transactions.length ? (
              <div className="p-6">
                <EmptyState text="هنوز تراکنشی ثبت نشده است." />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px]">
                  <thead className="bg-slate-50 dark:bg-slate-800/70">
                    <tr>
                      {['تاریخ', 'نوع', 'مبلغ', 'موجودی قبل', 'موجودی بعد', 'توضیحات', 'وضعیت'].map((head) => (
                        <th key={head} className="px-4 py-3 text-right text-xs font-medium text-slate-500 dark:text-slate-400">
                          {head}
                        </th>
                      ))}
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                    {walletData.transactions.map((tx: any) => {
                      const type = String(getValue(tx, 'type', 'type', 'debit'));
                      const config = transactionTypeConfig(type);
                      const Icon = config.icon;
                      const amount = toNumber(getValue(tx, 'amount', 'amount', 0));
                      const balanceBefore = toNumber(getValue(tx, 'balanceBefore', 'balance_before', 0));
                      const balanceAfter = toNumber(getValue(tx, 'balanceAfter', 'balance_after', 0));
                      const status = String(getValue(tx, 'status', 'status', 'completed'));
                      const createdAt = getValue(tx, 'createdAt', 'created_at', '');

                      return (
                        <tr key={tx.id} className="hover:bg-sky-50/50 dark:hover:bg-slate-800/70">
                          <td className="px-4 py-4 text-sm text-slate-600 dark:text-slate-300">
                            {createdAt ? formatDateTime(createdAt) : '-'}
                          </td>

                          <td className="px-4 py-4">
                            <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${config.bg} ${config.color}`}>
                              <Icon className="h-4 w-4" />
                              {transactionTypeLabel(type)}
                            </div>
                          </td>

                          <td className={`px-4 py-4 text-sm font-bold ${config.color}`}>
                            {config.sign}{formatPrice(amount)}
                          </td>

                          <td className="px-4 py-4 text-sm text-slate-600 dark:text-slate-300">
                            {formatPrice(balanceBefore)}
                          </td>

                          <td className="px-4 py-4 text-sm font-semibold text-slate-800 dark:text-slate-100">
                            {formatPrice(balanceAfter)}
                          </td>

                          <td className="max-w-xs truncate px-4 py-4 text-sm text-slate-600 dark:text-slate-300">
                            {getValue(tx, 'description', 'description', '-')}
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
    </DashboardLayout>
  );
}

function BalanceMini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white/15 p-4 text-center ring-1 ring-white/25">
      <p className="text-xs text-sky-100">{label}</p>
      <p className="mt-1 text-lg font-bold text-white">{value}</p>
    </div>
  );
}

function InfoCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: 'emerald' | 'rose' | 'sky';
}) {
  const tones = {
    emerald: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
    rose: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
    sky: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
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
        </div>
      </div>
    </div>
  );
}
