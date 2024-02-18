import { type JSONSchemaType, createTypeSpecLibrary } from "@typespec/compiler";

export type EmitterOptions = {
  namespace?: string;
  "class-name"?: string;
  "output-file"?: string;
  "base-class"?: string;
};

const EmitterOptionsSchema: JSONSchemaType<EmitterOptions> = {
  type: "object",
  additionalProperties: false,
  properties: {
    namespace: {
      type: "string",
      nullable: true,
      default: "Generated\\Http\\{service-name}\\Requests",
    },
    "class-name": {
      type: "string",
      nullable: true,
      default: "{operation-id}Request",
    },
    "output-file": {
      type: "string",
      nullable: true,
      default: "generated/Http/{service-name}/Requests/{class-name}.php",
    },
    "base-class": {
      type: "string",
      nullable: true,
      default: "\\Illuminate\\Foundation\\Http\\FormRequest",
    },
  },
  required: [],
};

export const $lib = createTypeSpecLibrary({
  name: "@efumaxay/laravel-typespec",
  diagnostics: {},
  emitter: {
    options: EmitterOptionsSchema,
  },
});

export const { reportDiagnostic, createDiagnostic, createStateSymbol } = $lib;
