import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.ts';
import { readMigrations, runMigrations } from '../src/db/migrations.ts';
import { sql, type Database } from '../src/db/pool.ts';
import { createGroupMaintenance } from '../src/groups/maintenance.ts';
import {
  capabilitiesOf,
  changedSchemaKeys,
  groupExternalId,
  ROLES,
  spaceFeedEffect,
  type PlatformSpace,
} from '../src/groups/model.ts';
import { createSqlGroupStore, type GroupStore } from '../src/groups/repository.ts';
import { createSqlFeedStore } from '../src/platform/feed.ts';
import { PlatformError } from '../src/platform/spaces.ts';
import { createMemoryProjectStore, createSqlProjectStore, type ProjectStore } from '../src/projects/repository.ts';
import { createSqlUserStore } from '../src/users/repository.ts';
import {
  fakeSpaces,
  fakeUsers,
  memoryGroups,
  OTHER,
  OWNER,
  platformTokens,
  testDependencies,
} from './helpers/fakes.ts';
import { createTestDatabase, dbTestsEnabled } from './helpers/testDatabase.ts';

const THIRD = '22222222-3333-4444-5555-666666666666';
const GROUP = 'a1b2c3d4-0000-4000-8000-000000000001';
const EXTERNAL = groupExternalId(GROUP);

const doc = (id: string, patch: Record<string, unknown> = {}) => ({
  id,
  name: 'Crónicas',
  updatedAt: '2026-10-17T10:00:00.000Z',
  schemas: [{ id: 's1', name: 'Personaje' }],
  fieldLibrary: [],
  nodes: [],
  relations: [],
  formatVersion: 7,
  ...patch,
});

const space = (patch: Partial<PlatformSpace> = {}): PlatformSpace => ({
  id: 100,
  idExterno: EXTERNAL,
  nombre: 'Novela',
  entrada: 'invitacion',
  dosPasos: false,
  propietario: OWNER,
  ...patch,
});

describe('reglas de los grupos', () => {
  it('declara tres roles con Lector por defecto y sin la clave reservada', () => {
    expect(ROLES.map(role => role.clave)).toEqual(['responsable', 'editor', 'lector']);
    expect(ROLES.filter(role => 'porDefecto' in role && role.porDefecto).map(role => role.clave)).toEqual(['lector']);
    expect(ROLES.every(role => role.chat === 'escribir')).toBe(true);
  });

  it('da capacidades por rol solo a los miembros activos', () => {
    expect(capabilitiesOf(null).read).toBe(false);
    expect(capabilitiesOf({ role: 'responsable', state: 'sin_dos_pasos', owner: false }).read).toBe(false);
    expect(capabilitiesOf({ role: 'lector', state: 'activo', owner: true })).toEqual({
      read: true,
      edit: true,
      editSchema: true,
      deleteGroup: true,
    });
    expect(capabilitiesOf({ role: 'responsable', state: 'activo', owner: false })).toMatchObject({
      editSchema: true,
      deleteGroup: false,
    });
    expect(capabilitiesOf({ role: 'editor', state: 'activo', owner: false })).toMatchObject({
      edit: true,
      editSchema: false,
    });
    expect(capabilitiesOf({ role: 'lector', state: 'activo', owner: false })).toMatchObject({
      read: true,
      edit: false,
    });
    // Un rol desconocido solo lee.
    expect(capabilitiesOf({ role: 'revisor', state: 'activo', owner: false })).toMatchObject({ edit: false });
  });

  it('detecta cambios de esquema sin depender del orden de las claves', () => {
    const before = { schemas: [{ id: 's1', name: 'A' }], nodes: [], kind: 'novel' };
    expect(
      changedSchemaKeys(before, { kind: 'novel', nodes: [{ id: 'n1' }], schemas: [{ name: 'A', id: 's1' }] }),
    ).toEqual([]);
    expect(changedSchemaKeys(before, { ...before, schemas: [{ id: 's1', name: 'B' }], kind: 'rpg' })).toEqual([
      'schemas',
      'kind',
    ]);
  });

  it('interpreta los cambios del feed de los espacios e ignora los incompletos', () => {
    const datos = {
      espacio: {
        id: 7,
        idExterno: 'grupo-x',
        nombre: 'N',
        entrada: 'invitacion',
        dosPasos: false,
        propietario: OWNER.toUpperCase(),
      },
    };
    expect(spaceFeedEffect({ tipo: 'espacio.creado', cuenta: OWNER, datos })).toEqual({
      kind: 'space',
      space: { id: 7, idExterno: 'grupo-x', nombre: 'N', entrada: 'invitacion', dosPasos: false, propietario: OWNER },
    });
    expect(spaceFeedEffect({ tipo: 'espacio.borrado', cuenta: OWNER, datos })).toEqual({
      kind: 'space-deleted',
      externalId: 'grupo-x',
    });
    expect(
      spaceFeedEffect({
        tipo: 'miembro.entrado',
        cuenta: OTHER,
        datos: { espacio: { id: 7, idExterno: 'grupo-x' }, rol: 'lector', estado: 'activo', via: 'invitacion' },
      }),
    ).toEqual({ kind: 'member', externalId: 'grupo-x', globalId: OTHER, role: 'lector', state: 'activo' });
    expect(
      spaceFeedEffect({
        tipo: 'miembro.salido',
        cuenta: OTHER,
        datos: { espacio: { id: 7, idExterno: 'grupo-x' }, motivo: 'expulsado' },
      }),
    ).toEqual({ kind: 'member-left', externalId: 'grupo-x', globalId: OTHER });
    expect(spaceFeedEffect({ tipo: 'miembro.entrado', cuenta: OTHER, datos: { rol: 'lector' } })).toBeNull();
    expect(spaceFeedEffect({ tipo: 'cuenta.estado', cuenta: OTHER, datos: {} })).toBeNull();
  });
});

