import { getSupabase } from '../lib/supabaseClient';
import { createStudentService } from './studentBackend.js';

// RLS and database validation are authoritative; import commit is atomic.
export const listStudents = (...args) => createStudentService(getSupabase()).listStudents(...args);
export const createStudent = (...args) => createStudentService(getSupabase()).createStudent(...args);
export const updateStudent = (...args) => createStudentService(getSupabase()).updateStudent(...args);
export const getStudentById = (...args) => createStudentService(getSupabase()).getStudentById(...args);
export const commitStudentImport = (...args) => createStudentService(getSupabase()).commitStudentImport(...args);
