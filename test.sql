CREATE SECRET (
    TYPE unity_catalog,
    TOKEN 'token',
    ENDPOINT 'http://127.0.0.1:8082',
    AWS_REGION 'us-east-2'
);
ATTACH 'banking' AS banking (TYPE unity_catalog, DEFAULT_SCHEMA 'transactions');