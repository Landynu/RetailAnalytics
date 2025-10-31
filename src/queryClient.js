import { QueryClient } from '@tanstack/react-query';

// Optimized React Query configuration to reduce unnecessary refetching
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Keep data fresh for 5 minutes before considering it stale
      staleTime: 5 * 60 * 1000, // 5 minutes
      
      // Keep unused data in cache for 10 minutes
      gcTime: 10 * 60 * 1000, // 10 minutes (formerly cacheTime)
      
      // Don't refetch on window focus - major cause of duplicate requests
      refetchOnWindowFocus: false,
      
      // Don't refetch on network reconnect
      refetchOnReconnect: false,
      
      // Only retry failed requests once instead of 3 times
      retry: 1,
      
      // Don't retry on 404s
      retryOnMount: false,
    },
  },
});
