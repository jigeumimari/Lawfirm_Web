<?php
// api/login.php (updated)
declare(strict_types=1);

require __DIR__ . '/db.php';
require __DIR__ . '/auth.php';
header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
  http_response_code(405);
  echo json_encode(['error' => 'Method not allowed']);
  exit;
}

// Accept JSON or form
$body = [];
if (!empty($_POST)) {
  $body = $_POST;
} else {
  $raw = file_get_contents('php://input');
  $body = json_decode($raw, true) ?: [];
}

$email = strtolower(trim((string)($body['email'] ?? '')));
$pass  = (string)($body['password'] ?? '');

if ($email === '' || $pass === '') {
  http_response_code(422);
  echo json_encode(['error' => 'Email and password are required']);
  exit;
}

try {
  // Only active users may log in
  $stmt = $pdo->prepare("SELECT id, full_name, email, role, status, password_hash FROM users WHERE email = ? LIMIT 1");
  $stmt->execute([$email]);
  $u = $stmt->fetch(PDO::FETCH_ASSOC);

  if (!$u || !password_verify($pass, $u['password_hash'])) {
    http_response_code(401);
    echo json_encode(['error' => 'Invalid email or password']);
    exit;
  }
  if (($u['status'] ?? 'inactive') !== 'active') {
    http_response_code(403);
    echo json_encode(['error' => 'Account is inactive']);
    exit;
  }

  // Session: set fields expected by the rest of the API
  $_SESSION['uid']       = (int)$u['id'];
  $_SESSION['full_name'] = $u['full_name'];
  $_SESSION['email']     = $u['email'];
  $_SESSION['role']      = $u['role'];   // 'admin' | 'employee' | 'client'
  $_SESSION['status']    = $u['status']; // 'active' | 'inactive'

  echo json_encode([
    'ok'   => true,
    'user' => [
      'id'     => (int)$u['id'],
      'name'   => $u['full_name'],  // frontend expects "name"
      'email'  => $u['email'],
      'role'   => $u['role'],
      'status' => $u['status'],
    ]
  ]);
} catch (Throwable $e) {
  http_response_code(500);
  echo json_encode(['error' => 'Server error', 'detail' => $e->getMessage()]);
  exit;
}
