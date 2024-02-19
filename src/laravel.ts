import type { Constraint } from "./types.js";

export function toLaravelValidationRule(constraint: Constraint) {
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

  if (constraint.customRules !== undefined) {
    rule.push(...constraint.customRules);
  }

  return `[${rule.map((v) => (typeof v === "string" ? JSON.stringify(v) : v.raw)).join(",")}]`;
}
