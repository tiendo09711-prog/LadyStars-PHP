<?php

namespace App\Http\Controllers;

use Illuminate\Http\Response;
use Illuminate\Support\Facades\File;

class SpaController extends Controller
{
    /**
     * Serve the Vite/React production build (public/index.html).
     */
    public function __invoke(): Response
    {
        $index = public_path('index.html');

        abort_unless(
            File::isFile($index),
            404,
            'SPA index.html missing. Upload client/dist build into public/.'
        );

        return response(File::get($index), 200, [
            'Content-Type' => 'text/html; charset=UTF-8',
            'Cache-Control' => 'no-cache, private',
        ]);
    }
}
