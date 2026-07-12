import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { StatusBadge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { EmptyState, ErrorState, LoadingState } from '../../components/RemoteState';
import { useRemoteData } from '../../hooks/useRemoteData';
import { backend } from '../../services/backend';
import {
  Activity,
  AlertTriangle,
  DatabaseZap,
  Globe2,
  MapPin,
  Network,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Server,
  ShieldCheck,
  Trash2,
  Wifi,
} from 'lucide-react';

function getValue(item: any, camel: string, snake?: string, fallback: any = '') {
  if (item?.[camel] !== undefined && item?.[camel] !== null) return item[camel];
  if (snake && item?.[snake] !== undefined && item?.[snake] !== null) return item[snake];
  return fallback;
}

function isActive(item: any) {
  return getValue(item, 'isActive', 'is_active', true) !== false;
}

function healthLabel(status?: string | null) {
  if (!status) return 'بررسی نشده';
  if (status === 'healthy') return 'سالم';
  if (status === 'unhealthy') return 'ناسالم';
  return status;
}

function emptyServerForm() {
  return {
    name: '',
    host: '',
    port: '2053',
    basePath: '/panel',
    username: '',
    password: '',
    location: '',
    description: '',
    subscriptionUrl: '',
    isActive: true,
  };
}

export default function ServersPage() {
  const { data: servers, isLoading, error, reload } = useRemoteData(() => backend.servers.list(), []);
  const { data: inbounds, reload: reloadInbounds } = useRemoteData(() => backend.inbounds.list(), []);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editServer, setEditServer] = useState<any | null>(null);
  const [deleteServer, setDeleteServer] = useState<any | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [testingId, setTestingId] = useState('');
  const [syncingId, setSyncingId] = useState('');
  const [deletingId, setDeletingId] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  const [form, setForm] = useState(emptyServerForm());
  const [editForm, setEditForm] = useState(emptyServerForm());

  const filteredServers = useMemo(() => {
    const q = searchTerm.toLowerCase();

    return (servers || []).filter((serverItem: any) => {
      const haystack = [
        serverItem.name,
        serverItem.host,
        serverItem.location,
        serverItem.description,
      ].join(' ').toLowerCase();

      return haystack.includes(q);
    });
  }, [servers, searchTerm]);

  const filteredInbounds = useMemo(() => {
    const q = searchTerm.toLowerCase();

    return (inbounds || []).filter((inbound: any) => {
      const haystack = [
        inbound.name,
        inbound.protocol,
        inbound.port,
        getValue(inbound, 'serverName', 'server_name', ''),
        getValue(inbound, 'serverHost', 'server_host', ''),
      ].join(' ').toLowerCase();

      return haystack.includes(q);
    });
  }, [inbounds, searchTerm]);

  const stats = useMemo(() => {
    const serverList = servers || [];
    const inboundList = inbounds || [];

    return {
      servers: serverList.length,
      activeServers: serverList.filter((serverItem: any) => isActive(serverItem)).length,
      inbounds: inboundList.length,
      activeInbounds: inboundList.filter((inbound: any) => isActive(inbound)).length,
    };
  }, [servers, inbounds]);

  function inboundsForServer(serverId: string) {
    return (inbounds || []).filter((inbound: any) => getValue(inbound, 'serverId', 'server_id', '') === serverId);
  }

  function openEditModal(serverItem: any) {
    setEditServer(serverItem);
    setEditForm({
      name: serverItem.name || '',
      host: serverItem.host || '',
      port: String(serverItem.port || '2053'),
      basePath: getValue(serverItem, 'basePath', 'base_path', '/panel'),
      username: '',
      password: '',
      location: serverItem.location || '',
      description: serverItem.description || '',
      subscriptionUrl: getValue(serverItem, 'subscriptionUrl', 'subscription_url', ''),
      isActive: isActive(serverItem),
    });
  }

  async function createServer() {
    setIsSubmitting(true);

    try {
      await backend.servers.create({
        name: form.name.trim(),
        host: form.host.trim(),
        port: Number(form.port),
        basePath: form.basePath.trim(),
        username: form.username.trim(),
        password: form.password,
        location: form.location.trim(),
        description: form.description.trim(),
        subscriptionUrl: form.subscriptionUrl.trim(),
        isActive: form.isActive,
      });

      setShowCreateModal(false);
      setForm(emptyServerForm());
      await reload();
    } catch (err: any) {
      alert(err.message || 'خطا در ثبت سرور');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function updateServer() {
    if (!editServer?.id) return;

    setIsEditing(true);

    try {
      const payload: any = {
        name: editForm.name.trim(),
        host: editForm.host.trim(),
        port: Number(editForm.port),
        basePath: editForm.basePath.trim(),
        isActive: editForm.isActive,
        location: editForm.location.trim(),
        description: editForm.description.trim(),
        subscriptionUrl: editForm.subscriptionUrl.trim(),
      };

      if (editForm.username.trim()) {
        payload.username = editForm.username.trim();
      }

      if (editForm.password) {
        payload.password = editForm.password;
      }

      await backend.servers.update(editServer.id, payload);

      alert('سرور با موفقیت ویرایش شد');
      setEditServer(null);
      await reload();
      await reloadInbounds();
    } catch (err: any) {
      alert(err.message || 'خطا در ویرایش سرور');
    } finally {
      setIsEditing(false);
    }
  }

  async function removeServer() {
    if (!deleteServer?.id) return;

    setDeletingId(deleteServer.id);

    try {
      await backend.servers.remove(deleteServer.id);
      alert('سرور و اینباندهای وابسته با موفقیت حذف شدند');
      setDeleteServer(null);
      await reload();
      await reloadInbounds();
    } catch (err: any) {
      alert(err.message || 'خطا در حذف سرور');
    } finally {
      setDeletingId('');
    }
  }

  async function test(id: string) {
    setTestingId(id);

    try {
      await backend.servers.test(id);
      alert('اتصال موفق بود');
      await reload();
    } catch (err: any) {
      alert(err.message || 'اتصال ناموفق بود');
    } finally {
      setTestingId('');
    }
  }

  async function sync(id: string) {
    setSyncingId(id);

    try {
      await backend.servers.syncInbounds(id);
      alert('سینک اینباندها انجام شد');
      await reload();
      await reloadInbounds();
    } catch (err: any) {
      alert(err.message || 'خطا در سینک اینباندها');
    } finally {
      setSyncingId('');
    }
  }

  return (
    <DashboardLayout title="مدیریت سرورها">
      <div className="space-y-6">
        <div className="rounded-2xl border border-slate-200 bg-gradient-to-l from-sky-50 via-white to-emerald-50 p-5 shadow-sm dark:border-slate-700 dark:from-slate-900 dark:via-slate-900 dark:to-emerald-950/40">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">
                سرورها و اینباندهای 3x-ui
              </h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                ثبت، ویرایش، حذف امن، تست اتصال و سینک اینباندها
              </p>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button variant="outline" leftIcon={<RefreshCw className="h-4 w-4" />} onClick={() => { reload(); reloadInbounds(); }}>
                بروزرسانی
              </Button>
              <Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => setShowCreateModal(true)}>
                سرور جدید
              </Button>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            <StatCard icon={<Server className="h-5 w-5" />} label="کل سرورها" value={String(stats.servers)} tone="sky" />
            <StatCard icon={<ShieldCheck className="h-5 w-5" />} label="سرورهای فعال" value={String(stats.activeServers)} tone="emerald" />
            <StatCard icon={<Network className="h-5 w-5" />} label="کل اینباندها" value={String(stats.inbounds)} tone="violet" />
            <StatCard icon={<Activity className="h-5 w-5" />} label="اینباندهای فعال" value={String(stats.activeInbounds)} tone="amber" />
          </div>
        </div>

        {error && <ErrorState message={error} onRetry={reload} />}

        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <CardTitle>لیست سرورها</CardTitle>

              <div className="relative w-full md:max-w-md">
                <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  placeholder="جستجوی سرور، هاست یا لوکیشن..."
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  className="pr-10"
                />
              </div>
            </div>
          </CardHeader>

          <CardContent>
            {isLoading ? (
              <LoadingState />
            ) : !filteredServers.length ? (
              <EmptyState text="هنوز سروری ثبت نشده است." />
            ) : (
              <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
                {filteredServers.map((serverItem: any) => {
                  const serverInbounds = inboundsForServer(serverItem.id);
                  const activeServer = isActive(serverItem);
                  const health = serverItem.health_status || serverItem.healthStatus;

                  return (
                    <div
                      key={serverItem.id}
                      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-slate-700 dark:bg-slate-900"
                    >
                      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="rounded-xl bg-sky-100 p-2 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300">
                              <Server className="h-5 w-5" />
                            </div>
                            <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">
                              {serverItem.name}
                            </h3>
                            <StatusBadge status={activeServer ? 'active' : 'disabled'} />
                          </div>

                          <div className="mt-3 space-y-2 text-sm text-slate-500 dark:text-slate-400">
                            <div className="flex items-center gap-2">
                              <Globe2 className="h-4 w-4 text-slate-400" />
                              <span className="break-all">{serverItem.host}:{serverItem.port}</span>
                            </div>

                            <div className="flex items-center gap-2">
                              <DatabaseZap className="h-4 w-4 text-slate-400" />
                              <span>مسیر پنل: {getValue(serverItem, 'basePath', 'base_path', '-')}</span>
                            </div>

                            <div className="flex items-center gap-2">
                              <MapPin className="h-4 w-4 text-slate-400" />
                              <span>{serverItem.location || 'لوکیشن ثبت نشده'}</span>
                            </div>
                          </div>

                          {serverItem.description && (
                            <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                              {serverItem.description}
                            </p>
                          )}
                        </div>

                        <div className="flex flex-row flex-wrap gap-2 md:flex-col">
                          <Button size="sm" variant="outline" isLoading={testingId === serverItem.id} onClick={() => test(serverItem.id)}>
                            <Wifi className="h-4 w-4" />
                          </Button>

                          <Button size="sm" variant="outline" isLoading={syncingId === serverItem.id} onClick={() => sync(serverItem.id)}>
                            <RefreshCw className="h-4 w-4" />
                          </Button>

                          <Button size="sm" variant="outline" onClick={() => openEditModal(serverItem)}>
                            <Pencil className="h-4 w-4 text-indigo-600" />
                          </Button>

                          <Button
                            size="sm"
                            variant="outline"
                            isLoading={deletingId === serverItem.id}
                            onClick={() => setDeleteServer(serverItem)}
                            className="border-rose-200 text-rose-600 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-300 dark:hover:bg-rose-900/20"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>

                      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
                        <MiniInfo label="وضعیت سلامت" value={healthLabel(health)} />
                        <MiniInfo label="تعداد اینباند" value={String(serverInbounds.length)} />
                        <MiniInfo label="آخرین تست" value={getValue(serverItem, 'lastHealthCheck', 'last_health_check', '') ? new Date(getValue(serverItem, 'lastHealthCheck', 'last_health_check')).toLocaleString('fa-IR') : 'ندارد'} />
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        {serverInbounds.slice(0, 6).map((inbound: any) => (
                          <span
                            key={inbound.id}
                            className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-3 py-1 text-xs font-medium text-violet-700 dark:bg-violet-900/30 dark:text-violet-300"
                          >
                            <Network className="h-3.5 w-3.5" />
                            {inbound.name}
                          </span>
                        ))}

                        {serverInbounds.length > 6 && (
                          <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                            +{serverInbounds.length - 6} بیشتر
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>اینباندهای سینک‌شده</CardTitle>
          </CardHeader>

          <CardContent className="p-0">
            {!filteredInbounds.length ? (
              <div className="p-6">
                <EmptyState text="بعد از ثبت سرور، دکمه سینک را بزن." />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[850px]">
                  <thead className="bg-slate-50 dark:bg-slate-800/70">
                    <tr>
                      {['اینباند', 'پروتکل', 'پورت', 'سرور', 'وضعیت', 'شناسه 3x-ui'].map((head) => (
                        <th key={head} className="px-4 py-3 text-right text-xs font-medium text-slate-500 dark:text-slate-400">
                          {head}
                        </th>
                      ))}
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                    {filteredInbounds.map((inbound: any) => (
                      <tr key={inbound.id} className="hover:bg-sky-50/50 dark:hover:bg-slate-800/70">
                        <td className="px-4 py-4">
                          <div className="font-medium text-slate-800 dark:text-slate-100">{inbound.name}</div>
                          <div className="mt-1 text-xs text-slate-500">{inbound.tag || 'بدون tag'}</div>
                        </td>

                        <td className="px-4 py-4">
                          <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-medium text-sky-700 dark:bg-sky-900/30 dark:text-sky-300">
                            {inbound.protocol}
                          </span>
                        </td>

                        <td className="px-4 py-4 text-sm text-slate-600 dark:text-slate-300">
                          {inbound.port}
                        </td>

                        <td className="px-4 py-4 text-sm text-slate-600 dark:text-slate-300">
                          {getValue(inbound, 'serverName', 'server_name', getValue(inbound, 'serverId', 'server_id', '-'))}
                        </td>

                        <td className="px-4 py-4">
                          <StatusBadge status={isActive(inbound) ? 'active' : 'disabled'} />
                        </td>

                        <td className="px-4 py-4 text-sm text-slate-500">
                          {getValue(inbound, 'threexuiInboundId', 'threexui_inbound_id', '-')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <ServerFormModal
          isOpen={showCreateModal}
          title="ثبت سرور 3x-ui"
          form={form}
          setForm={setForm}
          isLoading={isSubmitting}
          onClose={() => setShowCreateModal(false)}
          onSubmit={createServer}
          submitText="ذخیره"
          mode="create"
        />

        <ServerFormModal
          isOpen={!!editServer}
          title="ویرایش سرور"
          form={editForm}
          setForm={setEditForm}
          isLoading={isEditing}
          onClose={() => !isEditing && setEditServer(null)}
          onSubmit={updateServer}
          submitText="ذخیره تغییرات"
          mode="edit"
        />

        <Modal
          isOpen={!!deleteServer}
          onClose={() => !deletingId && setDeleteServer(null)}
          title="حذف سرور"
          size="lg"
        >
          {deleteServer && (
            <div className="space-y-5">
              <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 dark:border-rose-800 dark:bg-rose-900/30">
                <div className="flex items-start gap-3">
                  <div className="rounded-xl bg-rose-100 p-2 text-rose-700 dark:bg-rose-900/60 dark:text-rose-200">
                    <AlertTriangle className="h-5 w-5" />
                  </div>

                  <div>
                    <p className="font-bold text-rose-800 dark:text-rose-100">
                      حذف سرور از پنل
                    </p>
                    <p className="mt-1 text-sm leading-6 text-rose-700 dark:text-rose-200">
                      این کار سرور را از دیتابیس پنل حذف می‌کند و اینباندهای سینک‌شده همان سرور هم حذف می‌شوند.
                      VPS یا پنل 3x-ui واقعی حذف نمی‌شود.
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <MiniInfo label="نام سرور" value={deleteServer.name || '-'} />
                <MiniInfo label="Host" value={`${deleteServer.host || '-'}:${deleteServer.port || '-'}`} />
                <MiniInfo label="لوکیشن" value={deleteServer.location || 'ثبت نشده'} />
                <MiniInfo label="تعداد اینباندها" value={String(inboundsForServer(deleteServer.id).length)} />
              </div>

              <div className="rounded-xl bg-amber-50 p-4 text-sm leading-6 text-amber-700 dark:bg-amber-900/30 dark:text-amber-200">
                اگر این سرور قبلاً برای ساخت کانفیگ یا سفارش استفاده شده باشد، backend اجازه حذف نمی‌دهد تا تاریخچه سفارش‌ها و کاربران خراب نشود.
              </div>

              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <Button variant="outline" disabled={!!deletingId} onClick={() => setDeleteServer(null)}>
                  انصراف
                </Button>

                <Button isLoading={deletingId === deleteServer.id} disabled={!!deletingId} onClick={removeServer} className="bg-rose-600 hover:bg-rose-700">
                  حذف سرور
                </Button>
              </div>
            </div>
          )}
        </Modal>
      </div>
    </DashboardLayout>
  );
}

function ServerFormModal({
  isOpen,
  title,
  form,
  setForm,
  isLoading,
  onClose,
  onSubmit,
  submitText,
  mode,
}: {
  isOpen: boolean;
  title: string;
  form: ReturnType<typeof emptyServerForm>;
  setForm: (form: ReturnType<typeof emptyServerForm>) => void;
  isLoading: boolean;
  onClose: () => void;
  onSubmit: () => void;
  submitText: string;
  mode: 'create' | 'edit';
}) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="lg">
      <div className="space-y-5">
        <div className="rounded-xl bg-sky-50 p-4 text-sm leading-6 text-sky-700 dark:bg-sky-900/30 dark:text-sky-200">
          {mode === 'create'
            ? 'اطلاعات ورود به پنل 3x-ui به صورت رمزنگاری‌شده ذخیره می‌شود. بعد از ثبت، دکمه تست اتصال و سپس سینک اینباندها را بزن.'
            : 'برای تغییر نام، هاست، پورت، مسیر پنل، وضعیت، لوکیشن و توضیحات فیلدها را ویرایش کن. اگر نمی‌خواهی username/password عوض شود، آن دو فیلد را خالی بگذار.'}
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Input label="نام سرور" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          <Input label="Host / URL" value={form.host} onChange={(event) => setForm({ ...form, host: event.target.value })} />
          <Input label="Port" type="number" value={form.port} onChange={(event) => setForm({ ...form, port: event.target.value })} />
          <Input label="Base Path" value={form.basePath} onChange={(event) => setForm({ ...form, basePath: event.target.value })} />
          <Input label={mode === 'edit' ? 'Username جدید، اختیاری' : 'Username'} value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} />
          <Input label={mode === 'edit' ? 'Password جدید، اختیاری' : 'Password'} type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} />
          <Input label="Location" value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} />
          <Input label="Description" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
          <div className="md:col-span-2">
            <Input label="آدرس سابسکریپشن (اختیاری)" placeholder="مثال: https://sub.example.com:2096/path" value={form.subscriptionUrl} onChange={(event) => setForm({ ...form, subscriptionUrl: event.target.value })} />
          </div>
        </div>

        <label className="flex items-center justify-between rounded-xl border border-slate-200 p-3 dark:border-slate-700">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
            سرور فعال باشد
          </span>
          <input
            type="checkbox"
            checked={form.isActive}
            onChange={(event) => setForm({ ...form, isActive: event.target.checked })}
            className="h-5 w-5 accent-sky-600"
          />
        </label>

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button variant="outline" disabled={isLoading} onClick={onClose}>
            انصراف
          </Button>
          <Button isLoading={isLoading} onClick={onSubmit}>
            {submitText}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function StatCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  tone: 'sky' | 'emerald' | 'violet' | 'amber';
}) {
  const tones = {
    sky: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
    emerald: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
    violet: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
    amber: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  };

  return (
    <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-100 dark:bg-slate-800/70 dark:ring-slate-700">
      <div className="flex items-center gap-3">
        <div className={`rounded-xl p-2 ${tones[tone]}`}>
          {icon}
        </div>
        <div>
          <p className="text-xs text-slate-500">{label}</p>
          <p className="text-xl font-bold text-slate-800 dark:text-slate-100">{value}</p>
        </div>
      </div>
    </div>
  );
}

function MiniInfo({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
      <div className="text-xs text-slate-500 dark:text-slate-400">{label}</div>
      <div className="mt-1 truncate text-sm font-bold text-slate-800 dark:text-slate-100">{value}</div>
    </div>
  );
}
