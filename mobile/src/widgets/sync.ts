import type { SavedData } from '../domain/types';
import type { WidgetSyncResult } from './publisher';

/** Web and Android previews do not publish data to the iOS widget extension. */
export async function syncWidgets(_data: SavedData, _force = false): Promise<WidgetSyncResult> {
  return { supported: false, accountCount: 0, syncedAt: 0 };
}
