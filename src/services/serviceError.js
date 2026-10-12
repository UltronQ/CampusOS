export class DataServiceError extends Error {
  constructor(code, message, backendCode = null) {
    super(message);
    this.name = 'DataServiceError';
    this.code = code;
    this.backend_code = backendCode;
  }
}

export function toServiceError(error, fallback = 'The request failed.') {
  if (error instanceof DataServiceError) return error;
  const code = String(error?.code ?? error?.status ?? '');
  if (['401', '403', '42501'].includes(code)) return new DataServiceError('FORBIDDEN', 'This operation requires an authorized account.', code);
  if (code === '23505') return new DataServiceError('CONFLICT', 'This roll number, email or department code already exists. Nothing was overwritten.', code);
  if (['23503', '23001'].includes(code)) return new DataServiceError('CONFLICT', 'Deletion or account linking is blocked by related records. Resolve the linked students, applications, offers or drives first.', code);
  if (['23514', '23502', '22P02', '22003', '22023'].includes(code)) return new DataServiceError('INVALID_INPUT', error?.message || 'Check the required fields and allowed ranges.', code);
  if (code === 'PGRST116') return new DataServiceError('NOT_FOUND', 'The record does not exist or is not accessible.', code);
  return new DataServiceError('DATABASE_ERROR', fallback, code || null);
}
