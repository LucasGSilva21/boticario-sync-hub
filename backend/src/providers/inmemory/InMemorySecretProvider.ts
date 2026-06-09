import type {
  ISecretProvider,
  SaaSCredentials,
} from '../interfaces/ISecretProvider';

/** Provedor de segredo em memória (demo): credenciais fixas, sem Secrets Manager. */
export class InMemorySecretProvider implements ISecretProvider {
  constructor(private readonly credentials: SaaSCredentials) {}

  getSaaSCredentials(): Promise<SaaSCredentials> {
    return Promise.resolve(this.credentials);
  }
}
