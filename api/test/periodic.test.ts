import { describe, expect, it } from 'vitest';
import { createPeriodicTask } from '../src/periodic.ts';

const silent = { warn: () => undefined };

describe('trabajos periódicos', () => {
  it('pedirlo mientras corre devuelve la misma pasada, y después corre otra', async () => {
    let runs = 0;
    let release!: () => void;
    const task = createPeriodicTask({
      run: () =>
        new Promise<number>(resolve => {
          runs++;
          release = () => resolve(runs);
        }),
      intervalMs: 60_000,
      log: silent,
      failure: 'fallo',
    });
    const first = task.runOnce();
    expect(task.runOnce()).toBe(first);
    release();
    expect(await first).toBe(1);
    const second = task.runOnce();
    release();
    expect(await second).toBe(2);
  });

  it('registra el fallo de una vuelta y para sin esperar a la siguiente', async () => {
    const warned: string[] = [];
    const task = createPeriodicTask({
      run: async () => {
        throw new Error('sin red');
      },
      intervalMs: 60_000,
      log: {
        warn(...args: unknown[]) {
          warned.push(String(args[1]));
        },
      },
      failure: 'No se pudo leer el feed',
    });
    task.start();
    await task.stop();
    await new Promise(resolve => setImmediate(resolve));
    expect(warned).toEqual(['No se pudo leer el feed']);
  });
});
