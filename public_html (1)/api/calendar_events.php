<?php //CALENDAR EVENT
declare(strict_types=1);
header('Content-Type: application/json');

require __DIR__ . '/db.php';
require __DIR__ . '/auth.php';
require_login();
$user = current_user();
$method = $_SERVER['REQUEST_METHOD'];

function ok($data){ echo json_encode($data, JSON_UNESCAPED_UNICODE); exit; }
function bad($code,$msg){ http_response_code($code); echo json_encode(['error'=>$msg]); exit; }
function json_input(): array { $raw=file_get_contents('php://input'); if(!$raw) return []; $d=json_decode($raw,true); return is_array($d)?$d:[]; }
function to_time_his(string $v): string {
  $v = trim($v);
  $dt = date_create($v);
  if ($dt) return $dt->format('H:i:s');
  if (preg_match('/^\d{2}:\d{2}$/', $v)) return $v . ':00';
  return $v;
}
function parse_case_id($raw){
  if ($raw === null) return null;
  if (is_numeric($raw)) return (int)$raw;
  if (is_string($raw) && preg_match('/\d+/', $raw, $m)) return (int)$m[0];
  return null;
}

try {
  if ($method === 'GET') {
    $from = $_GET['from'] ?? null;
    $to   = $_GET['to']   ?? null;

    $sql = "SELECT id, title, event_date, event_time, case_id, notes, created_at
              FROM calendar_events";
    $vals = [];
    if ($from && $to) {
      $sql .= " WHERE event_date BETWEEN ? AND ?";
      $vals[] = $from; $vals[] = $to;
    }
    $sql .= " ORDER BY event_date ASC, event_time ASC, id ASC";
    $stmt = $pdo->prepare($sql); $stmt->execute($vals);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $items = array_map(function($r){
      $start = trim(($r['event_date'] ?? '') . ' ' . ($r['event_time'] ?? ''));
      return [
        'id' => (int)$r['id'],
        'title' => $r['title'],
        'start_datetime' => trim($start),
        'description' => $r['notes'] ?? null,
        'case_id' => $r['case_id'] !== null ? (int)$r['case_id'] : null,
        'created_at' => $r['created_at'] ?? null,
      ];
    }, $rows);

    ok(['items' => $items]);
  }

  if ($method === 'POST') {
    $in = $_POST ?: json_input();

    $title = trim((string)($in['title'] ?? ''));
    $notes = (string)($in['notes'] ?? ($in['description'] ?? ''));
    $case_id = parse_case_id($in['case_id'] ?? ($in['case_ref'] ?? null));
    $event_date = null;
    $event_time = null;

    if (!empty($in['start_datetime'])) {
      $raw = str_replace('/', '-', (string)$in['start_datetime']);     
      $dt  = date_create($raw);
      if (!$dt) bad(422, 'Invalid start_datetime');
      $event_date = $dt->format('Y-m-d');
      $event_time = $dt->format('H:i:s');
    } else {
      $date_in = (string)($in['event_date'] ?? '');
      $time_in = (string)($in['event_time'] ?? '');
      if ($date_in) {
        $d = date_create(str_replace('/', '-', $date_in));
        if (!$d) bad(422, 'Invalid event_date');
        $event_date = $d->format('Y-m-d');
      }
      if ($time_in) $event_time = to_time_his($time_in);
    }

    if ($title === '' || !$event_date || !$event_time) {
      bad(422, 'title, event_date and event_time are required');
    }

    $stmt = $pdo->prepare("
      INSERT INTO calendar_events (title, event_date, event_time, case_id, notes, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, NOW())
    ");
    $stmt->execute([$title, $event_date, $event_time, $case_id, $notes, $user['id']]);

    ok(['ok'=>true, 'id' => (int)$pdo->lastInsertId()]);
  }

  if ($method === 'DELETE') {
    $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
    if (!$id) bad(400, 'id required');
    $pdo->prepare("DELETE FROM calendar_events WHERE id=?")->execute([$id]);
    ok(['ok'=>true]);
  }

  bad(405, 'Method not allowed');
} catch (Throwable $e) {
  http_response_code(500);
  echo json_encode(['error'=>$e->getMessage()]);
  exit;
}
