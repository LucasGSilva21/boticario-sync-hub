export interface IMetrics {
  count(metricName: string, value?: number): void;
}
