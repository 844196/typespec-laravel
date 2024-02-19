import {
  type DecoratorContext,
  type Model,
  type Program,
  type StringLiteral,
  type Type,
  setTypeSpecNamespace,
} from "@typespec/compiler";
import { createStateSymbol } from "./lib.js";
import type { CustomRule } from "./types.js";

export const namespace = "Laravel";

const dateFormatKey = createStateSymbol("dateFormat");
const customRuleKey = createStateSymbol("customRule");

export function $dateFormat(context: DecoratorContext, target: Type, format: string) {
  context.program.stateMap(dateFormatKey).set(target, format);
}

export function getDateFormat(program: Program, target: Type): string | undefined {
  return program.stateMap(dateFormatKey).get(target);
}

export function $customRule(context: DecoratorContext, target: Type, given: StringLiteral | Model) {
  let exists = context.program.stateMap(customRuleKey).get(target);
  if (exists === undefined) {
    exists = [];
  }

  let rule: string | { raw: string } | undefined;
  if (given.kind === "String") {
    rule = given.value;
  } else {
    const raw = given.properties.get("raw")?.type;
    if (raw?.kind === "String") {
      rule = {
        raw: raw.value,
      };
    }
  }

  if (rule !== undefined) {
    context.program.stateMap(customRuleKey).set(target, [...exists, rule]);
  }
}

export function getCustomRules(program: Program, target: Type): CustomRule[] {
  return program.stateMap(customRuleKey).get(target) ?? [];
}

setTypeSpecNamespace("Validation", $dateFormat);
setTypeSpecNamespace("Validation", $customRule);
