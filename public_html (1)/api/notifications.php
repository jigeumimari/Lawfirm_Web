<?php
declare(strict_types=1);
header('Content-Type: application/json');
session_start();
require __DIR__ . '/db.php';

if (empty($_SESSION['user_id'])) {
  echo json_encode(['ok'=>false,'data'=>[]]); exit;
}

try {
  // Only admins/employees see all pending
  $role = strtolower($_SESSION['role'] ?? '');
  $uid  = (int)$_SESSION['user_id'];

  if (in_array($role, ['admin','employee'])) {
    $stmt = $pdo->query("SELECT id, title, preferred_date, preferred_time, practice_area, created_at
                         FROM appointments
                         WHERE status='pending'
                         ORDER BY created_at DESC
                         LIMIT 50");
  } else {
    // clients only see their own
    $stmt = $pdo->prepare("SELECT id, title, preferred_date, preferred_time, practice_area, created_at
                           FROM appointments
                           WHERE client_id=? AND status='pending'
                           ORDER BY created_at DESC");
    $stmt->execute([$uid]);
  }

  $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
  echo json_encode(['ok'=>true,'data'=>$rows]);
} catch (Throwable $e) {
  echo json_encode(['ok'=>false,'error'=>$e->getMessage()]);
}
