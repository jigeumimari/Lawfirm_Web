<?php
// api/threads.php
// Conversation threads with participants.
// Tables suggested:
//   threads(id INT PK AI, title VARCHAR(255) NULL, is_closed TINYINT(1) DEFAULT 0, created_by INT NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)
//   thread_participants(thread_id INT, user_id INT, PRIMARY KEY(thread_id,user_id))
//   messages(id INT PK AI, thread_id INT NOT NULL, sender_id INT NOT NULL, body TEXT NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)
// Indexes recommended on (thread_id), (sender_id), (created_at)

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

try {
  if ($method === 'GET') {
    // List threads the current user participates in.
    // ?q= search in title or last message
    $q = trim((string)($_GET['q'] ?? ''));
    $sql = "SELECT t.*,
              u.full_name AS created_by_name,
              (SELECT m.body FROM messages m WHERE m.thread_id=t.id ORDER BY m.id DESC LIMIT 1) AS last_message,
              (SELECT m.created_at FROM messages m WHERE m.thread_id=t.id ORDER BY m.id DESC LIMIT 1) AS last_message_at
            FROM threads t
            JOIN thread_participants tp ON tp.thread_id=t.id
            JOIN users u ON u.id = t.created_by
            WHERE tp.user_id = ?";
    $vals = [$user['id']];
    if ($q !== '') {
      $sql .= " AND (t.title LIKE ? OR EXISTS (SELECT 1 FROM messages mx WHERE mx.thread_id=t.id AND mx.body LIKE ?))";
      $vals[] = "%$q%"; $vals[] = "%$q%";
    }
    $sql .= " ORDER BY COALESCE(last_message_at, t.created_at) DESC";
    $stmt = $pdo->prepare($sql);
    $stmt->execute($vals);
    ok($stmt->fetchAll(PDO::FETCH_ASSOC));
  }

  if ($method === 'POST') {
    // Create a new thread.
    // Input: { title?:string, participants: number[] }
    // participants must include at least one other user; current user is auto-included.
    $in = $_POST ?: json_input();
    $title = isset($in['title']) ? trim((string)$in['title']) : null;
    $participants = $in['participants'] ?? [];
    if (!is_array($participants)) $participants = [];
    $participants = array_values(array_unique(array_map('intval', $participants)));
    // ensure current user included
    if (!in_array((int)$user['id'], $participants, true)) $participants[] = (int)$user['id'];
    // must have at least 2 distinct users
    if (count($participants) < 2) bad(422, 'At least 2 participants are required');

    // Create thread
    $pdo->beginTransaction();
    try {
      $stmt = $pdo->prepare("INSERT INTO threads (title, created_by) VALUES (?, ?)");
      $stmt->execute([$title, $user['id']]);
      $tid = (int)$pdo->lastInsertId();

      $tp = $pdo->prepare("INSERT INTO thread_participants (thread_id, user_id) VALUES (?, ?)");
      foreach ($participants as $uid) { $tp->execute([$tid, (int)$uid]); }

      $pdo->commit();
      ok(['ok'=>true, 'id'=>$tid]);
    } catch (Throwable $e) {
      $pdo->rollBack();
      throw $e;
    }
  }

  if ($method === 'PUT' || $method === 'PATCH') {
    // Update thread title or close/open
    parse_str($_SERVER['QUERY_STRING'] ?? '', $qs);
    $id = (int)($qs['id'] ?? 0);
    if (!$id) bad(400, 'id is required');
    // Only participants can update basic info; staff can also close/open
    $chk = $pdo->prepare("SELECT 1 FROM thread_participants WHERE thread_id=? AND user_id=?");
    $chk->execute([$id, $user['id']]);
    if (!$chk->fetchColumn()) bad(403, 'Forbidden');

    $in = json_input();
    $allowed = ['title','is_closed'];
    $sets=[]; $vals=[];
    foreach ($allowed as $k) {
      if (array_key_exists($k, $in)) { $sets[] = "$k = ?"; $vals[] = $in[$k]; }
    }
    if (!$sets) bad(422, 'No updatable fields provided');
    $vals[] = $id;
    $sql = "UPDATE threads SET ".implode(', ', $sets)." WHERE id = ?";
    $pdo->prepare($sql)->execute($vals);
    ok(['ok'=>true]);
  }

  if ($method === 'DELETE') {
    // Only staff can hard-delete; others cannot
    if (!is_staff($user)) bad(403, 'Only staff can delete threads');
    $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
    if (!$id) bad(400, 'id is required');

    $pdo->beginTransaction();
    try {
      $pdo->prepare("DELETE FROM messages WHERE thread_id=?")->execute([$id]);
      $pdo->prepare("DELETE FROM thread_participants WHERE thread_id=?")->execute([$id]);
      $pdo->prepare("DELETE FROM threads WHERE id=?")->execute([$id]);
      $pdo->commit();
      ok(['ok'=>true]);
    } catch (Throwable $e) {
      $pdo->rollBack(); throw $e;
    }
  }

  bad(405, 'Method not allowed');
} catch (Throwable $e) {
  http_response_code(500);
  echo json_encode(['error'=>$e->getMessage()]);
  exit;
}
