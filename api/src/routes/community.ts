import { timingSafeEqual } from 'node:crypto';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { AppDependencies } from '../app.ts';
import { GUID } from '../auth/platform.ts';
import { assertUnrestricted, authenticatedUser, bearerToken, HttpError } from '../auth/plugin.ts';
import {
  countsOf,
  isReportReason,
  newsText,
  PUBLISH_BLOCKING,
  publicUrl,
  REPORT_REASONS,
  reportEvent,
  updateNews,
} from '../community/model.ts';
import { omit, PUBLIC_ID, type Publication, type ReportView } from '../community/repository.ts';
import { PlatformError, readToken } from '../platform/http.ts';
import { assertDocumentId, documentSchema, PROJECT_ID, serializeDocument } from './projects.ts';

/*
 * Proyectos públicos (docs/roadmaps/ROADMAP_COMUNIDAD.md). Publicar sube una copia de solo lectura que la
 * API nunca deja cambiar a nadie más; leerla no pide sesión. Las novedades salen por la cola de salida
 * después de confirmar la transacción.
 */

const projectParams = z.object({ id: z.string().regex(PROJECT_ID, 'Identificador de proyecto no válido') });
const publicParams = z.object({ publicId: z.string().regex(PUBLIC_ID, 'Identificador público no válido') });

/** La imagen del mapa: PNG o JPEG en `data:`, de hasta 1 MB. */
const MAX_IMAGE = 1024 * 1024;
const IMAGE_DATA = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=]+)$/;

/** Los bytes de la imagen si son de verdad un PNG o un JPEG; si no, `null`. */
export function imageBytes(dataUrl: string): Buffer | null {
  const match = IMAGE_DATA.exec(dataUrl);
  if (!match) return null;
  const bytes = Buffer.from(match[2], 'base64');
  const png = bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  return bytes.length <= MAX_IMAGE && (png || jpeg) ? bytes : null;
}
const imageType = (bytes: Buffer) => (bytes[0] === 0x89 ? 'image/png' : 'image/jpeg');

/** El origen de una copia que trae el documento, si se entiende. */
const originSchema = z
  .object({
    publicId: z.string().regex(PUBLIC_ID),
    name: z.string().max(200),
    author: z.string().regex(GUID),
    copiedAt: z.string().max(40),
  })
  .nullable()
  .catch(null);

const publishSchema = z.object({
  document: documentSchema,
  image: z.string().max(1_500_000).optional(),
  description: z.string().trim().max(1000).default(''),
  allowCopy: z.boolean().default(false),
  options: z
    .object({
      notes: z.boolean(),
      images: z.boolean(),
      excludedTypeIds: z.array(z.string().max(100)).max(500),
    })
    .loose(),
});

const reportSchema = z.object({
  motivo: z.string().refine(isReportReason, 'Motivo no válido'),
  texto: z.string().trim().max(500).default(''),
});

const listQuery = z.object({
  cuenta: z.string().regex(GUID, 'Cuenta no válida').optional(),
  limite: z.coerce.number().int().min(1).max(50).default(30),
});

/** La dirección de la imagen de un público (con la versión, para que no se quede la de antes en caché). */
const imageUrl = (publication: Publication, apiUrl: string) =>
  publication.hasImage ? `${apiUrl}/api/publicos/${publication.id}/imagen?v=${publication.version}` : null;
/** El enlace con vista previa para compartir fuera: lo sirve esta API y lleva a la página pública. */
const shareUrl = (publication: Publication, apiUrl: string) => `${apiUrl}/compartir/${publication.id}`;

/** Lo que la persona dueña ve de su publicación. */
const ownView = (publication: Publication, config: { webUrl: string; apiUrl: string }) => ({
  ...publication,
  url: publicUrl(config.webUrl, publication.id),
  shareUrl: shareUrl(publication, config.apiUrl),
  imageUrl: imageUrl(publication, config.apiUrl),
});

/** Lo que cualquiera ve de un público: nunca el proyecto privado ni el grupo del que sale. */
const publicSummary = <T extends Publication>(publication: T, apiUrl: string) =>
  omit({ ...publication, imageUrl: imageUrl(publication, apiUrl) }, [
    'projectId',
    'options',
    'retiredReason',
    'groupId',
  ]);

