import { describe, expect, it } from "vitest";
import { validateVariable, validateVariables, VariableValidationError } from "./variable-validation";
import type { VariableCreate } from "@sigilpanel/shared";

function makeVar(overrides: Partial<VariableCreate> = {}): VariableCreate {
  return {
    name: "Test Var",
    envVar: "TEST_VAR",
    dataType: "string",
    defaultValue: "default",
    required: false,
    visibility: "editable",
    sortOrder: 0,
    ...overrides,
  };
}

describe("variable validation [US4]", () => {
  it("accepts a valid string variable", () => {
    expect(() => validateVariable(makeVar(), 0)).not.toThrow();
  });

  it("rejects required variable without default", () => {
    expect(() => validateVariable(makeVar({ required: true, defaultValue: "" }), 0)).toThrow(VariableValidationError);
  });

  it("rejects required variable with undefined default", () => {
    expect(() => validateVariable(makeVar({ required: true, defaultValue: undefined }), 0)).toThrow(VariableValidationError);
  });

  it("validates integer default value", () => {
    expect(() => validateVariable(makeVar({ dataType: "integer", defaultValue: "20" }), 0)).not.toThrow();
    expect(() => validateVariable(makeVar({ dataType: "integer", defaultValue: "abc" }), 0)).toThrow(VariableValidationError);
  });

  it("validates integer min/max", () => {
    expect(() =>
      validateVariable(makeVar({ dataType: "integer", defaultValue: "5", minValue: 1, maxValue: 100 }), 0),
    ).not.toThrow();
    expect(() =>
      validateVariable(makeVar({ dataType: "integer", defaultValue: "0", minValue: 1 }), 0),
    ).toThrow(VariableValidationError);
    expect(() =>
      validateVariable(makeVar({ dataType: "integer", defaultValue: "200", maxValue: 100 }), 0),
    ).toThrow(VariableValidationError);
  });

  it("validates boolean default value", () => {
    expect(() => validateVariable(makeVar({ dataType: "boolean", defaultValue: "true" }), 0)).not.toThrow();
    expect(() => validateVariable(makeVar({ dataType: "boolean", defaultValue: "false" }), 0)).not.toThrow();
    expect(() => validateVariable(makeVar({ dataType: "boolean", defaultValue: "maybe" }), 0)).toThrow(VariableValidationError);
  });

  it("validates select requires allowedValues", () => {
    expect(() =>
      validateVariable(makeVar({ dataType: "select", defaultValue: "a", allowedValues: ["a", "b"] }), 0),
    ).not.toThrow();
    expect(() => validateVariable(makeVar({ dataType: "select", allowedValues: [] }), 0)).toThrow(VariableValidationError);
    expect(() =>
      validateVariable(makeVar({ dataType: "select", defaultValue: "c", allowedValues: ["a", "b"] }), 0),
    ).toThrow(VariableValidationError);
  });

  it("validates string min/maxLength", () => {
    expect(() =>
      validateVariable(makeVar({ dataType: "string", defaultValue: "hello", minLength: 1, maxLength: 10 }), 0),
    ).not.toThrow();
    expect(() =>
      validateVariable(makeVar({ dataType: "string", defaultValue: "ab", minLength: 3 }), 0),
    ).toThrow(VariableValidationError);
    expect(() =>
      validateVariable(makeVar({ dataType: "string", defaultValue: "toolongtext", maxLength: 5 }), 0),
    ).toThrow(VariableValidationError);
  });

  it("validates regex pattern against default", () => {
    expect(() =>
      validateVariable(makeVar({ dataType: "string", defaultValue: "abc123", regexPattern: "^[a-z0-9]+$" }), 0),
    ).not.toThrow();
    expect(() =>
      validateVariable(makeVar({ dataType: "string", defaultValue: "ABC!", regexPattern: "^[a-z0-9]+$" }), 0),
    ).toThrow(VariableValidationError);
  });

  it("rejects invalid regex pattern", () => {
    expect(() =>
      validateVariable(makeVar({ dataType: "string", defaultValue: "test", regexPattern: "[" }), 0),
    ).toThrow(VariableValidationError);
  });

  it("rejects duplicate envVar names", () => {
    const vars = [
      makeVar({ envVar: "SAME_VAR" }),
      makeVar({ name: "Other", envVar: "SAME_VAR" }),
    ];
    expect(() => validateVariables(vars)).toThrow(VariableValidationError);
  });

  it("accepts multiple variables with unique envVars", () => {
    const vars = [
      makeVar({ envVar: "VAR_ONE" }),
      makeVar({ name: "Other", envVar: "VAR_TWO" }),
    ];
    expect(() => validateVariables(vars)).not.toThrow();
  });
});
