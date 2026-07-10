import { useCallback, useEffect, useState } from 'react';
import type { DependencyList } from 'react';

export function useRemoteData<T>(loader: () => Promise<T>, deps: DependencyList = []) {
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setData(await loader());
    } catch (err: any) {
      setError(err?.message || 'خطا در دریافت اطلاعات');
    } finally {
      setIsLoading(false);
    }
  }, deps);

  useEffect(() => { void reload(); }, [reload]);
  return { data, setData, isLoading, error, reload };
}
