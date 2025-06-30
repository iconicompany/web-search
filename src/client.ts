import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
let client: Client|undefined = undefined
const baseUrl = new URL('http://localhost:3000/mcp');
try {
  client = new Client({
    name: 'streamable-http-client',
    version: '1.0.0'
  });
  const transport = new StreamableHTTPClientTransport(
    new URL(baseUrl)
  );
  await client.connect(transport);
  console.log("Connected using Streamable HTTP transport");
  client.listTools();
} catch (error) {
  // If that fails with a 4xx error, try the older SSE transport
  console.log("Streamable HTTP connection failed", error);
}
