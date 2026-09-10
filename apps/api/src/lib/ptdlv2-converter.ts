import type { PTDLv2Egg, PTDLv2Variable, VariableCreate } from "@sigilpanel/shared";

export interface ConversionResult {
  variables: VariableCreate[];
  skippedFields: string[];
}

export function convertPTDLv2Variables(eggVariables: PTDLv2Variable[]): VariableCreate[] {
  return eggVariables.map((v) => convertPTDLv2Variable(v));
}

export function convertPTDLv2Variable(v: PTDLv2Variable): VariableCreate {
  const rules = parseRules(v.rules);
  const dataType = inferDataType(v, rules);
  const visibility = inferVisibility(v.user_viewable, v.user_editable);

  return {
    name: v.name,
    envVar: v.env_variable,
    dataType,
    defaultValue: v.default_value,
    required: rules.required,
    minValue: dataType === "integer" ? (rules.min ?? null) : null,
    maxValue: dataType === "integer" ? (rules.max ?? null) : null,
    minLength: dataType === "string" ? (rules.min ?? null) : null,
    maxLength: dataType === "string" ? (rules.max ?? null) : null,
    regexPattern: rules.regex ?? null,
    allowedValues: rules.in ?? null,
    visibility,
    sortOrder: 0,
  };
}

interface ParsedRules {
  required: boolean;
  min: number | null;
  max: number | null;
  regex: string | null;
  in: string[] | null;
}

export function parseRules(rulesString: string): ParsedRules {
  const rules = rulesString.split("|").map((r) => r.trim());
  const result: ParsedRules = {
    required: false,
    min: null,
    max: null,
    regex: null,
    in: null,
  };

  for (const rule of rules) {
    if (rule === "required") {
      result.required = true;
    } else if (rule.startsWith("min:")) {
      result.min = Number.parseInt(rule.slice(4), 10);
    } else if (rule.startsWith("max:")) {
      result.max = Number.parseInt(rule.slice(4), 10);
    } else if (rule.startsWith("regex:")) {
      result.regex = rule.slice(6).replace(/^\/|\/$/g, "");
    } else if (rule.startsWith("in:")) {
      result.in = rule
        .slice(3)
        .split(",")
        .map((s) => s.trim());
    }
  }

  return result;
}

function inferDataType(
  v: PTDLv2Variable,
  rules: ParsedRules,
): "string" | "integer" | "boolean" | "select" {
  if (rules.in) return "select";
  if (v.field_type === "number" || v.field_type === "integer") return "integer";
  if (v.field_type === "checkbox" || v.field_type === "boolean") return "boolean";
  if (rules.min !== null || rules.max !== null) return "integer";
  return "string";
}

function inferVisibility(
  userViewable: boolean,
  userEditable: boolean,
): "hidden" | "viewable" | "editable" {
  if (!userViewable) return "hidden";
  if (!userEditable) return "viewable";
  return "editable";
}

export function getSkippedFields(egg: PTDLv2Egg): string[] {
  const skipped: string[] = [];
  if (egg.scripts) skipped.push("scripts");
  if (egg.config?.files) skipped.push("config.files");
  if (egg.config?.logs) skipped.push("config.logs");
  if (egg.file_denylist) skipped.push("file_denylist");
  if (egg.features) skipped.push("features");
  return skipped;
}
