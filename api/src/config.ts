import { z } from 'zod';

const csv = z
  .string()
  .default('')
  .transform(value =>
    value
      .split(',')
      .map(item => item.trim())
      .filter(Boolean),
  );

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(5003),
  DB_SERVER: z.string().default('localhost\\SQLEXPRESS'),
  DB_NAME: z
    .string()
    .regex(/^[A-Za-z][A-Za-z0-9_]*$/, 'DB_NAME solo admite letras, números y _')
    .default('Nodaria'),
  DB_DRIVER: z.string().default('ODBC Driver 18 for SQL Server'),
  CORS_ORIGINS: csv,
  PROJECT_MAX_BYTES: z.coerce
    .number()
    .int()
    .min(64 * 1024)
    .default(20 * 1024 * 1024),
  // Plataforma Yosiftware (ecosistema-kit): entorno del emisor de los tokens y audiencia de esta API.
  PLATFORM_ENV: z.enum(['produccion', 'qa', 'desarrollo']).default('produccion'),
  PLATFORM_AUDIENCE: z.string().default('nodaria-api'),
  // Credencial de servicio de la web (solo el token, fuera de Git) para leer el feed de cambios.
  PLATFORM_SERVICE_TOKEN_FILE: z.string().default('.runtime/plataforma.token'),
  // Cada cuánto se lee el feed sin aviso de NATS (ecosistema-kit/FEED_DE_CAMBIOS.md: 5 minutos bastan).
  PLATFORM_FEED_INTERVAL_MS: z.coerce
    .number()
    .int()
    .min(10_000)
    .default(5 * 60 * 1000),
  // Con valor, los logs van a archivos diarios en esa carpeta en lugar de a la salida estándar.
  LOG_DIR: z.string().optional(),
});

export type AppConfig = ReturnType<typeof loadConfig>;
export type PlatformEnv = z.infer<typeof envSchema>['PLATFORM_ENV'];

/** API de la plataforma de cada entorno (`ecosistema-kit/ACCESO.md`). */
export const PLATFORM_API: Record<PlatformEnv, string> = {
  produccion: 'https://cuentas-api.yosiftware.es',
  qa: 'https://qa-cuentas-api.yosiftware.es',
  desarrollo: 'http://localhost:5206',
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const parsed = envSchema.safeParse(env);

  if (!parsed.success) {
    const details = parsed.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; ');
    throw new Error(`Configuración inválida: ${details}`);
  }

  const value = parsed.data;
  return {
    env: value.NODE_ENV,
    host: value.HOST,
    port: value.PORT,
    db: {
      server: value.DB_SERVER,
      database: value.DB_NAME,
      driver: value.DB_DRIVER,
    },
    corsOrigins: value.CORS_ORIGINS,
    projectMaxBytes: value.PROJECT_MAX_BYTES,
    platform: {
      env: value.PLATFORM_ENV,
      api: PLATFORM_API[value.PLATFORM_ENV],
      audience: value.PLATFORM_AUDIENCE,
      serviceTokenFile: value.PLATFORM_SERVICE_TOKEN_FILE,
      feedIntervalMs: value.PLATFORM_FEED_INTERVAL_MS,
      // El feed solo se lee fuera de las pruebas.
      feedEnabled: value.NODE_ENV !== 'test',
    },
    logDir: value.LOG_DIR,
  };
}
