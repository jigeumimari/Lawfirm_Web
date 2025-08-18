<?php
require 'db.php';
require 'auth.php';
require_login();

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
  $from = $_GET['from'] ?? date('Y-m-01');
  $to   = $_GET['to']   ?? date('Y-m-t');
  $stmt = $conn->prepare("SELECT * FROM calendar_events WHERE event_date BETWEEN ? AND ? ORDER BY event_date, event_time");
  $stmt->bind_param('ss', $from, $to);
  $stmt->execute();
  $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
  echo json_encode(['events'=>$rows]); exit;
}

if ($method === 'POST') {
  require_role(['admin','employee']);
  $d = json_decode(file_get_contents('php://input'), true);
  $stmt = $conn->prepare("INSERT INTO calendar_events (title, event_date, event_time, case_id, notes, created_by) VALUES (?,?,?,?,?,?)");
  $caseId = !empty($d['case_id']) ? (int)$d['case_id'] : null;
  $creator = current_user()['id'];
  $stmt->bind_param('sssisi', $d['title'], $d['event_date'], $d['event_time'], $caseId, $d['notes'], $creator);
  if (!$stmt->execute()) { http_response_code(400); echo json_encode(['error'=>'Insert failed']); exit; }
  echo json_encode(['ok'=>true]); exit;
}

http_response_code(405);
