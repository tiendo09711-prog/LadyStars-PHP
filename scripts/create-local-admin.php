<?php

/**
 * Create or reset local admin after full import.
 * Import SQL truncates users and intentionally does not insert credentials.
 *
 * Env (optional):
 *   ADMIN_EMAIL (default admin@gmail.com)
 *   ADMIN_PASSWORD (default 123456)
 *   ADMIN_NAME (default Admin)
 */
require __DIR__ . '/../backend/vendor/autoload.php';
$app = require __DIR__ . '/../backend/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use App\Models\User;
use Illuminate\Support\Facades\DB;

$email = getenv('ADMIN_EMAIL') ?: 'admin@gmail.com';
$password = getenv('ADMIN_PASSWORD') ?: '123456';
$name = getenv('ADMIN_NAME') ?: 'Admin';

$branchId = DB::table('branches')->orderBy('id')->value('id') ?: 1;

$user = User::withTrashed()->where('email', $email)->first();
if ($user) {
    if (method_exists($user, 'trashed') && $user->trashed()) {
        $user->restore();
    }
    $user->fill([
        'name' => $name,
        'password' => $password,
        'role' => 'ADMIN',
        'status' => 'ACTIVE',
        'branch_id' => $branchId,
        'default_warehouse_id' => $branchId,
        'is_root_owner' => true,
        'is_active' => true,
        'locked_at' => null,
        'token_version' => 0,
    ]);
    $user->save();
    echo "Updated admin: {$email}\n";
} else {
    User::create([
        'mongo_id' => bin2hex(random_bytes(12)),
        'name' => $name,
        'email' => $email,
        'password' => $password,
        'role' => 'ADMIN',
        'status' => 'ACTIVE',
        'branch_id' => $branchId,
        'default_warehouse_id' => $branchId,
        'token_version' => 0,
        'is_root_owner' => true,
        'is_active' => true,
    ]);
    echo "Created admin: {$email}\n";
}

echo 'users: ' . User::count() . PHP_EOL;
