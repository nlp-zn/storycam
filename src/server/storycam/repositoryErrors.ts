export class StoryCamRepositoryError extends Error {
  constructor(
    readonly operation: string,
    readonly code = "repository_error"
  ) {
    super(`StoryCam repository operation failed: ${operation}`);
    this.name = "StoryCamRepositoryError";
  }
}

export function unwrapRepositoryResult<T>(operation: string, data: T, error: { code?: string } | null) {
  if (error) {
    throw new StoryCamRepositoryError(operation, error.code);
  }

  return data;
}
