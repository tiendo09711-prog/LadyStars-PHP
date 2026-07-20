<?php

namespace App\Support;

use Illuminate\Contracts\Pagination\LengthAwarePaginator;

class ApiPagination
{
    public static function nodeCompatible(LengthAwarePaginator $paginator): array
    {
        return [
            'items' => $paginator->items(),
            'data' => $paginator->items(),
            'total' => $paginator->total(),
            'page' => $paginator->currentPage(),
            'limit' => $paginator->perPage(),
            'per_page' => $paginator->perPage(),
            'current_page' => $paginator->currentPage(),
            'last_page' => $paginator->lastPage(),
            'from' => $paginator->firstItem(),
            'to' => $paginator->lastItem(),
        ];
    }
}
