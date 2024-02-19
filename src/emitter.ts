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
import { toLaravelValidationRule } from "./laravel.js";
import type { EmitterOptions } from "./lib.js";
import { RuleEmitter } from "./rule-emitter.js";
import type { FieldRule } from "./types.js";

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
