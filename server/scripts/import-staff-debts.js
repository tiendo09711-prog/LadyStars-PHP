import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { StaffDebtSummary } from '../src/modules/accounting/accounting.models.js';
dotenv.config({ path: '../.env' });
const DB_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/ladystars';
async function run() {
    await mongoose.connect(DB_URI);
    console.log('Connected to MongoDB');
    await StaffDebtSummary.deleteMany({});
    const staffs = [
        'Nguyễn Văn A', 'Trần Thị B', 'Lê Văn C', 'Phạm Thị D', 'Hoàng Văn E',
        'Đỗ Thị F', 'Ngô Văn G', 'Vũ Thị H', 'Đặng Văn I', 'Bùi Thị K'
    ];
    let count = 0;
    for (const staff of staffs) {
        // Generate some random amounts
        const collectedRetail = Math.floor(Math.random() * 50) * 100000;
        const collectedOrders = Math.floor(Math.random() * 100) * 100000;
        const remainingDebt = Math.floor(Math.random() * 20) * 100000;
        const record = new StaffDebtSummary({
            staffName: staff,
            collectedRetail,
            collectedOrders,
            remainingDebt
        });
        await record.save();
        count++;
    }
    console.log(`Done! Created ${count} mock staff debt records.`);
    process.exit(0);
}
run().catch(console.error);
