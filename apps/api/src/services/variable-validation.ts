import type { VariableCreate } from "@sigilpanel/shared";

export class VariableValidationError extends Error {
  constructor(
    message: string,
    public field: string,
  ) {
    super(message);
    this.name = "VariableValidationError";
  }
}

export function validateVariable(variable: VariableCreate, index: number): void {
  const prefix = `Variable[${index}] (${variable.name})`;

  if (variable.required && (variable.defaultValue === undefined || variable.defaultValue === "")) {
    throw new VariableValidationError(`${prefix}: required variable must have a default value`, "defaultValue");
  }

  if (variable.dataType === "integer" && variable.defaultValue !== undefined && variable.defaultValue !== "") {
    const val = Number(variable.defaultValue);
    if (Number.isNaN(val) || !Number.isInteger(val)) {
      throw new VariableValidationError(`${prefix}: default value must be an integer`, "defaultValue");
    }
    if (variable.minValue !== undefined && variable.minValue !== null && val < variable.minValue) {
      throw new VariableValidationError(`${prefix}: default value ${val} is below minimum ${variable.minValue}`, "defaultValue");
    }
    if (variable.maxValue !== undefined && variable.maxValue !== null && val > variable.maxValue) {
      throw new VariableValidationError(`${prefix}: default value ${val} exceeds maximum ${variable.maxValue}`, "defaultValue");
    }
  }

  if (variable.dataType === "boolean" && variable.defaultValue !== undefined && variable.defaultValue !== "") {
    if (!["true", "false", "1", "0"].includes(String(variable.defaultValue).toLowerCase())) {
      throw new VariableValidationError(`${prefix}: boolean default must be true/false`, "defaultValue");
    }
  }

  if (variable.dataType === "select") {
    if (!variable.allowedValues || variable.allowedValues.length === 0) {
      throw new VariableValidationError(`${prefix}: select type requires allowedValues`, "allowedValues");
    }
    if (variable.defaultValue !== undefined && variable.defaultValue !== "" && !variable.allowedValues.includes(String(variable.defaultValue))) {
      throw new VariableValidationError(`${prefix}: default value must be one of allowedValues`, "defaultValue");
    }
  }

  if (variable.dataType === "string" && variable.defaultValue !== undefined && variable.defaultValue !== "") {
    if (variable.minLength !== undefined && variable.minLength !== null && String(variable.defaultValue).length < variable.minLength) {
      throw new VariableValidationError(`${prefix}: default value length is below minimum ${variable.minLength}`, "defaultValue");
    }
    if (variable.maxLength !== undefined && variable.maxLength !== null && String(variable.defaultValue).length > variable.maxLength) {
      throw new VariableValidationError(`${prefix}: default value length exceeds maximum ${variable.maxLength}`, "defaultValue");
    }
    if (variable.regexPattern) {
      try {
        const regex = new RegExp(variable.regexPattern);
        if (!regex.test(String(variable.defaultValue))) {
          throw new VariableValidationError(`${prefix}: default value does not match regex pattern`, "defaultValue");
        }
      } catch (err) {
        if (err instanceof VariableValidationError) throw err;
        throw new VariableValidationError(`${prefix}: invalid regex pattern`, "regexPattern");
      }
    }
  }
}

export function validateVariables(variables: VariableCreate[]): void {
  const envVars = new Set<string>();

  for (let i = 0; i < variables.length; i++) {
    const v = variables[i];

    if (envVars.has(v.envVar)) {
      throw new VariableValidationError(`Variable[${i}] (${v.name}): duplicate envVar "${v.envVar}"`, "envVar");
    }
    envVars.add(v.envVar);

    validateVariable(v, i);
  }
}
