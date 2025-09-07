<?php
// api/cases.php — flexible POST (accepts client_id OR client email/name), safe updates
// tables: cases(id, title, status, client_id, assignee_id, notes, created_by, created_at)

declare(strict_types=1);
header('Content-Type: application/json');

require __DIR__ . '/db.php';   // $pdo
require __DIR__ . '/auth.php'; // require_login(), current_user()

require_login();
$user   = current_user();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

function json_input(): array {
  $raw = file_get_contents('php://input');
  if (!$raw) return [];
  $d = json_decode($raw, true);
  return is_array($d) ? $d : [];
}
function ok($data){ echo json_encode($data, JSON_UNESCAPED_UNICODE); exit; }
function bad($code,$msg){ http_response_code($code); echo json_encode(['error'=>$msg]); exit; }
function is_staff($u){ return in_array($u['role'] ?? '', ['admin','employee'], true); }

function normalize_status($v){
  $allowed = ['new','in_progress','open','closed'];
  $s = strtolower((string)$v);
  if (in_array($s, $allowed, true)) return $s;
  if ($s === '') return 'new';
  if (str_contains($s, 'review') || str_contains($s, 'progress') || str_contains($s, 'pending')) return 'in_progress';
  if (str_contains($s, 'open')) return 'open';
  if (str_contains($s, 'close')) return 'closed';
  return 'new';
}
function find_user_id_by_email(PDO $pdo, string $email): ?int {
  $stmt = $pdo->prepare("SELECT id FROM users WHERE LOWER(email)=LOWER(?) LIMIT 1");
  $stmt->execute([$email]);
  $id = $stmt->fetchColumn();
  return $id ? (int)$id : null;
}
function find_client_id_by_name_or_email(PDO $pdo, string $value): ?int {
  if ($value === '') return null;
  // email exact
  if (str_contains($value, '@')) {
    $stmt = $pdo->prepare("SELECT id FROM users WHERE role='client' AND LOWER(email)=LOWER(?) LIMIT 1");
    $stmt->execute([$value]);
    $id = $stmt->fetchColumn();
    if ($id) return (int)$id;
  }
  // name exact
  $stmt = $pdo->prepare("SELECT id FROM users WHERE role='client' AND LOWER(full_name)=LOWER(?) LIMIT 1");
  $stmt->execute([$value]);
  $id = $stmt->fetchColumn();
  if ($id) return (int)$id;
  // name contains (first)
  $like = '%'.strtolower($value).'%';
  $stmt = $pdo->prepare("SELECT id FROM users WHERE role='client' AND LOWER(full_name) LIKE ? LIMIT 1");
  $stmt->execute([$like]);
  $id = $stmt->fetchColumn();
  return $id ? (int)$id : null;
}

