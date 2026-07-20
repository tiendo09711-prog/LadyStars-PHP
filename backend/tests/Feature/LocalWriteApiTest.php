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
        $admin = User::create([
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
        // Default auth for write endpoints (SEC-005: unauthenticated writes rejected).
        $this->withHeaders([
            'Authorization' => 'Bearer local-laravel-token-'.$admin->id,
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

    public function test_admin_login_works_with_correct_password(): void
    {
        // Uses setUp admin (admin.local@example.test / secret) — no hardcoded production credentials.
        $response = $this->postJson('/api/auth/login', [
            'email' => 'admin.local@example.test',
            'password' => 'secret',
        ]);

        $response->assertOk()
            ->assertJsonPath('user.email', 'admin.local@example.test')
            ->assertJsonPath('user.role', 'ADMIN');

        $this->assertStringStartsWith('local-laravel-token-', $response->json('token'));

        $token = $response->json('token');
        $me = $this->withHeaders(['Authorization' => 'Bearer ' . $token])->getJson('/api/auth/me');
        $me->assertOk()
            ->assertJsonPath('email', 'admin.local@example.test')
            ->assertJsonPath('role', 'ADMIN');

        $bad = $this->postJson('/api/auth/login', [
            'email' => 'admin.local@example.test',
            'password' => 'wrong',
        ]);
        $bad->assertStatus(401);
    }

    public function test_login_supports_legacy_plain_text_password_and_upgrades_it(): void
    {
        $plain = 'legacy-plain-pass';
        $legacyUser = \App\Models\User::create([
            'name' => 'Legacy Admin',
            'email' => 'legacy-admin@example.test',
            'password' => 'will-be-overwritten',
            'role' => 'ADMIN',
            'status' => 'ACTIVE',
            'is_root_owner' => false,
            'is_active' => true,
        ]);

        // Force plain-text storage (bypass hashed cast) to simulate legacy rows.
        \Illuminate\Support\Facades\DB::table('users')->where('id', $legacyUser->id)->update(['password' => $plain]);

        $response = $this->postJson('/api/auth/login', [
            'email' => 'legacy-admin@example.test',
            'password' => $plain,
        ]);
        $response->assertOk()->assertJsonPath('user.email', 'legacy-admin@example.test');

        $legacyUser->refresh();
        $this->assertNotEquals($plain, $legacyUser->password);
        $this->assertTrue(\Illuminate\Support\Facades\Hash::check($plain, $legacyUser->password));
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

    public function test_employee_cannot_cancel_or_delete_completed_sale(): void
    {
        $admin = User::query()->where('email', 'admin.local@example.test')->firstOrFail();
        $employee = User::create([
            'mongo_id' => 'userlocalemployee000001',
            'name' => 'Employee Local',
            'email' => 'employee.local@example.test',
            'password' => 'secret',
            'role' => 'EMPLOYEE',
            'status' => 'ACTIVE',
            'branch_id' => $this->branch->id,
            'is_root_owner' => false,
            'is_active' => true,
        ]);

        $created = $this->postJson('/api/products/sales', [
            'branchId' => (string) $this->branch->id,
            'customerId' => (string) $this->customer->id,
            'channel' => 'store',
            'type' => 'retail',
            'status' => 'draft',
            'valuePayment' => 100000,
            'items' => [[
                'productId' => (string) $this->product->id,
                'amount' => 1,
                'value' => 100000,
            ]],
        ]);
        $created->assertCreated();
        $saleId = $created->json('_id');
        $this->postJson('/api/products/sales/'.$saleId.'/complete')->assertOk();

        $empToken = 'local-laravel-token-'.$employee->id;
        $this->withHeader('Authorization', 'Bearer '.$empToken)
            ->postJson('/api/products/sales/'.$saleId.'/cancel')
            ->assertStatus(403);

        $this->withHeader('Authorization', 'Bearer '.$empToken)
            ->deleteJson('/api/products/sales/'.$saleId)
            ->assertStatus(403);

        $this->withHeader('Authorization', 'Bearer '.$empToken)
            ->patchJson('/api/products/sales/'.$saleId, [
                'note' => 'employee try edit',
                'items' => [[
                    'productId' => (string) $this->product->id,
                    'amount' => 1,
                    'value' => 100000,
                ]],
            ])
            ->assertStatus(403);

        // Admin can cancel.
        $this->withHeader('Authorization', 'Bearer local-laravel-token-'.$admin->id)
            ->postJson('/api/products/sales/'.$saleId.'/cancel')
            ->assertOk()
            ->assertJsonPath('status', 'cancelled');

        $this->assertDatabaseHas('product_branch_stocks', [
            'product_id' => $this->product->id,
            'branch_id' => $this->branch->id,
            'qty' => 10,
        ]);
    }

    public function test_edit_completed_sale_applies_stock_delta_only(): void
    {
        $admin = User::query()->where('email', 'admin.local@example.test')->firstOrFail();
        $adminToken = 'local-laravel-token-'.$admin->id;

        $created = $this->postJson('/api/products/sales', [
            'branchId' => (string) $this->branch->id,
            'customerId' => (string) $this->customer->id,
            'channel' => 'store',
            'type' => 'retail',
            'status' => 'draft',
            'valuePayment' => 200000,
            'items' => [[
                'productId' => (string) $this->product->id,
                'amount' => 2,
                'value' => 100000,
            ]],
        ]);
        $saleId = $created->json('_id');
        $this->postJson('/api/products/sales/'.$saleId.'/complete')->assertOk();
        $this->assertDatabaseHas('product_branch_stocks', [
            'product_id' => $this->product->id,
            'branch_id' => $this->branch->id,
            'qty' => 8,
        ]);

        // Increase qty 2 → 3: stock decreases by 1 only.
        $this->withHeader('Authorization', 'Bearer '.$adminToken)
            ->patchJson('/api/products/sales/'.$saleId, [
                'branchId' => (string) $this->branch->id,
                'customerId' => (string) $this->customer->id,
                'status' => 'completed',
                'valuePayment' => 300000,
                'items' => [[
                    'productId' => (string) $this->product->id,
                    'amount' => 3,
                    'value' => 100000,
                ]],
            ])
            ->assertOk();

        $this->assertDatabaseHas('product_branch_stocks', [
            'product_id' => $this->product->id,
            'branch_id' => $this->branch->id,
            'qty' => 7,
        ]);

        // Decrease qty 3 → 1: stock restores by 2.
        $this->withHeader('Authorization', 'Bearer '.$adminToken)
            ->patchJson('/api/products/sales/'.$saleId, [
                'branchId' => (string) $this->branch->id,
                'customerId' => (string) $this->customer->id,
                'status' => 'completed',
                'valuePayment' => 100000,
                'items' => [[
                    'productId' => (string) $this->product->id,
                    'amount' => 1,
                    'value' => 100000,
                ]],
            ])
            ->assertOk();

        $this->assertDatabaseHas('product_branch_stocks', [
            'product_id' => $this->product->id,
            'branch_id' => $this->branch->id,
            'qty' => 9,
        ]);
    }

    public function test_complete_sale_rejects_oversell(): void
    {
        $created = $this->postJson('/api/products/sales', [
            'branchId' => (string) $this->branch->id,
            'customerId' => (string) $this->customer->id,
            'status' => 'draft',
            'valuePayment' => 1000000,
            'items' => [[
                'productId' => (string) $this->product->id,
                'amount' => 99,
                'value' => 100000,
            ]],
        ]);
        $created->assertCreated();
        $this->postJson('/api/products/sales/'.$created->json('_id').'/complete')
            ->assertStatus(422);

        $this->assertDatabaseHas('product_branch_stocks', [
            'product_id' => $this->product->id,
            'branch_id' => $this->branch->id,
            'qty' => 10,
        ]);
    }

    public function test_return_exchange_action_return_creates_product_refund_with_channel_and_total(): void
    {
        // Create + complete a sale (stock 10 → 8)
        $created = $this->postJson('/api/products/sales', [
            'branchId' => (string) $this->branch->id,
            'customerId' => (string) $this->customer->id,
            'channel' => 'store',
            'type' => 'retail',
            'status' => 'draft',
            'valuePayment' => 200000,
            'items' => [[
                'productId' => (string) $this->product->id,
                'amount' => 2,
                'value' => 100000,
            ]],
        ]);
        $created->assertCreated();
        $saleId = $created->json('_id');
        $this->postJson('/api/products/sales/'.$saleId.'/complete')
            ->assertOk()
            ->assertJsonPath('status', 'completed');

        // Inflated totalAmount above returned line value must be rejected (anti over-refund).
        $this->postJson('/api/products/sales/'.$saleId.'/return-exchange', [
            'branchId' => (string) $this->branch->id,
            'channel' => 'store',
            'totalAmount' => 150000,
            'returnedItems' => [[
                'productId' => (string) $this->product->id,
                'amount' => 1,
                'value' => 100000,
            ]],
            'replacementItems' => [],
        ])->assertStatus(422);

        // Route defaults action='return' (not return-exchange) — must still create product-refund.
        // Settlement is bounded by line totals (returned value 100000).
        $resp = $this->postJson('/api/products/sales/'.$saleId.'/return-exchange', [
            'code' => 'TH-TEST-001',
            'branchId' => (string) $this->branch->id,
            'channel' => 'store',
            'note' => 'E2E unit return',
            'totalAmount' => 100000,
            'amountDelta' => 100000,
            'refundAmount' => 100000,
            'returnedItems' => [[
                'productId' => (string) $this->product->id,
                'amount' => 1,
                'value' => 100000,
            ]],
            'replacementItems' => [],
            'refundPayments' => [],
            'salePayments' => [],
        ]);

        $resp->assertOk()
            ->assertJsonPath('status', 'completed'); // sale status not polluted to RETURNED

        $this->assertNotEmpty($resp->json('refund'), 'Response must include created refund');
        $this->assertSame(100000.0, (float) $resp->json('refund.totalPayableAmount'));
        $this->assertSame('store', $resp->json('refund.channel'));
        $this->assertSame('completed', $resp->json('refund.status'));

        // Stock: returned +1 → back to 9
        $this->assertDatabaseHas('product_branch_stocks', [
            'product_id' => $this->product->id,
            'branch_id' => $this->branch->id,
            'qty' => 9,
        ]);

        // product_refunds row with channel for strict list filter
        $refunds = (new MirrorRecord())->forTable('product_refunds')->newQuery()->get();
        $this->assertGreaterThanOrEqual(1, $refunds->count());
        $refund = $refunds->first();
        $this->assertSame('store', $refund->channel ?? ($refund->payload['channel'] ?? null));
        $this->assertEqualsWithDelta(100000, (float) ($refund->payload['totalPayableAmount'] ?? 0), 0.01);

        // List with channel=store must include the refund
        $list = $this->getJson('/api/products/refunds?channel=store&page=1&limit=15');
        $list->assertOk();
        $items = $list->json('items') ?? $list->json();
        $this->assertIsArray($items);
        $codes = collect(is_array($items) && isset($items[0]) ? $items : ($list->json('items') ?? []))
            ->pluck('code')
            ->filter()
            ->all();
        $this->assertNotEmpty($list->json('items') ?? $list->json('total'));
    }

    public function test_return_exchange_rejects_non_completed_sale(): void
    {
        $created = $this->postJson('/api/products/sales', [
            'branchId' => (string) $this->branch->id,
            'customerId' => (string) $this->customer->id,
            'status' => 'draft',
            'items' => [[
                'productId' => (string) $this->product->id,
                'amount' => 1,
                'value' => 100000,
            ]],
        ]);
        $created->assertCreated();
        $this->postJson('/api/products/sales/'.$created->json('_id').'/return-exchange', [
            'channel' => 'store',
            'returnedItems' => [[
                'productId' => (string) $this->product->id,
                'amount' => 1,
                'value' => 100000,
            ]],
            'totalAmount' => 100000,
        ])->assertStatus(422);
    }

    public function test_product_refunds_search_matches_code_and_customer(): void
    {
        $sale = $this->postJson('/api/products/sales', [
            'branchId' => (string) $this->branch->id,
            'customerId' => (string) $this->customer->id,
            'channel' => 'store',
            'status' => 'draft',
            'items' => [[
                'productId' => (string) $this->product->id,
                'amount' => 1,
                'value' => 100000,
            ]],
        ]);
        $saleId = $sale->json('_id');
        $this->postJson('/api/products/sales/'.$saleId.'/complete')->assertOk();
        $this->postJson('/api/products/sales/'.$saleId.'/return-exchange', [
            'code' => 'TH-SEARCH-99',
            'branchId' => (string) $this->branch->id,
            'channel' => 'store',
            'totalAmount' => 100000,
            'customerName' => 'Khách local',
            'customerPhone' => '0900000000',
            'returnedItems' => [[
                'productId' => (string) $this->product->id,
                'amount' => 1,
                'value' => 100000,
            ]],
        ])->assertOk();

        $byCode = $this->getJson('/api/products/refunds?channel=store&q=TH-SEARCH-99');
        $byCode->assertOk();
        $this->assertGreaterThanOrEqual(1, (int) ($byCode->json('total') ?? count($byCode->json('items') ?? [])));

        $byPhone = $this->getJson('/api/products/refunds?channel=store&q=0900000000');
        $byPhone->assertOk();
        $this->assertGreaterThanOrEqual(1, (int) ($byPhone->json('total') ?? count($byPhone->json('items') ?? [])));
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

        $branchB = Branch::create([
            'mongo_id' => 'branchlocal000000000002',
            'name' => 'Kho Local B',
            'code' => 'LOCALB',
            'is_active' => true,
        ]);

        // Same source/destination must be rejected (TR-002).
        $sameWh = $this->postJson('/api/warehouse/transfers', [
            'sourceWarehouseId' => (string) $this->branch->id,
            'destinationWarehouseId' => (string) $this->branch->id,
            'status' => 'DRAFT',
            'lines' => [[
                'productId' => (string) $this->product->id,
                'quantity' => 1,
            ]],
        ]);
        $sameWh->assertStatus(422);

        $transfer = $this->postJson('/api/warehouse/transfers', [
            'sourceWarehouseId' => (string) $this->branch->id,
            'destinationWarehouseId' => (string) $branchB->id,
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
        // setUp() already attaches admin Authorization for write endpoints.
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
        $admin = User::query()->where('email', 'admin.local@example.test')->first();
        $this->assertNotNull($admin);
        $adminToken = 'local-laravel-token-'.$admin->id;
        $adminHeaders = ['Authorization' => 'Bearer '.$adminToken];

        $draft = $this->postJson('/api/inventory-audits', $draftPayload);
        $draft->assertCreated()->assertJsonPath('code', 'KK-DRAFT')->assertJsonPath('status', 'DRAFT');
        $draftId = $draft->json('_id');

        // Submit DRAFT -> SUBMITTED (state machine)
        $submitResp = $this->postJson('/api/inventory-audits/'.$draftId.'/submit');
        $submitResp->assertOk()->assertJsonPath('status', 'SUBMITTED');

        // COUNTING cannot reconcile; only SUBMITTED can (with admin token)
        $counting = $this->postJson('/api/inventory-audits', [
            'code' => 'KK-COUNT',
            'warehouseId' => (string) $this->branch->id,
            'auditType' => 'BY_PRODUCT',
            'status' => 'COUNTING',
            'items' => [
                ['productId' => (string) $this->product->id, 'productCodeSnapshot' => 'SP', 'productNameSnapshot' => 'SP', 'systemQuantitySnapshot' => 1, 'physicalQuantity' => 1, 'varianceQuantity' => 0],
            ],
        ]);
        $countingId = $counting->json('_id');
        $this->withHeaders($adminHeaders)
            ->postJson('/api/inventory-audits/'.$countingId.'/reconcile')
            ->assertStatus(422);

        // Verify enrichment on read path (GET uses auditRow with branch lookup)
        $draftRead = $this->withHeaders($adminHeaders)->getJson('/api/inventory-audits/'.$draftId);
        $draftRead->assertOk()->assertJsonPath('warehouseName', 'Kho Local');
        $this->assertTrue(collect($draftRead->json('availableActions') ?? [])->contains(fn ($a) => ($a['action'] ?? '') === 'reconcile'));

        // Create FULL type, submit, then reconcile as admin
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
        $this->postJson('/api/inventory-audits/'.$fullId.'/submit')->assertOk()->assertJsonPath('status', 'SUBMITTED');
        $reconcile = $this->withHeaders($adminHeaders)->postJson('/api/inventory-audits/'.$fullId.'/reconcile');
        $reconcile->assertOk()->assertJsonPath('status', 'RECONCILED');

        // Create then cancel (after submit -> SUBMITTED still cancellable)
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

        // Now verify list non-empty (setUp already authenticates as admin)
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

    // --- Branch write flow tests (strict password confirmation on SQLite :memory:) ---

    private const BRANCH_CONFIRM_PASSWORD = 'branch-confirm-pass';

    private function createAdminUser(string $role = 'ADMIN', bool $isRoot = false, string $password = self::BRANCH_CONFIRM_PASSWORD): User
    {
        return User::create([
            'name' => 'Test Admin',
            'email' => 'admin-branch-test-'.uniqid('', true).'@local.test',
            'password' => $password, // hashed via User model cast
            'role' => $role,
            'status' => 'ACTIVE',
            'is_root_owner' => $isRoot,
            'is_active' => true,
        ]);
    }

    private function adminAuthHeaders(User $admin): array
    {
        return ['Authorization' => 'Bearer local-laravel-token-'.$admin->id];
    }

    public function test_branch_list_and_usage_endpoints_work(): void
    {
        $admin = $this->createAdminUser();
        $headers = $this->adminAuthHeaders($admin);

        $list = $this->withHeaders($headers)
            ->getJson('/api/system/branches?limit=10&includeInactive=true');
        $list->assertOk()
            ->assertJsonStructure(['items', 'total', 'page', 'limit']);

        $branchId = $this->branch->id;
        $usage = $this->withHeaders($headers)
            ->getJson("/api/system/branches/{$branchId}/usage");
        $usage->assertOk()
            ->assertJsonStructure(['branchId', 'branchName', 'isActive', 'totalLinked', 'links']);
    }

    /** BE-BR-AUTH-001 */
    public function test_branch_create_without_token_is_forbidden(): void
    {
        $before = Branch::count();
        $this->postJson('/api/system/branches', [
            'name' => 'No Token Branch',
            'code' => 'NOTOKEN',
            'address' => 'Addr',
            'phone' => '0909',
            'adminPassword' => self::BRANCH_CONFIRM_PASSWORD,
        ])->assertStatus(403);
        $this->assertSame($before, Branch::count());
    }

    /** BE-BR-AUTH-002 */
    public function test_branch_create_with_employee_token_is_forbidden(): void
    {
        $employee = User::create([
            'name' => 'Employee',
            'email' => 'emp-branch-'.uniqid('', true).'@local.test',
            'password' => 'employee-pass-123',
            'role' => 'EMPLOYEE',
            'status' => 'ACTIVE',
            'is_root_owner' => false,
            'is_active' => true,
        ]);
        $before = Branch::count();
        $this->withHeaders($this->adminAuthHeaders($employee))
            ->postJson('/api/system/branches', [
                'name' => 'Emp Branch',
                'code' => 'EMPBR1',
                'address' => 'Addr',
                'phone' => '0909',
                'adminPassword' => 'employee-pass-123',
            ])->assertStatus(403);
        $this->assertSame($before, Branch::count());
    }

    /** BE-BR-AUTH-003 */
    public function test_branch_create_missing_password_returns_422(): void
    {
        $admin = $this->createAdminUser();
        $before = Branch::count();
        $this->withHeaders($this->adminAuthHeaders($admin))
            ->postJson('/api/system/branches', [
                'name' => 'Missing Password',
                'code' => 'MISS1',
                'adminPassword' => '',
            ])->assertStatus(422);
        $this->assertSame($before, Branch::count());
    }

    /** BE-BR-AUTH-004 + duplicate code */
    public function test_branch_create_success_and_duplicate_code_block(): void
    {
        $admin = $this->createAdminUser('ADMIN', true);
        $headers = $this->adminAuthHeaders($admin);

        $create = $this->withHeaders($headers)
            ->postJson('/api/system/branches', [
                'name' => 'Branch Test Create',
                'code' => 'TSTCREATE',
                'address' => 'Test Addr',
                'phone' => '0987',
                'adminPassword' => self::BRANCH_CONFIRM_PASSWORD,
            ]);
        $create->assertStatus(201)
            ->assertJsonPath('code', 'TSTCREATE')
            ->assertJsonPath('name', 'Branch Test Create');

        $dup = $this->withHeaders($headers)
            ->postJson('/api/system/branches', [
                'name' => 'Dup',
                'code' => 'TSTCREATE',
                'adminPassword' => self::BRANCH_CONFIRM_PASSWORD,
            ]);
        $dup->assertStatus(422)
            ->assertJsonPath('message', 'Mã kho đã tồn tại.');
    }

    /** BE-BR-AUTH-005 — long wrong password must not bypass */
    public function test_branch_create_rejects_long_wrong_password(): void
    {
        $admin = $this->createAdminUser(password: 'realpass123');
        $before = Branch::count();
        $this->withHeaders($this->adminAuthHeaders($admin))
            ->postJson('/api/system/branches', [
                'name' => 'Wrong Long',
                'code' => 'WRONGLONG',
                'address' => 'Addr',
                'phone' => '0901',
                'adminPassword' => 'definitely-wrong-password',
            ])->assertStatus(403);
        $this->assertSame($before, Branch::count());
    }

    /** BE-BR-AUTH-006 — literal "admin" is not a bypass */
    public function test_branch_create_rejects_admin_literal_bypass(): void
    {
        $admin = $this->createAdminUser(password: 'realpass123');
        $before = Branch::count();
        $this->withHeaders($this->adminAuthHeaders($admin))
            ->postJson('/api/system/branches', [
                'name' => 'Admin Bypass',
                'code' => 'ADMINBYP',
                'address' => 'Addr',
                'phone' => '0901',
                'adminPassword' => 'admin',
            ])->assertStatus(403);
        $this->assertSame($before, Branch::count());
    }

    /** BE-BR-AUTH-007 — password must match token owner, not another admin */
    public function test_branch_create_requires_password_of_token_owner_not_other_admin(): void
    {
        $adminA = $this->createAdminUser(password: 'password-of-admin-a');
        $adminB = $this->createAdminUser(password: 'password-of-admin-b');
        $headersA = $this->adminAuthHeaders($adminA);
        $before = Branch::count();

        $this->withHeaders($headersA)
            ->postJson('/api/system/branches', [
                'name' => 'Cross Admin',
                'code' => 'CROSSA1',
                'address' => 'Addr',
                'phone' => '0901',
                'adminPassword' => 'password-of-admin-b',
            ])->assertStatus(403);
        $this->assertSame($before, Branch::count());

        $this->withHeaders($headersA)
            ->postJson('/api/system/branches', [
                'name' => 'Owner Admin',
                'code' => 'OWNERA1',
                'address' => 'Addr',
                'phone' => '0901',
                'adminPassword' => 'password-of-admin-a',
            ])->assertStatus(201)
            ->assertJsonPath('code', 'OWNERA1');
    }

    /** BE-BR-AUTH-008 — DB order of admins does not matter */
    public function test_branch_create_password_not_tied_to_first_admin_in_db(): void
    {
        $adminB = $this->createAdminUser(password: 'password-of-b-first');
        $adminA = $this->createAdminUser(password: 'password-of-a-second');
        $this->assertTrue($adminB->id < $adminA->id);

        $headersA = $this->adminAuthHeaders($adminA);
        $before = Branch::count();

        $this->withHeaders($headersA)
            ->postJson('/api/system/branches', [
                'name' => 'B Password',
                'code' => 'ORDERB1',
                'address' => 'Addr',
                'phone' => '0901',
                'adminPassword' => 'password-of-b-first',
            ])->assertStatus(403);
        $this->assertSame($before, Branch::count());

        $this->withHeaders($headersA)
            ->postJson('/api/system/branches', [
                'name' => 'A Password',
                'code' => 'ORDERA1',
                'address' => 'Addr',
                'phone' => '0901',
                'adminPassword' => 'password-of-a-second',
            ])->assertStatus(201);
    }

    /** BE-BR-AUTH-009 — empty stored password rejects all */
    public function test_branch_create_rejects_when_user_password_empty(): void
    {
        $admin = $this->createAdminUser();
        \Illuminate\Support\Facades\DB::table('users')->where('id', $admin->id)->update(['password' => '']);
        $admin->refresh();

        $before = Branch::count();
        $this->withHeaders($this->adminAuthHeaders($admin))
            ->postJson('/api/system/branches', [
                'name' => 'Empty Hash',
                'code' => 'EMPTY1',
                'address' => 'Addr',
                'phone' => '0901',
                'adminPassword' => self::BRANCH_CONFIRM_PASSWORD,
            ])->assertStatus(403);
        $this->withHeaders($this->adminAuthHeaders($admin))
            ->postJson('/api/system/branches', [
                'name' => 'Empty Hash 2',
                'code' => 'EMPTY2',
                'address' => 'Addr',
                'phone' => '0901',
                'adminPassword' => 'admin',
            ])->assertStatus(403);
        $this->assertSame($before, Branch::count());
    }

    /** BE-BR-AUTH-010 — legacy plaintext exact match only */
    public function test_branch_create_supports_legacy_plaintext_exact_match_only(): void
    {
        $now = now();
        $id = \Illuminate\Support\Facades\DB::table('users')->insertGetId([
            'name' => 'Legacy Admin',
            'email' => 'legacy-branch-'.uniqid('', true).'@local.test',
            'password' => 'legacy-plain-pass',
            'role' => 'ADMIN',
            'status' => 'ACTIVE',
            'is_root_owner' => false,
            'is_active' => true,
            'created_at' => $now,
            'updated_at' => $now,
        ]);
        $admin = User::findOrFail($id);
        $headers = $this->adminAuthHeaders($admin);
        $before = Branch::count();

        $this->withHeaders($headers)
            ->postJson('/api/system/branches', [
                'name' => 'Legacy Wrong',
                'code' => 'LEGWR1',
                'address' => 'Addr',
                'phone' => '0901',
                'adminPassword' => 'wrong-but-long-enough-pass',
            ])->assertStatus(403);
        $this->assertSame($before, Branch::count());

        $this->withHeaders($headers)
            ->postJson('/api/system/branches', [
                'name' => 'Legacy Ok',
                'code' => 'LEGOK1',
                'address' => 'Addr',
                'phone' => '0901',
                'adminPassword' => 'legacy-plain-pass',
            ])->assertStatus(201);

        // Confirmation must not upgrade password on its own.
        $stored = \Illuminate\Support\Facades\DB::table('users')->where('id', $id)->value('password');
        $this->assertSame('legacy-plain-pass', $stored);
    }

    /** BE-BR-AUTH-011 */
    public function test_branch_update_requires_strict_password_of_caller(): void
    {
        $admin = $this->createAdminUser(password: 'update-pass-ok');
        $headers = $this->adminAuthHeaders($admin);
        $originalName = $this->branch->name;

        $this->withHeaders($headers)
            ->patchJson('/api/system/branches/'.$this->branch->id, [
                'name' => 'Should Not Change',
                'address' => 'X',
                'phone' => '0901',
                'adminPassword' => 'wrong-update-password',
            ])->assertStatus(403);
        $this->assertSame($originalName, $this->branch->fresh()->name);

        $this->withHeaders($headers)
            ->patchJson('/api/system/branches/'.$this->branch->id, [
                'name' => 'Updated Name',
                'address' => 'New Addr',
                'phone' => '0901',
                'adminPassword' => 'update-pass-ok',
            ])->assertOk()
            ->assertJsonPath('name', 'Updated Name');
    }

    /** BE-BR-AUTH-012 */
    public function test_branch_activate_deactivate_require_strict_password(): void
    {
        $admin = $this->createAdminUser();
        $headers = $this->adminAuthHeaders($admin);
        $created = $this->withHeaders($headers)->postJson('/api/system/branches', [
            'name' => 'To Toggle',
            'code' => 'TOGGLE1',
            'address' => 'Addr',
            'phone' => '0901',
            'adminPassword' => self::BRANCH_CONFIRM_PASSWORD,
        ])->assertStatus(201);
        $id = $created->json('_id') ?? $created->json('id');

        $this->withHeaders($headers)
            ->postJson("/api/system/branches/{$id}/deactivate", ['adminPassword' => 'wrong-deactivate-pass'])
            ->assertStatus(403);
        $this->assertTrue((bool) Branch::find($id)?->is_active);

        $this->withHeaders($headers)
            ->postJson("/api/system/branches/{$id}/deactivate", ['adminPassword' => self::BRANCH_CONFIRM_PASSWORD])
            ->assertOk()
            ->assertJsonPath('isActive', false);

        $this->withHeaders($headers)
            ->postJson("/api/system/branches/{$id}/activate", ['adminPassword' => 'wrong-activate-pass'])
            ->assertStatus(403);
        $this->assertFalse((bool) Branch::find($id)?->is_active);

        $this->withHeaders($headers)
            ->postJson("/api/system/branches/{$id}/activate", ['adminPassword' => self::BRANCH_CONFIRM_PASSWORD])
            ->assertOk()
            ->assertJsonPath('isActive', true);
    }

    /** BE-BR-AUTH-013 + 014 */
    public function test_branch_delete_strict_password_and_linked_guard(): void
    {
        $admin = $this->createAdminUser();
        $headers = $this->adminAuthHeaders($admin);

        $created = $this->withHeaders($headers)->postJson('/api/system/branches', [
            'name' => 'To Delete',
            'code' => 'DEL1',
            'address' => 'Addr',
            'phone' => '0901',
            'adminPassword' => self::BRANCH_CONFIRM_PASSWORD,
        ])->assertStatus(201);
        $id = $created->json('_id') ?? $created->json('id');

        $this->withHeaders($headers)
            ->deleteJson("/api/system/branches/{$id}", ['adminPassword' => 'wrong-delete-pass'])
            ->assertStatus(403);
        $this->assertNotNull(Branch::find($id));

        $this->withHeaders($headers)
            ->deleteJson("/api/system/branches/{$id}", ['adminPassword' => self::BRANCH_CONFIRM_PASSWORD])
            ->assertOk()
            ->assertJson(['ok' => true]);
        $this->assertNull(Branch::find($id));

        // Linked branch (setUp product stock) cannot be deleted even with correct password.
        $this->withHeaders($headers)
            ->deleteJson('/api/system/branches/'.$this->branch->id, ['adminPassword' => self::BRANCH_CONFIRM_PASSWORD])
            ->assertStatus(409)
            ->assertJsonPath('message', 'Không thể xóa kho hàng vì còn dữ liệu liên kết.');
        $this->assertNotNull($this->branch->fresh());

        $this->withHeaders($headers)
            ->deleteJson('/api/system/branches/999999', ['adminPassword' => self::BRANCH_CONFIRM_PASSWORD])
            ->assertStatus(404);
    }
}
