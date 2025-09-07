<?php
require __DIR__ . '/db.php';            // gives us $pdo (not $conn)
header('Content-Type: application/json');

$email = 'admin@talampas.com';
$pass  = 'admin123';

try {
  $stmt = $pdo->prepare("SELECT id, email, password_hash FROM users WHERE email = :e LIMIT 1");
  $stmt->execute([':e' => strtolower(trim($email))]);
  $u = $stmt->fetch();

  echo json_encode([
    'found_user'  => (bool)$u,
    'hash_prefix' => $u ? substr($u['password_hash'], 0, 4) : null, // should be "$2y$"
    'verify'      => $u ? password_verify($pass, $u['password_hash']) : null
  ]);
} catch (Throwable $e) {
  http_response_code(500);
  echo json_encode(['ok'=>false,'error'=>$e->getMessage()]);
}
