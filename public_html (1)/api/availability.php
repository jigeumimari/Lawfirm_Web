<?php
// api/availability.php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

require __DIR__ . '/db.php';
require __DIR__ . '/auth.php';

// Require login
require_login();
$user   = current_user();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$isAdmin = (($user['role'] ?? '') === 'admin');

// Gate ONLY mutating methods (create/update/delete) to admins
if ($method !== 'GET' && !$isAdmin) {
  http_response_code(403);
  echo json_encode(['error' => 'Forbidden – admin access only']);
  exit;
}


// --- Helpers ---
function j($data, int $code = 200) {
  http_response_code($code);
  echo json_encode($data, JSON_UNESCAPED_UNICODE);
  exit;
}

function json_body(): array {
  $raw = file_get_contents('php://input') ?: '';
  $data = json_decode($raw, true);
  return is_array($data) ? $data : [];
}

function s(?string $v): string { return trim((string)$v); }
function hhmm(?string $t): string {
  $t = substr((string)$t, 0, 5);
  if (!preg_match('/^\d{2}:\d{2}$/', $t)) return '';
  return $t;
}

try {
  /* -------------------- GET -------------------- */
  if ($method === 'GET') {
    $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;

    // Treat blank full_name/email as NULL so COALESCE can fall back properly
    $sql = "
      SELECT 
        a.id,
        a.user_id,
        COALESCE(
          NULLIF(TRIM(u.full_name), ''),
          NULLIF(TRIM(u.email), ''),
          CONCAT('User #', a.user_id)
        ) AS employee_name,
        a.date,
        a.from_time,
        a.to_time,
        a.status,
        a.notes
      FROM availability a
      LEFT JOIN users u ON u.id = a.user_id
      WHERE u.role = 'employee'
    ";

    $params = [];
    if ($id > 0) {
      $sql .= " AND a.id = ?";
      $params[] = $id;
    }
    $sql .= " ORDER BY a.date ASC, a.from_time ASC";

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    if ($id > 0 && !$rows) j(['error' => 'Not found'], 404);

    $out = array_map(function ($r) {
      $name = (string)$r['employee_name'];
      return [
        'id'            => (int)$r['id'],
        'user_id'       => (int)$r['user_id'],
        // provide BOTH keys so any frontend expects either will work
        'employee_name' => $name,
        'name'          => $name,
        'date'          => (string)$r['date'],
        'from'          => substr((string)$r['from_time'], 0, 5),
        'to'            => substr((string)$r['to_time'], 0, 5),
        'status'        => (string)$r['status'],
        'notes'         => (string)($r['notes'] ?? '')
      ];
    }, $rows);

    j($id > 0 ? $out[0] : $out);
  }

  /* -------------------- POST (create or update) -------------------- */
  if ($method === 'POST') {
    $b = json_body();

    $id      = isset($b['id']) ? (int)$b['id'] : 0;
    $user_id = isset($b['user_id']) ? (int)$b['user_id'] : 0;
    $date    = s($b['date'] ?? '');
    $from    = hhmm($b['from'] ?? '');
    $to      = hhmm($b['to'] ?? '');
    $status  = s($b['status'] ?? 'Available');
    $notes   = s($b['notes'] ?? '');

    if (!$user_id || !$date || !$from || !$to) {
      j(['error' => 'Missing required fields (user_id, date, from, to)'], 422);
    }

    // Ensure the target user is an employee
    $check = $pdo->prepare("SELECT role FROM users WHERE id = ?");
    $check->execute([$user_id]);
    $role = $check->fetchColumn();
    if ($role !== 'employee') {
      j(['error' => 'Availability can only be added for employees'], 403);
    }

    if (!in_array($status, ['Available', 'Unavailable'], true)) {
      $status = 'Available';
    }

    if ($id > 0) {
      $stmt = $pdo->prepare("
        UPDATE availability
        SET user_id=?, date=?, from_time=?, to_time=?, status=?, notes=?
        WHERE id=?
      ");
      $stmt->execute([$user_id, $date, $from, $to, $status, $notes, $id]);
      j(['ok' => true, 'id' => $id]);
    } else {
      $stmt = $pdo->prepare("
        INSERT INTO availability (user_id, date, from_time, to_time, status, notes)
        VALUES (?, ?, ?, ?, ?, ?)
      ");
      $stmt->execute([$user_id, $date, $from, $to, $status, $notes]);
      $newId = (int)$pdo->lastInsertId();
      j(['ok' => true, 'id' => $newId], 201);
    }
  }

  /* -------------------- DELETE -------------------- */
  if ($method === 'DELETE') {
    $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
    if ($id <= 0) j(['error' => 'Missing id'], 400);
    $stmt = $pdo->prepare("DELETE FROM availability WHERE id=?");
    $stmt->execute([$id]);
    j(['ok' => true]);
  }

  j(['error' => 'Method not allowed'], 405);
} catch (Throwable $e) {
  j(['error' => 'Server error', 'detail' => $e->getMessage()], 500);
}
