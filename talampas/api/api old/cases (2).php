<?php
// api/cases.php (fixed to match schema)
// tables: cases(id, title, status, client_id, assignee_id, notes, created_by, created_at)

declare(strict_types=1);
header('Content-Type: application/json');

require __DIR__ . '/db.php';   // defines $pdo
require __DIR__ . '/auth.php'; // require_login(), current_user()

require_login();
$user = current_user();
$method = $_SERVER['REQUEST_METHOD'];

function json_input(): array {
    $raw = file_get_contents('php://input');
    if (!$raw) return [];
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}
function ok($data){ echo json_encode($data, JSON_UNESCAPED_UNICODE); exit; }
function bad($code, $msg){ http_response_code($code); echo json_encode(['error'=>$msg]); exit; }
function is_staff($u){ return in_array($u['role'] ?? '', ['admin','employee'], true); }

try {
    if ($method === 'GET') {
        // client sees only their cases; staff see all
        if (is_staff($user)) {
            $stmt = $pdo->query("SELECT c.*, uc.full_name AS client_name, ua.full_name AS assignee_name, ucrt.full_name AS created_by_name
                                 FROM cases c
                                 LEFT JOIN users uc ON uc.id = c.client_id
                                 LEFT JOIN users ua ON ua.id = c.assignee_id
                                 LEFT JOIN users ucrt ON ucrt.id = c.created_by
                                 ORDER BY c.created_at DESC");
            ok($stmt->fetchAll(PDO::FETCH_ASSOC));
        } else {
            $stmt = $pdo->prepare("SELECT c.*, uc.full_name AS client_name, ua.full_name AS assignee_name, ucrt.full_name AS created_by_name
                                   FROM cases c
                                   LEFT JOIN users uc ON uc.id = c.client_id
                                   LEFT JOIN users ua ON ua.id = c.assignee_id
                                   LEFT JOIN users ucrt ON ucrt.id = c.created_by
                                   WHERE c.client_id = ?
                                   ORDER BY c.created_at DESC");
            $stmt->execute([$user['id']]);
            ok($stmt->fetchAll(PDO::FETCH_ASSOC));
        }
    }

    if ($method === 'POST') {
        if (!is_staff($user)) bad(403, 'Only staff can create cases');
        $in = $_POST; if (empty($in)) $in = json_input();
        $title = trim((string)($in['title'] ?? ''));
        $client_id = (int)($in['client_id'] ?? 0);
        $assignee_id = $in['assignee_id'] ?? null;
        $status = $in['status'] ?? 'new';
        $notes  = $in['notes'] ?? null;
        if ($title === '' || !$client_id) bad(422, 'title and client_id are required');
        $stmt = $pdo->prepare("INSERT INTO cases (title, status, client_id, assignee_id, notes, created_by, created_at)
                               VALUES (?, ?, ?, ?, ?, ?, NOW())");
        $stmt->execute([$title, $status, $client_id, $assignee_id, $notes, $user['id']]);
        ok(['ok'=>true, 'id'=>$pdo->lastInsertId()]);
    }

    if ($method === 'PUT' || $method === 'PATCH') {
        if (!is_staff($user)) bad(403, 'Only staff can update cases');
        parse_str($_SERVER['QUERY_STRING'] ?? '', $qs);
        $id = (int)($qs['id'] ?? 0);
        if (!$id) bad(400, 'id is required');
        $in = json_input();
        $allowed = ['title','status','client_id','assignee_id','notes'];
        $sets = []; $vals = [];
        foreach ($allowed as $k) {
            if (array_key_exists($k, $in)) { $sets[] = "$k = ?"; $vals[] = $in[$k]; }
        }
        if (!$sets) bad(422, 'No updatable fields provided');
        $vals[] = $id;
        $sql = "UPDATE cases SET ".implode(', ', $sets)." WHERE id = ?";
        $pdo->prepare($sql)->execute($vals);
        ok(['ok'=>true]);
    }

    if ($method === 'DELETE') {
        if (!is_staff($user)) bad(403, 'Only staff can delete cases');
        parse_str($_SERVER['QUERY_STRING'] ?? '', $qs);
        $id = (int)($qs['id'] ?? 0);
        if (!$id) bad(400, 'id is required');
        $pdo->prepare("DELETE FROM cases WHERE id=?")->execute([$id]);
        ok(['ok'=>true]);
    }

    bad(405, 'Method not allowed');
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['error'=>$e->getMessage()]);
    exit;
}
