<?php
require __DIR__ . '/db.php';

// show mysqli + pdo + session + db name + current MySQL user
$out = [
  'php_session' => session_id() ? 'ok' : 'missing',
  'mysqli'      => 'ok',
  'pdo'         => 'ok',
  'db_name'     => null,
  'mysql_user'  => null,
];

// mysqli ping + current db + user
if (!$conn->ping()) $out['mysqli'] = 'fail';
$res = $conn->query('SELECT DATABASE() AS db, CURRENT_USER() AS u');
if ($res) { $row = $res->fetch_assoc(); $out['db_name'] = $row['db']; $out['mysql_user'] = $row['u']; }

// pdo quick query
try {
  $pdo->query('SELECT 1');
} catch (Throwable $e) {
  $out['pdo'] = 'fail';
}

header('Content-Type: application/json');
echo json_encode($out);
