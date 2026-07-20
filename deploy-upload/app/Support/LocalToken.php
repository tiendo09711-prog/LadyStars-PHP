<?php

namespace App\Support;

use App\Models\User;
use Illuminate\Http\Request;

class LocalToken
{
    public static function issue(User $user): string
    {
        return sprintf('local-laravel-token-%d-v%d', $user->id, (int) $user->token_version);
    }

    public static function resolve(Request $request): ?User
    {
        $authorization = trim((string) $request->header('Authorization', ''));
        if (!preg_match('/^Bearer\s+local-laravel-token-(\d+)(?:-v(\d+))?$/i', $authorization, $matches)) {
            return null;
        }

        $user = User::query()->find((int) $matches[1]);
        if (!$user) {
            return null;
        }

        $tokenVersion = isset($matches[2]) ? (int) $matches[2] : 0;
        if ($tokenVersion !== (int) $user->token_version) {
            return null;
        }

        if (in_array(strtoupper((string) $user->status), ['LOCKED', 'INACTIVE'], true) || ($user->is_active === false)) {
            return null;
        }

        return $user;
    }
}
