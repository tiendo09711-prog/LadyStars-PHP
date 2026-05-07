import { ClipboardList } from 'lucide-react';
import { DataModulePage } from '../../core/components/DataModulePage';

export function TaskPage() {
  return (
    <DataModulePage
      title="Công việc"
      subtitle="Project, task, kanban, bình luận, attachment và time log"
      endpoint="/tasks/tasks"
      icon={<ClipboardList size={24} />}
      primaryActionLabel="Thêm công việc"
      fields={[
        { key: 'title', label: 'Tên công việc' },
        { key: 'status', label: 'Trạng thái', type: 'status' },
        { key: 'priority', label: 'Ưu tiên', type: 'status' },
        { key: 'dueDate', label: 'Hạn xử lý', type: 'date' },
        { key: 'createdAt', label: 'Ngày tạo', type: 'date' },
      ]}
      formFields={[
        { key: 'title', label: 'Tên công việc', required: true },
        { key: 'status', label: 'Trạng thái', type: 'select', options: [
          { label: 'Todo', value: 'todo' },
          { label: 'Doing', value: 'doing' },
          { label: 'Review', value: 'review' },
          { label: 'Done', value: 'done' },
        ] },
        { key: 'priority', label: 'Ưu tiên', type: 'select', options: [
          { label: 'Low', value: 'low' },
          { label: 'Medium', value: 'medium' },
          { label: 'High', value: 'high' },
          { label: 'Urgent', value: 'urgent' },
        ] },
        { key: 'dueDate', label: 'Hạn xử lý', type: 'date' },
        { key: 'description', label: 'Mô tả', type: 'textarea' },
      ]}
      createDefaults={{ title: '', status: 'todo', priority: 'medium', dueDate: '', description: '' }}
      quickFilters={[
        { label: 'Todo', value: 'todo' },
        { label: 'Doing', value: 'doing' },
        { label: 'Done', value: 'done' },
      ]}
    />
  );
}
