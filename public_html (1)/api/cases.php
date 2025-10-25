<?php
declare(strict_types=1);
header('Content-Type: application/json');
session_start();
require __DIR__ . '/db.php';

if (empty($_SESSION['user_id'])) { echo json_encode(['ok'=>false,'data'=>[]]); exit; }

try {
  /* Adjust column names to your actual table. These aliases match the frontend:
     - client_name | client | client_fullname | client_email
     - status | case_status
     - id | case_no | case_number
     - updated_at | modified_at | created_at
  */
  $sql = "SELECT
            id,
            COALESCE(client_name, client_fullname, client, client_email) AS client_name,
            COALESCE(status, case_status) AS status,
            COALESCE(updated_at, modified_at, created_at) AS updated_at,
            COALESCE(case_number, case_no, id) AS case_number
          FROM cases
          ORDER BY COALESCE(updated_at, modified_at, created_at) DESC
          LIMIT 500";
  $rows = $pdo->query($sql)->fetchAll();
  echo json_encode(['ok'=>true, 'data'=>$rows]);
} catch (Throwable $e) {
  // If table/columns differ, return empty so UI keeps working
  echo json_encode(['ok'=>true, 'data'=>[]]);
}
