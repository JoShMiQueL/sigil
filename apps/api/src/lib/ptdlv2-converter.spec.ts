import { describe, expect, it } from "vitest";
import { convertPTDLv2Variable, getSkippedFields, parseRules } from "./ptdlv2-converter";
import type { PTDLv2Egg, PTDLv2Variable } from "@sigilpanel/shared";

function makeVar(overrides: Partial<PTDLv2Variable> = {}): PTDLv2Variable {
  return {
    name: "Test Var",
    description: "A test variable",
    env_variable: "TEST_VAR",
    default_value: "20",
    field_type: "number",
    rules: "required|integer",
    user_viewable: true,
    user_editable: true,
    ...overrides,
  };
}

describe("PTDL_v2 rules parser [US5]", () => {
  it("parses required|integer|min:1|max:100", () => {
    const rules = parseRules("required|integer|min:1|max:100");
    expect(rules.required).toBe(true);
    expect(rules.min).toBe(1);
    expect(rules.max).toBe(100);
  });

  it("parses required|string|regex:/^a-z+$/", () => {
    const rules = parseRules("required|string|regex:/^a-z+$/");
    expect(rules.required).toBe(true);
    expect(rules.regex).toBe("^a-z+$");
  });

  it("parses in:easy,normal,hard", () => {
    const rules = parseRules("in:easy,normal,hard");
    expect(rules.in).toEqual(["easy", "normal", "hard"]);
  });

  it("handles empty rules string", () => {
    const rules = parseRules("");
    expect(rules.required).toBe(false);
    expect(rules.min).toBeNull();
    expect(rules.max).toBeNull();
  });
});

describe("PTDL_v2 variable conversion [US5]", () => {
  it("converts integer variable with min/max", () => {
    const result = convertPTDLv2Variable(
      makeVar({ rules: "required|integer|min:1|max:100", default_value: "20", field_type: "number" }),
    );
    expect(result.dataType).toBe("integer");
    expect(result.required).toBe(true);
    expect(result.minValue).toBe(1);
    expect(result.maxValue).toBe(100);
    expect(result.defaultValue).toBe("20");
  });

  it("converts select variable from in: rule", () => {
    const result = convertPTDLv2Variable(
      makeVar({ rules: "in:easy,normal,hard", default_value: "normal", field_type: "text" }),
    );
    expect(result.dataType).toBe("select");
    expect(result.allowedValues).toEqual(["easy", "normal", "hard"]);
  });

  it("converts boolean variable from checkbox field_type", () => {
    const result = convertPTDLv2Variable(
      makeVar({ rules: "boolean", default_value: "true", field_type: "checkbox" }),
    );
    expect(result.dataType).toBe("boolean");
  });

  it("converts string variable with regex", () => {
    const result = convertPTDLv2Variable(
      makeVar({ rules: "required|string|regex:/^[a-z]+$/", default_value: "abc", field_type: "text" }),
    );
    expect(result.dataType).toBe("string");
    expect(result.regexPattern).toBe("^[a-z]+$");
  });

  it("maps visibility: hidden when not viewable", () => {
    const result = convertPTDLv2Variable(makeVar({ user_viewable: false, user_editable: false }));
    expect(result.visibility).toBe("hidden");
  });

  it("maps visibility: viewable when viewable but not editable", () => {
    const result = convertPTDLv2Variable(makeVar({ user_viewable: true, user_editable: false }));
    expect(result.visibility).toBe("viewable");
  });

  it("maps visibility: editable when viewable and editable", () => {
    const result = convertPTDLv2Variable(makeVar({ user_viewable: true, user_editable: true }));
    expect(result.visibility).toBe("editable");
  });
});

describe("PTDL_v2 skipped fields [US5]", () => {
  it("reports skipped fields", () => {
    const egg: PTDLv2Egg = {
      meta: { version: "PTDL_v2" },
      name: "Test",
      author: "test",
      description: "Test egg",
      docker_images: { java: "eclipse-temurin:21-jre" },
      startup: "test",
      scripts: {
        installation: { script: "echo hi", container: "image", entrypoint: "bash" },
      },
      config: { files: "config.json", logs: "logs/", startup: "Done", stop: "^C" },
      variables: [],
      file_denylist: ["secret.txt"],
      features: ["eula"],
    };
    const skipped = getSkippedFields(egg);
    expect(skipped).toContain("scripts");
    expect(skipped).toContain("config.files");
    expect(skipped).toContain("config.logs");
    expect(skipped).toContain("file_denylist");
    expect(skipped).toContain("features");
  });

  it("reports no skipped fields when none present", () => {
    const egg: PTDLv2Egg = {
      meta: { version: "PTDL_v2" },
      name: "Test",
      author: "test",
      description: "Test egg",
      docker_images: { java: "eclipse-temurin:21-jre" },
      startup: "test",
      config: { stop: "^C" },
      variables: [],
    };
    const skipped = getSkippedFields(egg);
    expect(skipped).toEqual([]);
  });
});
