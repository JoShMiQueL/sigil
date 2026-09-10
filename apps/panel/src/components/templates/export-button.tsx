interface ExportButtonProps {
  templateId: string;
  templateName: string;
}

export function ExportButton({ templateId, templateName }: ExportButtonProps) {
  const handleExport = async () => {
    const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";
    const res = await fetch(`${API_URL}/api/admin/templates/${templateId}/export`, {
      credentials: "include",
    });

    if (!res.ok) {
      console.error("Failed to export template");
      return;
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${templateName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.yaml`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <button type="button" onClick={handleExport}>
      Export
    </button>
  );
}
