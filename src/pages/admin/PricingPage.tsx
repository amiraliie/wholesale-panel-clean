import { useEffect, useMemo, useState } from 'react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { EmptyState, ErrorState, LoadingState } from '../../components/RemoteState';
import { useRemoteData } from '../../hooks/useRemoteData';
import { backend } from '../../services/backend';
import { formatPrice } from '../../lib/utils';
import {
  BadgePercent,
  Calculator,
  RefreshCcw,
  Save,
  Search,
  Trash2,
  UserRound,
  WalletCards,
} from 'lucide-react';

type PriceMode = 'default' | 'pricePerGB' | 'flatPrice' | 'discountPercent';

type DraftPrice = {
  mode: PriceMode;
  value: string;
};

function getValue(item: any, camel: string, snake: string, fallback: any = '') {
  if (item?.[camel] !== undefined && item?.[camel] !== null) return item[camel];
  if (item?.[snake] !== undefined && item?.[snake] !== null) return item[snake];
  return fallback;
}

function numberValue(value: string) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function getPlanDraft(plan: any): DraftPrice {
  if (plan.custom_flat_price !== undefined && plan.custom_flat_price !== null) {
    return { mode: 'flatPrice', value: String(plan.custom_flat_price) };
  }

  if (plan.custom_price_per_gb !== undefined && plan.custom_price_per_gb !== null) {
    return { mode: 'pricePerGB', value: String(plan.custom_price_per_gb) };
  }

  if (plan.custom_discount_percent !== undefined && plan.custom_discount_percent !== null) {
    return { mode: 'discountPercent', value: String(plan.custom_discount_percent) };
  }

  return { mode: 'default', value: '' };
}

function buildPayload(draft: DraftPrice) {
  if (draft.mode === 'default') {
    return {
      pricePerGB: null,
      flatPrice: null,
      discountPercent: null,
    };
  }

  const value = numberValue(draft.value);

  return {
    pricePerGB: draft.mode === 'pricePerGB' ? value : null,
    flatPrice: draft.mode === 'flatPrice' ? value : null,
    discountPercent: draft.mode === 'discountPercent' ? value : null,
  };
}

function calculatePreview(plan: any, draft: DraftPrice) {
  const trafficGB = Number(getValue(plan, 'trafficGB', 'traffic_gb', 0));
  const basePrice = Number(getValue(plan, 'basePrice', 'base_price', 0));
  const basePricePerGB = Number(getValue(plan, 'pricePerGB', 'price_per_gb', 0));

  if (draft.mode === 'flatPrice') {
    return {
      finalPrice: numberValue(draft.value),
      pricePerGB: trafficGB > 0 ? Math.round(numberValue(draft.value) / trafficGB) : 0,
      label: 'قیمت ثابت',
    };
  }

  if (draft.mode === 'pricePerGB') {
    return {
      finalPrice: trafficGB * numberValue(draft.value),
      pricePerGB: numberValue(draft.value),
      label: 'قیمت هر گیگ اختصاصی',
    };
  }

  if (draft.mode === 'discountPercent') {
    const discount = numberValue(draft.value);
    return {
      finalPrice: Math.round(basePrice * (1 - discount / 100)),
      pricePerGB: basePricePerGB,
      label: `${discount}% تخفیف`,
    };
  }

  return {
    finalPrice: Number(getValue(plan, 'finalPrice', 'final_price', basePrice)),
    pricePerGB: Number(getValue(plan, 'finalPricePerGb', 'final_price_per_gb', basePricePerGB)),
    label: 'قیمت پایه',
  };
}

