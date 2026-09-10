import type { AllocationSummary } from "@sigil/shared";

interface AllocationSummaryProps {
  summary: AllocationSummary | undefined;
}

export function AllocationSummaryView({ summary }: AllocationSummaryProps) {
  if (!summary) return null;

  return (
    <div style={{ display: "flex", gap: "1rem", margin: "1rem 0" }}>
      <div
        style={{
          padding: "0.75rem 1.5rem",
          background: "#1a1a2e",
          borderRadius: "6px",
          border: "1px solid #333",
        }}
      >
        <div style={{ fontSize: "0.75rem", color: "#888" }}>Total</div>
        <div style={{ fontSize: "1.5rem", fontWeight: "bold" }}>{summary.total}</div>
      </div>
      <div
        style={{
          padding: "0.75rem 1.5rem",
          background: "#1a1a2e",
          borderRadius: "6px",
          border: "1px solid #2d8",
        }}
      >
        <div style={{ fontSize: "0.75rem", color: "#2d8" }}>Available</div>
        <div style={{ fontSize: "1.5rem", fontWeight: "bold", color: "#2d8" }}>
          {summary.available}
        </div>
      </div>
      <div
        style={{
          padding: "0.75rem 1.5rem",
          background: "#1a1a2e",
          borderRadius: "6px",
          border: "1px solid #d92",
        }}
      >
        <div style={{ fontSize: "0.75rem", color: "#d92" }}>Assigned</div>
        <div style={{ fontSize: "1.5rem", fontWeight: "bold", color: "#d92" }}>
          {summary.assigned}
        </div>
      </div>
      {summary.primaryIp && (
        <div
          style={{
            padding: "0.75rem 1.5rem",
            background: "#1a1a2e",
            borderRadius: "6px",
            border: "1px solid #6af",
          }}
        >
          <div style={{ fontSize: "0.75rem", color: "#6af" }}>Primary IP</div>
          <div
            style={{
              fontSize: "1.2rem",
              fontWeight: "bold",
              color: "#6af",
              fontFamily: "monospace",
            }}
          >
            {summary.primaryIp}
          </div>
        </div>
      )}
    </div>
  );
}
