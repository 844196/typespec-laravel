import {
  type BooleanLiteral,
  type Enum,
  type EnumMember,
  type IntrinsicScalarName,
  type Model,
  type ModelProperty,
  type NumericLiteral,
  type Program,
  type Scalar,
  type StringLiteral,
  type Type,
  type Union,
  type UnionVariant,
  getFormat,
  getMaxItems,
  getMaxLength,
  getMaxValue,
  getMinItems,
  getMinLength,
  getMinValue,
  getPattern,
  isArrayModelType,
  isNullType,
} from "@typespec/compiler";
import { type EmitterOutput, Placeholder, TypeEmitter } from "@typespec/compiler/emitter-framework";
import { getCustomRules, getDateFormat } from "./decorators.js";
import { reportDiagnostic } from "./lib.js";
import type { Constraint, FieldRule } from "./types.js";

export class RuleEmitter extends TypeEmitter<object> {
  override modelInstantiation(model: Model, name: string | undefined): EmitterOutput<object> {
    // List<T> みたいなジェネリクス型
    return name === undefined || name === "" ? this.modelLiteral(model) : this.modelDeclaration(model, name);
  }

  override modelDeclaration(model: Model, _name: string): EmitterOutput<object> {
    return this.emitter.emitModelProperties(model);
  }

  override modelLiteral(model: Model): EmitterOutput<object> {
    return this.emitter.emitModelProperties(model);
  }

  override modelProperties(model: Model): EmitterOutput<object> {
    return [...model.properties.values()].flatMap((p) => {
      const t = this.emitter.emitModelProperty(p);
      if (t.kind !== "code" || t.value instanceof Placeholder) {
        return [];
      }
      return t.value;
    });
  }

  override modelPropertyReference(property: ModelProperty): EmitterOutput<object> {
    return this.emitter.emitModelProperty(property);
  }

  override modelPropertyLiteral(property: ModelProperty): EmitterOutput<FieldRule[]> {
    const field = property.name;

    const propertyType = property.type;
    if (propertyType.kind === "ModelProperty") {
      propertyType.optional = property.optional;
    }

    const typeConstraint = this.#applyDecorator(propertyType, {});
    const propertyConstraint = this.#applyDecorator(property, typeConstraint);
    const mergedConstraint = this.#applyFieldRequirements(property, propertyConstraint);

    const t = this.emitter.emitTypeReference(propertyType);
    if (t.kind !== "code" || t.value instanceof Placeholder) {
      return [];
    }
    switch (this.#kind(propertyType)) {
      case "Object": {
        const children = t.value as unknown as FieldRule[];

        return children.map<FieldRule>((child) => {
          const merged = this.#applyFieldRequirements({ optional: property.optional }, child.constraint);

          return {
            field: `${field}.${child.field}`,
            constraint: merged,
          };
        });
      }

      case "Array": {
        const items = t.value as unknown as Constraint | FieldRule[];

        if (Array.isArray(items)) {
          return [
            { field, constraint: { ...mergedConstraint, type: "array" } },
            ...items.map((i) => ({ ...i, field: `${field}.*.${i.field}` })),
          ];
        }
        return [
          { field, constraint: { ...mergedConstraint, type: "array" } },
          { field: `${field}.*`, constraint: items },
        ];
      }

      case "Scalar": {
        const constraint = t.value as unknown as Constraint;
        return [{ field, constraint: { ...constraint, ...mergedConstraint } }];
      }

      case "ModelProperty": {
        const [{ constraint }] = t.value as unknown as [FieldRule];
        return [{ field, constraint }];
      }
    }
  }

  override arrayLiteral(_array: Model, elementType: Type): EmitterOutput<Constraint | FieldRule[]> {
    const t = this.emitter.emitTypeReference(elementType);
    if (t.kind !== "code" || t.value instanceof Placeholder) {
      return [];
    }
    const items = t.value as unknown as Constraint | FieldRule[];

    if (Array.isArray(items)) {
      if (elementType.kind === "ModelProperty" && items.length === 1 && items[0] !== undefined) {
        const [{ constraint }] = items;
        return this.#applyFieldRequirements({}, this.#applyDecorator(elementType, constraint));
      }

      return items;
    }

    const withDecorator = this.#applyDecorator(elementType, items);
    const mergedConstraint = this.#applyFieldRequirements({}, withDecorator);

    return mergedConstraint;
  }

