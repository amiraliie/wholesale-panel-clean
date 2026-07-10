import { cn } from '../lib/utils';
import { LucideIcon } from 'lucide-react';

interface StatsCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info';
  className?: string;
}

export function StatsCard({
  title,
  value,
  icon: Icon,
  trend,
  variant = 'default',
  className,
}: StatsCardProps) {
  const iconColors = {
    default: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
    success: 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400',
    warning: 'bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400',
    danger: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400',
    info: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
  };

  return (
    <div
      className={cn(
        'bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700',
        className
      )}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-500 dark:text-gray-400">{title}</p>
          <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">
            {value}
          </p>
          {trend && (
            <p
              className={cn(
                'mt-2 text-sm flex items-center gap-1',
                trend.isPositive ? 'text-green-600' : 'text-red-600'
              )}
            >
              <span>{trend.isPositive ? '↑' : '↓'}</span>
              <span>{Math.abs(trend.value)}%</span>
              <span className="text-gray-500 dark:text-gray-400">نسبت به ماه قبل</span>
            </p>
          )}
        </div>
        <div className={cn('p-3 rounded-lg', iconColors[variant])}>
          <Icon className="h-6 w-6" />
        </div>
      </div>
    </div>
  );
}
