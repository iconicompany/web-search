// server.ts
import express, { Request, Response } from 'express';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import axios from 'axios';
import * as cheerio from 'cheerio';

interface SearchResult {
  title: string;
  url: string;
  description: string;
}

const isValidSearchArgs = (args: any): args is { query: string; limit?: number } =>
  typeof args === 'object' &&
  args !== null &&
  typeof args.query === 'string' &&
  (args.limit === undefined || typeof args.limit === 'number');

function getServer(): Server {
  const server = new Server(
    {
      name: 'web-search',
      version: '0.1.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: 'search',
        description: 'Search the web using Google (no API key required)',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query',
            },
            limit: {
              type: 'number',
              description: 'Maximum number of results to return (default: 5)',
              minimum: 1,
              maximum: 10,
            },
          },
          required: ['query'],
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name !== 'search') {
      throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${request.params.name}`);
    }

    if (!isValidSearchArgs(request.params.arguments)) {
      throw new McpError(ErrorCode.InvalidParams, 'Invalid search arguments');
    }

    const query = request.params.arguments.query;
    const limit = Math.min(request.params.arguments.limit || 5, 10);

    const results = await performSearch(query, limit);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(results, null, 2),
        },
      ],
    };
  });

  return server;
}

async function performSearch(query: string, limit: number): Promise<SearchResult[]> {
  const response = await axios.get('https://www.google.com/search', {
    params: { q: query },
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    },
  });

  const $ = cheerio.load(response.data);
  const results: SearchResult[] = [];

  $('div.g').each((i, element) => {
    if (i >= limit) return false;

    const titleElement = $(element).find('h3');
    const linkElement = $(element).find('a');
    const snippetElement = $(element).find('.VwiC3b');

    const url = linkElement.attr('href');
    if (titleElement.length && linkElement.length && url?.startsWith('http')) {
      results.push({
        title: titleElement.text(),
        url: url,
        description: snippetElement.text() || '',
      });
    }
  });

  return results;
}

// --- HTTP server setup ---
const app = express();
app.use(express.json());

app.post('/mcp', async (req: Request, res: Response) => {
  try {
    const server = getServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    res.on('close', () => {
      console.log('Request closed');
      transport.close();
      server.close();
    });

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error('Error handling MCP request:', error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal server error',
        },
        id: null,
      });
    }
  }
});

app.get('/mcp', (req, res) => {
  console.log('GET not allowed');
  res.status(405).json({
    jsonrpc: '2.0',
    error: {
      code: -32000,
      message: 'Method not allowed.',
    },
    id: null,
  });
});

app.delete('/mcp', (req, res) => {
  console.log('DELETE not allowed');
  res.status(405).json({
    jsonrpc: '2.0',
    error: {
      code: -32000,
      message: 'Method not allowed.',
    },
    id: null,
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`MCP Web Search HTTP server is running on http://localhost:${PORT}/mcp`);
});
