import { Injectable, Logger } from '@nestjs/common';
import { config } from '../config';
import { AgentClient, AgentError, AgentRequest, AgentResult } from './agent.types';

@Injectable()
export class HttpAgentClient extends AgentClient {
  private readonly logger = new Logger(HttpAgentClient.name);

  async process(req: AgentRequest): Promise<AgentResult> {
    let res: Response;
    try {
      res = await fetch(`${config.agentUrl().replace(/\/$/, '')}/process`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(req),
        signal: AbortSignal.timeout(config.agentTimeoutMs()),
      });
    } catch (e) {
      this.logger.error(`Agent tidak dapat dihubungi: ${(e as Error).message}`);
      const timedOut = (e as Error).name === 'TimeoutError' || (e as Error).name === 'AbortError';
      throw new AgentError(timedOut ? 'Pemrosesan melebihi batas waktu.' : 'Agent tidak dapat dihubungi.');
    }
    if (!res.ok) {
      let msg = 'Agent gagal memproses berkas.';
      try {
        const body = (await res.json()) as { error?: { message?: string } };
        if (body?.error?.message) msg = body.error.message;
      } catch {
        /* abaikan: pakai pesan bawaan */
      }
      throw new AgentError(msg);
    }
    return (await res.json()) as AgentResult;
  }
}
