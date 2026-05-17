import mongoose from 'mongoose';

const uri = "mongodb://tiendodev:290105@ac-vmjik1y-shard-00-00.oi4lav0.mongodb.net:27017,ac-vmjik1y-shard-00-01.oi4lav0.mongodb.net:27017,ac-vmjik1y-shard-00-02.oi4lav0.mongodb.net:27017/ladystars?tls=true&authSource=admin&replicaSet=atlas-1204cs-shard-0&retryWrites=true&w=majority&appName=tiendev";

async function run() {
  await mongoose.connect(uri);
  const db = mongoose.connection.db;

  const result = await db.collection('products').aggregate([
    {
      $group: {
        _id: null,
        totalQty: { $sum: "$qty" },
        totalWarehouseQty: { $sum: "$warehouseQty" },
        totalAvailableStock: { $sum: "$availableStock" }
      }
    }
  ]).toArray();

  console.log("Totals:", result);
  await mongoose.disconnect();
}

run().catch(console.error);
