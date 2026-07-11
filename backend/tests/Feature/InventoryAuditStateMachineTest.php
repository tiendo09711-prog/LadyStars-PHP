<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\Category;
use App\Models\Product;
use App\Models\ProductBranchStock;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Targeted inventory-audit state machine + permission tests (sqlite :memory: isolated).
 */
class InventoryAuditStateMachineTest extends TestCase
{
    use RefreshDatabase;

    private Branch $branch;
    private Product $product;
    private User $admin;
    private User $employee;

    protected function setUp(): void
    {
        parent::setUp();

        $this->branch = Branch::create([
            'mongo_id' => 'branchaudit000000000001',
            'name' => 'Kho Audit',
            'code' => 'AUD',
            'is_active' => true,
        ]);
        $category = Category::create([
            'mongo_id' => 'categoryaudit000000001',
            'name' => 'Cat Audit',
            'code' => 'AUD-CAT',
            'is_active' => true,
            'is_visible' => true,
        ]);
        $this->product = Product::create([
            'mongo_id' => 'productaudit0000000001',
            'name' => 'SP Audit',
            'code' => 'SPAUD',
            'category_id' => $category->id,
            'price' => 10000,
            'cost' => 5000,
            'qty' => 5,
            'allows_sale' => true,
            'type' => 'product',
            'status' => 'Mới',
        ]);
        ProductBranchStock::create([
            'mongo_id' => 'stockaudit000000000001',
            'product_id' => $this->product->id,
            'branch_id' => $this->branch->id,
            'qty' => 5,
            'locked_quantity' => 0,
            'min_quantity' => 0,
            'max_quantity' => 999999999,
        ]);
        $this->admin = User::create([
            'mongo_id' => 'userauditadmin00000001',
            'name' => 'Admin Audit',
            'email' => 'admin.audit@example.test',
            'password' => 'secret',
            'role' => 'ADMIN',
            'status' => 'ACTIVE',
            'branch_id' => $this->branch->id,
            'default_warehouse_id' => $this->branch->id,
            'is_root_owner' => true,
            'is_active' => true,
        ]);
        $this->employee = User::create([
            'mongo_id' => 'userauditemployee000001',
            'name' => 'Employee Audit',
            'email' => 'employee.audit@example.test',
            'password' => 'secret',
            'role' => 'EMPLOYEE',
            'status' => 'ACTIVE',
            'branch_id' => $this->branch->id,
            'default_warehouse_id' => $this->branch->id,
            'is_root_owner' => false,
            'is_active' => true,
        ]);
    }

    private function authHeaders(User $user): array
    {
        return ['Authorization' => 'Bearer local-laravel-token-'.$user->id];
    }

    private function createAudit(string $status = 'DRAFT', string $code = 'KK-SM'): string
    {
        $resp = $this->postJson('/api/inventory-audits', [
            'code' => $code,
            'warehouseId' => (string) $this->branch->id,
            'auditType' => 'BY_PRODUCT',
            'status' => $status,
            'items' => [
                [
                    'productId' => (string) $this->product->id,
                    'productCodeSnapshot' => 'SPAUD',
                    'productNameSnapshot' => 'SP Audit',
                    'systemQuantitySnapshot' => 5,
                    'physicalQuantity' => 5,
                    'varianceQuantity' => 0,
                ],
            ],
        ]);
        $resp->assertCreated();

        return (string) $resp->json('_id');
    }

    public function test_meta_returns_real_role_for_admin_and_employee(): void
    {
        $adminMeta = $this->withHeaders($this->authHeaders($this->admin))
            ->getJson('/api/inventory-audits/meta')
            ->assertOk()
            ->json();
        $this->assertSame('ADMIN', $adminMeta['role']);
        $this->assertTrue((bool) ($adminMeta['isAdmin'] ?? false));
        $this->assertContains(
            ['value' => 'SUBMITTED', 'label' => 'Đã nộp'],
            $adminMeta['statuses']
        );

        $employeeMeta = $this->withHeaders($this->authHeaders($this->employee))
            ->getJson('/api/inventory-audits/meta')
            ->assertOk()
            ->json();
        $this->assertSame('EMPLOYEE', $employeeMeta['role']);
        $this->assertFalse((bool) ($employeeMeta['isAdmin'] ?? false));
    }

    public function test_meta_without_auth_does_not_pretend_admin(): void
    {
        $meta = $this->getJson('/api/inventory-audits/meta')->assertOk()->json();
        $this->assertSame('GUEST', $meta['role']);
        $this->assertFalse((bool) ($meta['isAdmin'] ?? false));
    }

