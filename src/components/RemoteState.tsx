import { Button } from './ui/Button';

export function LoadingState({ text = 'در حال دریافت اطلاعات...' }: { text?: string }) {
  return <div className="p-6 text-sm text-gray-500 dark:text-gray-400">{text}</div>;
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="p-4 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 flex items-center justify-between gap-4">
      <span>{message}</span>
      {onRetry && <Button size="sm" variant="outline" onClick={onRetry}>تلاش دوباره</Button>}
    </div>
  );
}

export function EmptyState({ text = 'موردی برای نمایش وجود ندارد.' }: { text?: string }) {
  return <div className="p-6 text-center text-sm text-gray-500 dark:text-gray-400">{text}</div>;
}