const notFound = () => new HttpError(404, 'publico_no_encontrado', 'Este proyecto ya no es público o no existe.');
const reportNotFound = () => new HttpError(404, 'denuncia_no_encontrada', 'La denuncia no existe.');

export const communityRoutes: FastifyPluginAsync<
  Pick<AppDependencies, 'community' | 'projects' | 'groups' | 'config'>
> = async (app, { community, projects, groups, config }) => {
  app.get('/publicaciones', async request => ({
    publicaciones: (await community.mine(authenticatedUser(request).id)).map(p => ownView(p, config)),
  }));

  // Sin publicar no es un error: `publicacion` llega a `null`.
  app.get('/projects/:id/publicacion', async request => {
    const { id } = projectParams.parse(request.params);
    const publication = await community.forProject(authenticatedUser(request).id, id);
    return { publicacion: publication ? ownView(publication, config) : null };
  });

  app.put('/projects/:id/publicacion', async request => {
    const { id } = projectParams.parse(request.params);
    const user = authenticatedUser(request);
    const body = publishSchema.parse(request.body);
    assertDocumentId(body.document, id);
    assertUnrestricted(user, PUBLISH_BLOCKING, 'publicacion_limitada', 'Tu cuenta tiene limitado publicar contenido.');
    // Un proyecto de grupo es del grupo: solo lo publica su propiedad. Uno propio, la persona dueña.
    const groupId = await groups.projectGroup(id);
    if (groupId) {
      const group = await groups.find(groupId);
      if (!group || group.owner !== user.globalId)
        throw new HttpError(403, 'solo_la_propiedad', 'Solo la propiedad del grupo puede publicar su proyecto.');
      if (!(await groups.getProject(groupId, id)))
        throw new HttpError(404, 'project_not_found', 'El proyecto del grupo aún no está en el servidor.');
    } else {
      const own = await projects.get(user.id, id);
      if (!own || own.document === null) {
        throw new HttpError(404, 'project_not_found', 'Sincroniza el proyecto con tu cuenta antes de publicarlo.');
      }
    }
    let image: Buffer | undefined;
    if (body.image !== undefined) {
      const bytes = imageBytes(body.image);
      if (!bytes)
        throw new HttpError(400, 'imagen_no_valida', 'La imagen tiene que ser un PNG o un JPEG de hasta 1 MB.');
      image = bytes;
    }
    const origin = originSchema.parse((body.document as { origin?: unknown }).origin ?? null);
    const serialized = serializeDocument(body.document, config.projectMaxBytes);

    const counts = countsOf(body.document);
    const result = await community.publish(
      user,
      id,
      {
        name: body.document.name,
        description: body.description,
        document: serialized,
        nodeCount: counts.nodes,
        relationCount: counts.relations,
        options: body.options,
        allowCopy: body.allowCopy,
        image,
        origin,
        groupId,
      },
      (publication, created) => {
        const news = created
          ? { externalId: `proyecto-${publication.id}`, kind: 'publicado' as const }
          : updateNews(publication.id, new Date(publication.publishedAt), new Date());
        return {
          channel: 'novedades',
          operation: 'publicar',
          externalId: news.externalId,
          payload: {
            cuenta: user.globalId,
            tipo: news.kind === 'publicado' ? 'proyecto.publicado' : 'proyecto.actualizado',
            idExterno: news.externalId,
            texto: newsText(news.kind, publication.name, counts),
            enlace: publicUrl(config.webUrl, publication.id),
            ...(publication.hasImage ? { imagen: imageUrl(publication, config.apiUrl) } : {}),
          },
        };
      },
    );
    if (result.status === 'retired') {
      throw new HttpError(
        409,
        'publicacion_retirada',
        'Este proyecto se retiró por moderación y no se puede actualizar.',
        {
          reason: result.publication.retiredReason,
        },
      );
    }
    return ownView(result.publication, config);
  });

  app.delete('/projects/:id/publicacion', async request => {
    const { id } = projectParams.parse(request.params);
    const removed = await community.unpublish(authenticatedUser(request).id, id);
    if (!removed) throw new HttpError(404, 'sin_publicar', 'Este proyecto no está publicado.');
    return { id: removed.id };
  });

  app.post('/publicos/:publicId/denuncias', async (request, reply) => {
    const { publicId } = publicParams.parse(request.params);
    const { motivo, texto } = reportSchema.parse(request.body);
    if (!isReportReason(motivo)) throw new HttpError(400, 'denuncia_no_valida', 'Motivo no válido.');
    const result = await community.report(
      publicId,
      authenticatedUser(request).globalId,
      motivo,
      texto,
      (report, publication) => ({
        channel: 'notificapp',
        operation: 'publicar',
        externalId: `report-${report.id}`,
        payload: reportEvent(report, publication, publicUrl(config.webUrl, publication.id)),
      }),
    );
    if (result.status !== 'created') {
      if (result.status === 'own')
        throw new HttpError(400, 'denuncia_propia', 'No puedes denunciar tu propio proyecto.');
      if (result.status === 'repeated')
        throw new HttpError(409, 'denuncia_repetida', 'Ya has denunciado este proyecto.');
      throw notFound();
    }
    return reply.status(201).send({ id: result.report.id });
  });
};

