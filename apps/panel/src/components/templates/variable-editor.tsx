import { useState } from "react";
import type { VariableCreate } from "@sigilpanel/shared";

interface VariableEditorProps {
  variables: VariableCreate[];
  onChange: (variables: VariableCreate[]) => void;
}

function emptyVariable(sortOrder: number): VariableCreate {
  return {
    name: "",
    envVar: "",
    dataType: "string",
    defaultValue: "",
    required: false,
    visibility: "editable",
    sortOrder,
  };
}

export function VariableEditor({ variables, onChange }: VariableEditorProps) {
  const [error, setError] = useState<string | null>(null);

  const addVariable = () => {
    onChange([...variables, emptyVariable(variables.length)]);
  };

  const removeVariable = (index: number) => {
    onChange(variables.filter((_, i) => i !== index));
  };

  const updateVariable = (index: number, updates: Partial<VariableCreate>) => {
    onChange(variables.map((v, i) => (i === index ? { ...v, ...updates } : v)));
  };

  const moveUp = (index: number) => {
    if (index === 0) return;
    const newVars = [...variables];
    [newVars[index - 1], newVars[index]] = [newVars[index], newVars[index - 1]];
    onChange(newVars.map((v, i) => ({ ...v, sortOrder: i })));
  };

  const moveDown = (index: number) => {
    if (index === variables.length - 1) return;
    const newVars = [...variables];
    [newVars[index], newVars[index + 1]] = [newVars[index + 1], newVars[index]];
    onChange(newVars.map((v, i) => ({ ...v, sortOrder: i })));
  };

  return (
    <fieldset style={{ marginBottom: "1rem" }}>
      <legend>Variables</legend>
      {error && <div style={{ color: "red", marginBottom: "0.5rem" }}>{error}</div>}
      {variables.length === 0 && <p>No variables defined.</p>}
      {variables.map((v, i) => (
        <div key={i} style={{ marginBottom: "0.5rem", padding: "0.5rem", border: "1px solid #ddd" }}>
          <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.25rem" }}>
            <input
              type="text"
              placeholder="Name"
              value={v.name}
              onChange={(e) => updateVariable(i, { name: e.target.value })}
              style={{ flex: 1 }}
            />
            <input
              type="text"
              placeholder="Env Var"
              value={v.envVar}
              onChange={(e) => updateVariable(i, { envVar: e.target.value })}
              style={{ flex: 1 }}
            />
            <select
              value={v.dataType}
              onChange={(e) => updateVariable(i, { dataType: e.target.value as VariableCreate["dataType"] })}
            >
              <option value="string">String</option>
              <option value="integer">Integer</option>
              <option value="boolean">Boolean</option>
              <option value="select">Select</option>
            </select>
            <select
              value={v.visibility}
              onChange={(e) => updateVariable(i, { visibility: e.target.value as VariableCreate["visibility"] })}
            >
              <option value="editable">Editable</option>
              <option value="viewable">Viewable</option>
              <option value="hidden">Hidden</option>
            </select>
          </div>
          <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.25rem" }}>
            <input
              type="text"
              placeholder="Default Value"
              value={v.defaultValue ?? ""}
              onChange={(e) => updateVariable(i, { defaultValue: e.target.value })}
              style={{ flex: 1 }}
            />
            <label>
              <input
                type="checkbox"
                checked={v.required}
                onChange={(e) => updateVariable(i, { required: e.target.checked })}
              />
              Required
            </label>
          </div>
          {v.dataType === "integer" && (
            <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.25rem" }}>
              <input
                type="number"
                placeholder="Min"
                value={v.minValue ?? ""}
                onChange={(e) => updateVariable(i, { minValue: e.target.value ? Number(e.target.value) : null })}
                style={{ width: "80px" }}
              />
              <input
                type="number"
                placeholder="Max"
                value={v.maxValue ?? ""}
                onChange={(e) => updateVariable(i, { maxValue: e.target.value ? Number(e.target.value) : null })}
                style={{ width: "80px" }}
              />
            </div>
          )}
          {v.dataType === "string" && (
            <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.25rem" }}>
              <input
                type="number"
                placeholder="Min Length"
                value={v.minLength ?? ""}
                onChange={(e) => updateVariable(i, { minLength: e.target.value ? Number(e.target.value) : null })}
                style={{ width: "80px" }}
              />
              <input
                type="number"
                placeholder="Max Length"
                value={v.maxLength ?? ""}
                onChange={(e) => updateVariable(i, { maxLength: e.target.value ? Number(e.target.value) : null })}
                style={{ width: "80px" }}
              />
              <input
                type="text"
                placeholder="Regex Pattern"
                value={v.regexPattern ?? ""}
                onChange={(e) => updateVariable(i, { regexPattern: e.target.value || null })}
                style={{ flex: 1 }}
              />
            </div>
          )}
          {v.dataType === "select" && (
            <input
              type="text"
              placeholder="Allowed values (comma-separated)"
              value={v.allowedValues?.join(", ") ?? ""}
              onChange={(e) =>
                updateVariable(i, {
                  allowedValues: e.target.value
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
              style={{ width: "100%", marginBottom: "0.25rem" }}
            />
          )}
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button type="button" onClick={() => moveUp(i)} disabled={i === 0}>
              ↑
            </button>
            <button type="button" onClick={() => moveDown(i)} disabled={i === variables.length - 1}>
              ↓
            </button>
            <button type="button" onClick={() => removeVariable(i)}>
              Remove
            </button>
          </div>
        </div>
      ))}
      <button type="button" onClick={addVariable}>
        Add Variable
      </button>
    </fieldset>
  );
}
