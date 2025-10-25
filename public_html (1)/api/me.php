<?php
declare(strict_types=1);
header('Content-Type: application/json');

session_set_cookie_params([
  'lifetime' => 0, 'path' => '/', 'secure' => isset($_SERVER['HTTPS']),
  'httponly' => true, 'samesite' => 'Lax',
]);
session_start();

require __DIR__ . '/db.php';

if (empty($_SESSION['user_id'])) {
  echo json_encode(['ok' => false, 'error' => 'Not logged in']);
  exit;
}

$st = $pdo->prepare('SELECT id, email, full_name, role FROM users WHERE id=? LIMIT 1');
$st->execute([ (int)$_SESSION['user_id'] ]);
$user = $st->fetch();

echo json_encode(['ok' => (bool)$user, 'user' => $user ?: null]);
