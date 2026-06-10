import type { IMetrics } from './interfaces/IMetrics';

// Namespace das métricas customizadas (§20). CONTRATO com a infra: precisa ser
// idêntico a `local.metrics_namespace` em infra/locals.tf, pois os alarmes do
// infra/cloudwatch.tf consultam as métricas exatamente neste namespace.
const METRICS_NAMESPACE = 'BoticarioSyncHub';

/**
 * Emite métricas no formato EMF (Embedded Metric Format): um JSON com envelope
 * `_aws` no stdout. O driver `awslogs` do Fargate o entrega ao CloudWatch Logs,
 * que extrai a métrica automaticamente — sem PutMetricData, sem IAM extra.
 */
export class EmfMetrics implements IMetrics {
  count(metricName: string, value = 1): void {
    const document = {
      _aws: {
        Timestamp: Date.now(),
        CloudWatchMetrics: [
          {
            Namespace: METRICS_NAMESPACE,
            Dimensions: [[]],
            Metrics: [{ Name: metricName, Unit: 'Count' }],
          },
        ],
      },
      [metricName]: value,
    };
    console.log(JSON.stringify(document));
  }
}

export class NoopMetrics implements IMetrics {
  count(): void {}
}

export const metrics: IMetrics = new EmfMetrics();
export const noopMetrics: IMetrics = new NoopMetrics();
