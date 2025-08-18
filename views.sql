USE talampas_app;

-- Dashboard metrics: open case count, upcoming events (7d), unread messages per user
CREATE OR REPLACE VIEW v_open_cases AS
  SELECT COUNT(*) AS total_open
  FROM cases
  WHERE status IN ('Pending Review','Open');

CREATE OR REPLACE VIEW v_upcoming_events_7d AS
  SELECT COUNT(*) AS upcoming_7d
  FROM calendar_events
  WHERE event_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 7 DAY);

-- Unread messages per user across their threads
CREATE OR REPLACE VIEW v_unread_messages_per_user AS
SELECT p.user_id,
       COUNT(m.id) AS unread_count
FROM thread_participants p
JOIN messages m ON m.thread_id = p.thread_id AND m.is_read = FALSE
GROUP BY p.user_id;

-- Client progress list (for "My Case Progress" card)
CREATE OR REPLACE VIEW v_client_case_progress AS
SELECT c.client_id,
       c.id AS case_id,
       c.case_number,
       c.practice_area,
       c.progress_pct,
       c.status,
       COALESCE(c.next_date, NULL) AS next_date
FROM cases c;
