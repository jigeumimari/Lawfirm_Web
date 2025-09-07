<?php
require 'db.php';
require 'auth.php';
require_login();

$method = $_SERVER['REQUEST_METHOD'];
$u = current_user();

if ($method === 'GET') {
  if ($u['role'] === 'client') {
    $stmt = $conn->prepare("SELECT * FROM appointments WHERE client_id=? ORDER BY created_at DESC");
    $stmt->bind_param('i', $u['id']);
  } else {
    $stmt = $conn->prepare("SELECT a.*, u.full_name AS client_name FROM appointments a JOIN users u ON u.id=a.client_id ORDER BY a.created_at DESC");
  }
  $stmt->execute();
  $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
  echo json_encode(['appointments'=>$rows]); exit;
}

if ($method === 'POST') {
  // client creates request
  if ($u['role'] !== 'client') { http_response_code(403); echo json_encode(['error'=>'Clients only']); exit; }
  $d = json_decode(file_get_contents('php://input'), true);
  $stmt = $conn->prepare("
    INSERT INTO appointments (client_id, preferred_date, preferred_time, phone_country, phone_local, appointment_type, case_type, notes, consent_given)
    VALUES (?,?,?,?,?,?,?,?,?)
  ");
  $consent = !empty($d['consent_given']) ? 1 : 0;
  $stmt->bind_param('isssssssi',
    $u['id'], $d['preferred_date'], $d['preferred_time'], $d['phone_country'], $d['phone_local'],
    $d['appointment_type'], $d['case_type'], $d['notes'], $consent
  );
  if (!$stmt->execute()) { http_response_code(400); echo json_encode(['error'=>'Insert failed']); exit; }
  echo json_encode(['ok'=>true]); exit;
}

if ($method === 'PATCH') {
  // admin/employee updates status or links to case
  require_role(['admin','employee']);
  $d = json_decode(file_get_contents('php://input'), true);
  $stmt = $conn->prepare("UPDATE appointments SET status=?, linked_case_id=? WHERE id=?");
  $linked = !empty($d['linked_case_id']) ? (int)$d['linked_case_id'] : null;
  $stmt->bind_param('sii', $d['status'], $linked, $d['id']);
  if (!$stmt->execute()) { http_response_code(400); echo json_encode(['error'=>'Update failed']); exit; }
  echo json_encode(['ok'=>true]); exit;
}

http_response_code(405);