    public function test_submit_moves_to_submitted_not_counting(): void
    {
        $id = $this->createAudit('DRAFT', 'KK-SUBMIT');
        $this->postJson('/api/inventory-audits/'.$id.'/submit')
            ->assertOk()
            ->assertJsonPath('status', 'SUBMITTED');
    }

    public function test_reconcile_requires_submitted_and_admin(): void
    {
        $id = $this->createAudit('DRAFT', 'KK-REC');
        $this->postJson('/api/inventory-audits/'.$id.'/submit')->assertOk();

        // Employee: 403, no status change
        $this->withHeaders($this->authHeaders($this->employee))
            ->postJson('/api/inventory-audits/'.$id.'/reconcile')
            ->assertStatus(403);
        $this->getJson('/api/inventory-audits/'.$id)
            ->assertOk()
            ->assertJsonPath('status', 'SUBMITTED');

        // Admin: OK
        $this->withHeaders($this->authHeaders($this->admin))
            ->postJson('/api/inventory-audits/'.$id.'/reconcile')
            ->assertOk()
            ->assertJsonPath('status', 'RECONCILED');
    }

    public function test_reconcile_rejected_on_counting(): void
    {
        $id = $this->createAudit('COUNTING', 'KK-CNT');
        $this->withHeaders($this->authHeaders($this->admin))
            ->postJson('/api/inventory-audits/'.$id.'/reconcile')
            ->assertStatus(422);
        $this->getJson('/api/inventory-audits/'.$id)
            ->assertOk()
            ->assertJsonPath('status', 'COUNTING');
    }

    public function test_reverse_requires_reconciled_and_admin(): void
    {
        $id = $this->createAudit('DRAFT', 'KK-REV');
        $this->postJson('/api/inventory-audits/'.$id.'/submit')->assertOk();
        $this->withHeaders($this->authHeaders($this->admin))
            ->postJson('/api/inventory-audits/'.$id.'/reconcile')
            ->assertOk();

        $this->withHeaders($this->authHeaders($this->employee))
            ->postJson('/api/inventory-audits/'.$id.'/reverse-reconcile', ['reason' => 'Sai'])
            ->assertStatus(403);

        $this->withHeaders($this->authHeaders($this->admin))
            ->postJson('/api/inventory-audits/'.$id.'/reverse-reconcile', ['reason' => 'Sai'])
            ->assertOk()
            ->assertJsonPath('status', 'COUNTING');
    }

    public function test_resnapshot_only_counting(): void
    {
        $id = $this->createAudit('DRAFT', 'KK-SNAP');
        $this->postJson('/api/inventory-audits/'.$id.'/resnapshot')->assertStatus(422);
        // Move via save path: create as COUNTING
        $countId = $this->createAudit('COUNTING', 'KK-SNAP2');
        $this->postJson('/api/inventory-audits/'.$countId.'/resnapshot')
            ->assertOk()
            ->assertJsonPath('status', 'COUNTING');
    }

    public function test_available_actions_match_state_machine_for_admin(): void
    {
        $draftId = $this->createAudit('DRAFT', 'KK-ACT-D');
        $draftActions = collect(
            $this->withHeaders($this->authHeaders($this->admin))
                ->getJson('/api/inventory-audits/'.$draftId)->json('availableActions')
        )->pluck('action')->all();
        $this->assertContains('submit', $draftActions);
        $this->assertContains('cancel', $draftActions);
        $this->assertNotContains('reconcile', $draftActions);

        $this->postJson('/api/inventory-audits/'.$draftId.'/submit')->assertOk();
        $submittedActions = collect(
            $this->withHeaders($this->authHeaders($this->admin))
                ->getJson('/api/inventory-audits/'.$draftId)->json('availableActions')
        )->pluck('action')->all();
        $this->assertContains('reconcile', $submittedActions);
        $this->assertContains('cancel', $submittedActions);
        $this->assertNotContains('resnapshot', $submittedActions);

        $countId = $this->createAudit('COUNTING', 'KK-ACT-C');
        $countActions = collect(
            $this->withHeaders($this->authHeaders($this->admin))
                ->getJson('/api/inventory-audits/'.$countId)->json('availableActions')
        )->pluck('action')->all();
        $this->assertContains('resnapshot', $countActions);
        $this->assertNotContains('reconcile', $countActions);
    }

    public function test_employee_does_not_see_reconcile_action_on_submitted(): void
    {
        $id = $this->createAudit('DRAFT', 'KK-EMP');
        $this->postJson('/api/inventory-audits/'.$id.'/submit')->assertOk();
        $actions = collect(
            $this->withHeaders($this->authHeaders($this->employee))
                ->getJson('/api/inventory-audits/'.$id)->json('availableActions')
        )->pluck('action')->all();
        $this->assertNotContains('reconcile', $actions);
        $this->assertContains('cancel', $actions);
    }
}
