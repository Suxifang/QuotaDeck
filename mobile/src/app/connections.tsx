import React from 'react';
import { useQuotaController } from '../state/context';
import { Deck } from '../ui/screens';
export default function Connections() { return <Deck controller={useQuotaController()} tab="connections" />; }
