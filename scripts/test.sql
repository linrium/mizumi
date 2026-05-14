LOAD unity_catalog;
CREATE SECRET (
     TYPE unity_catalog,
     TOKEN 'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzUxMiIsImtpZCI6ImUwZTI0ODljYTU5YmVlNWM1ZDcxOTU4NDJkMTYxMWE5MGI1YTc4YTUifQ.eyJzdWIiOiJhZG1pbiIsImlzcyI6ImludGVybmFsIiwiaWF0IjoxNzc4NzcyMTg5LCJqdGkiOiIyZDFlMTNjOC01OGY4LTRhZDEtYmQ2OS02NWRiN2ZjMzYzZDIiLCJ0eXBlIjoiU0VSVklDRSJ9.QiFSle4VE2fPZPOeyClviEN_X8Khn_TAOaY1vZ1sJSEHiVGhJ-0lufhNDAyREaRKc_pr56n3Q5gyNBGHwmQ1LRX6f3nQpSgPxhu45JhxIGnKyNL7Vg13OLujU-5QhoiB2eu6WBp8Zi66lXdVnnQSq7yCxJT9YET-itZm4Ax5F-W7jzt8vj_rySqool3UYvY07uaHh3DCef3d-nkgRBzatvahrhfxdPq0SKG6won0v-Ehg0zHNAxdcfX5IlrriIjDWOI4Z1Yqcq-Q9UlW7u8wCMHXvyTZToGLj1PBHJsr1Yl8ysdkDG-aezbdE8QB_tFIkMnW209FSUy8x2a9-kTAuA',
     ENDPOINT 'http://localhost:8082'
);
ATTACH 'hdbank' AS hdbank (
     TYPE unity_catalog,
     DEFAULT_SCHEMA 'hdbank_payments_prod_bronze'
);
ATTACH 'vietjetair' AS vietjetair (
     TYPE unity_catalog,
     DEFAULT_SCHEMA 'vietjetair_bookings_prod_bronze'
);
SHOW ALL TABLES;
ATTACH 'unity' AS unity (TYPE unity_catalog, DEFAULT_SCHEMA 'default');