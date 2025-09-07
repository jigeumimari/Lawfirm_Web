<?php
// api/cases.php
require __DIR__ . '/db.php';

header('Content-Type: application/json');

// unify session → $me
$me = $_SESSION['user'] ?? null;
if (!$me && !empty($_SESSION['uid'])) {
  $me = [
    'id'    => (int)($_SESSION['uid']),
    'role'  => $_SESSION['role'] ?? 'client',
    'email' => $_SESSION['email'] ?? null,
    'name'  => $_SESSION['full_name'] ?? null,
  ];
}
if (!$me) { http_response_code(401); echo json_encode(['ok'=>false,'error'=>'Unauthenticated']); exit; }

$method = $_SERVER['REQUEST_METHOD'];

try {
  if ($method === 'GET') {
    // Role-aware listing
    if ($me['role'] === 'client') {
      $stmt = $pdo->prepare("
        SELECT id, title, status, client_id, assignee_id, notes, created_at
        FROM cases
        WHERE client_id = :id
        ORDER BY id DESC
      ");
      $stmt->execute([':id' => $me['id']]);
    } elseif ($me['role'] === 'employee') {
      $stmt = $pdo->prepare("
        SELECT id, title, status, client_id, assignee_id, notes, created_at
        FROM cases
        WHERE assignee_id = :id
        ORDER BY id DESC
      ");
      $stmt->execute([':id' => $me['id']]);
    } else { // admin
      $stmt = $pdo->query("
        SELECT id, title, status, client_id, assignee_id, notes, created_at
        FROM cases
        ORDER BY id DESC
      ");
    }

    $rows = $stmt->fetchAll();
    echo json_encode(['ok'=>true, 'items'=>$rows]); exit;
  }

  if ($method === 'POST') {
    // Create a case
    $raw  = file_get_contents('php://input');
    $body = json_decode($raw, true) ?: $_POST;

    $title       = trim($body['title'] ?? '');
    $notes       = trim($body['notes'] ?? '');
    $status      = 'new';
    $created_by  = (int)$me['id'];

    // client_id rules: client defaults to self; admin/employee can specify
    if (!empty($body['client_id'])) {
      $client_id = (int)$body['client_id'];
    } else {
      $client_id = (int)$me['id'];
    }

    // assignee may be null
    $assignee_id = isset($body['assignee_id']) && $body['assignee_id'] !== ''
      ? (int)$body['assignee_id']
      : null;

    if ($title === '') {
      http_response_code(400);
      echo json_encode(['ok'=>false,'error'=>'Missing title']); exit;
    }

    $stmt = $pdo->prepare("
      INSERT INTO cases (title, status, client_id, assignee_id, notes, created_by, created_at)
      VALUES (:title, :status, :client_id, :assignee_id, :notes, :created_by, NOW())
    ");
    $stmt->bindValue(':title', $title);
    $stmt->bindValue(':status', $status);
    $stmt->bindValue(':client_id', $client_id, PDO::PARAM_INT);
    if ($assignee_id === null) {
      $stmt->bindValue(':assignee_id', null, PDO::PARAM_NULL);
    } else {
      $stmt->bindValue(':assignee_id', $assignee_id, PDO::PARAM_INT);
    }
    $stmt->bindValue(':notes', $notes);
    $stmt->bindValue(':created_by', $created_by, PDO::PARAM_INT);
    $stmt->execute();

    echo json_encode(['ok'=>true, 'id'=>$pdo->lastInsertId()]); exit;
  }

  http_response_code(405);
  echo json_encode(['ok'=>false,'error'=>'Method not allowed']); exit;

} catch (Throwable $e) {
  http_response_code(500);
  echo json_encode(['ok'=>false,'error'=>$e->getMessage()]); exit;
}
