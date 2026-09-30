const mongoose = require('mongoose');

async function connectDatabase() {
  const uri = process.env.MONGODB_URI ;
  if (!process.env.MONGODB_URI) {
    console.warn('MONGODB_URI not set; using local fallback mongodb://127.0.0.1:27017/evidencelocker');
  }

  mongoose.set('strictQuery', true);
  await mongoose.connect(uri,{dbName: 'evidencelocker'});
  console.log('Connected to MongoDB');
}

module.exports = connectDatabase;
