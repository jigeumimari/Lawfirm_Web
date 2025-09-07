<?php
require __DIR__ . '/db.php';
$stmt = $pdo->query("SHOW COLUMNS FROM users");
$cols = $stmt->fetchAll(PDO::FETCH_ASSOC);
header('Content-Type: application/json');
echo json_encode($cols, JSON_PRETTY_PRINT);
