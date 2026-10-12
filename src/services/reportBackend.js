import { REPORT_KINDS } from '../features/data/contracts.js';

/** Returns current RLS-authorized rows; Member 3 owns CSV/XLSX serialization. */
export function createReportService(client) {
  return {
    queryReportRecords: async (input) => {
      if (!input || typeof input !== 'object' || Array.isArray(input)
        || Object.keys(input).some(key => !['kind', 'filters', 'student_ids', 'limit'].includes(key))
        || !REPORT_KINDS.includes(input.kind)) throw new TypeError('Invalid report query');
      const { kind, filters = {}, student_ids = [], limit = 10000 } = input;
      if (!filters || typeof filters !== 'object' || Array.isArray(filters)
        || !Array.isArray(student_ids) || !student_ids.every(id => typeof id === 'string' && id.length)
        || !Number.isInteger(limit) || limit < 1 || limit > 10000) throw new TypeError('Invalid report filters or limit');
      const { data, error } = await client.rpc('get_report_records', {
        p_kind: kind, p_filters: filters, p_student_ids: student_ids, p_limit: limit,
      });
      if (error) {
        const code = error.code === '54000' ? 'EXPORT_LIMIT' : error.code === '22023' ? 'INVALID_INPUT'
          : error.code === '42501' ? 'FORBIDDEN' : 'DATABASE_ERROR';
        const failure = new Error(code === 'EXPORT_LIMIT' ? 'Report exceeds the row limit.'
          : code === 'INVALID_INPUT' ? 'Invalid report filters.' : code === 'FORBIDDEN' ? 'Report access denied.' : 'Could not query report records.');
        failure.code = code;
        throw failure;
      }
      return data;
    },
  };
}
