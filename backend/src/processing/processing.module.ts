import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { config } from '../config';
import { Invoice } from '../database/entities';
import { AgentClient } from './agent.types';
import { HttpAgentClient } from './http-agent.client';
import { ProcessingService } from './processing.service';
import { StubAgentClient } from './stub/stub-agent.client';

@Module({
  imports: [TypeOrmModule.forFeature([Invoice])],
  providers: [
    { provide: AgentClient, useClass: config.agentMode() === 'http' ? HttpAgentClient : StubAgentClient },
    ProcessingService,
  ],
  exports: [ProcessingService],
})
export class ProcessingModule {}
