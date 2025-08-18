<?php
function require_login() {
  if (empty($_SESSION['user'])) {
    http_response_code(401);
    echo json_encode(['error' => 'Unauthenticated']);
    exit;
  }
}

function current_user() {
  return $_SESSION['user'] ?? null;
}

function require_role($roles = []) {
  $u = current_user();
  if (!$u || !in_array($u['role'], $roles, true)) {
    http_response_code(403);
    echo json_encode(['error' => 'Forbidden']);
    exit;
  }
}
