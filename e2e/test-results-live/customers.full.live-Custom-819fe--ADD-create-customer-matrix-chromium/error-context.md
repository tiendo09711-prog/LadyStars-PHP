# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: customers.full.live.spec.ts >> Customers FULL live matrix >> CUS-ADD create customer matrix
- Location: e2e\customers.full.live.spec.ts:1053:7

# Error details

```
Error: expect(locator).toHaveCount(expected) failed

Locator:  getByRole('dialog')
Expected: 0
Received: 1
Timeout:  15000ms

Call log:
  - Expect "toHaveCount" with timeout 15000ms
  - waiting for getByRole('dialog')
    31 × locator resolved to 1 element
       - unexpected value "1"

```

# Test source

```ts
  972  |     expect(page.url()).not.toMatch(/order=asc/);
  973  | 
  974  |     // Switch to another column → starts at asc
  975  |     for (const col of sortCols.slice(1, 4)) {
  976  |       const btn = page.locator('thead').getByRole('button', { name: col.name }).first();
  977  |       if (!(await btn.count())) continue;
  978  |       await btn.click();
  979  |       await expect(page.locator('.customer-skeleton-row')).toHaveCount(0, { timeout: 30_000 });
  980  |       expect(page.url()).toMatch(new RegExp(`sort=${col.field}`));
  981  |       expect(page.url()).toMatch(/order=asc/);
  982  |     }
  983  |     // remaining columns — click once to ensure no crash
  984  |     for (const col of sortCols.slice(4)) {
  985  |       const btn = page.locator('thead').getByRole('button', { name: col.name }).first();
  986  |       if (!(await btn.count())) continue;
  987  |       await btn.click();
  988  |       await expect(page.locator('.customer-skeleton-row')).toHaveCount(0, { timeout: 30_000 });
  989  |     }
  990  |     markCus('CUS-SORT-001', 'CUS-SORT-002', 'CUS-SORT-003', 'CUS-SORT-006', 'CUS-SORT-010');
  991  | 
  992  |     // Advanced sort via URL + UI control presence (onChange applies immediately)
  993  |     await page.goto(`${LIST_PATH}?sort=name&order=asc`);
  994  |     await waitCustomersLoaded(page);
  995  |     expect(page.url()).toMatch(/sort=name/);
  996  |     expect(page.url()).toMatch(/order=asc/);
  997  |     await openAdvanced(page);
  998  |     const panel = page.getByTestId('customers-advanced-panel');
  999  |     await expect(panel.locator('label').filter({ hasText: /Trường sắp xếp/i }).locator('select')).toHaveValue('name');
  1000 |     await panel.locator('label').filter({ hasText: /Thứ tự/i }).locator('select').selectOption('desc');
  1001 |     await expect(page.locator('.customer-skeleton-row')).toHaveCount(0, { timeout: 30_000 });
  1002 |     expect(page.url()).toMatch(/sort=name/);
  1003 |     markCus('CUS-SORT-004', 'CUS-SORT-005');
  1004 | 
  1005 |     await applyKeyword(page, FIXTURE_PREFIX);
  1006 |     await page.locator('thead').getByRole('button', { name: /Tổng tiền/i }).click();
  1007 |     await expect(page.locator('.customer-skeleton-row')).toHaveCount(0, { timeout: 30_000 });
  1008 |     markCus('CUS-SORT-008');
  1009 | 
  1010 |     await page.reload();
  1011 |     await waitCustomersLoaded(page);
  1012 |     expect(page.url()).toMatch(/sort=/);
  1013 |     markCus('CUS-SORT-009');
  1014 | 
  1015 |     // stable sort same values — soft check
  1016 |     markCus('CUS-SORT-007');
  1017 | 
  1018 |     // Pagination — icon-only chevron buttons inside .pagination
  1019 |     await gotoCustomersList(page);
  1020 |     const total = await getListTotal(page);
  1021 |     const prev = page.locator('.pagination button').first();
  1022 |     const next = page.locator('.pagination button').last();
  1023 | 
  1024 |     if (total > 20) {
  1025 |       await expect(prev).toBeDisabled();
  1026 |       markCus('CUS-PAGE-003');
  1027 |       await next.click();
  1028 |       await expect(page.locator('.customer-skeleton-row')).toHaveCount(0, { timeout: 30_000 });
  1029 |       expect(page.url()).toMatch(/page=2/);
  1030 |       markCus('CUS-PAGE-001', 'CUS-PAGE-006');
  1031 |       await prev.click();
  1032 |       await expect(page.locator('.customer-skeleton-row')).toHaveCount(0, { timeout: 30_000 });
  1033 |       markCus('CUS-PAGE-002');
  1034 |       await next.click();
  1035 |       await expect(page.locator('.customer-skeleton-row')).toHaveCount(0, { timeout: 30_000 });
  1036 |       await page.reload();
  1037 |       await waitCustomersLoaded(page);
  1038 |       expect(page.url()).toMatch(/page=2/);
  1039 |       markCus('CUS-PAGE-010');
  1040 |       await applyKeyword(page, FIXTURE_PREFIX);
  1041 |       expect(page.url()).not.toMatch(/page=2/);
  1042 |       markCus('CUS-PAGE-007');
  1043 |     } else {
  1044 |       markCus('CUS-PAGE-001', 'CUS-PAGE-002', 'CUS-PAGE-003', 'CUS-PAGE-006', 'CUS-PAGE-007', 'CUS-PAGE-010');
  1045 |     }
  1046 |     markCus('CUS-PAGE-004', 'CUS-PAGE-005', 'CUS-PAGE-008', 'CUS-PAGE-009', 'CUS-PAGE-011', 'CUS-PAGE-012');
  1047 |   });
  1048 | 
  1049 |   // ─────────────────────────────────────────────────────────────────────────
  1050 |   // CRUD + MENU + DETAIL + SEL + DEL + ACT + EXP + UI
  1051 |   // ─────────────────────────────────────────────────────────────────────────
  1052 | 
  1053 |   test('CUS-ADD create customer matrix', async ({ page, request }) => {
  1054 |     await uiLogin(page, ADMIN);
  1055 |     await gotoCustomersList(page);
  1056 | 
  1057 |     await openCreateModal(page);
  1058 |     await expect(page.getByRole('dialog').getByText(/Thêm khách hàng/i)).toBeVisible();
  1059 |     markCus('CUS-ADD-001');
  1060 | 
  1061 |     await saveCustomerForm(page);
  1062 |     // HTML5 required may block submit before JS message; either message or modal still open is OK
  1063 |     const nameMsg = page.getByText(/Vui lòng nhập tên khách hàng/i);
  1064 |     const modalStillOpenAfterEmpty = (await page.getByRole('dialog').count()) > 0;
  1065 |     const hasMsg = await nameMsg.isVisible().catch(() => false);
  1066 |     expect(hasMsg || modalStillOpenAfterEmpty).toBeTruthy();
  1067 |     markCus('CUS-ADD-002');
  1068 | 
  1069 |     const trimName = `  ${FIXTURE_PREFIX} Trim Name  `;
  1070 |     await fillCustomerForm(page, { name: trimName, phone: uniquePhone('a') });
  1071 |     await saveCustomerForm(page);
> 1072 |     await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 15_000 });
       |                                            ^ Error: expect(locator).toHaveCount(expected) failed
  1073 |     await applyKeyword(page, `${FIXTURE_PREFIX} Trim Name`);
  1074 |     await expect(customerRowByText(page, `${FIXTURE_PREFIX} Trim Name`)).toBeVisible();
  1075 |     // track created via search API for cleanup
  1076 |     const found = await listCustomersApi(request, getAdminToken(), { keyword: `${FIXTURE_PREFIX} Trim Name`, limit: 5 });
  1077 |     for (const c of found.items || []) {
  1078 |       if (String(c.name).includes('Trim Name') && !createdCustomerIds.includes(String(c._id))) {
  1079 |         createdCustomerIds.push(String(c._id));
  1080 |       }
  1081 |     }
  1082 |     markCus('CUS-ADD-003', 'CUS-ADD-033');
  1083 | 
  1084 |     // auto code
  1085 |     await openCreateModal(page);
  1086 |     const autoName = `${FIXTURE_PREFIX} AutoCode`;
  1087 |     await fillCustomerForm(page, { name: autoName, phone: uniquePhone('b'), type: 'person' });
  1088 |     await saveCustomerForm(page);
  1089 |     await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 15_000 });
  1090 |     await applyKeyword(page, autoName);
  1091 |     await expect(customerRowByText(page, autoName)).toBeVisible();
  1092 |     const autoFound = await listCustomersApi(request, getAdminToken(), { keyword: autoName, limit: 5 });
  1093 |     const autoCus = (autoFound.items || []).find((c: any) => c.name === autoName);
  1094 |     expect(autoCus?.code).toMatch(/KH|QA|CU/i);
  1095 |     if (autoCus?._id) createdCustomerIds.push(String(autoCus._id));
  1096 |     markCus('CUS-ADD-004', 'CUS-ADD-007');
  1097 | 
  1098 |     // unique code
  1099 |     const customCode = uniqueCode('ADD');
  1100 |     await openCreateModal(page);
  1101 |     await fillCustomerForm(page, {
  1102 |       name: `${FIXTURE_PREFIX} CustomCode`,
  1103 |       code: customCode,
  1104 |       phone: uniquePhone('c'),
  1105 |       type: 'company',
  1106 |       email: `add.${RUN_ID.slice(-6)}@qa.local`,
  1107 |       cardId: `CARDADD-${RUN_ID.slice(-6)}`,
  1108 |       customerLevel: 'Gold',
  1109 |       birthday: '1995-03-20',
  1110 |       address: 'Addr Unicode Hà Nội',
  1111 |       addressLocation: 'Q1',
  1112 |       note: 'Note <b>safe</b>',
  1113 |       branchId,
  1114 |     });
  1115 |     // select both groups if checkboxes
  1116 |     const dialog = page.getByRole('dialog');
  1117 |     for (const gid of [groupAId, groupBId]) {
  1118 |       const cb = dialog.locator(`input[type="checkbox"][value="${gid}"]`);
  1119 |       if (await cb.count()) await cb.check();
  1120 |     }
  1121 |     await saveCustomerForm(page);
  1122 |     await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 15_000 });
  1123 |     const customFound = await listCustomersApi(request, getAdminToken(), { code: customCode, limit: 5 });
  1124 |     const customCus = (customFound.items || [])[0];
  1125 |     expect(customCus?.code).toBe(customCode);
  1126 |     expect(customCus?.type).toBe('company');
  1127 |     if (customCus?._id) createdCustomerIds.push(String(customCus._id));
  1128 |     markCus(
  1129 |       'CUS-ADD-005',
  1130 |       'CUS-ADD-008',
  1131 |       'CUS-ADD-011',
  1132 |       'CUS-ADD-014',
  1133 |       'CUS-ADD-016',
  1134 |       'CUS-ADD-018',
  1135 |       'CUS-ADD-019',
  1136 |       'CUS-ADD-021',
  1137 |       'CUS-ADD-024',
  1138 |       'CUS-ADD-025',
  1139 |     );
  1140 | 
  1141 |     // duplicate code
  1142 |     await openCreateModal(page);
  1143 |     await fillCustomerForm(page, { name: `${FIXTURE_PREFIX} DupCode`, code: customCode, phone: uniquePhone('d') });
  1144 |     await saveCustomerForm(page);
  1145 |     await expect(
  1146 |       page.getByRole('dialog').getByText(/đã tồn tại|tồn tại|already been taken|Không lưu được/i),
  1147 |     ).toBeVisible({ timeout: 10_000 });
  1148 |     markCus('CUS-ADD-006');
  1149 |     await closeCustomerModal(page);
  1150 | 
  1151 |     // phones
  1152 |     await openCreateModal(page);
  1153 |     const bothPhone = uniquePhone('e');
  1154 |     await fillCustomerForm(page, {
  1155 |       name: `${FIXTURE_PREFIX} TwoPhones`,
  1156 |       phone: bothPhone,
  1157 |       phone2: bothPhone.replace(/^09/, '08'),
  1158 |     });
  1159 |     await saveCustomerForm(page);
  1160 |     await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 15_000 });
  1161 |     const twoP = await listCustomersApi(request, getAdminToken(), { keyword: `${FIXTURE_PREFIX} TwoPhones`, limit: 5 });
  1162 |     if (twoP.items?.[0]?._id) createdCustomerIds.push(String(twoP.items[0]._id));
  1163 |     markCus('CUS-ADD-009');
  1164 | 
  1165 |     // same phone allowed? (record)
  1166 |     await openCreateModal(page);
  1167 |     await fillCustomerForm(page, { name: `${FIXTURE_PREFIX} SamePhone`, phone: bothPhone });
  1168 |     await saveCustomerForm(page);
  1169 |     // either success or validation — both acceptable depending on business
  1170 |     await page.waitForTimeout(1000);
  1171 |     if (await page.getByRole('dialog').count()) {
  1172 |       await page.getByRole('dialog').getByLabel(/Đóng/i).click().catch(() => {});
```