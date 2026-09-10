import { useState } from "react";
import type { Template, TemplateCreate, VariableCreate } from "@sigilpanel/shared";
import { VariableEditor } from "./variable-editor";

interface TemplateFormProps {
  template?: Template | null;
  groupId: string;
  onSubmit: (input: TemplateCreate) => Promise<{ error?: string }>;
  onCancel?: () => void;
}

export function TemplateForm({ template, groupId, onSubmit, onCancel }: TemplateFormProps) {
  const [name, setName] = useState(template?.name ?? "");
  const [description, setDescription] = useState(template?.description ?? "");
  const [author, setAuthor] = useState(template?.author ?? "");
  const [version, setVersion] = useState(template?.version ?? "1.0.0");
  const [image, setImage] = useState(template?.image ?? "");
  const [startupCommand, setStartupCommand] = useState(template?.startupCommand ?? "");
  const [stopSignal, setStopSignal] = useState(template?.stopSignal ?? "^C");
  const [memoryMb, setMemoryMb] = useState(String(template?.resourceLimits?.memoryMb ?? 1024));
  const [cpuLimit, setCpuLimit] = useState(String(template?.resourceLimits?.cpuLimit ?? 1.0));
  const [pidsLimit, setPidsLimit] = useState(String(template?.resourceLimits?.pidsLimit ?? 512));
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [variables, setVariables] = useState<VariableCreate[]>(
    (template?.variables as unknown as VariableCreate[]) ?? [],
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const input: TemplateCreate = {
      groupId,
      name,
      description: description || undefined,
      author: author || undefined,
      version,
      image,
      startupCommand,
      stopSignal,
      environment: template?.environment ?? {},
      portMappings: template?.portMappings ?? [],
      resourceLimits: {
        memoryMb: Number(memoryMb),
        cpuLimit: Number(cpuLimit),
        pidsLimit: Number(pidsLimit),
      },
      resourceLimitsRange: template?.resourceLimitsRange,
      changelog: template?.changelog ?? [],
      variables: variables as TemplateCreate["variables"],
    };

    const result = await onSubmit(input);
    setSubmitting(false);
    if (result.error) {
      setError(result.error);
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ marginBottom: "1rem" }}>
      {error && <div style={{ color: "red", marginBottom: "0.5rem" }}>{error}</div>}
      <div style={{ marginBottom: "0.5rem" }}>
        <label htmlFor="tpl-name">
          Name:
          <input id="tpl-name" type="text" value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} style={{ display: "block", marginTop: "0.25rem" }} />
        </label>
      </div>
      <div style={{ marginBottom: "0.5rem" }}>
        <label htmlFor="tpl-desc">
          Description:
          <input id="tpl-desc" type="text" value={description} onChange={(e) => setDescription(e.target.value)} style={{ display: "block", marginTop: "0.25rem" }} />
        </label>
      </div>
      <div style={{ marginBottom: "0.5rem" }}>
        <label htmlFor="tpl-author">
          Author:
          <input id="tpl-author" type="text" value={author} onChange={(e) => setAuthor(e.target.value)} style={{ display: "block", marginTop: "0.25rem" }} />
        </label>
      </div>
      <div style={{ marginBottom: "0.5rem" }}>
        <label htmlFor="tpl-version">
          Version:
          <input id="tpl-version" type="text" value={version} onChange={(e) => setVersion(e.target.value)} required style={{ display: "block", marginTop: "0.25rem" }} />
        </label>
      </div>
      <div style={{ marginBottom: "0.5rem" }}>
        <label htmlFor="tpl-image">
          Docker Image:
          <input id="tpl-image" type="text" value={image} onChange={(e) => setImage(e.target.value)} required placeholder="eclipse-temurin:21-jre" style={{ display: "block", marginTop: "0.25rem" }} />
        </label>
      </div>
      <div style={{ marginBottom: "0.5rem" }}>
        <label htmlFor="tpl-startup">
          Startup Command:
          <input id="tpl-startup" type="text" value={startupCommand} onChange={(e) => setStartupCommand(e.target.value)} required placeholder="java -jar server.jar nogui" style={{ display: "block", marginTop: "0.25rem" }} />
        </label>
      </div>
      <div style={{ marginBottom: "0.5rem" }}>
        <label htmlFor="tpl-stop">
          Stop Signal:
          <input id="tpl-stop" type="text" value={stopSignal} onChange={(e) => setStopSignal(e.target.value)} style={{ display: "block", marginTop: "0.25rem" }} />
        </label>
      </div>
      <fieldset style={{ marginBottom: "0.5rem" }}>
        <legend>Resource Limits</legend>
        <label htmlFor="tpl-mem">
          Memory (MB):
          <input id="tpl-mem" type="number" value={memoryMb} onChange={(e) => setMemoryMb(e.target.value)} required style={{ marginLeft: "0.5rem" }} />
        </label>
        <label htmlFor="tpl-cpu" style={{ marginLeft: "1rem" }}>
          CPU Limit:
          <input id="tpl-cpu" type="number" step="0.1" value={cpuLimit} onChange={(e) => setCpuLimit(e.target.value)} required style={{ marginLeft: "0.5rem" }} />
        </label>
        <label htmlFor="tpl-pids" style={{ marginLeft: "1rem" }}>
          PIDs Limit:
          <input id="tpl-pids" type="number" value={pidsLimit} onChange={(e) => setPidsLimit(e.target.value)} required style={{ marginLeft: "0.5rem" }} />
        </label>
      </fieldset>
      <VariableEditor variables={variables} onChange={setVariables} />
      <button type="submit" disabled={submitting}>
        {submitting ? "Saving..." : template ? "Update Template" : "Create Template"}
      </button>
      {onCancel && (
        <button type="button" onClick={onCancel} style={{ marginLeft: "0.5rem" }}>
          Cancel
        </button>
      )}
    </form>
  );
}
