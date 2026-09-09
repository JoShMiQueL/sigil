import { useState } from "react";

interface CreateRegionFormProps {
  onCreate: (input: { name: string; description?: string }) => Promise<{ error?: string }>;
}

export function CreateRegionForm({ onCreate }: CreateRegionFormProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const result = await onCreate({
      name: name.trim(),
      description: description.trim() || undefined,
    });

    setIsSubmitting(false);

    if ("error" in result && result.error) {
      setError(result.error);
      return;
    }

    setName("");
    setDescription("");
  };

  return (
    <form onSubmit={handleSubmit} style={{ marginBottom: "1.5rem" }}>
      <h3>Create Region</h3>
      {error && <p style={{ color: "#c00", fontSize: "0.85rem" }}>{error}</p>}
      <div style={{ display: "flex", gap: "0.5rem", alignItems: "flex-end" }}>
        <label>
          Name
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            minLength={2}
            maxLength={64}
            placeholder="e.g. EU-West"
            style={{ display: "block", marginTop: "0.25rem" }}
          />
        </label>
        <label>
          Description (optional)
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={256}
            placeholder="e.g. European servers"
            style={{ display: "block", marginTop: "0.25rem" }}
          />
        </label>
        <button type="submit" disabled={isSubmitting || name.trim().length < 2}>
          {isSubmitting ? "Creating..." : "Create"}
        </button>
      </div>
    </form>
  );
}
