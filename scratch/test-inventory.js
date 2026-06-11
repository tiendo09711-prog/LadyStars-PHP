const mongoose = require('mongoose');
const { Product, ProductBranchStock } = require('../server/dist/modules/product/product.models.js');

mongoose.connect('mongodb://tiendodev:290105@ac-vmjik1y-shard-00-00.oi4lav0.mongodb.net:27017,ac-vmjik1y-shard-00-01.oi4lav0.mongodb.net:27017,ac-vmjik1y-shard-00-02.oi4lav0.mongodb.net:27017/ladystars?tls=true&authSource=admin&replicaSet=atlas-1204cs-shard-0&retryWrites=true&w=majority&appName=tiendev', { useNewUrlParser: true, useUnifiedTopology: true })
  .then(async () => {
    try {
      const totalProducts = await Product.aggregate([{ $group: { _id: null, qty: { $sum: '$qty' } } }]);
      console.log('Total Qty in Product collection:', totalProducts);
      
      const totalBranchStocks = await ProductBranchStock.aggregate([{ $match: { qty: { $gt: 0 } } }, { $group: { _id: null, sumQty: { $sum: '$qty' }, countDocs: { $sum: 1 }, sumCost: { $sum: { $multiply: ['$qty', 1] } } } }]);
      console.log('Total Qty > 0 in ProductBranchStock:', totalBranchStocks);
      
      // Also calculate values based on Product collection directly
      const totalProductValues = await Product.aggregate([
        {
          $group: {
            _id: null,
            totalQty: { $sum: '$qty' },
            totalCostValue: { $sum: { $multiply: ['$qty', { $ifNull: ['$cost', 0] }] } },
            totalSaleValue: { $sum: { $multiply: ['$qty', { $ifNull: ['$price', 0] }] } },
            sumAllCost: { $sum: { $ifNull: ['$cost', 0] } },
            sumAllPrice: { $sum: { $ifNull: ['$price', 0] } },
          }
        }
      ]);
      console.log('Total values based on Product collection:', JSON.stringify(totalProductValues, null, 2));

      // Calculate values based on ProductBranchStock
      const totalBranchValues = await ProductBranchStock.aggregate([
        {
          $lookup: {
            from: 'products',
            localField: 'productId',
            foreignField: '_id',
            as: 'productInfo',
          },
        },
        { $unwind: { path: '$productInfo', preserveNullAndEmptyArrays: true } },
        {
          $group: {
            _id: null,
            totalQty: { $sum: '$qty' },
            totalCostValue: { $sum: { $multiply: ['$qty', { $ifNull: ['$productInfo.cost', 0] }] } },
            totalSaleValue: { $sum: { $multiply: ['$qty', { $ifNull: ['$productInfo.price', 0] }] } },
          }
        }
      ]);
      console.log('Total values based on ProductBranchStock:', JSON.stringify(totalBranchValues, null, 2));

    } catch (e) {
      console.error(e);
    } finally {
      process.exit(0);
    }
  });
