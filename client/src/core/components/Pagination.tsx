import { ChevronLeft, ChevronRight } from 'lucide-react';

type PaginationProps = {
  page: number;
  total: number;
  limit: number;
  onPageChange: (page: number) => void;
};

export function Pagination({ page, total, limit, onPageChange }: PaginationProps) {
  const totalPages = Math.ceil(total / limit) || 1;
  if (totalPages <= 1) return null;

  return (
    <div className="pagination" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderTop: '1px solid var(--border-color, #eee)' }}>
      <div style={{ fontSize: '13px', color: '#666' }}>
        Hiển thị {((page - 1) * limit) + 1} - {Math.min(page * limit, total)} trong tổng số {total} bản ghi
      </div>
      <div style={{ display: 'flex', gap: '4px' }}>
        <button
          className="btn btn-light"
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          style={{ padding: '4px 8px' }}
        >
          <ChevronLeft size={16} />
        </button>
        <div style={{ padding: '4px 12px', fontSize: '13px', fontWeight: 500, display: 'flex', alignItems: 'center' }}>
          Trang {page} / {totalPages}
        </div>
        <button
          className="btn btn-light"
          type="button"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          style={{ padding: '4px 8px' }}
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}
