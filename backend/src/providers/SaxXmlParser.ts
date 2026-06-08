import { SaxesParser } from 'saxes';
import type { Readable } from 'node:stream';
import type { IXmlParser, ParsedEmployee } from './interfaces/IXmlParser';

/**
 * Parser de XML em streaming via `saxes`. Liga o parser SAX (push, baseado em
 * eventos) a um AsyncIterable (pull): a cada chunk lido do stream, os eventos
 * SAX preenchem um buffer que é drenado via `yield*`, gerando backpressure
 * natural (só lê o próximo chunk após o consumidor puxar os colaboradores).
 */
export class SaxXmlParser implements IXmlParser {
  async *parse(stream: Readable): AsyncGenerator<ParsedEmployee> {
    const parser = new SaxesParser();
    const buffer: ParsedEmployee[] = [];
    let current: Record<string, string> | undefined;
    let text = '';
    let error: Error | undefined;

    parser.on('error', (e) => {
      error = e;
    });

    parser.on('opentag', (node) => {
      if (node.name === 'employee') {
        current = {};
      }
      text = '';
    });

    parser.on('text', (chunk) => {
      text += chunk;
    });

    parser.on('closetag', (node) => {
      if (current === undefined) {
        return; // fora de um <employee> (ex.: raiz <employees>)
      }
      if (node.name === 'employee') {
        const employee = toEmployee(current);
        if (employee === undefined) {
          error = new Error('Invalid <employee>: missing required field(s)');
        } else {
          buffer.push(employee);
        }
        current = undefined;
      } else {
        current[node.name] = text.trim();
      }
    });

    for await (const data of stream as AsyncIterable<Buffer>) {
      parser.write(data.toString('utf8'));
      if (error) {
        throw error;
      }
      yield* buffer.splice(0);
    }

    parser.close();
    if (error) {
      throw error;
    }
    yield* buffer.splice(0);
  }
}

function toEmployee(
  fields: Record<string, string>,
): ParsedEmployee | undefined {
  const { employeeId, name, department, position } = fields;
  if (
    employeeId === undefined ||
    name === undefined ||
    department === undefined ||
    position === undefined
  ) {
    return undefined;
  }
  return { employeeId, data: { name, department, position } };
}
