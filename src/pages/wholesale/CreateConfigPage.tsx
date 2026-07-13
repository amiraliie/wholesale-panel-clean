import {
  useEffect,
  useMemo,
  useState,
} from 'react';

import { QRCodeSVG } from
  'qrcode.react';

import toast from
  'react-hot-toast';

import {
  AlertTriangle,
  Check,
  Copy,
  Loader2,
  Network,
  Package,
  QrCode,
  RotateCcw,
  Server,
  ShieldCheck,
  Wallet,
  Wifi,
  Zap,
} from 'lucide-react';

import { DashboardLayout } from
  '../../components/layout/DashboardLayout';

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '../../components/ui/Card';

import { Button } from
  '../../components/ui/Button';

import { Input } from
  '../../components/ui/Input';

import {
  EmptyState,
  ErrorState,
  LoadingState,
} from '../../components/RemoteState';

import { useRemoteData } from
  '../../hooks/useRemoteData';

import { backend } from
  '../../services/backend';

import { formatPrice } from
  '../../lib/utils';

type ServiceType =
  | 'direct'
  | 'tunnel';

type PricingMode =
  | 'global'
  | 'server';

type CreateResult = {
  order?: any;
  endUser?: any;
  configLink: string;
  configLinks: string[];
  subscriptionLink: string;
};

function getValue(
  item: any,
  camel: string,
  snake?: string,
  fallback: any = '',
) {
  if (
    item?.[camel] !== undefined &&
    item?.[camel] !== null &&
    item?.[camel] !== ''
  ) {
    return item[camel];
  }

  if (
    snake &&
    item?.[snake] !== undefined &&
    item?.[snake] !== null &&
    item?.[snake] !== ''
  ) {
    return item[snake];
  }

  return fallback;
}

function toNumber(value: any) {
  const number = Number(value || 0);

  return Number.isFinite(number)
    ? number
    : 0;
}

function isActive(item: any) {
  return getValue(
    item,
    'isActive',
    'is_active',
    true,
  ) !== false;
}

function healthStatus(item: any) {
  return String(
    getValue(
      item,
      'healthStatus',
      'health_status',
      'unknown',
    ),
  );
}

function serverServiceType(
  server: any,
): ServiceType {
  return getValue(
    server,
    'serviceType',
    'service_type',
    'direct',
  ) === 'tunnel'
    ? 'tunnel'
    : 'direct';
}

function serverClientApiMode(
  server: any,
) {
  return getValue(
    server,
    'clientApiMode',
    'client_api_mode',
    'unknown',
  );
}

function serverLocation(server: any) {
  return getValue(
    server,
    'location',
    'location',
    'لوکیشن ثبت نشده',
  );
}

function inboundServerId(
  inbound: any,
) {
  return String(
    getValue(
      inbound,
      'serverId',
      'server_id',
      '',
    ),
  );
}

function planTrafficGB(plan: any) {
  return toNumber(
    getValue(
      plan,
      'trafficGB',
      'traffic_gb',
      0,
    ),
  );
}

function planDurationDays(plan: any) {
  return toNumber(
    getValue(
      plan,
      'durationDays',
      'duration_days',
      0,
    ),
  );
}

function planBasePrice(plan: any) {
  return toNumber(
    getValue(
      plan,
      'finalPrice',
      'final_price',
      getValue(
        plan,
        'basePrice',
        'base_price',
        0,
      ),
    ),
  );
}

function planPricePerGB(plan: any) {
  return toNumber(
    getValue(
      plan,
      'finalPricePerGB',
      'final_price_per_gb',
      getValue(
        plan,
        'pricePerGB',
        'price_per_gb',
        0,
      ),
    ),
  );
}

function planIpLimit(plan: any) {
  return toNumber(
    getValue(
      plan,
      'ipLimit',
      'ip_limit',
      0,
    ),
  );
}

function planAllowedInboundIds(
  plan: any,
): string[] {
  const values = getValue(
    plan,
    'allowedInboundIds',
    'allowed_inbound_ids',
    [],
  );

  if (!Array.isArray(values)) {
    return [];
  }

  return values.map(String);
}

function makeIdempotencyKey(
  email: string,
) {
  return [
    'ui',
    email,
    Date.now(),
    Math.random()
      .toString(16)
      .slice(2),
  ].join(':');
}

