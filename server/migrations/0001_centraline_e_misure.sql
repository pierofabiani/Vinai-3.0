-- Centraline, misure, salute, pacchetti grezzi e configurazioni remote.
-- Formato dei dati: firmware/src/core/packet.h e record.h; regole: docs/piattaforma.md, sezione 5.

CREATE EXTENSION IF NOT EXISTS timescaledb;
CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE station (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  imei            bigint NOT NULL UNIQUE CHECK (imei BETWEEN 100000000000000 AND 999999999999999),
  -- chiave HMAC da 16 byte, cifrata con AES-256-GCM (STATION_KEY_SECRET): iv 12 + tag 16 + dati 16
  key_enc         bytea NOT NULL CHECK (length(key_enc) = 44),
  label           text,
  status          text NOT NULL DEFAULT 'lab'
                  CHECK (status IN ('lab', 'pronta', 'installata', 'attiva', 'dismessa')),
  -- configurazione scritta in laboratorio (versione 0): base per calcolare le differenze
  factory_config  jsonb NOT NULL,
  location        geography(Point, 4326),
  created_at      timestamptz NOT NULL DEFAULT now(),
  first_seen_at   timestamptz,
  last_seen_at    timestamptz,
  -- ultimi valori dichiarati dalla centralina
  fw_ver          integer,
  cfg_ver         integer NOT NULL DEFAULT 0,
  last_seq        bigint
);

-- Misure. Valori in unità reali; NULL dove il sensore era guasto (flags lo dice). Mai valori inventati.
CREATE TABLE measurement (
  station_id   bigint NOT NULL REFERENCES station (id),
  time         timestamptz NOT NULL,
  seq          bigint NOT NULL,
  temp_c       real,
  hum_pct      real,
  press_hpa    real,
  wet_raw      integer,
  wet_min      smallint NOT NULL,
  flags        smallint NOT NULL,
  received_at  timestamptz NOT NULL DEFAULT now(),
  -- In una hypertable ogni vincolo unico deve contenere la colonna del tempo. Un reinvio porta lo
  -- stesso record (stessa sequenza, stessa ora), quindi ON CONFLICT su questa chiave basta.
  PRIMARY KEY (station_id, time, seq)
);
SELECT create_hypertable('measurement', by_range('time', INTERVAL '7 days'));
CREATE INDEX measurement_station_seq ON measurement (station_id, seq DESC);

ALTER TABLE measurement SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = 'station_id',
  timescaledb.compress_orderby = 'time DESC, seq DESC'
);
SELECT add_compression_policy('measurement', INTERVAL '30 days');

-- Salute: una riga per pacchetto ricevuto e verificato.
CREATE TABLE health (
  station_id    bigint NOT NULL REFERENCES station (id),
  time          timestamptz NOT NULL,
  fw_ver        integer NOT NULL,
  cfg_ver       integer NOT NULL,
  batt_mv       integer NOT NULL,
  rsrp_dbm      smallint NOT NULL,
  snr_db        smallint NOT NULL,
  csq           smallint NOT NULL,
  last_reset    smallint NOT NULL,
  reset_count   integer NOT NULL,
  modem_fails   smallint NOT NULL,
  lost_records  integer NOT NULL,
  cfg_rejected  integer NOT NULL,
  first_seq     bigint NOT NULL,
  n_records     smallint NOT NULL
);
SELECT create_hypertable('health', by_range('time', INTERVAL '30 days'));
CREATE INDEX health_station_time ON health (station_id, time DESC);

-- Ogni datagramma ricevuto, prima di qualsiasi decodifica: si può sempre rielaborare.
CREATE TABLE raw_packet (
  id           uuid NOT NULL DEFAULT gen_random_uuid(),
  received_at  timestamptz NOT NULL DEFAULT now(),
  station_id   bigint,
  src_addr     inet,
  src_port     integer,
  payload      bytea NOT NULL,
  -- ricevuto -> ok | duplicato | firma | formato | sconosciuta | errore
  result       text NOT NULL DEFAULT 'ricevuto',
  detail       text
);
SELECT create_hypertable('raw_packet', by_range('received_at', INTERVAL '30 days'));
CREATE INDEX raw_packet_station ON raw_packet (station_id, received_at DESC);
ALTER TABLE raw_packet SET (timescaledb.compress, timescaledb.compress_orderby = 'received_at DESC');
SELECT add_compression_policy('raw_packet', INTERVAL '30 days');

-- Configurazioni remote. La versione 0 è quella di fabbrica (station.factory_config).
CREATE TABLE config_version (
  station_id   bigint NOT NULL REFERENCES station (id),
  version      integer NOT NULL CHECK (version BETWEEN 1 AND 65535),
  params       jsonb NOT NULL,
  -- da_inviare | applicata | rifiutata (mai più inviata) | superata (sostituita prima di arrivare)
  status       text NOT NULL DEFAULT 'da_inviare'
               CHECK (status IN ('da_inviare', 'applicata', 'rifiutata', 'superata')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  created_by   text,
  sent_at      timestamptz,
  applied_at   timestamptz,
  rejected_at  timestamptz,
  PRIMARY KEY (station_id, version)
);
CREATE UNIQUE INDEX config_one_pending ON config_version (station_id) WHERE status = 'da_inviare';

-- Aggregati per l'app: si legge quasi sempre da qui, non dalle misure grezze.
-- Esclusi i record con l'orologio mai sincronizzato (flags & 16): la loro ora non è affidabile.
CREATE MATERIALIZED VIEW measurement_1h
WITH (timescaledb.continuous) AS
SELECT station_id,
       time_bucket(INTERVAL '1 hour', time) AS bucket,
       avg(temp_c)    AS temp_avg,
       min(temp_c)    AS temp_min,
       max(temp_c)    AS temp_max,
       avg(hum_pct)   AS hum_avg,
       avg(press_hpa) AS press_avg,
       sum(wet_min)   AS wet_min,
       count(*)       AS n
FROM measurement
WHERE (flags & 16) = 0
GROUP BY station_id, bucket
WITH NO DATA;
SELECT add_continuous_aggregate_policy('measurement_1h',
  start_offset => INTERVAL '30 days', end_offset => INTERVAL '10 minutes', schedule_interval => INTERVAL '10 minutes');
ALTER MATERIALIZED VIEW measurement_1h SET (timescaledb.materialized_only = false);

CREATE MATERIALIZED VIEW measurement_1d
WITH (timescaledb.continuous) AS
SELECT station_id,
       time_bucket(INTERVAL '1 day', time, 'Europe/Rome') AS bucket,
       avg(temp_c)    AS temp_avg,
       min(temp_c)    AS temp_min,
       max(temp_c)    AS temp_max,
       avg(hum_pct)   AS hum_avg,
       avg(press_hpa) AS press_avg,
       sum(wet_min)   AS wet_min,
       count(*)       AS n
FROM measurement
WHERE (flags & 16) = 0
GROUP BY station_id, bucket
WITH NO DATA;
SELECT add_continuous_aggregate_policy('measurement_1d',
  start_offset => INTERVAL '60 days', end_offset => INTERVAL '1 hour', schedule_interval => INTERVAL '1 hour');
ALTER MATERIALIZED VIEW measurement_1d SET (timescaledb.materialized_only = false);
