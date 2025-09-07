<?php
// api/diagnose.php
header('Content-Type: application/json');

$out = ['ok' => true];

try {
  require __DIR__ . '/db.php';
  if (!isset($pdo) || !($pdo instanceof PDO)) {
    $pdo = new PDO(
      'mysql:host=localhost;dbname=talampas_app;charset=utf8mb4',
      'root',
      ''
    );
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
  }
  $out['db'] = 'connected';

  // count users
  $out['count_users'] = (int)$pdo->query("SELECT COUNT(*) FROM users")->fetchColumn();

  // fetch admin row
  $stmt = $pdo->prepare("SELECT id, full_name, email, role, status, password_hash FROM users WHERE email=:e LIMIT 1");
  $stmt->execute([':e' => 'admin@talampas.com']);
  $u = $stmt->fetch(PDO::FETCH_ASSOC);

  if ($u) {
    $out['admin'] = [
      'id' => (int)$u['id'],
      'full_name' => $u['full_name'],
      'email' => $u['email'],
      'role' => $u['role'],
      'status' => $u['status'],
      'hash_len' => strlen($u['password_hash']),
      'hash_prefix' => substr($u['password_hash'], 0, 4) // usually $2y$
    ];
    $out['password_verify_admin123'] = password_verify('admin123', $u['password_hash']);
  } else {
    $out['admin'] = null;
  }

  echo json_encode($out);
} catch (Throwable $e) {
  http_response_code(500);
  echo json_encode(['ok' => false, 'error' => $e->getMessage()]);
}
