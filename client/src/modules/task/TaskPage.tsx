import { ClipboardList, Columns3, FolderKanban, GanttChartSquare } from 'lucide-react';
import { TabbedModulePage } from '../../core/components/TabbedModulePage';

const statusOptions = [
  { label: 'Backlog', value: 'backlog' },
  { label: 'Todo', value: 'todo' },
  { label: 'In progress', value: 'in_progress' },
  { label: 'Review', value: 'review' },
  { label: 'Done', value: 'done' },
  { label: 'Cancelled', value: 'cancelled' },
];

const priorityOptions = [
  { label: 'Low', value: 'low' },
  { label: 'Medium', value: 'medium' },
  { label: 'High', value: 'high' },
  { label: 'Urgent', value: 'urgent' },
];

export function TaskPage() {
  return (
    <TabbedModulePage
      tabs={[
        {
          key: 'projects',
          label: 'Dự án',
          title: 'Dự án',
          subtitle: 'Project planning, ngân sách, tiến độ và trạng thái',
          endpoint: '/tasks/projects',
          icon: <FolderKanban size={24} />,
          primaryActionLabel: 'Thêm dự án',
          fields: [
            { key: 'code', label: 'Mã dự án' },
            { key: 'name', label: 'Tên dự án' },
            { key: 'status', label: 'Trạng thái', type: 'status' },
            { key: 'priority', label: 'Ưu tiên', type: 'status' },
            { key: 'progressPercentage', label: 'Tiến độ', type: 'number' },
            { key: 'budget', label: 'Ngân sách', type: 'money' },
          ],
          formFields: [
            { key: 'code', label: 'Mã dự án', required: true },
            { key: 'name', label: 'Tên dự án', required: true },
            { key: 'status', label: 'Trạng thái', type: 'select', options: [
              { label: 'Planning', value: 'planning' },
              { label: 'Active', value: 'active' },
              { label: 'On hold', value: 'on_hold' },
              { label: 'Completed', value: 'completed' },
              { label: 'Cancelled', value: 'cancelled' },
            ] },
            { key: 'priority', label: 'Ưu tiên', type: 'select', options: priorityOptions },
            { key: 'plannedStartDate', label: 'Bắt đầu kế hoạch', type: 'date' },
            { key: 'plannedEndDate', label: 'Kết thúc kế hoạch', type: 'date' },
            { key: 'budget', label: 'Ngân sách', type: 'number' },
            { key: 'progressPercentage', label: 'Tiến độ %', type: 'number' },
            { key: 'description', label: 'Mô tả', type: 'textarea' },
          ],
          createDefaults: { code: '', name: '', status: 'planning', priority: 'medium', plannedStartDate: '', plannedEndDate: '', budget: 0, progressPercentage: 0, description: '' },
        },
        {
          key: 'tasks',
          label: 'Công việc',
          title: 'Công việc',
          subtitle: 'Task, phân cấp, phụ thuộc, bình luận, attachment và time log',
          endpoint: '/tasks/tasks',
          icon: <ClipboardList size={24} />,
          primaryActionLabel: 'Thêm công việc',
          fields: [
            { key: 'code', label: 'Mã task' },
            { key: 'name', label: 'Tên công việc' },
            { key: 'status', label: 'Trạng thái', type: 'status' },
            { key: 'priority', label: 'Ưu tiên', type: 'status' },
            { key: 'progressPercentage', label: 'Tiến độ', type: 'number' },
            { key: 'plannedEndDate', label: 'Hạn kế hoạch', type: 'date' },
          ],
          formFields: [
            { key: 'code', label: 'Mã task', required: true },
            { key: 'name', label: 'Tên công việc', required: true },
            { key: 'projectId', label: 'ID dự án' },
            { key: 'parentId', label: 'ID task cha' },
            { key: 'status', label: 'Trạng thái', type: 'select', options: statusOptions },
            { key: 'priority', label: 'Ưu tiên', type: 'select', options: priorityOptions },
            { key: 'plannedStartDate', label: 'Bắt đầu kế hoạch', type: 'date' },
            { key: 'plannedEndDate', label: 'Kết thúc kế hoạch', type: 'date' },
            { key: 'estimatedHours', label: 'Giờ dự kiến', type: 'number' },
            { key: 'actualHours', label: 'Giờ thực tế', type: 'number' },
            { key: 'progressPercentage', label: 'Tiến độ %', type: 'number' },
            { key: 'description', label: 'Mô tả', type: 'textarea' },
          ],
          createDefaults: { code: '', name: '', projectId: '', parentId: '', status: 'backlog', priority: 'medium', plannedStartDate: '', plannedEndDate: '', estimatedHours: 0, actualHours: 0, progressPercentage: 0, description: '' },
          quickFilters: [{ label: 'Backlog', value: 'backlog' }, { label: 'Todo', value: 'todo' }, { label: 'In progress', value: 'in_progress' }, { label: 'Done', value: 'done' }],
        },
        {
          key: 'kanban',
          label: 'Kanban',
          title: 'Kanban',
          subtitle: 'Cùng dữ liệu task, lọc nhanh theo trạng thái để vận hành bảng Kanban',
          endpoint: '/tasks/tasks',
          icon: <Columns3 size={24} />,
          primaryActionLabel: 'Thêm thẻ Kanban',
          fields: [{ key: 'name', label: 'Thẻ' }, { key: 'status', label: 'Cột', type: 'status' }, { key: 'priority', label: 'Ưu tiên', type: 'status' }, { key: 'sortOrder', label: 'Thứ tự', type: 'number' }],
          formFields: [
            { key: 'code', label: 'Mã task', required: true },
            { key: 'name', label: 'Tên thẻ', required: true },
            { key: 'status', label: 'Cột', type: 'select', options: statusOptions },
            { key: 'priority', label: 'Ưu tiên', type: 'select', options: priorityOptions },
            { key: 'sortOrder', label: 'Thứ tự', type: 'number' },
          ],
          createDefaults: { code: '', name: '', status: 'todo', priority: 'medium', sortOrder: 0 },
          quickFilters: [{ label: 'Todo', value: 'todo' }, { label: 'In progress', value: 'in_progress' }, { label: 'Review', value: 'review' }, { label: 'Done', value: 'done' }],
        },
        {
          key: 'gantt',
          label: 'Gantt',
          title: 'Gantt',
          subtitle: 'Mốc thời gian kế hoạch/thực tế và phụ thuộc công việc',
          endpoint: '/tasks/tasks',
          icon: <GanttChartSquare size={24} />,
          primaryActionLabel: 'Thêm mốc',
          fields: [{ key: 'name', label: 'Công việc' }, { key: 'plannedStartDate', label: 'BĐ kế hoạch', type: 'date' }, { key: 'plannedEndDate', label: 'KT kế hoạch', type: 'date' }, { key: 'actualEndDate', label: 'KT thực tế', type: 'date' }, { key: 'progressPercentage', label: 'Tiến độ', type: 'number' }],
          formFields: [
            { key: 'code', label: 'Mã task', required: true },
            { key: 'name', label: 'Tên công việc', required: true },
            { key: 'plannedStartDate', label: 'Bắt đầu kế hoạch', type: 'date' },
            { key: 'plannedEndDate', label: 'Kết thúc kế hoạch', type: 'date' },
            { key: 'actualStartDate', label: 'Bắt đầu thực tế', type: 'date' },
            { key: 'actualEndDate', label: 'Kết thúc thực tế', type: 'date' },
            { key: 'progressPercentage', label: 'Tiến độ %', type: 'number' },
          ],
          createDefaults: { code: '', name: '', plannedStartDate: '', plannedEndDate: '', actualStartDate: '', actualEndDate: '', progressPercentage: 0 },
        },
      ]}
    />
  );
}
