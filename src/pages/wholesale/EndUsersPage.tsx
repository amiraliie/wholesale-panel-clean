import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import toast from 'react-hot-toast';
import {
  CheckCircle2,
  Copy,
  Eye,
  Filter,
  Loader2,
  Pencil,
  Plus,
  QrCode,
  RefreshCw,
  Search,
  Trash2,
  Users,
  WalletCards,
  XCircle,
  Zap,
} from 'lucide-react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { StatusBadge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { EmptyState, ErrorState, LoadingState } from '../../components/RemoteState';
import { useRemoteData } from '../../hooks/useRemoteData';
import { backend } from '../../services/backend';
import { formatBytes, formatDateTime } from '../../lib/utils';

const SUBSCRIPTION_BASE_URL = 'https://wp.premiumcash.click:2096/wp/premiumcash/sub';

type ModalType = 'view' | 'renew' | 'edit' | 'delete' | 'paid';

function getValue(item: any, camel: string, snake?: string, fallback: any = '') {
  if (item?.[camel] !== undefined && item?.[camel] !== null && item?.[camel] !== '') return item[camel];
  if (snake && item?.[snake] !== undefined && item?.[snake] !== null && item?.[snake] !== '') return item[snake];
  return fallback;
}

function toNumber(value: any) {
  const num = Number(value || 0);
  return Number.isFinite(num) ? num : 0;
}

function bytesToGB(value: any) {
  return toNumber(value) / 1024 / 1024 / 1024;
}

function getSubscriptionLink(user: any) {
  const directLink =
    getValue(user, 'subscriptionLink', 'subscription_link', '') ||
    getValue(user, 'subscriptionUrl', 'subscription_url', '');

  if (directLink) return String(directLink);

  const subId = getValue(user, 'subId', 'sub_id', '');

  if (!subId) return '';

  return `${SUBSCRIPTION_BASE_URL}/${encodeURIComponent(String(subId))}`;
}

function getConfigLink(user: any) {
  return String(
    getValue(user, 'configLink', 'config_link', '') ||
    getValue(user, 'configUrl', 'config_url', ''),
  );
}

function getPlanName(user: any) {
  return (
    getValue(user, 'planName', 'plan_name', '') ||
    user?.plan?.name ||
    'بدون پلن'
  );
}

function getServerName(user: any) {
  return (
    getValue(user, 'serverName', 'server_name', '') ||
    user?.server?.name ||
    user?.inbound?.server?.name ||
    'نامشخص'
  );
}

function getInboundName(user: any) {
  return (
    getValue(user, 'inboundName', 'inbound_name', '') ||
    user?.inbound?.name ||
    'نامشخص'
  );
}

function hasLiveTrafficStats(user: any) {
  return getValue(
    user,
    'trafficStatsAvailable',
    'traffic_stats_available',
    false,
  ) === true;
}

function getTrafficUsed(user: any) {
  if (!hasLiveTrafficStats(user)) return 0;

  return toNumber(
    getValue(
      user,
      'liveTrafficUsed',
      'live_traffic_used',
      0,
    ),
  );
}

function getTrafficLimit(user: any) {
  if (!hasLiveTrafficStats(user)) return 0;

  return toNumber(
    getValue(
      user,
      'liveTrafficLimit',
      'live_traffic_limit',
      0,
    ),
  );
}

function getTrafficPercent(user: any) {
  if (!hasLiveTrafficStats(user)) return 0;

  const limit = getTrafficLimit(user);

  if (limit <= 0) return 0;

  return Math.min(
    100,
    Math.round((getTrafficUsed(user) / limit) * 100),
  );
}

function getTrafficRemainingGB(user: any): number | null {
  if (!hasLiveTrafficStats(user)) return null;

  const limit = getTrafficLimit(user);

  if (limit <= 0) return null;

  return Math.max(
    0,
    bytesToGB(limit - getTrafficUsed(user)),
  );
}

