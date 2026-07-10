import { useMemo, useState } from 'react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { EmptyState, ErrorState, LoadingState } from '../../components/RemoteState';
import { useRemoteData } from '../../hooks/useRemoteData';
import { backend } from '../../services/backend';
import { formatDateTime } from '../../lib/utils';
import {
  Activity,
  CalendarDays,
  Database,
  Eye,
  FileJson,
  Filter,
  RefreshCw,
  Search,
  ShieldCheck,
  UserRound,
} from 'lucide-react';

function getValue(item: any, camel: string, snake: string, fallback: any = '') {
  if (item?.[camel] !== undefined && item?.[camel] !== null) return item[camel];
  if (item?.[snake] !== undefined && item?.[snake] !== null) return item[snake];
  return fallback;
}

function actionLabel(action: string) {
  const labels: Record<string, string> = {
    create: 'ایجاد',
    update: 'ویرایش',
    delete: 'حذف',
    login: 'ورود',
    logout: 'خروج',
    credit: 'شارژ',
    debit: 'برداشت',
    refund: 'برگشت وجه',
    sync: 'سینک',
    test: 'تست',
  };

  return labels[action] || action;
}

function entityLabel(entity: string) {
  const labels: Record<string, string> = {
    customer: 'مشتری',
    wholesale_customer: 'مشتری',
    user: 'کاربر',
    plan: 'پلن',
    server: 'سرور',
    inbound: 'اینباند',
    order: 'سفارش',
    wallet: 'کیف پول',
    end_user: 'کانفیگ',
    pricing: 'قیمت‌گذاری',
  };

  return labels[entity] || entity;
}

