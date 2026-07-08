<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\Category;
use App\Models\Customer;
use App\Models\MirrorRecord;
use App\Models\Product;
use App\Models\ProductBranchStock;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class LocalWriteApiTest extends TestCase
{
    use RefreshDatabase;

    private Branch $branch;
    private Product $product;
    private Customer $customer;

    protected function setUp(): void
    {
        parent::setUp();

        $this->branch = Branch::create([
            'mongo_id' => 'branchlocal000000000001',
            'name' => 'Kho Local',
            'code' => 'LOCAL',
            'is_active' => true,
        ]);
        $category = Category::create([
            'mongo_id' => 'categorylocal000000001',
            'name' => 'Danh mục local',
            'code' => 'LOCAL-CAT',
            'is_active' => true,
            'is_visible' => true,
        ]);
        $this->product = Product::create([
            'mongo_id' => 'productlocal0000000001',
            'name' => 'Sản phẩm local',
            'code' => 'SPLOCAL',
            'category_id' => $category->id,
            'price' => 100000,
            'cost' => 50000,
            'qty' => 10,
            'allows_sale' => true,
            'type' => 'product',
            'status' => 'Mới',
        ]);
        ProductBranchStock::create([
            'mongo_id' => 'stocklocal000000000001',
            'product_id' => $this->product->id,
            'branch_id' => $this->branch->id,
            'qty' => 10,
            'locked_quantity' => 0,
            'min_quantity' => 0,
            'max_quantity' => 999999999,
        ]);
        $this->customer = Customer::create([
            'mongo_id' => 'customerlocal000000001',
            'name' => 'Khách local',
            'code' => 'KHLOCAL',
            'phone' => '0900000000',
            'status' => 'active',
            'branch_id' => $this->branch->id,
        ]);
        User::create([
            'mongo_id' => 'userlocal00000000000001',
            'name' => 'Admin Local',
            'email' => 'admin.local@example.test',
            'password' => 'secret',
            'role' => 'ADMIN',
            'status' => 'ACTIVE',
            'branch_id' => $this->branch->id,
            'default_warehouse_id' => $this->branch->id,
            'is_root_owner' => true,
            'is_active' => true,
        ]);
    }

    public function test_local_login_returns_frontend_token(): void
    {
        $response = $this->postJson('/api/auth/login', [
            'email' => 'admin.local@example.test',
            'password' => 'secret',
        ]);

        $response->assertOk()
            ->assertJsonPath('user.email', 'admin.local@example.test');
        // Token is now per-user suffixed for correct /auth/me mapping
        $this->assertStringStartsWith('local-laravel-token-', $response->json('token'));
    }

    public function test_admin_gmail_login_works_with_correct_password(): void
    {
        // Simulate the requested admin account (as seeded in DatabaseSeeder)
        \App\Models\User::create([
            'name' => 'Admin',
            'email' => 'admin@gmail.com',
            'password' => '123456',
            'role' => 'ADMIN',
            'status' => 'ACTIVE',
            'is_root_owner' => true,
            'is_active' => true,
        ]);

        $response = $this->postJson('/api/auth/login', [
            'email' => 'admin@gmail.com',
            'password' => '123456',
        ]);

        $response->assertOk()
            ->assertJsonPath('user.email', 'admin@gmail.com')
            ->assertJsonPath('user.role', 'ADMIN');

        $this->assertStringStartsWith('local-laravel-token-', $response->json('token'));

        // Verify /auth/me with the returned token resolves to the exact logged-in admin
        $token = $response->json('token');
        $me = $this->withHeaders(['Authorization' => 'Bearer ' . $token])->getJson('/api/auth/me');
        $me->assertOk()
            ->assertJsonPath('email', 'admin@gmail.com')
            ->assertJsonPath('role', 'ADMIN');

        // Wrong password must fail
        $bad = $this->postJson('/api/auth/login', [
            'email' => 'admin@gmail.com',
            'password' => 'wrong',
        ]);
        $bad->assertStatus(401);
    }

    public function test_login_supports_legacy_plain_text_password_and_upgrades_it(): void
    {
        // Simulate legacy data where password was stored as plain text (common from mongo imports)
        // This would previously cause "This password does not use the Bcrypt algorithm."
        $legacyUser = \App\Models\User::create([
            'name' => 'Legacy Admin',
            'email' => 'legacy-admin@gmail.com',
            'password' => '123456',  // deliberately plain, not hashed
            'role' => 'ADMIN',
            'status' => 'ACTIVE',
            'is_root_owner' => false,
            'is_active' => true,
        ]);

        // Should succeed even though stored plain (fallback path)
        $response = $this->postJson('/api/auth/login', [
            'email' => 'legacy-admin@gmail.com',
            'password' => '123456',
        ]);
        $response->assertOk()->assertJsonPath('user.email', 'legacy-admin@gmail.com');

        // After successful login, the password should have been upgraded to bcrypt hash
        $legacyUser->refresh();
        $this->assertNotEquals('123456', $legacyUser->password);
        $this->assertTrue(\Illuminate\Support\Facades\Hash::check('123456', $legacyUser->password));
    }

    public function test_customer_care_local_crud_works(): void
    {
        $created = $this->postJson('/api/customers/care', [
            'code' => 'CSLOCAL',
            'customerCode' => $this->customer->code,
            'customerName' => $this->customer->name,
            'customerPhone' => $this->customer->phone,
            'details' => 'Gọi chăm sóc',
            'reason' => 'Nhắc lịch',
            'creator' => 'Admin Local',
            'recordDate' => now()->toISOString(),
        ]);

        $created->assertCreated()
            ->assertJsonPath('code', 'CSLOCAL')
            ->assertJsonPath('customerPhone', '0900000000');

        $id = $created->json('_id');
        $updated = $this->patchJson('/api/customers/care/'.$id, ['reason' => 'Đổi lý do']);
        $updated->assertOk()->assertJsonPath('reason', 'Đổi lý do');

        $this->deleteJson('/api/customers/care/'.$id)->assertOk()->assertJsonPath('ok', true);
    }

    public function test_sale_create_and_complete_updates_local_stock(): void
    {
        $created = $this->postJson('/api/products/sales', [
            'branchId' => (string) $this->branch->id,
            'customerId' => (string) $this->customer->id,
            'status' => 'draft',
            'valuePayment' => 200000,
            'items' => [[
                'productId' => (string) $this->product->id,
                'amount' => 2,
                'value' => 100000,
            ]],
        ]);

        $created->assertCreated()->assertJsonPath('status', 'draft');
        $this->postJson('/api/products/sales/'.$created->json('_id').'/complete')
            ->assertOk()
            ->assertJsonPath('status', 'completed');

        $this->assertDatabaseHas('product_branch_stocks', [
            'product_id' => $this->product->id,
            'branch_id' => $this->branch->id,
            'qty' => 8,
        ]);
    }

    public function test_warehouse_voucher_and_transfer_local_writes_work(): void
    {
        $voucher = $this->postJson('/api/warehouse/vouchers', [
            'voucherId' => 'PNK-LOCAL',
            'warehouse' => (string) $this->branch->id,
            'type' => 'import',
            'spCount' => 1,
            'qty' => 3,
            'totalAmount' => 300000,
            'creator' => 'Admin Local',
        ]);
        $voucher->assertCreated()->assertJsonPath('code', 'PNK-LOCAL');

        $transfer = $this->postJson('/api/warehouse/transfers', [
            'sourceWarehouseId' => (string) $this->branch->id,
            'destinationWarehouseId' => (string) $this->branch->id,
            'status' => 'DRAFT',
            'lines' => [[
                'productId' => (string) $this->product->id,
                'quantity' => 1,
            ]],
        ]);
        $transfer->assertCreated()->assertJsonPath('status', 'DRAFT');

        $this->postJson('/api/warehouse/transfers/'.$transfer->json('_id').'/confirm-source')
            ->assertOk()
            ->assertJsonPath('status', 'IN_TRANSIT');
    }

    public function test_inventory_audit_local_endpoints_are_available(): void
    {
        $this->getJson('/api/inventory-audits/meta')->assertOk();

        // Create rich DRAFT with mixed items (positive, negative, zero, null physical, missing optional)
        $draftPayload = [
            'code' => 'KK-DRAFT',
            'warehouseId' => (string) $this->branch->id,
            'auditType' => 'BY_PRODUCT',
            'status' => 'DRAFT',
            'note' => 'Kiểm kho nháp',
            'items' => [
                [
                    'productId' => (string) $this->product->id,
                    'productCodeSnapshot' => 'SPLOCAL',
                    'productNameSnapshot' => 'Sản phẩm local',
                    'barcodeSnapshot' => 'BAR123',
                    'unitSnapshot' => 'Cái',
                    'systemQuantitySnapshot' => 10,
                    'physicalQuantity' => 12,
                    'varianceQuantity' => 2,
                    'note' => 'Thừa',
                ],
                [
                    'productId' => (string) $this->product->id,
                    'productCodeSnapshot' => 'SPLOCAL',
                    'productNameSnapshot' => 'Sản phẩm local',
                    'systemQuantitySnapshot' => 5,
                    'physicalQuantity' => 3,
                    'varianceQuantity' => -2,
                ],
                [
                    'productId' => (string) $this->product->id,
                    'productCodeSnapshot' => 'SPLOCAL',
                    'productNameSnapshot' => 'Sản phẩm local',
                    'systemQuantitySnapshot' => 8,
                    'physicalQuantity' => 8,
                    'varianceQuantity' => 0,
                    'note' => null,
                ],
                [
                    'productId' => (string) $this->product->id,
                    'productCodeSnapshot' => 'SPLOCAL',
                    'productNameSnapshot' => 'Sản phẩm local',
                    'systemQuantitySnapshot' => 1,
                    // no physical -> null handling
                    'varianceQuantity' => 0,
                ],
            ],
        ];
        $draft = $this->postJson('/api/inventory-audits', $draftPayload);
        $draft->assertCreated()->assertJsonPath('code', 'KK-DRAFT')->assertJsonPath('status', 'DRAFT');
        $draftId = $draft->json('_id');

        // Submit -> COUNTING
        $submitResp = $this->postJson('/api/inventory-audits/'.$draftId.'/submit');
        $submitResp->assertOk()->assertJsonPath('status', 'COUNTING');

        // Verify enrichment on read path (GET uses auditRow with branch lookup)
        $draftRead = $this->getJson('/api/inventory-audits/' . $draftId);
        $draftRead->assertOk()->assertJsonPath('warehouseName', 'Kho Local');

        // Create FULL type, submit, then reconcile
        $fullPayload = [
            'code' => 'KK-FULL',
            'warehouseId' => (string) $this->branch->id,
            'auditType' => 'FULL',
            'status' => 'DRAFT',
            'items' => [
                ['productId' => (string)$this->product->id, 'productCodeSnapshot' => 'SP', 'productNameSnapshot' => 'SP', 'systemQuantitySnapshot' => 20, 'physicalQuantity' => 20, 'varianceQuantity' => 0],
            ],
        ];
        $full = $this->postJson('/api/inventory-audits', $fullPayload);
        $fullId = $full->json('_id');
        $this->postJson('/api/inventory-audits/'.$fullId.'/submit')->assertOk();
        $reconcile = $this->postJson('/api/inventory-audits/'.$fullId.'/reconcile');
        $reconcile->assertOk()->assertJsonPath('status', 'RECONCILED');

        // Create then cancel
        $cancelPayload = [
            'code' => 'KK-CANCEL',
            'warehouseId' => (string) $this->branch->id,
            'auditType' => 'BY_PRODUCT',
            'status' => 'DRAFT',
            'items' => [],
        ];
        $canc = $this->postJson('/api/inventory-audits', $cancelPayload);
        $cancId = $canc->json('_id');
        $this->postJson('/api/inventory-audits/'.$cancId.'/submit')->assertOk();
        $this->postJson('/api/inventory-audits/'.$cancId.'/cancel', ['reason' => 'Sai'])->assertOk();

        // Now verify list non-empty
        $list = $this->getJson('/api/inventory-audits?limit=20');
        $list->assertOk();
        $items = $list->json('items');
        $this->assertGreaterThanOrEqual(3, count($items)); // at least draft(submitted), full(reconciled), cancel
        $this->assertNotEmpty($items);

        // Filter by warehouse
        $byWh = $this->getJson('/api/inventory-audits?warehouseId=' . $this->branch->id . '&limit=10');
        $byWh->assertOk();
        $this->assertGreaterThan(0, count($byWh->json('items')));

        // Filter by auditType FULL
        $byType = $this->getJson('/api/inventory-audits?auditType=FULL&limit=5');
        $byType->assertOk();
        $foundFull = collect($byType->json('items'))->firstWhere('auditType', 'FULL');
        $this->assertNotNull($foundFull);

        // Keyword
        $kw = $this->getJson('/api/inventory-audits?keyword=KK-DRAFT&limit=5');
        $kw->assertOk();
        $this->assertGreaterThan(0, count($kw->json('items')));

        // Dashboard
        $dash = $this->getJson('/api/inventory-audits/dashboard');
        $dash->assertOk()
            ->assertJsonStructure(['totalAudits', 'itemCount', 'byStatus']);

        // Detail with items
        $detail = $this->getJson('/api/inventory-audits/' . $draftId);
        $detail->assertOk();
        $detailItems = $detail->json('items');
        $this->assertNotEmpty($detailItems);
        // Check mapping for variance positive
        $pos = collect($detailItems)->firstWhere('varianceQuantity', '>', 0);
        $this->assertNotNull($pos);
        $this->assertEquals(12, $pos['physicalQuantity']);
        $this->assertEquals('SPLOCAL', $pos['productCodeSnapshot']);
        // null physical handling
        $nullPhys = collect($detailItems)->first(function ($i) { return $i['physicalQuantity'] === null; });
        $this->assertNotNull($nullPhys);

        // Items tab coverage: insert sample into products table (for legacy path)
        \DB::table('inventory_check_products')->insert([
            'mongo_id' => 'itemlocal001',
            'code' => 'KK-DRAFT',
            'branch_mongo_id' => $this->branch->mongo_id,
            'business_date' => now(),
            'payload' => json_encode([
                'productCode' => 'SPLOCAL',
                'productName' => 'Sản phẩm local',
                'barcode' => 'BAR123',
                'stock' => 10,
                'actualStock' => 12,
                'difference' => 2,
                'warehouseId' => (string)$this->branch->id,
                'warehouse' => 'Kho Local',
            ]),
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        $itemsList = $this->getJson('/api/inventory-audit-items?limit=5');
        $itemsList->assertOk();
        $this->assertGreaterThan(0, count($itemsList->json('items')));

        // Variance filter (may be 0 if no match but endpoint works)
        $varFilter = $this->getJson('/api/inventory-audit-items?varianceType=EXCESS&limit=5');
        $varFilter->assertOk();

        // Status via list
        $statusList = $this->getJson('/api/inventory-audits?status=RECONCILED&limit=5');
        $statusList->assertOk();
        $reco = collect($statusList->json('items'))->firstWhere('status', 'RECONCILED');
        $this->assertNotNull($reco);
    }

    // --- Branch write flow tests (targeted for /warehouse/branches, using RefreshDatabase isolation) ---

    private function createAdminUser(string $role = 'ADMIN', bool $isRoot = false): User
    {
        // Provide a password so NOT NULL constraint is satisfied in sqlite test.
        // The 'admin' loose path in write may still be exercised in other tests.
        return User::create([
            'name' => 'Test Admin',
            'email' => 'admin-branch-test-' . uniqid() . '@local.test',
            'password' => 'admin',
            'role' => $role,
            'status' => 'ACTIVE',
            'is_root_owner' => $isRoot,
            'is_active' => true,
        ]);
    }

    public function test_branch_list_and_usage_endpoints_work(): void
    {
        $admin = $this->createAdminUser();
        $token = 'local-laravel-token-' . $admin->id;

        $list = $this->withHeaders(['Authorization' => 'Bearer ' . $token])
            ->getJson('/api/system/branches?limit=10&includeInactive=true');
        $list->assertOk()
            ->assertJsonStructure(['items', 'total', 'page', 'limit']);

        $branchId = $this->branch->id;
        $usage = $this->withHeaders(['Authorization' => 'Bearer ' . $token])
            ->getJson("/api/system/branches/{$branchId}/usage");
        $usage->assertOk()
            ->assertJsonStructure(['branchId', 'branchName', 'isActive', 'totalLinked', 'links']);
    }

    public function test_branch_create_requires_admin_context_and_password(): void
    {
        // No token -> should 403 from requireAdminUser
        $this->postJson('/api/system/branches', [
            'name' => 'New Branch',
            'code' => 'NEW1',
            'address' => 'Addr',
            'phone' => '0909',
            'adminPassword' => 'admin',
        ])->assertStatus(403);

        $admin = $this->createAdminUser();
        $token = 'local-laravel-token-' . $admin->id;

        // Missing password
        $this->withHeaders(['Authorization' => 'Bearer ' . $token])
            ->postJson('/api/system/branches', [
                'name' => 'New Branch',
                'code' => 'NEW2',
                'adminPassword' => '',
            ])->assertStatus(422);

        // Create a separate admin WITH password hash to test strict rejection
        $strictAdmin = User::create([
            'name' => 'Strict Admin',
            'email' => 'strict-' . uniqid() . '@local.test',
            'password' => \Illuminate\Support\Facades\Hash::make('realpass123'),
            'role' => 'ADMIN',
            'status' => 'ACTIVE',
            'is_root_owner' => false,
            'is_active' => true,
        ]);
        $strictToken = 'local-laravel-token-' . $strictAdmin->id;

        $resp = $this->withHeaders(['Authorization' => 'Bearer ' . $strictToken])
            ->postJson('/api/system/branches', [
                'name' => 'New Branch Strict',
                'code' => 'NEW3',
                'address' => 'Test',
                'phone' => '0123',
                'adminPassword' => 'xx',  // short + not 'admin' => abort even in loose path
            ]);
        // With hash + short non-admin pass: must 403 (strict path or the <4 len rule)
        $resp->assertStatus(403);
    }

    public function test_branch_create_success_and_duplicate_code_block(): void
    {
        $admin = $this->createAdminUser('ADMIN', true); // root to ease
        $token = 'local-laravel-token-' . $admin->id;

        $create = $this->withHeaders(['Authorization' => 'Bearer ' . $token])
            ->postJson('/api/system/branches', [
                'name' => 'Branch Test Create',
                'code' => 'TSTCREATE',
                'address' => 'Test Addr',
                'phone' => '0987',
                'adminPassword' => 'admin', // loose ok since may not strict hash on this user? but root
            ]);
        $create->assertStatus(201)
            ->assertJsonPath('code', 'TSTCREATE')
            ->assertJsonPath('name', 'Branch Test Create');

        // duplicate code
        $dup = $this->withHeaders(['Authorization' => 'Bearer ' . $token])
            ->postJson('/api/system/branches', [
                'name' => 'Dup',
                'code' => 'TSTCREATE',
                'adminPassword' => 'admin',
            ]);
        $dup->assertStatus(422)
            ->assertJsonPath('message', 'Mã kho đã tồn tại.');
    }

    public function test_branch_activate_deactivate_and_delete_guard(): void
    {
        $admin = $this->createAdminUser();
        $token = 'local-laravel-token-' . $admin->id;
        $headers = ['Authorization' => 'Bearer ' . $token];

        // create inactive-ish
        $created = $this->withHeaders($headers)->postJson('/api/system/branches', [
            'name' => 'To Toggle',
            'code' => 'TOGGLE1',
            'adminPassword' => 'admin',
        ])->assertStatus(201);
        $id = $created->json('_id') ?? $created->json('id');

        // deactivate
        $deact = $this->withHeaders($headers)->postJson("/api/system/branches/{$id}/deactivate", ['adminPassword' => 'admin']);
        $deact->assertOk()->assertJsonPath('isActive', false);

        // activate
        $act = $this->withHeaders($headers)->postJson("/api/system/branches/{$id}/activate", ['adminPassword' => 'admin']);
        $act->assertOk()->assertJsonPath('isActive', true);

        // usage
        $usage = $this->withHeaders($headers)->getJson("/api/system/branches/{$id}/usage");
        $usage->assertOk();

        // delete should be allowed if no links (new branch)
        $del = $this->withHeaders($headers)->deleteJson("/api/system/branches/{$id}", ['adminPassword' => 'admin']);
        $del->assertOk()->assertJson(['ok' => true]);

        // try delete non exist
        $this->withHeaders($headers)->deleteJson("/api/system/branches/999999", ['adminPassword' => 'admin'])
            ->assertStatus(404); // firstOrFail
    }
}