function getExpiryValue(user: any) {
  if (hasLiveTrafficStats(user)) {
    return getValue(
      user,
      'liveExpiryTime',
      'live_expiry_time',
      '',
    );
  }

  return getValue(user, 'expiryTime', 'expiry_time', '');
}

function getDaysLeft(user: any): number | null {
  const expiry = getExpiryValue(user);

  if (!expiry) return null;

  const timestamp = new Date(expiry).getTime();

  if (!Number.isFinite(timestamp)) return null;

  return Math.ceil((timestamp - Date.now()) / 86400000);
}

function getEffectiveStatus(user: any) {
  if (hasLiveTrafficStats(user)) {
    return String(
      getValue(
        user,
        'liveStatus',
        'live_status',
        'active',
      ),
    );
  }

  return String(user.status || 'active');
}

function getFinishedReason(
  user: any,
): 'traffic' | 'expiry' | 'disabled' | null {
  if (!hasLiveTrafficStats(user)) return null;

  const reason = getValue(
    user,
    'liveFinishedReason',
    'live_finished_reason',
    '',
  );

  if (
    reason === 'traffic' ||
    reason === 'expiry' ||
    reason === 'disabled'
  ) {
    return reason;
  }

  return null;
}

function isPaid(user: any) {
  return Boolean(
    getValue(user, 'customerPaid', 'customer_paid', false) ||
    getValue(user, 'hasPaid', 'has_paid', false) ||
    getValue(user, 'isPaid', 'is_paid', false),
  );
}

function money(value: number) {
  return new Intl.NumberFormat('fa-IR').format(value || 0);
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    active: 'فعال',
    limited: 'محدود',
    expired: 'منقضی',
    disabled: 'غیرفعال',
  };

  return labels[status] || status || '-';
}

