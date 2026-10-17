/*
 * Reglas de los grupos de trabajo (docs/roadmaps/ROADMAP_COLABORACION.md). Un grupo es un espacio de la
 * plataforma (ecosistema-kit/ESPACIOS.md): la plataforma lleva la pertenencia y aplica tres capacidades
 * (gestionar, invitar y chat); lo que cada rol puede hacer con el proyecto lo decide Nodaria aquí.
 * Funciones puras: las usan las rutas, los almacenes y el lector del feed.
 */

/** Catálogo de roles que la API declara en la plataforma. Repetirlo tal cual no cambia nada. */
export const ROLES = [
  { clave: 'responsable', nombre: 'Responsable', gestionar: true, invitar: true, chat: 'escribir', orden: 1 },
  { clave: 'editor', nombre: 'Editor', gestionar: false, invitar: false, chat: 'escribir', orden: 2 },
  // Ve, comenta y sugiere cambios, sin cambiar el proyecto (hito 5).
  { clave: 'revisor', nombre: 'Revisor', gestionar: false, invitar: false, chat: 'escribir', orden: 3 },
  // Leer el tablero no impide conversar. Es el rol de quien entra sin rol elegido (propietario, 2026-10-17).
  { clave: 'lector', nombre: 'Lector', gestionar: false, invitar: false, chat: 'escribir', orden: 4, porDefecto: true },
] as const;

export type RoleKey = (typeof ROLES)[number]['clave'];

/** Rol con el que entra quien crea el grupo; además tiene su propiedad. */
export const CREATOR_ROLE: RoleKey = 'responsable';

export const groupExternalId = (id: string) => `grupo-${id}`;

/** Lo que una cuenta puede hacer en un grupo dentro de Nodaria. */
export interface GroupCapabilities {
  /** Abrir el proyecto y exportarlo. */
  read: boolean;
  /** Nodos, relaciones, notas, posiciones y vistas guardadas. */
  edit: boolean;
  /** Tipos, atributos, preformas, parentesco, calendario y tipo de proyecto. */
  editSchema: boolean;
  /** Comentar y sugerir cambios (hito 5). Aceptar una sugerencia es editar. */
  comment: boolean;
  /** Borrar el grupo y elegir quién se queda el proyecto. */
  deleteGroup: boolean;
}

const NONE: GroupCapabilities = { read: false, edit: false, editSchema: false, comment: false, deleteGroup: false };

/**
 * Solo los miembros `activo` tienen acceso (`sin_dos_pasos` es un miembro en pausa). La propiedad lo
 * puede todo. Un rol que Nodaria no conoce (un catálogo más nuevo o más viejo) solo lee.
 */
export function capabilitiesOf(member: { role: string; state: string; owner: boolean } | null): GroupCapabilities {
  if (!member || member.state !== 'activo') return NONE;
  if (member.owner) return { read: true, edit: true, editSchema: true, comment: true, deleteGroup: true };
  switch (member.role) {
    case 'responsable':
      return { read: true, edit: true, editSchema: true, comment: true, deleteGroup: false };
    case 'editor':
      return { read: true, edit: true, editSchema: false, comment: true, deleteGroup: false };
    case 'revisor':
      return { read: true, edit: false, editSchema: false, comment: true, deleteGroup: false };
    default:
      return { read: true, edit: false, editSchema: false, comment: false, deleteGroup: false };
  }
}

/** Partes del documento que son el esquema del proyecto: un editor no las cambia. */
export const SCHEMA_KEYS = ['schemas', 'fieldLibrary', 'kinship', 'calendar', 'kind', 'schemaFolders'] as const;

/** JSON con las claves ordenadas, para comparar documentos sin depender del orden en que llegan. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

/** Las claves del esquema que difieren entre dos versiones del documento. */
export function changedSchemaKeys(before: Record<string, unknown>, after: Record<string, unknown>) {
  return SCHEMA_KEYS.filter(key => canonicalJson(before[key]) !== canonicalJson(after[key]));
}

/** Un espacio tal como lo dan la plataforma y el feed (`espacio.*`). */
export interface PlatformSpace {
  id: number;
  idExterno: string;
  nombre: string;
  entrada: string;
  dosPasos: boolean;
  propietario: string | null;
}

/** Lo que un cambio del feed significa para la copia local. */
export type SpaceEffect =
  | { kind: 'space'; space: PlatformSpace }
  | { kind: 'space-deleted'; externalId: string }
  | { kind: 'member'; externalId: string; globalId: string; role: string; state: string }
  | { kind: 'member-left'; externalId: string; globalId: string };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown) => (typeof value === 'string' && value ? value : null);

function parseSpace(value: unknown): PlatformSpace | null {
  if (!isRecord(value)) return null;
  const id = Number(value.id);
  const idExterno = text(value.idExterno);
  if (!Number.isSafeInteger(id) || !idExterno) return null;
  return {
    id,
    idExterno,
    nombre: text(value.nombre) ?? idExterno,
    entrada: text(value.entrada) ?? 'invitacion',
    dosPasos: value.dosPasos === true,
    propietario: text(value.propietario)?.toLowerCase() ?? null,
  };
}

/**
 * Interpreta un cambio del feed de los espacios (`ecosistema-kit/ESPACIOS.md`, «Entérate por el feed»).
 * Devuelve `null` si no es de los espacios o viene incompleto: se ignora, como el resto del feed.
 */
export function spaceFeedEffect(change: { tipo: string; cuenta: string; datos: unknown }): SpaceEffect | null {
  const datos = isRecord(change.datos) ? change.datos : {};
  const account = text(change.cuenta)?.toLowerCase() ?? null;
  switch (change.tipo) {
    case 'espacio.creado':
    case 'espacio.cambiado': {
      const space = parseSpace(datos.espacio);
      return space ? { kind: 'space', space } : null;
    }
    case 'espacio.borrado': {
      const externalId = isRecord(datos.espacio) ? text(datos.espacio.idExterno) : null;
      return externalId ? { kind: 'space-deleted', externalId } : null;
    }
    case 'miembro.entrado':
    case 'miembro.cambiado': {
      const externalId = isRecord(datos.espacio) ? text(datos.espacio.idExterno) : null;
      const role = text(datos.rol);
      const state = text(datos.estado);
      if (!externalId || !account || !role || !state) return null;
      return { kind: 'member', externalId, globalId: account, role, state };
    }
    case 'miembro.salido': {
      const externalId = isRecord(datos.espacio) ? text(datos.espacio.idExterno) : null;
      if (!externalId || !account) return null;
      return { kind: 'member-left', externalId, globalId: account };
    }
    default:
      return null;
  }
}
