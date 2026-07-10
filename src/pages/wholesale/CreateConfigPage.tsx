import { useEffect, useMemo, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import toast from 'react-hot-toast';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { EmptyState, ErrorState, LoadingState } from '../../components/RemoteState';
import { useRemoteData } from '../../hooks/useRemoteData';
import { backend } from '../../services/backend';
import { formatPrice } from '../../lib/utils';
import {
  AlertTriangle,
  Check,
  Copy,
  Loader2,
  Package,
  QrCode,
  RotateCcw,
  Server,
  ShieldCheck,
  Wallet,
  Wifi,
  Zap,
} from 'lucide-react';

type CreateResult = {
  order?: any;
  endUser?: any;
  configLink: string;
  subscriptionLink: string;
};

function getValue(item: any, camel: string, snake?: string, fallback: any = '') {
  if (item?.[camel] !== undefined && item?.[camel] !== null && item?.[camel] !== '') return item[camel];
  if (snake && item?.[snake] !== undefined && item?.[snake] !== null && item?.[snake] !== '') return item[snake];
  return fallback;
}

function toNumber(value: any) {
  const num = Number(value || 0);
  return Number.isFinite(num) ? num : 0;
}

function isActive(item: any) {
  return getValue(item, 'isActive', 'is_active', true) !== false;
}

function planTrafficGB(plan: any) {
  return toNumber(getValue(plan, 'trafficGB', 'traffic_gb', 0));
}

function planDurationDays(plan: any) {
  return toNumber(getValue(plan, 'durationDays', 'duration_days', 0));
}

function planBasePrice(plan: any) {
  return toNumber(getValue(plan, 'basePrice', 'base_price', 0));
}

function planPricePerGB(plan: any) {
  return toNumber(getValue(plan, 'pricePerGB', 'price_per_gb', 0));
}

function planIpLimit(plan: any) {
  return toNumber(getValue(plan, 'ipLimit', 'ip_limit', 0));
}

function serverLocation(server: any) {
  return getValue(server, 'location', 'location', 'لوکیشن ثبت نشده');
}

function inboundServerId(inbound: any) {
  return String(getValue(inbound, 'serverId', 'server_id', ''));
}

function makeIdempotencyKey(email: string) {
  return `ui:${email}:${Date.now()}:${Math.random().toString(16).slice(2)}`;
}

async function copyText(text: string, label: string) {
  if (!text) {
    toast.error('چیزی برای کپی وجود ندارد');
    return;
  }

  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
  }

  toast.success(`${label} کپی شد`);
}

