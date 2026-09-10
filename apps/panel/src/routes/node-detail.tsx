import type { Node } from "@sigil/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { AllocationForm } from "../components/allocations/allocation-form";
import { AllocationList } from "../components/allocations/allocation-list";
import { AllocationSummaryView } from "../components/allocations/allocation-summary";
import { ErrorState } from "../components/ErrorState";
import { Layout } from "../components/Layout";
import { LoadingState } from "../components/LoadingState";
import { NodeDetailPanel } from "../components/NodeDetailPanel";
import { NodeEditDialog } from "../components/NodeEditDialog";
import { useAllocationSummary } from "../hooks/use-allocations";
import {
  useDeleteNode,
  useNode,
  useRegenerateCredentials,
  useRevokeCredentials,
  useUpdateNode,
} from "../hooks/useNodes";
import { useRegions } from "../hooks/useRegions";
import { useSSE } from "../hooks/useSSE";

export function NodeDetailPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const params = useParams({ strict: false });
  const nodeId = params.nodeId as string | undefined;
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [newCreds, setNewCreds] = useState<{ secretId: string; secret: string } | null>(null);

  const { data: node, isLoading } = useNode(nodeId);
  const { data: regionsData } = useRegions();
  const { data: allocationSummary } = useAllocationSummary(nodeId);
  const updateMutation = useUpdateNode(nodeId);
  const deleteMutation = useDeleteNode(nodeId);
  const regenerateMutation = useRegenerateCredentials(nodeId);
  const revokeMutation = useRevokeCredentials(nodeId);

  useSSE({
    invalidations: {
      "node.create": [["nodes"]],
      "node.delete": [["nodes"], ["node", nodeId ?? ""]],
      "allocation.create": [
        ["allocations", nodeId ?? ""],
        ["allocation-summary", nodeId ?? ""],
      ],
      "allocation.update": [
        ["allocations", nodeId ?? ""],
        ["allocation-summary", nodeId ?? ""],
      ],
      "allocation.delete": [
        ["allocations", nodeId ?? ""],
        ["allocation-summary", nodeId ?? ""],
      ],
    },
    handlers: {
      "node.update": (payload) => {
        if (!nodeId) return;
        const updated = payload as Node;
        if (updated.id === nodeId) {
          queryClient.setQueryData(["node", nodeId], updated);
          queryClient.invalidateQueries({ queryKey: ["nodes"] });
        }
      },
    },
  });

  if (!nodeId) {
    return (
      <Layout>
        <p>Node ID not provided</p>
        <button type="button" onClick={() => router.navigate({ to: "/nodes" })}>
          Back to Nodes
        </button>
      </Layout>
    );
  }

  if (isLoading) {
    return (
      <Layout>
        <LoadingState message="Loading node..." />
      </Layout>
    );
  }

  if (!node) {
    return (
      <Layout>
        <ErrorState message="Node not found" />
        <button type="button" onClick={() => router.navigate({ to: "/nodes" })}>
          Back to Nodes
        </button>
      </Layout>
    );
  }

  const saveEdit = async (input: { displayName?: string; regionId?: string }) => {
    const result = await updateMutation.mutateAsync(input);
    if ("error" in result && result.error) {
      setError(result.error);
    } else {
      setEditing(false);
      setMessage("Node updated");
    }
  };

  return (
    <Layout>
      <h1>{node.displayName}</h1>
      <button type="button" onClick={() => router.navigate({ to: "/nodes" })}>
        Back to Nodes
      </button>

      {error && <ErrorState message={error} />}
      {message && <p style={{ color: "#2d8" }}>{message}</p>}

      {newCreds && (
        <div
          style={{ background: "#fff3cd", padding: "1rem", borderRadius: "4px", margin: "1rem 0" }}
        >
          <p style={{ fontWeight: "bold", color: "#c00" }}>
            Copy the new secret now — it won't be shown again.
          </p>
          <p>Secret ID: {newCreds.secretId}</p>
          <textarea
            readOnly
            value={newCreds.secret}
            style={{ width: "100%", fontFamily: "monospace", fontSize: "0.85rem" }}
            rows={2}
          />
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(newCreds.secret);
            }}
          >
            Copy secret
          </button>
          <button type="button" onClick={() => setNewCreds(null)} style={{ marginLeft: "0.5rem" }}>
            Dismiss
          </button>
        </div>
      )}

      <NodeDetailPanel node={node} />

      {/* Allocations Section (R7) */}
      <div style={{ marginTop: "2rem" }}>
        <h2>Allocations</h2>
        <AllocationSummaryView summary={allocationSummary} />
        <AllocationForm nodeId={nodeId} />
        <AllocationList nodeId={nodeId} />
      </div>

      <div style={{ marginTop: "1.5rem", display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        {editing ? (
          <NodeEditDialog
            displayName={node.displayName}
            regionId={node.regionId}
            regions={regionsData ?? []}
            onSave={saveEdit}
            onCancel={() => setEditing(false)}
            isSaving={updateMutation.isPending}
          />
        ) : (
          <button
            type="button"
            onClick={() => {
              setEditing(true);
              setError(null);
              setMessage(null);
            }}
          >
            Edit Node
          </button>
        )}
        <button
          type="button"
          onClick={async () => {
            const result = await regenerateMutation.mutateAsync();
            if (!("error" in result)) {
              setNewCreds(result);
              setMessage("Credentials regenerated — copy the new secret now!");
            }
          }}
          disabled={regenerateMutation.isPending}
        >
          {regenerateMutation.isPending ? "Regenerating..." : "Regenerate Credentials"}
        </button>
        <button
          type="button"
          onClick={async () => {
            const result = await revokeMutation.mutateAsync();
            if (!("error" in result)) {
              setMessage("Credentials revoked");
            }
          }}
          disabled={revokeMutation.isPending}
        >
          {revokeMutation.isPending ? "Revoking..." : "Revoke Credentials"}
        </button>
        <button
          type="button"
          onClick={async () => {
            if (confirm(`Delete node "${node.displayName}"? This cannot be undone.`)) {
              const result = await deleteMutation.mutateAsync();
              if (!("error" in result)) {
                router.navigate({ to: "/nodes" });
              }
            }
          }}
          disabled={deleteMutation.isPending}
          style={{ color: "#c00" }}
        >
          {deleteMutation.isPending ? "Deleting..." : "Delete Node"}
        </button>
      </div>
    </Layout>
  );
}
