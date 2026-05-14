LOAD unity_catalog;
CREATE SECRET (
     TYPE     unity_catalog,
     TOKEN    'not-used',
     ENDPOINT 'http://localhost:8082'
);
ATTACH 'hdbank' AS hdbank (TYPE unity_catalog, DEFAULT_SCHEMA 'hdbank_payments_prod_bronze');
ATTACH 'vietjetair' AS vietjetair (TYPE unity_catalog, DEFAULT_SCHEMA 'vietjetair_bookings_prod_bronze');
SHOW ALL TABLES;

     ATTACH 'unity' AS unity (TYPE unity_catalog, DEFAULT_SCHEMA 'default');