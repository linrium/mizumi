UPDATE streaming_jobs
SET main_application_file = 'local:///opt/spark/jobs/vietjetair/stream_flight_tickets_to_bronze.py',
    updated_at = NOW()
WHERE main_application_file = 'local:///opt/spark/jobs/vietjetair/stream_partner_events_to_bronze.py';