try {
  if ($method === 'GET') {
    if (is_staff($user)) {
      $stmt = $pdo->query("SELECT c.*,
              uc.full_name AS client_name,
              ua.full_name AS assignee_name,
              ucrt.full_name AS created_by_name
            FROM cases c
            LEFT JOIN users uc ON uc.id = c.client_id
            LEFT JOIN users ua ON ua.id = c.assignee_id
            LEFT JOIN users ucrt ON ucrt.id = c.created_by
            ORDER BY c.created_at DESC");
      ok($stmt->fetchAll(PDO::FETCH_ASSOC));
    } else {
      $stmt = $pdo->prepare("SELECT c.*,
              uc.full_name AS client_name,
              ua.full_name AS assignee_name,
              ucrt.full_name AS created_by_name
            FROM cases c
            LEFT JOIN users uc ON uc.id = c.client_id
            LEFT JOIN users ua ON ua.id = c.assignee_id
            LEFT JOIN users ucrt ON ucrt.id = c.created_by
            WHERE c.client_id = ?
            ORDER BY c.created_at DESC");
      $stmt->execute([$user['id']]);
      ok($stmt->fetchAll(PDO::FETCH_ASSOC));
    }
  }

  if ($method === 'POST') {
    if (!is_staff($user)) bad(403, 'Only staff can create cases');
    $in = $_POST ?: json_input();

    $title = trim((string)($in['title'] ?? ''));
    if ($title === '') bad(422, 'title is required');

    // Determine client_id:
    $client_id = 0;
    if (isset($in['client_id'])) {
      $client_id = (int)$in['client_id'];
    } else {
      $clientLookup = trim((string)($in['client_email'] ?? $in['client'] ?? $in['client_name'] ?? ''));
      if ($clientLookup !== '') {
        $cid = find_client_id_by_name_or_email($pdo, $clientLookup);
        if ($cid) $client_id = $cid;
      }
    }
    if ($client_id <= 0) bad(422, 'client_id or client email/name is required');

    // Optional assignee
    $assignee_id = null;
    if (isset($in['assignee_id']) && $in['assignee_id'] !== '') {
      $assignee_id = (int)$in['assignee_id'];
    } elseif (!empty($in['assignee_email'])) {
      $aid = find_user_id_by_email($pdo, (string)$in['assignee_email']);
      if ($aid) $assignee_id = $aid;
    }

    $status = normalize_status($in['status'] ?? 'new');
    $notes  = isset($in['notes']) ? (string)$in['notes'] : null;

    $stmt = $pdo->prepare("INSERT INTO cases (title, status, client_id, assignee_id, notes, created_by, created_at)
                           VALUES (?, ?, ?, ?, ?, ?, NOW())");
    $stmt->execute([$title, $status, $client_id, $assignee_id, $notes, $user['id']]);
    ok(['ok'=>true, 'id'=>$pdo->lastInsertId()]);
  }

  if ($method === 'PUT' || $method === 'PATCH') {
    if (!is_staff($user)) bad(403, 'Only staff can update cases');
    parse_str($_SERVER['QUERY_STRING'] ?? '', $qs);
    $id = (int)($qs['id'] ?? 0);
    if (!$id) bad(400, 'id is required');

    $in = json_input();
    // allow passing client_email or assignee_email
    if (!empty($in['client_email']) && empty($in['client_id'])) {
      $cid = find_client_id_by_name_or_email($pdo, (string)$in['client_email']);
      if ($cid) $in['client_id'] = $cid;
    }
    if (!empty($in['assignee_email']) && empty($in['assignee_id'])) {
      $aid = find_user_id_by_email($pdo, (string)$in['assignee_email']);
      if ($aid) $in['assignee_id'] = $aid;
    }
    if (isset($in['status'])) $in['status'] = normalize_status($in['status']);

    $allowed = ['title','status','client_id','assignee_id','notes'];
    $sets = []; $vals = [];
    foreach ($allowed as $k) {
      if (array_key_exists($k, $in)) { $sets[] = "$k = ?"; $vals[] = $in[$k]; }
    }
    if (!$sets) bad(422, 'No updatable fields provided');
    $vals[] = $id;
    $sql = "UPDATE cases SET ".implode(', ', $sets)." WHERE id = ?";
    $pdo->prepare($sql)->execute($vals);
    ok(['ok'=>true]);
  }

  if ($method === 'DELETE') {
    if (!is_staff($user)) bad(403, 'Only staff can delete cases');
    parse_str($_SERVER['QUERY_STRING'] ?? '', $qs);
    $id = (int)($qs['id'] ?? 0);
    if (!$id) bad(400, 'id is required');
    $pdo->prepare("DELETE FROM cases WHERE id=?")->execute([$id]);
    ok(['ok'=>true]);
  }

  bad(405, 'Method not allowed');
} catch (Throwable $e) {
  http_response_code(500);
  echo json_encode(['error'=>$e->getMessage()]);
  exit;
}

$next_date = $in['next_date'] ?? null; // expected 'YYYY-MM-DD' or null
// ...validate if you like...

$stmt = $pdo->prepare("
  INSERT INTO cases (title, status, client_id, assignee_id, notes, next_date, created_by, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
");
$stmt->execute([$title, $status, $client_id, $assignee_id, $notes, $next_date, $user['id']]);
