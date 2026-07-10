import { useState } from 'react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Card, CardContent } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { StatusBadge } from '../../components/ui/Badge';
import { EmptyState, ErrorState, LoadingState } from '../../components/RemoteState';
import { useRemoteData } from '../../hooks/useRemoteData';
import { backend } from '../../services/backend';
import { formatDateTime, formatPrice } from '../../lib/utils';
import { Search } from 'lucide-react';

export default function OrdersPage() {
  const { data: orders, isLoading, error, reload } = useRemoteData(() => backend.orders.list(), []);
  const [search, setSearch] = useState('');
  const filtered = (orders || []).filter((o: any) => `${o.id} ${o.endUserEmail || ''} ${o.status}`.toLowerCase().includes(search.toLowerCase()));
  return <DashboardLayout title="سفارشات"><div className="space-y-6">
    <div className="relative max-w-md"><Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400"/><Input placeholder="جستجوی سفارش..." value={search} onChange={e=>setSearch(e.target.value)} className="pr-10" /></div>
    {error && <ErrorState message={error} onRetry={reload}/>}<Card><CardContent className="p-0">{isLoading ? <LoadingState/> : filtered.length===0 ? <EmptyState/> : <div className="overflow-x-auto"><table className="w-full"><thead className="bg-gray-50 dark:bg-gray-700/50"><tr>{['شناسه','ایمیل کاربر','پلن','حجم','مبلغ','وضعیت','تاریخ','خطا'].map(h=><th key={h} className="px-4 py-3 text-right text-xs font-medium text-gray-500">{h}</th>)}</tr></thead><tbody className="divide-y divide-gray-200 dark:divide-gray-700">{filtered.map((o:any)=><tr key={o.id}><td className="px-4 py-3 text-xs font-mono">{o.id.slice(0,8)}</td><td className="px-4 py-3 text-sm">{o.endUserEmail || '-'}</td><td className="px-4 py-3 text-sm">{o.planName || o.plan?.name || '-'}</td><td className="px-4 py-3 text-sm">{o.trafficGB} GB</td><td className="px-4 py-3 text-sm">{formatPrice(Number(o.totalPrice || 0))}</td><td className="px-4 py-3"><StatusBadge status={o.status}/></td><td className="px-4 py-3 text-sm">{formatDateTime(o.createdAt)}</td><td className="px-4 py-3 text-xs text-red-500">{o.errorMessage || '-'}</td></tr>)}</tbody></table></div>}</CardContent></Card>
  </div></DashboardLayout>;
}
