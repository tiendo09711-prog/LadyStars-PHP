<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class SettingsAdmin
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();
        if (!$user || (! $user->is_root_owner && strtoupper((string) $user->role) !== 'ADMIN')) {
            return response()->json(['message' => 'Chỉ Admin hoặc Root Owner được truy cập cài đặt hệ thống.'], 403);
        }

        return $next($request);
    }
}
