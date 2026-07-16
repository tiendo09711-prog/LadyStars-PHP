<?php

namespace App\Http\Middleware;

use App\Models\User;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Require a valid local login token: Authorization: Bearer local-laravel-token-{userId}.
 * Applied to API write paths that mutate inventory / sales / warehouse data.
 */
class LocalTokenAuth
{
    public function handle(Request $request, Closure $next): Response
    {
        $path = trim($request->path(), '/');
        // Public auth endpoints
        if ($path === 'api/auth/login' || $path === 'auth/login') {
            return $next($request);
        }

        $authHeader = (string) $request->header('Authorization', '');
        if (!preg_match('/local-laravel-token-(\d+)/', $authHeader, $matches)) {
            return response()->json(['message' => 'Unauthenticated. Vui lòng đăng nhập lại.'], 401);
        }

        $user = User::query()->find((int) $matches[1]);
        if (!$user) {
            return response()->json(['message' => 'Unauthenticated. Tài khoản không tồn tại.'], 401);
        }

        $active = $user->is_active;
        if ($active === false || $active === 0 || $active === '0') {
            return response()->json(['message' => 'Unauthenticated. Tài khoản đã bị khóa.'], 401);
        }

        $request->attributes->set('localUser', $user);
        $request->setUserResolver(static fn () => $user);

        return $next($request);
    }
}
