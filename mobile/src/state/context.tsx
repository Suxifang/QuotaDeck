import { createContext, useContext } from 'react';
import type { QuotaController } from './useQuota';
export const QuotaContext = createContext<QuotaController | undefined>(undefined);
export function useQuotaController() {
  const value = useContext(QuotaContext);
  if (!value) throw new Error('Quota provider missing');
  return value;
}
