import { sleep } from '../../utils/sleep';

export interface StubFetchOptions {
  /** As primeiras N chamadas retornam 503 (simula instabilidade do parceiro). */
  failFirst?: number;
  /** Latência simulada por chamada, em ms. */
  latencyMs?: number;
}

/**
 * Cria um `fetch` falso que simula a API do SaaS, para injetar no
 * `SaaSHttpClient` real na demo local — exercitando backoff, rate limit e
 * Circuit Breaker de verdade, sem rede.
 */
export function createStubSaaSFetch(
  options: StubFetchOptions = {},
): typeof fetch {
  const { failFirst = 0, latencyMs = 0 } = options;
  let calls = 0;

  const stub = async (): Promise<Response> => {
    calls += 1;
    if (latencyMs > 0) {
      await sleep(latencyMs);
    }
    const status = calls <= failFirst ? 503 : 200;
    return new Response(JSON.stringify({ accepted: status === 200 }), {
      status,
    });
  };

  return stub;
}
