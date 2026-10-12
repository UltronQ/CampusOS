import { getSupabase } from '../lib/supabaseClient.js';
import { createStudentManagementService } from './studentManagementService.js';

const service = createStudentManagementService(getSupabase);
export const {
  searchStudents, listStudents, createStudent, updateStudent, getStudentById, deleteStudent,
  listDepartments, createDepartment, updateDepartment, deleteDepartment,
  fetchImportContext, findExistingStudentNumbers, commitStudentImport, importStudentRows, listImportHistory,
} = service;
