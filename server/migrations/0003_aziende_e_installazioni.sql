-- Aziende, ruoli per azienda, inviti, vigneti, installazioni, laboratorio, registro delle azioni.
-- Le aziende sono tabelle nostre, non del plugin di Better Auth (nota 0009).

CREATE TABLE organization (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL CHECK (length(trim(name)) > 0),
  vat_number  text,
  address     text,
  region      text,
  province    text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  text REFERENCES "user" (id) ON DELETE SET NULL,
  suspended_at timestamptz
);

CREATE TABLE membership (
  organization_id uuid NOT NULL REFERENCES organization (id) ON DELETE CASCADE,
  user_id         text NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
  role            text NOT NULL CHECK (role IN ('titolare', 'agronomo', 'collaboratore', 'ospite')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, user_id)
);
CREATE INDEX membership_user ON membership (user_id);

CREATE TABLE invitation (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization (id) ON DELETE CASCADE,
  email           text NOT NULL CHECK (email = lower(email)),
  role            text NOT NULL CHECK (role IN ('titolare', 'agronomo', 'collaboratore', 'ospite')),
  -- il collegamento contiene il token; qui solo la sua impronta SHA-256
  token_hash      bytea NOT NULL UNIQUE,
  expires_at      timestamptz NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      text REFERENCES "user" (id) ON DELETE SET NULL,
  accepted_at     timestamptz,
  accepted_by     text REFERENCES "user" (id) ON DELETE SET NULL,
  revoked_at      timestamptz
);
CREATE INDEX invitation_email_open ON invitation (email) WHERE accepted_at IS NULL AND revoked_at IS NULL;

CREATE TABLE vineyard (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization (id) ON DELETE CASCADE,
  name            text NOT NULL CHECK (length(trim(name)) > 0),
  variety         text,
  planting_year   smallint CHECK (planting_year BETWEEN 1900 AND 2100),
  row_spacing_m   real CHECK (row_spacing_m > 0),
  vine_spacing_m  real CHECK (vine_spacing_m > 0),
  area            geography(MultiPolygon, 4326),
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX vineyard_org ON vineyard (organization_id);

ALTER TABLE station
  ADD COLUMN organization_id uuid REFERENCES organization (id) ON DELETE SET NULL,
  ADD COLUMN vineyard_id     uuid REFERENCES vineyard (id) ON DELETE SET NULL,
  ADD COLUMN installed_at    timestamptz,
  ADD COLUMN installed_by    text REFERENCES "user" (id) ON DELETE SET NULL,
  ADD COLUMN install_photo   text,
  ADD COLUMN install_note    text;
CREATE INDEX station_org ON station (organization_id);

-- Registro di laboratorio: ogni passaggio di una scheda, dalla chiave all'etichetta.
CREATE TABLE lab_event (
  station_id  bigint NOT NULL REFERENCES station (id) ON DELETE CASCADE,
  time        timestamptz NOT NULL DEFAULT now(),
  kind        text NOT NULL CHECK (kind IN ('creata', 'chiave_scaricata', 'chiave_rigenerata', 'programmata',
                                            'test_ok', 'test_ko', 'etichetta', 'installata', 'nota')),
  user_id     text REFERENCES "user" (id) ON DELETE SET NULL,
  detail      text
);
CREATE INDEX lab_event_station ON lab_event (station_id, time DESC);

-- Chi ha fatto cosa: console e privacy.
CREATE TABLE audit_log (
  time      timestamptz NOT NULL DEFAULT now(),
  user_id   text REFERENCES "user" (id) ON DELETE SET NULL,
  action    text NOT NULL,
  target    text,
  detail    jsonb,
  ip        text
);
CREATE INDEX audit_log_time ON audit_log (time DESC);

-- Posta di sviluppo e prova: le email non partono, si leggono dalla console.
CREATE TABLE dev_outbox (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  recipient  text NOT NULL,
  subject    text NOT NULL,
  body       text NOT NULL,
  link       text
);