export default function CreateConfigPage() {
  const {
    data,
    isLoading,
    error,
    reload,
  } = useRemoteData(async () => ({
    plans: await backend.plans.list(),
    servers: await backend.servers.list(),
    inbounds: await backend.inbounds.list(),
    wallet: await backend.wallet.current().catch(() => null),
  }), []);

  const [step, setStep] = useState(1);
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [selectedServerId, setSelectedServerId] = useState('');
  const [selectedInboundId, setSelectedInboundId] = useState('');
  const [email, setEmail] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<CreateResult | null>(null);
  const [priceQuote, setPriceQuote] = useState<any | null>(null);
  const [priceLoading, setPriceLoading] = useState(false);

  const plans = useMemo(() => (data?.plans || []).filter((plan: any) => isActive(plan)), [data]);
  const servers = useMemo(() => (data?.servers || []).filter((server: any) => isActive(server)), [data]);
  const inbounds = useMemo(() => (data?.inbounds || []).filter((inbound: any) => isActive(inbound)), [data]);

  const selectedPlan = useMemo(
    () => plans.find((plan: any) => String(plan.id) === selectedPlanId),
    [plans, selectedPlanId],
  );

  const selectedServer = useMemo(
    () => servers.find((server: any) => String(server.id) === selectedServerId),
    [servers, selectedServerId],
  );

  const serverInbounds = useMemo(
    () => inbounds.filter((inbound: any) => inboundServerId(inbound) === selectedServerId),
    [inbounds, selectedServerId],
  );

  const selectedInbound = useMemo(
    () => serverInbounds.find((inbound: any) => String(inbound.id) === selectedInboundId),
    [serverInbounds, selectedInboundId],
  );

  const walletBalance = toNumber(data?.wallet?.balance);
  const minBalance = toNumber(getValue(data?.wallet, 'minBalance', 'min_balance', 0));

  useEffect(() => {
    let cancelled = false;

    async function loadQuote() {
      if (!selectedPlanId) {
        setPriceQuote(null);
        return;
      }

      setPriceLoading(true);

      try {
        const quote = await backend.plans.calculate(selectedPlanId);
        if (!cancelled) setPriceQuote(quote);
      } catch {
        if (!cancelled) setPriceQuote(null);
      } finally {
        if (!cancelled) setPriceLoading(false);
      }
    }

    loadQuote();

    return () => {
      cancelled = true;
    };
  }, [selectedPlanId]);

  const finalPrice = selectedPlan
    ? toNumber(priceQuote?.finalPrice ?? priceQuote?.final_price ?? planBasePrice(selectedPlan))
    : 0;

  const finalPricePerGB = selectedPlan
    ? toNumber(priceQuote?.pricePerGb ?? priceQuote?.pricePerGB ?? priceQuote?.price_per_gb ?? planPricePerGB(selectedPlan))
    : 0;

  const hasEnoughBalance = !selectedPlan || walletBalance >= finalPrice;
  const shortage = Math.max(0, finalPrice - walletBalance);

  function resetForm() {
    setStep(1);
    setSelectedPlanId('');
    setSelectedServerId('');
    setSelectedInboundId('');
    setEmail('');
    setResult(null);
    setPriceQuote(null);
  }

  async function handleCreateConfig() {
    if (!selectedPlanId || !selectedServerId || !selectedInboundId || !email.trim()) {
      toast.error('لطفاً همه فیلدها را کامل کن');
      return;
    }

    if (!hasEnoughBalance) {
      toast.error('موجودی کیف پول کافی نیست');
      return;
    }

    setIsProcessing(true);
    setResult(null);

    try {
      const response = await backend.orders.createConfig({
        planId: selectedPlanId,
        serverId: selectedServerId,
        inboundId: selectedInboundId,
        email: email.trim(),
        idempotencyKey: makeIdempotencyKey(email.trim()),
      });

      setResult({
        order: response.order,
        endUser: response.endUser,
        configLink: response.configLink,
        subscriptionLink: response.subscriptionLink,
      });

      setStep(4);
      toast.success('کانفیگ با موفقیت ساخته شد');
      await reload();
    } catch (err: any) {
      toast.error(err?.message || 'خطا در ساخت کانفیگ');
    } finally {
      setIsProcessing(false);
    }
  }

  if (isLoading) {
    return (
      <DashboardLayout title="ساخت کانفیگ جدید">
        <LoadingState />
      </DashboardLayout>
    );
  }

  if (error || !data) {
    return (
      <DashboardLayout title="ساخت کانفیگ جدید">
        <ErrorState message={error || 'خطا در دریافت اطلاعات ساخت کانفیگ'} onRetry={reload} />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="ساخت کانفیگ جدید">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="rounded-2xl border border-slate-200 bg-gradient-to-l from-sky-50 via-white to-violet-50 p-5 shadow-sm dark:border-slate-700 dark:from-slate-900 dark:via-slate-900 dark:to-violet-950/40">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">
                ساخت کانفیگ جدید
              </h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                پلن، سرور و اینباند مجاز خود را انتخاب کن، سپس کانفیگ را بساز.
              </p>
            </div>

            <Button variant="outline" leftIcon={<RotateCcw className="h-4 w-4" />} onClick={resetForm}>
              شروع مجدد
            </Button>
          </div>
        </div>

        <Card className="overflow-hidden border-0 bg-gradient-to-l from-sky-600 via-indigo-600 to-violet-600">
          <CardContent className="relative p-0">
            <div className="absolute inset-0 opacity-20">
              <div className="absolute -left-16 -top-16 h-48 w-48 rounded-full bg-white blur-3xl" />
              <div className="absolute -bottom-20 right-20 h-56 w-56 rounded-full bg-cyan-200 blur-3xl" />
            </div>

            <div className="relative flex flex-col gap-5 p-5 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-4">
                <div className="rounded-2xl bg-white/20 p-3 ring-1 ring-white/30">
                  <Wallet className="h-8 w-8 text-white" />
                </div>

                <div>
                  <p className="text-sm text-sky-100">موجودی کیف پول</p>
                  <p className="mt-1 text-2xl font-bold text-white">
                    {formatPrice(walletBalance)}
                  </p>
                  {minBalance > 0 && (
                    <p className="mt-1 text-xs text-sky-100">
                      حد هشدار: {formatPrice(minBalance)}
                    </p>
                  )}
                </div>
              </div>

              {selectedPlan && (
                <div className="rounded-2xl bg-white/15 p-4 ring-1 ring-white/25">
                  <p className="text-sm text-sky-100">مبلغ سفارش انتخاب‌شده</p>
                  <div className="mt-1 flex items-center gap-2">
                    <p className="text-xl font-bold text-white">
                      {priceLoading ? 'در حال محاسبه...' : formatPrice(finalPrice)}
                    </p>
                    {priceLoading && <Loader2 className="h-4 w-4 animate-spin text-white" />}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Stepper step={step} />

        {step === 1 && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-sky-100 p-2 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300">
                  <Package className="h-5 w-5" />
                </div>
                <CardTitle>مرحله ۱: انتخاب پلن</CardTitle>
              </div>
            </CardHeader>

            <CardContent className="space-y-5">
              {plans.length === 0 ? (
                <EmptyState text="پلن فعالی برای شما وجود ندارد." />
              ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {plans.map((plan: any) => {
                    const active = selectedPlanId === String(plan.id);

                    return (
                      <button
                        key={plan.id}
                        type="button"
                        onClick={() => setSelectedPlanId(String(plan.id))}
                        className={`rounded-2xl border-2 p-4 text-right transition ${
                          active
                            ? 'border-sky-500 bg-sky-50 shadow-sm dark:bg-sky-900/25'
                            : 'border-slate-200 bg-white hover:border-sky-200 hover:bg-sky-50/40 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-sky-700 dark:hover:bg-slate-800'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-bold text-slate-800 dark:text-slate-100">{plan.name}</p>
                            {plan.description && (
                              <p className="mt-1 line-clamp-2 text-xs text-slate-500 dark:text-slate-400">
                                {plan.description}
                              </p>
                            )}
                          </div>

                          {active && (
                            <div className="rounded-full bg-sky-600 p-1 text-white">
                              <Check className="h-4 w-4" />
                            </div>
                          )}
                        </div>

                        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                          <PlanMini label="ترافیک" value={`${planTrafficGB(plan)} GB`} />
                          <PlanMini label="مدت" value={`${planDurationDays(plan)} روز`} />
                          <PlanMini label="IP" value={String(planIpLimit(plan) || 'نامحدود')} />
                        </div>

                        <div className="mt-4 border-t border-slate-100 pt-4 dark:border-slate-700">
                          <p className="text-xs text-slate-500 dark:text-slate-400">قیمت پایه</p>
                          <p className="mt-1 text-lg font-bold text-sky-600 dark:text-sky-300">
                            {formatPrice(planBasePrice(plan))}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            هر GB: {formatPrice(planPricePerGB(plan))}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="flex justify-end">
                <Button disabled={!selectedPlanId} onClick={() => setStep(2)}>
                  ادامه انتخاب سرور
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === 2 && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-violet-100 p-2 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">
                  <Server className="h-5 w-5" />
                </div>
                <CardTitle>مرحله ۲: انتخاب سرور و اینباند</CardTitle>
              </div>
            </CardHeader>

            <CardContent className="space-y-6">
              <div className="rounded-xl bg-sky-50 p-4 text-sm text-sky-700 dark:bg-sky-900/30 dark:text-sky-200">
                فقط سرورها و اینباندهایی نمایش داده می‌شوند که ادمین برای حساب شما مجاز کرده است.
              </div>

              {servers.length === 0 ? (
                <EmptyState text="سرور فعالی برای حساب شما وجود ندارد." />
              ) : (
                <div>
                  <label className="mb-3 block text-sm font-medium text-slate-700 dark:text-slate-200">
                    سرور
                  </label>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    {servers.map((serverItem: any) => {
                      const active = selectedServerId === String(serverItem.id);
                      const count = inbounds.filter((inbound: any) => inboundServerId(inbound) === String(serverItem.id)).length;

                      return (
                        <button
                          key={serverItem.id}
                          type="button"
                          onClick={() => {
                            setSelectedServerId(String(serverItem.id));
                            setSelectedInboundId('');
                          }}
                          className={`rounded-2xl border-2 p-4 text-right transition ${
                            active
                              ? 'border-violet-500 bg-violet-50 shadow-sm dark:bg-violet-900/25'
                              : 'border-slate-200 bg-white hover:border-violet-200 hover:bg-violet-50/40 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-violet-700 dark:hover:bg-slate-800'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3">
                              <div className="rounded-xl bg-slate-100 p-2 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                <Server className="h-5 w-5" />
                              </div>

                              <div>
                                <p className="font-bold text-slate-800 dark:text-slate-100">{serverItem.name}</p>
                                <p className="mt-1 text-xs text-slate-500">{serverLocation(serverItem)}</p>
                              </div>
                            </div>

                            {active && (
                              <div className="rounded-full bg-violet-600 p-1 text-white">
                                <Check className="h-4 w-4" />
                              </div>
                            )}
                          </div>

                          <div className="mt-4 flex flex-wrap gap-2 text-xs">
                            <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                              {serverItem.host}:{serverItem.port}
                            </span>
                            <span className="rounded-full bg-violet-100 px-3 py-1 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">
                              {count} اینباند
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {selectedServerId && (
                <div>
                  <label className="mb-3 block text-sm font-medium text-slate-700 dark:text-slate-200">
                    اینباند / پروتکل
                  </label>

                  {serverInbounds.length === 0 ? (
                    <div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-700 dark:bg-amber-900/30 dark:text-amber-200">
                      برای این سرور اینباند فعالی در دسترس نیست.
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {serverInbounds.map((inbound: any) => {
                        const active = selectedInboundId === String(inbound.id);

                        return (
                          <button
                            key={inbound.id}
                            type="button"
                            onClick={() => setSelectedInboundId(String(inbound.id))}
                            className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium transition ${
                              active
                                ? 'border-sky-600 bg-sky-600 text-white'
                                : 'border-slate-200 bg-white text-slate-700 hover:border-sky-300 hover:bg-sky-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800'
                            }`}
                          >
                            <Wifi className="h-4 w-4" />
                            {inbound.name}
                            <span className={active ? 'text-sky-100' : 'text-slate-400'}>
                              {inbound.protocol}:{inbound.port}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              <div className="flex justify-between gap-3">
                <Button variant="outline" onClick={() => setStep(1)}>
                  قبلی
                </Button>

                <Button disabled={!selectedServerId || !selectedInboundId} onClick={() => setStep(3)}>
                  ادامه تأیید سفارش
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === 3 && selectedPlan && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-emerald-100 p-2 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <CardTitle>مرحله ۳: تأیید و ساخت</CardTitle>
              </div>
            </CardHeader>

            <CardContent className="space-y-6">
              <Input
                label="ایمیل یا شناسه کاربر"
                placeholder="user@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />

              <div className="rounded-2xl bg-slate-50 p-5 dark:bg-slate-800">
                <h3 className="font-bold text-slate-800 dark:text-slate-100">
                  خلاصه سفارش
                </h3>

                <div className="mt-4 space-y-3 text-sm">
                  <SummaryRow label="پلن" value={selectedPlan.name} />
                  <SummaryRow label="سرور" value={selectedServer?.name || '-'} />
                  <SummaryRow label="اینباند" value={selectedInbound ? `${selectedInbound.name} / ${selectedInbound.protocol}:${selectedInbound.port}` : '-'} />
                  <SummaryRow label="ترافیک" value={`${planTrafficGB(selectedPlan)} GB`} />
                  <SummaryRow label="مدت" value={`${planDurationDays(selectedPlan)} روز`} />
                  <SummaryRow label="محدودیت IP" value={String(planIpLimit(selectedPlan) || 'نامحدود')} />
                  <SummaryRow label="قیمت هر GB" value={formatPrice(finalPricePerGB)} />
                  <div className="border-t border-slate-200 pt-3 dark:border-slate-700">
                    <SummaryRow label="مبلغ نهایی" value={priceLoading ? 'در حال محاسبه...' : formatPrice(finalPrice)} strong />
                  </div>
                </div>
              </div>

              {!hasEnoughBalance && (
                <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-700 dark:border-rose-800 dark:bg-rose-900/30 dark:text-rose-200">
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
                  <div>
                    <p className="font-bold">موجودی کیف پول کافی نیست.</p>
                    <p className="mt-1 text-sm">
                      موجودی فعلی: {formatPrice(walletBalance)} | کسری: {formatPrice(shortage)}
                    </p>
                  </div>
                </div>
              )}

              <div className="flex justify-between gap-3">
                <Button variant="outline" onClick={() => setStep(2)}>
                  قبلی
                </Button>

                <Button
                  isLoading={isProcessing}
                  disabled={!email.trim() || !hasEnoughBalance || isProcessing || priceLoading}
                  onClick={handleCreateConfig}
                >
                  پرداخت و ساخت کانفیگ
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === 4 && result && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-emerald-100 p-2 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                  <Check className="h-5 w-5" />
                </div>
                <CardTitle>کانفیگ با موفقیت ساخته شد</CardTitle>
              </div>
            </CardHeader>

            <CardContent className="space-y-6">
              <div className="rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-200">
                سفارش ثبت شد، کیف پول بروزرسانی شد و لینک‌های کاربر آماده هستند.
              </div>

              <LinkBox
                label="لینک اشتراک"
                value={result.subscriptionLink}
                onCopy={() => copyText(result.subscriptionLink, 'لینک اشتراک')}
              />

              <LinkBox
                label="لینک کانفیگ"
                value={result.configLink}
                onCopy={() => copyText(result.configLink, 'لینک کانفیگ')}
              />

              <div className="grid gap-4 md:grid-cols-2">
                {result.subscriptionLink && (
                  <QrResult title="QR اشتراک" value={result.subscriptionLink} />
                )}

                {result.configLink && (
                  <QrResult title="QR کانفیگ" value={result.configLink} />
                )}
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
                <Button variant="outline" onClick={() => copyText(`${result.subscriptionLink}\n${result.configLink}`, 'همه لینک‌ها')}>
                  <Copy className="ml-2 h-4 w-4" />
                  کپی همه لینک‌ها
                </Button>

                <Button onClick={resetForm}>
                  ساخت کانفیگ جدید
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}

function Stepper({ step }: { step: number }) {
  const items = [
    { id: 1, label: 'پلن' },
    { id: 2, label: 'سرور' },
    { id: 3, label: 'تأیید' },
    { id: 4, label: 'تحویل' },
  ];

  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100 dark:bg-slate-800/70 dark:ring-slate-700">
      <div className="flex items-center justify-between gap-2">
        {items.map((item, index) => (
          <div key={item.id} className="flex flex-1 items-center">
            <div className="flex flex-col items-center gap-2">
              <div
                className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold transition ${
                  step >= item.id
                    ? 'bg-sky-600 text-white'
                    : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-300'
                }`}
              >
                {step > item.id ? <Check className="h-4 w-4" /> : item.id}
              </div>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {item.label}
              </span>
            </div>

            {index < items.length - 1 && (
              <div
                className={`mx-2 h-1 flex-1 rounded-full transition ${
                  step > item.id ? 'bg-sky-600' : 'bg-slate-100 dark:bg-slate-700'
                }`}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function PlanMini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 p-2 dark:bg-slate-800">
      <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-1 text-sm font-bold text-slate-800 dark:text-slate-100">{value}</p>
    </div>
  );
}

function SummaryRow({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-slate-500 dark:text-slate-400">{label}</span>
      <span className={strong ? 'text-lg font-bold text-sky-600 dark:text-sky-300' : 'font-medium text-slate-800 dark:text-slate-100'}>
        {value}
      </span>
    </div>
  );
}

function LinkBox({
  label,
  value,
  onCopy,
}: {
  label: string;
  value: string;
  onCopy: () => void;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200">
        {label}
      </label>
      <div className="flex gap-2">
        <Input
          value={value || 'موجود نیست'}
          readOnly
          className="font-mono text-xs ltr text-left"
        />
        <Button variant="outline" onClick={onCopy} disabled={!value}>
          <Copy className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function QrResult({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
      <div className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
        <QrCode className="h-4 w-4 text-violet-600" />
        {title}
      </div>
      <div className="inline-block rounded-xl bg-white p-3">
        <QRCodeSVG value={value} size={190} level="M" />
      </div>
      <div className="mt-3 break-all rounded-xl bg-white p-3 font-mono text-xs text-slate-600 dark:bg-slate-900 dark:text-slate-300" dir="ltr">
        {value}
      </div>
    </div>
  );
}
