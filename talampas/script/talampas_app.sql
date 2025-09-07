-- Recreate Talampas & Associates schema
-- Tested for MySQL 5.7+/8.0+
-- ------------------------------------------------------------

CREATE DATABASE IF NOT EXISTS talampas_app
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;
USE talampas_app;

SET FOREIGN_KEY_CHECKS = 0;

-- Drop children first to avoid FK conflicts
DROP TABLE IF EXISTS thread_participants;
DROP TABLE IF EXISTS messages;
DROP TABLE IF EXISTS calendar_events;
DROP TABLE IF EXISTS case_files;
DROP TABLE IF EXISTS appointments;
DROP TABLE IF EXISTS threads;
DROP TABLE IF EXISTS cases;
DROP TABLE IF EXISTS users;

SET FOREIGN_KEY_CHECKS = 1;

-- --------------------------
-- users
-- --------------------------
CREATE TABLE users (
  id            INT(11) NOT NULL AUTO_INCREMENT,
  full_name     VARCHAR(160) NOT NULL,
  email         VARCHAR(160) NOT NULL,
  role          ENUM('admin','employee','client') NOT NULL DEFAULT 'client',
  status        ENUM('active','inactive') NOT NULL DEFAULT 'active',
  password_hash VARCHAR(255) NOT NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY ux_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------
-- cases
-- --------------------------
CREATE TABLE cases (
  id          INT(11) NOT NULL AUTO_INCREMENT,
  title       VARCHAR(255) NOT NULL,
  status      ENUM('new','in_progress','closed','open') NOT NULL DEFAULT 'new',
  next_date   DATE NULL,
  client_id   INT(11) NOT NULL,
  assignee_id INT(11) NULL,
  notes       TEXT NULL,
  created_by  INT(11) NOT NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_cases_client   (client_id),
  KEY ix_cases_assignee (assignee_id),
  KEY ix_cases_created  (created_by),
  CONSTRAINT fk_cases_client    FOREIGN KEY (client_id)   REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_cases_assignee  FOREIGN KEY (assignee_id) REFERENCES users(id) ON DELETE SET NULL  ON UPDATE CASCADE,
  CONSTRAINT fk_cases_createdby FOREIGN KEY (created_by)  REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------
-- threads
-- --------------------------
CREATE TABLE threads (
  id         INT(11) NOT NULL AUTO_INCREMENT,
  title      VARCHAR(255) NOT NULL,
  is_closed  TINYINT(1) NOT NULL DEFAULT 0,
  created_by INT(11) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_threads_created_by (created_by),
  CONSTRAINT fk_threads_createdby FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------
-- thread_participants
-- --------------------------
CREATE TABLE thread_participants (
  thread_id INT(11) NOT NULL,
  user_id   INT(11) NOT NULL,
  PRIMARY KEY (thread_id, user_id),
  KEY ix_tp_user (user_id),
  CONSTRAINT fk_tp_thread FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_tp_user   FOREIGN KEY (user_id)   REFERENCES users(id)   ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------
-- messages
-- --------------------------
CREATE TABLE messages (
  id         INT(11) NOT NULL AUTO_INCREMENT,
  thread_id  INT(11) NOT NULL,
  sender_id  INT(11) NOT NULL,
  body       TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_messages_thread (thread_id),
  KEY ix_messages_sender (sender_id),
  CONSTRAINT fk_msgs_thread FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE CASCADE  ON UPDATE CASCADE,
  CONSTRAINT fk_msgs_sender FOREIGN KEY (sender_id) REFERENCES users(id)   ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------
-- case_files
-- --------------------------
CREATE TABLE case_files (
  id          INT(11) NOT NULL AUTO_INCREMENT,
  case_id     INT(11) NOT NULL,
  file_name   VARCHAR(255) NOT NULL,
  file_path   VARCHAR(512) NOT NULL,
  uploaded_by INT(11) NOT NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_files_case     (case_id),
  KEY ix_files_uploader (uploaded_by),
  CONSTRAINT fk_files_case     FOREIGN KEY (case_id)     REFERENCES cases(id) ON DELETE CASCADE  ON UPDATE CASCADE,
  CONSTRAINT fk_files_uploaded FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------
-- calendar_events
-- --------------------------
CREATE TABLE calendar_events (
  id          INT(11) NOT NULL AUTO_INCREMENT,
  title       VARCHAR(255) NOT NULL,
  event_date  DATE NOT NULL,
  event_time  TIME NOT NULL,
  case_id     INT(11) NULL,
  notes       TEXT NULL,
  created_by  INT(11) NOT NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_events_date_time (event_date, event_time),
  KEY ix_events_case      (case_id),
  KEY ix_events_creator   (created_by),
  CONSTRAINT fk_events_case   FOREIGN KEY (case_id)    REFERENCES cases(id) ON DELETE SET NULL  ON UPDATE CASCADE,
  CONSTRAINT fk_events_user   FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------
-- appointments
-- --------------------------
CREATE TABLE appointments (
  id             INT(11) NOT NULL AUTO_INCREMENT,
  client_id      INT(11) NOT NULL,
  title          VARCHAR(200) NOT NULL,
  preferred_date DATE NOT NULL,
  preferred_time TIME NOT NULL,
  details        TEXT NULL,
  practice_area  VARCHAR(100) NOT NULL,
  status         ENUM('pending','approved','declined','linked','confirmed','done','cancelled') NOT NULL DEFAULT 'pending',
  linked_case_id INT(11) NULL,
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_appt_client (client_id),
  KEY ix_appt_case   (linked_case_id),
  KEY ix_appt_date   (preferred_date, preferred_time),
  CONSTRAINT fk_appt_client FOREIGN KEY (client_id)      REFERENCES users(id)  ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_appt_case   FOREIGN KEY (linked_case_id) REFERENCES cases(id)  ON DELETE SET NULL  ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
