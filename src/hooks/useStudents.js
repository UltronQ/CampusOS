import { useCallback, useEffect, useState } from 'react';
import * as studentsService from '../services/studentsService';

/**
 * Data-fetching hooks for the student directory and department list.
 * Each returns { data, loading, error, reload } — pages render these states
 * honestly; there is no cached fake fallback.
 */

export function useStudents(filters) {
  const key = JSON.stringify(filters ?? {});
  const [state, setState] = useState({ data: [], loading: true, error: null });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState((prev) => ({ ...prev, loading: true, error: null }));
    studentsService
      .listStudents(JSON.parse(key))
      .then((rows) => {
        if (!cancelled) setState({ data: rows, loading: false, error: null });
      })
      .catch((error) => {
        if (!cancelled) setState({ data: [], loading: false, error });
      });
    return () => {
      cancelled = true;
    };
  }, [key, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { ...state, reload };
}

export function useDepartments() {
  const [state, setState] = useState({ data: [], loading: true, error: null });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState((prev) => ({ ...prev, loading: true, error: null }));
    studentsService
      .listDepartments()
      .then((rows) => {
        if (!cancelled) setState({ data: rows, loading: false, error: null });
      })
      .catch((error) => {
        if (!cancelled) setState({ data: [], loading: false, error });
      });
    return () => {
      cancelled = true;
    };
  }, [version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { ...state, reload };
}
