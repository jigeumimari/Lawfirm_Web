<?php
require 'db.php';
require 'auth.php';
require_login();

$method = $_SERVER['REQUEST_METHOD'];
$u = current_user();

if ($method === 'GET') {
  $threadId = (int)($_GET['thread_id'] ?? 0);
  if (!$threadId) { http_response_code(400); echo json_encode(['error'=>'thread_id required']); exit; }

  // ensure user is a participant
  $chk = $conn->prepare("SELECT 1 FROM thread_participants WHERE thread_id=? AND user_id=?");
  $chk->bind_param('ii', $threadId, $u['id']);
  $chk->execute();
  if (!$chk->get_result()->fetch_row()) { http_response_code(403); echo json_encode(['error'=>'Not a participant']); exit; }

  $stmt = $conn->prepare("SELECT m.*, u.full_name AS sender_name FROM messages m JOIN users u ON u.id=m.sender_id WHERE m.thread_id=? ORDER BY m.created_at ASC");
  $stmt->bind_param('i', $threadId);
  $stmt->execute();
  echo json_encode(['messages'=>$stmt->get_result()->fetch_all(MYSQLI_ASSOC)]);
  exit;
}

if ($method === 'POST') {
  $d = json_decode(file_get_contents('php://input'), true);
  $threadId = (int)($d['thread_id'] ?? 0);
  $body     = trim($d['body'] ?? '');

  if (!$threadId || $body==='') { http_response_code(400); echo json_encode(['error'=>'Invalid payload']); exit; }

  $chk = $conn->prepare("SELECT 1 FROM thread_participants WHERE thread_id=? AND user_id=?");
  $chk->bind_param('ii', $threadId, $u['id']);
  $chk->execute();
  if (!$chk->get_result()->fetch_row()) { http_response_code(403); echo json_encode(['error'=>'Not a participant']); exit; }

  $stmt = $conn->prepare("INSERT INTO messages (thread_id, sender_id, body) VALUES (?,?,?)");
  $stmt->bind_param('iis', $threadId, $u['id'], $body);
  if (!$stmt->execute()) { http_response_code(400); echo json_encode(['error'=>'Send failed']); exit; }
  echo json_encode(['ok'=>true,'message_id'=>$conn->insert_id]);
  exit;
}

http_response_code(405);
