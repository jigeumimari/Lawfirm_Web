<?php
declare(strict_types=1);
header('Content-Type: application/json');
session_start();

require __DIR__ . '/db.php';

function out($a){ echo json_encode($a); exit; }

$isPdo   = isset($pdo)  && $pdo  instanceof PDO;
$isMySQL = isset($conn) && $conn instanceof mysqli;
if (!$isPdo && !$isMySQL) out(['ok'=>false,'error'=>'No database connection.']);

/* ---------- helpers ---------- */
function post_arr(): array {
  $ct = strtolower($_SERVER['CONTENT_TYPE'] ?? '');
  if (strpos($ct,'application/json') !== false) {
    $j = json_decode(file_get_contents('php://input'), true);
    return is_array($j) ? $j : [];
  }
  return $_POST;
}
function has_col(string $table, string $col): bool {
  static $cache = [];
  $k = $table.':'.$col;
  if (isset($cache[$k])) return $cache[$k];
  global $pdo,$conn,$isPdo,$isMySQL;
  $cols = [];
  $sql = "SHOW COLUMNS FROM `$table`";
  if ($isPdo) {
    foreach ($pdo->query($sql) as $r) $cols[strtolower($r['Field'])] = true;
  } else {
    if ($res = $conn->query($sql)) while ($r = $res->fetch_assoc()) $cols[strtolower($r['Field'])] = true;
  }
  return $cache[$k] = isset($cols[strtolower($col)]);
}

$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');

/* ---------- auth ---------- */
$uid  = (int)($_SESSION['user_id'] ?? 0);
$role = strtolower((string)($_SESSION['role'] ?? ''));
$client_name =
  ($_SESSION['full_name'] ?? $_SESSION['name'] ?? $_SESSION['email'] ?? 'Client');

if ($method === 'GET') {
  if (!$uid) out(['ok'=>false,'data'=>[]]);

  // Only columns that exist in your table (per screenshot)
  // id, client_id, title, practice_area, appointment_type, details,
  // preferred_date, preferred_time, status, created_at, linked_case_id (optional)
  $select = "
    SELECT
      id,
      client_id,
      IFNULL(NULLIF(title,''), CONCAT(:client_name, ' — Appointment Request')) AS title,
      practice_area,
      appointment_type,
      details,
      preferred_date,
      preferred_time,
      IFNULL(status,'pending') AS status,
      created_at
      ".(has_col('appointments','linked_case_id') ? ", linked_case_id" : "")."
    FROM appointments
  ";

  if ($role === 'client') {
    $sql  = $select . " WHERE client_id = :uid ORDER BY created_at DESC LIMIT 500";
    if ($isPdo) {
      $stmt = $pdo->prepare($sql);
      $stmt->execute(['client_name'=>$client_name, 'uid'=>$uid]);
      $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
    } else {
      $stmt = $conn->prepare("SELECT id,client_id,
         IFNULL(NULLIF(title,''), CONCAT(?,' — Appointment Request')) AS title,
         practice_area,appointment_type,details,preferred_date,preferred_time,
         IFNULL(status,'pending') AS status,created_at".
         (has_col('appointments','linked_case_id') ? ", linked_case_id" : "").
         " FROM appointments WHERE client_id=? ORDER BY created_at DESC LIMIT 500");
      $stmt->bind_param('si', $client_name, $uid);
      $stmt->execute(); $res = $stmt->get_result(); $rows = $res->fetch_all(MYSQLI_ASSOC);
    }
  } else {
    $sql  = $select . " ORDER BY created_at DESC LIMIT 500";
    if ($isPdo) {
      $stmt = $pdo->prepare($sql);
      $stmt->execute(['client_name'=>$client_name]);
      $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
    } else {
      $stmt = $conn->prepare("SELECT id,client_id,
         IFNULL(NULLIF(title,''), CONCAT(?,' — Appointment Request')) AS title,
         practice_area,appointment_type,details,preferred_date,preferred_time,
         IFNULL(status,'pending') AS status,created_at".
         (has_col('appointments','linked_case_id') ? ", linked_case_id" : "").
         " FROM appointments ORDER BY created_at DESC LIMIT 500");
      $stmt->bind_param('s', $client_name);
      $stmt->execute(); $res = $stmt->get_result(); $rows = $res->fetch_all(MYSQLI_ASSOC);
    }
  }

  out(['ok'=>true,'data'=>$rows]);
}

