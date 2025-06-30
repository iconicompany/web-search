curl -X POST http://localhost:3000/mcp \
-H "Content-Type: application/json" \
-H "Accept: application/json, text/event-stream" \
-d '{
  "jsonrpc": "2.0",
  "method": "mcp.listTools",
  "params": {},
  "id": 1
}'