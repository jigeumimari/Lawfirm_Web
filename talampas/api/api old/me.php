<?php
// api/me.php
require __DIR__ . '/db.php';
header('Content-Type: application/json');

if (session_status() !== PHP_SESSION_ACTIVE) session_start();

if (!isset($_SESSION['user'])) {
  http_response_code(401);
  echo json_encode(['ok' => false, 'error' => 'Not logged in']);
  exit;
}

echo json_encode(['ok' => true, 'user' => $_SESSION['user']]);
