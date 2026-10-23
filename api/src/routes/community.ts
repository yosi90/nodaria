import { timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { AppDependencies } from '../app.ts';
import { authenticatedUser, HttpError } from '../auth/plugin.ts';
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
import { PUBLIC_ID, type Publication, type ReportView } from '../community/repository.ts';
import { PlatformError } from '../platform/spaces.ts';
import { documentSchema, PROJECT_ID } from './projects.ts';

/*
 * Proyectos públicos (docs/roadmaps/ROADMAP_COMUNIDAD.md). Publicar sube una copia de solo lectura que la
 * API nunca deja cambiar a nadie más; leerla no pide sesión. Las novedades salen por la cola de salida
 * después de confirmar la transacción.
 */

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const projectParams = z.object({ id: z.string().regex(PROJECT_ID, 'Identificador de proyecto no válido') });
const publicParams = z.object({ publicId: z.string().regex(PUBLIC_ID, 'Identificador público no válido') });

const publishSchema = z.object({
  document: documentSchema,
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

/** Lo que la persona dueña ve de su publicación. */
const ownView = (publication: Publication, webUrl: string) => ({
  ...publication,
  url: publicUrl(webUrl, publication.id),
});

/** Lo que cualquiera ve de un público: nunca el proyecto privado del que sale. */
function publicSummary(publication: Publication) {
  const summary: Partial<Publication> = { ...publication };
  delete summary.projectId;
  delete summary.options;
  delete summary.retiredReason;
  return summary;
}

const notFound = () => new HttpError(404, 'publico_no_encontrado', 'Este proyecto ya no es público o no existe.');

export const communityRoutes: FastifyPluginAsync<
  Pick<AppDependencies, 'community' | 'projects' | 'groups' | 'config'>
> = async (app, { community, projects, groups, config }) => {
  app.get('/publicaciones', async request => ({
    publicaciones: (await community.mine(authenticatedUser(request).id)).map(p => ownView(p, config.webUrl)),
  }));

  // Sin publicar no es un error: `publicacion` llega a `null`.
  app.get('/projects/:id/publicacion', async request => {
    const { id } = projectParams.parse(request.params);
    const publication = await community.forProject(authenticatedUser(request).id, id);
    return { publicacion: publication ? ownView(publication, config.webUrl) : null };
  });

  app.put('/projects/:id/publicacion', async request => {
    const { id } = projectParams.parse(request.params);
    const user = authenticatedUser(request);
    const body = publishSchema.parse(request.body);
    if (body.document.id !== id) {
      throw new HttpError(400, 'project_id_mismatch', 'El identificador del documento no coincide con la ruta.');
    }
    const blocked = user.identity.restrictions.filter(r => PUBLISH_BLOCKING.includes(r));
    if (blocked.length) {
      throw new HttpError(403, 'publicacion_limitada', 'Tu cuenta tiene limitado publicar contenido.', {
        hasta: user.identity.restrictionsUntil?.toISOString() ?? null,
      });
    }
    // De momento solo se publican los proyectos propios (decisión del roadmap, revisable).
    if (await groups.projectGroup(id)) {
      throw new HttpError(409, 'proyecto_de_grupo', 'Los proyectos de un grupo todavía no se pueden publicar.');
    }
    const own = await projects.get(user.id, id);
    if (!own || own.document === null) {
      throw new HttpError(404, 'project_not_found', 'Sincroniza el proyecto con tu cuenta antes de publicarlo.');
    }
    const serialized = JSON.stringify(body.document);
    if (Buffer.byteLength(serialized, 'utf8') > config.projectMaxBytes) {
      throw new HttpError(413, 'project_too_large', 'El proyecto supera el tamaño máximo admitido.', {
        maxBytes: config.projectMaxBytes,
      });
    }

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
    return ownView(result.publication, config.webUrl);
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
export const publicRoutes: FastifyPluginAsync<Pick<AppDependencies, 'community'>> = async (app, { community }) => {
  app.get('/publicos', async (request, reply) => {
    const { cuenta, limite } = listQuery.parse(request.query);
    reply.header('cache-control', 'no-store');
    return {
      publicos: (await community.listPublic({ author: cuenta?.toLowerCase(), limit: limite })).map(publicSummary),
    };
  });

  app.get('/publicos/:publicId', async (request, reply) => {
    const { publicId } = publicParams.parse(request.params);
    const stored = await community.get(publicId);
    if (!stored || stored.state !== 'publico' || !stored.authorActive) throw notFound();
    reply.header('cache-control', 'no-store');
    const summary: Partial<typeof stored> = publicSummary(stored);
    delete summary.document;
    delete summary.authorActive;
    return { ...summary, document: JSON.parse(stored.document) };
  });
};

const resolveSchema = z.object({
  note: z.string().trim().max(500).optional(),
  caso: z.string().trim().min(1).max(100).optional(),
  mensaje: z.string().trim().min(1).max(1000).optional(),
});

const reportParams = z.object({ id: z.coerce.number().int().positive() });

async function readSecret(file: string) {
  try {
    return (await readFile(file, 'utf8')).trim();
  } catch {
    return '';
  }
}

/**
 * Panel de moderación del plugin de Notificapp (`notificapp-plugin/`). Notificapp llama con la credencial
 * externa que el propietario le configura (`plugin_cli set-upstream-token`); sin ella guardada aquí, no
 * responde. Resolver es idempotente: repetir una acción (mismo `Idempotency-Key` o no) no cambia nada más.
 */
export const notificappRoutes: FastifyPluginAsync<
  Pick<AppDependencies, 'community' | 'communityClient' | 'config'>
> = async (app, { community, communityClient, config }) => {
  app.addHook('onRequest', async (request: FastifyRequest) => {
    const secret = await readSecret(config.notificapp.upstreamTokenFile);
    const match = /^Bearer\s+(\S+)$/i.exec(request.headers.authorization ?? '');
    const given = Buffer.from(match?.[1] ?? '');
    const expected = Buffer.from(secret);
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
    if (!report) throw new HttpError(404, 'denuncia_no_encontrada', 'La denuncia no existe.');
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
    if (!result) throw new HttpError(404, 'denuncia_no_encontrada', 'La denuncia no existe.');
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
    if (!result) throw new HttpError(404, 'denuncia_no_encontrada', 'La denuncia no existe.');
    return { changed: result.changed, report: describe(result.report) };
  });
};
