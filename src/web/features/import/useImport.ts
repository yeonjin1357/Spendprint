import { useCallback, useState } from 'react';
import type { ImportPreview } from '../../../server/services/importService';
import { useToast } from '../../components/Toast';
import { api, ApiError } from '../../lib/api';

const asApiError = (e: unknown) => (e instanceof ApiError ? e : new ApiError('UNKNOWN', '문제가 생겼어요. 잠시 뒤에 다시 해 주세요'));

/** The import flow: choose a file → preview → apply. `onImported` runs after a successful apply. */
export function useImport(onImported: () => void) {
  const toast = useToast();
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  const choose = useCallback(async (files: File[]) => {
    if (files.length === 0) return;
    if (files.length > 1) { toast.show('파일은 하나씩 올려 주세요'); return; }
    const file = files[0];
    if (!file.name.toLowerCase().endsWith('.xlsx')) { toast.show('뱅크샐러드에서 받은 엑셀(.xlsx) 파일을 올려 주세요'); return; }
    setBusy(true);
    setError(null);
    try {
      setPreview(await api.previewImport(file));
    } catch (e) {
      setPreview(null);
      setError(asApiError(e));
    } finally {
      setBusy(false);
    }
  }, [toast]);

  const apply = useCallback(async () => {
    if (!preview) return;
    setBusy(true);
    try {
      await api.applyImport(preview.token);
      setPreview(null);
      toast.show('가져왔어요');
      onImported();
    } catch (e) {
      setPreview(null);
      setError(asApiError(e));
    } finally {
      setBusy(false);
    }
  }, [preview, toast, onImported]);

  const cancel = useCallback(() => {
    setPreview(null);
    setError(null);
  }, []);

  return { preview, error, busy, choose, apply, cancel };
}
