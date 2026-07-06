import type { BranchRecord } from '../../../core/api/branch.api';
import type { IInventory } from '../../../types/product.type';

function toFiniteNumber(value: unknown) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : undefined;
}

export function getInventoryBranchStock(item: IInventory, branch: BranchRecord) {
  const byId = toFiniteNumber(item.stockByBranchId?.[branch._id]);
  if (byId !== undefined) return byId;

  const byCode = toFiniteNumber(item.stockByBranchCode?.[branch.code]);
  if (byCode !== undefined) return byCode;

  return 0;
}
