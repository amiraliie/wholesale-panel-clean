import {
  useMemo,
  useState,
} from 'react';

import {
  Activity,
  Ban,
  CheckCircle2,
  Clock,
  Edit3,
  Eye,
  Network,
  Plus,
  Search,
  Server,
  ShieldAlert,
  Trash2,
  Users,
  WalletCards,
  Wifi,
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

import { StatusBadge } from
  '../../components/ui/Badge';

import { Modal } from
  '../../components/ui/Modal';

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

type PlanScope =
  | 'global'
  | 'server';

type ModalType =
  | 'create'
  | 'edit'
  | 'status'
  | 'delete';

type PlanForm = {
  name: string;
  description: string;

  trafficGB: string;
  durationDays: string;
  basePrice: string;
  pricePerGB: string;
  ipLimit: string;

  scope: PlanScope;
  serverId: string;

  allowedInboundIds: string[];

  flatPrice: string;
  offerPricePerGB: string;

  trafficGBOverride: string;
  durationDaysOverride: string;
  ipLimitOverride: string;

  isOfferActive: boolean;
};

const emptyForm: PlanForm = {
  name: '',
  description: '',

  trafficGB: '10',
  durationDays: '30',
  basePrice: '0',
  pricePerGB: '0',
  ipLimit: '1',

  scope: 'global',
  serverId: '',

  allowedInboundIds: [],

  flatPrice: '',
  offerPricePerGB: '',

  trafficGBOverride: '',
  durationDaysOverride: '',
  ipLimitOverride: '',

  isOfferActive: true,
};

function getValue(
  item: any,
  camel: string,
  snake: string,
  fallback: any = '',
) {
  if (
    item?.[camel] !== undefined &&
    item?.[camel] !== null
  ) {
    return item[camel];
  }

  if (
    item?.[snake] !== undefined &&
    item?.[snake] !== null
  ) {
    return item[snake];
  }

  return fallback;
}

function numberValue(value: string) {
  const parsed = Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : 0;
}

function optionalNumber(
  value: string,
): number | null {
  if (!value.trim()) {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : null;
}

function planScope(plan: any): PlanScope {
  return getValue(
    plan,
    'scope',
    'scope',
    'global',
  ) === 'server'
    ? 'server'
    : 'global';
}

function serverOffers(plan: any): any[] {
  const offers = getValue(
    plan,
    'serverOffers',
    'server_offers',
    [],
  );

  return Array.isArray(offers)
    ? offers
    : [];
}

function toForm(plan: any): PlanForm {
  const offer =
    serverOffers(plan)[0] || null;

  const inboundIds = getValue(
    plan,
    'allowedInboundIds',
    'allowed_inbound_ids',
    [],
  );

  return {
    name: String(plan.name || ''),

    description: String(
      plan.description || '',
    ),

    trafficGB: String(
      getValue(
        plan,
        'trafficGB',
        'traffic_gb',
        10,
      ),
    ),

    durationDays: String(
      getValue(
        plan,
        'durationDays',
        'duration_days',
        30,
      ),
    ),

    basePrice: String(
      getValue(
        plan,
        'basePrice',
        'base_price',
        0,
      ),
    ),

    pricePerGB: String(
      getValue(
        plan,
        'pricePerGB',
        'price_per_gb',
        0,
      ),
    ),

    ipLimit: String(
      getValue(
        plan,
        'ipLimit',
        'ip_limit',
        1,
      ),
    ),

    scope: planScope(plan),

    serverId: String(
      getValue(
        offer,
        'serverId',
        'server_id',
        '',
      ),
    ),

    allowedInboundIds:
      Array.isArray(inboundIds)
        ? inboundIds.map(String)
        : [],

    flatPrice:
      offer?.flatPrice != null
        ? String(offer.flatPrice)
        : '',

    offerPricePerGB:
      offer?.pricePerGB != null
        ? String(offer.pricePerGB)
        : '',

    trafficGBOverride:
      offer?.trafficGBOverride != null
        ? String(
          offer.trafficGBOverride,
        )
        : '',

    durationDaysOverride:
      offer?.durationDaysOverride != null
        ? String(
          offer.durationDaysOverride,
        )
        : '',

    ipLimitOverride:
      offer?.ipLimitOverride != null
        ? String(
          offer.ipLimitOverride,
        )
        : '',

    isOfferActive:
      offer?.isActive !== false,
  };
}

function isPlanActive(plan: any) {
  return getValue(
    plan,
    'isActive',
    'is_active',
    true,
  ) !== false;
}

function endUsersCount(plan: any) {
  return Number(
    getValue(
      plan,
      'endUsersCount',
      'end_users_count',
      0,
    ),
  );
}

function ordersCount(plan: any) {
  return Number(
    getValue(
      plan,
      'ordersCount',
      'orders_count',
      0,
    ),
  );
}

function inboundServerId(inbound: any) {
  return String(
    getValue(
      inbound,
      'serverId',
      'server_id',
      '',
    ),
  );
}

function reasonLabel(reason: string) {
  const labels: Record<string, string> = {
    CUSTOMER_DISABLED:
      'حساب مشتری غیرفعال است',

    PLAN_NOT_ALLOWED:
      'پلن برای مشتری مجاز نیست',

    NO_ACCESSIBLE_SERVER_OR_INBOUND:
      'سرور یا اینباند قابل استفاده ندارد',
  };

  return labels[reason] || reason;
}

export default function PlansPage() {
  const {
    data,
    isLoading,
    error,
    reload,
  } = useRemoteData(
    async () => ({
      plans:
        await backend.plans.list(),

      servers:
        await backend.servers.list(),

      inbounds:
        await backend.inbounds.list(),
    }),
    [],
  );

  const plans = data?.plans || [];
  const servers = data?.servers || [];
  const inbounds = data?.inbounds || [];

  const [
    searchTerm,
    setSearchTerm,
  ] = useState('');

  const [
    modal,
    setModal,
  ] = useState<{
    type: ModalType;
    plan?: any;
  } | null>(null);

  const [
    selectedPlan,
    setSelectedPlan,
  ] = useState<any | null>(null);

  const [
    form,
    setForm,
  ] = useState<PlanForm>(
    emptyForm,
  );

  const [
    isSubmitting,
    setIsSubmitting,
  ] = useState(false);

  const [
    preview,
    setPreview,
  ] = useState<any | null>(null);

  const [
    previewLoading,
    setPreviewLoading,
  ] = useState(false);

  const filteredPlans = useMemo(
    () =>
      plans.filter((plan: any) => {
        const offers =
          serverOffers(plan);

        const haystack = [
          plan.name,
          plan.description,
          plan.scope,
          ...offers.map(
            (offer: any) =>
              `${offer.serverName || ''} ${offer.serverHost || ''
              }`,
          ),
        ]
          .join(' ')
          .toLowerCase();

        return haystack.includes(
          searchTerm.toLowerCase(),
        );
      }),
    [plans, searchTerm],
  );

  const totals = useMemo(
    () => ({
      total: plans.length,

      active: plans.filter(
        (plan: any) =>
          isPlanActive(plan),
      ).length,

      users: plans.reduce(
        (
          sum: number,
          plan: any,
        ) =>
          sum +
          endUsersCount(plan),
        0,
      ),

      orders: plans.reduce(
        (
          sum: number,
          plan: any,
        ) =>
          sum +
          ordersCount(plan),
        0,
      ),
    }),
    [plans],
  );

  const availableInbounds =
    useMemo(() => {
      if (
        form.scope === 'server'
      ) {
        return inbounds.filter(
          (inbound: any) =>
            inboundServerId(inbound) ===
            form.serverId,
        );
      }

      return inbounds;
    }, [
      inbounds,
      form.scope,
      form.serverId,
    ]);

  function openCreateModal() {
    setSelectedPlan(null);
    setForm({ ...emptyForm });
    setPreview(null);

    setModal({
      type: 'create',
    });
  }

  function openEditModal(plan: any) {
    setSelectedPlan(plan);
    setForm(toForm(plan));
    setPreview(null);

    setModal({
      type: 'edit',
      plan,
    });
  }

  function closeModal() {
    if (isSubmitting) {
      return;
    }

    setModal(null);
    setSelectedPlan(null);
    setPreview(null);
  }

  function buildPayload() {
    return {
      name: form.name.trim(),

      description:
        form.description.trim() ||
        undefined,

      trafficGB:
        numberValue(form.trafficGB),

      durationDays:
        numberValue(
          form.durationDays,
        ),

      basePrice:
        numberValue(form.basePrice),

      pricePerGB:
        numberValue(form.pricePerGB),

      ipLimit:
        numberValue(form.ipLimit),

      scope: form.scope,

      serverId:
        form.scope === 'server'
          ? form.serverId
          : undefined,

      allowedInboundIds:
        form.allowedInboundIds,

      flatPrice:
        form.scope === 'server'
          ? optionalNumber(
            form.flatPrice,
          )
          : null,

      offerPricePerGB:
        form.scope === 'server'
          ? optionalNumber(
            form.offerPricePerGB,
          )
          : null,

      trafficGBOverride:
        form.scope === 'server'
          ? optionalNumber(
            form.trafficGBOverride,
          )
          : null,

      durationDaysOverride:
        form.scope === 'server'
          ? optionalNumber(
            form.durationDaysOverride,
          )
          : null,

      ipLimitOverride:
        form.scope === 'server'
          ? optionalNumber(
            form.ipLimitOverride,
          )
          : null,

      isOfferActive:
        form.isOfferActive,
    };
  }

  function validateForm() {
    if (form.name.trim().length < 2) {
      alert(
        'نام پلن را کامل وارد کنید',
      );

      return false;
    }

    if (
      form.scope === 'server' &&
      !form.serverId
    ) {
      alert(
        'برای پلن اختصاصی، سرور را انتخاب کنید',
      );

      return false;
    }

    return true;
  }

  async function createPlan() {
    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);

    try {
      await backend.plans.create({
        ...buildPayload(),
        isActive: true,
      });

      closeModal();
      await reload();
    } catch (err: any) {
      alert(
        err.message ||
        'خطا در ایجاد پلن',
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function updatePlan() {
    if (
      !selectedPlan ||
      !validateForm()
    ) {
      return;
    }

    setIsSubmitting(true);

    try {
      await backend.plans.update(
        selectedPlan.id,
        buildPayload(),
      );

      closeModal();
      await reload();
    } catch (err: any) {
      alert(
        err.message ||
        'خطا در ویرایش پلن',
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function loadPreview() {
    if (
      form.scope === 'server' &&
      !form.serverId
    ) {
      alert(
        'ابتدا سرور اختصاصی را انتخاب کنید',
      );

      return;
    }

    setPreviewLoading(true);

    try {
      const response =
        await backend.plans.accessPreview(
          {
            planId:
              selectedPlan?.id,

            scope: form.scope,

            serverId:
              form.scope === 'server'
                ? form.serverId
                : undefined,

            allowedInboundIds:
              form.allowedInboundIds,
          },
        );

      setPreview(response);
    } catch (err: any) {
      alert(
        err.message ||
        'خطا در پیش‌نمایش دسترسی',
      );
    } finally {
      setPreviewLoading(false);
    }
  }

  async function toggleStatus() {
    if (!selectedPlan) {
      return;
    }

    setIsSubmitting(true);

    try {
      await backend.plans.setStatus(
        selectedPlan.id,
        {
          isActive:
            !isPlanActive(
              selectedPlan,
            ),
        },
      );

      closeModal();
      await reload();
    } catch (err: any) {
      alert(
        err.message ||
        'خطا در تغییر وضعیت پلن',
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function deletePlan() {
    if (!selectedPlan) {
      return;
    }

    setIsSubmitting(true);

    try {
      await backend.plans.remove(
        selectedPlan.id,
      );

      closeModal();
      await reload();
    } catch (err: any) {
      alert(
        err.message ||
        'این پلن سابقه استفاده دارد؛ آن را غیرفعال کنید.',
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <DashboardLayout title="مدیریت پلن‌ها">
        <LoadingState />
      </DashboardLayout>
    );
  }

  if (error || !data) {
    return (
      <DashboardLayout title="مدیریت پلن‌ها">
        <ErrorState
          message={
            error ||
            'خطا در دریافت پلن‌ها'
          }
          onRetry={reload}
        />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="مدیریت پلن‌ها">
      <div className="space-y-6">
        <div className="rounded-2xl border border-slate-200 bg-gradient-to-l from-cyan-50 via-white to-violet-50 p-5 shadow-sm dark:border-slate-700 dark:from-slate-900 dark:via-slate-900 dark:to-violet-950/40">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">
                پلن‌های فروش
              </h2>

              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                مدیریت پلن‌های عمومی و پلن‌های اختصاصی هر سرور
              </p>
            </div>

            <Button
              leftIcon={
                <Plus className="h-4 w-4" />
              }
              onClick={openCreateModal}
            >
              پلن جدید
            </Button>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Stat
              icon={<WalletCards className="h-5 w-5" />}
              label="کل پلن‌ها"
              value={totals.total}
            />

            <Stat
              icon={<CheckCircle2 className="h-5 w-5" />}
              label="فعال"
              value={totals.active}
            />

            <Stat
              icon={<Users className="h-5 w-5" />}
              label="کاربران"
              value={totals.users}
            />

            <Stat
              icon={<Activity className="h-5 w-5" />}
              label="سفارش‌ها"
              value={totals.orders}
            />
          </div>
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <CardTitle>
                لیست پلن‌ها
              </CardTitle>

              <div className="relative w-full md:max-w-md">
                <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

                <Input
                  placeholder="جستجوی پلن یا سرور..."
                  value={searchTerm}
                  onChange={(event) =>
                    setSearchTerm(
                      event.target.value,
                    )
                  }
                  className="pr-10"
                />
              </div>
            </div>
          </CardHeader>

          <CardContent>
            {!filteredPlans.length ? (
              <EmptyState />
            ) : (
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
                {filteredPlans.map(
                  (plan: any) => {
                    const active =
                      isPlanActive(plan);

                    const scope =
                      planScope(plan);

                    const offers =
                      serverOffers(plan);

                    const offer =
                      offers[0];

                    const trafficGB =
                      Number(
                        getValue(
                          plan,
                          'trafficGB',
                          'traffic_gb',
                          0,
                        ),
                      );

                    const durationDays =
                      Number(
                        getValue(
                          plan,
                          'durationDays',
                          'duration_days',
                          0,
                        ),
                      );

                    const basePrice =
                      Number(
                        getValue(
                          plan,
                          'basePrice',
                          'base_price',
                          0,
                        ),
                      );

                    const ipLimit =
                      Number(
                        getValue(
                          plan,
                          'ipLimit',
                          'ip_limit',
                          1,
                        ),
                      );

                    return (
                      <div
                        key={plan.id}
                        className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="font-bold text-slate-800 dark:text-slate-100">
                                {plan.name}
                              </h3>

                              <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${scope === 'server'
                                ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300'
                                : 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300'
                                }`}>
                                {scope === 'server'
                                  ? 'اختصاصی سرور'
                                  : 'عمومی'}
                              </span>
                            </div>

                            <p className="mt-2 line-clamp-2 text-sm text-slate-500">
                              {plan.description ||
                                'بدون توضیح'}
                            </p>
                          </div>

                          <StatusBadge
                            status={
                              active
                                ? 'active'
                                : 'disabled'
                            }
                          />
                        </div>

                        {scope === 'server' && (
                          <div className="mt-4 rounded-xl bg-violet-50 p-3 text-sm text-violet-700 dark:bg-violet-900/25 dark:text-violet-200">
                            <div className="flex items-center gap-2">
                              <Server className="h-4 w-4" />

                              <span>
                                {offer?.serverName ||
                                  'سرور نامشخص'}
                              </span>
                            </div>

                            {offer?.serverHost && (
                              <div className="mt-1 text-xs opacity-80">
                                {offer.serverHost}
                              </div>
                            )}
                          </div>
                        )}

                        <div className="mt-5 grid grid-cols-2 gap-3">
                          <InfoBox
                            icon={<Wifi className="h-4 w-4" />}
                            label="ترافیک"
                            value={`${trafficGB} GB`}
                          />

                          <InfoBox
                            icon={<Clock className="h-4 w-4" />}
                            label="مدت"
                            value={`${durationDays} روز`}
                          />

                          <InfoBox
                            icon={<ShieldAlert className="h-4 w-4" />}
                            label="IP"
                            value={String(ipLimit)}
                          />

                          <InfoBox
                            icon={<WalletCards className="h-4 w-4" />}
                            label="قیمت پایه"
                            value={formatPrice(basePrice)}
                          />
                        </div>

                        <div className="mt-4 flex justify-between rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800">
                          <span className="text-slate-500">
                            کاربران / سفارش‌ها
                          </span>

                          <span className="font-medium">
                            {endUsersCount(plan)}
                            {' / '}
                            {ordersCount(plan)}
                          </span>
                        </div>

                        <div className="mt-4 flex gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              openEditModal(plan)
                            }
                          >
                            <Edit3 className="h-4 w-4" />
                          </Button>

                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSelectedPlan(plan);

                              setModal({
                                type: 'status',
                                plan,
                              });
                            }}
                          >
                            {active ? (
                              <Ban className="h-4 w-4 text-amber-600" />
                            ) : (
                              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                            )}
                          </Button>

                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSelectedPlan(plan);

                              setModal({
                                type: 'delete',
                                plan,
                              });
                            }}
                          >
                            <Trash2 className="h-4 w-4 text-rose-600" />
                          </Button>
                        </div>
                      </div>
                    );
                  },
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Modal
          isOpen={
            modal?.type === 'create' ||
            modal?.type === 'edit'
          }
          onClose={closeModal}
          title={
            modal?.type === 'edit'
              ? `ویرایش پلن - ${selectedPlan?.name || ''
              }`
              : 'ایجاد پلن جدید'
          }
          size="lg"
        >
          <PlanFormFields
            form={form}
            setForm={setForm}
            servers={servers}
            inbounds={availableInbounds}
            preview={preview}
            previewLoading={previewLoading}
            onPreview={loadPreview}
          />

          <div className="mt-6 flex justify-end gap-3">
            <Button
              variant="outline"
              onClick={closeModal}
            >
              انصراف
            </Button>

            <Button
              isLoading={isSubmitting}
              onClick={
                modal?.type === 'edit'
                  ? updatePlan
                  : createPlan
              }
            >
              ذخیره پلن
            </Button>
          </div>
        </Modal>

        <Modal
          isOpen={modal?.type === 'status'}
          onClose={closeModal}
          title={
            isPlanActive(selectedPlan)
              ? 'غیرفعال کردن پلن'
              : 'فعال کردن پلن'
          }
        >
          <div className="space-y-4">
            <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-700 dark:bg-amber-900/30 dark:text-amber-200">
              سفارش‌ها و کاربران قبلی حفظ می‌شوند و فقط فروش‌های جدید تغییر می‌کنند.
            </p>

            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={closeModal}
              >
                انصراف
              </Button>

              <Button
                isLoading={isSubmitting}
                onClick={toggleStatus}
              >
                تأیید
              </Button>
            </div>
          </div>
        </Modal>

        <Modal
          isOpen={modal?.type === 'delete'}
          onClose={closeModal}
          title="حذف پلن"
        >
          <div className="space-y-4">
            <p className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700 dark:bg-rose-900/30 dark:text-rose-200">
              پلن دارای سابقه سفارش یا کاربر حذف نمی‌شود و باید غیرفعال شود.
            </p>

            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={closeModal}
              >
                انصراف
              </Button>

              <Button
                isLoading={isSubmitting}
                onClick={deletePlan}
              >
                حذف پلن
              </Button>
            </div>
          </div>
        </Modal>
      </div>
    </DashboardLayout>
  );
}

function PlanFormFields({
  form,
  setForm,
  servers,
  inbounds,
  preview,
  previewLoading,
  onPreview,
}: {
  form: PlanForm;
  setForm: (form: PlanForm) => void;
  servers: any[];
  inbounds: any[];
  preview: any;
  previewLoading: boolean;
  onPreview: () => void;
}) {
  function toggleInbound(id: string) {
    setForm({
      ...form,

      allowedInboundIds:
        form.allowedInboundIds
          .includes(id)
          ? form.allowedInboundIds
            .filter(
              (currentId) =>
                currentId !== id,
            )
          : [
            ...form.allowedInboundIds,
            id,
          ],
    });
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Input
          label="نام پلن"
          value={form.name}
          onChange={(event) =>
            setForm({
              ...form,
              name: event.target.value,
            })
          }
        />

        <Input
          label="توضیحات"
          value={form.description}
          onChange={(event) =>
            setForm({
              ...form,
              description:
                event.target.value,
            })
          }
        />

        <SelectField
          label="نوع پلن"
          value={form.scope}
          onChange={(value) =>
            setForm({
              ...form,

              scope:
                value as PlanScope,

              serverId: '',
              allowedInboundIds: [],
            })
          }
          options={[
            {
              value: 'global',
              label: 'پلن عمومی',
            },
            {
              value: 'server',
              label: 'پلن اختصاصی سرور',
            },
          ]}
        />

        {form.scope === 'server' && (
          <SelectField
            label="سرور اختصاصی"
            value={form.serverId}
            onChange={(value) =>
              setForm({
                ...form,
                serverId: value,
                allowedInboundIds: [],
              })
            }
            options={[
              {
                value: '',
                label: 'انتخاب سرور',
              },

              ...servers.map(
                (server: any) => ({
                  value: String(
                    server.id,
                  ),

                  label:
                    `${server.name} — ${getValue(
                      server,
                      'serviceType',
                      'service_type',
                      'direct',
                    ) === 'tunnel'
                      ? 'تانل'
                      : 'مستقیم'
                    }`,
                }),
              ),
            ]}
          />
        )}

        <Input
          label="ترافیک پایه GB"
          type="number"
          value={form.trafficGB}
          onChange={(event) =>
            setForm({
              ...form,
              trafficGB:
                event.target.value,
            })
          }
        />

        <Input
          label="مدت پایه روز"
          type="number"
          value={form.durationDays}
          onChange={(event) =>
            setForm({
              ...form,
              durationDays:
                event.target.value,
            })
          }
        />

        <Input
          label="قیمت پایه"
          type="number"
          value={form.basePrice}
          onChange={(event) =>
            setForm({
              ...form,
              basePrice:
                event.target.value,
            })
          }
        />

        <Input
          label="قیمت پایه هر گیگ"
          type="number"
          value={form.pricePerGB}
          onChange={(event) =>
            setForm({
              ...form,
              pricePerGB:
                event.target.value,
            })
          }
        />

        <Input
          label="محدودیت IP پایه"
          type="number"
          value={form.ipLimit}
          onChange={(event) =>
            setForm({
              ...form,
              ipLimit:
                event.target.value,
            })
          }
        />
      </div>

      {form.scope === 'server' && (
        <div className="space-y-4 rounded-2xl border border-violet-200 bg-violet-50/60 p-4 dark:border-violet-800 dark:bg-violet-950/20">
          <h3 className="font-bold text-violet-800 dark:text-violet-200">
            قیمت و مشخصات اختصاصی سرور
          </h3>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Input
              label="قیمت ثابت اختصاصی"
              type="number"
              placeholder="اختیاری"
              value={form.flatPrice}
              onChange={(event) =>
                setForm({
                  ...form,
                  flatPrice:
                    event.target.value,
                })
              }
            />

            <Input
              label="قیمت هر گیگ اختصاصی"
              type="number"
              placeholder="اختیاری"
              value={form.offerPricePerGB}
              onChange={(event) =>
                setForm({
                  ...form,
                  offerPricePerGB:
                    event.target.value,
                })
              }
            />

            <Input
              label="حجم اختصاصی GB"
              type="number"
              placeholder="اختیاری"
              value={form.trafficGBOverride}
              onChange={(event) =>
                setForm({
                  ...form,
                  trafficGBOverride:
                    event.target.value,
                })
              }
            />

            <Input
              label="مدت اختصاصی روز"
              type="number"
              placeholder="اختیاری"
              value={form.durationDaysOverride}
              onChange={(event) =>
                setForm({
                  ...form,
                  durationDaysOverride:
                    event.target.value,
                })
              }
            />

            <Input
              label="IP اختصاصی"
              type="number"
              placeholder="اختیاری"
              value={form.ipLimitOverride}
              onChange={(event) =>
                setForm({
                  ...form,
                  ipLimitOverride:
                    event.target.value,
                })
              }
            />
          </div>

          <label className="flex items-center justify-between rounded-xl border border-violet-200 bg-white p-3 dark:border-violet-800 dark:bg-slate-900">
            <span className="text-sm font-medium">
              فروش اختصاصی فعال باشد
            </span>

            <input
              type="checkbox"
              checked={form.isOfferActive}
              onChange={(event) =>
                setForm({
                  ...form,
                  isOfferActive:
                    event.target.checked,
                })
              }
              className="h-5 w-5 accent-violet-600"
            />
          </label>
        </div>
      )}

      <div className="space-y-3">
        <div>
          <h3 className="font-bold text-slate-800 dark:text-slate-100">
            اینباندهای مجاز
          </h3>

          <p className="mt-1 text-xs text-slate-500">
            اگر هیچ اینباندی انتخاب نشود، پلن روی تمام اینباندهای قابل دسترس مجاز است.
          </p>
        </div>

        {!inbounds.length ? (
          <div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-700 dark:bg-amber-900/30 dark:text-amber-200">
            اینباند قابل انتخابی وجود ندارد.
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {inbounds.map(
              (inbound: any) => {
                const id = String(
                  inbound.id,
                );

                const selected =
                  form.allowedInboundIds
                    .includes(id);

                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() =>
                      toggleInbound(id)
                    }
                    className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm ${selected
                      ? 'border-sky-600 bg-sky-600 text-white'
                      : 'border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'
                      }`}
                  >
                    <Network className="h-4 w-4" />
                    {inbound.name}
                    <span className="opacity-70">
                      {inbound.protocol}
                    </span>
                  </button>
                );
              },
            )}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-700">
        <Button
          variant="outline"
          isLoading={previewLoading}
          leftIcon={
            <Eye className="h-4 w-4" />
          }
          onClick={onPreview}
        >
          پیش‌نمایش دسترسی
        </Button>

        {preview && (
          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <PreviewStat
                label="سرورها"
                value={
                  preview.summary?.servers ||
                  0
                }
              />

              <PreviewStat
                label="اینباندها"
                value={
                  preview.summary?.inbounds ||
                  0
                }
              />

              <PreviewStat
                label="مشتریان مجاز"
                value={
                  preview.summary
                    ?.visibleCustomers || 0
                }
              />

              <PreviewStat
                label="مشتریان مسدود"
                value={
                  preview.summary
                    ?.blockedCustomers || 0
                }
              />
            </div>

            <div className="max-h-64 space-y-2 overflow-y-auto">
              {(preview.customers || [])
                .map(
                  (customer: any) => (
                    <div
                      key={customer.id}
                      className={`rounded-xl border p-3 text-sm ${customer.visible
                        ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/20'
                        : 'border-rose-200 bg-rose-50 dark:border-rose-800 dark:bg-rose-950/20'
                        }`}
                    >
                      <div className="font-medium">
                        {customer.companyName ||
                          customer.username}
                      </div>

                      <div className="mt-1 text-xs opacity-75">
                        {customer.visible
                          ? `قابل مشاهده روی ${customer
                            .visibleServers
                            ?.length || 0
                          } سرور`
                          : (
                            customer.reasons ||
                            []
                          )
                            .map(reasonLabel)
                            .join('، ')}
                      </div>
                    </div>
                  ),
                )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{
    value: string;
    label: string;
  }>;
}) {
  return (
    <label className="space-y-2">
      <span className="block text-sm font-medium text-slate-700 dark:text-slate-200">
        {label}
      </span>

      <select
        value={value}
        onChange={(event) =>
          onChange(event.target.value)
        }
        className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-sky-500 dark:border-slate-700 dark:bg-slate-900"
      >
        {options.map((option) => (
          <option
            key={option.value}
            value={option.value}
          >
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Stat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-100 dark:bg-slate-800/70 dark:ring-slate-700">
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-sky-100 p-2 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300">
          {icon}
        </div>

        <div>
          <p className="text-xs text-slate-500">
            {label}
          </p>

          <p className="text-xl font-bold">
            {value}
          </p>
        </div>
      </div>
    </div>
  );
}

function InfoBox({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
      <div className="mb-2 text-slate-400">
        {icon}
      </div>

      <div className="text-xs text-slate-500">
        {label}
      </div>

      <div className="mt-1 text-sm font-bold">
        {value}
      </div>
    </div>
  );
}

function PreviewStat({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-xl bg-slate-50 p-3 text-center dark:bg-slate-800">
      <div className="text-lg font-bold">
        {value}
      </div>

      <div className="mt-1 text-xs text-slate-500">
        {label}
      </div>
    </div>
  );
}