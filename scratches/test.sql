LOAD unity_catalog;
CREATE SECRET (
     TYPE unity_catalog,
     TOKEN 'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzUxMiIsImtpZCI6ImRkZmFhNzYyZGExNDgyZDQyNDVjM2FmZTZhZDBmMjczZjJmZmM0ZmUifQ.eyJzdWIiOiJhZG1pbiIsImlzcyI6ImludGVybmFsIiwiaWF0IjoxNzc4ODQxNzg0LCJqdGkiOiI0NTlkNTA3MS0zYjBmLTQ5MGMtYWIxMi1lYTEzZTk1YmE2NDMiLCJ0eXBlIjoiU0VSVklDRSJ9.d-H4TF-qkZb50GJjnxHiNnxTNBihx15d_0K8xfCBG1LWPTjLcCWnQwz0MRUqebIh2Yx59KlBy6sBRZ9YNb5cUOsxJ4Rf8tbcgOXUi88XOOghaGi6-NusyY8-AZLKnqwO2b01M2SU403oyJ0uoPAjYZEXk9l5MjoGnnXAnE4Q6FI5Bd6saZSHWyV89b5cLXNYJqbKbDd2tF5eqODu5ykmvbHzT0XAvscvg_-MJvT70LwPyk94MuwGPVxa-fBzxDj9eAKs2IyTxtVNiiAfVuLu7DQyFhbCNOanrpiD_14RM5u5-EoLTelkwH_K4cWKmylwQm7K5ekhU2GDvN86PjcJ3w',
     ENDPOINT 'http://localhost:8082'
);
ATTACH 'hdbank' AS hdbank (
     TYPE unity_catalog,
     DEFAULT_SCHEMA 'hdbank_payments_prod_bronze'
);
SHOW ALL TABLES;
select *
from hdbank.hdbank_payments_prod_bronze.raw_card_payment_events_v1;
ATTACH 'vietjetair' AS vietjetair (
     TYPE unity_catalog,
     DEFAULT_SCHEMA 'vietjetair_bookings_prod_bronze'
);