export default function PricingPage() {
  const {
    data,
    isLoading,
    error,
    reload,
  } = useRemoteData(async () => ({
    customers: await backend.customers.list(),
    plans: await backend.plans.list(),
  }), []);

  const [selectedCustomer, setSelectedCustomer] = useState('');
  const [customerPrices, setCustomerPrices] = useState<any | null>(null);
  const [pricesLoading, setPricesLoading] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, DraftPrice>>({});
  const [savingPlanId, setSavingPlanId] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  const selectedCustomerInfo = useMemo(() => {
    return (data?.customers || []).find((customer: any) => customer.id === selectedCustomer);
  }, [data, selectedCustomer]);

  const plans = useMemo(() => {
    if (customerPrices?.plans) return customerPrices.plans;
    return data?.plans || [];
  }, [customerPrices, data]);

  const filteredPlans = useMemo(() => {
    return (plans || []).filter((plan: any) => {
      const haystack = `${plan.name || ''} ${plan.description || ''}`.toLowerCase();
      return haystack.includes(searchTerm.toLowerCase());
    });
  }, [plans, searchTerm]);

  const stats = useMemo(() => {
    const list = plans || [];
    const custom = list.filter((plan: any) => getValue(plan, 'hasCustomPrice', 'has_custom_price', false)).length;

    return {
      total: list.length,
      custom,
      defaultCount: Math.max(list.length - custom, 0),
    };
  }, [plans]);

  useEffect(() => {
    if (!selectedCustomer) {
      setCustomerPrices(null);
      setDrafts({});
      return;
    }

    let cancelled = false;

    async function loadCustomerPrices() {
      setPricesLoading(true);
      try {
        const result = await backend.pricing.getCustomerPrices(selectedCustomer);

        if (cancelled) return;

        setCustomerPrices(result);

        const nextDrafts: Record<string, DraftPrice> = {};
        for (const plan of result.plans || []) {
          nextDrafts[plan.id] = getPlanDraft(plan);
        }
        setDrafts(nextDrafts);
      } catch (err: any) {
        alert(err.message || 'خطا در دریافت قیمت‌های اختصاصی');
      } finally {
        if (!cancelled) setPricesLoading(false);
      }
    }

    loadCustomerPrices();

    return () => {
      cancelled = true;
    };
  }, [selectedCustomer]);

  function updateDraft(planId: string, patch: Partial<DraftPrice>) {
    setDrafts((prev) => ({
      ...prev,
      [planId]: {
        ...(prev[planId] || { mode: 'default', value: '' }),
        ...patch,
      },
    }));
  }

  async function savePrice(plan: any) {
    if (!selectedCustomer) return;

    const draft = drafts[plan.id] || { mode: 'default', value: '' };

    if (draft.mode !== 'default' && draft.value.trim() === '') {
      alert('برای قیمت اختصاصی مقدار وارد کنید');
      return;
    }

    setSavingPlanId(plan.id);

    try {
      await backend.pricing.saveCustomerPrice(selectedCustomer, plan.id, buildPayload(draft));

      const result = await backend.pricing.getCustomerPrices(selectedCustomer);
      setCustomerPrices(result);

      const nextDrafts: Record<string, DraftPrice> = {};
      for (const item of result.plans || []) {
        nextDrafts[item.id] = getPlanDraft(item);
      }
      setDrafts(nextDrafts);
    } catch (err: any) {
      alert(err.message || 'خطا در ذخیره قیمت اختصاصی');
    } finally {
      setSavingPlanId('');
    }
  }

  async function deletePrice(plan: any) {
    if (!selectedCustomer) return;

    setSavingPlanId(plan.id);

    try {
      await backend.pricing.deleteCustomerPrice(selectedCustomer, plan.id);

      const result = await backend.pricing.getCustomerPrices(selectedCustomer);
      setCustomerPrices(result);

      const nextDrafts: Record<string, DraftPrice> = {};
      for (const item of result.plans || []) {
        nextDrafts[item.id] = getPlanDraft(item);
      }
      setDrafts(nextDrafts);
    } catch (err: any) {
      alert(err.message || 'خطا در حذف قیمت اختصاصی');
    } finally {
      setSavingPlanId('');
    }
  }

  return (
    <DashboardLayout title="قیمت‌گذاری اختصاصی">
      <div className="space-y-6">
        <div className="rounded-2xl border border-slate-200 bg-gradient-to-l from-violet-50 via-white to-cyan-50 p-5 shadow-sm dark:border-slate-700 dark:from-slate-900 dark:via-slate-900 dark:to-cyan-950/40">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">
                قیمت‌گذاری اختصاصی مشتریان
              </h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                برای هر مشتری می‌توانی قیمت هر گیگ، قیمت ثابت یا درصد تخفیف اختصاصی تعریف کنی.
              </p>
            </div>

            <Button variant="outline" leftIcon={<RefreshCcw className="h-4 w-4" />} onClick={reload}>
              بروزرسانی
            </Button>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-100 dark:bg-slate-800/70 dark:ring-slate-700">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-violet-100 p-2 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">
                  <WalletCards className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs text-slate-500">کل پلن‌ها</p>
                  <p className="text-xl font-bold text-slate-800 dark:text-slate-100">{stats.total}</p>
                </div>
              </div>
            </div>

            <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-100 dark:bg-slate-800/70 dark:ring-slate-700">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-emerald-100 p-2 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                  <BadgePercent className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs text-slate-500">اختصاصی‌شده</p>
                  <p className="text-xl font-bold text-slate-800 dark:text-slate-100">{stats.custom}</p>
                </div>
              </div>
            </div>

            <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-100 dark:bg-slate-800/70 dark:ring-slate-700">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-sky-100 p-2 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300">
                  <Calculator className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs text-slate-500">با قیمت پایه</p>
                  <p className="text-xl font-bold text-slate-800 dark:text-slate-100">{stats.defaultCount}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {error && <ErrorState message={error} onRetry={reload} />}

        {isLoading ? (
          <LoadingState />
        ) : !data ? (
          <EmptyState />
        ) : (
          <>
            <Card>
              <CardHeader>
                <CardTitle>انتخاب مشتری</CardTitle>
              </CardHeader>

              <CardContent>
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_2fr]">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-600 dark:text-slate-300">
                      مشتری عمده‌فروش
                    </label>
                    <select
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                      value={selectedCustomer}
                      onChange={(event) => setSelectedCustomer(event.target.value)}
                    >
                      <option value="">انتخاب مشتری</option>
                      {data.customers.map((customer: any) => (
                        <option key={customer.id} value={customer.id}>
                          {(getValue(customer, 'companyName', 'company_name', '') || customer.username)} - @{customer.username}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="rounded-xl bg-slate-50 p-4 dark:bg-slate-800">
                    {selectedCustomerInfo ? (
                      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                        <div className="flex items-center gap-3">
                          <div className="rounded-xl bg-sky-100 p-2 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300">
                            <UserRound className="h-5 w-5" />
                          </div>
                          <div>
                            <p className="font-bold text-slate-800 dark:text-slate-100">
                              {getValue(selectedCustomerInfo, 'companyName', 'company_name', '') || selectedCustomerInfo.username}
                            </p>
                            <p className="text-xs text-slate-500">
                              {selectedCustomerInfo.email} | @{selectedCustomerInfo.username}
                            </p>
                          </div>
                        </div>

                        <p className="text-sm text-slate-500 dark:text-slate-400">
                          کیف پول: {formatPrice(Number(getValue(selectedCustomerInfo, 'walletBalance', 'wallet_balance', 0)))}
                        </p>
                      </div>
                    ) : (
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        برای مشاهده ماتریس قیمت، یک مشتری انتخاب کن.
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {selectedCustomer && (
              <Card>
                <CardHeader>
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <CardTitle>ماتریس قیمت پلن‌ها</CardTitle>

                    <div className="relative w-full md:max-w-md">
                      <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <Input
                        placeholder="جستجوی پلن..."
                        value={searchTerm}
                        onChange={(event) => setSearchTerm(event.target.value)}
                        className="pr-10"
                      />
                    </div>
                  </div>
                </CardHeader>

                <CardContent>
                  {pricesLoading ? (
                    <LoadingState />
                  ) : filteredPlans.length === 0 ? (
                    <EmptyState />
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[980px]">
                        <thead className="bg-slate-50 dark:bg-slate-800/70">
                          <tr>
                            {[
                              'پلن',
                              'قیمت پایه',
                              'نوع قیمت اختصاصی',
                              'مقدار',
                              'پیش‌نمایش نهایی',
                              'وضعیت',
                              'عملیات',
                            ].map((head) => (
                              <th key={head} className="px-4 py-3 text-right text-xs font-medium text-slate-500 dark:text-slate-400">
                                {head}
                              </th>
                            ))}
                          </tr>
                        </thead>

                        <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                          {filteredPlans.map((plan: any) => {
                            const draft = drafts[plan.id] || getPlanDraft(plan);
                            const preview = calculatePreview(plan, draft);
                            const hasCustomPrice = getValue(plan, 'hasCustomPrice', 'has_custom_price', false);
                            const trafficGB = Number(getValue(plan, 'trafficGB', 'traffic_gb', 0));
                            const basePrice = Number(getValue(plan, 'basePrice', 'base_price', 0));
                            const basePricePerGB = Number(getValue(plan, 'pricePerGB', 'price_per_gb', 0));

                            return (
                              <tr key={plan.id} className="hover:bg-cyan-50/50 dark:hover:bg-slate-800/70">
                                <td className="px-4 py-4">
                                  <div className="font-bold text-slate-800 dark:text-slate-100">{plan.name}</div>
                                  <div className="mt-1 text-xs text-slate-500">
                                    {trafficGB}GB | {getValue(plan, 'durationDays', 'duration_days', 30)} روز
                                  </div>
                                </td>

                                <td className="px-4 py-4 text-sm">
                                  <div className="font-semibold text-slate-700 dark:text-slate-200">{formatPrice(basePrice)}</div>
                                  <div className="mt-1 text-xs text-slate-500">{formatPrice(basePricePerGB)} / GB</div>
                                </td>

                                <td className="px-4 py-4">
                                  <select
                                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                                    value={draft.mode}
                                    onChange={(event) => updateDraft(plan.id, { mode: event.target.value as PriceMode, value: '' })}
                                  >
                                    <option value="default">قیمت پایه</option>
                                    <option value="pricePerGB">قیمت هر GB</option>
                                    <option value="flatPrice">قیمت ثابت</option>
                                    <option value="discountPercent">درصد تخفیف</option>
                                  </select>
                                </td>

                                <td className="px-4 py-4">
                                  {draft.mode === 'default' ? (
                                    <div className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-400 dark:bg-slate-800">
                                      بدون مقدار
                                    </div>
                                  ) : (
                                    <Input
                                      type="number"
                                      value={draft.value}
                                      onChange={(event) => updateDraft(plan.id, { value: event.target.value })}
                                      placeholder={
                                        draft.mode === 'discountPercent'
                                          ? 'مثلاً 15'
                                          : 'مبلغ تومان'
                                      }
                                    />
                                  )}
                                </td>

                                <td className="px-4 py-4 text-sm">
                                  <div className="font-bold text-emerald-600 dark:text-emerald-300">
                                    {formatPrice(preview.finalPrice)}
                                  </div>
                                  <div className="mt-1 text-xs text-slate-500">
                                    {preview.label} | {formatPrice(preview.pricePerGB)} / GB
                                  </div>
                                </td>

                                <td className="px-4 py-4">
                                  {hasCustomPrice ? (
                                    <span className="inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                                      اختصاصی
                                    </span>
                                  ) : (
                                    <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                                      پایه
                                    </span>
                                  )}
                                </td>

                                <td className="px-4 py-4">
                                  <div className="flex flex-wrap gap-2">
                                    <Button
                                      size="sm"
                                      isLoading={savingPlanId === plan.id}
                                      leftIcon={<Save className="h-4 w-4" />}
                                      onClick={() => savePrice(plan)}
                                    >
                                      ذخیره
                                    </Button>

                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      disabled={!hasCustomPrice || savingPlanId === plan.id}
                                      onClick={() => deletePrice(plan)}
                                    >
                                      <Trash2 className="h-4 w-4 text-rose-600" />
                                    </Button>
                                  </div>
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
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
