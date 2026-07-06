<?php

namespace Tests\Feature;

use App\Models\Category;
use App\Models\Product;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CategoryCrudApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_can_create_a_category(): void
    {
        $response = $this->postJson('/api/products/categories', [
            'name' => 'Danh muc test',
            'code' => 'DM-1001',
            'isActive' => true,
        ]);

        $response->assertStatus(201)
            ->assertJsonPath('name', 'Danh muc test')
            ->assertJsonPath('code', 'DM-1001')
            ->assertJsonPath('isActive', true);
    }

    public function test_create_requires_name(): void
    {
        $response = $this->postJson('/api/products/categories', [
            'code' => 'DM-1002',
        ]);

        $response->assertStatus(422);
    }

    public function test_create_rejects_duplicate_code(): void
    {
        Category::create(['name' => 'Cu', 'code' => 'DM-DUP', 'is_active' => true]);

        $response = $this->postJson('/api/products/categories', [
            'name' => 'Moi trung ma',
            'code' => 'DM-DUP',
        ]);

        $response->assertStatus(422);
    }

    public function test_update_keeps_code_when_not_provided(): void
    {
        $category = Category::create(['name' => 'Gi mau', 'code' => 'DM-KEEP', 'is_active' => true]);

        $response = $this->patchJson('/api/products/categories/'.$category->id, [
            'name' => 'Gi mau doi',
            'isActive' => false,
        ]);

        $response->assertStatus(200)
            ->assertJsonPath('name', 'Gi mau doi')
            ->assertJsonPath('code', 'DM-KEEP')
            ->assertJsonPath('isActive', false);
    }

    public function test_update_rejects_self_parent(): void
    {
        $category = Category::create(['name' => 'Cha', 'code' => 'DM-SELF', 'is_active' => true]);

        $response = $this->patchJson('/api/products/categories/'.$category->id, [
            'name' => 'Cha',
            'parentId' => $category->id,
        ]);

        $response->assertStatus(422);
    }

    public function test_delete_blocked_when_products_exist(): void
    {
        $category = Category::create(['name' => 'Con sp', 'code' => 'DM-SP', 'is_active' => true]);
        Product::create([
            'name' => 'SP cha danh muc',
            'code' => 'SP-CAT',
            'category_id' => $category->id,
            'category_name' => $category->name,
            'price' => 1000,
            'cost' => 500,
            'qty' => 0,
            'allows_sale' => true,
            'type' => 'product',
        ]);

        $response = $this->deleteJson('/api/products/categories/'.$category->id);

        $response->assertStatus(409);
    }

    public function test_delete_blocked_when_has_children(): void
    {
        $parent = Category::create(['name' => 'Me', 'code' => 'DM-ME', 'is_active' => true]);
        Category::create(['name' => 'Con', 'code' => 'DM-CON', 'parent_id' => $parent->id, 'is_active' => true]);

        $response = $this->deleteJson('/api/products/categories/'.$parent->id);

        $response->assertStatus(409);
    }

    public function test_can_delete_empty_category(): void
    {
        $category = Category::create(['name' => 'Rong', 'code' => 'DM-EMPTY', 'is_active' => true]);

        $response = $this->deleteJson('/api/products/categories/'.$category->id);

        $response->assertStatus(200);
        $this->assertDatabaseMissing('categories', ['id' => $category->id]);
    }
}