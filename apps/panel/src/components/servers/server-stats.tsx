interface ServerStatsProps {
  stats: {
    cpuPct: number;
    memoryMb: number;
    memoryLimitMb: number;
    diskMb: number;
    diskLimitMb: number;
  } | null;
  isRunning: boolean;
}

function formatMb(mb: number): string {
  if (mb < 1) return "0 MB";
  if (mb < 1024) return `${Math.round(mb)} MB`;
  return `${(mb / 1024).toFixed(1)} GB`;
}

export function ServerStats({ stats, isRunning }: ServerStatsProps) {
  if (!isRunning || !stats) {
    return (
      <div
        style={{
          padding: "12px",
          borderRadius: "6px",
          background: "#1a1a2e",
          color: "#888",
          fontSize: "13px",
        }}
      >
        Stats not available
      </div>
    );
  }

  const memPct = stats.memoryLimitMb > 0 ? (stats.memoryMb / stats.memoryLimitMb) * 100 : 0;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gap: "12px",
        padding: "12px",
        borderRadius: "6px",
        background: "#1a1a2e",
      }}
    >
      <div>
        <div style={{ fontSize: "11px", color: "#888", marginBottom: "4px" }}>CPU</div>
        <div style={{ fontSize: "18px", color: "#e0e0e0", fontWeight: "bold" }}>
          {stats.cpuPct.toFixed(1)}%
        </div>
      </div>
      <div>
        <div style={{ fontSize: "11px", color: "#888", marginBottom: "4px" }}>Memory</div>
        <div style={{ fontSize: "18px", color: "#e0e0e0", fontWeight: "bold" }}>
          {formatMb(stats.memoryMb)}
        </div>
        <div style={{ fontSize: "11px", color: "#666" }}>
          / {formatMb(stats.memoryLimitMb)} ({memPct.toFixed(0)}%)
        </div>
      </div>
      <div>
        <div style={{ fontSize: "11px", color: "#888", marginBottom: "4px" }}>Disk</div>
        <div style={{ fontSize: "18px", color: "#e0e0e0", fontWeight: "bold" }}>
          {stats.diskMb > 0 ? formatMb(stats.diskMb) : "—"}
        </div>
        <div style={{ fontSize: "11px", color: "#666" }}>
          {stats.diskLimitMb > 0 ? `/ ${formatMb(stats.diskLimitMb)}` : ""}
        </div>
      </div>
    </div>
  );
}
