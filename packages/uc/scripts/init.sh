UC_TOKEN=(cat config/token.txt)

 curl -s -X POST http://localhost:8080/api/1.0/unity-control/scim2/Users \
   -H "Authorization: Bearer $UC_TOKEN" \
   -H "Content-Type: application/json" \
   -d '{"displayName":"Linh Tran","emails":[{"value":"linh@gmail.com","primary":true}]}'

 curl -s -X POST http://localhost:8080/api/1.0/unity-control/scim2/Users \
   -H "Authorization: Bearer $UC_TOKEN" \
   -H "Content-Type: application/json" \
   -d '{"displayName":"Khao Soi","emails":[{"value":"khaosoi@gmail.com","primary":true}]}'

 curl -s -X POST http://localhost:8080/api/1.0/unity-control/scim2/Users \
   -H "Authorization: Bearer $UC_TOKEN" \
   -H "Content-Type: application/json" \
   -d '{"displayName":"Khao Pad","emails":[{"value":"khaopad@gmail.com","primary":true}]}'

 # Grant USE CATALOG on hdbank to linh@gmail.com
 curl -s -X PATCH http://localhost:8080/api/2.1/unity-catalog/permissions/catalog/hdbank \
   -H "Authorization: Bearer $UC_TOKEN" \
   -H "Content-Type: application/json" \
   -d '{"changes":[{"principal":"linh@gmail.com","add":["USE_CATALOG"],"remove":[]}]}'

 # Grant USE SCHEMA
 curl -s -X PATCH "http://localhost:8080/api/2.1/unity-catalog/permissions/schema/hdbank.hdbank_payments_prod_bronze" \
   -H "Authorization: Bearer $UC_TOKEN" \
   -H "Content-Type: application/json" \
   -d '{"changes":[{"principal":"linh@gmail.com","add":["USE_SCHEMA"],"remove":[]}]}'

 # Grant SELECT on table
 curl -s -X PATCH "http://localhost:8080/api/2.1/unity-catalog/permissions/table/hdbank.hdbank_payments_prod_bronze.raw_card_payment_events_v1" \
   -H "Authorization: Bearer $UC_TOKEN" \
   -H "Content-Type: application/json" \
   -d '{"changes":[{"principal":"linh@gmail.com","add":["SELECT"],"remove":[]}]}'