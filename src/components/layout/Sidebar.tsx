import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '../../lib/utils';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import {
  LayoutDashboard,
  Users,
  Package,
  DollarSign,
  Server,
  ShoppingCart,
  BarChart3,
  Settings,
  Shield,
  LogOut,
  Moon,
  Sun,
  Wallet,
  UserPlus,
  Receipt,
  X,
  Database,
} from 'lucide-react';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const location = useLocation();
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const isAdmin = user?.role === 'super_admin' || user?.role === 'admin';

  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  const adminLinks = [
    { to: '/admin', icon: LayoutDashboard, label: 'داشبورد' },
    { to: '/admin/customers', icon: Users, label: 'مشتریان' },
    { to: '/admin/plans', icon: Package, label: 'پلن‌ها' },
    { to: '/admin/pricing', icon: DollarSign, label: 'قیمت‌گذاری' },
    { to: '/admin/servers', icon: Server, label: 'سرورها' },
    { to: '/admin/orders', icon: ShoppingCart, label: 'سفارشات' },
    { to: '/admin/reports', icon: BarChart3, label: 'گزارشات' },
    { to: '/admin/audit-logs', icon: Shield, label: 'لاگ‌ها' },
    { to: '/admin/settings', icon: Settings, label: 'تنظیمات' },
    ...(user?.role === 'super_admin'
      ? [{ to: '/admin/backup', icon: Database, label: 'بکاپ' }]
      : []),
  ];

  const wholesaleLinks = [
    { to: '/dashboard', icon: LayoutDashboard, label: 'داشبورد' },
    { to: '/dashboard/end-users', icon: Users, label: 'کاربران' },
    { to: '/dashboard/create-config', icon: UserPlus, label: 'ساخت کانفیگ' },
    { to: '/dashboard/wallet', icon: Wallet, label: 'کیف پول' },
    { to: '/dashboard/orders', icon: ShoppingCart, label: 'سفارشات' },
    { to: '/dashboard/invoices', icon: Receipt, label: 'فاکتورها' },
  ];

  const links = isAdmin ? adminLinks : wholesaleLinks;

  return (
    <>
      {isOpen && (
        <button
          type="button"
          className="fixed inset-0 z-50 bg-slate-950/45 backdrop-blur-[2px] lg:hidden"
          onClick={onClose}
          aria-label="بستن منو"
        />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 right-0 z-[60] flex h-dvh w-[86vw] max-w-[18rem] flex-col overflow-hidden bg-white shadow-2xl shadow-slate-900/15 dark:bg-slate-850 dark:bg-slate-800',
          'border-l border-slate-200 dark:border-slate-700',
          'transition-transform duration-300 ease-out will-change-transform',
          'lg:sticky lg:top-0 lg:z-20 lg:h-dvh lg:w-72 lg:max-w-none lg:translate-x-0 lg:shadow-none',
          isOpen ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        <div className="flex h-full min-h-0 flex-col">
          <div className="flex min-h-16 items-center justify-between border-b border-slate-200 px-4 dark:border-slate-700 sm:px-5">
            <div className="min-w-0">
              <h1 className="truncate text-lg font-bold text-sky-600 dark:text-sky-300">
                پنل عمده‌فروشی
              </h1>
              <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
                {isAdmin ? 'مدیریت سیستم' : 'حساب مشتری عمده'}
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700 lg:hidden"
              aria-label="بستن منو"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain px-3 py-4 sm:px-4">
            {links.map((link) => {
              const isActive = location.pathname === link.to;
              return (
                <Link
                  key={link.to}
                  to={link.to}
                  onClick={onClose}
                  className={cn(
                    'flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition sm:px-4',
                    isActive
                      ? 'bg-sky-50 text-sky-700 ring-1 ring-sky-100 dark:bg-sky-900/30 dark:text-sky-300 dark:ring-sky-800'
                      : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700/70',
                  )}
                >
                  <link.icon className="h-5 w-5 shrink-0" />
                  <span className="truncate">{link.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="space-y-2 border-t border-slate-200 p-3 dark:border-slate-700 sm:p-4">
            <button
              type="button"
              onClick={toggleTheme}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700/70 sm:px-4"
            >
              {theme === 'dark' ? (
                <>
                  <Sun className="h-5 w-5 shrink-0" />
                  <span>حالت روشن</span>
                </>
              ) : (
                <>
                  <Moon className="h-5 w-5 shrink-0" />
                  <span>حالت تاریک</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={logout}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-rose-600 transition hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-900/20 sm:px-4"
            >
              <LogOut className="h-5 w-5 shrink-0" />
              <span>خروج</span>
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