  override scalarDeclaration(scalar: Scalar, _name: string): EmitterOutput<Constraint> {
    return this.#laravelTypeScalar(scalar);
  }

  override booleanLiteral(boolean: BooleanLiteral): EmitterOutput<Constraint> {
    return { type: "boolean", enum: [boolean.value] };
  }

  override stringLiteral(string: StringLiteral): EmitterOutput<Constraint> {
    return { type: "string", enum: [string.value] };
  }

  override numericLiteral(number: NumericLiteral): EmitterOutput<object> {
    return { type: Number.isInteger(number.value) ? "integer" : "numeric", enum: [number.value] };
  }

  override enumDeclaration(en: Enum, _name: string): EmitterOutput<Constraint> {
    const t = this.emitter.emitEnumMembers(en);
    if (t.kind !== "code" || t.value instanceof Placeholder) {
      return {};
    }
    return t.value;
  }

  override enumMember(member: EnumMember): EmitterOutput<object> {
    return this.enumMemberReference(member);
  }

  override enumMemberReference(member: EnumMember): EmitterOutput<Constraint> {
    switch (typeof member.value) {
      case "undefined":
        return { type: "string", enum: [member.name] };
      case "string":
        return { type: "string", enum: [member.value] };
      case "number":
        return { type: "integer", enum: [member.value] };
    }
  }

  override enumMembers(en: Enum): EmitterOutput<Constraint> {
    const types = new Set<string>();
    const values = new Set<string | number>();

    for (const member of en.members.values()) {
      switch (typeof member.value) {
        case "number": {
          types.add(Number.isInteger(member.value) ? "integer" : "numeric");
          break;
        }
        default: {
          types.add("string");
          break;
        }
      }
      values.add(member.value ?? member.name);
    }

    if (types.size > 1) {
      reportDiagnostic(this.emitter.getProgram(), { code: "enum-unique-type", target: en });
    }

    return { type: types.values().next().value, enum: Array.from(values) as Required<Constraint>["enum"] };
  }

  override unionVariant(variant: UnionVariant): EmitterOutput<object> {
    return this.emitter.emitTypeReference(variant.type);
  }

  override unionLiteral(union: Union): EmitterOutput<Constraint> {
    const literalVariantEnumByType: Record<string, Constraint> = {};
    const members: { type: Type | null; constraint: Constraint }[] = [];
    let nullable = false;

    for (const variant of union.variants.values()) {
      if (isNullType(variant)) {
        nullable = true;
        continue;
      }

      if (variant.type.kind === "Boolean" || variant.type.kind === "String" || variant.type.kind === "Number") {
        if (literalVariantEnumByType[variant.type.kind]) {
          literalVariantEnumByType[variant.type.kind]?.enum?.push(variant.type.value);
        } else {
          const t = this.emitter.emitTypeReference(variant.type);
          if (t.kind !== "code" || t.value instanceof Placeholder) {
            continue;
          }
          const constraint = t.value as unknown as Constraint;
          literalVariantEnumByType[variant.type.kind] = constraint;
          members.push({ type: null, constraint });
        }
      }
    }

    if (members.length === 1 && members[0] !== undefined) {
      const constraint = members[0].constraint;
      // TODO ?
      // const withDecorator = this.#applyDecorator(union, {});

      if (nullable) {
        constraint.nullable = true;
      }

      return constraint;
    }

    return {};
  }

  override unionVariants(union: Union): EmitterOutput<object> {
    return [...union.variants.values()].map((v) => this.emitter.emitType(v));
  }