// Contrato que cumplen el almacén en memoria y el de SQL Server.
function storeContract(
  name: string,
  make: () => Promise<{ groups: GroupStore; projects: ProjectStore; owner: number; other: number }>,
) {
  describe(`${name} group store`, () => {
    it('crea, comparte, versiona y entrega el proyecto al borrar el grupo', async () => {
      const { groups, projects, owner, other } = await make();
      const write = { name: 'Crónicas', document: JSON.stringify(doc('p1')), updatedAt: '2026-10-17T10:00:00.000Z' };
      await projects.put(owner, 'p1', write, 0);

      expect(await groups.beginCreate({ externalId: EXTERNAL, name: 'Novela', createdBy: OWNER })).toMatchObject({
        status: 'created',
        group: { state: 'creando', spaceId: null },
      });
      expect(await groups.beginCreate({ externalId: EXTERNAL, name: 'Novela', createdBy: OWNER })).toMatchObject({
        status: 'existing',
      });
      expect(await groups.beginCreate({ externalId: EXTERNAL, name: 'Otro', createdBy: OTHER })).toEqual({
        status: 'taken',
      });
      expect(await groups.completeCreate(EXTERNAL, space(), 'responsable')).toMatchObject({
        state: 'activo',
        spaceId: 100,
        owner: OWNER,
      });
      expect(await groups.member(EXTERNAL, OWNER)).toEqual({ globalId: OWNER, role: 'responsable', state: 'activo' });

      const attached = await groups.attachProject(EXTERNAL, owner, { projectId: 'p1', ...write, by: OWNER });
      expect(attached).toMatchObject({ status: 'attached', project: { id: 'p1', version: 1, updatedBy: OWNER } });
      // La copia personal queda borrada: los otros dispositivos de la cuenta se enteran.
      expect((await projects.get(owner, 'p1'))!.deletedAt).not.toBeNull();
      expect(await groups.projectGroup('p1')).toBe(EXTERNAL);
      expect(await groups.attachProject(EXTERNAL, owner, { projectId: 'p1', ...write, by: OWNER })).toMatchObject({
        status: 'attached',
      });

      const list = await groups.listForMember(OWNER);
      expect(list).toHaveLength(1);
      expect(list[0]).toMatchObject({
        externalId: EXTERNAL,
        member: { role: 'responsable' },
        projects: [{ id: 'p1' }],
      });
      expect(await groups.listForMember(OTHER)).toEqual([]);

      await groups.applyEffect({
        kind: 'member',
        externalId: EXTERNAL,
        globalId: OTHER,
        role: 'editor',
        state: 'activo',
      });
      expect(await groups.listForMember(OTHER)).toHaveLength(1);

      expect(await groups.putProject(EXTERNAL, 'p1', { ...write, name: 'Crónicas II', by: OTHER }, 1)).toMatchObject({
        status: 'applied',
        version: 2,
      });
      expect(await groups.putProject(EXTERNAL, 'p1', { ...write, by: OTHER }, 1)).toMatchObject({
        status: 'conflict',
        current: { version: 2, name: 'Crónicas II', updatedBy: OTHER },
      });
      expect(await groups.putProject(EXTERNAL, 'nope', { ...write, by: OTHER }, 1)).toEqual({
        status: 'conflict',
        current: null,
      });
      expect((await groups.getProject(EXTERNAL, 'p1'))!.document).toBe(write.document);

      // Borrar el grupo: el proyecto pasa a la cuenta elegida y el grupo espera a la plataforma.
      expect(await groups.beginDelete(EXTERNAL, other)).toEqual({ status: 'started' });
      expect(await projects.get(other, 'p1')).toMatchObject({ name: 'Crónicas II', deletedAt: null });
      expect(await groups.listForMember(OWNER)).toEqual([]);
      expect(await groups.projectGroup('p1')).toBeNull();
      expect(await groups.pendingDeletes()).toEqual([EXTERNAL]);
      expect(await groups.beginDelete(EXTERNAL, other)).toEqual({ status: 'not_found' });
      await groups.finishDelete(EXTERNAL);
      expect(await groups.pendingDeletes()).toEqual([]);
      expect(await groups.find(EXTERNAL)).toMatchObject({ state: 'borrado' });
      // El id borrado no se reutiliza.
      expect(await groups.beginCreate({ externalId: EXTERNAL, name: 'Novela', createdBy: OWNER })).toEqual({
        status: 'taken',
      });
    });

    it('sigue el feed: miembros que salen y espacios que borra la plataforma', async () => {
      const { groups, projects, owner } = await make();
      const external = groupExternalId('a1b2c3d4-0000-4000-8000-000000000002');
      const write = { name: 'Mapa', document: JSON.stringify(doc('p2')), updatedAt: '2026-10-17T10:00:00.000Z' };
      await groups.beginCreate({ externalId: external, name: 'Mapa', createdBy: OWNER });
      await groups.completeCreate(external, space({ id: 101, idExterno: external, nombre: 'Mapa' }), 'responsable');
      await groups.attachProject(external, owner, { projectId: 'p2', ...write, by: OWNER });
      // Otro grupo no se queda con el mismo proyecto.
      const second = groupExternalId('a1b2c3d4-0000-4000-8000-000000000003');
      await groups.beginCreate({ externalId: second, name: 'B', createdBy: OWNER });
      await groups.completeCreate(second, space({ id: 102, idExterno: second, nombre: 'B' }), 'responsable');
      expect(await groups.attachProject(second, owner, { projectId: 'p2', ...write, by: OWNER })).toEqual({
        status: 'already_shared',
      });

      await groups.applyEffect({
        kind: 'member',
        externalId: external,
        globalId: THIRD,
        role: 'lector',
        state: 'activo',
      });
      await groups.applyEffect({
        kind: 'member',
        externalId: external,
        globalId: THIRD,
        role: 'lector',
        state: 'sin_dos_pasos',
      });
      expect(await groups.member(external, THIRD)).toMatchObject({ state: 'sin_dos_pasos' });
      await groups.applyEffect({ kind: 'member-left', externalId: external, globalId: THIRD });
      expect(await groups.member(external, THIRD)).toBeNull();
      await groups.applyEffect({
        kind: 'space',
        space: space({ id: 101, idExterno: external, nombre: 'Mapa nuevo', propietario: OTHER }),
      });
      expect(await groups.find(external)).toMatchObject({ name: 'Mapa nuevo', owner: OTHER, state: 'activo' });

      // Sin nadie a quien dárselo (la plataforma lo borró al borrarse la última cuenta), el proyecto se va con él.
      await groups.applyEffect({ kind: 'space-deleted', externalId: external });
      expect(await groups.find(external)).toMatchObject({ state: 'borrado' });
      expect(await groups.projectGroup('p2')).toBeNull();
      expect(await projects.get(owner, 'p2')).toBeNull();
      // Un miembro que llega tarde a un grupo borrado no lo revive.
      await groups.applyEffect({
        kind: 'member',
        externalId: external,
        globalId: OWNER,
        role: 'lector',
        state: 'activo',
      });
      expect(await groups.listForMember(OWNER)).toHaveLength(1);
      expect((await groups.listForMember(OWNER))[0].externalId).toBe(second);
    });
  });
}

