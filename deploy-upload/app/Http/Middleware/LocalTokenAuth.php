<?php

namespace App\Http\Middleware;

use App\Support\LocalToken;
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

        $user = LocalToken::resolve($request);
        if (!$user) {
            return response()->json(['message' => 'Unauthenticated. Phiên đăng nhập không hợp lệ hoặc đã bị thu hồi.'], 401);
        }

        $request->attributes->set('localUser', $user);
        $request->setUserResolver(static fn () => $user);

        return $next($request);
    }
}
