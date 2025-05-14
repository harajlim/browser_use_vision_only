kill $(lsof -t -i :8000 -sTCP:LISTEN)

adk api_server &

sleep 5

# start the main chat session.

curl -X POST http://0.0.0.0:8000/apps/browser_chat/users/u_123/sessions/s_123 \
  -H "Content-Type: application/json"

