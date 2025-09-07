<?php
// api/auth.php (session-based auth helpers)
declare(strict_types=1);

if (session_status() === PHP_SESSION_NONE) {
  session_start();
}

// Returns the current logged-in user from session.
// Expected fields in session when logged in: uid, full_name, email, role, status
function current_user(): array {
  return [
    'id'     => $_SESSION['uid']    ?? null,
    'full_name' => $_SESSION['full_name'] ?? null,
    'email'  => $_SESSION['email']  ?? null,
    'role'   => $_SESSION['role']   ?? null,   // 'admin' | 'employee' | 'client'
    'status' => $_SESSION['status'] ?? null,
  ];
}

function require_login(): void {
  if (empty($_SESSION['uid'])) {
    http_response_code(401);
    echo json_encode(['error' => 'Unauthenticated']);
    exit;
  }
}

// Optional convenience: check role
function require_role(string ...$roles): void {
  $u = current_user();
  if (!$u['id'] || !in_array($u['role'], $roles, true)) {
    http_response_code(403);
    echo json_encode(['error' => 'Forbidden']);
    exit;
  }
}