async function copyText(
  text: string,
  label: string,
) {
  if (!text) {
    toast.error(
      'چیزی برای کپی وجود ندارد',
    );

    return;
  }

  try {
    await navigator.clipboard
      .writeText(text);
  } catch {
    const textarea =
      document.createElement(
        'textarea',
      );

    textarea.value = text;
    textarea.style.position =
      'fixed';
    textarea.style.opacity = '0';

    document.body.appendChild(
      textarea,
    );

    textarea.select();

    document.execCommand('copy');

    document.body.removeChild(
      textarea,
    );
  }

  toast.success(`${label} کپی شد`);
}

export default function CreateConfigPage() {
  const {
    data,
    isLoading,
    error,
    reload,
  } = useRemoteData(
    async () => ({
      servers:
        await backend.servers.list(),

      inbounds:
        await backend.inbounds.list(),

      wallet:
        await backend.wallet
          .current()
          .catch(() => null),
    }),
    [],
  );

  const [
    step,
    setStep,
  ] = useState(1);

  const [
    selectedServiceType,
    setSelectedServiceType,
  ] = useState<ServiceType | ''>('');

  const [
    selectedServerId,
    setSelectedServerId,
  ] = useState('');

  const [
    pricingMode,
    setPricingMode,
  ] = useState<PricingMode | ''>('');

  const [
    availablePlans,
    setAvailablePlans,
  ] = useState<any[]>([]);

  const [
    plansLoading,
    setPlansLoading,
  ] = useState(false);

  const [
    plansError,
    setPlansError,
  ] = useState('');

  const [
    selectedPlanId,
    setSelectedPlanId,
  ] = useState('');

  const [
    selectedInboundIds,
    setSelectedInboundIds,
  ] = useState<string[]>([]);

  const [
    email,
    setEmail,
  ] = useState('');

  const [
    isProcessing,
    setIsProcessing,
  ] = useState(false);

  const [
    result,
    setResult,
  ] = useState<CreateResult | null>(
    null,
  );

  const [
    priceQuote,
    setPriceQuote,
  ] = useState<any | null>(null);

  const [
    priceLoading,
    setPriceLoading,
  ] = useState(false);

  const [
    priceError,
    setPriceError,
  ] = useState('');

  const servers = useMemo(
    () =>
      (data?.servers || []).filter(
        (server: any) =>
          isActive(server) &&
          healthStatus(server) !==
          'unhealthy',
      ),
    [data],
  );

  const inbounds = useMemo(
    () =>
      (data?.inbounds || []).filter(
        (inbound: any) =>
          isActive(inbound),
      ),
    [data],
  );

  const serviceServers = useMemo(
    () =>
      servers.filter(
        (server: any) =>
          serverServiceType(server) ===
          selectedServiceType,
      ),
    [
      servers,
      selectedServiceType,
    ],
  );

  const selectedServer = useMemo(
    () =>
      servers.find(
        (server: any) =>
          String(server.id) ===
          selectedServerId,
      ),
    [
      servers,
      selectedServerId,
    ],
  );

  const selectedPlan = useMemo(
    () =>
      availablePlans.find(
        (plan: any) =>
          String(plan.id) ===
          selectedPlanId,
      ),
    [
      availablePlans,
      selectedPlanId,
    ],
  );

  const allowedInboundIds =
    useMemo(
      () =>
        planAllowedInboundIds(
          selectedPlan,
        ),
      [selectedPlan],
    );

  const serverInbounds = useMemo(
    () =>
      inbounds.filter(
        (inbound: any) => {
          if (
            inboundServerId(inbound) !==
            selectedServerId
          ) {
            return false;
          }

          if (
            allowedInboundIds.length ===
            0
          ) {
            return true;
          }

          return allowedInboundIds
            .includes(
              String(inbound.id),
            );
        },
      ),
    [
      inbounds,
      selectedServerId,
      allowedInboundIds,
    ],
  );

  const selectedInbounds = useMemo(
    () =>
      serverInbounds.filter(
        (inbound: any) =>
          selectedInboundIds.includes(
            String(inbound.id),
          ),
      ),
    [
      serverInbounds,
      selectedInboundIds,
    ],
  );

  const supportsMultiInbound =
    serverClientApiMode(
      selectedServer,
    ) === 'clients_v3';

  const walletBalance = toNumber(
    data?.wallet?.balance,
  );

  const minBalance = toNumber(
    getValue(
      data?.wallet,
      'minBalance',
      'min_balance',
      0,
    ),
  );

  useEffect(() => {
    const serverId =
      selectedServerId;

    const mode = pricingMode;

    setSelectedPlanId('');
    setSelectedInboundIds([]);
    setAvailablePlans([]);
    setPriceQuote(null);
    setPriceError('');
    setPlansError('');

    if (!serverId || !mode) {
      return;
    }

    let cancelled = false;

    async function loadPlans() {
      setPlansLoading(true);

      try {
        const plans =
          await backend.plans.list({
            serverId,
            pricingMode: mode as PricingMode,
          });

        if (!cancelled) {
          setAvailablePlans(
            (plans || []).filter(
              (plan: any) =>
                isActive(plan),
            ),
          );
        }
      } catch (loadError: any) {
        if (!cancelled) {
          setPlansError(
            loadError?.message ||
            'خطا در دریافت پلن‌ها',
          );
        }
      } finally {
        if (!cancelled) {
          setPlansLoading(false);
        }
      }
    }

    loadPlans();

    return () => {
      cancelled = true;
    };
  }, [
    selectedServerId,
    pricingMode,
  ]);

  useEffect(() => {
    const planId =
      selectedPlanId;

    const serverId =
      selectedServerId;

    const mode = pricingMode;

    if (
      !planId ||
      !serverId ||
      !mode
    ) {
      setPriceQuote(null);
      setPriceError('');
      return;
    }

    let cancelled = false;

    async function loadPrice() {
      setPriceLoading(true);
      setPriceError('');

      try {
        const quote =
          await backend.plans
            .calculate(
              planId,
              {
                serverId,
                pricingMode: mode as PricingMode,
              },
            );

        if (!cancelled) {
          setPriceQuote(quote);
        }
      } catch (loadError: any) {
        if (!cancelled) {
          setPriceQuote(null);

          setPriceError(
            loadError?.message ||
            'محاسبه قیمت ناموفق بود',
          );
        }
      } finally {
        if (!cancelled) {
          setPriceLoading(false);
        }
      }
    }

    loadPrice();

    return () => {
      cancelled = true;
    };
  }, [
    selectedPlanId,
    selectedServerId,
    pricingMode,
  ]);

  const effectivePlan =
    priceQuote?.plan ||
    selectedPlan;

  const finalPrice = effectivePlan
    ? toNumber(
      priceQuote?.finalPrice ??
      priceQuote?.final_price ??
      planBasePrice(
        effectivePlan,
      ),
    )
    : 0;

  const finalPricePerGB =
    effectivePlan
      ? toNumber(
        priceQuote?.pricePerGb ??
        priceQuote?.pricePerGB ??
        priceQuote?.price_per_gb ??
        planPricePerGB(
          effectivePlan,
        ),
      )
      : 0;

  const hasEnoughBalance =
    !effectivePlan ||
    walletBalance >= finalPrice;

  const shortage = Math.max(
    0,
    finalPrice - walletBalance,
  );

  function resetForm() {
    setStep(1);
    setSelectedServiceType('');
    setSelectedServerId('');
    setPricingMode('');
    setAvailablePlans([]);
    setSelectedPlanId('');
    setSelectedInboundIds([]);
    setEmail('');
    setResult(null);
    setPriceQuote(null);
    setPriceError('');
    setPlansError('');
  }

  function chooseServiceType(
    serviceType: ServiceType,
  ) {
    setSelectedServiceType(
      serviceType,
    );

    setSelectedServerId('');
    setPricingMode('');
    setAvailablePlans([]);
    setSelectedPlanId('');
    setSelectedInboundIds([]);
    setPriceQuote(null);
  }

  function chooseServer(
    serverId: string,
  ) {
    setSelectedServerId(serverId);
    setPricingMode('');
    setAvailablePlans([]);
    setSelectedPlanId('');
    setSelectedInboundIds([]);
    setPriceQuote(null);
  }

  function choosePricingMode(
    mode: PricingMode,
  ) {
    setPricingMode(mode);
    setSelectedPlanId('');
    setSelectedInboundIds([]);
    setPriceQuote(null);
  }

  function choosePlan(
    planId: string,
  ) {
    setSelectedPlanId(planId);
    setSelectedInboundIds([]);
  }

  function toggleInbound(
    inboundId: string,
  ) {
    if (!supportsMultiInbound) {
      setSelectedInboundIds([
        inboundId,
      ]);

      return;
    }

    setSelectedInboundIds(
      (current) =>
        current.includes(inboundId)
          ? current.filter(
            (id) =>
              id !== inboundId,
          )
          : [
            ...current,
            inboundId,
          ],
    );
  }

  async function handleCreateConfig() {
    if (
      !selectedPlanId ||
      !selectedServerId ||
      !pricingMode ||
      selectedInboundIds.length === 0 ||
      !email.trim()
    ) {
      toast.error(
        'لطفاً همه مراحل را کامل کن',
      );

      return;
    }

    if (
      healthStatus(selectedServer) ===
      'unhealthy'
    ) {
      toast.error(
        'این سرور در حال حاضر ناسالم است',
      );

      return;
    }

    if (priceError) {
      toast.error(priceError);
      return;
    }

    if (!hasEnoughBalance) {
      toast.error(
        'موجودی کیف پول کافی نیست',
      );

      return;
    }

    setIsProcessing(true);
    setResult(null);

    try {
      const response =
        await backend.orders
          .createConfig({
            planId:
              selectedPlanId,

            serverId:
              selectedServerId,

            pricingMode,

            inboundId:
              selectedInboundIds[0],

            inboundIds:
              selectedInboundIds,

            email: email.trim(),

            idempotencyKey:
              makeIdempotencyKey(
                email.trim(),
              ),
          });

      setResult({
        order: response.order,
        endUser:
          response.endUser,

        configLink:
          response.configLink,

        configLinks:
          response.configLinks?.length
            ? response.configLinks
            : response.configLink
              ? [
                response.configLink,
              ]
              : [],

        subscriptionLink:
          response.subscriptionLink,
      });

      setStep(5);

      toast.success(
        'کانفیگ با موفقیت ساخته شد',
      );

      await reload();
    } catch (createError: any) {
      toast.error(
        createError?.message ||
        'خطا در ساخت کانفیگ',
      );
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
        <ErrorState
          message={
            error ||
            'خطا در دریافت اطلاعات ساخت کانفیگ'
          }
          onRetry={reload}
        />
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
                نوع سرویس، سرور سالم، نوع پلن و اینباندها را انتخاب کن.
              </p>
            </div>

            <Button
              variant="outline"
              leftIcon={
                <RotateCcw className="h-4 w-4" />
              }
              onClick={resetForm}
            >
              شروع مجدد
            </Button>
          </div>
        </div>

        <Card className="overflow-hidden border-0 bg-gradient-to-l from-sky-600 via-indigo-600 to-violet-600">
          <CardContent className="relative p-0">
            <div className="relative flex flex-col gap-5 p-5 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-4">
                <div className="rounded-2xl bg-white/20 p-3 ring-1 ring-white/30">
                  <Wallet className="h-8 w-8 text-white" />
                </div>

                <div>
                  <p className="text-sm text-sky-100">
                    موجودی کیف پول
                  </p>

                  <p className="mt-1 text-2xl font-bold text-white">
                    {formatPrice(
                      walletBalance,
                    )}
                  </p>

                  {minBalance > 0 && (
                    <p className="mt-1 text-xs text-sky-100">
                      حد هشدار:{' '}
                      {formatPrice(
                        minBalance,
                      )}
                    </p>
                  )}
                </div>
              </div>

              {selectedPlan && (
                <div className="rounded-2xl bg-white/15 p-4 ring-1 ring-white/25">
                  <p className="text-sm text-sky-100">
                    مبلغ سفارش
                  </p>

                  <div className="mt-1 flex items-center gap-2">
                    <p className="text-xl font-bold text-white">
                      {priceLoading
                        ? 'در حال محاسبه...'
                        : formatPrice(
                          finalPrice,
                        )}
                    </p>

                    {priceLoading && (
                      <Loader2 className="h-4 w-4 animate-spin text-white" />
                    )}
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
              <CardTitle>
                مرحله ۱: نوع سرویس
              </CardTitle>
            </CardHeader>

            <CardContent className="space-y-5">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <ChoiceCard
                  active={
                    selectedServiceType ===
                    'direct'
                  }
                  title="سرور مستقیم"
                  description="اتصال مستقیم به سرور مقصد"
                  icon={
                    <Zap className="h-6 w-6" />
                  }
                  onClick={() =>
                    chooseServiceType(
                      'direct',
                    )
                  }
                />

                <ChoiceCard
                  active={
                    selectedServiceType ===
                    'tunnel'
                  }
                  title="سرور تانل"
                  description="اتصال از مسیر تانل‌شده"
                  icon={
                    <Network className="h-6 w-6" />
                  }
                  onClick={() =>
                    chooseServiceType(
                      'tunnel',
                    )
                  }
                />
              </div>

              <div className="flex justify-end">
                <Button
                  disabled={
                    !selectedServiceType
                  }
                  onClick={() =>
                    setStep(2)
                  }
                >
                  ادامه انتخاب سرور
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === 2 && (
          <Card>
            <CardHeader>
              <CardTitle>
                مرحله ۲: انتخاب سرور سالم
              </CardTitle>
            </CardHeader>

            <CardContent className="space-y-5">
              <div className="rounded-xl bg-sky-50 p-4 text-sm text-sky-700 dark:bg-sky-900/30 dark:text-sky-200">
                سرورهای ناسالم و غیرفعال برای سفارش جدید نمایش داده نمی‌شوند.
              </div>

              {!serviceServers.length ? (
                <EmptyState text="سرور سالمی از این نوع برای حساب شما وجود ندارد." />
              ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {serviceServers.map(
                    (serverItem: any) => {
                      const active =
                        selectedServerId ===
                        String(
                          serverItem.id,
                        );

                      const count =
                        inbounds.filter(
                          (inbound: any) =>
                            inboundServerId(
                              inbound,
                            ) ===
                            String(
                              serverItem.id,
                            ),
                        ).length;

                      return (
                        <ChoiceCard
                          key={serverItem.id}
                          active={active}
                          title={
                            serverItem.name
                          }
                          description={
                            serverLocation(
                              serverItem,
                            )
                          }
                          icon={
                            <Server className="h-6 w-6" />
                          }
                          footer={
                            `${count} اینباند — ${serverItem.host
                            }:${serverItem.port}`
                          }
                          onClick={() =>
                            chooseServer(
                              String(
                                serverItem.id,
                              ),
                            )
                          }
                        />
                      );
                    },
                  )}
                </div>
              )}

              <div className="flex justify-between gap-3">
                <Button
                  variant="outline"
                  onClick={() =>
                    setStep(1)
                  }
                >
                  قبلی
                </Button>

                <Button
                  disabled={
                    !selectedServerId
                  }
                  onClick={() =>
                    setStep(3)
                  }
                >
                  ادامه انتخاب پلن
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === 3 && (
          <Card>
            <CardHeader>
              <CardTitle>
                مرحله ۳: نوع پلن و پلن
              </CardTitle>
            </CardHeader>

            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <ChoiceCard
                  active={
                    pricingMode ===
                    'global'
                  }
                  title="پلن عادی"
                  description="پلن‌های عمومی قابل استفاده روی این سرور"
                  icon={
                    <Package className="h-6 w-6" />
                  }
                  onClick={() =>
                    choosePricingMode(
                      'global',
                    )
                  }
                />

                <ChoiceCard
                  active={
                    pricingMode ===
                    'server'
                  }
                  title="پلن اختصاصی سرور"
                  description="پلن‌ها و قیمت‌هایی که ادمین برای همین سرور تعریف کرده است"
                  icon={
                    <ShieldCheck className="h-6 w-6" />
                  }
                  onClick={() =>
                    choosePricingMode(
                      'server',
                    )
                  }
                />
              </div>

              {pricingMode && (
                <div className="space-y-4">
                  {plansLoading ? (
                    <LoadingState />
                  ) : plansError ? (
                    <div className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700 dark:bg-rose-900/30 dark:text-rose-200">
                      {plansError}
                    </div>
                  ) : !availablePlans.length ? (
                    <EmptyState
                      text={
                        pricingMode ===
                          'server'
                          ? 'برای این سرور پلن اختصاصی فعالی تعریف نشده است.'
                          : 'پلن عمومی فعالی برای این سرور وجود ندارد.'
                      }
                    />
                  ) : (
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                      {availablePlans.map(
                        (plan: any) => {
                          const active =
                            selectedPlanId ===
                            String(
                              plan.id,
                            );

                          return (
                            <button
                              key={plan.id}
                              type="button"
                              onClick={() =>
                                choosePlan(
                                  String(
                                    plan.id,
                                  ),
                                )
                              }
                              className={`rounded-2xl border-2 p-4 text-right transition ${active
                                  ? 'border-sky-500 bg-sky-50 shadow-sm dark:bg-sky-900/25'
                                  : 'border-slate-200 bg-white hover:border-sky-300 dark:border-slate-700 dark:bg-slate-900'
                                }`}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="font-bold text-slate-800 dark:text-slate-100">
                                    {plan.name}
                                  </p>

                                  <p className="mt-1 line-clamp-2 text-xs text-slate-500">
                                    {plan.description ||
                                      'بدون توضیح'}
                                  </p>
                                </div>

                                {active && (
                                  <span className="rounded-full bg-sky-600 p-1 text-white">
                                    <Check className="h-4 w-4" />
                                  </span>
                                )}
                              </div>

                              <div className="mt-4 grid grid-cols-3 gap-2">
                                <PlanMini
                                  label="حجم"
                                  value={`${planTrafficGB(
                                    plan,
                                  )} GB`}
                                />

                                <PlanMini
                                  label="مدت"
                                  value={`${planDurationDays(
                                    plan,
                                  )} روز`}
                                />

                                <PlanMini
                                  label="IP"
                                  value={String(
                                    planIpLimit(
                                      plan,
                                    ) ||
                                    'نامحدود',
                                  )}
                                />
                              </div>

                              <div className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-700">
                                <p className="text-xs text-slate-500">
                                  مبلغ نهایی
                                </p>

                                <p className="mt-1 text-lg font-bold text-sky-600 dark:text-sky-300">
                                  {formatPrice(
                                    planBasePrice(
                                      plan,
                                    ),
                                  )}
                                </p>
                              </div>
                            </button>
                          );
                        },
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="flex justify-between gap-3">
                <Button
                  variant="outline"
                  onClick={() =>
                    setStep(2)
                  }
                >
                  قبلی
                </Button>

                <Button
                  disabled={
                    !pricingMode ||
                    !selectedPlanId
                  }
                  onClick={() =>
                    setStep(4)
                  }
                >
                  ادامه انتخاب اینباند
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === 4 && effectivePlan && (
          <Card>
            <CardHeader>
              <CardTitle>
                مرحله ۴: اینباند و تأیید سفارش
              </CardTitle>
            </CardHeader>

            <CardContent className="space-y-6">
              <div>
                <p className="mb-3 text-sm font-medium text-slate-700 dark:text-slate-200">
                  اینباندها / پروتکل‌ها
                </p>

                {!serverInbounds.length ? (
                  <div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-700 dark:bg-amber-900/30 dark:text-amber-200">
                    این پلن روی هیچ اینباند فعالی از این سرور قابل استفاده نیست.
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {serverInbounds.map(
                      (inbound: any) => {
                        const inboundId =
                          String(
                            inbound.id,
                          );

                        const active =
                          selectedInboundIds
                            .includes(
                              inboundId,
                            );

                        return (
                          <button
                            key={
                              inbound.id
                            }
                            type="button"
                            onClick={() =>
                              toggleInbound(
                                inboundId,
                              )
                            }
                            className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium ${active
                                ? 'border-sky-600 bg-sky-600 text-white'
                                : 'border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'
                              }`}
                          >
                            <Wifi className="h-4 w-4" />

                            {inbound.name}

                            <span className="opacity-70">
                              {inbound.protocol}:
                              {inbound.port}
                            </span>

                            {active && (
                              <Check className="h-4 w-4" />
                            )}
                          </button>
                        );
                      },
                    )}
                  </div>
                )}

                {!!serverInbounds.length && (
                  <p className="mt-3 text-xs text-slate-500">
                    {supportsMultiInbound
                      ? `${selectedInboundIds.length} اینباند انتخاب شده است.`
                      : 'این سرور در حالت قدیمی است و فقط یک اینباند قابل انتخاب است.'}
                  </p>
                )}
              </div>

              <Input
                label="ایمیل یا شناسه کاربر"
                placeholder="user@example.com"
                value={email}
                onChange={(event) =>
                  setEmail(
                    event.target.value,
                  )
                }
              />

              <div className="rounded-2xl bg-slate-50 p-5 dark:bg-slate-800">
                <h3 className="font-bold">
                  خلاصه سفارش
                </h3>

                <div className="mt-4 space-y-3 text-sm">
                  <SummaryRow
                    label="نوع سرویس"
                    value={
                      selectedServiceType ===
                        'tunnel'
                        ? 'تانل'
                        : 'مستقیم'
                    }
                  />

                  <SummaryRow
                    label="سرور"
                    value={
                      selectedServer?.name ||
                      '-'
                    }
                  />

                  <SummaryRow
                    label="نوع پلن"
                    value={
                      pricingMode ===
                        'server'
                        ? 'اختصاصی سرور'
                        : 'عادی'
                    }
                  />

                  <SummaryRow
                    label="پلن"
                    value={
                      effectivePlan.name
                    }
                  />

                  <SummaryRow
                    label="اینباندها"
                    value={
                      selectedInbounds.length
                        ? selectedInbounds
                          .map(
                            (
                              inbound: any,
                            ) =>
                              `${inbound.name} / ${inbound.protocol}:${inbound.port}`,
                          )
                          .join('، ')
                        : '-'
                    }
                  />

                  <SummaryRow
                    label="ترافیک"
                    value={`${planTrafficGB(
                      effectivePlan,
                    )} GB`}
                  />

                  <SummaryRow
                    label="مدت"
                    value={`${planDurationDays(
                      effectivePlan,
                    )} روز`}
                  />

                  <SummaryRow
                    label="قیمت هر GB"
                    value={formatPrice(
                      finalPricePerGB,
                    )}
                  />

                  <div className="border-t border-slate-200 pt-3 dark:border-slate-700">
                    <SummaryRow
                      label="مبلغ نهایی"
                      value={
                        priceLoading
                          ? 'در حال محاسبه...'
                          : formatPrice(
                            finalPrice,
                          )
                      }
                      strong
                    />
                  </div>
                </div>
              </div>

              {priceError && (
                <div className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700 dark:bg-rose-900/30 dark:text-rose-200">
                  {priceError}
                </div>
              )}

              {!hasEnoughBalance && (
                <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-700 dark:border-rose-800 dark:bg-rose-900/30 dark:text-rose-200">
                  <AlertTriangle className="mt-0.5 h-5 w-5" />

                  <div>
                    <p className="font-bold">
                      موجودی کیف پول کافی نیست.
                    </p>

                    <p className="mt-1 text-sm">
                      کسری:{' '}
                      {formatPrice(
                        shortage,
                      )}
                    </p>
                  </div>
                </div>
              )}

              <div className="flex justify-between gap-3">
                <Button
                  variant="outline"
                  onClick={() =>
                    setStep(3)
                  }
                >
                  قبلی
                </Button>

                <Button
                  isLoading={
                    isProcessing
                  }
                  disabled={
                    !email.trim() ||
                    selectedInboundIds
                      .length === 0 ||
                    !hasEnoughBalance ||
                    isProcessing ||
                    priceLoading ||
                    !!priceError
                  }
                  onClick={
                    handleCreateConfig
                  }
                >
                  پرداخت و ساخت کانفیگ
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === 5 && result && (
          <Card>
            <CardHeader>
              <CardTitle>
                کانفیگ با موفقیت ساخته شد
              </CardTitle>
            </CardHeader>

            <CardContent className="space-y-6">
              <div className="rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-200">
                سفارش ثبت شد، کیف پول بروزرسانی شد و لینک‌ها آماده هستند.
              </div>

              {result.subscriptionLink && (
                <LinkBox
                  label="لینک اشتراک"
                  value={
                    result.subscriptionLink
                  }
                  onCopy={() =>
                    copyText(
                      result.subscriptionLink,
                      'لینک اشتراک',
                    )
                  }
                />
              )}

              {result.configLinks.map(
                (link, index) => (
                  <LinkBox
                    key={`${index}-${link}`}
                    label={`لینک کانفیگ ${index + 1
                      }`}
                    value={link}
                    onCopy={() =>
                      copyText(
                        link,
                        `لینک کانفیگ ${index + 1
                        }`,
                      )
                    }
                  />
                ),
              )}

              <div className="grid gap-4 md:grid-cols-2">
                {result.subscriptionLink && (
                  <QrResult
                    title="QR اشتراک"
                    value={
                      result.subscriptionLink
                    }
                  />
                )}

                {result.configLinks.map(
                  (link, index) => (
                    <QrResult
                      key={`${index}-${link}`}
                      title={`QR کانفیگ ${index + 1
                        }`}
                      value={link}
                    />
                  ),
                )}
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
                <Button
                  variant="outline"
                  onClick={() =>
                    copyText(
                      [
                        result.subscriptionLink,
                        ...result.configLinks,
                      ]
                        .filter(Boolean)
                        .join('\n'),
                      'همه لینک‌ها',
                    )
                  }
                >
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

function Stepper({
  step,
}: {
  step: number;
}) {
  const items = [
    {
      id: 1,
      label: 'نوع سرویس',
    },
    {
      id: 2,
      label: 'سرور',
    },
    {
      id: 3,
      label: 'پلن',
    },
    {
      id: 4,
      label: 'تأیید',
    },
    {
      id: 5,
      label: 'تحویل',
    },
  ];

  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100 dark:bg-slate-800/70 dark:ring-slate-700">
      <div className="flex items-center justify-between gap-2">
        {items.map((item) => (
          <div
            key={item.id}
            className="flex flex-1 items-center gap-2"
          >
            <div
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold ${step >= item.id
                  ? 'bg-sky-600 text-white'
                  : 'bg-slate-100 text-slate-400 dark:bg-slate-700'
                }`}
            >
              {step > item.id
                ? (
                  <Check className="h-4 w-4" />
                )
                : item.id}
            </div>

            <span className="hidden text-xs font-medium text-slate-500 md:block">
              {item.label}
            </span>

            {item.id <
              items.length && (
                <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
              )}
          </div>
        ))}
      </div>
    </div>
  );
}

function ChoiceCard({
  active,
  title,
  description,
  footer,
  icon,
  onClick,
}: {
  active: boolean;
  title: string;
  description: string;
  footer?: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-2xl border-2 p-5 text-right transition ${active
          ? 'border-sky-500 bg-sky-50 dark:bg-sky-900/25'
          : 'border-slate-200 bg-white hover:border-sky-300 dark:border-slate-700 dark:bg-slate-900'
        }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-sky-100 p-3 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300">
            {icon}
          </div>

          <div>
            <p className="font-bold text-slate-800 dark:text-slate-100">
              {title}
            </p>

            <p className="mt-1 text-sm text-slate-500">
              {description}
            </p>
          </div>
        </div>

        {active && (
          <span className="rounded-full bg-sky-600 p-1 text-white">
            <Check className="h-4 w-4" />
          </span>
        )}
      </div>

      {footer && (
        <p className="mt-4 rounded-xl bg-slate-50 p-2 text-xs text-slate-500 dark:bg-slate-800">
          {footer}
        </p>
      )}
    </button>
  );
}

function PlanMini({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl bg-slate-50 p-2 text-center dark:bg-slate-800">
      <p className="text-xs text-slate-500">
        {label}
      </p>

      <p className="mt-1 text-sm font-bold">
        {value}
      </p>
    </div>
  );
}

function SummaryRow({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-slate-500">
        {label}
      </span>

      <span
        className={
          strong
            ? 'font-bold text-sky-600 dark:text-sky-300'
            : 'text-left font-medium text-slate-800 dark:text-slate-100'
        }
      >
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
    <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-700">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="font-medium">
          {label}
        </p>

        <Button
          variant="outline"
          size="sm"
          onClick={onCopy}
        >
          <Copy className="h-4 w-4" />
        </Button>
      </div>

      <div
        dir="ltr"
        className="break-all rounded-xl bg-slate-50 p-3 text-left font-mono text-xs dark:bg-slate-800"
      >
        {value}
      </div>
    </div>
  );
}

function QrResult({
  title,
  value,
}: {
  title: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 p-5 text-center dark:border-slate-700">
      <div className="mb-4 flex items-center justify-center gap-2">
        <QrCode className="h-5 w-5 text-sky-600" />
        <p className="font-medium">
          {title}
        </p>
      </div>

      <div className="inline-block rounded-xl bg-white p-3">
        <QRCodeSVG
          value={value}
          size={190}
          level="M"
        />
      </div>
    </div>
  );
}