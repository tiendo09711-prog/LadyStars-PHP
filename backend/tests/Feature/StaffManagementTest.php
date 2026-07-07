<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class StaffManagementTest extends TestCase
{
    // Note: intentionally no RefreshDatabase to avoid interfering with other tests in suite (e.g. login fixtures).
    // Tests use unique emails and clean specific records.

    protected function setUp(): void
    {
        parent::setUp();

        if (!Branch::where('code', 'TKHO')->exists()) {
            Branch::create([
                'name' => 'Test Kho',
                'code' => 'TKHO',
                'is_active' => true,
            ]);
        }
    }

    protected function tearDown(): void
    {
        // Cleanup only our test data
        User::where('email', 'like', '%@test.local')->delete();
        parent::tearDown();
    }

    public function test_get_staff_returns_enhanced_data_with_warehouses(): void
    {
        $branch = Branch::first();
        $user = User::factory()->create([
            'name' => 'Test Employee',
            'email' => 'emp@test.local',
            'role' => 'EMPLOYEE',
            'status' => 'ACTIVE',
            'default_warehouse_id' => $branch->id,
        ]);

        // Assign via pivot
        \DB::table('user_warehouse_assignments')->insert([
            'user_id' => $user->id,
            'branch_id' => $branch->id,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $res = $this->getJson('/api/staff');
        $res->assertOk();
        $items = $res->json('items');

        $this->assertNotEmpty($items);
        $found = collect($items)->firstWhere('email', 'emp@test.local');
        $this->assertNotNull($found);
        $this->assertEquals('EMPLOYEE', $found['role']);
        $this->assertNotEmpty($found['warehouseNames']);
        $this->assertNotEmpty($found['assignedWarehouseIds']);
    }

    public function test_create_staff_persists_with_hash_and_assignment(): void
    {
        $branch = Branch::first();
        $payload = [
            'name' => 'New Staff',
            'email' => 'newstaff@test.local',
            'password' => 'secret123',
            'phone' => '0901234567',
            'status' => 'ACTIVE',
            'assignedWarehouseIds' => [$branch->id],
            'defaultWarehouseId' => (string) $branch->id,
        ];

        $res = $this->postJson('/api/staff', $payload);
        $res->assertStatus(201);

        $user = User::where('email', 'newstaff@test.local')->firstOrFail();
        $this->assertEquals('EMPLOYEE', $user->role);
        $this->assertTrue(Hash::check('secret123', $user->password)); // explicit hash
        $this->assertEquals('ACTIVE', $user->status);
        $this->assertEquals($branch->id, $user->default_warehouse_id);

        $assigns = \DB::table('user_warehouse_assignments')->where('user_id', $user->id)->count();
        $this->assertGreaterThan(0, $assigns);
    }

    public function test_update_staff_and_multi_warehouse(): void
    {
        $b1 = Branch::first();
        $b2 = Branch::create(['name' => 'Kho 2', 'code' => 'TK2', 'is_active' => true]);

        $user = User::factory()->create([
            'name' => 'Updatable',
            'email' => 'up@test.local',
            'role' => 'EMPLOYEE',
            'status' => 'ACTIVE',
            'default_warehouse_id' => $b1->id,
        ]);

        $res = $this->patchJson("/api/staff/{$user->id}", [
            'name' => 'Updated Name',
            'email' => 'up@test.local',
            'assignedWarehouseIds' => [$b1->id, $b2->id],
            'defaultWarehouseId' => (string) $b2->id,
            'status' => 'ACTIVE',
        ]);
        $res->assertOk();

        $user->refresh();
        $this->assertEquals('Updated Name', $user->name);
        $this->assertEquals($b2->id, $user->default_warehouse_id);

        $assigns = \DB::table('user_warehouse_assignments')->where('user_id', $user->id)->pluck('branch_id')->all();
        $this->assertCount(2, $assigns);
        $this->assertContains((int)$b1->id, $assigns);
        $this->assertContains((int)$b2->id, $assigns);
    }

    public function test_lock_open_reset_and_delete_flow(): void
    {
        $branch = Branch::first();
        $user = User::factory()->create([
            'name' => 'ToLock',
            'email' => 'tolock@test.local',
            'role' => 'EMPLOYEE',
            'status' => 'ACTIVE',
        ]);

        // Lock
        $this->patchJson("/api/staff/{$user->id}/lock")->assertOk();
        $user->refresh();
        $this->assertEquals('LOCKED', $user->status);

        // Open
        $this->patchJson("/api/staff/{$user->id}/open")->assertOk();
        $user->refresh();
        $this->assertEquals('ACTIVE', $user->status);

        // Reset pw
        $this->postJson("/api/staff/{$user->id}/reset-password", ['password' => 'newpass123'])->assertOk();
        $user->refresh();
        $this->assertTrue(Hash::check('newpass123', $user->password));

        // Lock again then delete
        $this->patchJson("/api/staff/{$user->id}/lock")->assertOk();
        $del = $this->deleteJson("/api/staff/{$user->id}");
        $del->assertOk();

        $this->assertNull(User::find($user->id));
    }

    public function test_cannot_mutate_root_owner(): void
    {
        $root = User::factory()->create([
            'name' => 'Root',
            'email' => 'root@test.local',
            'role' => 'ADMIN',
            'is_root_owner' => true,
            'status' => 'ACTIVE',
        ]);

        $this->patchJson("/api/staff/{$root->id}", ['name' => 'Hacked'])->assertStatus(403);
        $this->patchJson("/api/staff/{$root->id}/lock")->assertStatus(403);
        $this->postJson("/api/staff/{$root->id}/reset-password", ['password' => 'x'])->assertStatus(403);
        $this->deleteJson("/api/staff/{$root->id}")->assertStatus(403);
    }

    public function test_stats_and_activity_endpoints_do_not_404_and_return_structure(): void
    {
        $user = User::factory()->create(['role' => 'EMPLOYEE']);
        $this->getJson("/api/staff/{$user->id}/stats")->assertOk();
        $this->getJson("/api/staff/{$user->id}/activity")->assertOk();
    }
}