storeContract('memory', async () => {
  const projects = createMemoryProjectStore();
  return { groups: memoryGroups(projects), projects, owner: 1, other: 2 };
});

describe.runIf(dbTestsEnabled)('SQL Server', () => {
  let db: Database;
  let drop: () => Promise<void>;
  beforeAll(async () => {
    ({ db, drop } = await createTestDatabase());
    await runMigrations(db, await readMigrations());
  });
  afterAll(async () => {
    await drop();
  });
  const reset = () =>
    db
      .request()
      .query(
        'DELETE FROM dbo.group_projects; DELETE FROM dbo.group_members; DELETE FROM dbo.groups; DELETE FROM dbo.projects; DELETE FROM dbo.users;',
      );

  storeContract('sql', async () => {
    await reset();
    const users = createSqlUserStore(db);
    const owner = await users.findOrCreate(OWNER);
    const other = await users.findOrCreate(OTHER);
    return { groups: createSqlGroupStore(db), projects: createSqlProjectStore(db), owner: owner.id, other: other.id };
  });

  it('aplica el feed de los espacios con su cursor y borrar una cuenta no borra el proyecto del grupo', async () => {
    await reset();
    const users = createSqlUserStore(db);
    const groups = createSqlGroupStore(db);
    const feed = createSqlFeedStore(db);
    const owner = await users.findOrCreate(OWNER);
    await users.findOrCreate(OTHER);
    await groups.beginCreate({ externalId: EXTERNAL, name: 'Novela', createdBy: OWNER });
    await groups.completeCreate(EXTERNAL, space(), 'responsable');
    await groups.attachProject(EXTERNAL, owner.id, {
      projectId: 'p1',
      name: 'Crónicas',
      document: JSON.stringify(doc('p1')),
      updatedAt: '2026-10-17T10:00:00.000Z',
      by: OWNER,
    });
    const change = (id: number, tipo: string, cuenta: string, datos: unknown) => ({
      id,
      tipo,
      cuenta,
      cuenta2: null,
      datos,
      fecha: new Date().toISOString(),
    });
    const ref = { id: 100, idExterno: EXTERNAL };
    await feed.apply(
      [
        change(1, 'miembro.entrado', OWNER, { espacio: ref, rol: 'responsable', estado: 'activo', via: 'creacion' }),
        change(2, 'miembro.entrado', OTHER, { espacio: ref, rol: 'lector', estado: 'activo', via: 'invitacion' }),
        change(3, 'miembro.cambiado', OTHER, { espacio: ref, rol: 'editor', estado: 'activo' }),
        // La plataforma pasa el espacio a OTHER y después borra la cuenta del propietario.
        change(4, 'espacio.cambiado', OWNER, { espacio: { ...space(), propietario: OTHER } }),
        change(5, 'miembro.salido', OWNER, { espacio: ref, motivo: 'cuenta_borrada' }),
        change(6, 'cuenta.estado', OWNER, { estado: 'borrada' }),
      ],
      6,
    );
    expect(await feed.cursor()).toBe(6);
    expect(await groups.find(EXTERNAL)).toMatchObject({ owner: OTHER, state: 'activo' });
    expect(await groups.member(EXTERNAL, OTHER)).toMatchObject({ role: 'editor', state: 'activo' });
    expect(await groups.member(EXTERNAL, OWNER)).toBeNull();
    const rows = await new sql.Request(db).query('SELECT COUNT(*) AS n FROM dbo.users');
    expect(Number(rows.recordset[0].n)).toBe(1);
    // El proyecto es del grupo: sigue ahí.
    expect(await groups.getProject(EXTERNAL, 'p1')).toMatchObject({ name: 'Crónicas', version: 1 });
  });
});

