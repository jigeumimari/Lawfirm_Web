<?php
// api/appointments.php (fixed to match schema in screenshot)
// tables: appointments(id, client_id, title, preferred_date, preferred_time, details, practice_area, status, linked_case_id, created_at)
// users(id, full_name, email, role, status, password_hash, created_at)

declare(strict_types=1);
header('Content-Type: application/json');

require __DIR__ . '/db.php';   // must define $pdo (PDO connection)
require __DIR__ . '/auth.php'; // must define require_login() and current_user()

require_login();
$user = current_user();
$method = $_SERVER['REQUEST_METHOD'];

// ---- helpers ----
function json_input(): array {
    $raw = file_get_contents('php://input');
    if (!$raw) return [];
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}
function ok($data){ echo json_encode($data, JSON_UNESCAPED_UNICODE); exit; }
function bad($code, $msg){ http_response_code($code); echo json_encode(['error'=>$msg]); exit; }
function is_admin_or_employee($u){ return in_array($u['role'] ?? '', ['admin','employee'], true); }

try {
    if ($method === 'GET') {
        // list appointments. clients can only see their own
        if (is_admin_or_employee($user)) {
            $stmt = $pdo->query("SELECT a.*, u.full_name AS client_name
                                 FROM appointments a
                                 JOIN users u ON u.id = a.client_id
                                 ORDER BY a.created_at DESC");
            ok($stmt->fetchAll(PDO::FETCH_ASSOC));
        } else {
            $stmt = $pdo->prepare("SELECT a.*, u.full_name AS client_name
                                   FROM appointments a
                                   JOIN users u ON u.id = a.client_id
                                   WHERE a.client_id = ?
                                   ORDER BY a.created_at DESC");
            $stmt->execute([$user['id']]);
            ok($stmt->fetchAll(PDO::FETCH_ASSOC));
        }
    }

    if ($method === 'POST') {
        $in = $_POST;
        if (empty($in)) { $in = json_input(); }
        // required fields
        $client_id = $in['client_id'] ?? ($user['role']==='client' ? $user['id'] : null);
        if (!$client_id) bad(422, 'client_id is required');
        $title          = trim((string)($in['title'] ?? ''));
        $preferred_date = $in['preferred_date'] ?? null; // YYYY-MM-DD
        $preferred_time = $in['preferred_time'] ?? null; // HH:MM:SS
        $details        = $in['details'] ?? null;
        $practice_area  = $in['practice_area'] ?? null;
        $status         = $in['status'] ?? 'pending';
        $linked_case_id = $in['linked_case_id'] ?? null;

        if ($title === '' || !$preferred_date) bad(422, 'title and preferred_date are required');

        $stmt = $pdo->prepare("INSERT INTO appointments
            (client_id, title, preferred_date, preferred_time, details, practice_area, status, linked_case_id, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())");
        $stmt->execute([$client_id, $title, $preferred_date, $preferred_time, $details, $practice_area, $status, $linked_case_id]);

        ok(['ok'=>true, 'id'=>$pdo->lastInsertId()]);
    }

    if ($method === 'PUT' || $method === 'PATCH') {
        parse_str($_SERVER['QUERY_STRING'] ?? '', $qs);
        $id = (int)($qs['id'] ?? 0);
        if (!$id) bad(400, 'id is required');
        $in = json_input();
        // build dynamic set
        $allowed = ['title','preferred_date','preferred_time','details','practice_area','status','linked_case_id'];
        $sets = [];
        $vals = [];
        foreach ($allowed as $k) {
            if (array_key_exists($k, $in)) {
                $sets[] = "$k = ?";
                $vals[] = $in[$k];
            }
        }
        if (!$sets) bad(422, 'No updatable fields provided');
        $vals[] = $id;
        // permissions: clients can only update their own rows
        if (!is_admin_or_employee($user)) {
            $check = $pdo->prepare("SELECT client_id FROM appointments WHERE id=?");
            $check->execute([$id]);
            $row = $check->fetch(PDO::FETCH_ASSOC);
            if (!$row) bad(404, 'Not found');
            if ((int)$row['client_id'] !== (int)$user['id']) bad(403, 'Forbidden');
        }
        $sql = "UPDATE appointments SET ".implode(', ', $sets)." WHERE id = ?";
        $pdo->prepare($sql)->execute($vals);
        ok(['ok'=>true]);
    }

    if ($method === 'DELETE') {
        parse_str($_SERVER['QUERY_STRING'] ?? '', $qs);
        $id = (int)($qs['id'] ?? 0);
        if (!$id) bad(400, 'id is required');
        // clients can only delete their own requests when still in 'pending' status
        if (!is_admin_or_employee($user)) {
            $check = $pdo->prepare("SELECT client_id, status FROM appointments WHERE id=?");
            $check->execute([$id]);
            $row = $check->fetch(PDO::FETCH_ASSOC);
            if (!$row) bad(404, 'Not found');
            if ((int)$row['client_id'] !== (int)$user['id']) bad(403, 'Forbidden');
            if ($row['status'] !== 'pending') bad(409, 'Only pending appointments can be cancelled by client');
        }
        $pdo->prepare("DELETE FROM appointments WHERE id=?")->execute([$id]);
        ok(['ok'=>true]);
    }

    bad(405, 'Method not allowed');
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
    exit;
}
