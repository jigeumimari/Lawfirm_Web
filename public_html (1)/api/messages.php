<?php
//ME
declare(strict_types=1);
header('Content-Type: application/json');

require __DIR__ . '/db.php';
require __DIR__ . '/auth.php';
require_login();
$user = current_user();
$method = $_SERVER['REQUEST_METHOD'];

// helpers
function json_input(): array {
  $raw = file_get_contents('php://input');
  if (!$raw) return [];
  $d = json_decode($raw, true);
  return is_array($d) ? $d : [];
}
function ok($data){ echo json_encode($data, JSON_UNESCAPED_UNICODE); exit; }
function bad($code,$msg){ http_response_code($code); echo json_encode(['error'=>$msg]); exit; }
function is_staff($u){ return in_array($u['role'] ?? '', ['admin','employee'], true); }

function assert_participant(PDO $pdo, int $thread_id, int $user_id): void {
  $chk = $pdo->prepare("SELECT 1 FROM thread_participants WHERE thread_id=? AND user_id=?");
  $chk->execute([$thread_id, $user_id]);
  if (!$chk->fetchColumn()) { bad(403, 'Forbidden'); }
}

try {
  if ($method === 'GET') {
    $thread_id = isset($_GET['thread_id']) ? (int)$_GET['thread_id'] : 0;
    if (!$thread_id) bad(400, 'thread_id is required');
    assert_participant($pdo, $thread_id, (int)$user['id']);

    $stmt = $pdo->prepare("SELECT m.*, u.full_name AS sender_name, u.role AS sender_role
                           FROM messages m
                           JOIN users u ON u.id = m.sender_id
                           WHERE m.thread_id = ?
                           ORDER BY m.id ASC");
    $stmt->execute([$thread_id]);
    ok($stmt->fetchAll(PDO::FETCH_ASSOC));
  }

  if ($method === 'POST') {
     
    $in = $_POST ?: json_input();
    $thread_id = (int)($in['thread_id'] ?? 0);
    $body = trim((string)($in['body'] ?? ''));
    if (!$thread_id || $body==='') bad(422, 'thread_id and body required');

    assert_participant($pdo, $thread_id, (int)$user['id']);
    $stmt = $pdo->prepare("INSERT INTO messages (thread_id, sender_id, body) VALUES (?, ?, ?)");
    $stmt->execute([$thread_id, (int)$user['id'], $body]);
    ok(['ok'=>true, 'id'=>$pdo->lastInsertId()]);
  }

  if ($method === 'DELETE') {
    $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
    if (!$id) bad(400, 'id is required');
    $stmt = $pdo->prepare("SELECT m.id, m.thread_id, m.sender_id FROM messages m WHERE m.id=?");
    $stmt->execute([$id]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row) bad(404, 'Not found');

    assert_participant($pdo, (int)$row['thread_id'], (int)$user['id']);
    if ((int)$row['sender_id'] !== (int)$user['id'] && !is_staff($user)) {
      bad(403, 'Forbidden');
    }

    $pdo->prepare("DELETE FROM messages WHERE id=?")->execute([$id]);
    ok(['ok'=>true]);
  }

  bad(405, 'Method not allowed');
} catch (Throwable $e) {
  http_response_code(500);
  echo json_encode(['error'=>$e->getMessage()]);
  exit;
}
