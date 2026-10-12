import { getSupabase } from '../lib/supabaseClient';
import { createClearanceService } from './clearanceBackend.js';

// RLS, triggers and RPCs enforce authorization and business rules.
export const listClearanceItemsByDepartment = (...args) => createClearanceService(getSupabase()).listClearanceItemsByDepartment(...args);
export const createClearanceItem = (...args) => createClearanceService(getSupabase()).createClearanceItem(...args);
export const updateClearanceItem = (...args) => createClearanceService(getSupabase()).updateClearanceItem(...args);
export const deleteClearanceItem = (...args) => createClearanceService(getSupabase()).deleteClearanceItem(...args);
export const initializeStudentClearances = (...args) => createClearanceService(getSupabase()).initializeStudentClearances(...args);
export const getStudentClearances = (...args) => createClearanceService(getSupabase()).getStudentClearances(...args);
export const setClearanceStatus = (...args) => createClearanceService(getSupabase()).setClearanceStatus(...args);
export const approveClearance = (...args) => createClearanceService(getSupabase()).approveClearance(...args);
export const markClearancePending = (...args) => createClearanceService(getSupabase()).markClearancePending(...args);
export const getStudentNoDuesStatement = (...args) => createClearanceService(getSupabase()).getStudentNoDuesStatement(...args);
export const getNoDuesProgress = (...args) => createClearanceService(getSupabase()).getNoDuesProgress(...args);