function prettyJson(value: any) {
  if (!value) return '-';
  try {
    if (typeof value === 'string') return JSON.stringify(JSON.parse(value), null, 2);
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export default function AuditLogsPage() {
  const [search, setSearch] = useState('');
  const [action, setAction] = useState('');
  const [entityType, setEntityType] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedLog, setSelectedLog] = useState<any | null>(null);

  const params = useMemo(() => ({
    search,
    action,
    entityType,
    dateFrom,
    dateTo,
    limit: 300,
  }), [search, action, entityType, dateFrom, dateTo]);

  const { data: logs, isLoading, error, reload } = useRemoteData(() => backend.audit.list(params), [params]);

  const stats = useMemo(() => {
    const list = logs || [];
    const users = new Set(list.map((log: any) => log.user_id || log.userId).filter(Boolean));
    const entities = new Set(list.map((log: any) => getValue(log, 'entityType', 'entity_type', '')).filter(Boolean));

    return {
      total: list.length,
      users: users.size,
      entities: entities.size,
      today: list.filter((log: any) => {
        const createdAt = getValue(log, 'createdAt', 'created_at', '');
        if (!createdAt) return false;
        const d = new Date(createdAt);
        const now = new Date();
        return d.toDateString() === now.toDateString();
      }).length,
    };
  }, [logs]);

  function clearFilters() {
    setSearch('');
    setAction('');
    setEntityType('');
    setDateFrom('');
    setDateTo('');
  }

  return (
    <DashboardLayout title="لاگ فعالیت‌ها">
      <div className="space-y-6">
        <div className="rounded-2xl border border-slate-200 bg-gradient-to-l from-slate-50 via-white to-sky-50 p-5 shadow-sm dark:border-slate-700 dark:from-slate-900 dark:via-slate-900 dark:to-sky-950/40">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">
                لاگ فعالیت‌های سیستم
              </h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                مشاهده فعالیت‌های ثبت‌شده کاربران، عملیات‌ها و تغییرات مهم
              </p>
            </div>

            <Button variant="outline" leftIcon={<RefreshCw className="h-4 w-4" />} onClick={reload}>
              بروزرسانی
            </Button>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            <AuditStat icon={<Activity className="h-5 w-5" />} label="کل لاگ‌ها" value={String(stats.total)} tone="sky" />
            <AuditStat icon={<UserRound className="h-5 w-5" />} label="کاربران درگیر" value={String(stats.users)} tone="emerald" />
            <AuditStat icon={<Database className="h-5 w-5" />} label="نوع موجودیت‌ها" value={String(stats.entities)} tone="violet" />
            <AuditStat icon={<CalendarDays className="h-5 w-5" />} label="لاگ‌های امروز" value={String(stats.today)} tone="amber" />
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
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
              <div className="relative lg:col-span-2">
                <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  placeholder="جستجو در کاربر، عملیات، شناسه، IP..."
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="pr-10"
                />
              </div>

              <Input
                placeholder="عملیات مثل update"
                value={action}
                onChange={(event) => setAction(event.target.value)}
              />

              <Input
                placeholder="نوع مثل customer"
                value={entityType}
                onChange={(event) => setEntityType(event.target.value)}
              />

              <Button variant="outline" onClick={clearFilters}>
                پاک‌کردن فیلتر
              </Button>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
              <Input
                label="از تاریخ"
                type="date"
                value={dateFrom}
                onChange={(event) => setDateFrom(event.target.value)}
              />

              <Input
                label="تا تاریخ"
                type="date"
                value={dateTo}
                onChange={(event) => setDateTo(event.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        {error && <ErrorState message={error} onRetry={reload} />}

        <Card>
          <CardHeader>
            <CardTitle>لیست لاگ‌ها</CardTitle>
          </CardHeader>

          <CardContent className="p-0">
            {isLoading ? (
              <LoadingState />
            ) : !logs?.length ? (
              <div className="p-6">
                <EmptyState text="هنوز لاگی ثبت نشده است." />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px]">
                  <thead className="bg-slate-50 dark:bg-slate-800/70">
                    <tr>
                      {['کاربر', 'عملیات', 'موجودیت', 'شناسه', 'IP', 'تاریخ', 'جزئیات'].map((head) => (
                        <th key={head} className="px-4 py-3 text-right text-xs font-medium text-slate-500 dark:text-slate-400">
                          {head}
                        </th>
                      ))}
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                    {logs.map((log: any) => {
                      const logAction = getValue(log, 'action', 'action', '-');
                      const entity = getValue(log, 'entityType', 'entity_type', '-');
                      const entityId = getValue(log, 'entityId', 'entity_id', '-');
                      const ip = getValue(log, 'ipAddress', 'ip_address', '-');
                      const createdAt = getValue(log, 'createdAt', 'created_at', '');

                      return (
                        <tr key={log.id} className="hover:bg-sky-50/50 dark:hover:bg-slate-800/70">
                          <td className="px-4 py-4">
                            <div className="font-medium text-slate-800 dark:text-slate-100">
                              {log.username || '-'}
                            </div>
                            <div className="mt-1 text-xs text-slate-500">
                              {log.email || '-'}
                            </div>
                          </td>

                          <td className="px-4 py-4">
                            <span className="inline-flex rounded-full bg-sky-50 px-3 py-1 text-xs font-medium text-sky-700 dark:bg-sky-900/30 dark:text-sky-300">
                              {actionLabel(logAction)}
                            </span>
                          </td>

                          <td className="px-4 py-4">
                            <span className="inline-flex rounded-full bg-violet-50 px-3 py-1 text-xs font-medium text-violet-700 dark:bg-violet-900/30 dark:text-violet-300">
                              {entityLabel(entity)}
                            </span>
                          </td>

                          <td className="max-w-[230px] truncate px-4 py-4 font-mono text-xs text-slate-500">
                            {entityId}
                          </td>

                          <td className="px-4 py-4 text-sm text-slate-600 dark:text-slate-300">
                            {ip}
                          </td>

                          <td className="px-4 py-4 text-sm text-slate-600 dark:text-slate-300">
                            {createdAt ? formatDateTime(createdAt) : '-'}
                          </td>

                          <td className="px-4 py-4">
                            <Button variant="ghost" size="sm" onClick={() => setSelectedLog(log)}>
                              <Eye className="h-4 w-4 text-sky-600" />
                            </Button>
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

        <Modal isOpen={!!selectedLog} onClose={() => setSelectedLog(null)} title="جزئیات لاگ" size="lg">
          {selectedLog && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <DetailBox label="کاربر" value={`${selectedLog.username || '-'} | ${selectedLog.email || '-'}`} />
                <DetailBox label="عملیات" value={actionLabel(selectedLog.action)} />
                <DetailBox label="موجودیت" value={entityLabel(getValue(selectedLog, 'entityType', 'entity_type', '-'))} />
                <DetailBox label="شناسه" value={getValue(selectedLog, 'entityId', 'entity_id', '-')} />
                <DetailBox label="IP" value={getValue(selectedLog, 'ipAddress', 'ip_address', '-')} />
                <DetailBox label="تاریخ" value={formatDateTime(getValue(selectedLog, 'createdAt', 'created_at', ''))} />
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
                <div className="mb-3 flex items-center gap-2">
                  <FileJson className="h-5 w-5 text-violet-600" />
                  <h3 className="font-bold text-slate-800 dark:text-slate-100">مقادیر قبلی</h3>
                </div>
                <pre className="max-h-56 overflow-auto rounded-xl bg-white p-3 text-left text-xs text-slate-700 dark:bg-slate-900 dark:text-slate-200" dir="ltr">
{prettyJson(getValue(selectedLog, 'oldValue', 'old_value', null))}
                </pre>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
                <div className="mb-3 flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-emerald-600" />
                  <h3 className="font-bold text-slate-800 dark:text-slate-100">مقادیر جدید</h3>
                </div>
                <pre className="max-h-56 overflow-auto rounded-xl bg-white p-3 text-left text-xs text-slate-700 dark:bg-slate-900 dark:text-slate-200" dir="ltr">
{prettyJson(getValue(selectedLog, 'newValue', 'new_value', null))}
                </pre>
              </div>

              <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                User Agent: {getValue(selectedLog, 'userAgent', 'user_agent', '-')}
              </div>
            </div>
          )}
        </Modal>
      </div>
    </DashboardLayout>
  );
}

function AuditStat({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
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
          <p className="mt-1 text-xl font-bold text-slate-800 dark:text-slate-100">{value}</p>
        </div>
      </div>
    </div>
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
