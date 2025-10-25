<?php
declare(strict_types=1);
header('Content-Type: application/json');

// Hostinger-safe cookie params
session_set_cookie_params([
  'lifetime' => 0,
  'path'     => '/',
  'secure'   => isset($_SERVER['HTTPS']),
  'httponly' => true,
  'samesite' => 'Lax',
]);
session_start();

require __DIR__ . '/db.php';

function indata(): array {
  $ctype = $_SERVER['CONTENT_TYPE'] ?? '';
  if (stripos($ctype, 'application/json') !== false) {
    $raw = file_get_contents('php://input');
    $d = json_decode($raw, true);
    return is_array($d) ? $d : [];
  }
  return $_POST; // FormData fallback
}

try {
  $in    = indata();
  $email = trim(strtolower((string)($in['email'] ?? '')));
  $pass  = (string)($in['password'] ?? '');

  if ($email === '' || $pass === '') {
    http_response_code(400);
    echo json_encode(['error' => 'Email and password are required']); exit;
  }

  $st = $pdo->prepare('SELECT id, full_name, email, role, status, password_hash FROM users WHERE email=? LIMIT 1');
  $st->execute([$email]);
  $u = $st->fetch();

  if (!$u) { echo json_encode(['error' => 'Invalid credentials']); exit; }
  if (($u['status'] ?? 'inactive') !== 'active') {
    echo json_encode(['error' => 'Account disabled']); exit;
  }

  $stored = (string)($u['password_hash'] ?? '');
  $ok = false;

  // bcrypt/argon?
  if ($stored !== '' && preg_match('/^\$(2[aby]|argon2id)\$/', $stored)) {
    $ok = password_verify($pass, $stored);
  } else {
    // legacy plaintext in password_hash
    $ok = hash_equals($stored, $pass);
    if ($ok) {
      $new = password_hash($pass, PASSWORD_DEFAULT);
      $up  = $pdo->prepare('UPDATE users SET password_hash=? WHERE id=?');
      $up->execute([$new, (int)$u['id']]);
    }
  }

  if (!$ok) { echo json_encode(['error' => 'Invalid credentials']); exit; }

  $_SESSION['user_id'] = (int)$u['id'];
  $_SESSION['role']    = $u['role'] ?? 'client';

  echo json_encode([
    'ok'   => true,
    'user' => [
      'id'        => (int)$u['id'],
      'email'     => $u['email'],
      'full_name' => $u['full_name'] ?? '',
      'role'      => $u['role'] ?? 'client'
    ]
  ]);
} catch (Throwable $e) {
  http_response_code(500);
  echo json_encode(['error' => 'Server error']);
}
