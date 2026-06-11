import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../../.env') });
import { BankTransaction } from '../src/modules/accounting/accounting.models.js';
const parseDate = (dateStr) => {
    if (!dateStr)
        return new Date();
    const [day, month, year] = dateStr.split(' ')[0].split('/');
    return new Date(`${year}-${month}-${day}T00:00:00.000Z`);
};
async function main() {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');
    const csvPath = path.join(__dirname, '../../Bảng dữ liệu/Nhanh.vn_Transaction_Bank_2026-06-05_141139.csv');
    const csvData = fs.readFileSync(csvPath, 'utf8');
    const lines = csvData.split('\n').map(line => line.trim()).filter(line => line);
    const transactions = [];
    for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(';');
        // ID;Ngày;Loại;Mã tài khoản;Tên tài khoản;Mã tài khoản đối ứng;Tên tài khoản đối ứng;Mã đối tượng;Tên đối tượng;Loại chứng từ;ID chứng từ;Thu;Chi;Diễn giải;Người tạo;Ngày tạo
        transactions.push({
            transactionId: values[0],
            date: parseDate(values[1]),
            type: values[2],
            accountCode: values[3],
            accountName: values[4],
            contraAccountCode: values[5],
            contraAccountName: values[6],
            targetCode: values[7],
            targetName: values[8],
            voucherType: values[9],
            voucherId: values[10],
            revenue: Number(values[11] || 0),
            expense: Number(values[12] || 0),
            description: values[13],
            creatorName: values[14]
        });
    }
    for (const t of transactions) {
        await BankTransaction.findOneAndUpdate({ transactionId: t.transactionId }, t, { upsert: true });
    }
    console.log(`Imported ${transactions.length} transactions`);
    process.exit(0);
}
main().catch(err => {
    console.error(err);
    process.exit(1);
});