async function copyText(text: string, label = 'متن') {
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

export default function EndUsersPage() {
  const { data: users, isLoading, error, reload } = useRemoteData(() => backend.endUsers.list(), []);
  const { data: plans } = useRemoteData(() => backend.plans.list(), []);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [paidFilter, setPaidFilter] = useState('all');
  const [modal, setModal] = useState<{ type: ModalType; user: any } | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');

  const [renewMode, setRenewMode] = useState<'plan' | 'custom'>('plan');
  const [renewPlanId, setRenewPlanId] = useState('');
  const [customDays, setCustomDays] = useState('30');
  const [customGB, setCustomGB] = useState('10');

  const [editAddDays, setEditAddDays] = useState('0');
  const [editAddGB, setEditAddGB] = useState('0');
  const [editActive, setEditActive] = useState(true);

  const [paidValue, setPaidValue] = useState(true);
  const [paidNote, setPaidNote] = useState('');

  const filteredUsers = useMemo(() => {
    const q = search.toLowerCase();

    return (users || []).filter((user: any) => {
      const status = getEffectiveStatus(user);
      const paid = isPaid(user);

      const matchesSearch = [
        user.email,
        getPlanName(user),
        getServerName(user),
        getInboundName(user),
        getValue(user, 'subId', 'sub_id', ''),
        status,
      ].join(' ').toLowerCase().includes(q);

      const matchesStatus = statusFilter === 'all' || status === statusFilter;
      const matchesPaid =
        paidFilter === 'all' ||
        (paidFilter === 'paid' && paid) ||
        (paidFilter === 'unpaid' && !paid);

      return matchesSearch && matchesStatus && matchesPaid;
    });
  }, [users, search, statusFilter, paidFilter]);

  const stats = useMemo(() => {
    const list = users || [];
    return {
      total: list.length,
      active: list.filter((user: any) => getEffectiveStatus(user) === 'active').length,
      expiring: list.filter((user: any) => {
        const days = getDaysLeft(user);
        return days !== null && days >= 0 && days <= 7;
      }).length,
      unpaid: list.filter((user: any) => !isPaid(user)).length,
    };
  }, [users]);

  function openModal(type: ModalType, user: any) {
    setFormError('');
    setModal({ type, user });

    if (type === 'renew') {
      setRenewMode('plan');
      setRenewPlanId(String((plans || [])[0]?.id || ''));
      setCustomDays('30');
      setCustomGB('10');
    }

    if (type === 'edit') {
      setEditAddDays('0');
      setEditAddGB('0');
      setEditActive(Boolean(getValue(user, 'isActive', 'is_active', true)));
    }

    if (type === 'paid') {
      setPaidValue(!isPaid(user));
      setPaidNote('');
    }
  }

  async function runAction(action: () => Promise<any>, successMessage: string) {
    setBusy(true);
    setFormError('');

    try {
      await action();
      toast.success(successMessage);
      setModal(null);
      await reload();
    } catch (err: any) {
      setFormError(err?.message || 'عملیات ناموفق بود');
    } finally {
      setBusy(false);
    }
  }

  const currentUser = modal?.user;
  const currentUserId = currentUser ? String(currentUser.id) : '';
  const customRenewPrice = Number(customDays || 0) * 1000 + Number(customGB || 0) * 20000;
  const editExtraPrice = Number(editAddDays || 0) * 1000 + Number(editAddGB || 0) * 20000;

  return (
    <DashboardLayout title="کاربران نهایی">
      <div className="space-y-6">
        <div className="rounded-2xl border border-slate-200 bg-gradient-to-l from-sky-50 via-white to-emerald-50 p-5 shadow-sm dark:border-slate-700 dark:from-slate-900 dark:via-slate-900 dark:to-emerald-950/40">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">
                مدیریت کاربران نهایی
              </h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                مشاهده، تمدید، ویرایش، حذف، QR و مدیریت وضعیت پرداخت کاربران
              </p>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button variant="outline" leftIcon={<RefreshCw className="h-4 w-4" />} onClick={reload}>
                بروزرسانی
              </Button>

              <Link to="/dashboard/create-config">
                <Button leftIcon={<Plus className="h-4 w-4" />}>
                  کاربر جدید
                </Button>
              </Link>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            <StatBox icon={<Users className="h-5 w-5" />} label="کل کاربران" value={String(stats.total)} tone="sky" />
            <StatBox icon={<Zap className="h-5 w-5" />} label="فعال" value={String(stats.active)} tone="emerald" />
            <StatBox icon={<RefreshCw className="h-5 w-5" />} label="در حال انقضا" value={String(stats.expiring)} tone="amber" />
            <StatBox icon={<WalletCards className="h-5 w-5" />} label="پرداخت‌نشده" value={String(stats.unpaid)} tone="violet" />
          </div>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Filter className="h-5 w-5 text-sky-600" />
              <CardTitle>فیلترها</CardTitle>
            </div>
          </CardHeader>

          <CardContent>
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
              <div className="relative xl:col-span-3">
                <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  placeholder="جستجوی ایمیل، پلن، سرور، اینباند یا sub id..."
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="pr-10"
                />
              </div>

              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              >
                <option value="all">همه وضعیت‌ها</option>
                <option value="active">فعال</option>
                <option value="limited">محدود</option>
                <option value="expired">منقضی</option>
                <option value="disabled">غیرفعال</option>
              </select>

              <select
                value={paidFilter}
                onChange={(event) => setPaidFilter(event.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              >
                <option value="all">همه پرداخت‌ها</option>
                <option value="paid">پرداخت کرده</option>
                <option value="unpaid">پرداخت نکرده</option>
              </select>
            </div>
          </CardContent>
        </Card>

        {isLoading && <LoadingState title="در حال دریافت کاربران..." />}

        {error && (
          <ErrorState
            title="خطا در دریافت کاربران"
            description={String(error)}
            onRetry={reload}
          />
        )}

        {!isLoading && !error && filteredUsers.length === 0 && (
          <EmptyState
            title="کاربری یافت نشد"
            description="هنوز کاربر نهایی ساخته نشده یا نتیجه‌ای برای فیلترهای شما وجود ندارد."
          />
        )}

        {!isLoading && !error && filteredUsers.length > 0 && (
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1180px]">
                  <thead className="bg-slate-50 dark:bg-slate-800/70">
                    <tr>
                      {['کاربر', 'پلن / سرور', 'مصرف', 'انقضا', 'وضعیت', 'پرداخت', 'عملیات'].map((head) => (
                        <th key={head} className="px-4 py-3 text-right text-xs font-medium text-slate-500 dark:text-slate-400">
                          {head}
                        </th>
                      ))}
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                    {filteredUsers.map((user: any) => {
                      const trafficAvailable = hasLiveTrafficStats(user);
                      const percent = getTrafficPercent(user);
                      const trafficUsed = getTrafficUsed(user);
                      const trafficLimit = getTrafficLimit(user);
                      const trafficRemaining = getTrafficRemainingGB(user);
                      const finishedReason = getFinishedReason(user);
                      const paid = isPaid(user);
                      const subscriptionLink = getSubscriptionLink(user);
                      const configLink = getConfigLink(user);
                      const expiry = getExpiryValue(user);
                      const daysLeft = getDaysLeft(user);
                      const active = trafficAvailable
                        ? Boolean(getValue(user, 'liveEnabled', 'live_enabled', true))
                        : Boolean(getValue(user, 'isActive', 'is_active', true));
                      const status = getEffectiveStatus(user);

                      return (
                        <tr key={user.id} className="hover:bg-sky-50/50 dark:hover:bg-slate-800/70">
                          <td className="px-4 py-4">
                            <div className="font-medium text-slate-800 dark:text-slate-100">
                              {user.email}
                            </div>
                            <div className="mt-1 font-mono text-xs text-slate-500">
                              {getValue(user, 'subId', 'sub_id', 'بدون sub id')}
                            </div>
                          </td>

                          <td className="px-4 py-4">
                            <div className="text-sm font-medium text-slate-700 dark:text-slate-200">
                              {getPlanName(user)}
                            </div>
                            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                              {getServerName(user)} / {getInboundName(user)}
                            </div>
                          </td>

                          <td className="px-4 py-4">
                            {!trafficAvailable ? (
                              <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                آمار در دسترس نیست
                              </span>
                            ) : finishedReason === 'traffic' ? (
                              <div>
                                <span className="inline-flex rounded-full bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-700 dark:bg-rose-900/30 dark:text-rose-300">
                                  حجم کاربر تمام شده
                                </span>

                                <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                                  {formatBytes(trafficUsed)} / {formatBytes(trafficLimit)}
                                </div>
                              </div>
                            ) : (
                              <div>
                                {trafficLimit > 0 && (
                                  <div className="flex items-center gap-2">
                                    <div className="h-2 w-32 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                                      <div
                                        className={`h-full rounded-full ${
                                          percent >= 90
                                            ? 'bg-rose-500'
                                            : percent >= 70
                                              ? 'bg-amber-500'
                                              : 'bg-sky-500'
                                        }`}
                                        style={{ width: `${percent}%` }}
                                      />
                                    </div>

                                    <span className="whitespace-nowrap text-xs text-slate-500 dark:text-slate-400">
                                      {formatBytes(trafficUsed)} / {formatBytes(trafficLimit)}
                                    </span>
                                  </div>
                                )}

                                {trafficLimit <= 0 && (
                                  <div className="text-xs text-slate-500 dark:text-slate-400">
                                    {formatBytes(trafficUsed)} مصرف‌شده / نامحدود
                                  </div>
                                )}

                                <div className="mt-1 text-xs text-slate-500">
                                  {trafficRemaining === null
                                    ? 'بدون محدودیت حجم'
                                    : `${trafficRemaining.toFixed(1)} GB باقی‌مانده`}
                                </div>
                              </div>
                            )}
                          </td>

                          <td className="px-4 py-4 text-sm text-slate-600 dark:text-slate-300">
                            {trafficAvailable && finishedReason === 'expiry' ? (
                              <span className="inline-flex rounded-full bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-700 dark:bg-rose-900/30 dark:text-rose-300">
                                زمان کاربر تمام شده
                              </span>
                            ) : expiry ? (
                              <>
                                {formatDateTime(expiry)}
                                <div className="mt-1 text-xs text-slate-500">
                                  {daysLeft !== null
                                    ? `${daysLeft} روز باقی‌مانده`
                                    : '-'}
                                </div>
                              </>
                            ) : (
                              <span className="text-xs text-slate-500">
                                بدون انقضا
                              </span>
                            )}
                          </td>

                          <td className="px-4 py-4">
                            <div className="flex flex-col gap-2">
                              <StatusBadge status={status} />
                              <span className={`inline-flex w-fit rounded-full px-2.5 py-1 text-xs font-medium ${
                                active
                                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                                  : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                              }`}>
                                {active ? 'فعال در پنل' : 'غیرفعال در پنل'}
                              </span>
                            </div>
                          </td>

                          <td className="px-4 py-4">
                            <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${
                              paid
                                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                                : 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                            }`}>
                              {paid ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                              {paid ? 'پرداخت کرده' : 'پرداخت نکرده'}
                            </span>
                          </td>

                          <td className="px-4 py-4">
                            <div className="flex flex-wrap items-center gap-1">
                              <IconButton title="جزئیات" onClick={() => openModal('view', user)}>
                                <Eye className="h-4 w-4 text-sky-600" />
                              </IconButton>

                              <IconButton title="کپی سابسکریپشن" onClick={() => copyText(subscriptionLink, 'لینک سابسکریپشن')}>
                                <Copy className="h-4 w-4 text-emerald-600" />
                              </IconButton>

                              <IconButton title="QR و لینک‌ها" onClick={() => openModal('view', user)}>
                                <QrCode className="h-4 w-4 text-violet-600" />
                              </IconButton>

                              <IconButton title="تمدید" onClick={() => openModal('renew', user)}>
                                <RefreshCw className="h-4 w-4 text-emerald-600" />
                              </IconButton>

                              <IconButton title="ادیت" onClick={() => openModal('edit', user)}>
                                <Pencil className="h-4 w-4 text-indigo-600" />
                              </IconButton>

                              <IconButton title="وضعیت پرداخت" onClick={() => openModal('paid', user)}>
                                {paid ? <XCircle className="h-4 w-4 text-amber-600" /> : <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
                              </IconButton>

                              <IconButton title="حذف" onClick={() => openModal('delete', user)}>
                                <Trash2 className="h-4 w-4 text-rose-600" />
                              </IconButton>
                            </div>

                            {!subscriptionLink && !configLink && (
                              <div className="mt-2 text-xs text-amber-600">
                                لینک قابل نمایش موجود نیست
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        <Modal
          isOpen={!!modal}
          onClose={() => !busy && setModal(null)}
          title={
            modal?.type === 'view' ? 'جزئیات کاربر'
              : modal?.type === 'renew' ? 'تمدید کانفیگ'
                : modal?.type === 'edit' ? 'ادیت کاربر'
                  : modal?.type === 'delete' ? 'حذف کاربر'
                    : modal?.type === 'paid' ? 'وضعیت پرداخت کاربر'
                      : ''
          }
          size="lg"
        >
          {currentUser && (
            <div className="space-y-5">
              <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-800">
                <div className="font-medium text-slate-800 dark:text-slate-100">
                  {currentUser.email}
                </div>
                <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  {getPlanName(currentUser)} / {getServerName(currentUser)}
                </div>
              </div>

              {formError && (
                <div className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-900/30 dark:text-rose-300">
                  {formError}
                </div>
              )}

              {modal?.type === 'view' && (
                <UserDetails
                  user={currentUser}
                  onCopy={copyText}
                />
              )}

              {modal?.type === 'renew' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setRenewMode('plan')}
                      className={`rounded-xl px-3 py-2 text-sm font-medium transition ${
                        renewMode === 'plan'
                          ? 'bg-sky-600 text-white'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
                      }`}
                    >
                      تمدید با پلن
                    </button>

                    <button
                      type="button"
                      onClick={() => setRenewMode('custom')}
                      className={`rounded-xl px-3 py-2 text-sm font-medium transition ${
                        renewMode === 'custom'
                          ? 'bg-sky-600 text-white'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
                      }`}
                    >
                      تمدید دلخواه
                    </button>
                  </div>

                  {renewMode === 'plan' ? (
                    <div>
                      <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200">
                        انتخاب پلن
                      </label>
                      <select
                        value={renewPlanId}
                        onChange={(event) => setRenewPlanId(event.target.value)}
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                      >
                        {(plans || []).map((plan: any) => (
                          <option key={plan.id} value={plan.id}>
                            {plan.name} - {money(Number(getValue(plan, 'basePrice', 'base_price', 0)))} تومان
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div className="grid gap-3 md:grid-cols-2">
                      <Input
                        label="تعداد روز"
                        value={customDays}
                        onChange={(event) => setCustomDays(event.target.value)}
                        type="number"
                        min="1"
                      />

                      <Input
                        label="حجم GB"
                        value={customGB}
                        onChange={(event) => setCustomGB(event.target.value)}
                        type="number"
                        min="1"
                      />

                      <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600 dark:bg-slate-800 dark:text-slate-300 md:col-span-2">
                        قیمت تقریبی: روز × ۱,۰۰۰ + گیگ × ۲۰,۰۰۰ = {money(customRenewPrice)} تومان
                      </div>
                    </div>
                  )}

                  <Button
                    className="w-full"
                    isLoading={busy}
                    disabled={busy || (renewMode === 'plan' && !renewPlanId)}
                    onClick={() => runAction(
                      () => backend.endUsers.renew(currentUserId, renewMode === 'plan'
                        ? { planId: renewPlanId }
                        : { customDays: Number(customDays), customGB: Number(customGB) }),
                      'تمدید با موفقیت انجام شد',
                    )}
                  >
                    تایید تمدید
                  </Button>
                </div>
              )}

              {modal?.type === 'edit' && (
                <div className="space-y-4">
                  <div className="grid gap-3 md:grid-cols-2">
                    <Input
                      label="روز اضافه شود"
                      value={editAddDays}
                      onChange={(event) => setEditAddDays(event.target.value)}
                      type="number"
                      min="0"
                    />

                    <Input
                      label="GB اضافه شود"
                      value={editAddGB}
                      onChange={(event) => setEditAddGB(event.target.value)}
                      type="number"
                      min="0"
                    />
                  </div>

                  <label className="flex items-center justify-between rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                      کاربر فعال باشد
                    </span>
                    <input
                      type="checkbox"
                      checked={editActive}
                      onChange={(event) => setEditActive(event.target.checked)}
                      className="h-5 w-5 accent-sky-600"
                    />
                  </label>

                  <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    هزینه تقریبی افزایش: روز اضافه × ۱,۰۰۰ + گیگ اضافه × ۲۰,۰۰۰ = {money(editExtraPrice)} تومان
                  </div>

                  <Button
                    className="w-full"
                    isLoading={busy}
                    disabled={busy}
                    onClick={() => runAction(
                      () => backend.endUsers.update(currentUserId, {
                        addDays: Number(editAddDays || 0),
                        addTrafficGB: Number(editAddGB || 0),
                        isActive: editActive,
                      }),
                      'تغییرات کاربر ذخیره شد',
                    )}
                  >
                    ذخیره تغییرات
                  </Button>
                </div>
              )}

              {modal?.type === 'paid' && (
                <div className="space-y-4">
                  <label className="flex items-center justify-between rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                      این کاربر به شما پرداخت کرده است
                    </span>
                    <input
                      type="checkbox"
                      checked={paidValue}
                      onChange={(event) => setPaidValue(event.target.checked)}
                      className="h-5 w-5 accent-emerald-600"
                    />
                  </label>

                  <Input
                    label="یادداشت اختیاری"
                    value={paidNote}
                    onChange={(event) => setPaidNote(event.target.value)}
                    placeholder="مثلاً پرداخت کارت به کارت..."
                  />

                  <Button
                    className="w-full"
                    isLoading={busy}
                    disabled={busy}
                    onClick={() => runAction(
                      () => backend.endUsers.setPaid(currentUserId, {
                        paid: paidValue,
                        note: paidNote,
                      }),
                      'وضعیت پرداخت ذخیره شد',
                    )}
                  >
                    ثبت وضعیت پرداخت
                  </Button>
                </div>
              )}

              {modal?.type === 'delete' && (
                <div className="space-y-4">
                  <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-900/30 dark:text-rose-300">
                    این کاربر از پنل عمده‌فروشی و 3x-ui حذف می‌شود. این عملیات را فقط وقتی انجام بده که مطمئنی.
                  </div>

                  <Button
                    className="w-full bg-rose-600 hover:bg-rose-700"
                    isLoading={busy}
                    disabled={busy}
                    onClick={() => runAction(
                      () => backend.endUsers.remove(currentUserId),
                      'کاربر حذف شد',
                    )}
                  >
                    حذف کاربر
                  </Button>
                </div>
              )}

              <Button
                variant="outline"
                className="w-full"
                disabled={busy}
                onClick={() => setModal(null)}
              >
                بستن
              </Button>
            </div>
          )}
        </Modal>
      </div>
    </DashboardLayout>
  );
}

function UserDetails({
  user,
  onCopy,
}: {
  user: any;
  onCopy: (text: string, label?: string) => void;
}) {
  const subscriptionLink = getSubscriptionLink(user);
  const configLink = getConfigLink(user);
  const expiry = getValue(user, 'expiryTime', 'expiry_time', '');

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <DetailBox label="ایمیل" value={user.email || '-'} />
        <DetailBox label="پلن" value={getPlanName(user)} />
        <DetailBox label="سرور" value={getServerName(user)} />
        <DetailBox label="اینباند" value={getInboundName(user)} />
        <DetailBox label="وضعیت" value={statusLabel(user.status)} />
        <DetailBox label="انقضا" value={expiry ? formatDateTime(expiry) : '-'} />
      </div>

      <LinkBox
        label="لینک سابسکریپشن"
        value={subscriptionLink}
        onCopy={() => onCopy(subscriptionLink, 'لینک سابسکریپشن')}
      />

      <LinkBox
        label="لینک کانفیگ"
        value={configLink}
        onCopy={() => onCopy(configLink, 'لینک کانفیگ')}
      />

      <div className="grid gap-4 md:grid-cols-2">
        {subscriptionLink && (
          <QrBox title="QR سابسکریپشن" value={subscriptionLink} />
        )}

        {configLink && (
          <QrBox title="QR کانفیگ" value={configLink} />
        )}
      </div>
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

function QrBox({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
      <div className="mb-3 text-sm font-medium text-slate-700 dark:text-slate-200">
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

function IconButton({
  children,
  onClick,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700"
    >
      {children}
    </button>
  );
}

function DetailBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
      <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-1 break-all text-sm font-medium text-slate-800 dark:text-slate-100">{value || '-'}</p>
    </div>
  );
}

function StatBox({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: 'sky' | 'emerald' | 'amber' | 'violet';
}) {
  const tones = {
    sky: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
    emerald: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
    amber: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    violet: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
  };

  return (
    <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-100 dark:bg-slate-800/70 dark:ring-slate-700">
      <div className="flex items-center gap-3">
        <div className={`rounded-xl p-2 ${tones[tone]}`}>
          {icon}
        </div>
        <div>
          <p className="text-xs text-slate-500">{label}</p>
          <p className="mt-1 text-xl font-bold text-slate-800 dark:text-slate-100">{value}</p>
        </div>
      </div>
    </div>
  );
}
