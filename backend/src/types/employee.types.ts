export type FlowType = 'UPSERT' | 'TERMINATION';

export type EmployeeData = {
  name: string;
  department: string;
  position: string;
};

export type EmployeeUpsertEvent = {
  employeeId: string;
  eventType: 'UPSERT';
  eventTimestamp: string;
  data: EmployeeData;
};

export type TerminationEvent = {
  employeeId: string;
  eventType: 'TERMINATION';
  eventTimestamp: string;
};

export type EmployeeEvent = EmployeeUpsertEvent | TerminationEvent;
