/** Resposta não-2xx do SaaS. 5xx é transitório; 4xx é permanente. */
export class SaaSRequestError extends Error {
  constructor(readonly status: number) {
    super(`SaaS request failed with status ${status}`);
    this.name = 'SaaSRequestError';
  }
}
