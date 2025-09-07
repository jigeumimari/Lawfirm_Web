<?php
// api/auth.php
function current_user() {
  if (empty($_SESSION['uid'])) return null;
  return [
    'id'    => intval($_SESSION['uid']),
    'name'  => $_SESSION['full_name'] ?? '',
    'email' => $_SESSION['email'] ?? '',
    'role'  => $_SESSION['role'] ?? 'client',
    'status'=> $_SESSION['status'] ?? 'active',
  ];
}

function require_login() {
  if (empty($_SESSION['uid'])) {
    http_response_code(401);
    echo json_encode(['error' => 'Unauthenticated']);
    exit;
  }
}
