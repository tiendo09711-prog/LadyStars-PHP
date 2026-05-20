import type { Request } from 'express';
import { AuditLog } from './audit.model.js';

type AuditInput = {
  action: string;
  module: string;
  resource?: string;
  resourceId?: string;
  before?: unknown;
  after?: unknown;
  metadata?: unknown;
};

function plain(value: unknown) {
  if (!value) return value;
  if (typeof (value as any).toObject === 'function') return (value as any).toObject();
  return value;
}

export async function writeAuditLog(req: Request | undefined, input: AuditInput) {
  try {
    const user = req ? (req as any).user : undefined;
    await AuditLog.create({
      userId: user?.sub,
      userName: user?.name,
      userEmail: user?.email,
      action: input.action,
      module: input.module,
      resource: input.resource,
      resourceId: input.resourceId,
      before: plain(input.before),
      after: plain(input.after),
      metadata: input.metadata,
      ip: req?.ip,
      userAgent: req?.headers['user-agent'],
    });

    if (input.resource === 'Product') {
      try {
        const { ProductEditLog } = await import('../../modules/product/product.models.js');
        const beforeObj = plain(input.before) as any;
        const afterObj = plain(input.after) as any;
        const editorName = user?.name || 'Hệ thống';

        if (input.action === 'crud.create' && afterObj) {
          await ProductEditLog.create({
            productCode: afterObj.code || '',
            productName: afterObj.name || '',
            logType: 'Sửa sản phẩm',
            logAction: 'Tạo sản phẩm mới',
            createdBy: editorName,
          });
        } else if (input.action === 'crud.update' && afterObj) {
          let logAction = 'Sửa thông tin';
          if (beforeObj) {
            if (beforeObj.price !== afterObj.price) {
              logAction = 'Sửa giá bán';
            } else if (beforeObj.cost !== afterObj.cost) {
              logAction = 'Sửa giá nhập';
            }
          }
          await ProductEditLog.create({
            productCode: afterObj.code || beforeObj?.code || '',
            productName: afterObj.name || beforeObj?.name || '',
            logType: 'Sửa sản phẩm',
            logAction,
            createdBy: editorName,
          });
        } else if (input.action === 'crud.delete' && beforeObj) {
          await ProductEditLog.create({
            productCode: beforeObj.code || '',
            productName: beforeObj.name || '',
            logType: 'Xóa sản phẩm',
            logAction: 'Xóa sản phẩm',
            createdBy: editorName,
          });
        }
      } catch (err) {
        console.error('[audit] failed to write ProductEditLog', err);
      }
    }
  } catch (error) {
    console.error('[audit] failed to write log', error);
  }
}
