import { useParams, useRouter } from "@tanstack/react-router";
import { Layout } from "../components/Layout";
import { ServerDetail } from "../components/servers/server-detail";
import { useSSE } from "../hooks/useSSE";

export function ServerDetailPage() {
  const router = useRouter();
  const params = useParams({ strict: false });
  const serverId = params.serverId as string | undefined;

  useSSE({
    invalidations: {
      "server.update": [["server", serverId ?? ""], ["servers"]],
      "server.delete": [["servers"]],
    },
  });

  if (!serverId) {
    return (
      <Layout>
        <p>Server ID not provided</p>
        <button type="button" onClick={() => router.navigate({ to: "/servers" })}>
          Back to Servers
        </button>
      </Layout>
    );
  }

  return (
    <Layout>
      <button type="button" onClick={() => router.navigate({ to: "/servers" })}>
        Back to Servers
      </button>
      <div style={{ marginTop: "1rem" }}>
        <ServerDetail serverId={serverId} />
      </div>
    </Layout>
  );
}
