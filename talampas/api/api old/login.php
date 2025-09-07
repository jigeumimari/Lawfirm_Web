<?php
// api/login.php
require __DIR__.'/db.php';
header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
  http_response_code(405);
  echo json_encode(['ok'=>false,'error'=>'Method not allowed']);
  exit;
}

$raw = file_get_contents('php://input');
$body = json_decode($raw, true) ?: [];
$email = trim(strtolower($body['email'] ?? ''));
$pass  = (string)($body['password'] ?? '');

if ($email === '' || $pass === '') {
  http_response_code(400);
  echo json_encode(['ok'=>false,'error'=>'Email and password are required']);
  exit;
}

try {
  // fetch by email
  $stmt = $pdo->prepare("SELECT id, full_name, email, role, status, password_hash FROM users WHERE email = :e LIMIT 1");
  $stmt->execute([':e'=>$email]);
  $u = $stmt->fetch(PDO::FETCH_ASSOC);

  if (!$u || $u['status'] !== 'active' || !password_verify($pass, $u['password_hash'])) {
    http_response_code(401);
    echo json_encode(['ok'=>false,'error'=>'Invalid credentials']);
    exit;
  }

  // start session & store ID
  if (session_status() === PHP_SESSION_NONE) {
    // good cookie defaults
    ini_set('session.cookie_httponly', 1);
    ini_set('session.use_strict_mode', 1);
    ini_set('session.cookie_samesite', 'Lax');
    // if your app is under /talampas, you can also:
    // ini_set('session.cookie_path', '/talampas');
    session_start();
  }
  $_SESSION['user_id'] = (int)$u['id'];

  // IMPORTANT: Map to the keys your JS expects
  $user = [
    'id'    => (int)$u['id'],
    'name'  => $u['full_name'],   // <-- map full_name -> name
    'email' => $u['email'],
    'role'  => $u['role'],
  ];

  echo json_encode(['ok'=>true, 'user'=>$user]);
} catch (Throwable $e) {
  http_response_code(500);
  echo json_encode(['ok'=>false,'error'=>'Server error']);
}
