import { useRouter } from "@tanstack/react-router";
import { CreateRegionForm } from "../components/CreateRegionForm";
import { Layout } from "../components/Layout";
import { LoadingState } from "../components/LoadingState";
import { NodeTable } from "../components/NodeTable";
import { PairingTokenDialog } from "../components/PairingTokenDialog";
import { RegionList } from "../components/RegionList";
import { useGeneratePairingToken, useNodes } from "../hooks/useNodes";
import { useCreateRegion, useDeleteRegion, useRegions } from "../hooks/useRegions";

export function NodesPage() {
  const router = useRouter();

  const { data: regionsData, isLoading: regionsLoading } = useRegions();
  const { data: nodesData } = useNodes();
  const createRegionMutation = useCreateRegion();
  const deleteRegionMutation = useDeleteRegion();
  const generateTokenMutation = useGeneratePairingToken();

  const regions = regionsData ?? [];

  return (
    <Layout>
      <h1>Nodes</h1>

      <h2>Regions</h2>
      <CreateRegionForm
        onCreate={async (input) => {
          const result = await createRegionMutation.mutateAsync(input);
          return result;
        }}
      />
      {regionsLoading ? (
        <LoadingState message="Loading regions..." />
      ) : (
        <RegionList
          regions={regions}
          onDelete={async (id) => {
            const result = await deleteRegionMutation.mutateAsync(id);
            return result;
          }}
        />
      )}

      <h2>Nodes</h2>
      <PairingTokenDialog
        regions={regions}
        onGenerate={async (regionId) => {
          const result = await generateTokenMutation.mutateAsync(regionId);
          if ("error" in result) return { error: result.error };
          return { token: result.token, expiresAt: result.expiresAt };
        }}
      />
      <NodeTable
        nodes={nodesData ?? []}
        onRowClick={(node) =>
          router.navigate({ to: "/nodes/$nodeId", params: { nodeId: node.id } })
        }
      />
    </Layout>
  );
}
