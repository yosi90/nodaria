import type { FastifyPluginAsync } from 'fastify';
import type { AppDependencies } from '../app.ts';
import { authenticatedUser, HttpError } from '../auth/plugin.ts';

// Borrar la cuenta exige un inicio de sesión como mucho así de antiguo.
export const RECENT_LOGIN_MS = 5 * 60 * 1000;

export const meRoutes: FastifyPluginAsync<Pick<AppDependencies, 'auth' | 'users' | 'config'>> = async (
  app,
  { auth, users, config },
) => {
  app.get('/me', async request => {
    const user = authenticatedUser(request);
    return {
      id: user.id,
      email: user.email,
      emailVerified: user.emailVerified,
      displayName: user.displayName,
      photoUrl: user.photoUrl,
      signInProvider: user.identity.signInProvider,
      createdAt: user.createdAt,
      lastSeenAt: user.lastSeenAt,
      // Solo el booleano de la sesión actual: la lista de cuentas no sale del servidor.
      excludeFromStats: config.ownerFirebaseUids.includes(user.firebaseUid),
    };
  });

  app.delete('/me', async (request, reply) => {
    const user = authenticatedUser(request);

    if (Date.now() - user.identity.authTime.getTime() > RECENT_LOGIN_MS) {
      throw new HttpError(
        403,
        'recent_login_required',
        'Por seguridad, vuelve a iniciar sesión antes de borrar la cuenta.',
      );
    }

    // La cuenta de Firebase se borra dentro de la transacción SQL: si Firebase falla, no se pierde nada.
    await users.delete(user.id, () => auth.deleteUser(user.firebaseUid));
    request.log.info({ userId: user.id }, 'Cuenta borrada');
    return reply.status(204).send();
  });
};
