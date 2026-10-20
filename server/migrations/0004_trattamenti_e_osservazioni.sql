-- Trattamenti e osservazioni di campo, per vigneto.
-- I trattamenti servono a stimare la protezione residua; le osservazioni validate dall'agronomo
-- sono i dati "veri" con cui calibrare i modelli delle malattie (piano, traccia D).

CREATE TABLE treatment (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vineyard_id  uuid NOT NULL REFERENCES vineyard (id) ON DELETE CASCADE,
  applied_at   timestamptz NOT NULL,
  product      text NOT NULL CHECK (length(trim(product)) > 0),
  target       text NOT NULL CHECK (target IN ('peronospora', 'oidio', 'botrite', 'black_rot', 'altro')),
  -- giorni di copertura dichiarati per il prodotto (da etichetta o dall'agronomo)
  cover_days   real NOT NULL CHECK (cover_days > 0 AND cover_days <= 30),
  dose         text,
  note         text,
  created_by   text REFERENCES "user" (id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX treatment_vineyard_time ON treatment (vineyard_id, applied_at DESC);

CREATE TABLE observation (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vineyard_id   uuid NOT NULL REFERENCES vineyard (id) ON DELETE CASCADE,
  observed_at   timestamptz NOT NULL,
  disease       text NOT NULL CHECK (disease IN ('peronospora', 'oidio', 'botrite', 'black_rot', 'altro', 'nessuna')),
  -- 0 nessun sintomo, 1 tracce, 2 diffusi, 3 gravi
  severity      smallint NOT NULL CHECK (severity BETWEEN 0 AND 3),
  phenology     text,
  note          text,
  created_by    text REFERENCES "user" (id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  validated_by  text REFERENCES "user" (id) ON DELETE SET NULL,
  validated_at  timestamptz
);
CREATE INDEX observation_vineyard_time ON observation (vineyard_id, observed_at DESC);
