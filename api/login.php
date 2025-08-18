<?php
require 'db.php';

$method = $_SERVER['REQUEST_METHOD'];
if ($method !== 'POST') { echo json_encode(['ok'=>true]); exit; }

$data = json_decode(file_get_contents('php://input'), true);
$email = trim($data['email'] ?? '');
$pass  = $data['password'] ?? '';

$stmt = $conn->prepare("SELECT id, full_name, email, role, status, password_hash FROM users WHERE email=? LIMIT 1");
$stmt->bind_param('s', $email);
$stmt->execute();
$res = $stmt->get_result();
$user = $res->fetch_assoc();

if (!$user || $user['status'] !== 'active' || !password_verify($pass, $user['password_hash'])) {
  http_response_code(401);
  echo json_encode(['error' => 'Invalid credentials']);
  exit;
}

$_SESSION['user'] = [
  'id' => (int)$user['id'],
  'name' => $user['full_name'],
  'email' => $user['email'],
  'role' => $user['role']
];

echo json_encode(['ok'=>true, 'user'=>$_SESSION['user']]);
