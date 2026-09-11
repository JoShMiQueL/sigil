import { useState } from "react";
import { Layout } from "../components/Layout";
import { ServerCreateDialog } from "../components/servers/server-create-dialog";
import { ServerList } from "../components/servers/server-list";
import { useSSE } from "../hooks/useSSE";

export function ServersPage() {
  const [showCreate, setShowCreate] = useState(false);

  useSSE({
    invalidations: {
      "server.create": [["servers"]],
      "server.update": [["servers"]],
      "server.delete": [["servers"]],
    },
  });

  return (
    <Layout>
      <h1>Servers</h1>
      {showCreate ? (
        <ServerCreateDialog onClose={() => setShowCreate(false)} />
      ) : (
        <button type="button" onClick={() => setShowCreate(true)}>
          Create Server
        </button>
      )}
      <div style={{ marginTop: "1rem" }}>
        <ServerList />
      </div>
    </Layout>
  );
}
