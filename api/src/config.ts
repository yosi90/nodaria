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
  FIREBASE_PROJECT_ID: z.string().default('yosiftware-nodaria'),
  PROJECT_MAX_BYTES: z.coerce
    .number()
    .int()
    .min(64 * 1024)
    .default(20 * 1024 * 1024),
  NOTIFICAPP_URL: z.string().url().default('https://notificapp-api.yosiftware.es'),
  NOTIFICAPP_SENDER_TOKEN_FILE: z.string().default('.runtime/notificapp-sender.token'),
  NOTIFICAPP_UPSTREAM_TOKEN_FILE: z.string().default('.runtime/notificapp-upstream.token'),
  // Con valor, los logs van a archivos diarios en esa carpeta en lugar de a la salida estándar.
  LOG_DIR: z.string().optional(),
});

export type AppConfig = ReturnType<typeof loadConfig>;

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
    firebaseProjectId: value.FIREBASE_PROJECT_ID,
    projectMaxBytes: value.PROJECT_MAX_BYTES,
    notificapp: {
      url: value.NOTIFICAPP_URL,
      senderTokenFile: value.NOTIFICAPP_SENDER_TOKEN_FILE,
      upstreamTokenFile: value.NOTIFICAPP_UPSTREAM_TOKEN_FILE,
    },
    logDir: value.LOG_DIR,
  };
}
