import { type JSONSchemaType, createTypeSpecLibrary } from "@typespec/compiler";

const EmitterDefaultOptions = {
  namespace: "Generated\\Http\\{service-name}\\Requests",
  "class-name": "{operation-id}Request",
  "output-file": "generated/Http/{service-name}/Requests/{class-name}.php",
  "base-class": "\\Illuminate\\Foundation\\Http\\FormRequest",
} as const;

export type EmitterOptions = Partial<Record<keyof typeof EmitterDefaultOptions, string>>;

const EmitterOptionsSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    namespace: {
      type: "string",
      nullable: true,
      default: EmitterDefaultOptions.namespace,
    },
    "class-name": {
      type: "string",
      nullable: true,
      default: EmitterDefaultOptions["class-name"],
    },
    "output-file": {
      type: "string",
      nullable: true,
      default: EmitterDefaultOptions["output-file"],
    },
    "base-class": {
      type: "string",
      nullable: true,
      default: EmitterDefaultOptions["base-class"],
    },
  },
  required: [],
} as const satisfies JSONSchemaType<EmitterOptions>;

export const $lib = createTypeSpecLibrary({
  name: "@efumaxay/laravel-typespec",
  diagnostics: {},
  emitter: {
    options: EmitterOptionsSchema,
  },
});

export const { reportDiagnostic, createDiagnostic, createStateSymbol } = $lib;
