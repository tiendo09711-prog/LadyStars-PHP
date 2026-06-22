const { MongoClient } = require('mongodb');

const MONGO_URI = 'mongodb://tiendodev:290105@ac-vmjik1y-shard-00-00.oi4lav0.mongodb.net:27017,ac-vmjik1y-shard-00-01.oi4lav0.mongodb.net:27017,ac-vmjik1y-shard-00-02.oi4lav0.mongodb.net:27017/ladystars?tls=true&authSource=admin&replicaSet=atlas-1204cs-shard-0';

async function main() {
  const client = new MongoClient(MONGO_URI, { serverSelectionTimeoutMS: 20000 });
  await client.connect();
  const db = client.db('ladystars');
  
  // Get all branches
  const branches = await db.collection('branches').find({}).sort({ createdAt: 1 }).toArray();
  
  console.log('=== TONG QUAN BRANCHES ===');
  console.log('Tong so branches:', branches.length);
  console.log('Active:', branches.filter(b => b.isActive !== false).length);
  console.log('Inactive:', branches.filter(b => b.isActive === false).length);
  console.log('Default:', branches.filter(b => b.isDefault === true).length);
  
  const now = new Date();
  const hrs48 = new Date(now.getTime() - 48 * 60 * 60 * 1000);
  const created48h = branches.filter(b => b.createdAt && new Date(b.createdAt) >= hrs48);
  console.log('Tao trong 48h gan nhat:', created48h.length);
  
  console.log('\n=== CANONICAL BRANCHES ===');
  const hanoi = branches.find(b => b.name === 'Kho Hà Nội');
  const hcm = branches.find(b => b.name === 'Kho HCM');
  
  if (hanoi) {
    console.log('KHO HA NOI:');
    console.log('  _id:', hanoi._id.toString());
    console.log('  code:', hanoi.code);
    console.log('  isActive:', hanoi.isActive);
    console.log('  isDefault:', hanoi.isDefault);
    console.log('  createdAt:', hanoi.createdAt ? new Date(hanoi.createdAt).toISOString() : 'N/A');
    console.log('  address:', hanoi.address || 'KHONG');
    console.log('  phone:', hanoi.phone || 'KHONG');
    console.log('  invoiceProfile.displayName:', hanoi.invoiceProfile?.displayName || '(empty)');
    console.log('  invoiceProfile.footerText:', hanoi.invoiceProfile?.footerText || '(empty)');
  } else {
    console.log('KHO HA NOI: KHONG TIM THAY');
  }
  
  if (hcm) {
    console.log('KHO HCM:');
    console.log('  _id:', hcm._id.toString());
    console.log('  code:', hcm.code);
    console.log('  isActive:', hcm.isActive);
    console.log('  isDefault:', hcm.isDefault);
    console.log('  createdAt:', hcm.createdAt ? new Date(hcm.createdAt).toISOString() : 'N/A');
    console.log('  address:', hcm.address || 'KHONG');
    console.log('  phone:', hcm.phone || 'KHONG');
    console.log('  invoiceProfile.displayName:', hcm.invoiceProfile?.displayName || '(empty)');
    console.log('  invoiceProfile.footerText:', hcm.invoiceProfile?.footerText || '(empty)');
  } else {
    console.log('KHO HCM: KHONG TIM THAY');
  }
  
  console.log('\n=== E2E TEST FIXTURES (48h) ===');
  const e2eBranches = branches.filter(b => b.name && b.name.startsWith('E2E_'));
  console.log('So luong E2E branches:', e2eBranches.length);
  e2eBranches.forEach(b => {
    console.log(`  - ${b.name} (${b.code}) - ${new Date(b.createdAt).toISOString()}`);
  });
  
  console.log('\n=== KIEM TRA LIEN KET DU LIEU ===');
  const canonicalIds = [hanoi, hcm].filter(Boolean).map(b => b._id);
  
  // Check productBranchStocks
  const stockCount = await db.collection('productbranchstocks').countDocuments({ branchId: { $in: canonicalIds } });
  console.log('ProductBranchStocks linked to canonical branches:', stockCount);
  
  // Check salePayments
  const saleCount = await db.collection('salepayments').countDocuments({ branchId: { $in: canonicalIds } });
  console.log('SalePayments linked to canonical branches:', saleCount);
  
  // Check each E2E branch for data links
  console.log('\n=== DU LIEU LIEN KET E2E BRANCHES ===');
  for (const branch of e2eBranches.slice(0, 5)) {
    const branchId = branch._id;
    const stocks = await db.collection('productbranchstocks').countDocuments({ branchId });
    const sales = await db.collection('salepayments').countDocuments({ branchId });
    if (stocks > 0 || sales > 0) {
      console.log(`  ${branch.name}: stocks=${stocks}, sales=${sales}`);
    }
  }
  
  await client.close();
}

async function checkAuditLogs() {
  const client = new MongoClient(MONGO_URI, { serverSelectionTimeoutMS: 20000 });
  await client.connect();
  const db = client.db('ladystars');
  
  const now = new Date();
  const hrs48 = new Date(now.getTime() - 48 * 60 * 60 * 1000);
  
  console.log('\n=== AUDIT LOGS (48h, module=branch) ===');
  const audits = await db.collection('auditlogs').find({ 
    module: 'branch', 
    createdAt: { $gte: hrs48 } 
  }).sort({ createdAt: -1 }).limit(50).toArray();
  
  console.log('Tong so audit logs:', audits.length);
  audits.forEach(a => {
    const dateStr = new Date(a.createdAt).toISOString();
    console.log(`- ${a.action} | ${dateStr} | user: ${a.userName || a.userEmail || 'unknown'}`);
    if (a.metadata && typeof a.metadata === 'object') {
      const summary = JSON.stringify(a.metadata).slice(0, 150);
      console.log(`  metadata: ${summary}...`);
    }
  });
  
  await client.close();
}

checkAuditLogs().catch(e => console.error('Audit ERR:', e.message));

main().catch(e => {
  console.error('ERR:', e.message);
  process.exit(1);
});