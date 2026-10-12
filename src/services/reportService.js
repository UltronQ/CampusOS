import { getSupabase } from '../lib/supabaseClient';
import { createReportService } from './reportBackend.js';

export const queryReportRecords = (...args) => createReportService(getSupabase()).queryReportRecords(...args);
