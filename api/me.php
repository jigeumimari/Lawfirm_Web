<?php
require 'db.php';
require 'auth.php';
require_login();

echo json_encode(['user' => current_user()]);
