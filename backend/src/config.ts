/** Konfigurasi dari environment. Nilai bawaan cukup untuk pengembangan lokal. */
const int = (v: string | undefined, d: number) => (v && !Number.isNaN(Number(v)) ? Number(v) : d);

export const config = {
  port: () => int(process.env.PORT, 3000),
  databaseUrl: () => process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/invoice_agent',
  dbSync: () => process.env.DB_SYNC !== 'false', // bangun tabel otomatis (cukup untuk lomba)
  jwtSecret: () => process.env.JWT_SECRET ?? 'ganti-rahasia-ini',
  jwtExpiresInSec: () => int(process.env.JWT_EXPIRES_IN_SEC, 8 * 60 * 60),
  uploadDir: () => process.env.UPLOAD_DIR ?? './storage',
  maxFilesPerBatch: () => int(process.env.MAX_FILES_PER_BATCH, 50),
  maxFileSizeMb: () => int(process.env.MAX_FILE_SIZE_MB, 10),
  concurrency: () => int(process.env.PROCESSING_CONCURRENCY, 3),
  agentMode: () => (process.env.AGENT_MODE === 'http' ? 'http' : 'stub') as 'http' | 'stub',
  agentUrl: () => process.env.AGENT_URL ?? 'http://localhost:8000',
  agentTimeoutMs: () => int(process.env.AGENT_TIMEOUT_MS, 120_000),
  stubDelayMs: () => int(process.env.STUB_DELAY_MS, 4000),
  demoPassword: () => process.env.DEMO_PASSWORD ?? 'demo12345',
  /** Origin yang diizinkan CORS (dipisah koma). Kosong = izinkan semua (cukup untuk penjurian). */
  corsOrigins: () =>
    (process.env.CORS_ORIGINS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  openapiPath: () => process.env.OPENAPI_PATH ?? '../docs/api/openapi.yaml',
};
