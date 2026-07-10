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
import type { WholesaleCustomer } from '../../types';
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Edit3,
  Eye,
  Plus,
  Search,
  ShieldAlert,
  Trash2,
  UserPlus,
  Users,
  Wallet,
  ShoppingCart,
  Server,
  Network,
} from 'lucide-react';

type ModalType = 'create' | 'edit' | 'charge' | 'status' | 'delete' | 'access';

type CustomerForm = {
  username: string;
  email: string;
  password: string;
  companyName: string;
  phone: string;
  creditLimit: string;
  minBalance: string;
  dailyOrderLimit: string;
  monthlyOrderLimit: string;
  notes: string;
};

const emptyForm: CustomerForm = {
  username: '',
  email: '',
  password: '',
  companyName: '',
  phone: '',
  creditLimit: '0',
  minBalance: '0',
  dailyOrderLimit: '100',
  monthlyOrderLimit: '3000',
  notes: '',
};

function getCustomerValue(customer: any, camel: string, snake: string, fallback: any = '') {
  if (customer?.[camel] !== undefined && customer?.[camel] !== null) return customer[camel];
  if (customer?.[snake] !== undefined && customer?.[snake] !== null) return customer[snake];
  return fallback;
}

function toForm(customer: any): CustomerForm {
  return {
    username: String(customer.username || ''),
    email: String(customer.email || ''),
    password: '',
    companyName: String(getCustomerValue(customer, 'companyName', 'company_name', '')),
    phone: String(customer.phone || ''),
    creditLimit: String(getCustomerValue(customer, 'creditLimit', 'credit_limit', 0)),
    minBalance: String(getCustomerValue(customer, 'minBalance', 'min_balance', 0)),
    dailyOrderLimit: String(getCustomerValue(customer, 'dailyOrderLimit', 'daily_order_limit', 100)),
    monthlyOrderLimit: String(getCustomerValue(customer, 'monthlyOrderLimit', 'monthly_order_limit', 3000)),
    notes: String(customer.notes || ''),
  };
}

function numberValue(value: string) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function isCustomerActive(customer: any) {
  return getCustomerValue(customer, 'isActive', 'is_active', true) !== false
    && getCustomerValue(customer, 'userIsActive', 'user_is_active', true) !== false;
}

function walletBalance(customer: any) {
  return Number(getCustomerValue(customer, 'walletBalance', 'wallet_balance', 0));
}

function minBalance(customer: any) {
  return Number(getCustomerValue(customer, 'minBalance', 'min_balance', 0));
}

function endUsersCount(customer: any) {
  return Number(getCustomerValue(customer, 'endUsersCount', 'end_users_count', 0));
}

function ordersCount(customer: any) {
  return Number(getCustomerValue(customer, 'ordersCount', 'orders_count', 0));
}

