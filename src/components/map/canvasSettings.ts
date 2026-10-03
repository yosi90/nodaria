import { createContext, useContext } from 'react';

/** Ajustes del lienzo que las aristas leen sin pasar por sus props. */
export interface CanvasSettings {
  /** Esquivar tarjetas intermedias al trazar aristas (se desactiva en mapas grandes). */
  avoidObstacles: boolean;
}

export const CanvasSettingsContext = createContext<CanvasSettings>({ avoidObstacles: true });

export const useCanvasSettings = () => useContext(CanvasSettingsContext);
