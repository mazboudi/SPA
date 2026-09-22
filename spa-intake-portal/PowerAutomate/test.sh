curl -X POST "<https://9b15756c6443e7bd819c018a44fb28.12.environment.api.powerplatform.com:443/powerautomate/automations/direct/cu/29/workflows/330c841f8f304c31891c73d8c87c31f8/triggers/manual/paths/invoke?api-version=1>" \
  -H "Content-Type: application/json" \
  -d '{
    "requestId": "REQ-101",
    "requesterEmail": "dean.mazboudi@fiserv.com",
    "title": "Access Request",
    "description": "User requested access to the production database."
  }'