import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { useAuth } from '../../contexts/AuthContext';
import { backend } from '../../services/backend';
import { formatPrice } from '../../lib/utils';
import { AlertTriangle, Bell, Menu, Wallet } from 'lucide-react';

interface DashboardLayoutProps {
  children: ReactNode;
  title: string;
}

export function DashboardLayout({ children, title }: DashboardLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [walletInfo, setWalletInfo] = useState<any | null>(null);
  const { user } = useAuth();

  useEffect(() => {
    let cancelled = false;

    async function loadWallet() {
      if (user?.role !== 'wholesale') {
        setWalletInfo(null);
        return;
      }

      try {
        const wallet = await backend.wallet.current();
        if (!cancelled) setWalletInfo(wallet);
      } catch {
        if (!cancelled) setWalletInfo(null);
      }
    }

    loadWallet();

    return () => {
      cancelled = true;
    };
  }, [user?.role, user?.wholesaleCustomerId]);

  const walletBalance = Number(walletInfo?.balance || 0);
  const minBalance = Number(walletInfo?.minBalance ?? walletInfo?.min_balance ?? 0);
  const isLowBalance = user?.role === 'wholesale' && minBalance > 0 && walletBalance < minBalance;
  const shortage = Math.max(0, minBalance - walletBalance);

  return (
    <div className="min-h-dvh overflow-x-hidden bg-slate-50 text-slate-800 dark:bg-slate-900 dark:text-slate-100" dir="rtl">
      <div className="flex min-h-dvh w-full overflow-x-hidden">
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

        <div className="flex min-h-dvh min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 min-h-16 border-b border-slate-200 bg-white/95 px-3 backdrop-blur dark:border-slate-700 dark:bg-slate-800/95 sm:px-4 lg:px-6">
            <div className="flex min-h-16 items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2 sm:gap-4">
                <button
                  type="button"
                  onClick={() => setSidebarOpen(true)}
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700 lg:hidden"
                  aria-label="باز کردن منو"
                >
                  <Menu className="h-5 w-5" />
                </button>

                <h1 className="min-w-0 truncate text-base font-semibold text-slate-800 dark:text-slate-100 sm:text-lg">
                  {title}
                </h1>
              </div>

              <div className="flex shrink-0 items-center gap-1.5 sm:gap-3">
                {user?.role === 'wholesale' && walletInfo && (
                  <Link
                    to="/dashboard/wallet"
                    className={`hidden rounded-xl px-3 py-2 text-sm font-medium transition sm:inline-flex sm:items-center sm:gap-2 ${
                      isLowBalance
                        ? 'bg-amber-50 text-amber-700 ring-1 ring-amber-200 dark:bg-amber-900/30 dark:text-amber-200 dark:ring-amber-800'
                        : 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-200 dark:ring-emerald-800'
                    }`}
                  >
                    <Wallet className="h-4 w-4" />
                    {formatPrice(walletBalance)}
                  </Link>
                )}

                {user?.role === 'wholesale' && walletInfo && (
                  <Link
                    to="/dashboard/wallet"
                    className={`inline-flex h-10 w-10 items-center justify-center rounded-xl transition sm:hidden ${
                      isLowBalance
                        ? 'bg-amber-50 text-amber-700 ring-1 ring-amber-200 dark:bg-amber-900/30 dark:text-amber-200 dark:ring-amber-800'
                        : 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-200 dark:ring-emerald-800'
                    }`}
                    aria-label="کیف پول"
                  >
                    <Wallet className="h-5 w-5" />
                  </Link>
                )}

                <button
                  type="button"
                  className="relative inline-flex h-10 w-10 items-center justify-center rounded-xl text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
                  aria-label="اعلان‌ها"
                >
                  <Bell className="h-5 w-5" />
                  {isLowBalance && (
                    <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-amber-500" />
                  )}
                </button>

                <div className="flex items-center gap-2 sm:gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-l from-sky-600 to-indigo-600">
                    <span className="text-sm font-medium text-white">
                      {user?.username?.charAt(0).toUpperCase()}
                    </span>
                  </div>

                  <div className="hidden min-w-0 sm:block">
                    <p className="max-w-[150px] truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                      {user?.username}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {user?.role === 'super_admin' ? 'مدیر ارشد'
                        : user?.role === 'admin' ? 'مدیر'
                          : 'عمده‌فروش'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </header>

          {isLowBalance && (
            <div className="mx-3 mt-3 sm:mx-4 lg:mx-6">
              <div className="rounded-2xl border border-amber-200 bg-gradient-to-l from-amber-50 via-orange-50 to-white p-3 shadow-sm dark:border-amber-800 dark:from-amber-950/40 dark:via-orange-950/30 dark:to-slate-900 sm:p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="shrink-0 rounded-xl bg-amber-100 p-2 text-amber-700 dark:bg-amber-900/50 dark:text-amber-200">
                      <AlertTriangle className="h-5 w-5" />
                    </div>

                    <div className="min-w-0">
                      <p className="text-sm font-bold text-amber-800 dark:text-amber-100 sm:text-base">
                        موجودی کیف پول شما کمتر از حد هشدار است.
                      </p>
                      <p className="mt-1 text-xs leading-6 text-amber-700 dark:text-amber-200 sm:text-sm">
                        موجودی فعلی: {formatPrice(walletBalance)} | حد هشدار: {formatPrice(minBalance)} | کسری: {formatPrice(shortage)}
                      </p>
                    </div>
                  </div>

                  <Link to="/dashboard/wallet" className="w-full md:w-auto">
                    <ButtonLike>
                      مشاهده کیف پول
                    </ButtonLike>
                  </Link>
                </div>
              </div>
            </div>
          )}

          <main className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto p-3 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:p-4 lg:p-6">
            <div className="mx-auto w-full min-w-0">
              {children}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

function ButtonLike({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex w-full items-center justify-center rounded-xl bg-amber-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-amber-700 md:w-auto">
      {children}
    </span>
  );
}
