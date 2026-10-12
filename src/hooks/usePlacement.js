import { useCallback, useEffect, useState } from 'react';
import * as recruitmentService from '../services/recruitmentService';
import * as driveService from '../services/driveService';

/** Generic async data hook: { data, loading, error, reload }. */
function useAsyncData(loader, deps) {
  const key = JSON.stringify(deps ?? {});
  const [state, setState] = useState({ data: null, loading: true, error: null });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState((prev) => ({ ...prev, loading: true, error: null }));
    Promise.resolve()
      .then(() => loader(JSON.parse(key)))
      .then((data) => {
        if (!cancelled) setState({ data, loading: false, error: null });
      })
      .catch((error) => {
        if (!cancelled) setState({ data: null, loading: false, error });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { ...state, reload };
}

export function useCompanies() {
  return useAsyncData(() => recruitmentService.listCompanies(), []);
}

export function useDrives() {
  return useAsyncData(() => driveService.listDrivesDetailed(), []);
}

export function useApplications(driveId) {
  return useAsyncData(
    (params) => driveService.listApplicationsDetailed(params),
    [{ driveId: driveId ?? null }],
  );
}

export function useStudentApplications(studentId) {
  return useAsyncData(
    (id) => (id ? driveService.getStudentApplicationsDetailed(id) : Promise.resolve([])),
    [studentId ?? null],
  );
}

export { useAsyncData };
