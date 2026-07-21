<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

#[Fillable(['mongo_id', 'name', 'email', 'password', 'phone', 'role', 'status', 'branch_id', 'default_warehouse_id', 'created_by_id', 'last_login_at', 'locked_at', 'token_version', 'is_root_owner', 'is_active'])]
#[Hidden(['password', 'remember_token'])]
class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasFactory, Notifiable, SoftDeletes;

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'last_login_at' => 'datetime',
            'locked_at' => 'datetime',
            'is_root_owner' => 'boolean',
            'is_active' => 'boolean',
        ];
    }

    public function isAdminOrRoot(): bool
    {
        return (bool) $this->is_root_owner || strtoupper((string) $this->role) === 'ADMIN';
    }

    /**
     * Local branch PKs this user may operate on (assignment + default + primary branch).
     * Admin/root should not rely on this for full access — check isAdminOrRoot() first.
     *
     * @return array<int, int>
     */
    public function allowedLocalBranchIds(): array
    {
        $ids = [];
        if ($this->default_warehouse_id) {
            $ids[] = (int) $this->default_warehouse_id;
        }
        if ($this->branch_id) {
            $ids[] = (int) $this->branch_id;
        }
        if (Schema::hasTable('user_warehouse_assignments')) {
            $assigned = DB::table('user_warehouse_assignments')
                ->where('user_id', $this->id)
                ->pluck('branch_id')
                ->map(fn ($v) => (int) $v)
                ->all();
            $ids = array_merge($ids, $assigned);
        }

        return array_values(array_unique(array_filter($ids)));
    }
}
