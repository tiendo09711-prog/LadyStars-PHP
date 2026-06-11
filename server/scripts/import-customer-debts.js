import mongoose from 'mongoose';
import fs from 'fs';
import dotenv from 'dotenv';
import { CustomerDebtSummary, CustomerDebtRecord } from '../src/modules/accounting/accounting.models.js';
dotenv.config({ path: '../.env' });
const DB_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/ladystars';
function parseNumber(str) {
    if (!str)
        return 0;
    return Number(str.replace(/\./g, '').replace(/,/g, ''));
}
async function run() {
    await mongoose.connect(DB_URI);
    console.log('Connected to MongoDB');
    // Clear existing to avoid duplicates in testing
    await CustomerDebtSummary.deleteMany({});
    await CustomerDebtRecord.deleteMany({});
    const csvPath = 'C:/Users/tiend/Desktop/LadyStars/Bảng dữ liệu/Cơ sở dữ liệu.csv';
    const csvData = fs.readFileSync(csvPath, 'utf8');
    const lines = csvData.split('\n');
    const headers = lines[0].split(';');
    let summaryCount = 0;
    let recordCount = 0;
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line)
            continue;
        const parts = line.split(';');
        if (parts.length < 10)
            continue;
        const summary = new CustomerDebtSummary({
            code: parts[0],
            customerName: parts[1],
            phone: parts[2],
            address: parts[3],
            initialReceivable: parseNumber(parts[4]),
            initialPayable: parseNumber(parts[5]),
            incurredReceivable: parseNumber(parts[6]),
            incurredPayable: parseNumber(parts[7]),
            finalReceivable: parseNumber(parts[8]),
            finalPayable: parseNumber(parts[9]),
        });
        await summary.save();
        summaryCount++;
        if (summary.finalReceivable > 0) {
            // Mock Due Date distribution
            // 0-2: Overdue (past date)
            // 3-4: Today
            // 5-7: Next 7 days
            // 8-9: Over 7 days
            const rand = Math.floor(Math.random() * 10);
            const dueDate = new Date();
            if (rand <= 2) {
                dueDate.setDate(dueDate.getDate() - Math.floor(Math.random() * 30) - 1);
            }
            else if (rand <= 4) {
                // Today
            }
            else if (rand <= 7) {
                dueDate.setDate(dueDate.getDate() + Math.floor(Math.random() * 7) + 1);
            }
            else {
                dueDate.setDate(dueDate.getDate() + Math.floor(Math.random() * 30) + 8);
            }
            const invoiceId = `HD${Math.floor(100000 + Math.random() * 900000)}`;
            const record = new CustomerDebtRecord({
                invoiceCode: invoiceId,
                creator: 'Admin',
                dueDate: dueDate,
                customerCode: summary.code,
                customerName: summary.customerName,
                amount: summary.finalReceivable,
                discount: 0,
                totalPayment: summary.finalReceivable,
                paid: 0,
                remainingDebt: summary.finalReceivable,
                salesperson: 'Admin',
            });
            await record.save();
            recordCount++;
        }
    }
    console.log(`Done! Created ${summaryCount} summaries and ${recordCount} mock debt records.`);
    process.exit(0);
}
run().catch(console.error);
