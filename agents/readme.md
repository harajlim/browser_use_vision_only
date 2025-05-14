Kick off this server with:

```
adk api_server
```

To start one of these agents; run the following to activate a userid session:

```
curl -X POST http://0.0.0.0:8000/apps/{agent_name}/users/u_123/sessions/s_123 \
  -H "Content-Type: application/json"
```

Then to post a request to the active session post:

```
curl -X POST http://0.0.0.0:8000/run \
-H "Content-Type: application/json" \  
-d '{                                
"app_name": "{agent_name}",
"user_id": "u_123",
"session_id": "s_123",
"new_message": {
    "role": "user",
    "parts": [{
    "text": "{your request}"
    }]
}
}'
```