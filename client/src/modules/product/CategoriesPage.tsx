import './product-compact.css';
import './categories-page.css';
import './categories-soft-type.css';
import { CategoryList } from './components/CategoryList';

export function CategoriesPage() {
  return (
    <div className="product-compact-shell categories-page-shell categories-root">
      <CategoryList />
    </div>
  );
}
