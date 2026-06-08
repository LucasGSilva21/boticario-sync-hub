import { Readable } from 'node:stream';
import { SaxXmlParser } from '../../../src/providers/SaxXmlParser';
import type { ParsedEmployee } from '../../../src/providers/interfaces/IXmlParser';

async function collect(
  iter: AsyncIterable<ParsedEmployee>,
): Promise<ParsedEmployee[]> {
  const out: ParsedEmployee[] = [];
  for await (const employee of iter) {
    out.push(employee);
  }
  return out;
}

const emp1 =
  '<employee><employeeId>1</employeeId><name>Ana</name><department>Tech</department><position>Dev</position></employee>';
const emp2 =
  '<employee><employeeId>2</employeeId><name>Bob</name><department>Sales</department><position>Rep</position></employee>';

describe('SaxXmlParser', () => {
  it('parses multiple employees across multiple chunks', async () => {
    const stream = Readable.from([
      Buffer.from(`<employees>${emp1}`),
      Buffer.from(`${emp2}</employees>`),
    ]);
    const result = await collect(new SaxXmlParser().parse(stream));
    expect(result).toEqual([
      {
        employeeId: '1',
        data: { name: 'Ana', department: 'Tech', position: 'Dev' },
      },
      {
        employeeId: '2',
        data: { name: 'Bob', department: 'Sales', position: 'Rep' },
      },
    ]);
  });

  it('trims whitespace and ignores formatting between tags', async () => {
    const xml = `
      <employees>
        <employee>
          <employeeId>  42  </employeeId>
          <name>Lucas Silva</name>
          <department>Technology</department>
          <position>Software Engineer</position>
        </employee>
      </employees>`;
    const stream = Readable.from([Buffer.from(xml)]);
    const result = await collect(new SaxXmlParser().parse(stream));
    expect(result).toEqual([
      {
        employeeId: '42',
        data: {
          name: 'Lucas Silva',
          department: 'Technology',
          position: 'Software Engineer',
        },
      },
    ]);
  });

  it.each([
    [
      'employeeId',
      '<employee><name>Ana</name><department>Tech</department><position>Dev</position></employee>',
    ],
    [
      'name',
      '<employee><employeeId>1</employeeId><department>Tech</department><position>Dev</position></employee>',
    ],
    [
      'department',
      '<employee><employeeId>1</employeeId><name>Ana</name><position>Dev</position></employee>',
    ],
    [
      'position',
      '<employee><employeeId>1</employeeId><name>Ana</name><department>Tech</department></employee>',
    ],
  ])('throws when <employee> is missing %s', async (_field, employeeXml) => {
    const stream = Readable.from([
      Buffer.from(`<employees>${employeeXml}</employees>`),
    ]);
    await expect(collect(new SaxXmlParser().parse(stream))).rejects.toThrow(
      'missing required field',
    );
  });

  it('throws on malformed XML (error during write)', async () => {
    const stream = Readable.from([
      Buffer.from('<employees><employee></wrong></employees>'),
    ]);
    await expect(collect(new SaxXmlParser().parse(stream))).rejects.toThrow();
  });

  it('throws on truncated XML (error detected at close)', async () => {
    const stream = Readable.from([
      Buffer.from('<employees><employee><employeeId>1</employeeId>'),
    ]);
    await expect(collect(new SaxXmlParser().parse(stream))).rejects.toThrow();
  });
});
