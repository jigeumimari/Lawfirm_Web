<?php
require __DIR__ . '/db.php';

// The plain password to hash (replace if you want others)
$password = 'admin123';
$email    = 'admin@talampas.com';

$hash = password_hash($password, PASSWORD_DEFAULT);

$stmt = $pdo->prepare("UPDATE users SET password_hash = ? WHERE email = ?");
$stmt->execute([$hash, $email]);

echo "✅ Password hash updated for {$email}<br>";
echo "Hash: {$hash}";
