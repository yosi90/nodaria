import { describe, expect, it } from 'vitest';
import { createInitialState, createProject } from '../domain/factories';
import { COALESCE_MS, createHistory, HISTORY_LIMIT, historyReducer, type History } from './history';
import type { Action } from './reducer';

const apply = (h: History, action: Action, at = 0) => historyReducer(h, { type: 'apply', action, at });
const name = (h: History) => h.present.projects.find(p => p.id === h.present.activeProjectId)!.name;

describe('historial', () => {
  it('deshace y rehace cambios', () => {
    let h = createHistory(createInitialState());
    h = apply(h, { type: 'add-schema', name: 'Personaje', kind: 'entity' });
    const withSchema = h.present;
    h = historyReducer(h, { type: 'undo' });
    expect(h.present.projects[0].schemas).toHaveLength(0);
    h = historyReducer(h, { type: 'redo' });
    expect(h.present).toBe(withSchema);
  });

  it('agrupa ediciones seguidas del mismo elemento', () => {
    let h = createHistory(createInitialState());
    const original = name(h);
    h = apply(h, { type: 'rename-project', name: 'A' }, 1000);
    h = apply(h, { type: 'rename-project', name: 'AB' }, 1000 + COALESCE_MS / 2);
    h = apply(h, { type: 'rename-project', name: 'ABC' }, 1000 + COALESCE_MS);
    expect(h.past).toHaveLength(1);
    h = historyReducer(h, { type: 'undo' });
    expect(name(h)).toBe(original);
  });

  it('separa ediciones con pausa larga', () => {
    let h = createHistory(createInitialState());
    h = apply(h, { type: 'rename-project', name: 'A' }, 0);
    h = apply(h, { type: 'rename-project', name: 'B' }, COALESCE_MS * 3);
    expect(h.past).toHaveLength(2);
  });

  it('una acción nueva descarta lo rehacible', () => {
    let h = createHistory(createInitialState());
    h = apply(h, { type: 'add-schema', name: 'A', kind: 'entity' });
    h = historyReducer(h, { type: 'undo' });
    h = apply(h, { type: 'add-schema', name: 'B', kind: 'entity' });
    expect(h.future).toEqual([]);
  });

  it('cambiar de proyecto no ocupa un paso de deshacer', () => {
    const state = createInitialState();
    const other = createProject('Otro');
    let h = createHistory({ ...state, projects: [...state.projects, other] });
    h = apply(h, { type: 'set-project', id: other.id });
    expect(h.past).toHaveLength(0);
    expect(h.present.activeProjectId).toBe(other.id);
  });

  it('las acciones sin efecto no crean pasos', () => {
    const h = createHistory(createInitialState());
    expect(apply(h, { type: 'delete-node', id: 'inexistente' }).past).toHaveLength(0);
  });

  it(`conserva como máximo ${HISTORY_LIMIT} pasos`, () => {
    let h = createHistory(createInitialState());
    for (let i = 0; i < HISTORY_LIMIT + 20; i++) h = apply(h, { type: 'add-schema', name: `T${i}`, kind: 'entity' });
    expect(h.past).toHaveLength(HISTORY_LIMIT);
  });
});
