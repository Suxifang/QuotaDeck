import type { SavedData } from '../domain/types';

/** Web and Android previews do not publish data to the iOS widget extension. */
export function syncWidgets(_data: SavedData): void {}
