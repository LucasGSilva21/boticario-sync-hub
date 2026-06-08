import type { Readable } from 'node:stream';
import type { EmployeeData } from '../../types/employee.types';

export interface ParsedEmployee {
  employeeId: string;
  data: EmployeeData;
}

export interface IXmlParser {
  parse(stream: Readable): AsyncIterable<ParsedEmployee>;
}
