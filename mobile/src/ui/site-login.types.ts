import type { Source } from '../domain/types';
import type { SiteSession } from '../providers/site-login';

export interface SiteLoginProps {
  source: Source;
  busy: boolean;
  onClose: () => void;
  onSession: (session: SiteSession) => Promise<void>;
}
