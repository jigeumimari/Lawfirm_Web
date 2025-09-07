<?php
// api/db.php
declare(strict_types=1);

$DB_HOST = 'localhost';
$DB_USER = 'root';
$DB_PASS = '';
$DB_NAME = 'talampas_app';

header('Content-Type: application/json; charset=utf-8');

// secure-ish cookies (adjust for HTTPS in prod)
ini_set('session.cookie_httponly', '1');
ini_set('session.use_strict_mode', '1');
ini_set('session.cookie_samesite', 'Lax');

if (session_status() === PHP_SESSION_NONE) {
  session_start();
}

try {
  $pdo = new PDO(
    "mysql:host=$DB_HOST;dbname=$DB_NAME;charset=utf8mb4",
    $DB_USER,
    $DB_PASS,
    [
      PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
      PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]
  );
} catch (Throwable $e) {
  http_response_code(500);
  echo json_encode(['ok'=>false, 'error'=>'DB connection failed', 'detail'=>$e->getMessage()]);
  exit;
}
