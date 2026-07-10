import { useMemo, useState } from 'react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { StatusBadge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { EmptyState, ErrorState, LoadingState } from '../../components/RemoteState';
import { useRemoteData } from '../../hooks/useRemoteData';
import { backend } from '../../services/backend';
import { formatPrice } from '../../lib/utils';
import {
  Activity,
  Ban,
  CheckCircle2,
  Clock,
  Edit3,
  Plus,
  Search,
  ShieldAlert,
  Trash2,
  Users,
  WalletCards,
  Wifi,
} from 'lucide-react';

type ModalType = 'create' | 'edit' | 'status' | 'delete';

type PlanForm = {
  name: string;
  description: string;
  trafficGB: string;
  durationDays: string;
  basePrice: string;
  pricePerGB: string;
  ipLimit: string;
};

const emptyForm: PlanForm = {
  name: '',
  description: '',
  trafficGB: '10',
  durationDays: '30',
  basePrice: '0',
  pricePerGB: '0',
  ipLimit: '1',
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

function toForm(plan: any): PlanForm {
  return {
    name: String(plan.name || ''),
    description: String(plan.description || ''),
    trafficGB: String(getValue(plan, 'trafficGB', 'traffic_gb', 10)),
    durationDays: String(getValue(plan, 'durationDays', 'duration_days', 30)),
    basePrice: String(getValue(plan, 'basePrice', 'base_price', 0)),
    pricePerGB: String(getValue(plan, 'pricePerGB', 'price_per_gb', 0)),
    ipLimit: String(getValue(plan, 'ipLimit', 'ip_limit', 1)),
  };
}

function isPlanActive(plan: any) {
  return getValue(plan, 'isActive', 'is_active', true) !== false;
}

function endUsersCount(plan: any) {
  return Number(getValue(plan, 'endUsersCount', 'end_users_count', 0));
}

function ordersCount(plan: any) {
  return Number(getValue(plan, 'ordersCount', 'orders_count', 0));
}

export default function PlansPage() {
  const { data: plans, isLoading, error, reload } = useRemoteData(() => backend.plans.list(), []);

  const [searchTerm, setSearchTerm] = useState('');
  const [modal, setModal] = useState<{ type: ModalType; plan?: any } | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<any | null>(null);
  const [form, setForm] = useState<PlanForm>(emptyForm);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const filteredPlans = useMemo(() => (plans || []).filter((plan: any) => {
    const haystack = `${plan.name || ''} ${plan.description || ''}`.toLowerCase();
    return haystack.includes(searchTerm.toLowerCase());
  }), [plans, searchTerm]);

  const totals = useMemo(() => {
    const list = plans || [];
    return {
      total: list.length,
      active: list.filter((plan: any) => isPlanActive(plan)).length,
      users: list.reduce((sum: number, plan: any) => sum + endUsersCount(plan), 0),
      orders: list.reduce((sum: number, plan: any) => sum + ordersCount(plan), 0),
    };
  }, [plans]);

  function openCreateModal() {
    setSelectedPlan(null);
    setForm(emptyForm);
    setModal({ type: 'create' });
  }

  function openEditModal(plan: any) {
    setSelectedPlan(plan);
    setForm(toForm(plan));
    setModal({ type: 'edit', plan });
  }

  function openStatusModal(plan: any) {
    setSelectedPlan(plan);
    setModal({ type: 'status', plan });
  }

  function openDeleteModal(plan: any) {
    setSelectedPlan(plan);
    setModal({ type: 'delete', plan });
  }

  function closeModal() {
    if (isSubmitting) return;
    setModal(null);
    setSelectedPlan(null);
  }

  function buildPayload() {
    return {
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      trafficGB: numberValue(form.trafficGB),
      durationDays: numberValue(form.durationDays),
      basePrice: numberValue(form.basePrice),
      pricePerGB: numberValue(form.pricePerGB),
      ipLimit: numberValue(form.ipLimit),
    };
  }

  async function createPlan() {
    setIsSubmitting(true);
    try {
      await backend.plans.create({ ...buildPayload(), isActive: true });
      closeModal();
      await reload();
    } catch (err: any) {
      alert(err.message || 'خطا در ایجاد پلن');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function updatePlan() {
    if (!selectedPlan) return;

    setIsSubmitting(true);
    try {
      await backend.plans.update(selectedPlan.id, buildPayload());
      closeModal();
      await reload();
    } catch (err: any) {
      alert(err.message || 'خطا در ویرایش پلن');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function toggleStatus() {
    if (!selectedPlan) return;

    setIsSubmitting(true);
    try {
      await backend.plans.setStatus(selectedPlan.id, { isActive: !isPlanActive(selectedPlan) });
      closeModal();
      await reload();
    } catch (err: any) {
      alert(err.message || 'خطا در تغییر وضعیت پلن');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function deletePlan() {
    if (!selectedPlan) return;

    setIsSubmitting(true);
    try {
      await backend.plans.remove(selectedPlan.id);
      closeModal();
      await reload();
    } catch (err: any) {
      alert(err.message || 'حذف انجام نشد. اگر پلن سابقه سفارش یا کاربر دارد، آن را غیرفعال کنید.');
    } finally {
      setIsSubmitting(false);
    }
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
                ساخت، ویرایش، غیرفعال‌سازی و مدیریت قیمت پایه پلن‌ها
              </p>
            </div>

            <Button leftIcon={<Plus className="h-4 w-4" />} onClick={openCreateModal}>
              پلن جدید
            </Button>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-100 dark:bg-slate-800/70 dark:ring-slate-700">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-cyan-100 p-2 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300">
                  <WalletCards className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs text-slate-500">کل پلن‌ها</p>
                  <p className="text-xl font-bold text-slate-800 dark:text-slate-100">{totals.total}</p>
                </div>
              </div>
            </div>

            <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-100 dark:bg-slate-800/70 dark:ring-slate-700">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-emerald-100 p-2 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                  <CheckCircle2 className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs text-slate-500">فعال</p>
                  <p className="text-xl font-bold text-slate-800 dark:text-slate-100">{totals.active}</p>
                </div>
              </div>
            </div>

            <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-100 dark:bg-slate-800/70 dark:ring-slate-700">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-sky-100 p-2 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300">
                  <Users className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs text-slate-500">کاربران روی پلن‌ها</p>
                  <p className="text-xl font-bold text-slate-800 dark:text-slate-100">{totals.users}</p>
                </div>
              </div>
            </div>

            <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-100 dark:bg-slate-800/70 dark:ring-slate-700">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-violet-100 p-2 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">
                  <Activity className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs text-slate-500">سفارش‌ها</p>
                  <p className="text-xl font-bold text-slate-800 dark:text-slate-100">{totals.orders}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <CardTitle>لیست پلن‌ها</CardTitle>

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
            {error && <ErrorState message={error} onRetry={reload} />}

            {isLoading ? (
              <LoadingState />
            ) : filteredPlans.length === 0 ? (
              <EmptyState />
            ) : (
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
                {filteredPlans.map((plan: any) => {
                  const active = isPlanActive(plan);
                  const users = endUsersCount(plan);
                  const orders = ordersCount(plan);
                  const trafficGB = Number(getValue(plan, 'trafficGB', 'traffic_gb', 0));
                  const durationDays = Number(getValue(plan, 'durationDays', 'duration_days', 0));
                  const basePrice = Number(getValue(plan, 'basePrice', 'base_price', 0));
                  const pricePerGB = Number(getValue(plan, 'pricePerGB', 'price_per_gb', 0));
                  const ipLimit = Number(getValue(plan, 'ipLimit', 'ip_limit', 1));

                  return (
                    <div
                      key={plan.id}
                      className={`rounded-2xl border p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
                        active
                          ? 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900'
                          : 'border-slate-200 bg-slate-50 opacity-75 dark:border-slate-700 dark:bg-slate-800/70'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">
                            {plan.name}
                          </h3>
                          <p className="mt-1 line-clamp-2 text-sm text-slate-500 dark:text-slate-400">
                            {plan.description || 'بدون توضیح'}
                          </p>
                        </div>

                        <StatusBadge status={active ? 'active' : 'disabled'} />
                      </div>

                      <div className="mt-5 grid grid-cols-2 gap-3">
                        <InfoBox icon={<Wifi className="h-4 w-4" />} label="ترافیک" value={`${trafficGB} GB`} />
                        <InfoBox icon={<Clock className="h-4 w-4" />} label="مدت" value={`${durationDays} روز`} />
                        <InfoBox icon={<ShieldAlert className="h-4 w-4" />} label="IP" value={String(ipLimit)} />
                        <InfoBox icon={<WalletCards className="h-4 w-4" />} label="قیمت پایه" value={formatPrice(basePrice)} />
                      </div>

                      <div className="mt-4 rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800">
                        <div className="flex justify-between text-slate-500 dark:text-slate-400">
                          <span>قیمت هر گیگ</span>
                          <span className="font-medium text-slate-700 dark:text-slate-200">{formatPrice(pricePerGB)}</span>
                        </div>
                        <div className="mt-2 flex justify-between text-slate-500 dark:text-slate-400">
                          <span>کاربران / سفارش‌ها</span>
                          <span className="font-medium text-slate-700 dark:text-slate-200">{users} / {orders}</span>
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        <Button variant="ghost" size="sm" onClick={() => openEditModal(plan)}>
                          <Edit3 className="h-4 w-4" />
                        </Button>

                        <Button variant="ghost" size="sm" onClick={() => openStatusModal(plan)}>
                          {active ? <Ban className="h-4 w-4 text-amber-600" /> : <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
                        </Button>

                        <Button variant="ghost" size="sm" onClick={() => openDeleteModal(plan)}>
                          <Trash2 className="h-4 w-4 text-rose-600" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Modal isOpen={modal?.type === 'create'} onClose={closeModal} title="ایجاد پلن جدید" size="lg">
          <PlanFormFields form={form} setForm={setForm} isEdit={false} />
          <div className="mt-6 flex justify-end gap-3">
            <Button variant="outline" onClick={closeModal}>انصراف</Button>
            <Button isLoading={isSubmitting} onClick={createPlan}>ذخیره پلن</Button>
          </div>
        </Modal>

        <Modal isOpen={modal?.type === 'edit'} onClose={closeModal} title={`ویرایش پلن - ${selectedPlan?.name || ''}`} size="lg">
          <PlanFormFields form={form} setForm={setForm} isEdit />
          <div className="mt-6 flex justify-end gap-3">
            <Button variant="outline" onClick={closeModal}>انصراف</Button>
            <Button isLoading={isSubmitting} leftIcon={<Edit3 className="h-4 w-4" />} onClick={updatePlan}>
              ذخیره تغییرات
            </Button>
          </div>
        </Modal>

        <Modal isOpen={modal?.type === 'status'} onClose={closeModal} title={isPlanActive(selectedPlan) ? 'غیرفعال کردن پلن' : 'فعال کردن پلن'}>
          <div className="space-y-4">
            {isPlanActive(selectedPlan) ? (
              <div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-700 dark:bg-amber-900/30 dark:text-amber-200">
                با غیرفعال کردن پلن، این پلن دیگر برای ساخت کانفیگ جدید قابل انتخاب نیست. سفارش‌ها و کاربران قبلی حفظ می‌شوند.
              </div>
            ) : (
              <div className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-200">
                با فعال‌سازی، این پلن دوباره برای فروش و ساخت کانفیگ قابل انتخاب می‌شود.
              </div>
            )}

            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={closeModal}>انصراف</Button>
              <Button isLoading={isSubmitting} onClick={toggleStatus}>
                {isPlanActive(selectedPlan) ? 'غیرفعال کن' : 'فعال کن'}
              </Button>
            </div>
          </div>
        </Modal>

        <Modal isOpen={modal?.type === 'delete'} onClose={closeModal} title="حذف پلن">
          <div className="space-y-4">
            <div className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700 dark:bg-rose-900/30 dark:text-rose-200">
              حذف کامل فقط برای پلنی انجام می‌شود که هیچ سفارش، کاربر یا قیمت‌گذاری اختصاصی نداشته باشد. اگر پلن سابقه دارد، آن را غیرفعال کنید.
            </div>

            <div className="rounded-xl bg-slate-50 p-4 text-sm dark:bg-slate-800">
              <div>پلن: {selectedPlan?.name}</div>
              <div className="mt-1 text-slate-500">
                کاربران: {endUsersCount(selectedPlan)} | سفارش‌ها: {ordersCount(selectedPlan)}
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={closeModal}>انصراف</Button>
              <Button isLoading={isSubmitting} onClick={deletePlan}>حذف پلن</Button>
            </div>
          </div>
        </Modal>
      </div>
    </DashboardLayout>
  );
}

function InfoBox({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
      <div className="mb-2 text-slate-400">{icon}</div>
      <div className="text-xs text-slate-500 dark:text-slate-400">{label}</div>
      <div className="mt-1 text-sm font-bold text-slate-800 dark:text-slate-100">{value}</div>
    </div>
  );
}

function PlanFormFields({
  form,
  setForm,
  isEdit,
}: {
  form: PlanForm;
  setForm: (form: PlanForm) => void;
  isEdit: boolean;
}) {
  return (
    <div className="space-y-5">
      <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500 dark:bg-slate-800 dark:text-slate-300">
        {isEdit
          ? 'تغییرات پلن روی سفارش‌ها و کاربران قبلی اعمال نمی‌شود؛ فقط ساخت کانفیگ‌های جدید و تمدیدهای بعدی از مقدار جدید استفاده می‌کنند.'
          : 'بعد از ساخت پلن، امکان ویرایش و غیرفعال‌سازی آن از همین صفحه وجود دارد.'}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Input label="نام پلن" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
        <Input label="توضیحات" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
        <Input label="ترافیک GB" type="number" value={form.trafficGB} onChange={(event) => setForm({ ...form, trafficGB: event.target.value })} />
        <Input label="مدت روز" type="number" value={form.durationDays} onChange={(event) => setForm({ ...form, durationDays: event.target.value })} />
        <Input label="قیمت پایه" type="number" value={form.basePrice} onChange={(event) => setForm({ ...form, basePrice: event.target.value })} />
        <Input label="قیمت هر گیگ" type="number" value={form.pricePerGB} onChange={(event) => setForm({ ...form, pricePerGB: event.target.value })} />
        <Input label="محدودیت IP" type="number" value={form.ipLimit} onChange={(event) => setForm({ ...form, ipLimit: event.target.value })} />
      </div>
    </div>
  );
}
