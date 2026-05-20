CREATE TABLE team_members
(
    team_id    UUID        NOT NULL REFERENCES teams (id) ON DELETE CASCADE,
    user_id    UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (team_id, user_id)
);

INSERT INTO team_members (team_id, user_id)
VALUES ('10000000-0000-0000-0000-000000000004', '4faec421-980b-40e7-9997-ce2488ac5968'), -- Sovico Data Steward <- Linh Tran
       ('10000000-0000-0000-0000-000000000004', 'f6138570-3008-4bcd-8c32-8ae72fce2ac7'), -- Sovico Data Steward <- Khao Soi
       ('10000000-0000-0000-0000-000000000002', '590df6ab-a6d9-418c-b89e-8ed3a26cdc7e'), -- VietJetair Analytics <- Khao Pad
       ('10000000-0000-0000-0000-000000000005', '508f5a7a-f4b4-421a-bbb0-5968f710bd50'); -- HDBank Security <- Rikki Tarczaly
