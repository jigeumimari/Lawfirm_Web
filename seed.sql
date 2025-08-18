USE talampas_app;

-- Demo users (bcrypt hashes for: admin123 / emp123 / client123)
INSERT INTO users (full_name, email, role, password_hash, status) VALUES
('A. Administrator', 'admin@talampas.com',  'admin',   '$2b$10$/V4Xe2JAEuUj0CcuTyeGQeiJBI7AoVA8iXHBTy1uvZfOGhEAvMXBG', 'active'),
('E. Employee',      'emp@talampas.com',    'employee','$2b$10$fPrboNzQ3QYLvTvmyw6bZezwsDglbkYU7qfSPPAvQoolsurSpZKvu', 'active'),
('C. Client',        'client@talampas.com', 'client',  '$2b$10$FfQxdJwFPe96Wk/NQpae5.KWNXpa.Jngshfa9IhqD9C2C5sIOycPa', 'active');

-- One sample case (client -> employee)
INSERT INTO cases (case_number, client_id, practice_area, status, next_date, assignee_id, progress_pct, notes, created_by)
SELECT 'TA-2025-0001', c.id, 'Family Law', 'Open', DATE_ADD(CURDATE(), INTERVAL 14 DAY), e.id, 25,
       'Initial intake completed. Awaiting documents.', a.id
FROM users a, users e, users c
WHERE a.email='admin@talampas.com' AND e.email='emp@talampas.com' AND c.email='client@talampas.com'
LIMIT 1;

-- Appointment request from client
INSERT INTO appointments (client_id, preferred_date, preferred_time, phone_country, phone_local, appointment_type, case_type, notes, consent_given, status)
SELECT c.id, DATE_ADD(CURDATE(), INTERVAL 3 DAY), '10:30:00', '+63', '09171234567', 'In-Office', 'Family Law',
       'Consult re: custody matter', TRUE, 'Requested'
FROM users c WHERE c.email='client@talampas.com';

-- Sample thread (client <-> employee)
INSERT INTO threads (title, created_by)
SELECT 'Consultation: Family Law', c.id FROM users c WHERE c.email='client@talampas.com';

-- Add participants
INSERT INTO thread_participants (thread_id, user_id)
SELECT t.id, u.id
FROM threads t
JOIN users u ON u.email IN ('client@talampas.com','emp@talampas.com')
WHERE t.title='Consultation: Family Law';

-- Seed messages
INSERT INTO messages (thread_id, sender_id, body)
SELECT t.id, u.id, 'Hello, I would like to discuss custody.' 
FROM threads t JOIN users u ON u.email='client@talampas.com'
WHERE t.title='Consultation: Family Law';

INSERT INTO messages (thread_id, sender_id, body)
SELECT t.id, u.id, 'Received. Let’s schedule you this week.' 
FROM threads t JOIN users u ON u.email='emp@talampas.com'
WHERE t.title='Consultation: Family Law';

-- Calendar example (linked to case)
INSERT INTO calendar_events (title, event_date, event_time, case_id, notes, created_by)
SELECT 'Initial Meeting', DATE_ADD(CURDATE(), INTERVAL 5 DAY), '09:00:00', cs.id, 'Bring IDs and documents', a.id
FROM cases cs, users a WHERE cs.case_number='TA-2025-0001' AND a.email='admin@talampas.com';
