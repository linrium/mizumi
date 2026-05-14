bin/uc --auth_token $$AUTH_TOKEN user create --name "Linh Tran" --email linh@gmail.com
bin/uc --auth_token $$AUTH_TOKEN user create --name "Khao Soi" --email khaosoi@gmail.com
bin/uc --auth_token $$AUTH_TOKEN user create --name "Khao Pad" --email khaopad@gmail.com

bin/uc --auth_token $AUTH_TOKEN permission create --securable_type catalog --name hdbank --privilege "USE CATALOG" --principal linh@gmail.com
bin/uc --auth_token $AUTH_TOKEN permission create --securable_type schema --name hdbank.hdbank_payments_prod_bronze --privilege "USE SCHEMA" --principal linh@gmail.com
bin/uc --auth_token $AUTH_TOKEN permission create --securable_type table --name hdbank.hdbank_payments_prod_bronze.raw_card_payment_events_v1 --privilege "SELECT" --principal linh@gmail.com