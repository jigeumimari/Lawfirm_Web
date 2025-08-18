-- MySQL 8.x
-- Create database 
CREATE DATABASE IF NOT EXISTS talampas_app CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE talampas_app;

-- ---------- USERS ----------
CREATE TABLE users (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  full_name     VARCHAR(200)    NOT NULL,
  email         VARCHAR(200)    NOT NULL,
  role          ENUM('admin','employee','client') NOT NULL,
  password_hash VARCHAR(255)    NOT NULL,
  status        ENUM('active','suspended') NOT NULL DEFAULT 'active',
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_users_email (email)
) ENGINE=InnoDB;

-- ---------- CASES ----------
CREATE TABLE cases (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  case_number     VARCHAR(32)  NOT NULL,            -- human-friendly (e.g., TA-2025-0001)
  client_id       BIGINT UNSIGNED NOT NULL,         -- FK -> users(id), role = client
  practice_area   ENUM('Family Law','Criminal Case','Insurance Law','Labor & Employment','Immigration','Others') NOT NULL,
  status          ENUM('Pending Review','Open','On Hold','Closed') NOT NULL DEFAULT 'Pending Review',
  next_date       DATE NULL,
  assignee_id     BIGINT UNSIGNED NULL,             -- FK -> users(id), role = employee (or admin)
  progress_pct    TINYINT UNSIGNED NOT NULL DEFAULT 0,  -- 0,25,50,75,100
  notes           TEXT NULL,
  created_by      BIGINT UNSIGNED NOT NULL,         -- creator user id
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_cases_case_number (case_number),
  KEY ix_cases_client (client_id),
  KEY ix_cases_assignee (assignee_id),
  KEY ix_cases_next_date (next_date),
  CONSTRAINT fk_cases_client   FOREIGN KEY (client_id)  REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_cases_assignee FOREIGN KEY (assignee_id)REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_cases_creator  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB;

-- ---------- CASE FILES / ATTACHMENTS ----------
CREATE TABLE case_files (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  case_id    BIGINT UNSIGNED NOT NULL,
  file_name  VARCHAR(255) NOT NULL,       -- original filename
  file_path  VARCHAR(500) NOT NULL,       -- where you store it (S3/local)
  mime_type  VARCHAR(100) NOT NULL,
  uploaded_by BIGINT UNSIGNED NOT NULL,
  uploaded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_case_files_case (case_id),
  CONSTRAINT fk_case_files_case FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_case_files_user FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB;

-- ---------- CALENDAR EVENTS ----------
CREATE TABLE calendar_events (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  title       VARCHAR(200) NOT NULL,
  event_date  DATE NOT NULL,
  event_time  TIME NOT NULL,
  case_id     BIGINT UNSIGNED NULL,        -- optional link to case
  notes       TEXT NULL,
  created_by  BIGINT UNSIGNED NOT NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_events_date (event_date),
  KEY ix_events_case (case_id),
  CONSTRAINT fk_events_case   FOREIGN KEY (case_id)   REFERENCES cases(id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_events_author FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB;

-- ---------- MESSAGING (THREADS & MESSAGES) ----------
CREATE TABLE threads (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  title       VARCHAR(200) NOT NULL,
  created_by  BIGINT UNSIGNED NOT NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_threads_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE TABLE thread_participants (
  thread_id BIGINT UNSIGNED NOT NULL,
  user_id   BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (thread_id, user_id),
  CONSTRAINT fk_tp_thread FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_tp_user   FOREIGN KEY (user_id)   REFERENCES users(id)   ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE TABLE messages (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  thread_id   BIGINT UNSIGNED NOT NULL,
  sender_id   BIGINT UNSIGNED NOT NULL,
  body        TEXT NOT NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  is_read     BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (id),
  KEY ix_messages_thread (thread_id, created_at),
  KEY ix_messages_unread (thread_id, is_read),
  CONSTRAINT fk_messages_thread FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_messages_sender FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB;

-- ---------- APPOINTMENT REQUESTS (Client) ----------
CREATE TABLE appointments (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  client_id        BIGINT UNSIGNED NOT NULL,
  preferred_date   DATE NOT NULL,
  preferred_time   TIME NOT NULL,
  phone_country    VARCHAR(8) NOT NULL,         -- e.g. +63
  phone_local      VARCHAR(20) NOT NULL,        -- exactly 11 digits for PH per UI
  appointment_type ENUM('In-Office','Online Meet','Phone Call') NOT NULL,
  case_type        ENUM('Family Law','Criminal Case','Insurance Law','Labor & Employment','Immigration','Others') NOT NULL,
  notes            TEXT NULL,
  consent_given    BOOLEAN NOT NULL DEFAULT FALSE,
  status           ENUM('Requested','Confirmed','Cancelled','Completed') NOT NULL DEFAULT 'Requested',
  linked_case_id   BIGINT UNSIGNED NULL,        -- optional after admin approves
  created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_appt_client (client_id),
  KEY ix_appt_status (status),
  CONSTRAINT fk_appt_client FOREIGN KEY (client_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_appt_case   FOREIGN KEY (linked_case_id) REFERENCES cases(id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB;

-- ---------- ACTIVITY FEED (for Dashboard "Recent Activity") ----------
CREATE TABLE activity_log (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  actor_id    BIGINT UNSIGNED NOT NULL,
  action      VARCHAR(100) NOT NULL,   -- e.g., 'CASE_CREATED','MESSAGE_SENT','APPOINTMENT_REQUESTED'
  entity_type VARCHAR(50)  NOT NULL,   -- 'case','event','message','appointment','user'
  entity_id   BIGINT UNSIGNED NOT NULL,
  details     JSON NULL,               -- arbitrary context
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_activity_entity (entity_type, entity_id),
  KEY ix_activity_actor (actor_id, created_at),
  CONSTRAINT fk_activity_actor FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB;
