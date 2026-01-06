export interface ApiError {
  title: string;
  message: string | object;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: ApiError;
  timestamp: string;
}

export const createApiResponse = <T>(
  success: boolean,
  data?: T,
  error?: ApiError,
): ApiResponse<T> => {
  return {
    success,
    data,
    error,
    timestamp: new Date().toISOString(),
  };
};
