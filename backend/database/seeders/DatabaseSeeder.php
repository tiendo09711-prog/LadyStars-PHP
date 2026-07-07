<?php

namespace Database\Seeders;

use App\Models\Branch;
use App\Models\Customer;
use App\Models\MirrorRecord;
use App\Models\Product;
use App\Models\ProductBranchStock;
use App\Models\User;
use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;
use Illuminate\Support\Str;

class DatabaseSeeder extends Seeder
{
    use WithoutModelEvents;

    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        // NOTE: For full real data, prefer: php artisan migrate:fresh && php artisan import:legacy-data --force
        // This seeder only provides minimal demo when no legacy data.
        // Default admin account for local/dev (password 123456)
        $admin = User::updateOrCreate(
            ['email' => 'admin@gmail.com'],
            [
                'name' => 'Admin',
                'password' => '123456',
                'role' => 'ADMIN',
                'status' => 'ACTIVE',
                'is_root_owner' => true,
                'is_active' => true,
                'phone' => null,
            ]
        );

        // Demo data so UI has content after login (addresses the "no data after login" issue)
        if (Branch::count() === 0) {
            $branch1 = Branch::create([
                'mongo_id' => bin2hex(random_bytes(12)),
                'name' => 'Cửa hàng Trung tâm',
                'code' => 'CN01',
                'phone' => '0901234567',
                'address' => '123 Nguyễn Trãi, Q1, TP.HCM',
                'is_active' => true,
            ]);
            $branch2 = Branch::create([
                'mongo_id' => bin2hex(random_bytes(12)),
                'name' => 'Chi nhánh Thủ Đức',
                'code' => 'CN02',
                'phone' => '0907654321',
                'address' => '456 Võ Văn Ngân, TP.Thủ Đức',
                'is_active' => true,
            ]);
        } else {
            $branch1 = Branch::first();
            $branch2 = Branch::skip(1)->first() ?? $branch1;
        }

        if (Product::count() === 0) {
            $p1 = Product::create([
                'mongo_id' => bin2hex(random_bytes(12)),
                'name' => 'Son môi Lady Red',
                'code' => 'SP001',
                'price' => 250000,
                'cost' => 120000,
                'wholesale_price' => 180000,
                'qty' => 45,
                'type' => 'product',
                'unit' => 'cái',
                'allows_sale' => true,
                'status' => 'Mới',
                'barcode' => '8931234567890',
            ]);
            $p2 = Product::create([
                'mongo_id' => bin2hex(random_bytes(12)),
                'name' => 'Kem dưỡng da ban ngày',
                'code' => 'SP002',
                'price' => 320000,
                'cost' => 150000,
                'wholesale_price' => 220000,
                'qty' => 30,
                'type' => 'product',
                'unit' => 'hộp',
                'allows_sale' => true,
                'status' => 'Mới',
                'barcode' => '8931234567891',
            ]);
            $p3 = Product::create([
                'mongo_id' => bin2hex(random_bytes(12)),
                'name' => 'Nước hoa mini 20ml',
                'code' => 'SP003',
                'price' => 450000,
                'cost' => 210000,
                'wholesale_price' => 320000,
                'qty' => 18,
                'type' => 'product',
                'unit' => 'chai',
                'allows_sale' => true,
                'status' => 'Mới',
            ]);

            // stocks
            ProductBranchStock::updateOrCreate(
                ['product_id' => $p1->id, 'branch_id' => $branch1->id],
                ['mongo_id' => bin2hex(random_bytes(12)), 'qty' => 30, 'locked_quantity' => 0]
            );
            ProductBranchStock::updateOrCreate(
                ['product_id' => $p1->id, 'branch_id' => $branch2->id],
                ['mongo_id' => bin2hex(random_bytes(12)), 'qty' => 15, 'locked_quantity' => 0]
            );
            ProductBranchStock::updateOrCreate(
                ['product_id' => $p2->id, 'branch_id' => $branch1->id],
                ['mongo_id' => bin2hex(random_bytes(12)), 'qty' => 20, 'locked_quantity' => 0]
            );
            ProductBranchStock::updateOrCreate(
                ['product_id' => $p3->id, 'branch_id' => $branch1->id],
                ['mongo_id' => bin2hex(random_bytes(12)), 'qty' => 12, 'locked_quantity' => 0]
            );
        }

        if (Customer::count() === 0) {
            Customer::create([
                'mongo_id' => bin2hex(random_bytes(12)),
                'name' => 'Nguyễn Thị Lan',
                'code' => 'KH001',
                'phone' => '0912345678',
                'type' => 'person',
                'customer_level' => 'VIP',
            ]);
            Customer::create([
                'mongo_id' => bin2hex(random_bytes(12)),
                'name' => 'Công ty TNHH Sao Mai',
                'code' => 'KH002',
                'phone' => '0283456789',
                'type' => 'company',
            ]);
        }

        // Seed a couple of demo sales so dashboard + lists have content
        if ((new MirrorRecord())->forTable('sale_payments')->newQuery()->count() === 0) {
            $now = now();
            $payload1 = [
                'code' => 'HD25070101',
                'customerName' => 'Nguyễn Thị Lan',
                'items' => [
                    ['productId' => 'SP001', 'name' => 'Son môi Lady Red', 'amount' => 2, 'price' => 250000, 'value' => 500000],
                ],
                'totalAmount' => 500000,
                'valuePayment' => 500000,
                'status' => 'completed',
                'branchId' => $branch1->id ?? null,
                'createdAt' => $now->toISOString(),
            ];
            (new MirrorRecord())->forTable('sale_payments')->newQuery()->create([
                'mongo_id' => bin2hex(random_bytes(12)),
                'code' => $payload1['code'],
                'status' => 'completed',
                'business_date' => $now,
                'value_payment' => 500000,
                'payload' => $payload1,
                'branch_id' => $branch1->id ?? null,
            ]);

            $payload2 = [
                'code' => 'HD25070102',
                'customerName' => 'Công ty TNHH Sao Mai',
                'items' => [
                    ['productId' => 'SP002', 'name' => 'Kem dưỡng da ban ngày', 'amount' => 1, 'price' => 320000, 'value' => 320000],
                ],
                'totalAmount' => 320000,
                'valuePayment' => 320000,
                'status' => 'completed',
                'branchId' => $branch2->id ?? null,
                'createdAt' => $now->subDay()->toISOString(),
            ];
            (new MirrorRecord())->forTable('sale_payments')->newQuery()->create([
                'mongo_id' => bin2hex(random_bytes(12)),
                'code' => $payload2['code'],
                'status' => 'completed',
                'business_date' => $now->subDay(),
                'value_payment' => 320000,
                'payload' => $payload2,
                'branch_id' => $branch2->id ?? null,
            ]);
        }
    }
}
