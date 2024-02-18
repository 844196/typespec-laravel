import { type DecoratorContext, type Program, type Type, setTypeSpecNamespace } from "@typespec/compiler";
import { createStateSymbol } from "./lib.js";

export const namespace = "Laravel";

const dateFormatKey = createStateSymbol("dateFormat");
export function $dateFormat(context: DecoratorContext, target: Type, format: string) {
  context.program.stateMap(dateFormatKey).set(target, format);
}
setTypeSpecNamespace("Validation", $dateFormat);

export function getDateFormat(program: Program, target: Type): string | undefined {
  return program.stateMap(dateFormatKey).get(target);
}
