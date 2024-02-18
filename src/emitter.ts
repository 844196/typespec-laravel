import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  type EmitContext,
  emitFile,
  getNamespaceFullName,
  ignoreDiagnostics,
  interpolatePath,
  listServices,
  resolvePath,
} from "@typespec/compiler";
import { Placeholder } from "@typespec/compiler/emitter-framework";
import { createMetadataInfo, getHttpService, reportIfNoRoutes, resolveRequestVisibility } from "@typespec/http";
import { pascalCase } from "change-case";
import { Eta } from "eta";
import type { EmitterOptions } from "./lib.js";
import { RuleEmitter } from "./rule-emitter.js";

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
  extra?: string[];
  nullable?: boolean;
};

export type FieldRule = {
  field: string;
  constraint: Constraint;
};

function toLaravelValidationRule(constraint: Constraint) {
  const rule = [];

  if (constraint.bail !== undefined) {
    rule.push("bail");
  }
  if (constraint.nullable !== undefined) {
    rule.push("nullable");
  }
  if (constraint.requirements !== undefined) {
    rule.push(constraint.requirements);
  }
  if (constraint.type !== undefined) {
    rule.push(constraint.type);
  }

  if (constraint.enum !== undefined) {
    rule.push(`in:${constraint.enum.join(",")}`);
  }

  if (constraint.minimum !== undefined) {
    rule.push(`min:${constraint.minimum}`);
  }
  if (constraint.maximum !== undefined) {
    rule.push(`max:${constraint.maximum}`);
  }
  if (constraint.minLength !== undefined) {
    rule.push(`min:${constraint.minLength}`);
  }
  if (constraint.maxLength !== undefined) {
    rule.push(`max:${constraint.maxLength}`);
  }
  if (constraint.minItems !== undefined) {
    rule.push(`min:${constraint.minItems}`);
  }
  if (constraint.maxItems !== undefined) {
    rule.push(`max:${constraint.maxItems}`);
  }

  if (constraint.format !== undefined) {
    rule.push(constraint.format);
  }
  if (constraint.pattern !== undefined) {
    rule.push(`regex:${constraint.pattern}`);
  }

  return `[${rule.map((v) => JSON.stringify(v)).join(",")}]`;
}

export async function $onEmit(context: EmitContext<EmitterOptions>) {
  if (context.program.compilerOptions.noEmit) {
    return;
  }

  const ruleEmitter = context.getAssetEmitter(RuleEmitter);

  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const eta = new Eta({ views: path.join(__dirname, "..", "templates") });

  const metadataInfo = createMetadataInfo(context.program);

  const services = listServices(context.program);
  if (services.length === 0) {
    services.push({ type: context.program.getGlobalNamespaceType() });
  }
  for (const service of services) {
    const httpService = ignoreDiagnostics(getHttpService(context.program, service.type));
    reportIfNoRoutes(context.program, httpService.operations);

    const phpNamespace = interpolatePath(
      (context.options.namespace ?? "Generated\\Http\\{service-name}\\Requests").replaceAll("\\", "/"),
      {
        "service-name": pascalCase(getNamespaceFullName(httpService.namespace)),
      },
    ).replaceAll("/", "\\");

    for (const op of httpService.operations) {
      const rules = new Map<string, string>();

      const phpClassName = interpolatePath(context.options["class-name"] ?? "{operation-id}Request", {
        "service-name": pascalCase(getNamespaceFullName(httpService.namespace)),
        "operation-id": pascalCase(op.operation.name),
      });

      const outputFile = interpolatePath(
        context.options["output-file"] ?? "generated/Http/{service-name}/Requests/{class-name}.php",
        {
          "service-name": pascalCase(getNamespaceFullName(httpService.namespace)),
          "class-name": phpClassName,
          "operation-id": pascalCase(op.operation.name),
        },
      );

      if (op.parameters.parameters) {
        for (const param of op.parameters.parameters) {
          if (param.type === "header") {
            continue;
          }

          if (param.type === "path") {
            // TODO: param.type === 'path' はデコレータが付いてたら除外
            // continue;
          }

          const effectiveType = metadataInfo.getEffectivePayloadType(
            param.param,
            resolveRequestVisibility(context.program, op.operation, op.verb),
          );

          const items = ruleEmitter.emitType(effectiveType);
          if (items.kind !== "code" || items.value instanceof Placeholder || !Array.isArray(items.value)) {
            continue;
          }
          const fieldRules = items.value as unknown as FieldRule[];
          for (const { field, constraint } of fieldRules) {
            rules.set(field, toLaravelValidationRule(constraint));
          }
        }
      }

      if (op.parameters.body) {
        const effectiveType = metadataInfo.getEffectivePayloadType(
          op.parameters.body.type,
          resolveRequestVisibility(context.program, op.operation, op.verb),
        );

        const items = ruleEmitter.emitType(effectiveType, {
          referenceContext: {
            bodyRequired: op.parameters.body.parameter ? !op.parameters.body.parameter.optional : true,
          },
        });
        if (items.kind !== "code" || items.value instanceof Placeholder || !Array.isArray(items.value)) {
          continue;
        }
        const fieldRules = items.value as unknown as FieldRule[];
        for (const { field, constraint } of fieldRules) {
          rules.set(field, toLaravelValidationRule(constraint));
        }
      }

      const rendered = eta.render("FormRequest", {
        namespace: phpNamespace,
        className: phpClassName,
        baseClass: interpolatePath(context.options["base-class"] ?? "\\Illuminate\\Foundation\\Http\\FormRequest", {
          "service-name": pascalCase(getNamespaceFullName(httpService.namespace)),
        }),
        // TODO
        // docTags: [["property-read", "\\App\\Models\\User", "$user"]],
        docTags: [],
        rules,
      });

      emitFile(context.program, {
        path: resolvePath(context.emitterOutputDir, outputFile),
        content: rendered,
      });
    }
  }
}
