import { useState, useCallback } from 'react';
import toast from 'react-hot-toast';

interface ApiState<T> {
  data: T | null;
  isLoading: boolean;
  error: string | null;
}

interface UseApiOptions {
  showSuccessToast?: boolean;
  showErrorToast?: boolean;
  successMessage?: string;
}

export function useApi<T>() {
  const [state, setState] = useState<ApiState<T>>({
    data: null,
    isLoading: false,
    error: null,
  });

  const execute = useCallback(
    async (
      apiCall: () => Promise<T>,
      options: UseApiOptions = {}
    ): Promise<T | null> => {
      const {
        showSuccessToast = false,
        showErrorToast = true,
        successMessage = 'عملیات با موفقیت انجام شد',
      } = options;

      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      try {
        const result = await apiCall();
        setState({ data: result, isLoading: false, error: null });

        if (showSuccessToast) {
          toast.success(successMessage);
        }

        return result;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'خطای نامشخص';
        setState({ data: null, isLoading: false, error: errorMessage });

        if (showErrorToast) {
          toast.error(errorMessage);
        }

        return null;
      }
    },
    []
  );

  const reset = useCallback(() => {
    setState({ data: null, isLoading: false, error: null });
  }, []);

  return {
    ...state,
    execute,
    reset,
  };
}

// Hook for paginated data
interface PaginationState<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  isLoading: boolean;
}

export function usePaginatedApi<T>(initialPageSize = 10) {
  const [state, setState] = useState<PaginationState<T>>({
    items: [],
    total: 0,
    page: 1,
    pageSize: initialPageSize,
    isLoading: false,
  });

  const fetchPage = useCallback(
    async (
      apiCall: (page: number, pageSize: number) => Promise<{ items: T[]; total: number }>,
      page: number
    ) => {
      setState((prev) => ({ ...prev, isLoading: true }));

      try {
        const result = await apiCall(page, state.pageSize);
        setState((prev) => ({
          ...prev,
          items: result.items,
          total: result.total,
          page,
          isLoading: false,
        }));
      } catch (error) {
        toast.error('خطا در دریافت اطلاعات');
        setState((prev) => ({ ...prev, isLoading: false }));
      }
    },
    [state.pageSize]
  );

  const setPageSize = useCallback((pageSize: number) => {
    setState((prev) => ({ ...prev, pageSize, page: 1 }));
  }, []);

  return {
    ...state,
    fetchPage,
    setPageSize,
    totalPages: Math.ceil(state.total / state.pageSize),
  };
}
