import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { VendorDebtSummary, VendorDebtRecord } from '../src/modules/accounting/accounting.models.js';
dotenv.config({ path: '../.env' });
const DB_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/ladystars';
async function run() {
    await mongoose.connect(DB_URI);
    console.log('Connected to MongoDB');
    await VendorDebtSummary.deleteMany({});
    await VendorDebtRecord.deleteMany({});
    // 1. Read the provided CSV row (we know there's one)
    const code = 'NCC.1284';
    const name = 'ladystars';
    const summary = new VendorDebtSummary({
        code,
        vendorName: name,
        phone: '',
        initialReceivable: 0,
        initialPayable: 0,
        incurredReceivable: 0,
        incurredPayable: 0,
        finalReceivable: 0,
        finalPayable: 0,
    });
    await summary.save();
    console.log(`Saved original CSV vendor: ${code}`);
    // Generate mock vendors removed per user request.
    console.log('Finished importing CSV row. No mock vendors created.');
    process.exit(0);
}
run().catch(console.error);