export default function CustomersPage() {
  const { data: customers, isLoading, error, reload } = useRemoteData(() => backend.customers.list(), []);
  const { data: servers } = useRemoteData(() => backend.servers.list(), []);
  const { data: inbounds } = useRemoteData(() => backend.inbounds.list(), []);

  const [searchTerm, setSearchTerm] = useState('');
  const [modal, setModal] = useState<{ type: ModalType; customer?: WholesaleCustomer | any } | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<any | null>(null);

  const [form, setForm] = useState<CustomerForm>(emptyForm);
  const [chargeAmount, setChargeAmount] = useState('');
  const [chargeDescription, setChargeDescription] = useState('شارژ کیف پول توسط ادمین');
  const [disabledReason, setDisabledReason] = useState('شما به علت بدهی امکان ورود به پنل را ندارید. لطفا با پشتیبانی تماس بگیرید.');
  const [selectedServerIds, setSelectedServerIds] = useState<string[]>([]);
  const [selectedInboundIds, setSelectedInboundIds] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const filteredCustomers = useMemo(() => (customers || []).filter((customer: any) => {
    const haystack = [
      customer.username,
      customer.email,
      getCustomerValue(customer, 'companyName', 'company_name', ''),
      customer.phone,
    ].join(' ').toLowerCase();

    return haystack.includes(searchTerm.toLowerCase());
  }), [customers, searchTerm]);

  const totals = useMemo(() => {
    const list = customers || [];
    return {
      customers: list.length,
      active: list.filter((c: any) => isCustomerActive(c)).length,
      wallet: list.reduce((sum: number, c: any) => sum + walletBalance(c), 0),
      lowBalance: list.filter((c: any) => minBalance(c) > 0 && walletBalance(c) < minBalance(c)).length,
    };
  }, [customers]);

  function openCreateModal() {
    setForm(emptyForm);
    setModal({ type: 'create' });
  }

  function openEditModal(customer: any) {
    setSelectedCustomer(customer);
    setForm(toForm(customer));
    setModal({ type: 'edit', customer });
  }

  function openChargeModal(customer: any) {
    setSelectedCustomer(customer);
    setChargeAmount('');
    setChargeDescription('شارژ کیف پول توسط ادمین');
    setModal({ type: 'charge', customer });
  }

  function openStatusModal(customer: any) {
    setSelectedCustomer(customer);
    const active = isCustomerActive(customer);
    setDisabledReason(
      active
        ? 'شما به علت بدهی امکان ورود به پنل را ندارید. لطفا با پشتیبانی تماس بگیرید.'
        : String(getCustomerValue(customer, 'disabledReason', 'disabled_reason', '')),
    );
    setModal({ type: 'status', customer });
  }

  function openDeleteModal(customer: any) {
    setSelectedCustomer(customer);
    setModal({ type: 'delete', customer });
  }

  function openAccessModal(customer: any) {
    setSelectedCustomer(customer);
    setSelectedServerIds([...(getCustomerValue(customer, 'allowedServerIds', 'allowed_server_ids', []) || [])]);
    setSelectedInboundIds([...(getCustomerValue(customer, 'allowedInboundIds', 'allowed_inbound_ids', []) || [])]);
    setModal({ type: 'access', customer });
  }

  function closeModal() {
    if (isSubmitting) return;
    setModal(null);
    setSelectedCustomer(null);
  }

  function buildPayload(includePassword: boolean) {
    return {
      username: form.username.trim(),
      email: form.email.trim(),
      ...(includePassword && form.password ? { password: form.password } : {}),
      companyName: form.companyName.trim() || undefined,
      phone: form.phone.trim() || undefined,
      creditLimit: numberValue(form.creditLimit),
      minBalance: numberValue(form.minBalance),
      dailyOrderLimit: numberValue(form.dailyOrderLimit),
      monthlyOrderLimit: numberValue(form.monthlyOrderLimit),
      notes: form.notes.trim() || undefined,
    };
  }

  async function createCustomer() {
    setIsSubmitting(true);
    try {
      await backend.customers.create(buildPayload(true) as any);
      closeModal();
      await reload();
    } catch (err: any) {
      alert(err.message || 'خطا در ایجاد مشتری');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function updateCustomer() {
    if (!selectedCustomer) return;

    setIsSubmitting(true);
    try {
      await backend.customers.update(selectedCustomer.id, buildPayload(true) as any);
      closeModal();
      await reload();
    } catch (err: any) {
      alert(err.message || 'خطا در ویرایش مشتری');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function chargeWallet() {
    if (!selectedCustomer) return;

    setIsSubmitting(true);
    try {
      await backend.wallet.creditCustomer(
        selectedCustomer.id,
        numberValue(chargeAmount),
        chargeDescription || 'شارژ کیف پول',
      );
      closeModal();
      await reload();
    } catch (err: any) {
      alert(err.message || 'خطا در شارژ کیف پول');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function toggleStatus() {
    if (!selectedCustomer) return;

    const currentlyActive = isCustomerActive(selectedCustomer);

    setIsSubmitting(true);
    try {
      await backend.customers.setStatus(selectedCustomer.id, {
        isActive: !currentlyActive,
        disabledReason: currentlyActive ? disabledReason : undefined,
      });
      closeModal();
      await reload();
    } catch (err: any) {
      alert(err.message || 'خطا در تغییر وضعیت مشتری');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function saveAccess() {
    if (!selectedCustomer) return;

    setIsSubmitting(true);
    try {
      await backend.customers.update(selectedCustomer.id, {
        allowedServerIds: selectedServerIds,
        allowedInboundIds: selectedInboundIds,
      } as any);
      closeModal();
      await reload();
    } catch (err: any) {
      alert(err.message || 'خطا در ذخیره دسترسی‌ها');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function deleteCustomer() {
    if (!selectedCustomer) return;

    const hasHistory = ordersCount(selectedCustomer) > 0 || endUsersCount(selectedCustomer) > 0;

    setIsSubmitting(true);
    try {
      await backend.customers.remove(selectedCustomer.id, { force: hasHistory });
      closeModal();
      await reload();
    } catch (err: any) {
      alert(err.message || 'حذف انجام نشد');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <DashboardLayout title="مدیریت مشتریان">
      <div className="space-y-6">
        <div className="rounded-2xl border border-slate-200 bg-gradient-to-l from-sky-50 via-white to-indigo-50 p-5 shadow-sm dark:border-slate-700 dark:from-slate-900 dark:via-slate-900 dark:to-indigo-950/40">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">
                مشتریان عمده‌فروش
              </h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                مدیریت حساب‌ها، کیف پول، وضعیت ورود و محدودیت‌های مالی مشتریان
              </p>
            </div>

            <Button leftIcon={<Plus className="h-4 w-4" />} onClick={openCreateModal}>
              مشتری جدید
            </Button>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-100 dark:bg-slate-800/70 dark:ring-slate-700">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-sky-100 p-2 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300">
                  <Users className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs text-slate-500">کل مشتریان</p>
                  <p className="text-xl font-bold text-slate-800 dark:text-slate-100">{totals.customers}</p>
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
                <div className="rounded-xl bg-violet-100 p-2 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">
                  <Wallet className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs text-slate-500">موجودی کل</p>
                  <p className="text-lg font-bold text-slate-800 dark:text-slate-100">{formatPrice(totals.wallet)}</p>
                </div>
              </div>
            </div>

            <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-100 dark:bg-slate-800/70 dark:ring-slate-700">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-amber-100 p-2 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs text-slate-500">زیر حد هشدار</p>
                  <p className="text-xl font-bold text-slate-800 dark:text-slate-100">{totals.lowBalance}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <CardTitle>لیست مشتریان</CardTitle>

              <div className="relative w-full md:max-w-md">
                <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  placeholder="جستجوی مشتری، شرکت، ایمیل یا شماره..."
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  className="pr-10"
                />
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            {error && <div className="p-4"><ErrorState message={error} onRetry={reload} /></div>}

            {isLoading ? (
              <LoadingState />
            ) : filteredCustomers.length === 0 ? (
              <div className="p-6">
                <EmptyState />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50 dark:bg-slate-800/70">
                    <tr>
                      {[
                        'مشتری',
                        'تماس',
                        'موجودی',
                        'حد هشدار',
                        'کاربران',
                        'سفارش‌ها',
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
                    {filteredCustomers.map((customer: any) => {
                      const active = isCustomerActive(customer);
                      const balance = walletBalance(customer);
                      const min = minBalance(customer);
                      const low = min > 0 && balance < min;

                      return (
                        <tr key={customer.id} className="hover:bg-sky-50/60 dark:hover:bg-slate-800/70">
                          <td className="px-4 py-4">
                            <div className="font-medium text-slate-800 dark:text-slate-100">
                              {getCustomerValue(customer, 'companyName', 'company_name', '-') || '-'}
                            </div>
                            <div className="mt-1 text-xs text-slate-500">
                              @{customer.username}
                            </div>
                            <div className="mt-1 text-xs text-slate-400">
                              {customer.email}
                            </div>
                          </td>

                          <td className="px-4 py-4 text-sm text-slate-600 dark:text-slate-300">
                            {customer.phone || '-'}
                          </td>

                          <td className={`px-4 py-4 text-sm font-semibold ${low ? 'text-amber-600 dark:text-amber-300' : 'text-emerald-600 dark:text-emerald-300'}`}>
                            {formatPrice(balance)}
                            {low && (
                              <div className="mt-1 flex items-center gap-1 text-xs font-normal text-amber-600 dark:text-amber-300">
                                <ShieldAlert className="h-3.5 w-3.5" />
                                زیر حد هشدار
                              </div>
                            )}
                          </td>

                          <td className="px-4 py-4 text-sm text-slate-600 dark:text-slate-300">
                            {formatPrice(min)}
                          </td>

                          <td className="px-4 py-4">
                            <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-700 dark:bg-sky-900/40 dark:text-sky-300">
                              <Users className="h-3.5 w-3.5" />
                              {endUsersCount(customer)}
                            </span>
                          </td>

                          <td className="px-4 py-4">
                            <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">
                              <ShoppingCart className="h-3.5 w-3.5" />
                              {ordersCount(customer)}
                            </span>
                          </td>

                          <td className="px-4 py-4">
                            <StatusBadge status={active ? 'active' : 'disabled'} />
                            {!active && getCustomerValue(customer, 'disabledReason', 'disabled_reason') && (
                              <div className="mt-1 max-w-[220px] truncate text-xs text-rose-500">
                                {String(getCustomerValue(customer, 'disabledReason', 'disabled_reason'))}
                              </div>
                            )}
                          </td>

                          <td className="px-4 py-4">
                            <div className="flex flex-wrap gap-2">
                              <Button variant="ghost" size="sm" onClick={() => openChargeModal(customer)}>
                                <Wallet className="h-4 w-4" />
                              </Button>

                              <Button variant="ghost" size="sm" onClick={() => openEditModal(customer)}>
                                <Edit3 className="h-4 w-4" />
                              </Button>

                              <Button variant="ghost" size="sm" onClick={() => openAccessModal(customer)}>
                                <Server className="h-4 w-4 text-sky-600" />
                              </Button>

                              <Button variant="ghost" size="sm" onClick={() => openStatusModal(customer)}>
                                {active ? <Ban className="h-4 w-4 text-amber-600" /> : <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
                              </Button>

                              <Button variant="ghost" size="sm" onClick={() => openDeleteModal(customer)}>
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

        <Modal isOpen={modal?.type === 'create'} onClose={closeModal} title="ایجاد مشتری جدید" size="lg">
          <CustomerFormFields form={form} setForm={setForm} isEdit={false} />
          <div className="mt-6 flex justify-end gap-3">
            <Button variant="outline" onClick={closeModal}>انصراف</Button>
            <Button isLoading={isSubmitting} leftIcon={<UserPlus className="h-4 w-4" />} onClick={createCustomer}>
              ایجاد مشتری
            </Button>
          </div>
        </Modal>

        <Modal isOpen={modal?.type === 'edit'} onClose={closeModal} title={`ویرایش مشتری - ${selectedCustomer?.username || ''}`} size="lg">
          <CustomerFormFields form={form} setForm={setForm} isEdit />
          <div className="mt-6 flex justify-end gap-3">
            <Button variant="outline" onClick={closeModal}>انصراف</Button>
            <Button isLoading={isSubmitting} leftIcon={<Edit3 className="h-4 w-4" />} onClick={updateCustomer}>
              ذخیره تغییرات
            </Button>
          </div>
        </Modal>

        <Modal isOpen={modal?.type === 'access'} onClose={closeModal} title={`دسترسی سرور و اینباند - ${selectedCustomer?.username || ''}`} size="lg">
          <AccessEditor
            servers={servers || []}
            inbounds={inbounds || []}
            selectedServerIds={selectedServerIds}
            selectedInboundIds={selectedInboundIds}
            setSelectedServerIds={setSelectedServerIds}
            setSelectedInboundIds={setSelectedInboundIds}
          />

          <div className="mt-6 flex justify-end gap-3">
            <Button variant="outline" onClick={closeModal}>انصراف</Button>
            <Button isLoading={isSubmitting} leftIcon={<Server className="h-4 w-4" />} onClick={saveAccess}>
              ذخیره دسترسی‌ها
            </Button>
          </div>
        </Modal>

        <Modal isOpen={modal?.type === 'charge'} onClose={closeModal} title={`شارژ کیف پول - ${selectedCustomer?.companyName || selectedCustomer?.username || ''}`}>
          <div className="space-y-4">
            <div className="rounded-xl bg-sky-50 p-4 dark:bg-sky-900/30">
              <p className="text-sm text-slate-500 dark:text-slate-300">موجودی فعلی:</p>
              <p className="mt-1 text-2xl font-bold text-slate-800 dark:text-slate-100">
                {formatPrice(walletBalance(selectedCustomer))}
              </p>
            </div>

            <Input label="مبلغ شارژ (تومان)" type="number" value={chargeAmount} onChange={(event) => setChargeAmount(event.target.value)} />
            <Input label="توضیحات" value={chargeDescription} onChange={(event) => setChargeDescription(event.target.value)} />

            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={closeModal}>انصراف</Button>
              <Button isLoading={isSubmitting} onClick={chargeWallet}>شارژ کیف پول</Button>
            </div>
          </div>
        </Modal>

        <Modal isOpen={modal?.type === 'status'} onClose={closeModal} title={isCustomerActive(selectedCustomer) ? 'غیرفعال کردن مشتری' : 'فعال کردن مشتری'}>
          <div className="space-y-4">
            {isCustomerActive(selectedCustomer) ? (
              <>
                <div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-700 dark:bg-amber-900/30 dark:text-amber-200">
                  با غیرفعال کردن مشتری، کاربر دیگر نمی‌تواند وارد پنل شود و پیام زیر هنگام ورود نمایش داده می‌شود.
                </div>

                <Input
                  label="پیام نمایش هنگام ورود"
                  value={disabledReason}
                  onChange={(event) => setDisabledReason(event.target.value)}
                />
              </>
            ) : (
              <div className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-200">
                با فعال‌سازی، مشتری دوباره امکان ورود به پنل را خواهد داشت.
              </div>
            )}

            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={closeModal}>انصراف</Button>
              <Button isLoading={isSubmitting} onClick={toggleStatus}>
                {isCustomerActive(selectedCustomer) ? 'غیرفعال کن' : 'فعال کن'}
              </Button>
            </div>
          </div>
        </Modal>

        <Modal isOpen={modal?.type === 'delete'} onClose={closeModal} title="حذف مشتری">
          <div className="space-y-4">
            <div className="rounded-xl bg-rose-50 p-4 text-sm leading-6 text-rose-700 dark:bg-rose-900/30 dark:text-rose-200">
              اگر این مشتری کاربری داشته باشد که هنوز هم تاریخش باقی مانده و هم حجمش تمام نشده، حذف کامل توسط بک‌اند متوقف می‌شود.
              اگر فقط سفارش، فاکتور یا کاربر تمام‌شده/منقضی داشته باشد، با تایید شما کل سوابق وابسته و حساب لاگین مشتری حذف می‌شود.
            </div>

            {(ordersCount(selectedCustomer) > 0 || endUsersCount(selectedCustomer) > 0) && (
              <div className="rounded-xl bg-amber-50 p-4 text-sm leading-6 text-amber-700 dark:bg-amber-900/30 dark:text-amber-200">
                این مشتری سابقه دارد. با زدن دکمه حذف، حذف کامل با تایید اجباری انجام می‌شود.
              </div>
            )}

            <div className="rounded-xl bg-slate-50 p-4 text-sm dark:bg-slate-800">
              <div>مشتری: {selectedCustomer?.companyName || selectedCustomer?.username}</div>
              <div className="mt-1 text-slate-500">کاربران: {endUsersCount(selectedCustomer)} | سفارش‌ها: {ordersCount(selectedCustomer)}</div>
            </div>

            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={closeModal}>انصراف</Button>
              <Button isLoading={isSubmitting} onClick={deleteCustomer}>
                {ordersCount(selectedCustomer) > 0 || endUsersCount(selectedCustomer) > 0
                  ? 'بله، حذف کامل با سوابق'
                  : 'حذف مشتری'}
              </Button>
            </div>
          </div>
        </Modal>
      </div>
    </DashboardLayout>
  );
}

function AccessEditor({
  servers,
  inbounds,
  selectedServerIds,
  selectedInboundIds,
  setSelectedServerIds,
  setSelectedInboundIds,
}: {
  servers: any[];
  inbounds: any[];
  selectedServerIds: string[];
  selectedInboundIds: string[];
  setSelectedServerIds: (ids: string[]) => void;
  setSelectedInboundIds: (ids: string[]) => void;
}) {
  function toggle(list: string[], id: string) {
    return list.includes(id) ? list.filter((item) => item !== id) : [...list, id];
  }

  const visibleInbounds = selectedServerIds.length === 0
    ? inbounds
    : inbounds.filter((inbound: any) => selectedServerIds.includes(getCustomerValue(inbound, 'serverId', 'server_id', '')));

  return (
    <div className="space-y-5">
      <div className="rounded-xl bg-sky-50 p-4 text-sm text-sky-700 dark:bg-sky-900/30 dark:text-sky-200">
        اگر هیچ سروری انتخاب نشود، مشتری به همه سرورهای فعال دسترسی دارد.
        اگر هیچ اینباندی انتخاب نشود، مشتری به همه اینباندهای مجاز دسترسی دارد.
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <div className="mb-3 flex items-center gap-2">
            <Server className="h-5 w-5 text-sky-600" />
            <h3 className="font-bold text-slate-800 dark:text-slate-100">سرورهای مجاز</h3>
          </div>

          <div className="mb-3 flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setSelectedServerIds([])}>
              همه سرورها
            </Button>
            <Button size="sm" variant="outline" onClick={() => setSelectedServerIds(servers.map((server: any) => server.id))}>
              انتخاب همه
            </Button>
          </div>

          <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
            {servers.length === 0 ? (
              <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-500 dark:bg-slate-800">
                سروری ثبت نشده است.
              </div>
            ) : servers.map((server: any) => {
              const checked = selectedServerIds.includes(server.id);
              return (
                <label
                  key={server.id}
                  className={`flex cursor-pointer items-center justify-between rounded-xl border p-3 transition ${
                    checked
                      ? 'border-sky-300 bg-sky-50 dark:border-sky-700 dark:bg-sky-900/30'
                      : 'border-slate-200 bg-slate-50 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700'
                  }`}
                >
                  <div>
                    <div className="font-medium text-slate-800 dark:text-slate-100">{server.name}</div>
                    <div className="mt-1 text-xs text-slate-500">
                      {server.host}:{server.port} | {server.location || 'بدون لوکیشن'}
                    </div>
                  </div>

                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-300 text-sky-600"
                    checked={checked}
                    onChange={() => setSelectedServerIds(toggle(selectedServerIds, server.id))}
                  />
                </label>
              );
            })}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <div className="mb-3 flex items-center gap-2">
            <Network className="h-5 w-5 text-violet-600" />
            <h3 className="font-bold text-slate-800 dark:text-slate-100">اینباندهای مجاز</h3>
          </div>

          <div className="mb-3 flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setSelectedInboundIds([])}>
              همه اینباندها
            </Button>
            <Button size="sm" variant="outline" onClick={() => setSelectedInboundIds(visibleInbounds.map((inbound: any) => inbound.id))}>
              انتخاب همه
            </Button>
          </div>

          <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
            {visibleInbounds.length === 0 ? (
              <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-500 dark:bg-slate-800">
                اینباندی برای سرورهای انتخابی وجود ندارد.
              </div>
            ) : visibleInbounds.map((inbound: any) => {
              const checked = selectedInboundIds.includes(inbound.id);
              return (
                <label
                  key={inbound.id}
                  className={`flex cursor-pointer items-center justify-between rounded-xl border p-3 transition ${
                    checked
                      ? 'border-violet-300 bg-violet-50 dark:border-violet-700 dark:bg-violet-900/30'
                      : 'border-slate-200 bg-slate-50 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700'
                  }`}
                >
                  <div>
                    <div className="font-medium text-slate-800 dark:text-slate-100">{inbound.name}</div>
                    <div className="mt-1 text-xs text-slate-500">
                      {inbound.protocol} | port {inbound.port} | {getCustomerValue(inbound, 'serverName', 'server_name', '')}
                    </div>
                  </div>

                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-300 text-violet-600"
                    checked={checked}
                    onChange={() => setSelectedInboundIds(toggle(selectedInboundIds, inbound.id))}
                  />
                </label>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function CustomerFormFields({
  form,
  setForm,
  isEdit,
}: {
  form: CustomerForm;
  setForm: (form: CustomerForm) => void;
  isEdit: boolean;
}) {
  return (
    <div className="space-y-5">
      <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500 dark:bg-slate-800 dark:text-slate-300">
        {isEdit
          ? 'برای تغییر رمز عبور، فیلد رمز را پر کنید. اگر خالی بماند رمز قبلی حفظ می‌شود.'
          : 'رمز عبور باید حداقل ۸ کاراکتر باشد.'}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Input label="نام کاربری" value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} />
        <Input label="ایمیل" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
        <Input label={isEdit ? 'رمز عبور جدید، اختیاری' : 'رمز عبور'} type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} />
        <Input label="نام شرکت" value={form.companyName} onChange={(event) => setForm({ ...form, companyName: event.target.value })} />
        <Input label="شماره تماس" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
        <Input label="سقف اعتبار" type="number" value={form.creditLimit} onChange={(event) => setForm({ ...form, creditLimit: event.target.value })} />
        <Input label="حد هشدار موجودی" type="number" value={form.minBalance} onChange={(event) => setForm({ ...form, minBalance: event.target.value })} />
        <Input label="سقف سفارش روزانه" type="number" value={form.dailyOrderLimit} onChange={(event) => setForm({ ...form, dailyOrderLimit: event.target.value })} />
        <Input label="سقف سفارش ماهانه" type="number" value={form.monthlyOrderLimit} onChange={(event) => setForm({ ...form, monthlyOrderLimit: event.target.value })} />
        <Input label="یادداشت" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
      </div>
    </div>
  );
}
