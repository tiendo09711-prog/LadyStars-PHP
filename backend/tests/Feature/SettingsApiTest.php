<?php

namespace Tests\Feature;

use App\Models\MirrorRecord;
use App\Models\User;
use App\Support\LocalToken;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class SettingsApiTest extends TestCase
{
    use RefreshDatabase;

    private User $rootOwner;
    private User $admin;
    private User $employee;

    protected function setUp(): void
    {
        parent::setUp();

        $this->rootOwner = User::factory()->create([
            'name' => 'Root Owner',
            'email' => 'root-settings@example.test',
            'password' => 'OwnerPass123!',
            'role' => 'ADMIN',
            'status' => 'ACTIVE',
            'is_root_owner' => true,
            'is_active' => true,
        ]);
        $this->admin = User::factory()->create([
            'name' => 'Settings Admin',
            'email' => 'admin-settings@example.test',
            'password' => 'AdminPass123!',
            'role' => 'ADMIN',
            'status' => 'ACTIVE',
            'is_root_owner' => false,
            'is_active' => true,
        ]);
        $this->employee = User::factory()->create([
            'name' => 'Settings Employee',
            'email' => 'employee-settings@example.test',
            'password' => 'EmployeePass123!',
            'role' => 'EMPLOYEE',
            'status' => 'ACTIVE',
            'is_root_owner' => false,
            'is_active' => true,
        ]);

        (new MirrorRecord())->forTable('store_settings')->newQuery()->create([
            'mongo_id' => 'settingsstore000000000001',
            'name' => 'LadyStars Test',
            'payload' => [
                'shopName' => 'LadyStars Test',
                'phone' => '0900000000',
            ],
        ]);
        (new MirrorRecord())->forTable('permissions')->newQuery()->create([
            'mongo_id' => 'settingspermission000001',
            'name' => 'products.read',
            'payload' => ['key' => 'products.read', 'label' => 'Xem sản phẩm', 'module' => 'products'],
        ]);
    }

    public function test_settings_requires_auth_and_admin_role(): void
    {
        $this->getJson('/api/settings/store')->assertUnauthorized();
        $this->withToken(LocalToken::issue($this->employee))
            ->getJson('/api/system/permissions')
            ->assertForbidden();

        $this->withToken(LocalToken::issue($this->admin))
            ->getJson('/api/system/permissions')
            ->assertOk()
            ->assertJsonPath('items.0.key', 'products.read');
    }

    public function test_store_update_validates_whitelists_and_writes_audit(): void
    {
        $token = LocalToken::issue($this->admin);
        $this->withToken($token)->patchJson('/api/settings/store', [
            'shopName' => '',
            'logoUrl' => 'javascript:alert(1)',
            'phone' => 'invalid phone',
        ])->assertUnprocessable();

        $response = $this->withToken($token)->patchJson('/api/settings/store', [
            'shopName' => 'LadyStars Updated',
            'logoUrl' => 'https://example.test/logo.png',
            'address' => '123 Đường Test',
            'phone' => '+84 900 000 000',
            'taxCode' => '0123456789-001',
            'unexpected' => 'must-not-persist',
        ]);

        $response->assertOk()
            ->assertJsonPath('shopName', 'LadyStars Updated')
            ->assertJsonMissingPath('unexpected');
        $record = (new MirrorRecord())->forTable('store_settings')->newQuery()->latest('id')->firstOrFail();
        $this->assertArrayNotHasKey('unexpected', $record->payload);
        $this->assertDatabaseHas('audit_logs', ['action' => 'UPDATE_STORE_SETTINGS']);
    }

    public function test_only_root_owner_can_change_owner_account_and_old_token_is_revoked(): void
    {
        $this->withToken(LocalToken::issue($this->admin))
            ->postJson('/api/settings/security/change-owner-account', [
                'currentPassword' => 'AdminPass123!',
                'newEmail' => 'not-allowed@example.test',
            ])
            ->assertForbidden();

        $oldToken = LocalToken::issue($this->rootOwner);
        $response = $this->withToken($oldToken)
            ->postJson('/api/settings/security/change-owner-account', [
                'currentPassword' => 'OwnerPass123!',
                'newEmail' => 'root-updated@example.test',
                'newPassword' => 'NewOwnerPass123!',
            ]);

        $response->assertOk()
            ->assertJsonPath('user.email', 'root-updated@example.test');
        $newToken = $response->json('token');
        $this->assertNotSame($oldToken, $newToken);
        $this->withToken($oldToken)->getJson('/api/auth/me')->assertUnauthorized();
        $this->withToken($newToken)->getJson('/api/auth/me')
            ->assertOk()
            ->assertJsonPath('email', 'root-updated@example.test');
        $this->assertTrue(Hash::check('NewOwnerPass123!', $this->rootOwner->fresh()->password));
        $this->assertDatabaseHas('audit_logs', ['action' => 'CHANGE_OWNER_ACCOUNT']);
    }

    public function test_staff_password_reset_and_session_revoke_increment_token_version(): void
    {
        $adminToken = LocalToken::issue($this->admin);
        $staffToken = LocalToken::issue($this->employee);

        $this->withToken($adminToken)->postJson('/api/settings/security/change-password', [
            'userId' => $this->employee->id,
            'newPassword' => 'EmployeeNewPass123!',
        ])->assertOk();
        $this->withToken($staffToken)->getJson('/api/auth/me')->assertUnauthorized();
        $this->assertTrue(Hash::check('EmployeeNewPass123!', $this->employee->fresh()->password));

        $nextStaffToken = LocalToken::issue($this->employee->fresh());
        $this->withToken($adminToken)->postJson('/api/settings/security/logout-user-sessions', [
            'userId' => $this->employee->id,
        ])->assertOk();
        $this->withToken($nextStaffToken)->getJson('/api/auth/me')->assertUnauthorized();
        $this->assertDatabaseHas('audit_logs', ['action' => 'RESET_STAFF_PASSWORD']);
        $this->assertDatabaseHas('audit_logs', ['action' => 'REVOKE_STAFF_SESSIONS']);
    }

    public function test_generic_mirror_cannot_bypass_settings_guards(): void
    {
        $this->getJson('/api/mirror/audit-logs')->assertUnauthorized();
        $this->withToken(LocalToken::issue($this->employee))
            ->getJson('/api/mirror/roles')
            ->assertForbidden();
        $this->withToken(LocalToken::issue($this->admin))
            ->postJson('/api/mirror/permissions', ['key' => 'settings.write'])
            ->assertForbidden();
    }
}
