<?php
// api/me.php - return current session user
declare(strict_types=1);
require __DIR__ . '/db.php';
require __DIR__ . '/auth.php';
header('Content-Type: application/json');

if (empty($_SESSION['uid'])) {
  echo json_encode(['ok'=>false, 'user'=>null]);
  exit;
}

echo json_encode(['ok'=>true, 'user'=>current_user()]);
