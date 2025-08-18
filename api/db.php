<?php
// XAMPP defaults: user=root, pass=""
$DB_HOST = 'localhost';
$DB_USER = 'root';
$DB_PASS = '';
$DB_NAME = 'talampas_app';

$conn = new mysqli($DB_HOST, $DB_USER, $DB_PASS, $DB_NAME);
if ($conn->connect_error) {
    http_response_code(500);
    echo json_encode(['error' => 'DB connection failed']);
    exit;
}
$conn->set_charset('utf8mb4');

header('Content-Type: application/json');
session_start();
