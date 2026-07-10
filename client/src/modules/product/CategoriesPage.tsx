import './product-compact.css';
import './categories-page.css';
import { CategoryList } from './components/CategoryList';

export function CategoriesPage() {
  return (
    <div className="product-compact-shell categories-page-shell">
      <CategoryList />
    </div>
  );
}
