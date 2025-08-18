<?php
require 'db.php';
require 'auth.php';

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
  // List cases; admin/employee see all, client sees own
  $u = current_user();
  if (!$u) { require_login(); }

  if ($u['role'] === 'client') {
    $stmt = $conn->prepare("
      SELECT c.*, u1.full_name AS client_name, u2.full_name AS assignee_name
      FROM cases c
      JOIN users u1 ON u1.id = c.client_id
      LEFT JOIN users u2 ON u2.id = c.assignee_id
      WHERE c.client_id = ?
      ORDER BY c.created_at DESC
    ");
    $stmt->bind_param('i', $u['id']);
  } else {
    $stmt = $conn->prepare("
      SELECT c.*, u1.full_name AS client_name, u2.full_name AS assignee_name
      FROM cases c
      JOIN users u1 ON u1.id = c.client_id
      LEFT JOIN users u2 ON u2.id = c.assignee_id
      ORDER BY c.created_at DESC
    ");
  }
  $stmt->execute();
  $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
  echo json_encode(['cases' => $rows]);
  exit;
}

if ($method === 'POST') {
  // Create/update case (admin/employee)
  require_login(); require_role(['admin','employee']);
  $data = json_decode(file_get_contents('php://input'), true);

  $isUpdate = !empty($data['id']);
  if ($isUpdate) {
    $stmt = $conn->prepare("
      UPDATE cases
      SET practice_area=?, status=?, next_date=?, assignee_id=?, progress_pct=?, notes=?, updated_at=NOW()
      WHERE id=?
    ");
    $next = $data['next_date'] ?: null;
    $assignee = !empty($data['assignee_id']) ? (int)$data['assignee_id'] : null;
    $stmt->bind_param(
      'sssii si',
      $data['practice_area'],
      $data['status'],
      $next,
      $assignee,
      $data['progress_pct'],
      $data['notes'],
      $data['id']
    );
  } else {
    // generate case_number (simple example)
    $caseNum = 'TA-' . date('Y') . '-' . str_pad((string)rand(1,9999), 4, '0', STR_PAD_LEFT);
    $stmt = $conn->prepare("
      INSERT INTO cases (case_number, client_id, practice_area, status, next_date, assignee_id, progress_pct, notes, created_by)
      VALUES (?,?,?,?,?,?,?,?,?)
    ");
    $next = $data['next_date'] ?: null;
    $assignee = !empty($data['assignee_id']) ? (int)$data['assignee_id'] : null;
    $creator = current_user()['id'];
    $status = $data['status'] ?? 'Pending Review';
    $progress = (int)($data['progress_pct'] ?? 0);
    $stmt->bind_param(
      'sisssii si',
      $caseNum,
      $data['client_id'],
      $data['practice_area'],
      $status,
      $next,
      $assignee,
      $progress,
      $data['notes'],
      $creator
    );
  }
  if (!$stmt->execute()) {
    http_response_code(400);
    echo json_encode(['error'=>'Query failed']);
    exit;
  }
  echo json_encode(['ok'=>true]);
  exit;
}

http_response_code(405);
