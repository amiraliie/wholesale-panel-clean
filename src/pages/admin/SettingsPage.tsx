import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { ErrorState, LoadingState } from '../../components/RemoteState';
import { useRemoteData } from '../../hooks/useRemoteData';
import { backend } from '../../services/backend';

export default function SettingsPage() {
  const { data, isLoading, error, reload } = useRemoteData(async()=>({ health: await backend.health(), settings: await backend.settings.get() }), []);
  return <DashboardLayout title="تنظیمات"><div className="space-y-6">{error && <ErrorState message={error} onRetry={reload}/>} {isLoading ? <LoadingState/> : <Card><CardHeader><CardTitle>وضعیت سیستم</CardTitle></CardHeader><CardContent className="space-y-2 text-sm"><p>Backend: <b className="text-green-600">{data?.health.status}</b></p><p>زمان سرور: {data?.health.time}</p><p className="text-gray-500">تنظیمات پیشرفته بعداً از جدول app_settings قابل مدیریت است.</p><pre className="text-xs bg-gray-100 dark:bg-gray-900 p-3 rounded overflow-x-auto">{JSON.stringify(data?.settings || {}, null, 2)}</pre></CardContent></Card>}</div></DashboardLayout>;
}
