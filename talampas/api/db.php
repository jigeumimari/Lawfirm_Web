<?php
// api/db.php (updated for PDO + session bootstrapping)
declare(strict_types=1);

// ---- Database config ----
$DB_HOST = getenv('DB_HOST') ?: '127.0.0.1';
$DB_USER = getenv('DB_USER') ?: 'root';
$DB_PASS = getenv('DB_PASS') ?: '';
$DB_NAME = getenv('DB_NAME') ?: 'talampas_app';
$DB_CHARSET = 'utf8mb4';

// ---- Headers ----
header('Content-Type: application/json; charset=utf-8');

// ---- Sessions (secure defaults; adjust to "Secure" cookies when on HTTPS) ----
if (session_status() === PHP_SESSION_NONE) {
  ini_set('session.cookie_httponly', '1');
  ini_set('session.use_strict_mode', '1');
  ini_set('session.cookie_samesite', 'Lax');
  session_start();
}

// ---- PDO connection ----
try {
  $dsn = "mysql:host={$DB_HOST};dbname={$DB_NAME};charset={$DB_CHARSET}";
  $pdo = new PDO($dsn, $DB_USER, $DB_PASS, [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
  ]);
} catch (Throwable $e) {
  http_response_code(500);
  echo json_encode(['error' => 'DB connection failed', 'detail' => $e->getMessage()]);
  exit;
}

// ---- Basic helpers (optional) ----
function json_input_assoc(): array {
  $raw = file_get_contents('php://input');
  if (!$raw) return [];
  $data = json_decode($raw, true);
  return is_array($data) ? $data : [];
}