/* ---------- POST (create / set_status) ---------- */
if ($method === 'POST') {
  if (!$uid) out(['ok'=>false,'error'=>'Not logged in']);

  $b = post_arr();
  $action = strtolower(trim($b['action'] ?? ''));

  /* ---- create ticket ---- */
  if ($action === '' || in_array($action, ['add','create','book'], true)) {
      // ---- Prevent booking in the past (server-side) ----
// If your app is in PH, uncomment the next line:
// date_default_timezone_set('Asia/Manila');

$preferred_date = trim($body['preferred_date'] ?? '');
$preferred_time = trim($body['preferred_time'] ?? '');

if ($preferred_date === '' || $preferred_time === '') {
  echo json_encode(['ok'=>false,'error'=>'Preferred date and time are required.']); exit;
}

// Build a DateTime from date+time (assumes server local TZ)
try {
  $when = new DateTime($preferred_date . ' ' . $preferred_time . ':00');
} catch (Throwable $e) {
  echo json_encode(['ok'=>false,'error'=>'Invalid date/time.']); exit;
}

// Compare to "now" with a tiny grace
$now = new DateTime();
if ($when < $now) {
  echo json_encode(['ok'=>false,'error'=>'Selected date/time is already in the past.']); exit;
}

    $practice_area    = trim((string)($b['practice_area']    ?? ''));
    $preferred_date   = trim((string)($b['preferred_date']   ?? ''));
    $preferred_time   = trim((string)($b['preferred_time']   ?? ''));
    $appointment_type = trim((string)($b['appointment_type'] ?? 'In-Office'));
    $details          = trim((string)($b['details']          ?? ''));
    $status           = 'pending';
    $title            = $client_name . ' — Appointment Request';

    if ($preferred_date === '' || $preferred_time === '') {
      out(['ok'=>false,'error'=>'Missing date/time']);
    }

    // limits
    // 1) per-user max 3 active (pending/accepted)
    if ($isPdo) {
      $stmt = $pdo->prepare("SELECT COUNT(*) FROM appointments WHERE client_id=? AND status IN ('pending','accepted')");
      $stmt->execute([$uid]); $cntUser = (int)$stmt->fetchColumn();
    } else {
      $stmt = $conn->prepare("SELECT COUNT(*) AS c FROM appointments WHERE client_id=? AND status IN ('pending','accepted')");
      $stmt->bind_param('i',$uid); $stmt->execute(); $res=$stmt->get_result(); $cntUser=(int)$res->fetch_assoc()['c'];
    }
    if ($cntUser >= 3) out(['ok'=>false,'error'=>'You already have 3 active bookings.']);

    // 2) per-day max 30 active
    if ($isPdo) {
      $stmt = $pdo->prepare("SELECT COUNT(*) FROM appointments WHERE preferred_date=? AND status IN ('pending','accepted')");
      $stmt->execute([$preferred_date]); $cntDay = (int)$stmt->fetchColumn();
    } else {
      $stmt = $conn->prepare("SELECT COUNT(*) AS c FROM appointments WHERE preferred_date=? AND status IN ('pending','accepted')");
      $stmt->bind_param('s',$preferred_date); $stmt->execute(); $res=$stmt->get_result(); $cntDay=(int)$res->fetch_assoc()['c'];
    }
    if ($cntDay >= 30) out(['ok'=>false,'error'=>'Date is fully booked.']);

    // insert
    if ($isPdo) {
      $sql = "INSERT INTO appointments
              (client_id, title, practice_area, appointment_type, details, preferred_date, preferred_time, status, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())";
      $stmt = $pdo->prepare($sql);
      $stmt->execute([$uid,$title,$practice_area,$appointment_type,$details,$preferred_date,$preferred_time,$status]);
      out(['ok'=>true,'id'=>$pdo->lastInsertId()]);
    } else {
      $sql = "INSERT INTO appointments
              (client_id, title, practice_area, appointment_type, details, preferred_date, preferred_time, status, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())";
      $stmt = $conn->prepare($sql);
      if(!$stmt) out(['ok'=>false,'error'=>$conn->error]);
      $stmt->bind_param('isssssss', $uid,$title,$practice_area,$appointment_type,$details,$preferred_date,$preferred_time,$status);
      if(!$stmt->execute()) out(['ok'=>false,'error'=>$stmt->error]);
      out(['ok'=>true,'id'=>$conn->insert_id]);
    }
  }

  /* ---- set status (admin/employee) ---- */
  if ($action === 'set_status') {
    if (!in_array($role, ['admin','employee'], true)) out(['ok'=>false,'error'=>'Forbidden']);
    $id = (int)($b['id'] ?? 0);
    $new = strtolower(trim((string)($b['status'] ?? '')));
    if ($id <= 0 || !in_array($new, ['accepted','rejected','pending'], true)) {
      out(['ok'=>false,'error'=>'Invalid parameters']);
    }

    $set = "status=?";
    $args = [$new, $id];
    if (isset($b['linked_case_id']) && has_col('appointments','linked_case_id')) {
      $set .= ", linked_case_id=?";
      array_splice($args, 1, 0, [(int)$b['linked_case_id']]);
    }

    if ($isPdo) {
      $pdo->prepare("UPDATE appointments SET $set WHERE id=?")->execute($args);
      out(['ok'=>true]);
    } else {
      if (strpos($set,'linked_case_id') !== false) {
        $stmt = $conn->prepare("UPDATE appointments SET status=?, linked_case_id=? WHERE id=?");
        $stmt->bind_param('sii', $args[0], $args[1], $args[2]);
      } else {
        $stmt = $conn->prepare("UPDATE appointments SET status=? WHERE id=?");
        $stmt->bind_param('si', $args[0], $args[1]);
      }
      if(!$stmt->execute()) out(['ok'=>false,'error'=>$stmt->error]);
      out(['ok'=>true]);
    }
  }

  out(['ok'=>false,'error'=>'Unsupported action']);
}

/* ---------- fallback ---------- */
out(['ok'=>false,'error'=>'Unsupported method']);
