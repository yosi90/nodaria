/*
 * Proyectos públicos y su comunidad (docs/roadmaps/ROADMAP_COMUNIDAD.md). Publicar sube una copia de solo
 * lectura; seguir, el feed, los «me gusta» y los comentarios son de la plataforma, y Nodaria solo publica
 * las novedades desde aquí (`ecosistema-kit/NOVEDADES.md`). Las reglas puras viven en este archivo.
 */

/** El catálogo de tipos de novedad de Nodaria (`PUT /v1/servicio/novedades/tipos`). */
export const NEWS_KINDS = [
  {
    clave: 'proyecto.publicado',
    nombre: 'Publicar un proyecto',
    descripcion: 'Cuando haces público un proyecto de Nodaria.',
    orden: 1,
  },
  {
    clave: 'proyecto.actualizado',
    nombre: 'Actualizar un proyecto publicado',
    descripcion: 'Cuando publicas los cambios de un proyecto público (una vez al día como mucho).',
    orden: 2,
  },
] as const;

/** Motivos de denuncia de un proyecto público. */
export const REPORT_REASONS = {
  spam: 'Publicidad o spam',
  ofensivo: 'Contenido ofensivo o que incita al odio',
  datos_personales: 'Datos personales de otras personas',
  derechos: 'Contenido de otra persona sin permiso',
  ilegal: 'Contenido ilegal o peligroso',
  otro: 'Otro motivo',
} as const;
export type ReportReason = keyof typeof REPORT_REASONS;
export const isReportReason = (value: string): value is ReportReason => Object.hasOwn(REPORT_REASONS, value);

/** Alcances de moderación que no dejan publicar ni actualizar lo publicado (`ecosistema-kit/MODERACION.md`). */
export const PUBLISH_BLOCKING = ['creacion', 'publicacion', 'comunidad'];

export interface PublicationCounts {
  nodes: number;
  relations: number;
}

const plural = (n: number, one: string, many: string) => `${n.toLocaleString('es-ES')} ${n === 1 ? one : many}`;

/** El nombre entre comillas, recortado para que la frase quepa en los 280 caracteres de una novedad. */
function quoted(name: string, room: number) {
  const clean = name.replace(/\s+/g, ' ').trim();
  return `«${clean.length > room ? `${clean.slice(0, room - 1).trimEnd()}…` : clean}»`;
}

function sizeText({ nodes, relations }: PublicationCounts) {
  if (!nodes) return '';
  return relations
    ? `, con ${plural(nodes, 'nodo', 'nodos')} y ${plural(relations, 'relación', 'relaciones')}`
    : `, con ${plural(nodes, 'nodo', 'nodos')}`;
}

/**
 * El texto de la novedad: tercera persona y sin el nombre de la persona (la tarjeta lo pone delante), ni
 * HTML ni nada que no sea lo publicado.
 */
export function newsText(kind: 'publicado' | 'actualizado', name: string, counts: PublicationCounts) {
  const tail = sizeText(counts);
  const verb = kind === 'publicado' ? 'ha publicado en Nodaria el proyecto ' : 'ha actualizado en Nodaria ';
  return `${verb}${quoted(name, 280 - verb.length - tail.length - 2)}${tail}`;
}

/** Fecha del día en UTC (`AAAA-MM-DD`), para la novedad de actualización: una como mucho al día. */
export const dayOf = (date: Date) => date.toISOString().slice(0, 10);

/**
 * Qué novedad corresponde a publicar los cambios: la de la publicación si es del mismo día (se corrige en
 * vez de sumar otra), o la del día de hoy (se actualiza si se vuelve a publicar ese día).
 */
export function updateNews(publicId: string, publishedAt: Date, now: Date) {
  return dayOf(publishedAt) === dayOf(now)
    ? { externalId: `proyecto-${publicId}`, kind: 'publicado' as const }
    : { externalId: `proyecto-${publicId}-${dayOf(now)}`, kind: 'actualizado' as const };
}

/** El enlace de la página pública. */
export const publicUrl = (webUrl: string, publicId: string) => `${webUrl.replace(/\/$/, '')}/p/${publicId}`;

/** Cuántos nodos y relaciones lleva un documento ya validado. */
export function countsOf(document: { nodes: unknown[]; relations: unknown[] }): PublicationCounts {
  return { nodes: document.nodes.length, relations: document.relations.length };
}

/** El aviso de Notificapp de una denuncia: el cuerpo se entiende solo, sin abrir el panel. */
export function reportEvent(
  report: { id: number; reason: ReportReason; body: string },
  publication: { id: string; name: string },
  url: string,
) {
  const lines = [
    `Denuncia del proyecto público «${publication.name}».`,
    `Motivo: ${REPORT_REASONS[report.reason]}.`,
    report.body ? `Lo que dice: ${report.body}` : 'Sin más detalle.',
    `Ver: ${url}`,
  ];
  return {
    externalId: `report-${report.id}`,
    kind: 'nodaria_report',
    title: `Denuncia en Nodaria: «${publication.name.slice(0, 150)}»`,
    body: lines.join('\n'),
    data: { report: report.id, publicId: publication.id },
  };
}