  #applyDecorator(type: Type, base: Constraint): Constraint {
    const applied = { ...base };
    const program = this.emitter.getProgram();

    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    const apply = (fn: (p: Program, t: Type) => any, key: keyof Constraint) => {
      const value = fn(program, type);
      if (value !== undefined) {
        // @ts-expect-error
        applied[key] = value;
      }
    };

    apply(getMinLength, "minLength");
    apply(getMaxLength, "maxLength");
    apply(getMinItems, "minItems");
    apply(getMaxItems, "maxItems");
    apply(getMinValue, "minimum");
    apply(getMaxValue, "maximum");
    apply(getPattern, "pattern");

    const format = getFormat(program, type);
    if (format === "email") {
      applied.format = "email";
    }

    const dateFormat = getDateFormat(program, type);
    if (dateFormat !== undefined && dateFormat.length >= 1) {
      applied.format = `date_format:${dateFormat}`;
    }

    const customRules = getCustomRules(program, type);
    if (customRules.length >= 1) {
      if (applied.customRules === undefined) {
        applied.customRules = [];
      }
      applied.customRules.push(...customRules);
    }

    return applied;
  }

  #applyFieldRequirements({ optional = false }: { optional?: boolean }, constraint: Constraint): Constraint {
    const required = !optional;

    let min = constraint.minimum ?? constraint.minLength ?? constraint.minItems ?? 0;
    if (
      constraint.format === "email" ||
      constraint.format === "url" ||
      /^date_format:.+/.test(constraint.format ?? "")
    ) {
      min = 1;
    }

    if (required && min === 0) {
      return { ...constraint, requirements: "present" };
    }
    if (required && min >= 1) {
      return { ...constraint, requirements: "required" };
    }
    if (required === false && min === 0) {
      return { ...constraint, requirements: "sometimes" };
    }
    if (required === false && min >= 1) {
      return { ...constraint, requirements: "filled" };
    }

    return {
      ...constraint,
      requirements: required ? "required" : "sometimes",
    };
  }

  #laravelTypeScalar(scalar: Scalar): Constraint {
    const isStd = this.emitter.getProgram().checker.isStdType(scalar);

    let constraint: Constraint = {};
    if (isStd) {
      constraint = this.#laravelTypeForStdScalar(scalar);
    } else if (scalar.baseScalar) {
      constraint = this.#laravelTypeScalar(scalar.baseScalar);
    }

    const withDecorator = this.#applyDecorator(scalar, constraint);

    return withDecorator;
  }

  #laravelTypeForStdScalar(scalar: Scalar & { name: IntrinsicScalarName }): Constraint {
    switch (scalar.name) {
      case "boolean":
        return { type: "boolean" };

      case "integer":
      case "int8":
      case "int16":
      case "int32":
      case "int64":
      case "safeint": // cspell: disable-line
        return { type: "integer" };

      case "uint8":
      case "uint16":
      case "uint32":
      case "uint64":
        return { type: "integer", minimum: 0 };

      case "numeric":
      case "float":
      case "float32":
      case "float64":
      case "decimal":
      case "decimal128":
        return { type: "numeric" };

      case "string":
        return { type: "string" };
      case "url":
        return { type: "string", format: "url" };

      // どうしようもない
      case "plainDate":
        return { type: "string" };
      case "plainTime":
        return { type: "string" };
      case "duration":
        return { type: "string" };

      // https://www.w3.org/TR/NOTE-datetime
      case "utcDateTime":
        return { type: "string", format: "date_format:Y-m-d\\TH:i\\Z,Y-m-d\\TH:i:s\\Z,Y-m-d\\TH:i:s.v\\Z" };
      case "offsetDateTime":
        return { type: "string", format: "date_format:Y-m-d\\TH:iP,Y-m-d\\TH:i:sP,Y-m-d\\TH:i:s.vP" };

      default:
        return {};
    }
  }

  #kind(type: Type) {
    switch (type.kind) {
      case "Model": {
        if (isArrayModelType(this.emitter.getProgram(), type)) {
          return "Array";
        }
        return "Object";
      }
      case "ModelProperty": {
        return "ModelProperty";
      }
      default: {
        return "Scalar";
      }
    }
  }
}
