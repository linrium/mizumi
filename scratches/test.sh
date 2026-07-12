#!/usr/bin/env bash
set -euo pipefail

NAMESPACE="unitycatalog"
TOKEN_PATH="./etc/conf/token.txt"

echo "Fetching UC token from container..."
POD=$(kubectl get pod -n "$NAMESPACE" -l app=unitycatalog -o jsonpath='{.items[0].metadata.name}')
UC_TOKEN=$(kubectl exec -n "$NAMESPACE" "$POD" -- cat "$TOKEN_PATH")

echo $UC_TOKEN

bin/uc --server "http://localhost:8081" --auth_token $UC_TOKEN user create --name "Linh Tran" --email linh@gmail.com
bin/uc --server "http://localhost:8081" --auth_token $UC_TOKEN user create --name "Khao Soi" --email khaosoi@gmail.com
bin/uc --server "http://localhost:8081" --auth_token $UC_TOKEN user create --name "Khao Pad" --email khaopad@gmail.com

bin/uc --server "http://localhost:8081" --auth_token $UC_TOKEN permission create --securable_type catalog --name hdbank --privilege "USE CATALOG" --principal linh@gmail.com
bin/uc --server "http://localhost:8081" --auth_token $UC_TOKEN permission create --securable_type schema --name hdbank.hdbank_payments_prod_bronze --privilege "USE SCHEMA" --principal linh@gmail.com
bin/uc --server "http://localhost:8081" --auth_token $UC_TOKEN permission create --securable_type table --name hdbank.hdbank_payments_prod_bronze.raw_card_payment_events_v1 --privilege "SELECT" --principal linh@gmail.com
