import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { config } from '../config';
import { Setting, User } from '../database/entities';
import { resetSettings, seedMaster, seedUsers } from './master-data';

/** Mengisi data awal bila database masih kosong (matikan dengan AUTO_SEED=false). */
@Injectable()
export class SeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Setting) private readonly settings: Repository<Setting>,
  ) {}

  async onApplicationBootstrap() {
    if (process.env.AUTO_SEED === 'false') return;
    if ((await this.users.count()) > 0) return;
    this.logger.log('Database kosong: mengisi akun demo dan data master sintetis.');
    await this.users.manager.transaction(async (em) => {
      await seedUsers(em, config.demoPassword());
      await seedMaster(em);
      await resetSettings(em);
    });
  }
}
