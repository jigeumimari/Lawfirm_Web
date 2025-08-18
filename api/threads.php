<?php
require 'db.php';
require 'auth.php';
require_login();

$method = $_SERVER['REQUEST_METHOD'];
$u = current_user();

if ($method === 'GET') {
  $stmt = $conn->prepare("
    SELECT t.*
    FROM threads t
    JOIN thread_participants p ON p.thread_id = t.id
    WHERE p.user_id = ?
    ORDER BY t.created_at DESC
  ");
  $stmt->bind_param('i', $u['id']);
  $stmt->execute();
  echo json_encode(['threads'=>$stmt->get_result()->fetch_all(MYSQLI_ASSOC)]);
  exit;
}

if ($method === 'POST') {
  $d = json_decode(file_get_contents('php://input'), true);
  $conn->begin_transaction();
  try {
    $stmt = $conn->prepare("INSERT INTO threads (title, created_by) VALUES (?,?)");
    $stmt->bind_param('si', $d['title'], $u['id']);
    $stmt->execute();
    $threadId = $conn->insert_id;

    // participants: me + others
    $participants = array_unique(array_map('intval', $d['participants'] ?? []));
    $participants[] = (int)$u['id'];
    $stmtP = $conn->prepare("INSERT IGNORE INTO thread_participants (thread_id, user_id) VALUES (?,?)");
    foreach ($participants as $pid) {
      $stmtP->bind_param('ii', $threadId, $pid);
      $stmtP->execute();
    }

    $conn->commit();
    echo json_encode(['ok'=>true,'thread_id'=>$threadId]);
  } catch (Throwable $e) {
    $conn->rollback();
    http_response_code(400);
    echo json_encode(['error'=>'Create failed']);
  }
  exit;
}

http_response_code(405);
