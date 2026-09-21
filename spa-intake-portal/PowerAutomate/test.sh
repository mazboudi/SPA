curl -X POST "<YOUR_COPIED_URL>" \
  -H "Content-Type: application/json" \
  -d '{
    "requestId": "REQ-101",
    "requesterEmail": "dean.mazboudi@fiserv.com",
    "title": "Access Request",
    "description": "User requested access to the production database."
  }'