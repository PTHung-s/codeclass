import type { ReactNode } from "react";
import { ErrorState } from "./StateViews";

interface QueryResultProps<T> {
  isLoading: boolean;
  isError: boolean;
  data: T | undefined;
  errorTitle?: string;
  onRetry?: () => void;
  loading: ReactNode;
  error?: ReactNode;
  empty?: ReactNode;
  isEmpty?: (data: T) => boolean;
  children: (data: T) => ReactNode;
}

/**
 * Reduces the repeated isLoading / isError / empty boilerplate found across pages.
 * Renders `loading` while pending, an ErrorState (or custom `error`) on failure,
 * optional `empty` when `isEmpty(data)` is true, otherwise `children(data)`.
 */
export function QueryResult<T>({
  isLoading,
  isError,
  data,
  errorTitle = "Không tải được dữ liệu",
  onRetry,
  loading,
  error,
  empty,
  isEmpty,
  children,
}: QueryResultProps<T>) {
  if (isLoading) return <>{loading}</>;
  if (isError) {
    return <>{error ?? <ErrorState title={errorTitle} onRetry={onRetry} />}</>;
  }
  if (data === undefined || data === null) return <>{loading}</>;
  if (isEmpty && isEmpty(data)) return <>{empty}</>;
  return <>{children(data)}</>;
}
