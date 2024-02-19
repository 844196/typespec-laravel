export type RawCustomRule = { raw: string };
export type CustomRule = string | RawCustomRule;

export type Constraint = {
  bail?: boolean;
  requirements?: string;
  type?: string;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  minItems?: number;
  maxItems?: number;
  format?: string;
  pattern?: string;
  enum?: Array<boolean | string | number>;
  customRules?: CustomRule[];
  nullable?: boolean;
};

export type FieldRule = {
  field: string;
  constraint: Constraint;
};
