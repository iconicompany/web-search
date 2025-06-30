import express, { Request, Response } from "express";
import { z } from "zod";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import axios from "axios";
import * as cheerio from "cheerio";

interface SearchResult {
  title: string;
  url: string;
  description: string;
}
const SearchResultSchema = z.object({
  title: z.string(),
  url: z.string().url(),
  description: z.string(),
});
const SearchResultListSchema = {
  results: z.array(SearchResultSchema),
};

function configureServer(server: McpServer): void {
  // Add an addition tool
  server.registerTool(
    "add",
    {
      title: "Addition Tool",
      description: "Add two numbers",
      inputSchema: { a: z.number(), b: z.number() },
    },
    async ({ a, b }) => ({
      content: [{ type: "text", text: String(a + b) }],
    })
  );
  server.registerTool(
    "search",
    {
      title: "Search the web using Google",
      description: "Search the web using Google",
      inputSchema: {
        query: z.string().describe("Search query"),
        limit: z
          .number()
          .min(1, { message: "Minimum value is 1" })
          .max(10, { message: "Maximum value is 10" })
          .optional()
          .describe("Maximum number of results to return (default: 5)"),
      } as const,
      outputSchema: SearchResultListSchema,
    },
    async ({ query, limit }) => {
      const results = await performSearch(query, limit || 5);
      const structuredContent = { results };
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(structuredContent, null, 2),
          },
        ],
        structuredContent,
      };
    }
  );
}

async function performSearch(
  query: string,
  limit: number
): Promise<SearchResult[]> {
  console.debug({ query, limit });
  // ... (эта функция остается без изменений)
  const response = await axios.get("https://www.google.com/search", {
    params: { q: query },
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
    },
  });

  const $ = cheerio.load(response.data);
  const results: SearchResult[] = [];
  results.push({
    title: "titleElement",
    url: "http://localhost",
    description: "snippetElement.text()",
  });

  $("div.g").each((i, element) => {
    if (i >= limit) return false;

    const titleElement = $(element).find("h3");
    const linkElement = $(element).find("a");
    const snippetElement = $(element).find(".VwiC3b");

    const url = linkElement.attr("href");
    if (titleElement.length && linkElement.length && url?.startsWith("http")) {
      results.push({
        title: titleElement.text(),
        url: url,
        description: snippetElement.text() || "",
      });
    }
  });

  return results;
}

// --- HTTP server setup ---
const app = express();
app.use(express.json());

// 1. Создаем сервер и транспорт ОДИН РАЗ при запуске приложения
const mcpServer = new McpServer(
  {
    name: "web-search",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);
const httpTransport = new StreamableHTTPServerTransport({
  sessionIdGenerator: undefined,
});

// 2. Конфигурируем обработчики ОДИН РАЗ
configureServer(mcpServer);

// 3. Соединяем их ОДИН РАЗ
mcpServer.connect(httpTransport).catch(console.error);

// 4. В обработчике просто передаем запрос транспорту
app.post("/mcp", async (req: Request, res: Response) => {
  try {
    // Транспорт и сервер уже созданы и готовы к работе
    await httpTransport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error("Error handling MCP request:", error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: req.body?.id || null,
      });
    }
  }
});

app.get("/mcp", (req, res) => {
  console.log("GET not allowed", req.url);
  res.status(405).json({
    jsonrpc: "2.0",
    error: {
      code: -32000,
      message: "Method not allowed.",
    },
    id: null,
  });
});

app.delete("/mcp", (req, res) => {
  console.log("DELETE not allowed", req.url);
  res.status(405).json({
    jsonrpc: "2.0",
    error: {
      code: -32000,
      message: "Method not allowed.",
    },
    id: null,
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(
    `MCP Web Search HTTP server is running on http://localhost:${PORT}/mcp`
  );
});
