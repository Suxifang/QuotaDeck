import type React from 'react';

export type PageRailProps = React.PropsWithChildren<{ index: number; onSelect: (index: number) => void }>;
