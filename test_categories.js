const mongoose = require('mongoose');

const mongoUri = "mongodb://tiendodev:290105@ac-vmjik1y-shard-00-00.oi4lav0.mongodb.net:27017,ac-vmjik1y-shard-00-01.oi4lav0.mongodb.net:27017,ac-vmjik1y-shard-00-02.oi4lav0.mongodb.net:27017/ladystars?tls=true&authSource=admin&replicaSet=atlas-1204cs-shard-0&retryWrites=true&w=majority&appName=tiendev";

async function verify() {
    try {
        await mongoose.connect(mongoUri);
        console.log("Connected to MongoDB");

        const CategorySchema = new mongoose.Schema({
            name: String,
            code: String,
            isActive: Boolean,
            isVisible: Boolean,
            productCount: Number,
            url: String
        }, { collection: 'categories' });

        const Category = mongoose.model('Category', CategorySchema);

        const sample = await Category.find({}).limit(5);
        console.log("Sample updated categories from DB:\n", JSON.stringify(sample, null, 2));

        const count = await Category.countDocuments({});
        console.log(`Total categories in DB: ${count}`);

        const activeCount = await Category.countDocuments({ isActive: true });
        console.log(`Active categories: ${activeCount}`);

        const totalProductsInCategories = await Category.aggregate([
            { $group: { _id: null, total: { $sum: "$productCount" } } }
        ]);
        console.log(`Sum of productCount in all categories:`, totalProductsInCategories[0]?.total || 0);

        await mongoose.disconnect();
    } catch (err) {
        console.error(err);
    }
}

verify();