describe('group routes', () => {
  async function setup() {
    const tokens = await platformTokens();
    const projects = createMemoryProjectStore();
    const groups = memoryGroups(projects);
    const spaces = fakeSpaces();
    const users = fakeUsers();
    let feedReads = 0;
    const app = await buildApp(
      testDependencies({
        auth: tokens.provider,
        projects,
        groups,
        spaces: spaces.client,
        users: users.store,
        feed: {
          async readOnce() {
            feedReads++;
            return 0;
          },
        },
      }),
    );
    const sessions = {
      owner: await tokens.sign({ sub: OWNER }),
      other: await tokens.sign({ sub: OTHER }),
      third: await tokens.sign({ sub: THIRD }),
    };
    const call = (
      method: 'GET' | 'POST' | 'PUT' | 'DELETE',
      url: string,
      body?: unknown,
      who: keyof typeof sessions = 'owner',
    ) => app.inject({ method, url, headers: { authorization: `Bearer ${sessions[who]}` }, payload: body as never });
    const join = (globalId: string, role: string, state = 'activo') =>
      groups.applyEffect({ kind: 'member', externalId: EXTERNAL, globalId, role, state });
    const create = () => call('POST', '/api/grupos', { id: GROUP, name: 'Novela', document: doc('p1') });
    return { call, join, create, groups, projects, spaces, users, feedReads: () => feedReads };
  }

  it('crea el grupo con el proyecto, que deja de ser de la cuenta', async () => {
    const { call, create, spaces } = await setup();
    await call('PUT', '/api/projects/p1', { document: doc('p1'), baseVersion: 0 });

    const created = await create();
    expect(created.statusCode).toBe(200);
    expect(created.json()).toMatchObject({
      id: EXTERNAL,
      spaceId: 100,
      name: 'Novela',
      owner: OWNER,
      role: 'responsable',
      isOwner: true,
      capabilities: { read: true, edit: true, editSchema: true, deleteGroup: true },
      projects: [{ id: 'p1', version: 1 }],
    });
    expect(spaces.calls).toEqual([`create:${EXTERNAL}`]);
    expect((await call('GET', '/api/projects')).json().projects).toMatchObject([
      { id: 'p1', deletedAt: expect.any(String) },
    ]);
    // Repetir la creación no crea otro espacio.
    expect((await create()).statusCode).toBe(200);
    expect(spaces.calls).toEqual([`create:${EXTERNAL}`]);
    // Otro dispositivo con la copia de antes no la resucita como proyecto propio.
    const stale = await call('PUT', '/api/projects/p1', { document: doc('p1'), baseVersion: 2 });
    expect(stale.statusCode).toBe(409);
    expect(stale.json()).toMatchObject({ error: 'proyecto_compartido', group: EXTERNAL });
    // Quien no es del grupo puede tener su propia copia con ese id (de un JSON importado).
    expect((await call('PUT', '/api/projects/p1', { document: doc('p1'), baseVersion: 0 }, 'other')).statusCode).toBe(
      200,
    );
    expect((await call('GET', '/api/grupos')).json().groups).toHaveLength(1);
  });

  it('declara los roles si la plataforma no los tiene y responde 424 si falla', async () => {
    const { create, spaces } = await setup();
    spaces.failOnce(new PlatformError(409, 'sin_roles', 'Declara tus roles.'));
    expect((await create()).statusCode).toBe(200);
    expect(spaces.calls).toEqual([`create:${EXTERNAL}`, 'roles', `create:${EXTERNAL}`]);

    const other = await setup();
    other.spaces.failOnce(new PlatformError(503, 'mantenimiento', 'En mantenimiento.'));
    const failed = await other.create();
    expect(failed.statusCode).toBe(424);
    expect(failed.json()).toMatchObject({ error: 'plataforma_no_disponible', causa: 'mantenimiento' });
    // El reintento con el mismo id termina de crearlo.
    expect((await other.create()).statusCode).toBe(200);
  });

  it('no comparte en un grupo nuevo un proyecto que ya es de otro', async () => {
    const { call, create } = await setup();
    await create();
    const again = await call('POST', '/api/grupos', {
      id: 'a1b2c3d4-0000-4000-8000-0000000000ff',
      name: 'Otra',
      document: doc('p1'),
    });
    expect(again.statusCode).toBe(409);
    expect(again.json()).toMatchObject({ error: 'proyecto_ya_compartido' });
  });

  it('autoriza el proyecto por rol con la copia del feed', async () => {
    const { call, create, join } = await setup();
    await create();
    const url = `/api/grupos/${EXTERNAL}/proyectos/p1`;
    const content = doc('p1', { nodes: [{ id: 'n1' }] });

    // Sin ser miembro, el grupo no existe para esa cuenta.
    expect((await call('GET', url, undefined, 'other')).statusCode).toBe(404);
    await join(OTHER, 'lector', 'sin_dos_pasos');
    expect((await call('GET', url, undefined, 'other')).statusCode).toBe(404);

    await join(OTHER, 'lector');
    const read = await call('GET', url, undefined, 'other');
    expect(read.statusCode).toBe(200);
    expect(read.json()).toMatchObject({ version: 1, document: doc('p1') });
    expect((await call('PUT', url, { document: content, baseVersion: 1 }, 'other')).json()).toMatchObject({
      error: 'sin_permiso_en_el_grupo',
    });

    await join(OTHER, 'editor');
    expect((await call('PUT', url, { document: content, baseVersion: 1 }, 'other')).json()).toMatchObject({
      version: 2,
    });
    const schema = await call(
      'PUT',
      url,
      { document: { ...content, schemas: [{ id: 's2', name: 'Lugar' }] }, baseVersion: 2 },
      'other',
    );
    expect(schema.statusCode).toBe(403);
    expect(schema.json()).toMatchObject({ error: 'cambio_de_esquema_no_permitido', keys: ['schemas'] });
    const stale = await call('PUT', url, { document: content, baseVersion: 1 }, 'other');
    expect(stale.statusCode).toBe(409);
    expect(stale.json()).toMatchObject({ error: 'version_conflict', current: { version: 2, updatedBy: OTHER } });

    await join(OTHER, 'responsable');
    expect(
      (await call('PUT', url, { document: { ...content, schemas: [] }, baseVersion: 2 }, 'other')).json(),
    ).toMatchObject({ version: 3 });
    expect(
      (await call('PUT', `/api/grupos/${EXTERNAL}/proyectos/p9`, { document: doc('p9'), baseVersion: 1 })).statusCode,
    ).toBe(404);
  });

  it('lee el feed a petición tras aceptar una invitación', async () => {
    const { call, create, feedReads } = await setup();
    await create();
    const refreshed = await call('POST', '/api/grupos/actualizar', undefined, 'other');
    expect(refreshed.statusCode).toBe(200);
    expect(refreshed.json()).toEqual({ groups: [] });
    expect(feedReads()).toBe(1);
  });

  it('borra el grupo solo su propietario, que elige quién se queda el proyecto', async () => {
    const { call, create, join, spaces, groups } = await setup();
    await create();
    await join(OTHER, 'responsable');
    await join(THIRD, 'lector', 'sin_dos_pasos');

    expect(
      (await call('DELETE', `/api/grupos/${EXTERNAL}?recipient=${OWNER}`, undefined, 'other')).json(),
    ).toMatchObject({
      error: 'sin_permiso_en_el_grupo',
    });
    expect((await call('DELETE', `/api/grupos/${EXTERNAL}?recipient=${THIRD}`)).json()).toMatchObject({
      error: 'receptor_no_valido',
    });

    spaces.failOnce(new PlatformError(503, 'mantenimiento', 'En mantenimiento.'));
    const deleted = await call('DELETE', `/api/grupos/${EXTERNAL}?recipient=${OTHER}`);
    expect(deleted.json()).toEqual({ id: EXTERNAL, state: 'borrando' });
    expect((await call('GET', '/api/projects', undefined, 'other')).json().projects).toMatchObject([
      { id: 'p1', deletedAt: null },
    ]);
    expect((await call('GET', '/api/grupos')).json().groups).toEqual([]);

    // El mantenimiento termina de borrar el espacio.
    const maintenance = createGroupMaintenance({
      groups,
      spaces: spaces.client,
      intervalMs: 60_000,
      log: { info() {}, warn() {} },
    });
    await maintenance.runOnce();
    expect(spaces.calls).toEqual([`create:${EXTERNAL}`, `remove:${EXTERNAL}`, 'roles', `remove:${EXTERNAL}`]);
    expect(await groups.find(EXTERNAL)).toMatchObject({ state: 'borrado' });
    expect(await groups.pendingDeletes()).toEqual([]);
  });
});
