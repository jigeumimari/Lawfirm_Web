<?php
// api/users.php
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
function is_staff($u){ return in_array($u['role'] ?? '', ['admin','employee'], true); }

try {
  if ($method === 'GET') {
    if (!is_staff($user)) bad(403,'Forbidden');
    $role = $_GET['role'] ?? null;
    $sql = "SELECT id, full_name, email, role, status, created_at FROM users";
    $vals = [];
    if ($role) { $sql .= " WHERE role = ?"; $vals[] = $role; }
    $sql .= " ORDER BY created_at DESC";
    $stmt = $pdo->prepare($sql); $stmt->execute($vals);
    ok($stmt->fetchAll(PDO::FETCH_ASSOC));
  }

  if ($method === 'POST') {
    if (!is_staff($user)) bad(403,'Forbidden');
    $in = $_POST ?: json_input();
    $full_name = trim((string)($in['full_name'] ?? ''));
    $email = strtolower(trim((string)($in['email'] ?? '')));
    $role = $in['role'] ?? 'client';
    $status = $in['status'] ?? 'active';
    $password = (string)($in['password'] ?? '');
    if ($full_name==='' || $email==='' || $password==='') bad(422,'full_name, email, password required');
    $hash = password_hash($password, PASSWORD_BCRYPT);
    $stmt = $pdo->prepare("INSERT INTO users (full_name, email, role, status, password_hash, created_at) VALUES (?, ?, ?, ?, ?, NOW())");
    $stmt->execute([$full_name, $email, $role, $status, $hash]);
    ok(['ok'=>true, 'id'=>$pdo->lastInsertId()]);
  }

  if ($method === 'PUT' || $method === 'PATCH') {
    if (!is_staff($user)) bad(403,'Forbidden');
    parse_str($_SERVER['QUERY_STRING'] ?? '', $qs);
    $id = (int)($qs['id'] ?? 0);
    if (!$id) bad(400,'id is required');
    $in = json_input();
    $allowed = ['full_name','email','role','status','password'];
    $sets=[]; $vals=[];
    foreach ($allowed as $k){
      if (!array_key_exists($k,$in)) continue;
      if ($k==='password'){ $sets[] = "password_hash = ?"; $vals[] = password_hash((string)$in['password'], PASSWORD_BCRYPT); }
      else { $sets[] = "$k = ?"; $vals[] = $in[$k]; }
    }
    if (!$sets) bad(422,'No updatable fields provided');
    $vals[] = $id;
    $sql = "UPDATE users SET ".implode(', ',$sets)." WHERE id = ?";
    $pdo->prepare($sql)->execute($vals);
    ok(['ok'=>true]);
  }

  if ($method === 'DELETE') {
    if (!is_staff($user)) bad(403,'Forbidden');
    $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
    if (!$id) bad(400,'id is required');
    if ($id === (int)$user['id']) bad(409,'Cannot delete yourself');
    $pdo->prepare("DELETE FROM users WHERE id=?")->execute([$id]);
    ok(['ok'=>true]);
  }

  bad(405,'Method not allowed');
} catch (Throwable $e) {
  http_response_code(500);
  echo json_encode(['error'=>$e->getMessage()]);
  exit;
}
