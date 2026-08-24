<?php

namespace App\Support;

final class InvoiceFinancials
{
    public static function grossFromItems(array $items): float
    {
        $gross = 0.0;

        foreach ($items as $item) {
            if (! is_array($item)) {
                continue;
            }

            $quantity = (float) ($item['amount'] ?? $item['quantity'] ?? $item['qty'] ?? 0);
            $unitValue = (float) ($item['value'] ?? $item['price'] ?? 0);
            $gross += $quantity * $unitValue;
        }

        return max(0.0, round($gross, 2));
    }

    public static function discountAmount(float $gross, mixed $discountValue, mixed $discountType, mixed $netValue = null): float
    {
        $gross = max(0.0, $gross);
        $entered = is_numeric($discountValue) ? max(0.0, (float) $discountValue) : 0.0;
        $type = strtolower(trim((string) $discountType));
        $isPercent = in_array($type, ['percent', 'percentage', '%'], true);
        $derived = 0.0;

        if ($gross > 0 && is_numeric($netValue)) {
            $net = max(0.0, (float) $netValue);
            if ($gross > $net + 0.0001) {
                $derived = min($gross, $gross - $net);
            }
        }

        if ($entered > 0) {
            if ($isPercent && $entered <= 100) {
                return round($gross > 0 ? min($gross, $gross * $entered / 100) : $derived, 2);
            }

            if ($derived > 0 && (! $isPercent || $entered > 100) && ($entered > 100 || abs($derived - $entered) <= 0.01)) {
                return round($derived, 2);
            }

            return round($gross > 0 ? min($gross, $entered) : $entered, 2);
        }

        return round($derived, 2);
    }

    public static function saleRevenue(object|array $row): float
    {
        $payload = self::payload($row);
        foreach ([
            self::value($row, 'value'),
            self::value($row, 'total'),
            $payload['value'] ?? null,
            $payload['total'] ?? null,
            $payload['totalAmount'] ?? null,
            self::value($row, 'value_payment'),
            $payload['valuePayment'] ?? null,
        ] as $candidate) {
            if ($candidate !== null && $candidate !== '' && is_numeric($candidate)) {
                return max(0.0, (float) $candidate);
            }
        }

        return 0.0;
    }

    public static function saleDiscount(object|array $row): float
    {
        $payload = self::payload($row);
        $items = self::items($row, $payload);
        $discountValue = self::value($row, 'discount_value') ?? $payload['discountValue'] ?? $payload['discount_value'] ?? $payload['discount'] ?? 0;
        $discountType = self::value($row, 'discount_type') ?? $payload['discountType'] ?? $payload['discount_type'] ?? null;

        return self::discountAmount(self::grossFromItems($items), $discountValue, $discountType, self::saleRevenue($row));
    }

    public static function refundAmount(object|array $row): float
    {
        $payload = self::payload($row);
        foreach ([
            self::value($row, 'value'),
            self::value($row, 'total'),
            self::value($row, 'total_payable_amount'),
            $payload['value'] ?? null,
            $payload['total'] ?? null,
            $payload['totalPayableAmount'] ?? null,
            $payload['refundAmount'] ?? null,
        ] as $candidate) {
            if ($candidate !== null && $candidate !== '' && is_numeric($candidate)) {
                return abs((float) $candidate);
            }
        }

        return 0.0;
    }

    private static function payload(object|array $row): array
    {
        $payload = self::value($row, 'payload');

        return is_array($payload) ? $payload : [];
    }

    private static function items(object|array $row, array $payload): array
    {
        $items = self::value($row, 'items');

        return is_array($items) && $items !== [] ? $items : (is_array($payload['items'] ?? null) ? $payload['items'] : []);
    }

    private static function value(object|array $row, string $key): mixed
    {
        return is_array($row) ? ($row[$key] ?? null) : ($row->{$key} ?? null);
    }
}
