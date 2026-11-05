import 'dotenv/config';
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { config } from '../config';
import { ALL_ENTITIES } from '../database/entities';
import { resetSettings, seedMaster, seedUsers } from './master-data';

/** npm run db:seed : mengisi ulang data master dan membuat akun demo yang belum ada. */
async function main() {
  const ds = new DataSource({ type: 'postgres', url: config.databaseUrl(), entities: ALL_ENTITIES, synchronize: config.dbSync() });
  await ds.initialize();
  await ds.transaction(async (em) => {
    await seedUsers(em, config.demoPassword());
    await seedMaster(em);
    await resetSettings(em);
  });
  await ds.destroy();
  console.log('Seed selesai: akun demo, data master sintetis, dan pengaturan bawaan.');
}
main().catch((e) => { console.error(e); process.exit(1); });
