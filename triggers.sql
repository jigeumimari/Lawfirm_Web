USE talampas_app;

-- When a new case is created, log activity
DROP TRIGGER IF EXISTS trg_cases_after_insert;
DELIMITER //
CREATE TRIGGER trg_cases_after_insert
AFTER INSERT ON cases
FOR EACH ROW
BEGIN
  INSERT INTO activity_log (actor_id, action, entity_type, entity_id, details)
  VALUES (NEW.created_by, 'CASE_CREATED', 'case', NEW.id,
          JSON_OBJECT('case_number', NEW.case_number, 'client_id', NEW.client_id));
END//
DELIMITER ;

-- When an appointment is created, log activity
DROP TRIGGER IF EXISTS trg_appt_after_insert;
DELIMITER //
CREATE TRIGGER trg_appt_after_insert
AFTER INSERT ON appointments
FOR EACH ROW
BEGIN
  INSERT INTO activity_log (actor_id, action, entity_type, entity_id, details)
  VALUES (NEW.client_id, 'APPOINTMENT_REQUESTED', 'appointment', NEW.id,
          JSON_OBJECT('preferred_date', NEW.preferred_date, 'preferred_time', NEW.preferred_time, 'type', NEW.appointment_type));
END//
DELIMITER ;

-- When a message is sent, log activity
DROP TRIGGER IF EXISTS trg_messages_after_insert;
DELIMITER //
CREATE TRIGGER trg_messages_after_insert
AFTER INSERT ON messages
FOR EACH ROW
BEGIN
  INSERT INTO activity_log (actor_id, action, entity_type, entity_id, details)
  VALUES (NEW.sender_id, 'MESSAGE_SENT', 'message', NEW.id,
          JSON_OBJECT('thread_id', NEW.thread_id));
END//
DELIMITER ;
