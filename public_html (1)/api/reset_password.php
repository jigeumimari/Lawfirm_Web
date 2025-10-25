<?php
// api/reset_password.php
declare(strict_types=1);
header('Content-Type: application/json');

require_once __DIR__ . '/db.php'; // gives $pdo

/* helpers */
function read_json(): array {
  $raw = file_get_contents('php://input');
  $d = json_decode($raw ?: '', true);
  return is_array($d) ? $d : [];
}
function respond($code, array $payload){ http_response_code($code); echo json_encode($payload, JSON_UNESCAPED_SLASHES); exit; }
function ok(array $extra = []){ respond(200, ['ok'=>true] + $extra); }
function bad(string $msg, int $code=400){ respond($code, ['ok'=>false,'error'=>$msg]); }

/* method check */
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
  respond(405, ['ok'=>false, 'error'=>'Method not allowed']);
}

/* input */
$in = read_json();

/* 1) normalize the email you received:
   - lower-case
   - remove surrounding whitespace
   - strip *all* spaces/tabs/nbsp inside (common paste issue) */
$email = strtolower(trim((string)($in['email'] ?? '')));
$email = preg_replace('/[[:space:]\x{00A0}]+/u', '', $email); // remove spaces, tabs, NBSP anywhere

$new = (string)($in['new_password'] ?? '');

if ($email === '' || $new === '') bad('Email and new_password are required.');
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) bad('Invalid email.');
if (strlen($new) < 6) bad('Password must be at least 6 characters.');

/* lookup & update */
try {
  // 2) normalize on the DB side too (trim + remove spaces + lower)
  $stmt = $pdo->prepare("
    SELECT id, status
      FROM users
     WHERE REPLACE(REPLACE(TRIM(LOWER(email)), ' ', ''), CHAR(9), '') = ?
     LIMIT 1
  ");
  $stmt->execute([$email]);
  $u = $stmt->fetch(PDO::FETCH_ASSOC);

  if (!$u) bad('No account found for that email.', 404);
  if (!empty($u['status']) && strtolower($u['status']) !== 'active') {
    bad('Account is inactive.', 403);
  }

  $uid  = (int)$u['id'];
  $hash = password_hash($new, PASSWORD_BCRYPT);

  $upd = $pdo->prepare('UPDATE users SET password_hash = ? WHERE id = ?');
  $upd->execute([$hash, $uid]);

  ok();
} catch (Throwable $e) {
  respond(500, ['ok'=>false, 'error'=>'Server error']);
}
