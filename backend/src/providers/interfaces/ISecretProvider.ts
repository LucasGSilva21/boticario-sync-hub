export interface SaaSCredentials {
  baseUrl: string;
  apiKey: string;
}

export interface ISecretProvider {
  getSaaSCredentials(): Promise<SaaSCredentials>;
}
