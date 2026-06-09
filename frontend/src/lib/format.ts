// Formatação pura para o dashboard. Locale pt-BR; tempo em UTC para
// determinismo (os timestamps do log §19 vêm em UTC, sufixo 'Z').

const numberFormatter = new Intl.NumberFormat('pt-BR');

const percentFormatter = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const timeFormatter = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'UTC',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

/** Formata inteiros com separador de milhar (ex.: 30000 → "30.000"). */
export function formatNumber(value: number): string {
  return numberFormatter.format(value);
}

/** Percentual de `part` sobre `total`, com 1 casa (ex.: 42/59 → "71,2%").
 *  Retorna "0%" quando `total` é zero (evita divisão por zero). */
export function formatPercent(part: number, total: number): string {
  if (total <= 0) {
    return '0%';
  }
  return `${percentFormatter.format((part / total) * 100)}%`;
}

/** Extrai HH:MM:SS (UTC) de um timestamp ISO (ex.: "...T17:04:01.642Z" → "17:04:01"). */
export function formatTime(isoTimestamp: string): string {
  return timeFormatter.format(new Date(isoTimestamp));
}
