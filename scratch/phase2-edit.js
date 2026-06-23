const fs = require('fs');
const pagePath = 'client/src/modules/warehouse/WarehouseBranchesPage.tsx';
let lines = fs.readFileSync(pagePath, 'utf8').split(/\r?\n/);
const next = [];
for (let index = 0; index < lines.length; index += 1) {
  const line = lines[index];
  if (line.includes("setDefaultBranch,")) continue;
  if (line.includes("Star,")) continue;
  if (line.includes("action === 'set-default'")) continue;
  if (line.includes("confirmAction === 'set-default'")) {
    index += 3;
    continue;
  }
  if (line.includes('status-badge default')) continue;
  if (line.includes("setConfirmAction('set-default')")) continue;
  if (line.includes('selectedBranch?.isDefault') && line.includes('<span>')) continue;
  if (line.includes('usersDefaultWarehouseId:')) {
    next.push("  usersDefaultWarehouseId: 'Nhân viên có defaultWarehouseId',");
    continue;
  }
  if (line.includes('chỉ được xóa') && line.includes('branchName')) {
    next.push("  return `${branchName} chỉ được xóa khi không còn dữ liệu liên kết.`;");
    continue;
  }
  next.push(line);
}
let content = next.join('\n');
content = content.replace("type ConfirmAction = 'create' | 'save' | 'set-default' | 'activate' | 'deactivate' | 'delete';", "type ConfirmAction = 'create' | 'save' | 'activate' | 'deactivate' | 'delete';");
fs.writeFileSync(pagePath, content, 'utf8');

const apiPath = 'client/src/core/api/branch.api.ts';
lines = fs.readFileSync(apiPath, 'utf8').split(/\r?\n/);
const apiNext = [];
for (let index = 0; index < lines.length; index += 1) {
  const line = lines[index];
  if (line.includes('export async function setDefaultBranch(')) {
    index += 3;
    continue;
  }
  apiNext.push(line);
}
fs.writeFileSync(apiPath, apiNext.join('\n'), 'utf8');
