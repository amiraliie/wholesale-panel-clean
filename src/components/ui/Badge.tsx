import { cn } from '../../lib/utils';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info';
  size?: 'sm' | 'md';
  className?: string;
}

export function Badge({ children, variant = 'default', size = 'md', className }: BadgeProps) {
  const variants = {
    default: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
    success: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    warning: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
    danger: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
    info: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  };

  const sizes = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-2.5 py-1 text-sm',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center font-medium rounded-full',
        variants[variant],
        sizes[size],
        className
      )}
    >
      {children}
    </span>
  );
}

// Status badge helper
export function StatusBadge({ status }: { status: string }) {
  const statusMap: Record<string, { variant: BadgeProps['variant']; label: string }> = {
    active: { variant: 'success', label: 'فعال' },
    disabled: { variant: 'default', label: 'غیرفعال' },
    expired: { variant: 'danger', label: 'منقضی' },
    limited: { variant: 'warning', label: 'محدود' },
    pending: { variant: 'info', label: 'در انتظار' },
    processing: { variant: 'info', label: 'در حال پردازش' },
    completed: { variant: 'success', label: 'تکمیل شده' },
    failed: { variant: 'danger', label: 'ناموفق' },
    cancelled: { variant: 'default', label: 'لغو شده' },
    refunded: { variant: 'warning', label: 'برگشت داده شده' },
    paid: { variant: 'success', label: 'پرداخت شده' },
  };

  const config = statusMap[status] || { variant: 'default' as const, label: status };

  return <Badge variant={config.variant}>{config.label}</Badge>;
}