/** Lectura de los públicos, sin sesión: para poder compartir el enlace fuera. */
export const publicRoutes: FastifyPluginAsync<Pick<AppDependencies, 'community' | 'config'>> = async (
  app,
  { community, config },
) => {
  app.get('/publicos', async (request, reply) => {
    const { cuenta, limite } = listQuery.parse(request.query);
    reply.header('cache-control', 'no-store');
    return {
      publicos: (await community.listPublic({ author: cuenta?.toLowerCase(), limit: limite })).map(p =>
        publicSummary(p, config.apiUrl),
      ),
    };
  });

  app.get('/publicos/:publicId', async (request, reply) => {
    const { publicId } = publicParams.parse(request.params);
    const stored = await community.get(publicId);
    if (!stored || stored.state !== 'publico' || !stored.authorActive) throw notFound();
    reply.header('cache-control', 'no-store');
    const summary = omit(publicSummary(stored, config.apiUrl), ['document', 'authorActive']);
    return { ...summary, document: JSON.parse(stored.document) };
  });

  // La imagen del mapa, para la novedad, las tarjetas y la vista previa del enlace.
  app.get('/publicos/:publicId/imagen', async (request, reply) => {
    const { publicId } = publicParams.parse(request.params);
    const image = await community.image(publicId);
    if (!image) throw notFound();
    reply.header('content-type', imageType(image));
    reply.header('cache-control', 'public, max-age=300');
    return reply.send(image);
  });
};

const html = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * El enlace con vista previa (`/compartir/<id>`): una página mínima con los metadatos que leen las redes y
 * las apps de mensajería (título, descripción e imagen) que lleva enseguida a la página pública. La web la
 * sirve Firebase Hosting, que solo da archivos; por eso esta página la sirve la API.
 */
