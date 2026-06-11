import { MongoClient } from 'mongodb';
import * as dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });
const uri = process.env.MONGO_URI;
async function run() {
    const client = new MongoClient(uri);
    try {
        await client.connect();
        const db = client.db('ladystars');
        const collections = await db.listCollections().toArray();
        console.log('--- MONGODB COLLECTIONS ---');
        for (const coll of collections) {
            const count = await db.collection(coll.name).countDocuments();
            console.log(`- ${coll.name}: ${count} documents`);
        }
    }
    catch (err) {
        console.error(err);
    }
    finally {
        await client.close();
    }
}
run();