export const shareRoutes: FastifyPluginAsync<Pick<AppDependencies, 'community' | 'config'>> = async (
  app,
  { community, config },
) => {
  app.get('/compartir/:publicId', async (request, reply) => {
    const parsed = publicParams.safeParse(request.params);
    const stored = parsed.success ? await community.get(parsed.data.publicId) : null;
    const visible = stored && stored.state === 'publico' && stored.authorActive;
    const target = visible ? publicUrl(config.webUrl, stored.id) : config.webUrl;
    const title = visible ? `${stored.name} · Nodaria` : 'Nodaria';
    const description = visible
      ? stored.description ||
        `Un proyecto de Nodaria con ${stored.nodeCount} nodos y ${stored.relationCount} relaciones.`
      : 'Este proyecto ya no es público.';
    const image = visible ? imageUrl(stored, config.apiUrl) : null;
    reply
      .status(visible ? 200 : 404)
      .header('content-type', 'text/html; charset=utf-8')
      .header('cache-control', 'public, max-age=300')
      .header('content-security-policy', "default-src 'none'; img-src https:; style-src 'unsafe-inline'");
    return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${html(title)}</title>
<meta name="description" content="${html(description)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Nodaria">
<meta property="og:title" content="${html(title)}">
<meta property="og:description" content="${html(description)}">
<meta property="og:url" content="${html(target)}">
${image ? `<meta property="og:image" content="${html(image)}">\n<meta property="og:image:width" content="1200">\n<meta property="og:image:height" content="630">` : ''}
<meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}">
<meta http-equiv="refresh" content="0; url=${html(target)}">
<link rel="canonical" href="${html(target)}">
</head>
<body style="font-family: system-ui, sans-serif; padding: 2rem">
<p><a href="${html(target)}">${html(visible ? `Abrir «${stored.name}» en Nodaria` : 'Ir a Nodaria')}</a></p>
</body>
</html>`;
  });
};

const resolveSchema = z.object({
  note: z.string().trim().max(500).optional(),
  caso: z.string().trim().min(1).max(100).optional(),
  mensaje: z.string().trim().min(1).max(1000).optional(),
});

const reportParams = z.object({ id: z.coerce.number().int().positive() });

/**
 * Panel de moderación del plugin de Notificapp (`notificapp-plugin/`). Notificapp llama con la credencial
 * externa que el propietario le configura (`plugin_cli set-upstream-token`); sin ella guardada aquí, no
 * responde. Resolver es idempotente: repetir una acción (mismo `Idempotency-Key` o no) no cambia nada más.
 */
export const notificappRoutes: FastifyPluginAsync<
  Pick<AppDependencies, 'community' | 'communityClient' | 'config'>
> = async (app, { community, communityClient, config }) => {
  app.addHook('onRequest', async (request: FastifyRequest) => {
    const secret = await readToken(config.notificapp.upstreamTokenFile);
    const given = Buffer.from(bearerToken(request.headers.authorization) ?? '');
    const expected = Buffer.from(secret ?? '');
    if (!secret || given.length !== expected.length || !timingSafeEqual(given, expected)) {
      throw new HttpError(401, 'no_autorizado', 'Credencial de Notificapp no válida.');
    }
  });

  const describe = (report: ReportView) => ({
    ...report,
    reasonName: REPORT_REASONS[report.reason],
    url: publicUrl(config.webUrl, report.publicId),
  });

  app.get('/reports', async () => ({ reports: (await community.listReports(50)).map(describe) }));

  app.get('/reports/:id', async request => {
    const { id } = reportParams.parse(request.params);
    const report = await community.getReport(id);
    if (!report) throw reportNotFound();
    return { report: describe(report) };
  });

  app.get('/cases', async () => {
    try {
      return { cases: await communityClient.cases() };
    } catch (error) {
      throw new HttpError(502, 'plataforma_no_disponible', 'No se pudieron leer los casos de la plataforma.', {
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  });

  app.post('/reports/:id/retire', async request => {
    const { id } = reportParams.parse(request.params);
    const { note, caso, mensaje } = resolveSchema.parse(request.body ?? {});
    const result = await community.resolveReport(id, 'retirar', note ?? null);
    if (!result) throw reportNotFound();
    // El aviso a la cuenta es opcional y va después de retirar: si la plataforma falla, lo retirado se queda.
    let incident: string | null = null;
    if (caso && mensaje) {
      try {
        await communityClient.incident({
          cuenta: result.report.publication.author,
          caso,
          mensaje,
          idExterno: `report-${id}`,
          contexto: `Proyecto público «${result.report.publication.name}» retirado por una denuncia (${REPORT_REASONS[result.report.reason]}).`,
        });
        incident = 'registrado';
      } catch (error) {
        incident = error instanceof PlatformError ? `error: ${error.code}` : 'error';
      }
    }
    return { changed: result.changed, report: describe(result.report), incident };
  });

  app.post('/reports/:id/dismiss', async request => {
    const { id } = reportParams.parse(request.params);
    const { note } = resolveSchema.parse(request.body ?? {});
    const result = await community.resolveReport(id, 'desestimar', note ?? null);
    if (!result) throw reportNotFound();
    return { changed: result.changed, report: describe(result.report) };
  });
};
